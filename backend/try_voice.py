import json
from app.agents import review_text

d = "BUY NOW!!! Our miracle GlowLeaf Serum will change your life forever!!!"
print(json.dumps(review_text(d), indent=2))