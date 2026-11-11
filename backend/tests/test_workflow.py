from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import workflow as wf


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(wf, "DB", tmp_path / "workflow.db")
    monkeypatch.setattr(wf, "source_name", lambda sid: sid)
    monkeypatch.setattr(wf, "review_text", lambda text: FAKE)
    wf.init()
    app = FastAPI()
    app.include_router(wf.router)
    return TestClient(app)


FAKE = {
    "findings": [{
        "category": "claim",
        "severity": "high",
        "flagged_text": "x",
        "reason": "r",
        "confidence": 1.0,
        "origin": "ai",
        "validated": True,
        "source": {"id": "guide_02", "quote": "q"},
        "suggested_fix": "fix",
    }],
    "risk": {"level": "High"},
    "error": None,
}


def new_draft(client):
    response = client.post("/api/drafts", json={"title": "Workflow test", "content": "hello"})
    assert response.status_code == 200
    return response.json()["id"]


def insert_draft(draft_id, title, author, status, content):
    with wf.conn() as connection:
        connection.execute(
            "INSERT INTO drafts VALUES (?,?,?,?,?,?)",
            (draft_id, title, author, status, "2026-01-01T00:00:00+00:00", content),
        )


def test_initialization_creates_permanent_product_page_demo(client):
    response = client.get("/api/drafts/d_demo6")

    assert response.status_code == 200
    draft = response.json()["draft"]
    assert draft["id"] == "d_demo6"
    assert draft["title"] == wf.PRODUCT_PAGE_DEMO["title"]
    assert draft["author"] == "Taylor Brooks"
    assert draft["status"] == "in_review"
    assert draft["content"] == wf.PRODUCT_PAGE_DEMO["content"]
    assert len(response.json()["versions"]) == 1
    stable_demo_ids = {
        draft["id"] for draft in client.get("/api/drafts").json()
        if draft["id"] in {f"d_demo{index}" for index in range(1, 6)}
    }
    assert stable_demo_ids == {f"d_demo{index}" for index in range(1, 6)}
    activity_actions = {event["action"] for event in response.json()["activity"]}
    assert {"draft_created", "submitted_for_review"} <= activity_actions
    with wf.conn() as connection:
        events = connection.execute(
            "SELECT actor, role, action, draft_id, detail, at FROM audit_log "
            "WHERE draft_id = 'd_demo6' ORDER BY action"
        ).fetchall()
    assert [tuple(event) for event in events] == [
        ("Taylor Brooks", "author", "draft_created", "d_demo6",
         "Product page: Team planning toolkit", draft["updatedAt"]),
        ("Taylor Brooks", "author", "submitted_for_review", "d_demo6", "", draft["updatedAt"]),
    ]


def test_repeated_initialization_is_idempotent_and_preserves_existing_demos(client):
    with wf.conn() as connection:
        existing_drafts = connection.execute(
            "SELECT id, title, author, status, updated_at, content FROM drafts "
            "WHERE id != 'd_demo6' ORDER BY id"
        ).fetchall()
        existing_versions = connection.execute(
            "SELECT id, draft_id, content, note, created_at FROM versions "
            "WHERE draft_id = 'd_demo6'"
        ).fetchall()
        existing_audit = connection.execute(
            "SELECT id, at, actor, role, action, draft_id, detail FROM audit_log "
            "WHERE draft_id = 'd_demo6' ORDER BY action"
        ).fetchall()

    wf.init()

    with wf.conn() as connection:
        repeated_drafts = connection.execute(
            "SELECT id, title, author, status, updated_at, content FROM drafts "
            "WHERE id != 'd_demo6' ORDER BY id"
        ).fetchall()
        product_page_count = connection.execute(
            "SELECT COUNT(*) FROM drafts WHERE id = 'd_demo6'"
        ).fetchone()[0]
        repeated_versions = connection.execute(
            "SELECT id, draft_id, content, note, created_at FROM versions "
            "WHERE draft_id = 'd_demo6'"
        ).fetchall()
        repeated_audit = connection.execute(
            "SELECT id, at, actor, role, action, draft_id, detail FROM audit_log "
            "WHERE draft_id = 'd_demo6' ORDER BY action"
        ).fetchall()

    assert [tuple(row) for row in repeated_drafts] == [tuple(row) for row in existing_drafts]
    assert product_page_count == 1
    assert [tuple(row) for row in repeated_versions] == [tuple(row) for row in existing_versions]
    assert [tuple(row) for row in repeated_audit] == [tuple(row) for row in existing_audit]
    assert [row["action"] for row in repeated_audit] == [
        "draft_created",
        "submitted_for_review",
    ]


