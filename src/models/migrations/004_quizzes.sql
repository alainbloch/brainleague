-- 004_quizzes: timed aptitude-test domain.
--
-- Timed practice tests (PI Cognitive Assessment first, more later) in the
-- model used by the quizzes feature: a test type owns a bank of multiple-choice
-- questions, each tagged with a category and an expected solve time. Difficulty
-- is NOT an explicit label — est_seconds is the proxy used to arrange questions
-- easier-to-harder (see platform design rules).

CREATE TABLE test_types (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  publisher        TEXT NOT NULL,
  question_count   INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  no_going_back    INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL
);

-- Optional timed parts within a test (e.g. IBEW algebra + reading). PI
-- Cognitive is a single-part test and leaves this empty.
CREATE TABLE sections (
  id               TEXT PRIMARY KEY,
  test_type_id     TEXT NOT NULL REFERENCES test_types(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  position         INTEGER NOT NULL,
  question_count   INTEGER NOT NULL,
  duration_seconds INTEGER
);
CREATE INDEX sections_test_type_idx ON sections(test_type_id);

CREATE TABLE question_categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE questions (
  id            TEXT PRIMARY KEY,
  test_type_id  TEXT NOT NULL REFERENCES test_types(id) ON DELETE CASCADE,
  section_id    TEXT REFERENCES sections(id) ON DELETE SET NULL,
  category_slug TEXT NOT NULL REFERENCES question_categories(slug),
  prompt        TEXT NOT NULL,
  choices_json  TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation   TEXT NOT NULL DEFAULT '',
  est_seconds   REAL NOT NULL,
  position      INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX questions_test_type_idx ON questions(test_type_id);
CREATE INDEX questions_category_idx ON questions(category_slug);

-- A single sitting of a test by one user. server-authoritative timing: started
-- and finished are set from the server clock; correct/reached are graded by the
-- engine, never trusted from the client. timed_out marks a submission that hit
-- the deadline; an in_progress row is never ranked.
CREATE TABLE attempts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_type_id    TEXT NOT NULL REFERENCES test_types(id) ON DELETE CASCADE,
  section_id      TEXT REFERENCES sections(id) ON DELETE SET NULL,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  reached_count   INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL,
  elapsed_ms      INTEGER,
  status          TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'timed_out'))
);
CREATE INDEX attempts_user_idx ON attempts(user_id);
CREATE INDEX attempts_test_type_idx ON attempts(test_type_id, status);

-- Per-question answer record. question_index preserves the presented (shuffled)
-- order so the report can replay the session exactly. is_correct is set by the
-- engine against the question's correct_index; client-supplied time_ms is
-- analytics-only and clamped by the engine.
CREATE TABLE attempt_answers (
  attempt_id     TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  chosen_index   INTEGER,
  is_correct     INTEGER NOT NULL,
  time_ms        INTEGER,
  PRIMARY KEY (attempt_id, question_id)
);
CREATE INDEX attempt_answers_attempt_idx ON attempt_answers(attempt_id);

-- Category-keyed tips/tutorials that the result report links to.
CREATE TABLE tutorials (
  id           TEXT PRIMARY KEY,
  category_slug TEXT NOT NULL REFERENCES question_categories(slug),
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Widen the notifications type enum so a finished test can notify friends.
-- SQLite cannot ALTER a CHECK constraint, so rebuild the table.
CREATE TABLE notifications_new (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('friend-request', 'friend-accepted', 'system', 'friend-score')),
  payload     TEXT NOT NULL DEFAULT '{}',
  read_at     INTEGER,
  created_at  INTEGER NOT NULL
);
INSERT INTO notifications_new (id, user_id, type, payload, read_at, created_at)
  SELECT id, user_id, type, payload, read_at, created_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at);