import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  FileText,
  AlertTriangle,
  Zap,
  Droplets,
  Flame,
  Fuel,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  HardDriveDownload,
} from 'lucide-react';
import { DocumentType, DraftExtractionResult, ImageQualityAssessment } from '../types/ocr';
import { extractBill } from '../services/api';
import { enqueueBill } from '../services/offlineQueue';

interface BillCaptureProps {
  isOnline: boolean;
  onDraftReady: (draft: DraftExtractionResult, previewUrl: string) => void;
  onQueued: () => void;
}

const DOCUMENT_TYPES: { id: DocumentType; label: string; icon: React.ElementType; sub: string }[] = [
  { id: 'electricity_bill', label: 'Electricity', icon: Zap, sub: 'CEB / LECO' },
  { id: 'water_bill', label: 'Water', icon: Droplets, sub: 'NWSDB' },
  { id: 'lpg_receipt', label: 'LPG Gas', icon: Flame, sub: 'Litro / Laugfs' },
  { id: 'generator_fuel', label: 'Fuel / Diesel', icon: Fuel, sub: 'CEYPETCO / LIOC' },
];

export const BillCapture: React.FC<BillCaptureProps> = ({ isOnline, onDraftReady, onQueued }) => {
  const [selectedType, setSelectedType] = useState<DocumentType>('electricity_bill');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<ImageQualityAssessment | null>(null);
  const [offlineSaved, setOfflineSaved] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setError(null);
    setQualityWarning(null);
    setOfflineSaved(false);

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('File size exceeds the 15MB limit.');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const processBill = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    // If offline, store directly in IndexedDB queue
    if (!isOnline) {
      try {
        await enqueueBill(selectedFile, selectedFile.name, selectedType);
        setOfflineSaved(true);
        setLoading(false);
        onQueued();
      } catch (err: any) {
        setError(err.message || 'Failed to save bill offline.');
        setLoading(false);
      }
      return;
    }

    // If online, send to FastAPI microservice
    try {
      const draft = await extractBill(selectedFile, selectedType, selectedFile.name);
      if (draft.quality_assessment && draft.quality_assessment.warnings?.length > 0) {
        setQualityWarning(draft.quality_assessment);
      }
      setLoading(false);
      onDraftReady(draft, previewUrl || '');
    } catch (err: any) {
      // If network fails during request, offer to enqueue offline
      try {
        await enqueueBill(selectedFile, selectedFile.name, selectedType);
        setOfflineSaved(true);
        setError('Backend unreachable. Bill has been saved to offline queue for automatic sync.');
        onQueued();
      } catch (queueErr) {
        setError(err.message || 'OCR extraction failed.');
      }
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setQualityWarning(null);
    setError(null);
    setOfflineSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className="bg-brand-forest-deep border border-brand-teal-mountain/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-sm">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-brand-teal-atmospheric/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-brand-teal-mountain/30 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald-electric shadow-glow-emerald" />
            <h2 className="text-xl font-semibold text-brand-white tracking-wide">
              Bill Capture & Digitization
            </h2>
          </div>
          <p className="text-xs text-brand-seaglass/70 mt-1">
            Capture utility bills & meter readings with dual PaddleOCR + TrOCR processing.
          </p>
        </div>

        {/* Bill Type Selector Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DOCUMENT_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                  isSelected
                    ? 'bg-brand-teal-atmospheric/90 border border-brand-emerald-electric/60 text-brand-white shadow-glow-emerald/30'
                    : 'bg-brand-forest-shadow/60 border border-brand-teal-mountain/30 text-brand-seaglass/70 hover:border-brand-teal-misty hover:text-brand-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-brand-emerald-electric' : 'text-brand-seaglass/60'}`} />
                <div>
                  <div className="text-xs font-medium leading-none">{type.label}</div>
                  <div className="text-[10px] text-brand-seaglass/50 mt-0.5">{type.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload Zone / Preview */}
      <div className="mt-6">
        {!previewUrl ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center relative ${
              dragActive
                ? 'border-brand-emerald-electric bg-brand-teal-atmospheric/40 scale-[0.99]'
                : 'border-brand-teal-mountain/60 bg-brand-midnight/60 hover:border-brand-emerald-fresh/50 hover:bg-brand-midnight/80'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 rounded-2xl bg-brand-forest-shadow flex items-center justify-center border border-brand-teal-mountain/50 mb-4 shadow-lg">
              <Upload className="w-8 h-8 text-brand-emerald-fresh" />
            </div>

            <h3 className="text-base font-semibold text-brand-white">
              Drop your bill image here, or <span className="text-brand-emerald-electric underline underline-offset-4">browse</span>
            </h3>
            <p className="text-xs text-brand-seaglass/60 mt-2 max-w-sm">
              Supports CEB, LECO, NWSDB, and LPG receipts (JPEG, PNG, WebP up to 15MB). Automatic de-skewing & CLAHE applied.
            </p>

            {/* Mobile / Direct Camera Option */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-teal-atmospheric/80 hover:bg-brand-teal-atmospheric border border-brand-teal-mountain text-xs font-medium text-brand-white transition-colors"
              >
                <Camera className="w-4 h-4 text-brand-emerald-electric" />
                Capture with Camera
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-forest-shadow hover:bg-brand-forest-shadow/80 border border-brand-teal-mountain text-xs font-medium text-brand-seaglass transition-colors"
              >
                <FileText className="w-4 h-4 text-brand-seaglass/70" />
                Select File
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />
          </div>
        ) : (
          /* Preview Mode */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-5 bg-brand-midnight/90 border border-brand-teal-mountain/50 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
              <img
                src={previewUrl}
                alt="Captured Bill Preview"
                className="max-h-80 w-auto object-contain rounded-lg shadow-inner"
              />
              <div className="w-full flex items-center justify-between text-[11px] text-brand-seaglass/70 mt-2 px-1">
                <span className="truncate max-w-[180px]">{selectedFile?.name}</span>
                <span>{selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB` : ''}</span>
              </div>
            </div>

            <div className="md:col-span-7 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-teal-atmospheric/60 border border-brand-teal-mountain text-xs text-brand-emerald-mint">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Ready for OCR Analysis ({DOCUMENT_TYPES.find((d) => d.id === selectedType)?.label})</span>
                </div>

                <h4 className="text-lg font-semibold text-brand-white mt-3">
                  Inspect & Digitise Bill
                </h4>
                <p className="text-xs text-brand-seaglass/70 mt-1 leading-relaxed">
                  The image will be evaluated for blur and glare, de-skewed, and processed through our dual-engine pipeline (PaddleOCR for printed text and TrOCR for handwriting).
                </p>

                {/* Quality Warning Pill if any */}
                {qualityWarning && qualityWarning.warnings?.length > 0 && (
                  <div className="mt-4 p-3 rounded-xl bg-brand-gold-sunset/10 border border-brand-gold-sunset/40 text-brand-gold-sunset">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <AlertTriangle className="w-4 h-4 text-brand-gold-sunset flex-shrink-0" />
                      Image Quality Notice
                    </div>
                    <ul className="text-[11px] text-brand-gold-sunset/90 mt-1 space-y-0.5 list-disc list-inside">
                      {qualityWarning.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Offline Notification */}
                {!isOnline && (
                  <div className="mt-4 p-3 rounded-xl bg-brand-teal-atmospheric/40 border border-brand-teal-mountain/60 text-brand-seaglass">
                    <div className="flex items-center gap-2 text-xs font-medium text-brand-emerald-mint">
                      <HardDriveDownload className="w-4 h-4" />
                      Offline Mode Active
                    </div>
                    <p className="text-[11px] text-brand-seaglass/80 mt-1">
                      You are currently offline. Clicking "Capture & Queue" will store this bill in local IndexedDB storage and auto-sync as soon as your connection is restored.
                    </p>
                  </div>
                )}

                {offlineSaved && (
                  <div className="mt-4 p-3 rounded-xl bg-brand-emerald-fresh/10 border border-brand-emerald-fresh/40 text-brand-emerald-mint flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-brand-emerald-electric" />
                    Bill saved to local offline queue. It will sync automatically when online.
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 rounded-xl bg-brand-copper-warm/15 border border-brand-copper-warm/40 text-brand-gold-sunset text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-brand-teal-mountain/30">
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-brand-teal-mountain/60 text-xs font-medium text-brand-seaglass/80 hover:text-brand-white hover:bg-brand-forest-shadow transition-colors"
                >
                  Change Image
                </button>

                <button
                  type="button"
                  onClick={processBill}
                  disabled={loading || offlineSaved}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isOnline ? 'Running Dual OCR Pipeline...' : 'Saving to Queue...'}</span>
                    </>
                  ) : offlineSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Queued Successfully</span>
                    </>
                  ) : isOnline ? (
                    <>
                      <Zap className="w-4 h-4 fill-current" />
                      <span>Extract & Verify Text</span>
                    </>
                  ) : (
                    <>
                      <HardDriveDownload className="w-4 h-4" />
                      <span>Save to Offline Queue</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
