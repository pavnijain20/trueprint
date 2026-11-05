from app.risk import risk_score
from app.expiry import flag_outdated


def test_high_claim_is_high_risk():
    f = [{"id": "f1", "category": "claim", "severity": "high", "confidence": 1.0, "validated": True}]
    assert risk_score(f)["level"] == "High"


def test_unvalidated_findings_do_not_count():
    f = [{"id": "f1", "category": "claim", "severity": "high", "confidence": 1.0, "validated": False}]
    assert risk_score(f)["level"] == "Low"


def test_expired_fact_is_flagged():
    f = [{"reason": "x", "source": {"type": "fact", "id": "fact_04"}}]
    out = flag_outdated(f, lambda _id: "2020-01-01")
    assert out[0]["outdated"] is True