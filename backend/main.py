from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.retrieval import DB_PATH

if not Path(DB_PATH).exists():
    import seed  # builds kb.db from data/brand_kit.md on first start

from app.api_review import router
from app.workflow import router as workflow_router

app = FastAPI(title="Trueprint API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.include_router(workflow_router)


@app.get("/health")
def health():
    return {"ok": True}