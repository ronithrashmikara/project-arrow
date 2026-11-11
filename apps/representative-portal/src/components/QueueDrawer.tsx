import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Trash2,
  FileText,
  X,
  HardDriveDownload,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { QueuedBill, DraftExtractionResult } from '../types/ocr';
import { removeQueuedBill, syncQueue } from '../services/offlineQueue';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueuedBill[];
  isOnline: boolean;
  onSelectDraft: (draft: DraftExtractionResult, previewUrl: string) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  queue,
  isOnline,
  onSelectDraft,
}) => {
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    if (!isOnline) {
      setSyncMsg('Cannot sync while offline. Please connect to the internet or start OCR server.');
      return;
    }

    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncQueue((_bill, _draft) => {
        // Can optionally auto-open first synced
      });
      setSyncMsg(`Sync complete: ${res.synced} processed, ${res.failed} failed.`);
    } catch (err: any) {
      setSyncMsg(err.message || 'Sync failed.');
    }
    setSyncing(false);
  };

  const pendingCount = queue.filter((b) => b.status === 'pending' || b.status === 'failed').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-brand-forest-deep border-l border-brand-teal-mountain/60 h-full flex flex-col shadow-2xl relative">
        {/* Drawer Header */}
        <div className="p-5 border-b border-brand-teal-mountain/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-brand-emerald-fresh" />
            <div>
              <h3 className="text-base font-bold text-brand-white">Offline Capture Queue</h3>
              <p className="text-xs text-brand-seaglass/60">
                {pendingCount} pending upload(s) stored in IndexedDB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-seaglass/70 hover:text-brand-white hover:bg-brand-forest-shadow transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Action Banner */}
        <div className="p-4 bg-brand-forest-shadow/60 border-b border-brand-teal-mountain/30 flex items-center justify-between gap-3">
          <div className="text-xs">
            <span className="text-brand-white font-medium block">
              Auto-sync enabled
            </span>
            <span className="text-brand-seaglass/70 text-[11px]">
              {isOnline ? 'Online: Ready to sync with backend' : 'Offline: Queued locally'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing || pendingCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold hover:bg-brand-emerald-fresh transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-emerald/40"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCw className="w-3.5 h-3.5" />
            )}
            <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        {syncMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-brand-teal-atmospheric/60 border border-brand-teal-mountain text-xs text-brand-emerald-mint">
            {syncMsg}
          </div>
        )}

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {queue.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-brand-seaglass/60">
              <FileText className="w-12 h-12 text-brand-teal-mountain mb-2" />
              <p className="text-sm font-medium text-brand-white">Queue is empty</p>
              <p className="text-xs mt-1 max-w-xs">
                Captured bills will be stored here automatically if you lose network connectivity.
              </p>
            </div>
          ) : (
            queue.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-brand-forest-shadow/70 border border-brand-teal-mountain/50 hover:border-brand-teal-misty transition-all space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt="Thumbnail"
                        className="w-10 h-10 object-cover rounded-lg border border-brand-teal-mountain/40 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-brand-midnight flex items-center justify-center border border-brand-teal-mountain/40 flex-shrink-0">
                        <FileText className="w-5 h-5 text-brand-emerald-fresh" />
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-brand-white truncate max-w-[190px]">
                        {item.fileName}
                      </div>
                      <div className="text-[10px] text-brand-seaglass/60 capitalize mt-0.5">
                        {item.documentType.replace(/_/g, ' ')} • {(item.fileSize / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div>
                    {item.status === 'synced' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-brand-emerald-mint px-2 py-0.5 rounded-full bg-brand-emerald-fresh/15 border border-brand-emerald-fresh/30">
                        <CheckCircle2 className="w-3 h-3 text-brand-emerald-electric" />
                        Synced
                      </span>
                    )}
                    {item.status === 'syncing' && (
                      <span className="flex items-center gap-1 text-[10px] text-brand-seaglass px-2 py-0.5 rounded-full bg-brand-teal-atmospheric animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin text-brand-emerald-electric" />
                        Syncing
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="flex items-center gap-1 text-[10px] text-brand-gold-sunset px-2 py-0.5 rounded-full bg-brand-gold-sunset/15 border border-brand-gold-sunset/40">
                        <Clock className="w-3 h-3" />
                        Queued
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="flex items-center gap-1 text-[10px] text-brand-copper-warm px-2 py-0.5 rounded-full bg-brand-copper-warm/20 border border-brand-copper-warm/40">
                        <AlertTriangle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                {item.error && (
                  <p className="text-[11px] text-brand-gold-sunset bg-brand-copper-warm/15 p-1.5 rounded">
                    {item.error}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-brand-teal-mountain/20 text-[10px] text-brand-seaglass/50">
                  <span>Captured: {new Date(item.capturedAt).toLocaleTimeString()}</span>
                  <div className="flex items-center gap-2">
                    {item.extractedDraft && (
                      <button
                        type="button"
                        onClick={() => {
                          if (item.extractedDraft) {
                            onSelectDraft(item.extractedDraft, item.previewUrl || '');
                            onClose();
                          }
                        }}
                        className="flex items-center gap-1 text-brand-emerald-mint hover:underline font-semibold"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open Review
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeQueuedBill(item.id)}
                      className="p-1 text-brand-seaglass/60 hover:text-brand-gold-sunset transition-colors"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
