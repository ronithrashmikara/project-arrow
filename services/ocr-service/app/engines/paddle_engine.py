"""PaddleOCR engine wrapper for printed text and bounding box detection.

Provides text detection (DBNet) and text recognition (CRNN/SVTR) with
lazy initialization so application startup remains fast and lightweight.
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
from app.schemas.ocr import BoundingBox, CharacterConfidence, OCRToken


class PaddleOCREngine:
    """Wrapper for PaddleOCR engine supporting text detection and recognition."""

    def __init__(
        self,
        lang: str = None,
        use_angle_cls: bool = None,
        use_gpu: bool = False,
    ):
        self.lang = lang or settings.PADDLE_OCR_LANG
        self.use_angle_cls = (
            use_angle_cls if use_angle_cls is not None else settings.PADDLE_USE_ANGLE_CLS
        )
        self.use_gpu = use_gpu
        self._ocr: Optional[Any] = None

    def _get_ocr_instance(self) -> Any:
        """Lazy-load PaddleOCR instance on first call."""
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR
            except ImportError as err:
                raise ImportError(
                    "paddleocr is not installed. Please install requirements before running OCR inference."
                ) from err

            self._ocr = PaddleOCR(
                use_angle_cls=self.use_angle_cls,
                lang=self.lang,
                use_gpu=self.use_gpu,
                show_log=False,
            )
        return self._ocr

    def detect_and_recognize(
        self,
        image: Union[np.ndarray, "Image.Image"],
    ) -> List[OCRToken]:
        """Run text detection and recognition on an image.

        Args:
            image: OpenCV BGR array or PIL Image.

        Returns:
            List of OCRToken instances with text, confidence, and bounding box.
        """
        ocr = self._get_ocr_instance()

        if Image is not None and isinstance(image, Image.Image):
            rgb = np.array(image)
            img_arr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR) if cv2 else rgb
        else:
            img_arr = image

        h, w = img_arr.shape[:2] if hasattr(img_arr, "shape") else (1000, 1000)

        # PaddleOCR returns a list of lines for each page:
        # result = [ [ [box_pts, (text, score)], ... ] ]
        raw_results = ocr.ocr(img_arr, cls=self.use_angle_cls)

        tokens: List[OCRToken] = []
        if not raw_results or raw_results[0] is None:
            return tokens

        for line in raw_results[0]:
            box_coords = line[0]  # 4 points: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
            text, score = line[1]

            xs = [pt[0] for pt in box_coords]
            ys = [pt[1] for pt in box_coords]

            bbox = BoundingBox(
                x_min=float(min(xs)),
                y_min=float(min(ys)),
                x_max=float(max(xs)),
                y_max=float(max(ys)),
                polygon=[[float(pt[0]), float(pt[1])] for pt in box_coords],
            )

            token = OCRToken(
                text=str(text).strip(),
                confidence=round(float(score), 4),
                bounding_box=bbox,
                engine="paddleocr",
            )
            tokens.append(token)

        return tokens

    def recognize_crop(
        self,
        crop_image: Union[np.ndarray, "Image.Image"],
    ) -> Tuple[str, float]:
        """Recognize text in an isolated cropped region using PaddleOCR.

        Args:
            crop_image: Image crop array or PIL Image.

        Returns:
            (text, confidence)
        """
        ocr = self._get_ocr_instance()

        if Image is not None and isinstance(crop_image, Image.Image):
            rgb = np.array(crop_image)
            img_arr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR) if cv2 else rgb
        else:
            img_arr = crop_image

        results = ocr.ocr(img_arr, det=False, cls=False)
        if not results or not results[0]:
            return "", 0.0

        item = results[0][0]
        text, score = item[0], item[1]
        return str(text).strip(), round(float(score), 4)


# Global singleton instance
paddle_engine = PaddleOCREngine()
