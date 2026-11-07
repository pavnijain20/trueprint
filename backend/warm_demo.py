import json
import time
from pathlib import Path

from app.agents import review_text
from app.self_correct import self_correct
from app.workflow import DEMO_DRAFTS  # same drafts the server shows

for title, text in DEMO_DRAFTS:
    print("Reviewing:", title)
    review_text(text)
    time.sleep(5)

print("Self-correct on the first draft")
self_correct(DEMO_DRAFTS[0][1])

src = Path(".cache/llm_cache.json")
dst = Path("demo_cache.json")
if src.exists():
    merged = json.loads(dst.read_text(encoding="utf-8")) if dst.exists() else {}
    merged.update(json.loads(src.read_text(encoding="utf-8")))
    dst.write_text(json.dumps(merged, indent=1), encoding="utf-8")
print("demo_cache.json has", len(json.loads(dst.read_text(encoding="utf-8"))), "responses")