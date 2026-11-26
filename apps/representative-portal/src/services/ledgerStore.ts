import { DocumentType } from '../types/ocr';

export type LedgerSource = 'ocr_bill' | 'manual_entry' | 'excel_import';

export interface LedgerEntry {
  id: string;
  source: LedgerSource;
  category: string;
  scope: 'Scope 1' | 'Scope 2' | 'Scope 3';
  summaryValue: string;
  numericValue?: number;
  unit?: string;
  periodOrDate: string;
  accountOrRef?: string;
  submittedBy: string;
  timestamp: string;
  evidenceHash: string;
  syncStatus: 'synced' | 'queued_offline';
  details: Record<string, any>;
}

const LEDGER_STORAGE_KEY = 'project_arrow_confirmed_ledger_v1';

const listeners = new Set<(entries: LedgerEntry[]) => void>();

function notifyListeners(entries: LedgerEntry[]) {
  listeners.forEach((cb) => cb(entries));
}

/** Read all confirmed ledger entries from localStorage (newest first). */
export function getLedgerEntries(): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLedgerEntries(entries: LedgerEntry[]) {
  try {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors gracefully
  }
  notifyListeners(entries);
}

/** Subscribe to live updates of the confirmed ledger. */
export function subscribeToLedger(callback: (entries: LedgerEntry[]) => void): () => void {
  listeners.add(callback);
  callback(getLedgerEntries());
  return () => {
    listeners.delete(callback);
  };
}

/** Compute SHA-256 hex digest using Web Crypto API. */
export async function computeSha256(input: string | ArrayBuffer): Promise<string> {
  try {
    const data =
      typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback deterministic hex string if SubtleCrypto is unavailable
    const str = typeof input === 'string' ? input : String(input.byteLength);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

/** Append a single confirmed entry to the ledger. */
export function addLedgerEntry(entry: LedgerEntry): LedgerEntry[] {
  const existing = getLedgerEntries();
  const updated = [entry, ...existing];
  saveLedgerEntries(updated);
  return updated;
}

/** Append multiple entries (e.g. from TTVC Excel import) to the ledger. */
export function addLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
  const existing = getLedgerEntries();
  const updated = [...entries, ...existing];
  saveLedgerEntries(updated);
  return updated;
}

/** Mark any offline-queued manual entries as synced when connectivity returns. */
export function syncOfflineManualEntries(): number {
  const existing = getLedgerEntries();
  let syncedCount = 0;
  const updated = existing.map((item) => {
    if (item.syncStatus === 'queued_offline') {
      syncedCount += 1;
      return { ...item, syncStatus: 'synced' as const };
    }
    return item;
  });
  if (syncedCount > 0) {
    saveLedgerEntries(updated);
  }
  return syncedCount;
}

/** Helper to derive GHG scope and primary metric from an OCR confirmed bill. */
export function buildOcrLedgerEntry(params: {
  documentId: string;
  documentType: DocumentType;
  verifiedFields: Record<string, any>;
  confirmedBy: string;
  confirmedAt: string;
}): LedgerEntry {
  const { documentId, documentType, verifiedFields, confirmedBy, confirmedAt } = params;

  const scopeMap: Record<DocumentType, 'Scope 1' | 'Scope 2' | 'Scope 3'> = {
    electricity_bill: 'Scope 2',
    water_bill: 'Scope 3',
    lpg_receipt: 'Scope 1',
    generator_fuel: 'Scope 1',
    meter_reading: 'Scope 2',
    general_expense: 'Scope 3',
  };

  const labelMap: Record<DocumentType, string> = {
    electricity_bill: 'Electricity Bill (CEB / LECO)',
    water_bill: 'Water Bill (NWSDB)',
    lpg_receipt: 'LPG Gas Receipt',
    generator_fuel: 'Generator / Transport Fuel',
    meter_reading: 'Meter Reading',
    general_expense: 'General Expense',
  };

  let summaryValue = '—';
  let numericValue: number | undefined;
  let unit: string | undefined;

  if (verifiedFields.units_kwh != null) {
    numericValue = Number(verifiedFields.units_kwh);
    unit = 'kWh';
    summaryValue = `${numericValue.toLocaleString()} kWh`;
  } else if (verifiedFields.units_m3 != null) {
    numericValue = Number(verifiedFields.units_m3);
    unit = 'm³';
    summaryValue = `${numericValue.toLocaleString()} m³`;
  } else if (verifiedFields.quantity_kg_or_liters != null) {
    numericValue = Number(verifiedFields.quantity_kg_or_liters);
    unit = documentType === 'lpg_receipt' ? 'kg' : 'L';
    summaryValue = `${numericValue.toLocaleString()} ${unit}`;
  } else if (verifiedFields.total_amount != null) {
    numericValue = Number(verifiedFields.total_amount);
    unit = 'LKR';
    summaryValue = `Rs. ${numericValue.toLocaleString()}`;
  }

  return {
    id: `ocr-${documentId.slice(0, 12)}-${Date.now()}`,
    source: 'ocr_bill',
    category: labelMap[documentType] || documentType,
    scope: scopeMap[documentType] || 'Scope 2',
    summaryValue,
    numericValue,
    unit,
    periodOrDate: String(verifiedFields.billing_period || confirmedAt.slice(0, 10)),
    accountOrRef: verifiedFields.account_number ? String(verifiedFields.account_number) : undefined,
    submittedBy: confirmedBy,
    timestamp: confirmedAt,
    evidenceHash: documentId,
    syncStatus: 'synced',
    details: verifiedFields,
  };
}
