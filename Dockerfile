FROM docker.io/cloudflare/sandbox:0.7.0

# Use the base image's Node.js 20 (don't install Node 22)
# This tests if the base image works at all

# Copy startup script
COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

# That's it - minimal test
