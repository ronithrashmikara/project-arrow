from app.common.database import get_connection
from psycopg2.extras import Json


def create_audit_log(
    user_id,
    action: str,
    entity_type: str,
    entity_id=None,
    details=None
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            details
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            user_id,
            action,
            entity_type,
            str(entity_id)
            if entity_id is not None
            else None,
            Json(details)
            if details is not None
            else None
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def get_audit_logs():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM audit_logs
        ORDER BY created_at DESC
        """
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return rows