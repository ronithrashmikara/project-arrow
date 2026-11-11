export type DocumentType =
  | 'electricity_bill'
  | 'water_bill'
  | 'lpg_receipt'
  | 'generator_fuel'
  | 'meter_reading'
  | 'general_expense';

export interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  polygon?: number[][];
}

export interface CharacterConfidence {
  char: string;
  confidence: number;
  is_low_confidence: boolean;
}

export interface ExtractedField {
  field_name: string;
  raw_text: string;
  normalized_value: any;
  unit?: string | null;
  confidence: number;
  is_low_confidence: boolean;
  needs_review: boolean;
  is_handwritten?: boolean | null;
  engine: string;
  bounding_box?: BoundingBox | null;
  char_confidences?: CharacterConfidence[];
}

export interface ImageQualityAssessment {
  is_blurry: boolean;
  blur_score: number;
  has_glare: boolean;
  skew_angle: number;
  warnings: string[];
}

export interface DraftExtractionResult {
  document_id: string;
  status: 'pending_review' | 'confirmed' | 'rejected' | 'draft';
  document_type: DocumentType;
  overall_confidence: number;
  fields: Record<string, ExtractedField>;
  raw_full_text?: string;
  requires_human_confirmation: boolean;
  low_confidence_fields: string[];
  quality_assessment?: ImageQualityAssessment;
  created_at: string;
}

export interface ConfirmedFieldUpdate {
  confirmed_value: any;
  is_amended: boolean;
  notes?: string;
}

export interface HumanConfirmationRequest {
  document_id: string;
  action: 'approved' | 'amended' | 'rejected';
  confirmed_fields: Record<string, ConfirmedFieldUpdate>;
  reviewer_id: string;
  rejection_reason?: string;
  timestamp?: string;
}

export interface HumanConfirmationResponse {
  document_id: string;
  status: string;
  is_verified: boolean;
  verified_fields: Record<string, any>;
  confirmed_by?: string;
  confirmed_at: string;
  message: string;
}

export interface QueuedBill {
  id: string;
  blob: Blob;
  previewUrl?: string;
  fileName: string;
  fileSize: number;
  documentType: DocumentType;
  capturedAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
  extractedDraft?: DraftExtractionResult;
}
