from fastapi import FastAPI

from app.factors.routes import (
    router as factors_router
)

from app.ghg.routes import (
    router as ghg_router
)

from app.admin.routes import (
    router as admin_router
)

from app.peer_groups.routes import (
    router as peer_groups_router
)

app = FastAPI(
    title="Project Arrow API",
    version="0.1.0"
)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Project Arrow API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "project": "Project Arrow"
    }


app.include_router(
    factors_router
)

app.include_router(
    admin_router
)

app.include_router(
    peer_groups_router
)