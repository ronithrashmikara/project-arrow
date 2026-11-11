import React from 'react';
import {
  Wifi,
  WifiOff,
  HardDriveDownload,
  RotateCw,
  Building2,
} from 'lucide-react';
import { QueuedBill } from '../types/ocr';

interface HeaderProps {
  isOnline: boolean;
  queue: QueuedBill[];
  onOpenQueue: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isOnline,
  queue,
  onOpenQueue,
  onSync,
  isSyncing,
}) => {
  const pendingCount = queue.filter((b) => b.status === 'pending' || b.status === 'failed').length;

  return (
    <header className="sticky top-0 z-40 bg-brand-forest-deep/90 backdrop-blur-md border-b border-brand-teal-mountain/40 px-4 sm:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo & Context */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-emerald-electric to-brand-forest-shadow flex items-center justify-center shadow-glow-emerald/30 border border-brand-emerald-mint/40">
            <svg
              className="w-5 h-5 text-brand-midnight fill-current font-bold"
              viewBox="0 0 24 24"
            >
              <path d="M12 2L4 12h5v8h6v-8h5L12 2z" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-brand-white tracking-wide">
                Project Arrow
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-teal-atmospheric/90 border border-brand-teal-mountain text-brand-emerald-mint">
                R3 · Representative
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-brand-seaglass/70">
              <Building2 className="w-3 h-3 text-brand-seaglass/60" />
              <span>Cinnamon Wild Yala · Bill Capture & OCR</span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex items-center gap-3">
          {/* Live Online / Offline Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              isOnline
                ? 'bg-brand-emerald-fresh/10 border-brand-emerald-fresh/40 text-brand-emerald-mint'
                : 'bg-brand-gold-sunset/15 border-brand-gold-sunset/50 text-brand-gold-sunset animate-pulse'
            }`}
          >
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-brand-emerald-electric shadow-glow-emerald" />
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Online (Backend Ready)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-brand-gold-sunset animate-ping" />
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline (Local Queue Active)</span>
              </>
            )}
          </div>

          {/* Pending Sync Queue Pill */}
          <button
            type="button"
            onClick={onOpenQueue}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-forest-shadow/80 hover:bg-brand-forest-shadow border border-brand-teal-mountain/60 text-xs font-medium text-brand-seaglass hover:text-brand-white transition-all relative"
            title="Open Offline Capture Queue"
          >
            <HardDriveDownload className="w-3.5 h-3.5 text-brand-emerald-fresh" />
            <span className="hidden sm:inline">Queue</span>
            {pendingCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-gold-sunset text-brand-midnight">
                {pendingCount}
              </span>
            ) : (
              <span className="text-[11px] text-brand-seaglass/50">0</span>
            )}
          </button>

          {/* Quick Sync Button if items are pending */}
          {pendingCount > 0 && isOnline && (
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald/40"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
