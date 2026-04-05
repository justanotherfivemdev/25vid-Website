#!/usr/bin/env bash
# ============================================================
# authorize-ports.sh — Open firewall ports for 25th ID game servers
# ============================================================
#
# Opens the UDP port ranges needed by dynamically-provisioned
# Arma Reforger Docker containers.  Supports ufw (Ubuntu),
# firewalld (RHEL/CentOS/Fedora), and iptables.
#
# Each provisioned server uses three UDP ports (game, query, RCON).
# Ports are allocated starting from a configurable base and
# incrementing by SERVER_PORT_BLOCK_SIZE for each server.
#
# Usage:
#   sudo ./scripts/authorize-ports.sh              # defaults (5 servers)
#   sudo ./scripts/authorize-ports.sh 10           # open for 10 servers
#   SERVER_PORT_BASE_RCON=20000 ./scripts/authorize-ports.sh
#
# Environment variables (all optional — defaults match config.py):
#   SERVER_PORT_BASE_GAME   — first game port          (default: 2001)
#   SERVER_PORT_BASE_QUERY  — first query/A2S port     (default: 17777)
#   SERVER_PORT_BASE_RCON   — first BattlEye RCON port (default: 19999)
#   SERVER_PORT_BLOCK_SIZE  — increment between servers (default: 10)
#
# ============================================================
set -euo pipefail

# ── Configuration ───────────────────────────────────────────
BASE_GAME="${SERVER_PORT_BASE_GAME:-2001}"
BASE_QUERY="${SERVER_PORT_BASE_QUERY:-17777}"
BASE_RCON="${SERVER_PORT_BASE_RCON:-19999}"
BLOCK="${SERVER_PORT_BLOCK_SIZE:-10}"
MAX_SERVERS="${1:-5}"

# Validate inputs are positive integers
for var_name in BASE_GAME BASE_QUERY BASE_RCON BLOCK MAX_SERVERS; do
    val="${!var_name}"
    if ! [[ "$val" =~ ^[0-9]+$ ]] || [ "$val" -le 0 ]; then
        echo "ERROR: $var_name must be a positive integer (got '$val')" >&2
        exit 1
    fi
done

# ── Compute port ranges ────────────────────────────────────
# Each range covers [BASE, BASE + (MAX_SERVERS - 1) * BLOCK]
GAME_END=$(( BASE_GAME + (MAX_SERVERS - 1) * BLOCK ))
QUERY_END=$(( BASE_QUERY + (MAX_SERVERS - 1) * BLOCK ))
RCON_END=$(( BASE_RCON + (MAX_SERVERS - 1) * BLOCK ))

# Sanity-check port ceiling
for port in "$GAME_END" "$QUERY_END" "$RCON_END"; do
    if [ "$port" -gt 65535 ]; then
        echo "ERROR: Computed port $port exceeds 65535. Reduce MAX_SERVERS or BLOCK." >&2
        exit 1
    fi
done

echo "=== 25th Infantry Division — Game Server Firewall Setup ==="
echo ""
echo "Servers to support : $MAX_SERVERS"
echo "Port block size    : $BLOCK"
echo ""
echo "Game  ports (UDP)  : $BASE_GAME – $GAME_END"
echo "Query ports (UDP)  : $BASE_QUERY – $QUERY_END"
echo "RCON  ports (UDP)  : $BASE_RCON – $RCON_END"
echo ""

# ── Detect firewall backend ────────────────────────────────
FW=""
if command -v ufw &>/dev/null; then
    FW="ufw"
elif command -v firewall-cmd &>/dev/null; then
    FW="firewalld"
elif command -v iptables &>/dev/null; then
    FW="iptables"
else
    echo "WARNING: No supported firewall tool found (ufw, firewalld, iptables)."
    echo "         Listing ports that should be opened manually:"
    echo ""
    echo "  UDP $BASE_GAME:$GAME_END   (game)"
    echo "  UDP $BASE_QUERY:$QUERY_END (query/A2S)"
    echo "  UDP $BASE_RCON:$RCON_END   (BattlEye RCON)"
    exit 0
fi

echo "Detected firewall  : $FW"
echo ""

# ── Apply rules ────────────────────────────────────────────
apply_ufw() {
    local label="$1" from="$2" to="$3"
    echo "  ufw allow $from:$to/udp  ($label)"
    ufw allow "$from:$to/udp" --comment "25vid $label" >/dev/null
}

apply_firewalld() {
    local label="$1" from="$2" to="$3"
    echo "  firewall-cmd --add-port=$from-$to/udp  ($label)"
    firewall-cmd --permanent --add-port="$from-$to/udp" >/dev/null
}

apply_iptables() {
    local label="$1" from="$2" to="$3"
    echo "  iptables -A INPUT -p udp --dport $from:$to -j ACCEPT  ($label)"
    iptables -A INPUT -p udp --dport "$from:$to" \
        -m comment --comment "25vid $label" -j ACCEPT
}

case "$FW" in
    ufw)
        apply_ufw "game"  "$BASE_GAME"  "$GAME_END"
        apply_ufw "query" "$BASE_QUERY" "$QUERY_END"
        apply_ufw "rcon"  "$BASE_RCON"  "$RCON_END"
        echo ""
        echo "Reloading ufw..."
        ufw reload >/dev/null 2>&1 || true
        ;;
    firewalld)
        apply_firewalld "game"  "$BASE_GAME"  "$GAME_END"
        apply_firewalld "query" "$BASE_QUERY" "$QUERY_END"
        apply_firewalld "rcon"  "$BASE_RCON"  "$RCON_END"
        echo ""
        echo "Reloading firewalld..."
        firewall-cmd --reload >/dev/null 2>&1 || true
        ;;
    iptables)
        apply_iptables "game"  "$BASE_GAME"  "$GAME_END"
        apply_iptables "query" "$BASE_QUERY" "$QUERY_END"
        apply_iptables "rcon"  "$BASE_RCON"  "$RCON_END"
        echo ""
        echo "NOTE: iptables rules are not persistent across reboots."
        echo "      Use iptables-save / iptables-persistent to make them permanent."
        ;;
esac

echo ""
echo "Done. Firewall rules applied for up to $MAX_SERVERS game servers."
