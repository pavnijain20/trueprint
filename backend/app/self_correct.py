from datetime import date
from app.llm import call_llm
from app.agents import review_text
from app.retrieval import list_chunks

REWRITE_SYSTEM = """You are an editor for a skincare brand.
Rewrite the DRAFT so it fixes every listed ISSUE while keeping the writer's goal and message.
Rules:
- Use ONLY the APPROVED FACTS given. Do not add any new claim, number or benefit.
- Keep the length similar and the tone warm, honest and simple.
- If an issue cannot be fixed because proof is missing from the approved facts, soften or remove that claim. Never invent support.
Reply with JSON only: {"revised": "the full rewritten draft"}"""


def _blocking(result: dict) -> list[dict]:
    """Validated high/medium findings: these must be fixed before approval."""
    return [f for f in result.get("findings", [])
            if f.get("validated") and f.get("severity") in ("high", "medium")]


def _prompt(draft: str, findings: list[dict]) -> str:
    today = date.today().isoformat()
    facts = [f for f in list_chunks("fact") if not f["expires"] or f["expires"] >= today]
    facts_txt = "\n".join(f'- {f["text"]}' for f in facts)
    issues = "\n".join(f'- "{f["flagged_text"]}": {f["reason"]}' for f in findings)
    return f"APPROVED FACTS:\n{facts_txt}\n\nISSUES:\n{issues}\n\nDRAFT:\n{draft}"


def self_correct(draft: str, max_attempts: int = 2) -> dict:
    first = review_text(draft)
    out = {"original": draft, "first_review": first, "attempts": [],
           "status": "clean", "suggested_draft": None, "auto_applied": False}
    current, result = draft, first
    if not _blocking(result):
        return out
    for n in range(1, max_attempts + 1):
        data = call_llm(REWRITE_SYSTEM, _prompt(current, _blocking(result)))
        revised = (data or {}).get("revised", "").strip()
        if not revised:
            out["status"] = "ai_unavailable"
            return out
        check = review_text(revised)
        out["attempts"].append({"attempt": n, "revised": revised,
                                "remaining": len(_blocking(check)), "risk": check["risk"]})
        out["suggested_draft"] = revised
        if not _blocking(check):
            out["status"] = "resolved"
            return out
        current, result = revised, check
    out["status"] = "needs_human"  # still has problems after max attempts
    return out