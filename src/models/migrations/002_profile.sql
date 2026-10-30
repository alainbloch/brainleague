-- 002_profile: account editing (name, avatar) and verified email change.

-- Avatar file path relative to UPLOAD_DIR (storage adapter), nullable.
ALTER TABLE users ADD COLUMN avatar_path TEXT;

-- Pending email-change confirmations. Mirrors kamae's auth_email_changes:
-- the token is stored only as a hash, the change records the credential
-- version at request time so a link cannot be applied after other credential
-- changes, and the row is deleted when confirmed (single-use).
CREATE TABLE email_changes (
  token_hash          TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email           TEXT NOT NULL,
  credential_version  INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL
);
CREATE INDEX email_changes_user_idx ON email_changes(user_id);

-- Rate limits already cover per-IP and per-email; add nothing here.
