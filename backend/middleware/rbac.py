from enum import Enum
from fastapi import Depends, HTTPException

from middleware.auth import get_current_user


class Role(str, Enum):
    # --- Primary staff roles (S1–S6) ---
    ADMIN = "admin"              # Legacy alias for S1 (full access)
    S1_PERSONNEL = "s1_personnel"
    S2_INTELLIGENCE = "s2_intelligence"
    S3_OPERATIONS = "s3_operations"
    S4_LOGISTICS = "s4_logistics"
    S5_CIVIL_AFFAIRS = "s5_civil_affairs"
    S6_COMMUNICATIONS = "s6_communications"
    # --- Specialised staff ---
    TRAINING_STAFF = "training_staff"
    # --- Legacy / non-staff ---
    S5_LIAISON = "s5_liaison"    # Legacy alias → treated as S5
    MEMBER = "member"
    PARTNER = "partner"
    GUEST = "guest"
    PARTNER_ADMIN = "partner_admin"
    RECRUIT = "recruit"


class Permission(str, Enum):
    # Personnel / admin
    MANAGE_USERS = "manage_users"
    VIEW_MEMBERS = "view_members"
    EDIT_MEMBER_TRAINING_FIELDS = "edit_member_training_fields"
    MANAGE_RECRUITMENT = "manage_recruitment"
    MANAGE_LOA = "manage_loa"
    # Operations domain
    MANAGE_OPERATIONS = "manage_operations"
    MANAGE_CAMPAIGNS = "manage_campaigns"
    MANAGE_DEPLOYMENTS = "manage_deployments"
    # Intelligence domain
    MANAGE_INTEL = "manage_intel"
    VIEW_INTEL = "view_intel"
    # Content / communications
    MANAGE_CONTENT = "manage_content"
    MANAGE_ANNOUNCEMENTS = "manage_announcements"
    MANAGE_GALLERY = "manage_gallery"
    # Training
    MANAGE_TRAINING = "manage_training"
    # Partner / civil affairs
    MANAGE_PARTNERS = "manage_partners"
    # Roster
    VIEW_ROSTER = "view_roster"
    # System-level
    VIEW_DASHBOARD = "view_dashboard"
    VIEW_LOGS = "view_logs"
    FULL_ACCESS = "full_access"


# --- Roles that grant access to the Command Center (admin panel) ---
STAFF_ROLES = {
    Role.ADMIN, Role.S1_PERSONNEL,
    Role.S2_INTELLIGENCE, Role.S3_OPERATIONS,
    Role.S4_LOGISTICS, Role.S5_CIVIL_AFFAIRS,
    Role.S6_COMMUNICATIONS, Role.TRAINING_STAFF,
    Role.S5_LIAISON,
}


# --- Permission mapping -------------------------------------------------
# S1 / admin: full access
_S1_PERMISSIONS = set(Permission)

_S2_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_INTEL, Permission.VIEW_INTEL,
    Permission.VIEW_ROSTER,
}

_S3_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS,
    Permission.MANAGE_DEPLOYMENTS, Permission.MANAGE_TRAINING,
    Permission.VIEW_ROSTER, Permission.VIEW_INTEL,
}

_S4_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_DEPLOYMENTS,
    Permission.VIEW_ROSTER, Permission.VIEW_INTEL,
}

_S5_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_PARTNERS,
    Permission.VIEW_ROSTER, Permission.VIEW_INTEL,
}

_S6_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_CONTENT, Permission.MANAGE_ANNOUNCEMENTS,
    Permission.MANAGE_GALLERY,
    Permission.VIEW_ROSTER, Permission.VIEW_INTEL,
}

_TRAINING_STAFF_PERMISSIONS = {
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_TRAINING,
    Permission.VIEW_MEMBERS,
    Permission.EDIT_MEMBER_TRAINING_FIELDS,
    Permission.MANAGE_RECRUITMENT,
    Permission.VIEW_ROSTER,
}

ROLE_PERMISSIONS = {
    Role.ADMIN: _S1_PERMISSIONS,
    Role.S1_PERSONNEL: _S1_PERMISSIONS,
    Role.S2_INTELLIGENCE: _S2_PERMISSIONS,
    Role.S3_OPERATIONS: _S3_PERMISSIONS,
    Role.S4_LOGISTICS: _S4_PERMISSIONS,
    Role.S5_CIVIL_AFFAIRS: _S5_PERMISSIONS,
    Role.S6_COMMUNICATIONS: _S6_PERMISSIONS,
    Role.TRAINING_STAFF: _TRAINING_STAFF_PERMISSIONS,
    Role.S5_LIAISON: _S5_PERMISSIONS,  # Legacy alias
    Role.MEMBER: {Permission.VIEW_ROSTER, Permission.VIEW_INTEL},
    Role.PARTNER: set(),
    Role.PARTNER_ADMIN: set(),
    Role.GUEST: set(),
    Role.RECRUIT: set(),
}

# --- Training Staff field-level restrictions on member profiles ---
# When a training_staff user edits a member profile, only these fields are allowed.
TRAINING_STAFF_ALLOWED_MEMBER_FIELDS = {"awards", "training_history"}


def _resolve_role(role_str: str) -> Role:
    """Resolve a role string to a Role enum, defaulting to MEMBER."""
    try:
        return Role(role_str)
    except ValueError:
        return Role.MEMBER


def has_permission(role_str: str, permission: Permission) -> bool:
    """Check whether a role string grants a specific permission."""
    role = _resolve_role(role_str)
    return permission in ROLE_PERMISSIONS.get(role, set())


def is_staff(role_str: str) -> bool:
    """Return True if the role grants Command Center (admin panel) access."""
    return _resolve_role(role_str) in STAFF_ROLES


def require_permission(permission: Permission):
    """Creates a FastAPI dependency that checks permissions."""
    async def _check(current_user: dict = Depends(get_current_user)):
        role_str = current_user.get("role", "member")
        if not has_permission(role_str, permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission.value}' required"
            )
        return current_user
    return _check


def require_any_permission(*permissions: Permission):
    """Creates a FastAPI dependency that passes if the user has ANY of the listed permissions."""
    async def _check(current_user: dict = Depends(get_current_user)):
        role_str = current_user.get("role", "member")
        for perm in permissions:
            if has_permission(role_str, perm):
                return current_user
        names = ", ".join(p.value for p in permissions)
        raise HTTPException(
            status_code=403,
            detail=f"One of permissions [{names}] required"
        )
    return _check


def require_staff():
    """Creates a FastAPI dependency that requires any staff role (S1–S6 or training_staff)."""
    async def _check(current_user: dict = Depends(get_current_user)):
        if not is_staff(current_user.get("role", "member")):
            raise HTTPException(status_code=403, detail="Staff access required")
        return current_user
    return _check
