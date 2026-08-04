# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Mosonic** is a Thailand-based AI content orchestration SaaS: campaign strategy → multi-step AI generation pipelines → review → multi-channel publishing → analytics-driven rule improvement. This is a polyglot monorepo with **no root workspace config** — every package is installed and run independently.

| Package | Stack | Role |
|---------|-------|------|
| `server/` | NestJS + TypeScript + Prisma/PostgreSQL | API + orchestration engine (core product) |
| `client/` | React 19 + Vite + TypeScript | Frontend SPA |
| `payment/` | Spring Boot 4.1 + Java 21 | Credit topup catalog + Payni checkout proxy |
| `scheduler/` | Spring Boot 4.1 + Java 21 | Delayed-job scheduling via Redis pub/sub |
| `faq/` | FastAPI + Python | FAQ generation/embeddings, shares the server's Postgres DB |

There is no root `package.json`. Always `cd` into the target package before running any command.

## Commands

### Setup
```bash
cd server && yarn install     # Yarn Berry (node-modules linker) — do not use npm/pnpm
cd ../client && yarn install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Server (`server/`)
| Command | What it does |
|---------|---------------|
| `yarn start:dev` | Dev server with watch, `http://localhost:3000`, Swagger at `/docs` |
| `yarn start:worker` | Runs `WorkerModule` standalone (BullMQ processors, no HTTP) — use when `RUN_WORKERS_IN_API=false` |
| `yarn build` | Compile NestJS |
| `yarn test` | Unit tests (Jest, `.spec.ts`, inline config in `package.json`, `rootDir: "src"`) |
| `yarn test path/to/file.spec.ts` | Run a single unit test file |
| `yarn test -t "test name"` | Run tests matching a name |
| `yarn test:e2e` | E2E tests (`test/jest-e2e.json`, `.e2e-spec.ts`, `rootDir: "."`) — run from `server/` |
| `yarn lint` | ESLint with `--fix` |
| `yarn prisma:migrate` | Create/apply a dev migration against `DATABASE_URL` |
| `yarn prisma:generate` | Regenerate the Prisma client (also runs on `postinstall`) |
| `yarn start:tunnel` | Dev server + ngrok tunnel concurrently |

Migration/backfill one-offs live in `server/scripts/` and run via `yarn migrate:*` / `ts-node -r tsconfig-paths/register scripts/<file>.ts` — check the script header before running any of them against a real database.

### Client (`client/`)
| Command | What it does |
|---------|---------------|
| `yarn dev` | Vite dev server, `http://localhost:5173` |
| `yarn build` | **Typecheck + production build** combined (`tsc -b && vite build`) — this is the CI type-check step, not just a bundler run |
| `yarn typecheck` | TS type check only (`tsc -b --noEmit`) |
| `yarn test` | Vitest, runs in **`node`** environment (not `jsdom`), matches `src/**/*.spec.ts` |
| `yarn test path/to/file.spec.ts` | Run a single test file |
| `yarn lint` | ESLint |

### Java services (`payment/`, `scheduler/`)
```bash
./mvnw spring-boot:run          # payment → :8002, scheduler → :8003
./mvnw test                     # Surefire, src/test/java layout
./mvnw test -Dtest=ClassName    # single test class
```

### FAQ (`faq/`, Python)
```bash
python -m venv .venv && pip install -r requirements.txt
cp .env.example .env            # DATABASE_URL, OPENAI_API_KEY, FAQ_API_KEY
alembic upgrade head            # creates faqs/faq_documents tables — does NOT touch Prisma tables
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
pytest
```

### CI
`.github/workflows/build.yml` runs `yarn install --frozen-lockfile && yarn build` for `server/` and `client/` independently on push/PR to `main`, `master`, `dev`. Node 22. There is no CI job for `payment/`, `scheduler/`, or `faq/`.

## Architecture

### The seven-module pipeline (core product concept)

Content moves through: **Rule** (campaign strategy, set up once) → **Workflow** (per-run node template combining the Rule with a content prompt) → **Orchestration** (executes nodes, sequential or DAG) → **Content** (review/edit/rerun/approve) → **Upload** (per-channel preview, schedule, publish via Zernio MCP) → **Analytics** (pulls metrics, feeds rule-improvement suggestions back to Rule). `Logging` runs alongside Orchestration for live progress.

