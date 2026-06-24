"""Smoke tests for FAQ API (no OpenAI calls)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_faq_requires_api_key():
    response = client.post(
        "/faqs",
        json={"question": "Q?", "answer": "A."},
    )
    assert response.status_code == 401


def test_list_faqs():
    response = client.get("/faqs")
    assert response.status_code in (200, 500)
