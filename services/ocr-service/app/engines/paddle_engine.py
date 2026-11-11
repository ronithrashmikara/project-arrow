"""PaddleOCR engine wrapper for printed text and bounding box detection.

Provides text detection (DBNet) and text recognition (CRNN/SVTR) with
lazy initialization so application startup remains fast and lightweight.

Compatibility notes
-------------------
* Targets **PaddleOCR 2.7.x** (stable Windows CPU build).
  - Constructor: ``PaddleOCR(use_angle_cls, lang, use_gpu, show_log)``
  - Inference:  ``ocr.ocr(img, cls=True)``  → ``[[ [box, (text, score)], … ]]``
  - Crop-only:  ``ocr.ocr(img, det=False, cls=False)`` → ``[[ (text, score) ]]``

* PaddleOCR 3.x removed ``use_gpu``, ``use_angle_cls``, and ``show_log`` from
  the constructor and replaced ``.ocr()`` with ``.predict()``.  If the import
  of a v3 build is detected at runtime the engine falls back to the v3 path
  automatically (see ``_get_ocr_instance`` / ``_parse_v3_result``).
"""

from __future__ import annotations

import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"


from typing import Any, List, Optional, Tuple, Union
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore

from app.config import settings
from app.schemas.ocr import BoundingBox, CharacterConfidence, OCRToken


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_bgr_array(image: Any) -> np.ndarray:
    """Convert PIL Image or any array-like to a uint8 BGR numpy array."""
    if Image is not None and isinstance(image, Image.Image):
        rgb = np.array(image)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR) if cv2 else rgb
    return image  # assume already a numpy BGR array


def _detect_paddleocr_api_version() -> int:
    """Return 2 for PaddleOCR 2.x API, 3 for 3.x API.

    We use the presence of ``paddleocr.__version__`` and its major digit.
    Falls back to 2 if anything goes wrong.
    """
    try:
        import paddleocr as _poc
        version_str: str = getattr(_poc, "__version__", "2.0.0") or "2.0.0"
        major = int(version_str.split(".")[0])
        return major if major in (2, 3) else 2
    except Exception:
        return 2


# ---------------------------------------------------------------------------
# Main engine class
# ---------------------------------------------------------------------------

