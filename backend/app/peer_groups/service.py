from app.peer_groups.repository import (
    get_active_peer_groups
)


def find_peer_group(
    district: str,
    hotel_type: str,
    room_count: int
):
    groups = get_active_peer_groups()

    for group in groups:
        district_match = (
            group["district"] is None
            or group["district"].lower() == district.lower()
        )

        type_match = (
            group["hotel_type"] is None
            or group["hotel_type"].lower() == hotel_type.lower()
        )

        min_match = (
            group["min_rooms"] is None
            or room_count >= group["min_rooms"]
        )

        max_match = (
            group["max_rooms"] is None
            or room_count <= group["max_rooms"]
        )

        if (
            district_match
            and type_match
            and min_match
            and max_match
        ):
            return group

    return None