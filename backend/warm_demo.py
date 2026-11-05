import json, time
from pathlib import Path
from app.agents import review_text
from app.self_correct import self_correct

DEMO_DRAFTS = [
    "Clinically proven to remove acne in 7 days. Try GlowLeaf Serum today!",
    "Enjoy free shipping on every order from our store.",
    "Our Glow Leaf serum is dermatologist-tested on 30 volunteers.",
    "BUY NOW!!! Our miracle GlowLeaf Serum will change your life forever!!!",
    "GlowLeaf Serum is dermatologist-tested on 30 volunteers and free from parabens.",
]

for d in DEMO_DRAFTS:
    print("Reviewing:", d[:50])
    review_text(d)
    time.sleep(5)

print("Self-correct on the first draft")
self_correct(DEMO_DRAFTS[0])

src = Path(".cache/llm_cache.json")
dst = Path("demo_cache.json")
merged = json.loads(dst.read_text()) if dst.exists() else {}
merged.update(json.loads(src.read_text()))
dst.write_text(json.dumps(merged, indent=1))
print("Saved", len(merged), "responses to demo_cache.json")