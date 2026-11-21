import readXlsxFile from 'read-excel-file/browser';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { compressPrompt, CompressionAlgorithmId } from './compression';
import { BpeEncoding, countBpeTokens } from './tokenizer';
import { parseDelimitedRows } from './spreadsheetParsing';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type MultimodalKind = 'excel' | 'pdf' | 'image';

export interface SpreadsheetCompressOptions {
  format: 'toon' | 'csv' | 'kv';
  dedupeRows: boolean;
  stripEmptyCols: boolean;
  maxRowsPerSheet: number;
}

export const DEFAULT_SPREADSHEET_OPTIONS: SpreadsheetCompressOptions = {
  format: 'toon',
  dedupeRows: true,
  stripEmptyCols: true,
  maxRowsPerSheet: 500,
};

export interface PdfCompressOptions {
  stripRepeatedHeaders: boolean;
  rejoinHyphens: boolean;
  algorithm: CompressionAlgorithmId;
}

export const DEFAULT_PDF_OPTIONS: PdfCompressOptions = {
  stripRepeatedHeaders: true,
  rejoinHyphens: true,
  algorithm: 'telegraphic',
};

export interface ImageCompressOptions {
  maxEdgePx: 384 | 512 | 768 | 1024 | 1568;
  quality: number;
  format: 'image/webp' | 'image/jpeg';
  grayscale: boolean;
}

export const DEFAULT_IMAGE_OPTIONS: ImageCompressOptions = {
  maxEdgePx: 1024,
  quality: 0.78,
  format: 'image/webp',
  grayscale: false,
};

export interface MultimodalSpreadsheetResult {
  kind: 'excel';
  fileName: string;
  fileBytes: number;
  sheetCount: number;
  totalRows: number;
  keptRows: number;
  strippedEmptyCols: number;
  dedupedRows: number;
  rawTokens: number;
  compressedTokens: number;
  reductionPct: number;
  rawPreview: string;
  compressedText: string;
}

export interface MultimodalPdfResult {
  kind: 'pdf';
  fileName: string;
  fileBytes: number;
  pageCount: number;
  strippedBoilerplateLines: number;
  rawTokens: number;
  compressedTokens: number;
  reductionPct: number;
  rawPreview: string;
  compressedText: string;
}

export interface MultimodalImageResult {
  kind: 'image';
  fileName: string;
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
  byteReductionPct: number;
  originalWidth: number;
  originalHeight: number;
  compressedWidth: number;
  compressedHeight: number;
  gpt4oTokensBefore: number;
  gpt4oTokensAfter: number;
  claudeTokensBefore: number;
  claudeTokensAfter: number;
  geminiTokensBefore: number;
  geminiTokensAfter: number;
  originalPreviewUrl: string;
  compressedDataUrl: string;
  compressedBlob: Blob;
  promptStub: string;
}

export type MultimodalResult =
  | MultimodalSpreadsheetResult
  | MultimodalPdfResult
  | MultimodalImageResult;

