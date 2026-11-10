from app.common.database import get_connection


def create_factor(data):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO emission_factors (
            factor_code,
            factor_name,
            scope,
            category,
            activity_unit,
            factor_unit,
            factor_value,
            source_name,
            source_reference,
            version,
            valid_from,
            valid_to,
            status
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        RETURNING *
        """,
        (
            data.factor_code,
            data.factor_name,
            data.scope,
            data.category,
            data.activity_unit,
            data.factor_unit,
            data.factor_value,
            data.source_name,
            data.source_reference,
            data.version,
            data.valid_from,
            data.valid_to,
            data.status
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def get_all_factors():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM emission_factors
        ORDER BY id
        """
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return rows


def get_factor_by_id(factor_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM emission_factors
        WHERE id = %s
        """,
        (factor_id,)
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    return row


def update_factor(factor_id: int, data):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE emission_factors
        SET
            factor_name = COALESCE(%s, factor_name),
            category = COALESCE(%s, category),
            factor_value = COALESCE(%s, factor_value),
            source_name = COALESCE(%s, source_name),
            source_reference = COALESCE(%s, source_reference),
            valid_from = COALESCE(%s, valid_from),
            valid_to = COALESCE(%s, valid_to),
            status = COALESCE(%s, status),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (
            data.factor_name,
            data.category,
            data.factor_value,
            data.source_name,
            data.source_reference,
            data.valid_from,
            data.valid_to,
            data.status,
            factor_id
        )
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def approve_factor(factor_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE emission_factors
        SET
            status = 'APPROVED',
            updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (factor_id,)
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row


def deactivate_factor(factor_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE emission_factors
        SET
            status = 'INACTIVE',
            updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (factor_id,)
    )

    row = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return row

def get_approved_factor_by_code(
    factor_code: str
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM emission_factors
        WHERE factor_code = %s
          AND status = 'APPROVED'
        ORDER BY version DESC
        LIMIT 1
        """,
        (factor_code,)
    )

    row = cur.fetchone()

    cur.close()
    conn.close()

    return row