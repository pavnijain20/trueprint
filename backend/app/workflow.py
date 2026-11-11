import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents import review_text
from app.self_correct import self_correct as run_self_correct
from app.insights import compute_insights
from app.retrieval import get_conn as kb_conn

DB = Path("workflow.db")
router = APIRouter(prefix="/api")
DECIDER_ROLES = {"reviewer", "approver", "admin"}
PRODUCT_PAGE_DEMO = {
    "id": "d_demo6",
    "title": "Product page: Team planning toolkit",
    "author": "Taylor Brooks",
    "status": "in_review",
    "content": (
        "Plan a workspace that keeps good work moving.\n\n"
        "The Team Planning Toolkit brings layout ideas, practical checklists, and conversation "
        "prompts together in one place. Start with your team's needs, then shape a setup that "
        "can change as you do.\n\n"
        "Download the toolkit to get started."
    ),
}
logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, title TEXT, author TEXT, status TEXT, updated_at TEXT, content TEXT);
CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, draft_id TEXT, content TEXT, note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS findings(id TEXT PRIMARY KEY, draft_id TEXT, category TEXT, severity TEXT, quote TEXT,
  reason TEXT, source_quote TEXT, source_name TEXT, source_id TEXT, suggested_fix TEXT, confidence REAL,
  is_ai INTEGER, status TEXT, dismiss_reason TEXT, start_offset INTEGER, end_offset INTEGER);
CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY, draft_id TEXT, finding_id TEXT, author_name TEXT,
  author_role TEXT, text TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, draft_id TEXT, type TEXT, by_name TEXT, by_role TEXT,
  note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY, at TEXT, actor TEXT, role TEXT, action TEXT,
  draft_id TEXT, detail TEXT);
