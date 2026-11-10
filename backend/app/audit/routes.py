from fastapi import APIRouter

from app.audit.service import get_audit_logs


router = APIRouter(
    prefix="/audit",
    tags=["Audit Logs"]
)


@router.get("")
def list_audit_logs():
    return get_audit_logs()