import os, json, uuid, sqlite3, hashlib, hmac
from datetime import datetime, date, timezone
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Literal
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(APP_DIR.parent / "data" / "trueprint.db")))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(APP_DIR.parent / "uploads")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app):
    init_db()
    yield

app = FastAPI(title="Trueprint API", version="1.1.0",
              description="Brand governance backend for the TRUEPRINT Round 2 demo",
              lifespan=lifespan)

_cors_origins = [x.strip() for x in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Bearer-token auth does not need cookies; wildcard + credentials is unsafe/invalid.
    allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

ROLES = ("creator", "manager", "reviewer", "admin")
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
DEMO_REQUIRE_ROLE_CODES = os.getenv("DEMO_REQUIRE_ROLE_CODES", "false").lower() == "true"

def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    return con

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
          token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS guidelines(
          id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
          category TEXT DEFAULT 'general', created_by TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS facts(
          id TEXT PRIMARY KEY, claim TEXT NOT NULL, source TEXT NOT NULL,
          owner TEXT NOT NULL, verified_date TEXT NOT NULL, expiry_date TEXT,
          status TEXT DEFAULT 'approved', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS glossary(
          id TEXT PRIMARY KEY, term TEXT NOT NULL, preferred_term TEXT,
          kind TEXT NOT NULL DEFAULT 'preferred', note TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drafts(
          id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
          channel TEXT DEFAULT 'other', status TEXT DEFAULT 'draft',
          created_by TEXT NOT NULL, assigned_to TEXT, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS versions(
          id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, version_no INTEGER NOT NULL,
          content TEXT NOT NULL, created_by TEXT NOT NULL, note TEXT,
          created_at TEXT NOT NULL, FOREIGN KEY(draft_id) REFERENCES drafts(id));
        CREATE TABLE IF NOT EXISTS findings(
          id TEXT PRIMARY KEY, draft_id TEXT NOT NULL,
          category TEXT NOT NULL, flagged_text TEXT NOT NULL,
          start INTEGER NOT NULL, end INTEGER NOT NULL, reason TEXT NOT NULL,
          severity TEXT NOT NULL, confidence REAL NOT NULL,
          source_type TEXT, source_id TEXT, source_quote TEXT,
          suggested_fix TEXT, status TEXT DEFAULT 'open',
          validated INTEGER DEFAULT 0, created_at TEXT NOT NULL,
          FOREIGN KEY(draft_id) REFERENCES drafts(id));
        CREATE TABLE IF NOT EXISTS comments(
          id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, finding_id TEXT,
          user_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(draft_id) REFERENCES drafts(id));
        CREATE TABLE IF NOT EXISTS reviewer_signoffs(
          id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE,
          reviewer_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(draft_id) REFERENCES drafts(id));
        CREATE TABLE IF NOT EXISTS audit_log(
          id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
          entity_type TEXT NOT NULL, entity_id TEXT, details TEXT,
          created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_findings_draft ON findings(draft_id);
        CREATE INDEX IF NOT EXISTS idx_versions_draft ON versions(draft_id, version_no);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
        """)

def audit(c, user_id, action, entity_type, entity_id=None, details=None):
    c.execute("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?)",
              (str(uuid.uuid4()), user_id, action, entity_type, entity_id,
               json.dumps(details or {}, ensure_ascii=False), now()))

def rowdict(row):
    return dict(row) if row else None

def save_version(c, draft_id, content, user_id, note):
    """Persist a new immutable draft version only when content actually changes."""
    latest = c.execute(
        "SELECT version_no, content FROM versions WHERE draft_id=? ORDER BY version_no DESC LIMIT 1",
        (draft_id,),
    ).fetchone()
    if latest and latest["content"] == content:
        return latest["version_no"]
    version_no = (latest["version_no"] if latest else 0) + 1
    c.execute("INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
              (str(uuid.uuid4()), draft_id, version_no, content, user_id, note, now()))
    return version_no

def get_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Use Authorization: Bearer <demo-token>")
    token = authorization.split(" ", 1)[1]
    with db() as c:
        user = c.execute("SELECT * FROM users WHERE token=?", (token,)).fetchone()
    if not user:
        raise HTTPException(401, "Invalid demo token")
    return rowdict(user)

def require(*roles):
    def dep(user=Depends(get_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Role not permitted. Required: {', '.join(roles)}")
        return user
    return dep

class LoginIn(BaseModel):
    role: Literal["creator","manager","reviewer","admin"]
    name: Optional[str] = None
    demo_code: Optional[str] = None

class GuidelineIn(BaseModel):
    title: str
    content: str
    category: str = "general"

class FactIn(BaseModel):
    claim: str
    source: str
    owner: str
    verified_date: str
    expiry_date: Optional[str] = None
    status: str = "approved"

class GlossaryIn(BaseModel):
    term: str
    preferred_term: Optional[str] = None
    kind: Literal["preferred","banned"] = "preferred"
    note: Optional[str] = None

class DraftIn(BaseModel):
    title: str = "Untitled draft"
    content: str
    channel: str = "other"

class DraftUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    channel: Optional[str] = None

class AgentFindingIn(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    flagged_text: str = Field(min_length=1, max_length=4000)
    start: int = Field(ge=0)
    end: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=4000)
    severity: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    source_quote: Optional[str] = None
    suggested_fix: Optional[str] = None
    validated: bool = False

class AgentFindingsIn(BaseModel):
    findings: list[AgentFindingIn] = Field(min_length=1, max_length=100)

class FindingPatch(BaseModel):
    action: Literal["accept","edit","dismiss"]
    edited_text: Optional[str] = None
    reason: Optional[str] = None

class CommentIn(BaseModel):
    body: str
    finding_id: Optional[str] = None

class ReviewRequest(BaseModel):
    content: Optional[str] = None

class ReviewerSignoffIn(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)

@app.get("/")
def root():
    return {"service":"TRUEPRINT API","status":"ok","docs":"/docs"}

@app.get("/health")
def health():
    return {"status":"healthy","database":str(DB_PATH.name),"timestamp":now()}

@app.post("/auth/demo-login")
def demo_login(payload: LoginIn):
    if not DEMO_MODE:
        raise HTTPException(403, "Demo login is disabled. Connect the production authentication provider.")
    if DEMO_REQUIRE_ROLE_CODES:
        expected = os.getenv(f"DEMO_{payload.role.upper()}_CODE", "")
        if not expected or not payload.demo_code or not hmac.compare_digest(payload.demo_code, expected):
            raise HTTPException(401, "A valid role-specific demo access code is required.")
    names = {"creator":"Demo Creator","manager":"Demo Manager",
             "reviewer":"Demo Specialist Reviewer","admin":"Demo Admin"}
    name = payload.name or names[payload.role]
    token = hashlib.sha256(f"{payload.role}:{name}:{uuid.uuid4()}".encode()).hexdigest()
    user_id = str(uuid.uuid4())
    with db() as c:
        c.execute("INSERT INTO users VALUES(?,?,?,?,?)",
                  (user_id,name,payload.role,token,now()))
        audit(c,user_id,"demo_login","user",user_id,{"role":payload.role})
    return {"access_token":token,"token_type":"bearer",
            "user":{"id":user_id,"name":name,"role":payload.role}}

@app.get("/auth/me")
def me(user=Depends(get_user)):
    return {"id":user["id"],"name":user["name"],"role":user["role"]}

# Knowledge base
@app.get("/knowledge/guidelines")
def list_guidelines(user=Depends(get_user)):
    with db() as c: return [rowdict(x) for x in c.execute("SELECT * FROM guidelines ORDER BY created_at DESC")]

@app.post("/knowledge/guidelines")
def add_guideline(p: GuidelineIn, user=Depends(require("admin"))):
    gid=str(uuid.uuid4())
    with db() as c:
        c.execute("INSERT INTO guidelines VALUES(?,?,?,?,?,?)",
                  (gid,p.title,p.content,p.category,user["id"],now()))
        audit(c,user["id"],"create","guideline",gid)
        return rowdict(c.execute("SELECT * FROM guidelines WHERE id=?",(gid,)).fetchone())

@app.get("/knowledge/facts")
def list_facts(user=Depends(get_user)):
    with db() as c: rows=[rowdict(x) for x in c.execute("SELECT * FROM facts ORDER BY created_at DESC")]
    today=date.today().isoformat()
    for x in rows:
        x["expired"]=bool(x["expiry_date"] and x["expiry_date"] < today)
    return rows

@app.post("/knowledge/facts")
def add_fact(p: FactIn, user=Depends(require("admin"))):
    fid=str(uuid.uuid4())
    with db() as c:
        c.execute("INSERT INTO facts VALUES(?,?,?,?,?,?,?,?)",
                  (fid,p.claim,p.source,p.owner,p.verified_date,p.expiry_date,p.status,now()))
        audit(c,user["id"],"create","fact",fid)
        return rowdict(c.execute("SELECT * FROM facts WHERE id=?",(fid,)).fetchone())

@app.get("/knowledge/glossary")
def list_glossary(user=Depends(get_user)):
    with db() as c: return [rowdict(x) for x in c.execute("SELECT * FROM glossary ORDER BY term")]

@app.post("/knowledge/glossary")
def add_glossary(p: GlossaryIn, user=Depends(require("admin"))):
    gid=str(uuid.uuid4())
    with db() as c:
        c.execute("INSERT INTO glossary VALUES(?,?,?,?,?,?)",
                  (gid,p.term,p.preferred_term,p.kind,p.note,now()))
        audit(c,user["id"],"create","glossary",gid)
        return rowdict(c.execute("SELECT * FROM glossary WHERE id=?",(gid,)).fetchone())

# Draft and review
@app.post("/drafts")
def create_draft(p: DraftIn, user=Depends(require("creator","admin","manager"))):
    did=str(uuid.uuid4()); ts=now()
    with db() as c:
        c.execute("INSERT INTO drafts VALUES(?,?,?,?,?,?,?,?,?)",
                  (did,p.title,p.content,p.channel,"draft",user["id"],None,ts,ts))
        c.execute("INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
                  (str(uuid.uuid4()),did,1,p.content,user["id"],"Initial draft",ts))
        audit(c,user["id"],"create","draft",did,{"title":p.title})
        return rowdict(c.execute("SELECT * FROM drafts WHERE id=?",(did,)).fetchone())

def make_rule_findings(c, draft):
    content = draft["content"]
    content_lower = content.lower()
    found = []

    for g in c.execute("SELECT * FROM glossary"):
        needle = g["term"]
        if not needle:
            continue
        start = 0
        while True:
            pos = content_lower.find(needle.lower(), start)
            if pos < 0:
                break
            if g["kind"] == "banned":
                found.append(dict(
                    category="terminology",
                    flagged_text=content[pos:pos + len(needle)],
                    start=pos, end=pos + len(needle),
                    reason=f"'{needle}' is a banned term.",
                    severity="medium", confidence=1.0,
                    source_type="guideline", source_id=g["id"],
                    source_quote=g["note"] or f"Use approved terminology instead of '{needle}'.",
                    suggested_fix=g["preferred_term"] or "Replace with approved wording.",
                    validated=1
                ))
            start = pos + len(needle)

    today = date.today().isoformat()
    approved_facts = [
        rowdict(x) for x in c.execute(
            "SELECT * FROM facts WHERE lower(status)='approved' AND (expiry_date IS NULL OR expiry_date >= ?)",
            (today,)
        )
    ]
    for f in c.execute("SELECT * FROM facts"):
        if f["expiry_date"] and f["expiry_date"] < today and f["claim"].lower() in content_lower:
            pos = content_lower.find(f["claim"].lower())
            found.append(dict(
                category="claim", flagged_text=content[pos:pos + len(f["claim"])],
                start=pos, end=pos + len(f["claim"]),
                reason="This statement matches an expired fact; re-verify before publication.",
                severity="high", confidence=1.0, source_type="fact", source_id=f["id"],
                source_quote=f["claim"],
                suggested_fix="Ask the fact owner for a current approved claim.", validated=1
            ))

    # Narrow deterministic demo heuristic; this is NOT semantic fact verification.
    high_risk_phrases = (
        "clinically proven", "guaranteed", "100% effective", "cure acne",
        "remove acne in 7 days",
    )
    for phrase in high_risk_phrases:
        pos = content_lower.find(phrase)
        if pos < 0:
            continue
        supported = any(phrase in fact["claim"].lower() for fact in approved_facts if fact["claim"])
        if not supported:
            found.append(dict(
                category="claim", flagged_text=content[pos:pos + len(phrase)],
                start=pos, end=pos + len(phrase),
                reason=f"High-risk claim wording '{phrase}' has no matching current approved fact. Human verification is required.",
                severity="high", confidence=0.90, source_type="fact", source_id=None,
                source_quote="No matching current approved fact was found in the Fact Ledger.",
                suggested_fix="Provide a current approved fact with evidence, or remove/rephrase this claim.",
                validated=1
            ))
    return found

@app.post("/drafts/{draft_id}/review")
def review_draft(draft_id: str, payload: ReviewRequest = ReviewRequest(), user=Depends(get_user)):
    with db() as c:
        d=c.execute("SELECT * FROM drafts WHERE id=?",(draft_id,)).fetchone()
        if not d: raise HTTPException(404,"Draft not found")
        draft=rowdict(d)
        if payload.content is not None:
            if not payload.content.strip():
                raise HTTPException(422, "Draft content cannot be empty.")
            if payload.content != draft["content"]:
                draft["content"] = payload.content
                c.execute("UPDATE drafts SET content=?,updated_at=? WHERE id=?",(payload.content,now(),draft_id))
                save_version(c, draft_id, payload.content, user["id"], "Content updated during review")
                c.execute("UPDATE drafts SET status='draft' WHERE id=?", (draft_id,))
        # A fresh review invalidates any earlier specialist sign-off.
        c.execute("DELETE FROM reviewer_signoffs WHERE draft_id=?", (draft_id,))
        c.execute("UPDATE findings SET status='superseded' WHERE draft_id=? AND status='open'",(draft_id,))
        results=make_rule_findings(c,draft)
        for f in results:
            c.execute("""INSERT INTO findings
              (id,draft_id,category,flagged_text,start,end,reason,severity,confidence,
               source_type,source_id,source_quote,suggested_fix,status,validated,created_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (str(uuid.uuid4()),draft_id,f["category"],f["flagged_text"],f["start"],f["end"],
               f["reason"],f["severity"],f["confidence"],f["source_type"],f["source_id"],
               f["source_quote"],f["suggested_fix"],"open",f["validated"],now()))
        audit(c,user["id"],"review","draft",draft_id,{"finding_count":len(results)})
        rows=[rowdict(x) for x in c.execute("SELECT * FROM findings WHERE draft_id=? ORDER BY created_at",(draft_id,))]
        return {"draft_id":draft_id,"status":"reviewed","findings":rows,
                "note":"Deterministic backend checks only; AI Voice/Fact agents are integrated by the AI owner."}

@app.get("/drafts")
def list_drafts(user=Depends(get_user)):
    with db() as c: return [rowdict(x) for x in c.execute("SELECT * FROM drafts ORDER BY updated_at DESC")]

@app.get("/drafts/{draft_id}")
def get_draft(draft_id: str, user=Depends(get_user)):
    with db() as c:
        d=c.execute("SELECT * FROM drafts WHERE id=?",(draft_id,)).fetchone()
        if not d: raise HTTPException(404,"Draft not found")
        return rowdict(d)

@app.patch("/drafts/{draft_id}")
def update_draft(draft_id: str, p: DraftUpdate, user=Depends(require("creator", "manager", "admin"))):
    if p.title is None and p.content is None and p.channel is None:
        raise HTTPException(422, "Provide at least one field to update")
    with db() as c:
        d = c.execute("SELECT * FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not d:
            raise HTTPException(404, "Draft not found")
        title = p.title.strip() if p.title is not None else d["title"]
        channel = p.channel.strip() if p.channel is not None else d["channel"]
        content = p.content if p.content is not None else d["content"]
        if not title or not channel or not content.strip():
            raise HTTPException(422, "Title, channel and content cannot be empty")
        content_changed = content != d["content"]
        new_status = "draft" if content_changed else d["status"]
        c.execute("UPDATE drafts SET title=?,content=?,channel=?,status=?,updated_at=? WHERE id=?",
                  (title, content, channel, new_status, now(), draft_id))
        version_no = None
        if content_changed:
            version_no = save_version(c, draft_id, content, user["id"], "Draft content edited")
            c.execute("UPDATE findings SET status='superseded' WHERE draft_id=? AND status='open'", (draft_id,))
            c.execute("DELETE FROM reviewer_signoffs WHERE draft_id=?", (draft_id,))
        audit(c, user["id"], "update", "draft", draft_id,
              {"content_changed": content_changed, "version_no": version_no})
        return rowdict(c.execute("SELECT * FROM drafts WHERE id=?", (draft_id,)).fetchone())

@app.post("/drafts/{draft_id}/findings/import")
def import_agent_findings(draft_id: str, p: AgentFindingsIn, user=Depends(require("reviewer", "admin"))):
    """Persist explainable AI-agent findings after checking their quoted text/offsets."""
    created = []
    with db() as c:
        d = c.execute("SELECT content FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not d:
            raise HTTPException(404, "Draft not found")
        content = d["content"]
        for item in p.findings:
            if item.end <= item.start or item.end > len(content):
                raise HTTPException(422, "Finding offsets are outside the draft content")
            if content[item.start:item.end] != item.flagged_text:
                raise HTTPException(422, "Finding flagged_text must exactly match draft content at start:end")
        for item in p.findings:
            fid = str(uuid.uuid4())
            c.execute("""INSERT INTO findings
                (id,draft_id,category,flagged_text,start,end,reason,severity,confidence,
                 source_type,source_id,source_quote,suggested_fix,status,validated,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (fid, draft_id, item.category, item.flagged_text, item.start, item.end,
                 item.reason, item.severity, item.confidence, item.source_type, item.source_id,
                 item.source_quote, item.suggested_fix, "open", int(item.validated), now()))
            created.append(fid)
        c.execute("DELETE FROM reviewer_signoffs WHERE draft_id=?", (draft_id,))
        audit(c, user["id"], "import_agent_findings", "draft", draft_id,
              {"finding_ids": created, "count": len(created)})
        rows = [rowdict(x) for x in c.execute(
            "SELECT * FROM findings WHERE id IN (%s)" % ",".join("?" for _ in created), created
        )]
        return {"draft_id": draft_id, "imported_count": len(rows), "findings": rows}

@app.patch("/findings/{finding_id}")
def update_finding(finding_id: str, p: FindingPatch, user=Depends(require("creator","manager","reviewer","admin"))):
    if p.action == "dismiss" and not (p.reason and p.reason.strip()):
        raise HTTPException(422, "Dismissal reason is required")
    if p.action == "edit" and not (p.edited_text and p.edited_text.strip()):
        raise HTTPException(422, "edited_text is required for edit")
    if p.action in ("accept", "dismiss") and user["role"] not in ("reviewer", "manager", "admin"):
        raise HTTPException(403, "Only a reviewer or manager can accept or dismiss a finding.")

    status = {"accept":"accepted", "edit":"edited", "dismiss":"dismissed"}[p.action]
    with db() as c:
        f = c.execute("SELECT * FROM findings WHERE id=?", (finding_id,)).fetchone()
        if not f:
            raise HTTPException(404, "Finding not found")
        if p.action == "edit":
            d = c.execute("SELECT * FROM drafts WHERE id=?", (f["draft_id"],)).fetchone()
            if not d:
                raise HTTPException(404, "Draft not found")
            old_content = d["content"]
            start_pos, end_pos = f["start"], f["end"]
            # Reject stale offsets rather than silently editing the wrong text.
            if old_content[start_pos:end_pos] != f["flagged_text"]:
                raise HTTPException(409, "Finding is stale. Re-run draft review before editing this finding.")
            new_content = old_content[:start_pos] + p.edited_text + old_content[end_pos:]
            if new_content == old_content:
                raise HTTPException(422, "Edited text is identical to the flagged text.")
            delta = len(p.edited_text) - (end_pos - start_pos)
            # Keep offsets for unaffected findings aligned with the updated draft.
            other_rows = c.execute(
                "SELECT id,start,end FROM findings WHERE draft_id=? AND id<>? AND status='open'",
                (f["draft_id"], finding_id)
            ).fetchall()
            for other in other_rows:
                if other["start"] >= end_pos:
                    c.execute("UPDATE findings SET start=start+?, end=end+? WHERE id=?",
                              (delta, delta, other["id"]))
                elif other["end"] > start_pos:
                    c.execute("UPDATE findings SET status='superseded' WHERE id=?", (other["id"],))
            c.execute("UPDATE drafts SET content=?,updated_at=?,status='draft' WHERE id=?",
                      (new_content, now(), f["draft_id"]))
            version_no = save_version(c, f["draft_id"], new_content, user["id"],
                                      f"Finding edited: {f['flagged_text']}")
            c.execute("DELETE FROM reviewer_signoffs WHERE draft_id=?", (f["draft_id"],))
            c.execute("UPDATE findings SET status=?, suggested_fix=? WHERE id=?",
                      (status, p.edited_text, finding_id))
        else:
            version_no = None
            c.execute("UPDATE findings SET status=? WHERE id=?", (status, finding_id))
        audit(c, user["id"], p.action, "finding", finding_id,
              {"reason":p.reason, "edited_text":p.edited_text, "version_no":version_no})
        return rowdict(c.execute("SELECT * FROM findings WHERE id=?", (finding_id,)).fetchone())

@app.get("/drafts/{draft_id}/versions")
def versions(draft_id: str, user=Depends(get_user)):
    with db() as c:
        if not c.execute("SELECT 1 FROM drafts WHERE id=?",(draft_id,)).fetchone(): raise HTTPException(404,"Draft not found")
        return [rowdict(x) for x in c.execute("SELECT * FROM versions WHERE draft_id=? ORDER BY version_no",(draft_id,))]

@app.get("/drafts/{draft_id}/diff")
def diff(draft_id: str, from_version: int = 1, to_version: Optional[int] = None, user=Depends(get_user)):
    import difflib
    with db() as c:
        rows=c.execute("SELECT * FROM versions WHERE draft_id=? ORDER BY version_no",(draft_id,)).fetchall()
        if not rows: raise HTTPException(404,"No versions found")
        latest=rows[-1]["version_no"]
        target=to_version or latest
        a=c.execute("SELECT content FROM versions WHERE draft_id=? AND version_no=?",(draft_id,from_version)).fetchone()
        b=c.execute("SELECT content FROM versions WHERE draft_id=? AND version_no=?",(draft_id,target)).fetchone()
        if not a or not b: raise HTTPException(404,"Version not found")
        return {"from_version":from_version,"to_version":target,
                "diff":list(difflib.unified_diff(a["content"].splitlines(),b["content"].splitlines(),
                         fromfile=f"v{from_version}",tofile=f"v{target}",lineterm=""))}

@app.post("/drafts/{draft_id}/comments")
def add_comment(draft_id: str, p: CommentIn, user=Depends(get_user)):
    cid=str(uuid.uuid4())
    if not p.body.strip():
        raise HTTPException(422, "Comment body cannot be empty")
    with db() as c:
        if not c.execute("SELECT 1 FROM drafts WHERE id=?",(draft_id,)).fetchone(): raise HTTPException(404,"Draft not found")
        if p.finding_id and not c.execute("SELECT 1 FROM findings WHERE id=? AND draft_id=?",(p.finding_id,draft_id)).fetchone():
            raise HTTPException(422, "finding_id must belong to this draft")
        c.execute("INSERT INTO comments VALUES(?,?,?,?,?,?)",(cid,draft_id,p.finding_id,user["id"],p.body.strip(),now()))
        audit(c,user["id"],"comment","draft",draft_id,{"comment_id":cid,"finding_id":p.finding_id})
        return rowdict(c.execute("SELECT * FROM comments WHERE id=?",(cid,)).fetchone())

@app.get("/drafts/{draft_id}/comments")
def get_comments(draft_id: str, user=Depends(get_user)):
    with db() as c:
        if not c.execute("SELECT 1 FROM drafts WHERE id=?", (draft_id,)).fetchone():
            raise HTTPException(404, "Draft not found")
        return [rowdict(x) for x in c.execute("SELECT * FROM comments WHERE draft_id=? ORDER BY created_at",(draft_id,))]

def change_draft_status(draft_id, status, user, allowed):
    if user["role"] not in allowed: raise HTTPException(403,"Role not permitted")
    with db() as c:
        d=c.execute("SELECT * FROM drafts WHERE id=?",(draft_id,)).fetchone()
        if not d: raise HTTPException(404,"Draft not found")
        c.execute("UPDATE drafts SET status=?,updated_at=? WHERE id=?",(status,now(),draft_id))
        audit(c,user["id"],status,"draft",draft_id)
        return {"draft_id":draft_id,"status":status,"updated_by":user["name"]}

@app.post("/drafts/{draft_id}/submit")
def submit(draft_id: str, user=Depends(require("creator","admin"))):
    return change_draft_status(draft_id,"submitted",user,("creator","admin"))

@app.post("/drafts/{draft_id}/reviewer-signoff")
def reviewer_signoff(draft_id: str, p: ReviewerSignoffIn, user=Depends(require("reviewer"))):
    with db() as c:
        d = c.execute("SELECT id FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not d:
            raise HTTPException(404, "Draft not found")
        high = c.execute(
            "SELECT COUNT(*) n FROM findings WHERE draft_id=? AND severity='high' AND status='open' AND validated=1",
            (draft_id,)
        ).fetchone()["n"]
        if high == 0:
            raise HTTPException(409, "No open validated high-risk finding requires specialist sign-off.")
        signoff_id = str(uuid.uuid4())
        c.execute("INSERT INTO reviewer_signoffs VALUES(?,?,?,?,?) "
                  "ON CONFLICT(draft_id) DO UPDATE SET reviewer_id=excluded.reviewer_id, reason=excluded.reason, created_at=excluded.created_at",
                  (signoff_id, draft_id, user["id"], p.reason.strip(), now()))
        audit(c, user["id"], "reviewer_signoff", "draft", draft_id,
              {"reason": p.reason.strip(), "open_high_findings": high})
        return {"draft_id": draft_id, "signed_off": True, "open_high_findings": high,
                "reviewer": user["name"], "reason": p.reason.strip()}

@app.post("/drafts/{draft_id}/approve")
def approve(draft_id: str, user=Depends(require("manager","admin"))):
    with db() as c:
        d = c.execute("SELECT * FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not d:
            raise HTTPException(404, "Draft not found")
        high = c.execute(
            "SELECT COUNT(*) n FROM findings WHERE draft_id=? AND severity='high' AND status='open' AND validated=1",
            (draft_id,)
        ).fetchone()["n"]
        signoff = c.execute("SELECT * FROM reviewer_signoffs WHERE draft_id=?", (draft_id,)).fetchone()
        if high and not signoff:
            raise HTTPException(409, "Open high-risk findings require specialist reviewer sign-off before manager approval.")
        c.execute("UPDATE drafts SET status='approved',updated_at=? WHERE id=?", (now(), draft_id))
        audit(c, user["id"], "approve", "draft", draft_id,
              {"high_open_findings": high, "reviewer_signoff_id": signoff["id"] if signoff else None})
        return {"draft_id": draft_id, "status": "approved", "approved_by": user["name"],
                "reviewer_signoff": bool(signoff)}

@app.post("/drafts/{draft_id}/request-changes")
def request_changes(draft_id: str, p: CommentIn, user=Depends(require("manager","reviewer","admin"))):
    with db() as c:
        d=c.execute("SELECT * FROM drafts WHERE id=?",(draft_id,)).fetchone()
        if not d: raise HTTPException(404,"Draft not found")
        c.execute("UPDATE drafts SET status='changes_requested',updated_at=? WHERE id=?",(now(),draft_id))
        c.execute("DELETE FROM reviewer_signoffs WHERE draft_id=?", (draft_id,))
        cid=str(uuid.uuid4())
        c.execute("INSERT INTO comments VALUES(?,?,?,?,?,?)",(cid,draft_id,p.finding_id,user["id"],p.body,now()))
        audit(c,user["id"],"request_changes","draft",draft_id,{"comment":p.body})
        return {"draft_id":draft_id,"status":"changes_requested","comment_id":cid}

@app.get("/audit")
def get_audit(limit: int=100, user=Depends(require("manager","reviewer","admin"))):
    with db() as c: return [rowdict(x) for x in c.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",(min(limit,500),))]

@app.get("/insights")
def insights(user=Depends(require("manager","reviewer","admin"))):
    with db() as c:
        totals=c.execute("SELECT COUNT(*) drafts FROM drafts").fetchone()["drafts"]
        counts=[rowdict(x) for x in c.execute("SELECT category,COUNT(*) count FROM findings GROUP BY category ORDER BY count DESC")]
        statuses=[rowdict(x) for x in c.execute("SELECT status,COUNT(*) count FROM drafts GROUP BY status")]
        overrides=c.execute("SELECT COUNT(*) n FROM findings WHERE status IN ('dismissed','edited')").fetchone()["n"]
        total_findings=c.execute("SELECT COUNT(*) n FROM findings").fetchone()["n"]
        clarity=round(max(0,100-(overrides/max(total_findings,1))*100),1)
        return {"draft_count":totals,"repeated_issues":counts,"draft_statuses":statuses,
                "guideline_clarity_score":clarity,
                "clarity_note":"Prototype metric: 100 minus the percentage of findings edited or dismissed; interpret with small demo data cautiously."}

# Rule-based utility endpoints
class ContrastIn(BaseModel):
    foreground: str
    background: str
    font_size: float = 16
    bold: bool = False

def hex_rgb(value):
    s=value.lstrip("#")
    if len(s)!=6: raise ValueError("Use 6-digit hex colours, e.g. #112233")
    return [int(s[i:i+2],16)/255 for i in (0,2,4)]

def luminance(rgb):
    vals=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in rgb]
    return .2126*vals[0]+.7152*vals[1]+.0722*vals[2]

@app.post("/checks/contrast")
def contrast_check(p: ContrastIn, user=Depends(get_user)):
    try:
        a,b=sorted([luminance(hex_rgb(p.foreground)),luminance(hex_rgb(p.background))],reverse=True)
    except ValueError as e: raise HTTPException(422,str(e))
    ratio=(a+.05)/(b+.05)
    large=p.font_size>=18 or (p.bold and p.font_size>=14)
    required=3.0 if large else 4.5
    return {"ratio":round(ratio,2),"required":required,"passes":ratio>=required,"standard":"WCAG AA"}

class AltTextIn(BaseModel):
    image_count: int = Field(ge=0)
    alt_texts: list[str] = []

@app.post("/checks/alt-text")
def alt_check(p: AltTextIn, user=Depends(get_user)):
    missing=max(0,p.image_count-len([x for x in p.alt_texts if x.strip()]))
    return {"image_count":p.image_count,"missing_alt_text_count":missing,"passes":missing==0}

@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), user=Depends(require("creator", "admin", "manager"))):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".docx", ".pdf"):
        raise HTTPException(415, "Only .docx and .pdf files are supported")
    raw = await file.read(15 * 1024 * 1024 + 1)
    if not raw:
        raise HTTPException(422, "Uploaded file is empty")
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "Maximum upload size is 15 MB")
    try:
        if suffix == ".docx":
            from docx import Document
            import io
            doc = Document(io.BytesIO(raw))
            extracted = "\n".join(x.text for x in doc.paragraphs if x.text.strip())
        else:
            import pdfplumber, io
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                if len(pdf.pages) > 100:
                    raise HTTPException(413, "Maximum PDF length is 100 pages")
                extracted = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(500, "Install document parser dependencies from requirements.txt")
    except Exception as e:
        raise HTTPException(422, f"Could not parse document: {str(e)}")
    stored = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    stored.write_bytes(raw)
    with db() as c:
        audit(c, user["id"], "upload", "document", stored.name,
              {"filename": Path(file.filename or "upload").name, "bytes": len(raw)})
    return {"filename": Path(file.filename or "upload").name, "stored_name": stored.name,
            "text": extracted, "character_count": len(extracted),
            "message": "Extracted text can now be submitted as a draft.",
            "ocr_note": "Scanned/image-only PDFs are not OCR-processed by this endpoint."}

