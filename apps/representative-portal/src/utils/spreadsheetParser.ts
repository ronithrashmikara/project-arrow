/**
 * Zero-dependency client-side parser for .csv and .xlsx (TTVC Resource Efficiency) files.
 * Uses browser-native DecompressionStream('deflate-raw') + DOMParser for .xlsx ZIP/XML
 * so no external package is required.
 */

export interface ParsedSpreadsheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

/** Parse a .csv or .xlsx File into headers and row objects. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    return parseCsvText(text, file.name);
  }
  if (lowerName.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    return parseXlsxBuffer(buffer);
  }
  throw new Error('Unsupported file format. Please upload a .xlsx or .csv file.');
}

// ---------------------------------------------------------------------------
// CSV Parser (RFC-4180 compliant)
// ---------------------------------------------------------------------------

function parseCsvText(text: string, fileName: string): ParsedSpreadsheet {
  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) matrix.push(currentRow);
      currentRow = [];
      currentCell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) matrix.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c !== '')) matrix.push(currentRow);

  return matrixToParsedSpreadsheet(matrix, fileName.replace(/\.csv$/i, ''));
}

// ---------------------------------------------------------------------------
// XLSX Parser (ZIP Central Directory + XML)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readZipCentralDirectory(view: DataView, bytes: Uint8Array): Map<string, ZipEntry> {
  // Locate End of Central Directory signature 0x06054b50 from the end
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid .xlsx file: ZIP directory not found.');
  }

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, ZipEntry>();

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function extractZipEntryText(
  view: DataView,
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<string> {
  const lh = entry.localHeaderOffset;
  if (view.getUint32(lh, true) !== 0x04034b50) {
    throw new Error(`Corrupt ZIP entry: ${entry.name}`);
  }
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return new TextDecoder('utf-8').decode(compressed);
  }
  if (entry.compressionMethod === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Browser does not support DecompressionStream for .xlsx files. Please upload .csv instead.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compressed]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  }
  throw new Error(`Unsupported ZIP compression method (${entry.compressionMethod}) in .xlsx file.`);
}

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '').toUpperCase();
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, index - 1);
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedSpreadsheet> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = readZipCentralDirectory(view, bytes);
  const domParser = new DOMParser();

  // 1. Parse shared strings if present
  const sharedStrings: string[] = [];
  const ssEntry = entries.get('xl/sharedStrings.xml');
  if (ssEntry) {
    const ssXml = await extractZipEntryText(view, bytes, ssEntry);
    const ssDoc = domParser.parseFromString(ssXml, 'application/xml');
    const siNodes = Array.from(ssDoc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagName('t'));
      sharedStrings.push(tNodes.map((t) => t.textContent || '').join(''));
    }
  }

  // 2. Find first worksheet name & path
  let sheetName = 'Sheet1';
  const wbEntry = entries.get('xl/workbook.xml');
  if (wbEntry) {
    const wbXml = await extractZipEntryText(view, bytes, wbEntry);
    const wbDoc = domParser.parseFromString(wbXml, 'application/xml');
    const firstSheet = wbDoc.getElementsByTagName('sheet')[0];
    if (firstSheet?.getAttribute('name')) {
      sheetName = firstSheet.getAttribute('name') || 'Sheet1';
    }
  }

  const sheetEntry =
    entries.get('xl/worksheets/sheet1.xml') ||
    Array.from(entries.values()).find((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name));

  if (!sheetEntry) {
    throw new Error('No worksheet found inside the .xlsx workbook.');
  }

  const sheetXml = await extractZipEntryText(view, bytes, sheetEntry);
  const sheetDoc = domParser.parseFromString(sheetXml, 'application/xml');
  const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));

  const matrix: string[][] = [];
  for (const rowNode of rowNodes) {
    const rowArr: string[] = [];
    const cells = Array.from(rowNode.getElementsByTagName('c'));
    for (const cell of cells) {
      const ref = cell.getAttribute('r') || '';
      const colIdx = ref ? colRefToIndex(ref) : rowArr.length;
      const cellType = cell.getAttribute('t');
      let value = '';

      if (cellType === 'inlineStr') {
        const t = cell.getElementsByTagName('t')[0];
        value = t?.textContent || '';
      } else {
        const v = cell.getElementsByTagName('v')[0]?.textContent || '';
        if (cellType === 's') {
          const idx = parseInt(v, 10);
          value = Number.isFinite(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : v;
        } else {
          value = v;
        }
      }

      while (rowArr.length <= colIdx) rowArr.push('');
      rowArr[colIdx] = value.trim();
    }

    if (rowArr.some((c) => c !== '')) {
      matrix.push(rowArr);
    }
  }

  return matrixToParsedSpreadsheet(matrix, sheetName);
}

function matrixToParsedSpreadsheet(matrix: string[][], sheetName: string): ParsedSpreadsheet {
  if (matrix.length < 2) {
    throw new Error('The uploaded file must contain a header row and at least one data row.');
  }

  const rawHeaders = matrix[0];
  const headers = rawHeaders.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const rowObj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const val = (matrix[r][idx] || '').trim();
      if (val) hasValue = true;
      rowObj[header] = val;
    });
    if (hasValue) rows.push(rowObj);
  }

  return { sheetName, headers, rows };
}