"""

DEMO_DRAFTS = [
    ("Serum launch caption", "Clinically proven to remove acne in 7 days. Try GlowLeaf Serum today!"),
    ("Shipping banner", "Enjoy free shipping on every order from our store."),
    ("Newsletter intro", "Our Glow Leaf serum is great for your daily routine."),
    ("Flash sale post", "BUY NOW!!! Our miracle GlowLeaf Serum will change your life forever!!!"),
    ("Clean example", "Meet GlowLeaf Serum, our new daily serum. Share your feedback with us."),
]


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def source_name(sid):
    try:
        with kb_conn() as k:
            row = k.execute("SELECT title FROM chunks WHERE id = ?", (sid,)).fetchone()
        return f"{row['title']} ({sid})" if row else sid
    except Exception:
        return sid


def audit(c, actor, role, action, draft_id, detail="", at=None):
    c.execute("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?)",
              (new_id("a"), at or now(), actor, role, action, draft_id, detail))


def init():
    with conn() as c:
        c.executescript(SCHEMA)
        ensure_finding_offset_columns(c)
        if c.execute("SELECT COUNT(*) FROM drafts").fetchone()[0] == 0:
            for i, (title, content) in enumerate(DEMO_DRAFTS, start=1):
                did = f"d_demo{i}"
                c.execute("INSERT INTO drafts VALUES (?,?,?,?,?,?)",
                          (did, title, "Demo Author", "draft", now(), content))
                c.execute("INSERT INTO versions VALUES (?,?,?,?,?)",
                          (new_id("v"), did, content, "Initial draft", now()))
    provision_product_page_demo()


def ensure_finding_offset_columns(c):
    columns = {row["name"] for row in c.execute("PRAGMA table_info(findings)")}
    if "start_offset" not in columns:
        c.execute("ALTER TABLE findings ADD COLUMN start_offset INTEGER")
    if "end_offset" not in columns:
        c.execute("ALTER TABLE findings ADD COLUMN end_offset INTEGER")


def provision_product_page_demo() -> bool:
    """Create the permanent Product Page demo without replacing conflicting data."""
    with conn() as c:
        c.execute("BEGIN IMMEDIATE")
        existing = c.execute(
            "SELECT id, title, author, content FROM drafts WHERE id = ?",
            (PRODUCT_PAGE_DEMO["id"],),
        ).fetchone()
        product_page_drafts = c.execute(
            "SELECT id, title FROM drafts WHERE lower(trim(title)) = lower(trim(?))",
            (PRODUCT_PAGE_DEMO["title"],),
        ).fetchall()
        duplicates = [draft for draft in product_page_drafts if draft["id"] != PRODUCT_PAGE_DEMO["id"]]
        if duplicates:
            ids = ", ".join(sorted(draft["id"] for draft in duplicates))
            logger.error(
                "Permanent Product Page demo %s conflicts with an existing Product Page draft "
                "under ID(s): %s; no draft was created.",
                PRODUCT_PAGE_DEMO["id"],
                ids,
            )
            return False
        if existing:
            conflicts = [
                field for field in ("title", "author", "content")
                if existing[field] != PRODUCT_PAGE_DEMO[field]
            ]
            if conflicts:
                logger.error(
                    "Permanent Product Page demo ID %s has conflicting %s; existing data was "
                    "not modified.",
                    PRODUCT_PAGE_DEMO["id"],
                    ", ".join(conflicts),
                )
                return False
            return False

        seeded_at = now()
        c.execute(
            "INSERT INTO drafts VALUES (?,?,?,?,?,?)",
            (
                PRODUCT_PAGE_DEMO["id"],
                PRODUCT_PAGE_DEMO["title"],
                PRODUCT_PAGE_DEMO["author"],
                PRODUCT_PAGE_DEMO["status"],
                seeded_at,
                PRODUCT_PAGE_DEMO["content"],
            ),
        )
        c.execute(
            "INSERT INTO versions VALUES (?,?,?,?,?)",
            (
                new_id("v"),
                PRODUCT_PAGE_DEMO["id"],
                PRODUCT_PAGE_DEMO["content"],
                "Initial draft",
                seeded_at,
            ),
        )
        audit(
            c,
            PRODUCT_PAGE_DEMO["author"],
            "author",
            "draft_created",
            PRODUCT_PAGE_DEMO["id"],
            PRODUCT_PAGE_DEMO["title"],
            at=seeded_at,
        )
        audit(
            c,
            PRODUCT_PAGE_DEMO["author"],
            "author",
            "submitted_for_review",
            PRODUCT_PAGE_DEMO["id"],
            at=seeded_at,
        )
        logger.info("Provisioned permanent Product Page demo draft %s.", PRODUCT_PAGE_DEMO["id"])
        return True


def draft_out(r):
    return {"id": r["id"], "title": r["title"], "author": r["author"], "status": r["status"],
            "updatedAt": r["updated_at"], "content": r["content"]}


def finding_out(r):
    return {"id": r["id"], "draftId": r["draft_id"], "category": r["category"], "severity": r["severity"],
            "quote": r["quote"], "reason": r["reason"], "sourceQuote": r["source_quote"],
            "sourceName": r["source_name"], "suggestedFix": r["suggested_fix"],
            "confidence": r["confidence"], "isAI": bool(r["is_ai"]), "status": r["status"],
            "startOffset": r["start_offset"], "endOffset": r["end_offset"]}


def comment_out(r):
    return {"id": r["id"], "draftId": r["draft_id"], "findingId": r["finding_id"],
            "authorName": r["author_name"], "authorRole": r["author_role"],
            "text": r["text"], "createdAt": r["created_at"]}


def decision_out(r):
    return {"id": r["id"], "draftId": r["draft_id"], "type": r["type"], "byName": r["by_name"],
            "byRole": r["by_role"], "note": r["note"], "createdAt": r["created_at"]}


def need_draft(c, draft_id):
    row = c.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Draft not found")
    return row


class DraftIn(BaseModel):
    title: str
    author: str = "Demo Author"
    content: str


class ContentIn(BaseModel):
    content: str
    by: str = "Demo Author"
    role: str = "author"
    note: str = "Edited"


class FindingIn(BaseModel):
    status: str
    reason: str = ""
    by: str = "Demo Author"
    role: str = "author"


class CommentIn(BaseModel):
    authorName: str
    authorRole: str
    text: str
    findingId: str | None = None


class SubmitIn(BaseModel):
    by: str = "Demo Author"
    role: str = "author"


class DecisionIn(BaseModel):
    type: str
    byName: str
    byRole: str
    note: str = ""


@router.get("/drafts")
def list_drafts():
    with conn() as c:
        rows = c.execute("SELECT * FROM drafts ORDER BY updated_at DESC").fetchall()
    return [draft_out(r) for r in rows]


@router.post("/drafts")
def create_draft(body: DraftIn):
    did = new_id("d")
    with conn() as c:
        c.execute("INSERT INTO drafts VALUES (?,?,?,?,?,?)",
                  (did, body.title, body.author, "draft", now(), body.content))
        c.execute("INSERT INTO versions VALUES (?,?,?,?,?)",
                  (new_id("v"), did, body.content, "Initial draft", now()))
        audit(c, body.author, "author", "draft_created", did, body.title)
        row = need_draft(c, did)
    return draft_out(row)


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str):
    with conn() as c:
        d = need_draft(c, draft_id)
        f = c.execute("SELECT * FROM findings WHERE draft_id = ?", (draft_id,)).fetchall()
        cm = c.execute("SELECT * FROM comments WHERE draft_id = ? ORDER BY created_at", (draft_id,)).fetchall()
        dc = c.execute("SELECT * FROM decisions WHERE draft_id = ? ORDER BY created_at", (draft_id,)).fetchall()
        v = c.execute("SELECT * FROM versions WHERE draft_id = ? ORDER BY created_at", (draft_id,)).fetchall()
        a = c.execute("SELECT * FROM audit_log WHERE draft_id = ? ORDER BY at", (draft_id,)).fetchall()
    return {"draft": draft_out(d), "findings": [finding_out(r) for r in f],
            "comments": [comment_out(r) for r in cm], "decisions": [decision_out(r) for r in dc],
            "versions": [{"id": r["id"], "draftId": r["draft_id"], "content": r["content"],
                          "note": r["note"], "createdAt": r["created_at"]} for r in v],
            "activity": [{"at": r["at"], "actor": r["actor"], "role": r["role"],
                          "action": r["action"], "detail": r["detail"]} for r in a]}


@router.patch("/drafts/{draft_id}")
def edit_draft(draft_id: str, body: ContentIn):
    if body.role != "author":
        raise HTTPException(403, "Only an author can edit draft content")
    with conn() as c:
        c.execute("BEGIN IMMEDIATE")
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Approved drafts are locked")
        status = d["status"] if body.content == d["content"] else "draft"
        c.execute("UPDATE drafts SET content = ?, status = ?, updated_at = ? WHERE id = ?",
                  (body.content, status, now(), draft_id))
        c.execute("INSERT INTO versions VALUES (?,?,?,?,?)",
                  (new_id("v"), draft_id, body.content, body.note, now()))
        audit(c, body.by, body.role, "draft_edited", draft_id, body.note)
        row = need_draft(c, draft_id)
    return draft_out(row)


@router.post("/drafts/{draft_id}/review")
def review(draft_id: str):
    with conn() as c:
        c.execute("BEGIN")
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Approved drafts are locked")
        content = d["content"]
        version_count = c.execute(
            "SELECT COUNT(*) FROM versions WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
    result = review_text(content)
    with conn() as c:
        c.execute("BEGIN IMMEDIATE")
        current_draft = need_draft(c, draft_id)
        current_version_count = c.execute(
            "SELECT COUNT(*) FROM versions WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
        if current_draft["content"] != content or current_version_count != version_count:
            raise HTTPException(409, "Draft changed while review was running. Run the review again.")
        c.execute("DELETE FROM findings WHERE draft_id = ? AND status = 'open'", (draft_id,))
        for f in result["findings"]:
            src = f.get("source") or {}
            quote = f.get("flagged_text", "")
            start_offset = f.get("start")
            end_offset = f.get("end")
            if (
                not isinstance(start_offset, int)
                or not isinstance(end_offset, int)
                or start_offset < 0
                or end_offset - start_offset != len(quote)
                or content[start_offset:end_offset] != quote
            ):
                start_offset = end_offset = None
            c.execute(
                "INSERT INTO findings (id, draft_id, category, severity, quote, reason, source_quote, "
                "source_name, source_id, suggested_fix, confidence, is_ai, status, dismiss_reason, "
                "start_offset, end_offset) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    new_id("f"), draft_id, f.get("category", "claim"), f.get("severity", "medium"),
                    quote, f.get("reason", ""), src.get("quote", ""),
                    source_name(src.get("id", "")), src.get("id", ""), f.get("suggested_fix", ""),
                    float(f.get("confidence", 0.5)), 1 if f.get("origin") == "ai" else 0, "open", None,
                    start_offset, end_offset,
                ),
            )
        audit(c, "system", "system", "review_run", draft_id, f'{len(result["findings"])} findings')
        rows = c.execute("SELECT * FROM findings WHERE draft_id = ?", (draft_id,)).fetchall()
    return {"findings": [finding_out(r) for r in rows], "risk": result["risk"], "error": result["error"]}


@router.patch("/findings/{finding_id}")
def update_finding(finding_id: str, body: FindingIn):
    if body.status not in ("accepted", "dismissed", "open"):
        raise HTTPException(400, "Invalid status")
    if body.status == "dismissed" and not body.reason.strip():
        raise HTTPException(400, "A reason is required to dismiss a finding")
    with conn() as c:
        row = c.execute("SELECT * FROM findings WHERE id = ?", (finding_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Finding not found")
        c.execute("UPDATE findings SET status = ?, dismiss_reason = ? WHERE id = ?",
                  (body.status, body.reason or None, finding_id))
        audit(c, body.by, body.role, f"finding_{body.status}", row["draft_id"],
              f'{row["source_id"]}: {body.reason}')
        row = c.execute("SELECT * FROM findings WHERE id = ?", (finding_id,)).fetchone()
    return finding_out(row)


@router.post("/drafts/{draft_id}/comments")
def add_comment(draft_id: str, body: CommentIn):
    if not body.text.strip():
        raise HTTPException(400, "Comment is empty")
    cid = new_id("c")
    with conn() as c:
        need_draft(c, draft_id)
        c.execute("INSERT INTO comments VALUES (?,?,?,?,?,?,?)",
                  (cid, draft_id, body.findingId, body.authorName, body.authorRole, body.text, now()))
        audit(c, body.authorName, body.authorRole, "comment_added", draft_id, body.text[:80])
        row = c.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
    return comment_out(row)


@router.post("/drafts/{draft_id}/submit")
def submit(draft_id: str, body: SubmitIn):
    if body.role != "author":
        raise HTTPException(403, "Only an author can submit a draft for review")
    with conn() as c:
        c.execute("BEGIN IMMEDIATE")
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Already approved")
        c.execute("UPDATE drafts SET status = 'in_review', updated_at = ? WHERE id = ?", (now(), draft_id))
        audit(c, body.by, body.role, "submitted_for_review", draft_id)
        row = need_draft(c, draft_id)
    return draft_out(row)


@router.post("/drafts/{draft_id}/decision")
def decide(draft_id: str, body: DecisionIn):
    if body.type not in ("approved", "changes_requested"):
        raise HTTPException(400, "Invalid decision type")
    allowed_roles = {"approver", "admin"} if body.type == "approved" else DECIDER_ROLES
    if body.byRole not in allowed_roles:
        if body.type == "approved":
            raise HTTPException(403, "Only an approver or admin can approve a draft")
        raise HTTPException(403, "Only a reviewer, approver or admin can request changes")
    did = new_id("x")
    with conn() as c:
        c.execute("BEGIN IMMEDIATE")
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "This draft is already approved")
        if d["status"] != "in_review":
            c.execute(
                "UPDATE drafts SET status = 'in_review', updated_at = ? WHERE id = ?",
                (now(), draft_id),
            )
            audit(c, body.byName, body.byRole, "auto_submitted_for_review", draft_id)
        c.execute("INSERT INTO decisions VALUES (?,?,?,?,?,?,?)",
                  (did, draft_id, body.type, body.byName, body.byRole, body.note, now()))
        c.execute("UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?", (body.type, now(), draft_id))
        audit(c, body.byName, body.byRole, f"decision_{body.type}", draft_id, body.note)
        row = c.execute("SELECT * FROM decisions WHERE id = ?", (did,)).fetchone()
    return decision_out(row)


@router.get("/audit")
def get_audit():
    with conn() as c:
        rows = c.execute("SELECT * FROM audit_log ORDER BY at DESC LIMIT 200").fetchall()
    return [dict(r) for r in rows]


@router.get("/insights")
def get_insights():
    with conn() as c:
        rows = c.execute("SELECT source_id, category, status FROM findings WHERE status != 'open'").fetchall()
    events = [{"source_id": r["source_id"], "category": r["category"], "team": "marketing",
               "action": r["status"]} for r in rows]
    return compute_insights(events)

@router.post("/drafts/{draft_id}/self-correct")
def self_correct_draft(draft_id: str):
    with conn() as c:
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Approved drafts are locked")
        content = d["content"]
    result = run_self_correct(content)
    with conn() as c:
        audit(c, "system", "system", "self_correct_run", draft_id, f'status={result["status"]}')
    return {
        "status": result["status"],
        "original": result["original"],
        "suggestedDraft": result["suggested_draft"],
        "attempts": [{"attempt": a["attempt"], "revised": a["revised"],
                      "missingProof": a.get("missing_proof", ""), "remaining": a["remaining"]}
                     for a in result["attempts"]],
        "autoApplied": False,
    }
SAMPLE_INSIGHT_EVENTS = (
    [{"source_id": "guide_02", "category": "claim", "team": "marketing", "action": "accepted"}] * 5
    + [{"source_id": "guide_02", "category": "claim", "team": "marketing", "action": "dismissed"}]
    + [{"source_id": "guide_01", "category": "tone", "team": "marketing", "action": "dismissed"}] * 3
    + [{"source_id": "guide_01", "category": "tone", "team": "marketing", "action": "accepted"}]
    + [{"source_id": "guide_03", "category": "terminology", "team": "marketing", "action": "accepted"}] * 3
    + [{"source_id": "F04", "category": "claim", "team": "marketing", "action": "accepted"}] * 2
    + [{"source_id": "F04", "category": "claim", "team": "marketing", "action": "dismissed"}]
)
SAMPLE_DISMISS_REASONS = [
    {"sourceId": "guide_01", "reason": "Tone guideline is unclear for a flash-sale post", "sample": True},
    {"sourceId": "guide_01", "reason": "Exclamation marks are normal in our campaign style", "sample": True},
    {"sourceId": "guide_02", "reason": "The claim is backed by an approved fact", "sample": True},
]


@router.get("/insights/summary")
def insights_summary():
    """Live insights from real accept and dismiss actions; clearly labelled sample history is added only when real data is thin."""
    with conn() as c:
        rows = c.execute(
            "SELECT source_id, category, status, dismiss_reason FROM findings WHERE status != 'open'"
        ).fetchall()
    real = [{"source_id": r["source_id"], "category": r["category"], "team": "marketing",
             "action": r["status"]} for r in rows if r["source_id"]]
    reasons = [{"sourceId": r["source_id"], "reason": r["dismiss_reason"], "sample": False}
               for r in rows if r["status"] == "dismissed" and r["dismiss_reason"]]
    is_sample = len(real) < 6
    events = real + (SAMPLE_INSIGHT_EVENTS if is_sample else [])
    out = compute_insights(events)
    out["isSample"] = is_sample
    out["realEvents"] = len(real)
    out["sampleEvents"] = len(SAMPLE_INSIGHT_EVENTS) if is_sample else 0
    out["dismissReasons"] = reasons + (SAMPLE_DISMISS_REASONS if is_sample else [])
    return out


@router.get("/reliability")
def reliability():
    import json as _json
    report = Path(__file__).resolve().parent.parent / "eval" / "report.json"
    if not report.exists():
        raise HTTPException(404, "No evaluation report found. Run harness.py first.")
    data = _json.loads(report.read_text(encoding="utf-8"))
    return {"summary": data["summary"],
            "rows": [{"draft": r["draft"], "expected": r.get("expected", []),
                      "predicted": r.get("predicted", []), "findings": r.get("findings", 0),
                      "aiError": r.get("ai_error")} for r in data["rows"]]}