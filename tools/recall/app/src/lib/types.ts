// src/lib/types.ts
//
// Every shape Recall's pure modules agree on. Types only - no runtime
// value lives here, so any module can `import type` from it without
// pulling code along.

/* ------------------------------------------------------------- deck */

/** A basic note: one question, one answer. Its tags were written either
 *  at the end of the `Q:` line (`inline`) or on a `tags:` line of their
 *  own (`line`); serialising puts them back where the author had them. */
export interface BasicNote {
  kind: 'basic';
  question: string;
  answer: string;
  tags: string[];
  tagStyle: 'inline' | 'line';
}

/** A cloze note: one piece of text with `{{c1::...}}` deletions in it.
 *  `explicit` records whether the author marked it with `C:` or simply
 *  wrote a line containing a deletion. */
export interface ClozeNote {
  kind: 'cloze';
  text: string;
  tags: string[];
  tagStyle: 'inline' | 'line';
  explicit: boolean;
}

export type Note = BasicNote | ClozeNote;

/** A parsed deck file. `eol` and `trailingNewline` are carried so that
 *  serialising a deck nobody edited gives back the same bytes. */
export interface ParsedDeck {
  title: string;
  description: string;
  notes: Note[];
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
  /** Anything the parser could not make sense of, for the UI to show
   *  instead of failing: `{ line, message }`, one per problem. */
  problems: DeckProblem[];
}

export interface DeckProblem {
  line: number;
  message: string;
}

/** One reviewable card. A basic note makes one; a cloze note makes one
 *  per distinct `c<N>` number in it. */
export interface Card {
  /** Stable hash of the card's identity text - survives edits to the
   *  answer, to the deck's title and to the card's position. */
  id: string;
  noteIndex: number;
  kind: 'basic' | 'cloze';
  /** What is shown before the flip (a cloze's target is `[...]`). */
  front: string;
  /** What is shown after it (a cloze reads back in full). */
  back: string;
  /** What a typed answer is graded against. */
  answerText: string;
  tags: string[];
  /** 1-based `c<N>` number, cloze cards only. */
  ordinal?: number;
}

/* -------------------------------------------------------- scheduling */

export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';

export type Rating = 1 | 2 | 3 | 4;

export interface CardState {
  state: CardStateName;
  /** Epoch ms. A new card's due time is when it was added. */
  due: number;
  /** Days. Meaningful in `review`; in `relearning` it is the interval
   *  the card returns to when it graduates again. */
  interval: number;
  /** SM-2 ease factor, floored at 1.3. */
  ease: number;
  reps: number;
  lapses: number;
  /** Index into the learning (or relearning) steps. */
  step: number;
  suspended?: boolean;
  /** Epoch ms: hidden until this moment (the start of the next day). */
  buriedUntil?: number;
  marked?: boolean;
  leech?: boolean;
  lastReview?: number;
}

export interface DeckSettings {
  /** Cards introduced per day, per deck. */
  newPerDay: number;
  /** Reviews (not counting learning steps) per day, per deck. */
  reviewsPerDay: number;
  /** Learning steps in minutes, e.g. [1, 10]. */
  learningSteps: number[];
  /** Relearning steps in minutes, e.g. [10]. */
  relearningSteps: number[];
  /** Days given to a card that graduates with Good. */
  graduatingInterval: number;
  /** Days given to a card that graduates with Easy. */
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  hardFactor: number;
  /** A lapse's new interval as a fraction of the old one. */
  lapseFactor: number;
  minimumInterval: number;
  maximumInterval: number;
  /** Scales every review interval (Anki's "interval modifier"). */
  intervalModifier: number;
  /** Spread intervals a little so cards that were answered together do
   *  not come back together. Deterministic, never random at review time. */
  fuzz: boolean;
  /** Lapses before a card is tagged a leech and suspended. */
  leechThreshold: number;
  /** The hour a "day" starts at, in local time. 4 means 4 am. */
  dayCutoffHour: number;
  typedAnswers: boolean;
  order: 'due' | 'random' | 'added';
}

export interface ReviewContext {
  now: number;
  /** Minutes to ADD to UTC for local time (the negation of
   *  `Date.prototype.getTimezoneOffset`). London in summer is +60. */
  tzOffsetMinutes: number;
  cutoffHour: number;
}

export interface ReviewLogEntry {
  /** Card id. */
  id: string;
  /** Epoch ms of the answer. */
  t: number;
  rating: Rating;
  /** The state the card was in when it was answered. */
  from: CardStateName;
  /** Days until the card is next due, after the answer. */
  interval: number;
  /** How long the card was on screen, in ms. */
  ms: number;
}

/** `<deck>.recall.json` - everything the Markdown deliberately does not
 *  carry. Cards are keyed by `Card.id`. */
export interface Sidecar {
  version: number;
  settings: Partial<DeckSettings>;
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
}

/** One rating's projected outcome, for the four grade buttons. */
export interface Projection {
  rating: Rating;
  state: CardStateName;
  /** Epoch ms the card would next be due. */
  due: number;
  /** Days, 0 for a card still inside its learning steps. */
  interval: number;
  /** "10m", "1d", "3.2mo" - what the button shows. */
  label: string;
}

/* ------------------------------------------------------------ extras */

/** A card as the extractor and the importers hand it over, before it is
 *  turned into a note. */
export interface DraftCard {
  question: string;
  answer: string;
  tags?: string[];
}
