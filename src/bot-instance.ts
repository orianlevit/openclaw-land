import { Container } from '@cloudflare/containers';
import type { Env } from './types';

/** Port that OpenClaw gateway listens on inside the container */
const OPENCLAW_PORT = 18789;

/**
 * Bot Instance - extends Container for automatic container management
 */
export class BotInstance extends Container<Env> {
  defaultPort = OPENCLAW_PORT;
  sleepAfter = '10m'; // Sleep after 10 minutes of inactivity
  
  // Override to add environment variables when starting
  override async onStart(): Promise<void> {
    const env: Record<string, string> = {};
    
    // Add OpenAI API key if available
    if (this.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = this.env.OPENAI_API_KEY;
    }
    
    // Add a gateway token based on this instance's ID
    env.OPENCLAW_GATEWAY_TOKEN = `bot-${this.ctx.id.toString().slice(0, 16)}`;
    
    this.ctx.container.start({
      env,
      entrypoint: ['/usr/local/bin/start-openclaw.sh'],
      enableInternet: true,
    });
  }
}
