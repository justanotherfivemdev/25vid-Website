from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import json
import re
import urllib.parse
import smtplib
import httpx
from pathlib import Path
from email.message import EmailMessage
from pydantic import BaseModel, Field, EmailStr, ConfigDict, TypeAdapter
from typing import List, Optional, Literal, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext

from google_sheets_import import (
    GoogleSheetsImportError,
    parse_spreadsheet_id,
    fetch_sheet_rows,
    build_field_mapping,
    row_to_mapped_fields,
    split_permissions,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Upload directory - persistent backend location, served via StaticFiles
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ['JWT_ALGORITHM']
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
EMAIL_VERIFICATION_TTL_HOURS = int(os.environ.get('EMAIL_VERIFICATION_TTL_HOURS', 24))
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = int(os.environ.get('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60))

# Password hashing
IMPORT_EMAIL_ADAPTER = TypeAdapter(EmailStr)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# Auth cookie settings
COOKIE_NAME = "auth_token"
COOKIE_MAX_AGE = JWT_EXPIRATION_HOURS * 3600
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"

FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", SMTP_USERNAME or "no-reply@25thid.local").strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "25th Infantry Division").strip()
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "false").lower() == "true"
EMAIL_DELIVERY_MODE = os.environ.get("EMAIL_DELIVERY_MODE", "smtp" if SMTP_HOST else "log").strip().lower()

def set_auth_cookie(response, token: str):
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, secure=COOKIE_SECURE,
        samesite="lax", max_age=COOKIE_MAX_AGE, path="/"
    )

def clear_auth_cookie(response):
    response.delete_cookie(key=COOKIE_NAME, path="/")

# Discord OAuth2 configuration
DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.environ.get('DISCORD_REDIRECT_URI')
DISCORD_API_URL = "https://discord.com/api/v10"
DISCORD_SCOPES = "identify email"


def require_discord_config() -> None:
    if not (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI):
        raise HTTPException(status_code=500, detail="Discord integration not configured")

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============================================================================
# MODELS
# ============================================================================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    username: str
    password_hash: str
    role: str = "member"  # member, admin
    rank: Optional[str] = None
    specialization: Optional[str] = None
    join_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    email_verified: bool = False
    email_verified_at: Optional[str] = None
    email_verification_sent_at: Optional[str] = None
    # Phase 4 profile fields
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    status: str = "recruit"  # recruit, active, reserve, staff, command, inactive
    timezone: Optional[str] = None
    squad: Optional[str] = None
    favorite_role: Optional[str] = None
    awards: List[dict] = Field(default_factory=list)           # [{id, name, date, description}]
    mission_history: List[dict] = Field(default_factory=list)  # [{id, operation_name, date, role_performed, notes}]
    training_history: List[dict] = Field(default_factory=list) # [{id, course_name, completion_date, instructor, notes}]
    # Phase 5: Discord integration prep
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None
    discord_avatar: Optional[str] = None
    discord_linked: bool = False
    pre_registered: bool = False
    permissions: List[str] = Field(default_factory=list)
    unit: Optional[str] = None
    # Phase 6: Unit hierarchy
    company: Optional[str] = None     # e.g., "Alpha", "Bravo", "HQ"
    platoon: Optional[str] = None     # e.g., "1st Platoon", "2nd Platoon"
    billet: Optional[str] = None      # e.g., "Company Commander", "Squad Leader", "Rifleman"

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=8)
    rank: Optional[str] = None
    specialization: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    rank: Optional[str] = None
    specialization: Optional[str] = None
    join_date: datetime
    email_verified: bool = False
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    status: str = "recruit"
    timezone: Optional[str] = None
    squad: Optional[str] = None
    favorite_role: Optional[str] = None
    awards: List[dict] = Field(default_factory=list)
    mission_history: List[dict] = Field(default_factory=list)
    training_history: List[dict] = Field(default_factory=list)
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None
    discord_avatar: Optional[str] = None
    discord_linked: bool = False
    pre_registered: bool = False
    permissions: List[str] = Field(default_factory=list)
    unit: Optional[str] = None
    # Phase 6: Unit hierarchy
    company: Optional[str] = None
    platoon: Optional[str] = None
    billet: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class RegistrationResponse(BaseModel):
    message: str
    requires_verification: bool = True
    email: EmailStr

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class Operation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    operation_type: str  # "combat", "training", "recon", "support"
    date: str
    time: str
    max_participants: Optional[int] = None
    logo_url: Optional[str] = None
    rsvps: List[dict] = Field(default_factory=list)  # [{user_id, username, status, role_notes, rsvp_time}]
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OperationCreate(BaseModel):
    title: str
    description: str
    operation_type: str
    date: str
    time: str
    max_participants: Optional[int] = None
    logo_url: Optional[str] = None  # Country/faction/region badge

class RSVPSubmit(BaseModel):
    status: Literal["attending", "tentative", "not_attending"] = "attending"
    role_notes: Optional[str] = None

class Announcement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    priority: str = "normal"  # "low", "normal", "high", "urgent"
    badge_url: Optional[str] = None  # Bottom-right badge/logo
    author_id: str
    author_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    badge_url: Optional[str] = None  # Bottom-right badge/logo

class Discussion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    title: str
    content: str
    author_id: str
    author_name: str
    replies: List[dict] = Field(default_factory=list)
    pinned: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DiscussionCreate(BaseModel):
    category: str
    title: str
    content: str

class ReplyCreate(BaseModel):
    content: str

class GalleryImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    image_url: str
    category: str = "operation"  # "operation", "training", "team", "equipment"
    uploaded_by: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GalleryImageCreate(BaseModel):
    title: str
    image_url: str
    category: Literal["operation", "training", "team", "equipment"] = "operation"

class Training(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    instructor: str
    schedule: str
    duration: str
    image_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TrainingCreate(BaseModel):
    title: str
    description: str
    instructor: str
    schedule: str
    duration: str
    image_url: Optional[str] = None

# Phase 4: Profile & History models
class ProfileSelfUpdate(BaseModel):
    """Fields a member can edit on their own profile"""
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None
    favorite_role: Optional[str] = None

class AdminProfileUpdate(BaseModel):
    """Fields only an admin can edit on any member's profile"""
    username: Optional[str] = None
    role: Optional[str] = None
    rank: Optional[str] = None
    specialization: Optional[str] = None
    status: Optional[str] = None
    squad: Optional[str] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None
    favorite_role: Optional[str] = None
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None
    # Phase 6: Unit hierarchy fields
    company: Optional[str] = None
    platoon: Optional[str] = None
    billet: Optional[str] = None

class UserImportRequest(BaseModel):
    spreadsheetId: Optional[str] = None
    spreadsheetUrl: Optional[str] = None
    sheetName: Optional[str] = None
    fieldMapping: Optional[Dict[str, str]] = None

class UserImportRowResult(BaseModel):
    row_number: int
    action: str
    message: str
    identifier: Optional[str] = None

class UserImportResponse(BaseModel):
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    sheet_name: Optional[str] = None
    field_mapping: Dict[str, str] = Field(default_factory=dict)
    results: List[UserImportRowResult] = Field(default_factory=list)

class MissionHistoryEntry(BaseModel):
    operation_name: str
    date: str
    role_performed: str
    notes: Optional[str] = None

class TrainingHistoryEntry(BaseModel):
    course_name: str
    completion_date: str
    instructor: Optional[str] = None
    notes: Optional[str] = None

class AwardEntry(BaseModel):
    name: str
    date: Optional[str] = None
    description: Optional[str] = None

class HistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    year: str
    description: str
    image_url: Optional[str] = None
    image_position: str = "center"
    image_overlay_opacity: int = 60
    text_contrast_mode: str = "auto"  # auto, light, dark
    campaign_type: str = "campaign"  # campaign, operation, milestone
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HistoryEntryCreate(BaseModel):
    title: str
    year: str
    description: str
    image_url: Optional[str] = None
    image_position: str = "center"
    image_overlay_opacity: int = 60
    text_contrast_mode: str = "auto"
    campaign_type: str = "campaign"
    sort_order: int = 0

class MemberOfTheWeek(BaseModel):
    user_id: str
    username: str
    reason: str = ""
    avatar_url: Optional[str] = None
    rank: Optional[str] = None
    set_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ============================================================================
# AUTH UTILITIES
# ============================================================================

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

def create_email_verification_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": normalize_email(email),
        "purpose": "verify_email",
        "exp": datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TTL_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def validate_email_verification_token(token: str) -> Optional[dict]:
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

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(request: Request) -> dict:
    # 1. Try HttpOnly cookie
    token = request.cookies.get(COOKIE_NAME)
    # 2. Fall back to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account is inactive")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.exceptions.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

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

def validate_discord_state(state: str) -> dict:
    """Validate and decode a Discord OAuth state parameter."""
    try:
        return jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.exceptions.PyJWTError:
        return None
    except Exception:
        return None

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
        company=u.get("company"), platoon=u.get("platoon"), billet=u.get("billet")
    )

