"""OCR engine integrations (PaddleOCR for printed text, TrOCR for handwritten text)."""

from .paddle_engine import PaddleOCREngine, paddle_engine
from .trocr_engine import TrOCREngine, trocr_engine
from .router import DualEngineRouter, ocr_router, crop_bounding_box, is_suspected_handwriting

__all__ = [
    "PaddleOCREngine",
    "paddle_engine",
    "TrOCREngine",
    "trocr_engine",
    "DualEngineRouter",
    "ocr_router",
    "crop_bounding_box",
    "is_suspected_handwriting",
]
