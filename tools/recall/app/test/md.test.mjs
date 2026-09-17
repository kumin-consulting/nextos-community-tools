// test/md.test.mjs - the card renderer's tokeniser. Cards are typed by
// hand, so the interesting cases are the malformed ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const { parseBlocks, parseInline, plainText } = await load('md');

test('splits paragraphs, headings, rules and quotes', () => {
  const blocks = parseBlocks(['## Heading', '', 'A paragraph', 'that wraps.', '', '---', '', '> Quoted', '> lines'].join('\n'));
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'paragraph', 'rule', 'quote']);
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1].text, 'A paragraph\nthat wraps.');
  assert.equal(blocks[3].text, 'Quoted\nlines');
});

test('keeps a fenced code block exactly as written', () => {
  const blocks = parseBlocks(['```js', 'const a = 1;', '', '  // indented', '```'].join('\n'));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'code');
  assert.equal(blocks[0].lang, 'js');
  assert.equal(blocks[0].text, 'const a = 1;\n\n  // indented');
});

test('an unclosed fence takes the rest of the card rather than losing it', () => {
  const blocks = parseBlocks('```\nstill code\nand more');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'still code\nand more');
});

test('reads both kinds of list, with continuation lines', () => {
  const bullets = parseBlocks(['- one', '- two', '  continued', '- three'].join('\n'));
  assert.equal(bullets[0].kind, 'list');
  assert.equal(bullets[0].ordered, false);
  assert.deepEqual(bullets[0].items, ['one', 'two\ncontinued', 'three']);

  const ordered = parseBlocks('1. first\n2. second');
  assert.equal(ordered[0].ordered, true);
  assert.deepEqual(ordered[0].items, ['first', 'second']);
});

test('inline formatting, links and images', () => {
  const tokens = parseInline('A **bold** and *italic* with `code()` and [a link](https://example.com) and ![a picture](pics/x.png).');
  assert.deepEqual(tokens.map((t) => t.kind), ['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text', 'image', 'text']);
  assert.equal(tokens[1].text, 'bold');
  assert.equal(tokens[5].text, 'code()');
  assert.equal(tokens[7].href, 'https://example.com');
  assert.equal(tokens[9].href, 'pics/x.png');
});

test('an underscore inside a word is not italic', () => {
  const tokens = parseInline('snake_case_name and _real italics_');
  assert.deepEqual(tokens.filter((t) => t.kind === 'em').map((t) => t.text), ['real italics']);
});

test('unbalanced markers stay visible instead of eating the card', () => {
  assert.deepEqual(parseInline('**not closed'), [{ kind: 'text', text: '**not closed' }]);
  assert.deepEqual(parseInline('a ` backtick'), [{ kind: 'text', text: 'a ` backtick' }]);
});

test('a cloze gap is a token only where the review screen asks for one', () => {
  assert.deepEqual(parseInline('The [...] of the cell').map((t) => t.kind), ['text']);
  const blanks = parseInline('The [...] of the [nucleus?] cell', { blanks: true });
  assert.deepEqual(blanks.filter((t) => t.kind === 'blank').map((t) => t.text), ['...', 'nucleus?']);
});

test('code spans win over everything inside them', () => {
  const tokens = parseInline('`a **b** c`');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].kind, 'code');
  assert.equal(tokens[0].text, 'a **b** c');
});

test('plainText is what search and the browser row see', () => {
  const text = plainText(['# Title', '', 'Some **bold** text with `code`.', '', '- one', '- two', '', '```', 'code();', '```'].join('\n'));
  assert.equal(text, 'Title Some bold text with code. one · two code();');
});

test('empty input is an empty document', () => {
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseInline(''), []);
  assert.equal(plainText(''), '');
});
