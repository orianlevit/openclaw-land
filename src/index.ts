/**
 * OpenClaw Land - Multi-tenant SaaS for OpenClaw bots
 * 
 * This Worker manages multiple OpenClaw bot instances, each running
 * in its own Cloudflare Container via Durable Objects.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './types';
import { listBots, getBot, createBot, deleteBot } from './bot-registry';

// Re-export the Durable Object class for Cloudflare
export { BotInstance } from './bot-instance';

const app = new Hono<AppEnv>();

// Enable CORS for API routes
app.use('/api/*', cors());

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
  
  // Serve the chat HTML from assets
  const url = new URL(c.req.url);
  url.pathname = '/chat.html';
  url.searchParams.set('botId', botId);
  url.searchParams.set('botName', bot.name);
  
  return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
});

/**
 * Proxy all /bot/:id/* requests to the bot's Durable Object
 */
app.all('/bot/:id/*', async (c) => {
  const botId = c.req.param('id');
  
  // Verify bot exists in registry
  const bot = await getBot(c.env.DB, botId);
  if (!bot) {
    return c.json({ error: 'Bot not found' }, 404);
  }
  
  // Get the Durable Object for this bot
  const doId = c.env.BOT_INSTANCE.idFromName(botId);
  const stub = c.env.BOT_INSTANCE.get(doId);
  
  // Rewrite the URL to remove /bot/:id prefix
  const url = new URL(c.req.url);
  const pathAfterBotId = url.pathname.replace(`/bot/${botId}`, '') || '/';
  url.pathname = pathAfterBotId;
  
  // Forward the request to the Durable Object
  const request = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });
  
  return stub.fetch(request);
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

export default app;
