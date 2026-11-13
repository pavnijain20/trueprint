# Trueprint

Pre-publication brand governance. Every draft is checked against the brand's approved guidelines and facts. Each finding shows its source quote, a reason, a severity, a confidence and a suggested fix. Humans keep the final decision.

- Live app: https://trueprint.netlify.app
- API: https://trueprint-api-iciu.onrender.com (docs at `/docs`)
- Team: PAVNIJAIN20 (CodeNexus India 2026)

## What works
- Review of a draft: rule checks (plain code), two AI agents (Fact Verification, Brand Voice), then a Citation Validator that drops or downgrades findings whose source quote is not in the knowledge base.
- Expired approved facts are flagged by code (`backend/app/expiry.py`), not by the AI.
- Explainable risk score (severity x confidence x category weight) in the review response.
- Workflow API: drafts, version history, accept or dismiss findings (dismiss needs a reason), comments, submit, approve or request changes (only reviewer, approver or admin), audit log.
- Self-correcting rewrite (`POST /api/drafts/{id}/self-correct`): suggests a corrected draft, max 2 attempts, lists the proof that is missing, never applied automatically.
- Knowledge base loaded from `backend/data/brand_kit.md` (synthetic GlowLeaf demo data).

## Round 3: the three improvements
1. **Self-correcting agent.** The endpoint returns a suggested draft, up to 2 attempts, a "missing proof" note and `autoApplied: false`. Nothing changes until a person applies it. Checked on the live API with the saved demo draft `d_demo1` (HTTP 200, 1 attempt). A suggestion can reuse an approved fact that the original draft did not mention (for example the free-shipping fact); a person must review it.
2. **Live Governance Insights and Guideline Clarity Score.** `GET /api/insights/summary` returns recurring categories, per-rule dismiss rate and a clarity score. While there are fewer than 6 real events it adds sample history, and the response says so (`isSample: true`, `realEvents`, `sampleEvents`, each sample dismiss reason has `sample: true`). On the live API right now it shows 0 real events and 16 sample events.
3. **Reliability.** The expired-fact check is code. The labelled set has 74 drafts (24 earlier plus 50 added by the research teammate). `GET /api/reliability` serves `backend/eval/report.json`.

Latest harness run (Gemini free tier, all 74 drafts, 0 drafts with an AI error): precision 0.87, recall 0.98, unvalidated-citation rate 0.01. In that run the expired "Winter Sale" fact (F20) was flagged for 10 of 11 drafts that use it. The miss was a draft that says "Winter Sale discount" without "20% off". The check works on keyword overlap, so this is a known limit and we did not tune it. Labels were written by the team and some are incomplete; we did not change labels to raise scores. Precision below 1 means the system raised some extra findings beyond the labels.

## Architecture
React + Vite frontend (Netlify) -> FastAPI backend (Render) -> SQLite (workflow data, knowledge base with FTS5 search) -> Gemini API (external, free tier).
Review pipeline: rule checks -> expiry check -> retrieval -> Fact and Voice agents in parallel -> Citation Validator -> risk score.

## Run it locally
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # add your Gemini key
python seed.py              # builds the knowledge base
uvicorn main:app --reload   # docs at http://127.0.0.1:8000/docs
python -m pytest            # 75 tests, no API key needed
```
Frontend: set `VITE_API_URL` to the API URL (see `frontend/README.md`).

## AI and external services (disclosure)
- LLM at runtime: Google Gemini free tier, through one file (`backend/app/llm.py`). Model names are set in `.env`.
- On the free tier Google may use inputs to improve its models. We send only fictional demo data; emails and phone numbers are redacted before every call.
- Code, tests and prompts were written with AI assistance (Claude) and run, debugged and reviewed by the team. Prompts are in `backend/app/agents.py` and `backend/app/self_correct.py`.

## Tests and evaluation
- 75 automated tests (`cd backend` then `python -m pytest`), none need an API key.
- `backend/eval/drafts.json` holds 74 labelled drafts; `python harness.py` reports precision, recall and the unvalidated-citation rate (numbers above, saved in `backend/eval/report.json`). The test set is small and written by the team, so these numbers are indicative, not general.

## Knowledge-base module
`backend/app/knowledge.py` (by Sarika) is mounted in the API (`/api/knowledge/...`) and has tests in `backend/tests/test_knowledge.py`.

## Known limitations
- All data is synthetic (a fictional GlowLeaf brand). The AI calls are real; the demo drafts use saved real responses (`backend/demo_cache.json`) so the demo works when the free Gemini tier is busy. New text needs a live Gemini call, which can return 503 or 429; the app then shows rule-based findings and marks the result "needs human check".
- Self-correct was tested on a saved demo draft. It was not tested on new text with a live Gemini call.
- Free Render hosting sleeps after inactivity (first request can take about 50 seconds) and resets the database on restart; the demo drafts are re-created automatically, drafts created by users are lost.
- The Insights page shows sample history while real events are fewer than 6; it is labelled as sample.
- Expiry detection uses keyword overlap and can miss a draft that names the offer in different words (1 of 11 in our set).
- The API accepts an empty draft (no minimum-length validation yet).
- The knowledge POST endpoints have no login. Adding a fact would invalidate the saved demo responses, so use the knowledge base read-only in the demo.
- Retrieval is keyword search (SQLite FTS5); embeddings are not implemented.
- Login is a demo role switch, not real authentication.
- DOCX, PDF and image upload are not built.
