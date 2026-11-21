import assert from 'node:assert/strict';
import test from 'node:test';
import { ALGORITHMS, benchmarkAllAlgorithms, compressPrompt } from './compression';
import { countBpeTokens, calculateCostDelta, formatTokenChange } from './tokenizer';
import { buildCliCommand, formatPromptForAi } from './cliFormats';

test('all methods report token counts and percentage from actual encoded output', () => {
  const input = 'Hello! Could you please make sure to return strict JSON? Thanks!';
  const benchmark = benchmarkAllAlgorithms(input);
  assert.equal(benchmark.results.length, ALGORITHMS.length);
  for (const result of benchmark.results) {
    assert.equal(result.inputTokens, countBpeTokens(input.trim()));
    assert.equal(result.outputTokens, countBpeTokens(result.output));
    assert.equal(result.savedTokens, Math.max(0, result.inputTokens - result.outputTokens));
    assert.equal(result.reductionPct, Math.round(((result.inputTokens - result.outputTokens) / result.inputTokens) * 1000) / 10);
  }
  assert.ok(benchmark.results.some((result) => result.savedTokens > 0));
});

test('protected code, quotes, numbers, and negation survive compression', () => {
  const input = 'Please refactor this code. Do not delete user data. Keep `user.id`, "exact output", and 42ms unchanged.';
  for (const algorithm of ALGORITHMS) {
    const result = compressPrompt(input, algorithm.id);
    for (const phrase of ['Do not delete user data', '`user.id`', '"exact output"', '42ms']) {
      assert.ok(result.output.toLowerCase().includes(phrase.toLowerCase()), `${algorithm.id} dropped ${phrase}: ${result.output}`);
    }
  }
});

test('empty prompt and zero-price estimates stay finite', () => {
  const result = compressPrompt(' ', 'telegraphic');
  assert.equal(result.inputTokens, 0);
  assert.equal(result.outputTokens, 0);
  assert.equal(result.reductionPct, 0);
  const cost = calculateCostDelta(100, 60, 2.5, 1000);
  assert.ok(Math.abs(cost.originalCost - 0.25) < 1e-9);
  assert.ok(Math.abs(cost.compressedCost - 0.15) < 1e-9);
  assert.ok(Math.abs(cost.savedCost - 0.1) < 1e-9);
  assert.equal(formatTokenChange(34.8), '34.8% fewer');
  assert.equal(formatTokenChange(-5), '5% more');
  assert.equal(formatTokenChange(0), 'No change');
});

test('CLI command quotes user text and formatting keeps the actual input', () => {
  const prompt = "Do not remove 'quoted' text or `code`.";
  assert.ok(buildCliCommand(prompt, 'claude', 'bash').includes("'\\''"));
  assert.ok(formatPromptForAi(prompt, 'compressed').includes(prompt));
});