def validate_import_email(raw_email: str) -> str:
    try:
        validated = IMPORT_EMAIL_ADAPTER.validate_python(raw_email)
    except Exception as exc:
        raise ValueError(f"Invalid email '{raw_email}'") from exc
    return normalize_email(str(validated))



def sanitize_import_user_fields(raw: Dict[str, str]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}

    if raw.get("username"):
        payload["username"] = raw["username"]
    if raw.get("email"):
        payload["email"] = validate_import_email(raw["email"])
    if raw.get("discord_id"):
        payload["discord_id"] = raw["discord_id"]
    if raw.get("discord_username"):
        payload["discord_username"] = raw["discord_username"]
    if raw.get("rank"):
        payload["rank"] = raw["rank"]
    if raw.get("role"):
        payload["role"] = raw["role"].lower()
    if raw.get("permissions"):
        payload["permissions"] = split_permissions(raw["permissions"])
    if raw.get("unit"):
        payload["unit"] = raw["unit"]
        # default convenience mapping for roster hierarchy
        payload.setdefault("company", raw["unit"])
    if raw.get("status"):
        payload["status"] = raw["status"].lower()

    return payload


async def upsert_user_from_import(mapped_fields: Dict[str, str]) -> tuple[str, str]:
    update_fields = sanitize_import_user_fields(mapped_fields)
    email = update_fields.get("email")
    discord_id = update_fields.get("discord_id")

    existing_by_email = None
    existing_by_discord = None

    if email:
        existing_by_email = await db.users.find_one({"email": email}, {"_id": 0})
    if discord_id:
        existing_by_discord = await db.users.find_one({"discord_id": discord_id}, {"_id": 0})

    if existing_by_email and existing_by_discord and existing_by_email["id"] != existing_by_discord["id"]:
        raise ValueError(
            "Conflicting identifiers: provided email and discord_id belong to different existing accounts"
        )

    existing = existing_by_email or existing_by_discord

    if existing:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": existing["id"]}, {"$set": update_fields})
        return "updated", existing.get("email") or existing.get("discord_id") or existing.get("id")

    generated_email = email or f"imported_discord_{discord_id}@25thid.local"
    generated_username = update_fields.get("username") or update_fields.get("discord_username") or f"PreReg_{str(uuid.uuid4())[:8]}"

    new_user = User(
        email=generated_email,
        username=generated_username,
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        role=update_fields.get("role", "member"),
        rank=update_fields.get("rank"),
        status=update_fields.get("status", "recruit"),
        discord_id=update_fields.get("discord_id"),
        discord_username=update_fields.get("discord_username"),
        discord_linked=bool(update_fields.get("discord_id")),
        pre_registered=True,
        permissions=update_fields.get("permissions", []),
        unit=update_fields.get("unit"),
        company=update_fields.get("company"),
        is_active=False,
    )

    doc = new_user.model_dump()
    doc["join_date"] = doc["join_date"].isoformat()
    await db.users.insert_one(doc)
    return "created", generated_email


# ============================================================================
# AUTH STATUS ENDPOINT (for frontend feature detection)
# ============================================================================

@api_router.get("/auth/status")
async def get_auth_status():
    """
    Returns the availability of authentication features.
    Frontend uses this to conditionally render Discord login button, etc.
    """
    return {
        "discord_enabled": bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI),
        "email_enabled": True,  # Always available
        "email_verification_required": False,
    }

# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

@api_router.post("/auth/register", response_model=RegistrationResponse)
async def register(user_data: UserRegister, response: Response):
    normalized_email = normalize_email(user_data.email)
    # Check if user exists
    existing_user = await db.users.find_one({"email": normalized_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user_dict = user_data.model_dump()
    user_dict["email"] = normalized_email
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    # TEMPORARY: email verification is disabled until SMTP is configured.
    # Keep the fields and verification flow in place for easy re-enable later.
    user_dict["email_verified"] = True
    user_dict["email_verified_at"] = datetime.now(timezone.utc).isoformat()
    # user_dict["email_verification_sent_at"] = datetime.now(timezone.utc).isoformat()
    user_obj = User(**user_dict)

    # TEMPORARY: disable verification email delivery until SMTP/verification is configured.
    # try:
    #     send_verification_email(user_obj.email, user_obj.username, user_obj.id)
    # except Exception as exc:
    #     logger.error("Failed to send verification email to %s: %s", user_obj.email, exc)
    #     raise HTTPException(status_code=503, detail="Unable to send verification email right now. Please try again later.")

    doc = user_obj.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)

    clear_auth_cookie(response)
    return RegistrationResponse(
        message="Registration successful. You can now log in.",
        requires_verification=False,
        email=user_obj.email,
    )

@api_router.post("/auth/verify-email")
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

@api_router.post("/auth/resend-verification")
async def resend_verification_email(payload: ResendVerificationRequest):
    normalized_email = normalize_email(payload.email)
    user = await db.users.find_one({"email": normalized_email}, {"_id": 0})
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

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, response: Response):
    normalized_email = normalize_email(credentials.email)
    user = await db.users.find_one({"email": normalized_email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is inactive")

    # TEMPORARY: email verification enforcement disabled until SMTP is configured.
    # if not user.get("email_verified", False):
    #     raise HTTPException(
    #         status_code=403,
    #         detail={
    #             "code": "email_not_verified",
    #             "message": "Verify your email before logging in. You can request a new verification link from the login form."
    #         }
    #     )
    
    access_token = create_access_token({"sub": user["id"], "email": user["email"]})
    set_auth_cookie(response, access_token)
    
    user_response = user_to_response(user)
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)

# ============================================================================
# DISCORD OAUTH2 ENDPOINTS
# ============================================================================

@api_router.get("/auth/discord")
async def discord_login_redirect():
    """Initiate Discord OAuth2 login/signup flow."""
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

@api_router.get("/auth/discord/link")
async def discord_link_redirect(current_user: dict = Depends(get_current_user)):
    """Initiate Discord OAuth2 account linking flow for logged-in user."""
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

@api_router.get("/auth/discord/callback")
async def discord_callback(code: str = None, state: str = None, error: str = None):
    """Handle Discord OAuth2 callback — exchanges code, creates/links/logs in user."""
    require_discord_config()
    frontend_base = get_frontend_base_url()

    if error or not code or not state:
        return RedirectResponse(f"{frontend_base}/login?discord_error=authorization_denied")

    state_data = validate_discord_state(state)
    if not state_data:
        return RedirectResponse(f"{frontend_base}/login?discord_error=invalid_state")

    flow = state_data.get("flow", "login")

    # Exchange code for access token
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

            # Fetch Discord user identity
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

    # === LINK FLOW ===
    if flow == "link":
        user_id = state_data.get("user_id")
        if not user_id:
            return RedirectResponse(f"{frontend_base}/hub/profile?discord_error=invalid_link_state")

        # Check if this Discord account is already linked to someone else
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

    # === LOGIN / REGISTER FLOW ===
    # 1. Check if Discord ID is already linked to an account
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

    # 2. Check if Discord email matches an existing account — auto-link
    if discord_email:
        existing_by_email = await db.users.find_one({"email": discord_email}, {"_id": 0})
        if existing_by_email:
            if not existing_by_email.get("is_active", True) and not existing_by_email.get("pre_registered", False):
                return RedirectResponse(f"{frontend_base}/login?discord_error=account_inactive")
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

    # 3. Create new user from Discord
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
        discord_linked=True
    )
    doc = new_user.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)

    jwt_token = create_access_token({"sub": new_user.id, "email": new_user.email})
    redirect = RedirectResponse(f"{frontend_base}/login?discord_success=true")
    set_auth_cookie(redirect, jwt_token)
    return redirect

