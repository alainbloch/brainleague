# brainleague

A self-contained authentication reference application. It combines several features:

- Fastify MVC layering (routes → controllers → services →
  repositories) and app structure.
— the sign-in model: email-verified registration, magic-link
  verification, opaque hashed session cookies, credential-version revocation,
  and per-key rate limiting.
— the Tailwind v4 design-token system and component class
  strings (`button`, `input`, `alert`, `badge`, `card`) ported into this
  application's views.

It is designed to deploy to Railway with a persistent SQLite volume.

## Stack

| Layer       | Choice                                   |
|-------------|------------------------------------------|
| Runtime     | Node.js ≥ 22.12 (ESM)                    |
| Language    | TypeScript 5 (strict) — compiled via tsc |
| Web         | Fastify 5                                |
| Database    | SQLite (`better-sqlite3`)                |
| Templates   | Nunjucks                                 |
| Styling     | Tailwind CSS v4 (rubyminer-core tokens)  |
| Tests       | Node test runner via tsx + Supertest     |

## Prerequisites

- Node.js ≥ 22.12 (24 recommended for the test runner)

```bash
node --version   # v22.12.0+
```

## Installation

```bash
npm install
cp .env.example .env   # fill in SESSION_SECRET (see below)
npm run build          # compile the Tailwind stylesheet
```

## Environment variables

| Variable         | Purpose                                            | Example                          |
|------------------|----------------------------------------------------|----------------------------------|
| `PORT`           | HTTP port (0.0.0.0 binding)                        | `3000`                           |
| `DATABASE_PATH`  | SQLite file location (must be on a volume in prod) | `./data/app.db`                  |
| `UPLOAD_DIR`     | Avatar uploads (must be on a volume in prod)       | `./data/uploads`                 |
| `SESSION_SECRET` | Signs session values; required in production       | 96-char hex from `openssl rand`  |
| `APP_URL`        | Base URL used in magic links                       | `https://yourapp.up.railway.app` |
| `NODE_ENV`       | `development` / `production` / `test`             | `development`                    |
| `MAIL_TRANSPORT` | `console` (default) or `smtp` (stub, see below)    | `console`                        |
| `RATE_LIMIT_PER_IP` / `RATE_LIMIT_PER_EMAIL` | Auth attempt limits | `30` / `8`              |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Seed admin account       | `admin@example.test` / `Admin-pass-123!` |
| `SEED_EMAIL` / `SEED_PASSWORD` | Seed demo user               | `demo@example.test` / `Change-me-123!` |
| `SEED_COUNT`                  | Number of demo users in seed | `12`                      |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Local database setup and migrations

The server never runs migrations implicitly. Apply them explicitly:

```bash
npm run migrate          # applies pending migrations (idempotent)
npm run db:seed          # admin + demo + batch of users, sample friendships
npm run db:reset         # destructive: delete DB file and recreate (prompts)
npm run db:reset -- -y   # same, skipping the confirmation prompt (CI/scripts)
```

`npm run db:seed` creates `admin@example.test` (role admin), `demo@example.test`,
and a batch of named demo users (default 12, override with `SEED_COUNT`),
including a couple of sample friendships and notifications so every feature has
data. All seeded accounts are **already verified** (no email confirmation
needed) and sign in immediately. Existing accounts are left untouched;
re-running the seed is safe and idempotent.

`npm run db:reset` deletes the SQLite file (plus WAL/SHM sidecars) and applies
all migrations from scratch, giving an empty database. It refuses to run
against a path that does not look like a `.db` file (so a misconfigured
`DATABASE_PATH` cannot delete arbitrary files) and asks for confirmation unless
you pass `--yes`.

The seed account is created **already verified** (no email confirmation
needed) and signs in immediately with `SEED_EMAIL` / `SEED_PASSWORD`. Existing
accounts are left untouched. Migrations live in
`src/models/migrations/*.sql` and are recorded in `schema_migrations`, so
re-running is safe.

## Running locally

```bash
npm run dev      # watch mode (node --watch)
# or
npm start
```

Then open http://localhost:3000. With the default `MAIL_TRANSPORT=console`,
verification and reset links are printed to stdout — click the printed URL.

## Navigation

The signed-in nav bar uses symbols and a compact dropdown:

- **Bell icon** — notifications inbox with a live unread-count badge
  (symbols are inline SVGs from the same Lucide set as rubyminer-core).
- **User chip (avatar/initials + chevron)** — opens a `<details>` dropdown with
  Account, Settings, and Sign out, so the main nav stays uncluttered.
- **Users** and **Admin** links stay visible for quick access; the admin link
  only appears for the `admin` role.

## Account settings

