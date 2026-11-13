import json, sys
from pathlib import Path
cur = Path("eval/drafts.json")
new = Path(sys.argv[1])
base = json.loads(cur.read_text(encoding="utf-8"))
add = json.loads(new.read_text(encoding="utf-8"))
seen = {d["draft"].strip().lower() for d in base}
added = 0
for d in add:
    assert isinstance(d.get("draft"), str) and isinstance(d.get("expected"), list), f"galat format: {d}"
    key = d["draft"].strip().lower()
    if key and key not in seen:
        base.append({"draft": d["draft"].strip(), "expected": d["expected"]})
        seen.add(key)
        added += 1
cur.write_text(json.dumps(base, indent=1, ensure_ascii=False), encoding="utf-8")
print("added", added, "total", len(base))
