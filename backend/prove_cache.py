import os
os.environ["LLM_API_KEY"] = ""   # no Gemini: only the saved responses can answer
from app.agents import review_text
from app.workflow import DEMO_DRAFTS

for title, text in DEMO_DRAFTS:
    r = review_text(text)
    ai = sum(1 for f in r["findings"] if f.get("origin") == "ai")
    print(f"{title:24} findings={len(r['findings'])} ai_findings={ai} error={r['error']}")
