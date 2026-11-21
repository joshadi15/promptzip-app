import assert from 'node:assert/strict';
import test from 'node:test';
import { fileCoverage, normalizeMarkdownFileName, proposedText, reviewFileSet, reviewText } from './promptReview';

test('flags vague task wording and replaces only the selected exact phrase', () => {
  const text = 'Build a fast dashboard for monthly expenses.';
  const finding = reviewText(text, 'prompt').find((item) => item.excerpt === 'fast');
  assert.ok(finding);
  assert.equal(finding.category, 'ambiguity');
  assert.equal(proposedText(text, finding, 'lightweight'), 'Build a lightweight dashboard for monthly expenses.');
  assert.equal(proposedText(text, finding, ''), null);
  assert.equal(proposedText('Text has changed', finding, 'quick'), null);
});

test('agent review distinguishes uploaded references from unverified project paths', () => {
  const text = '# Project\nAlways edit `src/app.ts`. Run npm test.';
  const without = reviewText(text, 'file', 'AGENTS.md', [{ name: 'AGENTS.md', text }]);
  assert.ok(without.some((item) => item.priority === 'unverified' && item.title.includes('src/app.ts')));
  const withTarget = reviewText(text, 'file', 'AGENTS.md', [{ name: 'AGENTS.md', text }, { name: 'src/app.ts', text: '' }]);
  assert.ok(!withTarget.some((item) => item.title.includes('src/app.ts')));
});

test('agent review asks for verification only when absent and never certifies completeness', () => {
  const short = reviewText('Project: demo. Always use TypeScript.', 'file', 'AGENTS.md');
  assert.ok(short.some((item) => item.id === 'file-verification'));
  const fuller = reviewText('Project: demo. Always use TypeScript. Run npm test. Never change the API.', 'file', 'AGENTS.md');
  assert.ok(!fuller.some((item) => item.id === 'file-verification'));
  assert.ok(!fuller.some((item) => item.id === 'file-boundaries'));
  assert.deepEqual(fileCoverage('Project: demo. Always use TypeScript. Run npm test. Never change the API.', 'AGENTS.md').map((item) => item.detected), [true, true, true, true]);
});

test('new details require user-provided content before any text is changed', () => {
  const text = 'Build a dashboard for expenses.';
  const finding = reviewText(text, 'prompt').find((item) => item.id === 'prompt-output');
  assert.ok(finding);
  assert.equal(proposedText(text, finding, ''), null);
  assert.equal(proposedText(text, finding, 'A React page with a monthly table.'), `${text}\n\nDescribe the deliverable: A React page with a monthly table.`);
});

test('Kiro reviews three foundation files as a set without calling them absent from disk', () => {
  const files = [
    { name: 'product.md', text: 'Purpose: help users. Key features: reviews.' },
    { name: '.kiro/steering/tech.md', text: 'Stack: React. Tools: Vite. Constraint: no API.' },
  ];
  const set = reviewFileSet(files, 'kiro');
  assert.deepEqual(set.map((item) => [item.id, item.hasContent, item.pathVerified]), [
    ['product', true, false], ['tech', true, true], ['structure', false, false],
  ]);
  assert.equal(set[2].uploadedName, undefined);
  assert.deepEqual(reviewFileSet(files, 'generic'), []);
});

test('Kiro product and tech files get different content checks', () => {
  const product = reviewText('Purpose: organize tasks. Users: developers. Features: review prompts.', 'file', 'product.md', [], 'kiro');
  assert.ok(!product.some((finding) => finding.id === 'file-verification'));
  assert.ok(!product.some((finding) => finding.id.startsWith('product-')));
  const tech = reviewText('Framework: React. Tools: Vite.', 'file', 'tech.md', [], 'kiro');
  assert.ok(tech.some((finding) => finding.id === 'tech-constraints'));
  assert.ok(!tech.some((finding) => finding.id === 'product-users'));
});

test('Kiro conditional inclusion requires a pattern and recognizes file references', () => {
  const text = '---\ninclusion: fileMatch\n---\n#[[file:docs/guide.md]]';
  const findings = reviewText(text, 'file', '.kiro/steering/tech.md', [], 'kiro');
  assert.ok(findings.some((finding) => finding.id === 'kiro-file-match'));
  assert.ok(findings.some((finding) => finding.id === 'reference-docs/guide.md' && finding.priority === 'unverified'));
});

test('new Markdown names preserve relative paths and reject unsafe or non-Markdown names', () => {
  assert.equal(normalizeMarkdownFileName(' .kiro/steering/api-rules '), '.kiro/steering/api-rules.md');
  assert.equal(normalizeMarkdownFileName('AGENTS.md'), 'AGENTS.md');
  assert.throws(() => normalizeMarkdownFileName('../outside.md'));
  assert.throws(() => normalizeMarkdownFileName('notes.txt'));
  assert.throws(() => normalizeMarkdownFileName('/absolute.md'));
});
