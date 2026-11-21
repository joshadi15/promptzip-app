import { BpeEncoding, countBpeTokens } from './tokenizer';

export type PromptDomain = 'auto' | 'code' | 'ui' | 'writing' | 'data' | 'cli';

export interface SlopTrigger {
  id: string;
  phrase: string;
  reason: string;
  replacement: string;
  count: number;
}

export interface ContextRecommendation {
  id: string;
  title: string;
  severity: 'high' | 'recommended' | 'optional';
  whyItPreventsSlop: string;
  snippet: string;
  tokenCost: number;
  alreadyPresent: boolean;
}

export interface SlopPhraseMatch {
  id: string;
  phrase: string;
  reason: string;
  replacement: string;
  count: number;
}

export interface AntiSlopAnalysis {
  detectedDomain: Exclude<PromptDomain, 'auto'>;
  triggers: SlopTrigger[];
  slopPhrases: SlopPhraseMatch[];
  recommendations: ContextRecommendation[];
  missingCount: number;
  highImpactMissingCount: number;
  coveredCount: number;
  totalChecks: number;
}

const VAGUE_SLOP_WORDS: Array<{ pattern: RegExp; phrase: string; reason: string; replacement: string }> = [
  {
    pattern: /\bmodern\b/gi,
    phrase: 'modern',
    reason: 'Triggers generic glassmorphism, purple gradients, and rounded-card clichés.',
    replacement: 'high-contrast minimalist with hairline 1px borders',
  },
  {
    pattern: /\bclean\b/gi,
    phrase: 'clean',
    reason: 'Too subjective; models default to empty whitespace cards and sparse placeholder text.',
    replacement: 'dense scannable layout with explicit alignment',
  },
  {
    pattern: /\bcomprehensive\b/gi,
    phrase: 'comprehensive',
    reason: 'Causes padded, encyclopedic filler sections and bloated boilerplate.',
    replacement: 'focused on core workflow only',
  },
  {
    pattern: /\bbest practices\b/gi,
    phrase: 'best practices',
    reason: 'Prompts generic textbook commentary instead of project-specific constraints.',
    replacement: 'strict types, error handling, and zero unused abstractions',
  },
  {
    pattern: /\buser-friendly\b/gi,
    phrase: 'user-friendly',
    reason: 'Adds unsolicited tooltips, onboarding banners, and bubbly copy.',
    replacement: 'keyboard-accessible with explicit empty/error states',
  },
  {
    pattern: /\bengaging\b/gi,
    phrase: 'engaging',
    reason: 'Triggers hype prose ("In today\'s fast-paced world", "game-changer").',
    replacement: 'direct, concrete, and evidence-backed',
  },
  {
    pattern: /\binnovative\b/gi,
    phrase: 'innovative',
    reason: 'Produces buzzword-heavy copy and fabricated metric badges.',
    replacement: 'practical and measurable',
  },
  {
    pattern: /\bseamless\b/gi,
    phrase: 'seamless',
    reason: 'Classic LLM marketing cliché that adds zero implementation detail.',
    replacement: 'single-step',
  },
  {
    pattern: /\bcutting-edge\b/gi,
    phrase: 'cutting-edge',
    reason: 'Induces neon/cyberpunk aesthetics or hype-filled prose.',
    replacement: 'production-proven',
  },
  {
    pattern: /\bdynamic\b/gi,
    phrase: 'dynamic',
    reason: 'Ambiguous; models either add gratuitous animations or vague generalizations.',
    replacement: 'state-driven',
  },
  {
    pattern: /\bdelve\b/gi,
    phrase: 'delve',
    reason: 'Strongest single-word AI writing fingerprint.',
    replacement: 'examine',
  },
  {
    pattern: /\brobust\b/gi,
    phrase: 'robust',
    reason: 'Leads to defensive over-engineering or empty claims.',
    replacement: 'validated against edge cases',
  },
  {
    pattern: /\binsightful\b/gi,
    phrase: 'insightful',
    reason: 'Produces surface-level summaries padded with rhetorical transitions.',
    replacement: 'backed by specific failure modes and numbers',
  },
];

