-- Run with: wrangler d1 execute milk-management-db --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL          -- SHA-256 hex of password
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL             -- datetime('now') — expires after 24h
);

CREATE TABLE IF NOT EXISTS customers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  month       TEXT    NOT NULL,           -- e.g. "1" through "12"
  qty         REAL    NOT NULL DEFAULT 0,
  rate        REAL    NOT NULL DEFAULT 0,
  old_balance REAL    NOT NULL DEFAULT 0,
  received    REAL    NOT NULL DEFAULT 0,
  days        TEXT    NOT NULL DEFAULT '[]' -- JSON array
);

-- Seed a first user (password: "changeme" — replace hash before deploying)
-- To generate a hash: echo -n "yourpassword" | sha256sum
INSERT OR IGNORE INTO users (username, password_hash)
VALUES (
  'admin',
  '7f4a2f5c3b6d8e9a1c2f5e7b4a6d8c9e1f2a5b7c4d6e8f9a1b3c5d7e9f1a2b4' -- replace this
);
