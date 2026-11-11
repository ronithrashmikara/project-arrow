"""Image quality assessment module using OpenCV.

Evaluates uploaded bill and receipt images for blur, glare, lighting,
and resolution to guarantee OCR reliability before downstream inference.
"""

from typing import List, Tuple
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None  # Handled gracefully if cv2 is not yet installed

from app.schemas.ocr import ImageQualityAssessment
from app.config import settings


def compute_laplacian_variance(gray: np.ndarray) -> float:
    """Compute the Laplacian variance to measure image sharpness/focus.

    Lower variance values indicate blurriness, while higher values
    indicate sharp edges.
    """
    if cv2 is None:
        raise ImportError("OpenCV (cv2) is required for quality checks.")
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())


def check_glare(
    image: np.ndarray,
    saturation_threshold: int = 250,
    max_glare_ratio: float = 0.04,
) -> Tuple[bool, float]:
    """Check for overexposed spots or glare highlights on bill paper.

    Args:
        image: BGR or Grayscale image array.
        saturation_threshold: Pixel intensity threshold considered saturated (0-255).
        max_glare_ratio: Proportion of saturated pixels above which glare is flagged.

    Returns:
        (has_glare, glare_ratio)
    """
    if len(image.shape) == 3:
        # Check Value channel in HSV for lighting extremes
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV) if cv2 else None
        v_channel = hsv[:, :, 2] if hsv is not None else image[:, :, 0]
    else:
        v_channel = image

    total_pixels = v_channel.size
    if total_pixels == 0:
        return False, 0.0

    saturated_count = int(np.sum(v_channel >= saturation_threshold))
    glare_ratio = saturated_count / total_pixels

    has_glare = glare_ratio > max_glare_ratio
    return has_glare, float(glare_ratio)


def check_brightness_and_contrast(gray: np.ndarray) -> Tuple[float, float, List[str]]:
    """Evaluate mean brightness and standard deviation (contrast).

    Returns:
        (mean_brightness, std_contrast, warnings)
    """
    warnings: List[str] = []
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))

    if mean_val < 40.0:
        warnings.append(
            f"Image is severely underexposed (mean brightness {mean_val:.1f}/255). Text may blend into background."
        )
    elif mean_val > 235.0:
        warnings.append(
            f"Image is washed out (mean brightness {mean_val:.1f}/255). Light ink digits may be missing."
        )

    if std_val < 25.0:
        warnings.append(
            f"Image has low contrast (std deviation {std_val:.1f}). Contrast enhancement recommended."
        )

    return mean_val, std_val, warnings


def check_resolution(
    height: int,
    width: int,
    min_width: int = 800,
    min_height: int = 600,
    min_megapixels: float = 0.48,
) -> Tuple[bool, List[str]]:
    """Check if image resolution is sufficient for reading fine bill digits.

    Returns:
        (is_low_res, warnings)
    """
    warnings: List[str] = []
    megapixels = (width * height) / 1_000_000.0
    is_low_res = (width < min_width and height < min_height) or (megapixels < min_megapixels)

    if is_low_res:
        warnings.append(
            f"Image resolution ({width}x{height}, {megapixels:.2f}MP) is below recommended minimum "
            f"({min_width}x{min_height}). Fine meter readings or small digits may be compromised."
        )

    return is_low_res, warnings


def assess_image_quality(
    image: np.ndarray,
    blur_threshold: float = None,
    skew_angle: float = 0.0,
) -> ImageQualityAssessment:
    """Run full image quality suite on an input image.

    Args:
        image: BGR numpy image array.
        blur_threshold: Laplacian variance cutoff. Defaults to config setting.
        skew_angle: Detected skew angle in degrees.

    Returns:
        ImageQualityAssessment schema instance.
    """
    if cv2 is None:
        return ImageQualityAssessment(
            is_blurry=False,
            blur_score=0.0,
            has_glare=False,
            skew_angle=skew_angle,
            warnings=["OpenCV is not installed; quality checks were bypassed."],
        )

    threshold = blur_threshold if blur_threshold is not None else settings.BLUR_LAPLACIAN_THRESHOLD
    warnings: List[str] = []

    # Convert to grayscale for structural analysis
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = image.shape[:2]
    else:
        gray = image
        h, w = gray.shape[:2]

    # 1. Blur check
    blur_score = compute_laplacian_variance(gray)
    is_blurry = blur_score < threshold
    if is_blurry:
        warnings.append(
            f"Image appears blurry (Laplacian score {blur_score:.1f} < threshold {threshold:.1f}). "
            "Please ensure camera is focused."
        )

    # 2. Glare check
    has_glare, glare_ratio = check_glare(image)
    if has_glare:
        warnings.append(
            f"Excessive glare or reflection detected ({glare_ratio:.1%} saturated area). "
            "Avoid direct flash on glossy bills."
        )

    # 3. Brightness & contrast
    _, _, light_warnings = check_brightness_and_contrast(gray)
    warnings.extend(light_warnings)

    # 4. Resolution check
    _, res_warnings = check_resolution(h, w)
    warnings.extend(res_warnings)

    # 5. Skew check
    if abs(skew_angle) > 15.0:
        warnings.append(
            f"Significant document skew detected ({skew_angle:.1f}°). Automatic de-skewing applied."
        )

    return ImageQualityAssessment(
        is_blurry=is_blurry,
        blur_score=round(blur_score, 2),
        has_glare=has_glare,
        skew_angle=round(skew_angle, 2),
        warnings=warnings,
    )
