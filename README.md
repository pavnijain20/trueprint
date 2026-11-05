# Trueprint

Pre-publication brand governance. Every draft is checked against the brand's approved guidelines and facts. Each finding shows its source, a reason and a suggested fix. Humans keep the final decision.

Team: PAVNIJAIN20 (Round 2, Inkloom AI problem statement)

## What the AI pipeline does
1. **Rule checks (plain code):** product naming and banned words.
2. **Retrieval:** guidelines and approved facts from SQLite (FTS5).
3. **Two agents run in parallel:** Fact Verification and Brand Voice. Both must reply in JSON with a source id and an exact quote.
4. **Citation Validator:** drops findings whose source does not exist and downgrades findings whose quote is not in the source.
5. **Expiry check (plain code):** flags findings that rely on an expired approved fact.
6. **Explainable risk score:** sum of severity x confidence x category weight, validated findings only.
7. **Self-correcting rewrite:** rewrites the draft, re-reviews it, maximum 2 attempts, never applied automatically.

## Run it
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # then add your key
python seed.py              # builds kb.db with the demo brand kit
uvicorn main:app --reload   # API docs at http://127.0.0.1:8000/docs
python -m pytest            # tests need no API key
```

API: `POST /review`, `POST /self-correct`, `POST /insights`, `GET /health`.

## AI and external services (disclosure)
- LLM: Google Gemini free tier, through one file (`backend/app/llm.py`). The model name is set in `.env`.
- On the free tier Google may use inputs to improve its models. We send only fictional demo data, and emails and phone numbers are redacted before every call.
- Embeddings are not used yet; retrieval is SQLite FTS5.
- Parts of the code were written with AI assistance and reviewed by the team.

## Prompts
`SYSTEM`, `SYSTEM_VOICE` (`backend/app/agents.py`) and `REWRITE_SYSTEM` (`backend/app/self_correct.py`).

## Tests and evaluation
- 22 unit tests, no API needed.
- `backend/eval/drafts.json` holds 24 labelled drafts. `python harness.py` reports precision, recall and the unvalidated-citation rate.

## Known limitations
- The free Gemini tier returns 503 or 429 at busy times. The app then falls back to rule checks and marks the result "needs human check".
- Demo drafts use saved responses (`backend/demo_cache.json`). New drafts need a live Gemini call.
- The keyword search can miss a related fact that uses different words.