import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import workflow as wf

FAKE = {"findings": [{"category": "claim", "severity": "high", "flagged_text": "x", "reason": "r",
                      "confidence": 1.0, "origin": "ai", "validated": True,
                      "source": {"id": "guide_02", "quote": "q"}, "suggested_fix": "fix"}],
        "risk": {"level": "High"}, "error": None}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(wf, "DB", tmp_path / "w.db")
    monkeypatch.setattr(wf, "source_name", lambda sid: sid)
    monkeypatch.setattr(wf, "review_text", lambda text: FAKE)
    wf.init()
    app = FastAPI()
    app.include_router(wf.router)
    return TestClient(app)


def new_draft(client):
    return client.post("/api/drafts", json={"title": "t", "content": "hello"}).json()["id"]


def test_review_saves_findings_in_frontend_shape(client):
    did = new_draft(client)
    f = client.post(f"/api/drafts/{did}/review").json()["findings"][0]
    assert f["sourceName"] == "guide_02" and f["isAI"] is True and f["status"] == "open"


def test_dismiss_needs_a_reason(client):
    did = new_draft(client)
    fid = client.post(f"/api/drafts/{did}/review").json()["findings"][0]["id"]
    assert client.patch(f"/api/findings/{fid}", json={"status": "dismissed"}).status_code == 400
    ok = client.patch(f"/api/findings/{fid}", json={"status": "dismissed", "reason": "not relevant"})
    assert ok.status_code == 200 and ok.json()["status"] == "dismissed"


def test_author_cannot_approve_but_reviewer_can(client):
    did = new_draft(client)
    client.post(f"/api/drafts/{did}/submit", json={})
    bad = client.post(f"/api/drafts/{did}/decision", json={"type": "approved", "byName": "A", "byRole": "author"})
    assert bad.status_code == 403
    good = client.post(f"/api/drafts/{did}/decision", json={"type": "approved", "byName": "R", "byRole": "reviewer"})
    assert good.status_code == 200
    assert client.get(f"/api/drafts/{did}").json()["draft"]["status"] == "approved"


def test_approved_draft_is_locked_and_audit_is_kept(client):
    did = new_draft(client)
    client.post(f"/api/drafts/{did}/submit", json={})
    client.post(f"/api/drafts/{did}/decision", json={"type": "approved", "byName": "R", "byRole": "approver"})
    assert client.patch(f"/api/drafts/{did}", json={"content": "new"}).status_code == 409
    assert len(client.get("/api/audit").json()) >= 3