def test_populated_database_receives_product_page_without_reseeding_existing_drafts(
    tmp_path, monkeypatch,
):
    monkeypatch.setattr(wf, "DB", tmp_path / "populated.db")
    with wf.conn() as connection:
        connection.executescript(wf.SCHEMA)
        connection.execute(
            "INSERT INTO drafts VALUES (?,?,?,?,?,?)",
            ("existing-id", "Existing draft", "Existing author", "changes_requested",
             "2026-01-01T00:00:00+00:00", "Existing content"),
        )

    wf.init()

    with wf.conn() as connection:
        existing = connection.execute(
            "SELECT id, title, author, status, updated_at, content FROM drafts WHERE id = ?",
            ("existing-id",),
        ).fetchone()
        product_page = connection.execute(
            "SELECT id, title, author, status, content FROM drafts WHERE id = 'd_demo6'"
        ).fetchone()
        total_drafts = connection.execute("SELECT COUNT(*) FROM drafts").fetchone()[0]

    assert tuple(existing) == (
        "existing-id", "Existing draft", "Existing author", "changes_requested",
        "2026-01-01T00:00:00+00:00", "Existing content",
    )
    assert tuple(product_page) == (
        "d_demo6", wf.PRODUCT_PAGE_DEMO["title"], "Taylor Brooks", "in_review",
        wf.PRODUCT_PAGE_DEMO["content"],
    )
    assert total_drafts == 2


@pytest.mark.parametrize(
    ("field", "conflicting_value"),
    [
        ("content", "Different content"),
        ("title", "Different title"),
        ("author", "Different author"),
    ],
)
def test_conflicting_d_demo6_is_reported_and_not_overwritten(
    tmp_path, monkeypatch, caplog, field, conflicting_value,
):
    monkeypatch.setattr(wf, "DB", tmp_path / "conflicting-id.db")
    with wf.conn() as connection:
        connection.executescript(wf.SCHEMA)
    conflicting_draft = {
        "title": wf.PRODUCT_PAGE_DEMO["title"],
        "author": "Taylor Brooks",
        "status": "draft",
        "content": wf.PRODUCT_PAGE_DEMO["content"],
    }
    conflicting_draft[field] = conflicting_value
    insert_draft(
        "d_demo6",
        conflicting_draft["title"],
        conflicting_draft["author"],
        conflicting_draft["status"],
        conflicting_draft["content"],
    )

    created = wf.provision_product_page_demo()

    with wf.conn() as connection:
        draft = connection.execute(
            "SELECT title, author, status, content FROM drafts WHERE id = 'd_demo6'"
        ).fetchone()
        version_count = connection.execute(
            "SELECT COUNT(*) FROM versions WHERE draft_id = 'd_demo6'"
        ).fetchone()[0]

    assert created is False
    assert tuple(draft) == tuple(conflicting_draft[key] for key in ("title", "author", "status", "content"))
    assert version_count == 0
    assert f"conflicting {field}" in caplog.text
    assert "existing data was not modified" in caplog.text


def test_equivalent_product_page_under_another_id_is_reported_without_duplicate(
    tmp_path, monkeypatch, caplog,
):
    monkeypatch.setattr(wf, "DB", tmp_path / "duplicate-title.db")
    with wf.conn() as connection:
        connection.executescript(wf.SCHEMA)
    insert_draft(
        "existing-product",
        wf.PRODUCT_PAGE_DEMO["title"],
        "Taylor Brooks",
        "draft",
        wf.PRODUCT_PAGE_DEMO["content"],
    )

    wf.init()

    with wf.conn() as connection:
        product_page_rows = connection.execute(
            "SELECT id FROM drafts WHERE lower(trim(title)) = lower(trim(?))",
            (wf.PRODUCT_PAGE_DEMO["title"],),
        ).fetchall()

    assert [row["id"] for row in product_page_rows] == ["existing-product"]
    assert "conflicts with an existing Product Page draft" in caplog.text
    assert "existing-product" in caplog.text