const LLM_SLOP_PHRASES: Array<{
  id: string;
  pattern: RegExp;
  label: string;
  reason: string;
  replacement: string;
}> = [
  {
    id: 'as-an-ai',
    pattern: /\b(?:as an ai(?: language model)?|as a large language model|as an artificial intelligence)\b[,.:!]?\s*/gi,
    label: 'As an AI language model',
    reason: 'Model disclaimer boilerplate that wastes tokens and invites hedging.',
    replacement: '',
  },
  {
    id: 'hope-this-helps',
    pattern: /\b(?:i )?hope this helps[!.]*\s*/gi,
    label: 'I hope this helps',
    reason: 'Conversational sign-off filler with zero task value.',
    replacement: '',
  },
  {
    id: 'let-me-know',
    pattern: /\b(?:please )?(?:let me know if you (?:have any questions|need anything else)|feel free to ask)\b[!.]*\s*/gi,
    label: 'Let me know if you need anything else',
    reason: 'Chatbot closing filler that adds noise without task constraints.',
    replacement: '',
  },
  {
    id: 'fast-paced-world',
    pattern: /\bin today'?s (?:fast-paced|ever-evolving|digital) (?:world|landscape|era)\b[, ]*/gi,
    label: "In today's fast-paced world",
    reason: 'Top LLM essay cliché that signals generic padded prose.',
    replacement: 'Today, ',
  },
  {
    id: 'important-to-note',
    pattern: /\b(?:it(?:'s| is) (?:important|worth) (?:to note|noting) that)\s+/gi,
    label: 'It is important to note that',
    reason: 'Verbose filler clause; direct statements carry stronger instruction weight.',
    replacement: 'Note: ',
  },
  {
    id: 'sure-here-is',
    pattern: /\b(?:sure|certainly|of course)[!,.]*\s+(?:here is|here's|below is)(?: a| the)?\s*/gi,
    label: 'Sure! Here is',
    reason: 'Assistant preamble boilerplate that wastes tokens.',
    replacement: '',
  },
  {
    id: 'in-conclusion',
    pattern: /\b(?:in conclusion|to summarize|all in all|at the end of the day)\b[, ]*/gi,
    label: 'In conclusion',
    reason: 'Formulaic transition phrase that leads to repetitive recap paragraphs.',
    replacement: 'Summary: ',
  },
  {
    id: 'game-changer',
    pattern: /\b(?:a )?game[- ]changer\b/gi,
    label: 'game-changer',
    reason: 'Overused LLM marketing hyperbole.',
    replacement: 'significant improvement',
  },
  {
    id: 'rich-tapestry',
    pattern: /\b(?:a )?rich tapestry(?: of)?\b/gi,
    label: 'rich tapestry',
    reason: 'High-frequency AI literary cliché.',
    replacement: 'mix of',
  },
  {
    id: 'polite-request',
    pattern: /\b(?:could you please help me|i would really appreciate it if you could|thank you so much in advance(?: for your help)?)\b[!,.]*\s*/gi,
    label: 'Could you please help me / Thank you in advance',
    reason: 'Polite conversational wrapper that dilutes task directives.',
    replacement: '',
  },
];

export function detectPromptDomain(prompt: string): Exclude<PromptDomain, 'auto'> {
  const lower = prompt.toLowerCase();
  const scores: Record<Exclude<PromptDomain, 'auto'>, number> = {
    code: 0,
    ui: 0,
    writing: 0,
    data: 0,
    cli: 0,
  };

  if (/\b(dashboard|landing page|hero|ui|ux|tailwind|css|layout|card|sidebar|palette|typography|frontend)\b/.test(lower)) {
    scores.ui += 3;
  }
  if (/\b(react|typescript|function|refactor|api|component|bug|error boundary|test|schema|database|sql|endpoint)\b/.test(lower) || /```/.test(lower)) {
    scores.code += 3;
  }
  if (/\b(blog|article|essay|post|copy|newsletter|email|headline|story|audience|tone|authoritative)\b/.test(lower)) {
    scores.writing += 3;
  }
  if (/\b(json|csv|extract|categorize|classify|tickets|dataset|rows|parse|table|summarize records)\b/.test(lower) || /\[\s*\{/.test(lower)) {
    scores.data += 3;
  }
  if (/\b(bash|zsh|terminal|cli|command|script|docker|kubectl|git|grep|awk|pipe|stdin)\b/.test(lower)) {
    scores.cli += 3;
  }

  const best = (Object.entries(scores) as Array<[Exclude<PromptDomain, 'auto'>, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0];

  return best[1] > 0 ? best[0] : 'code';
}

interface DomainCheck {
  id: string;
  title: string;
  severity: 'high' | 'recommended' | 'optional';
  detectPattern: RegExp;
  whyItPreventsSlop: string;
  snippet: string;
}

const COMMON_CHECKS: DomainCheck[] = [
  {
    id: 'output-contract',
    title: 'Explicit Output Contract & Zero Preamble',
    severity: 'high',
    detectPattern: /\b(output strictly|fmt:|return only|code-only|diff-only|zero preamble|no intro|json|markdown|bullet|<=?\s*\d+\s*words)\b/i,
    whyItPreventsSlop:
      'Without an exact output contract, LLMs spend 40–120 tokens on polite intros ("Sure! Here is...") and padded summaries.',
    snippet: 'fmt: output result only; zero intro/outro chatter.',
  },
  {
    id: 'negative-constraints',
    title: 'Negative Constraints (Slop Blacklist)',
    severity: 'high',
    detectPattern: /\b(avoid:|no:|never |do not |don't |ban |exclude|zero stubs|no placeholders)\b/i,
    whyItPreventsSlop:
      'Models default to safe clichés, mock placeholders, and hedging unless explicitly told what patterns are forbidden.',
    snippet: 'avoid: generic clichés, filler intros, hedging ("it depends"), unrequested abstractions.',
  },
];

const DOMAIN_CHECKS: Record<Exclude<PromptDomain, 'auto'>, DomainCheck[]> = {
  code: [
    {
      id: 'stack-versions',
      title: 'Exact Runtime & Stack Boundaries',
      severity: 'high',
      detectPattern: /\b(typescript|python|node|react|go|rust|v\d+|strict|stdlib|no external)\b/i,
      whyItPreventsSlop:
        'Prevents the model from inventing deprecated APIs, mixing JS/TS, or pulling unnecessary third-party libraries.',
      snippet: 'env: strict TypeScript; stdlib/existing deps only; no new packages.',
    },
    {
      id: 'no-stubs',
      title: 'Anti-Stub & Edge-Case Rule',
      severity: 'high',
      detectPattern: /\b(todo|stub|placeholder|edge case|error handling|loading|empty state|null|throw)\b/i,
      whyItPreventsSlop:
        'Stops the model from writing "// TODO: implement logic here" or happy-path-only code.',
      snippet: 'req: complete implementation; handle null/empty/error states; zero TODOs or placeholders.',
    },
    {
      id: 'diff-scope',
      title: 'Change Scope & Verification',
      severity: 'recommended',
      detectPattern: /\b(diff|only modified|test|assert|verify|minimal change|preserve)\b/i,
      whyItPreventsSlop:
        'Keeps the model from rewriting unrelated working code when refactoring.',
      snippet: 'scope: modify minimal lines; preserve public API; list edge cases verified.',
    },
  ],
  ui: [
    {
      id: 'anti-slop-ui',
      title: 'Visual Anti-Slop Ban List',
      severity: 'high',
      detectPattern: /\b(purple|gradient|pill|badge|shadow|border|whitespace|pulsing|slop)\b/i,
      whyItPreventsSlop:
        'Explicitly blocks the #1 AI UI pattern: purple gradients, pill badge sandwiches, pulsing status dots, and nested cards.',
      snippet: 'avoid: purple gradients, pill badge clutter, pulsing dots, nested cards, mock telemetry tickers.',
    },
    {
      id: 'palette-type',
      title: 'Concrete Palette & Typography Anchor',
      severity: 'high',
      detectPattern: /\b(hex|#[0-9a-f]{3,6}|slate|neutral|font|sans|mono|tabular|contrast|wcag)\b/i,
      whyItPreventsSlop:
        'Replaces vague words like "modern/clean" with deterministic layout, spacing, and contrast rules.',
      snippet: 'style: neutral slate canvas, 1px hairline borders, 1 accent color, tabular-nums for metrics.',
    },
    {
      id: 'ui-states',
      title: 'Empty, Loading & Error States',
      severity: 'recommended',
      detectPattern: /\b(empty state|loading|skeleton|error state|responsive|mobile|1440px)\b/i,
      whyItPreventsSlop:
        'Prevents static happy-path mockups that break on real data or narrow viewports.',
      snippet: 'req: interactive controls wired; explicit empty/loading/error states; desktop-first responsive.',
    },
  ],
  writing: [
    {
      id: 'cliche-ban',
      title: 'AI Prose Cliché Blacklist',
      severity: 'high',
      detectPattern: /\b(delve|tapestry|game-changer|testament|fast-paced|em-dash|cliché|no buzzwords)\b/i,
      whyItPreventsSlop:
        'Bans high-frequency LLM tells ("delve into", "rich tapestry", "in conclusion", excessive em-dashes).',
      snippet: 'avoid: "delve", "tapestry", "game-changer", "in today\'s world", rhetorical fluff, "in conclusion".',
    },
    {
      id: 'audience-voice',
      title: 'Target Reader & Voice Anchor',
      severity: 'high',
      detectPattern: /\b(audience:|reader:|staff engineer|beginner|executive|first-person|pragmatic|dry|concise)\b/i,
      whyItPreventsSlop:
        'Without a reader profile, models write generic 101-level explainers aimed at nobody.',
      snippet: 'audience: senior practitioners; skip 101 definitions; concrete tradeoffs & numbers only.',
    },
    {
      id: 'length-structure',
      title: 'Hard Word Budget & Structure',
      severity: 'recommended',
      detectPattern: /\b(words|word count|max \d+|paragraphs|sections|bullets|<=?\s*\d+)\b/i,
      whyItPreventsSlop:
        'Caps padding and forces tight, high-signal paragraphs.',
      snippet: 'limits: <=500w; lead w/ thesis in sentence 1; max 3 sentences/paragraph.',
    },
  ],
  data: [
    {
      id: 'strict-schema',
      title: 'Deterministic Schema & Field Types',
      severity: 'high',
      detectPattern: /\b(schema|keys:|fields:|type|enum|string|number|boolean|null)\b/i,
      whyItPreventsSlop:
        'Prevents inconsistent keys, invented fields, or prose mixed into structured outputs.',
      snippet: 'schema: exact keys only; use null for missing values; no extra commentary.',
    },
    {
      id: 'grounding-rule',
      title: 'Anti-Hallucination Grounding Rule',
      severity: 'high',
      detectPattern: /\b(only from input|do not infer|unknown|verbatim|grounded|cite)\b/i,
      whyItPreventsSlop:
        'Stops the model from fabricating plausible-sounding values when input records are ambiguous.',
      snippet: 'req: extract strictly from input; mark uncertain fields "UNKNOWN"; never fabricate.',
    },
  ],
  cli: [
    {
      id: 'shell-safety',
      title: 'Target Shell & Non-Destructive Guard',
      severity: 'high',
      detectPattern: /\b(bash|zsh|posix|powershell|dry-run|idempotent|set -euo|non-destructive)\b/i,
      whyItPreventsSlop:
        'Prevents incompatible shell syntax or unsafe destructive flags in generated one-liners.',
      snippet: 'env: POSIX bash (set -euo pipefail); quote all vars; dry-run/safe defaults first.',
    },
    {
      id: 'exit-codes',
      title: 'Concise Output & Exit Handling',
      severity: 'recommended',
      detectPattern: /\b(exit|stderr|stdout|one-liner|comment|flags)\b/i,
      whyItPreventsSlop:
        'Avoids bloated tutorial explanations around simple terminal commands.',
      snippet: 'fmt: command block first, max 1-line explanation per flag.',
    },
  ],
};

export function analyzeAntiSlop(
  prompt: string,
  domainOverride: PromptDomain = 'auto',
  encoding: BpeEncoding = 'o200k_base'
): AntiSlopAnalysis {
  const trimmed = prompt.trim();
  const detectedDomain =
    domainOverride === 'auto' ? detectPromptDomain(trimmed) : domainOverride;

  if (!trimmed) {
    return {
      detectedDomain,
      triggers: [],
      slopPhrases: [],
      recommendations: [],
      missingCount: 0,
      highImpactMissingCount: 0,
      coveredCount: 0,
      totalChecks: 0,
    };
  }

  const triggers: SlopTrigger[] = [];
  for (const rule of VAGUE_SLOP_WORDS) {
    const matches = trimmed.match(rule.pattern);
    if (matches && matches.length > 0) {
      triggers.push({
        id: rule.phrase,
        phrase: matches[0],
        reason: rule.reason,
        replacement: rule.replacement,
        count: matches.length,
      });
    }
  }

  const slopPhrases: SlopPhraseMatch[] = [];
  for (const rule of LLM_SLOP_PHRASES) {
    const matches = trimmed.match(rule.pattern);
    if (matches && matches.length > 0) {
      slopPhrases.push({
        id: rule.id,
        phrase: matches[0].trim(),
        reason: rule.reason,
        replacement: rule.replacement.trim() || '(remove)',
        count: matches.length,
      });
    }
  }

  const allChecks = [...COMMON_CHECKS, ...DOMAIN_CHECKS[detectedDomain]];
  const recommendations: ContextRecommendation[] = allChecks.map((check) => {
    const alreadyPresent = check.detectPattern.test(trimmed);
    return {
      id: check.id,
      title: check.title,
      severity: check.severity,
      whyItPreventsSlop: check.whyItPreventsSlop,
      snippet: check.snippet,
      tokenCost: countBpeTokens(check.snippet, encoding),
      alreadyPresent,
    };
  });

  const missing = recommendations.filter((r) => !r.alreadyPresent);
  return {
    detectedDomain,
    triggers,
    slopPhrases,
    recommendations,
    missingCount: missing.length,
    highImpactMissingCount: missing.filter((r) => r.severity === 'high').length,
    coveredCount: recommendations.length - missing.length,
    totalChecks: recommendations.length,
  };
}

export function applyTriggerReplacement(prompt: string, trigger: SlopTrigger): string {
  const escaped = trigger.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  return prompt.replace(regex, trigger.replacement);
}

export function applyQuickFixAll(prompt: string): {
  updatedPrompt: string;
  fixedPhrasesCount: number;
  fixedTriggersCount: number;
} {
  let updated = prompt;
  let fixedPhrasesCount = 0;
  let fixedTriggersCount = 0;

  for (const rule of LLM_SLOP_PHRASES) {
    const matches = updated.match(rule.pattern);
    if (matches && matches.length > 0) {
      fixedPhrasesCount += matches.length;
      updated = updated.replace(rule.pattern, rule.replacement);
    }
  }

  for (const rule of VAGUE_SLOP_WORDS) {
    const matches = updated.match(rule.pattern);
    if (matches && matches.length > 0) {
      fixedTriggersCount += matches.length;
      updated = updated.replace(rule.pattern, rule.replacement);
    }
  }

  updated = updated
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (updated) {
    updated = updated.charAt(0).toUpperCase() + updated.slice(1);
  }

  return {
    updatedPrompt: updated,
    fixedPhrasesCount,
    fixedTriggersCount,
  };
}

export function injectContextSnippets(prompt: string, snippets: string[]): string {
  const trimmed = prompt.trim();
  const unique = snippets.filter((s) => !trimmed.toLowerCase().includes(s.toLowerCase()));
  if (unique.length === 0) return trimmed;
  if (!trimmed) return unique.join('\n');
  return `${trimmed}\n\n${unique.join('\n')}`;
}
