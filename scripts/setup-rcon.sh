#!/usr/bin/env bash
# ============================================================
# setup-rcon.sh — Validate and configure RCON connectivity
# ============================================================
#
# Checks firewall rules, Docker port bindings, and runtime host
# resolution so BattlEye RCON works from the panel's RCON tab.
#
# Usage:
#   sudo ./scripts/setup-rcon.sh              # auto-detect & fix
#   sudo ./scripts/setup-rcon.sh --check-only # diagnose without changes
#
# ============================================================
set -euo pipefail

CHECK_ONLY=false
if [[ "${1:-}" == "--check-only" ]]; then
    CHECK_ONLY=true
fi

# ── Colours ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✔${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
fail() { echo -e "  ${RED}✘${NC} $*"; }

ISSUES=0

echo ""
echo "═══════════════════════════════════════════════════"
echo "  25th VID — RCON Setup & Diagnostics"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Check Docker daemon ──────────────────────────────────
echo "▸ Docker daemon"
if command -v docker &>/dev/null; then
    if docker info &>/dev/null; then
        ok "Docker is running"
    else
        fail "Docker daemon is not accessible (try running as root/sudo)"
        ISSUES=$((ISSUES + 1))
    fi
else
    fail "Docker is not installed"
    ISSUES=$((ISSUES + 1))
fi

# ── 2. Configuration ────────────────────────────────────────
BASE_RCON="${SERVER_PORT_BASE_RCON:-19999}"
BLOCK="${SERVER_PORT_BLOCK_SIZE:-10}"
MAX_SERVERS="${MAX_SERVERS:-5}"

RCON_END=$(( BASE_RCON + (MAX_SERVERS - 1) * BLOCK ))

echo ""
echo "▸ Port configuration"
echo "    RCON port range: ${BASE_RCON}–${RCON_END} (UDP)"
echo "    Block size: ${BLOCK}"
echo "    Max servers: ${MAX_SERVERS}"

# ── 3. Firewall checks ─────────────────────────────────────
echo ""
echo "▸ Firewall"

open_ports_ufw() {
    ufw allow "${BASE_RCON}:${RCON_END}/udp" comment "25VID RCON ports" >/dev/null 2>&1
    ok "Opened UDP ${BASE_RCON}:${RCON_END} via ufw"
}

open_ports_firewalld() {
    firewall-cmd --permanent --add-port="${BASE_RCON}-${RCON_END}/udp" >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
    ok "Opened UDP ${BASE_RCON}–${RCON_END} via firewalld"
}

open_ports_iptables() {
    iptables -I INPUT -p udp --dport "${BASE_RCON}:${RCON_END}" -j ACCEPT 2>/dev/null
    ok "Opened UDP ${BASE_RCON}:${RCON_END} via iptables"
}

check_ufw_rule() {
    if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
        if ufw status | grep -qE "${BASE_RCON}.*udp.*ALLOW"; then
            ok "ufw rule exists for RCON port range"
            return 0
        else
            warn "ufw is active but no rule for RCON UDP ports"
            return 1
        fi
    fi
    return 2  # ufw not active
}

check_firewalld_rule() {
    if command -v firewall-cmd &>/dev/null && firewall-cmd --state 2>/dev/null | grep -q "running"; then
        if firewall-cmd --list-ports 2>/dev/null | grep -qE "${BASE_RCON}.*udp"; then
            ok "firewalld rule exists for RCON port range"
            return 0
        else
            warn "firewalld is running but no rule for RCON UDP ports"
            return 1
        fi
    fi
    return 2  # firewalld not active
}

FW_FOUND=false

check_ufw_rule
UFW_RC=$?
if [[ $UFW_RC -eq 1 ]]; then
    FW_FOUND=true
    if [[ "$CHECK_ONLY" == false ]]; then
        open_ports_ufw
    else
        fail "RCON UDP ports not open in ufw (run without --check-only to fix)"
        ISSUES=$((ISSUES + 1))
    fi
elif [[ $UFW_RC -eq 0 ]]; then
    FW_FOUND=true
fi

