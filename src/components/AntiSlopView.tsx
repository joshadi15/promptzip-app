import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Download, FilePlus2, FileText, Highlighter, RotateCcw, ScanSearch, Sparkles, Upload, X } from 'lucide-react';
import { installedQwenModels, reviewWithQwen } from '../lib/localReview';
import { downloadBlobFile } from '../lib/browserUtils';
import { fileCoverage, normalizeMarkdownFileName, proposedText, reviewFileSet, reviewText, type ReviewCategory, type ReviewFile, type ReviewFinding, type ReviewMode, type ReviewPlatform } from '../lib/promptReview';
import type { WorkspaceTab } from './Header';

interface AntiSlopViewProps {
  prompt: string;
  onChangePrompt: (next: string) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onNotify: (message: string) => void;
}

const categories: Array<{ id: ReviewCategory; title: string }> = [
  { id: 'details', title: 'Missing details' },
  { id: 'ambiguity', title: 'Ambiguity' },
  { id: 'wording', title: 'Wording' },
];

const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-500 outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus-visible:border-blue-400';
const outlineButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const REVIEW_SESSION_KEY = 'promptzip.reviewSession.v1';

function readReviewSession(): { mode: ReviewMode; platform: ReviewPlatform; files: ReviewFile[]; selectedFile: string } {
  const fallback = { mode: 'prompt' as ReviewMode, platform: 'generic' as ReviewPlatform, files: [], selectedFile: '' };
  try {
    const raw = sessionStorage.getItem(REVIEW_SESSION_KEY);
    if (!raw) return fallback;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return fallback;
    const record = saved as Record<string, unknown>;
    const files = Array.isArray(record.files) ? record.files.filter((file): file is ReviewFile =>
      Boolean(file && typeof file.name === 'string' && file.name.length <= 300 && typeof file.text === 'string' && file.text.length <= 256 * 1024)).slice(0, 60) : [];
    return {
      mode: record.mode === 'file' ? 'file' : 'prompt',
      platform: ['generic', 'kiro', 'codex', 'antigravity'].includes(String(record.platform)) ? record.platform as ReviewPlatform : 'generic',
      files,
      selectedFile: files.find((file) => file.name === record.selectedFile)?.name ?? files[0]?.name ?? '',
    };
  } catch { return fallback; }
}

