# Recall

Spaced-repetition flashcards for NextOS. It schedules like the app you
already use, and it keeps your decks as plain Markdown files you can open
in any editor - no database, no export step, nothing you cannot read
without this app installed.

A deck is one file in `~/Recall`:

```markdown
# Capitals

The ones I keep forgetting.

Q: What is the capital of Australia? #geography
A: Canberra

C: The {{c1::mitochondrion}} is the powerhouse of the {{c2::cell}}.
```

Scheduling lives beside it in `<deck>.recall.json`, so the Markdown stays
clean. Every card is keyed by a hash of its question, which is what makes
"edit the deck in another editor" an ordinary thing to do: change an
answer, add a card, reorder the file, and every question you did not
touch keeps its interval, its ease factor and its history. Recall reloads
a deck when its window comes back into focus.

## What it does

**Review.** One card at a time. Space flips it, `1` to `4` grade it, and
each grade button shows the interval it will really give you - the
projection runs the actual scheduler, fuzz included, so the button cannot
promise one thing and do another. `Z` undoes the last answer completely,
including its entry in your log. `E` edits the card you are looking at
without leaving the session, `S` suspends it, `B` buries it until
tomorrow, `M` marks it.

**Type the answer.** A deck can ask you to type the answer instead of
grading yourself. Recall compares what you typed word by word, forgives
capitals, punctuation, accents and a leading "the", and highlights
exactly what was wrong and what was missing.

**The scheduler.** SM-2 with the refinements everybody ships today:
learning steps in minutes, relearning steps after a lapse, graduating and
easy intervals, an ease factor floored at 1.3, an interval modifier,
deterministic fuzz so cards learned together do not come back together
for ever, a daily new-card and review limit per deck, and a leech
threshold that tags and suspends a card you have forgotten too many
times. A "day" starts at 4 am local by default - a late night counts as
the day you began - and that hour is a per-deck setting.

**The deck browser.** Every deck with its new, learning and due counts, a
bar showing how much of it is mature, a heatmap of the last six months,
your streak, and your retention with a 30-day sparkline. Create, rename,
duplicate, delete, import and export from here.

**The card browser.** Every card in a table you can search, sort and
select. The search box takes plain words, `tag:chapter-3`, `is:due`,
`is:suspended`, `is:leech`, `due<7`, `prop:lapses>2`, `-excluded` and
`"exact phrases"`. Select cards to suspend, bury, mark, tag, untag, move
to another deck, reset or delete them together; the panel beside the
table edits whichever card has the cursor, with a live preview.

**Today.** Everything due across every deck, one button to study all of
it, and a forecast of the next seven days so a backlog is visible before
it arrives.

**Notes to cards.** Paste a page of revision notes and Recall turns
headings with a body, bullets separated by a dash, `Term: meaning` lines,
`Q:`/`A:` pairs and existing cloze text into cards, shows you what it
found, and only then writes a deck. If an assistant is available you can
ask it to draft cards from the same text and merge anything new.

**A daily reminder.** Optional, off by default, at a time you choose, and
only when something is actually due. Recall has no background process:
it checks while it is open and reconciles when you open it.

## Keyboard

| Key | What it does |
| --- | --- |
| `?` | The shortcut overlay |
| `1` `2` `3` | Decks, Today, Cards |
| `N` / `I` / `G` | New deck / import / make a deck from notes |
| `R` | Reload the decks from disk |
| `/` | Jump to the card browser's search |
| `↑` `↓` | Move between decks |
| `Enter` | Study the selected deck |
| `E` / `S` / `Backspace` | Browse / settings / delete the selected deck |
| `Space` | Show the answer; again to grade it Good |
| `1` `2` `3` `4` | Again, Hard, Good, Easy |
| `Z` | Undo the last answer |
| `E` `S` `B` `M` | Edit, suspend, bury, mark the current card |
| `Escape` | End the session, or close a dialog |
| `⌘⏎` | Save the card you are editing |

## The file format

- `# Title` on the first line, then anything you like as a description,
  until the first card.
- `Q:` opens a card and runs until `A:`; the answer runs to the next
  card. Both can span lines and carry Markdown - **bold**, *italic*,
  `code`, fenced blocks, lists, block quotes. An image written as
  `![alt](path.png)` is shown as a chip naming the file rather than
  loaded.
- `C:` opens a cloze card, and so does any line containing a
  `{{c1::deletion}}`. Each distinct number makes its own card;
  `{{c1::answer::hint}}` shows the hint in the gap.
- `#tag` at the end of a question line, or a `tags:` line of its own,
  tags the card. Recall writes tags back the way you wrote them.
- A fenced code block is opaque: a ``` block containing `Q:` is answer
  text, not a new card.
- Round-tripping is byte-exact for a file Recall wrote, including
  Windows line endings and whether the file ended with a newline.

## For agents

Six tools, prefixed `recall_`:

| Tool | What it does |
| --- | --- |
| `recall_list_decks` | Every deck with its counts, tags and file path. Read-only. |
| `recall_due` | What is waiting now, per deck, and when the next card comes back. Read-only. |
| `recall_add_cards` | Append cards to a deck (`create: true` makes it first). Duplicates are skipped, not added twice. |
| `recall_create_deck_from_text` | Turn notes into a whole deck; `useAssistant: true` also asks the assistant to draft cards and merges what is new. |
| `recall_review_stats` | Reviews, retention, streak, the make-up of the collection, the seven-day forecast. Read-only. |
| `recall_export` | A deck as Markdown or as Anki TSV. Read-only. |

Nothing an agent can call deletes anything: removing a deck or a card
stays a thing a person does, because a card's review history cannot be
got back. Every tool that writes flushes to disk before it answers.

Two intents: `kumin://recall/open?deck=Spanish%20verbs` shows a deck's
cards, `kumin://recall/study?deck=Spanish%20verbs` starts reviewing (omit
the deck to study everything that is due).

## Limits, honestly

- **The reminder needs the app open.** NextOS has no background timer an
  app can book, so the daily reminder fires while Recall is open, and
  catches up when you next open it.
- **Images are named, not shown.** A card can reference a picture by a
  relative path and Recall shows the path; it does not read the file into
  the card.
- **A card edited outside Recall is a new card.** Identity is the
  question's text. Change a question in another editor and that card
  starts from new - edit it inside Recall and its schedule follows it.
- **One search language, no `or`.** Every term in the card browser's
  search has to match. Negation is there; alternation is not.
- **No shared decks or sync.** Decks are files. Put `~/Recall` wherever
  your files already sync and Recall will read what turns up.

## Building it

```
npm install
npm run build:app -- recall     # files/build/app.js + app.css, app.zip, app.lock.json
npm run test:apps               # the pure modules' tests
npm run typecheck:apps
node tools/recall/preview/serve.mjs   # then open http://localhost:4321
```

The preview harness runs the built bundle in an ordinary browser tab
against a stubbed SDK, with a few seeded decks and some review history -
it is how the screenshots in this folder were taken.