if [[ "$FW_FOUND" == false ]]; then
    check_firewalld_rule
    FWD_RC=$?
    if [[ $FWD_RC -eq 1 ]]; then
        FW_FOUND=true
        if [[ "$CHECK_ONLY" == false ]]; then
            open_ports_firewalld
        else
            fail "RCON UDP ports not open in firewalld (run without --check-only to fix)"
            ISSUES=$((ISSUES + 1))
        fi
    elif [[ $FWD_RC -eq 0 ]]; then
        FW_FOUND=true
    fi
fi

if [[ "$FW_FOUND" == false ]]; then
    if command -v iptables &>/dev/null; then
        if iptables -L INPUT -n 2>/dev/null | grep -qE "udp.*dpt:${BASE_RCON}"; then
            ok "iptables rule exists for RCON base port"
            FW_FOUND=true
        else
            warn "No iptables rule found for RCON ports"
            if [[ "$CHECK_ONLY" == false ]]; then
                open_ports_iptables
            else
                fail "RCON UDP ports not open (run without --check-only to fix)"
                ISSUES=$((ISSUES + 1))
            fi
            FW_FOUND=true
        fi
    fi
fi

if [[ "$FW_FOUND" == false ]]; then
    warn "No recognized firewall detected — ports may already be open"
fi

# ── 4. Check Docker containers for RCON port publication ────
echo ""
echo "▸ Docker container RCON ports"

if command -v docker &>/dev/null && docker info &>/dev/null; then
    CONTAINERS=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "reforger|arma|25vid" || true)
    if [[ -z "$CONTAINERS" ]]; then
        warn "No running Reforger containers found"
    else
        while IFS= read -r cname; do
            PORTS_JSON=$(docker inspect "$cname" --format='{{json .NetworkSettings.Ports}}' 2>/dev/null || echo "{}")
            if echo "$PORTS_JSON" | grep -qE '"[0-9]+/udp"'; then
                # Check for any RCON-range port
                RCON_PUBLISHED=$(echo "$PORTS_JSON" | grep -oE "\"[0-9]+/udp\"" | tr -d '"' | while read -r p; do
                    PORT_NUM=${p%%/*}
                    if [[ $PORT_NUM -ge $BASE_RCON && $PORT_NUM -le $RCON_END ]]; then
                        echo "$PORT_NUM"
                    fi
                done)
                if [[ -n "$RCON_PUBLISHED" ]]; then
                    ok "${cname}: RCON port ${RCON_PUBLISHED} published"
                else
                    warn "${cname}: No RCON-range port published (may need re-provisioning)"
                    ISSUES=$((ISSUES + 1))
                fi
            else
                warn "${cname}: No UDP ports published"
                ISSUES=$((ISSUES + 1))
            fi
        done <<< "$CONTAINERS"
    fi
fi

# ── 5. Check SERVER_RUNTIME_HOST ────────────────────────────
echo ""
echo "▸ Runtime host resolution"

RUNTIME_HOST="${SERVER_RUNTIME_HOST:-}"
if [[ -n "$RUNTIME_HOST" ]]; then
    ok "SERVER_RUNTIME_HOST is set to: ${RUNTIME_HOST}"
else
    # Check if host.docker.internal resolves
    if getent hosts host.docker.internal &>/dev/null 2>&1; then
        ok "host.docker.internal resolves (will be used automatically)"
    else
        warn "host.docker.internal does not resolve"
        warn "Backend will fall back to 127.0.0.1"
        echo "    If the backend runs in Docker, set SERVER_RUNTIME_HOST=host.docker.internal"
        echo "    and add extra_hosts: [\"host.docker.internal:host-gateway\"] to docker-compose.yml"
    fi
fi

# ── 6. Summary ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
if [[ $ISSUES -eq 0 ]]; then
    echo -e "  ${GREEN}All RCON checks passed.${NC}"
else
    echo -e "  ${YELLOW}${ISSUES} issue(s) found.${NC}"
    if [[ "$CHECK_ONLY" == true ]]; then
        echo "  Run without --check-only to attempt automatic fixes."
    fi
fi
echo "═══════════════════════════════════════════════════"
echo ""
echo "Additional steps:"
echo "  1. Ensure each server has an RCON password in Server Settings → RCON"
echo "  2. Restart the server after changing the RCON password"
echo "  3. Use the RCON tab in the panel and click 'Retry' to re-probe"
echo ""
echo "For detailed information, see: docs/rcon-setup.md"
echo ""

exit $(( ISSUES > 0 ? 1 : 0 ))
