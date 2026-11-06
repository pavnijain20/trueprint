import json
from pathlib import Path

KNOWN = {"guide_01", "guide_02", "guide_03", "guide_04"} | {f"F{i:02d}" for i in range(1, 21)}
DATA = json.loads((Path(__file__).resolve().parent.parent / "eval" / "drafts.json").read_text(encoding="utf-8"))


def test_every_item_has_draft_and_expected():
    for item in DATA:
        assert isinstance(item["draft"], str) and item["draft"].strip()
        assert isinstance(item["expected"], list)


def test_expected_ids_exist_in_knowledge_base():
    for item in DATA:
        assert set(item["expected"]) <= KNOWN


def test_set_has_clean_and_flagged_cases():
    clean = [d for d in DATA if not d["expected"]]
    assert len(clean) >= 5 and len(DATA) - len(clean) >= 10