@api_router.delete("/auth/discord/unlink")
async def discord_unlink(current_user: dict = Depends(get_current_user)):
    """Unlink Discord from current user's account."""
    if not current_user.get("discord_linked"):
        raise HTTPException(status_code=400, detail="No Discord account linked")
    # Safety: prevent unlink if Discord is the only auth method
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

# ============================================================================
# SET PASSWORD (for Discord-only users)
# ============================================================================

class SetPasswordRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

@api_router.post("/auth/set-password")
async def set_password(data: SetPasswordRequest, response: Response, current_user: dict = Depends(get_current_user)):
    """Allow Discord-only users to set a real email and password."""
    current_email = current_user.get("email", "")
    normalized_email = normalize_email(data.email)
    # Only allow if user currently has a placeholder email
    if not current_email.endswith("@25thid.local"):
        raise HTTPException(status_code=400, detail="You already have an email and password set.")
    # Check if new email is taken by another user
    existing = await db.users.find_one({"email": normalized_email, "id": {"$ne": current_user["id"]}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered to another account.")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "email": normalized_email,
            "password_hash": pwd_context.hash(data.password),
            "email_verified": True,
            "email_verified_at": current_user.get("email_verified_at") or datetime.now(timezone.utc).isoformat()
        }}
    )
    # Return new token with updated email
    new_token = create_access_token({"sub": current_user["id"], "email": normalized_email})
    set_auth_cookie(response, new_token)
    return {"message": "Email and password set successfully. You can now log in with email/password.", "access_token": new_token}

# ============================================================================
# MY SCHEDULE (operations user has RSVP'd to)
# ============================================================================

@api_router.get("/my-schedule")
async def get_my_schedule(current_user: dict = Depends(get_current_user)):
    """Get all operations the current user has RSVP'd to, sorted by date."""
    user_id = current_user["id"]
    all_ops = await db.operations.find({"rsvps.user_id": user_id}, {"_id": 0}).to_list(500)
    result = []
    for op in all_ops:
        my_rsvp = next((r for r in op.get("rsvps", []) if r["user_id"] == user_id), None)
        if my_rsvp:
            result.append({
                "id": op["id"],
                "title": op["title"],
                "date": op.get("date", ""),
                "time": op.get("time", ""),
                "operation_type": op.get("operation_type", "combat"),
                "my_status": my_rsvp["status"],
                "my_role_notes": my_rsvp.get("role_notes", ""),
                "attending_count": len([r for r in op.get("rsvps", []) if r["status"] == "attending"]),
                "max_participants": op.get("max_participants"),
            })
    # Sort by date (upcoming first)
    result.sort(key=lambda x: x["date"])
    return result

# ============================================================================
# OPERATIONS ENDPOINTS
# ============================================================================

@api_router.get("/operations", response_model=List[Operation])
async def get_operations():
    operations = await db.operations.find({}, {"_id": 0}).to_list(1000)
    for op in operations:
        if isinstance(op['created_at'], str):
            op['created_at'] = datetime.fromisoformat(op['created_at'])
    return operations

@api_router.get("/operations/{operation_id}", response_model=Operation)
async def get_operation(operation_id: str):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    if isinstance(operation['created_at'], str):
        operation['created_at'] = datetime.fromisoformat(operation['created_at'])
    return operation

@api_router.post("/operations", response_model=Operation)
async def create_operation(operation_data: OperationCreate, current_user: dict = Depends(get_current_admin)):
    op_dict = operation_data.model_dump()
    op_dict["created_by"] = current_user["id"]
    operation_obj = Operation(**op_dict)
    
    doc = operation_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.operations.insert_one(doc)
    
    return operation_obj

