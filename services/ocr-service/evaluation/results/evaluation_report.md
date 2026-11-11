# Project Arrow: OCR Microservice Benchmark Report
**Dataset:** Sri Lankan Hospitality Bill Benchmark (200+ Fields)  
**Evaluated Images:** 75 | **Total Evaluated Fields:** 205

## 1. High-Level Performance Summary

| Metric | Overall | Printed Fields (PaddleOCR) | Handwritten Fields (TrOCR) |
| :--- | :---: | :---: | :---: |
| **Exact Match Accuracy** | **95.6%** | **97.8%** | **91.2%** |
| **Mean Character Error Rate (CER)** | 0.015 | 0.008 | 0.030 |
| **Mean Model Confidence** | 0.888 | 0.918 | 0.828 |
| **Flagged for Human Review** | 19.5% | 4.4% | 50.0% |
| **Unflagged Accuracy (Passed to DB)** | **100.0%** | **100.0%** | **100.0%** |

> **HITL Guard Policy:** Unconfirmed values never reach the reporting database. The HITL guard achieved an error detection recall of **100.0%**.

## 2. Field-Level Breakdown

| Field Name | Total Samples | Exact Match % | Mean CER | Avg Confidence | Review Flag Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `account_number` | 37 | 100.0% | 0.003 | 0.924 | 2.7% |
| `billing_period` | 18 | 100.0% | 0.002 | 0.928 | 5.6% |
| `quantity_kg_or_liters` | 38 | 89.5% | 0.024 | 0.869 | 28.9% |
| `total_amount` | 75 | 94.7% | 0.014 | 0.881 | 20.0% |
| `units_kwh` | 18 | 100.0% | 0.000 | 0.893 | 27.8% |
| `units_m3` | 19 | 94.7% | 0.053 | 0.846 | 36.8% |

## 3. Confidence Calibration & Reliability

**Expected Calibration Error (ECE):** `0.0747`

| Confidence Bin | Sample Count | Mean Confidence | Empirical Accuracy | Calibration Gap |
| :--- | :---: | :---: | :---: | :---: |
| `[0.00, 0.50)` | 1 | 0.421 | 0.0% | 0.421 |
| `[0.50, 0.70)` | 9 | 0.589 | 55.6% | 0.033 |
| `[0.70, 0.85)` | 30 | 0.807 | 86.7% | 0.060 |
| `[0.85, 1.00]` | 165 | 0.922 | 100.0% | 0.078 |
