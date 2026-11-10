from pydantic import BaseModel


class UserRoleCreate(BaseModel):
    user_id: str
    role: str
    hotel_id: int | None = None


class UserRoleResponse(BaseModel):
    id: int
    user_id: str
    role: str
    hotel_id: int | None
    is_active: bool