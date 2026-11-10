from fastapi import (
    APIRouter,
    HTTPException
)

from app.admin.schemas import (
    HotelCreate,
    HotelStatusUpdate
)

from app.admin.repository import (
    create_hotel,
    get_all_hotels,
    update_hotel_status
)

from app.audit.service import create_audit_log


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


@router.post("/hotels")
def register_hotel(
    hotel: HotelCreate
):
    return create_hotel(hotel)


@router.get("/hotels")
def list_hotels():
    return get_all_hotels()


@router.patch(
    "/hotels/{hotel_id}/status"
)
def change_hotel_status(
    hotel_id: int,
    data: HotelStatusUpdate
):
    allowed_statuses = [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "SUSPENDED"
    ]

    if data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid hotel status"
        )

    updated = update_hotel_status(
        hotel_id,
        data.status
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Hotel not found"
        )

    create_audit_log(
        user_id=None,
        action=f"HOTEL_{data.status}",
        entity_type="HOTEL",
        entity_id=hotel_id,
        details={
            "status": data.status
        }
    )

    return updated