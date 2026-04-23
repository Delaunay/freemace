#!/usr/bin/env bash
# FreeMace installer — run with:
#   curl -sSL https://raw.githubusercontent.com/Delaunay/freemace/master/install.sh | bash
#
# Installs to /opt/freemace/ with:
#   .venv/   — Python virtual environment
#   .data/   — JSON data store (git-tracked if configured)
#   config.json — runtime configuration
#
# Safe to re-run: upgrades the package, preserves config and data.
set -euo pipefail

BASE="/opt/freemace"
VENV="$BASE/.venv"
DATA="$BASE/.data"
CONFIG="$BASE/config.json"
SERVICE_FILE="/etc/systemd/system/freemace.service"
PORT="${FREEMACE_PORT:-5002}"
PYTHON_VERSION="3.12"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"

info()  { printf '\033[1;34m=> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!  %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m✗  %s\033[0m\n' "$*"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────

info "Installing FreeMace to $BASE"

if [ ! -d "$BASE" ]; then
    sudo mkdir -p "$BASE"
    sudo chown "$RUN_USER:$RUN_GROUP" "$BASE"
fi

mkdir -p "$DATA"

# ── Stop existing service before upgrade ──────────────────

if sudo systemctl is-active --quiet freemace.service 2>/dev/null; then
    info "Stopping existing service..."
    sudo systemctl stop freemace.service
fi

# Clean up old user-level service if it exists
USER_SERVICE="$HOME/.config/systemd/user/freemace.service"
if [ -f "$USER_SERVICE" ]; then
    warn "Removing old user-level service"
    systemctl --user stop freemace.service 2>/dev/null || true
    systemctl --user disable freemace.service 2>/dev/null || true
    rm -f "$USER_SERVICE"
    systemctl --user daemon-reload 2>/dev/null || true
fi

# ── Install uv if missing ────────────────────────────────

if ! command -v uv &>/dev/null; then
    if [ -x "$HOME/.local/bin/uv" ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        info "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi
ok "uv $(uv --version)"

# ── Create venv & install package ─────────────────────────

NEED_VENV=false
if [ ! -d "$VENV" ]; then
    NEED_VENV=true
elif ! "$VENV/bin/python" --version 2>/dev/null | grep -q "Python $PYTHON_VERSION"; then
    CURRENT=$("$VENV/bin/python" --version 2>/dev/null || echo "missing")
    warn "Existing venv has $CURRENT, need Python $PYTHON_VERSION — recreating"
    rm -rf "$VENV"
    NEED_VENV=true
fi

if $NEED_VENV; then
    info "Creating virtual environment (Python $PYTHON_VERSION)..."
    uv venv --python "$PYTHON_VERSION" "$VENV"
fi

info "Installing/upgrading freemace..."
uv pip install --python "$VENV/bin/python" --upgrade freemace

ok "freemace $($VENV/bin/python -c 'import freemace; print(freemace.__version__)')"

# ── Write default config if missing ──────────────────────

if [ ! -f "$CONFIG" ]; then
    cat > "$CONFIG" <<CONF
{
  "port": $PORT,
  "host": "0.0.0.0",
  "data_dir": "$DATA",
  "git_remote": "",
  "auto_update": false,
  "update_interval_hours": 24
}
CONF
    ok "Created default config at $CONFIG"
else
    ok "Config already exists at $CONFIG (preserved)"
fi

# ── Install systemd service ──────────────────────────────

sudo tee "$SERVICE_FILE" > /dev/null <<SVC
[Unit]
Description=FreeMace budget server
After=network.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
ExecStart=$VENV/bin/freemace --data-dir $DATA --config $CONFIG serve --port $PORT
WorkingDirectory=$BASE
Restart=on-failure
RestartSec=5
Environment=PATH=$VENV/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable freemace.service
sudo systemctl restart freemace.service

ok "Systemd service installed and started"

# ── Done ──────────────────────────────────────────────────

echo ""
ok "FreeMace is running at http://localhost:$PORT"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status freemace     # check status"
echo "    sudo systemctl restart freemace    # restart"
echo "    sudo journalctl -u freemace -f     # view logs"
echo "    $VENV/bin/freemace setup-git <url> # enable git backup"
echo "    $VENV/bin/freemace update          # update to latest"
echo ""
