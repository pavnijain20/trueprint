SEVERITY = {"high": 3, "medium": 2, "low": 1}
CATEGORY = {"claim": 2, "tone": 1, "terminology": 1, "accessibility": 1}


def risk_score(findings: list[dict]) -> dict:
    """risk = sum(severity weight x confidence x category weight), validated findings only."""
    contributions, total = [], 0.0
    for f in findings:
        if not f.get("validated"):
            continue
        part = SEVERITY.get(f.get("severity"), 1) * float(f.get("confidence", 0.5)) * CATEGORY.get(f.get("category"), 1)
        total += part
        contributions.append({"finding": f.get("id"), "category": f.get("category"),
                              "severity": f.get("severity"), "points": round(part, 2)})
    level = "Low" if total < 3 else "Medium" if total < 6 else "High"
    return {"level": level, "score": round(total, 2), "contributions": contributions}