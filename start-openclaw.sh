#!/bin/bash
# Startup script for OpenClaw in Cloudflare Sandbox
# Based on moltworker's start-moltbot.sh

set -e

# Check if clawdbot gateway is already running - bail early if so
if pgrep -f "clawdbot gateway" > /dev/null 2>&1; then
  echo "OpenClaw gateway is already running, exiting."
  exit 0
fi

# Paths
CONFIG_DIR="/root/.clawdbot"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"

echo "Config directory: $CONFIG_DIR"

# Create config directory
mkdir -p "$CONFIG_DIR"

# Create minimal config if it doesn't exist
if [ ! -f "$CONFIG_FILE" ]; then
  echo "No existing config found, creating minimal config..."
  cat > "$CONFIG_FILE" << 'EOFCONFIG'
{
  "agents": {
    "defaults": {
      "workspace": "/root/clawd"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local"
  }
}
EOFCONFIG
else
  echo "Using existing config"
fi

# ============================================================
# UPDATE CONFIG FROM ENVIRONMENT VARIABLES
# ============================================================
node << 'EOFNODE'
const fs = require('fs');

const configPath = '/root/.clawdbot/clawdbot.json';
console.log('Updating config at:', configPath);
let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.log('Starting with empty config');
}

// Ensure nested objects exist
config.agents = config.agents || {};
config.agents.defaults = config.agents.defaults || {};
config.agents.defaults.model = config.agents.defaults.model || {};
config.gateway = config.gateway || {};

// Gateway configuration
config.gateway.port = 18789;
config.gateway.mode = 'local';
config.gateway.trustedProxies = ['10.1.0.0'];

// Skip token auth for now - just use allowInsecureAuth
// We can add token auth back later once WebSocket proxying is verified

// Allow insecure auth for dev mode
if (process.env.OPENCLAW_DEV_MODE === 'true') {
  config.gateway.controlUi = config.gateway.controlUi || {};
  config.gateway.controlUi.allowInsecureAuth = true;
}

// Default to Anthropic without custom base URL
config.agents.defaults.model.primary = 'anthropic/claude-opus-4-5';

// Write updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration updated successfully');
console.log('Config:', JSON.stringify(config, null, 2));
EOFNODE

# ============================================================
# START GATEWAY
# ============================================================
echo "Starting OpenClaw Gateway..."
echo "Gateway will be available on port 18789"

# Clean up stale lock files
rm -f /tmp/clawdbot-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

BIND_MODE="lan"
echo "Dev mode: ${OPENCLAW_DEV_MODE:-false}, Bind mode: $BIND_MODE"

# For now, run without token to simplify WebSocket connections
# We can add token auth back later once WebSocket proxying is verified
echo "Starting gateway without token (dev mode)..."
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind "$BIND_MODE"
