// test/extract.test.mjs - notes in, cards out. The point of these tests
// is as much what the extractor REFUSES to make a card of as what it
// does: a deck full of junk cards is worse than an empty one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './_load.mjs';

const { extractCards, mergeDrafts, parseAssistantCards, clip } = await load('extract');

const find = (cards, question) => cards.find((c) => c.question === question);

test('reads a definition list', () => {
  const { cards } = extractCards(['Mitosis: division of a cell into two identical cells', 'Meiosis: division that halves the chromosome number'].join('\n'));
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'Mitosis');
  assert.equal(cards[0].answer, 'division of a cell into two identical cells');
  assert.equal(cards[1].question, 'Meiosis');
});

test('reads bullets separated by a dash, an en dash or an em dash', () => {
  const { cards } = extractCards(['- Ampere - the unit of electric current', '* Volt \u2013 the unit of potential difference', '1. Ohm \u2014 the unit of resistance'].join('\n'));
  assert.deepEqual(cards.map((c) => c.question), ['Ampere', 'Volt', 'Ohm']);
  assert.equal(cards[2].answer, 'the unit of resistance');
});

test('a heading with a body becomes one card', () => {
  const { title, cards } = extractCards(['# Photosynthesis', '', '## Light reactions', '', 'Take place in the thylakoid membrane and make ATP and NADPH.'].join('\n'));
  assert.equal(title, 'Photosynthesis');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, 'Light reactions');
  assert.match(cards[0].answer, /thylakoid membrane/);
});

test('a heading whose body already made cards does not become a card itself', () => {
  const { cards } = extractCards(['## Units', '', '- Ampere - electric current', '- Volt - potential difference'].join('\n'));
  assert.equal(cards.length, 2);
  assert.equal(find(cards, 'Units'), undefined);
});

test('a definition sentence becomes a cloze', () => {
  const { cards } = extractCards('## Cells\n\nThe mitochondrion is the powerhouse of the cell.');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, 'The mitochondrion is {{c1::the powerhouse of the cell}}.');
  assert.equal(cards[0].answer, '');
});

test('cloze can be turned off, giving a plain question instead', () => {
  const { cards } = extractCards('## Cells\n\nThe mitochondrion is the powerhouse of the cell.', { cloze: false });
  assert.equal(cards[0].question, 'The mitochondrion');
  assert.equal(cards[0].answer, 'is the powerhouse of the cell');
});

test('text that is already a deletion is kept as one', () => {
  const { cards } = extractCards('The {{c1::hippocampus}} consolidates memory.');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, 'The {{c1::hippocampus}} consolidates memory.');
});

test('explicit Q/A pairs win, and a multi-line answer is kept whole', () => {
  const { cards } = extractCards(['Q: What is a monad? #fp', 'A: A monoid in the category of endofunctors.', 'Nobody has ever needed more than that.', '', 'Q: Second?', 'A: Yes.'].join('\n'));
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'What is a monad?');
  assert.deepEqual(cards[0].tags, ['fp']);
  assert.match(cards[0].answer, /Nobody has ever needed/);
  assert.equal(cards[1].question, 'Second?');
});

test('a long sentence is not mistaken for a term', () => {
  const { cards } = extractCards('In the summer of 1963, after a great deal of argument: the committee finally agreed.');
  assert.equal(cards.length, 0);
});

test('prose with nothing card-shaped in it makes no cards', () => {
  const { cards, skipped } = extractCards('It rained all week. Then it stopped, and everybody went outside again.');
  assert.equal(cards.length, 0);
  assert.ok(skipped > 0);
});

test('a URL is not read as a definition', () => {
  const { cards } = extractCards('- See https://example.com/notes for more');
  assert.equal(cards.length, 0);
});

test('duplicate questions are dropped', () => {
  const { cards } = extractCards(['Volt: potential difference', 'Volt: something else entirely'].join('\n'));
  assert.equal(cards.length, 1);
});

test('tags apply to everything a run produces', () => {
  const { cards } = extractCards('Volt: potential difference', { tags: ['physics'] });
  assert.deepEqual(cards[0].tags, ['physics']);
});

test('a fenced code block stays with its heading', () => {
  const { cards } = extractCards(['## Reversing a list', '', '```js', 'const back = list.slice().reverse();', '```'].join('\n'));
  assert.equal(cards.length, 1);
  assert.match(cards[0].answer, /```js/);
  assert.match(cards[0].answer, /slice\(\)\.reverse\(\)/);
});

test('a Setext heading counts as a heading', () => {
  const { title, cards } = extractCards(['Chemistry', '=========', '', 'Valence', '-------', '', 'The number of bonds an atom forms.'].join('\n'));
  assert.equal(title, 'Chemistry');
  assert.equal(cards[0].question, 'Valence');
});

test('an over-long answer is cut at a sentence', () => {
  const long = 'First sentence here. ' + 'Second sentence that keeps going and going. '.repeat(20);
  const { cards } = extractCards(`## Heading\n\n${long}`, { maxAnswerChars: 80 });
  assert.ok(cards[0].answer.length <= 81, cards[0].answer.length);
  assert.ok(cards[0].answer.endsWith('.'));
  assert.equal(clip('short', 100), 'short');
  assert.ok(clip('a'.repeat(200), 50).endsWith('\u2026'));
});

test('the real thing: a page of revision notes', () => {
  const notes = `# Roman Britain

## Key dates

- 43 AD - Claudius invades
- 122 AD - Hadrian's Wall begun
- 410 AD - Roman withdrawal

## Terms

Villa: a Roman country estate
Civitas: a self-governing town

## The legions

The Second Augusta was based at Caerleon.`;
  const { title, cards } = extractCards(notes);
  assert.equal(title, 'Roman Britain');
  assert.equal(cards.length, 6);
  assert.equal(find(cards, '43 AD').answer, 'Claudius invades');
  assert.equal(find(cards, 'Villa').answer, 'a Roman country estate');
  assert.ok(cards.some((c) => c.question.includes('{{c1::')));
});

/* --------------------------------------------------- assistant replies */

test('reads a JSON array of cards from an assistant', () => {
  const cards = parseAssistantCards('Here you go:\n[{"question":"What is X?","answer":"Y","tags":["t"]},{"front":"A","back":"B"}]\nHope that helps.');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'What is X?');
  assert.deepEqual(cards[0].tags, ['t']);
  assert.equal(cards[1].answer, 'B');
});

test('reads Q:/A: lines from an assistant', () => {
  const cards = parseAssistantCards(['1. Q: What is the capital of Peru?', 'A: Lima', '', 'Q: And of Chile?', 'A: Santiago'].join('\n'));
  assert.deepEqual(cards.map((c) => c.question), ['What is the capital of Peru?', 'And of Chile?']);
  assert.equal(cards[1].answer, 'Santiago');
});

test('reads dashed lines from an assistant', () => {
  const cards = parseAssistantCards('- Ampere - unit of current\n- Volt - unit of potential');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'Ampere');
});

test('an assistant reply nobody can read yields nothing rather than nonsense', () => {
  assert.deepEqual(parseAssistantCards("I'm afraid I can't help with that."), []);
});

test('merging keeps the rules version of a duplicate question', () => {
  const merged = mergeDrafts([{ question: 'Volt', answer: 'from the rules', tags: [] }], [
    { question: 'volt', answer: 'from the assistant' },
    { question: 'Ohm', answer: 'resistance' },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].answer, 'from the rules');
  assert.equal(merged[1].question, 'Ohm');
});
