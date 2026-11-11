import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Edit3,
  CheckCircle2,
  FileCheck,
  Cpu,
  PenTool,
  Hash,
  Loader2,
  User,
} from 'lucide-react';
import {
  DraftExtractionResult,
  HumanConfirmationRequest,
  HumanConfirmationResponse,
} from '../types/ocr';
import { confirmDraft } from '../services/api';

interface OCRReviewCardProps {
  draft: DraftExtractionResult;
  previewUrl?: string;
  onConfirmed: (response: HumanConfirmationResponse) => void;
  onCancel: () => void;
}

export const OCRReviewCard: React.FC<OCRReviewCardProps> = ({
  draft,
  previewUrl,
  onConfirmed,
  onCancel,
}) => {
  // Store editable values for all extracted fields
  const [fieldValues, setFieldValues] = useState<Record<string, { value: any; isAmended: boolean; notes?: string }>>(
    () => {
      const initial: Record<string, { value: any; isAmended: boolean; notes?: string }> = {};
      Object.entries(draft.fields).forEach(([key, field]) => {
        initial[key] = {
          value: field.normalized_value ?? field.raw_text,
          isAmended: false,
        };
      });
      return initial;
    }
  );

  const [reviewerId, setReviewerId] = useState<string>('usr_rep_sithum_003');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const handleFieldChange = (fieldName: string, newValue: any) => {
    const original = draft.fields[fieldName]?.normalized_value ?? draft.fields[fieldName]?.raw_text;
    const isAmended = String(newValue) !== String(original);

    setFieldValues((prev) => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        value: newValue,
        isAmended,
      },
    }));
  };

  const handleConfirm = async () => {
    if (!reviewerId.trim()) {
      setError('Reviewer ID is required under Project Arrow MRV trust policy.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: HumanConfirmationRequest = {
      document_id: draft.document_id,
      action: Object.values(fieldValues).some((f) => f.isAmended) ? 'amended' : 'approved',
      reviewer_id: reviewerId.trim(),
      confirmed_fields: Object.entries(fieldValues).reduce(
        (acc, [name, data]) => ({
          ...acc,
          [name]: {
            confirmed_value: data.value,
            is_amended: data.isAmended,
            notes: data.notes,
          },
        }),
        {}
      ),
    };

    try {
      const res = await confirmDraft(draft.document_id, payload);
      setSubmitting(false);
      onConfirmed(res);
    } catch (err: any) {
      setError(err.message || 'Failed to submit confirmation to backend.');
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejecting this bill.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: HumanConfirmationRequest = {
      document_id: draft.document_id,
      action: 'rejected',
      reviewer_id: reviewerId.trim() || 'usr_rep_anonymous',
      rejection_reason: rejectionReason.trim(),
      confirmed_fields: {},
    };

    try {
      const res = await confirmDraft(draft.document_id, payload);
      setSubmitting(false);
      onConfirmed(res);
    } catch (err: any) {
      setError(err.message || 'Failed to reject bill.');
      setSubmitting(false);
    }
  };

  // Check how many fields have low confidence / need review
  const needsReviewCount = Object.values(draft.fields).filter(
    (f) => f.needs_review || f.is_low_confidence || f.confidence < 0.85
  ).length;

  return (
    <div className="bg-brand-forest-deep border border-brand-teal-mountain/50 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-md">
      {/* Top Banner & Audit Notification */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-brand-teal-mountain/30 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-emerald-electric" />
            <h3 className="text-lg font-bold text-brand-white">
              Human-in-the-Loop (HITL) Verification Guard
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-brand-gold-sunset/20 border border-brand-gold-sunset/50 text-brand-gold-sunset">
              Pending Review
            </span>
          </div>
          <p className="text-xs text-brand-seaglass/70 mt-1">
            No unconfirmed OCR value enters the Project Arrow carbon database. Verify all figures below before submission.
          </p>
        </div>

        {/* Document ID / Evidence Hash */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-midnight/80 border border-brand-teal-mountain/40 text-xs font-mono text-brand-seaglass/70">
          <Hash className="w-3.5 h-3.5 text-brand-emerald-fresh" />
          <span className="truncate max-w-[130px] sm:max-w-[200px]" title={draft.document_id}>
            {draft.document_id}
          </span>
        </div>
      </div>

      {/* Review Alert Pill if low-confidence digits exist */}
      {needsReviewCount > 0 ? (
        <div className="p-4 rounded-xl bg-brand-gold-sunset/10 border-2 border-brand-gold-sunset/60 flex items-start gap-3 shadow-glow-gold/20">
          <AlertTriangle className="w-5 h-5 text-brand-gold-sunset flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-brand-gold-sunset uppercase tracking-wider block">
              Attention Required: {needsReviewCount} field(s) flagged for human verification
            </span>
            <p className="text-brand-seaglass/90 mt-0.5 leading-relaxed">
              Highlighted fields contain handwriting or fell below the <strong>85% confidence threshold</strong>. Please inspect the original image and verify the extracted digits.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-brand-emerald-fresh/10 border border-brand-emerald-fresh/40 flex items-center gap-2 text-xs text-brand-emerald-mint">
          <CheckCircle2 className="w-4 h-4 text-brand-emerald-electric" />
          <span>All fields passed the 85% confidence threshold. Please perform a final visual spot-check.</span>
        </div>
      )}

      {/* Main Review Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Original Bill Preview */}
        {previewUrl && (
          <div className="lg:col-span-5 bg-brand-midnight/90 border border-brand-teal-mountain/50 rounded-xl p-3 flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-brand-teal-mountain/30 text-xs text-brand-seaglass/70">
              <span className="font-semibold text-brand-white">Original Document Crop</span>
              <span className="text-[10px] text-brand-seaglass/50">Overall Conf: {(draft.overall_confidence * 100).toFixed(1)}%</span>
            </div>
            <img
              src={previewUrl}
              alt="Bill for verification"
              className="max-h-96 w-auto object-contain rounded-lg shadow-md"
            />
          </div>
        )}

        {/* Right: Field Extraction & Editable Cards */}
        <div className={`${previewUrl ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-brand-seaglass/60 px-1">
            <span>Standardized Field</span>
            <span>Confidence & Engine</span>
          </div>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {Object.entries(draft.fields).map(([name, field]) => {
              const currentVal = fieldValues[name]?.value ?? '';
              const isAmended = fieldValues[name]?.isAmended ?? false;
              const isLowConf = field.needs_review || field.is_low_confidence || field.confidence < 0.85;

              return (
                <div
                  key={name}
                  className={`p-3.5 rounded-xl transition-all relative ${
                    isLowConf
                      ? 'bg-brand-forest-shadow/90 border-2 border-brand-gold-sunset shadow-glow-gold/15'
                      : 'bg-brand-forest-shadow/50 border border-brand-teal-mountain/50 hover:border-brand-teal-misty'
                  }`}
                >
                  {/* Field Header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-brand-white capitalize">
                        {name.replace(/_/g, ' ')}
                      </span>
                      {field.unit && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-teal-atmospheric/80 text-brand-seaglass font-mono">
                          {field.unit}
                        </span>
                      )}
                      {isAmended && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-emerald-fresh/20 text-brand-emerald-mint font-semibold">
                          Edited
                        </span>
                      )}
                    </div>

                    {/* Confidence & Badges */}
                    <div className="flex items-center gap-2">
                      {field.is_handwritten && (
                        <span className="flex items-center gap-1 text-[10px] text-brand-gold-sunset/90 px-1.5 py-0.5 rounded bg-brand-copper-warm/20 border border-brand-copper-warm/30">
                          <PenTool className="w-2.5 h-2.5" />
                          Handwritten (TrOCR)
                        </span>
                      )}
                      {!field.is_handwritten && field.engine === 'paddleocr' && (
                        <span className="flex items-center gap-1 text-[10px] text-brand-seaglass/70 px-1.5 py-0.5 rounded bg-brand-teal-atmospheric/40">
                          <Cpu className="w-2.5 h-2.5" />
                          Printed
                        </span>
                      )}

                      {/* Low confidence badge */}
                      {isLowConf ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-brand-gold-sunset px-2 py-0.5 rounded-full bg-brand-gold-sunset/20 border border-brand-gold-sunset">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {(field.confidence * 100).toFixed(0)}% Review
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-brand-emerald-mint px-2 py-0.5 rounded-full bg-brand-emerald-fresh/15 border border-brand-emerald-fresh/30">
                          {(field.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input & Digit Breakdown */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => handleFieldChange(name, e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg bg-brand-midnight/90 text-sm font-mono text-brand-white focus:outline-none transition-all ${
                          isLowConf
                            ? 'border border-brand-gold-sunset/70 focus:border-brand-gold-sunset focus:ring-1 focus:ring-brand-gold-sunset'
                            : 'border border-brand-teal-mountain/60 focus:border-brand-emerald-electric focus:ring-1 focus:ring-brand-emerald-electric'
                        }`}
                        placeholder={`Enter ${name}...`}
                      />
                      <Edit3 className="w-3.5 h-3.5 text-brand-seaglass/40 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Character/Digit Breakdown for Low-Confidence Numbers */}
                  {field.char_confidences && field.char_confidences.length > 0 && isLowConf && (
                    <div className="mt-2 pt-2 border-t border-brand-teal-mountain/30 flex items-center gap-1">
                      <span className="text-[10px] text-brand-seaglass/60 mr-1">Digits:</span>
                      <div className="flex items-center gap-0.5 font-mono text-xs">
                        {field.char_confidences.map((cc, cIdx) => (
                          <span
                            key={cIdx}
                            className={`px-1 py-0.5 rounded text-center min-w-[18px] ${
                              cc.is_low_confidence
                                ? 'bg-brand-copper-warm/30 text-brand-gold-sunset border-b-2 border-brand-gold-sunset font-bold'
                                : 'text-brand-seaglass/80'
                            }`}
                            title={`Confidence: ${(cc.confidence * 100).toFixed(1)}%`}
                          >
                            {cc.char}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reviewer Sign-Off Credentials */}
          <div className="p-3.5 rounded-xl bg-brand-forest-shadow/30 border border-brand-teal-mountain/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-brand-emerald-fresh" />
              <span className="text-brand-seaglass font-medium">Reviewer Identity (Audit Log):</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-brand-midnight border border-brand-teal-mountain text-xs font-mono text-brand-white focus:outline-none focus:border-brand-emerald-electric"
                placeholder="Reviewer ID (e.g. usr_rep_sithum)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reject Modal / Inline Drawer */}
      {rejecting && (
        <div className="p-4 rounded-xl bg-brand-forest-shadow border border-brand-copper-warm/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-gold-sunset">Reason for Bill Rejection</span>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-xs text-brand-seaglass/60 hover:text-brand-white"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-brand-midnight text-xs text-brand-white border border-brand-teal-mountain focus:outline-none focus:border-brand-copper-warm"
            placeholder="e.g. Illegible faded thermal print, duplicate bill, or blurred meter dial..."
          />
          <button
            type="button"
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-brand-copper-warm text-brand-white text-xs font-semibold hover:bg-brand-copper-warm/80 transition-colors"
          >
            {submitting ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="p-3 rounded-xl bg-brand-copper-warm/15 border border-brand-copper-warm/40 text-brand-gold-sunset text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Bottom Footer Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-brand-teal-mountain/40">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-brand-teal-mountain/60 text-xs font-medium text-brand-seaglass hover:text-brand-white hover:bg-brand-forest-shadow transition-colors"
          >
            Discard Draft
          </button>
          {!rejecting && (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-brand-copper-warm/40 text-xs font-medium text-brand-gold-sunset hover:bg-brand-copper-warm/10 transition-colors"
            >
              Reject Bill
            </button>
          )}
        </div>

        {/* Primary CTA: Electric Emerald Confirm Button */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-brand-emerald-electric text-brand-midnight text-sm font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying & Signing...</span>
            </>
          ) : (
            <>
              <FileCheck className="w-4 h-4" />
              <span>Confirm & Submit to Ledger</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
