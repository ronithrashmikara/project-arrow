import {
  DocumentType,
  DraftExtractionResult,
  HumanConfirmationRequest,
  HumanConfirmationResponse,
} from '../types/ocr';

const API_BASE_URL = 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** Check if OCR backend service is live and reachable */
export async function checkBackendHealth(): Promise<{ online: boolean; details?: any }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
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

/** Upload bill image and receive OCR draft in PENDING_REVIEW status */
export async function extractBill(
  file: Blob | File,
  documentType: DocumentType = 'electricity_bill',
  fileName: string = 'bill.jpg',
): Promise<DraftExtractionResult> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('document_type', documentType);

  const res = await fetch(`${API_BASE_URL}/ocr/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Extraction failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    throw new ApiError(errorDetail, res.status);
  }

  return await res.json();
}

/** Confirm or amend OCR values via Human-in-the-Loop review */
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
    } catch {}
    throw new ApiError(errorDetail, res.status);
  }

  return await res.json();
}
