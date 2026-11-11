"""Configuration settings for the Project Arrow Handwriting OCR Microservice."""

from typing import List
from pydantic import Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except Exception:  # Fallback for pydantic v1 or environments without pydantic-settings installed yet
    try:
        from pydantic.v1 import BaseSettings  # type: ignore
        SettingsConfigDict = None  # type: ignore
    except Exception:
        from pydantic import BaseModel
        BaseSettings = BaseModel  # type: ignore
        SettingsConfigDict = None  # type: ignore


class Settings(BaseSettings):
    """Application settings, engine hyperparameters, and HITL thresholds."""

    # Microservice Metadata
    SERVICE_NAME: str = "arrow-ocr-service"
    SERVICE_VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Human-In-The-Loop (HITL) Confidence Thresholds
    # Values below CONFIDENCE_THRESHOLD are flagged for human review.
    # No unconfirmed OCR value enters the Project Arrow reporting database.
    CONFIDENCE_THRESHOLD: float = 0.85
    LOW_CONFIDENCE_CHAR_THRESHOLD: float = 0.75

    # Engine Settings
    DEFAULT_ENGINE: str = "ensemble"  # Options: paddleocr, trocr, ensemble
    PADDLE_OCR_LANG: str = "en"
    PADDLE_USE_ANGLE_CLS: bool = True
    TROCR_MODEL_NAME: str = "microsoft/trocr-base-handwritten"
    DEVICE: str = "cpu"  # Set to "cuda" if GPU is available

    # Image Preprocessing & Validation
    MAX_IMAGE_SIZE_MB: int = 15
    ALLOWED_EXTENSIONS: List[str] = ["jpg", "jpeg", "png", "pdf", "webp", "tiff"]
    BLUR_LAPLACIAN_THRESHOLD: float = 100.0  # Images with Laplacian variance below this trigger blur alert
    ENABLE_DESKEW: bool = True

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            case_sensitive=True,
            extra="ignore",
        )
    else:
        class Config:
            env_file = ".env"
            env_file_encoding = "utf-8"
            case_sensitive = True
            extra = "ignore"


settings = Settings()
