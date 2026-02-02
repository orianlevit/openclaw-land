#!/bin/bash
# Test startup script - simple HTTP server to verify container works
set -e

echo "=== OpenClaw Container Starting ==="
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Try clawdbot and log output
echo "Testing clawdbot..."
clawdbot --version 2>&1 || echo "clawdbot --version failed"
clawdbot --help 2>&1 | head -10 || echo "clawdbot --help failed"

# Test if clawdbot gateway starts at all
echo "Attempting to start gateway..."

# Start clawdbot gateway and capture output
clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan 2>&1 &
GATEWAY_PID=$!

# Wait a bit and check if it's still running
sleep 5
if kill -0 $GATEWAY_PID 2>/dev/null; then
    echo "Gateway process still running (PID: $GATEWAY_PID)"
    # Keep waiting
    wait $GATEWAY_PID
else
    echo "Gateway process exited"
    exit 1
fi
