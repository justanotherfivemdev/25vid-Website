"""Email service - currently feature-flagged OFF.

All email verification is disabled in the current deployment.
This module exists for future re-enablement.
"""
from services.auth_service import send_email_message, send_verification_email

__all__ = ["send_email_message", "send_verification_email"]
