#!/bin/bash
# Minimal test - simple HTTP server to verify container networking works
echo "=== Container Test Starting ==="
echo "Date: $(date)"
echo "Node version: $(node --version)"

# Start a simple HTTP server on port 18789
echo "Starting simple HTTP server on port 18789..."
exec node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    status: 'ok',
    message: 'Container is working!',
    timestamp: new Date().toISOString(),
    node: process.version
  }));
});

server.listen(18789, '0.0.0.0', () => {
  console.log('Test server running on http://0.0.0.0:18789');
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
"