def test_matching_existing_d_demo6_is_left_unchanged(tmp_path, monkeypatch):
    monkeypatch.setattr(wf, "DB", tmp_path / "existing-id.db")
    with wf.conn() as connection:
        connection.executescript(wf.SCHEMA)
    insert_draft(
        "d_demo6",
        wf.PRODUCT_PAGE_DEMO["title"],
        "Taylor Brooks",
        "approved",
        wf.PRODUCT_PAGE_DEMO["content"],
    )

    created = wf.provision_product_page_demo()

    with wf.conn() as connection:
        draft = connection.execute(
            "SELECT id, title, author, status, updated_at, content FROM drafts WHERE id = 'd_demo6'"
        ).fetchone()
        audit_count = connection.execute(
            "SELECT COUNT(*) FROM audit_log WHERE draft_id = 'd_demo6'"
        ).fetchone()[0]

    assert created is False
    assert tuple(draft) == (
        "d_demo6", wf.PRODUCT_PAGE_DEMO["title"], "Taylor Brooks", "approved",
        "2026-01-01T00:00:00+00:00", wf.PRODUCT_PAGE_DEMO["content"],
    )
    assert audit_count == 0


def test_init_adds_finding_offset_columns_to_existing_database(tmp_path, monkeypatch):
    monkeypatch.setattr(wf, "DB", tmp_path / "legacy-schema.db")
    legacy_schema = wf.SCHEMA.replace(", start_offset INTEGER, end_offset INTEGER", "")
    with wf.conn() as connection:
        connection.executescript(legacy_schema)
        connection.execute(
            "INSERT INTO drafts VALUES (?,?,?,?,?,?)",
            ("legacy-draft", "Legacy draft", "Author", "draft",
             "2026-01-01T00:00:00+00:00", "Legacy content"),
        )

    wf.init()

    with wf.conn() as connection:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(findings)")}

    assert {"start_offset", "end_offset"} <= columns


@pytest.mark.parametrize(
    "updated_content",
    ["Changed while review was running.", "hello"],
)
def test_review_rejects_results_if_draft_changes_during_review(
    client, monkeypatch, updated_content,
):
    draft_id = new_draft(client)

    def edit_while_reviewing(content):
        edited = client.patch(
            f"/api/drafts/{draft_id}",
            json={"content": updated_content, "by": "Author", "role": "author"},
        )
        assert edited.status_code == 200
        return {
            "findings": [{
                "category": "claim",
                "severity": "high",
                "flagged_text": "hello",
                "start": 0,
                "end": 5,
                "reason": "Stale result",
                "source": {"id": "guide_stale", "quote": "Guidance"},
                "suggested_fix": "Review the updated content.",
                "confidence": 1.0,
                "origin": "ai",
            }],
            "risk": {"level": "high", "score": 1},
            "error": None,
        }

    monkeypatch.setattr(wf, "review_text", edit_while_reviewing)

    response = client.post(f"/api/drafts/{draft_id}/review")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Draft changed while review was running. Run the review again."
    )
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["content"] == updated_content
    assert detail["findings"] == []
    events = [
        event for event in client.get("/api/audit").json()
        if event["draft_id"] == draft_id
    ]
    assert not any(event["action"] == "review_run" for event in events)


def test_review_persists_finding_offsets_for_repeated_quotes(client, monkeypatch):
    draft_id = new_draft(client)
    repeated_content = "echo / echo"
    client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": repeated_content, "by": "Author", "role": "author"},
    )
    second_occurrence = repeated_content.rindex("echo")
    monkeypatch.setattr(
        wf,
        "review_text",
        lambda _content: {
            "findings": [{
                "category": "claim",
                "severity": "medium",
                "flagged_text": "echo",
                "start": second_occurrence,
                "end": second_occurrence + len("echo"),
                "reason": "Check this occurrence.",
                "source": {"id": "guide_offsets", "quote": "Guidance"},
                "suggested_fix": "Review this wording.",
                "confidence": 0.9,
                "origin": "ai",
            }],
            "risk": {"level": "medium", "score": 1},
            "error": None,
        },
    )

    response = client.post(f"/api/drafts/{draft_id}/review")

    assert response.status_code == 200
    finding = response.json()["findings"][0]
    assert finding["quote"] == "echo"
    assert finding["startOffset"] == second_occurrence
    assert finding["endOffset"] == second_occurrence + len("echo")
    with wf.conn() as connection:
        row = connection.execute(
            "SELECT start_offset, end_offset FROM findings WHERE id = ?", (finding["id"],)
        ).fetchone()
    assert tuple(row) == (second_occurrence, second_occurrence + len("echo"))


