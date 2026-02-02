import { Container } from '@cloudflare/containers';
import type { Env } from './types';

/**
 * Bot Instance - extends Container for automatic container management
 */
export class BotInstance extends Container<Env> {
  defaultPort = 18789;
  sleepAfter = '10m';
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Enable internet for the gateway
    this.enableInternet = true;
    
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
