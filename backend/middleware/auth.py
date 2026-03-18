from fastapi import Depends, HTTPException, Request
import jwt

from config import JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME
from database import db


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
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
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def get_current_admin_or_liaison(current_user: dict = Depends(get_current_user)) -> dict:
    """Allow both admin and s5_liaison roles for partner-management endpoints."""
    if current_user.get("role") not in ("admin", "s5_liaison"):
        raise HTTPException(status_code=403, detail="Admin or S-5 Liaison access required")
    return current_user


async def get_current_partner_user(request: Request) -> dict:
    """Extract and validate current partner user from JWT cookie/header."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if payload.get("account_type") != "partner":
            raise HTTPException(status_code=403, detail="Partner access required")
        user = await db.partner_users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Partner user not found")
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account is inactive")
        if user.get("status") != "active":
            raise HTTPException(status_code=403, detail="Account pending approval")
        unit = await db.partner_units.find_one({"id": user["partner_unit_id"]}, {"_id": 0})
        if not unit or unit.get("status") != "active":
            raise HTTPException(status_code=403, detail="Partner unit is not active")
        user["_partner_unit"] = unit
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.exceptions.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_current_partner_admin(partner_user: dict = Depends(get_current_partner_user)) -> dict:
    """Require partner_admin role."""
    if partner_user.get("partner_role") != "partner_admin":
        raise HTTPException(status_code=403, detail="Partner admin access required")
    return partner_user
