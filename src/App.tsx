import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Moon, Sun, Trash2, X } from 'lucide-react';
import { AntiSlopView } from './components/AntiSlopView';
import { CliConverterView } from './components/CliConverterView';
import { BenchmarkView } from './components/BenchmarkView';
import { Header, NAV_ITEMS, WorkspaceTab } from './components/Header';
import { WorkbenchView } from './components/WorkbenchView';
import {
  benchmarkAllAlgorithms,
  CompressionAlgorithmId,
  CompressionOptions,
  DEFAULT_COMPRESSION_OPTIONS,
} from './lib/compression';
import { SAMPLE_PROMPTS } from './lib/samples';
import { BpeEncoding } from './lib/tokenizer';

interface SavedPromptEntry {
  id: string;
  label: string;
  prompt: string;
  savedAt: string;
  tokensBefore: number;
  tokensAfter: number;
}

const STORAGE_KEYS = {
  prompt: 'promptzip.prompt.v1',
  theme: 'promptzip.theme.preference',
  encoding: 'promptzip.encoding.v1',
  history: 'promptzip.history.v1',
};

function currentView(): WorkspaceTab {
  const view = new URLSearchParams(window.location.search).get('view');
  return NAV_ITEMS.find(item => item.id === view)?.id ?? 'workbench';
}

export default function App() {
  const [activeTab, setView] = useState<WorkspaceTab>(currentView);
  useEffect(() => {
    const restore = () => setView(currentView());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const setActiveTab = (view: WorkspaceTab) => {
    if (currentView() !== view) {
      const url = new URL(window.location.href);
      if (view === 'workbench') url.searchParams.delete('view');
      else url.searchParams.set('view', view);
      url.hash = '';
      window.history.pushState(null, '', url);
      setView(view);
    }
    window.scrollTo(0, 0);
  };
  const [prompt, setPrompt] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.prompt) ?? SAMPLE_PROMPTS[0].prompt;
    } catch {
      return SAMPLE_PROMPTS[0].prompt;
    }
  });
  const [encoding, setEncoding] = useState<BpeEncoding>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.encoding);
      return saved === 'cl100k_base' ? 'cl100k_base' : 'o200k_base';
    } catch {
      return 'o200k_base';
    }
  });
  const [options, setOptions] = useState<CompressionOptions>(DEFAULT_COMPRESSION_OPTIONS);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<CompressionAlgorithmId | 'auto'>('auto');
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [history, setHistory] = useState<SavedPromptEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      return raw ? (JSON.parse(raw) as SavedPromptEntry[]) : [];
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#06090f' : '#f4f8fa');
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.prompt, prompt);
    } catch {
      // Ignore storage error
    }
  }, [prompt]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.encoding, encoding);
    } catch {
      // Ignore storage error
    }
  }, [encoding]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {
      // Ignore storage error
    }
  }, [history]);

  const benchmark = useMemo(
    () => benchmarkAllAlgorithms(prompt, encoding, options),
    [prompt, encoding, options]
  );

  const activeResult = selectedAlgorithm === 'auto' ? benchmark.best : benchmark.results.find(result => result.algorithm.id === selectedAlgorithm) ?? benchmark.best;
  const handleSaveSnapshot = () => {
    if (!prompt.trim()) return;
    const firstLine = prompt.trim().split('\n')[0].slice(0, 48);
    const entry: SavedPromptEntry = {
      id: `${Date.now()}`,
      label: firstLine || 'Saved Prompt',
      prompt,
      savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokensBefore: activeResult.inputTokens,
      tokensAfter: activeResult.outputTokens,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 10));
    showToast('Saved prompt to local history');
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F4F8FA] text-zinc-900 dark:bg-[#06090F] dark:text-zinc-100">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <main className="mx-auto max-w-[1320px] space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'benchmark' && <BenchmarkView prompt={prompt} summary={benchmark} encoding={encoding} selected={selectedAlgorithm} onSelect={setSelectedAlgorithm} onOpenCompressor={() => setActiveTab('workbench')} onNotify={showToast} />}
        {activeTab === 'workbench' && (
          <WorkbenchView
            prompt={prompt}
            onChangePrompt={setPrompt}
            encoding={encoding}
            onChangeEncoding={setEncoding}
            options={options}
            onChangeOptions={setOptions}
            activeResult={activeResult}
            selectedAlgorithm={selectedAlgorithm}
            onSelectAlgorithm={setSelectedAlgorithm}
            onNavigateTab={setActiveTab}
            onNotify={showToast}
            onSaveSnapshot={handleSaveSnapshot}
          />
        )}

        {activeTab === 'cli' && (
          <CliConverterView
            compressedPrompt={activeResult.output}
            originalTokens={activeResult.inputTokens}
            encoding={encoding}
            onNotify={showToast}
          />
        )}

        {activeTab === 'anti-slop' && (
          <AntiSlopView
            prompt={prompt}
            onChangePrompt={setPrompt}
            onNavigateTab={setActiveTab}
            onNotify={showToast}
          />
        )}

        {history.length > 0 && (
          <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Saved Locally ({history.length})
              </h2>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Clear all
              </button>
            </div>
            <div className="mt-3 divide-y divide-zinc-200/80 dark:divide-zinc-800">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(item.prompt);
                      setActiveTab('workbench');
                    }}
                    className="min-w-0 flex-1 truncate text-left font-mono text-zinc-800 hover:underline dark:text-zinc-200"
                  >
                    {item.label}
                  </button>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      {item.tokensBefore} → {item.tokensAfter} tokens · {item.savedAt}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setHistory((prev) => prev.filter((h) => h.id !== item.id))
                      }
                      aria-label="Delete saved prompt"
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <div className="max-w-3xl space-y-2">
            <span>Compression and instant checks run in your browser. Optional Qwen review uses Ollama on your device.</span>
            <details className="max-w-2xl"><summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">Data and calculation details</summary>
              <p className="mt-2 leading-relaxed">Your prompt, saved prompt snapshots, theme, and tokenizer preference are stored in this browser’s local storage. Markdown drafts and uploaded instruction text are held in this tab’s session storage. Uploaded spreadsheet, PDF, and image content is processed in browser memory. Download your work before closing the tab. Clearing browser data removes stored drafts and prompts. Qwen receives review text through Ollama at localhost only when you request a review; web hosting does not provide the model. Google Fonts are loaded from Google. Token reduction compares text using a selectable GPT tokenizer, and tracked-term checks do not prove that the meaning is preserved.</p>
            </details>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsDark(!isDark);
              try { localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'light' : 'dark'); } catch { /* Storage is optional. */ }
            }}
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            {isDark ? (
              <>
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                Light theme
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                Dark theme
              </>
            )}
          </button>
        </footer>
      </main>

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed right-5 bottom-5 z-50 flex max-w-md items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-xs font-medium text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span className="leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="ml-1 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
