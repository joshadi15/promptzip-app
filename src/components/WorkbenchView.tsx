import { lazy, Suspense, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import {
  CompressionOptions,
  CompressionResult,
  CompressionAlgorithmId,
  ALGORITHMS,
  computeWordDiff,
} from '../lib/compression';
import { reviewText } from '../lib/promptReview';
import { detectPromptDomain } from '../lib/antiSlop';
import { buildCliCommand, CliTargetId } from '../lib/cliFormats';
import { analyzePromptComplexity } from '../lib/complexity';
import { copyTextToClipboard } from '../lib/browserUtils';
import { SAMPLE_PROMPTS } from '../lib/samples';
import { BpeEncoding, formatTokenChange, tokenizeSegments } from '../lib/tokenizer';
import { WorkspaceTab } from './Header';

const MultimodalCompressorPanel = lazy(() => import('./MultimodalCompressorPanel').then(({ MultimodalCompressorPanel }) => ({ default: MultimodalCompressorPanel })));

interface WorkbenchViewProps {
  prompt: string;
  onChangePrompt: (next: string) => void;
  encoding: BpeEncoding;
  onChangeEncoding: (enc: BpeEncoding) => void;
  options: CompressionOptions;
  onChangeOptions: (next: CompressionOptions) => void;
  activeResult: CompressionResult;
  selectedAlgorithm: CompressionAlgorithmId | 'auto';
  onSelectAlgorithm: (next: CompressionAlgorithmId | 'auto') => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onNotify: (message: string) => void;
  onSaveSnapshot: () => void;
}

type OutputInspectMode = 'output' | 'diff' | 'tokens';

const TOKEN_TINTS = [
  'bg-teal-50 text-teal-950 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800/70',
  'bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/70',
  'bg-sky-50 text-sky-950 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800/70',
  'bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700',
];

const OPCODE_COLORS: Record<string, string> = {
  '#IR:': 'text-zinc-500 dark:text-zinc-400',
  '@DO': 'font-semibold text-sky-700 dark:text-sky-400',
  '@ENV': 'font-semibold text-zinc-700 dark:text-zinc-300',
  '@AUD': 'font-semibold text-zinc-700 dark:text-zinc-300',
  '@REQ': 'font-semibold text-teal-700 dark:text-teal-400',
  '@BAN': 'font-semibold text-amber-700 dark:text-amber-400',
  '@LIM': 'font-semibold text-amber-700 dark:text-amber-400',
  '@OUT': 'font-semibold text-teal-800 dark:text-teal-300',
  '@CTX': 'font-semibold text-zinc-600 dark:text-zinc-400',
};

function renderFormattedOutput(output: string) {
  const isPromptIr = /^(#IR:|@(?:DO|ENV|AUD|REQ|BAN|LIM|OUT|CTX)\b)/m.test(output);
  if (!isPromptIr) {
    return (
      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[13.5px] leading-relaxed text-zinc-900 dark:text-zinc-100">
        {output}
      </pre>
    );
  }

  return (
    <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[13.5px] leading-relaxed text-zinc-900 dark:text-zinc-100">
      {output.split('\n').map((line, idx) => {
        const match = line.match(/^(#IR:|@(?:DO|ENV|AUD|REQ|BAN|LIM|OUT|CTX))(\s.*|$)/);
        if (!match) {
          return (
            <span key={idx} className="block">
              {line || ' '}
            </span>
          );
        }
        const [, opcode, rest] = match;
        return (
          <span key={idx} className="block">
            <span className={OPCODE_COLORS[opcode] ?? 'font-semibold'}>{opcode}</span>
            <span>{rest}</span>
          </span>
        );
      })}
    </pre>
  );
}

export function WorkbenchView({
  prompt,
  onChangePrompt,
  encoding,
  onChangeEncoding,
  options,
  onChangeOptions,
  activeResult,
  selectedAlgorithm,
  onSelectAlgorithm,
  onNavigateTab,
  onNotify,
  onSaveSnapshot,
}: WorkbenchViewProps) {
  const [inspectMode, setInspectMode] = useState<OutputInspectMode>('output');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [quickCli, setQuickCli] = useState<CliTargetId>('claude');
  const [showOptions, setShowOptions] = useState(false);

  const handleCopy = async (text: string, key: string, toastMessage: string) => {
    const copied = await copyTextToClipboard(text);
    if (copied) {
      setCopiedKey(key);
      onNotify(toastMessage);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } else {
      onNotify('Could not access clipboard');
    }
  };

  const diffChunks =
    inspectMode === 'diff' && prompt.trim()
      ? computeWordDiff(prompt, activeResult.output)
      : [];

  const tokenInspection =
    inspectMode === 'tokens' && activeResult.output
      ? tokenizeSegments(activeResult.output, encoding, 400)
      : null;

  const reviewFindings = useMemo(() => reviewText(prompt, 'prompt'), [prompt]);
  const reviewCount = reviewFindings.filter((item) => item.priority !== 'unverified').length;
  const quickCliCommand = buildCliCommand(activeResult.output, quickCli, 'bash');
  const complexity = useMemo(
    () => analyzePromptComplexity(prompt, activeResult.inputTokens),
    [prompt, activeResult.inputTokens]
  );

  const barMaximum = Math.max(activeResult.inputTokens, activeResult.outputTokens, 1);

  return (
    <div className="space-y-6">
      <div className="workspace-title"><h2>Prompt workspace</h2><span>Local processing</span></div>
      {/* Top Visual Summary Panel: Proportional Dual-Bar + 3 Inline Meters */}
      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">
              {activeResult.inputTokens.toLocaleString()} →{' '}
              <span className="text-teal-700 dark:text-teal-400">
                {activeResult.outputTokens.toLocaleString()}
              </span>{' '}
              <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">tokens</span>
            </div>
            {activeResult.savedTokens > 0 && (
              <span className="font-mono text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                -{activeResult.reductionPct}% saved (-{activeResult.savedTokens.toLocaleString()})
              </span>
            )}
            {activeResult.outputTokens > activeResult.inputTokens && <span className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-400">{formatTokenChange(activeResult.reductionPct)} (+{activeResult.outputTokens - activeResult.inputTokens} tokens)</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Load an example prompt"
              value=""
              onChange={(e) => {
                const found = SAMPLE_PROMPTS.find((s) => s.id === e.target.value);
                if (found) onChangePrompt(found.prompt);
              }}
              className="rounded-lg border border-zinc-200 bg-[#F7FAFB] px-3 py-1.5 text-xs font-medium text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              <option value="" disabled>
                Load example...
              </option>
              {SAMPLE_PROMPTS.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                showOptions
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Options
            </button>
          </div>
        </div>

        {/* Visual Dual-Bar Size Comparison */}
        {prompt.trim() && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-zinc-500 dark:text-zinc-400">Original</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full bg-zinc-400 dark:bg-zinc-600" style={{ width: `${100 * activeResult.inputTokens / barMaximum}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                {activeResult.inputTokens.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 font-medium text-teal-800 dark:text-teal-400">
                Compressed
              </span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-teal-100/70 dark:bg-teal-950/40">
                <div
                  className="h-full bg-teal-600 transition-all duration-300 dark:bg-teal-500"
                  style={{ width: `${100 * activeResult.outputTokens / barMaximum}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                {activeResult.outputTokens.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {prompt.trim() && <details className="mt-3 rounded-lg border border-zinc-200 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          <summary className="cursor-pointer font-semibold text-zinc-800 dark:text-zinc-100">How is token reduction calculated?</summary>
          <p className="mt-2 leading-relaxed">The selected <code>{encoding}</code> tokenizer counts the trimmed original and compressed text. Tokens saved = {activeResult.inputTokens} − {activeResult.outputTokens} = {activeResult.inputTokens - activeResult.outputTokens}. Reduction = ({activeResult.inputTokens} − {activeResult.outputTokens}) ÷ {activeResult.inputTokens} × 100 = {activeResult.reductionPct}%. This is a text-only comparison; the target model may count tokens differently and include other context.</p>
        </details>}

        {/* 3 Compact Visual Health Meters */}
        {prompt.trim() && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-3.5 sm:grid-cols-3 dark:border-zinc-800">
            {/* Key Terms Preserved */}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Tracked terms found</span>
                <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {activeResult.totalEntities ? `${activeResult.retentionScore}%` : 'No terms'}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">Checks selected terms, numbers, and code. It cannot verify meaning.</p>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    activeResult.retentionScore >= 90
                      ? 'bg-teal-600 dark:bg-teal-500'
                      : 'bg-amber-500 dark:bg-amber-400'
                  }`}
                  style={{ width: `${activeResult.totalEntities ? activeResult.retentionScore : 0}%` }}
                />
              </div>
            </div>

            {/* Complexity Gauge */}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Verbosity / complexity</span>
                <span
                  className={`font-mono font-medium tabular-nums ${
                    complexity.isTooVerbose
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {complexity.score}/100 · {complexity.level}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    complexity.isTooVerbose
                      ? 'bg-amber-600 dark:bg-amber-500'
                      : complexity.level === 'Moderate'
                        ? 'bg-zinc-600 dark:bg-zinc-400'
                        : 'bg-teal-600 dark:bg-teal-500'
                  }`}
                  style={{ width: `${complexity.score}%` }}
                />
              </div>
            </div>

            {/* Direct link to the shared review workspace */}
            <button
              type="button"
              onClick={() => onNavigateTab('anti-slop')}
              className="group min-w-0 space-y-1.5 text-left"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-zinc-500 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100">
                  {reviewCount > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  )}
                  Prompt Review
                </span>
                <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {reviewCount > 0 ? `${reviewCount} to consider` : 'No immediate issues'}
                </span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Check clarity before compression →</span>
            </button>
          </div>
        )}
      </section>

      {/* Collapsible Options Drawer */}
      {showOptions && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200/80 bg-white px-5 py-3.5 text-xs shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center gap-5">
            {(
              [
                ['protectCodeBlocks', 'Lock code blocks'],
                ['protectQuotes', 'Lock quoted text'],
                ['protectNumbers', 'Lock numbers'],
                ['foldJsonToToon', 'Compress JSON arrays (TOON)'],
                ['includeIrHeader', 'Add PromptIR legend (small models)'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) =>
                    onChangeOptions({ ...options, [key]: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span>Token counter</span>
            <select
              value={encoding}
              onChange={(e) => onChangeEncoding(e.target.value as BpeEncoding)}
              className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="o200k_base">o200k_base (GPT-4o)</option>
              <option value="cl100k_base">cl100k_base (older GPT tokenizer)</option>
            </select>
          </label>
        </div>
      )}

      {/* Two-Column Writing & Compression Sheets */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
        {/* Left Sheet: Raw Input */}
        <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800/80">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Your Prompt
            </span>
            <div className="flex items-center gap-4 text-xs">
              <button
                type="button"
                onClick={onSaveSnapshot}
                disabled={!prompt.trim()}
                className="font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-35 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => onChangePrompt('')}
                disabled={!prompt}
                className="font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-35 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 p-5">
            <label htmlFor="raw-prompt-input" className="sr-only">
              Your prompt
            </label>
            <textarea
              id="raw-prompt-input"
              value={prompt}
              onChange={(e) => onChangePrompt(e.target.value)}
              placeholder="Paste or type your prompt here..."
              rows={14}
              className="h-full min-h-[340px] w-full resize-y bg-transparent font-mono text-[13.5px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-2.5 border-t border-zinc-100 px-5 py-3.5 text-xs dark:border-zinc-800/80">
            {/* Visual Signal vs Filler Ratio Bar */}
            {prompt.trim() && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono tabular-nums">
                    {complexity.contentDensityPct}% high-signal words ·{' '}
                    {100 - complexity.contentDensityPct}% filler · Grade {complexity.gradeLevel} (
                    {complexity.readingLabel})
                  </span>
                  <span className="font-mono tabular-nums">
                    {complexity.wordCount}w · {activeResult.inputChars.toLocaleString()}c ·{' '}
                    {detectPromptDomain(prompt)}
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-xs bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full bg-teal-600 dark:bg-teal-500"
                    style={{ width: `${complexity.contentDensityPct}%` }}
                    title={`Signal words: ${complexity.contentDensityPct}%`}
                  />
                </div>
              </div>
            )}

            {prompt.trim() && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <p
                  className={
                    complexity.isTooVerbose
                      ? 'text-amber-800 dark:text-amber-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }
                >
                  <strong className="font-medium">
                    Complexity {complexity.score}/100 ({complexity.level}):
                  </strong>{' '}
                  {complexity.suggestion}
                </p>

              </div>
            )}
          </div>
        </div>

        {/* Right Sheet: Compressed Output */}
        <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800/80">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Compressed prompt
              </span>
              <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Method</span>
                <select aria-label="Compression method" value={selectedAlgorithm} onChange={event => onSelectAlgorithm(event.target.value as CompressionAlgorithmId | 'auto')} className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                  <option value="auto">Auto · best balance</option>
                  {ALGORITHMS.map(method => <option value={method.id} key={method.id}>{method.shortName}</option>)}
                </select>
              </label>

              <div className="flex items-center gap-3 text-xs shrink-0">
                {(
                  [
                    ['output', 'Text'],
                    ['diff', 'Diff'],
                    ['tokens', 'Tokens'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setInspectMode(mode)}
                    className={`font-medium transition-colors whitespace-nowrap shrink-0 ${
                      inspectMode === mode
                        ? 'text-zinc-950 underline underline-offset-4 dark:text-white'
                        : 'text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                handleCopy(
                  activeResult.output,
                  'output',
                  `Copied compressed prompt (${activeResult.outputTokens.toLocaleString()} tokens · ${formatTokenChange(activeResult.reductionPct)})`
                )
              }
              disabled={!activeResult.output}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-35 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'output' ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Compressed
                </>
              )}
            </button>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto p-5 min-h-[340px]">
            {!activeResult.output ? (
              <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                Your compressed prompt will appear here automatically.
              </div>
            ) : inspectMode === 'output' ? (
              renderFormattedOutput(activeResult.output)
            ) : inspectMode === 'diff' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4 border-b border-zinc-100 pb-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs bg-red-200 dark:bg-red-900" />
                    Removed fluff / stopwords
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-200 dark:bg-teal-900" />
                    Shortened / structured token
                  </span>
                </div>
                <div className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[13.5px] leading-relaxed">
                  {diffChunks.map((chunk, idx) => {
                    if (chunk.type === 'same') {
                      return (
                        <span key={idx} className="text-zinc-800 dark:text-zinc-200">
                          {chunk.text}{' '}
                        </span>
                      );
                    }
                    if (chunk.type === 'removed') {
                      return (
                        <span
                          key={idx}
                          className="mr-1 rounded-xs bg-red-100 px-0.5 text-red-800 line-through dark:bg-red-950/60 dark:text-red-300"
                        >
                          {chunk.text}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={idx}
                        className="mr-1 rounded-xs bg-teal-100 px-0.5 text-teal-900 dark:bg-teal-950/70 dark:text-teal-300"
                      >
                        {chunk.text}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Each colored chip is 1 BPE token counted by <span className="font-mono">{encoding}</span>.
                </p>
                <div className="flex flex-wrap gap-1 font-mono text-xs leading-6">
                  {tokenInspection?.segments.map((seg, idx) => (
                    <span
                      key={`${seg.id}-${idx}`}
                      title={`Token ID: ${seg.id}`}
                      className={`inline-block max-w-full rounded border px-1 py-0.5 whitespace-pre-wrap break-all ${
                        TOKEN_TINTS[idx % TOKEN_TINTS.length]
                      }`}
                    >
                      {seg.text.replace(/\n/g, '↵\n')}
                    </span>
                  ))}
                </div>
                {tokenInspection?.truncated && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Showing first 400 of {tokenInspection.total} tokens.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Minimal CLI One-Liner Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-5 py-2.5 dark:border-zinc-800/80">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <select
                aria-label="Quick CLI target"
                value={quickCli}
                onChange={(e) => setQuickCli(e.target.value as CliTargetId)}
                className="bg-transparent text-xs font-medium text-zinc-700 focus:outline-none dark:text-zinc-300"
              >
                <option value="claude">Claude Code</option>
                <option value="gemini">Gemini CLI</option>
                <option value="codex">Codex CLI</option>
                <option value="aider">Aider</option>
                <option value="ollama">Ollama</option>
              </select>
              <span className="text-zinc-300 dark:text-zinc-700">/</span>
              <code className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {quickCliCommand || 'Ready once prompt is entered'}
              </code>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    quickCliCommand,
                    'cli',
                    `Copied ${quickCli} command to clipboard`
                  )
                }
                disabled={!quickCliCommand}
                className="text-xs font-medium text-zinc-900 hover:underline disabled:opacity-35 dark:text-zinc-100 whitespace-nowrap shrink-0"
              >
                {copiedKey === 'cli' ? 'Copied CLI' : 'Copy CLI'}
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('cli')}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 whitespace-nowrap shrink-0"
              >
                More formats →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Multimodal File Compressor (Excel / PDF / Image) */}
      <Suspense fallback={<div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">Loading file tools…</div>}><MultimodalCompressorPanel
        encoding={encoding}
        onInsertIntoPrompt={(nextText, mode) => {
          if (mode === 'replace' || !prompt.trim()) {
            onChangePrompt(nextText);
            onNotify('Loaded compressed file output into Prompt Compressor');
          } else {
            onChangePrompt(`${prompt.trimEnd()}\n\n${nextText}`);
            onNotify('Appended compressed multimodal output to prompt');
          }
        }}
        onNotify={onNotify}
      /></Suspense>

      {prompt.trim() && (
        <section className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 py-5 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Prompt Review</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {reviewCount > 0
                ? `${reviewCount} detail${reviewCount === 1 ? '' : 's'} to consider before compression.`
                : 'No immediate issues found by instant checks.'}
            </p>
            {reviewFindings[0] && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">First suggestion: {reviewFindings[0].title}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('anti-slop')}
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Review prompt →
          </button>
        </section>
      )}

    </div>
  );
}
