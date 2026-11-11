"""Pydantic schemas for Project Arrow OCR service.

Covers draft extraction results, confidence scores, and human confirmation (HITL)
workflows for Sri Lankan hospitality utility bills and meter readings.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExtractionStatus(str, Enum):
    """Lifecycle status of an OCR extraction job."""

    PENDING = "pending"
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    FLAGGED_FOR_REVIEW = "flagged_for_review"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    FAILED = "failed"


class ConfirmationAction(str, Enum):
    """Action taken by the human reviewer during confirmation."""

    APPROVED = "approved"  # Accepted OCR draft as-is
    AMENDED = "amended"    # Corrected one or more values
    REJECTED = "rejected"  # Rejected document (e.g., illegible, duplicate, wrong document)


class DocumentType(str, Enum):
    """Recognized bill and receipt categories for Project Arrow."""

    ELECTRICITY_BILL = "electricity_bill"  # CEB / LECO bills
    LPG_RECEIPT = "lpg_receipt"            # Litro / Laugfs gas bills
    GENERATOR_FUEL = "generator_fuel"      # Diesel slips
    WATER_BILL = "water_bill"
    METER_READING = "meter_reading"        # Direct meter dial photo
    GENERAL_EXPENSE = "general_expense"    # Scope 3 receipts (laundry, food, waste)


class BoundingBox(BaseModel):
    """Bounding box coordinates for detected text regions."""

    x_min: float = Field(..., description="Top-left X coordinate (pixels or normalized 0.0-1.0)")
    y_min: float = Field(..., description="Top-left Y coordinate (pixels or normalized 0.0-1.0)")
    x_max: float = Field(..., description="Bottom-right X coordinate (pixels or normalized 0.0-1.0)")
    y_max: float = Field(..., description="Bottom-right Y coordinate (pixels or normalized 0.0-1.0)")
    polygon: Optional[List[List[float]]] = Field(
        default=None,
        description="Optional 4-point polygon [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] for skewed text.",
    )


class CharacterConfidence(BaseModel):
    """Character or digit level confidence for highlighting doubtful digits in the UI."""

    char: str = Field(..., description="Individual character or digit.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0.")
    is_low_confidence: bool = Field(
        default=False,
        description="Flagged true if confidence falls below low confidence threshold.",
    )


class OCRToken(BaseModel):
    """Raw recognized token/word from OCR engine."""

    text: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    bounding_box: Optional[BoundingBox] = None
    engine: str = Field(default="paddleocr", description="Engine used (paddleocr or trocr)")


class ImageQualityAssessment(BaseModel):
    """Assessment results from image preprocessing."""

    is_blurry: bool = False
    blur_score: float = Field(default=0.0, description="Laplacian variance score")
    has_glare: bool = False
    skew_angle: float = Field(default=0.0, description="Detected rotation skew angle in degrees")
    warnings: List[str] = Field(default_factory=list)


class ExtractedField(BaseModel):
    """A semantic field extracted from the bill (e.g. units_consumed, total_amount)."""

    field_name: str = Field(..., description="Standardized field name, e.g. 'units_consumed', 'amount'")
    raw_text: str = Field(..., description="Raw string read by the OCR engine.")
    normalized_value: Optional[Any] = Field(
        default=None,
        description="Parsed numerical or date value (e.g. 1250.50 float, YYYY-MM-DD date).",
    )
    unit: Optional[str] = Field(default=None, description="Physical unit if applicable (e.g. 'kWh', 'kg', 'L', 'LKR').")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score for this field.")
    is_low_confidence: bool = Field(
        default=False,
        description="True if field confidence is below threshold; requires human confirmation.",
    )
    needs_review: bool = Field(
        default=False,
        description="Flag indicating human review needed (alias/synonym for is_low_confidence).",
    )
    is_handwritten: Optional[bool] = Field(
        default=None,
        description="Whether this field was recognized as handwritten (e.g., via TrOCR).",
    )
    engine: str = Field(default="ensemble", description="Engine responsible (paddleocr, trocr, or ensemble).")
    bounding_box: Optional[BoundingBox] = None
    char_confidences: List[CharacterConfidence] = Field(
        default_factory=list,
        description="Per-digit confidence breakdown to highlight dubious digits in UI.",
    )


class DraftExtractionResult(BaseModel):
    """Draft extraction response returned to R3 Representative for review.

    No unconfirmed OCR value enters the reporting database.
    """

    document_id: str = Field(..., description="Unique document / bill identifier or SHA-256 hash.")
    status: ExtractionStatus = Field(
        default=ExtractionStatus.PENDING_REVIEW,
        description="Current extraction status.",
    )
    document_type: DocumentType = Field(
        default=DocumentType.ELECTRICITY_BILL,
        description="Detected or provided bill type.",
    )
    overall_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Aggregated confidence score across all extracted fields.",
    )
    fields: Dict[str, ExtractedField] = Field(
        default_factory=dict,
        description="Dictionary of extracted fields keyed by field name.",
    )
    raw_full_text: Optional[str] = Field(default=None, description="Full raw OCR text transcript.")
    requires_human_confirmation: bool = Field(
        default=True,
        description="True if any required field is low confidence or by policy (all bills require confirmation).",
    )
    low_confidence_fields: List[str] = Field(
        default_factory=list,
        description="List of field names that fell below the confidence threshold.",
    )
    quality_assessment: Optional[ImageQualityAssessment] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConfirmedFieldUpdate(BaseModel):
    """Human correction or confirmation for a single extracted field."""

    confirmed_value: Any = Field(..., description="Final confirmed value after human verification.")
    is_amended: bool = Field(
        default=False,
        description="True if the user edited or corrected the OCR suggested value.",
    )
    notes: Optional[str] = Field(default=None, description="Optional note or explanation for the correction.")


class HumanConfirmationRequest(BaseModel):
    """Payload sent by the front-office staff (R3) to confirm or correct draft OCR values."""

    document_id: str = Field(..., description="ID of the draft extraction being confirmed.")
    action: ConfirmationAction = Field(
        default=ConfirmationAction.APPROVED,
        description="Confirmation action (approved, amended, rejected).",
    )
    confirmed_fields: Dict[str, ConfirmedFieldUpdate] = Field(
        ...,
        description="Key-value mapping of field names to confirmed values.",
    )
    reviewer_id: Optional[str] = Field(
        default=None,
        description="User ID of the representative / verifier who confirmed the values.",
    )
    rejection_reason: Optional[str] = Field(
        default=None,
        description="Reason if the bill was rejected (e.g. unreadable, duplicate).",
    )
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HumanConfirmationResponse(BaseModel):
    """Response returned once human confirmation is successfully committed."""

    document_id: str
    status: ExtractionStatus
    is_verified: bool = Field(
        ...,
        description="Indicates the values are confirmed and safe for GHG Protocol calculations.",
    )
    verified_fields: Dict[str, Any] = Field(
        ...,
        description="Final sanitized field values accepted into the reporting pipeline.",
    )
    confirmed_by: Optional[str] = None
    confirmed_at: datetime
    message: str = "Draft successfully confirmed and marked as verified."
