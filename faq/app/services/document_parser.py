import io
import re
from pathlib import Path

from fastapi import HTTPException, status
from pypdf import PdfReader


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_text_from_bytes(filename: str, content: bytes) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")

    if ext in ("txt", "md", "markdown"):
        return normalize_whitespace(content.decode("utf-8", errors="replace"))

    if ext == "pdf":
        reader = PdfReader(io.BytesIO(content))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        text = "\n".join(parts)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not extract text from PDF",
            )
        return normalize_whitespace(text)

    if ext == "docx":
        try:
            from docx import Document
        except ImportError as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="python-docx is not installed",
            ) from err
        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n".join(paragraphs)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not extract text from DOCX",
            )
        return normalize_whitespace(text)

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported file type: .{ext}. Use pdf, docx, txt, or md",
    )