def test_submission_persists_and_reviewer_can_request_changes(client):
    draft_id = new_draft(client)
    assert client.get(f"/api/drafts/{draft_id}").json()["draft"]["status"] == "draft"

    submitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "in_review"
    assert client.get(f"/api/drafts/{draft_id}").json()["draft"]["status"] == "in_review"

    unchanged_save = client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": "hello", "by": "Author", "role": "author"},
    )
    assert unchanged_save.status_code == 200
    assert unchanged_save.json()["status"] == "in_review"

    decision = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={
            "type": "changes_requested",
            "byName": "Reviewer",
            "byRole": "reviewer",
            "note": "Please revise the wording.",
        },
    )
    assert decision.status_code == 200
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "changes_requested"
    assert detail["decisions"][0]["note"] == "Please revise the wording."
    events = client.get("/api/audit").json()
    decision_event = next(
        event for event in events
        if event["draft_id"] == draft_id and event["action"] == "decision_changes_requested"
    )
    assert decision_event["detail"] == "Please revise the wording."


def test_content_edit_before_decision_is_auto_submitted(client):
    draft_id = new_draft(client)
    client.post(f"/api/drafts/{draft_id}/submit", json={"by": "Author", "role": "author"})

    changed = client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": "edited after submission"},
    )
    decision = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={
            "type": "changes_requested",
            "byName": "Reviewer",
            "byRole": "reviewer",
            "note": "Please revise the wording.",
        },
    )

    assert changed.status_code == 200
    assert changed.json()["status"] == "draft"
    assert decision.status_code == 200
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "changes_requested"
    assert detail["decisions"][0]["type"] == "changes_requested"
    assert any(event["action"] == "auto_submitted_for_review" for event in detail["activity"])


def test_author_can_edit_after_changes_requested_and_must_resubmit(client):
    draft_id = new_draft(client)
    submitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert submitted.status_code == 200
    requested = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={
            "type": "changes_requested",
            "byName": "Reviewer",
            "byRole": "reviewer",
            "note": "Please revise the wording.",
        },
    )
    assert requested.status_code == 200

    edited = client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": "Updated by the author.", "by": "Author", "role": "author"},
    )
    detail = client.get(f"/api/drafts/{draft_id}").json()

    assert edited.status_code == 200
    assert edited.json()["status"] == "draft"
    assert detail["draft"]["status"] == "draft"
    assert detail["draft"]["content"] == "Updated by the author."
    assert detail["decisions"][0]["note"] == "Please revise the wording."
    resubmitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert resubmitted.status_code == 200
    assert resubmitted.json()["status"] == "in_review"


@pytest.mark.parametrize("role", ["reviewer", "approver", "admin"])
def test_non_author_cannot_edit_draft_content(client, role):
    draft_id = new_draft(client)

    response = client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": "Unauthorized edit.", "by": "User", "role": role},
    )

    assert response.status_code == 403
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["content"] == "hello"
    assert detail["draft"]["status"] == "draft"


def test_non_author_cannot_submit_for_review(client):
    draft_id = new_draft(client)

    response = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Reviewer", "role": "reviewer"},
    )

    assert response.status_code == 403
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "draft"


def test_approver_can_approve_and_duplicate_decision_is_rejected(client):
    draft_id = new_draft(client)
    submitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "in_review"
    assert client.get(f"/api/drafts/{draft_id}").json()["draft"]["status"] == "in_review"

    payload = {
        "type": "approved",
        "byName": "Approver",
        "byRole": "approver",
        "note": "",
    }
    approved = client.post(f"/api/drafts/{draft_id}/decision", json=payload)
    duplicate = client.post(f"/api/drafts/{draft_id}/decision", json=payload)

    assert approved.status_code == 200
    assert duplicate.status_code == 409
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "approved"
    assert len(detail["decisions"]) == 1
    assert detail["decisions"][0]["type"] == "approved"
    assert client.get(f"/api/drafts/{draft_id}").json()["draft"]["status"] == "approved"


def test_reviewer_cannot_approve_submitted_draft(client):
    draft_id = new_draft(client)
    submitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert submitted.status_code == 200

    response = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={"type": "approved", "byName": "Reviewer", "byRole": "reviewer"},
    )

    assert response.status_code == 403
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "in_review"
    assert detail["decisions"] == []


