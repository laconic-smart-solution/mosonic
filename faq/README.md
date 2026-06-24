# Mosonic FAQ API (Python FastAPI)

Standalone FAQ microservice for Mosonic. Stores FAQs in the **same PostgreSQL** database as the Nest server (`DATABASE_URL`). Uses **LangChain + OpenAI** to generate FAQ rows from uploaded documentation.

## Setup

```bash
cd neutral-tex/faq
python -m venv .venv

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env: DATABASE_URL, OPENAI_API_KEY, FAQ_API_KEY
```

Copy `DATABASE_URL` and `OPENAI_API_KEY` from `../server/.env` if needed.

## Migrate database

```bash
alembic upgrade head
```

Creates `faqs` and `faq_documents` tables (does not modify Prisma tables).

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Swagger UI: http://localhost:8001/docs

## Authentication

Protected endpoints require header:

```
X-FAQ-API-Key: <FAQ_API_KEY from .env>
```

Optional audit header:

```
X-Created-By: admin@example.com
```

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness |
| GET | `/faqs` | No | List/search FAQs (`q`, `page`, `limit`) |
| POST | `/faqs/ask` | No | Ask a question (lightweight RAG over FAQs) |
| GET | `/faqs/{id}` | No | Get one FAQ |
| POST | `/faqs` | API key | Create FAQ manually |
| PATCH | `/faqs/{id}` | API key | Update FAQ |
| DELETE | `/faqs/{id}` | API key | Soft-delete (`?hard=true` for hard delete) |
| GET | `/documents` | API key | Paginated document list |
| GET | `/documents/{id}` | API key | Upload job status |
| GET | `/documents/{id}/faqs` | API key | FAQs generated from document |
| POST | `/documents/generate-faqs` | API key | Upload PDF/DOCX/TXT/MD → generate FAQs + index chunks |

## Example: create FAQ

```bash
curl -X POST http://localhost:8001/faqs \
  -H "Content-Type: application/json" \
  -H "X-FAQ-API-Key: change-me-shared-secret" \
  -H "X-Created-By: admin@example.com" \
  -d '{"question":"What is Mosonic?","answer":"An AI content platform."}'
```

## Example: ask a question

Public endpoint — searches CRUD and document-generated FAQs, uses a zero-token direct match when possible, otherwise a small LLM call with top-K context only.

```bash
curl -X POST http://localhost:8001/faqs/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I run a workflow?"}'
```

Response fields: `answer`, `source` (`direct_match` | `llm` | `no_match`), `confidence`, `matched_sources` (document filename + chunk excerpt).

`POST /faqs/ask` uses **vector RAG** (OpenAI embeddings stored as JSONB, cosine similarity retrieval) over document chunks, then **always synthesizes** a concise answer via LLM.

Reindex existing uploads after upgrading: `POST /documents/{id}/reindex` or `python scripts/backfill_embeddings.py`.

## Example: generate from document

```bash
curl -X POST http://localhost:8001/documents/generate-faqs \
  -H "X-FAQ-API-Key: change-me-shared-secret" \
  -H "X-Created-By: admin@example.com" \
  -F "file=@./sample.md"
```

Supported file types: `.pdf`, `.docx`, `.txt`, `.md`
