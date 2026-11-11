"""Evaluation scripts and metrics for printed and handwritten field OCR."""

from .metrics import (
    BenchmarkSummary,
    CalibrationBin,
    FieldEvaluationSample,
    SubsetMetrics,
    compute_cer,
    evaluate_samples,
    is_exact_match,
    levenshtein_distance,
)
from .run_eval import generate_mock_benchmark_dataset, run_benchmark

__all__ = [
    "BenchmarkSummary",
    "CalibrationBin",
    "FieldEvaluationSample",
    "SubsetMetrics",
    "compute_cer",
    "evaluate_samples",
    "is_exact_match",
    "levenshtein_distance",
    "generate_mock_benchmark_dataset",
    "run_benchmark",
]
