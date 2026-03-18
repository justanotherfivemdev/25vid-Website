from datetime import datetime, timezone
from typing import Optional

from database import db


async def log_audit(user_id: str, action_type: str, resource_type: str,
                    resource_id: Optional[str] = None, before: Optional[dict] = None,
                    after: Optional[dict] = None, metadata: Optional[dict] = None):
    entry = {
        "user_id": user_id,
        "action_type": action_type,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "before": before,
        "after": after,
        "metadata": metadata,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(entry)
    return entry
