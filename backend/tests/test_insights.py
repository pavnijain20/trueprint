from app.insights import compute_insights


def ev(sid, action):
    return {"source_id": sid, "category": "claim", "team": "social", "action": action}


def test_rule_that_is_often_dismissed_is_unclear():
    out = compute_insights([ev("guide_01", "dismissed")] * 3 + [ev("guide_01", "accepted")])
    r = out["rules"][0]
    assert r["verdict"] == "likely_unclear" and r["clarity_score"] == 25


def test_too_few_events_gives_no_verdict():
    out = compute_insights([ev("guide_02", "dismissed")])
    assert out["rules"][0]["verdict"] == "not_enough_data"


def test_often_accepted_is_a_recurring_mistake():
    out = compute_insights([ev("guide_02", "accepted")] * 5)
    assert out["rules"][0]["verdict"] == "often_broken"