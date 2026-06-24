from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import documents, faqs, health

settings = get_settings()

app = FastAPI(
    title="Mosonic FAQ API",
    description="FAQ CRUD and document-to-FAQ generation via LangChain + OpenAI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(faqs.router)
app.include_router(documents.router)
