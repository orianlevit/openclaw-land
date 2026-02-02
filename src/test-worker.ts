// Minimal test worker - no assets, no hono
export { Sandbox } from '@cloudflare/sandbox';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    console.log('[TEST] Request:', request.method, url.pathname);
    
    if (url.pathname === '/api/test') {
      return new Response(JSON.stringify({ test: 'works', time: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // No assets - just return JSON
    return new Response(JSON.stringify({ 
      error: 'not found', 
      path: url.pathname 
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
