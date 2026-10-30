-- 003_social: roles, friendships, notifications.

-- Users get an admin-or-user role; existing rows default to 'user'.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Undirected friendship edges stored canonically (user_id < friend_id) so a
-- pair has exactly one row. requester_id records who sent the pending request.
CREATE TABLE friendships (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at    INTEGER NOT NULL,
  responded_at  INTEGER,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id < friend_id)
);
CREATE INDEX friendships_user_idx ON friendships(user_id);
CREATE INDEX friendships_friend_idx ON friendships(friend_id);

-- Future notification/inbox system. Payload is a JSON string so the shape can
-- evolve without a migration; type discriminates how it renders.
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('friend-request', 'friend-accepted', 'system')),
  payload     TEXT NOT NULL DEFAULT '{}',
  read_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at);
