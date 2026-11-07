from io import BytesIO

from docx import Document
from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient, role: str):
    response = client.post("/auth/demo-login", json={"role": role, "name": f"QA {role}"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_end_to_end_backend_workflow():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "healthy"
        admin = _login(client, "admin")
        creator = _login(client, "creator")
        reviewer = _login(client, "reviewer")
        manager = _login(client, "manager")

        fact = client.post("/knowledge/facts", headers=admin, json={
            "claim": "The product is dermatologist-tested.", "source": "QA only",
            "owner": "QA", "verified_date": "2026-11-06", "expiry_date": None,
            "status": "approved",
        })
        assert fact.status_code == 200, fact.text

        content = (
            "Our serum is clinically proven to remove acne in 7 days, "
            "guaranteed and 100% effective. Dermatologist-tested."
        )
        draft = client.post("/drafts", headers=creator, json={
            "title": "QA ONLY - DO NOT PUBLISH", "content": content, "channel": "instagram",
        })
        assert draft.status_code == 200, draft.text
        draft_id = draft.json()["id"]

        review = client.post(f"/drafts/{draft_id}/review", headers=creator)
        assert review.status_code == 200, review.text
        findings = review.json()["findings"]
        assert {x["flagged_text"] for x in findings} == {
            "clinically proven", "remove acne in 7 days", "guaranteed", "100% effective",
        }

        # A creator edit changes real draft content and creates version 2.
        clinical = next(x for x in findings if x["flagged_text"] == "clinically proven")
        edit = client.patch(f"/findings/{clinical['id']}", headers=creator, json={
            "action": "edit", "edited_text": "evidence-backed", "reason": "QA edit test",
        })
        assert edit.status_code == 200, edit.text
        changed_draft = client.get(f"/drafts/{draft_id}", headers=creator).json()
        assert "evidence-backed" in changed_draft["content"]
        assert "clinically proven" not in changed_draft["content"]
        versions = client.get(f"/drafts/{draft_id}/versions", headers=creator).json()
        assert len(versions) == 2
        assert client.get(f"/drafts/{draft_id}/diff", headers=creator).status_code == 200

        # Comments validate that the referenced finding belongs to this draft.
        comment = client.post(f"/drafts/{draft_id}/comments", headers=manager, json={
            "body": "QA reviewer note", "finding_id": findings[0]["id"],
        })
        assert comment.status_code == 200, comment.text
        assert len(client.get(f"/drafts/{draft_id}/comments", headers=manager).json()) == 1
        bad_comment = client.post(f"/drafts/{draft_id}/comments", headers=manager, json={
            "body": "invalid finding ref", "finding_id": "not-a-finding",
        })
        assert bad_comment.status_code == 422

        # Reviewer actions and specialist sign-off gate manager approval.
        remove = next(x for x in findings if x["flagged_text"] == "remove acne in 7 days")
        guaranteed = next(x for x in findings if x["flagged_text"] == "guaranteed")
        accepted = client.patch(f"/findings/{remove['id']}", headers=reviewer, json={
            "action": "accept", "reason": "QA reviewer accepted after checking evidence.",
        })
        assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
        dismissed = client.patch(f"/findings/{guaranteed['id']}", headers=reviewer, json={
            "action": "dismiss", "reason": "QA-only dismissal test; not for publication.",
        })
        assert dismissed.status_code == 200 and dismissed.json()["status"] == "dismissed"
        assert client.post(f"/drafts/{draft_id}/approve", headers=manager).status_code == 409
        signoff = client.post(f"/drafts/{draft_id}/reviewer-signoff", headers=reviewer, json={
            "reason": "Specialist reviewed the remaining high-risk QA finding; demo only.",
        })
        assert signoff.status_code == 200, signoff.text
        submitted = client.post(f"/drafts/{draft_id}/submit", headers=creator)
        assert submitted.status_code == 200 and submitted.json()["status"] == "submitted"
        approved = client.post(f"/drafts/{draft_id}/approve", headers=manager)
        assert approved.status_code == 200 and approved.json()["reviewer_signoff"] is True

        assert client.get("/audit", headers=manager).status_code == 200
        insights = client.get("/insights", headers=manager)
        assert insights.status_code == 200 and "draft_count" in insights.json()

        # Pavni's AI output can be imported only when quote and offsets match.
        second = client.post("/drafts", headers=creator, json={
            "title": "AI IMPORT QA ONLY", "content": "This is a test caption.", "channel": "other",
        }).json()
        imported = client.post(f"/drafts/{second['id']}/findings/import", headers=reviewer, json={
            "findings": [{
                "category": "voice", "flagged_text": "test caption", "start": 10, "end": 22,
                "reason": "QA voice agent tone finding.", "severity": "medium", "confidence": 0.88,
                "source_type": "guideline", "source_quote": "Use warm and clear language.",
                "suggested_fix": "Use warmer wording.", "validated": True,
            }],
        })
        assert imported.status_code == 200 and imported.json()["imported_count"] == 1
        invalid_import = client.post(f"/drafts/{second['id']}/findings/import", headers=reviewer, json={
            "findings": [{
                "category": "voice", "flagged_text": "not present", "start": 0, "end": 5,
                "reason": "Bad offsets", "severity": "low", "confidence": 0.5,
            }],
        })
        assert invalid_import.status_code == 422

        # Accessibility helpers and document upload parser.
        contrast = client.post("/checks/contrast", headers=admin, json={
            "foreground": "#000000", "background": "#FFFFFF",
        })
        assert contrast.status_code == 200 and contrast.json()["passes"] is True
        alt = client.post("/checks/alt-text", headers=admin, json={
            "image_count": 1, "alt_texts": ["A skincare serum bottle"],
        })
        assert alt.status_code == 200 and alt.json()["passes"] is True

        document = Document()
        document.add_paragraph("Trueprint document upload QA sample.")
        buffer = BytesIO()
        document.save(buffer)
        upload = client.post("/documents/upload", headers=creator, files={
            "file": ("qa.docx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        })
        assert upload.status_code == 200, upload.text
        assert "document upload QA sample" in upload.json()["text"]
