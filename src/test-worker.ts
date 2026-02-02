// Minimal test worker
export { Sandbox } from '@cloudflare/sandbox';

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    
    console.log('[TEST] Request:', request.method, url.pathname);
    
    if (url.pathname === '/api/test') {
      return new Response(JSON.stringify({ test: 'works', time: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fall back to assets
    return env.ASSETS.fetch(request);
  }
};
