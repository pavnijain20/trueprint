import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents import review_text
from app.insights import compute_insights
from app.retrieval import get_conn as kb_conn

DB = Path("workflow.db")
router = APIRouter(prefix="/api")
DECIDER_ROLES = {"reviewer", "approver", "admin"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, title TEXT, author TEXT, status TEXT, updated_at TEXT, content TEXT);
CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, draft_id TEXT, content TEXT, note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS findings(id TEXT PRIMARY KEY, draft_id TEXT, category TEXT, severity TEXT, quote TEXT,
  reason TEXT, source_quote TEXT, source_name TEXT, source_id TEXT, suggested_fix TEXT, confidence REAL,
  is_ai INTEGER, status TEXT, dismiss_reason TEXT);
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


def audit(c, actor, role, action, draft_id, detail=""):
    c.execute("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?)",
              (new_id("a"), now(), actor, role, action, draft_id, detail))


def init():
    with conn() as c:
        c.executescript(SCHEMA)
        if c.execute("SELECT COUNT(*) FROM drafts").fetchone()[0] == 0:
            for title, content in DEMO_DRAFTS:
                did = new_id("d")
                c.execute("INSERT INTO drafts VALUES (?,?,?,?,?,?)",
                          (did, title, "Demo Author", "draft", now(), content))
                c.execute("INSERT INTO versions VALUES (?,?,?,?,?)",
                          (new_id("v"), did, content, "Initial draft", now()))


init()


def draft_out(r):
    return {"id": r["id"], "title": r["title"], "author": r["author"], "status": r["status"],
            "updatedAt": r["updated_at"], "content": r["content"]}


def finding_out(r):
    return {"id": r["id"], "draftId": r["draft_id"], "category": r["category"], "severity": r["severity"],
            "quote": r["quote"], "reason": r["reason"], "sourceQuote": r["source_quote"],
            "sourceName": r["source_name"], "suggestedFix": r["suggested_fix"],
            "confidence": r["confidence"], "isAI": bool(r["is_ai"]), "status": r["status"]}


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
    return {"draft": draft_out(d), "findings": [finding_out(r) for r in f],
            "comments": [comment_out(r) for r in cm], "decisions": [decision_out(r) for r in dc],
            "versions": [{"id": r["id"], "draftId": r["draft_id"], "content": r["content"],
                          "note": r["note"], "createdAt": r["created_at"]} for r in v]}


@router.patch("/drafts/{draft_id}")
def edit_draft(draft_id: str, body: ContentIn):
    with conn() as c:
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Approved drafts are locked")
        c.execute("UPDATE drafts SET content = ?, status = 'draft', updated_at = ? WHERE id = ?",
                  (body.content, now(), draft_id))
        c.execute("INSERT INTO versions VALUES (?,?,?,?,?)",
                  (new_id("v"), draft_id, body.content, body.note, now()))
        audit(c, body.by, body.role, "draft_edited", draft_id, body.note)
        row = need_draft(c, draft_id)
    return draft_out(row)


@router.post("/drafts/{draft_id}/review")
def review(draft_id: str):
    with conn() as c:
        d = need_draft(c, draft_id)
        if d["status"] == "approved":
            raise HTTPException(409, "Approved drafts are locked")
        content = d["content"]
    result = review_text(content)
    with conn() as c:
        c.execute("DELETE FROM findings WHERE draft_id = ? AND status = 'open'", (draft_id,))
        for f in result["findings"]:
            src = f.get("source") or {}
            c.execute("INSERT INTO findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (new_id("f"), draft_id, f.get("category", "claim"), f.get("severity", "medium"),
                       f.get("flagged_text", ""), f.get("reason", ""), src.get("quote", ""),
                       source_name(src.get("id", "")), src.get("id", ""), f.get("suggested_fix", ""),
                       float(f.get("confidence", 0.5)), 1 if f.get("origin") == "ai" else 0, "open", None))
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
    with conn() as c:
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
    if body.byRole not in DECIDER_ROLES:
        raise HTTPException(403, "Only a reviewer, approver or admin can decide")
    did = new_id("x")
    with conn() as c:
        d = need_draft(c, draft_id)
        if d["status"] != "in_review":
            raise HTTPException(409, "Submit the draft for review first")
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