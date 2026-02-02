#!/bin/bash
# Startup script for OpenClaw in multi-tenant Cloudflare Sandbox

echo "=== Starting OpenClaw container ==="
echo "Environment variables:"
env | grep -E "(OPENAI|OPENCLAW)" || echo "No API keys found"

# Check if gateway is already running
if pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
    echo "OpenClaw gateway is already running, exiting."
    exit 0
fi

CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"

mkdir -p "$CONFIG_DIR"

echo "Creating configuration..."

# Create config from environment variables
cat > "$CONFIG_FILE" << EOF
{
  "agents": {
    "defaults": {
      "workspace": "/root/clawd",
      "model": {
        "primary": "openai/gpt-4o"
      }
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "trustedProxies": ["10.0.0.0/8"],
    "controlUi": {
      "allowInsecureAuth": true
    }
  },
  "channels": {}
}
EOF

echo "Configuration created at $CONFIG_FILE"
cat "$CONFIG_FILE"

# Clean up stale lock files
rm -f /tmp/clawdbot-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Starting OpenClaw Gateway on port 18789..."
echo "clawdbot version:"
clawdbot --version || echo "Failed to get version"

# Start gateway
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan
