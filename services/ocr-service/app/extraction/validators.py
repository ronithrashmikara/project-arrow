"""Validation and anomaly detection rules for Sri Lankan hospitality utility bills.

Provides sanity checks, format verification, and plausible consumption range
checks for CEB/LECO electricity, NWSDB water, and LPG/fuel invoices.
"""

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple


class BillValidationError:
    """Represents a validation failure or plausibility anomaly."""

    def __init__(self, field_name: str, message: str, is_critical: bool = False):
        self.field_name = field_name
        self.message = message
        self.is_critical = is_critical

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "message": self.message,
            "is_critical": self.is_critical,
        }


def clean_number_string(val_str: str) -> str:
    """Clean OCR number strings (handles common OCR misreads like 'O' for '0', 'l' for '1')."""
    cleaned = val_str.strip()
    # Remove currency prefixes like Rs., LKR, Rs
    cleaned = re.sub(r"^(LKR|Rs\.?|SLRs\.?)\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace(",", "")  # Remove thousands separators
    return cleaned.strip()


def parse_float_safely(val: Any) -> Optional[float]:
    """Parse float from string or number with OCR character correction."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)

    s = clean_number_string(str(val))
    # Replace common OCR misreads in numeric context
    s = s.replace("O", "0").replace("o", "0")
    s = s.replace("l", "1").replace("I", "1").replace("|", "1")
    s = s.replace("B", "8").replace("S", "5").replace("s", "5")

    try:
        return float(s)
    except ValueError:
        # Check if multiple decimals or stray characters
        match = re.search(r"[-+]?\d*\.?\d+", s)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return None
        return None


def validate_account_number(acc_str: Optional[str], provider: str = "CEB") -> Tuple[bool, Optional[str]]:
    """Validate Sri Lankan utility account number formats.

    - CEB: 10 digits (e.g. 0723456789)
    - LECO: 10 digits (e.g. 2101234567)
    - NWSDB: 10 digits or formatted as XX/XX/XXX/XXX/XX
    """
    if not acc_str:
        return False, "Account number is missing."

    digits_only = re.sub(r"\D", "", acc_str)

    if provider.upper() in ("CEB", "LECO"):
        if len(digits_only) == 10:
            return True, None
        return False, f"{provider} account number must be 10 digits (got {len(digits_only)} digits: '{acc_str}')."

    if provider.upper() in ("NWSDB", "WATER"):
        if 8 <= len(digits_only) <= 12:
            return True, None
        return False, f"NWSDB account number must be 8-12 digits (got '{acc_str}')."

    # General fallback
    if len(digits_only) >= 6:
        return True, None
    return False, f"Account number '{acc_str}' seems too short."


def validate_electricity_units(units: Optional[float]) -> Tuple[bool, Optional[str]]:
    """Validate monthly electricity consumption (kWh) plausibility for tourist accommodation."""
    if units is None:
        return False, "Electricity units (kWh) could not be parsed."

    if units <= 0:
        return False, f"Electricity units must be greater than zero (got {units} kWh)."

    # Plausible monthly range for Sri Lankan hospitality:
    # Small homestay: ~50-500 kWh, Boutique hotel: ~1,000-15,000 kWh, Large resort: ~15,000-80,000 kWh
    if units < 10.0:
        return True, f"Warning: Extremely low electricity consumption ({units} kWh). Please verify."
    if units > 150_000.0:
        return False, f"Electricity consumption ({units:,.1f} kWh) exceeds plausible monthly maximum (150,000 kWh)."

    return True, None


def validate_water_units(units: Optional[float]) -> Tuple[bool, Optional[str]]:
    """Validate monthly water consumption (cubic meters - m3) plausibility."""
    if units is None:
        return False, "Water units (m³) could not be parsed."

    if units <= 0:
        return False, f"Water consumption must be positive (got {units} m³)."

    # Typical Sri Lankan hotel water range: 5 to 5,000 m3
    if units < 1.0:
        return True, f"Warning: Unusually low water consumption ({units} m³). Please verify."
    if units > 15_000.0:
        return False, f"Water consumption ({units:,.1f} m³) exceeds plausible hotel monthly limit (15,000 m³)."

    return True, None


def validate_lpg_quantity(qty: Optional[float], unit: str = "kg") -> Tuple[bool, Optional[str]]:
    """Validate LPG refill quantity in kg.

    Standard Sri Lankan cylinders: Litro/Laugfs 12.5 kg, 37.5 kg (commercial), or bulk tank kg.
    """
    if qty is None:
        return False, "LPG quantity could not be parsed."

    if qty <= 0:
        return False, f"LPG quantity must be greater than zero (got {qty} {unit})."

    # Check standard cylinders or bulk refills
    if unit.lower() in ("kg", "kilogram"):
        if qty > 5_000.0:
            return False, f"LPG quantity ({qty:,.1f} kg) exceeds plausible single delivery threshold (5,000 kg)."
    return True, None


def validate_fuel_quantity(qty: Optional[float], unit: str = "L") -> Tuple[bool, Optional[str]]:
    """Validate generator diesel or transport fuel quantity in liters."""
    if qty is None:
        return False, "Fuel quantity could not be parsed."

    if qty <= 0:
        return False, f"Fuel quantity must be greater than zero (got {qty} {unit})."

    if qty > 10_000.0:
        return False, f"Fuel quantity ({qty:,.1f} L) exceeds plausible single delivery volume (10,000 L)."

    return True, None


def validate_bill_amount(amount: Optional[float]) -> Tuple[bool, Optional[str]]:
    """Validate bill total in Sri Lankan Rupees (LKR)."""
    if amount is None:
        return False, "Total amount could not be parsed."

    if amount <= 0:
        return False, f"Total amount must be greater than zero (got {amount} LKR)."

    if amount < 100.0:
        return True, f"Warning: Bill amount ({amount:,.2f} LKR) is unusually small."
    if amount > 50_000_000.0:
        return False, f"Bill amount ({amount:,.2f} LKR) exceeds 50 million LKR upper sanity limit."

    return True, None


def validate_billing_period(period_str: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Validate billing period date or date range."""
    if not period_str:
        return False, "Billing period is missing."

    # Look for 4-digit year
    years = [int(y) for y in re.findall(r"\b(20\d\d)\b", period_str)]
    current_year = date.today().year

    for y in years:
        if y < 2018:
            return False, f"Billing year ({y}) is older than supported historical records (2018+)."
        if y > current_year + 1:
            return False, f"Billing year ({y}) cannot be in the future."

    return True, None


def run_document_validations(
    doc_type: str,
    parsed_fields: Dict[str, Any],
) -> List[BillValidationError]:
    """Execute comprehensive rule-based validation based on bill type.

    Returns:
        List of BillValidationError items.
    """
    errors: List[BillValidationError] = []

    # Amount validation is common to all bills
    total_amount = parse_float_safely(parsed_fields.get("total_amount"))
    is_valid_amt, amt_msg = validate_bill_amount(total_amount)
    if not is_valid_amt and amt_msg:
        errors.append(BillValidationError("total_amount", amt_msg, is_critical=True))
    elif amt_msg:  # Non-critical warning
        errors.append(BillValidationError("total_amount", amt_msg, is_critical=False))

    doc_type_lower = doc_type.lower()

    if "electricity" in doc_type_lower:
        # Account Number
        acc = parsed_fields.get("account_number")
        is_valid_acc, acc_msg = validate_account_number(acc, provider="CEB")
        if not is_valid_acc and acc_msg:
            errors.append(BillValidationError("account_number", acc_msg, is_critical=True))

        # Units kWh
        units = parse_float_safely(parsed_fields.get("units_kwh"))
        is_valid_u, u_msg = validate_electricity_units(units)
        if not is_valid_u and u_msg:
            errors.append(BillValidationError("units_kwh", u_msg, is_critical=True))
        elif u_msg:
            errors.append(BillValidationError("units_kwh", u_msg, is_critical=False))

        # Billing Period
        bp = parsed_fields.get("billing_period")
        is_valid_bp, bp_msg = validate_billing_period(bp)
        if not is_valid_bp and bp_msg:
            errors.append(BillValidationError("billing_period", bp_msg, is_critical=False))

    elif "water" in doc_type_lower:
        # Account Number
        acc = parsed_fields.get("account_number")
        is_valid_acc, acc_msg = validate_account_number(acc, provider="NWSDB")
        if not is_valid_acc and acc_msg:
            errors.append(BillValidationError("account_number", acc_msg, is_critical=True))

        # Units m3
        units = parse_float_safely(parsed_fields.get("units_m3"))
        is_valid_u, u_msg = validate_water_units(units)
        if not is_valid_u and u_msg:
            errors.append(BillValidationError("units_m3", u_msg, is_critical=True))
        elif u_msg:
            errors.append(BillValidationError("units_m3", u_msg, is_critical=False))

    elif "lpg" in doc_type_lower or "gas" in doc_type_lower:
        qty = parse_float_safely(parsed_fields.get("quantity_kg_or_liters") or parsed_fields.get("quantity_kg"))
        is_valid_q, q_msg = validate_lpg_quantity(qty, unit="kg")
        if not is_valid_q and q_msg:
            errors.append(BillValidationError("quantity_kg_or_liters", q_msg, is_critical=True))
        elif q_msg:
            errors.append(BillValidationError("quantity_kg_or_liters", q_msg, is_critical=False))

    elif "fuel" in doc_type_lower or "diesel" in doc_type_lower:
        qty = parse_float_safely(parsed_fields.get("quantity_kg_or_liters") or parsed_fields.get("quantity_liters"))
        is_valid_q, q_msg = validate_fuel_quantity(qty, unit="L")
        if not is_valid_q and q_msg:
            errors.append(BillValidationError("quantity_kg_or_liters", q_msg, is_critical=True))
        elif q_msg:
            errors.append(BillValidationError("quantity_kg_or_liters", q_msg, is_critical=False))

    return errors
