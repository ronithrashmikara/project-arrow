from fastapi import (
    APIRouter,
    HTTPException
)

from app.peer_groups.schemas import (
    PeerGroupCreate,
    HotelPeerRequest
)

from app.peer_groups.repository import (
    create_peer_group,
    get_active_peer_groups
)

from app.peer_groups.service import (
    find_peer_group
)


router = APIRouter(
    prefix="/peer-groups",
    tags=["Peer Groups"]
)


@router.post("")
def add_peer_group(
    data: PeerGroupCreate
):
    return create_peer_group(data)


@router.get("")
def list_peer_groups():
    return get_active_peer_groups()


@router.post("/match")
def match_peer_group(
    data: HotelPeerRequest
):
    group = find_peer_group(
        data.district,
        data.hotel_type,
        data.room_count
    )

    if not group:
        raise HTTPException(
            status_code=404,
            detail="No matching peer group found"
        )

    return group