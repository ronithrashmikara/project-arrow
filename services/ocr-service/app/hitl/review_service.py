"""In-memory draft extraction storage and HITL review repository.

Maintains bills in PENDING_REVIEW state. Architecture is structured
with an interface pattern so it can be swapped for a PostgreSQL repository.
"""

from datetime import datetime
from typing import Dict, List, Optional
import uuid

from app.schemas.ocr import (
    DraftExtractionResult,
    ExtractionStatus,
)


class ReviewRepository:
    """In-memory repository for OCR drafts awaiting human confirmation."""

    def __init__(self):
        self._store: Dict[str, DraftExtractionResult] = {}

    def save_draft(self, draft: DraftExtractionResult) -> DraftExtractionResult:
        """Save a new draft extraction result."""
        # Ensure initial status is strictly PENDING_REVIEW
        draft.status = ExtractionStatus.PENDING_REVIEW
        self._store[draft.document_id] = draft
        return draft

    def get_draft(self, document_id: str) -> Optional[DraftExtractionResult]:
        """Retrieve draft by document ID."""
        return self._store.get(document_id)

    def list_drafts(
        self,
        status: Optional[ExtractionStatus] = None,
        limit: int = 50,
    ) -> List[DraftExtractionResult]:
        """List drafts filtered by status."""
        items = list(self._store.values())
        if status:
            items = [d for d in items if d.status == status]
        return sorted(items, key=lambda d: d.created_at, reverse=True)[:limit]

    def update_draft(self, draft: DraftExtractionResult) -> DraftExtractionResult:
        """Update an existing draft record."""
        self._store[draft.document_id] = draft
        return draft

    def delete_draft(self, document_id: str) -> bool:
        """Remove a draft record."""
        if document_id in self._store:
            del self._store[document_id]
            return True
        return False

    def clear(self) -> None:
        """Clear all in-memory records (useful for testing)."""
        self._store.clear()


# Global singleton review repository instance
review_store = ReviewRepository()
