import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

/** Port that OpenClaw gateway listens on inside the container */
const OPENCLAW_PORT = 18789;

/** Maximum time to wait for gateway to start (3 minutes) */
const STARTUP_TIMEOUT_MS = 180_000;

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
   * Get the container from ctx
   */
  private get container() {
    return (this.ctx as any).container;
  }

  /**
   * Generate a unique gateway token for this bot instance
   */
  private getGatewayToken(): string {
    if (!this.gatewayToken) {
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
      await this.waitForGateway();
      return;
    }

    this.startingUp = true;

    try {
      console.log('[BotInstance] Checking container status...');

      if (!this.container) {
        throw new Error('Container not available');
      }

      // Check if already running
      if (this.container.running) {
        console.log('[BotInstance] Container already running, checking gateway...');
        try {
          const port = this.container.getTcpPort(OPENCLAW_PORT);
          const res = await port.fetch(`http://container:${OPENCLAW_PORT}/`);
          if (res.ok) {
            console.log('[BotInstance] Gateway already responding');
            this.gatewayReady = true;
            return;
          }
        } catch (e) {
          console.log('[BotInstance] Gateway not responding yet');
        }
      } else {
        // Start container
        console.log('[BotInstance] Starting container...');
        const env = this.buildContainerEnv();
        
        this.container.start({
          env,
          entrypoint: ['/usr/local/bin/start-openclaw.sh'],
          enableInternet: true,
        });
      }

      // Wait for gateway
      await this.waitForGateway();
      this.gatewayReady = true;
      console.log('[BotInstance] Gateway is ready');
    } catch (error) {
      console.error('[BotInstance] Failed:', error);
      throw error;
    } finally {
      this.startingUp = false;
    }
  }

  /**
   * Wait for the gateway to be ready
   */
  private async waitForGateway(): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
      try {
        const port = this.container.getTcpPort(OPENCLAW_PORT);
        const res = await port.fetch(`http://container:${OPENCLAW_PORT}/`);
        if (res.ok || res.status === 401 || res.status === 403) {
          // Gateway is responding (even auth errors mean it's up)
          return;
        }
      } catch (e) {
        console.log('[BotInstance] Waiting for gateway...', (e as Error).message);
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

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        gatewayReady: this.gatewayReady,
        containerRunning: this.container?.running ?? false,
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

    // Get port for proxying
    const port = this.container.getTcpPort(OPENCLAW_PORT);

    // Add gateway token
    const proxyUrl = new URL(request.url);
    proxyUrl.hostname = 'container';
    proxyUrl.port = String(OPENCLAW_PORT);
    if (!proxyUrl.searchParams.has('token')) {
      proxyUrl.searchParams.set('token', this.getGatewayToken());
    }

    // Proxy the request
    return port.fetch(proxyUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
  }
}
