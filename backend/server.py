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
import hashlib
import time as _time_mod
import urllib.parse
import smtplib
import httpx
from pathlib import Path
from email.message import EmailMessage
from pydantic import BaseModel, Field, EmailStr, ConfigDict, TypeAdapter
from typing import List, Optional, Literal, Dict, Any
import uuid
import asyncio
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
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    is_public_recruiting: bool = False
    activity_state: Literal["planned", "ongoing", "completed"] = "planned"
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
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    is_public_recruiting: bool = False
    activity_state: Literal["planned", "ongoing", "completed"] = "planned"

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
    model_config = ConfigDict(populate_by_name=True)
    spreadsheet_id: Optional[str] = Field(default=None, alias="spreadsheetId")
    spreadsheet_url: Optional[str] = Field(default=None, alias="spreadsheetUrl")
    sheet_name: Optional[str] = Field(default=None, alias="sheetName")
    field_mapping: Optional[Dict[str, str]] = Field(default=None, alias="fieldMapping")

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

    # If we only have an email (no discord_id) and no existing account, avoid creating
    # an unclaimable pre-registered user with a random password and is_active=False.
    # Skipping creation here allows the user to register normally via /auth/register.
    if email and not discord_id:
        return "skipped_missing_discord", email

    generated_email = email or f"imported_discord_{discord_id}@25thid.local"
    generated_username = (
        update_fields.get("username")
        or update_fields.get("discord_username")
        or f"PreReg_{str(uuid.uuid4())[:8]}"
    )

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
    await upsert_map_event("operation", doc, doc["id"])
    
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

    # Read all bytes first so we can write to both disk and MongoDB atomically.
    chunks = []
    written = 0
    try:
        while chunk := file.file.read(1024 * 1024):
            written += len(chunk)
            if written > max_size:
                raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
            chunks.append(chunk)
    except HTTPException:
        raise
    finally:
        await file.close()

    file_bytes = b"".join(chunks)

    # Write to the local uploads directory (served via StaticFiles for speed).
    try:
        with open(file_path, "wb") as buf:
            buf.write(file_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    # Persist to MongoDB so the file can be restored after a container restart.
    try:
        await db.uploads.update_one(
            {"filename": unique_name},
            {"$set": {
                "filename": unique_name,
                "data": file_bytes,
                "content_type": file.content_type or "application/octet-stream",
                "original_name": file.filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as exc:
        # Non-fatal: file is already on disk; log and continue.
        logger.warning(f"Could not persist upload to MongoDB (file still served from disk): {exc}")

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
    await remove_map_event("operation", operation_id)
    return {"message": "Operation deleted successfully"}

@api_router.put("/admin/operations/{operation_id}")
async def update_operation(operation_id: str, operation_data: OperationCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.operations.update_one(
        {"id": operation_id},
        {"$set": operation_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found")
    updated_op = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if updated_op:
        await upsert_map_event("operation", updated_op, operation_id)
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
    visibility_scope: Literal["members", "admin_only"] = "members"
    tags: List[str] = Field(default_factory=list)
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    author_id: str = ""
    author_name: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class IntelBriefingCreate(BaseModel):
    title: str
    content: str
    category: str
    classification: str = "routine"
    visibility_scope: Literal["members", "admin_only"] = "members"
    tags: List[str] = Field(default_factory=list)
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None

class IntelBriefingUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    classification: Optional[str] = None
    visibility_scope: Optional[Literal["members", "admin_only"]] = None
    tags: Optional[List[str]] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None

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
    if current_user.get("role") != "admin":
        query["visibility_scope"] = {"$ne": "admin_only"}
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
    pipeline = []
    if current_user.get("role") != "admin":
        pipeline.append({"$match": {"visibility_scope": {"$ne": "admin_only"}}})
    pipeline.extend([
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags"}},
        {"$sort": {"_id": 1}},
    ])
    results = await db.intel_briefings.aggregate(pipeline).to_list(200)
    return [r["_id"] for r in results]

@api_router.get("/intel/{briefing_id}")
async def get_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    briefing = await db.intel_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if not briefing:
        raise HTTPException(status_code=404, detail="Briefing not found")
    if current_user.get("role") != "admin" and briefing.get("visibility_scope") == "admin_only":
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
    await upsert_map_event("intel", briefing_dict, briefing_dict["id"])
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
    if updated:
        await upsert_map_event("intel", updated, briefing_id)
    return updated

@api_router.delete("/admin/intel/{briefing_id}")
async def delete_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.intel_briefings.delete_one({"id": briefing_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Briefing not found")
    # Also remove acknowledgments
    await db.intel_acknowledgments.delete_many({"briefing_id": briefing_id})
    await remove_map_event("intel", briefing_id)
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
    # Coordinate system used for grid_ref.
    # Supported: none | wgs84 | mgrs | utm | gars | bng | lv95 | lv03 | hex
    grid_ref_type: str = "none"
    assigned_to: str = ""
    priority: str = "secondary"  # primary, secondary, tertiary
    notes: str = ""
    region_label: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    linked_operation_id: Optional[str] = None
    is_public_recruiting: bool = False

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
    lat: Optional[float] = None
    lng: Optional[float] = None
    region: str = ""
    map_description: str = ""
    threat_level: str = "medium"  # low, medium, high, critical

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    theater: Optional[str] = None
    status: Optional[str] = None
    phases: Optional[List[dict]] = None
    objectives: Optional[List[dict]] = None
    situation: Optional[str] = None
    commander_notes: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    region: Optional[str] = None
    map_description: Optional[str] = None
    threat_level: Optional[str] = None

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
    await upsert_map_event("campaign", d, d["id"])
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
    if updated:
        await upsert_map_event("campaign", updated, campaign_id)
    _fix_dates(updated)
    return updated

@api_router.delete("/admin/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.campaigns.delete_one({"id": campaign_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await remove_map_event("campaign", campaign_id)
    return {"message": "Campaign deleted"}

@api_router.get("/map/overlays")
async def get_map_overlays(current_user: dict = Depends(get_current_user)):
    """Unified conflict map overlays for objectives, operations, and geotagged intel.

    Keeps operations as a first-class overlay while allowing incremental layer expansion.
    """
    campaigns = await db.campaigns.find({}, {"_id": 0, "id": 1, "name": 1, "theater": 1, "status": 1, "objectives": 1}).to_list(200)
    operations = await db.operations.find({}, {"_id": 0}).to_list(2000)

    intel_query = {}
    if current_user.get("role") != "admin":
        intel_query["visibility_scope"] = {"$ne": "admin_only"}
    intel_briefings = await db.intel_briefings.find(intel_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    objective_markers = []
    for campaign in campaigns:
        for obj in campaign.get("objectives", []):
            lat = obj.get("lat")
            lng = obj.get("lng")
            if lat is None or lng is None:
                continue
            objective_markers.append({
                "id": obj.get("id") or str(uuid.uuid4()),
                "source_kind": "objective",
                "campaign_id": campaign.get("id"),
                "campaign_name": campaign.get("name"),
                "theater": campaign.get("theater"),
                "campaign_status": campaign.get("status"),
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "region_label": obj.get("region_label") or obj.get("grid_ref", ""),
                "grid_ref": obj.get("grid_ref", ""),
                "severity": obj.get("severity", "medium"),
                "status": obj.get("status", "pending"),
                "priority": obj.get("priority", "secondary"),
                "lat": lat,
                "lng": lng,
                "linked_operation_id": obj.get("linked_operation_id"),
                "is_public_recruiting": bool(obj.get("is_public_recruiting", False)),
            })

    operation_markers = []
    for op in operations:
        lat = op.get("lat")
        lng = op.get("lng")
        if lat is None or lng is None:
            continue
        operation_markers.append({
            "id": op.get("id"),
            "source_kind": "operation",
            "name": op.get("title"),
            "description": op.get("description", ""),
            "severity": op.get("severity", "medium"),
            "status": op.get("activity_state", "planned"),
            "operation_type": op.get("operation_type"),
            "date": op.get("date"),
            "time": op.get("time"),
            "campaign_id": op.get("campaign_id"),
            "objective_id": op.get("objective_id"),
            "theater": op.get("theater"),
            "region_label": op.get("region_label") or op.get("grid_ref", ""),
            "grid_ref": op.get("grid_ref", ""),
            "lat": lat,
            "lng": lng,
            "is_public_recruiting": bool(op.get("is_public_recruiting", False)),
        })

    intel_markers = []
    for intel in intel_briefings:
        lat = intel.get("lat")
        lng = intel.get("lng")
        if lat is None or lng is None:
            continue
        intel_markers.append({
            "id": intel.get("id"),
            "source_kind": "intel",
            "name": intel.get("title"),
            "description": intel.get("content", "")[:320],
            "severity": intel.get("severity") or "medium",
            "status": intel.get("classification", "routine"),
            "category": intel.get("category"),
            "classification": intel.get("classification"),
            "visibility_scope": intel.get("visibility_scope", "members"),
            "campaign_id": intel.get("campaign_id"),
            "objective_id": intel.get("objective_id"),
            "operation_id": intel.get("operation_id"),
            "theater": intel.get("theater"),
            "region_label": intel.get("region_label") or intel.get("grid_ref", ""),
            "grid_ref": intel.get("grid_ref", ""),
            "lat": lat,
            "lng": lng,
            "created_at": intel.get("created_at"),
        })

    return {
        "objectives": objective_markers,
        "operations": operation_markers,
        "intel": intel_markers,
        "events": [],
    }

@api_router.get("/map/events")
async def get_map_events(event_type: Optional[str] = None):
    """Get unified map events for the Global Threat Map. Includes internal + external events."""
    query = {}
    if event_type:
        query["type"] = event_type

    events = await db.map_events.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return {"events": events, "count": len(events)}


@api_router.get("/external-events")
async def get_external_events():
    """Get stored external threat events from the ingestion pipeline."""
    events = await db.external_events.find({}, {"_id": 0}).sort("ingested_at", -1).to_list(200)
    return {
        "events": events,
        "count": len(events),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "stored",
    }

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
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
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
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
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
        "campaign_id": application.campaign_id,
        "objective_id": application.objective_id,
        "operation_id": application.operation_id,
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


@api_router.get("/public/threat-map")
async def get_public_threat_map():
    """Sanitized world-building threat markers for public pages."""
    campaign_pipeline = [
        {
            "$match": {
                "objectives": {
                    "$elemMatch": {
                        "is_public_recruiting": True,
                        "lat": {"$ne": None},
                        "lng": {"$ne": None},
                    }
                }
            }
        },
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "theater": 1,
                "status": 1,
                "objectives": {
                    "$filter": {
                        "input": "$objectives",
                        "as": "obj",
                        "cond": {
                            "$and": [
                                {"$eq": ["$$obj.is_public_recruiting", True]},
                                {"$ne": ["$$obj.lat", None]},
                                {"$ne": ["$$obj.lng", None]},
                            ]
                        },
                    }
                },
            }
        },
    ]
    campaigns = await db.campaigns.aggregate(campaign_pipeline).to_list(200)
    operations = await db.operations.find(
        {"is_public_recruiting": True},
        {"_id": 0, "id": 1, "title": 1, "operation_type": 1, "date": 1, "time": 1}
    ).to_list(500)
    op_map = {o.get("id"): o for o in operations}

    markers = []
    for campaign in campaigns:
        for obj in campaign.get("objectives", []):
            lat = obj.get("lat")
            lng = obj.get("lng")
            # Defensive check in case of malformed data, though the aggregation already filters.
            if lat is None or lng is None or not obj.get("is_public_recruiting", False):
                continue
            obj_id = obj.get("id")
            if not obj_id:
                # Skip objectives without a persisted id to avoid unstable marker IDs
                continue
            linked_operation_id = obj.get("linked_operation_id")
            markers.append({
                "id": obj_id,
                "campaign_id": campaign.get("id"),
                "campaign_name": campaign.get("name"),
                "theater": campaign.get("theater"),
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "region_label": obj.get("region_label") or obj.get("grid_ref", ""),
                "severity": obj.get("severity", "medium"),
                "status": obj.get("status", "pending"),
                "lat": lat,
                "lng": lng,
                "linked_operation_id": linked_operation_id,
                "linked_operation": op_map.get(linked_operation_id),
                "is_public_recruiting": True,
            })

    return {"markers": markers}

# ============================================================================
# MAP EVENTS – Unified collection for map display
# ============================================================================

async def upsert_map_event(entity_type: str, entity: dict, entity_id: str):
    """Create or update a map_event when an operation, intel, or campaign is created/updated."""
    lat = entity.get("lat") or entity.get("latitude")
    lng = entity.get("lng") or entity.get("longitude")

    if lat is None or lng is None:
        return  # No coordinates, skip

    title = entity.get("title") or entity.get("name") or "Untitled"
    description = entity.get("description") or entity.get("content", "")
    if len(description) > 500:
        description = description[:500]

    threat_level = entity.get("severity") or entity.get("threat_level") or "medium"
    source = "internal"
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "id": f"me_{entity_type}_{entity_id}",
        "type": entity_type,
        "title": title,
        "description": description,
        "latitude": float(lat),
        "longitude": float(lng),
        "threat_level": threat_level,
        "source": source,
        "related_entity_id": entity_id,
        "updated_at": now,
        "metadata": {
            "entity_type": entity_type,
            "status": entity.get("status") or entity.get("activity_state") or entity.get("classification", ""),
            "campaign_id": entity.get("campaign_id", ""),
            "operation_type": entity.get("operation_type", ""),
            "category": entity.get("category", ""),
        },
    }

    await db.map_events.update_one(
        {"id": doc["id"]},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def remove_map_event(entity_type: str, entity_id: str):
    """Remove map_event when entity is deleted."""
    await db.map_events.delete_one({"id": f"me_{entity_type}_{entity_id}"})


async def backfill_map_events():
    """Backfill map_events from existing operations, intel, campaigns on startup."""
    valyu_logger = logging.getLogger("valyu")

    # Check each entity type independently so a partial backfill doesn't skip campaigns
    existing_types = set()
    async for doc in db.map_events.find({}, {"type": 1, "_id": 0}):
        existing_types.add(doc.get("type"))

    valyu_logger.info(f"Backfilling map_events – existing types: {existing_types}")

    if "operation" not in existing_types:
        ops = await db.operations.find({}, {"_id": 0}).to_list(2000)
        for op in ops:
            await upsert_map_event("operation", op, op.get("id", ""))

    if "intel" not in existing_types:
        intels = await db.intel_briefings.find({}, {"_id": 0}).to_list(1000)
        for intel in intels:
            await upsert_map_event("intel", intel, intel.get("id", ""))

    if "campaign" not in existing_types:
        campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(200)
        for camp in campaigns:
            camp_lat = camp.get("lat") or camp.get("latitude")
            camp_lng = camp.get("lng") or camp.get("longitude")
            if camp_lat and camp_lng:
                await upsert_map_event("campaign", camp, camp.get("id", ""))
            # Also create events for campaign objectives
            for obj in camp.get("objectives", []):
                if obj.get("lat") and obj.get("lng"):
                    obj_data = {**obj, "name": obj.get("name", "Objective"), "campaign_id": camp.get("id", "")}
                    await upsert_map_event("campaign", obj_data, obj.get("id", ""))

    valyu_logger.info("Map events backfill complete")

# ============================================================================
# GLOBAL THREAT MAP – VALYU-POWERED ENDPOINTS
# ============================================================================

VALYU_API_KEY = os.environ.get("VALYU_API_KEY", "")
VALYU_BASE_URL = "https://api.valyu.ai/v1"
# Cache TTL: 6 h default so we never hammer the API between restarts.
VALYU_CACHE_TTL_MINUTES = int(os.environ.get("VALYU_CACHE_TTL_MINUTES", 360))
# Background refresh: 6 h default – checks DB first, only calls API when needed.
VALYU_EVENT_REFRESH_MINUTES = int(os.environ.get("VALYU_EVENT_REFRESH_MINUTES", 360))
VALYU_RATE_LIMIT_SECONDS = int(os.environ.get("VALYU_RATE_LIMIT_SECONDS", 30))
VALYU_COUNTRY_CACHE_HOURS = int(os.environ.get("VALYU_COUNTRY_CACHE_HOURS", 24))
# Minimum number of recently-ingested Valyu events before we skip a refresh call.
VALYU_MIN_EVENTS_THRESHOLD = int(os.environ.get("VALYU_MIN_EVENTS_THRESHOLD", 20))
# How many days to keep events before pruning them from external_events.
EVENT_PRUNE_DAYS = int(os.environ.get("EVENT_PRUNE_DAYS", 15))
# OpenAI supplemental ingestion: at most once every N hours to keep costs low.
OPENAI_INGESTION_INTERVAL_HOURS = int(os.environ.get("OPENAI_INGESTION_INTERVAL_HOURS", 24))

# In-memory rate limiting and deduplication state
_valyu_last_call_time: float = 0.0
_valyu_pending_requests: Dict[str, asyncio.Task] = {}
_valyu_rate_lock = asyncio.Lock()

valyu_logger = logging.getLogger("valyu")

THREAT_QUERIES = [
    "breaking news conflict military",
    "geopolitical crisis tensions",
    "protest demonstration unrest",
    "natural disaster emergency",
    "earthquake tsunami volcano eruption",
    "terrorism attack security",
    "cyber attack breach",
    "diplomatic summit sanctions",
    "shipping attack piracy maritime",
    "missile strike airstrike bombing",
    "military deployment troops mobilization",
    "nuclear threat ballistic missile test",
    "Ukraine Russia frontline offensive",
    "Israel Hamas Gaza ceasefire offensive",
    "Yemen Houthi Red Sea shipping attacks",
    "Iran nuclear facilities escalation",
    "Taiwan China military exercises",
    "NATO military deployment buildup",
    "North Korea missile launch",
    "South China Sea military confrontation",
]

# ---- Keyword classifiers (ported from upstream event-classifier.ts) ----
CATEGORY_KEYWORDS = {
    "conflict": ["war", "battle", "fighting", "combat", "clash", "strike", "attack", "offensive", "invasion", "troops"],
    "protest": ["protest", "demonstration", "rally", "march", "riot", "unrest", "uprising"],
    "disaster": ["earthquake", "flood", "hurricane", "typhoon", "tsunami", "wildfire", "tornado", "volcanic", "disaster"],
    "diplomatic": ["summit", "treaty", "agreement", "diplomatic", "embassy", "negotiation", "sanctions"],
    "economic": ["economy", "trade", "tariff", "currency", "inflation", "recession", "market"],
    "terrorism": ["terrorist", "terrorism", "bomb", "explosion", "hostage", "extremist", "militant"],
    "cyber": ["cyber", "hack", "breach", "malware", "ransomware", "ddos", "phishing"],
    "health": ["pandemic", "epidemic", "outbreak", "virus", "disease", "vaccine"],
    "environmental": ["climate", "pollution", "environmental", "emission", "deforestation"],
    "military": ["military", "army", "navy", "air force", "missile", "nuclear", "weapons", "defense", "nato"],
    "crime": ["murder", "kidnapping", "shooting", "drug trafficking", "cartel", "gang", "crime"],
    "piracy": ["piracy", "pirate", "hijack", "maritime", "vessel seized", "ship attack"],
    "infrastructure": ["dam", "power grid", "blackout", "power outage", "pipeline", "infrastructure"],
    "commodities": ["food price", "commodity", "wheat", "food shortage", "agriculture", "famine"],
}

THREAT_KEYWORDS = {
    "critical": ["emergency", "imminent", "catastrophic", "mass casualty", "nuclear", "wmd", "crisis"],
    "high": ["severe", "major", "significant", "escalating", "dangerous", "alarming", "warning"],
    "medium": ["moderate", "developing", "ongoing", "tensions", "concern", "elevated"],
    "low": ["minor", "limited", "contained", "isolated", "localized", "stable"],
    "info": ["update", "report", "announcement", "statement", "analysis", "summary"],
}

# Large lookup of country → [lat, lng] for geocoding
COUNTRY_COORDS = {
    "Afghanistan": [33.93, 67.71], "Albania": [41.15, 20.17], "Algeria": [28.03, 1.66],
    "Angola": [-11.20, 17.87], "Argentina": [-38.42, -63.62], "Armenia": [40.07, 45.04],
    "Australia": [-25.27, 133.78], "Austria": [47.52, 14.55], "Azerbaijan": [40.14, 47.58],
    "Bangladesh": [23.68, 90.36], "Belarus": [53.71, 27.95], "Belgium": [50.50, 4.47],
    "Bolivia": [-16.29, -63.59], "Bosnia": [43.92, 17.68], "Brazil": [-14.24, -51.93],
    "Bulgaria": [42.73, 25.49], "Cambodia": [12.57, 104.99], "Cameroon": [7.37, 12.35],
    "Canada": [56.13, -106.35], "Chad": [15.45, 18.73], "Chile": [-35.68, -71.54],
    "China": [35.86, 104.20], "Colombia": [4.57, -74.30], "Congo": [-4.04, 21.76],
    "Cuba": [21.52, -77.78], "Cyprus": [35.13, 33.43], "Czech Republic": [49.82, 15.47],
    "Denmark": [56.26, 9.50], "Ecuador": [-1.83, -78.18], "Egypt": [26.82, 30.80],
    "Ethiopia": [9.15, 40.49], "Finland": [61.92, 25.75], "France": [46.23, 2.21],
    "Gaza": [31.35, 34.31], "Georgia": [42.32, 43.36], "Germany": [51.17, 10.45],
    "Ghana": [7.95, -1.02], "Greece": [39.07, 21.82], "Haiti": [18.97, -72.29],
    "Honduras": [15.20, -86.24], "Hungary": [47.16, 19.50], "India": [20.59, 78.96],
    "Indonesia": [-0.79, 113.92], "Iran": [32.43, 53.69], "Iraq": [33.22, 43.68],
    "Ireland": [53.14, -7.69], "Israel": [31.05, 34.85], "Italy": [41.87, 12.57],
    "Japan": [36.20, 138.25], "Jordan": [30.59, 36.24], "Kazakhstan": [48.02, 66.92],
    "Kenya": [-0.02, 37.91], "Kosovo": [42.60, 20.90], "Kuwait": [29.31, 47.48],
    "Kyrgyzstan": [41.20, 74.77], "Laos": [19.86, 102.50], "Latvia": [56.88, 24.60],
    "Lebanon": [33.85, 35.86], "Libya": [26.34, 17.23], "Lithuania": [55.17, 23.88],
    "Mali": [17.57, -3.99], "Mexico": [23.63, -102.55], "Moldova": [47.41, 28.37],
    "Mongolia": [46.86, 103.85], "Morocco": [31.79, -7.09], "Mozambique": [-18.67, 35.53],
    "Myanmar": [21.91, 95.96], "Nepal": [28.39, 84.12], "Netherlands": [52.13, 5.29],
    "New Zealand": [-40.90, 174.89], "Niger": [17.61, 8.08], "Nigeria": [9.08, 8.68],
    "North Korea": [40.34, 127.51], "Norway": [60.47, 8.47], "Oman": [21.47, 55.98],
    "Pakistan": [30.38, 69.35], "Palestine": [31.95, 35.23], "Panama": [8.54, -80.78],
    "Peru": [-9.19, -75.02], "Philippines": [12.88, 121.77], "Poland": [51.92, 19.15],
    "Portugal": [39.40, -8.22], "Qatar": [25.35, 51.18], "Romania": [45.94, 24.97],
    "Russia": [61.52, 105.32], "Rwanda": [-1.94, 29.87], "Saudi Arabia": [23.89, 45.08],
    "Senegal": [14.50, -14.45], "Serbia": [44.02, 21.01], "Somalia": [5.15, 46.20],
    "South Africa": [-30.56, 22.94], "South Korea": [35.91, 127.77],
    "South Sudan": [6.88, 31.31], "Spain": [40.46, -3.75], "Sri Lanka": [7.87, 80.77],
    "Sudan": [12.86, 30.22], "Sweden": [60.13, 18.64], "Switzerland": [46.82, 8.23],
    "Syria": [34.80, 38.99], "Taiwan": [23.70, 120.96], "Thailand": [15.87, 100.99],
    "Tunisia": [33.89, 9.54], "Turkey": [38.96, 35.24], "Turkmenistan": [38.97, 59.56],
    "Uganda": [1.37, 32.29], "Ukraine": [48.38, 31.17], "United Arab Emirates": [23.42, 53.85],
    "United Kingdom": [55.38, -3.44], "United States": [37.09, -95.71],
    "Uzbekistan": [41.38, 64.59], "Venezuela": [6.42, -66.59], "Vietnam": [14.06, 108.28],
    "Yemen": [15.55, 48.52], "Zimbabwe": [-19.02, 29.15],
}

# Pre-compiled word-boundary regex patterns for each country – built once at
# import time so that extract_country() pays no repeated compilation cost.
_COUNTRY_PATTERNS: dict[str, re.Pattern] = {
    country: re.compile(r'\b' + re.escape(country.lower()) + r'\b')
    for country in COUNTRY_COORDS
}


def classify_category(text):
    lower = text.lower()
    best, best_score = "conflict", 0
    for cat, kws in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best, best_score = cat, score
    return best


def classify_threat_level(text):
    lower = text.lower()
    for level in ["critical", "high", "medium", "low", "info"]:
        for kw in THREAT_KEYWORDS[level]:
            if kw in lower:
                return level
    return "medium"


def extract_country(text, title=None):
    """Extract the most prominently mentioned country from text.

    Strategy:
    1. If a *title* string is supplied, find all countries mentioned in it and
       return the one that appears earliest (smallest index) – the subject of a
       headline is almost always named first.
    2. Otherwise count how many times each country name appears in the full
       text and return the one with the highest count.  This prevents a story
       *about* Spain from being geocoded to Brazil just because Brazil is
       mentioned once in the body copy.

    Word-boundary matching (\\b) is used throughout to avoid false positives
    such as 'Austria' matching inside 'Australia' or 'Iran' inside 'Ukraine'.
    """
    if title:
        lower_title = title.lower()
        title_matches = []
        for country, coords in COUNTRY_COORDS.items():
            m = _COUNTRY_PATTERNS[country].search(lower_title)
            if m:
                title_matches.append((m.start(), country, coords))
        if title_matches:
            title_matches.sort(key=lambda x: x[0])
            _, best_country, coords = title_matches[0]
            return best_country, coords[0], coords[1]

    lower_text = text.lower()
    scores: dict[str, int] = {}
    for country, coords in COUNTRY_COORDS.items():
        count = len(_COUNTRY_PATTERNS[country].findall(lower_text))
        if count > 0:
            scores[country] = count

    if not scores:
        return None, None, None

    best_country = max(scores, key=scores.get)
    coords = COUNTRY_COORDS[best_country]
    return best_country, coords[0], coords[1]


def extract_keywords_from_text(text):
    lower = text.lower()
    all_kws = []
    for kws in CATEGORY_KEYWORDS.values():
        all_kws.extend(kws)
    for kws in THREAT_KEYWORDS.values():
        all_kws.extend(kws)
    found = [kw for kw in all_kws if kw in lower]
    return list(set(found))[:10]


# ---------------------------------------------------------------------------
# Valyu caching & rate-limiting helpers
# ---------------------------------------------------------------------------

async def _get_cached_response(cache_key: str, ttl_minutes: int):
    """Return cached Valyu response from MongoDB if still fresh."""
    doc = await db.valyu_cache.find_one({"key": cache_key}, {"_id": 0})
    if doc:
        cached_at = doc.get("cached_at")
        if cached_at:
            if isinstance(cached_at, str):
                cached_at = datetime.fromisoformat(cached_at)
            age = (datetime.now(timezone.utc) - cached_at).total_seconds()
            if age < ttl_minutes * 60:
                valyu_logger.info(f"Cache HIT for key={cache_key} (age={int(age)}s)")
                return doc.get("data")
    valyu_logger.info(f"Cache MISS for key={cache_key}")
    return None


async def _set_cached_response(cache_key: str, data):
    """Store a Valyu response in MongoDB cache."""
    await db.valyu_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "data": data, "cached_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


def _rate_limit_ok() -> bool:
    """Check whether we are allowed to call Valyu (rate limit)."""
    global _valyu_last_call_time
    now = _time_mod.time()
    if now - _valyu_last_call_time < VALYU_RATE_LIMIT_SECONDS:
        valyu_logger.info("Rate-limited – returning cached data instead of calling Valyu")
        return False
    return True


def _mark_valyu_called():
    global _valyu_last_call_time
    _valyu_last_call_time = _time_mod.time()


def _event_content_hash(evt: dict) -> str:
    """Produce a deterministic hash for deduplication of external events."""
    raw = f"{evt.get('title', '')}|{evt.get('description', '')[:200]}|{evt.get('date', '')}|{evt.get('source', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


async def _deduplicated_request(key: str, coro_factory):
    """Ensure only one in-flight Valyu request per logical key. Others await the same result."""
    if key in _valyu_pending_requests:
        task = _valyu_pending_requests[key]
        valyu_logger.info(f"Dedup – reusing in-flight request for key={key}")
        return await task

    async def _run():
        try:
            return await coro_factory()
        finally:
            _valyu_pending_requests.pop(key, None)

    task = asyncio.ensure_future(_run())
    _valyu_pending_requests[key] = task
    return await task


async def valyu_search(query, max_results=20, start_date=None):
    """Call Valyu search API to find events."""
    if not VALYU_API_KEY:
        return []

    headers = {
        "x-api-key": VALYU_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "query": query,
        "search_type": "all",
        "max_num_results": max_results,
    }
    if start_date:
        payload["start_date"] = start_date

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{VALYU_BASE_URL}/search",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                logging.warning(f"Valyu search returned {resp.status_code}: {resp.text[:200]}")
                return []
            data = resp.json()
            return data.get("results", [])
    except Exception as e:
        logging.error(f"Valyu search error: {e}")
        return []


async def valyu_deepsearch(query, max_results=10):
    """Call Valyu deepsearch for intelligence research."""
    if not VALYU_API_KEY:
        return {"summary": "Valyu API key not configured.", "sources": []}

    headers = {
        "x-api-key": VALYU_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "query": query,
        "search_type": "all",
        "max_num_results": max_results,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{VALYU_BASE_URL}/deepsearch",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                logging.warning(f"Valyu deepsearch returned {resp.status_code}: {resp.text[:200]}")
                return {"summary": "Search failed.", "sources": []}
            data = resp.json()
            return {
                "summary": data.get("answer", data.get("summary", "")),
                "sources": [
                    {"title": s.get("title", ""), "url": s.get("url", "")}
                    for s in data.get("results", [])[:20]
                ],
            }
    except Exception as e:
        logging.error(f"Valyu deepsearch error: {e}")
        return {"summary": f"Search error: {str(e)}", "sources": []}


def get_start_date():
    d = datetime.now(timezone.utc) - timedelta(days=7)
    return d.strftime("%Y-%m-%d")


def process_search_results(results):
    """Process raw Valyu search results into threat events."""
    events = []
    seen_titles = set()

    for r in results:
        title = (r.get("title") or "").strip()
        content = (r.get("content") or r.get("snippet") or "").strip()
        url = r.get("url", "")
        published = r.get("published_date") or r.get("publishedDate") or datetime.now(timezone.utc).isoformat()

        if not title or title in seen_titles:
            continue
        seen_titles.add(title)

        full_text = f"{title} {content}"
        country, lat, lng = extract_country(full_text, title=title)
        if lat is None or lng is None:
            continue

        category = classify_category(full_text)
        threat_level = classify_threat_level(full_text)

        events.append({
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "title": title,
            "summary": content[:500] if content else title,
            "category": category,
            "threatLevel": threat_level,
            "location": {
                "latitude": lat,
                "longitude": lng,
                "placeName": country,
                "country": country,
            },
            "timestamp": published,
            "source": r.get("source", "web"),
            "sourceUrl": url,
            "keywords": extract_keywords_from_text(full_text),
            "rawContent": content,
        })

    # Sort by threat level, then date
    level_priority = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    events.sort(key=lambda e: (level_priority.get(e["threatLevel"], 5), e.get("timestamp", "")))
    return events


@api_router.post("/threat-events")
async def get_threat_events():
    """Fetch global threat events. Returns cached data when available."""
    # 1. Try cache first
    cached = await _get_cached_response("threat_events_global", VALYU_CACHE_TTL_MINUTES)
    if cached:
        return cached

    # 2. Try stored events from external_events collection
    stored_events = await db.external_events.find(
        {}, {"_id": 0}
    ).sort("ingested_at", -1).to_list(200)
    if stored_events:
        result = {
            "events": stored_events[:200],
            "count": len(stored_events[:200]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "stored",
        }
        await _set_cached_response("threat_events_global", result)
        return result

    # 3. Only if no cache and no stored data, fetch live from Valyu
    if not VALYU_API_KEY:
        return {"events": [], "count": 0, "error": "VALYU_API_KEY not configured"}

    if not _rate_limit_ok():
        return {"events": [], "count": 0, "source": "rate_limited"}

    async def _fetch_live():
        valyu_logger.info("Valyu request STARTED: threat-events")
        start_date = get_start_date()
        tasks = [valyu_search(q, max_results=15, start_date=start_date) for q in THREAT_QUERIES[:15]]
        results_arrays = await asyncio.gather(*tasks, return_exceptions=True)
        all_results = []
        for r in results_arrays:
            if isinstance(r, list):
                all_results.extend(r)
        events = process_search_results(all_results)
        _mark_valyu_called()
        valyu_logger.info(f"Valyu request SUCCEEDED: threat-events ({len(events)} events)")
        result = {
            "events": events[:200],
            "count": len(events[:200]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "live",
        }
        await _set_cached_response("threat_events_global", result)
        # Also persist events
        for evt in events:
            content_hash = _event_content_hash(evt)
            evt["content_hash"] = content_hash
            evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
            evt["provider"] = "valyu"
            try:
                await db.external_events.update_one(
                    {"content_hash": content_hash},
                    {"$set": evt},
                    upsert=True,
                )
            except Exception:
                pass
        return result

    try:
        return await _deduplicated_request("threat_events_global", _fetch_live)
    except Exception as e:
        valyu_logger.error(f"Valyu request FAILED: threat-events: {e}")
        return {"events": [], "count": 0, "error": str(e)}


@api_router.post("/entity-search")
async def entity_search(request: Request):
    """Search for entity intelligence using Valyu."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Entity name is required")

    if not VALYU_API_KEY:
        raise HTTPException(status_code=503, detail="VALYU_API_KEY not configured")

    # Use Valyu deepsearch for entity intel
    research = await valyu_deepsearch(
        f"intelligence profile analysis of {name}: history, operations, leadership, capabilities, recent activity",
        max_results=15,
    )

    # Try to get entity locations
    location_results = await valyu_search(f"{name} location headquarters base operations area", max_results=10)
    locations = []
    seen_countries = set()
    for r in location_results:
        text = f"{r.get('title', '')} {r.get('content', r.get('snippet', ''))}"
        country, lat, lng = extract_country(text)
        if country and country not in seen_countries:
            seen_countries.add(country)
            locations.append({
                "latitude": lat,
                "longitude": lng,
                "placeName": country,
                "country": country,
            })

    entity = {
        "id": f"entity_{uuid.uuid4().hex[:8]}",
        "name": name,
        "type": "group",
        "description": research.get("summary", "")[:300],
        "locations": locations[:10],
        "relatedEntities": [],
        "economicData": {},
    }

    return {
        "entity": entity,
        "research": research,
    }


@api_router.get("/countries/conflicts")
async def get_country_conflicts(country: str, stream: Optional[str] = None):
    """Fetch conflict intelligence for a country. Cached for VALYU_COUNTRY_CACHE_HOURS."""
    if not country:
        raise HTTPException(status_code=400, detail="Country parameter is required")

    cache_key = f"country_conflicts_{country.lower().strip()}"
    ttl_minutes = VALYU_COUNTRY_CACHE_HOURS * 60

    # Check cache first (for both streaming and non-streaming)
    cached = await _get_cached_response(cache_key, ttl_minutes)
    if cached:
        if stream == "true":
            from starlette.responses import StreamingResponse
            async def generate_cached():
                yield 'data: {"type": "start"}\n\n'.encode()
                yield f'data: {json.dumps({"type": "text", "text": cached.get("current", {}).get("conflicts", "")})}\n\n'.encode()
                yield f'data: {json.dumps({"type": "done", "data": cached})}\n\n'.encode()
            return StreamingResponse(generate_cached(), media_type="text/event-stream")
        return cached

    if not VALYU_API_KEY:
        raise HTTPException(status_code=503, detail="VALYU_API_KEY not configured")

    if stream == "true":
        from starlette.responses import StreamingResponse

        async def generate():
            try:
                yield 'data: {"type": "start"}\n\n'.encode()
                valyu_logger.info(f"Valyu request STARTED: country-conflicts ({country})")
                current = await valyu_deepsearch(
                    f"current ongoing military conflicts wars tensions in {country} 2024 2025 2026",
                    max_results=10,
                )
                yield f'data: {json.dumps({"type": "text", "text": current.get("summary", "")})}\n\n'.encode()
                result = {
                    "country": country,
                    "current": {"conflicts": current.get("summary", ""), "sources": current.get("sources", [])},
                    "past": {"conflicts": "", "sources": []},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                yield f'data: {json.dumps({"type": "done", "data": result})}\n\n'.encode()
                await _set_cached_response(cache_key, result)
                _mark_valyu_called()
                valyu_logger.info(f"Valyu request SUCCEEDED: country-conflicts ({country})")
            except Exception as e:
                valyu_logger.error(f"Valyu request FAILED: country-conflicts ({country}): {e}")
                yield f'data: {json.dumps({"type": "error", "error": str(e)})}\n\n'.encode()

        return StreamingResponse(generate(), media_type="text/event-stream")

    # Non-streaming: fetch both current and historical
    valyu_logger.info(f"Valyu request STARTED: country-conflicts ({country})")
    current_task = valyu_deepsearch(
        f"current ongoing military conflicts wars tensions in {country} 2024 2025 2026",
        max_results=10,
    )
    past_task = valyu_deepsearch(
        f"historical wars conflicts in {country} history major battles",
        max_results=10,
    )
    current, past = await asyncio.gather(current_task, past_task)

    result = {
        "country": country,
        "current": {
            "conflicts": current.get("summary", ""),
            "sources": current.get("sources", []),
        },
        "past": {
            "conflicts": past.get("summary", ""),
            "sources": past.get("sources", []),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await _set_cached_response(cache_key, result)
    _mark_valyu_called()
    valyu_logger.info(f"Valyu request SUCCEEDED: country-conflicts ({country})")
    return result


# ---- Military bases (static data, ported from upstream) ----
MILITARY_BASES_DATA = [
    {"baseName": "Ramstein Air Base", "country": "Germany", "latitude": 49.44, "longitude": 7.60, "type": "usa"},
    {"baseName": "Camp Humphreys", "country": "South Korea", "latitude": 36.96, "longitude": 127.03, "type": "usa"},
    {"baseName": "Yokota Air Base", "country": "Japan", "latitude": 35.75, "longitude": 139.35, "type": "usa"},
    {"baseName": "Naval Station Rota", "country": "Spain", "latitude": 36.64, "longitude": -6.35, "type": "nato"},
    {"baseName": "RAF Lakenheath", "country": "United Kingdom", "latitude": 52.41, "longitude": 0.56, "type": "usa"},
    {"baseName": "Incirlik Air Base", "country": "Turkey", "latitude": 37.00, "longitude": 35.43, "type": "nato"},
    {"baseName": "Al Udeid Air Base", "country": "Qatar", "latitude": 25.12, "longitude": 51.32, "type": "usa"},
    {"baseName": "Camp Lemonnier", "country": "Djibouti", "latitude": 11.55, "longitude": 43.15, "type": "usa"},
    {"baseName": "Naval Support Facility Diego Garcia", "country": "Diego Garcia", "latitude": -7.32, "longitude": 72.42, "type": "usa"},
    {"baseName": "Guantanamo Bay Naval Base", "country": "Cuba", "latitude": 19.90, "longitude": -75.13, "type": "usa"},
    {"baseName": "Thule Air Base", "country": "Greenland", "latitude": 76.53, "longitude": -68.70, "type": "usa"},
    {"baseName": "Joint Base Pearl Harbor-Hickam", "country": "United States", "latitude": 21.35, "longitude": -157.95, "type": "usa"},
    {"baseName": "Osan Air Base", "country": "South Korea", "latitude": 37.09, "longitude": 127.03, "type": "usa"},
    {"baseName": "Kadena Air Base", "country": "Japan", "latitude": 26.35, "longitude": 127.77, "type": "usa"},
    {"baseName": "Aviano Air Base", "country": "Italy", "latitude": 46.03, "longitude": 12.60, "type": "nato"},
    {"baseName": "Spangdahlem Air Base", "country": "Germany", "latitude": 49.97, "longitude": 6.69, "type": "usa"},
    {"baseName": "Naval Station Norfolk", "country": "United States", "latitude": 36.95, "longitude": -76.33, "type": "usa"},
    {"baseName": "Fort Bragg", "country": "United States", "latitude": 35.14, "longitude": -79.00, "type": "usa"},
    {"baseName": "Bagram Airfield", "country": "Afghanistan", "latitude": 34.95, "longitude": 69.27, "type": "usa"},
    {"baseName": "Al Dhafra Air Base", "country": "United Arab Emirates", "latitude": 24.25, "longitude": 54.55, "type": "usa"},
]


@api_router.get("/military-bases")
async def get_military_bases():
    """Return static military base data."""
    return {
        "bases": MILITARY_BASES_DATA,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ============================================================================
# RESEARCH AGENT – OpenAI Responses API + Valyu
# ============================================================================

# Lazy import so the server still starts even if openai/valyu are not installed
def _get_research_agent():
    from backend.services.research_agent import (  # type: ignore
        run_research_query,
        result_to_campaign_intel,
        result_to_map_events,
        result_to_intel_briefing,
    )
    return run_research_query, result_to_campaign_intel, result_to_map_events, result_to_intel_briefing


class ResearchQueryRequest(BaseModel):
    query: str
    attach_to_campaign_id: Optional[str] = None
    post_to_intel_board: bool = False
    add_to_threat_map: bool = False


@api_router.post("/research-agent/query")
async def research_agent_query(
    data: ResearchQueryRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Run the 25th ID Research Agent.

    Performs multi-step intelligence research using the OpenAI Responses API
    with Valyu as a tool provider.  Optionally:
      - attaches the result as an intel briefing to a campaign
      - posts the result as a standalone Intel Board briefing
      - creates Global Threat Map markers from extracted coordinates

    Returns the structured intelligence output plus any entity IDs created.
    """
    query = data.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    try:
        run_query, to_campaign_intel, to_map_events, to_intel_briefing = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Research agent service unavailable: {exc}",
        )

    # Run the research agent
    try:
        result = await run_query(query)
    except Exception as exc:
        logging.error("Research agent error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    created_briefing_id: Optional[str] = None
    created_map_event_ids: list = []

    # Optional: attach intel briefing to campaign
    if data.attach_to_campaign_id:
        campaign = await db.campaigns.find_one({"id": data.attach_to_campaign_id})
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        briefing_doc = to_campaign_intel(
            result,
            campaign_id=data.attach_to_campaign_id,
            author_id=current_user["id"],
            author_name=current_user.get("username", "Research Agent"),
        )
        await db.intel_briefings.insert_one(briefing_doc)
        briefing_doc.pop("_id", None)
        await upsert_map_event("intel", briefing_doc, briefing_doc["id"])
        created_briefing_id = briefing_doc["id"]

    # Optional: post as standalone Intel Board briefing
    elif data.post_to_intel_board:
        briefing_doc = to_intel_briefing(
            result,
            author_id=current_user["id"],
            author_name=current_user.get("username", "Research Agent"),
        )
        await db.intel_briefings.insert_one(briefing_doc)
        briefing_doc.pop("_id", None)
        await upsert_map_event("intel", briefing_doc, briefing_doc["id"])
        created_briefing_id = briefing_doc["id"]

    # Optional: add markers to Global Threat Map
    if data.add_to_threat_map:
        now = datetime.now(timezone.utc).isoformat()
        map_events = to_map_events(result)
        for evt in map_events:
            await db.map_events.update_one(
                {"id": evt["id"]},
                {"$set": evt, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
            created_map_event_ids.append(evt["id"])

    return {
        "result": result,
        "created_briefing_id": created_briefing_id,
        "created_map_event_ids": created_map_event_ids,
    }


@api_router.post("/research-agent/attach-to-campaign/{campaign_id}")
async def research_agent_attach_campaign(
    campaign_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Run the research agent for a specific query and attach the result
    as an intel briefing to the specified campaign.
    """
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        run_query, to_campaign_intel, _, _ = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Research agent service unavailable: {exc}")

    try:
        result = await run_query(query)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    briefing_doc = to_campaign_intel(
        result,
        campaign_id=campaign_id,
        author_id=current_user["id"],
        author_name=current_user.get("username", "Research Agent"),
    )
    await db.intel_briefings.insert_one(briefing_doc)
    briefing_doc.pop("_id", None)
    await upsert_map_event("intel", briefing_doc, briefing_doc["id"])

    return {
        "message": "Intel attached to campaign",
        "briefing_id": briefing_doc["id"],
        "result": result,
    }


@api_router.post("/research-agent/post-briefing")
async def research_agent_post_briefing(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Run the research agent and post the result as a new Intel Board briefing.
    """
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    try:
        run_query, _, _, to_intel_briefing = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Research agent service unavailable: {exc}")

    try:
        result = await run_query(query)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    briefing_doc = to_intel_briefing(
        result,
        author_id=current_user["id"],
        author_name=current_user.get("username", "Research Agent"),
    )
    await db.intel_briefings.insert_one(briefing_doc)
    briefing_doc.pop("_id", None)
    await upsert_map_event("intel", briefing_doc, briefing_doc["id"])

    return {
        "message": "Intel briefing posted to board",
        "briefing_id": briefing_doc["id"],
        "result": result,
    }


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
cors_origins = [o.strip().rstrip('/') for o in cors_origins_raw.split(',') if o.strip() and o.strip() != '*']
# Always honour FRONTEND_URL so operators only need to set one variable
if FRONTEND_URL and FRONTEND_URL not in cors_origins:
    cors_origins.insert(0, FRONTEND_URL)
# Development fallback when nothing is configured
if not cors_origins:
    cors_origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Background ingestion task handle
_background_ingestion_task = None

# Queries used when OpenAI supplemental ingestion runs.
# Kept intentionally short to minimize token usage.
_OPENAI_THREAT_QUERIES = [
    "Summarize the top 5 active global military conflicts and security threats right now",
    "What are the most urgent geopolitical crises and diplomatic tensions worldwide today",
    "List recent significant terrorist attacks or extremist activity with affected regions",
]

# Max number of Valyu THREAT_QUERIES sent per background refresh cycle.
# Keeping this below the full THREAT_QUERIES list limits per-cycle API cost.
MAX_VALYU_QUERIES_PER_CYCLE = int(os.environ.get("MAX_VALYU_QUERIES_PER_CYCLE", 8))


async def _prune_old_events():
    """Delete external_events documents older than EVENT_PRUNE_DAYS days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_PRUNE_DAYS)
    result = await db.external_events.delete_many({"ingested_at": {"$lt": cutoff.isoformat()}})
    if result.deleted_count:
        logging.getLogger("valyu").info(
            f"Pruned {result.deleted_count} events older than {EVENT_PRUNE_DAYS} days"
        )


def _ra_result_to_external_event_format(result: dict) -> list:
    """
    Convert a research-agent result dict into a list of external_events-format
    dicts (same schema as process_search_results output) so OpenAI-sourced events
    appear on the Global Threat Map alongside Valyu events.
    """
    threat_map = {"LOW": "low", "MEDIUM": "medium", "HIGH": "high", "CRITICAL": "critical"}
    threat_level = threat_map.get(
        str(result.get("threat_level", "medium")).upper(), "medium"
    )
    # Truncate to 500 chars – same limit used for event summaries throughout
    # process_search_results so display components don't receive oversized text.
    summary = (result.get("summary") or "")[:500]
    regions = result.get("regions") or []
    events = []
    for i, coord in enumerate(result.get("coordinates") or []):
        lat = coord.get("lat")
        lng = coord.get("lng")
        if lat is None or lng is None:
            continue
        region_label = (
            regions[i] if i < len(regions) else (regions[0] if regions else "Unknown Region")
        )
        country, _, _ = extract_country(region_label)
        place_name = region_label or country or "Unknown"
        title = f"{region_label[:60]} – Intelligence Assessment"
        events.append({
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "title": title,
            "summary": summary or title,
            "category": classify_category(summary),
            "threatLevel": threat_level,
            "location": {
                "latitude": float(lat),
                "longitude": float(lng),
                "placeName": place_name,
                "country": country or place_name,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "openai",
            "sourceUrl": "",
            "keywords": extract_keywords_from_text(summary),
            "rawContent": (result.get("full_report") or summary)[:1000],
        })
    return events


async def _run_valyu_ingestion():
    """
    Fetch Valyu threat events and persist them in external_events.

    Skips the API call entirely when the DB already contains enough recently-
    ingested Valyu events (VALYU_MIN_EVENTS_THRESHOLD within the last refresh
    window), so we never waste quota on data we already have.
    """
    vlog = logging.getLogger("valyu")
    if not VALYU_API_KEY:
        return

    # Only call the API when we're running low on recent Valyu events.
    cutoff_dt = datetime.now(timezone.utc) - timedelta(minutes=VALYU_EVENT_REFRESH_MINUTES)
    recent_count = await db.external_events.count_documents(
        {"ingested_at": {"$gte": cutoff_dt.isoformat()}, "provider": "valyu"}
    )
    if recent_count >= VALYU_MIN_EVENTS_THRESHOLD:
        vlog.info(
            f"Valyu ingestion: {recent_count} recent events present, skipping API call"
        )
        return

    vlog.info("Valyu ingestion: fetching fresh events…")
    start_date = get_start_date()
    tasks = [
        valyu_search(q, max_results=10, start_date=start_date)
        for q in THREAT_QUERIES[:MAX_VALYU_QUERIES_PER_CYCLE]
    ]
    results_arrays = await asyncio.gather(*tasks, return_exceptions=True)

    all_results = []
    for r in results_arrays:
        if isinstance(r, list):
            all_results.extend(r)

    events = process_search_results(all_results)

    inserted = 0
    for evt in events:
        content_hash = _event_content_hash(evt)
        evt["content_hash"] = content_hash
        evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
        evt["provider"] = "valyu"
        op = await db.external_events.update_one(
            {"content_hash": content_hash},
            {"$setOnInsert": evt},
            upsert=True,
        )
        if op.upserted_id:
            inserted += 1

    if events:
        await _set_cached_response("threat_events_global", {
            "events": events[:200],
            "count": min(len(events), 200),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    _mark_valyu_called()
    vlog.info(
        f"Valyu ingestion complete: {inserted} new events stored, {len(events)} total processed"
    )


async def _run_openai_ingestion():
    """
    Run the OpenAI research agent to supplement threat events with AI intelligence.

    Hard-capped to once every OPENAI_INGESTION_INTERVAL_HOURS hours so the
    OpenAI API is called as infrequently as possible.  Results are stored in
    external_events with provider='openai' and will persist across restarts.
    """
    vlog = logging.getLogger("valyu")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        return

    # Check whether we ran within the interval – use the Valyu cache as a TTL store.
    ttl_minutes = OPENAI_INGESTION_INTERVAL_HOURS * 60
    if await _get_cached_response("openai_ingestion_last_run", ttl_minutes):
        vlog.info("OpenAI ingestion: within rate window, skipping")
        return

    vlog.info("OpenAI ingestion: starting supplemental threat intelligence pull…")
    try:
        run_query, _, _, _ = _get_research_agent()
    except (ImportError, RuntimeError) as exc:
        vlog.warning(f"OpenAI ingestion unavailable: {exc}")
        return

    inserted = 0
    for query in _OPENAI_THREAT_QUERIES:
        try:
            result = await run_query(query)
            new_events = _ra_result_to_external_event_format(result)
            for evt in new_events:
                content_hash = _event_content_hash(evt)
                evt["content_hash"] = content_hash
                evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
                evt["provider"] = "openai"
                op = await db.external_events.update_one(
                    {"content_hash": content_hash},
                    {"$setOnInsert": evt},
                    upsert=True,
                )
                if op.upserted_id:
                    inserted += 1
        except Exception as exc:
            vlog.error(f"OpenAI ingestion error for query '{query[:60]}': {exc}")

    # Mark the last-run timestamp so we don't call again until the interval expires.
    await _set_cached_response(
        "openai_ingestion_last_run",
        {"ran_at": datetime.now(timezone.utc).isoformat()},
    )
    vlog.info(f"OpenAI ingestion complete: {inserted} new events stored")


async def _restore_uploads_from_mongodb():
    """
    Recreate any uploaded files that are missing from the local filesystem by
    reading their binary data from the MongoDB `uploads` collection.

    This makes image/media uploads survive container restarts, because the
    bytes are durably stored in MongoDB even when the local uploads/ directory
    is wiped on restart.
    """
    vlog = logging.getLogger(__name__)
    try:
        restored = 0
        async for doc in db.uploads.find({}, {"filename": 1, "data": 1}):
            filename = doc.get("filename")
            data = doc.get("data")
            if not filename or not data:
                continue
            file_path = UPLOAD_DIR / filename
            if not file_path.exists():
                try:
                    with open(file_path, "wb") as fh:
                        # data is stored as BSON Binary (subclass of bytes) – write directly.
                        fh.write(data)
                    restored += 1
                except Exception as exc:
                    vlog.warning(f"Could not restore upload '{filename}': {exc}")
        if restored:
            vlog.info(f"Restored {restored} uploaded file(s) from MongoDB")
    except Exception as exc:
        vlog.error(f"Upload restore error: {exc}")


async def _valyu_background_ingestion():
    """
    Periodically fetch threat events from Valyu and OpenAI, storing them
    persistently in MongoDB so they survive environment restarts.

    Design principles (to keep API costs low):
      * The very first iteration runs immediately with NO sleep, so the map
        is populated as soon as the server starts.
      * _run_valyu_ingestion skips the Valyu API when the DB already has
        VALYU_MIN_EVENTS_THRESHOLD recent events.
      * _run_openai_ingestion fires at most once per OPENAI_INGESTION_INTERVAL_HOURS.
      * Events older than EVENT_PRUNE_DAYS days are pruned each cycle.
    """
    vlog = logging.getLogger("valyu")
    vlog.info("Background ingestion service started")
    while True:
        try:
            # Remove stale events first
            await _prune_old_events()

            # Valyu ingestion (self-throttles when recent data already exists)
            if VALYU_API_KEY:
                await _run_valyu_ingestion()

            # OpenAI supplemental ingestion (hard rate-limited to once per day)
            if os.environ.get("OPENAI_API_KEY", ""):
                await _run_openai_ingestion()

            # Sleep at the END so the first iteration runs immediately on startup.
            await asyncio.sleep(VALYU_EVENT_REFRESH_MINUTES * 60)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            vlog.error(f"Background ingestion error: {exc}")
            # Brief pause before retrying after an unexpected error.
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break


@app.on_event("startup")
async def startup_event():
    global _background_ingestion_task
    vlog = logging.getLogger("valyu")

    # Backfill map_events from existing entities
    try:
        await backfill_map_events()
    except Exception as e:
        vlog.error(f"Map events backfill error: {e}")

    # Create MongoDB indexes
    try:
        await db.valyu_cache.create_index("key", unique=True)
        await db.external_events.create_index("content_hash", unique=True)
        await db.external_events.create_index("ingested_at")
        await db.map_events.create_index("id", unique=True)
        await db.map_events.create_index("type")
        await db.map_events.create_index("related_entity_id")
        # Index for upload persistence
        await db.uploads.create_index("filename", unique=True)
    except Exception as e:
        vlog.warning(f"Index creation note: {e}")

    # Restore any uploaded files that were lost on container restart
    try:
        await _restore_uploads_from_mongodb()
    except Exception as e:
        vlog.error(f"Upload restore error: {e}")

    # Prune external_events older than EVENT_PRUNE_DAYS on every startup
    try:
        await _prune_old_events()
    except Exception as e:
        vlog.error(f"Event pruning error: {e}")

    # Start background ingestion (first iteration runs immediately, no sleep)
    _background_ingestion_task = asyncio.create_task(_valyu_background_ingestion())
    vlog.info("Startup complete – background ingestion scheduled")

@app.on_event("shutdown")
async def shutdown_db_client():
    if _background_ingestion_task and not _background_ingestion_task.done():
        _background_ingestion_task.cancel()
    client.close()
