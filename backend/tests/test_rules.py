from app.rules import rule_check

CHUNKS = {
    "guide_02": "Never use the words cure, miracle, clinically proven or 100% guaranteed.",
    "guide_03": "Always write the product name as GlowLeaf Serum, never Glow Leaf or glowleaf.",
}


def test_wrong_product_name_is_flagged():
    out = rule_check("Try our Glow Leaf serum", CHUNKS.get)
    assert len(out) == 1 and out[0]["source"]["id"] == "guide_03"


def test_correct_product_name_is_not_flagged():
    assert rule_check("Try our GlowLeaf Serum", CHUNKS.get) == []


def test_banned_word_is_flagged():
    out = rule_check("A miracle in a bottle", CHUNKS.get)
    assert out[0]["source"]["id"] == "guide_02"