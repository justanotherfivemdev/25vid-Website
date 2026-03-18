import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from passlib.context import CryptContext
from fastapi.security import HTTPBearer
from pydantic import TypeAdapter, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Upload directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ['JWT_ALGORITHM']
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
EMAIL_VERIFICATION_TTL_HOURS = int(os.environ.get('EMAIL_VERIFICATION_TTL_HOURS', 24))
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = int(os.environ.get('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60))

# Password hashing
IMPORT_EMAIL_ADAPTER = TypeAdapter(EmailStr)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# Auth cookie settings
COOKIE_NAME = "auth_token"
COOKIE_MAX_AGE = JWT_EXPIRATION_HOURS * 3600
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"

FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", SMTP_USERNAME or "no-reply@25thid.local").strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "25th Infantry Division").strip()
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "false").lower() == "true"
EMAIL_DELIVERY_MODE = os.environ.get("EMAIL_DELIVERY_MODE", "smtp" if SMTP_HOST else "log").strip().lower()

# Discord OAuth2 configuration
DISCORD_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.environ.get('DISCORD_REDIRECT_URI')
DISCORD_API_URL = "https://discord.com/api/v10"
DISCORD_SCOPES = "identify email"

# Valyu / Threat Intel configuration
VALYU_API_KEY = os.environ.get("VALYU_API_KEY", "")
VALYU_BASE_URL = "https://api.valyu.ai/v1"
VALYU_CACHE_TTL_MINUTES = int(os.environ.get("VALYU_CACHE_TTL_MINUTES", 360))
VALYU_EVENT_REFRESH_MINUTES = int(os.environ.get("VALYU_EVENT_REFRESH_MINUTES", 360))
VALYU_RATE_LIMIT_SECONDS = int(os.environ.get("VALYU_RATE_LIMIT_SECONDS", 30))
VALYU_COUNTRY_CACHE_HOURS = int(os.environ.get("VALYU_COUNTRY_CACHE_HOURS", 24))
VALYU_MIN_EVENTS_THRESHOLD = int(os.environ.get("VALYU_MIN_EVENTS_THRESHOLD", 20))
EVENT_PRUNE_DAYS = int(os.environ.get("EVENT_PRUNE_DAYS", 15))
OPENAI_INGESTION_INTERVAL_HOURS = int(os.environ.get("OPENAI_INGESTION_INTERVAL_HOURS", 24))
MAX_VALYU_QUERIES_PER_CYCLE = int(os.environ.get("MAX_VALYU_QUERIES_PER_CYCLE", 8))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
