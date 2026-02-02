#!/bin/bash
# Minimal startup script for debugging
echo "Starting OpenClaw container..."
echo "Node version: $(node --version)"
echo "Clawdbot version: $(clawdbot --version 2>&1 || echo 'failed')"

# Try to start gateway directly with minimal options
exec clawdbot gateway --port 18789 --verbose --allow-unconfigured --bind lan
