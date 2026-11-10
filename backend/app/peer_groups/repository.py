from app.common.database import get_connection


def create_peer_group(data):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO peer_groups (
            group_name,
            district,
            hotel_type,
            min_rooms,
            max_rooms
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            data.group_name,
            data.district,
            data.hotel_type,
            data.min_rooms,
            data.max_rooms
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def get_active_peer_groups():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM peer_groups
        WHERE is_active = TRUE
        ORDER BY id
        """
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return rows