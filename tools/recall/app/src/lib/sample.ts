// src/lib/sample.ts
//
// The deck the empty state offers. Twelve cards that teach the app by
// being the app: every feature they describe is one you can try on the
// card in front of you. Written in the deck format itself, so opening
// ~/Recall/How Recall works.md in any editor shows you the format at the
// same time.

export const SAMPLE_DECK_NAME = 'How Recall works';

export const SAMPLE_DECK = `# How Recall works

Twelve cards about this app, in the format this app reads. Everything
here is a plain Markdown file you can edit anywhere - delete this deck
whenever you like.

Q: What key flips the card you are looking at? #basics
A: **Space**. It shows the answer; pressing it again grades the card *Good*.

Q: How do you grade a card once it is flipped? #basics
A: The number keys **1** to **4** - Again, Hard, Good, Easy. Each button
shows the interval you will actually get, not an estimate of it.

Q: Where does Recall keep a deck? #files
A: In a Markdown file at \`~/Recall/<deck>.md\`. Scheduling lives beside it
in \`<deck>.recall.json\`, so the deck itself stays yours to edit.

Q: What happens if you edit a deck file outside Recall? #files
A: Recall reloads it when the window comes back into focus and matches
the cards up by the text of the question, so everything you did not touch
keeps its schedule.

Q: How do you write a card by hand? #format
A: A \`Q:\` line, then an \`A:\` line. Both can run over several lines and
carry Markdown - **bold**, *italic*, \`code\`, lists, fenced blocks. Tag a
card with \`#tags\` at the end of its question, or a \`tags:\` line.

C: A deletion written as {{c1::a double-braced cloze}} hides that phrase
and leaves the rest of the sentence readable.
tags: format

C: Each cloze number makes its own card, so {{c1::this}} and {{c2::this}}
are two cards from one line.
tags: format

Q: What is a leech? #scheduling
A: A card you have forgotten eight times. Recall tags it \`leech\`,
suspends it, and tells you - a card that will not stick usually needs
rewriting, not more repetitions.

Q: When does a review day start? #scheduling
A: At 4 am local time by default, so a late night still counts as the day
you began. You can change the hour in a deck's settings.

Q: What can an agent do with your decks? #agents
A: List them, read what is due, add cards, build a whole deck out of a
page of notes, read your review statistics and export a deck. Only adding
and creating change anything.

Q: How do you undo a grade you did not mean? #basics
A: Press **Z** (or ⌘Z) during a review - the card comes back exactly as
it was, and the answer is taken out of your log.
`;
