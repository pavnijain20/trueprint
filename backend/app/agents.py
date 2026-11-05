import json
from datetime import date
from app.llm import call_llm
from app.retrieval import search, list_chunks, get_chunk, get_expiry
from app.validator import validate_findings
from app.expiry import flag_outdated
from app.risk import risk_score
from app.rules import rule_check

SYSTEM = """You are a brand-compliance reviewer for a skincare brand.
Use ONLY the APPROVED FACTS and GUIDELINES provided. Never use outside knowledge and never invent a source.

Find problems in the DRAFT:
- unsupported claim: a claim that no approved fact supports. Cite the guideline that requires an approved fact (source = that guideline).
- outdated fact: the draft relies on an approved fact whose expiry date is before TODAY. Cite that fact.
- terminology/tone: the draft breaks a guideline. Cite that guideline.
Do NOT report anything that is supported by a current approved fact.

Every finding MUST include a source id from the provided lists and a quote copied EXACTLY (word for word) from that source's text.
If you cannot cite a source, do not report the finding.

For suggested_fix: keep the writer's goal. If no approved fact supports the exact claim, rewrite using the closest approved fact that fits the same goal, or say what proof is needed (for example: "Add an approved fact about acne results before making this claim"). Never change the topic.

Reply with JSON only, in this shape:
{"findings": [{"category": "claim|tone|terminology", "flagged_text": "exact words from the draft",
 "reason": "one plain sentence", "severity": "high|medium|low", "confidence": 0.0,
 "source": {"type": "fact|guideline", "id": "...", "quote": "..."},
 "suggested_fix": "rewrite that keeps the writer's intent, using only approved facts"}]}
If there are no problems, reply {"findings": []}."""


def build_prompt(draft: str) -> str:
    facts = list_chunks("fact")
    guides = search(draft, k=4) or list_chunks("guideline")
    guides = [g for g in guides if g.get("kind", "guideline") == "guideline"] or list_chunks("guideline")
    facts_txt = "\n".join(f'- id={f["id"]} | expires={f["expires"]} | text: {f["text"]}' for f in facts)
    guide_txt = "\n".join(f'- id={g["id"]} | text: {g["text"]}' for g in guides)
    return (
        f"TODAY: {date.today().isoformat()}\n\nAPPROVED FACTS:\n{facts_txt}\n\n"
        f"GUIDELINES:\n{guide_txt}\n\nDRAFT:\n{draft}"
    )


def _inside(r, a):
    return a["start"] >= 0 and a["start"] <= r["start"] and r["end"] <= a["end"]


def review_text(draft: str) -> dict:
    rule_findings = rule_check(draft, get_chunk)

    ai_findings, error = [], None
    data = call_llm(SYSTEM, build_prompt(draft))
    if data is None:
        error = "AI unavailable - showing rule-based checks only; needs human check"
    else:
        validated = validate_findings(data.get("findings", []), get_chunk)
        ai_findings = flag_outdated(validated, get_expiry)
        for f in ai_findings:
            text = f.get("flagged_text", "")
            f["start"] = draft.find(text) if text else -1
            f["end"] = f["start"] + len(text) if f["start"] >= 0 else -1
            f["origin"] = "ai"

    # drop a rule finding if an AI finding already covers it with the same source
    rule_findings = [
        r for r in rule_findings
        if not any(_inside(r, a) and a.get("source", {}).get("id") == r["source"]["id"] for a in ai_findings)
    ]

    out = sorted(rule_findings + ai_findings, key=lambda f: f["start"])
    for i, f in enumerate(out, start=1):
        f["id"] = f"f{i}"
        f.setdefault("status", "open")
    return {"findings": out, "risk": risk_score(out), "error": error}