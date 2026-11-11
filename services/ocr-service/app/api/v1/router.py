"""Central API v1 router unifying health, extraction, and confirmation routes."""

from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.extract import router as extract_router
from app.api.v1.confirm import router as confirm_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(extract_router)
api_router.include_router(confirm_router)
