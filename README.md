# Neutral Tex Monorepo

Neutral Tex is a monorepo with:

- `client/`: React 19 + Vite + TypeScript frontend
- `server/`: NestJS + MongoDB backend (AI workflow orchestration)

## Repository Structure

```text
neutral-tex/
├── client/   # Vite React app
└── server/   # NestJS API + orchestration engine
```

## Tech Stack

### Frontend (`client`)

- React 19
- Vite
- TypeScript
- React Query
- Zustand
- Socket.IO client

### Backend (`server`)

- NestJS
- MongoDB (Mongoose)
- LangChain + provider SDKs
- Socket.IO (events/log streaming)

## Prerequisites

- Node.js 20+ recommended
- Yarn (Berry/modern Yarn is used in this repo)
- MongoDB running locally or accessible remotely

Optional, depending on provider/features:

- OpenAI / Anthropic / Google / Groq API keys
- Ollama (local) for `ollama` provider
- File service endpoint for media upload

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
  - AI provider settings (`LLM_PROVIDER` and relevant API keys)
- `client/.env`
  - `VITE_API_BASE_URL` (usually `http://localhost:3000`)

### 3) Run backend

```bash
cd server
yarn start:dev
```

Backend starts on `http://localhost:3000` by default.

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

Note: capabilities vary by provider (for example, image/video generation is not supported for every provider).

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

The server app imports these core domains:

- `rule`
- `workflow`
- `pipeline`
- `orchestration`
- `content`
- `upload`
- `analytics`
- `logging`
- `events`
- `llm`
- `nodes`
- `preprocessing`

See `server/src/app.module.ts` for the canonical module wiring.

## Troubleshooting

- **Mongo connection error**
  - Verify `MONGODB_URI` is reachable from the backend process.
- **Frontend cannot call API**
  - Confirm `client/.env` has `VITE_API_BASE_URL` pointing to running backend.
- **Model/provider errors**
  - Ensure selected provider has valid API key and supports the requested capability.
- **CORS issues**
  - Backend enables CORS with `origin: true`; verify requests hit the same backend instance you configured.

## Notes

- Existing `client/README.md` and `server/README.md` contain package-specific details.
- This root README is the monorepo entry point for local development.
