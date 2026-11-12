"""Knowledge Base API routes for Member 2.

This router intentionally uses the shared retrieval helpers rather than
writing to the SQLite database directly.
"""
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.retrieval import add_chunk, list_chunks, init_db

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge"])


class KnowledgeItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1)
    expires: str | None = None


def _is_expired(expires: str | None) -> bool:
    """Treat an item as expired after its expiry date has passed."""
    if not expires:
        return False
    try:
        return date.fromisoformat(expires[:10]) < date.today()
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="expires must be a valid ISO date (YYYY-MM-DD)",
        ) from exc

@router.get("/facts")
def get_facts():
    init_db()
    facts = list_chunks("fact")
    return [
        {
            **fact,
            "kind": "fact",
            "expired": _is_expired(fact.get("expires")),
        }
        for fact in facts
    ]


@router.get("/guidelines")
def get_guidelines():
    init_db()
    guidelines = list_chunks("guideline")
    return [{**item, "kind": "guideline"} for item in guidelines]


@router.post("/facts", status_code=201)
def create_fact(body: KnowledgeItemIn):
    init_db()
    _is_expired(body.expires)
    item_id = f"fact_{uuid4().hex[:8]}"
    add_chunk(item_id, "fact", body.title.strip(), body.text.strip(), body.expires)
    return {
        "id": item_id,
        "kind": "fact",
        "title": body.title.strip(),
        "text": body.text.strip(),
        "expires": body.expires,
        "expired": _is_expired(body.expires),
    }


@router.post("/guidelines", status_code=201)
def create_guideline(body: KnowledgeItemIn):
    init_db()
    _is_expired(body.expires)
    item_id = f"guideline_{uuid4().hex[:8]}"
    add_chunk(item_id, "guideline", body.title.strip(), body.text.strip(), body.expires)
    return {
        "id": item_id,
        "kind": "guideline",
        "title": body.title.strip(),
        "text": body.text.strip(),
        "expires": body.expires,
    }
