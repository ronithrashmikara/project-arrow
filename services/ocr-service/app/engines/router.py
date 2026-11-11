"""OCR Engine Router coordinating PaddleOCR and TrOCR.

Routes detected text regions:
1. High-confidence printed text is handled by PaddleOCR.
2. Low-confidence or suspected handwritten regions are routed to TrOCR for refinement.
3. Produces unified ExtractedField objects with confidence scores and needs_review flags.
"""

from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

try:
    from PIL import Image
except ImportError:
    Image = None

from app.config import settings
from app.engines.paddle_engine import PaddleOCREngine, paddle_engine
from app.engines.trocr_engine import TrOCREngine, trocr_engine
from app.schemas.ocr import (
    BoundingBox,
    CharacterConfidence,
    ExtractedField,
    OCRToken,
)


def crop_bounding_box(
    image: np.ndarray,
    bbox: BoundingBox,
    padding: int = 4,
) -> np.ndarray:
    """Crop region from image with padding to avoid truncating stroke ascenders/descenders."""
    h, w = image.shape[:2]

    x1 = max(0, int(np.floor(bbox.x_min)) - padding)
    y1 = max(0, int(np.floor(bbox.y_min)) - padding)
    x2 = min(w, int(np.ceil(bbox.x_max)) + padding)
    y2 = min(h, int(np.ceil(bbox.y_max)) + padding)

    if x2 <= x1 or y2 <= y1:
        # Return a 10x10 empty fallback crop if coordinates are invalid
        return np.zeros((10, 10, 3 if len(image.shape) == 3 else 1), dtype=image.dtype)

    return image[y1:y2, x1:x2].copy()


def is_suspected_handwriting(
    token: OCRToken,
    confidence_threshold: float,
) -> bool:
    """Heuristic to determine if a detected text box is likely handwritten.

    Criteria:
    1. PaddleOCR confidence is below confidence_threshold.
    2. Contains digit fragments, slashes, or symbols typical of handwritten dates/figures.
    3. Low aspect ratio boxes with low OCR confidence.
    """
    if token.confidence < confidence_threshold:
        return True

    text = token.text.strip()
    if not text:
        return True

    # Single or double character detections with borderline confidence often indicate handwritten notes
    if len(text) <= 3 and token.confidence < 0.90:
        return True

    return False


def build_char_confidences_from_token(
    text: str,
    base_confidence: float,
    threshold: float,
) -> List[CharacterConfidence]:
    """Generate per-character confidence scores for a token."""
    char_list: List[CharacterConfidence] = []
    for char in text:
        # Numerical digits are strictly flagged if not highly confident
        is_low = (base_confidence < threshold)
        char_list.append(
            CharacterConfidence(
                char=char,
                confidence=round(base_confidence, 4),
                is_low_confidence=is_low,
            )
        )
    return char_list


