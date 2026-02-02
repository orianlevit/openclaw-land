#!/bin/bash
# Startup script for OpenClaw in multi-tenant Cloudflare Sandbox
set -e

# Check if gateway is already running
if pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
    echo "OpenClaw gateway is already running, exiting."
    exit 0
fi

CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"

mkdir -p "$CONFIG_DIR"

# Create minimal config (same as moltworker's fallback)
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << 'EOFCONFIG'
{
  "agents": {
    "defaults": {
      "workspace": "/root/clawd"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "trustedProxies": ["10.1.0.0"]
  }
}
EOFCONFIG
fi

# Clean up stale lock files
rm -f /tmp/clawdbot-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Starting OpenClaw Gateway on port 18789..."
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan
