import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { parseSpreadsheetFile, ParsedSpreadsheet } from '../utils/spreadsheetParser';
import { addLedgerEntries, computeSha256, LedgerEntry } from '../services/ledgerStore';

interface ExcelImportProps {
  isOnline: boolean;
  onImported?: () => void;
}

function inferScopeAndMetric(row: Record<string, string>, headers: string[]): {
  category: string;
  scope: 'Scope 1' | 'Scope 2' | 'Scope 3';
  summaryValue: string;
  numericValue?: number;
  unit?: string;
  periodOrDate: string;
} {
  const lowerMap = new Map<string, string>();
  headers.forEach((h) => lowerMap.set(h.toLowerCase(), row[h] || ''));

  const findVal = (keys: string[]): string => {
    for (const [k, v] of lowerMap.entries()) {
      if (keys.some((needle) => k.includes(needle)) && v) return v;
    }
    return '';
  };

  const category =
    findVal(['category', 'utility', 'source', 'type', 'activity', 'item']) ||
    'TTVC Resource Entry';
  const periodOrDate =
    findVal(['month', 'period', 'date', 'year']) || new Date().toISOString().slice(0, 7);
  const unit = findVal(['unit', 'uom']) || '';
  const qtyRaw = findVal(['quantity', 'qty', 'usage', 'consumption', 'kwh', 'm3', 'kg', 'liters', 'litres', 'amount', 'value']);

  const parsedNum = parseFloat(qtyRaw.replace(/,/g, ''));
  const numericValue = Number.isFinite(parsedNum) ? parsedNum : undefined;

  const catUpper = `${category} ${unit}`.toUpperCase();
  let scope: 'Scope 1' | 'Scope 2' | 'Scope 3' = 'Scope 2';
  if (catUpper.includes('LPG') || catUpper.includes('DIESEL') || catUpper.includes('FUEL') || catUpper.includes('PETROL') || catUpper.includes('GAS')) {
    scope = 'Scope 1';
  } else if (catUpper.includes('WATER') || catUpper.includes('WASTE') || catUpper.includes('LAUNDRY') || catUpper.includes('TRANSPORT') || catUpper.includes('M3')) {
    scope = 'Scope 3';
  }

  const summaryValue =
    numericValue !== undefined
      ? `${numericValue.toLocaleString()}${unit ? ` ${unit}` : ''}`
      : qtyRaw || '—';

  return { category, scope, summaryValue, numericValue, unit: unit || undefined, periodOrDate };
}

