# AGENTS.md — brainleague

This document defines the architectural, code-quality, testing, and deployment
requirements for this repository. Read it before implementing any change and
after any context reset. Every delegated agent must read and follow it.

---

## Project Overview

brainleague is a social timed practice-test platform (auth + social + quizzes) built on a self-contained Fastify reference application. It
combines patterns from three existing codebases:

- **wcos** — a Fastify + SQLite MVC application. Its storage and layering pattern
  (routes → controllers → services → repositories, with a schema-owning model
  layer) is the structural starting point.
- **kamae** — the sign-in/account model: email-verified registration, magic-link
  email verification, opaque hashed session cookies, session revocation via a
  `credential_version`, and per-key rate limiting. Reproduce these behaviours
  faithfully.
- **rubyminer-core** — the UI component and styling library: a Tailwind v4
  design-token system (CSS custom properties for mode/accent) plus the
  `button`/`input`/`alert`/`badge`/`card` component class strings. Port these
  into this application's views and macros so the interface is visually
  consistent with rubyminer-core.

The application must be deployable to Railway without relying on any other
hosting provider's proprietary runtime or a provider-specific ORM.

## Stack

- **Runtime**: Node.js `>=22.12.0`, ESM modules.
- **Language**: **TypeScript (`^5`)** — all source, scripts, and tests are
  written in TypeScript. TypeScript is mandatory for new code; plain `.js`
  source files are not accepted.
- **Web framework**: Fastify (`^5`).
- **Database**: SQLite via `better-sqlite3`. Persistent data lives in a data
  file (documented Railway volume), never in ephemeral container storage.
- **Templating**: Nunjucks (matching wcos), rendering the ported rubyminer-core
  component system.
- **Styling**: Tailwind CSS v4, compiled with the Tailwind CLI, driven by the
  rubyminer-core design tokens.
- **Testing**: Node's built-in test runner (`node --test`) run through
  `tsx` (`node --import tsx --test …`) + `supertest` for HTTP integration
  tests.
- **Build**: `tsc` emits production JavaScript to `dist/`; CSS is compiled
  with the Tailwind CLI. Runtime entry: `dist/src/server.js`.

## TypeScript rules

- **Strict mode is enforced** (`tsconfig.json` sets `"strict": true`); the
  typecheck (`npm run typecheck`, `tsc --noEmit`) must pass before any commit.
- Follow existing module conventions: `import`/`export` ESM syntax
  (`module: NodeNext`), explicit types for public service/repository APIs,
  and `import type { … }` for type-only imports.
- Node runtime types come from `@types/node`; do not add otherwise-unnecessary
  type-only dependencies.
