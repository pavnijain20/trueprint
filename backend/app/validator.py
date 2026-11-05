import re


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def validate_findings(findings: list[dict], get_chunk) -> list[dict]:
    """get_chunk(source_id) -> chunk text or None."""
    result = []
    for f in findings:
        src = f.get("source") or {}
        chunk = get_chunk(src.get("id")) if src.get("id") else None
        if chunk is None:
            continue  # unknown source: drop the finding
        if normalize(src.get("quote", "")) in normalize(chunk):
            f["validated"] = True
        else:
            f["validated"] = False
            f["status"] = "needs_human_check"  # quote not in source: downgrade
        result.append(f)
    return result