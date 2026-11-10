from decimal import Decimal


def calculate_emissions(
    activity_value: Decimal,
    emission_factor: Decimal
) -> Decimal:

    if activity_value < 0:
        raise ValueError(
            "Activity value cannot be negative."
        )

    if emission_factor < 0:
        raise ValueError(
            "Emission factor cannot be negative."
        )

    return (
        activity_value
        *
        emission_factor
    )