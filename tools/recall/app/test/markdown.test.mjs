// test/markdown.test.mjs - the deck format: what the parser reads, what
// the serialiser writes back, and the promise that the two are inverses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const {
  parseDeck,
  serialiseDeck,
  expandCards,
  clozeNumbers,
  clozeFront,
  clozeBack,
  clozeAnswer,
  stableId,
  basicNote,
  clozeNote,
  addNotes,
  emptyDeck,
  noteFromDraft,
  parseTagList,
} = await load('markdown');
const { SAMPLE_DECK } = await load('sample');

const DECK = `# Capitals

The ones I keep forgetting.

Q: What is the capital of Australia? #geo
A: Canberra

Q: What is the capital of Canada?
tags: geo, north-america
A: Ottawa

C: The {{c1::mitochondrion}} is the powerhouse of the {{c2::cell}}.
`;

test('parses a deck into a title, a description and its notes', () => {
  const deck = parseDeck(DECK);
  assert.equal(deck.title, 'Capitals');
  assert.equal(deck.description, 'The ones I keep forgetting.');
  assert.equal(deck.notes.length, 3);
  assert.deepEqual(deck.notes[0].tags, ['geo']);
  assert.equal(deck.notes[0].tagStyle, 'inline');
  assert.equal(deck.notes[0].question, 'What is the capital of Australia?');
  assert.equal(deck.notes[0].answer, 'Canberra');
  assert.deepEqual(deck.notes[1].tags, ['geo', 'north-america']);
  assert.equal(deck.notes[1].tagStyle, 'line');
  assert.equal(deck.notes[2].kind, 'cloze');
  assert.equal(deck.problems.length, 0);
});

test('round-trips a canonical deck byte for byte', () => {
  assert.equal(serialiseDeck(parseDeck(DECK)), DECK);
});

test('round-trips the sample deck the empty state offers', () => {
  const deck = parseDeck(SAMPLE_DECK);
  assert.equal(deck.problems.length, 0, JSON.stringify(deck.problems));
  assert.equal(serialiseDeck(deck), SAMPLE_DECK);
  assert.equal(expandCards(deck).length, 12);
});

test('keeps Windows line endings and a missing final newline', () => {
  const crlf = DECK.replace(/\n/g, '\r\n');
  const deck = parseDeck(crlf);
  assert.equal(deck.eol, '\r\n');
  assert.equal(serialiseDeck(deck), crlf);

  const noNewline = DECK.trimEnd();
  const deck2 = parseDeck(noNewline);
  assert.equal(deck2.trailingNewline, false);
  assert.equal(serialiseDeck(deck2), noNewline);
});

test('a fenced code block containing "Q:" is answer text, not a new card', () => {
  const text = [
    'Q: How do you write a prompt?',
    'A: Like this:',
    '',
    '```',
    'Q: this is not a card',
    'A: and neither is this',
    '```',
    '',
    'Q: Second card',
    'A: Yes',
    '',
  ].join('\n');
  const deck = parseDeck(text);
  assert.equal(deck.notes.length, 2);
  assert.match(deck.notes[0].answer, /Q: this is not a card/);
  assert.equal(deck.notes[1].question, 'Second card');
  assert.equal(serialiseDeck(deck), text);
});

test('a multi-line answer keeps its blank lines but not its trailing ones', () => {
  const deck = parseDeck('Q: Two paragraphs?\nA: First.\n\nSecond.\n\n\n');
  assert.equal(deck.notes[0].answer, 'First.\n\nSecond.');
});

test('trailing spaces on a question line survive the round trip', () => {
  const text = 'Q: Spaced   \nA: Yes\n';
  const deck = parseDeck(text);
  assert.equal(deck.notes[0].question, 'Spaced   ');
  assert.equal(serialiseDeck(deck), text);
});

test('reports a question with no answer instead of throwing', () => {
  const deck = parseDeck('Q: Lonely question\n\nQ: Another\nA: Fine\n');
  assert.equal(deck.notes.length, 2);
  assert.equal(deck.problems.length, 1);
  assert.equal(deck.problems[0].line, 1);
});

test('a bare line with a deletion is a cloze card without needing "C:"', () => {
  const deck = parseDeck('The capital of {{c1::France}} is {{c2::Paris}}.\n');
  assert.equal(deck.notes.length, 1);
  assert.equal(deck.notes[0].kind, 'cloze');
  assert.equal(deck.notes[0].explicit, false);
  assert.equal(serialiseDeck(deck), 'The capital of {{c1::France}} is {{c2::Paris}}.\n');
});

test('expands one card per cloze number, with hints', () => {
  const text = 'C: {{c1::Alpha::first letter}} then {{c2::Beta}} then {{c1::Gamma}}.';
  assert.deepEqual(clozeNumbers(text), [1, 2]);
  assert.equal(clozeFront(text, 1), 'C: [first letter] then Beta then [...].');
  assert.equal(clozeBack(text, 1), 'C: Alpha then Beta then Gamma.');
  assert.equal(clozeAnswer(text, 1), 'Alpha, Gamma');

  const cards = expandCards(parseDeck(`${text}\n`));
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.ordinal), [1, 2]);
  assert.notEqual(cards[0].id, cards[1].id);
});

test('a card id follows the question text, not its position or its answer', () => {
  const a = expandCards(parseDeck('Q: Same question\nA: One\n'))[0];
  const b = expandCards(parseDeck('Q: Filler\nA: x\n\nQ: Same question\nA: A different answer\n'))[1];
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, stableId('Some other question'));
  // CRLF and trailing whitespace must not change a card's identity.
  assert.equal(stableId('Same question'), stableId('Same question\r\n'));
});

test('two notes with the same question get different ids', () => {
  const cards = expandCards(parseDeck('Q: Twin\nA: one\n\nQ: Twin\nA: two\n'));
  assert.equal(cards.length, 2);
  assert.notEqual(cards[0].id, cards[1].id);
});

test('addNotes skips a card the deck already has', () => {
  const deck = parseDeck(DECK);
  const result = addNotes(deck, [basicNote('What is the capital of Australia?', 'Canberra'), basicNote('New one', 'Yes')]);
  assert.equal(result.added.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.deck.notes.length, 4);
});

test('a draft with deletions and no answer becomes a cloze note', () => {
  assert.equal(noteFromDraft({ question: 'The {{c1::cat}} sat.', answer: '' }).kind, 'cloze');
  assert.equal(noteFromDraft({ question: 'Plain?', answer: 'Yes' }).kind, 'basic');
});

test('an empty deck serialises to just its heading', () => {
  assert.equal(serialiseDeck(emptyDeck('Fresh')), '# Fresh\n');
  const withNote = { ...emptyDeck('Fresh'), notes: [clozeNote('A {{c1::cloze}}.', ['x'])] };
  assert.equal(serialiseDeck(withNote), '# Fresh\n\nC: A {{c1::cloze}}. #x\n');
});

test('parseTagList takes commas, spaces and hashes', () => {
  assert.deepEqual(parseTagList('#one, two  three'), ['one', 'two', 'three']);
  assert.deepEqual(parseTagList('   '), []);
});

test('an empty file parses to an empty deck rather than failing', () => {
  const deck = parseDeck('');
  assert.equal(deck.notes.length, 0);
  assert.equal(deck.title, '');
  assert.equal(expandCards(deck).length, 0);
});
