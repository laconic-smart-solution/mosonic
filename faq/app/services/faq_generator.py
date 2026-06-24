import re

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field

from app.config import get_settings


class FaqPair(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FaqPairList(BaseModel):
    items: list[FaqPair] = Field(default_factory=list)


PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You extract comprehensive FAQ pairs from product documentation. "
            "Only use information present in the text. Do not invent facts. "
            "Cover every section, definition, feature, UI area, and procedure in the excerpt. "
            "When the text introduces a product or concept, include overview questions "
            "(e.g. 'What is Mosonic?'). "
            "For procedures, write complete step-by-step answers. "
            "For important topics, add alternate question phrasings that users might ask "
            "(e.g. 'How do I check my credit balance?' and 'How to check remaining credits?'). "
            "Write clear questions and complete, self-contained answers. "
            "Return as many useful pairs as the content supports (typically 8-15 per excerpt).",
        ),
        (
            "human",
            "Document excerpt:\n\n{text}\n\nExtract FAQ question/answer pairs.",
        ),
    ]
)


def _add_alternate_phrasings(pairs: list[FaqPair]) -> list[FaqPair]:
    """Add common user phrasings for key topics already covered."""
    alternates: list[tuple[str, str]] = [
        (
            "How to check credit balance?",
            "How do I check my remaining credits in Mosonic?",
        ),
        (
            "How to check remaining balance?",
            "How do I check my remaining credits in Mosonic?",
        ),
        (
            "What is Mosonic?",
            "What is Mosonic?",
        ),
    ]
    by_question = {_normalize_question(p.question): p for p in pairs}
    extras: list[FaqPair] = []
    for alt_q, source_q in alternates:
        source = by_question.get(_normalize_question(source_q))
        if not source:
            continue
        if _normalize_question(alt_q) in by_question:
            continue
        extras.append(FaqPair(question=alt_q, answer=source.answer))
        by_question[_normalize_question(alt_q)] = extras[-1]
    return pairs + extras


def _normalize_question(q: str) -> str:
    return re.sub(r"\s+", " ", q.strip().lower())


def generate_faqs_from_text(text: str) -> list[FaqPair]:
    settings = get_settings()
    if not settings.openai_api_key.strip():
        raise ValueError("OPENAI_API_KEY is not set")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=2500,
        chunk_overlap=300,
    )
    chunks = splitter.split_text(text)
    if not chunks:
        return []

    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0.2,
    )
    structured = llm.with_structured_output(FaqPairList)
    chain = PROMPT | structured

    seen: set[str] = set()
    results: list[FaqPair] = []

    for chunk in chunks:
        if not chunk.strip():
            continue
        try:
            output: FaqPairList = chain.invoke({"text": chunk})
        except Exception:
            continue
        for pair in output.items:
            key = _normalize_question(pair.question)
            if not key or key in seen:
                continue
            seen.add(key)
            results.append(
                FaqPair(
                    question=pair.question.strip(),
                    answer=pair.answer.strip(),
                )
            )

    return _add_alternate_phrasings(results)
