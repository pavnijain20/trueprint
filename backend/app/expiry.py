from datetime import date


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