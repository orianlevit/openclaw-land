/**
 * OpenClaw Land - Multi-tenant SaaS for OpenClaw bots
 * 
 * This Worker manages multiple OpenClaw bot instances, each running
 * in its own Cloudflare Container via the Sandbox SDK.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSandbox, type Sandbox, type Process } from '@cloudflare/sandbox';
import type { AppEnv, Env } from './types';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { listBots, getBot, createBot, deleteBot } from './bot-registry';

// Re-export the Sandbox class for Cloudflare
export { Sandbox } from '@cloudflare/sandbox';

const OPENCLAW_PORT = 18789;
const STARTUP_TIMEOUT_MS = 120_000; // 2 minutes for gateway startup

const app = new Hono<AppEnv>();

// TEST: Very first route to verify routing works
app.get('/test-route', (c) => {
  return c.text('TEST ROUTE WORKS!');
});

// Log all requests
app.use('*', async (c, next) => {
  console.log('[Worker] Request:', c.req.method, c.req.url);
  await next();
  console.log('[Worker] Response status:', c.res.status);
});

// Enable CORS for API routes
app.use('/api/*', cors());

// =============================================================================
// Gateway Process Management (like moltworker's approach)
// =============================================================================

/**
 * Find an existing OpenClaw gateway process
 */
async function findExistingGatewayProcess(sandbox: Sandbox<Env>): Promise<Process | null> {
  try {
    const processes = await sandbox.listProcesses();
    for (const proc of processes) {
      const isGatewayProcess = 
        proc.command.includes('start-openclaw.sh') ||
        proc.command.includes('clawdbot gateway');
      
      if (isGatewayProcess) {
        if (proc.status === 'starting' || proc.status === 'running') {
          return proc;
        }
      }
    }
  } catch (e) {
    console.log('[Gateway] Could not list processes:', e);
  }
  return null;
}

/**
 * Build environment variables for the gateway
 * Following moltworker's pattern: pass API keys and gateway token to container
 */
function buildEnvVars(env: Env, botId: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  // Pass API keys
  if (env.ANTHROPIC_API_KEY) {
    envVars.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }
  if (env.OPENAI_API_KEY) {
    envVars.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }
  
  // Generate a gateway token for this bot
  envVars.OPENCLAW_GATEWAY_TOKEN = `bot-${botId.slice(0, 16)}`;
  
  // Enable dev mode for easier testing
  envVars.OPENCLAW_DEV_MODE = 'true';
  
  return envVars;
}

/**
 * Ensure the OpenClaw gateway is running
 */
async function ensureOpenClawGateway(sandbox: Sandbox<Env>, env: Env, botId: string): Promise<Process> {
  // Check if gateway is already running
  const existingProcess = await findExistingGatewayProcess(sandbox);
  if (existingProcess) {
    console.log('[Gateway] Found existing process:', existingProcess.id, 'status:', existingProcess.status);
    
    try {
      console.log('[Gateway] Waiting for port', OPENCLAW_PORT, 'timeout:', STARTUP_TIMEOUT_MS);
      await existingProcess.waitForPort(OPENCLAW_PORT, { mode: 'tcp', timeout: STARTUP_TIMEOUT_MS });
      console.log('[Gateway] Gateway is reachable');
      return existingProcess;
    } catch (e) {
      console.log('[Gateway] Existing process not reachable, killing and restarting...');
      try {
        await existingProcess.kill();
      } catch (killError) {
        console.log('[Gateway] Failed to kill process:', killError);
      }
    }
  }
  
  // Start a new gateway
  console.log('[Gateway] Starting new OpenClaw gateway...');
  const envVars = buildEnvVars(env, botId);
  const command = '/usr/local/bin/start-openclaw.sh';
  
  console.log('[Gateway] Starting with command:', command);
  console.log('[Gateway] Environment vars:', Object.keys(envVars));
  
  let process: Process;
  try {
    process = await sandbox.startProcess(command, {
      env: Object.keys(envVars).length > 0 ? envVars : undefined,
    });
    console.log('[Gateway] Process started with id:', process.id, 'status:', process.status);
  } catch (startErr) {
    console.error('[Gateway] Failed to start process:', startErr);
    throw startErr;
  }
  
  // Wait for the gateway to be ready
  try {
    console.log('[Gateway] Waiting for gateway on port', OPENCLAW_PORT);
    await process.waitForPort(OPENCLAW_PORT, { mode: 'tcp', timeout: STARTUP_TIMEOUT_MS });
    console.log('[Gateway] Gateway is ready!');
    
    const logs = await process.getLogs();
    if (logs.stdout) console.log('[Gateway] stdout:', logs.stdout);
    if (logs.stderr) console.log('[Gateway] stderr:', logs.stderr);
  } catch (e) {
    console.error('[Gateway] waitForPort failed:', e);
    try {
      const logs = await process.getLogs();
      console.error('[Gateway] startup failed. Stderr:', logs.stderr);
      console.error('[Gateway] startup failed. Stdout:', logs.stdout);
      throw new Error(`OpenClaw gateway failed to start. Stderr: ${logs.stderr || '(empty)'}`);
    } catch (logErr) {
      console.error('[Gateway] Failed to get logs:', logErr);
      throw e;
    }
  }
  
  return process;
}

// =============================================================================
// Debug endpoint to test container
// =============================================================================

// Simple ping to verify Worker is running
app.get('/api/ping', async (c) => {
  return c.json({ pong: true, time: Date.now() });
});

