import secrets
import urllib.parse
import logging
from datetime import datetime, timezone

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel, EmailStr
from starlette.responses import RedirectResponse

from config import (
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
    DISCORD_API_URL, DISCORD_SCOPES,
    JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    pwd_context,
)
from database import db
from models.user import (
    User, UserRegister, UserLogin, UserResponse, TokenResponse,
    RegistrationResponse, VerifyEmailRequest, ResendVerificationRequest,
    SetPasswordRequest,
)
from services.auth_service import (
    hash_password, verify_password, normalize_email,
    create_access_token, set_auth_cookie, clear_auth_cookie,
    user_to_response,
    validate_email_verification_token, send_verification_email,
    require_discord_config, create_discord_state, validate_discord_state,
    get_frontend_base_url,
)
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/auth/status")
async def get_auth_status():
    return {
        "discord_enabled": bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI),
        "email_enabled": True,
        "email_verification_required": False,
    }


@router.post("/auth/register", response_model=RegistrationResponse)
async def register(user_data: UserRegister, response: Response):
    normalized_email = normalize_email(user_data.email)
    existing_user = await db.users.find_one({"email": normalized_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_dict = user_data.model_dump()
    user_dict["email"] = normalized_email
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_dict["email_verified"] = True
    user_dict["email_verified_at"] = datetime.now(timezone.utc).isoformat()
    user_dict["pipeline_stage"] = "applicant"
    user_obj = User(**user_dict)

    doc = user_obj.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)

    clear_auth_cookie(response)
    return RegistrationResponse(
        message="Registration successful. You can now log in.",
        requires_verification=False,
        email=user_obj.email,
    )


@router.post("/auth/verify-email")
async def verify_email(payload: VerifyEmailRequest):
    token_data = validate_email_verification_token(payload.token)
    if not token_data:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")

    user = await db.users.find_one({"id": token_data["sub"]}, {"_id": 0})
    if not user or normalize_email(user.get("email", "")) != token_data.get("email"):
        raise HTTPException(status_code=400, detail="This verification link is no longer valid.")

    if user.get("email_verified"):
        return {"message": "Your email is already verified."}

    verified_at = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verified": True, "email_verified_at": verified_at}, "$unset": {"email_verification_sent_at": ""}}
    )
    return {"message": "Email verified successfully. You can now log in."}


@router.post("/auth/resend-verification")
async def resend_verification_email_endpoint(payload: ResendVerificationRequest):
    normalized = normalize_email(payload.email)
    user = await db.users.find_one({"email": normalized}, {"_id": 0})
    if not user:
        return {"message": "If that email is registered and still unverified, a verification link has been sent."}

    if user.get("email_verified"):
        return {"message": "That email address is already verified."}

    last_sent_raw = user.get("email_verification_sent_at")
    if last_sent_raw:
        try:
            last_sent = datetime.fromisoformat(last_sent_raw)
            elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
            if elapsed < EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS:
                retry_after = int(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsed)
                raise HTTPException(status_code=429, detail=f"Please wait {retry_after} seconds before requesting another verification email.")
        except ValueError:
            pass

    try:
        send_verification_email(user["email"], user["username"], user["id"])
    except Exception as exc:
        logger.error("Failed to resend verification email to %s: %s", user["email"], exc)
        raise HTTPException(status_code=503, detail="Unable to send verification email right now. Please try again later.")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verification_sent_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "A new verification email has been sent."}


@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, response: Response):
    normalized = normalize_email(credentials.email)
    user = await db.users.find_one({"email": normalized}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is inactive")

    access_token = create_access_token({"sub": user["id"], "email": user["email"]})
    set_auth_cookie(response, access_token)

    user_response = user_to_response(user)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )


@router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)


# Discord OAuth2 endpoints

@router.get("/auth/discord")
async def discord_login_redirect():
    require_discord_config()
    state = create_discord_state("login")
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": DISCORD_SCOPES,
        "state": state
    }
    return {"url": f"https://discord.com/oauth2/authorize?{urllib.parse.urlencode(params)}"}


@router.get("/auth/discord/link")
async def discord_link_redirect(current_user: dict = Depends(get_current_user)):
    require_discord_config()
    if current_user.get("discord_linked"):
        raise HTTPException(status_code=400, detail="Discord already linked. Unlink first.")
    state = create_discord_state("link", current_user["id"])
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": DISCORD_SCOPES,
        "state": state
    }
    return {"url": f"https://discord.com/oauth2/authorize?{urllib.parse.urlencode(params)}"}


