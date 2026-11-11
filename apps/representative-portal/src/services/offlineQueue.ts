import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DocumentType, QueuedBill, DraftExtractionResult } from '../types/ocr';
import { extractBill } from './api';

const DB_NAME = 'project_arrow_r3_db';
const DB_VERSION = 1;
const QUEUE_STORE = 'bill_queue';

interface ArrowDB extends DBSchema {
  [QUEUE_STORE]: {
    key: string;
    value: QueuedBill;
    indexes: { 'by-status': string; 'by-created': string };
  };
}

let dbPromise: Promise<IDBPDatabase<ArrowDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ArrowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ArrowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-created', 'capturedAt');
        }
      },
    });
  }
  return dbPromise;
}

type QueueListener = (queue: QueuedBill[]) => void;
const listeners: Set<QueueListener> = new Set();

export function subscribeToQueue(callback: QueueListener): () => void {
  listeners.add(callback);
  getQueuedBills().then(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  getQueuedBills().then((items) => {
    listeners.forEach((cb) => cb(items));
  });
}

/** Store a captured bill image in IndexedDB */
export async function enqueueBill(
  blob: Blob,
  fileName: string,
  documentType: DocumentType,
): Promise<QueuedBill> {
  const db = await getDB();
  const id = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const item: QueuedBill = {
    id,
    blob,
    previewUrl: URL.createObjectURL(blob),
    fileName,
    fileSize: blob.size,
    documentType,
    capturedAt: new Date().toISOString(),
    status: 'pending',
  };

  await db.put(QUEUE_STORE, item);
  notifyListeners();
  return item;
}

/** Retrieve all queued bills from IndexedDB */
export async function getQueuedBills(): Promise<QueuedBill[]> {
  const db = await getDB();
  const all = await db.getAll(QUEUE_STORE);
  // Sort newest first
  return all.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
}

/** Delete a bill from the queue */
export async function removeQueuedBill(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(QUEUE_STORE, id);
  notifyListeners();
}

/** Update an existing queued bill record */
export async function updateQueuedBill(item: QueuedBill): Promise<void> {
  const db = await getDB();
  await db.put(QUEUE_STORE, item);
  notifyListeners();
}

/** Process and sync pending queue to FastAPI backend */
export async function syncQueue(
  onBillSuccess?: (bill: QueuedBill, draft: DraftExtractionResult) => void,
): Promise<{ synced: number; failed: number }> {
  const db = await getDB();
  const all = await db.getAll(QUEUE_STORE);
  const pending = all.filter((b) => b.status === 'pending' || b.status === 'failed');

  let syncedCount = 0;
  let failedCount = 0;

  for (const bill of pending) {
    try {
      // Mark as syncing
      bill.status = 'syncing';
      await db.put(QUEUE_STORE, bill);
      notifyListeners();

      // Send to FastAPI OCR service
      const draft = await extractBill(bill.blob, bill.documentType, bill.fileName);

      // Successfully extracted!
      bill.status = 'synced';
      bill.extractedDraft = draft;
      bill.error = undefined;
      await db.put(QUEUE_STORE, bill);
      notifyListeners();

      syncedCount++;
      if (onBillSuccess) {
        onBillSuccess(bill, draft);
      }
    } catch (err: any) {
      bill.status = 'failed';
      bill.error = err.message || 'Network sync failed';
      await db.put(QUEUE_STORE, bill);
      notifyListeners();
      failedCount++;
    }
  }

  return { synced: syncedCount, failed: failedCount };
}
