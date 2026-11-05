from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api_review import router

app = FastAPI(title="Trueprint API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True}