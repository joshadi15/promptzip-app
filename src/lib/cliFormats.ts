import { compressPrompt, convertJsonArraysToToon } from './compression';

export type AiFriendlyFormat = 'compressed' | 'prompt-ir' | 'kv' | 'xml' | 'toon' | 'system-split';

export type CliTargetId =
  | 'claude'
  | 'gemini'
  | 'codex'
  | 'aider'
  | 'ollama'
  | 'llm'
  | 'curl-openai'
  | 'curl-anthropic';

export type ShellFlavor = 'bash' | 'powershell';

export interface CliTargetInfo {
  id: CliTargetId;
  name: string;
  binary: string;
  description: string;
}

export const CLI_TARGETS: CliTargetInfo[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    description: 'Headless non-interactive print mode (-p) for terminal & CI pipelines.',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    binary: 'gemini',
    description: 'Google Gemini terminal agent with direct prompt flag or stdin pipe.',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    binary: 'codex',
    description: 'Local coding agent invocation with compact directive.',
  },
  {
    id: 'aider',
    name: 'Aider',
    binary: 'aider',
    description: 'AI pair programming in git repos via --message one-shot flag.',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local Offline)',
    binary: 'ollama',
    description: '100% offline local model inference with minimal KV-cache footprint.',
  },
  {
    id: 'llm',
    name: 'llm CLI (Piped)',
    binary: 'llm',
    description: 'Universal unix-pipe LLM CLI utility for shell scripting.',
  },
  {
    id: 'curl-openai',
    name: 'cURL (OpenAI Compatible)',
    binary: 'curl',
    description: 'Standard /v1/chat/completions payload for OpenAI, Groq, vLLM, or LM Studio.',
  },
  {
    id: 'curl-anthropic',
    name: 'cURL (Anthropic Messages)',
    binary: 'curl',
    description: 'Anthropic /v1/messages payload separating static rules from user input.',
  },
];

interface ParsedSections {
  task: string[];
  req: string[];
  avoid: string[];
  fmt: string[];
  ctx: string[];
}