- Shared request/container types live in `src/types/` (e.g. `fastify.d.ts`
  augments Fastify's `request.user`).
- Do not weaken strictness to make code compile; fix the types instead.

---

## Architecture

### MVC and responsibility boundaries

Apply SOLID principles pragmatically. Every module has one coherent
responsibility:

| Layer | Owns | Must not |
|-------|------|----------|
| **Routes** | Declaratively map HTTP path/method → controller action | Contain business logic or SQL |
| **Controllers** | Validate request shape, call application services, translate results into HTTP responses | Calculate authoritative outcomes, touch the database directly |
| **Services** | Coordinate use cases (register, verify, login, logout, reset, revoke, rate-limit) | Know about Fastify request/response objects |
| **Repositories** | SQL and persistence mapping for a single aggregate (users, sessions, tokens, rate limits) | Encode domain rules beyond query construction |
| **Models / schema** | The database connection and migration ownership | Render views or parse HTTP |
| **Views** | Render state; collect input | Access the database or hold auth logic |

Rules:

- Controllers are thin. A controller action reads validated inputs, calls one or
  two service methods, and returns a response.
- Services contain zero HTTP knowledge (no `request`/`reply`). Inject
  dependencies (repositories, clock, hashing, mailer) where it improves
  testability.
- Repositories expose query methods aligned to their model, not raw SQL strings
  scattered across callers.
- Keep domain logic (password rules, session lifetime, rate-limit thresholds,
  revocation semantics) out of HTTP, DB drivers, and templates.
- Prefer small, focused exports/interfaces over large monolithic objects.

### Directory layout

```
src/
├── app.ts             # buildApp(): assemble Fastify, plugins, routes, errors
├── server.ts          # start(): listen on 0.0.0.0:PORT; graceful shutdown
├── config.ts          # environment configuration (validated)
├── container.ts       # composition root (db, repos, services)
├── routes.ts          # route declarations → controllers
├── controllers/       # thin HTTP layer
├── services/          # use cases / domain logic (HTTP-free)
├── models/            # database connection + repositories + migrations
├── middleware/        # cross-cutting: session resolve, auth guard
├── types/             # shared TypeScript definitions (Fastify augmentations)
├── ui/                # design-token class strings + icon paths
├── views/             # Nunjucks layouts, components, auth pages
└── public/            # static assets (incl. compiled CSS)
tests/
├── unit/              # services, repositories (isolated)
├── integration/       # controllers + real SQLite, auth flows
└── e2e/               # critical sign-in journeys over HTTP
scripts/               # migrate, seed, reset-db, build-css, copy-assets
```

---

## Prevention of God files and oversized functions

- **No God files.** Do not put routing, SQL, domain rules, rendering, and
  initialization into a single file or an oversized service.
- Treat implementation files exceeding **~300 lines** and functions exceeding
  **~50 lines** as review triggers (not automatic failures). Exclude generated
  files and large declarative content (CSS tokens, SQL migrations).
- Split by responsibility, not arbitrary line counts. Do not dump unrelated
  logic into `helpers`, `utils`, or `base` classes.

---

## Code style and comments

- Descriptive names, explicit units.
- Comment **why** non-obvious rules, design decisions, concurrency protections,
  ordering requirements, and tradeoffs exist — not what each line does. Do not
  comment every line.
- Document public service/repository methods: intent, inputs/outputs, side
  effects, and error behaviour.
- Keep comments accurate when code changes.

---

## Testing and CI

Add meaningful automated tests alongside behavioural changes:

- **Unit tests** for domain rules (password policy, credential-version
  revocation, token expiry, rate-limit thresholds).
- **Integration tests** for controllers, persistence, authorization, and
  transaction boundaries (real SQLite in-memory / temp file).
- **End-to-end tests** for the critical flows: register → verify → login →
  access → logout, and reset-password.

Use controlled clocks where timing matters. Cover invalid inputs, boundary
conditions (password length, expired tokens), retries, concurrent updates, and
failure recovery.

For bug fixes, add a regression test that reproduces the defect where practical.
Do not duplicate the implementation inside tests or weaken assertions to pass.

CI (`.github/workflows/ci.yml`) runs: lint, tests, and the production build.
Report coverage and investigate uncovered branches in critical modules.

---

## Documentation and milestone-completion check

Document module responsibilities and dependency boundaries in `README.md`.

Before declaring a milestone complete:

1. Review the diff for mixed responsibilities and oversized modules.
2. Verify dependency boundaries; identify any justified exceptions.
3. Run the relevant tests and required CI checks.
4. Review comments and documentation for accuracy.
5. Report actual results and unresolved failures.

Do not claim architectural compliance or passing tests without examining the
implementation and executing the checks.

---

## Railway deployment compatibility

- Reproducible build and production start command.
- Listen on `0.0.0.0` using the `PORT` environment variable.
- Include a health-check endpoint (`/health`), graceful shutdown (SIGTERM /
  SIGINT close the HTTP server), and clear development/production configuration.
- **Persistent data out of ephemeral storage**: SQLite data file must live on a
  Railway volume. `DATABASE_PATH` defaults to `./data/app.db`; document a volume
  mounted at `/app/data`.
- Safe database migrations (idempotent or guarded), run explicitly, never
  implicitly at server startup. `.env.example` contains placeholders only —
  never credentials.
- A `Dockerfile` produces a deployable image; `README.md` documents Railway
  service, secret, volume, and networking configuration.

---

## Artwork and asset workflow

Artwork is supplied by and owned by the user. Do not generate or commit
third-party/licensed image assets without explicit authorization. Follow the
asset-request workflow described in `README.md`: when artwork is required,
request assets by specification (purpose, dimensions, format, style reference)
and integrate only assets the user has provided. Never fabricate or substitute
unlicensed artwork.

---

## Git workflow

- **Never work on `main`/`master` directly.** Create a new feature branch for
  every task (`feat/<name>`), do work there, and never commit a different task's
  changes to an existing branch.
- Do not run `git add .` in a shared worktree; stage only the files belonging to
  this task.

---

## Verify before claiming

Always execute the actual commands (tests, build, lint) and report real output.
Distinguish tested steps from unverified instructions. Report blockers honestly;
never substitute fabricated output for results you could not produce.
