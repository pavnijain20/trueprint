from collections import Counter, defaultdict


def compute_insights(events: list[dict], min_flags: int = 3) -> dict:
    """events: [{"source_id": "guide_02", "category": "claim", "team": "social", "action": "accepted|edited|dismissed"}]"""
    flagged = Counter()
    dismissed = Counter()
    for e in events:
        sid = e.get("source_id")
        if not sid:
            continue
        flagged[sid] += 1
        if e.get("action") == "dismissed":
            dismissed[sid] += 1

    rules = []
    for sid, n in flagged.items():
        rate = dismissed[sid] / n
        if n < min_flags:
            verdict = "not_enough_data"
        elif rate >= 0.5:
            verdict = "likely_unclear"      # people keep rejecting it: wording may be the problem
        elif n >= 5:
            verdict = "often_broken"        # accepted often: a recurring mistake, not unclear
        else:
            verdict = "ok"
        rules.append({"source_id": sid, "flagged": n, "dismissed": dismissed[sid],
                      "dismiss_rate": round(rate, 2),
                      "clarity_score": round(100 * (1 - rate)) if n >= min_flags else None,
                      "verdict": verdict})
    rules.sort(key=lambda r: (-r["flagged"], r["source_id"]))

    by_category = Counter(e.get("category") for e in events if e.get("category"))
    by_team = defaultdict(Counter)
    for e in events:
        if e.get("team") and e.get("category"):
            by_team[e["team"]][e["category"]] += 1
    return {"total_findings": len(events),
            "recurring_categories": by_category.most_common(),
            "by_team": {t: dict(c) for t, c in by_team.items()},
            "rules": rules}