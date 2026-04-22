CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  month TEXT,
  qty REAL,
  rate REAL,
  old_balance REAL,
  received REAL,
  days TEXT
);

INSERT OR IGNORE INTO users (username, password_hash)
VALUES ('admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