export function detectFileKind(file: File): MultimodalKind | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (
    /\.(xlsx|csv|tsv)$/.test(name) ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'text/csv'
  ) {
    return 'excel';
  }
  if (/\.pdf$/.test(name) || type === 'application/pdf') {
    return 'pdf';
  }
  if (
    /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(name) ||
    type.startsWith('image/')
  ) {
    return 'image';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// --- 1. EXCEL / CSV COMPRESSOR ---
export async function compressSpreadsheetFile(
  file: File,
  encoding: BpeEncoding,
  options: SpreadsheetCompressOptions = DEFAULT_SPREADSHEET_OPTIONS
): Promise<MultimodalSpreadsheetResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Spreadsheet exceeds the 10 MB browser processing limit.');
  const sheets = /\.xlsx$/i.test(file.name)
    ? await readXlsxFile(file)
    : [{ sheet: file.name, data: parseDelimitedRows(await file.text(), /\.tsv$/i.test(file.name) ? '\t' : ',') }];

  let totalRows = 0;
  let keptRows = 0;
  let strippedEmptyCols = 0;
  let dedupedRows = 0;

  const rawJsonSheets: Record<string, unknown[]> = {};
  const outSections: string[] = [];

  for (const { sheet: sheetName, data: grid } of sheets.slice(0, 12)) {

    if (grid.length === 0) continue;

    // Normalize cells to compact strings
    const cleanedGrid = grid
      .map((row) =>
        row.map((cell) =>
          String(cell ?? '')
            .replace(/\s+/g, ' ')
            .trim()
        )
      )
      .filter((row) => row.some((c) => c.length > 0));

    if (cleanedGrid.length === 0) continue;

    const maxCols = Math.max(...cleanedGrid.map((r) => r.length));
    const headerRow = cleanedGrid[0];
    const dataRows = cleanedGrid.slice(1);
    totalRows += dataRows.length;

    // Build naive JSON baseline for token comparison
    const rawObjects = dataRows.slice(0, options.maxRowsPerSheet).map((r) => {
      const obj: Record<string, string> = {};
      for (let c = 0; c < maxCols; c++) {
        const key = headerRow[c] || `col_${c + 1}`;
        obj[key] = r[c] ?? '';
      }
      return obj;
    });
    rawJsonSheets[sheetName] = rawObjects;

    // Identify non-empty columns
    const activeColIndices: number[] = [];
    for (let c = 0; c < maxCols; c++) {
      const hasHeader = (headerRow[c] ?? '').length > 0;
      const hasData = dataRows.some((r) => (r[c] ?? '').length > 0);
      if (!options.stripEmptyCols || (hasHeader && hasData) || hasData) {
        activeColIndices.push(c);
      } else {
        strippedEmptyCols += 1;
      }
    }

    const colNames = activeColIndices.map((c, idx) =>
      (headerRow[c] || `c${idx + 1}`).replace(/\|/g, '/')
    );

    const seenRowKeys = new Set<string>();
    const compactRows: string[][] = [];

    for (const row of dataRows) {
      if (compactRows.length >= options.maxRowsPerSheet) break;
      const projected = activeColIndices.map((c) =>
        (row[c] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
      );
      if (!projected.some((v) => v.length > 0)) continue;

      const sig = projected.join('|');
      if (options.dedupeRows && seenRowKeys.has(sig)) {
        dedupedRows += 1;
        continue;
      }
      seenRowKeys.add(sig);
      compactRows.push(projected);
    }

    keptRows += compactRows.length;

    if (options.format === 'toon') {
      const lines = [
        `@SHEET ${sheetName} (${compactRows.length}x${colNames.length})`,
        `cols: ${colNames.join('|')}`,
        ...compactRows.map((r) => r.join('|').replace(/\|+$/, '')),
      ];
      outSections.push(lines.join('\n'));
    } else if (options.format === 'csv') {
      const escapeCsv = (v: string) =>
        /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const lines = [
        colNames.map(escapeCsv).join(','),
        ...compactRows.map((r) => r.map(escapeCsv).join(',')),
      ];
      outSections.push(`# ${sheetName}\n${lines.join('\n')}`);
    } else {
      const kvRows = compactRows.map((r) =>
        r
          .map((val, i) => (val ? `${colNames[i]}=${val}` : ''))
          .filter(Boolean)
          .join('; ')
      );
      outSections.push(`[${sheetName}]\n${kvRows.join('\n')}`);
    }
  }

  const rawBaselineText = JSON.stringify(rawJsonSheets, null, 2);
  const compressedText = outSections.join('\n\n') || '(Empty spreadsheet)';
  const rawTokens = countBpeTokens(rawBaselineText, encoding);
  const compressedTokens = countBpeTokens(compressedText, encoding);
  const reductionPct =
    rawTokens > 0
      ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 1000) / 10)
      : 0;

  return {
    kind: 'excel',
    fileName: file.name,
    fileBytes: file.size,
    sheetCount: sheets.length,
    totalRows,
    keptRows,
    strippedEmptyCols,
    dedupedRows,
    rawTokens,
    compressedTokens,
    reductionPct,
    rawPreview: rawBaselineText.slice(0, 1200),
    compressedText,
  };
}

// --- 2. PDF COMPRESSOR ---
export async function compressPdfFile(
  file: File,
  encoding: BpeEncoding,
  options: PdfCompressOptions = DEFAULT_PDF_OPTIONS
): Promise<MultimodalPdfResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  const lineFreq = new Map<string, number>();

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let currentLine = '';
    const pageLines: string[] = [];
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        if (currentLine.trim()) pageLines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        currentLine += (currentLine && item.str && !currentLine.endsWith(' ') ? ' ' : '') + item.str;
      }
      if ('hasEOL' in item && item.hasEOL) {
        if (currentLine.trim()) pageLines.push(currentLine.trim());
        currentLine = '';
        lastY = null;
      } else {
        lastY = y;
      }
    }
    if (currentLine.trim()) pageLines.push(currentLine.trim());

    const uniquePageLines = new Set(pageLines.map((l) => l.toLowerCase()));
    for (const lineKey of uniquePageLines) {
      lineFreq.set(lineKey, (lineFreq.get(lineKey) ?? 0) + 1);
    }

    pageTexts.push(pageLines.join('\n'));
  }

  const rawExtracted = pageTexts.join('\n\n');
  let strippedBoilerplateLines = 0;

  // Strip repeated headers/footers (appearing on >=3 pages or >40% of multi-page PDFs) + "Page X of Y"
  const minRepeat = Math.max(2, Math.ceil(pdf.numPages * 0.45));
  const cleanedPages = pageTexts.map((pText, idx) => {
    const lines = pText.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^(?:page|hal(?:aman)?)\s*\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(trimmed)) {
        strippedBoilerplateLines += 1;
        return false;
      }
      if (
        options.stripRepeatedHeaders &&
        pdf.numPages >= 3 &&
        trimmed.length <= 90 &&
        (lineFreq.get(trimmed.toLowerCase()) ?? 0) >= minRepeat
      ) {
        strippedBoilerplateLines += 1;
        return false;
      }
      return true;
    });

    let body = lines.join('\n');
    if (options.rejoinHyphens) {
      body = body.replace(/([a-zA-Z])-\n([a-zA-Z])/g, '$1$2');
    }
    return pdf.numPages > 1 ? `[p${idx + 1}] ${body}` : body;
  });

  const normalizedDoc = cleanedPages
    .join('\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const compressedResult = compressPrompt(
    normalizedDoc || rawExtracted,
    options.algorithm,
    encoding
  );

  const rawTokens = countBpeTokens(rawExtracted, encoding);
  const compressedTokens = compressedResult.outputTokens;
  const reductionPct =
    rawTokens > 0
      ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 1000) / 10)
      : 0;

  return {
    kind: 'pdf',
    fileName: file.name,
    fileBytes: file.size,
    pageCount: pdf.numPages,
    strippedBoilerplateLines,
    rawTokens,
    compressedTokens,
    reductionPct,
    rawPreview: rawExtracted.slice(0, 1200),
    compressedText: compressedResult.output || '(No extractable text found — PDF may be scanned images)',
  };
}