app.get('/api/debug/container/:id', async (c) => {
  const botId = c.req.param('id');
  
  console.log('[Debug] Testing container for bot:', botId);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sandbox = getSandbox(c.env.BOT_INSTANCE as any, botId);
  
  try {
    console.log('[Debug] Running exec command...');
    // Test if clawdbot is installed and show current processes
    const result = await sandbox.exec('clawdbot --version && ls -la /usr/local/bin/start-openclaw.sh && cat /usr/local/bin/start-openclaw.sh | head -20');
    console.log('[Debug] Exec result:', JSON.stringify(result));
    
    return c.json({
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (error) {
    console.error('[Debug] Exec failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// =============================================================================
// API Routes
// =============================================================================

/**
 * List all bots
 */
app.get('/api/bots', async (c) => {
  try {
    const bots = await listBots(c.env.DB);
    return c.json({ success: true, data: { bots } });
  } catch (error) {
    console.error('[API] Failed to list bots:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to list bots' 
    }, 500);
  }
});

/**
 * Create a new bot
 */
app.post('/api/bots', async (c) => {
  try {
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim() || `Bot ${Date.now()}`;
    
    if (name.length > 50) {
      return c.json({ 
        success: false, 
        error: 'Bot name must be 50 characters or less' 
      }, 400);
    }
    
    const bot = await createBot(c.env.DB, name);
    return c.json({ success: true, data: { bot } }, 201);
  } catch (error) {
    console.error('[API] Failed to create bot:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to create bot' 
    }, 500);
  }
});

/**
 * Get a single bot
 */
app.get('/api/bots/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const bot = await getBot(c.env.DB, id);
    
    if (!bot) {
      return c.json({ 
        success: false, 
        error: 'Bot not found' 
      }, 404);
    }
    
    return c.json({ success: true, data: { bot } });
  } catch (error) {
    console.error('[API] Failed to get bot:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to get bot' 
    }, 500);
  }
});

/**
 * Delete a bot
 */
app.delete('/api/bots/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const bot = await getBot(c.env.DB, id);
    
    if (!bot) {
      return c.json({ 
        success: false, 
        error: 'Bot not found' 
      }, 404);
    }
    
    await deleteBot(c.env.DB, id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete bot:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to delete bot' 
    }, 500);
  }
});

// =============================================================================
// Bot Routes
// =============================================================================

/**
 * Bot chat page - serve the chat UI (MUST come before wildcard)
 */
app.get('/bot/:id', async (c) => {
  const botId = c.req.param('id');
  
  // Verify bot exists
  const bot = await getBot(c.env.DB, botId);
  if (!bot) {
    return c.redirect('/');
  }
  
  // Fetch the chat.html from assets
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/chat.html';
  const assetResponse = await c.env.ASSETS.fetch(new Request(assetUrl.toString()));
  
  // Return the HTML content directly (don't redirect)
  const html = await assetResponse.text();
  return c.html(html);
});

/**
 * Proxy all /bot/:id/* requests to the bot's container
 */
app.all('/bot/:id/*', async (c) => {
  const botId = c.req.param('id');
  const request = c.req.raw;
  const url = new URL(request.url);
  
  // Verify bot exists in registry
  const bot = await getBot(c.env.DB, botId);
  if (!bot) {
    return c.json({ error: 'Bot not found' }, 404);
  }
  
  // Get sandbox for this bot (using botId as the instance name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sandbox = getSandbox(c.env.BOT_INSTANCE as any, botId);
  
  // Check if this is a WebSocket request
  const isWebSocketRequest = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  
  // Check if gateway is already running
  const existingProcess = await findExistingGatewayProcess(sandbox);
  const isGatewayReady = existingProcess !== null && existingProcess.status === 'running';
  
  // For non-WebSocket requests when gateway isn't ready, show loading and start in background
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
  if (!isGatewayReady && !isWebSocketRequest && acceptsHtml) {
    console.log('[Proxy] Gateway not ready, serving loading response');
    
    // Start the gateway in the background
    c.executionCtx.waitUntil(
      ensureOpenClawGateway(sandbox, c.env, botId).catch((err: Error) => {
        console.error('[Proxy] Background gateway start failed:', err);
      })
    );
    
    return c.json({ 
      status: 'starting', 
      message: 'Bot container is starting...' 
    }, 202);
  }
  
  // Ensure gateway is running
  try {
    await ensureOpenClawGateway(sandbox, c.env, botId);
  } catch (error) {
    console.error('[Proxy] Failed to start gateway:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({
      error: 'OpenClaw gateway failed to start',
      details: errorMessage,
    }, 503);
  }
  
  // Rewrite the URL to remove /bot/:id prefix
  const pathAfterBotId = url.pathname.replace(`/bot/${botId}`, '') || '/';
  url.pathname = pathAfterBotId;
  
  // Create new request with modified URL
  const proxyRequest = new Request(url.toString(), request);
  
  // Handle WebSocket connections
  if (isWebSocketRequest) {
    console.log('[WS] Proxying WebSocket connection');
    return sandbox.wsConnect(proxyRequest, OPENCLAW_PORT);
  }
  
  // Handle HTTP requests
  console.log('[HTTP] Proxying:', url.pathname + url.search);
  return sandbox.containerFetch(proxyRequest, OPENCLAW_PORT);
});

// =============================================================================
// Static Assets (Landing page, Chat UI)
// =============================================================================

/**
 * Serve static assets for everything else
 */
app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// Export Workers handler - use arrow function to preserve context
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
};
