import hashlib, json
from app.agents import SYSTEM, build_prompt
from app.workflow import DEMO_DRAFTS
from app.llm import MODEL

cache = json.load(open("demo_cache.json", encoding="utf-8"))
for title, text in DEMO_DRAFTS:
    user = build_prompt(text)
    k1 = hashlib.sha256((SYSTEM + user).encode()).hexdigest()
    k2 = hashlib.sha256((MODEL + SYSTEM + user).encode()).hexdigest()
    print(title, "-> cached" if (k1 in cache or k2 in cache) else "-> MISSING (would call Gemini)")
