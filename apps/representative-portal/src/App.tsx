import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BillCapture } from './components/BillCapture';
import { OCRReviewCard } from './components/OCRReviewCard';
import { QueueDrawer } from './components/QueueDrawer';
import { ManualEntryForm } from './components/ManualEntryForm';
import { ExcelImport } from './components/ExcelImport';
import { LedgerHistory } from './components/LedgerHistory';
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
  addLedgerEntry,
  buildOcrLedgerEntry,
  LedgerEntry,
  subscribeToLedger,
  syncOfflineManualEntries,
} from './services/ledgerStore';
import {
  Camera,
  CheckCircle2,
  ClipboardEdit,
  FileSpreadsheet,
  History,
  PlusCircle,
} from 'lucide-react';

type ActiveTab = 'ocr' | 'manual' | 'excel' | 'ledger';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('ocr');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queue, setQueue] = useState<QueuedBill[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState<boolean>(false);
  const [activeDraft, setActiveDraft] = useState<DraftExtractionResult | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string>('');
  const [confirmedResult, setConfirmedResult] = useState<HumanConfirmationResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  /**
   * When OCR extraction is in progress, inference can take 30-90s on CPU.
   * Pausing health-check pings during that window prevents the status pill
   * from flickering to "Offline".
   */
  const isExtractingRef = useRef<boolean>(false);

  // Monitor Network Connectivity & Backend Liveness
  useEffect(() => {
    const updateOnlineStatus = async () => {
      if (isExtractingRef.current) return;

      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const health = await checkBackendHealth();
      setIsOnline(health.online);
    };

    const handleOffline = () => setIsOnline(false);

    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(updateOnlineStatus, 20_000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', handleOffline);
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

  // Subscribe to Confirmed Ledger History
  useEffect(() => {
    const unsubscribe = subscribeToLedger((entries) => {
      setLedgerEntries(entries);
    });
    return unsubscribe;
  }, []);

  // Automatic Background Sync when network returns online
  useEffect(() => {
    if (isOnline) {
      syncOfflineManualEntries();
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
        if (!activeDraft && !confirmedResult) {
          setActiveDraft(draft);
          setActivePreviewUrl(bill.previewUrl || '');
          setActiveTab('ocr');
        }
      });
      syncOfflineManualEntries();
    } catch {}
    setIsSyncing(false);
  };

  const handleDraftReady = (draft: DraftExtractionResult, preview: string) => {
    setActiveDraft(draft);
    setActivePreviewUrl(preview);
    setConfirmedResult(null);
    setActiveTab('ocr');
  };

  const handleConfirmed = (response: HumanConfirmationResponse) => {
    if (activeDraft) {
      const ledgerEntry = buildOcrLedgerEntry({
        documentId: response.document_id,
        documentType: activeDraft.document_type,
        verifiedFields: response.verified_fields,
        confirmedBy: response.confirmed_by || 'Representative',
        confirmedAt: response.confirmed_at,
      });
      addLedgerEntry(ledgerEntry);
    }
    setConfirmedResult(response);
    setActiveDraft(null);
  };

  const startNewCapture = () => {
    setActiveDraft(null);
    setActivePreviewUrl('');
    setConfirmedResult(null);
  };

  const navTabs: { id: ActiveTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'ocr', label: 'Bill Scan & OCR', icon: Camera },
    { id: 'manual', label: 'Manual & Scope 3 Entry', icon: ClipboardEdit },
    { id: 'excel', label: 'TTVC Excel Import', icon: FileSpreadsheet },
    { id: 'ledger', label: 'Confirmed Ledger History', icon: History, badge: ledgerEntries.length },
  ];

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

      {/* Sleek Navigation Bar */}
      <nav className="bg-brand-forest-deep/80 border-b border-brand-teal-mountain/40 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2.5 no-scrollbar">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
                  isActive
                    ? 'bg-brand-emerald-electric text-brand-midnight border-brand-emerald-electric shadow-glow-emerald/40'
                    : 'bg-brand-forest-shadow/60 text-brand-seaglass border-brand-teal-mountain/40 hover:border-brand-emerald-fresh/50 hover:text-brand-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-brand-midnight text-brand-emerald-electric'
                        : 'bg-brand-teal-atmospheric text-brand-emerald-mint'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {activeTab === 'ocr' && (
          <>
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
              <div className="max-w-2xl mx-auto bg-brand-forest-deep border border-brand-teal-mountain/60 rounded-2xl p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 rounded-full bg-brand-emerald-electric/20 border-2 border-brand-emerald-electric text-brand-emerald-electric flex items-center justify-center mx-auto shadow-glow-emerald">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand-emerald-fresh/15 border border-brand-emerald-fresh/40 text-brand-emerald-mint uppercase tracking-wider">
                    Verified & Recorded
                  </span>
                  <h2 className="text-2xl font-bold text-brand-white">
                    Bill Confirmed & Saved
                  </h2>
                  <p className="text-xs text-brand-seaglass/70 max-w-md mx-auto">
                    Verified figures have been recorded in Confirmed Ledger History and prepared for sustainability reporting.
                  </p>
                </div>

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

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={startNewCapture}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Capture Another Bill</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-forest-shadow border border-brand-teal-mountain/60 text-brand-white text-xs font-semibold hover:border-brand-emerald-fresh transition-all"
                  >
                    <History className="w-4 h-4 text-brand-emerald-mint" />
                    <span>View Ledger History</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in duration-200">
                <BillCapture
                  isOnline={isOnline}
                  onDraftReady={handleDraftReady}
                  onQueued={() => setQueueDrawerOpen(true)}
                  onExtractionStart={() => { isExtractingRef.current = true; }}
                  onExtractionEnd={() => { isExtractingRef.current = false; }}
                />
              </div>
            )}
          </>
        )}

        {activeTab === 'manual' && (
          <div className="animate-in fade-in duration-200">
            <ManualEntryForm isOnline={isOnline} />
          </div>
        )}

        {activeTab === 'excel' && (
          <div className="animate-in fade-in duration-200">
            <ExcelImport isOnline={isOnline} />
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="animate-in fade-in duration-200">
            <LedgerHistory entries={ledgerEntries} />
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
