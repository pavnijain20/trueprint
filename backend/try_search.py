from app.retrieval import search

for q in ["Clinically proven to remove acne in 7 days", "Free shipping on every order", "Try our Glow Leaf serum today"]:
    print("\nDRAFT:", q)
    for r in search(q, k=3):
        print("  ", r["id"], "|", r["text"][:70])