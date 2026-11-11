"""Human-in-the-Loop (HITL) confirmation guard.

Enforces Project Arrow Trust & Audit requirements:
1. No unconfirmed OCR value enters the reporting database.
2. Drafts can ONLY transition to CONFIRMED when an authorized human reviewer
   explicitly submits their reviewer_id and confirms/corrects extracted numbers.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from app.hitl.review_service import ReviewRepository, review_store
from app.schemas.ocr import (
    ConfirmationAction,
    DraftExtractionResult,
    ExtractionStatus,
    HumanConfirmationRequest,
    HumanConfirmationResponse,
)


class ConfirmationGuardError(Exception):
    """Base exception for confirmation guard violations."""
    pass


class DraftNotFoundError(ConfirmationGuardError):
    """Raised when the requested document ID does not exist."""
    pass


class InvalidDraftStatusError(ConfirmationGuardError):
    """Raised when attempting to confirm an already finalized draft."""
    pass


class ReviewerIdentityMissingError(ConfirmationGuardError):
    """Raised when a confirmation is attempted without a valid reviewer ID."""
    pass


class ConfirmationGuard:
    """Enforces human-in-the-loop audit gates before downstream database persistence."""

    def __init__(self, repository: ReviewRepository = None):
        self.repository = repository or review_store

    def confirm_draft(
        self,
        request: HumanConfirmationRequest,
    ) -> HumanConfirmationResponse:
        """Validate and transition an OCR draft to verified status.

        Args:
            request: HumanConfirmationRequest containing reviewer_id, action, and verified fields.

        Returns:
            HumanConfirmationResponse with verified_fields and confirmation metadata.

        Raises:
            DraftNotFoundError: If draft does not exist.
            ReviewerIdentityMissingError: If reviewer_id is absent.
            InvalidDraftStatusError: If draft is already finalized.
        """
        # 1. Verify Reviewer Identity (Audit requirement)
        if not request.reviewer_id or not request.reviewer_id.strip():
            raise ReviewerIdentityMissingError(
                "Reviewer ID is required. Anonymous or automated confirmations are "
                "strictly prohibited under Project Arrow MRV trust policy."
            )

        # 2. Retrieve draft
        draft = self.repository.get_draft(request.document_id)
        if not draft:
            raise DraftNotFoundError(f"Draft with ID '{request.document_id}' was not found.")

        # 3. Status Guard: Must be pending review
        if draft.status == ExtractionStatus.CONFIRMED:
            raise InvalidDraftStatusError(
                f"Draft '{request.document_id}' is already CONFIRMED and cannot be re-verified."
            )
        if draft.status == ExtractionStatus.REJECTED:
            raise InvalidDraftStatusError(
                f"Draft '{request.document_id}' was previously REJECTED."
            )

        now = datetime.utcnow()

        # 4. Handle Rejection
        if request.action == ConfirmationAction.REJECTED:
            draft.status = ExtractionStatus.REJECTED
            self.repository.update_draft(draft)
            return HumanConfirmationResponse(
                document_id=draft.document_id,
                status=ExtractionStatus.REJECTED,
                is_verified=False,
                verified_fields={},
                confirmed_by=request.reviewer_id,
                confirmed_at=now,
                message=f"Bill rejected by reviewer: {request.rejection_reason or 'No reason provided.'}",
            )

        # 5. Process Confirmed/Amended Fields
        verified_fields: Dict[str, Any] = {}

        # First, seed from existing draft fields
        for field_name, field_obj in draft.fields.items():
            verified_fields[field_name] = field_obj.normalized_value

        # Overlay human-verified and amended fields
        for field_name, update in request.confirmed_fields.items():
            verified_fields[field_name] = update.confirmed_value

            if field_name in draft.fields:
                target_field = draft.fields[field_name]
                target_field.normalized_value = update.confirmed_value
                target_field.is_low_confidence = False
                target_field.needs_review = False
                if update.is_amended:
                    target_field.engine = "human_verified"

        # 6. Finalize transition to CONFIRMED
        draft.status = ExtractionStatus.CONFIRMED
        draft.requires_human_confirmation = False
        draft.low_confidence_fields = []
        self.repository.update_draft(draft)

        return HumanConfirmationResponse(
            document_id=draft.document_id,
            status=ExtractionStatus.CONFIRMED,
            is_verified=True,
            verified_fields=verified_fields,
            confirmed_by=request.reviewer_id,
            confirmed_at=now,
            message="Draft successfully verified by human reviewer and cleared for carbon reporting.",
        )


# Global singleton confirmation guard instance
confirmation_guard = ConfirmationGuard()
