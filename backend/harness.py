import json
import sys
import time
from pathlib import Path

ALIAS = {
    "F05": "F04",
    "F09": "guide_01", "F10": "guide_01", "F11": "guide_01", "F12": "guide_01", "F17": "guide_01",
    "F13": "guide_02", "F14": "guide_02", "F15": "guide_02", "F16": "guide_02", "F18": "guide_02",
    "F01": "guide_03", "F06": "guide_03", "F07": "guide_03", "F08": "guide_03", "F19": "guide_03",
}


def canon(source_id: str) -> str:
    """Several policy facts say the same thing as one guideline; count them as one rule."""
    return ALIAS.get(source_id, source_id)


def score(expected: list[str], predicted: list[str]) -> dict:
    exp, pred = set(expected), set(predicted)
    return {"tp": len(exp & pred), "fp": len(pred - exp), "fn": len(exp - pred)}


def summarize(rows: list[dict]) -> dict:
    tp = sum(r["tp"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    fn = sum(r["fn"] for r in rows)
    findings = sum(r["findings"] for r in rows)
    fake = sum(r["unvalidated"] for r in rows)
    return {
        "drafts": len(rows),
        "drafts_with_ai_error": sum(1 for r in rows if r.get("ai_error")),
        "precision": round(tp / (tp + fp), 2) if tp + fp else None,
        "recall": round(tp / (tp + fn), 2) if tp + fn else None,
        "unvalidated_citation_rate": round(fake / findings, 2) if findings else 0.0,
    }


def main(path="eval/drafts.json", delay=4):
    from app.agents import review_text  # imported here so the tests need no API key
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = []
    for n, item in enumerate(data, start=1):
        try:
            res = review_text(item["draft"])
        except Exception as e:  # never lose the run because of one draft
            res = {"findings": [], "error": f"crashed: {e}"}
        found = res["findings"]
        pred = [canon(f["source"]["id"]) for f in found if f.get("validated")]
        row = score([canon(x) for x in item["expected"]], pred)
        row.update({"draft": item["draft"], "expected": item["expected"], "predicted": pred,
                    "findings": len(found),
                    "unvalidated": sum(1 for f in found if not f.get("validated")),
                    "ai_error": res.get("error")})
        rows.append(row)
        flag = "  [AI unavailable]" if row["ai_error"] else ""
        print(f'{n}/{len(data)} {row["tp"]} ok / {row["fp"]} extra / {row["fn"]} missed | {item["draft"][:45]}{flag}')
        Path("eval/report.json").write_text(
            json.dumps({"summary": summarize(rows), "rows": rows}, indent=1), encoding="utf-8")
        time.sleep(delay)
    print("\nSUMMARY:", summarize(rows))


if __name__ == "__main__":
    main(*sys.argv[1:2])