Signed-in users can edit their profile, email, and password at `/settings`,
and upload an avatar (JPEG/PNG/WebP/GIF, max 5 MB) that is stored under
`UPLOAD_DIR/avatars/` and served from `/uploads/`:

- **Name** — saved immediately; no confirmation.
- **Email** — requires the current password; a confirmation link is emailed to
  the **new** address. All other sessions are signed out when it is confirmed.
- **Password** — requires the current password; all other sessions are signed
  out when it changes.
- **Avatar** — validated by MIME type and size; replaced files are deleted
  after the new one is written.

## Users, friendships and notifications

- **Directory** (`/users`) — searchable, paginated list of every account.
- **Profiles** (`/users/:id`) — view any user's profile, see their friends, and
  send/accept/decline/cancel friend requests.
- **Friendships** — stored as canonical pairs (`user_id < friend_id`) with a
  `pending` → `accepted` state machine. Requesting someone who already
  requested you auto-accepts.
- **Notification inbox** (`/notifications`) — notification system wired for
  friend requests (recipient gets `friend-request`), accepted requests
  (requester gets `friend-accepted`), and admin broadcasts (`system`): typed
  JSON payloads, read/unread state, an unread badge in the nav, and
  mark-all-read.

## Admin

The `admin` role (seeded as `admin@example.test`), gated by HTTP middleware:

- **Dashboard** (`/admin`) — instance stats (users, admins, pending requests).
- **Manage users** (`/admin/users`) — full searchable user list with **edit**
  (name/email — email changes sign the user out — and optionally set a new
  password, which also signs the user out), promote/demote, and delete
  actions, plus verification and join-date columns.
- **Broadcast** (`/admin/broadcast`) — send a system notification to every user
  on the instance in one shot; each recipient gets an unread copy in their
  inbox with the sender's name attached.
- **Guards** — an admin cannot change their own role or delete their own
  account, and the last administrator can never be demoted or deleted.

## MCP server (Model Context Protocol)

This application exposes the same user, friendship, notification, and admin
functionality to AI agents through the **Model Context Protocol (MCP)** in two
flavors:

- **stdio** (local) — `scripts/mcp-server.ts`, run with `npm run mcp`. Use this
  for a locally-running agent (Claude Desktop, Cursor, CLI agents) pointed
  directly at the process.
- **Streamable HTTP** (remote) — mounted at `/mcp` when enabled. Use this to let
  a deployed agent hit the app over the network.

Both wire the exact same tools to the same services and the same SQLite database
as the web app, so an agent sees live production data.

### Tools

Every tool except `authenticate` takes a `sessionToken`. Call
`authenticate(email, password)` first to obtain one (this is the same opaque
session cookie the web app issues, so revocation and expiry apply unchanged):

| Tool | Requires | Purpose |
|------|----------|---------|
| `authenticate` | — | Sign in and mint a `sessionToken` |
| `logout` | auth | Destroy a session token |
| `me` | auth | Current user + unread counts |
| `list_users` | auth | Searchable, paginated directory |
| `get_profile` | auth | Public profile + friendship state |
| `send_friend_request` | auth | Send a friend request |
| `accept_friend_request` | auth | Accept an incoming request |
| `remove_friend` | auth | Unfriend / cancel / decline |
| `list_notifications` | auth | Inbox (newest first) |
| `mark_notifications_read` | auth | Mark all read |
| `admin_stats` | admin | Instance stats |
| `admin_list_users` | admin | Full user list + role/verification |
| `admin_change_role` | admin | Promote / demote (last-admin guard) |
| `admin_edit_user` | admin | Edit name/email/password |
| `admin_delete_user` | admin | Delete a user (self/last-admin guard) |
| `admin_broadcast` | admin | System notification to every user |

Admin-only tools are enforced server-side via the session's role — the agent
cannot promote itself or bypass the guards.

### Running the stdio server

```bash
npm run mcp
```

This connects MCP to stdin/stdout using the same database as the web app
(`DATABASE_PATH`, default `./data/app.db`). Point any MCP client at the command.

**To point an agent at it over HTTP** (e.g. a Claude/Cursor-style remote client,
or any agent that speaks Streamable HTTP):

1. Set `MCP_HTTP_ENABLED=true` in the environment (see `.env.example`). The
   endpoint is **off by default** — this flag only exposes the transport, not
   anonymous access; every tool still requires a `sessionToken`.
2. Start the server (`npm run dev` or `npm start`), then connect the agent to:

   ```
   POST /mcp
   ```

   with `Accept: application/json, text/event-stream`. Follow the standard
   Streamable HTTP lifecycle: `initialize` → send `notifications/initialized`
   with the returned `Mcp-Session-Id` header on each request → `tools/call`.
   `DELETE /mcp` closes the session.

   Authenticate in-band: call the `authenticate` tool with an account's email +
   password, keep the returned `sessionToken`, and pass it to subsequent tool
   calls.

