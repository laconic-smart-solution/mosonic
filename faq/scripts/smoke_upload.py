"""One-off document upload smoke test (requires OPENAI_API_KEY)."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
sample = Path(__file__).resolve().parent.parent / "sample.md"

with sample.open("rb") as f:
    response = client.post(
        "/documents/generate-faqs",
        files={"file": ("sample.md", f, "text/markdown")},
        headers={"X-FAQ-API-Key": "test-secret", "X-Created-By": "smoke"},
    )

print("upload", response.status_code)
if response.status_code == 200:
    data = response.json()
    doc_id = data.get("document_id")
    print("document_id", doc_id)
    print("faq_count", data.get("faq_count"))
    print("faqs", len(data.get("faqs", [])))
    doc = client.get(
        f"/documents/{doc_id}",
        headers={"X-FAQ-API-Key": "test-secret"},
    )
    print("doc_status", doc.status_code, doc.json().get("status"))
else:
    print(response.text[:500])
