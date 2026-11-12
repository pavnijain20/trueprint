from app.expiry import find_expired_fact_use

FACTS = [
    {"id": "F20", "text": "Winter Sale: 20% off GlowLeaf Serum until 2026-10-31.", "expires": "2026-10-31"},
    {"id": "F04", "text": "Free shipping applies only to orders above Rs 499.", "expires": "2027-11-05"},
]


def test_expired_offer_is_flagged_even_if_the_ai_does_not_cite_it():
    out = find_expired_fact_use("Enjoy 20% off GlowLeaf Serum in our Winter Sale!", FACTS, today="2026-11-11")
    assert len(out) == 1 and out[0]["source"]["id"] == "F20" and out[0]["outdated"] is True


def test_unrelated_draft_is_not_flagged():
    assert find_expired_fact_use("Meet GlowLeaf Serum, our new daily serum.", FACTS, today="2026-11-11") == []


def test_a_fact_that_has_not_expired_is_ignored():
    assert find_expired_fact_use("Enjoy 20% off GlowLeaf Serum in our Winter Sale!", FACTS, today="2026-10-01") == []


def test_review_text_runs_and_includes_the_expiry_finding_without_the_ai(monkeypatch):
    import app.agents as ag
    monkeypatch.setattr(ag, "call_llm", lambda s, u: None)
    monkeypatch.setattr(ag, "build_prompt", lambda d: "x")
    monkeypatch.setattr(ag, "build_voice_prompt", lambda d: "x")
    monkeypatch.setattr(ag, "get_chunk", lambda i: "chunk text")
    monkeypatch.setattr(ag, "list_chunks", lambda kind: [
        {"id": "F20", "text": "Winter Sale: 20% off GlowLeaf Serum until 2026-10-31.", "expires": "2026-10-31"}])
    out = ag.review_text("Enjoy 20% off GlowLeaf Serum in our Winter Sale!")
    assert any(f["source"]["id"] == "F20" for f in out["findings"])


def test_call_llm_uses_its_client_and_returns_json(monkeypatch, tmp_path):
    import app.llm as llm

    class Resp:
        text = '{"ok": true}'

    class Models:
        def generate_content(self, **kwargs):
            return Resp()

    class Client:
        models = Models()

    monkeypatch.setattr(llm, "_get_client", lambda: Client())
    monkeypatch.setattr(llm, "CACHE_FILE", tmp_path / "cache.json")
    monkeypatch.setattr(llm, "_cache", {})
    monkeypatch.setattr(llm, "_demo", {})
    assert llm.call_llm("sys", "unique text for this test 123") == {"ok": True}


def test_call_llm_without_a_client_returns_none_instead_of_crashing(monkeypatch, tmp_path):
    import app.llm as llm
    monkeypatch.setattr(llm, "_get_client", lambda: None)
    monkeypatch.setattr(llm, "CACHE_FILE", tmp_path / "cache.json")
    monkeypatch.setattr(llm, "_cache", {})
    monkeypatch.setattr(llm, "_demo", {})
    assert llm.call_llm("sys", "another unique text 456") is None
