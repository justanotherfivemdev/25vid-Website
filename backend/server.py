from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
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
    rank: Optional[str]
    specialization: Optional[str]
    join_date: datetime

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
    logo_url: Optional[str] = None  # Country/faction/region badge
    rsvp_list: List[str] = []  # user IDs
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

class RSVPRequest(BaseModel):
    operation_id: str

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
    category: str  # "general", "operations", "training", "feedback"
    title: str
    content: str
    author_id: str
    author_name: str
    replies: List[dict] = []
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
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

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
    
    user_response = UserResponse(
        id=user_obj.id,
        email=user_obj.email,
        username=user_obj.username,
        role=user_obj.role,
        rank=user_obj.rank,
        specialization=user_obj.specialization,
        join_date=user_obj.join_date
    )
    
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
    
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        role=user["role"],
        rank=user.get("rank"),
        specialization=user.get("specialization"),
        join_date=datetime.fromisoformat(user["join_date"]) if isinstance(user["join_date"], str) else user["join_date"]
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        username=current_user["username"],
        role=current_user["role"],
        rank=current_user.get("rank"),
        specialization=current_user.get("specialization"),
        join_date=datetime.fromisoformat(current_user["join_date"]) if isinstance(current_user["join_date"], str) else current_user["join_date"]
    )

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
async def rsvp_operation(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    user_id = current_user["id"]
    rsvp_list = operation.get("rsvp_list", [])
    
    if user_id in rsvp_list:
        # Remove RSVP
        rsvp_list.remove(user_id)
        message = "RSVP removed"
    else:
        # Add RSVP
        max_participants = operation.get("max_participants")
        if max_participants and len(rsvp_list) >= max_participants:
            raise HTTPException(status_code=400, detail="Operation is full")
        rsvp_list.append(user_id)
        message = "RSVP confirmed"
    
    await db.operations.update_one({"id": operation_id}, {"$set": {"rsvp_list": rsvp_list}})
    
    return {"message": message, "rsvp_count": len(rsvp_list)}

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
    discussions = await db.discussions.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
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
# USER MANAGEMENT (ADMIN ONLY)
# ============================================================================

@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(
        id=u["id"],
        email=u["email"],
        username=u["username"],
        role=u["role"],
        rank=u.get("rank"),
        specialization=u.get("specialization"),
        join_date=datetime.fromisoformat(u["join_date"]) if isinstance(u["join_date"], str) else u["join_date"]
    ) for u in users]

class UserUpdate(BaseModel):
    role: Optional[str] = None
    rank: Optional[str] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None

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
# MISC ENDPOINTS
# ============================================================================

@api_router.get("/")
async def root():
    return {"message": "Azimuth Operations Group API", "status": "operational"}

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