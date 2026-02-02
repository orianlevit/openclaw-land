#!/bin/bash
# Test script - simple HTTP server to verify container works
echo "Starting test server..."
node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Container is working!');
});
server.listen(18789, '0.0.0.0', () => {
  console.log('Test server running on port 18789');
});
"
