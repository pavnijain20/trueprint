from harness import score, summarize


def test_perfect_match():
    assert score(["a"], ["a"]) == {"tp": 1, "fp": 0, "fn": 0}


def test_extra_and_missed():
    assert score(["a", "b"], ["b", "c"]) == {"tp": 1, "fp": 1, "fn": 1}


def test_summary_numbers():
    rows = [{"tp": 3, "fp": 1, "fn": 1, "findings": 4, "unvalidated": 1}]
    s = summarize(rows)
    assert s["precision"] == 0.75 and s["recall"] == 0.75 and s["unvalidated_citation_rate"] == 0.25