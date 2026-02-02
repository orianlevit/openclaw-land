FROM docker.io/cloudflare/sandbox:0.7.0

# Install Node.js 22 (required by openclaw)
ENV NODE_VERSION=22.13.1
RUN apt-get update && apt-get install -y xz-utils ca-certificates rsync \
    && curl -fsSLk https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version \
    && npm --version

# Install pnpm globally
RUN npm install -g pnpm

# Install openclaw (CLI is still named clawdbot)
RUN npm install -g clawdbot@2026.1.24-3 \
    && clawdbot --version

# Create openclaw directories
RUN mkdir -p /root/.clawdbot \
    && mkdir -p /root/clawd \
    && mkdir -p /root/clawd/skills

# Copy startup script
# Build cache bust: 2026-02-02-v1-moltworker-style
COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

# Set working directory
WORKDIR /root/clawd

# Expose the gateway port
EXPOSE 18789