@router.get("/auth/discord/callback")
async def discord_callback(code: str = None, state: str = None, error: str = None):
    require_discord_config()
    frontend_base = get_frontend_base_url()

    if error or not code or not state:
        return RedirectResponse(f"{frontend_base}/login?discord_error=authorization_denied")

    state_data = validate_discord_state(state)
    if not state_data:
        return RedirectResponse(f"{frontend_base}/login?discord_error=invalid_state")

    flow = state_data.get("flow", "login")

    try:
        async with httpx.AsyncClient() as http:
            token_res = await http.post(
                f"{DISCORD_API_URL}/oauth2/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            if token_res.status_code != 200:
                logger.error(f"Discord token exchange failed: {token_res.text}")
                return RedirectResponse(f"{frontend_base}/login?discord_error=token_exchange_failed")

            access_token = token_res.json()["access_token"]

            user_res = await http.get(
                f"{DISCORD_API_URL}/users/@me",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if user_res.status_code != 200:
                return RedirectResponse(f"{frontend_base}/login?discord_error=user_fetch_failed")

            discord_user = user_res.json()
    except Exception as e:
        logger.error(f"Discord API error: {e}")
        return RedirectResponse(f"{frontend_base}/login?discord_error=api_error")

    discord_id = discord_user["id"]
    discord_username = discord_user.get("username", "")
    discord_avatar_hash = discord_user.get("avatar")
    discord_email = normalize_email(discord_user["email"]) if discord_user.get("email") else None
    discord_email_verified = bool(discord_user.get("verified"))
    discord_avatar_url = (
        f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar_hash}.png"
        if discord_avatar_hash else None
    )

    # LINK FLOW
    if flow == "link":
        user_id = state_data.get("user_id")
        if not user_id:
            return RedirectResponse(f"{frontend_base}/hub/profile?discord_error=invalid_link_state")

        conflict = await db.users.find_one({"discord_id": discord_id, "id": {"$ne": user_id}}, {"_id": 0})
        if conflict:
            return RedirectResponse(f"{frontend_base}/hub/profile?discord_error=discord_already_linked_to_another_account")

        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "discord_id": discord_id,
                "discord_username": discord_username,
                "discord_avatar": discord_avatar_url,
                "discord_linked": True
            }}
        )
        return RedirectResponse(f"{frontend_base}/hub/profile?discord_linked=true")

    # LOGIN / REGISTER FLOW
    existing_by_discord = await db.users.find_one({"discord_id": discord_id}, {"_id": 0})
    if existing_by_discord:
        if not existing_by_discord.get("is_active", True) and not existing_by_discord.get("pre_registered", False):
            return RedirectResponse(f"{frontend_base}/login?discord_error=account_inactive")

        if existing_by_discord.get("pre_registered", False):
            await db.users.update_one(
                {"id": existing_by_discord["id"]},
                {"$set": {
                    "discord_linked": True,
                    "is_active": True,
                    "pre_registered": False,
                    "discord_username": discord_username or existing_by_discord.get("discord_username"),
                    "discord_avatar": discord_avatar_url or existing_by_discord.get("discord_avatar"),
                }}
            )
            existing_by_discord["is_active"] = True
            existing_by_discord["pre_registered"] = False

        jwt_token = create_access_token({"sub": existing_by_discord["id"], "email": existing_by_discord["email"]})
        redirect = RedirectResponse(f"{frontend_base}/login?discord_success=true")
        set_auth_cookie(redirect, jwt_token)
        return redirect

    if discord_email:
        existing_by_email = await db.users.find_one({"email": discord_email}, {"_id": 0})
        if existing_by_email:
            if not existing_by_email.get("is_active", True) and not existing_by_email.get("pre_registered", False):
                return RedirectResponse(f"{frontend_base}/login?discord_error=account_inactive")
            # Prevent linking if this email account already has a different Discord ID
            if existing_by_email.get("discord_id") and existing_by_email["discord_id"] != discord_id:
                return RedirectResponse(f"{frontend_base}/login?discord_error=email_already_linked_to_different_discord")
            await db.users.update_one(
                {"id": existing_by_email["id"]},
                {"$set": {
                    "discord_id": discord_id,
                    "discord_username": discord_username,
                    "discord_avatar": discord_avatar_url,
                    "discord_linked": True,
                    "is_active": True,
                    "pre_registered": False,
                    "email_verified": existing_by_email.get("email_verified", False) or discord_email_verified,
                    "email_verified_at": (
                        datetime.now(timezone.utc).isoformat()
                        if discord_email_verified and not existing_by_email.get("email_verified", False)
                        else existing_by_email.get("email_verified_at")
                    ),
                }}
            )
            jwt_token = create_access_token({"sub": existing_by_email["id"], "email": existing_by_email["email"]})
            redirect = RedirectResponse(f"{frontend_base}/login?discord_success=true")
            set_auth_cookie(redirect, jwt_token)
            return redirect

    email_for_user = discord_email or f"discord_{discord_id}@25thid.local"
    new_user = User(
        email=email_for_user,
        username=discord_username or f"Operator_{discord_id[:8]}",
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
        discord_id=discord_id,
        discord_username=discord_username,
        discord_avatar=discord_avatar_url,
        discord_linked=True,
        pipeline_stage="applicant",
    )
    doc = new_user.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)

    jwt_token = create_access_token({"sub": new_user.id, "email": new_user.email})
    redirect = RedirectResponse(f"{frontend_base}/login?discord_success=true")
    set_auth_cookie(redirect, jwt_token)
    return redirect


