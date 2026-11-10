from pydantic import BaseModel


class PeerGroupCreate(BaseModel):
    group_name: str
    district: str | None = None
    hotel_type: str | None = None
    min_rooms: int | None = None
    max_rooms: int | None = None


class HotelPeerRequest(BaseModel):
    district: str
    hotel_type: str
    room_count: int