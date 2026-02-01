-- Bot registry schema
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT DEFAULT 'active'
);

-- Index for listing bots by creation date
CREATE INDEX IF NOT EXISTS idx_bots_created_at ON bots(created_at DESC);
