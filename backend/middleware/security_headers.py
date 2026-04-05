"""
Security headers middleware — FastAPI equivalent of helmet.js.

Sets Content-Security-Policy, Strict-Transport-Security, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, and Permissions-Policy headers on
every HTTP response.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# Paths served by FastAPI's built-in Swagger/ReDoc UI.  These load JS/CSS
# from external CDNs, so we skip the restrictive CSP for them.
_DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json"})


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach hardened security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Prevent click-jacking
        response.headers["X-Frame-Options"] = "DENY"

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Enforce HTTPS via HSTS (1 year, include sub-domains)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        # Referrer policy — send origin only on cross-origin requests
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Content-Security-Policy — restrict resource loading to same origin.
        # FastAPI docs routes need CDN access for Swagger/ReDoc assets, so we
        # use a relaxed policy for those paths.
        if request.url.path in _DOCS_PATHS:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https:; "
                "font-src 'self' data: https://cdn.jsdelivr.net; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "object-src 'none'; "
                "base-uri 'self'"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self' wss: ws:; "
                "frame-ancestors 'none'; "
                "object-src 'none'; "
                "base-uri 'self'"
            )

        # Permissions-Policy — disable unneeded browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(self), payment=()"
        )

        return response
