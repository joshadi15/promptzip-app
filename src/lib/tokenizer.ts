import { encode as encodeO200k, decode as decodeO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { encode as encodeCl100k, decode as decodeCl100k } from 'gpt-tokenizer/encoding/cl100k_base';

export type BpeEncoding = 'o200k_base' | 'cl100k_base';

export function formatTokenChange(reductionPct: number): string {
  if (reductionPct > 0) return `${reductionPct}% fewer`;
  if (reductionPct < 0) return `${Math.abs(reductionPct)}% more`;
  return 'No change';
}

export interface TokenSegment {
  id: number;
  text: string;
}

export function countBpeTokens(text: string, encoding: BpeEncoding = 'o200k_base'): number {
  if (!text) return 0;
  try {
    return encoding === 'o200k_base' ? encodeO200k(text).length : encodeCl100k(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function tokenizeSegments(
  text: string,
  encoding: BpeEncoding = 'o200k_base',
  maxTokens = 600
): { segments: TokenSegment[]; truncated: boolean; total: number } {
  if (!text) return { segments: [], truncated: false, total: 0 };
  const ids = encoding === 'o200k_base' ? encodeO200k(text) : encodeCl100k(text);
  const decoder = encoding === 'o200k_base' ? decodeO200k : decodeCl100k;
  const truncated = ids.length > maxTokens;
  const slice = truncated ? ids.slice(0, maxTokens) : ids;

  const segments: TokenSegment[] = slice.map((id) => ({
    id,
    text: decoder([id]),
  }));

  return { segments, truncated, total: ids.length };
}

export function calculateCostDelta(
  originalTokens: number,
  compressedTokens: number,
  inputPerMillionUsd: number,
  callsPerMonth: number
): {
  originalCost: number;
  compressedCost: number;
  savedCost: number;
} {
  const originalCost = (originalTokens / 1_000_000) * inputPerMillionUsd * callsPerMonth;
  const compressedCost = (compressedTokens / 1_000_000) * inputPerMillionUsd * callsPerMonth;
  return {
    originalCost,
    compressedCost,
    savedCost: Math.max(0, originalCost - compressedCost),
  };
}
