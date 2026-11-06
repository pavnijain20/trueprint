import re
from pathlib import Path
from app.retrieval import init_db, add_chunk

KIT = Path(__file__).parent / "data" / "brand_kit.md"
init_db(reset=True)

add_chunk("guide_01", "guideline", "Tone",
          "Tone rules: Use a friendly, clear, and helpful tone. Keep sentences simple and easy to understand. "
          "Avoid ALL CAPS, excessive exclamation marks, and pressure-based language.")
add_chunk("guide_02", "guideline", "Claims",
          "Do not make medical, guaranteed, or unsupported product claims. Do not use these terms or claims unless "
          "the team has valid supporting evidence and approval: miracle, cure, 100% guaranteed, clinically proven, "
          "removes acne, works for every skin type, doctors recommend.")
add_chunk("guide_03", "guideline", "Naming",
          "Always spell the product name exactly as GlowLeaf Serum. Never write Glow Leaf Serum, glowleaf serum or Glowleaf Serum.")
add_chunk("guide_04", "guideline", "Preferred terms",
          "Preferred wording: learn more about GlowLeaf Serum; explore our product information; "
          "add it to your skincare routine; share your feedback; supports your skincare routine.")

ROW = re.compile(r"^\|\s*(F\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|", re.M)
count = 0
for fid, text, source, owner, verified, expires in ROW.findall(KIT.read_text(encoding="utf-8")):
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    add_chunk(fid, "fact", fid, text, expires)
    count += 1
print(f"Seeded kb.db: 4 guidelines and {count} facts")