import type { R2Bucket, D1Database, Fetcher, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

/**
 * Bot data stored in D1
 */
export interface Bot {
  id: string;
  name: string;
  created_at: number;
  status: 'active' | 'inactive' | 'error';
}

/**
 * Environment bindings for the OpenClaw Land Worker
 */
export interface Env {
  // Durable Object for bot instances (Sandbox type)
  // Using any to avoid circular type instantiation
  BOT_INSTANCE: DurableObjectNamespace<Sandbox<any>>;
  
  // D1 database for bot registry
  DB: D1Database;
  
  // R2 bucket for bot data persistence (optional)
  BOT_BUCKET?: R2Bucket;
  
  // Static assets
  ASSETS: Fetcher;
  
  // API keys for all bots (platform-provided)
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  
  // Development mode (skips auth)
  DEV_MODE?: string;
}

/**
 * Hono app environment type
 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    botId?: string;
  };
};

/**
 * Message format for WebSocket communication
 */
export interface WSMessage {
  type: 'chat' | 'status' | 'error';
  content?: string;
  error?: string;
}

/**
 * API response types
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BotListResponse {
  bots: Bot[];
}

export interface BotCreateRequest {
  name: string;
}

export interface BotCreateResponse {
  bot: Bot;
}
