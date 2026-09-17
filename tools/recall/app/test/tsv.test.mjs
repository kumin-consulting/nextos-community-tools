// test/tsv.test.mjs - importing and exporting what Anki puts on the
// clipboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const { parseTsv, splitTsvLine, toTsv } = await load('tsv');

test('reads front, back and tags', () => {
  const { cards, tagged, skipped } = parseTsv('What is 2 + 2?\t4\tmaths easy\nCapital of Peru\tLima');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'What is 2 + 2?');
  assert.equal(cards[0].answer, '4');
  assert.deepEqual(cards[0].tags, ['maths', 'easy']);
  assert.deepEqual(cards[1].tags, []);
  assert.equal(tagged, 1);
  assert.equal(skipped, 0);
});

test("skips Anki's own directive lines and blank ones", () => {
  const { cards } = parseTsv('#separator:tab\n#html:true\n\nFront\tBack\n');
  assert.equal(cards.length, 1);
});

test('counts a row with no back instead of importing half a card', () => {
  const { cards, skipped } = parseTsv('Front only\nGood\tRow');
  assert.equal(cards.length, 1);
  assert.equal(skipped, 1);
});

test('turns <br> into a real line break and decodes entities', () => {
  const { cards } = parseTsv('Two lines<br>here\tAnswer with &amp; and &lt;tags&gt;');
  assert.equal(cards[0].question, 'Two lines\nhere');
  assert.equal(cards[0].answer, 'Answer with & and <tags>');
});

test('reads a quoted field containing a tab, a quote and a newline', () => {
  const text = 'Simple\t"He said ""hello""\there"\n"Multi\nline front"\tBack';
  const { cards } = parseTsv(text);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].answer, 'He said "hello"\there');
  assert.equal(cards[1].question, 'Multi\nline front');
});

test('splitTsvLine keeps quoted tabs together', () => {
  assert.deepEqual(splitTsvLine('a\tb\tc'), ['a', 'b', 'c']);
  assert.deepEqual(splitTsvLine('a\t"b\tstill b"\tc'), ['a', '"b\tstill b"', 'c']);
});

test('writing then reading gives the same cards back', () => {
  const cards = [
    { question: 'Front with\na line break', answer: 'Back "quoted"', tags: ['one', 'two'] },
    { question: 'Plain', answer: 'Simple', tags: [] },
  ];
  const round = parseTsv(toTsv(cards)).cards;
  assert.deepEqual(round, cards);
});

test('the export starts with the directives Anki expects', () => {
  const text = toTsv([{ question: 'a', answer: 'b', tags: [] }]);
  assert.ok(text.startsWith('#separator:tab\n#html:true\n'));
  assert.ok(text.endsWith('\n'));
  assert.equal(toTsv([]), '#separator:tab\n#html:true\n');
});

test('nonsense does not throw', () => {
  const { cards, skipped } = parseTsv('just\nsome\nlines');
  assert.equal(cards.length, 0);
  assert.equal(skipped, 3);
});
