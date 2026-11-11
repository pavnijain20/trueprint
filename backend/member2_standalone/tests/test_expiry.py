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