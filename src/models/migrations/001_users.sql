-- 001_users: user accounts and authentication tables.
-- Schema follows the kamae account model: email-verified registration,
-- opaque hashed sessions, single-purpose tokens, credential-version revocation,
-- and per-key rate limiting. Column types are chosen for SQLite.

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash       TEXT NOT NULL,
  credential_version  INTEGER NOT NULL DEFAULT 0,
  email_verified_at   INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

CREATE TABLE tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at  INTEGER NOT NULL
);
CREATE INDEX tokens_user_idx ON tokens(user_id);

CREATE TABLE rate_limits (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