Two separations matter everywhere in this codebase:
- **Rule** (stable strategy) vs **content prompt** (varies per run) — one Rule powers many generation runs.
- **Workflow** (template: node graph + config) vs **Pipeline** (one execution's runtime state: status, outputs, retries).

Node types: `text_generation` (always first, locked), `image_generation`, `video_generation`, `translation`, `transcription`, `summarization`, `keyword_planner`, `branch`, `adapt`, `merge`, `intelligence`. Each node receives the full output of prior nodes plus the Rule and its own optional prompt override.

Full product/UI/schema spec: `docs/PLATFORM-GUIDE.md` and `.cursor/rules/Project-flow-and-funtionalities.mdc` (identical content, always-applied Cursor rule). **Caveat:** `docs/PLATFORM-GUIDE.md`'s technology-stack section still describes MongoDB/Mongoose as the primary database — that's stale. The database layer has since migrated; treat the points below and `server/.env.example` as current.

### Server data layer

- **PostgreSQL via Prisma is the primary database** (`DATABASE_URL`, schema at `server/prisma/schema.prisma`). Mongoose (`MONGODB_URI`) is kept only for legacy one-off migration scripts under `server/scripts/migrate-mongo-to-postgres/` — do not build new features against it.
- Data access follows a repository pattern: `server/src/repositories/interfaces/*.repository.interface.ts` define the contract, `server/src/repositories/prisma/prisma-*.repository.ts` implement it. Feature modules depend on the interface (via `tokens.ts` DI tokens), not the Prisma implementation directly.
- `server/src/domain/` holds framework-free domain types shared across modules (e.g. `domain/workflow/workflow.types.ts`); `server/src/workflow/`, `server/src/nodes/`, `server/src/orchestration/` hold the NestJS-facing schemas/services that use them.
- `faq/` (Python) writes to the **same** Postgres database via its own Alembic migrations (`faqs`, `faq_documents` tables) — it does not touch Prisma-managed tables.

### Server module wiring

`server/src/app.module.ts` is the map of everything. Rough grouping:
- **Core pipeline:** `rule`, `workflow`, `pipeline`, `orchestration`, `content`, `upload`, `post`, `analytics`, `logging`, `events`, `llm`, `nodes`, `preprocessing`
- **Platform/tenancy:** `auth`, `users`, `admin`, `cost`, `credit`, `plan`, `usage`, `campaign`, `dashboard`, `announcements`
- **Channel integrations:** `line`, `telegram`, `viber`, `whatsapp`, `rednote`, `webhook`, `mcp`, `integrations`, `channels`
- **Ancillary:** `faq` (proxy to the Python service), `news-trigger`, `api-usage`, `openai-billing`, `heygen-billing`, `payment`/`payni` (proxy to the Java service), `scheduler` (proxy to the Java service)

A separate `WorkerModule` (`server/src/worker/main.ts`) can run BullMQ processors standalone when `RUN_WORKERS_IN_API=false`, so the API and job execution can be scaled independently.

### Pipeline execution modes

Behavior is environment-flag driven (`server/.env.example` is authoritative), not code-path-per-deployment:
- `ORCHESTRATION_USE_QUEUE=true` — BullMQ-driven DAG execution instead of inline sequential execution
- `ORCHESTRATION_USE_GRAPH=true` — enables branch lanes / A-B variants / merge nodes
- `RUN_WORKERS_IN_API` — whether queue jobs run inside the API process or the standalone worker
- `PIPELINE_EVENTS_BRIDGE=true` — workers publish Socket.IO events via Redis pub/sub when API and workers are split processes
- `PIPELINE_RECONCILE_ENABLED=true` — a sweep re-enqueues ready-but-stuck nodes every 30s to recover from lost completion events

### Auth and multi-tenancy

Login/SSO is external; the Nest server acts as a BFF and sets HttpOnly cookies (the SPA never handles tokens directly). `JwtAuthGuard` accepts a Bearer token or the access cookie and upserts a local user per request. Every customer-owned document is scoped by `userId`; `AdminGuard` (role `ADMIN`) bypasses that filter and can see all tenants, including legacy rows with no `userId`.

### Server conventions

- Global `ValidationPipe` (`transform: true`, `whitelist: true`, `forbidNonWhitelisted: true`) and a global `GlobalHttpExceptionFilter` via `APP_FILTER` — don't add per-controller equivalents.
- `ConfigModule` is global with `envFilePath: '.env'` resolved relative to `server/` — the `.env` file will not be picked up from the repo root.
- CORS is `origin: true` with credentials.

### Client structure

- Feature-folder layout under `client/src/features/*` (e.g. `pipeline`, `rules`, `workflow`, `upload`, `posts`, `credit`, `campaign`) mirrors the server's module split. Cross-feature code lives in `client/src/shared/` (`api`, `queries`, `stores`, `services`, `schemas`, `socket`).
- Zustand is used narrowly — auth tokens and user profile only; server state goes through TanStack Query.
- Path aliases: `@` → `./src`, and `@workflow-next-matrix` → `../server/src/workflow/workflow-node-next-matrix.ts` (the client imports this one file directly from the server package to keep node-ordering logic in sync — defined in `vite.config.ts` and both `tsconfig*.json` files).
- i18n: `client/src/i18n/` + `client/src/locales/{en,th,zh}`.
- `yarn build` is also the type-check gate (`tsc -b && vite build`) — a change that doesn't compile will fail this even if `yarn dev` looked fine.

### Java services (`payment/`, `scheduler/`)

Both follow `controller → service → repository → domain` (+ `dto`, `mapper`), Spring Security with method-level `@PreAuthorize`, and a shared `ApiResponse<T>` envelope. Full conventions (DTO record vs class rules, no nested/inner DTOs, `@Loggable` AOP logging pattern, caching/idempotency rules, PostgreSQL/JPA mapping standards) are in `.cursor/rules/spring-boot-rules.mdc` (always-applied to `**/*.java`) — read it before writing Java code in either service, since it's more detailed than typical Spring Boot defaults (e.g. request DTOs are mutable classes, response DTOs are `record`s, and every DTO — including nested sub-objects — must be its own top-level file).

## Environment requirements

- Node.js 20+ (CI uses 22), Yarn Berry (not npm/pnpm)
- PostgreSQL (server + faq + both Java services)
- MongoDB (legacy migration scripts only)
- Redis (required when `ORCHESTRATION_USE_QUEUE=true`; keep it local when `DATABASE_URL` is local — a shared/staging Redis can let remote workers mark jobs complete without updating your local DB)
- `server/.env` and `client/.env` are required before either app starts (`cp *.env.example .env`); Java services need their own `.env` with `DATABASE_URL` and `PAYMENT_API_KEY`/`SCHEDULER_API_KEY`