export const ExcelImport: React.FC<ExcelImportProps> = ({ isOnline, onImported }) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [submittedBy, setSubmittedBy] = useState<string>('Hotel Sustainability Rep');
  const [parsing, setParsing] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setImportedCount(null);
    setParsing(true);
    try {
      const result = await parseSpreadsheetFile(file);
      setSelectedFile(file);
      setParsed(result);
    } catch (err: any) {
      setError(err?.message || 'Could not read spreadsheet file.');
      setSelectedFile(null);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setParsed(null);
    setError(null);
    setImportedCount(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!parsed || !selectedFile) return;
    if (!submittedBy.trim()) {
      setError('Please enter your name or staff ID before importing.');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const fileBuffer = await selectedFile.arrayBuffer();
      const fileHash = await computeSha256(fileBuffer);
      const timestamp = new Date().toISOString();

      const entries: LedgerEntry[] = parsed.rows.map((row, idx) => {
        const meta = inferScopeAndMetric(row, parsed.headers);
        return {
          id: `excel-${fileHash.slice(0, 8)}-${idx}-${Date.now()}`,
          source: 'excel_import',
          category: meta.category,
          scope: meta.scope,
          summaryValue: meta.summaryValue,
          numericValue: meta.numericValue,
          unit: meta.unit,
          periodOrDate: meta.periodOrDate,
          accountOrRef: `${selectedFile.name} (Row ${idx + 2})`,
          submittedBy: submittedBy.trim(),
          timestamp,
          evidenceHash: fileHash,
          syncStatus: isOnline ? 'synced' : 'queued_offline',
          details: row,
        };
      });

      addLedgerEntries(entries);
      setImportedCount(entries.length);
      onImported?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to import rows into ledger.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-brand-forest-deep border border-brand-teal-mountain/40 rounded-2xl p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-brand-teal-mountain/30 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald-electric shadow-glow-emerald" />
            <h2 className="text-xl font-semibold text-brand-white tracking-wide">
              TTVC Excel Workbook Import
            </h2>
          </div>
          <p className="text-xs text-brand-seaglass/70 mt-1">
            Upload legacy TTVC Resource Efficiency workbooks (.xlsx or .csv) to preview and import historical readings.
          </p>
        </div>

        {selectedFile && (
          <button
            type="button"
            onClick={clearFile}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-teal-mountain/60 text-xs text-brand-seaglass hover:text-brand-white hover:bg-brand-forest-shadow transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear File</span>
          </button>
        )}
      </div>

      {/* Upload Dropzone */}
      {!parsed && (
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
            dragActive
              ? 'border-brand-emerald-electric bg-brand-teal-atmospheric/40'
              : 'border-brand-teal-mountain/60 bg-brand-midnight/60 hover:border-brand-emerald-fresh/50 hover:bg-brand-midnight/80'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-brand-forest-shadow border border-brand-teal-mountain/50 flex items-center justify-center mb-4">
            {parsing ? (
              <Loader2 className="w-7 h-7 text-brand-emerald-electric animate-spin" />
            ) : (
              <FileSpreadsheet className="w-7 h-7 text-brand-emerald-fresh" />
            )}
          </div>
          <h3 className="text-base font-semibold text-brand-white">
            Drop your TTVC workbook here, or{' '}
            <span className="text-brand-emerald-electric underline underline-offset-4">browse</span>
          </h3>
          <p className="text-xs text-brand-seaglass/60 mt-2 max-w-md">
            Supports Excel (.xlsx) and Comma-Separated (.csv) files with header columns such as Month, Category, Quantity, and Unit.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-teal-atmospheric/80 border border-brand-teal-mountain text-xs font-medium text-brand-white">
            <Upload className="w-4 h-4 text-brand-emerald-electric" />
            <span>Select Spreadsheet File</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-brand-copper-warm/15 border border-brand-copper-warm/40 text-brand-gold-sunset text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Preview Table */}
      {parsed && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-brand-forest-shadow/70 border border-brand-teal-mountain/40 text-xs">
            <div className="flex items-center gap-2 text-brand-white font-medium">
              <FileSpreadsheet className="w-4 h-4 text-brand-emerald-electric" />
              <span>{selectedFile?.name}</span>
              <span className="text-brand-seaglass/60">• Sheet: {parsed.sheetName}</span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-brand-emerald-electric/15 text-brand-emerald-mint font-semibold">
              {parsed.rows.length} rows ready to import
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-brand-teal-mountain/50 bg-brand-midnight/80 max-h-80">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-brand-forest-shadow text-brand-seaglass border-b border-brand-teal-mountain/50">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-[11px] text-brand-seaglass/60">#</th>
                  {parsed.headers.map((h) => (
                    <th key={h} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-teal-mountain/25">
                {parsed.rows.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="hover:bg-brand-forest-shadow/40 transition-colors">
                    <td className="py-2 px-3 text-brand-seaglass/50 font-mono">{idx + 1}</td>
                    {parsed.headers.map((h) => (
                      <td key={h} className="py-2 px-3 text-brand-white whitespace-nowrap">
                        {row[h] || <span className="text-brand-seaglass/30">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsed.rows.length > 50 && (
            <p className="text-[11px] text-brand-seaglass/60">
              Showing first 50 rows of {parsed.rows.length}. All {parsed.rows.length} rows will be imported.
            </p>
          )}

          {importedCount !== null && (
            <div className="p-3.5 rounded-xl bg-brand-emerald-fresh/10 border border-brand-emerald-fresh/40 text-brand-emerald-mint text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald-electric flex-shrink-0" />
              <span>
                Successfully imported {importedCount} workbook rows into Confirmed Ledger History.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-brand-teal-mountain/30">
            <div className="flex items-center gap-2">
              <label className="text-xs text-brand-seaglass whitespace-nowrap">Imported By:</label>
              <input
                type="text"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-brand-midnight border border-brand-teal-mountain/60 text-xs text-brand-white focus:outline-none focus:border-brand-emerald-electric"
              />
            </div>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || importedCount !== null}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-brand-emerald-electric text-brand-midnight text-xs font-bold tracking-wide hover:bg-brand-emerald-fresh transition-all shadow-glow-emerald disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importing Rows...</span>
                </>
              ) : importedCount !== null ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Imported to Ledger</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Import {parsed.rows.length} Rows</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
