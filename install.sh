#!/usr/bin/env bash
# FreeMace installer — run with: curl -sSL <raw-url>/install.sh | bash
#
# Installs to /opt/freemace/ with:
#   .venv/   — Python virtual environment
#   .data/   — JSON data store (git-tracked if configured)
#   config.json — runtime configuration
#
# Creates a systemd user service: freemace.service
set -euo pipefail

BASE="/opt/freemace"
VENV="$BASE/.venv"
DATA="$BASE/.data"
CONFIG="$BASE/config.json"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/freemace.service"
PORT="${FREEMACE_PORT:-5002}"

info()  { printf '\033[1;34m=> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!  %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m✗  %s\033[0m\n' "$*"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────

info "Installing FreeMace to $BASE"

if [ ! -d "$BASE" ]; then
    sudo mkdir -p "$BASE"
    sudo chown "$(id -u):$(id -g)" "$BASE"
fi

mkdir -p "$DATA"

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

if [ ! -d "$VENV" ]; then
    info "Creating virtual environment..."
    uv venv "$VENV"
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
  "auto_update": true,
  "update_interval_hours": 24
}
CONF
    ok "Created default config at $CONFIG"
else
    ok "Config already exists at $CONFIG"
fi

# ── Install systemd service ──────────────────────────────

mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_FILE" <<SVC
[Unit]
Description=FreeMace budget server
After=network.target

[Service]
Type=simple
ExecStart=$VENV/bin/freemace serve --port $PORT --data-dir $DATA --config $CONFIG
WorkingDirectory=$BASE
Restart=on-failure
RestartSec=5
Environment=PATH=$VENV/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
SVC

systemctl --user daemon-reload
systemctl --user enable freemace.service
systemctl --user restart freemace.service

ok "Systemd service installed and started"

# ── Done ──────────────────────────────────────────────────

echo ""
ok "FreeMace is running at http://localhost:$PORT"
echo ""
echo "  Useful commands:"
echo "    systemctl --user status freemace    # check status"
echo "    systemctl --user restart freemace   # restart"
echo "    journalctl --user -u freemace -f    # view logs"
echo "    $VENV/bin/freemace setup-git <url>  # enable git backup"
echo "    $VENV/bin/freemace update           # update to latest"
echo ""
