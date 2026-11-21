import { CompressionAlgorithmId } from './compression';

export interface ComplexityAnalysis {
  score: number;
  level: 'Concise' | 'Moderate' | 'Too Verbose';
  gradeLevel: number;
  readingLabel: string;
  contentDensityPct: number;
  avgSentenceWords: number;
  tokensPerWord: number;
  sentenceCount: number;
  wordCount: number;
  isTooVerbose: boolean;
  suggestion: string;
  recommendedAlgo: CompressionAlgorithmId;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
  'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'to', 'with',
  'about', 'against', 'between', 'through', 'during', 'before', 'after',
  'above', 'below', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'can', 'could', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
  'their', 'this', 'that', 'these', 'those', 'which', 'who', 'whom', 'what',
  'please', 'just', 'really', 'very', 'basically', 'actually', 'essentially',
  'currently', 'hello', 'hi', 'hey', 'thanks', 'thank', 'help', 'like', 'make',
  'sure', 'able', 'need', 'want', 'also', 'well', 'so', 'too', 'much', 'many',
  'some', 'any', 'all', 'there', 'here', 'more', 'most', 'other', 'such',
]);

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 1;
  if (cleaned.length <= 3) return 1;

  const trimmed = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

export function analyzePromptComplexity(
  prompt: string,
  bpeTokenCount: number
): ComplexityAnalysis {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      score: 0,
      level: 'Concise',
      gradeLevel: 0,
      readingLabel: 'Empty',
      contentDensityPct: 100,
      avgSentenceWords: 0,
      tokensPerWord: 0,
      sentenceCount: 0,
      wordCount: 0,
      isTooVerbose: false,
      suggestion: 'Enter a prompt to analyze reading level, signal density, and verbosity.',
      recommendedAlgo: 'lossless-prune',
    };
  }

  // Separate prose from fenced code blocks so code tokens don't skew reading grade
  const proseOnly = trimmed.replace(/```[\s\S]*?```/g, ' ').trim();
  const proseText = proseOnly || trimmed;

  const allWords = trimmed.split(/\s+/).filter(Boolean);
  const proseWords = proseText
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter(Boolean);

  const wordCount = Math.max(1, allWords.length);
  const proseWordCount = Math.max(1, proseWords.length);

  // Split sentences on terminal punctuation or structural line breaks
  const rawSentences = proseText
    .split(/[.!?]+(?:\s+|$)|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[a-zA-Z0-9]/.test(s));
  const sentenceCount = Math.max(1, rawSentences.length);

  const avgSentenceWords = Math.round((proseWordCount / sentenceCount) * 10) / 10;

  let totalSyllables = 0;
  let contentWords = 0;
  for (const w of proseWords) {
    totalSyllables += countSyllables(w);
    const lower = w.toLowerCase();
    if (!STOPWORDS.has(lower) && lower.length > 1) {
      contentWords += 1;
    }
  }

  const syllablesPerWord = totalSyllables / proseWordCount;
  const rawGrade = 0.39 * avgSentenceWords + 11.8 * syllablesPerWord - 15.59;
  const gradeLevel = Math.round(Math.min(18, Math.max(1, rawGrade)) * 10) / 10;

  const contentDensityPct = Math.round((contentWords / proseWordCount) * 100);
  const tokensPerWord = Math.round((bpeTokenCount / wordCount) * 100) / 100;

  // Compute 0-100 complexity/verbosity score:
  // Long sentences, high reading grade, low content-word density, and unformatted length raise score.
  const sentencePenalty = Math.min(35, Math.max(0, (avgSentenceWords - 9) * 1.9));
  const gradePenalty = Math.min(25, Math.max(0, (gradeLevel - 6) * 2.4));
  const fillerPenalty = Math.min(30, Math.max(0, (68 - contentDensityPct) * 1.1));
  const lengthPenalty = Math.min(10, Math.max(0, (bpeTokenCount - 120) / 35));

  const score = Math.round(
    Math.min(100, Math.max(5, sentencePenalty + gradePenalty + fillerPenalty + lengthPenalty))
  );

  let readingLabel = 'Direct & Clear';
  if (gradeLevel >= 13) readingLabel = 'Dense / Academic';
  else if (gradeLevel >= 9.5) readingLabel = 'Standard Prose';
  else if (gradeLevel >= 6.5) readingLabel = 'Conversational';

  const isTooVerbose =
    score >= 60 ||
    avgSentenceWords >= 22 ||
    (contentDensityPct < 52 && proseWordCount >= 30);

  let level: ComplexityAnalysis['level'] = 'Concise';
  if (isTooVerbose || score >= 60) level = 'Too Verbose';
  else if (score >= 35) level = 'Moderate';

  let suggestion =
    'Prompt is concise and high-signal. Conservative cleanup may reduce overhead; review any change before using it.';
  let recommendedAlgo: CompressionAlgorithmId = 'lossless-prune';

  if (/\[\s*\{[\s\S]*\}\s*\]/.test(trimmed)) {
    suggestion =
      'Embedded JSON payload detected alongside prose. KV / TOON folding removes repeated JSON braces and keys cleanly.';
    recommendedAlgo = 'structured-kv';
  } else if (level === 'Too Verbose') {
    if (contentDensityPct < 52) {
      suggestion = `High filler ratio (${100 - contentDensityPct}% stopwords/hedges, ${avgSentenceWords} words/sentence). Use Micro or Telegraphic compression, or split into short key-value directives.`;
      recommendedAlgo = 'micro';
    } else {
      suggestion = `Long sentence structure (${avgSentenceWords} words/sentence, Grade ${gradeLevel}). Break multi-clause prose into bulleted constraints or switch to KV / TOON.`;
      recommendedAlgo = 'structured-kv';
    }
  } else if (level === 'Moderate') {
    suggestion = `Moderate prose overhead (${contentDensityPct}% signal density, Grade ${gradeLevel}). Telegraphic or Symbolic compression trims filler cleanly.`;
    recommendedAlgo = 'telegraphic';
  }

  return {
    score,
    level,
    gradeLevel,
    readingLabel,
    contentDensityPct,
    avgSentenceWords,
    tokensPerWord,
    sentenceCount,
    wordCount,
    isTooVerbose,
    suggestion,
    recommendedAlgo,
  };
}
