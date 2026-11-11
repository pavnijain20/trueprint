from datetime import date
import re 

def flag_outdated(findings: list[dict], get_expiry) -> list[dict]:
    """Mark findings whose approved fact has expired (deterministic, no AI)."""
    today = date.today().isoformat()
    for f in findings:
        src = f.get("source") or {}
        if src.get("type") != "fact":
            continue
        expires = get_expiry(src.get("id"))
        if expires and expires < today:
            f["outdated"] = True
            f["reason"] = f.get("reason", "") + f" (Note: this approved fact expired on {expires}; re-verify before use.)"
    return findings

import re

_STOP = {"the", "and", "for", "with", "that", "this", "from", "your", "are", "our", "can", "all",
         "until", "not", "only", "you", "has", "have", "was", "will", "new", "get", "enjoy"}
_BRAND = {"glowleaf", "serum", "glow", "leaf"}


def _tokens(text: str) -> set:
    text = re.sub(r"\d{4}-\d{2}-\d{2}", " ", text.lower())
    return {t for t in re.findall(r"[a-z0-9%]+", text) if len(t) > 2 and t not in _STOP and t not in _BRAND}


def find_expired_fact_use(draft: str, facts: list, today: str | None = None) -> list:
    """Deterministic: flag a draft that reuses an approved fact whose expiry date has passed."""
    today = today or date.today().isoformat()
    draft_tokens = _tokens(draft)
    findings = []
    for f in facts:
        exp = f.get("expires")
        if not exp or exp >= today:
            continue
        ft = _tokens(f["text"])
        if len(ft) < 3:
            continue
        need = max(3, -(-len(ft) * 6 // 10))  # at least 60% of the fact's key words
        if len(draft_tokens & ft) < need:
            continue
        sentences = [(m.start(), m.group(0)) for m in re.finditer(r"[^.!?]+[.!?]?", draft) if m.group(0).strip()]
        best = max(sentences, key=lambda s: len(_tokens(s[1]) & ft)) if sentences else (0, draft)
        if len(_tokens(best[1]) & ft) >= 3:
            start = best[0] + (len(best[1]) - len(best[1].lstrip()))
            text = best[1].strip()
        else:
            start, text = 0, draft.strip()
        findings.append({
            "category": "claim", "flagged_text": text, "start": start, "end": start + len(text),
            "reason": f"This draft appears to reuse an approved fact that expired on {exp} ({f['id']}). Re-verify it before publishing.",
            "severity": "high", "confidence": 0.9,
            "source": {"type": "fact", "id": f["id"], "quote": f["text"]},
            "suggested_fix": "Remove this offer, or replace it with a currently approved fact.",
            "validated": True, "status": "open", "origin": "rule", "outdated": True,
        })
    return findings