#!/usr/bin/env python3
"""
25th Infantry Division - Admin Bootstrap Script

Creates or upserts the admin (Bishop) user for production deployment.
Run this once after deploying to create your admin account.
All credentials are accepted at runtime — nothing is hardcoded.

Usage:
    python3 create_admin.py

Requirements:
    pip install motor passlib python-dotenv bcrypt
"""

import sys
import os
from pathlib import Path
from getpass import getpass

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

if not MONGO_URL or not DB_NAME:
    print("ERROR: MONGO_URL and DB_NAME must be set in backend/.env")
    sys.exit(1)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin_user():
    print("=" * 60)
    print("25TH INFANTRY DIVISION - ADMIN BOOTSTRAP")
    print("=" * 60)
    print()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    try:
        # Show existing admins
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "email": 1, "username": 1}).to_list(100)
        if admins:
            print(f"Existing admin(s): {len(admins)}")
            for a in admins:
                print(f"  - {a['username']} ({a['email']})")
            print()

        print("Create / Update Admin User")
        print("-" * 60)

        email = input("Admin email: ").strip()
        if not email:
            print("Email is required.")
            return

        username = input("Admin username [Bishop]: ").strip() or "Bishop"

        password = getpass("Admin password (min 8 chars): ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            return

        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match.")
            return

        rank = input("Rank (optional, e.g. Commander): ").strip() or None
        specialization = input("Specialization (optional): ").strip() or None

        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing:
            # Upsert: promote to admin and reset password
            await db.users.update_one(
                {"email": email},
                {"$set": {
                    "username": username,
                    "password_hash": pwd_context.hash(password),
                    "role": "admin",
                    "is_active": True,
                    **({"rank": rank} if rank else {}),
                    **({"specialization": specialization} if specialization else {}),
                }}
            )
            print()
            print("=" * 60)
            print("EXISTING USER PROMOTED TO ADMIN")
            print("=" * 60)
        else:
            admin_user = {
                "id": str(uuid.uuid4()),
                "email": email,
                "username": username,
                "password_hash": pwd_context.hash(password),
                "role": "admin",
                "rank": rank,
                "specialization": specialization,
                "status": "command",
                "join_date": datetime.now(timezone.utc).isoformat(),
                "is_active": True,
                "discord_id": None,
                "discord_username": None,
                "discord_avatar": None,
                "discord_linked": False,
            }
            await db.users.insert_one(admin_user)
            print()
            print("=" * 60)
            print("ADMIN USER CREATED SUCCESSFULLY")
            print("=" * 60)

        print(f"Email:    {email}")
        print(f"Username: {username}")
        print(f"Role:     admin")
        print()
        print("You can now log in at: https://yourdomain.com/login")
        print("Admin panel is at:     https://yourdomain.com/admin")
        print()
        print("Security reminders:")
        print("  1. Keep your credentials secure")
        print("  2. Change password regularly")
        print("  3. Do not store passwords in source control")
        print()

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(create_admin_user())
