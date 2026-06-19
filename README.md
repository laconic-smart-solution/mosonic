# Mosonic Monorepo

**Mosonic** is a cloud SaaS platform for AI-driven marketing content: campaign strategy, multi-step generation pipelines, review, multi-channel publishing, and analytics-driven rule improvements. This repository contains the full-stack implementation.

- **Frontend:** React 19 + Vite + TypeScript (`client/`)
- **Backend:** NestJS + MongoDB + Redis/BullMQ orchestration (`server/`)

## Documentation

| Document | Description |
|----------|-------------|
| **[Platform Guide](docs/PLATFORM-GUIDE.md)** | Full product documentation: concept, flow, architecture, UI map, user journey, user manual, admin guide |
| [Project specification](.cursor/rules/Project-flow-and-funtionalities.mdc) | Canonical module and schema specification |

**Platform guide table of contents:**

1. Product concept  
2. End-to-end platform flow (7 modules)  
3. Technology stack  
4. System architecture  
5. How the platform handles key concerns  
6. Interface map (routes and Socket.IO)  
7. User journey  
8. User manual (CUSTOMER)  
9. Admin guide (ADMIN)  
10. Roles comparison  
11. Known gaps and roadmap notes  

## Repository Structure

```text
neutral-tex/
├── client/   # Vite React app
├── server/   # NestJS API + orchestration engine
└── docs/     # Platform documentation
```

## Tech Stack

### Frontend (`client`)

- React 19
- Vite
- TypeScript
- TanStack Query
- Zustand (auth + user profile)
- Socket.IO client
- React Flow (workflow canvas)

### Backend (`server`)

- NestJS
- MongoDB (Mongoose)
- Redis + BullMQ (pipeline queue)
- LangChain + provider SDKs
- Socket.IO (live events)
- External SSO auth; Zernio for publishing

## Prerequisites

- Node.js 20+ recommended
- Yarn (Berry/modern Yarn is used in this repo)
- MongoDB running locally or accessible remotely
- Redis (for BullMQ when `ORCHESTRATION_USE_QUEUE=true`)

Optional, depending on provider/features:

- OpenAI / Anthropic / Google / Groq API keys
- Ollama (local) for `ollama` provider
- File service endpoint for media upload
- Zernio API key and MCP URL for social publishing

## Quick Start

### 1) Clone and install dependencies

Install per package (no root workspace scripts configured):

```bash
cd server && yarn install
cd ../client && yarn install
```

### 2) Configure environment files

Create env files from examples:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Minimum required values:

- `server/.env`
  - `MONGODB_URI`
  - `PORT` (default `3000`)
  - `REDIS_HOST` / `REDIS_PORT` (if using queue mode)
  - AI provider settings (`LLM_PROVIDER` and relevant API keys)
- `client/.env`
  - `VITE_API_BASE_URL` (usually `http://localhost:3000`)

### 3) Run backend

```bash
cd server
yarn start:dev
```

Backend starts on `http://localhost:3000` by default. API docs: `http://localhost:3000/docs`.

### 4) Run frontend

```bash
cd client
yarn dev
```

Frontend usually starts on `http://localhost:5173`.

## AI Provider Configuration

Backend provider selection is environment/config driven:

- Global default: `LLM_PROVIDER` in `server/.env`
- Supported provider keys in `server/.env.example`:
  - `openai`
  - `anthropic`
  - `google`
  - `groq`
  - `ollama`

Note: capabilities vary by provider (for example, image/video generation is not supported for every provider). See the [Platform Guide](docs/PLATFORM-GUIDE.md#3-technology-stack) for the capability matrix.

## Common Commands

### Backend (`server`)

```bash
yarn start:dev     # run with watch
yarn build         # compile NestJS
yarn test          # unit tests
yarn test:e2e      # e2e tests
yarn lint          # eslint --fix
```

### Frontend (`client`)

```bash
yarn dev           # run Vite dev server
yarn build         # typecheck + production build
yarn typecheck     # TS type check
yarn lint          # eslint
```

## Backend Modules at a Glance

The server app imports these core domains (see `server/src/app.module.ts`):

- `rule`, `workflow`, `pipeline`, `orchestration`, `content`, `upload`, `post`, `analytics`
- `logging`, `events`, `llm`, `nodes`, `preprocessing`
- `auth`, `users`, `admin`, `cost`, `campaign`, `dashboard`, `mcp`, `integrations`, `webhook`

End-to-end flow and UI mapping: [Platform Guide §2](docs/PLATFORM-GUIDE.md#2-end-to-end-platform-flow).

## Troubleshooting

- **Mongo connection error**
  - Verify `MONGODB_URI` is reachable from the backend process.
- **Redis / queue errors**
  - Ensure Redis is running when `ORCHESTRATION_USE_QUEUE=true`.
- **Frontend cannot call API**
  - Confirm `client/.env` has `VITE_API_BASE_URL` pointing to running backend.
- **Model/provider errors**
  - Ensure selected provider has valid API key and supports the requested capability.
- **Publishing fails**
  - Connect social accounts under `/settings/accounts`; verify `ZERNIO_*` env vars on the server.
- **CORS issues**
  - Backend enables CORS with `origin: true`; verify requests hit the same backend instance you configured.

## Notes

- `client/README.md` and `server/README.md` are package templates (Vite/Nest defaults), not product docs.
- This root README is the monorepo entry point for local development; product details live in [docs/PLATFORM-GUIDE.md](docs/PLATFORM-GUIDE.md).