class PaddleOCREngine:
    """Wrapper for PaddleOCR engine supporting text detection and recognition.

    The instance is lazily initialised on the first call to
    ``detect_and_recognize`` or ``recognize_crop`` so that importing this
    module does not trigger the multi-second PaddleOCR cold-start.
    """

    def __init__(
        self,
        lang: str = None,
        use_angle_cls: bool = None,
        use_gpu: bool = False,
    ) -> None:
        self.lang = lang or settings.PADDLE_OCR_LANG
        self.use_angle_cls = (
            use_angle_cls
            if use_angle_cls is not None
            else settings.PADDLE_USE_ANGLE_CLS
        )
        self.use_gpu = use_gpu
        self._ocr: Optional[Any] = None
        self._api_version: Optional[int] = None  # Detected on first init

    # ------------------------------------------------------------------
    # Lazy initialisation
    # ------------------------------------------------------------------

    def _get_ocr_instance(self) -> Any:
        """Lazy-load and return the PaddleOCR instance.

        Detects the installed API version and constructs the instance with
        only the arguments that version accepts.
        """
        if self._ocr is not None:
            return self._ocr

        try:
            from paddleocr import PaddleOCR
        except ImportError as err:
            raise ImportError(
                "paddleocr is not installed. "
                "Run: pip install paddleocr==2.7.3 paddlepaddle==2.6.2"
            ) from err

        self._api_version = _detect_paddleocr_api_version()

        if self._api_version >= 3:
            # PaddleOCR 3.x: use_gpu / use_angle_cls / show_log removed.
            # Disable heavyweight optional components to minimise startup time.
            self._ocr = PaddleOCR(
                lang=self.lang,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        else:
            # PaddleOCR 2.x (stable target)
            self._ocr = PaddleOCR(
                use_angle_cls=self.use_angle_cls,
                lang=self.lang,
                use_gpu=self.use_gpu,
                show_log=False,
            )

        return self._ocr

    # ------------------------------------------------------------------
    # Result parsers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_v2_result(raw_results: Any) -> List[OCRToken]:
        """Parse PaddleOCR 2.x output into a list of OCRToken objects.

        v2 output shape: ``[[ [box_pts, (text, score)], … ]]``
        where ``box_pts`` is a list of four [x, y] points.
        """
        tokens: List[OCRToken] = []
        if not raw_results or raw_results[0] is None:
            return tokens

        for line in raw_results[0]:
            if not line or len(line) < 2:
                continue
            box_coords = line[0]  # 4-point polygon
            text_score = line[1]
            if not text_score or len(text_score) < 2:
                continue
            text, score = text_score[0], text_score[1]

            xs = [pt[0] for pt in box_coords]
            ys = [pt[1] for pt in box_coords]

            bbox = BoundingBox(
                x_min=float(min(xs)),
                y_min=float(min(ys)),
                x_max=float(max(xs)),
                y_max=float(max(ys)),
                polygon=[[float(pt[0]), float(pt[1])] for pt in box_coords],
            )
            tokens.append(OCRToken(
                text=str(text).strip(),
                confidence=round(float(score), 4),
                bounding_box=bbox,
                engine="paddleocr",
            ))

        return tokens

    @staticmethod
    def _parse_v3_result(raw_results: Any) -> List[OCRToken]:
        """Parse PaddleOCR 3.x predict() output into OCRToken list.

        v3 returns a list of result objects per image.  The result objects
        may expose their data via different attribute names depending on the
        exact sub-version; we probe the most common ones defensively.

        Known attribute names observed in PaddleOCR 3.x:
          - ``rec_texts`` / ``rec_scores``           (most common)
          - ``dt_boxes``                             (detection boxes)
          - JSON-serialisable via ``.__dict__``
        """
        tokens: List[OCRToken] = []
        if not raw_results:
            return tokens

        for page_result in raw_results:
            if page_result is None:
                continue

            # Strategy A: standard structured attributes (most 3.x builds)
            rec_texts = getattr(page_result, "rec_texts", None)
            rec_scores = getattr(page_result, "rec_scores", None)
            dt_boxes = getattr(page_result, "dt_boxes", None)

            if rec_texts is not None and rec_scores is not None:
                boxes_iter = dt_boxes if dt_boxes is not None else [None] * len(rec_texts)
                for text, score, box in zip(rec_texts, rec_scores, boxes_iter):
                    if not text:
                        continue
                    if box is not None:
                        xs = [pt[0] for pt in box]
                        ys = [pt[1] for pt in box]
                        bbox = BoundingBox(
                            x_min=float(min(xs)),
                            y_min=float(min(ys)),
                            x_max=float(max(xs)),
                            y_max=float(max(ys)),
                            polygon=[[float(pt[0]), float(pt[1])] for pt in box],
                        )
                    else:
                        bbox = None
                    tokens.append(OCRToken(
                        text=str(text).strip(),
                        confidence=round(float(score), 4),
                        bounding_box=bbox,
                        engine="paddleocr",
                    ))
                continue

            # Strategy B: dict-like (some 3.x variants expose __dict__ with 'boxes')
            result_dict: Optional[dict] = None
            if hasattr(page_result, "__dict__"):
                result_dict = page_result.__dict__
            elif isinstance(page_result, dict):
                result_dict = page_result

            if result_dict:
                boxes = result_dict.get("boxes") or result_dict.get("dt_boxes") or []
                texts = result_dict.get("rec_texts") or result_dict.get("texts") or []
                scores = result_dict.get("rec_scores") or result_dict.get("scores") or []
                for i, text in enumerate(texts):
                    score = scores[i] if i < len(scores) else 0.0
                    box = boxes[i] if i < len(boxes) else None
                    if not text:
                        continue
                    if box is not None:
                        xs = [pt[0] for pt in box]
                        ys = [pt[1] for pt in box]
                        bbox = BoundingBox(
                            x_min=float(min(xs)),
                            y_min=float(min(ys)),
                            x_max=float(max(xs)),
                            y_max=float(max(ys)),
                            polygon=[[float(pt[0]), float(pt[1])] for pt in box],
                        )
                    else:
                        bbox = None
                    tokens.append(OCRToken(
                        text=str(text).strip(),
                        confidence=round(float(score), 4),
                        bounding_box=bbox,
                        engine="paddleocr",
                    ))

        return tokens

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_and_recognize(
        self,
        image: Union[np.ndarray, "Image.Image"],
    ) -> List[OCRToken]:
        """Run text detection and recognition on a full document image.

        Args:
            image: OpenCV BGR numpy array or PIL Image.

        Returns:
            List of OCRToken instances with text, confidence, and bounding box.
        """
        ocr = self._get_ocr_instance()
        img_arr = _to_bgr_array(image)

        if self._api_version >= 3:
            raw_results = ocr.predict(img_arr)
            return self._parse_v3_result(raw_results)
        else:
            # PaddleOCR 2.x
            raw_results = ocr.ocr(img_arr, cls=self.use_angle_cls)
            return self._parse_v2_result(raw_results)

    def recognize_crop(
        self,
        crop_image: Union[np.ndarray, "Image.Image"],
    ) -> Tuple[str, float]:
        """Recognize text in an isolated cropped region (no detection step).

        Args:
            crop_image: Image crop array or PIL Image.

        Returns:
            ``(text, confidence)`` tuple.
        """
        ocr = self._get_ocr_instance()
        img_arr = _to_bgr_array(crop_image)

        if self._api_version >= 3:
            # v3 always runs the full pipeline; use predict() on the crop directly
            raw_results = ocr.predict(img_arr)
            tokens = self._parse_v3_result(raw_results)
            if not tokens:
                return "", 0.0
            # Return the highest-confidence result from the crop
            best = max(tokens, key=lambda t: t.confidence)
            return best.text, best.confidence
        else:
            # PaddleOCR 2.x crop-only recognition (no detection, no classifier)
            results = ocr.ocr(img_arr, det=False, cls=False)
            if not results or not results[0]:
                return "", 0.0
            item = results[0][0]
            text, score = item[0], item[1]
            return str(text).strip(), round(float(score), 4)


# ---------------------------------------------------------------------------
# Global singleton (lazy — zero cost until first OCR call)
# ---------------------------------------------------------------------------
paddle_engine = PaddleOCREngine()
