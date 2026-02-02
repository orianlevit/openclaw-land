import { Container } from '@cloudflare/containers';
import type { Env } from './types';

/**
 * Bot Instance - extends Container for automatic container management
 */
export class BotInstance extends Container<Env> {
  defaultPort = 18789;
  sleepAfter = '10m';
  enableInternet = true;
  entrypoint = ['/usr/local/bin/start-openclaw.sh'];
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Set environment variables
    this.envVars = {
      OPENCLAW_GATEWAY_TOKEN: `bot-${ctx.id.toString().slice(0, 16)}`,
    };
    
    // Add OpenAI API key if available
    if (env.OPENAI_API_KEY) {
      this.envVars.OPENAI_API_KEY = env.OPENAI_API_KEY;
    }
  }
}
