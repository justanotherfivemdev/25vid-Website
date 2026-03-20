"""
Structured error logging service for the Command Center.

Captures application errors with rich context (stack traces, request details,
deployment/ADSB metadata) into the `error_logs` MongoDB collection so admins
can diagnose issues directly from the UI.
"""

import logging
import traceback
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from database import db

logger = logging.getLogger(__name__)

# Severity levels (ascending)
SEVERITY_LEVELS = ["debug", "info", "warning", "error", "critical"]


async def log_error(
    source: str,
    message: str,
    severity: str = "error",
    error_type: Optional[str] = None,
    stack_trace: Optional[str] = None,
    request_path: Optional[str] = None,
    request_method: Optional[str] = None,
    request_body: Optional[dict] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    """
    Store an error entry in the error_logs collection.

    Parameters
    ----------
    source : str
        Module or subsystem that raised the error (e.g. "deployment", "adsb",
        "auth", "frontend").
    message : str
        Human-readable error description.
    severity : str
        One of debug / info / warning / error / critical.
    error_type : str, optional
        Exception class name (e.g. "ValidationError").
    stack_trace : str, optional
        Full Python traceback or JS stack.
    request_path : str, optional
        API endpoint path (e.g. "/api/admin/map/deployments").
    request_method : str, optional
        HTTP method (GET/POST/PUT/DELETE).
    request_body : dict, optional
        Sanitised request payload (secrets stripped).
    user_id : str, optional
        Authenticated user who triggered the error.
    metadata : dict, optional
        Arbitrary context (deployment_id, aircraft_id, etc.).
    """
    if severity not in SEVERITY_LEVELS:
        severity = "error"

    entry = {
        "id": f"err_{uuid4().hex[:12]}",
        "source": source,
        "message": str(message)[:2000],  # cap message length
        "severity": severity,
        "error_type": error_type,
        "stack_trace": str(stack_trace)[:5000] if stack_trace else None,
        "request_path": request_path,
        "request_method": request_method,
        "request_body": _sanitise_body(request_body),
        "user_id": user_id,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "resolved": False,
    }

    try:
        await db.error_logs.insert_one(entry)
    except Exception as exc:
        # Last-resort: log to stdout so we never silently swallow errors
        logger.error("Failed to persist error log: %s — original: %s", exc, message)

    return entry


async def log_exception(
    source: str,
    exc: Exception,
    *,
    request_path: Optional[str] = None,
    request_method: Optional[str] = None,
    request_body: Optional[dict] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    severity: str = "error",
) -> dict:
    """Convenience wrapper that extracts info from an Exception object."""
    return await log_error(
        source=source,
        message=str(exc),
        severity=severity,
        error_type=type(exc).__name__,
        stack_trace=traceback.format_exc(),
        request_path=request_path,
        request_method=request_method,
        request_body=request_body,
        user_id=user_id,
        metadata=metadata,
    )


def _sanitise_body(body: Optional[dict]) -> Optional[dict]:
    """Strip sensitive fields from request payloads before persisting."""
    if not body or not isinstance(body, dict):
        return body
    sensitive_keys = {"password", "token", "secret", "jwt", "cookie",
                      "authorization", "access_token", "refresh_token"}
    return {
        k: "***" if k.lower() in sensitive_keys else v
        for k, v in body.items()
    }