For a local CLI agent you can just run `npm run mcp` and, after it says "ready on
stdio", have the agent call `authenticate` with the seeded credentials (see Local
database setup) and then work the tools above.

## Tests and production build

```bash
npm test              # unit + integration (82 tests)
npm run test:e2e      # boots the real server; full journey over HTTP (4 tests)
npm run lint          # eslint
npm run format:check  # prettier
npm run build         # production CSS build
```

Full suite (unit 53 + integration 29 + e2e 4) totals 86 tests.

## Deploying to Railway

### From this repository

1. **Push the repository** to GitHub, then create a new Railway project from
   the repo (Railway's `New Project → Deploy from GitHub repo`).
2. **Service** — Railway will use the `Dockerfile`. The start command runs
   migrations first, then the compiled server (`node dist/scripts/migrate.js
   && node dist/src/server.js`, already encoded in the Docker image's CMD).
3. **Persistent storage (required)** — add a **Volume** to the service mounted
   at `/app/data`, and set `DATABASE_PATH=/app/data/app.db` **and**
   `UPLOAD_DIR=/app/data/uploads`. Without a volume, the SQLite file and any
   uploaded avatars live in ephemeral container storage and are lost on
   redeploy.
4. **Secrets** — add these variables in the service's *Variables* tab:
   - `SESSION_SECRET` — random 96-char hex (never commit it)
   - `APP_URL` — `https://<your-service>.up.railway.app`
   - `NODE_ENV=production`
   - optionally `MAIL_TRANSPORT=smtp` + SMTP_* once a transport is wired
5. **Networking** — Railway assigns a public domain automatically. The app
   listens on `0.0.0.0:$PORT`, so no extra port config is needed and
   `/health` is exposed as the load-balancer health check.

### Applying migrations on deploy

The Docker image runs `node dist/scripts/migrate.js &&
node dist/src/server.js`. Migrations are idempotent, so a redeploy with a new
migration applies only the pending ones. For manual control, run `npm run
migrate` against the volume from a Railway shell or via a one-off job, then
restart.

### Verifying the deployment

```bash
curl -fsS https://<your-service>.up.railway.app/health
# {"status":"ok","timestamp":"..."}
```

Register a test account: visit `/register`, use the verification link from the
log (console mail) or a wire transport, then sign in and land on `/account`.

### Troubleshooting

- **Data disappears on redeploy** → the volume is missing; set
  `DATABASE_PATH` to a path under `/app/data` and mount the volume at `/app/data`.
- **403 on sign-in after registering** → email not verified yet; open the magic
  link from the mail transport.
- **Starts but `/health` 502s** → confirm `PORT` is not hard-coded; the
  `Dockerfile` uses the Railway-provided `PORT`.
- **`SESSION_SECRET` empty in production** → the app refuses to start; add the
  variable.
- **Console mail in production** → set `APP_URL` so links point to the real
  host; consider wiring `MAIL_TRANSPORT=smtp`.

## Updating image assets

Artwork is supplied by the project owner. When new images are provided:
1. Place them under `src/public/assets/images/`.
2. Reference them from templates via absolute paths (e.g. `/assets/images/…`).
3. Rebuild and verify locally (`npm run build && npm start`) before committing.
If an asset is missing from the repo, request it by specification (purpose,
dimensions, format, style reference) — never fabricate or substitute
unlicensed artwork.

The homepage reuses `BrainLeague-emblem.svg` in its hero. Decorative timer,
question, podium, and test-card vectors live in
`src/views/components/home-graphics.njk`; layout and the emblem-matched
`--brand-*` palette live in `src/public/assets/css/app.css`. These graphics are
hidden from assistive technology because the adjacent headings convey their
meaning. Rebuild CSS after changing the homepage styles or template classes.

## Architecture summary

```
src/
├── app.ts             # Fastify assembly (plugins, views, routes, health)
├── server.ts          # listen 0.0.0.0:PORT + graceful shutdown
├── config.ts          # validated environment configuration
├── container.ts       # composition root (db, repos, services)
├── routes.ts          # HTTP path/method → controller
├── controllers/       # thin HTTP layer (validate → call service → respond)
├── services/          # domain rules, HTTP-free, injected deps
├── models/            # db connection, migrations, repositories
├── mcp/               # MCP tools (server/auth/http), agent access to the app
├── middleware/        # session resolve / auth guard
├── types/             # shared TypeScript definitions (Fastify augmentation)
├── ui/                # rubyminer-core component class strings + icons
├── views/             # Nunjucks layouts, components, auth pages
└── public/assets/     # static assets + compiled CSS
scripts/               # migrate, seed, reset-db, build-css, mcp-server (TypeScript)
tests/unit             # services, repositories
tests/integration      # controllers + real SQLite (Supertest)
tests/e2e              # real server process, HTTP journeys
```

All application code is TypeScript, compiled with `tsc` to `dist/` for
production (see the Dockerfile). `npm run typecheck` checks the whole codebase
including tests. See `AGENTS.md` for the full architecture and code-quality
requirements.


## Practice tests and learning content

After deploying the code, install the content against the persistent database:

```sh
npm run migrate
npm run seed:content
```

For the production build (including Railway), run
`node dist/scripts/seed-content.js` in the deployed container with the same
`DATABASE_PATH` and mounted volume as the app, after migrations. Redeploying code
alone does not seed the database. Do not reset the database to install content.

The shipped catalog includes:

| Test | Questions | Time |
| --- | ---: | ---: |
| PI Cognitive Assessment practice | 50 | 12 minutes |
| Numerical Workout | 20 | 10 minutes |
| Verbal Workout | 20 | 7 minutes |
| Pattern & Logic Workout | 20 | 8 minutes |

There are 60 new original questions across the focused workouts; the mixed test
also uses 34 of those questions alongside its 16 original questions. These are
practice exercises, not official assessment items or validated IQ measurements.
Figure exercises render shapes and pattern grids with accessible text descriptions. Twelve tutorials cover the
nine question categories plus rates, percentage changes, and pacing, with worked
solutions, common mistakes, and self-check answers. Result reviews show each
question's explanation and link to category tutorials.

Content lives in `scripts/content/`: typed question banks and `catalog.ts` define
the tests, `tutorials.ts` defines teaching material, and `seed.ts` owns the atomic
SQLite import. `legacy.ts` preserves old IDs and exact tutorial text for guarded
upgrades. The CLI only opens the configured database and calls the importer.
Re-running inserts missing records without duplicates. It upgrades a legacy
tutorial only if its title, body, category, and order still match the shipped
original; admin-edited tutorials and existing questions remain untouched. No
users, scores, or attempts are deleted. The current engine presents a test's
entire bank, so keep each bank's size aligned with its advertised question count.

### Shared page styling

`src/ui/classes.ts` owns shared control/card classes. Interior layout, table,
quiz, and lesson styles live in `src/public/assets/css/design-system.css`, imported
by `app.css`. `components/page.njk` provides reusable illustrated headings and
empty states. Keep navigation actions compact; use prominent actions for the
main task. Rebuild the served CSS after editing styles or template classes.

Tutorials remain plain text: `src/ui/tutorialSections.ts` recognizes standalone
WORKED EXAMPLE, QUICK TIP, COMMON TRAP, TRY IT, and CHECK YOUR ANSWER headings.
The template escapes every section and uses native details for answer reveals.
Unrecognized text is preserved, never interpreted as HTML.

### Quiz presentation and coaching

The take screen uses large answer cards. Click a card or press **1–4** to select;
press **Enter** or **Next** to commit. Selection alone does not submit an answer.
Skip works on every question; the last confirmation finishes the test. The
progress bar counts committed questions, including skips. The countdown uses
elapsed monotonic browser time against the remaining server budget. Expiry
submits once and leaves an unconfirmed selection unanswered.

`src/ui/reasoningVisuals.ts` renders the six shipped figure questions as trusted,
responsive SVG geometry, including a pattern grid. Both question and answer
choices have text equivalents; no image downloads are needed. Exact prompt and
choice matching keeps admin-edited questions on their original text presentation.
The same diagrams appear in result reviews. This release needs no content seed
or schema migration if the previous question pack is already installed.

`src/services/quizCoaching.ts` groups recorded answers by category and recommends
an available focused workout plus the relevant tutorials. Category accuracy is
credited correct / selected answers; skips are separate and unavailable timings
remain unavailable. Browser-recorded times are guidance, not independently
verified performance measurements. Unvisited questions are not attributed to
categories. Final submission replaces partial autosaves with the graded payload
so per-question feedback and the category totals agree with the final score.

Run the interaction and responsive-layout checks with:

```sh
npx playwright install chromium
npm run test:browser
```

The browser checks cover selection, keyboard confirmation, repeated keys, skips,
autosave, timeout, one-time submission, and 320px/390px/desktop layouts. An existing
Chromium installation can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

### Console email and account verification

With `MAIL_TRANSPORT=console`, new registrations are automatically verified and
can sign in immediately. Existing unverified accounts are verified after a
successful password login; no database migration or reseeding is necessary.
Other transports retain email-link verification. Console mode does not prove
ownership of the email address. Password-reset and email-change links still
require their tokens and are logged to the server console.

The public `/about` page explains BrainLeague’s value, getting-started flow, and
founder story. It is rendered by `PageController.showAbout` and linked from the
shared navigation for visitors and signed-in users.
