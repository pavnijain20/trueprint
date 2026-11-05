import json
from app.self_correct import self_correct

d = "Clinically proven to remove acne in 7 days. Try GlowLeaf Serum today!"
r = self_correct(d)
print("STATUS:", r["status"])
print("ORIGINAL:", r["original"])
for a in r["attempts"]:
    print(f'ATTEMPT {a["attempt"]}: {a["revised"]}  (remaining issues: {a["remaining"]})')
print("auto_applied:", r["auto_applied"])