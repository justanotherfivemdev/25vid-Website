from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    username: str
    password_hash: str
    role: str = "member"
    rank: Optional[str] = None
    specialization: Optional[str] = None
    join_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    email_verified: bool = False
    email_verified_at: Optional[str] = None
    email_verification_sent_at: Optional[str] = None
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
    company: Optional[str] = None
    platoon: Optional[str] = None
    billet: Optional[str] = None
    display_mos: Optional[str] = None
    billet_acronym: Optional[str] = None
    loa_status: Optional[str] = None
    pipeline_stage: Optional[str] = None
    pipeline_history: List[dict] = Field(default_factory=list)


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
    company: Optional[str] = None
    platoon: Optional[str] = None
    billet: Optional[str] = None
    display_mos: Optional[str] = None
    billet_acronym: Optional[str] = None
    loa_status: Optional[str] = None
    pipeline_stage: Optional[str] = None
    pipeline_history: List[dict] = Field(default_factory=list)


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


class SetPasswordRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


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
    company: Optional[str] = None
    platoon: Optional[str] = None
    billet: Optional[str] = None
    display_mos: Optional[str] = None
    billet_acronym: Optional[str] = None


class UserUpdate(BaseModel):
    role: Optional[str] = None
    rank: Optional[str] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None
    squad: Optional[str] = None


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
