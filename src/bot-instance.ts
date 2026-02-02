import { Container } from '@cloudflare/containers';
import type { Env } from './types';

/**
 * Bot Instance - extends Container for automatic container management
 */
export class BotInstance extends Container<Env> {
  defaultPort = 18789;
  sleepAfter = '10m'; // Sleep after 10 minutes of inactivity
  
  // Set environment variables for the container
  override getEnv(): Record<string, string> {
    const env: Record<string, string> = {
      OPENCLAW_GATEWAY_TOKEN: `bot-${this.ctx.id.toString().slice(0, 16)}`,
    };
    
    if (this.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = this.env.OPENAI_API_KEY;
    }
    
    return env;
  }
}
