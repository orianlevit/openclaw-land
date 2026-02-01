import type { D1Database } from '@cloudflare/workers-types';
import type { Bot } from './types';
import { nanoid } from 'nanoid';

/**
 * Bot Registry - D1 database operations for managing bots
 */

/**
 * List all bots, ordered by creation date (newest first)
 */
export async function listBots(db: D1Database): Promise<Bot[]> {
  const result = await db
    .prepare('SELECT id, name, created_at, status FROM bots ORDER BY created_at DESC')
    .all<Bot>();
  
  return result.results || [];
}

/**
 * Get a single bot by ID
 */
export async function getBot(db: D1Database, id: string): Promise<Bot | null> {
  const result = await db
    .prepare('SELECT id, name, created_at, status FROM bots WHERE id = ?')
    .bind(id)
    .first<Bot>();
  
  return result || null;
}

/**
 * Create a new bot
 */
export async function createBot(db: D1Database, name: string): Promise<Bot> {
  const id = nanoid(12);
  const created_at = Date.now();
  const status = 'active';
  
  await db
    .prepare('INSERT INTO bots (id, name, created_at, status) VALUES (?, ?, ?, ?)')
    .bind(id, name, created_at, status)
    .run();
  
  return { id, name, created_at, status };
}

/**
 * Update bot status
 */
export async function updateBotStatus(
  db: D1Database,
  id: string,
  status: Bot['status']
): Promise<void> {
  await db
    .prepare('UPDATE bots SET status = ? WHERE id = ?')
    .bind(status, id)
    .run();
}

/**
 * Delete a bot
 */
export async function deleteBot(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM bots WHERE id = ?').bind(id).run();
}