@api_router.post("/operations/{operation_id}/rsvp")
async def rsvp_operation(operation_id: str, rsvp_data: RSVPSubmit, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")

    user_id = current_user["id"]
    rsvps = operation.get("rsvps", [])
    max_p = operation.get("max_participants")

    # Remove existing RSVP for this user
    rsvps = [r for r in rsvps if r["user_id"] != user_id]

    if rsvp_data.status == "not_attending":
        # Just remove — promote first waitlisted if capacity was full
        await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
        # Auto-promote first waitlisted
        if max_p:
            attending = [r for r in rsvps if r["status"] == "attending"]
            waitlisted = [r for r in rsvps if r["status"] == "waitlisted"]
            if len(attending) < max_p and waitlisted:
                waitlisted[0]["status"] = "attending"
                await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
        return {"message": "RSVP removed", "rsvps": rsvps}

    # Determine status
    assigned_status = rsvp_data.status
    if assigned_status == "attending" and max_p:
        current_attending = len([r for r in rsvps if r["status"] == "attending"])
        if current_attending >= max_p:
            assigned_status = "waitlisted"

    entry = {
        "user_id": user_id,
        "username": current_user["username"],
        "status": assigned_status,
        "role_notes": rsvp_data.role_notes or "",
        "rsvp_time": datetime.now(timezone.utc).isoformat()
    }
    rsvps.append(entry)

    await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
    msg = "Waitlisted — operation at capacity" if assigned_status == "waitlisted" else f"RSVP set to {assigned_status}"
    return {"message": msg, "your_status": assigned_status, "rsvps": rsvps}

@api_router.delete("/operations/{operation_id}/rsvp")
async def cancel_rsvp(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    rsvps = [r for r in operation.get("rsvps", []) if r["user_id"] != current_user["id"]]
    # Auto-promote waitlisted
    max_p = operation.get("max_participants")
    if max_p:
        attending = [r for r in rsvps if r["status"] == "attending"]
        waitlisted = [r for r in rsvps if r["status"] == "waitlisted"]
        if len(attending) < max_p and waitlisted:
            waitlisted[0]["status"] = "attending"
    await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
    return {"message": "RSVP cancelled", "rsvps": rsvps}

@api_router.get("/operations/{operation_id}/rsvp")
async def get_operation_rsvps(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    rsvps = operation.get("rsvps", [])
    attending = [r for r in rsvps if r["status"] == "attending"]
    tentative = [r for r in rsvps if r["status"] == "tentative"]
    waitlisted = [r for r in rsvps if r["status"] == "waitlisted"]
    return {"attending": attending, "tentative": tentative, "waitlisted": waitlisted,
            "counts": {"attending": len(attending), "tentative": len(tentative), "waitlisted": len(waitlisted)},
            "max_participants": operation.get("max_participants")}

@api_router.put("/admin/operations/{operation_id}/rsvp/{user_id}/promote")
async def promote_from_waitlist(operation_id: str, user_id: str, current_user: dict = Depends(get_current_admin)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    rsvps = operation.get("rsvps", [])
    found = False
    for r in rsvps:
        if r["user_id"] == user_id and r["status"] == "waitlisted":
            r["status"] = "attending"
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Waitlisted user not found")
    await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
    return {"message": "User promoted to attending", "rsvps": rsvps}

# ============================================================================
# ANNOUNCEMENTS ENDPOINTS
# ============================================================================

@api_router.get("/announcements", response_model=List[Announcement])
async def get_announcements():
    announcements = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for ann in announcements:
        if isinstance(ann['created_at'], str):
            ann['created_at'] = datetime.fromisoformat(ann['created_at'])
    return announcements

@api_router.post("/announcements", response_model=Announcement)
async def create_announcement(announcement_data: AnnouncementCreate, current_user: dict = Depends(get_current_admin)):
    ann_dict = announcement_data.model_dump()
    ann_dict["author_id"] = current_user["id"]
    ann_dict["author_name"] = current_user["username"]
    announcement_obj = Announcement(**ann_dict)
    
    doc = announcement_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.announcements.insert_one(doc)
    
    return announcement_obj

# ============================================================================
# DISCUSSIONS ENDPOINTS
# ============================================================================

@api_router.get("/discussions", response_model=List[Discussion])
async def get_discussions(category: Optional[str] = None):
    query = {"category": category} if category else {}
    # Sort: pinned first, then by created_at descending
    discussions = await db.discussions.find(query, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(100)
    for disc in discussions:
        if isinstance(disc['created_at'], str):
            disc['created_at'] = datetime.fromisoformat(disc['created_at'])
    return discussions

@api_router.get("/discussions/{discussion_id}", response_model=Discussion)
async def get_discussion(discussion_id: str):
    discussion = await db.discussions.find_one({"id": discussion_id}, {"_id": 0})
    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")
    if isinstance(discussion['created_at'], str):
        discussion['created_at'] = datetime.fromisoformat(discussion['created_at'])
    return discussion

@api_router.post("/discussions", response_model=Discussion)
async def create_discussion(discussion_data: DiscussionCreate, current_user: dict = Depends(get_current_user)):
    disc_dict = discussion_data.model_dump()
    disc_dict["author_id"] = current_user["id"]
    disc_dict["author_name"] = current_user["username"]
    discussion_obj = Discussion(**disc_dict)
    
    doc = discussion_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.discussions.insert_one(doc)
    
    return discussion_obj

@api_router.post("/discussions/{discussion_id}/reply")
async def add_reply(discussion_id: str, reply_data: ReplyCreate, current_user: dict = Depends(get_current_user)):
    discussion = await db.discussions.find_one({"id": discussion_id})
    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")
    
    reply = {
        "id": str(uuid.uuid4()),
        "content": reply_data.content,
        "author_id": current_user["id"],
        "author_name": current_user["username"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.discussions.update_one(
        {"id": discussion_id},
        {"$push": {"replies": reply}}
    )
    
    return {"message": "Reply added", "reply": reply}

# ============================================================================
# GALLERY ENDPOINTS
# ============================================================================

@api_router.get("/gallery", response_model=List[GalleryImage])
async def get_gallery(category: Optional[str] = None):
    query = {"category": category} if category else {}
    images = await db.gallery.find(query, {"_id": 0}).sort("uploaded_at", -1).to_list(100)
    for img in images:
        if isinstance(img['uploaded_at'], str):
            img['uploaded_at'] = datetime.fromisoformat(img['uploaded_at'])
    return images

@api_router.post("/gallery", response_model=GalleryImage)
async def upload_image(image_data: GalleryImageCreate, current_user: dict = Depends(get_current_admin)):
    img_dict = image_data.model_dump()
    img_dict["uploaded_by"] = current_user["username"]
    image_obj = GalleryImage(**img_dict)
    
    doc = image_obj.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    await db.gallery.insert_one(doc)
    
    return image_obj

# ============================================================================
# TRAINING ENDPOINTS
# ============================================================================

@api_router.get("/training", response_model=List[Training])
async def get_training():
    training = await db.training.find({}, {"_id": 0}).to_list(100)
    for t in training:
        if isinstance(t['created_at'], str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return training

@api_router.post("/training", response_model=Training)
async def create_training(training_data: TrainingCreate, current_user: dict = Depends(get_current_admin)):
    training_obj = Training(**training_data.model_dump())
    
    doc = training_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.training.insert_one(doc)
    
    return training_obj

# ============================================================================
# SITE CONTENT MANAGEMENT (ADMIN ONLY)
# ============================================================================

class SiteContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default="site_content")
    hero: dict
    about: dict
    operationalSuperiority: dict
    lethality: dict
    gallery: dict
    footer: dict
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

@api_router.get("/admin/site-content")
async def get_site_content(current_user: dict = Depends(get_current_admin)):
    content = await db.site_content.find_one({"id": "site_content"}, {"_id": 0})
    if not content:
        # Return default content if none exists
        return {
            "id": "site_content",
            "hero": {"backgroundImage": "", "tagline": "TROPIC LIGHTNING", "subtitle": "Ready to Strike — Anywhere, Anytime"},
            "nav": {"brandName": "25TH INFANTRY DIVISION", "buttonText": "ENLIST NOW"},
            "about": {"paragraph1": "", "paragraph2": "", "quote": {"text": "", "author": "", "backgroundImage": ""}},
            "operationalSuperiority": {"description": "", "images": []},
            "lethality": {"logistics": {"description": "", "image": ""}, "training": {"description": "", "image": ""}},
            "gallery": {"showcaseImages": []},
            "footer": {"description": "Tropic Lightning — Ready to Strike", "contact": {"discord": "", "email": ""}, "disclaimer": "This is a fictional Arma Reforger milsim unit. We are NOT in any way tied to the Department of War or the United States Department of Defense."}
        }
    if isinstance(content.get('updated_at'), str):
        content['updated_at'] = datetime.fromisoformat(content['updated_at'])
    return content

@api_router.put("/admin/site-content")
async def update_site_content(content: dict, current_user: dict = Depends(get_current_admin)):
    content["id"] = "site_content"
    content["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.site_content.update_one(
        {"id": "site_content"},
        {"$set": content},
        upsert=True
    )
    
    return {"message": "Site content updated successfully"}

# ============================================================================
# FILE UPLOAD ENDPOINT
# ============================================================================

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    allowed_extensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
        '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.ogg'
    ]
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(allowed_extensions)}")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    max_size = 10 * 1024 * 1024
    written = 0

    try:
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                written += len(chunk)
                if written > max_size:
                    raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
                buffer.write(chunk)
    except HTTPException:
        if file_path.exists():
            file_path.unlink()
        raise
    finally:
        await file.close()

    file_url = f"/api/uploads/{unique_name}"
    return {"url": file_url, "filename": unique_name}

# ============================================================================
# PUBLIC SITE CONTENT ENDPOINT
# ============================================================================

@api_router.get("/site-content")
async def get_public_site_content():
    content = await db.site_content.find_one({"id": "site_content"}, {"_id": 0})
    if not content:
        return None
    return content

# ============================================================================
# ADMIN CRUD ENDPOINTS
# ============================================================================

@api_router.delete("/admin/operations/{operation_id}")
async def delete_operation(operation_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.operations.delete_one({"id": operation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found")
    return {"message": "Operation deleted successfully"}

@api_router.put("/admin/operations/{operation_id}")
async def update_operation(operation_id: str, operation_data: OperationCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.operations.update_one(
        {"id": operation_id},
        {"$set": operation_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found")
    return {"message": "Operation updated successfully"}

@api_router.delete("/admin/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.announcements.delete_one({"id": announcement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"message": "Announcement deleted successfully"}

@api_router.put("/admin/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, announcement_data: AnnouncementCreate, current_user: dict = Depends(get_current_admin)):
    update_data = announcement_data.model_dump()
    update_data["author_id"] = current_user["id"]
    update_data["author_name"] = current_user["username"]
    
    result = await db.announcements.update_one(
        {"id": announcement_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"message": "Announcement updated successfully"}

@api_router.delete("/admin/discussions/{discussion_id}")
async def delete_discussion(discussion_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.discussions.delete_one({"id": discussion_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Discussion not found")
    return {"message": "Discussion deleted successfully"}

@api_router.put("/admin/discussions/{discussion_id}/pin")
async def toggle_pin_discussion(discussion_id: str, current_user: dict = Depends(get_current_admin)):
    disc = await db.discussions.find_one({"id": discussion_id}, {"_id": 0})
    if not disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    new_pinned = not disc.get("pinned", False)
    await db.discussions.update_one({"id": discussion_id}, {"$set": {"pinned": new_pinned}})
    return {"message": f"Discussion {'pinned' if new_pinned else 'unpinned'}", "pinned": new_pinned}

@api_router.delete("/admin/gallery/{image_id}")
async def delete_gallery_image(image_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.gallery.delete_one({"id": image_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": "Image deleted successfully"}

@api_router.put("/admin/gallery/{image_id}")
async def update_gallery_image(image_id: str, image_data: GalleryImageCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.gallery.update_one(
        {"id": image_id},
        {"$set": image_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": "Image updated successfully"}

@api_router.delete("/admin/discussions/{discussion_id}/reply/{reply_id}")
async def delete_reply(discussion_id: str, reply_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.discussions.update_one(
        {"id": discussion_id},
        {"$pull": {"replies": {"id": reply_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Reply not found")
    return {"message": "Reply deleted successfully"}

@api_router.delete("/admin/training/{training_id}")
async def delete_training(training_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.training.delete_one({"id": training_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Training not found")
    return {"message": "Training deleted successfully"}

@api_router.put("/admin/training/{training_id}")
async def update_training(training_id: str, training_data: TrainingCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.training.update_one(
        {"id": training_id},
        {"$set": training_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Training not found")
    return {"message": "Training updated successfully"}

# ============================================================================
# ROSTER & PROFILE ENDPOINTS
# ============================================================================

@api_router.get("/roster")
async def get_roster(current_user: dict = Depends(get_current_user)):
    """Get all active members for the roster directory."""
    users = await db.users.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("username", 1).to_list(1000)
    roster = []
    for u in users:
        jd = u.get("join_date")
        if isinstance(jd, str):
            jd = datetime.fromisoformat(jd).isoformat()
        elif hasattr(jd, 'isoformat'):
            jd = jd.isoformat()
        roster.append({
            "id": u["id"], "username": u["username"], "role": u.get("role", "member"),
            "rank": u.get("rank"), "specialization": u.get("specialization"),
            "status": u.get("status", "recruit"), "squad": u.get("squad"),
            "avatar_url": u.get("avatar_url"), "join_date": jd,
            "company": u.get("company"), "platoon": u.get("platoon"), "billet": u.get("billet")
        })
    return roster

@api_router.get("/roster/hierarchy")
async def get_roster_hierarchy(current_user: dict = Depends(get_current_user)):
    """Get roster organized by unit hierarchy (Company > Platoon > Squad)."""
    users = await db.users.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(1000)
    
    # Build hierarchy structure
    hierarchy = {
        "command_staff": [],  # Users with status=command or billet containing "Commander"/"XO"
        "companies": {},      # Grouped by company
        "unassigned": []      # Users without company assignment
    }
    
    for u in users:
        member_data = {
            "id": u["id"], "username": u["username"], "role": u.get("role", "member"),
            "rank": u.get("rank"), "specialization": u.get("specialization"),
            "status": u.get("status", "recruit"), "squad": u.get("squad"),
            "avatar_url": u.get("avatar_url"),
            "company": u.get("company"), "platoon": u.get("platoon"), "billet": u.get("billet")
        }
        
        billet = (u.get("billet") or "").lower()
        status = u.get("status", "recruit")
        company = u.get("company")
        platoon = u.get("platoon")
        squad = u.get("squad")
        
        # Command staff: status=command or billet is CO/XO level
        if status == "command" or any(x in billet for x in ["commander", "commanding officer", "executive officer", "xo", "sergeant major", "first sergeant"]):
            hierarchy["command_staff"].append(member_data)
        elif company:
            # Initialize company if needed
            if company not in hierarchy["companies"]:
                hierarchy["companies"][company] = {"platoons": {}, "unassigned": []}
            
            if platoon:
                # Initialize platoon if needed
                if platoon not in hierarchy["companies"][company]["platoons"]:
                    hierarchy["companies"][company]["platoons"][platoon] = {"squads": {}, "unassigned": []}
                
                if squad:
                    # Initialize squad if needed
                    if squad not in hierarchy["companies"][company]["platoons"][platoon]["squads"]:
                        hierarchy["companies"][company]["platoons"][platoon]["squads"][squad] = []
                    hierarchy["companies"][company]["platoons"][platoon]["squads"][squad].append(member_data)
                else:
                    hierarchy["companies"][company]["platoons"][platoon]["unassigned"].append(member_data)
            else:
                hierarchy["companies"][company]["unassigned"].append(member_data)
        else:
            hierarchy["unassigned"].append(member_data)
    
    # Sort command staff by rank/billet importance
    def sort_key(m):
        billet = (m.get("billet") or "").lower()
        if "commander" in billet or "commanding" in billet: return 0
        if "xo" in billet or "executive" in billet: return 1
        if "sergeant major" in billet: return 2
        if "first sergeant" in billet: return 3
        return 10
    
    hierarchy["command_staff"].sort(key=sort_key)
    
    return hierarchy

@api_router.get("/roster/{user_id}")
async def get_member_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get a member's full public profile."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Member not found")
    # Sanitize: hide email from non-admins viewing other profiles
    if current_user["id"] != user_id and current_user.get("role") != "admin":
        user.pop("email", None)
    return user_to_response(user)

@api_router.put("/profile")
async def update_own_profile(profile_data: ProfileSelfUpdate, current_user: dict = Depends(get_current_user)):
    """Member edits their own profile (limited fields)."""
    update_dict = {k: v for k, v in profile_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_dict})
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password_hash": 0})
    return user_to_response(updated)

# ============================================================================
# ADMIN PROFILE & HISTORY MANAGEMENT
# ============================================================================

@api_router.put("/admin/users/{user_id}/profile")
async def admin_update_profile(user_id: str, profile_data: AdminProfileUpdate, current_user: dict = Depends(get_current_admin)):
    """Admin edits any member's full profile."""
    update_dict = {k: v for k, v in profile_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Profile updated successfully"}

@api_router.post("/admin/import-users", response_model=UserImportResponse)
async def import_users_from_google_sheet(payload: UserImportRequest, current_user: dict = Depends(get_current_admin)):
    spreadsheet_id = parse_spreadsheet_id(payload.spreadsheetId, payload.spreadsheetUrl)
    if not spreadsheet_id:
        raise HTTPException(status_code=400, detail="Provide a valid spreadsheetId or spreadsheetUrl")

    try:
        resolved_sheet_name, values = await fetch_sheet_rows(spreadsheet_id, payload.sheetName)
    except GoogleSheetsImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    headers = values[0]
    field_mapping = build_field_mapping(headers, payload.fieldMapping)

    if "email" not in field_mapping and "discord_id" not in field_mapping:
        raise HTTPException(
            status_code=400,
            detail="Unable to map required identifiers. Include an email or discord_id column (or provide fieldMapping).",
        )

    report = UserImportResponse(
        sheet_name=resolved_sheet_name,
        field_mapping={field: headers[idx] for field, idx in field_mapping.items()},
    )

    for row_index, row in enumerate(values[1:], start=2):
        mapped = row_to_mapped_fields(row, field_mapping)
        identifier = mapped.get("email") or mapped.get("discord_id") or mapped.get("username")

        if not mapped.get("email") and not mapped.get("discord_id"):
            report.skipped += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action="skipped",
                    message="Missing required identifier (email or discord_id)",
                    identifier=identifier,
                )
            )
            continue

        try:
            action, resolved_identifier = await upsert_user_from_import(mapped)
            if action == "created":
                report.imported += 1
            else:
                report.updated += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action=action,
                    message=f"User {action} successfully",
                    identifier=resolved_identifier,
                )
            )
        except Exception as exc:
            report.errors += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action="error",
                    message=str(exc),
                    identifier=identifier,
                )
            )

    return report

@api_router.post("/admin/users/{user_id}/mission-history")
async def add_mission_history(user_id: str, entry: MissionHistoryEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"mission_history": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Mission history added", "entry": entry_dict}

@api_router.delete("/admin/users/{user_id}/mission-history/{entry_id}")
async def delete_mission_history(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"mission_history": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Mission history entry removed"}

@api_router.post("/admin/users/{user_id}/training-history")
async def add_training_history(user_id: str, entry: TrainingHistoryEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"training_history": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Training history added", "entry": entry_dict}

@api_router.delete("/admin/users/{user_id}/training-history/{entry_id}")
async def delete_training_history(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"training_history": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Training history entry removed"}

@api_router.post("/admin/users/{user_id}/awards")
async def add_award(user_id: str, entry: AwardEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"awards": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Award added", "entry": entry_dict}

@api_router.delete("/admin/users/{user_id}/awards/{entry_id}")
async def delete_award(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"awards": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Award removed"}

# ============================================================================
# USER MANAGEMENT (ADMIN ONLY)
# ============================================================================

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [user_to_response(u) for u in users]

class UserUpdate(BaseModel):
    role: Optional[str] = None
    rank: Optional[str] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None
    squad: Optional[str] = None

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(get_current_admin)):
    update_dict = {k: v for k, v in user_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================

@api_router.get("/search")
async def search_content(q: str, current_user: dict = Depends(get_current_user)):
    """Search operations and discussions by title/content."""
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")
    escaped = re.escape(q)
    regex = {"$regex": escaped, "$options": "i"}
    ops = await db.operations.find(
        {"$or": [{"title": regex}, {"description": regex}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    discs = await db.discussions.find(
        {"$or": [{"title": regex}, {"content": regex}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return {"operations": ops, "discussions": discs}

# ============================================================================
# MEMBER OF THE WEEK ENDPOINTS
# ============================================================================

@api_router.get("/member-of-the-week")
async def get_member_of_the_week():
    doc = await db.member_of_the_week.find_one({"id": "current"}, {"_id": 0})
    if not doc:
        return None
    return doc

@api_router.put("/admin/member-of-the-week")
async def set_member_of_the_week(data: dict, current_user: dict = Depends(get_current_admin)):
    user_id = data.get("user_id")
    reason = data.get("reason", "")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    member = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    motw = {
        "id": "current",
        "user_id": user_id,
        "username": member.get("username", "Unknown"),
        "reason": reason,
        "avatar_url": member.get("avatar_url", ""),
        "rank": member.get("rank", ""),
        "set_at": datetime.now(timezone.utc).isoformat()
    }
    await db.member_of_the_week.replace_one({"id": "current"}, motw, upsert=True)
    return motw

@api_router.delete("/admin/member-of-the-week")
async def clear_member_of_the_week(current_user: dict = Depends(get_current_admin)):
    await db.member_of_the_week.delete_one({"id": "current"})
    return {"message": "Member of the Week cleared"}

# ============================================================================
# UNIT HISTORY ENDPOINTS
# ============================================================================

@api_router.get("/unit-history")
async def get_unit_history():
    entries = await db.unit_history.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return entries

@api_router.post("/admin/unit-history")
async def create_history_entry(entry_data: HistoryEntryCreate, current_user: dict = Depends(get_current_admin)):
    entry = HistoryEntry(
        **entry_data.model_dump()
    )
    await db.unit_history.insert_one(entry.model_dump())
    result = entry.model_dump()
    result.pop("_id", None)
    return result

@api_router.put("/admin/unit-history/{entry_id}")
async def update_history_entry(entry_id: str, entry_data: HistoryEntryCreate, current_user: dict = Depends(get_current_admin)):
    update_dict = entry_data.model_dump()
    result = await db.unit_history.update_one(
        {"id": entry_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"message": "History entry updated successfully"}

@api_router.delete("/admin/unit-history/{entry_id}")
async def delete_history_entry(entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.unit_history.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"message": "History entry deleted successfully"}

# ============================================================================
# UNIT TAGS MANAGEMENT (Admin configurable options)
# ============================================================================

@api_router.get("/unit-tags")
async def get_unit_tags(current_user: dict = Depends(get_current_user)):
    """
    Get all available unit tags (ranks, companies, platoons, squads, billets, specializations).
    Combines predefined defaults with admin-added custom tags.
    """
    # Get existing tags from database
    tags_doc = await db.unit_tags.find_one({"id": "unit_tags"}, {"_id": 0})
    
    # Defaults that are always available
    defaults = {
        "ranks": ["Private", "Private First Class", "Specialist", "Corporal", "Sergeant", "Staff Sergeant", "Sergeant First Class", "Master Sergeant", "First Sergeant", "Sergeant Major", "Second Lieutenant", "First Lieutenant", "Captain", "Major", "Lieutenant Colonel", "Colonel"],
        "companies": ["HQ", "Alpha", "Bravo", "Charlie", "Delta"],
        "platoons": ["1st Platoon", "2nd Platoon", "3rd Platoon", "Weapons Platoon", "HQ Platoon"],
        "squads": ["1st Squad", "2nd Squad", "3rd Squad", "Weapons Squad"],
        "billets": ["Commanding Officer", "Executive Officer", "First Sergeant", "Platoon Leader", "Platoon Sergeant", "Squad Leader", "Team Leader", "Rifleman", "Automatic Rifleman", "Grenadier", "Designated Marksman", "Combat Medic", "RTO", "Forward Observer"],
        "specializations": ["Infantry", "Reconnaissance", "Armor", "Artillery", "Engineering", "Medical", "Communications", "Logistics", "Aviation"],
        "statuses": ["recruit", "active", "reserve", "staff", "command", "inactive"]
    }
    
    if tags_doc:
        # Merge custom tags with defaults (preserving custom additions)
        for key in defaults:
            if key in tags_doc:
                # Combine defaults with custom, remove duplicates while preserving order
                combined = defaults[key] + [t for t in tags_doc[key] if t not in defaults[key]]
                defaults[key] = combined
    
    return defaults

@api_router.put("/admin/unit-tags")
async def update_unit_tags(tags: dict, current_user: dict = Depends(get_current_admin)):
    """
    Add custom tags to the unit configuration.
    These extend (not replace) the default options.
    """
    tags["id"] = "unit_tags"
    await db.unit_tags.update_one(
        {"id": "unit_tags"},
        {"$set": tags},
        upsert=True
    )
    return {"message": "Unit tags updated successfully"}

# ============================================================================
# OPERATION RSVP DETAILS (Enhanced roster view)
# ============================================================================

@api_router.get("/operations/{operation_id}/roster")
async def get_operation_roster(operation_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get detailed RSVP roster for an operation, including member details (rank, specialization, etc.)
    """
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    rsvps = operation.get("rsvps", [])
    user_ids = [r["user_id"] for r in rsvps]
    
    # Fetch full member details for all RSVPed users
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(len(user_ids))
    
    user_map = {u["id"]: u for u in users}
    
    # Build enriched RSVP list
    enriched_rsvps = {
        "attending": [],
        "tentative": [],
        "waitlisted": []
    }
    
    for r in rsvps:
        user_data = user_map.get(r["user_id"], {})
        enriched = {
            "user_id": r["user_id"],
            "username": r.get("username", user_data.get("username", "Unknown")),
            "status": r["status"],
            "role_notes": r.get("role_notes", ""),
            "rsvp_time": r.get("rsvp_time", ""),
            # Member details
            "rank": user_data.get("rank"),
            "specialization": user_data.get("specialization"),
            "squad": user_data.get("squad"),
            "company": user_data.get("company"),
            "platoon": user_data.get("platoon"),
            "billet": user_data.get("billet"),
            "avatar_url": user_data.get("avatar_url"),
            "member_status": user_data.get("status", "recruit")
        }
        
        if r["status"] == "attending":
            enriched_rsvps["attending"].append(enriched)
        elif r["status"] == "tentative":
            enriched_rsvps["tentative"].append(enriched)
        elif r["status"] == "waitlisted":
            enriched_rsvps["waitlisted"].append(enriched)
    
    return {
        "operation_id": operation_id,
        "title": operation.get("title", ""),
        "date": operation.get("date", ""),
        "time": operation.get("time", ""),
        "max_participants": operation.get("max_participants"),
        "rsvps": enriched_rsvps,
        "counts": {
            "attending": len(enriched_rsvps["attending"]),
            "tentative": len(enriched_rsvps["tentative"]),
            "waitlisted": len(enriched_rsvps["waitlisted"]),
            "total": len(rsvps)
        }
    }

# ============================================================================
# INTEL / BRIEFING SYSTEM
# ============================================================================

class IntelBriefing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    category: str  # intel_update, commanders_intent, operational_order, after_action_report, training_bulletin
    classification: str = "routine"  # routine, priority, immediate, flash
    tags: List[str] = Field(default_factory=list)
    author_id: str = ""
    author_name: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class IntelBriefingCreate(BaseModel):
    title: str
    content: str
    category: str
    classification: str = "routine"
    tags: List[str] = Field(default_factory=list)

class IntelBriefingUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    classification: Optional[str] = None
    tags: Optional[List[str]] = None

def _fix_dates(b):
    if isinstance(b.get("created_at"), str):
        b["created_at"] = datetime.fromisoformat(b["created_at"])
    if b.get("updated_at") and isinstance(b["updated_at"], str):
        b["updated_at"] = datetime.fromisoformat(b["updated_at"])

@api_router.get("/intel")
async def get_intel_briefings(
    category: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    classification: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if category:
        query["category"] = category
    if classification:
        query["classification"] = classification
    if tag:
        query["tags"] = tag
    if search:
        safe = re.escape(search)[:100]
        query["$or"] = [
            {"title": {"$regex": safe, "$options": "i"}},
            {"content": {"$regex": safe, "$options": "i"}}
        ]
    briefings = await db.intel_briefings.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Batch-load acknowledgment counts + user status
    b_ids = [b["id"] for b in briefings]
    ack_pipeline = [
        {"$match": {"briefing_id": {"$in": b_ids}}},
        {"$group": {"_id": "$briefing_id", "count": {"$sum": 1}}}
    ]
    ack_counts = {r["_id"]: r["count"] for r in await db.intel_acknowledgments.aggregate(ack_pipeline).to_list(500)}
    user_acks = set()
    async for a in db.intel_acknowledgments.find({"briefing_id": {"$in": b_ids}, "user_id": current_user["id"]}, {"briefing_id": 1, "_id": 0}):
        user_acks.add(a["briefing_id"])
    for b in briefings:
        _fix_dates(b)
        b["ack_count"] = ack_counts.get(b["id"], 0)
        b["user_acknowledged"] = b["id"] in user_acks
    return briefings

@api_router.get("/intel/tags")
async def get_intel_tags(current_user: dict = Depends(get_current_user)):
    pipeline = [{"$unwind": "$tags"}, {"$group": {"_id": "$tags"}}, {"$sort": {"_id": 1}}]
    results = await db.intel_briefings.aggregate(pipeline).to_list(200)
    return [r["_id"] for r in results]

@api_router.get("/intel/{briefing_id}")
async def get_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    briefing = await db.intel_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if not briefing:
        raise HTTPException(status_code=404, detail="Briefing not found")
    _fix_dates(briefing)
    ack_count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    user_ack = await db.intel_acknowledgments.find_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    briefing["ack_count"] = ack_count
    briefing["user_acknowledged"] = user_ack is not None
    return briefing

@api_router.post("/intel/{briefing_id}/acknowledge")
async def acknowledge_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    exists = await db.intel_briefings.find_one({"id": briefing_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Briefing not found")
    already = await db.intel_acknowledgments.find_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    if already:
        return {"message": "Already acknowledged", "ack_count": await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})}
    doc = {
        "briefing_id": briefing_id,
        "user_id": current_user["id"],
        "username": current_user["username"],
        "rank": current_user.get("rank", ""),
        "company": current_user.get("company", ""),
        "acknowledged_at": datetime.now(timezone.utc).isoformat()
    }
    await db.intel_acknowledgments.insert_one(doc)
    count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    return {"message": "Acknowledged", "ack_count": count}

@api_router.delete("/intel/{briefing_id}/acknowledge")
async def unacknowledge_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    await db.intel_acknowledgments.delete_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    return {"message": "Unacknowledged", "ack_count": count}

@api_router.get("/admin/intel/{briefing_id}/acknowledgments")
async def get_briefing_acknowledgments(briefing_id: str, current_user: dict = Depends(get_current_admin)):
    acks = await db.intel_acknowledgments.find({"briefing_id": briefing_id}, {"_id": 0}).sort("acknowledged_at", -1).to_list(500)
    for a in acks:
        if isinstance(a.get("acknowledged_at"), str):
            a["acknowledged_at"] = datetime.fromisoformat(a["acknowledged_at"])
    return acks

@api_router.post("/admin/intel")
async def create_intel_briefing(data: IntelBriefingCreate, current_user: dict = Depends(get_current_admin)):
    briefing_dict = data.model_dump()
    briefing_dict["id"] = str(uuid.uuid4())
    briefing_dict["author_id"] = current_user["id"]
    briefing_dict["author_name"] = current_user["username"]
    briefing_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    briefing_dict["updated_at"] = None
    await db.intel_briefings.insert_one(briefing_dict)
    briefing_dict.pop("_id", None)
    briefing_dict["created_at"] = datetime.fromisoformat(briefing_dict["created_at"])
    return briefing_dict

@api_router.put("/admin/intel/{briefing_id}")
async def update_intel_briefing(briefing_id: str, data: IntelBriefingUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.intel_briefings.find_one({"id": briefing_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Briefing not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.intel_briefings.update_one({"id": briefing_id}, {"$set": updates})
    updated = await db.intel_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if updated.get("updated_at") and isinstance(updated["updated_at"], str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    return updated

@api_router.delete("/admin/intel/{briefing_id}")
async def delete_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.intel_briefings.delete_one({"id": briefing_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Briefing not found")
    # Also remove acknowledgments
    await db.intel_acknowledgments.delete_many({"briefing_id": briefing_id})
    return {"message": "Briefing deleted"}

# ============================================================================
# CAMPAIGN / THEATER MAP SYSTEM
# ============================================================================

class CampaignObjective(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: str = "pending"  # pending, in_progress, complete, failed
    grid_ref: str = ""
    assigned_to: str = ""
    priority: str = "secondary"  # primary, secondary, tertiary
    notes: str = ""

class CampaignPhase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: str = "planned"  # planned, active, complete
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    theater: str = ""
    status: str = "planning"  # planning, active, complete, archived
    phases: List[dict] = Field(default_factory=list)
    objectives: List[dict] = Field(default_factory=list)
    situation: str = ""
    commander_notes: str = ""

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    theater: Optional[str] = None
    status: Optional[str] = None
    phases: Optional[List[dict]] = None
    objectives: Optional[List[dict]] = None
    situation: Optional[str] = None
    commander_notes: Optional[str] = None

@api_router.get("/campaigns")
async def get_campaigns(current_user: dict = Depends(get_current_user)):
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for c in campaigns:
        _fix_dates(c)
    return campaigns

@api_router.get("/campaigns/active")
async def get_active_campaign(current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"status": "active"}, {"_id": 0})
    if not campaign:
        return None
    _fix_dates(campaign)
    return campaign

@api_router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _fix_dates(campaign)
    return campaign

@api_router.post("/admin/campaigns")
async def create_campaign(data: CampaignCreate, current_user: dict = Depends(get_current_admin)):
    d = data.model_dump()
    d["id"] = str(uuid.uuid4())
    d["created_by"] = current_user["id"]
    d["created_at"] = datetime.now(timezone.utc).isoformat()
    d["updated_at"] = None
    # Ensure every phase/objective has an id
    for p in d.get("phases", []):
        if not p.get("id"):
            p["id"] = str(uuid.uuid4())
    for o in d.get("objectives", []):
        if not o.get("id"):
            o["id"] = str(uuid.uuid4())
    await db.campaigns.insert_one(d)
    d.pop("_id", None)
    _fix_dates(d)
    return d

@api_router.put("/admin/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, data: CampaignUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.campaigns.find_one({"id": campaign_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    # Ensure ids on phases/objectives
    for p in updates.get("phases", []):
        if not p.get("id"):
            p["id"] = str(uuid.uuid4())
    for o in updates.get("objectives", []):
        if not o.get("id"):
            o["id"] = str(uuid.uuid4())
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    updated = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    _fix_dates(updated)
    return updated

@api_router.delete("/admin/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.campaigns.delete_one({"id": campaign_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"message": "Campaign deleted"}

# ============================================================================
# RECRUITMENT PIPELINE
# ============================================================================

class OpenBillet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    company: Optional[str] = None
    platoon: Optional[str] = None
    description: str
    requirements: Optional[str] = None
    is_open: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OpenBilletUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    platoon: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    is_open: Optional[bool] = None

class PublicApplicationCreate(BaseModel):
    billet_id: Optional[str] = None
    applicant_name: str
    applicant_email: EmailStr
    discord_username: Optional[str] = None
    timezone: Optional[str] = None
    experience: str
    availability: str
    why_join: str

class ApplicationReviewUpdate(BaseModel):
    status: Optional[Literal["pending", "reviewing", "accepted", "rejected"]] = None
    admin_notes: Optional[str] = None

@api_router.get("/recruitment/billets")
async def get_open_billets():
    """Get all open billets for the public recruitment page."""
    billets = await db.open_billets.find(
        {"is_open": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return billets

@api_router.get("/admin/recruitment/billets")
async def get_all_billets(current_user: dict = Depends(get_current_admin)):
    """Get all billets (open and closed) for admin management."""
    billets = await db.open_billets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return billets

@api_router.post("/admin/recruitment/billets")
async def create_billet(billet: OpenBillet, current_user: dict = Depends(get_current_admin)):
    """Create a new open billet."""
    billet_dict = billet.model_dump()
    billet_dict["created_at"] = billet_dict["created_at"].isoformat()
    await db.open_billets.insert_one(billet_dict)
    return {"message": "Billet created", "id": billet.id}

@api_router.put("/admin/recruitment/billets/{billet_id}")
async def update_billet(billet_id: str, updates: OpenBilletUpdate, current_user: dict = Depends(get_current_admin)):
    """Update an existing billet."""
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.open_billets.update_one(
        {"id": billet_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Billet not found")
    return {"message": "Billet updated"}

@api_router.delete("/admin/recruitment/billets/{billet_id}")
async def delete_billet(billet_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete a billet."""
    result = await db.open_billets.delete_one({"id": billet_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Billet not found")
    return {"message": "Billet deleted"}

@api_router.post("/recruitment/apply")
async def submit_application(application: PublicApplicationCreate):
    """Submit a new recruitment application (public endpoint)."""
    app_dict = application.model_dump()
    app_dict["id"] = str(uuid.uuid4())
    app_dict["applicant_email"] = normalize_email(app_dict["applicant_email"])
    app_dict["status"] = "pending"
    app_dict["admin_notes"] = None
    app_dict["submitted_at"] = datetime.now(timezone.utc).isoformat()
    app_dict["reviewed_at"] = None
    app_dict["reviewed_by"] = None
    await db.applications.insert_one(app_dict)
    return {"message": "Application submitted successfully", "id": app_dict["id"]}

@api_router.get("/admin/recruitment/applications")
async def get_applications(status: Optional[str] = None, current_user: dict = Depends(get_current_admin)):
    """Get all applications, optionally filtered by status."""
    query = {}
    if status:
        query["status"] = status
    applications = await db.applications.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    return applications

@api_router.get("/admin/recruitment/applications/{application_id}")
async def get_application(application_id: str, current_user: dict = Depends(get_current_admin)):
    """Get a single application by ID."""
    app = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app

@api_router.put("/admin/recruitment/applications/{application_id}")
async def update_application(application_id: str, updates: ApplicationReviewUpdate, current_user: dict = Depends(get_current_admin)):
    """Update application status and notes."""
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_dict["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["reviewed_by"] = current_user["username"]
    result = await db.applications.update_one(
        {"id": application_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"message": "Application updated"}

@api_router.get("/admin/recruitment/stats")
async def get_recruitment_stats(current_user: dict = Depends(get_current_admin)):
    """Get recruitment pipeline statistics."""
    total = await db.applications.count_documents({})
    pending = await db.applications.count_documents({"status": "pending"})
    reviewing = await db.applications.count_documents({"status": "reviewing"})
    accepted = await db.applications.count_documents({"status": "accepted"})
    rejected = await db.applications.count_documents({"status": "rejected"})
    open_billets = await db.open_billets.count_documents({"is_open": True})
    
    return {
        "total_applications": total,
        "pending": pending,
        "reviewing": reviewing,
        "accepted": accepted,
        "rejected": rejected,
        "open_billets": open_billets
    }

# ============================================================================
# RECRUIT ENDPOINTS (For authenticated recruits)
# ============================================================================

class RecruitApplication(BaseModel):
    """Application submitted by an authenticated recruit"""
    billet_id: Optional[str] = None
    discord_username: Optional[str] = None
    timezone: Optional[str] = None
    experience: str
    availability: str
    why_join: str

@api_router.get("/recruit/my-application")
async def get_my_application(current_user: dict = Depends(get_current_user)):
    """Get the current recruit's application status."""
    # Find application by user's email
    app = await db.applications.find_one(
        {"applicant_email": current_user["email"]},
        {"_id": 0}
    )
    return app  # Returns null if no application exists

@api_router.post("/recruit/apply")
async def recruit_submit_application(
    application: RecruitApplication,
    current_user: dict = Depends(get_current_user)
):
    """Submit application as an authenticated recruit (linked to account)."""
    # Check if user already has an application
    existing = await db.applications.find_one({"applicant_email": current_user["email"]})
    if existing:
        raise HTTPException(status_code=400, detail="You have already submitted an application")
    
    # Create application linked to user account
    app_dict = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],  # Link to user account
        "applicant_name": current_user["username"],
        "applicant_email": current_user["email"],
        "billet_id": application.billet_id,
        "discord_username": application.discord_username or current_user.get("discord_username"),
        "timezone": application.timezone,
        "experience": application.experience,
        "availability": application.availability,
        "why_join": application.why_join,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "admin_notes": None,
        "reviewed_at": None,
        "reviewed_by": None
    }
    
    await db.applications.insert_one(app_dict)
    
    # Update user's discord_username if provided
    if application.discord_username:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"discord_username": application.discord_username}}
        )
    
    return {"message": "Application submitted successfully", "id": app_dict["id"]}

# ============================================================================
# MISC ENDPOINTS
# ============================================================================

@api_router.get("/")
async def root():
    return {"message": "25th Infantry Division API", "status": "operational"}

# Include the router in the main app
app.include_router(api_router)

# Serve uploaded files at /api/uploads/
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
cors_origins = [o.strip() for o in cors_origins_raw.split(',') if o.strip() and o.strip() != '*']

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins if cors_origins else ["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
