import os
import secrets
import urllib.parse
import smtplib
import logging
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta
import jwt

from config import (
    JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS,
    EMAIL_VERIFICATION_TTL_HOURS,
    COOKIE_NAME, COOKIE_MAX_AGE, COOKIE_SECURE,
    FRONTEND_URL, DISCORD_REDIRECT_URI,
    SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
    SMTP_FROM_EMAIL, SMTP_FROM_NAME,
    SMTP_USE_TLS, SMTP_USE_SSL,
    EMAIL_DELIVERY_MODE,
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
    pwd_context,
)
from models.user import UserResponse
from models.partner import PartnerUserResponse
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_frontend_base_url() -> str:
    if FRONTEND_URL:
        return FRONTEND_URL
    if DISCORD_REDIRECT_URI and "/api/" in DISCORD_REDIRECT_URI:
        return DISCORD_REDIRECT_URI.rsplit("/api/", 1)[0]
    cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
    cors_origins = [o.strip().rstrip("/") for o in cors_origins_raw.split(',') if o.strip() and o.strip() != '*']
    return cors_origins[0] if cors_origins else "http://localhost:3000"


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_email_verification_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": normalize_email(email),
        "purpose": "verify_email",
        "exp": datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TTL_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def validate_email_verification_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "verify_email":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.exceptions.PyJWTError:
        return None
    except Exception:
        return None


def build_verification_link(token: str) -> str:
    return f"{get_frontend_base_url()}/login?verify_email_token={urllib.parse.quote(token)}"


def send_email_message(message: EmailMessage) -> None:
    if EMAIL_DELIVERY_MODE == "log":
        logger.info("Email delivery mode is 'log'; email contents follow.\n%s", message)
        return
    if not SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")

    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
        return

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        if SMTP_USERNAME:
            smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


def send_verification_email(recipient_email: str, username: str, user_id: str) -> None:
    token = create_email_verification_token(user_id, recipient_email)
    verification_link = build_verification_link(token)
    message = EmailMessage()
    message["Subject"] = "Verify your 25th Infantry Division account"
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = recipient_email
    message.set_content(
        f"Hello {username},\n\n"
        "Verify your email address to activate your account:\n"
        f"{verification_link}\n\n"
        f"This link expires in {EMAIL_VERIFICATION_TTL_HOURS} hours.\n"
        "If you did not create this account, you can ignore this email."
    )
    message.add_alternative(
        f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>Hello {username},</p>
            <p>Verify your email address to activate your account.</p>
            <p><a href="{verification_link}">Verify your account</a></p>
            <p>This link expires in {EMAIL_VERIFICATION_TTL_HOURS} hours.</p>
            <p>If you did not create this account, you can ignore this email.</p>
          </body>
        </html>
        """,
        subtype="html",
    )
    send_email_message(message)


def set_auth_cookie(response, token: str):
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, secure=COOKIE_SECURE,
        samesite="lax", max_age=COOKIE_MAX_AGE, path="/"
    )


def clear_auth_cookie(response):
    response.delete_cookie(key=COOKIE_NAME, path="/")


def user_to_response(u: dict) -> UserResponse:
    """Build a UserResponse from a raw MongoDB user document."""
    jd = u.get("join_date")
    if isinstance(jd, str):
        jd = datetime.fromisoformat(jd)
    elif jd is None:
        jd = datetime.now(timezone.utc)
    return UserResponse(
        id=u["id"], email=u.get("email", ""), username=u["username"], role=u.get("role", "member"),
        rank=u.get("rank"), specialization=u.get("specialization"), join_date=jd,
        email_verified=u.get("email_verified", False),
        avatar_url=u.get("avatar_url"), bio=u.get("bio"), status=u.get("status", "recruit"),
        timezone=u.get("timezone"), squad=u.get("squad"), favorite_role=u.get("favorite_role"),
        awards=u.get("awards", []), mission_history=u.get("mission_history", []),
        training_history=u.get("training_history", []),
        discord_id=u.get("discord_id"), discord_username=u.get("discord_username"),
        discord_avatar=u.get("discord_avatar"), discord_linked=u.get("discord_linked", False),
        pre_registered=u.get("pre_registered", False), permissions=u.get("permissions", []), unit=u.get("unit"),
        company=u.get("company"), platoon=u.get("platoon"), billet=u.get("billet"),
        display_mos=u.get("display_mos"), billet_acronym=u.get("billet_acronym"),
        loa_status=u.get("loa_status"), pipeline_stage=u.get("pipeline_stage"),
        pipeline_history=u.get("pipeline_history", [])
    )


def partner_user_to_response(u: dict, unit_name: str = "") -> PartnerUserResponse:
    """Build a PartnerUserResponse from a raw MongoDB partner_users document."""
    jd = u.get("join_date")
    if isinstance(jd, str):
        jd = datetime.fromisoformat(jd)
    elif jd is None:
        jd = datetime.now(timezone.utc)
    return PartnerUserResponse(
        id=u["id"], email=u.get("email", ""), username=u["username"],
        partner_unit_id=u.get("partner_unit_id", ""),
        partner_role=u.get("partner_role", "partner_member"),
        rank=u.get("rank"), billet=u.get("billet"),
        status=u.get("status", "pending"), is_active=u.get("is_active", True),
        avatar_url=u.get("avatar_url"), bio=u.get("bio"),
        join_date=jd, partner_unit_name=unit_name, account_type="partner"
    )


def require_discord_config() -> None:
    if not (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI):
        raise HTTPException(status_code=500, detail="Discord integration not configured")


def create_discord_state(flow: str, user_id: str = None) -> str:
    """Create a signed JWT state parameter for Discord CSRF protection."""
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "flow": flow,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    if user_id:
        payload["user_id"] = user_id
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def validate_discord_state(state: str):
    """Validate and decode a Discord OAuth state parameter."""
    try:
        return jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.exceptions.PyJWTError:
        return None
    except Exception:
        return None
