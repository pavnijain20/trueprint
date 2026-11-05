import json
from app.agents import review_text

DRAFTS = [
    "Clinically proven to remove acne in 7 days. Try GlowLeaf Serum today!",
    "Enjoy free shipping on every order from our store.",
    "Our Glow Leaf serum is dermatologist-tested on 30 volunteers.",
]

for d in DRAFTS:
    print("\nDRAFT:", d)
    result = review_text(d)
    print(json.dumps(result, indent=2))