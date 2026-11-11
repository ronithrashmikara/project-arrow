"""Evaluation script and benchmark runner for Project Arrow OCR Service.

Evaluates field-level extraction accuracy, Character Error Rate (CER),
and confidence calibration across 200+ Sri Lankan bills.

Usage:
    # Run evaluation with real bill images and ground truth:
    python evaluation/run_eval.py --data-dir evaluation/data --ground-truth evaluation/data/ground_truth.csv

    # Run with generated mock dataset (200+ samples) to verify evaluation suite:
    python evaluation/run_eval.py --mock --output-dir evaluation/results
"""

import argparse
import csv
import json
import os
from pathlib import Path
import random
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure services/ocr-service root is in sys.path
_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from evaluation.metrics import (
    BenchmarkSummary,
    FieldEvaluationSample,
    compute_cer,
    evaluate_samples,
    is_exact_match,
)


def generate_mock_benchmark_dataset(
    output_dir: Path,
    num_bills: int = 50,  # 50 bills * ~4 fields = 200+ field samples
) -> Path:
    """Generate mock ground_truth.csv and dummy bill records for benchmark verification."""
    output_dir.mkdir(parents=True, exist_ok=True)
    gt_file = output_dir / "ground_truth.csv"

    field_templates = [
        # (field_name, field_type, sample_values_generator)
        ("account_number", "printed", lambda: f"{random.randint(1000000000, 9999999999)}"),
        ("billing_period", "printed", lambda: f"2026/0{random.randint(1,9)}/01 - 2026/0{random.randint(1,9)}/30"),
        ("units_kwh", "printed", lambda: f"{random.randint(250, 4800)}"),
        ("total_amount", "printed", lambda: f"{round(random.uniform(5000, 450000), 2)}"),
        ("units_kwh", "handwritten", lambda: f"{random.randint(120, 3500)}"),
        ("total_amount", "handwritten", lambda: f"{round(random.uniform(2500, 85000), 2)}"),
        ("units_m3", "printed", lambda: f"{random.randint(20, 850)}"),
        ("quantity_kg_or_liters", "printed", lambda: random.choice(["12.5", "37.5", "100.0", "250.0"])),
        ("quantity_kg_or_liters", "handwritten", lambda: random.choice(["12.5", "37.5", "45.0", "120.0"])),
    ]

    bill_types = ["electricity_bill", "water_bill", "lpg_receipt", "generator_fuel"]

    rows = []
    for i in range(1, num_bills + 1):
        filename = f"bill_{i:03d}.jpg"
        b_type = bill_types[i % len(bill_types)]

        if b_type == "electricity_bill":
            fields = [
                ("account_number", "printed", f"07{random.randint(10000000, 99999999)}"),
                ("billing_period", "printed", "2026/09/01 - 2026/09/30"),
                ("units_kwh", random.choice(["printed", "handwritten"]), str(random.randint(450, 6200))),
                ("total_amount", random.choice(["printed", "handwritten"]), f"{random.randint(15000, 320000)}.00"),
            ]
        elif b_type == "water_bill":
            fields = [
                ("account_number", "printed", f"21/{random.randint(10,99)}/{random.randint(100,999)}"),
                ("units_m3", random.choice(["printed", "handwritten"]), str(random.randint(35, 1200))),
                ("total_amount", "printed", f"{random.randint(3500, 65000)}.50"),
            ]
        else:  # LPG or fuel
            fields = [
                ("quantity_kg_or_liters", random.choice(["printed", "handwritten"]), random.choice(["12.5", "37.5", "150.0"])),
                ("total_amount", random.choice(["printed", "handwritten"]), f"{random.randint(4200, 95000)}.00"),
            ]

        for fname, ftype, val in fields:
            rows.append({
                "image_filename": filename,
                "bill_type": b_type,
                "field_name": fname,
                "field_type": ftype,
                "expected_value": val,
            })

    with open(gt_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["image_filename", "bill_type", "field_name", "field_type", "expected_value"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated mock ground truth with {len(rows)} entries across {num_bills} bills at: {gt_file}")
    return gt_file


def simulate_mock_ocr_prediction(expected: str, field_type: str) -> Tuple[str, float, bool]:
    """Simulate realistic OCR engine behavior for mock benchmarking.

    Printed text: higher accuracy (~94%), higher confidence.
    Handwritten text: moderate accuracy (~83%), variable confidence.
    """
    is_hw = field_type.lower() == "handwritten"

    # Likelihood of perfect recognition
    match_prob = 0.82 if is_hw else 0.94
    is_correct = random.random() < match_prob

    if is_correct:
        predicted = expected
        # Confident prediction
        confidence = random.uniform(0.86, 0.99) if not is_hw else random.uniform(0.78, 0.96)
    else:
        # Simulate typical OCR noise / misread digit
        chars = list(expected)
        if chars:
            swap_idx = random.randint(0, len(chars) - 1)
            replacements = {"0": "O", "1": "7", "5": "6", "8": "3", "3": "8", "6": "5"}
            orig_c = chars[swap_idx]
            chars[swap_idx] = replacements.get(orig_c, "0" if orig_c.isdigit() else "X")
            predicted = "".join(chars)
        else:
            predicted = "ERR"

        # Errors tend to have lower confidence
        confidence = random.uniform(0.40, 0.84) if is_hw else random.uniform(0.50, 0.82)

    needs_review = confidence < 0.85
    return predicted, round(confidence, 4), needs_review


def run_benchmark(
    ground_truth_path: Path,
    images_dir: Optional[Path] = None,
    mock_mode: bool = False,
) -> List[FieldEvaluationSample]:
    """Execute evaluation over ground truth items."""
    samples: List[FieldEvaluationSample] = []

    if not ground_truth_path.exists():
        raise FileNotFoundError(f"Ground truth file not found at: {ground_truth_path}")

    with open(ground_truth_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} ground truth records to evaluate.")

    for row in rows:
        img_name = row["image_filename"]
        b_type = row["bill_type"]
        f_name = row["field_name"]
        f_type = row["field_type"]
        exp_val = row["expected_value"]

        if mock_mode or images_dir is None:
            # Simulate dual-engine execution
            pred_val, conf, needs_review = simulate_mock_ocr_prediction(exp_val, f_type)
        else:
            # Real execution with pipeline + router + field_parser
            img_path = images_dir / img_name
            if not img_path.exists():
                pred_val, conf, needs_review = "", 0.0, True
            else:
                from app.preprocessing.pipeline import default_pipeline
                from app.engines.router import ocr_router
                from app.extraction.field_parser import field_parser

                try:
                    preprocessed = default_pipeline.process(img_path.read_bytes())
                    tokens = ocr_router.route_document(preprocessed.enhanced_image)
                    _, fields = field_parser.parse(tokens)
                    if f_name in fields:
                        field_obj = fields[f_name]
                        pred_val = str(field_obj.normalized_value or field_obj.raw_text)
                        conf = field_obj.confidence
                        needs_review = field_obj.needs_review
                    else:
                        pred_val, conf, needs_review = "", 0.0, True
                except Exception as exc:
                    print(f"Error evaluating {img_name}: {exc}")
                    pred_val, conf, needs_review = "", 0.0, True

        match = is_exact_match(exp_val, pred_val)
        cer = compute_cer(exp_val, pred_val)

        samples.append(
            FieldEvaluationSample(
                image_filename=img_name,
                bill_type=b_type,
                field_name=f_name,
                field_type=f_type,
                expected_value=exp_val,
                predicted_value=pred_val,
                confidence=conf,
                needs_review=needs_review,
                is_match=match,
                cer=cer,
            )
        )

    return samples


def format_markdown_report(summary: BenchmarkSummary) -> str:
    """Render evaluation results as a clean, publication-ready GitHub Flavored Markdown report."""
    md = []
    md.append(f"# Project Arrow: OCR Microservice Benchmark Report")
    md.append(f"**Dataset:** {summary.dataset_name}  ")
    md.append(f"**Evaluated Images:** {summary.total_images} | **Total Evaluated Fields:** {summary.total_fields}\n")

    md.append("## 1. High-Level Performance Summary\n")
    md.append("| Metric | Overall | Printed Fields (PaddleOCR) | Handwritten Fields (TrOCR) |")
    md.append("| :--- | :---: | :---: | :---: |")
    md.append(
        f"| **Exact Match Accuracy** | **{summary.overall_metrics.exact_match_accuracy:.1%}** "
        f"| **{summary.printed_metrics.exact_match_accuracy:.1%}** "
        f"| **{summary.handwritten_metrics.exact_match_accuracy:.1%}** |"
    )
    md.append(
        f"| **Mean Character Error Rate (CER)** | {summary.overall_metrics.mean_cer:.3f} "
        f"| {summary.printed_metrics.mean_cer:.3f} "
        f"| {summary.handwritten_metrics.mean_cer:.3f} |"
    )
    md.append(
        f"| **Mean Model Confidence** | {summary.overall_metrics.mean_confidence:.3f} "
        f"| {summary.printed_metrics.mean_confidence:.3f} "
        f"| {summary.handwritten_metrics.mean_confidence:.3f} |"
    )
    md.append(
        f"| **Flagged for Human Review** | {summary.overall_metrics.flagged_for_review_rate:.1%} "
        f"| {summary.printed_metrics.flagged_for_review_rate:.1%} "
        f"| {summary.handwritten_metrics.flagged_for_review_rate:.1%} |"
    )
    md.append(
        f"| **Unflagged Accuracy (Passed to DB)** | **{summary.overall_metrics.unflagged_accuracy:.1%}** "
        f"| **{summary.printed_metrics.unflagged_accuracy:.1%}** "
        f"| **{summary.handwritten_metrics.unflagged_accuracy:.1%}** |"
    )
    md.append("\n> **HITL Guard Policy:** Unconfirmed values never reach the reporting database. "
              f"The HITL guard achieved an error detection recall of **{summary.low_confidence_flag_recall:.1%}**.\n")

    md.append("## 2. Field-Level Breakdown\n")
    md.append("| Field Name | Total Samples | Exact Match % | Mean CER | Avg Confidence | Review Flag Rate |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: |")
    for fname, metrics in sorted(summary.per_field_metrics.items()):
        md.append(
            f"| `{fname}` | {metrics['total_samples']} | {metrics['exact_match_accuracy']:.1%} "
            f"| {metrics['mean_cer']:.3f} | {metrics['mean_confidence']:.3f} | {metrics['flagged_for_review_rate']:.1%} |"
        )
    md.append("")

    md.append("## 3. Confidence Calibration & Reliability\n")
    md.append(f"**Expected Calibration Error (ECE):** `{summary.expected_calibration_error:.4f}`\n")
    md.append("| Confidence Bin | Sample Count | Mean Confidence | Empirical Accuracy | Calibration Gap |")
    md.append("| :--- | :---: | :---: | :---: | :---: |")
    for b in summary.calibration_bins:
        md.append(
            f"| `{b.bin_range}` | {b.sample_count} | {b.mean_confidence:.3f} | {b.accuracy:.1%} | {b.calibration_gap:.3f} |"
        )
    md.append("")

    return "\n".join(md)


def main():
    parser = argparse.ArgumentParser(description="Run OCR Microservice Evaluation Benchmark")
    parser.add_argument("--data-dir", type=str, default="evaluation/data", help="Path to evaluation data directory")
    parser.add_argument("--ground-truth", type=str, default=None, help="Path to ground_truth.csv")
    parser.add_argument("--output-dir", type=str, default="evaluation/results", help="Directory to save evaluation reports")
    parser.add_argument("--mock", action="store_true", help="Generate and run against a 200+ sample mock dataset")

    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.mock:
        print("[INFO] Running in mock benchmark mode...")
        gt_path = generate_mock_benchmark_dataset(data_dir, num_bills=75)
        samples = run_benchmark(gt_path, mock_mode=True)
    else:
        gt_path = Path(args.ground_truth) if args.ground_truth else data_dir / "ground_truth.csv"
        samples = run_benchmark(gt_path, images_dir=data_dir / "images", mock_mode=False)

    summary = evaluate_samples(samples, dataset_name="Sri Lankan Hospitality Bill Benchmark (200+ Fields)")

    # 1. Output JSON report
    json_path = output_dir / "evaluation_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        # Serializing dataclass to dict
        def serialize(obj):
            if hasattr(obj, "__dict__"):
                return obj.__dict__
            return str(obj)
        json.dump(summary, f, default=serialize, indent=2)

    # 2. Output Markdown report
    md_content = format_markdown_report(summary)
    md_path = output_dir / "evaluation_report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("\n" + "=" * 60)
    print("BENCHMARK COMPLETED SUCCESSFULLY")
    print(f"Total Fields Evaluated: {summary.total_fields}")
    print(f"Printed Accuracy:       {summary.printed_metrics.exact_match_accuracy:.1%}")
    print(f"Handwritten Accuracy:   {summary.handwritten_metrics.exact_match_accuracy:.1%}")
    print(f"Overall Accuracy:       {summary.overall_metrics.exact_match_accuracy:.1%}")
    print(f"Overall Mean CER:       {summary.overall_metrics.mean_cer:.3f}")
    print(f"JSON Report Saved:      {json_path}")
    print(f"Markdown Report Saved:  {md_path}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
