import React, { useState } from 'react';
import {
  FileCheck2,
  Search,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  HardDriveDownload,
} from 'lucide-react';
import { LedgerEntry, LedgerSource } from '../services/ledgerStore';

interface LedgerHistoryProps {
  entries: LedgerEntry[];
}

const SOURCE_LABELS: Record<LedgerSource, string> = {
  ocr_bill: 'Bill Scan',
  manual_entry: 'Manual Entry',
  excel_import: 'TTVC Import',
};

export const LedgerHistory: React.FC<LedgerHistoryProps> = ({ entries }) => {
  const [search, setSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'all' | LedgerSource>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = entries.filter((entry) => {
    if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.category.toLowerCase().includes(q) ||
      entry.summaryValue.toLowerCase().includes(q) ||
      (entry.accountOrRef || '').toLowerCase().includes(q) ||
      entry.periodOrDate.toLowerCase().includes(q) ||
      entry.submittedBy.toLowerCase().includes(q) ||
      entry.evidenceHash.toLowerCase().includes(q)
    );
  });

  const copyHash = async (id: string, hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="bg-brand-forest-deep border border-brand-teal-mountain/40 rounded-2xl p-6 shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-brand-teal-mountain/30 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald-electric shadow-glow-emerald" />
            <h2 className="text-xl font-semibold text-brand-white tracking-wide">
              Confirmed Ledger History
            </h2>
          </div>
          <p className="text-xs text-brand-seaglass/70 mt-1">
            Verified utility bills, manual activity records, and imported TTVC workbook entries with SHA-256 evidence hashes.
          </p>
        </div>

        {/* Summary Badge */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-forest-shadow/80 border border-brand-teal-mountain/50 text-xs">
          <FileCheck2 className="w-4 h-4 text-brand-emerald-electric" />
          <span className="text-brand-seaglass">Total Records:</span>
          <span className="font-bold text-brand-white">{entries.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-brand-seaglass/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by account, category, period, or hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-brand-midnight border border-brand-teal-mountain/60 text-xs text-brand-white placeholder:text-brand-seaglass/40 focus:outline-none focus:border-brand-emerald-electric"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'ocr_bill', 'manual_entry', 'excel_import'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSourceFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                sourceFilter === tab
                  ? 'bg-brand-teal-atmospheric border-brand-emerald-electric/60 text-brand-white'
                  : 'bg-brand-forest-shadow/60 border-brand-teal-mountain/40 text-brand-seaglass/70 hover:text-brand-white'
              }`}
            >
              {tab === 'all' ? 'All Sources' : SOURCE_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Table */}
      {filtered.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-brand-teal-mountain/50 rounded-2xl bg-brand-midnight/40 space-y-2">
          <Clock className="w-8 h-8 text-brand-seaglass/40 mx-auto" />
          <p className="text-sm font-medium text-brand-white">No confirmed records yet</p>
          <p className="text-xs text-brand-seaglass/60">
            Confirmed bills, manual readings, and imported spreadsheets will appear here with their evidence hashes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-teal-mountain/50 bg-brand-midnight/80">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-brand-forest-shadow text-brand-seaglass border-b border-brand-teal-mountain/50">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Source</th>
                <th className="py-3 px-4 font-semibold">Category & Scope</th>
                <th className="py-3 px-4 font-semibold">Confirmed Value</th>
                <th className="py-3 px-4 font-semibold">Period / Ref</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">SHA-256 Evidence Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-teal-mountain/25">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-brand-forest-shadow/40 transition-colors">
                  <td className="py-3 px-4 text-brand-seaglass whitespace-nowrap">
                    <div>{new Date(entry.timestamp).toLocaleDateString()}</div>
                    <div className="text-[10px] text-brand-seaglass/50">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-brand-teal-atmospheric/70 border border-brand-teal-mountain/60 text-brand-emerald-mint">
                      {SOURCE_LABELS[entry.source]}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-medium text-brand-white">{entry.category}</div>
                    <div className="text-[10px] text-brand-seaglass/60">
                      {entry.scope} • {entry.submittedBy}
                    </div>
                  </td>

                  <td className="py-3 px-4 font-semibold text-brand-emerald-electric whitespace-nowrap">
                    {entry.summaryValue}
                  </td>

                  <td className="py-3 px-4 text-brand-seaglass">
                    <div>{entry.periodOrDate}</div>
                    {entry.accountOrRef && (
                      <div className="text-[10px] text-brand-seaglass/60 truncate max-w-[160px]">
                        {entry.accountOrRef}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    {entry.syncStatus === 'synced' ? (
                      <span className="inline-flex items-center gap-1 text-brand-emerald-mint">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald-electric" />
                        <span>Synced</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-brand-gold-sunset">
                        <HardDriveDownload className="w-3.5 h-3.5" />
                        <span>Queued</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-brand-seaglass/80 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span title={entry.evidenceHash}>
                        {entry.evidenceHash.slice(0, 10)}…{entry.evidenceHash.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyHash(entry.id, entry.evidenceHash)}
                        className="p-1 rounded hover:bg-brand-forest-shadow text-brand-seaglass/60 hover:text-brand-white transition-colors"
                        title="Copy full SHA-256 hash"
                      >
                        {copiedId === entry.id ? (
                          <Check className="w-3.5 h-3.5 text-brand-emerald-electric" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
