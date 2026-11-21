import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AiFriendlyFormat,
  buildCliCommand,
  CLI_TARGETS,
  CliTargetId,
  formatPromptForAi,
  ShellFlavor,
} from '../lib/cliFormats';
import { copyTextToClipboard } from '../lib/browserUtils';
import { BpeEncoding, countBpeTokens } from '../lib/tokenizer';

interface CliConverterViewProps {
  compressedPrompt: string;
  originalTokens: number;
  encoding: BpeEncoding;
  onNotify: (message: string) => void;
}

const FORMAT_OPTIONS: Array<{ id: AiFriendlyFormat; label: string; hint: string }> = [
  { id: 'compressed', label: 'Plain Compact', hint: 'Lowest overhead for chat and CLI' },
  { id: 'prompt-ir', label: 'PromptIR (LLM Assembly)', hint: 'Compact symbolic fields (@DO/@ENV/@REQ/@BAN/@OUT); verify with your model' },
  { id: 'kv', label: 'Minimal KV', hint: 'Clean key-value sections without JSON braces' },
  { id: 'xml', label: 'XML Tags', hint: 'Clear section boundaries for Claude & Gemini' },
  { id: 'toon', label: 'TOON Table', hint: 'Folds JSON arrays into compact pipe-delimited rows' },
  { id: 'system-split', label: 'System / User Split', hint: 'Separates reusable rules for prompt caching' },
];

export function CliConverterView({
  compressedPrompt,
  originalTokens,
  encoding,
  onNotify,
}: CliConverterViewProps) {
  const [aiFormat, setAiFormat] = useState<AiFriendlyFormat>('kv');
  const [cliTarget, setCliTarget] = useState<CliTargetId>('claude');
  const [shell, setShell] = useState<ShellFlavor>('bash');
  const [pipeFile, setPipeFile] = useState<string>('');
  const [ollamaModel, setOllamaModel] = useState<string>('llama3.2');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const formattedPrompt = formatPromptForAi(compressedPrompt, aiFormat);
  const formattedTokens = countBpeTokens(formattedPrompt, encoding);
  const cliCommand = buildCliCommand(
    formattedPrompt,
    cliTarget,
    shell,
    pipeFile,
    ollamaModel
  );

  const handleCopy = async (text: string, key: string, toastMessage: string) => {
    const copied = await copyTextToClipboard(text);
    if (copied) {
      setCopiedKey(key);
      onNotify(toastMessage);
      window.setTimeout(() => setCopiedKey(null), 1600);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            CLI & AI Format Converter
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Convert your compressed prompt into structured formats or ready-to-run terminal commands.
          </p>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: AI Format */}
        <section className="flex min-w-0 flex-col rounded-xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800/80">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                AI Structure
              </span>
              <select
                aria-label="Output format"
                value={aiFormat}
                onChange={(e) => setAiFormat(e.target.value as AiFriendlyFormat)}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                handleCopy(
                  formattedPrompt,
                  'format',
                  `Copied ${aiFormat} format (${formattedTokens} tokens)`
                )
              }
              disabled={!formattedPrompt}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-35 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'format' ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Format
                </>
              )}
            </button>
          </div>

          <div className="px-5 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {FORMAT_OPTIONS.find((f) => f.id === aiFormat)?.hint} ·{' '}
            <span className="font-mono tabular-nums">
              {formattedTokens} tokens (from {originalTokens})
            </span>
          </div>

          <div className="flex-1 p-5">
            <pre className="min-h-[280px] whitespace-pre-wrap [overflow-wrap:anywhere] rounded border border-zinc-200 bg-[#F7FAFB] p-4 font-mono text-[13px] leading-relaxed text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              {formattedPrompt || 'Enter a prompt in the Compressor first.'}
            </pre>
          </div>
        </section>

        {/* Right: CLI Command */}
        <section className="flex min-w-0 flex-col rounded-xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800/80">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Terminal Command
              </span>
              <select
                aria-label="CLI tool"
                value={cliTarget}
                onChange={(e) => setCliTarget(e.target.value as CliTargetId)}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {CLI_TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Shell flavor"
                value={shell}
                onChange={(e) => setShell(e.target.value as ShellFlavor)}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="bash">Bash / Zsh</option>
                <option value="powershell">PowerShell</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                handleCopy(
                  cliCommand,
                  'cli-full',
                  `Copied ${cliTarget} command to clipboard`
                )
              }
              disabled={!cliCommand}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-35 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'cli-full' ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Command
                </>
              )}
            </button>
          </div>

          <div className="space-y-4 p-5 flex-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {CLI_TARGETS.find((t) => t.id === cliTarget)?.description}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span>Pipe file (optional)</span>
                <input
                  type="text"
                  value={pipeFile}
                  onChange={(e) => setPipeFile(e.target.value)}
                  placeholder="e.g. src/app.ts"
                  className="mt-1 w-full rounded border border-zinc-200 bg-[#F7FAFB] px-2.5 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>

              {cliTarget === 'ollama' && (
                <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                  <span>Local model</span>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="llama3.2"
                    className="mt-1 w-full rounded border border-zinc-200 bg-[#F7FAFB] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
              )}
            </div>

            <pre className="min-h-[200px] whitespace-pre-wrap [overflow-wrap:anywhere] rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-100">
              {cliCommand || '# Enter a prompt in the Compressor first.'}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
