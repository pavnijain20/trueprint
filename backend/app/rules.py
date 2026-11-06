import re

NAME_SOURCE = "guide_03"      # product naming guideline
BANNED_SOURCE = "guide_02"    # banned words guideline
CORRECT_NAME = "GlowLeaf"
BANNED_PATTERNS = [r"clinically proven", r"100% guaranteed", r"\bmiracle\b", r"\bcures?\b",
                   r"removes? acne", r"works for every skin type", r"doctors? recommend"]


def _finding(draft, m, category, severity, reason, source_id, get_chunk, fix):
    return {
        "category": category,
        "flagged_text": m.group(0),
        "start": m.start(),
        "end": m.end(),
        "reason": reason,
        "severity": severity,
        "confidence": 1.0,
        "source": {"type": "guideline", "id": source_id, "quote": get_chunk(source_id) or ""},
        "suggested_fix": fix,
        "validated": True,
        "status": "open",
        "origin": "rule",
    }


def rule_check(draft: str, get_chunk) -> list[dict]:
    """Deterministic checks: product naming and banned words. No AI involved."""
    findings = []
    for m in re.finditer(r"\bglow\s?leaf\b", draft, flags=re.IGNORECASE):
        if m.group(0) != CORRECT_NAME:
            findings.append(_finding(
                draft, m, "terminology", "high",
                f'Product name must be written as "{CORRECT_NAME}".',
                NAME_SOURCE, get_chunk, f"Use {CORRECT_NAME}"))
    for pat in BANNED_PATTERNS:
        for m in re.finditer(pat, draft, flags=re.IGNORECASE):
            findings.append(_finding(
                draft, m, "claim", "high",
                "Banned claim word: it needs a matching approved fact.",
                BANNED_SOURCE, get_chunk,
                "Remove it, or replace it with an approved fact."))
    return findings