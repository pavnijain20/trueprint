import importlib.util
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import knowledge, retrieval, workflow
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


def test_main_exposes_knowledge_endpoints_once_without_writing_to_workspace(
    tmp_path, monkeypatch,
):
    kb_path = tmp_path / "main-test-kb.db"
    workflow_path = tmp_path / "main-test-workflow.db"
    monkeypatch.setattr(retrieval, "DB_PATH", kb_path)
    monkeypatch.setattr(workflow, "DB", workflow_path)
    monkeypatch.setattr(knowledge, "list_chunks", lambda _kind: [])

    main_path = Path(__file__).resolve().parents[1] / "main.py"
    spec = importlib.util.spec_from_file_location("trueprint_test_main", main_path)
    assert spec is not None and spec.loader is not None
    main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(main)

    paths = main.app.openapi()["paths"]
    assert set(paths["/api/knowledge/facts"]) == {"get", "post"}
    assert set(paths["/api/knowledge/guidelines"]) == {"get", "post"}

    with TestClient(main.app) as client:
        facts = client.get("/api/knowledge/facts")
        guidelines = client.get("/api/knowledge/guidelines")

    assert facts.status_code == 200
    assert facts.json() == []
    assert guidelines.status_code == 200
    assert guidelines.json() == []
    assert kb_path.exists()
    assert workflow_path.exists()
