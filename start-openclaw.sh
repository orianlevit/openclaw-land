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

# Create config from environment variables
node << 'EOFNODE'
const fs = require('fs');

const configPath = '/root/.clawdbot/clawdbot.json';
console.log('Creating config at:', configPath);

const config = {
    agents: {
        defaults: {
            workspace: '/root/clawd',
            model: {
                primary: 'anthropic/claude-opus-4-5'
            }
        }
    },
    gateway: {
        port: 18789,
        mode: 'local',
        trustedProxies: ['10.1.0.0'],
        controlUi: {
            allowInsecureAuth: true
        }
    },
    channels: {}
};

// Set gateway token if provided
if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.gateway.auth = { token: process.env.OPENCLAW_GATEWAY_TOKEN };
}

// Configure Anthropic API key if provided
if (process.env.ANTHROPIC_API_KEY) {
    console.log('Configuring Anthropic API key');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration created successfully');
EOFNODE

# Clean up stale lock files
rm -f /tmp/clawdbot-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Starting OpenClaw Gateway on port 18789..."

if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
    echo "Starting gateway with token auth..."
    exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$OPENCLAW_GATEWAY_TOKEN"
else
    echo "Starting gateway without auth (dev mode)..."
    exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan
fi
