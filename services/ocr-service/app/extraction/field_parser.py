"""Field parser for Sri Lankan utility bills and hospitality fuel/receipt records.

Extracts structured domain fields from OCR tokens and transcripts:
- CEB / LECO electricity bills — domestic *and* commercial TOU (GP-2)
  * account_number : 10-digit, anchored near "Account Number" label;
                     explicitly ignores "Old Ac/No", "VAT Reg.No", "Invoice Number"
  * units_kwh      : domestic → single kWh figure;
                     commercial GP-2 → peak + day + off-peak rows summed
  * billing_period : "Billing Month" value (e.g. "2025 Jul", "2025-07")
  * total_amount   : "Total Amount Payable" / "Charge for this month" prioritised
- NWSDB water bills (units_m3, account_number, total_amount)
- LPG / Fuel receipts (quantity_kg_or_liters, total_amount, fuel_type)
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.extraction.validators import (
    parse_float_safely,
    run_document_validations,
)
from app.schemas.ocr import (
    DocumentType,
    ExtractedField,
)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def clean_number_string(val: str) -> str:
    """Strip everything except digits and decimal points (for token matching)."""
    return "".join(ch for ch in str(val) if ch.isdigit() or ch == ".")


def _strip_commas(val: str) -> str:
    """Remove thousands-separator commas so parse_float_safely works cleanly."""
    return val.replace(",", "")


# ---------------------------------------------------------------------------
# Document-type classifier
# ---------------------------------------------------------------------------

def detect_document_type(text: str) -> DocumentType:
    """Classify bill type using Sri Lankan utility provider keywords."""
    text_upper = text.upper()

    if any(k in text_upper for k in (
        "CEB", "LECO", "ELECTRICITY", "CEYLON ELECTRICITY", "KWH", "K.W.H",
        "KILOWATT", "GP-2", "G.P.-2", "GENERAL PURPOSE",
    )):
        return DocumentType.ELECTRICITY_BILL

    if any(k in text_upper for k in (
        "NWSDB", "WATER SUPPLY", "DRAINAGE BOARD", "WATER BOARD", "M3", "M³",
    )):
        return DocumentType.WATER_BILL

    if any(k in text_upper for k in ("LITRO", "LAUGFS", "GAS", "LPG", "CYLINDER")):
        return DocumentType.LPG_RECEIPT

    if any(k in text_upper for k in (
        "DIESEL", "PETROL", "CEYPETCO", "LIOC", "SINOPEC", "FUEL", "OCTANE",
    )):
        return DocumentType.GENERATOR_FUEL

    if any(k in text_upper for k in ("METER", "DIAL", "READING")):
        return DocumentType.METER_READING

    # Default: electricity as primary MRV scope
    return DocumentType.ELECTRICITY_BILL


# ---------------------------------------------------------------------------
# Account-number helpers
# ---------------------------------------------------------------------------

# Labels that look like account numbers but must be ignored
_IGNORED_ACCOUNT_LABELS: re.Pattern = re.compile(
    r"(?:OLD\s+AC(?:COUNT)?(?:/NO)?|VAT\s*REG(?:ISTRATION)?\.?\s*NO|INVOICE\s*(?:NO|NUMBER)|"
    r"METER\s*(?:SERIAL\s*)?NO)",
    re.IGNORECASE,
)

# Anchors that indicate the *real* account number field on CEB/LECO bills
_ACCOUNT_ANCHOR: re.Pattern = re.compile(
    r"(?:ACCOUNT\s*(?:NO\.?|NUMBER)|A/?C\s*(?:NO\.?|NUMBER)|CUSTOMER\s*(?:NO\.?|NUMBER)|"
    r"ගිණුම්\s*අංකය)",
    re.IGNORECASE,
)


def _extract_account_number(text: str) -> Optional[str]:
    """Extract the 10-digit CEB/LECO account number.

    Strategy (in priority order):
    1. Find an "Account Number" anchor and grab the 10-digit number that follows
       it on the same or next line, skipping any tokens matching ignored labels.
    2. Fall back to the first standalone 10-digit number that does NOT
       appear immediately after an ignored label.
    """
    lines = text.splitlines()

    # Pass 1: anchor-based search over consecutive line pairs
    for i, line in enumerate(lines):
        if _ACCOUNT_ANCHOR.search(line):
            # Search in the same line and the following two lines for a 10-digit number
            search_window = " ".join(lines[i: i + 3])
            # Remove any ignored-label occurrences to avoid mis-matching
            search_window_clean = _IGNORED_ACCOUNT_LABELS.sub(" ", search_window)
            m = re.search(r"\b([0-9]{10})\b", search_window_clean)
            if m:
                return m.group(1)

    # Pass 2: scan all lines, skip those belonging to ignored-label blocks
    prev_ignored = False
    for line in lines:
        if _IGNORED_ACCOUNT_LABELS.search(line):
            prev_ignored = True
            continue
        if prev_ignored:
            # The line right after an ignored label may still carry the ignored number
            prev_ignored = False
            continue
        m = re.search(r"\b([0-9]{10})\b", line)
        if m:
            return m.group(1)

    return None


# ---------------------------------------------------------------------------
# TOU (commercial) units helpers — CEB GP-2
# ---------------------------------------------------------------------------

# Matches lines like:
#   "kWh [peak]   ...  1098  ..."
#   "kWh [day]    ...  2861  ..."
#   "kWh [off peak]  ...  1102  ..."
#   "kWh [off-peak]  ..."
_TOU_ROW_PATTERN: re.Pattern = re.compile(
    r"kwh\s*\[(?P<tier>peak|day|off[\s\-]?peak)\]"
    r".*?"            # meter reading columns we don't care about
    r"\b(?P<units>[0-9]{1,6})\b",
    re.IGNORECASE | re.DOTALL,
)

# Simpler per-line variant used as a fallback for unstructured text
_TOU_LINE_PATTERN: re.Pattern = re.compile(
    r"kwh\s*\[(?P<tier>peak|day|off[\s\-]?peak)\].*?\b(?P<units>[0-9]{1,6})\b",
    re.IGNORECASE,
)


def _extract_commercial_tou_units(text: str) -> Optional[Tuple[float, str]]:
    """Sum peak + day + off-peak kWh rows on a commercial CEB GP-2 bill.

    Returns ``(total_kwh, raw_expression)`` or ``None`` if fewer than 2
    TOU tiers are found (which would indicate a domestic bill).
    """
    tier_values: Dict[str, float] = {}

    # Try per-line matching first (more reliable when text is split by newlines)
    for line in text.splitlines():
        m = _TOU_LINE_PATTERN.search(line)
        if m:
            tier = re.sub(r"[\s\-]+", "_", m.group("tier").lower())  # normalise key
            # Avoid overwriting a tier already found (keep first / leftmost match)
            if tier not in tier_values:
                tier_values[tier] = float(m.group("units"))

    # Fall back to dotall scan if line-by-line got nothing
    if not tier_values:
        for m in _TOU_ROW_PATTERN.finditer(text):
            tier = re.sub(r"[\s\-]+", "_", m.group("tier").lower())
            if tier not in tier_values:
                tier_values[tier] = float(m.group("units"))

    if len(tier_values) < 2:
        # Not enough tiers → not a TOU commercial bill
        return None

    total = sum(tier_values.values())
    raw_parts = " + ".join(f"{int(v)}" for v in tier_values.values())
    raw_expr = f"{raw_parts} = {int(total)}"
    return total, raw_expr


# ---------------------------------------------------------------------------
# Main parser class
# ---------------------------------------------------------------------------

class BillFieldParser:
    """Parser extracting semantic fields from recognised text and bounding boxes."""

    def __init__(self, confidence_threshold: float = None):
        self.confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else settings.CONFIDENCE_THRESHOLD
        )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def parse(
        self,
        extracted_tokens: List[ExtractedField],
        raw_text: Optional[str] = None,
        doc_type_hint: Optional[DocumentType] = None,
    ) -> Tuple[DocumentType, Dict[str, ExtractedField]]:
        """Parse extracted OCR tokens into standard bill fields.

        Args:
            extracted_tokens: List of tokens/fields produced by OCR engines.
            raw_text: Full raw transcript string if available.
            doc_type_hint: Explicit bill type hint from caller if known.

        Returns:
            ``(detected_document_type, dict_of_parsed_fields)``
        """
        if not raw_text:
            raw_text = "\n".join(f.raw_text for f in extracted_tokens if f.raw_text)

        doc_type = doc_type_hint or detect_document_type(raw_text)

        if doc_type == DocumentType.ELECTRICITY_BILL:
            parsed = self._parse_electricity_bill(extracted_tokens, raw_text)
        elif doc_type == DocumentType.WATER_BILL:
            parsed = self._parse_water_bill(extracted_tokens, raw_text)
        elif doc_type in (DocumentType.LPG_RECEIPT, DocumentType.GENERATOR_FUEL):
            parsed = self._parse_fuel_receipt(extracted_tokens, raw_text, doc_type)
        else:
            parsed = self._parse_generic_bill(extracted_tokens, raw_text)

        # Run validation and plausibility checks
        field_values = {name: f.normalized_value for name, f in parsed.items()}
        validation_errors = run_document_validations(doc_type.value, field_values)

        for err in validation_errors:
            if err.field_name in parsed:
                target_field = parsed[err.field_name]
                target_field.is_low_confidence = True
                target_field.needs_review = True
                if err.is_critical:
                    target_field.confidence = min(target_field.confidence, 0.40)

        return doc_type, parsed

    # ------------------------------------------------------------------
    # Electricity bill (CEB domestic + CEB commercial GP-2 + LECO)
    # ------------------------------------------------------------------

    def _parse_electricity_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Extract units_kwh, account_number, billing_period, total_amount.

        Handles:
        * CEB domestic / LECO — single kWh figure
        * CEB commercial GP-2 — peak + day + off-peak rows summed
        * Handwritten meter-reading slips — numeric fallback
        """
        fields: Dict[str, ExtractedField] = {}

        # ── 1. Account Number ────────────────────────────────────────────────
        # Anchor-based extraction anchored near "Account Number" label;
        # ignores "Old Ac/No", "VAT Reg.No", "Invoice Number" explicitly.
        acc_val = _extract_account_number(text)
        if acc_val:
            token = self._find_token_for_text(tokens, acc_val)
            fields["account_number"] = self._create_field(
                name="account_number",
                raw=acc_val,
                norm=acc_val,
                unit=None,
                token=token,
                is_numeric=False,
            )
        else:
            fields["account_number"] = self._missing_field("account_number")

        # ── 2. Units consumed (kWh) ──────────────────────────────────────────
        # Priority A: Commercial TOU — sum peak + day + off-peak rows
        tou_result = _extract_commercial_tou_units(text)
        if tou_result is not None:
            total_kwh, raw_expr = tou_result
            # Try to link to a token that contains any of the tier unit strings
            token = self._find_token_for_text(tokens, str(int(total_kwh)))
            fields["units_kwh"] = self._create_field(
                name="units_kwh",
                raw=raw_expr,
                norm=total_kwh,
                unit="kWh",
                token=token,
                default_conf=0.88,  # calculated sum — high but not perfect
            )
        else:
            # Priority B: Domestic / LECO — look for a single kWh label
            units_match = re.search(
                r"(?:UNITS|CONSUMPTION|USAGE|KWH|DIFF(?:ERENCE)?|TOTAL\s*UNITS)"
                r"[:.|\s-]*([0-9]+(?:\.[0-9]+)?)",
                text,
                re.IGNORECASE,
            )
            if not units_match:
                # Priority C: number followed by kWh unit token
                units_match = re.search(
                    r"([0-9]+(?:\.[0-9]+)?)\s*(?:KWH|UNITS)\b",
                    text,
                    re.IGNORECASE,
                )

            if units_match:
                u_raw = units_match.group(1)
                u_val = parse_float_safely(u_raw)
                token = self._find_token_for_text(tokens, u_raw)
                fields["units_kwh"] = self._create_field(
                    name="units_kwh",
                    raw=u_raw,
                    norm=u_val,
                    unit="kWh",
                    token=token,
                )
            else:
                fields["units_kwh"] = self._missing_field("units_kwh", unit="kWh")

        # ── 3. Total Amount ──────────────────────────────────────────────────
        # Priority A: "Total Amount Payable" (commercial GP-2 key phrase)
        # Priority B: "Charge for this month" (domestic CEB key phrase)
        # Priority C: generic TOTAL / AMOUNT labels
        # Priority D: highest currency-formatted number in the document
        amt_raw: Optional[str] = None

        for pattern in (
            # Specific GP-2 / CEB domestic labels — most precise
            r"TOTAL\s*AMOUNT\s*PAYABLE[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            r"CHARGE\s*FOR\s*THIS\s*MONTH[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            # Generic "total payable / amount due"
            r"(?:TOTAL\s*PAYABLE|NET\s*AMOUNT|AMOUNT\s*DUE|CURRENT\s*CHARGES)"
            r"[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            # Bare RS./LKR prefix
            r"(?:RS\.?|LKR)\s*([0-9,]+(?:\.[0-9]{1,2})?)",
        ):
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                amt_raw = m.group(1)
                break

        if amt_raw:
            amt_val = parse_float_safely(_strip_commas(amt_raw))
            token = self._find_token_for_text(tokens, _strip_commas(amt_raw))
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=amt_raw,
                norm=amt_val,
                unit="LKR",
                token=token,
            )
        else:
            # Fallback: highest currency-formatted number (d,ddd.dd pattern)
            candidates = re.findall(r"\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2}))\b", text)
            if candidates:
                best_raw = max(candidates, key=lambda c: parse_float_safely(_strip_commas(c)) or 0.0)
                best_val = parse_float_safely(_strip_commas(best_raw))
                token = self._find_token_for_text(tokens, _strip_commas(best_raw))
                fields["total_amount"] = self._create_field(
                    name="total_amount",
                    raw=best_raw,
                    norm=best_val,
                    unit="LKR",
                    token=token,
                    default_conf=0.70,
                )
            else:
                fields["total_amount"] = self._missing_field("total_amount", unit="LKR")

        # ── 4. Billing Period ────────────────────────────────────────────────
        # Priority A: "Billing Month" label (commercial GP-2: "2025 Jul")
        # Priority B: Generic "Billing Period / Bill Month / Date" label
        # Priority C: ISO date range (YYYY-MM-DD to YYYY-MM-DD)
        bp_raw: Optional[str] = None

        for pattern in (
            # "Billing Month" with YYYY Mon or YYYY-MM
            r"BILLING\s*MONTH[:.|\s-]*([0-9]{4}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)",
            r"BILLING\s*MONTH[:.|\s-]*([0-9]{4}[-/][0-9]{2})",
            # Generic period / month labels
            r"(?:BILLING\s*PERIOD|BILL\s*(?:PERIOD|MONTH)|PERIOD\s*OF\s*SUPPLY)"
            r"[:.|\s-]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2}"
            r"(?:\s*TO\s*[0-9]{4}[-/][0-9]{2}[-/][0-9]{2})?)",
            # Month-name + year standalone (e.g. "July 2025" or "2025 July")
            r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+20[0-9]{2})\b",
            r"\b(20[0-9]{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b",
        ):
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                bp_raw = m.group(1).strip()
                break

        if bp_raw:
            token = self._find_token_for_text(tokens, bp_raw)
            fields["billing_period"] = self._create_field(
                name="billing_period",
                raw=bp_raw,
                norm=bp_raw,
                unit=None,
                token=token,
                is_numeric=False,
            )
        else:
            fields["billing_period"] = self._missing_field("billing_period")

        return fields

    # ------------------------------------------------------------------
    # Water bill (NWSDB)
    # ------------------------------------------------------------------

    def _parse_water_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Extract units_m3, account_number, total_amount for NWSDB."""
        fields: Dict[str, ExtractedField] = {}

        # 1. Account Number
        acc_val = _extract_account_number(text)
        if not acc_val:
            # NWSDB accounts may be 8–12 digits; widen search
            m = re.search(r"\b([0-9]{8,12})\b", text)
            acc_val = m.group(1) if m else None

        if acc_val:
            token = self._find_token_for_text(tokens, acc_val)
            fields["account_number"] = self._create_field(
                name="account_number",
                raw=acc_val,
                norm=acc_val,
                unit=None,
                token=token,
                is_numeric=False,
            )
        else:
            fields["account_number"] = self._missing_field("account_number")

        # 2. Units (m³)
        units_match = re.search(
            r"(?:UNITS|CONSUMPTION|USAGE|M3|M³)[:.|\s-]*([0-9]+(?:\.[0-9]+)?)",
            text,
            re.IGNORECASE,
        )
        if units_match:
            u_raw = units_match.group(1)
            u_val = parse_float_safely(u_raw)
            token = self._find_token_for_text(tokens, u_raw)
            fields["units_m3"] = self._create_field(
                name="units_m3",
                raw=u_raw,
                norm=u_val,
                unit="m3",
                token=token,
            )
        else:
            fields["units_m3"] = self._missing_field("units_m3", unit="m3")

        # 3. Total Amount
        amt_match = re.search(
            r"(?:TOTAL\s*(?:AMOUNT\s*)?PAYABLE|TOTAL\s*AMOUNT|NET\s*AMOUNT|AMOUNT\s*DUE|RS\.?|LKR)"
            r"[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            amt_raw = amt_match.group(1)
            amt_val = parse_float_safely(_strip_commas(amt_raw))
            token = self._find_token_for_text(tokens, _strip_commas(amt_raw))
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=amt_raw,
                norm=amt_val,
                unit="LKR",
                token=token,
            )
        else:
            fields["total_amount"] = self._missing_field("total_amount", unit="LKR")

        return fields

    # ------------------------------------------------------------------
    # Fuel / LPG receipt
    # ------------------------------------------------------------------

    def _parse_fuel_receipt(
        self,
        tokens: List[ExtractedField],
        text: str,
        doc_type: DocumentType,
    ) -> Dict[str, ExtractedField]:
        """Extract quantity, fuel type, and total amount for LPG and generator fuel."""
        fields: Dict[str, ExtractedField] = {}
        is_lpg = (doc_type == DocumentType.LPG_RECEIPT)

        # 1. Quantity
        if is_lpg:
            qty_match = re.search(
                r"\b(12\.5|37\.5|2\.3|5\.0|50\.0|[0-9]+(?:\.[0-9]+)?)\s*(?:KG|KGS|KILOGRAMS)\b",
                text,
                re.IGNORECASE,
            )
            unit_label = "kg"
        else:
            qty_match = re.search(
                r"(?:QTY|VOLUME|LITRES|LITERS|LTRS?)[:.|\s-]*([0-9]+(?:\.[0-9]+)?)",
                text,
                re.IGNORECASE,
            )
            unit_label = "L"

        if qty_match:
            qty_raw = qty_match.group(1)
            qty_val = parse_float_safely(qty_raw)
            token = self._find_token_for_text(tokens, qty_raw)
            fields["quantity_kg_or_liters"] = self._create_field(
                name="quantity_kg_or_liters",
                raw=qty_raw,
                norm=qty_val,
                unit=unit_label,
                token=token,
            )
        else:
            fields["quantity_kg_or_liters"] = self._missing_field("quantity_kg_or_liters", unit=unit_label)

        # 2. Total Amount
        amt_match = re.search(
            r"(?:TOTAL|AMOUNT|NET\s*TOTAL|CASH|RS\.?|LKR)[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            amt_raw = amt_match.group(1)
            amt_val = parse_float_safely(_strip_commas(amt_raw))
            token = self._find_token_for_text(tokens, _strip_commas(amt_raw))
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=amt_raw,
                norm=amt_val,
                unit="LKR",
                token=token,
            )
        else:
            fields["total_amount"] = self._missing_field("total_amount", unit="LKR")

        # 3. Fuel type classification
        if is_lpg:
            fields["fuel_type"] = self._create_constant_field("fuel_type", "LPG", "LPG")
        else:
            fuel_type = "Diesel" if "DIESEL" in text.upper() else "Petrol"
            fields["fuel_type"] = self._create_constant_field("fuel_type", fuel_type, fuel_type)

        return fields

    # ------------------------------------------------------------------
    # Generic / unclassified fallback
    # ------------------------------------------------------------------

    def _parse_generic_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Generic fallback for unclassified hospitality invoices."""
        fields: Dict[str, ExtractedField] = {}
        amt_match = re.search(
            r"(?:TOTAL|AMOUNT|RS\.?|LKR)[:.|\s-]*([0-9,]+(?:\.[0-9]{1,2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            raw = amt_match.group(1)
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=raw,
                norm=parse_float_safely(_strip_commas(raw)),
                unit="LKR",
                token=self._find_token_for_text(tokens, _strip_commas(raw)),
            )
        else:
            fields["total_amount"] = self._missing_field("total_amount", unit="LKR")
        return fields

    # ------------------------------------------------------------------
    # Token-linkage helpers
    # ------------------------------------------------------------------

    def _find_token_for_text(
        self,
        tokens: List[ExtractedField],
        target_str: str,
    ) -> Optional[ExtractedField]:
        """Locate the OCR token containing the extracted string (for bbox & confidence)."""
        clean_target = clean_number_string(target_str)
        for token in tokens:
            if clean_target and clean_target in clean_number_string(token.raw_text):
                return token
        return None

    def _create_field(
        self,
        name: str,
        raw: str,
        norm: Any,
        unit: Optional[str],
        token: Optional[ExtractedField],
        is_numeric: bool = True,
        default_conf: float = 0.85,
    ) -> ExtractedField:
        """Construct ExtractedField with linked confidence and review flags."""
        conf = token.confidence if token else default_conf
        is_hw = token.is_handwritten if token else False
        engine = token.engine if token else "parsed"
        bbox = token.bounding_box if token else None
        char_confs = token.char_confidences if token else []

        is_low = (conf < self.confidence_threshold) or (norm is None and is_numeric)

        return ExtractedField(
            field_name=name,
            raw_text=raw,
            normalized_value=norm,
            unit=unit,
            confidence=round(conf, 4),
            is_low_confidence=is_low,
            needs_review=is_low,
            is_handwritten=is_hw,
            engine=engine,
            bounding_box=bbox,
            char_confidences=char_confs,
        )

    def _create_constant_field(self, name: str, raw: str, norm: Any) -> ExtractedField:
        return ExtractedField(
            field_name=name,
            raw_text=raw,
            normalized_value=norm,
            confidence=0.98,
            is_low_confidence=False,
            needs_review=False,
            engine="rule_classifier",
        )

    def _missing_field(self, name: str, unit: Optional[str] = None) -> ExtractedField:
        return ExtractedField(
            field_name=name,
            raw_text="",
            normalized_value=None,
            unit=unit,
            confidence=0.0,
            is_low_confidence=True,
            needs_review=True,
            engine="missing",
        )


# ---------------------------------------------------------------------------
# Global singleton instance
# ---------------------------------------------------------------------------
field_parser = BillFieldParser()
