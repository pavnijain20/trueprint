import json
import sys
import time
from pathlib import Path


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
        "precision": round(tp / (tp + fp), 2) if tp + fp else None,
        "recall": round(tp / (tp + fn), 2) if tp + fn else None,
        "unvalidated_citation_rate": round(fake / findings, 2) if findings else 0.0,
    }


def main(path="eval/drafts.json", delay=4):
    from app.agents import review_text  # imported here so the tests need no API key
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = []
    for item in data:
        res = review_text(item["draft"])
        found = res["findings"]
        pred = [f["source"]["id"] for f in found if f.get("validated")]
        row = score(item["expected"], pred)
        row.update({"draft": item["draft"], "findings": len(found),
                    "unvalidated": sum(1 for f in found if not f.get("validated")),
                    "ai_error": res.get("error")})
        rows.append(row)
        print(f'{row["tp"]} ok / {row["fp"]} extra / {row["fn"]} missed | {item["draft"][:50]}')
        time.sleep(delay)
    summary = summarize(rows)
    Path("eval/report.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=1), encoding="utf-8")
    print("\nSUMMARY:", summary)


if __name__ == "__main__":
    main(*sys.argv[1:2])