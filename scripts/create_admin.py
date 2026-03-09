#!/usr/bin/env python3
"""
Azimuth Operations Group - Admin Bootstrap Script

Creates the first admin user for production deployment.
Run this once after deploying to create your admin account.

Usage:
    python3 create_admin.py
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import uuid
from datetime import datetime, timezone

# Load environment variables
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

# Configuration
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'azimuth_operations')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin_user():
    """Create the first admin user"""
    print("=" * 60)
    print("AZIMUTH OPERATIONS GROUP - ADMIN BOOTSTRAP")
    print("=" * 60)
    print()
    
    # Connect to MongoDB
    print(f"Connecting to MongoDB: {MONGO_URL}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Check if admin already exists
        admin_exists = await db.users.find_one({"role": "admin"})
        if admin_exists:
            print("⚠️  An admin user already exists!")
            print(f"   Email: {admin_exists['email']}")
            print(f"   Username: {admin_exists['username']}")
            print()
            response = input("Do you want to create another admin? (yes/no): ")
            if response.lower() not in ['yes', 'y']:
                print("Aborted.")
                return
        
        print()
        print("Create New Admin User")
        print("-" * 60)
        
        # Get admin details
        email = input("Admin email: ").strip()
        if not email:
            print("❌ Email is required!")
            return
        
        # Check if email exists
        existing = await db.users.find_one({"email": email})
        if existing:
            print(f"❌ User with email {email} already exists!")
            return
        
        username = input("Admin username: ").strip()
        if not username:
            print("❌ Username is required!")
            return
        
        password = input("Admin password (min 8 characters): ").strip()
        if len(password) < 8:
            print("❌ Password must be at least 8 characters!")
            return
        
        confirm_password = input("Confirm password: ").strip()
        if password != confirm_password:
            print("❌ Passwords do not match!")
            return
        
        rank = input("Rank (optional, e.g., Commander): ").strip() or None
        specialization = input("Specialization (optional): ").strip() or None
        
        # Create admin user
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "username": username,
            "password_hash": pwd_context.hash(password),
            "role": "admin",
            "rank": rank,
            "specialization": specialization,
            "join_date": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
        
        await db.users.insert_one(admin_user)
        
        print()
        print("=" * 60)
        print("✅ ADMIN USER CREATED SUCCESSFULLY!")
        print("=" * 60)
        print(f"Email: {email}")
        print(f"Username: {username}")
        print(f"Role: admin")
        if rank:
            print(f"Rank: {rank}")
        if specialization:
            print(f"Specialization: {specialization}")
        print()
        print("🎖️  You can now login to the admin panel at:")
        print("   https://yourdomain.com/admin")
        print()
        print("⚠️  Remember to:")
        print("   1. Keep your credentials secure")
        print("   2. Change password regularly")
        print("   3. Don't share admin access")
        print()
        
    except Exception as e:
        print(f"❌ Error creating admin: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(create_admin_user())
