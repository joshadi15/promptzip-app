import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDelimitedRows } from './spreadsheetParsing';

test('CSV preserves quoted delimiters, escaped quotes, multiline cells and CRLF', () => {
  assert.deepEqual(parseDelimitedRows('\uFEFFname,note\r\nAlice,"red, blue"\r\nBob,"say ""hi""\nagain"\r\n', ','), [
    ['name', 'note'], ['Alice', 'red, blue'], ['Bob', 'say "hi"\nagain'],
  ]);
});

test('TSV and malformed quoting are handled explicitly', () => {
  assert.deepEqual(parseDelimitedRows('a\tb\n1\t2', '\t'), [['a', 'b'], ['1', '2']]);
  assert.throws(() => parseDelimitedRows('a,"unfinished', ','), /Unclosed quoted field/);
});
