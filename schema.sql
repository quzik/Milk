-- 1. Tables
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT -- Matches your JS 'password' column name
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  user_id INTEGER
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  month TEXT,
  qty REAL,
  rate REAL,
  days TEXT
);

-- 2. Performance Indexes
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_entries_lookup ON entries(month, customer_id);

-- 3. Initial Data
INSERT INTO users (username, password) VALUES ('admin', '1234');
