"""TrOCR engine wrapper for handwritten text and digit recognition.

Loads microsoft/trocr-base-handwritten using Hugging Face Transformers.
Weights are loaded lazily on first inference request to keep microservice
startup instantaneous.
"""

from typing import Any, List, Optional, Tuple, Union
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
from app.schemas.ocr import CharacterConfidence


class TrOCREngine:
    """Hugging Face VisionEncoderDecoder wrapper for TrOCR handwriting recognition."""

    def __init__(
        self,
        model_name: str = None,
        device: str = None,
    ):
        self.model_name = model_name or settings.TROCR_MODEL_NAME
        self.device = device or settings.DEVICE
        self._processor: Optional[Any] = None
        self._model: Optional[Any] = None
        self._torch: Optional[Any] = None

    def _load_model(self) -> None:
        """Lazy-load TrOCR processor and model weights on demand."""
        if self._model is None or self._processor is None:
            try:
                import torch
                from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            except ImportError as err:
                raise ImportError(
                    "torch and transformers are required to run TrOCR. "
                    "Please install requirements before running handwriting inference."
                ) from err

            self._torch = torch
            self._processor = TrOCRProcessor.from_pretrained(self.model_name)
            self._model = VisionEncoderDecoderModel.from_pretrained(self.model_name)

            # Route to target compute device (CPU or GPU)
            if self.device == "cuda" and torch.cuda.is_available():
                self._model.to("cuda")
            else:
                self._model.to("cpu")

            self._model.eval()

    def recognize_crop(
        self,
        crop_image: Union[np.ndarray, "Image.Image"],
    ) -> Tuple[str, float, List[CharacterConfidence]]:
        """Recognize handwritten text in a cropped region and compute confidence scores.

        Args:
            crop_image: Cropped bounding box region as OpenCV BGR array or PIL Image.

        Returns:
            Tuple of:
                - decoded_text (str): Recognized text/digits.
                - confidence (float): Sequence confidence score between 0.0 and 1.0.
                - char_confidences (List[CharacterConfidence]): Per-character confidence breakdown.
        """
        self._load_model()
        torch = self._torch

        # Ensure image is in RGB PIL format required by TrOCRProcessor
        if Image is not None and isinstance(crop_image, Image.Image):
            pil_img = crop_image.convert("RGB")
        elif isinstance(crop_image, np.ndarray):
            if len(crop_image.shape) == 2:
                # Grayscale to RGB
                rgb = cv2.cvtColor(crop_image, cv2.COLOR_GRAY2RGB) if cv2 else np.stack([crop_image] * 3, axis=-1)
            else:
                # BGR to RGB
                rgb = cv2.cvtColor(crop_image, cv2.COLOR_BGR2RGB) if cv2 else crop_image
            pil_img = Image.fromarray(rgb) if Image else None
        else:
            raise TypeError(f"Unsupported crop image type: {type(crop_image)}")

        if pil_img is None:
            return "", 0.0, []

        # Check for empty or degenerate crops
        if pil_img.width < 5 or pil_img.height < 5:
            return "", 0.0, []

        # Preprocess crop to vision encoder pixel values
        pixel_values = self._processor(images=pil_img, return_tensors="pt").pixel_values
        target_device = self._model.device
        pixel_values = pixel_values.to(target_device)

        with torch.no_grad():
            outputs = self._model.generate(
                pixel_values,
                return_dict_in_generate=True,
                output_scores=True,
                max_new_tokens=64,
            )

        # Decode generated token IDs to string
        generated_ids = outputs.sequences
        decoded_text = self._processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0].strip()

        # Compute sequence and per-token confidence probabilities
        token_confidences: List[float] = []
        if outputs.scores:
            for score_tensor in outputs.scores:
                # Softmax over vocabulary dimension
                probs = torch.softmax(score_tensor, dim=-1)
                max_prob = float(torch.max(probs, dim=-1).values.squeeze().item())
                token_confidences.append(max_prob)

        if token_confidences:
            sequence_confidence = float(np.mean(token_confidences))
        else:
            sequence_confidence = 0.5  # Neutral default if no generation steps occurred

        # Compute character-level confidence breakdown for highlighting dubious digits in UI
        char_confidences: List[CharacterConfidence] = []
        low_threshold = settings.LOW_CONFIDENCE_CHAR_THRESHOLD

        if decoded_text:
            # Map sequence probabilities across characters
            if len(token_confidences) >= len(decoded_text):
                char_scores = token_confidences[: len(decoded_text)]
            elif token_confidences:
                # Interpolate if tokens are multi-character
                char_scores = [sequence_confidence] * len(decoded_text)
            else:
                char_scores = [sequence_confidence] * len(decoded_text)

            for char, score in zip(decoded_text, char_scores):
                is_low = (score < low_threshold) or (char.isdigit() and score < settings.CONFIDENCE_THRESHOLD)
                char_confidences.append(
                    CharacterConfidence(
                        char=char,
                        confidence=round(score, 4),
                        is_low_confidence=is_low,
                    )
                )

        return decoded_text, round(sequence_confidence, 4), char_confidences


# Global singleton instance
trocr_engine = TrOCREngine()
