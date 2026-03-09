#!/bin/bash

# Azimuth Operations Group - Production Deployment Script
# Run this on your Linux server to deploy the application

set -e  # Exit on error

echo "========================================"
echo "AZIMUTH OPERATIONS GROUP"
echo "Production Deployment Script"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/azimuth-ops"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo "📂 Deployment directory: $APP_DIR"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run with sudo${NC}"
    exit 1
fi

# Step 1: Update system packages
echo -e "${GREEN}1. Updating system packages...${NC}"
apt update && apt upgrade -y

# Step 2: Install dependencies
echo -e "${GREEN}2. Installing dependencies...${NC}"
apt install -y python3 python3-pip python3-venv nodejs npm mongodb supervisor nginx certbot python3-certbot-nginx

# Install yarn
npm install -g yarn

# Step 3: Create application directory
echo -e "${GREEN}3. Creating application directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

# Step 4: Clone or copy your code
echo -e "${GREEN}4. Deploying code...${NC}"
echo -e "${YELLOW}⚠️  Make sure your code is in $APP_DIR${NC}"
echo "   You should have already pushed to GitHub and cloned, or uploaded files."
echo ""
read -p "Press Enter to continue after code is in place..."

# Step 5: Backend setup
echo -e "${GREEN}5. Setting up backend...${NC}"
cd $BACKEND_DIR

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Check for .env file
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}❌ Backend .env file not found!${NC}"
    echo "Creating template .env file..."
    cat > $BACKEND_DIR/.env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="azimuth_operations"
JWT_SECRET="CHANGE_THIS_TO_SECURE_RANDOM_STRING"
JWT_ALGORITHM="HS256"
JWT_EXPIRATION_HOURS="24"
CORS_ORIGINS="https://yourdomain.com"
EOF
    echo -e "${YELLOW}⚠️  Please edit $BACKEND_DIR/.env with your actual values${NC}"
    read -p "Press Enter after editing .env..."
fi

deactivate

# Step 6: Frontend setup
echo -e "${GREEN}6. Setting up frontend...${NC}"
cd $FRONTEND_DIR

# Install dependencies
yarn install

# Check for .env file
if [ ! -f "$FRONTEND_DIR/.env" ]; then
    echo -e "${RED}❌ Frontend .env file not found!${NC}"
    echo "Creating template .env file..."
    cat > $FRONTEND_DIR/.env << 'EOF'
REACT_APP_BACKEND_URL="https://yourdomain.com"
REACT_APP_SOCKET_PORT="443"
WDS_SOCKET_PORT="443"
ENABLE_HEALTH_CHECK="false"
EOF
    echo -e "${YELLOW}⚠️  Please edit $FRONTEND_DIR/.env with your actual domain${NC}"
    read -p "Press Enter after editing .env..."
fi

# Build production frontend
echo "Building production frontend..."
yarn build

# Step 7: Configure Supervisor
echo -e "${GREEN}7. Configuring Supervisor...${NC}"
cat > /etc/supervisor/conf.d/azimuth-ops.conf << EOF
[program:azimuth-backend]
command=$BACKEND_DIR/venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001
directory=$BACKEND_DIR
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/azimuth-backend.err.log
stdout_logfile=/var/log/azimuth-backend.out.log
environment=PATH="$BACKEND_DIR/venv/bin"
EOF

supervisorctl reread
supervisorctl update

# Step 8: Configure Nginx
echo -e "${GREEN}8. Configuring Nginx...${NC}"

# Read domain name
read -p "Enter your domain name (e.g., ops.example.com): " DOMAIN
DOMAIN_ESCAPED=$(echo $DOMAIN | sed 's/\./\\./g')

# Create Nginx configuration
cat > /etc/nginx/sites-available/azimuth-ops << EOF
# Redirect www to non-www
server {
    listen 80;
    listen [::]:80;
    server_name www.$DOMAIN;
    return 301 https://$DOMAIN\$request_uri;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# Main HTTPS server (will be configured by Certbot)
server {
    listen 80;
    server_name $DOMAIN;

    root $FRONTEND_DIR/build;
    index index.html;

    # Backend API
    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Static files
    location /static/ {
        alias $FRONTEND_DIR/build/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # React SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/azimuth-ops /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Step 9: SSL Certificate
echo -e "${GREEN}9. Setting up SSL certificate...${NC}"
read -p "Do you want to setup SSL with Certbot? (yes/no): " SSL_CHOICE

if [ "$SSL_CHOICE" == "yes" ]; then
    certbot --nginx -d $DOMAIN
    echo -e "${GREEN}✅ SSL certificate installed${NC}"
else
    echo -e "${YELLOW}⚠️  Skipping SSL setup. You can run it later with:${NC}"
    echo "   sudo certbot --nginx -d $DOMAIN"
fi

# Step 10: Create first admin
echo -e "${GREEN}10. Creating first admin user...${NC}"
read -p "Do you want to create an admin user now? (yes/no): " ADMIN_CHOICE

if [ "$ADMIN_CHOICE" == "yes" ]; then
    cd $APP_DIR/scripts
    python3 create_admin.py
fi

# Step 11: Start services
echo -e "${GREEN}11. Starting services...${NC}"
supervisorctl restart azimuth-backend
systemctl restart nginx

# Step 12: Verification
echo ""
echo "========================================"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo "========================================"
echo ""
echo "🌐 Your site should be live at:"
echo "   https://$DOMAIN"
echo ""
echo "🎛️  Admin panel:"
echo "   https://$DOMAIN/admin"
echo ""
echo "📊 Check service status:"
echo "   sudo supervisorctl status"
echo "   sudo systemctl status nginx"
echo ""
echo "📝 View logs:"
echo "   tail -f /var/log/azimuth-backend.out.log"
echo "   tail -f /var/log/azimuth-backend.err.log"
echo ""
echo "🔄 Restart services:"
echo "   sudo supervisorctl restart azimuth-backend"
echo "   sudo systemctl reload nginx"
echo ""
echo "⚠️  IMPORTANT:"
echo "   1. Update DNS records to point to this server"
echo "   2. Change JWT_SECRET in backend/.env"
echo "   3. Keep your admin credentials secure"
echo ""