@router.delete("/auth/discord/unlink")
async def discord_unlink(current_user: dict = Depends(get_current_user)):
    if not current_user.get("discord_linked"):
        raise HTTPException(status_code=400, detail="No Discord account linked")
    email = current_user.get("email", "")
    if email.endswith("@25thid.local"):
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink Discord — it is your only login method. Set an email and password first."
        )
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"discord_id": None, "discord_username": None, "discord_avatar": None, "discord_linked": False}}
    )
    return {"message": "Discord account unlinked successfully"}


@router.post("/auth/set-password")
async def set_password(data: SetPasswordRequest, response: Response, current_user: dict = Depends(get_current_user)):
    current_email = current_user.get("email", "")
    normalized = normalize_email(data.email)
    if not current_email.endswith("@25thid.local"):
        raise HTTPException(status_code=400, detail="You already have an email and password set.")
    existing = await db.users.find_one({"email": normalized, "id": {"$ne": current_user["id"]}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered to another account.")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "email": normalized,
            "password_hash": pwd_context.hash(data.password),
            "email_verified": True,
            "email_verified_at": current_user.get("email_verified_at") or datetime.now(timezone.utc).isoformat()
        }}
    )
    new_token = create_access_token({"sub": current_user["id"], "email": normalized})
    set_auth_cookie(response, new_token)
    return {"message": "Email and password set successfully. You can now log in with email/password.", "access_token": new_token}


class ClaimAccountRequest(BaseModel):
    email: EmailStr
    password: str


@router.get("/auth/check-claimable")
async def check_claimable(email: str):
    """Check if an email has a claimable pre-registered account."""
    normalized = normalize_email(email)
    user = await db.users.find_one({"email": normalized}, {"_id": 0, "password_hash": 0})
    if not user:
        return {"claimable": False, "message": "No account found with this email"}
    if not user.get("pre_registered", False):
        return {"claimable": False, "message": "This account is already active. Please log in normally."}
    return {"claimable": True, "username": user.get("username", ""), "message": "Account found! Set a password to activate your account."}


@router.post("/auth/claim-account")
async def claim_account(data: ClaimAccountRequest, response: Response):
    """Allow a pre-registered member to claim their account by setting a password."""
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    normalized = normalize_email(data.email)
    user = await db.users.find_one({"email": normalized}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")

    if not user.get("pre_registered", False):
        raise HTTPException(status_code=400, detail="This account is already active. Please log in normally.")

    # Activate the account
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": pwd_context.hash(data.password),
            "pre_registered": False,
            "is_active": True,
            "email_verified": True,
            "email_verified_at": user.get("email_verified_at") or datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Auto-login the user
    access_token = create_access_token({"sub": user["id"], "email": normalized})
    set_auth_cookie(response, access_token)

    user["pre_registered"] = False
    user["is_active"] = True
    user_response = user_to_response(user)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )
