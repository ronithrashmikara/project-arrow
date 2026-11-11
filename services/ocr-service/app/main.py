"""FastAPI Application Entrypoint for Project Arrow Handwriting OCR Microservice."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings


def create_app() -> FastAPI:
    """Application factory initializing FastAPI microservice with CORS and routing."""
    application = FastAPI(
        title="Project Arrow - Handwriting OCR Service",
        description=(
            "Digital MRV Bill Capture & Handwriting Recognition Microservice for Sri Lankan "
            "tourist accommodation. Employs dual-engine PaddleOCR + TrOCR with mandatory "
            "human-in-the-loop (HITL) confirmation."
        ),
        version=settings.SERVICE_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    )

    # Enable CORS for React frontend & mobile Capacitor clients
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # Vite dev server
            "http://localhost:3000",  # React default
            "http://localhost:8080",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "*",                      # Permissive fallback during development
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API v1 router
    application.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @application.get("/", tags=["Root"])
    async def root():
        """Microservice root metadata."""
        return {
            "service": settings.SERVICE_NAME,
            "version": settings.SERVICE_VERSION,
            "status": "online",
            "documentation": "/docs",
            "api_prefix": settings.API_V1_PREFIX,
        }

    return application


app = create_app()
