#!/bin/bash
# Startup script for OpenClaw gateway
set -e

echo "=== OpenClaw Container Starting ==="
echo "Node version: $(node --version)"
echo "Checking clawdbot..."
clawdbot --version || echo "clawdbot version failed"

# Create minimal config
CONFIG_DIR="/root/.clawdbot"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/clawdbot.json" << 'EOF'
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
EOF

echo "Config created"
cat "$CONFIG_DIR/clawdbot.json"

# Clean up any stale files
rm -f /tmp/clawdbot-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Starting gateway..."
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan
