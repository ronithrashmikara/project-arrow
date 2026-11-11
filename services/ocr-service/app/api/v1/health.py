"""Service health and readiness check endpoints."""

from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter
from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=Dict[str, Any])
async def health_check():
    """Readiness and liveness probe for the OCR microservice."""
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "default_engine": settings.DEFAULT_ENGINE,
        "device": settings.DEVICE,
        "confidence_threshold": settings.CONFIDENCE_THRESHOLD,
        "timestamp": datetime.utcnow().isoformat(),
    }