@pytest.mark.parametrize(
    ("decision_type", "role", "expected_status"),
    [
        ("approved", "approver", 200),
        ("approved", "admin", 200),
        ("approved", "reviewer", 403),
        ("approved", "author", 403),
        ("changes_requested", "reviewer", 200),
        ("changes_requested", "approver", 200),
        ("changes_requested", "admin", 200),
        ("changes_requested", "author", 403),
    ],
)
def test_decision_role_permissions_and_auto_submission(
    client, decision_type, role, expected_status,
):
    draft_id = new_draft(client)
    response = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={
            "type": decision_type,
            "byName": "Reviewer",
            "byRole": role,
            "note": "Please revise the wording.",
        },
    )

    assert response.status_code == expected_status
    detail = client.get(f"/api/drafts/{draft_id}").json()
    if expected_status == 403:
        assert detail["draft"]["status"] == "draft"
        assert detail["decisions"] == []
        assert not any(event["action"] == "auto_submitted_for_review" for event in detail["activity"])
        return
    assert detail["draft"]["status"] == decision_type
    assert detail["decisions"][0]["type"] == decision_type
    assert any(event["action"] == "auto_submitted_for_review" for event in detail["activity"])


def test_author_cannot_decide_submitted_draft(client):
    draft_id = new_draft(client)
    client.post(f"/api/drafts/{draft_id}/submit", json={"by": "Author", "role": "author"})

    response = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={"type": "approved", "byName": "Author", "byRole": "author"},
    )

    assert response.status_code == 403
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "in_review"
    assert detail["decisions"] == []


def test_changed_content_is_auto_submitted_when_decided(client):
    draft_id = new_draft(client)
    submitted = client.post(
        f"/api/drafts/{draft_id}/submit",
        json={"by": "Author", "role": "author"},
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "in_review"
    assert client.get(f"/api/drafts/{draft_id}").json()["draft"]["status"] == "in_review"

    changed = client.patch(
        f"/api/drafts/{draft_id}",
        json={"content": "edited after submission"},
    )
    decision = client.post(
        f"/api/drafts/{draft_id}/decision",
        json={"type": "approved", "byName": "Approver", "byRole": "approver"},
    )

    assert changed.status_code == 200
    assert changed.json()["status"] == "draft"
    assert decision.status_code == 200
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["draft"]["status"] == "approved"
    assert detail["decisions"][0]["type"] == "approved"
    assert any(event["action"] == "auto_submitted_for_review" for event in detail["activity"])


def test_finding_actions_persist_in_audit_and_preserve_sibling_statuses(client):
    draft_id = new_draft(client)
    with wf.conn() as connection:
        for finding_id, category, source_id in (
            ("finding-claim", "claim", "guide_claim"),
            ("finding-tone", "tone", "guide_tone"),
        ):
            connection.execute(
                "INSERT INTO findings (id, draft_id, category, severity, quote, reason, source_quote, "
                "source_name, source_id, suggested_fix, confidence, is_ai, status, dismiss_reason) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    finding_id, draft_id, category, "medium", "quoted text", "reason",
                    "source guidance", f"Guidance ({source_id})", source_id, "Suggested fix",
                    0.9, 1, "open", None,
                ),
            )

    accepted = client.patch(
        "/api/findings/finding-claim",
        json={"status": "accepted", "by": "Reviewer", "role": "reviewer"},
    )
    dismissed = client.patch(
        "/api/findings/finding-tone",
        json={
            "status": "dismissed",
            "by": "Reviewer",
            "role": "reviewer",
            "reason": "The wording is acceptable in this context.",
        },
    )

    assert accepted.status_code == 200
    assert dismissed.status_code == 200
    detail = client.get(f"/api/drafts/{draft_id}").json()
    statuses = {finding["id"]: finding["status"] for finding in detail["findings"]}
    assert statuses == {"finding-claim": "accepted", "finding-tone": "dismissed"}
    events = [
        event for event in client.get("/api/audit").json()
        if event["draft_id"] == draft_id and event["action"].startswith("finding_")
    ]
    assert {event["action"] for event in events} == {"finding_accepted", "finding_dismissed"}
    dismissal = next(event for event in events if event["action"] == "finding_dismissed")
    assert dismissal["actor"] == "Reviewer"
    assert dismissal["role"] == "reviewer"
    assert dismissal["detail"] == "guide_tone: The wording is acceptable in this context."
    assert detail["decisions"] == []


