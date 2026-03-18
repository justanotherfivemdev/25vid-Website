from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid
import secrets


class PartnerUnit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    abbreviation: str = ""
    description: str = ""
    status: Literal["active", "inactive", "pending"] = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""
    contact_email: str = ""
    max_members: int = 50


class PartnerUnitCreate(BaseModel):
    name: str
    abbreviation: str = ""
    description: str = ""
    contact_email: str = ""
    max_members: int = 50


class PartnerUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    username: str
    password_hash: str
    partner_unit_id: str
    partner_role: Literal["partner_admin", "partner_member"] = "partner_member"
    rank: Optional[str] = None
    billet: Optional[str] = None
    status: Literal["active", "inactive", "pending"] = "pending"
    is_active: bool = True
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    join_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PartnerUserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=8)
    invite_code: str
    rank: Optional[str] = None


class PartnerUserLogin(BaseModel):
    email: EmailStr
    password: str


class PartnerUserResponse(BaseModel):
    id: str
    email: str
    username: str
    partner_unit_id: str
    partner_role: str
    rank: Optional[str] = None
    billet: Optional[str] = None
    status: str = "pending"
    is_active: bool = True
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    join_date: datetime
    partner_unit_name: str = ""
    account_type: str = "partner"


class PartnerTokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: PartnerUserResponse


class PartnerUnitStatusUpdate(BaseModel):
    status: Literal["active", "inactive", "pending"]


class PartnerMemberUpdate(BaseModel):
    rank: Optional[str] = None
    billet: Optional[str] = None
    status: Optional[Literal["active", "inactive", "pending"]] = None


class PartnerInvite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    partner_unit_id: str
    code: str = Field(default_factory=lambda: secrets.token_urlsafe(16))
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    used: bool = False
    last_used_by: Optional[str] = None
    max_uses: int = 1
    use_count: int = 0


class PartnerApplication(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    unit_name: str
    unit_timezone: str = ""
    member_count: int = 1
    description: str = ""
    primary_tasking: str = ""
    contact_email: str = ""
    contact_name: str = ""
    additional_info: str = ""
    status: Literal["pending", "approved", "denied"] = "pending"
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_notes: Optional[str] = None


class PartnerApplicationSubmit(BaseModel):
    unit_name: str
    unit_timezone: str = ""
    member_count: int = 1
    description: str = ""
    primary_tasking: str = ""
    contact_email: EmailStr
    contact_name: str = ""
    additional_info: str = ""
