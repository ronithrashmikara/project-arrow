from decimal import Decimal


def convert_to_base_unit(
    value: Decimal,
    from_unit: str,
    to_unit: str
) -> Decimal:

    if from_unit == to_unit:
        return value

    conversions = {
        ("Wh", "kWh"): Decimal("0.001"),
        ("kWh", "Wh"): Decimal("1000"),
        ("g", "kg"): Decimal("0.001"),
        ("kg", "g"): Decimal("1000"),
        ("ml", "litre"): Decimal("0.001"),
        ("litre", "ml"): Decimal("1000")
    }

    key = (
        from_unit,
        to_unit
    )

    if key not in conversions:
        raise ValueError(
            f"Unsupported unit conversion: "
            f"{from_unit} -> {to_unit}"
        )

    return (
        value
        *
        conversions[key]
    )