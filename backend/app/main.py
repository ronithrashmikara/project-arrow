from fastapi import FastAPI

from app.common.database import get_connection
from app.common.logger import logger

from app.factors.routes import router as factors_router
from app.ghg.routes import router as ghg_router
from app.admin.routes import router as admin_router
from app.peer_groups.routes import router as peer_groups_router
from app.audit.routes import router as audit_router

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Project Arrow API",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    database_status = "down"

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1")
        cur.fetchone()

        cur.close()
        conn.close()

        database_status = "ok"

        logger.info(
            "Database health check successful"
        )

    except Exception as error:
        logger.error(
            "Database health check failed: %s",
            error
        )

        database_status = "down"

    return {
        "status": "ok",
        "project": "Project Arrow",
        "database": database_status
    }


app.include_router(factors_router)
app.include_router(ghg_router)
app.include_router(admin_router)
app.include_router(peer_groups_router)
app.include_router(audit_router)