"""Evaluation metrics for Project Arrow OCR benchmark.

Implements Character Error Rate (CER), exact field match accuracy,
confidence calibration statistics, and HITL review coverage metrics.
"""

from dataclasses import asdict, dataclass, field
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from app.extraction.validators import parse_float_safely


def levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein edit distance between two strings using dynamic programming."""
    if s1 == s2:
        return 0
    if len(s1) == 0:
        return len(s2)
    if len(s2) == 0:
        return len(s1)

    v0 = list(range(len(s2) + 1))
    v1 = [0] * (len(s2) + 1)

    for i in range(len(s1)):
        v1[0] = i + 1
        for j in range(len(s2)):
            cost = 0 if s1[i] == s2[j] else 1
            v1[j + 1] = min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
        v0[:] = v1[:]

    return v1[len(s2)]


def compute_cer(reference: str, hypothesis: str) -> float:
    """Calculate Character Error Rate (CER) = Levenshtein Distance / len(reference).

    Returns a float between 0.0 (perfect match) and >= 1.0.
    """
    ref_norm = reference.strip()
    hyp_norm = hypothesis.strip()

    if not ref_norm and not hyp_norm:
        return 0.0
    if not ref_norm:
        return 1.0

    dist = levenshtein_distance(ref_norm, hyp_norm)
    return round(dist / max(1, len(ref_norm)), 4)


def is_exact_match(
    expected: Any,
    predicted: Any,
    numeric_tolerance: float = 0.01,
) -> bool:
    """Determine if predicted value matches ground truth.

    Supports float tolerance for numerical units/amounts, and normalized
    case-insensitive comparison for alphanumeric codes and account numbers.
    """
    if expected is None and predicted is None:
        return True
    if expected is None or predicted is None:
        return False

    # Attempt numeric comparison first
    exp_float = parse_float_safely(expected)
    pred_float = parse_float_safely(predicted)

    if exp_float is not None and pred_float is not None:
        return abs(exp_float - pred_float) <= numeric_tolerance

    # String comparison with normalized whitespace and casing
    exp_str = re.sub(r"[\s,.-]", "", str(expected)).lower()
    pred_str = re.sub(r"[\s,.-]", "", str(predicted)).lower()

    return exp_str == pred_str


@dataclass
class FieldEvaluationSample:
    """Evaluation record for an individual extracted field instance."""

    image_filename: str
    bill_type: str
    field_name: str
    field_type: str  # "printed" or "handwritten"
    expected_value: str
    predicted_value: str
    confidence: float
    needs_review: bool
    is_match: bool
    cer: float


@dataclass
class SubsetMetrics:
    """Aggregated evaluation metrics for a specific slice (e.g. printed vs handwritten)."""

    total_samples: int = 0
    exact_matches: int = 0
    exact_match_accuracy: float = 0.0
    mean_cer: float = 0.0
    mean_confidence: float = 0.0
    flagged_for_review_count: int = 0
    flagged_for_review_rate: float = 0.0
    unflagged_accuracy: float = 0.0  # Accuracy on predictions deemed confident (silent error guard)


@dataclass
class CalibrationBin:
    """A single confidence bin assessing model probability calibration."""

    bin_range: str
    sample_count: int
    mean_confidence: float
    accuracy: float
    calibration_gap: float


@dataclass
class BenchmarkSummary:
    """Complete evaluation benchmark results."""

    dataset_name: str
    total_images: int
    total_fields: int
    overall_metrics: SubsetMetrics
    printed_metrics: SubsetMetrics
    handwritten_metrics: SubsetMetrics
    per_field_metrics: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    calibration_bins: List[CalibrationBin] = field(default_factory=list)
    expected_calibration_error: float = 0.0
    low_confidence_flag_recall: float = 0.0  # % of actual errors successfully flagged for review


def evaluate_samples(samples: List[FieldEvaluationSample], dataset_name: str = "Project Arrow Benchmark") -> BenchmarkSummary:
    """Compute benchmark summary from a collection of evaluated samples."""
    if not samples:
        empty = SubsetMetrics()
        return BenchmarkSummary(
            dataset_name=dataset_name,
            total_images=0,
            total_fields=0,
            overall_metrics=empty,
            printed_metrics=empty,
            handwritten_metrics=empty,
        )

    unique_images = len(set(s.image_filename for s in samples))
    total_fields = len(samples)

    # 1. Helper to calculate slice metrics
    def calc_metrics(items: List[FieldEvaluationSample]) -> SubsetMetrics:
        if not items:
            return SubsetMetrics()
        n = len(items)
        matches = sum(1 for x in items if x.is_match)
        acc = matches / n
        mean_cer = sum(x.cer for x in items) / n
        mean_conf = sum(x.confidence for x in items) / n
        flagged = sum(1 for x in items if x.needs_review)
        flagged_rate = flagged / n

        unflagged = [x for x in items if not x.needs_review]
        unflagged_acc = (sum(1 for x in unflagged if x.is_match) / len(unflagged)) if unflagged else 1.0

        return SubsetMetrics(
            total_samples=n,
            exact_matches=matches,
            exact_match_accuracy=round(acc, 4),
            mean_cer=round(mean_cer, 4),
            mean_confidence=round(mean_conf, 4),
            flagged_for_review_count=flagged,
            flagged_for_review_rate=round(flagged_rate, 4),
            unflagged_accuracy=round(unflagged_acc, 4),
        )

    overall_metrics = calc_metrics(samples)
    printed_samples = [s for s in samples if s.field_type.lower() == "printed"]
    handwritten_samples = [s for s in samples if s.field_type.lower() == "handwritten"]

    printed_metrics = calc_metrics(printed_samples)
    handwritten_metrics = calc_metrics(handwritten_samples)

    # 2. Per-field breakdown
    fields_map: Dict[str, List[FieldEvaluationSample]] = {}
    for s in samples:
        fields_map.setdefault(s.field_name, []).append(s)

    per_field_metrics: Dict[str, Dict[str, Any]] = {}
    for fname, fitems in fields_map.items():
        m = calc_metrics(fitems)
        per_field_metrics[fname] = asdict(m)

    # 3. Confidence Calibration Bins: [0.0-0.5), [0.5-0.7), [0.7-0.85), [0.85-1.0]
    bins_def = [
        (0.0, 0.50, "[0.00, 0.50)"),
        (0.50, 0.70, "[0.50, 0.70)"),
        (0.70, 0.85, "[0.70, 0.85)"),
        (0.85, 1.001, "[0.85, 1.00]"),
    ]

    calibration_bins: List[CalibrationBin] = []
    total_calib_samples = len(samples)
    weighted_ece = 0.0

    for low, high, label in bins_def:
        b_samples = [s for s in samples if low <= s.confidence < high]
        count = len(b_samples)
        if count > 0:
            avg_conf = sum(s.confidence for s in b_samples) / count
            acc = sum(1 for s in b_samples if s.is_match) / count
            gap = abs(avg_conf - acc)
            weighted_ece += (count / total_calib_samples) * gap
        else:
            avg_conf, acc, gap = 0.0, 0.0, 0.0

        calibration_bins.append(
            CalibrationBin(
                bin_range=label,
                sample_count=count,
                mean_confidence=round(avg_conf, 4),
                accuracy=round(acc, 4),
                calibration_gap=round(gap, 4),
            )
        )

    # 4. Low-confidence flagging recall: How many of the incorrect predictions were flagged?
    incorrect_samples = [s for s in samples if not s.is_match]
    if incorrect_samples:
        flagged_errors = sum(1 for s in incorrect_samples if s.needs_review)
        flag_recall = flagged_errors / len(incorrect_samples)
    else:
        flag_recall = 1.0

    return BenchmarkSummary(
        dataset_name=dataset_name,
        total_images=unique_images,
        total_fields=total_fields,
        overall_metrics=overall_metrics,
        printed_metrics=printed_metrics,
        handwritten_metrics=handwritten_metrics,
        per_field_metrics=per_field_metrics,
        calibration_bins=calibration_bins,
        expected_calibration_error=round(weighted_ece, 4),
        low_confidence_flag_recall=round(flag_recall, 4),
    )
