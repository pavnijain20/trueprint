from app import self_correct as sc

BAD = {"findings": [{"validated": True, "severity": "high", "flagged_text": "x", "reason": "r"}], "risk": {}}
GOOD = {"findings": [], "risk": {}}


def test_resolved_on_first_attempt(monkeypatch):
    monkeypatch.setattr(sc, "review_text", lambda d: BAD if d == "bad" else GOOD)
    monkeypatch.setattr(sc, "call_llm", lambda s, p: {"revised": "good"})
    out = sc.self_correct("bad")
    assert out["status"] == "resolved" and out["auto_applied"] is False
    assert len(out["attempts"]) == 1


def test_stops_after_two_attempts(monkeypatch):
    monkeypatch.setattr(sc, "review_text", lambda d: BAD)
    monkeypatch.setattr(sc, "call_llm", lambda s, p: {"revised": "still bad"})
    out = sc.self_correct("bad")
    assert out["status"] == "needs_human" and len(out["attempts"]) == 2


def test_clean_draft_needs_no_rewrite(monkeypatch):
    monkeypatch.setattr(sc, "review_text", lambda d: GOOD)
    out = sc.self_correct("fine")
    assert out["status"] == "clean" and out["attempts"] == []


def test_ai_unavailable(monkeypatch):
    monkeypatch.setattr(sc, "review_text", lambda d: BAD)
    monkeypatch.setattr(sc, "call_llm", lambda s, p: None)
    assert sc.self_correct("bad")["status"] == "ai_unavailable"