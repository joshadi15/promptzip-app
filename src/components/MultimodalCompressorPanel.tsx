import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { copyTextToClipboard, downloadBlobFile } from '../lib/browserUtils';
import {
  compressImageFile,
  compressPdfFile,
  compressSpreadsheetFile,
  DEFAULT_IMAGE_OPTIONS,
  DEFAULT_PDF_OPTIONS,
  DEFAULT_SPREADSHEET_OPTIONS,
  detectFileKind,
  formatBytes,
  ImageCompressOptions,
  MultimodalResult,
  PdfCompressOptions,
  SpreadsheetCompressOptions,
} from '../lib/multimodalCompressor';
import { BpeEncoding } from '../lib/tokenizer';

interface MultimodalCompressorPanelProps {
  encoding: BpeEncoding;
  onInsertIntoPrompt: (text: string, mode: 'replace' | 'append') => void;
  onNotify: (message: string) => void;
}

export function MultimodalCompressorPanel({
  encoding,
  onInsertIntoPrompt,
  onNotify,
}: MultimodalCompressorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runIdRef = useRef(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MultimodalResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [sheetOpts, setSheetOpts] = useState<SpreadsheetCompressOptions>(
    DEFAULT_SPREADSHEET_OPTIONS
  );
  const [pdfOpts, setPdfOpts] = useState<PdfCompressOptions>(DEFAULT_PDF_OPTIONS);
  const [imageOpts, setImageOpts] = useState<ImageCompressOptions>(DEFAULT_IMAGE_OPTIONS);

  const runCompression = async (
    file: File,
    sOpts: SpreadsheetCompressOptions,
    pOpts: PdfCompressOptions,
    iOpts: ImageCompressOptions
  ) => {
    const runId = ++runIdRef.current;
    setResult(null);
    const kind = detectFileKind(file);
    if (!kind) {
      setIsProcessing(false);
      setErrorMsg(
        `Unsupported file type (${file.name}). Use .xlsx, .csv, .tsv, .pdf, or a common image format. Legacy .xls and .ods files need conversion to .xlsx first.`
      );
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      if (kind === 'excel') {
        const res = await compressSpreadsheetFile(file, encoding, sOpts);
        if (runIdRef.current === runId) setResult(res);
      } else if (kind === 'pdf') {
        const res = await compressPdfFile(file, encoding, pOpts);
        if (runIdRef.current === runId) setResult(res);
      } else {
        const res = await compressImageFile(file, iOpts);
        if (runIdRef.current === runId) setResult(res);
      }
    } catch (err) {
      if (runIdRef.current === runId) setErrorMsg(
        err instanceof Error ? err.message : 'Failed to process file locally.'
      );
    } finally {
      if (runIdRef.current === runId) setIsProcessing(false);
    }
  };

  // Re-run automatically when user tweaks options for the current file
  useEffect(() => {
    if (!selectedFile) return;
    void runCompression(selectedFile, sheetOpts, pdfOpts, imageOpts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, encoding, sheetOpts, pdfOpts, imageOpts]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 25 * 1024 * 1024) {
      runIdRef.current++;
      setSelectedFile(null);
      setResult(null);
      setIsProcessing(false);
      setErrorMsg('File exceeds the 25 MB browser processing limit. Choose a smaller file.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleCopy = async (text: string, key: string, toastMsg: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      onNotify(toastMsg);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } else {
      onNotify('Clipboard access failed');
    }
  };

  const handleDownloadBlob = (blob: Blob, filename: string) => {
    downloadBlobFile(blob, filename);
    onNotify(`Downloaded ${filename}`);
  };

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Multimodal Data Compressor (Excel / PDF / Image)
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Drop or upload spreadsheets, PDFs, or images to compress them locally for fewer LLM & Vision tokens.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedFile && (
            <button
              type="button"
              onClick={() => {
                runIdRef.current++;
                setSelectedFile(null);
                setResult(null);
                setErrorMsg(null);
                setIsProcessing(false);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear file
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Choose Excel / PDF / Image
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv,.pdf,image/*"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Dropzone when no file selected */}
      {!selectedFile && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-6 text-center transition-colors ${
            isDragging
              ? 'border-teal-600 bg-teal-50/60 dark:border-teal-400 dark:bg-teal-950/30'
              : 'border-zinc-300 bg-[#F7FAFB]/70 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center gap-5 text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <FileSpreadsheet className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              Excel / CSV → TOON
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <FileText className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
              PDF → Clean Prompt
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <ImageIcon className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              Image → Low Vision Tokens
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Drag & drop a file here or click to browse · File content stays in your browser
          </p>
        </div>
      )}

      {isProcessing && (
        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Compressing {selectedFile?.name} locally...
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Result View: EXCEL / CSV */}
      {result && result.kind === 'excel' && !isProcessing && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                <FileSpreadsheet className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                {result.fileName}
              </span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                {result.sheetCount} sheet(s) · {result.keptRows} rows · {result.strippedEmptyCols} empty cols removed · {result.dedupedRows} dupes dropped
              </span>
            </div>

            <div className="font-mono text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              {result.rawTokens.toLocaleString()} → {result.compressedTokens.toLocaleString()} tokens (-
              {result.reductionPct}%)
            </div>
          </div>

          {/* Visual Bar */}
          <div className="space-y-1.5">
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-teal-600 transition-all duration-300 dark:bg-teal-500"
                style={{
                  width: `${Math.max(4, 100 - result.reductionPct)}%`,
                }}
              />
            </div>
          </div>

          {/* Excel Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#F7FAFB] px-4 py-2.5 text-xs dark:bg-zinc-950/60">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span>Format</span>
                <select
                  value={sheetOpts.format}
                  onChange={(e) =>
                    setSheetOpts((p) => ({
                      ...p,
                      format: e.target.value as SpreadsheetCompressOptions['format'],
                    }))
                  }
                  className="rounded border border-zinc-200 bg-white px-2 py-1 font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="toon">TOON Table (Lowest Tokens)</option>
                  <option value="kv">Minimal Key-Value</option>
                  <option value="csv">Clean CSV</option>
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={sheetOpts.stripEmptyCols}
                  onChange={(e) =>
                    setSheetOpts((p) => ({ ...p, stripEmptyCols: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                <span>Drop empty columns</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={sheetOpts.dedupeRows}
                  onChange={(e) =>
                    setSheetOpts((p) => ({ ...p, dedupeRows: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                <span>Deduplicate rows</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    result.compressedText,
                    'excel-copy',
                    `Copied compressed ${sheetOpts.format.toUpperCase()} (${result.compressedTokens} tokens)`
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {copiedKey === 'excel-copy' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy Output
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadBlob(
                    new Blob([result.compressedText], { type: 'text/plain;charset=utf-8' }),
                    `${result.fileName.replace(/\.[^.]+$/, '')}-compressed.${sheetOpts.format === 'csv' ? 'csv' : 'txt'}`
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
              <button
                type="button"
                onClick={() => onInsertIntoPrompt(result.compressedText, 'append')}
                className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Append to Prompt
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <pre className="max-h-56 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded border border-zinc-200 bg-[#F7FAFB] p-3.5 font-mono text-xs leading-relaxed text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            {result.compressedText}
          </pre>
        </div>
      )}

      {/* Result View: PDF */}
      {result && result.kind === 'pdf' && !isProcessing && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                <FileText className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                {result.fileName}
              </span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                {result.pageCount} page(s) · {formatBytes(result.fileBytes)} · stripped {result.strippedBoilerplateLines} repeated header/page lines
              </span>
            </div>

            <div className="font-mono text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              {result.rawTokens.toLocaleString()} → {result.compressedTokens.toLocaleString()} tokens (-
              {result.reductionPct}%)
            </div>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-sm bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-teal-600 transition-all duration-300 dark:bg-teal-500"
              style={{
                width: `${Math.max(4, 100 - result.reductionPct)}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#F7FAFB] px-4 py-2.5 text-xs dark:bg-zinc-950/60">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={pdfOpts.stripRepeatedHeaders}
                  onChange={(e) =>
                    setPdfOpts((p) => ({ ...p, stripRepeatedHeaders: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                <span>Strip repeated headers/footers</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={pdfOpts.rejoinHyphens}
                  onChange={(e) =>
                    setPdfOpts((p) => ({ ...p, rejoinHyphens: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                <span>Rejoin line hyphens</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    result.compressedText,
                    'pdf-copy',
                    `Copied compressed PDF text (${result.compressedTokens} tokens)`
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {copiedKey === 'pdf-copy' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy Text
              </button>
              <button
                type="button"
                onClick={() => onInsertIntoPrompt(result.compressedText, 'replace')}
                className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Load into Compressor
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <pre className="max-h-56 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded border border-zinc-200 bg-[#F7FAFB] p-3.5 font-mono text-xs leading-relaxed text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            {result.compressedText}
          </pre>
        </div>
      )}

      {/* Result View: IMAGE MULTIMODAL */}
      {result && result.kind === 'image' && !isProcessing && (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                <ImageIcon className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                {result.fileName}
              </span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                {result.originalWidth}×{result.originalHeight} → {result.compressedWidth}×{result.compressedHeight}px ·{' '}
                {formatBytes(result.originalBytes)} → {formatBytes(result.compressedBytes)}
              </span>
            </div>

            <div className="font-mono text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              -{result.byteReductionPct}% file size
            </div>
          </div>

          {/* Vision Token Savings Estimator */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded border border-zinc-200 bg-[#F7FAFB] px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-zinc-500 dark:text-zinc-400">Estimated GPT-4o vision</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {result.gpt4oTokensBefore} →{' '}
                <span className="text-teal-700 dark:text-teal-400">
                  {result.gpt4oTokensAfter} tok
                </span>
              </div>
            </div>
            <div className="rounded border border-zinc-200 bg-[#F7FAFB] px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-zinc-500 dark:text-zinc-400">Estimated Claude vision</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {result.claudeTokensBefore} →{' '}
                <span className="text-teal-700 dark:text-teal-400">
                  {result.claudeTokensAfter} tok
                </span>
              </div>
            </div>
            <div className="rounded border border-zinc-200 bg-[#F7FAFB] px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-zinc-500 dark:text-zinc-400">Estimated Gemini vision</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {result.geminiTokensBefore} →{' '}
                <span className="text-teal-700 dark:text-teal-400">
                  {result.geminiTokensAfter} tok
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-[#F7FAFB] px-4 py-2.5 text-xs dark:bg-zinc-950/60">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span>Max edge</span>
                <select
                  value={imageOpts.maxEdgePx}
                  onChange={(e) =>
                    setImageOpts((p) => ({
                      ...p,
                      maxEdgePx: Number(e.target.value) as ImageCompressOptions['maxEdgePx'],
                    }))
                  }
                  className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value={384}>384px (Tiny / Min Gemini)</option>
                  <option value={512}>512px (1 GPT Tile)</option>
                  <option value={768}>768px (OCR Balanced)</option>
                  <option value={1024}>1024px (Auto LLM Optimal)</option>
                  <option value={1568}>1568px (High Detail)</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span>Format</span>
                <select
                  value={imageOpts.format}
                  onChange={(e) =>
                    setImageOpts((p) => ({
                      ...p,
                      format: e.target.value as ImageCompressOptions['format'],
                    }))
                  }
                  className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="image/webp">WebP (Smallest)</option>
                  <option value="image/jpeg">JPEG</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span>Quality {Math.round(imageOpts.quality * 100)}%</span>
                <input
                  type="range"
                  min={0.35}
                  max={0.95}
                  step={0.05}
                  value={imageOpts.quality}
                  onChange={(e) =>
                    setImageOpts((p) => ({ ...p, quality: Number(e.target.value) }))
                  }
                  className="w-20 accent-zinc-900 dark:accent-zinc-100"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={imageOpts.grayscale}
                  onChange={(e) =>
                    setImageOpts((p) => ({ ...p, grayscale: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                <span>Grayscale OCR mode</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    result.compressedDataUrl,
                    'img-b64',
                    'Copied compressed base64 Data URI to clipboard'
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {copiedKey === 'img-b64' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy Base64
              </button>
              <button
                type="button"
                onClick={() => {
                  const ext = imageOpts.format === 'image/webp' ? 'webp' : 'jpg';
                  handleDownloadBlob(
                    result.compressedBlob,
                    `${result.fileName.replace(/\.[^.]+$/, '')}-zip.${ext}`
                  );
                }}
                className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
              <button
                type="button"
                onClick={() => onInsertIntoPrompt(result.promptStub, 'append')}
                className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Add @IMG Stub
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Side-by-side Image Comparison */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded border border-zinc-200 bg-[#F7FAFB] p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Original ({result.originalWidth}×{result.originalHeight})</span>
                <span className="font-mono">{formatBytes(result.originalBytes)}</span>
              </div>
              <img
                src={result.originalPreviewUrl}
                alt={`Original ${result.fileName}`}
                className="max-h-48 w-full rounded object-contain bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="space-y-1.5 rounded border border-teal-200 bg-teal-50/30 p-3 dark:border-teal-900/60 dark:bg-teal-950/20">
              <div className="flex items-center justify-between text-xs text-teal-800 dark:text-teal-400">
                <span>Compressed ({result.compressedWidth}×{result.compressedHeight})</span>
                <span className="font-mono font-semibold">{formatBytes(result.compressedBytes)}</span>
              </div>
              <img
                src={result.compressedDataUrl}
                alt={`Compressed ${result.fileName}`}
                className="max-h-48 w-full rounded object-contain bg-white dark:bg-zinc-900"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