// --- 3. IMAGE MULTIMODAL COMPRESSOR ---
function estimateGpt4oVisionTokens(width: number, height: number): number {
  let w = width;
  let h = height;
  if (w > 2048 || h > 2048) {
    const scale = 2048 / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const minSide = Math.min(w, h);
  if (minSide > 768) {
    const scale = 768 / minSide;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const tiles = Math.ceil(w / 512) * Math.ceil(h / 512);
  return 85 + 170 * Math.max(1, tiles);
}

function estimateClaudeVisionTokens(width: number, height: number): number {
  let w = width;
  let h = height;
  if (Math.max(w, h) > 1568) {
    const scale = 1568 / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  return Math.min(1600, Math.max(1, Math.ceil((w * h) / 750)));
}

function estimateGeminiVisionTokens(width: number, height: number): number {
  if (width <= 384 && height <= 384) return 258;
  const tiles = Math.ceil(width / 768) * Math.ceil(height / 768);
  return 258 * Math.max(1, tiles);
}

async function decodeImageDimensions(file: File): Promise<{
  bitmap: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  cleanup?: () => void;
}> {
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(file);
    return {
      bitmap: bmp,
      width: bmp.width,
      height: bmp.height,
      cleanup: () => bmp.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image'));
    el.src = url;
  });
  return {
    bitmap: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to encode data URL'));
    reader.readAsDataURL(blob);
  });
}

export async function compressImageFile(
  file: File,
  options: ImageCompressOptions = DEFAULT_IMAGE_OPTIONS
): Promise<MultimodalImageResult> {
  const originalPreviewUrl = await blobToDataUrl(file);
  const decoded = await decodeImageDimensions(file);

  try {
    const origW = decoded.width;
    const origH = decoded.height;
    const scale = Math.min(1, options.maxEdgePx / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    if (options.format === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    if (options.grayscale) {
      ctx.filter = 'grayscale(100%) contrast(108%)';
    }

    ctx.drawImage(decoded.bitmap, 0, 0, targetW, targetH);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image compression failed'))),
        options.format,
        options.quality
      );
    });

    const compressedDataUrl = await blobToDataUrl(compressedBlob);
    const byteReductionPct =
      file.size > 0
        ? Math.max(
            0,
            Math.round(((file.size - compressedBlob.size) / file.size) * 1000) / 10
          )
        : 0;

    const gpt4oTokensBefore = estimateGpt4oVisionTokens(origW, origH);
    const gpt4oTokensAfter = estimateGpt4oVisionTokens(targetW, targetH);
    const claudeTokensBefore = estimateClaudeVisionTokens(origW, origH);
    const claudeTokensAfter = estimateClaudeVisionTokens(targetW, targetH);
    const geminiTokensBefore = estimateGeminiVisionTokens(origW, origH);
    const geminiTokensAfter = estimateGeminiVisionTokens(targetW, targetH);

    const ext = options.format === 'image/webp' ? 'webp' : 'jpg';
    const promptStub = `@IMG ${file.name} (${targetW}x${targetH} ${ext}, ${formatBytes(compressedBlob.size)}${options.grayscale ? ', grayscale-ocr' : ''})\n@DO Analyze attached image accurately; cite visible text/values verbatim; no speculation.`;

    return {
      kind: 'image',
      fileName: file.name,
      mimeType: options.format,
      originalBytes: file.size,
      compressedBytes: compressedBlob.size,
      byteReductionPct,
      originalWidth: origW,
      originalHeight: origH,
      compressedWidth: targetW,
      compressedHeight: targetH,
      gpt4oTokensBefore,
      gpt4oTokensAfter,
      claudeTokensBefore,
      claudeTokensAfter,
      geminiTokensBefore,
      geminiTokensAfter,
      originalPreviewUrl,
      compressedDataUrl,
      compressedBlob,
      promptStub,
    };
  } finally {
    decoded.cleanup?.();
  }
}
