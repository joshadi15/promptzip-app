import { analyzeAntiSlop } from './antiSlop';

export type ReviewMode = 'prompt' | 'file';
export type ReviewPlatform = 'generic' | 'kiro' | 'codex' | 'antigravity';
export type ReviewCategory = 'details' | 'ambiguity' | 'wording';
export type ReviewPriority = 'important' | 'consider' | 'unverified';

export interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  priority: ReviewPriority;
  title: string;
  explanation: string;
  question?: string;
  excerpt?: string;
  offset?: number;
  kind: 'add' | 'replace' | 'remove' | 'inspect';
  source: 'instant' | 'qwen';
}

export interface ReviewFile {
  name: string;
  text: string;
}

export function normalizeMarkdownFileName(value: string): string {
  let name = value.trim();
  if (!name || name.startsWith('/') || name.includes('\\') || /[\x00-\x1f:*?"<>|]/.test(name)) {
    throw new Error('Enter a relative Markdown filename, such as AGENTS.md or .kiro/steering/product.md.');
  }
  name = name.replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  if (name.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Use a path inside the project without . or .. segments.');
  }
  if (!/\.[^/.]+$/.test(name)) name += '.md';
  if (!/\.md$/i.test(name)) throw new Error('New instruction files must use the .md extension.');
  return name;
}

export interface FileCoverage {
  id: string;
  title: string;
  detected: boolean;
}

export interface FileSetItem {
  id: string;
  label: string;
  expectedPath: string;
  description: string;
  uploadedName?: string;
  hasContent: boolean;
  pathVerified: boolean;
}

const KIRO_FOUNDATION = [
  { id: 'product', label: 'Product', expectedPath: '.kiro/steering/product.md', description: 'Purpose, users, features, and goals' },
  { id: 'tech', label: 'Technology', expectedPath: '.kiro/steering/tech.md', description: 'Stack, tools, and constraints' },
  { id: 'structure', label: 'Structure', expectedPath: '.kiro/steering/structure.md', description: 'Folders, naming, and architecture' },
] as const;

export function reviewFileSet(files: ReviewFile[], platform: ReviewPlatform): FileSetItem[] {
  if (platform === 'kiro') return KIRO_FOUNDATION.map((item) => {
    const uploaded = files.find((file) => file.name.toLowerCase().replace(/\\/g, '/').match(new RegExp(`^(?:.*\\.kiro/steering/|(?:.*\\/)?steering/)?${item.id}\\.md$`)));
    return { ...item, uploadedName: uploaded?.name, hasContent: Boolean(uploaded?.text.trim()), pathVerified: Boolean(uploaded && uploaded.name.toLowerCase().replace(/\\/g, '/').includes(`.kiro/steering/${item.id}.md`)) };
  });
  if (platform === 'codex') {
    const uploaded = files.find((file) => /(^|\/)AGENTS\.md$/i.test(file.name));
    return [{ id: 'agents', label: 'Project instructions', expectedPath: 'AGENTS.md', description: 'Optional repository guidance; nested AGENTS.md files may also apply', uploadedName: uploaded?.name, hasContent: Boolean(uploaded?.text.trim()), pathVerified: Boolean(uploaded && uploaded.name.includes('/')) }];
  }
  if (platform === 'antigravity') {
    const uploaded = files.find((file) => /(^|\/)(?:AGENTS|GEMINI)\.md$/i.test(file.name) || /(^|\/)\.agents\/rules\/[^/]+\.md$/i.test(file.name));
    return [{ id: 'rules', label: 'Project rules', expectedPath: 'AGENTS.md, GEMINI.md, or .agents/rules/*.md', description: 'One or more applicable rules; additional directory rules are optional', uploadedName: uploaded?.name, hasContent: Boolean(uploaded?.text.trim()), pathVerified: Boolean(uploaded && uploaded.name.includes('/')) }];
  }
  return [];
}

const ambiguityRules: Array<{ pattern: RegExp; title: string; question: string }> = [
  { pattern: /\b(?:fast|quickly|cepat)\b/i, title: 'Speed needs a target', question: 'What specific speed or response time matters here?' },
  { pattern: /\b(?:user[- ]friendly|easy to use|mudah digunakan)\b/i, title: 'Define the user experience', question: 'Who is the user, and which task should feel easy?' },
  { pattern: /\b(?:modern|clean|intuitive|professional|bagus|menarik)\b/i, title: 'Define the quality you want', question: 'What would this quality mean for this particular task?' },
  { pattern: /\b(?:etc\.?|and so on|dan lain[- ]lain|dll\.?)\b/i, title: 'List the remaining scope', question: 'Which additional items must be included?' },
  { pattern: /\b(?:as needed|if appropriate|where possible|seperlunya)\b/i, title: 'Set a decision rule', question: 'When should this be done, and when should it be skipped?' },
  { pattern: /\b(?:better|improve|optimize|lebih baik|perbaiki)\b/i, title: 'Define what improves', question: 'Which result should improve, and how will you judge it?' },
];

function findFirst(text: string, pattern: RegExp): { excerpt: string; offset: number } | undefined {
  const match = pattern.exec(text);
  return match && match.index !== undefined ? { excerpt: match[0], offset: match.index } : undefined;
}

function detail(id: string, title: string, explanation: string, question: string, priority: ReviewPriority = 'consider'): ReviewFinding {
  return { id, category: 'details', priority, title, explanation, question, kind: 'add', source: 'instant' };
}

function instructionType(name: string): 'agent' | 'steering' | 'instructions' {
  const lower = name.toLowerCase();
  if (/(^|\/)agents\.md$|(^|\/)claude\.md$|(^|\/)gemini\.md$/.test(lower)) return 'agent';
  if (/steering|\.kiro\//.test(lower)) return 'steering';
  return 'instructions';
}

export function fileCoverage(text: string, fileName: string, platform: ReviewPlatform = 'generic'): FileCoverage[] {
  const baseName = fileName.toLowerCase().split('/').pop();
  if (platform === 'kiro' && baseName === 'product.md') return [
    { id: 'product-purpose', title: 'Product purpose', detected: /\b(?:purpose|goal|problem|objective|mission|why|tujuan|masalah)\b/i.test(text) },
    { id: 'product-users', title: 'Target users', detected: /\b(?:users?|customers?|audience|personas?|pengguna|pelanggan)\b/i.test(text) },
    { id: 'product-features', title: 'Key features', detected: /\b(?:feature|capabilit|workflow|fungsi|fitur|alur)\w*/i.test(text) },
  ];
  if (platform === 'kiro' && baseName === 'tech.md') return [
    { id: 'tech-stack', title: 'Frameworks and languages', detected: /\b(?:stack|framework|language|typescript|javascript|python|react|node|java|rust|bahasa|teknologi)\b/i.test(text) },
    { id: 'tech-tools', title: 'Tools and dependencies', detected: /\b(?:tool|library|dependenc|package|database|build|deploy|alat|pustaka|library)\w*/i.test(text) },
    { id: 'tech-constraints', title: 'Technical constraints', detected: /\b(?:constraint|version|require|avoid|must|only|batasan|versi|wajib|jangan)\w*/i.test(text) },
  ];
  if (platform === 'kiro' && baseName === 'structure.md') return [
    { id: 'structure-folders', title: 'Folders and modules', detected: /\b(?:folder|directory|module|direktori|struktur)\b|(?:^|[\s`])(?:src|app|packages)\//im.test(text) },
    { id: 'structure-naming', title: 'Naming conventions', detected: /\b(?:naming|convention|pattern|suffix|prefix|penamaan|konvensi)\b/i.test(text) },
    { id: 'structure-architecture', title: 'Architecture and imports', detected: /\b(?:architect|import|layer|component|service|boundary|arsitektur|lapisan)\w*/i.test(text) },
  ];
  const checks = [
    { id: 'file-purpose', title: 'Project and scope', pattern: /\b(?:purpose|goal|objective|project|repository|scope|tujuan|proyek|repositori|cakupan)\b/i },
    { id: 'file-action', title: 'Actionable rules', pattern: /\b(?:must|should|use|avoid|do not|never|always|run|test|verify|wajib|gunakan|hindari|jangan|pastikan)\b/i },
  ];
  if (instructionType(fileName) === 'agent') checks.push(
    { id: 'file-verification', title: 'Verification steps', pattern: /\b(?:test|lint|build|check|verify|validasi|uji|periksa)\b/i },
    { id: 'file-boundaries', title: 'Boundaries', pattern: /\b(?:avoid|do not|never|only|preserve|before|jangan|hindari|hanya|pertahankan)\b/i },
  );
  return checks.map(({ id, title, pattern }) => ({ id, title, detected: pattern.test(text) }));
}

export function reviewText(text: string, mode: ReviewMode, fileName = '', files: ReviewFile[] = [], platform: ReviewPlatform = 'generic'): ReviewFinding[] {
  if (!text.trim()) return [];
  const findings: ReviewFinding[] = [];
  const addIfAbsent = (id: string, pattern: RegExp, title: string, explanation: string, question: string, priority: ReviewPriority = 'consider') => {
    if (!pattern.test(text)) findings.push(detail(id, title, explanation, question, priority));
  };

  if (mode === 'prompt') {
    if (text.trim().split(/\s+/).length < 7) {
      findings.push(detail('prompt-goal', 'Clarify the requested result', 'A very short prompt may leave the task open to interpretation.', 'What should the assistant deliver?', 'important'));
    }
    if (/\b(?:build|create|make|write|design|buat|bikin)\b/i.test(text)) {
      addIfAbsent('prompt-output', /\b(?:return|output|deliver|format|result|hasil|berikan|as a|dalam bentuk)\b/i,
        'Describe the deliverable', 'The task asks for an artifact without saying what form it should take.', 'What exact output or format do you want?');
    }
  } else {
    const copy = {
      'file-purpose': ['Explain this file’s purpose', 'Readers may not know where these instructions apply.', 'Which project, folder, or task does this file govern?'],
      'file-action': ['Add actionable instructions', 'The file does not clearly state what an agent should do.', 'What are the most important actions or boundaries?'],
      'file-verification': ['Describe verification', 'The agent may not know how to check a change.', 'Which relevant commands or checks should it run?'],
      'file-boundaries': ['Define boundaries', 'Important behavior or files may need to be protected.', 'What must the agent preserve or avoid?'],
      'product-purpose': ['Describe the product purpose', 'The product brief needs a reason for the project.', 'What user problem does this product solve?'],
      'product-users': ['Name the target users', 'Product decisions depend on who uses it.', 'Who are the primary users?'],
      'product-features': ['List the key features', 'The product brief does not identify its main capabilities.', 'Which workflows or features matter most?'],
      'tech-stack': ['Document the stack', 'Kiro needs the existing languages and frameworks.', 'Which languages and frameworks are used?'],
      'tech-tools': ['Document tools and dependencies', 'Kiro needs to know the established tooling.', 'Which tools, packages, and data stores are used?'],
      'tech-constraints': ['State technical constraints', 'Technical boundaries guide implementation choices.', 'Which versions or constraints must be followed?'],
      'structure-folders': ['Map important folders', 'Kiro needs to find the relevant code.', 'What are the major folders or modules?'],
      'structure-naming': ['Describe naming conventions', 'Names and paths should fit this project.', 'How are files and modules named?'],
      'structure-architecture': ['Describe architecture', 'Kiro needs to understand component and import boundaries.', 'Which layers or import patterns matter?'],
    } as const;
    for (const check of fileCoverage(text, fileName, platform)) {
      if (check.detected) continue;
      const [title, explanation, question] = copy[check.id as keyof typeof copy];
      findings.push(detail(check.id, title, explanation, question, check.id === 'file-purpose' || check.id === 'file-action' ? 'important' : 'consider'));
    }

    if (platform === 'kiro') {
      const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/);
      const inclusion = frontmatter?.[1].match(/^inclusion:\s*(\S+)/m)?.[1];
      if (inclusion === 'fileMatch' && !/^fileMatchPattern\s*:/m.test(frontmatter?.[1] ?? '')) {
        findings.push(detail('kiro-file-match', 'Add a file match pattern', 'Kiro needs a pattern for conditional inclusion.', 'Which files should activate this steering file?', 'important'));
      }
      if (inclusion === 'auto' && (!/^name\s*:/m.test(frontmatter?.[1] ?? '') || !/^description\s*:/m.test(frontmatter?.[1] ?? ''))) {
        findings.push(detail('kiro-auto-meta', 'Complete auto inclusion metadata', 'Kiro needs a name and description to choose when to include this file.', 'What name and matching description should it use?', 'important'));
      }
      if (inclusion && !['always', 'fileMatch', 'auto', 'manual'].includes(inclusion)) {
        findings.push({ id: 'kiro-inclusion', category: 'details', priority: 'important', title: 'Check inclusion mode', explanation: `“${inclusion}” is not a supported Kiro inclusion mode.`, kind: 'inspect', source: 'instant' });
      }
    }
    if (platform === 'antigravity' && /(^|\/)\.agents\/rules\/[^/]+\.md$/i.test(fileName) && !/^---\s*\n[\s\S]*?^trigger:\s*(?:always_on|model_decision|glob|manual)\s*$/m.test(text)) {
      findings.push(detail('antigravity-trigger', 'Add a valid rule trigger', 'Antigravity requires trigger frontmatter for modular rule files.', 'Should this rule be always on, conditional, or manual?', 'important'));
    }

    // A path mentioned in prose does not prove that its target exists on disk.
    // Verify against explicitly uploaded files only and show all other paths as unverified.
    const references = [...text.matchAll(/(?:\[[^\]]+\]\(([^)]+)\)|`((?:\.{1,2}\/|[\w.-]+\/)[^`\n]+)`|#\[\[file:([^\]:]+)(?::\d+(?:-\d+)?)?\]\])/g)];
    const seen = new Set<string>();
    for (const match of references.slice(0, 20)) {
      const target = (match[1] || match[2] || match[3]).split('#')[0].trim();
      if (!target || /^(?:https?:|mailto:|#)/i.test(target) || seen.has(target)) continue;
      seen.add(target);
      const normalized = target.replace(/^\.\//, '');
      const supplied = files.some((file) => {
        const uploadedPath = file.name.replace(/\\/g, '/').replace(/^\.\//, '');
        return uploadedPath === normalized || uploadedPath.endsWith(`/${normalized}`);
      });
      if (supplied) continue;
      findings.push({
        id: `reference-${target}`, category: 'details', priority: 'unverified',
        title: `Check reference: ${target}`, explanation: 'This path was not among the uploaded files. PromptZip cannot inspect your project filesystem.',
        excerpt: match[0], offset: match.index, kind: 'inspect', source: 'instant',
      });
    }
  }

  const seenSpans = new Set<number>();
  for (const [index, rule] of ambiguityRules.entries()) {
    const match = findFirst(text, rule.pattern);
    if (!match || seenSpans.has(match.offset)) continue;
    seenSpans.add(match.offset);
    findings.push({
      id: `ambiguity-${index}`, category: 'ambiguity', priority: 'consider', title: rule.title,
      explanation: `“${match.excerpt}” can mean different things to different readers.`,
      question: rule.question, ...match, kind: 'replace', source: 'instant',
    });
  }

  const antiSlop = analyzeAntiSlop(text);
  for (const phrase of antiSlop.slopPhrases) {
    const match = findFirst(text, new RegExp(phrase.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    if (!match) continue;
    findings.push({
      id: `wording-${phrase.id}`, category: 'wording', priority: 'consider',
      title: 'Remove boilerplate', explanation: phrase.reason, ...match, kind: 'remove', source: 'instant',
    });
  }
  return findings;
}

export function proposedText(text: string, finding: ReviewFinding, answer: string): string | null {
  if (finding.kind === 'inspect') return null;
  if (finding.kind === 'add') {
    if (!answer.trim()) return null;
    return `${text.trimEnd()}\n\n${finding.title}: ${answer.trim()}`;
  }
  if (finding.offset === undefined || !finding.excerpt || text.slice(finding.offset, finding.offset + finding.excerpt.length) !== finding.excerpt) return null;
  const replacement = finding.kind === 'remove' ? '' : answer.trim();
  if (finding.kind === 'replace' && !replacement) return null;
  return text.slice(0, finding.offset) + replacement + text.slice(finding.offset + finding.excerpt.length);
}
