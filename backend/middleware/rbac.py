from enum import Enum
from fastapi import Depends, HTTPException

from middleware.auth import get_current_user


class Role(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    PARTNER = "partner"
    GUEST = "guest"
    S5_LIAISON = "s5_liaison"
    PARTNER_ADMIN = "partner_admin"
    RECRUIT = "recruit"


class Permission(str, Enum):
    MANAGE_USERS = "manage_users"
    MANAGE_OPERATIONS = "manage_operations"
    MANAGE_CONTENT = "manage_content"
    MANAGE_PARTNERS = "manage_partners"
    VIEW_ROSTER = "view_roster"
    VIEW_INTEL = "view_intel"
    MANAGE_INTEL = "manage_intel"
    MANAGE_CAMPAIGNS = "manage_campaigns"
    MANAGE_RECRUITMENT = "manage_recruitment"
    MANAGE_TRAINING = "manage_training"
    MANAGE_GALLERY = "manage_gallery"


ROLE_PERMISSIONS = {
    Role.ADMIN: set(Permission),
    Role.S5_LIAISON: {
        Permission.MANAGE_OPERATIONS, Permission.MANAGE_CONTENT,
        Permission.MANAGE_INTEL, Permission.MANAGE_CAMPAIGNS,
        Permission.MANAGE_TRAINING, Permission.MANAGE_GALLERY,
        Permission.VIEW_ROSTER, Permission.VIEW_INTEL,
    },
    Role.MEMBER: {Permission.VIEW_ROSTER, Permission.VIEW_INTEL},
    Role.PARTNER: set(),
    Role.GUEST: set(),
}


def require_permission(permission: Permission):
    """Creates a FastAPI dependency that checks permissions."""
    async def _check(current_user: dict = Depends(get_current_user)):
        role_str = current_user.get("role", "member")
        try:
            role = Role(role_str)
        except ValueError:
            role = Role.MEMBER
        permissions = ROLE_PERMISSIONS.get(role, set())
        if permission not in permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission.value}' required"
            )
        return current_user
    return _check
