import { BpeEncoding, countBpeTokens } from './tokenizer';

export type CompressionAlgorithmId =
  | 'lossless-prune'
  | 'telegraphic'
  | 'symbolic'
  | 'structured-kv'
  | 'machine-ir'
  | 'micro';

export interface CompressionOptions {
  protectCodeBlocks: boolean;
  protectQuotes: boolean;
  protectNumbers: boolean;
  foldJsonToToon: boolean;
  includeIrHeader: boolean;
}

export const DEFAULT_COMPRESSION_OPTIONS: CompressionOptions = {
  protectCodeBlocks: true,
  protectQuotes: true,
  protectNumbers: true,
  foldJsonToToon: true,
  includeIrHeader: false,
};

export interface AlgorithmMetadata {
  id: CompressionAlgorithmId;
  name: string;
  shortName: string;
  description: string;
  mechanism: string;
  bestFor: string;
  exampleBefore: string;
  exampleAfter: string;
}

export const ALGORITHMS: AlgorithmMetadata[] = [
  {
    id: 'lossless-prune',
    name: 'Conservative Cleanup',
    shortName: 'Cleanup',
    description:
      'Removes common pleasantries, hedges, duplicate lines, and whitespace. Review the result before using it.',
    mechanism: 'Removes polite filler & duplicate lines without changing technical wording',
    bestFor: 'Prompts needing small edits; always compare the output with the source',
    exampleBefore: 'Hello! Could you please make sure to return strict JSON? Thanks!',
    exampleAfter: 'Ensure return strict JSON.',
  },
  {
    id: 'telegraphic',
    name: 'Telegraphic Semantic Compressor',
    shortName: 'Telegraphic',
    description:
      'Folds wordy clauses into direct imperatives and drops low-information filler words (like non-essential articles) while keeping code, quotes, and numbers locked.',
    mechanism: 'Phrase folding ("in order to" -> "to") + article pruning',
    bestFor: 'Coding tasks, agent workflows, & multi-step instructions',
    exampleBefore: 'In order to handle errors, make sure that you log the user ID.',
    exampleAfter: 'To handle errors, ensure log user ID.',
  },
  {
    id: 'symbolic',
    name: 'Symbolic & Operator Shorthand',
    shortName: 'Symbolic',
    description:
      'Replaces common connectors with compact symbols (->, w/, w/o, &, vs, req:, fmt:, no:). Check the token count and readability.',
    mechanism: 'Substitutes logical operators & compact prefixes for common phrases',
    bestFor: 'Reasoning models, CLI one-liners, & dense constraint lists',
    exampleBefore: 'Build an API without Redux and compare latency versus memory.',
    exampleAfter: 'Build API w/o Redux & compare latency vs memory.',
  },
  {
    id: 'structured-kv',
    name: 'AI-Native KV & TOON Schema',
    shortName: 'KV / TOON',
    description:
      'Organizes free-form prose into compact key-value sections (task:, req:, avoid:, fmt:) and converts repeated JSON object arrays into tabular TOON rows.',
    mechanism: 'Semantic sectioning + JSON-to-TOON table folding (removes JSON brace/key tax)',
    bestFor: 'Prompts containing JSON arrays, records, or mixed rules & formatting specs',
    exampleBefore: '[{"id":1,"role":"admin"},{"id":2,"role":"user"}]',
    exampleAfter: 'rows[2]{id|role}:\n1|admin\n2|user',
  },
  {
    id: 'machine-ir',
    name: 'PromptIR (LLM Assembly)',
    shortName: 'PromptIR',
    description:
      'Reorganizes English prose into a compact symbolic format (@DO, @ENV, @REQ, @BAN, @OUT). Compare the output with your source before using it.',
    mechanism: 'Clause AST -> Opcode registers (@DO/@REQ/@BAN/@OUT) + functional predicates',
    bestFor: 'High clarity + low token count without losing constraints (Claude, GPT, Gemini & Ollama)',
    exampleBefore:
      'Please refactor this React component to handle loading, empty, and error states without Redux or Zustand, using Tailwind v4.',
    exampleAfter:
      '@DO refactor(React component)\n@ENV Tailwind v4\n@REQ handle(loading,empty,error states)\n@BAN Redux|Zustand',
  },
  {
    id: 'micro',
    name: 'Extreme Micro-Prompt',
    shortName: 'Micro',
    description:
      'Chains filler pruning, TOON table folding, telegraphic syntax, and symbolic operators together for maximum token savings.',
    mechanism: 'Full multi-pass pipeline (Prune -> TOON -> Telegraphic -> Symbolic)',
    bestFor: 'High-volume API loops, small budget models, & tight context windows',
    exampleBefore: 'Please make sure that you output without any extra notes and with TypeScript.',
    exampleAfter: 'fmt: output w/o extra notes & w/ TypeScript',
  },
];

