"""Field parser for Sri Lankan utility bills and hospitality fuel/receipt records.

Extracts structured domain fields from OCR tokens and transcripts:
- CEB / LECO electricity bills (units_kwh, account_number, billing_period, total_amount)
- NWSDB water bills (units_m3, account_number, total_amount)
- LPG / Fuel receipts (quantity_kg_or_liters, total_amount, fuel_type)
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from app.config import settings
from app.extraction.validators import (
    parse_float_safely,
    run_document_validations,
)
from app.schemas.ocr import (
    BoundingBox,
    CharacterConfidence,
    DocumentType,
    ExtractedField,
    OCRToken,
)


def detect_document_type(text: str) -> DocumentType:
    """Classify bill type using Sri Lankan utility provider keywords."""
    text_upper = text.upper()

    if any(k in text_upper for k in ("CEB", "LECO", "ELECTRICITY", "CEYLON ELECTRICITY", "KWH", "K.W.H")):
        return DocumentType.ELECTRICITY_BILL

    if any(k in text_upper for k in ("NWSDB", "WATER SUPPLY", "DRAINAGE BOARD", "WATER BOARD", "M3", "M³")):
        return DocumentType.WATER_BILL

    if any(k in text_upper for k in ("LITRO", "LAUGFS", "GAS", "LPG", "CYLINDER")):
        return DocumentType.LPG_RECEIPT

    if any(k in text_upper for k in ("DIESEL", "PETROL", "CEYPETCO", "LIOC", "SINOPEC", "FUEL", "OCTANE")):
        return DocumentType.GENERATOR_FUEL

    if any(k in text_upper for k in ("METER", "DIAL", "READING")):
        return DocumentType.METER_READING

    return DocumentType.ELECTRICITY_BILL  # Default to electricity as primary MRV scope


class BillFieldParser:
    """Parser extracting semantic fields from recognized text and bounding boxes."""

    def __init__(self, confidence_threshold: float = None):
        self.confidence_threshold = (
            confidence_threshold if confidence_threshold is not None else settings.CONFIDENCE_THRESHOLD
        )

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
            (detected_document_type, dict_of_parsed_fields)
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
                # Penalize confidence slightly if validation fails
                if err.is_critical:
                    target_field.confidence = min(target_field.confidence, 0.40)

        return doc_type, parsed

    def _parse_electricity_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Extract units_kwh, account_number, billing_period, total_amount for CEB/LECO."""
        fields: Dict[str, ExtractedField] = {}

        # 1. Account Number (10 digits for CEB / LECO)
        acc_match = re.search(r"(?:A/C|ACC(?:OUNT)?|CUSTOMER)?\s*(?:NO|NUMBER)?[:.\s-]*([0-9]{10})\b", text, re.IGNORECASE)
        if not acc_match:
            # Fallback to any standalone 10-digit number
            acc_match = re.search(r"\b([0-9]{10})\b", text)

        if acc_match:
            acc_val = acc_match.group(1)
            matching_token = self._find_token_for_text(tokens, acc_val)
            fields["account_number"] = self._create_field(
                name="account_number",
                raw=acc_val,
                norm=acc_val,
                unit=None,
                token=matching_token,
                is_numeric=False,
            )
        else:
            fields["account_number"] = self._missing_field("account_number")

        # 2. Units Consumed (kWh)
        units_match = re.search(
            r"(?:UNITS|CONSUMPTION|USAGE|KWH|DIFF(?:ERENCE)?|TOTAL\s*UNITS)[:.\s-]*([0-9]+(?:\.[0-9]+)?)",
            text,
            re.IGNORECASE,
        )
        if not units_match:
            # Look for number followed by kWh or Units
            units_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:KWH|UNITS)\b", text, re.IGNORECASE)

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

        # 3. Total Amount (LKR)
        amt_match = re.search(
            r"(?:TOTAL\s*PAYABLE|TOTAL\s*AMOUNT|NET\s*AMOUNT|AMOUNT\s*DUE|CURRENT\s*CHARGES|RS\.?|LKR)[:.\s-]*([0-9,]+(?:\.[0-9]{2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            amt_raw = amt_match.group(1)
            amt_val = parse_float_safely(amt_raw)
            token = self._find_token_for_text(tokens, amt_raw)
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=amt_raw,
                norm=amt_val,
                unit="LKR",
                token=token,
            )
        else:
            # Fallback: find highest currency-like number
            candidates = re.findall(r"\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))\b", text)
            if candidates:
                best_raw = max(candidates, key=lambda c: parse_float_safely(c) or 0.0)
                best_val = parse_float_safely(best_raw)
                token = self._find_token_for_text(tokens, best_raw)
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

        # 4. Billing Period
        bp_match = re.search(
            r"(?:PERIOD|BILLING\s*PERIOD|BILL\s*MONTH|DATE)[:.\s-]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2}(?:\s*TO\s*[0-9]{4}[-/][0-9]{2}[-/][0-9]{2})?|[A-Z]{3,9}\s*20[0-9]{2})",
            text,
            re.IGNORECASE,
        )
        if bp_match:
            bp_raw = bp_match.group(1)
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

    def _parse_water_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Extract units_m3, account_number, total_amount for NWSDB."""
        fields: Dict[str, ExtractedField] = {}

        # 1. Account Number
        acc_match = re.search(r"(?:A/C|ACC(?:OUNT)?|CUSTOMER)?\s*(?:NO|NUMBER)?[:.\s-]*([0-9\/-]{8,14})\b", text, re.IGNORECASE)
        if acc_match:
            acc_raw = acc_match.group(1)
            token = self._find_token_for_text(tokens, acc_raw)
            fields["account_number"] = self._create_field(
                name="account_number",
                raw=acc_raw,
                norm=acc_raw,
                unit=None,
                token=token,
                is_numeric=False,
            )
        else:
            fields["account_number"] = self._missing_field("account_number")

        # 2. Units (m3)
        units_match = re.search(
            r"(?:UNITS|CONSUMPTION|USAGE|M3|M³)[:.\s-]*([0-9]+(?:\.[0-9]+)?)",
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
            r"(?:TOTAL\s*PAYABLE|TOTAL\s*AMOUNT|NET\s*AMOUNT|AMOUNT\s*DUE|RS\.?|LKR)[:.\s-]*([0-9,]+(?:\.[0-9]{2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            amt_raw = amt_match.group(1)
            amt_val = parse_float_safely(amt_raw)
            token = self._find_token_for_text(tokens, amt_raw)
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
            # Check cylinder sizes: 12.5 kg, 37.5 kg, etc.
            qty_match = re.search(r"\b(12\.5|37\.5|2\.3|5\.0|50\.0|[0-9]+(?:\.[0-9]+)?)\s*(?:KG|KGS|KILOGRAMS)\b", text, re.IGNORECASE)
            unit_label = "kg"
        else:
            # Check liters
            qty_match = re.search(r"(?:QTY|VOLUME|LITRES|LITERS|LTRS?)[:.\s-]*([0-9]+(?:\.[0-9]+)?)", text, re.IGNORECASE)
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
            r"(?:TOTAL|AMOUNT|NET\s*TOTAL|CASH|RS\.?|LKR)[:.\s-]*([0-9,]+(?:\.[0-9]{2})?)",
            text,
            re.IGNORECASE,
        )
        if amt_match:
            amt_raw = amt_match.group(1)
            amt_val = parse_float_safely(amt_raw)
            token = self._find_token_for_text(tokens, amt_raw)
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=amt_raw,
                norm=amt_val,
                unit="LKR",
                token=token,
            )
        else:
            fields["total_amount"] = self._missing_field("total_amount", unit="LKR")

        # 3. Fuel Type classification
        if is_lpg:
            fields["fuel_type"] = self._create_constant_field("fuel_type", "LPG", "LPG")
        else:
            fuel_type = "Diesel" if "DIESEL" in text.upper() else "Petrol"
            fields["fuel_type"] = self._create_constant_field("fuel_type", fuel_type, fuel_type)

        return fields

    def _parse_generic_bill(
        self,
        tokens: List[ExtractedField],
        text: str,
    ) -> Dict[str, ExtractedField]:
        """Generic fallback for unclassified hospitality invoices."""
        fields: Dict[str, ExtractedField] = {}
        amt_match = re.search(r"(?:TOTAL|AMOUNT|RS\.?|LKR)[:.\s-]*([0-9,]+(?:\.[0-9]{2})?)", text, re.IGNORECASE)
        if amt_match:
            raw = amt_match.group(1)
            fields["total_amount"] = self._create_field(
                name="total_amount",
                raw=raw,
                norm=parse_float_safely(raw),
                unit="LKR",
                token=self._find_token_for_text(tokens, raw),
            )
        else:
            fields["total_amount"] = self._missing_field("total_amount", unit="LKR")
        return fields

    def _find_token_for_text(
        self,
        tokens: List[ExtractedField],
        target_str: str,
    ) -> Optional[ExtractedField]:
        """Locate the OCR token containing the extracted string to retrieve bbox & confidence."""
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


# Global singleton instance
field_parser = BillFieldParser()
