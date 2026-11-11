"""Human confirmation endpoint to finalize OCR drafts into verified reporting data."""

from fastapi import APIRouter, HTTPException, status

from app.hitl.confirmation_guard import (
    ConfirmationGuardError,
    DraftNotFoundError,
    InvalidDraftStatusError,
    ReviewerIdentityMissingError,
    confirmation_guard,
)
from app.schemas.ocr import (
    HumanConfirmationRequest,
    HumanConfirmationResponse,
)

router = APIRouter(prefix="/ocr", tags=["HITL Confirmation"])


@router.post(
    "/confirm/{draft_id}",
    response_model=HumanConfirmationResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm or amend an OCR draft",
    description="Enforces human-in-the-loop verification. Requires reviewer_id and "
                "field confirmation to transition status to CONFIRMED.",
)
async def confirm_draft(
    draft_id: str,
    request: HumanConfirmationRequest,
) -> HumanConfirmationResponse:
    # Ensure URL draft_id aligns with payload document_id
    if request.document_id != draft_id:
        request.document_id = draft_id

    try:
        response = confirmation_guard.confirm_draft(request)
        return response
    except DraftNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except ReviewerIdentityMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except InvalidDraftStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    except ConfirmationGuardError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
