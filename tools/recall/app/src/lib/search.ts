// src/lib/search.ts
//
// The card browser's search box. Plain words match the text of a card;
// a few prefixes do the rest, borrowed from the syntax Anki users
// already have in their fingers:
//
//   tag:chapter-3     has that tag (a prefix match, so tag:chap works)
//   is:new is:due is:learning is:review is:suspended is:marked is:leech
//   due<7  due>30     days until the card is next due
//   prop:ease<2.0     ease factor, lapses, interval and reps
//   -word             everything that does NOT match
//   "two words"       an exact phrase
//
// Pure, so the whole language is testable without a table on screen.

import type { Card, CardState, ReviewContext } from './types';
import { dayIndexOf } from './time';

export interface SearchTerm {
  kind: 'text' | 'tag' | 'is' | 'due' | 'prop';
  value: string;
  negated: boolean;
  op?: '<' | '>' | '=' | '<=' | '>=';
  number?: number;
  prop?: 'ease' | 'lapses' | 'interval' | 'reps';
}

const IS_VALUES = new Set(['new', 'learning', 'review', 'relearning', 'due', 'suspended', 'buried', 'marked', 'leech']);
const PROPS = new Set(['ease', 'lapses', 'interval', 'reps']);

/** Splits a query into terms, keeping "quoted phrases" whole. */
export function parseQuery(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (;;) {
    const match = re.exec(query);
    if (!match) break;
    let token = match[1] !== undefined ? match[1] : match[2];
    if (!token) continue;
    let negated = false;
    if (token.startsWith('-') && token.length > 1) {
      negated = true;
      token = token.slice(1);
    }
    const lower = token.toLowerCase();

    if (lower.startsWith('tag:') && token.length > 4) {
      terms.push({ kind: 'tag', value: lower.slice(4), negated });
      continue;
    }
    if (lower.startsWith('is:') && IS_VALUES.has(lower.slice(3))) {
      terms.push({ kind: 'is', value: lower.slice(3), negated });
      continue;
    }
    const due = /^due\s*(<=|>=|<|>|=)\s*(-?\d+)$/.exec(lower);
    if (due) {
      terms.push({ kind: 'due', value: lower, negated, op: due[1] as SearchTerm['op'], number: Number(due[2]) });
      continue;
    }
    const prop = /^prop:(ease|lapses|interval|reps)\s*(<=|>=|<|>|=)\s*(-?[\d.]+)$/.exec(lower);
    if (prop && PROPS.has(prop[1])) {
      terms.push({ kind: 'prop', value: lower, negated, prop: prop[1] as SearchTerm['prop'], op: prop[2] as SearchTerm['op'], number: Number(prop[3]) });
      continue;
    }
    terms.push({ kind: 'text', value: lower, negated });
  }
  return terms;
}

function compare(value: number, op: SearchTerm['op'], target: number): boolean {
  switch (op) {
    case '<':
      return value < target;
    case '<=':
      return value <= target;
    case '>':
      return value > target;
    case '>=':
      return value >= target;
    default:
      return value === target;
  }
}

export interface SearchSubject {
  card: Card;
  state: CardState;
  /** The card's text with the formatting taken out, lower-cased once by
   *  the caller so a search over a big deck does not redo it per term. */
  haystack: string;
}

function matchOne(term: SearchTerm, subject: SearchSubject, ctx: ReviewContext): boolean {
  const { card, state } = subject;
  switch (term.kind) {
    case 'text':
      return subject.haystack.includes(term.value);
    case 'tag':
      return card.tags.some((tag) => tag.toLowerCase().startsWith(term.value));
    case 'is':
      switch (term.value) {
        case 'suspended':
          return state.suspended === true;
        case 'buried':
          return state.buriedUntil !== undefined && state.buriedUntil > ctx.now;
        case 'marked':
          return state.marked === true;
        case 'leech':
          return state.leech === true;
        case 'due':
          return !state.suspended && state.state !== 'new' && dayIndexOf(state.due, ctx) <= dayIndexOf(ctx.now, ctx);
        default:
          return state.state === term.value;
      }
    case 'due': {
      const days = dayIndexOf(state.due, ctx) - dayIndexOf(ctx.now, ctx);
      return state.state !== 'new' && compare(days, term.op, term.number as number);
    }
    case 'prop': {
      const value = term.prop === 'ease' ? state.ease : term.prop === 'lapses' ? state.lapses : term.prop === 'reps' ? state.reps : state.interval;
      return compare(value, term.op, term.number as number);
    }
    default:
      return true;
  }
}

/** Every term has to match (negated ones have to not match) - there is
 *  no `or`, on purpose: nobody has ever wanted one in a card browser
 *  badly enough to justify a parser with precedence in it. */
export function matches(terms: SearchTerm[], subject: SearchSubject, ctx: ReviewContext): boolean {
  for (const term of terms) {
    const hit = matchOne(term, subject, ctx);
    if (term.negated ? hit : !hit) return false;
  }
  return true;
}

export type SortKey = 'position' | 'front' | 'due' | 'interval' | 'ease' | 'lapses' | 'reps' | 'state';

const STATE_ORDER: Record<CardState['state'], number> = { new: 0, learning: 1, relearning: 2, review: 3 };

export function compareCards(a: SearchSubject, b: SearchSubject, key: SortKey, ascending: boolean, position: (card: Card) => number): number {
  let result = 0;
  switch (key) {
    case 'front':
      result = a.card.front.localeCompare(b.card.front);
      break;
    case 'due':
      result = a.state.due - b.state.due;
      break;
    case 'interval':
      result = a.state.interval - b.state.interval;
      break;
    case 'ease':
      result = a.state.ease - b.state.ease;
      break;
    case 'lapses':
      result = a.state.lapses - b.state.lapses;
      break;
    case 'reps':
      result = a.state.reps - b.state.reps;
      break;
    case 'state':
      result = STATE_ORDER[a.state.state] - STATE_ORDER[b.state.state];
      break;
    default:
      result = position(a.card) - position(b.card);
  }
  if (result === 0) result = position(a.card) - position(b.card);
  return ascending ? result : -result;
}
