#!/usr/bin/env bash
# FreeMace uninstaller — reverses what install.sh set up.
#
# Usage:
#   bash uninstall.sh              # interactive (asks before deleting data)
#   bash uninstall.sh --purge      # removes everything including data & config
#
set -euo pipefail

BASE="/opt/freemace"
VENV="$BASE/.venv"
DATA="$BASE/data"
CONFIG="$BASE/config.json"
SERVICE_FILE="/etc/systemd/system/freemace.service"
USER_SERVICE="$HOME/.config/systemd/user/freemace.service"
SUDOERS_FILE="/etc/sudoers.d/freemace"

PURGE=false
if [[ "${1:-}" == "--purge" ]]; then
    PURGE=true
fi

info()  { printf '\033[1;34m=> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!  %s\033[0m\n' "$*"; }

# ── Stop & remove system-level systemd service ───────────

if sudo systemctl is-active --quiet freemace.service 2>/dev/null; then
    info "Stopping freemace service..."
    sudo systemctl stop freemace.service
    ok "Service stopped"
fi

if sudo systemctl is-enabled --quiet freemace.service 2>/dev/null; then
    info "Disabling freemace service..."
    sudo systemctl disable freemace.service
    ok "Service disabled"
fi

if [ -f "$SERVICE_FILE" ]; then
    info "Removing systemd unit file $SERVICE_FILE"
    sudo rm -f "$SERVICE_FILE"
    sudo systemctl daemon-reload
    ok "Systemd unit removed"
fi

# ── Stop & remove user-level systemd service (legacy) ────

if [ -f "$USER_SERVICE" ]; then
    info "Removing user-level service $USER_SERVICE"
    systemctl --user stop freemace.service 2>/dev/null || true
    systemctl --user disable freemace.service 2>/dev/null || true
    rm -f "$USER_SERVICE"
    systemctl --user daemon-reload 2>/dev/null || true
    ok "User-level service removed"
fi

# ── Remove sudoers rule if present ───────────────────────

if [ -f "$SUDOERS_FILE" ]; then
    info "Removing sudoers rule $SUDOERS_FILE"
    sudo rm -f "$SUDOERS_FILE"
    ok "Sudoers rule removed"
fi

# ── Remove venv ──────────────────────────────────────────

if [ -d "$VENV" ]; then
    info "Removing virtual environment $VENV"
    rm -rf "$VENV"
    ok "Virtual environment removed"
fi

# ── Handle data & config ─────────────────────────────────

if $PURGE; then
    if [ -d "$BASE" ]; then
        info "Purging entire $BASE directory (including data & config)..."
        sudo rm -rf "$BASE"
        ok "All files removed"
    fi
else
    if [ -d "$DATA" ] || [ -f "$CONFIG" ]; then
        warn "Keeping data ($DATA) and config ($CONFIG)"
        warn "Run with --purge to remove everything, or delete manually:"
        echo "    sudo rm -rf $BASE"
    elif [ -d "$BASE" ]; then
        info "Removing $BASE (no data or config found)"
        sudo rm -rf "$BASE"
        ok "Directory removed"
    fi
fi

# ── Done ─────────────────────────────────────────────────

echo ""
ok "FreeMace has been uninstalled"
if ! $PURGE && [ -d "$BASE" ]; then
    echo "  Note: $BASE still contains your data/config."
    echo "  To remove: sudo rm -rf $BASE"
fi
echo ""