export function AntiSlopView({ prompt, onChangePrompt, onNavigateTab, onNotify }: AntiSlopViewProps) {
  const [savedSession] = useState(readReviewSession);
  const [mode, setMode] = useState<ReviewMode>(savedSession.mode);
  const [platform, setPlatform] = useState<ReviewPlatform>(savedSession.platform);
  const [files, setFiles] = useState<ReviewFile[]>(savedSession.files);
  const [selectedFile, setSelectedFile] = useState(savedSession.selectedFile);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileError, setNewFileError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [category, setCategory] = useState<ReviewCategory>('details');
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ id: string; before: string; after: string } | null>(null);
  const [undo, setUndo] = useState<{ mode: ReviewMode; name: string; text: string } | null>(null);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [modelName, setModelName] = useState('');
  const [modelState, setModelState] = useState<'checking' | 'ready' | 'missing' | 'unavailable' | 'running'>('checking');
  const [modelError, setModelError] = useState('');
  const [aiFindings, setAiFindings] = useState<ReviewFinding[]>([]);
  const [setFindings, setSetFindings] = useState<ReviewFinding[]>([]);
  const [setReviewError, setSetReviewError] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeFile = files.find((file) => file.name === selectedFile);
  const text = mode === 'prompt' ? prompt : activeFile?.text ?? '';
  const sourceKey = `${mode}\0${platform}\0${selectedFile}\0${text}`;
  const instantFindings = useMemo(() => reviewText(text, mode, selectedFile, files, platform), [text, mode, selectedFile, files, platform]);
  const coverage = useMemo(() => mode === 'file' && text.trim() ? fileCoverage(text, selectedFile, platform) : [], [text, mode, selectedFile, platform]);
  const fileSet = useMemo(() => reviewFileSet(files, platform), [files, platform]);
  const findings = useMemo(() => {
    const instantKeys = new Set(instantFindings.map((item) => `${item.category}:${item.excerpt?.toLowerCase() ?? item.title.toLowerCase()}`));
    return [...instantFindings, ...aiFindings.filter((item) => !instantKeys.has(`${item.category}:${item.excerpt?.toLowerCase() ?? item.title.toLowerCase()}`))];
  }, [instantFindings, aiFindings]);
  const visible = findings.filter((item) => !dismissed.has(item.id));
  const selectedFindings = visible.filter((item) => item.category === category);
  const attentionCount = visible.filter((item) => item.priority !== 'unverified').length;

  useEffect(() => {
    abortRef.current?.abort();
    setModelState((current) => current === 'running' ? 'ready' : current);
    setAiFindings([]);
    setDismissed(new Set());
    setPreview(null);
  }, [sourceKey]);

  useEffect(() => { setSetFindings([]); setSetReviewError(''); }, [files, platform]);

  useEffect(() => {
    try {
      sessionStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify({ files, selectedFile, mode, platform }));
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [files, selectedFile, mode, platform]);

  const checkModel = async () => {
    setModelState('checking');
    setModelError('');
    try {
      const models = await installedQwenModels();
      setModelNames(models);
      setModelName((current) => models.includes(current) ? current : models.find((name) => /^qwen3\.5:4b(?:-|$)/i.test(name)) ?? models[0] ?? '');
      setModelState(models.length ? 'ready' : 'missing');
    } catch {
      setModelNames([]);
      setModelState('unavailable');
      setModelError('No connection to Ollama on this device. Start Ollama and check again. On a hosted HTTPS site, browser local-network or origin restrictions may block access; use the local PromptZip build if needed.');
    }
  };

  useEffect(() => { void checkModel(); return () => abortRef.current?.abort(); }, []);

  const updateText = (next: string) => {
    if (mode === 'prompt') onChangePrompt(next);
    else setFiles((previous) => previous.map((file) => file.name === selectedFile ? { ...file, text: next } : file));
  };

  const addFiles = async (incoming: FileList | File[]) => {
    const accepted: ReviewFile[] = [];
    let skipped = 0;
    for (const file of Array.from(incoming)) {
      if (!/\.(?:md|markdown|txt)$/i.test(file.name) || file.size > 256 * 1024 || accepted.length >= 60) { skipped++; continue; }
      accepted.push({ name: file.webkitRelativePath || file.name, text: await file.text() });
    }
    if (!accepted.length) { onNotify('No supported instruction files found. Use .md or .txt, up to 256 KB per file.'); return; }
    setFiles((previous) => {
      const names = new Set(accepted.map((item) => item.name));
      return [...previous.filter((item) => !names.has(item.name)), ...accepted];
    });
    setSelectedFile(accepted[0].name);
    setMode('file');
    const names = accepted.map((file) => file.name.toLowerCase());
    if (names.some((name) => name.includes('.kiro/steering/')) || ['product.md', 'tech.md', 'structure.md'].every((base) => names.some((name) => name.endsWith(base)))) {
      setPlatform((current) => current === 'generic' ? 'kiro' : current);
    }
    onNotify(`Loaded ${accepted.length} file${accepted.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} unsupported or oversized skipped` : ''}`);
  };

  const createDraft = (path: string) => {
    const existing = files.find((file) => file.name.toLowerCase() === path.toLowerCase());
    if (existing) { setSelectedFile(existing.name); onNotify(`Opened existing ${existing.name} without replacing its content`); return; }
    if (files.length >= 60) { onNotify('Review supports up to 60 files. Download your work before starting another set.'); return; }
    setFiles((previous) => [...previous, { name: path, text: '' }]);
    setSelectedFile(path);
    setCategory('details');
    onNotify(`Created an empty ${path} draft. Add your project details before downloading.`);
  };

  const openNewFile = () => {
    setNewFileName(platform === 'kiro' ? '.kiro/steering/custom.md' : platform === 'antigravity' ? '.agents/rules/project.md' : platform === 'codex' ? 'AGENTS.md' : 'instructions.md');
    setNewFileError('');
    setIsCreatingFile(true);
  };

  const submitNewFile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const name = normalizeMarkdownFileName(newFileName);
      createDraft(name);
      setIsCreatingFile(false);
      setNewFileError('');
    } catch (error) { setNewFileError(error instanceof Error ? error.message : 'Enter a valid .md filename.'); }
  };

  const removeFile = (name: string) => {
    const remaining = files.filter((file) => file.name !== name);
    setFiles(remaining);
    if (selectedFile === name) setSelectedFile(remaining[0]?.name ?? '');
    onNotify(`Removed ${name} from this review`);
  };

  const focusExcerpt = (finding: ReviewFinding) => {
    if (finding.offset === undefined || !finding.excerpt) return;
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(finding.offset, finding.offset + finding.excerpt.length);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const startPreview = (finding: ReviewFinding) => {
    const after = proposedText(text, finding, drafts[finding.id] ?? '');
    if (after === null || after === text) return;
    setPreview({ id: finding.id, before: text, after });
  };

  const applyPreview = () => {
    if (!preview || text !== preview.before) { setPreview(null); return; }
    setUndo({ mode, name: selectedFile, text });
    updateText(preview.after);
    setPreview(null);
    onNotify('Change applied. Undo is available above the editor.');
  };

  const handleUndo = () => {
    if (!undo || undo.mode !== mode || undo.name !== selectedFile) return;
    updateText(undo.text);
    setUndo(null);
    onNotify('Previous text restored');
  };

  const runLocalReview = async () => {
    if (!modelName || !text.trim()) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setModelState('running');
    setModelError('');
    try {
      const results = await reviewWithQwen(text, mode, selectedFile, modelName, controller.signal, platform);
      if (!controller.signal.aborted) {
        setAiFindings(results);
        setCategory(results[0]?.category ?? category);
        setModelState('ready');
        onNotify(results.length ? 'Qwen review complete. Contextual findings are shown alongside instant checks.' : 'Qwen found no additional issues');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setModelState('ready');
        setModelError(error instanceof Error ? error.message : 'Local review failed.');
      }
    }
  };

  const runSetReview = async () => {
    const bundle = files.filter((file) => file.text.trim()).map((file) => `# File: ${file.name}\n${file.text.slice(0, 5_000)}`).join('\n\n');
    if (!modelName || !bundle) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setModelState('running');
    setSetReviewError('');
    try {
      const results = await reviewWithQwen(bundle, 'file', `${platform} instruction set`, modelName, controller.signal, platform, 'set');
      if (!controller.signal.aborted) {
        setSetFindings(results);
        setModelState('ready');
        onNotify(results.length ? `Set review complete · ${results.length} suggestion${results.length === 1 ? '' : 's'}` : 'Set review found no additional issues');
      }
    } catch (error) {
      if (!controller.signal.aborted) { setModelState('ready'); setSetReviewError(error instanceof Error ? error.message : 'Set review failed.'); }
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400">
            <ScanSearch className="h-4 w-4" aria-hidden="true" /> Prompt Review
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">Make the next instruction clearer.</h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Find unclear scope and missing details, then choose what to change.</p>
        </div>
        {undo && undo.mode === mode && undo.name === selectedFile && (
          <button type="button" onClick={handleUndo} className={outlineButton}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Undo last change</button>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900" role="group" aria-label="Review source">
        {([['prompt', 'Prompt'], ['file', 'Agent / steering file']] as const).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setCategory('details'); }}
            className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${mode === id ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'file' && <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Instruction file set">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">Review the instruction set</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Different assistants discover different files. Choose the one you use.</p>
          </div>
          <label className="min-w-[180px] text-xs font-medium text-zinc-700 dark:text-zinc-300">Assistant environment
            <select value={platform} onChange={(event) => { setPlatform(event.target.value as ReviewPlatform); setCategory('details'); }} className={`${inputClass} mt-1.5`}>
              <option value="generic">General instructions</option>
              <option value="kiro">Kiro</option>
              <option value="codex">Codex</option>
              <option value="antigravity">Antigravity</option>
            </select>
          </label>
        </div>
        {fileSet.length > 0 ? <>
          <p className="mt-4 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{platform === 'kiro' ? `Kiro foundation · ${fileSet.filter((item) => item.hasContent).length} of 3 added with content` : 'Recognized guidance · optional and project dependent'}</p>
          <div className={`mt-2 grid gap-2 ${platform === 'kiro' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {fileSet.map((item) => <div key={item.id} className="flex min-w-0 flex-col justify-between rounded-xl border border-zinc-200 bg-[#F7FAFB] p-3 dark:border-zinc-700 dark:bg-zinc-950">
              <div>
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-zinc-950 dark:text-white">{item.label}</h3><span className={`shrink-0 text-xs font-semibold ${item.hasContent ? 'text-teal-700 dark:text-teal-400' : 'text-amber-700 dark:text-amber-400'}`}>{item.hasContent ? 'Added' : item.uploadedName ? 'Empty draft' : 'Not added'}</span></div>
                <p className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">{item.expectedPath}</p>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{item.description}</p>
                {item.hasContent && !item.pathVerified && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Folder location unverified</p>}
              </div>
              {item.uploadedName ? <button type="button" onClick={() => { setSelectedFile(item.uploadedName!); setCategory('details'); }} className="mt-3 self-start text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">Review file →</button>
                : platform === 'kiro' ? <button type="button" onClick={() => createDraft(item.expectedPath)} className="mt-3 self-start text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">Create empty draft →</button> : null}
            </div>)}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">“Not added” means PromptZip has not seen the file; it cannot confirm whether it exists in your project. Kiro also supports custom steering files beyond these three.</p>
        </> : <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Add any instructions used by this assistant. There is no universal number of files to require.</p>}
        {platform === 'kiro' && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => folderInputRef.current?.click()} className={`${outlineButton} min-h-9 px-3 text-xs`}><Upload className="h-3.5 w-3.5" aria-hidden="true" /> Choose steering folder</button>
          <a href="https://kiro.dev/docs/steering/" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">Kiro file guide ↗</a>
        </div>}
        {files.filter((file) => file.text.trim()).length > 1 && <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Compare files together</h3><p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Qwen can look for contradictions and overlapping guidance across the uploaded set.</p></div>
            <button type="button" disabled={modelState !== 'ready'} onClick={() => void runSetReview()} className={`${outlineButton} disabled:cursor-not-allowed disabled:opacity-50`}><Sparkles className="h-4 w-4" aria-hidden="true" /> {modelState === 'running' ? 'Reviewing…' : 'Review all with Qwen'}</button></div>
          {modelState !== 'ready' && modelState !== 'running' && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Connect a local Qwen model below to compare file contents.</p>}
          {files.reduce((total, file) => total + Math.min(file.text.length, 5_000), 0) > 16_000 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">The combined review uses the first 16,000 characters; inspect longer files individually too.</p>}
          {setReviewError && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400" role="alert">{setReviewError}</p>}
          {setFindings.length > 0 && <div className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-3 dark:divide-zinc-800 dark:border-zinc-700">
            {setFindings.map((finding) => <div key={finding.id} className="py-3"><p className="text-sm font-semibold text-zinc-900 dark:text-white">{finding.title}</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{finding.explanation}</p>{finding.question && <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-400">{finding.question}</p>}</div>)}
          </div>}
        </div>}
      </section>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{mode === 'prompt' ? 'Your prompt' : 'Instruction file'}</h2>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{mode === 'prompt' ? 'Shared with the compressor. Changes here update its input.' : 'Only files you add here can be checked for references.'}</p>
            </div>
            {mode === 'file' && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openNewFile} className={primaryButton}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> New Markdown</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className={outlineButton}><Upload className="h-4 w-4" aria-hidden="true" /> Upload files</button>
            </div>}
          </div>
          {mode === 'file' && isCreatingFile && <form onSubmit={submitNewFile} className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <label htmlFor="new-markdown-file" className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">File name or project path</label>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Examples: AGENTS.md or .kiro/steering/product.md. A missing .md extension is added automatically.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input id="new-markdown-file" autoFocus className={`${inputClass} min-w-[220px] flex-1 font-mono`} value={newFileName} onChange={(event) => { setNewFileName(event.target.value); setNewFileError(''); }} aria-invalid={Boolean(newFileError)} aria-describedby={newFileError ? 'new-markdown-error' : undefined} />
              <button type="submit" className={primaryButton}>Create & write</button>
              <button type="button" onClick={() => { setIsCreatingFile(false); setNewFileError(''); }} className={outlineButton}>Cancel</button>
            </div>
            {newFileError && <p id="new-markdown-error" role="alert" className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-400">{newFileError}</p>}
          </form>}
          {mode === 'file' && (
            <div className="mb-3 flex flex-wrap gap-2">
              {files.map((file) => <div key={file.name} className={`inline-flex max-w-full items-center rounded-lg border ${selectedFile === file.name ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
                <button type="button" onClick={() => setSelectedFile(file.name)} aria-pressed={selectedFile === file.name} className="min-h-10 min-w-0 truncate py-2 pl-3 pr-2 text-left text-sm"><FileText className="mr-1 inline h-4 w-4" aria-hidden="true" />{file.name}</button>
                <button type="button" onClick={() => removeFile(file.name)} aria-label={`Remove ${file.name} from review`} className="mr-1 rounded p-1.5 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-blue-600"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>)}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple className="sr-only" aria-label="Add markdown or text instruction files" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }} />
          <input ref={(node) => { folderInputRef.current = node; node?.setAttribute('webkitdirectory', ''); }} type="file" multiple className="sr-only" aria-label="Choose a steering folder" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }} />
          {mode === 'file' && files.length === 0 ? (
            <div className="flex min-h-72 w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-950" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
              <Upload className="h-7 w-7 text-blue-600" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold">Write a new file or upload existing instructions</span>
              <span className="mt-1 text-xs text-zinc-500">Drop .md and .txt files here · 256 KB each</span>
              <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={openNewFile} className={primaryButton}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Write Markdown</button><button type="button" onClick={() => fileInputRef.current?.click()} className={outlineButton}><Upload className="h-4 w-4" aria-hidden="true" /> Choose files</button></div>
            </div>
          ) : (
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
              <span className="sr-only">{mode === 'prompt' ? 'Prompt text' : `${selectedFile} contents`}</span>
              <textarea ref={editorRef} value={text} onChange={(event) => { setUndo(null); updateText(event.target.value); }} spellCheck={false}
                placeholder={mode === 'prompt' ? 'Describe what you want to accomplish…' : 'Paste project instructions here…'}
                className={`${inputClass} min-h-[330px] resize-y font-mono leading-relaxed sm:min-h-[430px]`} />
            </label>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{text.trim() ? `${text.trim().split(/\s+/).length} words · ${text.length.toLocaleString()} characters` : 'Start with text to see instant checks'}</span>
            {mode === 'prompt' ? (
              <button type="button" onClick={() => onNavigateTab('workbench')} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-blue-700 hover:underline dark:text-blue-400">Compress reviewed prompt <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            ) : activeFile ? (
              <button type="button" onClick={() => downloadBlobFile(new Blob([text], { type: 'text/markdown;charset=utf-8' }), activeFile.name.split('/').pop() || 'instructions.md')} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-blue-700 hover:underline dark:text-blue-400"><Download className="h-4 w-4" aria-hidden="true" /> Download revised file</button>
            ) : null}
          </div>
          {mode === 'file' && activeFile && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Draft kept in this browser tab. Download the file to save it to your project{activeFile.name.includes('/') ? ` at ${activeFile.name}` : ''}.</p>}
          {mode === 'file' && storageError && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400" role="alert">Browser storage is full or unavailable. Download your file now to keep your changes.</p>}
        </section>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-36">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Review findings">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{attentionCount ? `${attentionCount} detail${attentionCount === 1 ? '' : 's'} to consider` : 'No immediate issues found'}</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">Instant checks are suggestions, not a completeness certificate.</p>
              </div>
              {text.trim() && <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{visible.filter((item) => item.priority === 'unverified').length} unverified</span>}
            </div>
            {mode === 'file' && coverage.length > 0 && <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Signals checked in this file</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {coverage.map((check) => <div key={check.id} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {check.detected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />}
                  <span>{check.title}: {check.detected ? 'signal found' : 'review'}</span>
                </div>)}
              </div>
              {platform === 'codex' && !files.some((file) => /(^|\/)AGENTS\.md$/i.test(file.name)) && <p className="mt-2 text-xs text-zinc-500">No AGENTS.md was uploaded. Add it if your project uses project-wide agent instructions.</p>}
            </div>}
            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800" role="tablist" aria-label="Finding types">
              {categories.map((item) => <button type="button" key={item.id} role="tab" aria-selected={category === item.id} onClick={() => setCategory(item.id)}
                className={`min-h-11 shrink-0 border-b-2 px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${category === item.id ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'}`}>
                {mode === 'file' && item.id === 'details' ? 'File coverage' : item.title} <span className="ml-1 text-xs">{visible.filter((finding) => finding.category === item.id).length}</span>
              </button>)}
            </div>
            <div role="tabpanel" className="max-h-[580px] overflow-y-auto">
              {!text.trim() ? <p className="py-8 text-center text-sm text-zinc-500">Add text to begin the review.</p> : selectedFindings.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-sm text-zinc-600 dark:text-zinc-300"><CheckCircle2 className="h-5 w-5 text-teal-600" aria-hidden="true" /> No findings in this section.</div>
              ) : selectedFindings.map((finding) => {
                const answer = drafts[finding.id] ?? '';
                return <article key={finding.id} className="border-b border-zinc-100 py-4 last:border-0 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold ${finding.priority === 'important' ? 'text-amber-700 dark:text-amber-400' : finding.priority === 'unverified' ? 'text-zinc-500' : 'text-blue-700 dark:text-blue-400'}`}>{finding.priority === 'important' ? 'Needs attention' : finding.priority === 'unverified' ? 'Unverified' : 'Consider'}</span>
                        {finding.source === 'qwen' && <span className="text-xs text-zinc-500">· Qwen</span>}
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{finding.title}</h3>
                    </div>
                    <button type="button" onClick={() => setDismissed((previous) => new Set(previous).add(finding.id))} aria-label={`Dismiss ${finding.title}`} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-800"><X className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{finding.explanation}</p>
                  {finding.excerpt && <button type="button" onClick={() => focusExcerpt(finding)} className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-left text-xs font-medium text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200"><Highlighter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{finding.excerpt}</span></button>}
                  {finding.question && <div className="mt-3"><label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor={`answer-${finding.id}`}>{finding.question}</label><input id={`answer-${finding.id}`} className={`${inputClass} mt-1.5`} value={answer} onChange={(event) => setDrafts((previous) => ({ ...previous, [finding.id]: event.target.value }))} placeholder={finding.kind === 'replace' ? 'Replacement wording that fits the sentence…' : 'Your specific detail…'} /></div>}
                  {finding.kind !== 'inspect' && <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={finding.kind !== 'remove' && !answer.trim()} onClick={() => startPreview(finding)} className={`${outlineButton} min-h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50`}>Preview change <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  </div>}
                  {preview?.id === finding.id && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                    <label htmlFor="review-preview" className="text-xs font-semibold text-blue-900 dark:text-blue-200">Your text after this change · edit if the sentence needs adjustment</label>
                    <textarea id="review-preview" value={preview.after} onChange={(event) => setPreview({ ...preview, after: event.target.value })} className={`${inputClass} mt-2 min-h-36 max-h-64 resize-y font-mono text-xs leading-relaxed`} />
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={applyPreview} className={`${primaryButton} min-h-9 px-3 text-xs`}><Check className="h-4 w-4" aria-hidden="true" /> Apply change</button><button type="button" onClick={() => setPreview(null)} className="min-h-9 px-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">Cancel</button></div>
                  </div>}
                </article>;
              })}
            </div>
            {dismissed.size > 0 && <button type="button" onClick={() => setDismissed(new Set())} className="mt-3 min-h-9 text-xs font-medium text-zinc-600 underline dark:text-zinc-300">Show {dismissed.size} dismissed finding{dismissed.size === 1 ? '' : 's'}</button>}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Local AI review">
            <div className="flex items-start gap-3"><span className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Sparkles className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Optional local Qwen review</h2><p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">Requires Ollama and a Qwen model installed on your device. PromptZip contacts localhost to check available models; it sends the selected text to Ollama only when you run a review. Instant checks work without it.</p></div></div>
            {modelState === 'ready' || modelState === 'running' ? <div className="mt-4 flex flex-wrap items-end gap-2"><label className="min-w-[150px] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">Installed model<select value={modelName} onChange={(event) => setModelName(event.target.value)} className={`${inputClass} mt-1.5`}>{modelNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><button type="button" disabled={!text.trim() || modelState === 'running'} onClick={() => void runLocalReview()} className={primaryButton}>{modelState === 'running' ? 'Reviewing…' : 'Run Qwen review'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div> : <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {modelState === 'checking' ? 'Checking for Ollama…' : <><div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100"><CircleHelp className="h-4 w-4" aria-hidden="true" /> {modelState === 'missing' ? 'No Qwen model installed' : 'Ollama is not connected'}</div><p className="mt-1">Install <a className="font-medium text-blue-700 underline dark:text-blue-400" href="https://ollama.com/download" target="_blank" rel="noreferrer">Ollama</a>, then run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ollama pull qwen3.5:4b</code> in your terminal.</p><button type="button" onClick={() => void checkModel()} className="mt-2 min-h-9 font-semibold text-blue-700 underline dark:text-blue-400">Check again</button></>}
            </div>}
            {modelError && <p role="alert" className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{modelError}</p>}
            {text.length > 16_000 && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Qwen will review the first 16,000 characters; instant checks still cover the full text.</p>}
          </section>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Findings are advisory. Only your approved edits change the text. Files are reviewed in this browser session; download a revised file to keep it.</p>
    </div>
  );
}
