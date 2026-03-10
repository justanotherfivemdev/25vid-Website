from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
import secrets
import json
import urllib.parse
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext

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

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Discord OAuth2 configuration
DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.environ.get('DISCORD_REDIRECT_URI')
DISCORD_API_URL = "https://discord.com/api/v10"
DISCORD_SCOPES = "identify email"

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
    # Phase 4 profile fields
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    status: str = "recruit"  # recruit, active, reserve, staff, command, inactive
    timezone: Optional[str] = None
    squad: Optional[str] = None
    favorite_role: Optional[str] = None
    awards: List[dict] = []           # [{id, name, date, description}]
    mission_history: List[dict] = []  # [{id, operation_name, date, role_performed, notes}]
    training_history: List[dict] = [] # [{id, course_name, completion_date, instructor, notes}]
    # Phase 5: Discord integration prep
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None
    discord_avatar: Optional[str] = None
    discord_linked: bool = False

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
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
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    status: str = "recruit"
    timezone: Optional[str] = None
    squad: Optional[str] = None
    favorite_role: Optional[str] = None
    awards: List[dict] = []
    mission_history: List[dict] = []
    training_history: List[dict] = []
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None
    discord_avatar: Optional[str] = None
    discord_linked: bool = False

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

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
    rsvp_list: List[str] = []  # legacy compat
    rsvps: List[dict] = []  # [{user_id, username, status, role_notes, rsvp_time}]
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
    status: str = "attending"  # attending, tentative, not_attending
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
    priority: str = "normal"
    badge_url: Optional[str] = None  # Bottom-right badge/logo

class Discussion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    title: str
    content: str
    author_id: str
    author_name: str
    replies: List[dict] = []
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
    category: str = "operation"

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

# ============================================================================
# AUTH UTILITIES
# ============================================================================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
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
        avatar_url=u.get("avatar_url"), bio=u.get("bio"), status=u.get("status", "recruit"),
        timezone=u.get("timezone"), squad=u.get("squad"), favorite_role=u.get("favorite_role"),
        awards=u.get("awards", []), mission_history=u.get("mission_history", []),
        training_history=u.get("training_history", []),
        discord_id=u.get("discord_id"), discord_username=u.get("discord_username"),
        discord_avatar=u.get("discord_avatar"), discord_linked=u.get("discord_linked", False)
    )

# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_dict = user_data.model_dump()
    user_dict["password_hash"] = hash_password(user_dict.pop("password"))
    user_obj = User(**user_dict)
    
    doc = user_obj.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)
    
    # Create token
    access_token = create_access_token({"sub": user_obj.id, "email": user_obj.email})
    
    user_response = user_to_response(user_obj.model_dump())
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is inactive")
    
    access_token = create_access_token({"sub": user["id"], "email": user["email"]})
    
    user_response = user_to_response(user)
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)

# ============================================================================
# DISCORD OAUTH2 ENDPOINTS
# ============================================================================

@api_router.get("/auth/discord")
async def discord_login_redirect():
    """Initiate Discord OAuth2 login/signup flow."""
    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord integration not configured")
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
    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord integration not configured")
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
    frontend_base = DISCORD_REDIRECT_URI.rsplit("/api/", 1)[0]

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
    discord_email = discord_user.get("email")
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
        if not existing_by_discord.get("is_active", True):
            return RedirectResponse(f"{frontend_base}/login?discord_error=account_inactive")
        jwt_token = create_access_token({"sub": existing_by_discord["id"], "email": existing_by_discord["email"]})
        return RedirectResponse(f"{frontend_base}/login?discord_token={jwt_token}")

    # 2. Check if Discord email matches an existing account — auto-link
    if discord_email:
        existing_by_email = await db.users.find_one({"email": discord_email}, {"_id": 0})
        if existing_by_email:
            if not existing_by_email.get("is_active", True):
                return RedirectResponse(f"{frontend_base}/login?discord_error=account_inactive")
            await db.users.update_one(
                {"id": existing_by_email["id"]},
                {"$set": {
                    "discord_id": discord_id,
                    "discord_username": discord_username,
                    "discord_avatar": discord_avatar_url,
                    "discord_linked": True
                }}
            )
            jwt_token = create_access_token({"sub": existing_by_email["id"], "email": existing_by_email["email"]})
            return RedirectResponse(f"{frontend_base}/login?discord_token={jwt_token}")

    # 3. Create new user from Discord
    email_for_user = discord_email or f"discord_{discord_id}@azimuth.local"
    new_user = User(
        email=email_for_user,
        username=discord_username or f"Operator_{discord_id[:8]}",
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        discord_id=discord_id,
        discord_username=discord_username,
        discord_avatar=discord_avatar_url,
        discord_linked=True
    )
    doc = new_user.model_dump()
    doc['join_date'] = doc['join_date'].isoformat()
    await db.users.insert_one(doc)

    jwt_token = create_access_token({"sub": new_user.id, "email": new_user.email})
    return RedirectResponse(f"{frontend_base}/login?discord_token={jwt_token}")

@api_router.delete("/auth/discord/unlink")
async def discord_unlink(current_user: dict = Depends(get_current_user)):
    """Unlink Discord from current user's account."""
    if not current_user.get("discord_linked"):
        raise HTTPException(status_code=400, detail="No Discord account linked")
    # Safety: prevent unlink if Discord is the only auth method
    email = current_user.get("email", "")
    if email.endswith("@azimuth.local"):
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
async def set_password(data: SetPasswordRequest, current_user: dict = Depends(get_current_user)):
    """Allow Discord-only users to set a real email and password."""
    current_email = current_user.get("email", "")
    # Only allow if user currently has a placeholder email
    if not current_email.endswith("@azimuth.local"):
        raise HTTPException(status_code=400, detail="You already have an email and password set.")
    # Check if new email is taken by another user
    existing = await db.users.find_one({"email": data.email, "id": {"$ne": current_user["id"]}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered to another account.")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"email": data.email, "password_hash": pwd_context.hash(data.password)}}
    )
    # Return new token with updated email
    new_token = create_access_token({"sub": current_user["id"], "email": data.email})
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
async def create_operation(operation_data: OperationCreate, current_user: dict = Depends(get_current_user)):
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
async def create_announcement(announcement_data: AnnouncementCreate, current_user: dict = Depends(get_current_user)):
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
async def upload_image(image_data: GalleryImageCreate, current_user: dict = Depends(get_current_user)):
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
            "hero": {"backgroundImage": "", "tagline": {"line1": "JOIN TODAY,", "line2": "SAVE TOMORROW."}},
            "about": {"paragraph1": "", "paragraph2": "", "quote": {"text": "", "author": "", "backgroundImage": ""}},
            "operationalSuperiority": {"description": "", "images": []},
            "lethality": {"logistics": {"description": "", "image": ""}, "training": {"description": "", "image": ""}},
            "gallery": {"showcaseImages": []},
            "footer": {"description": "", "contact": {"discord": "", "email": ""}}
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
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(allowed_extensions)}")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

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
            "avatar_url": u.get("avatar_url"), "join_date": jd
        })
    return roster

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
    regex = {"$regex": q, "$options": "i"}
    ops = await db.operations.find(
        {"$or": [{"title": regex}, {"description": regex}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    discs = await db.discussions.find(
        {"$or": [{"title": regex}, {"content": regex}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return {"operations": ops, "discussions": discs}

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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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