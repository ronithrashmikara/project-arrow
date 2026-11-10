from app.common.database import get_connection


def create_user_role(data):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO user_roles (
            user_id,
            role,
            hotel_id
        )
        VALUES (%s, %s, %s)
        RETURNING *
        """,
        (
            data.user_id,
            data.role,
            data.hotel_id
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def get_user_role(user_id: str):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM user_roles
        WHERE user_id = %s
          AND is_active = TRUE
        """,
        (user_id,)
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    return row