function parseIntoSections(text: string): ParsedSections {
  const sections: ParsedSections = {
    task: [],
    req: [],
    avoid: [],
    fmt: [],
    ctx: [],
  };

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      codeLines.push(line);
      if (!inCodeBlock) {
        sections.ctx.push(codeLines.join('\n'));
        codeLines = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const lower = line.toLowerCase();
    if (lower.startsWith('task:') || lower.startsWith('@do ')) {
      sections.task.push(line.replace(/^(?:task:|@do)\s*/i, '').trim());
    } else if (
      lower.startsWith('req:') ||
      lower.startsWith('rules:') ||
      lower.startsWith('@req ') ||
      lower.startsWith('@env ')
    ) {
      sections.req.push(line.replace(/^(?:req:|rules:|@req|@env)\s*/i, '').trim());
    } else if (lower.startsWith('avoid:') || lower.startsWith('no:') || lower.startsWith('@ban ')) {
      sections.avoid.push(line.replace(/^(?:avoid:|no:|@ban)\s*/i, '').trim());
    } else if (lower.startsWith('fmt:') || lower.startsWith('output:') || lower.startsWith('@out ')) {
      sections.fmt.push(line.replace(/^(?:fmt:|output:|@out)\s*/i, '').trim());
    } else if (lower.startsWith('ctx:') || lower.startsWith('@ctx') || lower.startsWith('rows[')) {
      const cleaned = line.replace(/^(?:ctx:|@ctx)\s*/i, '').trim();
      if (cleaned) sections.ctx.push(cleaned);
    } else if (/\b(?:avoid|no:|never |don't|do not|ban )\b/i.test(lower)) {
      sections.avoid.push(line);
    } else if (/\b(?:fmt:|output|return|json|markdown|schema)\b/i.test(lower)) {
      sections.fmt.push(line);
    } else if (/\b(?:req:|ensure|must|strict|env:|audience:|limits:|style:|scope:)\b/i.test(lower)) {
      sections.req.push(line);
    } else if (sections.task.length === 0) {
      sections.task.push(line);
    } else {
      sections.ctx.push(line);
    }
  }

  if (codeLines.length > 0) {
    sections.ctx.push(codeLines.join('\n'));
  }

  return sections;
}

export function formatPromptForAi(compressedText: string, format: AiFriendlyFormat): string {
  const trimmed = compressedText.trim();
  if (!trimmed) return '';

  if (format === 'compressed') {
    return trimmed;
  }

  if (format === 'prompt-ir') {
    return /^@(?:DO|ENV|REQ|BAN|OUT|CTX)\b/m.test(trimmed)
      ? trimmed
      : compressPrompt(trimmed, 'machine-ir').output;
  }

  if (format === 'toon') {
    const { result } = convertJsonArraysToToon(trimmed);
    return result;
  }

  const sec = parseIntoSections(trimmed);

  if (format === 'kv') {
    const out: string[] = [];
    if (sec.task.length) out.push(`task: ${sec.task.join(' | ')}`);
    if (sec.req.length) out.push(`req: ${sec.req.join(' | ')}`);
    if (sec.avoid.length) out.push(`avoid: ${sec.avoid.join(' | ')}`);
    if (sec.fmt.length) out.push(`fmt: ${sec.fmt.join(' | ')}`);
    if (sec.ctx.length) out.push(`ctx:\n${sec.ctx.join('\n')}`);
    return out.join('\n');
  }

  if (format === 'xml') {
    const out: string[] = [];
    if (sec.task.length) out.push(`<task>\n${sec.task.join('\n')}\n</task>`);
    if (sec.req.length) out.push(`<constraints>\n${sec.req.join('\n')}\n</constraints>`);
    if (sec.avoid.length) out.push(`<avoid>\n${sec.avoid.join('\n')}\n</avoid>`);
    if (sec.fmt.length) out.push(`<output_format>\n${sec.fmt.join('\n')}\n</output_format>`);
    if (sec.ctx.length) out.push(`<context>\n${sec.ctx.join('\n')}\n</context>`);
    return out.join('\n');
  }

  // system-split: separates reusable instructions (cacheable) from per-call payload
  const systemParts: string[] = [];
  if (sec.req.length) systemParts.push(`req: ${sec.req.join('; ')}`);
  if (sec.avoid.length) systemParts.push(`avoid: ${sec.avoid.join('; ')}`);
  if (sec.fmt.length) systemParts.push(`fmt: ${sec.fmt.join('; ')}`);

  const userParts: string[] = [];
  if (sec.task.length) userParts.push(sec.task.join('\n'));
  if (sec.ctx.length) userParts.push(sec.ctx.join('\n'));

  return JSON.stringify(
    {
      system: systemParts.join('\n') || 'Concise expert assistant. Follow constraints strictly.',
      user: userParts.join('\n\n') || trimmed,
    },
    null,
    2
  );
}

function escapeShellArg(text: string, shell: ShellFlavor): string {
  const singleLine = text.replace(/\r\n/g, '\n');
  if (shell === 'bash') {
    // POSIX single-quote escaping: ' -> '\''
    return `'${singleLine.replace(/'/g, `'\\''`)}'`;
  }
  // PowerShell single-quote escaping: ' -> ''
  return `'${singleLine.replace(/'/g, "''")}'`;
}

export function buildCliCommand(
  promptText: string,
  target: CliTargetId,
  shell: ShellFlavor,
  pipeFilePath?: string,
  ollamaModel = 'llama3.2'
): string {
  const cleanPrompt = promptText.trim();
  if (!cleanPrompt) return '';

  const pipePrefix = pipeFilePath?.trim()
    ? shell === 'bash'
      ? `cat ${escapeShellArg(pipeFilePath.trim(), shell)} | `
      : `Get-Content -Raw ${escapeShellArg(pipeFilePath.trim(), shell)} | `
    : '';

  const arg = escapeShellArg(cleanPrompt, shell);

  switch (target) {
    case 'claude':
      return `${pipePrefix}claude -p ${arg}`;
    case 'gemini':
      return `${pipePrefix}gemini -p ${arg}`;
    case 'codex':
      return `${pipePrefix}codex ${arg}`;
    case 'aider':
      return `aider --no-auto-commits --message ${arg}`;
    case 'ollama':
      return `${pipePrefix}ollama run ${ollamaModel} ${arg}`;
    case 'llm':
      return `${pipePrefix}llm ${arg}`;
    case 'curl-openai': {
      const payload = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: cleanPrompt }],
      });
      return `curl -s https://api.openai.com/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d ${escapeShellArg(payload, shell)}`;
    }
    case 'curl-anthropic': {
      const sec = parseIntoSections(cleanPrompt);
      const sys = [...sec.req, ...sec.avoid, ...sec.fmt].join('\n');
      const usr = [...sec.task, ...sec.ctx].join('\n') || cleanPrompt;
      const payload = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        ...(sys ? { system: sys } : {}),
        messages: [{ role: 'user', content: usr }],
      });
      return `curl -s https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "Content-Type: application/json" \\\n  -d ${escapeShellArg(payload, shell)}`;
    }
  }
}