export interface CompressionResult {
  algorithm: AlgorithmMetadata;
  output: string;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  reductionPct: number;
  inputChars: number;
  outputChars: number;
  retentionScore: number;
  preservedEntities: number;
  totalEntities: number;
  efficiencyScore: number;
  appliedTransforms: string[];
}

export interface BenchmarkSummary {
  results: CompressionResult[];
  best: CompressionResult;
}

interface ProtectedSpanStore {
  masked: string;
  restore: (text: string) => string;
  transforms: string[];
}

/**
 * Converts embedded uniform JSON object arrays into compact TOON tabular blocks:
 * [{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}] ->
 * data[2]{id,name}:
 * 1,Alice
 * 2,Bob
 */
export function convertJsonArraysToToon(text: string): { result: string; convertedCount: number } {
  let convertedCount = 0;
  // Match bracketed JSON arrays across multiple lines
  const arrayRegex = /\[\s*\{[\s\S]*?\}\s*\]/g;
  const result = text.replace(arrayRegex, (match) => {
    try {
      const parsed = JSON.parse(match);
      if (!Array.isArray(parsed) || parsed.length < 2) return match;
      if (!parsed.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
        return match;
      }

      const keys = Array.from(
        new Set(parsed.flatMap((row) => Object.keys(row as Record<string, unknown>)))
      );
      if (keys.length === 0) return match;

      const formatCell = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        const str = String(val).replace(/\n+/g, ' ').trim();
        return str.includes(',') ? `"${str.replace(/"/g, '\\"')}"` : str;
      };

      const rows = parsed.map((row) =>
        keys.map((k) => formatCell((row as Record<string, unknown>)[k])).join('|')
      );

      convertedCount += 1;
      return `rows[${parsed.length}]{${keys.join('|')}}:\n${rows.join('\n')}`;
    } catch {
      return match;
    }
  });

  return { result, convertedCount };
}

