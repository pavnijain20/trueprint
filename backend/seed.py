from app.retrieval import init_db, add_chunk

init_db(reset=True)

# Approved facts (expires = date after which the fact must be re-verified)
add_chunk("fact_01", "fact", "Ingredients", "Formulated without parabens and synthetic fragrance.", "2027-06-30")
add_chunk("fact_02", "fact", "Hydration", "Hydrates skin for up to 24 hours in an in-house study of 25 participants.", "2027-03-31")
add_chunk("fact_03", "fact", "Testing", "Dermatologist-tested on 30 volunteers in 2025.", "2027-09-10")
add_chunk("fact_04", "fact", "Shipping", "Free shipping on all orders above Rs 499.", "2026-06-30")  # expired on purpose

# Brand guidelines
add_chunk("guide_01", "guideline", "Tone", "Tone: warm, honest and simple. Avoid medical or miracle promises.")
add_chunk("guide_02", "guideline", "Claims", "Never use the words cure, miracle, clinically proven or 100% guaranteed unless a matching approved fact exists.")
add_chunk("guide_03", "guideline", "Naming", "Always write the product name as GlowLeaf Serum, never Glow Leaf or glowleaf.")

print("Seeded kb.db")