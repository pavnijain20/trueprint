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
- The keyword search can miss a related fact that uses different words.# Trueprint

Pre-publication brand governance. Every draft is checked against the brand's approved guidelines and facts. Each finding shows its source, a reason and a suggested fix. Humans keep the final decision.

- Live app: https://trueprint.netlify.app
- API: https://trueprint-api-iciu.onrender.com (docs at `/docs`)
- Team: PAVNIJAIN20

## What works
- Review of a draft: two AI agents (Fact Verification, Brand Voice) plus rule checks, run through a Citation Validator that drops or downgrades findings whose source quote is not in the knowledge base.
- Expired approved facts are flagged by code, not by the AI.
- Explainable risk score (severity x confidence x category weight) in the review response.
- Workflow API and UI: drafts, version history, accept or dismiss findings (dismiss needs a reason), comments, submit, approve or request changes (only reviewer, approver or admin), audit log and activity history.
- Self-correcting rewrite (`POST /self-correct`, max 2 attempts, never applied automatically) as an API.
- Knowledge base loaded from `backend/data/brand_kit.md` (synthetic GlowLeaf demo data) and a Knowledge Base page in the UI.

## Architecture
React + Vite frontend (Netlify) -> FastAPI backend (Render) -> SQLite (workflow data, knowledge base with FTS5 search) -> Gemini API (external, free tier).
Review pipeline: rule checks -> retrieval -> Fact and Voice agents in parallel -> Citation Validator -> expiry check -> risk score.

## Run it locally
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # add your Gemini key
python seed.py              # builds the knowledge base
uvicorn main:app --reload   # docs at http://127.0.0.1:8000/docs
python -m pytest            # 65 tests, no API key needed
```
Frontend: set `VITE_API_URL` to the API URL (see `frontend/README.md`).

## AI and external services (disclosure)
- LLM at runtime: Google Gemini free tier, through one file (`backend/app/llm.py`). Model names are set in `.env`.
- On the free tier Google may use inputs to improve its models. We send only fictional demo data; emails and phone numbers are redacted before every call.
- Code, tests and prompts were written with AI assistance (Claude) and run, debugged and reviewed by the team. Prompts are in `backend/app/agents.py` and `backend/app/self_correct.py`.

## Tests and evaluation
- 65 automated tests (`cd backend` then `python -m pytest`), none need an API key.
- `backend/eval/drafts.json` holds 24 labelled drafts; `python harness.py` reports precision, recall and the unvalidated-citation rate. Latest run (Gemini free tier, saved in `backend/eval/report.json`): precision 0.82, recall 0.96, unvalidated citations 0.0, no false flags on the 5 clean drafts. Known miss: the expired "Winter Sale" fact (F20) was not cited by the model in this run, so the expiry check did not fire. The test set is small and written by the team, so these numbers are indicative, not general.

## Knowledge-base module
`backend/app/knowledge.py` (by Sarika) is merged with its tests, but it is not yet wired into the deployed API.

## Known limitations
- All data is synthetic (a fictional GlowLeaf brand). The AI calls are real; the demo drafts use saved real responses (`backend/demo_cache.json`) so the demo works when the free Gemini tier is busy. New text needs a live Gemini call, which can return 503 or 429.
- Free Render hosting sleeps after inactivity (first request can take about 50 seconds) and resets the database on restart; the demo drafts are re-created automatically.
- The Insights page shows sample data. The live endpoint (`GET /api/insights`) exists but is not wired to the page.
- The self-correcting rewrite has no button in the UI yet.
- Retrieval is keyword search (SQLite FTS5); embeddings are not implemented.
- Login is a demo role switch, not real authentication.
- DOCX, PDF and image upload are not built yet.