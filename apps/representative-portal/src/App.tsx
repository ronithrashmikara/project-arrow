import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BillCapture } from './components/BillCapture';
import { OCRReviewCard } from './components/OCRReviewCard';
import { QueueDrawer } from './components/QueueDrawer';
import {
  DraftExtractionResult,
  HumanConfirmationResponse,
  QueuedBill,
} from './types/ocr';
import { checkBackendHealth } from './services/api';
import {
  subscribeToQueue,
  syncQueue,
} from './services/offlineQueue';
import {
  ShieldCheck,
  CheckCircle2,
  PlusCircle,
  Lock,
  TrendingDown,
} from 'lucide-react';

export const App: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queue, setQueue] = useState<QueuedBill[]>([]);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState<boolean>(false);
  const [activeDraft, setActiveDraft] = useState<DraftExtractionResult | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string>('');
  const [confirmedResult, setConfirmedResult] = useState<HumanConfirmationResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Monitor Network Connectivity & Backend Liveness
  useEffect(() => {
    const updateOnlineStatus = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const health = await checkBackendHealth();
      setIsOnline(health.online);
    };

    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', () => setIsOnline(false));

    // Periodic ping to backend every 12 seconds
    const interval = setInterval(updateOnlineStatus, 12000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', () => setIsOnline(false));
      clearInterval(interval);
    };
  }, []);

  // Subscribe to IndexedDB Queue updates
  useEffect(() => {
    const unsubscribe = subscribeToQueue((items) => {
      setQueue(items);
    });
    return unsubscribe;
  }, []);

  // Automatic Background Sync when network returns online
  useEffect(() => {
    if (isOnline) {
      const pending = queue.filter((b) => b.status === 'pending' || b.status === 'failed');
      if (pending.length > 0 && !isSyncing) {
        handleSync();
      }
    }
  }, [isOnline]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncQueue((bill, draft) => {
        // If user is currently idling, offer the draft for review
        if (!activeDraft && !confirmedResult) {
          setActiveDraft(draft);
          setActivePreviewUrl(bill.previewUrl || '');
        }
      });
    } catch {}
    setIsSyncing(false);
  };

  const handleDraftReady = (draft: DraftExtractionResult, preview: string) => {
    setActiveDraft(draft);
    setActivePreviewUrl(preview);
    setConfirmedResult(null);
  };

  const handleConfirmed = (response: HumanConfirmationResponse) => {
    setConfirmedResult(response);
    setActiveDraft(null);
  };

  const startNewCapture = () => {
    setActiveDraft(null);
    setActivePreviewUrl('');
    setConfirmedResult(null);
  };

  return (
    <div className="min-h-screen bg-brand-midnight text-brand-white flex flex-col font-sans">
      {/* Top Application Header */}
      <Header
        isOnline={isOnline}
        queue={queue}
        onOpenQueue={() => setQueueDrawerOpen(true)}
        onSync={handleSync}
        isSyncing={isSyncing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* State 1: Active Draft awaiting Human-in-the-Loop Confirmation */}
        {activeDraft ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            <button
              onClick={startNewCapture}
              className="text-xs text-brand-seaglass/70 hover:text-brand-white flex items-center gap-1 transition-colors"
            >
              ← Back to Capture
            </button>
            <OCRReviewCard
              draft={activeDraft}
              previewUrl={activePreviewUrl}
              onConfirmed={handleConfirmed}
              onCancel={startNewCapture}
            />
          </div>
        ) : confirmedResult ? (
          /* State 2: Confirmation Success / Submitted to Ledger */
          <div className="max-w-2xl mx-auto bg-brand-forest-deep border border-brand-teal-mountain/60 rounded-2xl p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-brand-emerald-electric/20 border-2 border-brand-emerald-electric text-brand-emerald-electric flex items-center justify-center mx-auto shadow-glow-emerald">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand-emerald-fresh/15 border border-brand-emerald-fresh/40 text-brand-emerald-mint uppercase tracking-wider">
                Audited & Verified
              </span>
              <h2 className="text-2xl font-bold text-brand-white">
                Bill Confirmed & Signed
              </h2>
              <p className="text-xs text-brand-seaglass/70 max-w-md mx-auto">
                Verified figures have been securely accepted into Project Arrow's GHG calculation pipeline. Evidence hash has been recorded for Polygon Amoy ledger anchoring.
              </p>
            </div>

            {/* Verified Fields Summary Box */}
            <div className="bg-brand-midnight/90 border border-brand-teal-mountain/50 rounded-xl p-4 text-left font-mono text-xs space-y-2">
              <div className="flex justify-between text-brand-seaglass/50 text-[10px] pb-1 border-b border-brand-teal-mountain/30">
                <span>VERIFIED FIELD</span>
                <span>COMMITTED VALUE</span>
              </div>
              {Object.entries(confirmedResult.verified_fields).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-0.5">
                  <span className="text-brand-seaglass capitalize">{k.replace(/_/g, ' ')}:</span>
                  <span className="text-brand-emerald-mint font-bold">{String(v)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-brand-teal-mountain/30 text-[10px] text-brand-seaglass/60 flex justify-between">
                <span>Confirmed By: {confirmedResult.confirmed_by}</span>
                <span>{new Date(confirmedResult.confirmed_at).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={startNewCapture}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Capture Another Bill</span>
            </button>
          </div>
        ) : (
          /* State 3: Normal Capture View */
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Capture Component */}
            <BillCapture
              isOnline={isOnline}
              onDraftReady={handleDraftReady}
              onQueued={() => setQueueDrawerOpen(true)}
            />

            {/* Information Grid for Representative Staff */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-5 rounded-2xl bg-brand-forest-shadow/50 border border-brand-teal-mountain/30 space-y-2">
                <div className="flex items-center gap-2 text-brand-emerald-fresh text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-brand-emerald-electric" />
                  Dual OCR Protection
                </div>
                <h4 className="text-sm font-semibold text-brand-white">PaddleOCR + TrOCR Fusion</h4>
                <p className="text-xs text-brand-seaglass/70 leading-relaxed">
                  Printed bill structures are detected via PaddleOCR. Unclear figures and handwriting crops are routed to TrOCR for digit-level confidence scoring.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-brand-forest-shadow/50 border border-brand-teal-mountain/30 space-y-2">
                <div className="flex items-center gap-2 text-brand-gold-sunset text-xs font-semibold">
                  <Lock className="w-4 h-4 text-brand-gold-sunset" />
                  Mandatory Human Confirmation
                </div>
                <h4 className="text-sm font-semibold text-brand-white">HITL Audit Guard</h4>
                <p className="text-xs text-brand-seaglass/70 leading-relaxed">
                  Low-confidence numbers are highlighted with Sunset Gold borders. No unverified draft figure enters the certified reporting ledger.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-brand-forest-shadow/50 border border-brand-teal-mountain/30 space-y-2">
                <div className="flex items-center gap-2 text-brand-emerald-mint text-xs font-semibold">
                  <TrendingDown className="w-4 h-4 text-brand-emerald-electric" />
                  Offline-First Architecture
                </div>
                <h4 className="text-sm font-semibold text-brand-white">IndexedDB Local Queue</h4>
                <p className="text-xs text-brand-seaglass/70 leading-relaxed">
                  Capture bills during field inspections without mobile internet. All documents queue locally and auto-sync when network connectivity returns.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-over Queue Drawer */}
      <QueueDrawer
        isOpen={queueDrawerOpen}
        onClose={() => setQueueDrawerOpen(false)}
        queue={queue}
        isOnline={isOnline}
        onSelectDraft={handleDraftReady}
      />
    </div>
  );
};
