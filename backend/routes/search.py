import re

from fastapi import APIRouter, HTTPException, Depends

from database import db
from middleware.auth import get_current_user

router = APIRouter()


@router.get("/search")
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