class DualEngineRouter:
    """Orchestrates PaddleOCR for layout/printed text and TrOCR for handwriting."""

    def __init__(
        self,
        paddle: PaddleOCREngine = None,
        trocr: TrOCREngine = None,
        confidence_threshold: float = None,
    ):
        self.paddle = paddle or paddle_engine
        self.trocr = trocr or trocr_engine
        self.confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else settings.CONFIDENCE_THRESHOLD
        )

    def route_document(
        self,
        image: np.ndarray,
        field_labels: Optional[Dict[int, str]] = None,
    ) -> List[ExtractedField]:
        """Perform dual-engine OCR across the full document image.

        1. PaddleOCR detects all text boxes and extracts initial predictions.
        2. Regions with low confidence or suspected handwriting are cropped and
           re-evaluated with TrOCR.
        3. Returns unified ExtractedField objects with needs_review flags.

        Args:
            image: Preprocessed or raw BGR numpy image array.
            field_labels: Optional mapping of detection index to semantic field name.

        Returns:
            List of ExtractedField items.
        """
        # Step 1: Detect and recognize with PaddleOCR
        tokens = self.paddle.detect_and_recognize(image)
        extracted_fields: List[ExtractedField] = []

        for idx, token in enumerate(tokens):
            field_name = (
                field_labels.get(idx)
                if field_labels and idx in field_labels
                else f"field_{idx + 1}"
            )

            # Step 2: Route evaluation
            needs_trocr_refinement = is_suspected_handwriting(
                token, self.confidence_threshold
            )

            if needs_trocr_refinement and token.bounding_box is not None:
                # Crop region and feed to TrOCR
                crop = crop_bounding_box(image, token.bounding_box)
                try:
                    trocr_text, trocr_conf, trocr_chars = self.trocr.recognize_crop(crop)
                except Exception:
                    # If TrOCR inference fails or model is unavailable, fall back cleanly
                    trocr_text, trocr_conf, trocr_chars = "", 0.0, []

                # Ensemble decision logic
                if trocr_text and (trocr_conf > token.confidence or token.confidence < 0.60):
                    chosen_text = trocr_text
                    chosen_conf = trocr_conf
                    chosen_engine = "trocr"
                    is_handwritten = True
                    char_confs = trocr_chars
                elif trocr_text and trocr_text == token.text:
                    # Both engines agreed on the text! Boost confidence
                    chosen_text = token.text
                    chosen_conf = min(1.0, max(token.confidence, trocr_conf) + 0.05)
                    chosen_engine = "ensemble"
                    is_handwritten = False
                    char_confs = build_char_confidences_from_token(
                        chosen_text, chosen_conf, self.confidence_threshold
                    )
                else:
                    # Keep PaddleOCR result
                    chosen_text = token.text
                    chosen_conf = token.confidence
                    chosen_engine = "paddleocr"
                    is_handwritten = False
                    char_confs = build_char_confidences_from_token(
                        chosen_text, chosen_conf, self.confidence_threshold
                    )
            else:
                # High-confidence printed text from PaddleOCR
                chosen_text = token.text
                chosen_conf = token.confidence
                chosen_engine = "paddleocr"
                is_handwritten = False
                char_confs = build_char_confidences_from_token(
                    chosen_text, chosen_conf, self.confidence_threshold
                )

            is_low = chosen_conf < self.confidence_threshold

            field = ExtractedField(
                field_name=field_name,
                raw_text=chosen_text,
                normalized_value=None,  # Downstream parser populates normalized value
                confidence=round(chosen_conf, 4),
                is_low_confidence=is_low,
                needs_review=is_low,
                is_handwritten=is_handwritten,
                engine=chosen_engine,
                bounding_box=token.bounding_box,
                char_confidences=char_confs,
            )
            extracted_fields.append(field)

        return extracted_fields

    def route_crop(
        self,
        crop_image: Union[np.ndarray, "Image.Image"],
        field_name: str = "cropped_field",
        force_handwriting: bool = False,
    ) -> ExtractedField:
        """Route a single isolated image crop (e.g. meter reading or handwriting slip).

        Args:
            crop_image: OpenCV BGR array or PIL Image.
            field_name: Semantic name for the field.
            force_handwriting: If True, prioritize TrOCR directly.

        Returns:
            ExtractedField instance with confidence and needs_review set.
        """
        if force_handwriting:
            text, conf, chars = self.trocr.recognize_crop(crop_image)
            is_low = conf < self.confidence_threshold
            return ExtractedField(
                field_name=field_name,
                raw_text=text,
                confidence=conf,
                is_low_confidence=is_low,
                needs_review=is_low,
                is_handwritten=True,
                engine="trocr",
                char_confidences=chars,
            )

        # Attempt PaddleOCR first
        p_text, p_conf = self.paddle.recognize_crop(crop_image)

        if p_conf < self.confidence_threshold or not p_text:
            # Low confidence on crop -> try TrOCR
            t_text, t_conf, t_chars = self.trocr.recognize_crop(crop_image)
            if t_conf > p_conf and t_text:
                is_low = t_conf < self.confidence_threshold
                return ExtractedField(
                    field_name=field_name,
                    raw_text=t_text,
                    confidence=t_conf,
                    is_low_confidence=is_low,
                    needs_review=is_low,
                    is_handwritten=True,
                    engine="trocr",
                    char_confidences=t_chars,
                )

        is_low = p_conf < self.confidence_threshold
        return ExtractedField(
            field_name=field_name,
            raw_text=p_text,
            confidence=p_conf,
            is_low_confidence=is_low,
            needs_review=is_low,
            is_handwritten=False,
            engine="paddleocr",
            char_confidences=build_char_confidences_from_token(
                p_text, p_conf, self.confidence_threshold
            ),
        )


# Global singleton router instance
ocr_router = DualEngineRouter()
