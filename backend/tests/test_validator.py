from app.validator import validate_findings

CHUNKS = {"fact_03": "Dermatologist-tested on 30 volunteers in 2025."}
get_chunk = CHUNKS.get


def test_valid_quote_passes():
    f = [{"source": {"id": "fact_03", "quote": "dermatologist-tested on 30 volunteers"}}]
    assert validate_findings(f, get_chunk)[0]["validated"] is True


def test_fake_quote_is_downgraded():
    f = [{"source": {"id": "fact_03", "quote": "clinically proven in 7 days"}}]
    out = validate_findings(f, get_chunk)[0]
    assert out["validated"] is False and out["status"] == "needs_human_check"


def test_unknown_source_is_dropped():
    f = [{"source": {"id": "fact_99", "quote": "anything"}}]
    assert validate_findings(f, get_chunk) == []