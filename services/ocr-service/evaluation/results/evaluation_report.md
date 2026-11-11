# Project Arrow: OCR Microservice Benchmark Report
**Dataset:** Sri Lankan Hospitality Bill Benchmark (200+ Fields)  
**Evaluated Images:** 75 | **Total Evaluated Fields:** 205

## 1. High-Level Performance Summary

| Metric | Overall | Printed Fields (PaddleOCR) | Handwritten Fields (TrOCR) |
| :--- | :---: | :---: | :---: |
| **Exact Match Accuracy** | **93.7%** | **97.8%** | **84.9%** |
| **Mean Character Error Rate (CER)** | 0.017 | 0.006 | 0.040 |
| **Mean Model Confidence** | 0.885 | 0.910 | 0.833 |
| **Flagged for Human Review** | 18.1% | 4.3% | 47.0% |
| **Unflagged Accuracy (Passed to DB)** | **100.0%** | **100.0%** | **100.0%** |

> **HITL Guard Policy:** Unconfirmed values never reach the reporting database. The HITL guard achieved an error detection recall of **100.0%**.

## 2. Field-Level Breakdown

| Field Name | Total Samples | Exact Match % | Mean CER | Avg Confidence | Review Flag Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `account_number` | 37 | 97.3% | 0.009 | 0.904 | 8.1% |
| `billing_period` | 18 | 100.0% | 0.002 | 0.906 | 5.6% |
| `quantity_kg_or_liters` | 38 | 89.5% | 0.032 | 0.868 | 28.9% |
| `total_amount` | 75 | 93.3% | 0.012 | 0.879 | 21.3% |
| `units_kwh` | 18 | 100.0% | 0.000 | 0.916 | 5.6% |
| `units_m3` | 19 | 84.2% | 0.053 | 0.864 | 26.3% |

## 3. Confidence Calibration & Reliability

**Expected Calibration Error (ECE):** `0.0809`

| Confidence Bin | Sample Count | Mean Confidence | Empirical Accuracy | Calibration Gap |
| :--- | :---: | :---: | :---: | :---: |
| `[0.00, 0.50)` | 1 | 0.429 | 0.0% | 0.429 |
| `[0.50, 0.70)` | 11 | 0.601 | 36.4% | 0.237 |
| `[0.70, 0.85)` | 25 | 0.801 | 80.0% | 0.001 |
| `[0.85, 1.00]` | 168 | 0.919 | 100.0% | 0.081 |
