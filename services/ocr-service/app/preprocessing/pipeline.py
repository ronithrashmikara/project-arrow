"""Image preprocessing pipeline for Project Arrow OCR service.

Implements de-skewing, adaptive contrast enhancement (CLAHE), sharpening,
and quality assessment to optimize bill and handwriting recognition.
"""

import io
from dataclasses import dataclass
from typing import Optional, Tuple, Union
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
from app.preprocessing.quality_checks import assess_image_quality
from app.schemas.ocr import ImageQualityAssessment


@dataclass
class PreprocessedDocument:
    """Container holding preprocessed image artifacts and quality diagnostics."""

    bgr_image: np.ndarray
    gray_image: np.ndarray
    enhanced_image: np.ndarray
    quality: ImageQualityAssessment
    skew_angle: float

    def to_pil(self, enhanced: bool = True) -> "Image.Image":
        """Convert BGR/enhanced image to PIL format for PyTorch / TrOCR."""
        if Image is None:
            raise ImportError("PIL (Pillow) is required for to_pil conversion.")
        target = self.enhanced_image if enhanced else self.bgr_image
        rgb = cv2.cvtColor(target, cv2.COLOR_BGR2RGB) if cv2 else target
        return Image.fromarray(rgb)


def load_image_from_bytes(file_bytes: bytes) -> np.ndarray:
    """Decode raw image bytes into an OpenCV BGR numpy array."""
    if cv2 is None:
        raise ImportError("OpenCV is required to decode images.")
    nparr = np.frombuffer(file_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image from provided byte stream.")
    return image


def detect_skew_angle(gray: np.ndarray) -> float:
    """Estimate the orientation skew angle of text lines using minAreaRect.

    Returns:
        Estimated rotation angle in degrees (-45.0 to 45.0).
    """
    if cv2 is None:
        return 0.0

    # Invert binary threshold so text contours are foreground
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]

    # Morphological dilation to connect text glyphs into line blocks
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 5))
    dilated = cv2.dilate(thresh, kernel, iterations=2)

    coords = np.column_stack(np.where(dilated > 0))
    if len(coords) < 50:
        return 0.0  # Not enough features to reliably detect angle

    rect = cv2.minAreaRect(coords)
    angle = rect[-1]

    # OpenCV minAreaRect returns angle in range [-90, 0) or [0, 90)
    if angle < -45.0:
        angle = -(90.0 + angle)
    elif angle > 45.0:
        angle = 90.0 - angle
    else:
        angle = -angle

    # Avoid over-correcting near-zero noise
    if abs(angle) < 0.5:
        return 0.0

    return float(angle)


def deskew_image(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image by negative angle around its center to align text horizontally."""
    if cv2 is None or abs(angle) < 0.5:
        return image

    h, w = image.shape[:2]
    center = (w // 2, h // 2)

    rot_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image,
        rot_matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated


def enhance_contrast_clahe(bgr: np.ndarray, clip_limit: float = 2.0, tile_grid_size: Tuple[int, int] = (8, 8)) -> np.ndarray:
    """Apply Contrast Limited Adaptive Histogram Equalization (CLAHE).

    Boosts local contrast on the Luminance channel in LAB color space,
    preserving natural bill colors while making faint handwritten strokes
    and low-ink dot-matrix digits clearly legible.
    """
    if cv2 is None:
        return bgr

    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    cl = clahe.apply(l_channel)

    merged_lab = cv2.merge((cl, a_channel, b_channel))
    enhanced_bgr = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)
    return enhanced_bgr


def sharpen_image(image: np.ndarray, strength: float = 0.5) -> np.ndarray:
    """Apply mild unsharp masking to enhance stroke edges for OCR digit recognition."""
    if cv2 is None:
        return image

    gaussian = cv2.GaussianBlur(image, (0, 0), 2.0)
    sharpened = cv2.addWeighted(image, 1.0 + strength, gaussian, -strength, 0)
    return sharpened


class PreprocessingPipeline:
    """Modular image preprocessing pipeline for utility bills and receipts."""

    def __init__(
        self,
        enable_deskew: bool = None,
        blur_threshold: float = None,
        clahe_clip_limit: float = 2.0,
    ):
        self.enable_deskew = (
            enable_deskew if enable_deskew is not None else settings.ENABLE_DESKEW
        )
        self.blur_threshold = (
            blur_threshold if blur_threshold is not None else settings.BLUR_LAPLACIAN_THRESHOLD
        )
        self.clahe_clip_limit = clahe_clip_limit

    def process(
        self,
        image_input: Union[bytes, np.ndarray, "Image.Image"],
    ) -> PreprocessedDocument:
        """Execute full preprocessing pipeline on input image.

        1. Decode/convert input to BGR numpy array.
        2. Detect skew angle and de-skew if enabled.
        3. Assess quality (blur, glare, resolution, skew).
        4. Enhance contrast via CLAHE and subtle sharpening.
        5. Return preprocessed artifacts.
        """
        # Step 1: Normalize input to OpenCV BGR array
        if isinstance(image_input, bytes):
            bgr = load_image_from_bytes(image_input)
        elif Image is not None and isinstance(image_input, Image.Image):
            rgb = np.array(image_input)
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR) if cv2 else rgb
        elif isinstance(image_input, np.ndarray):
            bgr = image_input.copy()
        else:
            raise TypeError(f"Unsupported image input type: {type(image_input)}")

        if cv2 is None:
            # Fallback if cv2 is not present
            return PreprocessedDocument(
                bgr_image=bgr,
                gray_image=bgr,
                enhanced_image=bgr,
                quality=ImageQualityAssessment(warnings=["OpenCV unavailable."]),
                skew_angle=0.0,
            )

        # Grayscale representation for structural tasks
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Step 2: De-skewing
        skew_angle = 0.0
        if self.enable_deskew:
            skew_angle = detect_skew_angle(gray)
            if abs(skew_angle) > 0.5:
                bgr = deskew_image(bgr, skew_angle)
                gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Step 3: Image quality assessment
        quality = assess_image_quality(
            bgr,
            blur_threshold=self.blur_threshold,
            skew_angle=skew_angle,
        )

        # Step 4: Contrast enhancement & edge sharpening
        enhanced = enhance_contrast_clahe(bgr, clip_limit=self.clahe_clip_limit)
        enhanced = sharpen_image(enhanced, strength=0.3)

        return PreprocessedDocument(
            bgr_image=bgr,
            gray_image=gray,
            enhanced_image=enhanced,
            quality=quality,
            skew_angle=skew_angle,
        )


# Global singleton instance for common usage
default_pipeline = PreprocessingPipeline()
