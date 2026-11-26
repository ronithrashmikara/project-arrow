import {
  DocumentType,
  DraftExtractionResult,
  HumanConfirmationRequest,
  HumanConfirmationResponse,
} from '../types/ocr';

const API_BASE_URL = 'http://localhost:8000/api/v1';

/** Timeout (ms) for the lightweight health-check ping. */
const HEALTH_CHECK_TIMEOUT_MS = 15_000;

/** Timeout (ms) for the full OCR extraction request (CPU inference can take 30-90s). */
const EXTRACT_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** Check if the OCR backend service is live and reachable. */
export async function checkBackendHealth(): Promise<{ online: boolean; details?: unknown }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const res = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, details: data };
  } catch {
    return { online: false };
  }
}

/**
 * Upload a bill image and receive an OCR draft in PENDING_REVIEW status.
 *
 * @param file         The image file (or Blob) to send.
 * @param documentType The user-selected bill type hint forwarded to the backend
 *                     so the field parser uses the correct extraction strategy
 *                     (electricity_bill, water_bill, lpg_receipt, generator_fuel).
 * @param fileName     Original filename preserved for the multipart upload.
 */
export async function extractBill(
  file: Blob | File,
  documentType: DocumentType = 'electricity_bill',
  fileName: string = 'bill.jpg',
): Promise<DraftExtractionResult> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  // Always forward the user's selected bill type as a form field so the
  // backend parser can enforce the correct field set without auto-detecting.
  formData.append('document_type', documentType);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/ocr/extract`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errorDetail = `Extraction failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch { /* ignore parse error */ }
    throw new ApiError(errorDetail, res.status);
  }

  return await res.json();
}

/** Confirm or amend OCR values via Human-in-the-Loop review. */
export async function confirmDraft(
  draftId: string,
  request: HumanConfirmationRequest,
): Promise<HumanConfirmationResponse> {
  const res = await fetch(`${API_BASE_URL}/ocr/confirm/${draftId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let errorDetail = `Confirmation failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch { /* ignore parse error */ }
    throw new ApiError(errorDetail, res.status);
  }

  return await res.json();
}