function protectSpans(input: string, options: CompressionOptions): ProtectedSpanStore {
  let masked = input;
  const slots: string[] = [];
  const transforms: string[] = [];

  const stash = (value: string): string => {
    const token = `__PZSPAN${slots.length}__`;
    slots.push(value);
    return token;
  };

  if (options.foldJsonToToon) {
    const { result, convertedCount } = convertJsonArraysToToon(masked);
    if (convertedCount > 0) {
      masked = result;
      transforms.push(`Folded ${convertedCount} JSON array(s) to TOON`);
    }
  }

  if (options.protectCodeBlocks) {
    masked = masked.replace(/```[\s\S]*?```/g, (m) => stash(m));
    masked = masked.replace(/`[^`\n]+`/g, (m) => stash(m));
  }

  // Always protect URLs and explicit file paths
  masked = masked.replace(/https?:\/\/[^\s)]+/g, (m) => stash(m));
  masked = masked.replace(/(?:^|\s)((?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.[a-zA-Z0-9]+)/g, (full, p) =>
    full.replace(p, stash(p))
  );

  if (options.protectQuotes) {
    masked = masked.replace(/"[^"\n]{2,140}"/g, (m) => stash(m));
  }

  if (options.protectNumbers) {
    masked = masked.replace(/\b\d+(?:\.\d+)?(?:%|ms|s|px|rem|kb|mb|gb|x)?\b/gi, (m) => stash(m));
  }

  const restore = (text: string): string => {
    let out = text;
    // Restore in reverse order in case nested spans occurred
    for (let i = slots.length - 1; i >= 0; i--) {
      out = out.split(`__PZSPAN${i}__`).join(slots[i]);
    }
    return out;
  };

  return { masked, restore, transforms };
}

const CONVERSATIONAL_OPENERS: Array<[RegExp, string]> = [
  [/^\s*(?:hi|hello|hey)(?:\s+there)?[!,.]*\s*/i, ''],
  [/^\s*could you(?: please)?\s+(?:help me\s+)?/i, ''],
  [/^\s*can you(?: please)?\s+(?:help me\s+)?/i, ''],
  [/^\s*would you(?: please)?\s+/i, ''],
  [/^\s*i would(?: really)?(?: like|appreciate it if)(?: you(?: to| could)?)?\s*/i, ''],
  [/^\s*i need you to\s+/i, ''],
  [/^\s*i want you to\s+/i, ''],
  [/^\s*please\s+(?:help me\s+)?/i, ''],
];

const FILLER_PHRASES: Array<[RegExp, string]> = [
  [/\bthank you(?: so much)?(?: in advance)?(?: for your help)?[!.]*/gi, ''],
  [/\bthanks(?: a lot| in advance)?[!.]*/gi, ''],
  [/\bfeel free to\s+/gi, ''],
  [/\bplease note that\s+/gi, ''],
  [/\bkeep in mind that\s+/gi, 'note: '],
  [/\bit would be great if you could\s+/gi, ''],
  [/\bbasically,?\s+/gi, ''],
  [/\bactually,?\s+/gi, ''],
  [/\bessentially,?\s+/gi, ''],
  [/\bthat i am currently working on\b/gi, ''],
  [/\bthat you need to process\b/gi, ''],
  [/\bthat you made\b/gi, ''],
  [/\bin order to do this properly,?\s*/gi, ''],
  [/\bfor all of the\b/gi, 'for'],
  [/\bthroughout the entire\b/gi, 'across'],
  [/\bplease make sure(?: that)?(?: you)?\s+/gi, 'ensure '],
  [/\bmake sure(?: that)?(?: you)?\s+/gi, 'ensure '],
  [/\bplease ensure(?: that)?\s+/gi, 'ensure '],
  [/\bplease\s+/gi, ''],
  [/\bcarefully\s+/gi, ''],
  [/\breally\s+/gi, ''],
  [/\bvery\s+/gi, ''],
  [/\bsuper\s+/gi, ''],
  [/\bjust\s+/gi, ''],
];

const TELEGRAPHIC_PHRASES: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bwith respect to\b/gi, 're:'],
  [/\bregarding the\b/gi, 're:'],
  [/\bin the event that\b/gi, 'if'],
  [/\bas well as\b/gi, 'and'],
  [/\bis capable of\b/gi, 'can'],
  [/\bwould be able to\b/gi, 'can'],
  [/\bis going to\b/gi, 'will'],
  [/\ba wide variety of\b/gi, 'various'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba lot of\b/gi, 'many'],
  [/\bat the present time\b/gi, 'now'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bdo not use\b/gi, 'avoid'],
  [/\bwithout any extra\b/gi, 'no'],
  [/\bwithout any\b/gi, 'no'],
  [/\breturn the final answer strictly as\b/gi, 'output strictly'],
  [/\bprovide the updated code\b/gi, 'return updated code'],
  [/\bbrief explanation of the changes\b/gi, 'brief changelog'],
  [/\bhere are the\b/gi, 'input:'],
  [/\bfollowing list of\b/gi, ''],
  [/\bfinal answer\b/gi, 'output'],
  [/\bcurrently\b/gi, ''],
];

const SYMBOLIC_PHRASES: Array<[RegExp, string]> = [
  [/\bwithout\b/gi, 'w/o'],
  [/\bwith\b/gi, 'w/'],
  [/\bversus\b/gi, 'vs'],
  [/\bcompared to\b/gi, 'vs'],
  [/\bsuch as\b/gi, 'e.g.'],
  [/\bfor example,?\b/gi, 'e.g.'],
  [/\bthat is to say\b/gi, 'i.e.'],
  [/\bmaximum\b/gi, 'max'],
  [/\bminimum\b/gi, 'min'],
  [/\bgreater than or equal to\b/gi, '>='],
  [/\bless than or equal to\b/gi, '<='],
  [/\bnot equal to\b/gi, '!='],
  [/\bresults in\b/gi, '->'],
  [/\bproduces\b/gi, '->'],
  [/\bconverts to\b/gi, '->'],
  [/\band\b/gi, '&'],
  [/\brequirements?:\s*/gi, 'req: '],
  [/\bconstraints?:\s*/gi, 'no: '],
  [/\boutput format:\s*/gi, 'fmt: '],
  [/\bensure\b/gi, 'req:'],
  [/\bavoid\b/gi, 'no:'],
  [/\bstrictly\b/gi, 'only'],
];

const LOW_ENTROPY_ARTICLES = /\b(?:the|an|a)\s+(?=[a-z0-9_])/gi;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\1+/g, '$1')
    .trim();
}

function deduplicateLines(text: string): string {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out.join('\n').trim();
}

function capitalizeSentenceStart(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function runLosslessPrune(masked: string): { out: string; transforms: string[] } {
  let out = masked;
  const transforms: string[] = [];

  const beforeOpeners = out;
  for (const [pattern, replacement] of CONVERSATIONAL_OPENERS) {
    out = out.replace(pattern, replacement);
  }
  if (out !== beforeOpeners) transforms.push('Removed conversational opener');

  const beforeFiller = out;
  for (const [pattern, replacement] of FILLER_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  if (out !== beforeFiller) transforms.push('Stripped polite filler & hedges');

  out = normalizeWhitespace(deduplicateLines(out));
  return { out: capitalizeSentenceStart(out), transforms };
}

function runTelegraphic(masked: string): { out: string; transforms: string[] } {
  const { out: pruned, transforms } = runLosslessPrune(masked);
  let out = pruned;

  const beforePhrases = out;
  for (const [pattern, replacement] of TELEGRAPHIC_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  if (out !== beforePhrases) transforms.push('Folded verbose syntactic clauses');

  // Drop non-essential articles outside protected placeholders & code
  const beforeArticles = out;
  out = out.replace(LOW_ENTROPY_ARTICLES, (match, offset: number, full: string) => {
    // Keep if preceded by newline or colon or start of string? Dropping articles in imperatives saves tokens cleanly
    const prev = full.slice(Math.max(0, offset - 2), offset);
    if (prev.endsWith('"') || prev.endsWith("'")) return match;
    return '';
  });
  if (out !== beforeArticles) transforms.push('Pruned low-entropy articles');

  out = normalizeWhitespace(out);
  return { out: capitalizeSentenceStart(out), transforms };
}

function runSymbolic(masked: string): { out: string; transforms: string[] } {
  const { out: pruned, transforms } = runLosslessPrune(masked);
  let out = pruned;

  for (const [pattern, replacement] of TELEGRAPHIC_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  const beforeSym = out;
  for (const [pattern, replacement] of SYMBOLIC_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  if (out !== beforeSym) transforms.push('Substituted single-token logical symbols');

  out = normalizeWhitespace(out);
  return { out: capitalizeSentenceStart(out), transforms };
}

function runStructuredKv(masked: string): { out: string; transforms: string[] } {
  const { out: tele, transforms } = runTelegraphic(masked);
  const lines = tele
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean);

  const buckets: {
    task: string[];
    req: string[];
    avoid: string[];
    fmt: string[];
    ctx: string[];
  } = {
    task: [],
    req: [],
    avoid: [],
    fmt: [],
    ctx: [],
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^__PZSPAN\d+__$/.test(line) || line.startsWith('rows[')) {
      buckets.ctx.push(line);
    } else if (/\b(?:avoid|don't|do not|no |never|ban|without)\b/.test(lower)) {
      buckets.avoid.push(line);
    } else if (/\b(?:json|markdown|yaml|xml|csv|return|output|format|changelog|diff)\b/.test(lower)) {
      buckets.fmt.push(line);
    } else if (/\b(?:ensure|must|strict|use |preserve|handle|keep|require)\b/.test(lower)) {
      buckets.req.push(line);
    } else if (buckets.task.length === 0) {
      buckets.task.push(line);
    } else {
      buckets.ctx.push(line);
    }
  }

  const sections: string[] = [];
  if (buckets.task.length) sections.push(`task: ${buckets.task.join('; ')}`);
  if (buckets.req.length) sections.push(`req: ${buckets.req.join('; ')}`);
  if (buckets.avoid.length) sections.push(`avoid: ${buckets.avoid.join('; ')}`);
  if (buckets.fmt.length) sections.push(`fmt: ${buckets.fmt.join('; ')}`);
  if (buckets.ctx.length) sections.push(`ctx:\n${buckets.ctx.join('\n')}`);

  transforms.push('Restructured prose into minimal KV schema');
  return { out: sections.join('\n').trim(), transforms };
}

function runMicro(masked: string): { out: string; transforms: string[] } {
  const { out: kv, transforms } = runStructuredKv(masked);
  let out = kv;

  for (const [pattern, replacement] of SYMBOLIC_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  // Remove redundant auxiliary verbs & filler connectors
  out = out
    .replace(/\b(?:is|are|was|were|be|being|been)\s+(?=[a-z]+ed\b)/gi, '')
    .replace(/\b(?:that|which|who)\s+/gi, '')
    .replace(/;\s+/g, ';')
    .replace(/:\s+/g, ': ');

  out = normalizeWhitespace(out);
  transforms.push('Applied micro-telegraphic compaction & symbol folding');
  return { out, transforms };
}

function compactIrExpression(clause: string): string {
  return clause
    .replace(/^(?:note:\s*|also,?\s*|remember\s+(?:that\s+)?|keep in mind\s+(?:that\s+)?)/i, '')
    .replace(/^(?:ensure|must|require|req:)\s+/i, '')
    .replace(/^(?:avoid|no:|ban|never|do not use|don't use)\s+/i, '')
    .replace(/^(?:output strictly(?: as)?|return(?: only)?|fmt:)\s+/i, '')
    .replace(/\b(handles?|preserving|preserve|supports?|support|includes?|include|uses?|using)\s+([^.;]+?)(?=$|[.;])/gi, (_m: string, verb: string, args: string) => {
      let fnName = verb.toLowerCase();
      if (fnName === 'preserving') fnName = 'preserve';
      else if (fnName === 'including') fnName = 'include';
      else if (fnName === 'using') fnName = 'use';
      else if (fnName.endsWith('s')) fnName = fnName.slice(0, -1);
      const cleanArgs = args
        .replace(/,\s*and\s+/gi, ',')
        .replace(/\s+and\s+/gi, ',')
        .replace(/\s+or\s+/gi, '|')
        .replace(/,\s+/g, ',')
        .trim();
      return `${fnName}(${cleanArgs})`;
    })
    .replace(/,\s*and\s+/gi, ',')
    .replace(/\s+or\s+/gi, '|')
    .replace(/\s+and\s+/gi, '&')
    .replace(/\bwith\b/gi, '+')
    .replace(/\bwithout\b/gi, '!')
    .replace(/\bversus\b/gi, 'vs')
    .replace(/\b(?:results in|produces|converts to)\b/gi, '->')
    .replace(/,\s+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function runMachineIr(
  masked: string,
  includeHeader: boolean
): { out: string; transforms: string[] } {
  const { out: tele, transforms } = runTelegraphic(masked);

  // Split into non-empty lines/sentences while keeping TOON/span blocks intact
  const rawLines = tele.split('\n');
  const clauses: string[] = [];
  let inToon = false;
  let toonBuf: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      if (inToon && toonBuf.length) {
        clauses.push(toonBuf.join('\n'));
        toonBuf = [];
        inToon = false;
      }
      continue;
    }

    if (line.startsWith('rows[')) {
      inToon = true;
      toonBuf.push(line);
      continue;
    }
    if (inToon) {
      if (line.includes('|')) {
        toonBuf.push(line);
        continue;
      } else {
        clauses.push(toonBuf.join('\n'));
        toonBuf = [];
        inToon = false;
      }
    }

    if (/^__PZSPAN\d+__$/.test(line)) {
      clauses.push(line);
    } else {
      const parts = line
        .split(/(?<=[.!?])\s+|;\s+/)
        .map((p) => p.trim().replace(/[.!?]+$/, ''))
        .filter(Boolean);
      clauses.push(...parts);
    }
  }
  if (toonBuf.length) {
    clauses.push(toonBuf.join('\n'));
  }

  const reg = {
    doOp: [] as string[],
    envOp: [] as string[],
    audOp: [] as string[],
    reqOp: [] as string[],
    banOp: [] as string[],
    limOp: [] as string[],
    outOp: [] as string[],
    ctxOp: [] as string[],
  };

  for (const clause of clauses) {
    const lower = clause.toLowerCase();
    if (/^__PZSPAN\d+__$/.test(clause) || clause.startsWith('rows[')) {
      reg.ctxOp.push(clause);
    } else if (/^audience:/i.test(clause)) {
      reg.audOp.push(compactIrExpression(clause.replace(/^audience:\s*/i, '')));
    } else if (/^limits?:/i.test(clause)) {
      reg.limOp.push(compactIrExpression(clause.replace(/^limits?:\s*/i, '')));
    } else if (/^env:/i.test(clause) || /\b(?:we are using|using tailwind|stack:|runtime:)\b/i.test(lower)) {
      reg.envOp.push(
        compactIrExpression(clause.replace(/^(?:env:|note:\s*we are using|using)\s*/i, ''))
      );
    } else if (/\b(?:avoid|don't|do not|never|ban|no external|without any)\b/i.test(lower) || /^no:/i.test(lower)) {
      reg.banOp.push(compactIrExpression(clause));
    } else if (/\b(?:json|markdown|yaml|xml|csv|return|output|changelog|diff)\b/i.test(lower) || /^fmt:/i.test(lower)) {
      reg.outOp.push(compactIrExpression(clause));
    } else if (/\b(?:ensure|must|strict|preserve|handle|keep|require)\b/i.test(lower) || /^req:/i.test(lower)) {
      reg.reqOp.push(compactIrExpression(clause));
    } else if (reg.doOp.length === 0) {
      reg.doOp.push(compactIrExpression(clause));
    } else {
      reg.ctxOp.push(compactIrExpression(clause));
    }
  }

  const irLines: string[] = [];
  if (includeHeader) {
    irLines.push('#IR:@DO=task;@ENV=stack;@REQ=must;@BAN=forbid;@OUT=format;&=and;|=or;!=no');
  }
  if (reg.doOp.length) irLines.push(`@DO ${reg.doOp.join('; ')}`);
  if (reg.envOp.length) irLines.push(`@ENV ${reg.envOp.join(' + ')}`);
  if (reg.audOp.length) irLines.push(`@AUD ${reg.audOp.join(', ')}`);
  if (reg.reqOp.length) irLines.push(`@REQ ${reg.reqOp.join(' & ')}`);
  if (reg.banOp.length) irLines.push(`@BAN ${reg.banOp.join(' | ')}`);
  if (reg.limOp.length) irLines.push(`@LIM ${reg.limOp.join(', ')}`);
  if (reg.outOp.length) irLines.push(`@OUT ${reg.outOp.join(' + ')}`);
  if (reg.ctxOp.length) irLines.push(`@CTX\n${reg.ctxOp.join('\n')}`);

  transforms.push('Compiled prose into PromptIR opcode registers (@DO/@ENV/@REQ/@BAN/@OUT)');
  return { out: irLines.join('\n').trim(), transforms };
}

/**
 * Extracts high-signal entities (numbers, identifiers, code blocks, URLs, paths, domain terms)
 * and measures what percentage remain present in the compressed output.
 */
function measureEntityRetention(original: string, compressed: string): {
  retentionScore: number;
  preservedEntities: number;
  totalEntities: number;
} {
  const entities = new Set<string>();

  // Code blocks & inline code
  const codeMatches = original.match(/`[^`]+`/g) || [];
  codeMatches.forEach((m) => entities.add(m.trim()));

  // Numbers & units
  const numMatches = original.match(/\b\d+(?:\.\d+)?(?:%|ms|s|px|kb|mb|gb)?\b/gi) || [];
  numMatches.forEach((m) => entities.add(m.toLowerCase()));

  // Capitalized technical terms / acronyms / camelCase / snake_case
  const techMatches =
    original.match(/\b(?:[A-Z][a-zA-Z0-9]{2,}|[A-Z]{2,}|[a-z]+_[a-z0-9_]+|[a-z]+[A-Z][a-zA-Z0-9]+)\b/g) ||
    [];
  techMatches.forEach((m) => {
    const lower = m.toLowerCase();
    if (!['hello', 'please', 'could', 'would', 'thanks', 'thank', 'basically', 'actually'].includes(lower)) {
      entities.add(lower);
    }
  });

  if (entities.size === 0) {
    return { retentionScore: 100, preservedEntities: 0, totalEntities: 0 };
  }

  const lowerCompressed = compressed.toLowerCase();
  let preserved = 0;
  for (const entity of entities) {
    if (compressed.includes(entity) || lowerCompressed.includes(entity)) {
      preserved += 1;
    }
  }

  const retentionScore = Math.round((preserved / entities.size) * 100);
  return {
    retentionScore,
    preservedEntities: preserved,
    totalEntities: entities.size,
  };
}

export function compressPrompt(
  input: string,
  algorithmId: CompressionAlgorithmId,
  encoding: BpeEncoding = 'o200k_base',
  options: CompressionOptions = DEFAULT_COMPRESSION_OPTIONS
): CompressionResult {
  const algorithm = ALGORITHMS.find((a) => a.id === algorithmId) || ALGORITHMS[0];
  const trimmed = input.trim();
  const inputTokens = countBpeTokens(trimmed, encoding);

  if (!trimmed) {
    return {
      algorithm,
      output: '',
      inputTokens: 0,
      outputTokens: 0,
      savedTokens: 0,
      reductionPct: 0,
      inputChars: 0,
      outputChars: 0,
      retentionScore: 100,
      preservedEntities: 0,
      totalEntities: 0,
      efficiencyScore: 0,
      appliedTransforms: [],
    };
  }

  const { masked, restore, transforms: spanTransforms } = protectSpans(trimmed, options);

  let rawOut = masked;
  let algoTransforms: string[] = [];

  switch (algorithmId) {
    case 'lossless-prune': {
      const r = runLosslessPrune(masked);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
    case 'telegraphic': {
      const r = runTelegraphic(masked);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
    case 'symbolic': {
      const r = runSymbolic(masked);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
    case 'structured-kv': {
      const r = runStructuredKv(masked);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
    case 'machine-ir': {
      const r = runMachineIr(masked, options.includeIrHeader);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
    case 'micro': {
      const r = runMicro(masked);
      rawOut = r.out;
      algoTransforms = r.transforms;
      break;
    }
  }

  const output = restore(rawOut).trim();
  const outputTokens = countBpeTokens(output, encoding);
  const savedTokens = Math.max(0, inputTokens - outputTokens);
  const reductionPct = inputTokens > 0 ? Math.round(((inputTokens - outputTokens) / inputTokens) * 1000) / 10 : 0;

  const { retentionScore, preservedEntities, totalEntities } = measureEntityRetention(trimmed, output);

  // Efficiency balances token reduction against semantic entity retention
  const safeReduction = Math.max(0, reductionPct);
  const efficiencyScore = Math.round(safeReduction * (retentionScore / 100) * 10) / 10;

  return {
    algorithm,
    output,
    inputTokens,
    outputTokens,
    savedTokens,
    reductionPct,
    inputChars: trimmed.length,
    outputChars: output.length,
    retentionScore,
    preservedEntities,
    totalEntities,
    efficiencyScore,
    appliedTransforms: [...spanTransforms, ...algoTransforms],
  };
}

export function benchmarkAllAlgorithms(
  input: string,
  encoding: BpeEncoding = 'o200k_base',
  options: CompressionOptions = DEFAULT_COMPRESSION_OPTIONS
): BenchmarkSummary {
  const results = ALGORITHMS.map((algo) => compressPrompt(input, algo.id, encoding, options));

  // Best balances high efficiencyScore while preferring >= 90% retention
  const sorted = [...results].sort((a, b) => {
    const aQualified = a.retentionScore >= 90 ? 1 : 0;
    const bQualified = b.retentionScore >= 90 ? 1 : 0;
    if (aQualified !== bQualified) return bQualified - aQualified;
    if (b.efficiencyScore !== a.efficiencyScore) return b.efficiencyScore - a.efficiencyScore;
    return b.savedTokens - a.savedTokens;
  });

  return {
    results,
    best: sorted[0],
  };
}

export interface DiffChunk {
  type: 'same' | 'removed' | 'added';
  text: string;
}

export function computeWordDiff(original: string, compressed: string): DiffChunk[] {
  const a = original.trim().split(/\s+/).filter(Boolean);
  const b = compressed.trim().split(/\s+/).filter(Boolean);

  if (a.length === 0 && b.length === 0) return [];
  // Guard LCS matrix size for huge prompts
  if (a.length * b.length > 60_000) {
    return [
      { type: 'removed', text: original },
      { type: 'added', text: compressed },
    ];
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const chunks: DiffChunk[] = [];
  let i = 0;
  let j = 0;

  const pushChunk = (type: DiffChunk['type'], word: string) => {
    const last = chunks[chunks.length - 1];
    if (last && last.type === type) {
      last.text += ' ' + word;
    } else {
      chunks.push({ type, text: word });
    }
  };

  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pushChunk('same', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushChunk('removed', a[i]);
      i++;
    } else {
      pushChunk('added', b[j]);
      j++;
    }
  }

  while (i < m) {
    pushChunk('removed', a[i++]);
  }
  while (j < n) {
    pushChunk('added', b[j++]);
  }

  return chunks;
}
