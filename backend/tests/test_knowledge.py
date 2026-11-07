from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import retrieval
from app.knowledge import router


def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr(retrieval, "DB_PATH", tmp_path / "test_kb.db")
    retrieval.init_db()
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_create_fact_and_expired_flag(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/knowledge/facts",
        json={
            "title": "Old clinical claim",
            "text": "This claim has expired evidence.",
            "expires": "2000-01-01",
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["kind"] == "fact"
    assert created["expired"] is True

    listed = client.get("/api/knowledge/facts")
    assert listed.status_code == 200
    assert any(item["id"] == created["id"] and item["expired"] is True
               for item in listed.json())


def test_create_and_list_guideline(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/knowledge/guidelines",
        json={"title": "Tone", "text": "Use clear and friendly language."},
    )

    assert response.status_code == 201
    created = response.json()
    assert created["kind"] == "guideline"

    listed = client.get("/api/knowledge/guidelines")
    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())


def test_invalid_expiry_is_rejected(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/knowledge/facts",
        json={"title": "Fact", "text": "Evidence", "expires": "not-a-date"},
    )

    assert response.status_code == 400
