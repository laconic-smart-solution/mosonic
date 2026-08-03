# AGENTS.md — Mosonic Monorepo

## Project

Mosonic is an AI-driven marketing content SaaS platform. This monorepo contains the full-stack implementation.

| Package | Stack | Role |
|---------|-------|------|
| `server/` | NestJS + TypeScript | API + orchestration engine |
| `client/` | React 19 + Vite + TypeScript | Frontend SPA |
| `payment/` | Spring Boot 4.1 + Java 21 | Credit topup catalog + Payni checkout proxy |
| `scheduler/` | Spring Boot 4.1 + Java 21 | Delayed-job scheduling via Redis pub/sub |
| `faq/` | FastAPI + Python | FAQ document processing + embeddings |

## No root workspace

There is **no root `package.json`** and no workspace config. Install and run commands **per package**:

```bash
cd server && yarn install
cd ../client && yarn install
```

## Package manager

All JS/TS packages use **Yarn Berry** (modern Yarn). The `nodeLinker` is `node-modules`. Do not use `npm` or `pnpm`.

## Quick start

```bash
# 1. Install per package
cd server && yarn install
cd ../client && yarn install

# 2. Create env files
cp server/.env.example server/.env
cp client/.env.example client/.env

# 3. Run backend
cd server && yarn start:dev    # http://localhost:3000, docs at /docs

# 4. Run frontend
cd client && yarn dev           # http://localhost:5173
```

## Key commands

### Server (`server/`)
| Command | What it does |
|---------|-------------|
| `yarn start:dev` | Dev server with watch |
| `yarn build` | Compile NestJS |
| `yarn test` | Unit tests (Jest, `.spec.ts` suffix) |
| `yarn test:e2e` | E2E tests (`test/jest-e2e.json`, `.e2e-spec.ts` suffix) |
| `yarn lint` | ESLint with fix |
| `yarn start:tunnel` | Dev server + ngrok tunnel concurrently |

### Client (`client/`)
| Command | What it does |
|---------|-------------|
| `yarn dev` | Vite dev server |
| `yarn build` | **Typecheck + production build** (combined — `tsc -b && vite build`) |
| `yarn typecheck` | TS type check only (`tsc -b --noEmit`) |
| `yarn lint` | ESLint |
| `yarn test` | Vitest |

### Java services
| Service | Command | Default port |
|---------|---------|-------------|
| `payment/` | `./mvnw spring-boot:run` | 8002 |
| `scheduler/` | `./mvnw spring-boot:run` | 8003 |

### FAQ (Python)
```bash
cd faq
pip install -r requirements.txt
pytest
```

## Architecture notes

- **Server** uses `@nestjs/config` with `envFilePath: '.env'` (global `ConfigModule`). The `.env` file must exist in `server/` — it is not loaded from the repo root.
- **Server** uses Prisma for PostgreSQL (primary) and Mongoose for MongoDB (legacy scripts only).
- **Server** uses BullMQ for pipeline queuing when `ORCHESTRATION_USE_QUEUE=true`. Requires a running Redis instance.
- **Server** has a global `ValidationPipe` with `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true`.
- **Server** has a global `GlobalHttpExceptionFilter` registered via `APP_FILTER`.
- **Server** CORS is `origin: true` with credentials.
- **Client** `yarn build` runs both `tsc -b` and `vite build` — it is the typecheck step, not just a build.
- **Client** uses `@` path alias for `./src` and `@workflow-next-matrix` for a shared server workflow file.
- **Java services** follow the layered convention: `controller -> service -> repository -> domain` (+ `dto`, `mapper`). See `.cursor/rules/spring-boot-rules.mdc` for full Java conventions.

## Testing quirks

- **Server unit tests**: `.spec.ts` suffix, Jest configured inline in `package.json`, `rootDir: "src"`. No separate `jest.config.js`.
- **Server e2e tests**: `.e2e-spec.ts` suffix, config in `test/jest-e2e.json`, `rootDir: "."`. Run from `server/` directory.
- **Client tests**: Vitest, `.test.ts`/`.spec.ts` suffix, runs in `node` environment (not `jsdom`).
- **Java tests**: Maven Surefire, standard `src/test/java/...` layout.

## Environment requirements

- **Node.js 20+** (CI uses Node 22)
- **MongoDB** (local or remote — required for server)
- **Redis** (required when `ORCHESTRATION_USE_QUEUE=true`)
- **PostgreSQL** (required for Prisma + Java services)
- **Yarn Berry** (not npm)

## Important constraints

- **No root-level scripts** — always `cd` into the target package before running commands.
- **`server/.env`** must be created from `server/.env.example` before the server starts. Minimum: `MONGODB_URI`, `PORT`, `REDIS_HOST`/`REDIS_PORT` if using queue mode.
- **`client/.env`** must have `VITE_API_BASE_URL` pointing to the running backend (default `http://localhost:3000`).
- **Java services** require `DATABASE_URL` and their own API key env vars (`PAYMENT_API_KEY` or `SCHEDULER_API_KEY`) set in their respective `.env` files.
- **Publishing** requires Zernio API key and MCP URL configured on the server side.

## Existing instruction sources

- `.cursor/rules/Project-flow-and-funtionalities.mdc` — canonical module and schema specification (always applied)
- `.cursor/rules/spring-boot-rules.mdc` — Java Spring Boot conventions (always applied to `**/*.java`)
- `.cursor/settings.json` — MongoDB plugin enabled for Cursor
- `docs/PLATFORM-GUIDE.md` — full product documentation
- `README.md` — monorepo entry point (the `server/README.md` and `client/README.md` are package templates, not product docs)

## CI

GitHub Actions (`.github/workflows/build.yml`) runs `yarn install --frozen-lockfile` and `yarn build` for both `server/` and `client/` on push/PR to `main`, `master`, and `dev`. Node version is 22.