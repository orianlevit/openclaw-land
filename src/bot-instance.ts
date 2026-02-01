import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

/** Port that OpenClaw gateway listens on inside the container */
const OPENCLAW_PORT = 18789;

/** Maximum time to wait for gateway to start (3 minutes) */
const STARTUP_TIMEOUT_MS = 180_000;

// Container interface for Cloudflare Sandbox
interface Container {
  start(options: { entrypoint: string; args: string[] }): Promise<void>;
  getTcpPort(port: number): Promise<unknown>;
  fetch(request: Request, port: number): Promise<Response>;
}

// Extended state type with container
interface DurableObjectStateWithContainer {
  id: DurableObjectId;
  container?: Container;
}

/**
 * Bot Instance Durable Object
 * 
 * Each bot gets its own DO instance that manages:
 * - Container lifecycle (start/stop)
 * - WebSocket proxying to the container
 * - Health checks
 */
export class BotInstance extends DurableObject<Env> {
  private gatewayReady = false;
  private startingUp = false;
  private gatewayToken: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Get the container from the Durable Object state
   */
  private getContainer(): Container | undefined {
    return (this.ctx as unknown as DurableObjectStateWithContainer).container;
  }

  /**
   * Generate a unique gateway token for this bot instance
   */
  private getGatewayToken(): string {
    if (!this.gatewayToken) {
      // Use the DO ID as part of the token for uniqueness
      this.gatewayToken = `bot-${this.ctx.id.toString().slice(0, 16)}`;
    }
    return this.gatewayToken;
  }

  /**
   * Build environment variables for the container
   */
  private buildContainerEnv(): Record<string, string> {
    const envVars: Record<string, string> = {
      OPENCLAW_GATEWAY_TOKEN: this.getGatewayToken(),
    };

    // Pass through OpenAI API key if set
    if (this.env.OPENAI_API_KEY) {
      envVars.OPENAI_API_KEY = this.env.OPENAI_API_KEY;
    }

    return envVars;
  }

  /**
   * Start the OpenClaw container if not already running
   */
  private async ensureGatewayRunning(): Promise<void> {
    if (this.gatewayReady) {
      return;
    }

    if (this.startingUp) {
      // Wait for existing startup to complete
      await this.waitForGateway();
      return;
    }

    this.startingUp = true;

    try {
      console.log('[BotInstance] Starting OpenClaw container...');

      // Get the container from state
      const container = this.getContainer();
      if (!container) {
        throw new Error('Container not available - ensure containers are configured in wrangler.jsonc');
      }

      // Start the gateway with environment variables
      const env = this.buildContainerEnv();
      const envArgs = Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');

      await container.start({
        entrypoint: '/bin/bash',
        args: ['-c', `${envArgs} /usr/local/bin/start-openclaw.sh`],
      });

      // Wait for gateway to be ready
      await this.waitForGateway();

      this.gatewayReady = true;
      console.log('[BotInstance] OpenClaw gateway is ready');
    } catch (error) {
      console.error('[BotInstance] Failed to start container:', error);
      throw error;
    } finally {
      this.startingUp = false;
    }
  }

  /**
   * Wait for the gateway to be ready by polling the health endpoint
   */
  private async waitForGateway(): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
      try {
        const container = this.getContainer();
        if (!container) {
          throw new Error('Container not available');
        }

        const response = await container.getTcpPort(OPENCLAW_PORT);
        if (response) {
          // Try to connect to verify it's actually ready
          const healthCheck = await container.fetch(
            new Request(`http://localhost:${OPENCLAW_PORT}/api/health`),
            OPENCLAW_PORT
          );
          
          if (healthCheck && healthCheck.ok) {
            return;
          }
        }
      } catch (error) {
        // Gateway not ready yet, continue waiting
        console.log('[BotInstance] Waiting for gateway...', error);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Gateway startup timeout');
  }

  /**
   * Handle HTTP requests to the bot
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log('[BotInstance] Request:', url.pathname);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        gatewayReady: this.gatewayReady 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure gateway is running
    try {
      await this.ensureGatewayRunning();
    } catch (error) {
      console.error('[BotInstance] Gateway startup failed:', error);
      return new Response(JSON.stringify({
        error: 'Gateway startup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const container = this.getContainer();
    if (!container) {
      return new Response('Container not available', { status: 503 });
    }

    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      console.log('[BotInstance] Proxying WebSocket connection');
      
      // Add gateway token to the request
      const wsUrl = new URL(request.url);
      wsUrl.searchParams.set('token', this.getGatewayToken());
      
      const wsRequest = new Request(wsUrl.toString(), {
        headers: request.headers,
      });
      
      return container.fetch(wsRequest, OPENCLAW_PORT);
    }

    // Proxy HTTP request to container
    console.log('[BotInstance] Proxying HTTP request');
    
    // Add gateway token for authenticated requests
    const proxyUrl = new URL(request.url);
    if (!proxyUrl.searchParams.has('token')) {
      proxyUrl.searchParams.set('token', this.getGatewayToken());
    }

    const proxyRequest = new Request(proxyUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return container.fetch(proxyRequest, OPENCLAW_PORT);
  }
}