def test_blank_dismissal_reason_is_rejected_without_audit_event(client):
    draft_id = new_draft(client)
    with wf.conn() as connection:
        connection.execute(
            "INSERT INTO findings (id, draft_id, category, severity, quote, reason, source_quote, "
            "source_name, source_id, suggested_fix, confidence, is_ai, status, dismiss_reason) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "finding-reason", draft_id, "claim", "low", "quoted text", "reason",
                "source guidance", "Guidance (guide_reason)", "guide_reason", "Suggested fix",
                0.9, 1, "open", None,
            ),
        )

    response = client.patch(
        "/api/findings/finding-reason",
        json={"status": "dismissed", "reason": "   ", "by": "Reviewer", "role": "reviewer"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "A reason is required to dismiss a finding"
    detail = client.get(f"/api/drafts/{draft_id}").json()
    assert detail["findings"][0]["status"] == "open"
    events = [
        event for event in client.get("/api/audit").json()
        if event["draft_id"] == draft_id
    ]
    assert not any(event["action"].startswith("finding_") for event in events)


def test_concurrent_decisions_create_only_one_record(client):
    draft_id = new_draft(client)
    client.post(f"/api/drafts/{draft_id}/submit", json={"by": "Author", "role": "author"})
    body = wf.DecisionIn(type="approved", byName="Approver", byRole="approver")

    def decide_once(_):
        try:
            return wf.decide(draft_id, body)
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(decide_once, range(2)))

    assert sum(result != 409 for result in results) == 1
    assert results.count(409) == 1
    assert len(client.get(f"/api/drafts/{draft_id}").json()["decisions"]) == 1


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


def test_author_and_reviewer_cannot_approve_but_approver_can(client):
    did = new_draft(client)
    client.post(f"/api/drafts/{did}/submit", json={})
    author = client.post(
        f"/api/drafts/{did}/decision",
        json={"type": "approved", "byName": "A", "byRole": "author"},
    )
    reviewer = client.post(
        f"/api/drafts/{did}/decision",
        json={"type": "approved", "byName": "R", "byRole": "reviewer"},
    )
    approver = client.post(
        f"/api/drafts/{did}/decision",
        json={"type": "approved", "byName": "P", "byRole": "approver"},
    )
    assert author.status_code == 403
    assert reviewer.status_code == 403
    assert approver.status_code == 200
    assert client.get(f"/api/drafts/{did}").json()["draft"]["status"] == "approved"


def test_approved_draft_is_locked_and_audit_is_kept(client):
    did = new_draft(client)
    client.post(f"/api/drafts/{did}/submit", json={})
    client.post(f"/api/drafts/{did}/decision", json={"type": "approved", "byName": "R", "byRole": "approver"})
    assert client.patch(f"/api/drafts/{did}", json={"content": "new"}).status_code == 409
    assert len(client.get("/api/audit").json()) >= 3

def test_decision_works_even_if_not_submitted_yet(client):
    did = new_draft(client)
    r = client.post(f"/api/drafts/{did}/decision", json={"type": "changes_requested", "byName": "R", "byRole": "reviewer"})
    assert r.status_code == 200
    r2 = client.post(f"/api/drafts/{did}/decision", json={"type": "approved", "byName": "P", "byRole": "approver"})
    assert r2.status_code == 200
    data = client.get(f"/api/drafts/{did}").json()
    assert data["draft"]["status"] == "approved" and len(data["activity"]) >= 3

def test_self_correct_suggests_but_never_changes_the_draft(client, monkeypatch):
    fake = {"original": "hello", "first_review": {}, "status": "resolved", "suggested_draft": "better",
            "auto_applied": False,
            "attempts": [{"attempt": 1, "revised": "better", "missing_proof": "need a fact", "remaining": 0, "risk": {}}]}
    monkeypatch.setattr(wf, "run_self_correct", lambda text: fake)
    did = new_draft(client)
    out = client.post(f"/api/drafts/{did}/self-correct").json()
    assert out["status"] == "resolved" and out["suggestedDraft"] == "better" and out["autoApplied"] is False
    assert out["attempts"][0]["missingProof"] == "need a fact"
    assert client.get(f"/api/drafts/{did}").json()["draft"]["content"] == "hello"


def test_self_correct_unknown_draft_is_404(client):
    assert client.post("/api/drafts/nope/self-correct").status_code == 404

def test_insights_summary_is_labelled_sample_when_data_is_thin(client):
    out = client.get("/api/insights/summary").json()
    assert out["isSample"] is True and out["realEvents"] == 0 and out["sampleEvents"] > 0
    assert any(r["verdict"] == "likely_unclear" for r in out["rules"])


def test_reliability_returns_the_saved_report(client):
    out = client.get("/api/reliability").json()
    assert "precision" in out["summary"] and len(out["rows"]) >= 1
