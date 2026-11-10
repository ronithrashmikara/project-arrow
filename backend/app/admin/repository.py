from app.common.database import get_connection


def create_hotel(data):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO hotels (
            hotel_name,
            registration_number,
            district,
            email,
            phone
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            data.hotel_name,
            data.registration_number,
            data.district,
            data.email,
            data.phone
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def get_all_hotels():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM hotels
        ORDER BY created_at DESC
        """
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return rows


def update_hotel_status(
    hotel_id: int,
    status: str
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE hotels
        SET
            status = %s,
            updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (
            status,
            hotel_id
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row