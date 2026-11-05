import json
from app.retrieval import get_chunk
from app.validator import validate_findings
from app.risk import risk_score

# Pretend the AI returned these three findings (one honest, two made up).
ai_output = [
    {   # 1. Honest: quote really exists in guide_02
        "id": "f1", "category": "claim", "severity": "high", "confidence": 0.95,
        "flagged_text": "Clinically proven",
        "source": {"type": "guideline", "id": "guide_02",
                   "quote": "Never use the words cure, miracle, clinically proven"},
    },
    {   # 2. Fake quote: guide_02 exists but never says this
        "id": "f2", "category": "claim", "severity": "high", "confidence": 0.9,
        "flagged_text": "removes acne",
        "source": {"type": "guideline", "id": "guide_02",
                   "quote": "Acne claims need written approval from the legal team"},
    },
    {   # 3. Invented source: guide_99 does not exist
        "id": "f3", "category": "tone", "severity": "medium", "confidence": 0.8,
        "flagged_text": "Try today",
        "source": {"type": "guideline", "id": "guide_99",
                   "quote": "Always end with a call to action"},
    },
]

result = validate_findings(ai_output, get_chunk)

print("AI gave 3 findings. After validation:", len(result), "remain\n")
for f in result:
    print(f["id"], "| validated:", f["validated"], "| status:", f.get("status", "open"))
print("\nDropped: f3 (source guide_99 does not exist)")
print("Downgraded: f2 (quote is not in guide_02)")
print("\nRisk (only validated findings count):", json.dumps(risk_score(result)["level"]))