"""OCR Extraction endpoint accepting bill image uploads and producing review drafts."""

import hashlib
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.config import settings
from app.extraction.field_parser import field_parser
from app.hitl.review_service import review_store
from app.preprocessing.pipeline import default_pipeline
from app.engines.router import ocr_router
from app.schemas.ocr import (
    DocumentType,
    DraftExtractionResult,
    ExtractionStatus,
)

router = APIRouter(prefix="/ocr", tags=["OCR Extraction"])


@router.post(
    "/extract",
    response_model=DraftExtractionResult,
    status_code=status.HTTP_201_CREATED,
    summary="Extract text & fields from a bill image",
    description="Uploads a bill image, performs quality checks, dual OCR (PaddleOCR + TrOCR), "
                "and parses domain fields into a PENDING_REVIEW draft.",
)
async def extract_bill(
    file: UploadFile = File(..., description="Utility bill image (JPEG, PNG, WebP, etc.)"),
    document_type: Optional[str] = Form(
        None,
        description="Optional document type hint (e.g. electricity_bill, water_bill, lpg_receipt)",
    ),
) -> DraftExtractionResult:
    # 1. Validate file extension
    filename = file.filename or "uploaded_bill.jpg"
    extension = filename.split(".")[-1].lower() if "." in filename else ""
    if extension not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{extension}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    # 2. Read image bytes
    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size exceeds maximum allowed limit of {settings.MAX_IMAGE_SIZE_MB}MB.",
        )

    # 3. Compute SHA-256 evidence fingerprint
    evidence_fingerprint = hashlib.sha256(contents).hexdigest()

    # 4. Image Preprocessing Pipeline (de-skew, CLAHE, quality assessment)
    try:
        preprocessed = default_pipeline.process(contents)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to process image: {str(exc)}",
        )

    # 5. Dual OCR Engine Routing
    try:
        extracted_tokens = ocr_router.route_document(preprocessed.enhanced_image)
    except Exception as exc:
        # If engines fail (e.g. missing weights in lightweight env), fail gracefully
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR engine inference error: {str(exc)}",
        )

    raw_text = "\n".join(t.raw_text for t in extracted_tokens if t.raw_text)

    # 6. Parse structured fields
    doc_type_enum: Optional[DocumentType] = None
    if document_type:
        try:
            doc_type_enum = DocumentType(document_type.lower())
        except ValueError:
            pass  # Fall back to auto-detection

    detected_type, fields = field_parser.parse(
        extracted_tokens,
        raw_text=raw_text,
        doc_type_hint=doc_type_enum,
    )

    # 7. Aggregate confidence metrics
    field_confidences = [f.confidence for f in fields.values()]
    overall_confidence = (
        round(sum(field_confidences) / len(field_confidences), 4)
        if field_confidences
        else 0.0
    )

    low_conf_fields = [
        name for name, f in fields.items() if f.is_low_confidence or f.needs_review
    ]

    # 8. Create draft in PENDING_REVIEW state
    draft = DraftExtractionResult(
        document_id=evidence_fingerprint,
        status=ExtractionStatus.PENDING_REVIEW,
        document_type=detected_type,
        overall_confidence=overall_confidence,
        fields=fields,
        raw_full_text=raw_text,
        requires_human_confirmation=True,  # Mandatory under Project Arrow policy
        low_confidence_fields=low_conf_fields,
        quality_assessment=preprocessed.quality,
    )

    # 9. Store in HITL review repository
    review_store.save_draft(draft)

    return draft


@router.get(
    "/drafts/{draft_id}",
    response_model=DraftExtractionResult,
    summary="Get pending extraction draft",
)
async def get_draft(draft_id: str) -> DraftExtractionResult:
    """Retrieve an existing OCR draft for frontend review and confirmation."""
    draft = review_store.get_draft(draft_id)
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Draft with ID '{draft_id}' not found.",
        )
    return draft
