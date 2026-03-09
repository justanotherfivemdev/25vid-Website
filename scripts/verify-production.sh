#!/bin/bash

# Azimuth Operations Group - Production Verification Script
# Tests all production requirements

echo "🎖️  AZIMUTH OPERATIONS GROUP - PRODUCTION VERIFICATION"
echo "========================================================"
echo ""

# Configuration
DOMAIN="${1:-yourdomain.com}"
API_URL="https://$DOMAIN/api"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASS++))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAIL++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "Testing domain: $DOMAIN"
echo ""

# 1. DNS Resolution
echo "1️⃣  DNS Resolution"
if host $DOMAIN > /dev/null 2>&1; then
    IP=$(host $DOMAIN | grep "has address" | awk '{print $4}' | head -1)
    check_pass "Domain resolves to: $IP"
else
    check_fail "Domain does not resolve"
fi
echo ""

# 2. WWW Redirect
echo "2️⃣  WWW Redirect"
WWW_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" -L "http://www.$DOMAIN" 2>/dev/null)
if [ "$WWW_REDIRECT" == "301" ] || [ "$WWW_REDIRECT" == "200" ]; then
    check_pass "WWW redirect working"
else
    check_warn "WWW redirect not configured (got $WWW_REDIRECT)"
fi
echo ""

# 3. HTTPS
echo "3️⃣  HTTPS Configuration"
HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN" 2>/dev/null)
if [ "$HTTPS_CODE" == "200" ]; then
    check_pass "HTTPS works (200 OK)"
else
    check_fail "HTTPS failed (got $HTTPS_CODE)"
fi
echo ""

# 4. HTTP to HTTPS Redirect
echo "4️⃣  HTTP to HTTPS Redirect"
HTTP_REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" "http://$DOMAIN" 2>/dev/null)
if [[ "$HTTP_REDIRECT" == https://* ]]; then
    check_pass "HTTP redirects to HTTPS"
else
    check_warn "HTTP to HTTPS redirect may not be configured"
fi
echo ""

# 5. API Endpoint
echo "5️⃣  Backend API"
API_RESPONSE=$(curl -s "$API_URL/" 2>/dev/null)
if echo "$API_RESPONSE" | grep -q "Azimuth"; then
    check_pass "API endpoint responding correctly"
else
    check_fail "API endpoint not responding properly"
fi
echo ""

# 6. Frontend Loading
echo "6️⃣  Frontend Loading"
FRONTEND_CONTENT=$(curl -s "https://$DOMAIN" 2>/dev/null)
if echo "$FRONTEND_CONTENT" | grep -q "AZIMUTH"; then
    check_pass "Frontend loads with correct content"
else
    check_fail "Frontend not loading correctly"
fi
echo ""

# 7. SPA Routing
echo "7️⃣  SPA Route Handling"
LOGIN_PAGE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/login" 2>/dev/null)
ADMIN_PAGE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/admin" 2>/dev/null)
if [ "$LOGIN_PAGE" == "200" ] && [ "$ADMIN_PAGE" == "200" ]; then
    check_pass "SPA routes work correctly"
else
    check_fail "SPA routes not working (login: $LOGIN_PAGE, admin: $ADMIN_PAGE)"
fi
echo ""

# 8. SSL Certificate
echo "8️⃣  SSL Certificate"
SSL_EXPIRY=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep "notAfter" | cut -d= -f2)
if [ ! -z "$SSL_EXPIRY" ]; then
    check_pass "SSL certificate valid until: $SSL_EXPIRY"
else
    check_warn "Could not verify SSL certificate"
fi
echo ""

# 9. Mixed Content Check
echo "9️⃣  Mixed Content Check"
MIXED_CONTENT=$(curl -s "https://$DOMAIN" | grep -o 'http://[^"]*' | grep -v "http://www.w3.org" | wc -l)
if [ "$MIXED_CONTENT" -eq "0" ]; then
    check_pass "No mixed content detected"
else
    check_warn "Possible mixed content detected ($MIXED_CONTENT instances)"
fi
echo ""

# 10. Backend Health
echo "🔟 Backend Service Health"
if supervisorctl status azimuth-backend 2>/dev/null | grep -q "RUNNING"; then
    check_pass "Backend service running"
else
    check_warn "Cannot verify backend service status (need sudo)"
fi
echo ""

# 11. MongoDB Connection
echo "1️⃣1️⃣  Database Connection"
MONGO_USERS=$(mongo azimuth_operations --quiet --eval "db.users.countDocuments()" 2>/dev/null)
if [ ! -z "$MONGO_USERS" ]; then
    check_pass "MongoDB connected ($MONGO_USERS users in database)"
else
    check_warn "Cannot verify MongoDB connection (need access)"
fi
echo ""

# 12. Auth Endpoints
echo "1️⃣2️⃣  Authentication Endpoints"
AUTH_TEST=$(curl -s -X POST "$API_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"test","password":"test"}' 2>/dev/null)
if echo "$AUTH_TEST" | grep -q "detail"; then
    check_pass "Auth endpoints responding"
else
    check_fail "Auth endpoints not responding"
fi
echo ""

# Summary
echo "========================================================"
echo "📊 VERIFICATION SUMMARY"
echo "========================================================"
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo "Your production deployment appears to be working correctly."
    exit 0
else
    echo -e "${YELLOW}⚠️  Some checks failed or need attention.${NC}"
    echo "Review the failures above and fix them."
    exit 1
fi
