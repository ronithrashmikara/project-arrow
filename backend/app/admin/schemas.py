from pydantic import BaseModel


class HotelCreate(BaseModel):
    hotel_name: str
    registration_number: str | None = None
    district: str | None = None
    email: str | None = None
    phone: str | None = None


class HotelStatusUpdate(BaseModel):
    status: str