from fastapi import Header, HTTPException, status

from app.config import get_settings


def verify_api_key(x_faq_api_key: str | None = Header(default=None, alias="X-FAQ-API-Key")) -> None:
    expected = get_settings().faq_api_key
    if not x_faq_api_key or x_faq_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-FAQ-API-Key",
        )


def get_created_by(x_created_by: str | None = Header(default=None, alias="X-Created-By")) -> str:
    if x_created_by and x_created_by.strip():
        return x_created_by.strip()
    return "system"
