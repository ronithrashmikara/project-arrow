# Project Arrow: Handwriting OCR Microservice ("Read")

[![Service: OCR](https://img.shields.io/badge/service-read%3A%20handwriting%20ocr-blue?style=flat-square)](https://github.com/ronithrashmikara/project-arrow)
[![FastAPI](https://img.shields.io/badge/framework-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Engines](https://img.shields.io/badge/engines-PaddleOCR%20%2B%20TrOCR-orange?style=flat-square)](https://huggingface.co/microsoft/trocr-base-handwritten)
[![Audit](https://img.shields.io/badge/HITL%20Policy-Mandatory%20Confirmation-success?style=flat-square)](https://github.com/ronithrashmikara/project-arrow)

The **Read: Handwriting OCR** microservice is the bill capture and digit recognition engine for **Project Arrow**, an AI-driven digital Measurement, Reporting & Verification (MRV) carbon accounting platform tailored for Sri Lankan hotels and guest houses.

---

## 1. Architectural Overview

```
                      ┌────────────────────────────────────────┐
                      │   Bill Image (Upload / Camera / PWA)   │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │  Image Preprocessing & Quality Checks  │
                      │  - Blur (Laplacian var < 100.0)        │
                      │  - Glare & lighting saturation         │
                      │  - Auto de-skewing (minAreaRect)       │
                      │  - Contrast enhancement (CLAHE on L)   │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       Dual OCR Engine & Router         │
                      │  - DBNet Detection + PaddleOCR         │
                      │  - Low-confidence crops -> TrOCR       │
                      │    (microsoft/trocr-base-handwritten)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │    Sri Lankan Utility Field Parser     │
                      │  - CEB / LECO: kWh, Acc#, Date, LKR    │
                      │  - NWSDB Water: m3, Acc#, LKR          │
                      │  - LPG / Fuel: kg, Litres, LKR         │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │   HITL Guard: PENDING_REVIEW Draft     │
                      │  (No unconfirmed values enter the DB)  │
                      └───────────────────┬────────────────────┘
                                          │
                    Human Confirmation (R3 Representative / Verifier)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      CONFIRMED & Verified Record       │
                      │      -> Deterministic GHG Engine       │
                      └────────────────────────────────────────┘
```

### Key Pillars
1. **Dual-Engine Fusion:** Fast printed layout and character detection with **PaddleOCR**, coupled with **TrOCR** (`microsoft/trocr-base-handwritten`) for cropped handwritten figures and low-confidence digits.
2. **Lazy Initialization:** Heavy PyTorch and PaddleOCR weights load on the first inference request, ensuring the microservice boots instantaneously.
3. **Strict Human-in-the-Loop (HITL) Policy:** No raw OCR reading enters the reporting database unconfirmed. All captures initialize in `PENDING_REVIEW` and require an explicit human verification call with an authorized `reviewer_id`.

---

## 2. Directory Structure

```text
services/ocr-service/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── health.py             # GET /api/v1/health
│   │       ├── extract.py            # POST /api/v1/ocr/extract, GET /api/v1/ocr/drafts/{id}
│   │       ├── confirm.py            # POST /api/v1/ocr/confirm/{id}
│   │       └── router.py             # Aggregated API router
│   ├── engines/
│   │   ├── paddle_engine.py          # PaddleOCR wrapper (printed text + detection)
│   │   ├── trocr_engine.py           # TrOCR wrapper (handwritten text + digit confidence)
│   │   └── router.py                 # Dual-engine orchestration and ensemble logic
│   ├── extraction/
│   │   ├── field_parser.py           # Domain parser for CEB/LECO, NWSDB, LPG/Fuel
│   │   └── validators.py             # Consumption range & account number sanity checks
│   ├── hitl/
│   │   ├── review_service.py         # In-memory draft repository (PostgreSQL-ready interface)
│   │   └── confirmation_guard.py     # Audit enforcement preventing unverified persistence
│   ├── preprocessing/
│   │   ├── quality_checks.py         # Blur, glare, and resolution diagnostics
│   │   └── pipeline.py               # De-skewing, CLAHE, and unsharp masking
│   ├── schemas/
│   │   └── ocr.py                    # Pydantic schemas (Drafts, ConfirmedFields, BBoxes)
│   ├── config.py                     # Microservice configuration and thresholds
│   └── main.py                       # FastAPI application factory with CORS
├── evaluation/
│   ├── metrics.py                    # CER, exact match accuracy, calibration ECE
│   └── run_eval.py                   # 200+ bills benchmark runner & mock generator
├── tests/                            # Unit and integration test suite
└── requirements.txt                  # Python dependencies
```

---

## 3. Environment Setup & Installation

### Prerequisites
- Python 3.10+ (Python 3.11 recommended)
- Git

### 1. Create and Activate Virtual Environment
```bash
# Navigate to the microservice directory
cd services/ocr-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Windows (CMD):
.\venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> **Note on PyTorch & PaddlePaddle:** For systems with NVIDIA CUDA GPUs, install the GPU-accelerated wheels according to [PyTorch](https://pytorch.org/) and [PaddlePaddle](https://www.paddlepaddle.org.cn/) guides. The service defaults gracefully to CPU if CUDA is absent.

---

## 4. Running the Service

Start the development server with hot reload:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server will be reachable at:
- **API Base:** `http://localhost:8000`
- **Interactive Swagger UI:** `http://localhost:8000/docs`
- **ReDoc Documentation:** `http://localhost:8000/redoc`
- **Health Check:** `http://localhost:8000/api/v1/health`

---

## 5. API Endpoints Guide

### 1. Readiness & Liveness Probe
```http
GET /api/v1/health
```
**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "arrow-ocr-service",
  "version": "0.1.0",
  "default_engine": "ensemble",
  "device": "cpu",
  "confidence_threshold": 0.85,
  "timestamp": "2026-11-11T21:45:00.000000"
}
```

### 2. Upload & Extract Bill Image
```http
POST /api/v1/ocr/extract
Content-Type: multipart/form-data

file: <binary image file>
document_type: electricity_bill  # (optional: electricity_bill, water_bill, lpg_receipt)
```
**Response (201 Created):**
```json
{
  "document_id": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "pending_review",
  "document_type": "electricity_bill",
  "overall_confidence": 0.8842,
  "fields": {
    "account_number": {
      "field_name": "account_number",
      "raw_text": "0745281920",
      "normalized_value": "0745281920",
      "confidence": 0.9412,
      "is_low_confidence": false,
      "needs_review": false,
      "is_handwritten": false,
      "engine": "paddleocr"
    },
    "units_kwh": {
      "field_name": "units_kwh",
      "raw_text": "1450",
      "normalized_value": 1450.0,
      "unit": "kWh",
      "confidence": 0.7920,
      "is_low_confidence": true,
      "needs_review": true,
      "is_handwritten": true,
      "engine": "trocr",
      "char_confidences": [
        {"char": "1", "confidence": 0.92, "is_low_confidence": false},
        {"char": "4", "confidence": 0.74, "is_low_confidence": true},
        {"char": "5", "confidence": 0.76, "is_low_confidence": false},
        {"char": "0", "confidence": 0.75, "is_low_confidence": false}
      ]
    },
    "total_amount": {
      "field_name": "total_amount",
      "raw_text": "68,450.00",
      "normalized_value": 68450.0,
      "unit": "LKR",
      "confidence": 0.9200,
      "is_low_confidence": false,
      "needs_review": false,
      "engine": "paddleocr"
    }
  },
  "requires_human_confirmation": true,
  "low_confidence_fields": ["units_kwh"],
  "quality_assessment": {
    "is_blurry": false,
    "blur_score": 182.4,
    "has_glare": false,
    "skew_angle": 1.2,
    "warnings": []
  }
}
```

### 3. Human Confirmation & Audit Sign-Off
```http
POST /api/v1/ocr/confirm/{draft_id}
Content-Type: application/json

{
  "document_id": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "action": "amended",
  "reviewer_id": "usr_rep_sithum_003",
  "confirmed_fields": {
    "units_kwh": {
      "confirmed_value": 1450.0,
      "is_amended": false,
      "notes": "Verified against physical meter dial"
    },
    "total_amount": {
      "confirmed_value": 68450.0,
      "is_amended": false
    }
  }
}
```
**Response (200 OK):**
```json
{
  "document_id": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "confirmed",
  "is_verified": true,
  "verified_fields": {
    "account_number": "0745281920",
    "units_kwh": 1450.0,
    "total_amount": 68450.0
  },
  "confirmed_by": "usr_rep_sithum_003",
  "confirmed_at": "2026-11-11T21:46:00.000000",
  "message": "Draft successfully verified by human reviewer and cleared for carbon reporting."
}
```

---

## 6. Running the Evaluation Suite (200+ Bills Benchmark)

The evaluation harness evaluates OCR accuracy against ground-truth bill annotations, outputting Character Error Rate (CER), exact match percentage, confidence calibration, and review flag recall.

### 1. Verify Evaluation Pipeline with Mock Dataset
To verify the evaluation suite immediately without needing physical bill scans:
```bash
python evaluation/run_eval.py --mock --output-dir evaluation/results
```
This generates a synthetic dataset of 200+ field annotations across CEB/LECO electricity, NWSDB water, and LPG receipts, simulates dual-engine OCR behaviors, and writes:
- `evaluation/results/evaluation_report.json`
- `evaluation/results/evaluation_report.md`

### 2. Benchmark on Real Annotated Bills
Once physical bills are digitized into `evaluation/data/images/` and cataloged in `evaluation/data/ground_truth.csv`:
```bash
python evaluation/run_eval.py --data-dir evaluation/data --ground-truth evaluation/data/ground_truth.csv --output-dir evaluation/results
```

### Format of `ground_truth.csv`
```csv
image_filename,bill_type,field_name,field_type,expected_value
ceb_001.jpg,electricity_bill,account_number,printed,0741289102
ceb_001.jpg,electricity_bill,units_kwh,handwritten,1240
ceb_001.jpg,electricity_bill,total_amount,printed,54200.00
water_002.jpg,water_bill,units_m3,printed,85
lpg_003.jpg,lpg_receipt,quantity_kg_or_liters,handwritten,37.5
```

---

## 7. Configuration Settings

Settings can be overridden via environment variables or a `.env` file in the root directory:

| Environment Variable | Default | Description |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | `0.85` | Field confidence below which values are flagged for human review |
| `LOW_CONFIDENCE_CHAR_THRESHOLD` | `0.75` | Per-digit confidence threshold for frontend red-highlighting |
| `DEFAULT_ENGINE` | `ensemble` | Primary OCR mode (`paddleocr`, `trocr`, `ensemble`) |
| `TROCR_MODEL_NAME` | `microsoft/trocr-base-handwritten` | Hugging Face model checkpoint |
| `PADDLE_OCR_LANG` | `en` | PaddleOCR recognition language |
| `DEVICE` | `cpu` | Inference compute target (`cpu` or `cuda`) |
| `BLUR_LAPLACIAN_THRESHOLD` | `100.0` | Laplacian variance blur alert cutoff |
| `MAX_IMAGE_SIZE_MB` | `15` | Maximum upload file payload size |
