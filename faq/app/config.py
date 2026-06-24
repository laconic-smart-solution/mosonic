from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    faq_api_key: str
    faq_port: int = 8001
    faq_cors_origins: str = "http://localhost:5173,http://localhost:3000"
    faq_ask_top_k: int = 5
    faq_ask_max_distance: float = 0.55
    faq_ask_max_answer_chars: int = 400
    faq_ask_max_context_chars: int = 3000
    faq_ask_faq_match_max_distance: float = 0.43

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.faq_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
