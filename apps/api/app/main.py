"""Project Arrow API - Akarsha's policy & research module entrypoint.

Run locally:
    cd apps/api
    python -m venv .venv
    ./.venv/Scripts/Activate.ps1
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.policy.routes import router as policy_router

app = FastAPI(
    title="Project Arrow API - Policy & Research",
    description=(
        "National dashboard, GIS aggregates, 2030 pathway modelling and the "
        "research access layer for Sri Lankan tourist accommodation."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(policy_router)


@app.get("/health")
def health() -> dict:
    from app.policy.repository import get_repository

    try:
        repo = get_repository()
        return {
            "status": "ok",
            "module": "policy-research",
            "districts": len(repo.districts),
            "properties": len(repo.properties),
            "submissions": len(repo.submissions),
        }
    except Exception as exc:  # pragma: no cover - surfaced to the client
        return {"status": "degraded", "detail": str(exc)}
