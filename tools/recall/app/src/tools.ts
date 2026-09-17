// src/tools.ts
//
// Recall's API for agents, and the intents other apps can send it. These
// are the same actions the interface performs - they go through the same
// store, so a card an agent adds appears in an open window immediately,
// and every one of them flushes to disk before it answers, so the agent
// never reports something the filesystem does not yet agree with.
//
// `readOnly` is set honestly: the four tools that only look are marked,
// the two that write are not. Nothing here is destructive - an agent can
// add cards and make decks, but deleting a deck or a card stays a thing
// a person does, because a deck's review history cannot be got back.

import sdk from '@kumin/sdk';
import { useStore, countsFor, ctxFor } from './store';
import type { DeckRecord } from './store';
import { deckDir, ensureDeckDir, flush, askAssistant } from './files';
import { serialiseDeck } from './lib/markdown';
import { doneToday, nextDueAcross } from './lib/deckfile';
import { averageDailyMinutes, breakdown, computeRetention, computeStreak, forecast } from './lib/stats';
import { toTsv } from './lib/tsv';
import { extractCards, mergeDrafts, parseAssistantCards } from './lib/extract';
import { formatDelay } from './lib/time';
import type { DraftCard } from './lib/types';

const PREFIX = 'recall_';

async function ready(): Promise<void> {
  const store = useStore.getState();
  if (!store.ready) await store.init();
  else await store.reloadIfChanged();
}

function records(): DeckRecord[] {
  const state = useStore.getState();
  return state.order.map((name) => state.decks[name]).filter(Boolean);
}

function findDeck(name: string): DeckRecord | null {
  const state = useStore.getState();
  if (state.decks[name]) return state.decks[name];
  const lower = name.trim().toLowerCase();
  const match = state.order.find((deck) => deck.toLowerCase() === lower) ?? state.order.find((deck) => deck.toLowerCase().includes(lower));
  return match ? state.decks[match] : null;
}

function deckNames(): string {
  const names = useStore.getState().order;
  return names.length ? names.map((name) => `"${name}"`).join(', ') : 'none yet';
}

function toDrafts(input: unknown): { cards: DraftCard[]; error: string | null } {
  if (!Array.isArray(input)) return { cards: [], error: 'cards must be an array of { question, answer, tags? } objects.' };
  const cards: DraftCard[] = [];
  for (const raw of input) {
    if (typeof raw === 'string') {
      cards.push({ question: raw, answer: '' });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question : typeof row.front === 'string' ? row.front : typeof row.text === 'string' ? row.text : '';
    const answer = typeof row.answer === 'string' ? row.answer : typeof row.back === 'string' ? row.back : '';
    const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    if (question.trim()) cards.push({ question: question.trim(), answer: answer.trim(), tags });
  }
  if (!cards.length) return { cards: [], error: 'None of those entries had a question in them.' };
  return { cards, error: null };
}

/* ------------------------------------------------------------ tools */

export const tools = [
  {
    name: `${PREFIX}list_decks`,
    description:
      'List every Recall deck with its card counts and how many are due. Decks are Markdown files in the user\'s ~/Recall folder. Use this first to learn the exact deck names the other tools expect.',
    inputSchema: { type: 'object' as const, properties: {} },
    readOnly: true,
    async execute() {
      await ready();
      const now = Date.now();
      const list = records().map((record) => {
        const counts = countsFor(record, now);
        return {
          deck: record.name,
          file: `${deckDir()}/${record.file}`,
          description: record.deck.description.split('\n')[0] || undefined,
          cards: record.cards.length,
          due: counts.due,
          new: counts.new,
          learning: counts.learning,
          review: counts.review,
          suspended: counts.suspended,
          tags: Array.from(new Set(record.cards.flatMap((card) => card.tags))).sort(),
        };
      });
      return { decks: list, folder: deckDir(), total: list.reduce((sum, deck) => sum + deck.cards, 0) };
    },
  },
  {
    name: `${PREFIX}due`,
    description:
      'What is waiting to be studied right now, per deck and in total, plus when the next card comes back if nothing is due. Counts respect each deck\'s daily new-card and review limits.',
    inputSchema: {
      type: 'object' as const,
      properties: { deck: { type: 'string', description: 'Only this deck. Omit for every deck.' } },
    },
    readOnly: true,
    async execute(input: { deck?: string }) {
      await ready();
      const now = Date.now();
      const chosen = input?.deck ? [findDeck(input.deck)].filter(Boolean) as DeckRecord[] : records();
      if (input?.deck && !chosen.length) return `There is no deck called "${input.deck}". Decks: ${deckNames()}.`;
      const rows = chosen.map((record) => {
        const counts = countsFor(record, now);
        return { deck: record.name, due: counts.due, new: counts.new, learning: counts.learning, review: counts.review };
      });
      const states = chosen.flatMap((record) => record.cards.map((card) => record.sidecar.cards[card.id]).filter(Boolean));
      const next = nextDueAcross(states, now);
      const total = rows.reduce((sum, row) => sum + row.due, 0);
      return {
        due: total,
        decks: rows,
        nextDueAt: next && next > now ? new Date(next).toISOString() : null,
        nextDueIn: next && next > now ? formatDelay(next - now) : total ? 'now' : null,
      };
    },
  },
  {
    name: `${PREFIX}add_cards`,
    description:
      'Add cards to a deck. Each card is { question, answer, tags? }; a question containing {{c1::...}} deletions and no answer is added as a cloze card instead. Cards the deck already has are skipped rather than duplicated. Creates the deck if `create` is true.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        deck: { type: 'string', description: 'The deck name, as recall_list_decks reports it.' },
        cards: {
          type: 'array',
          description: 'The cards to add.',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The front of the card, or cloze text with {{c1::deletions}}.' },
              answer: { type: 'string', description: 'The back of the card. Leave empty for a cloze card.' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for this card.' },
            },
            required: ['question'],
          },
        },
        create: { type: 'boolean', description: 'Make the deck if it does not exist yet. Default false.' },
      },
      required: ['deck', 'cards'],
    },
    async execute(input: { deck: string; cards: unknown; create?: boolean }) {
      await ready();
      const { cards, error } = toDrafts(input?.cards);
      if (error) return error;
      let record = findDeck(input.deck);
      if (!record) {
        if (!input.create) return `There is no deck called "${input.deck}". Decks: ${deckNames()}. Pass create: true to make it.`;
        const created = await useStore.getState().createDeck(input.deck);
        record = useStore.getState().decks[created];
      }
      const result = await useStore.getState().addDrafts(record.name, cards);
      await flush();
      return {
        deck: record.name,
        added: result.added,
        skippedAsDuplicates: result.duplicates,
        cardsInDeck: useStore.getState().decks[record.name]?.cards.length ?? 0,
        file: `${deckDir()}/${record.file}`,
      };
    },
  },
  {
    name: `${PREFIX}create_deck_from_text`,
    description:
      'Turn a page of notes into a new deck. Headings with a body, bullet lists with a dash or colon separator, "term: meaning" lines, Q:/A: pairs and existing {{c1::cloze}} text all become cards. With useAssistant: true it also asks the user\'s assistant to draft cards from the same text and merges anything new.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'The deck name. Defaults to the text\'s first "# heading".' },
        text: { type: 'string', description: 'The notes to turn into cards.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to put on every card produced.' },
        useAssistant: { type: 'boolean', description: 'Also ask the assistant to draft cards. Default false.' },
      },
      required: ['text'],
    },
    async execute(input: { title?: string; text: string; tags?: string[]; useAssistant?: boolean }) {
      await ready();
      if (typeof input?.text !== 'string' || input.text.trim().length < 10) return 'Give me some text to work from - at least a sentence or two.';
      const extracted = extractCards(input.text, { tags: input.tags ?? [] });
      let cards = extracted.cards;
      let fromAssistant = 0;
      if (input.useAssistant) {
        const reply = await askAssistant(
          'Turn the following notes into flash cards. Reply with a JSON array of objects with "question" and "answer" keys and nothing else. ' +
            'Keep each answer to one or two sentences.\n\n' +
            input.text.slice(0, 6000)
        );
        if (reply) {
          const drafted = parseAssistantCards(reply);
          const merged = mergeDrafts(cards, drafted);
          fromAssistant = merged.length - cards.length;
          cards = merged;
        }
      }
      if (!cards.length) {
        return 'Nothing in that text looked like a card. Headings with a body, "Term: meaning" lines, bullets with a dash, and Q:/A: pairs all work.';
      }
      const name = (input.title ?? '').trim() || extracted.title || 'New deck';
      const created = await useStore.getState().createDeck(name);
      const result = await useStore.getState().addDrafts(created, cards);
      await flush();
      return {
        deck: created,
        file: `${deckDir()}/${useStore.getState().decks[created]?.file ?? ''}`,
        cardsAdded: result.added,
        fromAssistant: input.useAssistant ? fromAssistant : undefined,
        assistantUnavailable: input.useAssistant && fromAssistant === 0 ? 'the assistant added nothing (it may be unavailable)' : undefined,
      };
    },
  },
  {
    name: `${PREFIX}review_stats`,
    description:
      'How study is going: reviews done, retention (the share of review cards answered correctly), the current and longest streak, the make-up of the collection, and how many cards are due on each of the next seven days.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        deck: { type: 'string', description: 'Only this deck. Omit for every deck.' },
        days: { type: 'number', description: 'How many days back to measure retention over. Default 30.' },
      },
    },
    readOnly: true,
    async execute(input: { deck?: string; days?: number }) {
      await ready();
      const chosen = input?.deck ? ([findDeck(input.deck)].filter(Boolean) as DeckRecord[]) : records();
      if (input?.deck && !chosen.length) return `There is no deck called "${input.deck}". Decks: ${deckNames()}.`;
      if (!chosen.length) return { decks: 0, message: 'There are no decks in ~/Recall yet.' };
      const ctx = ctxFor(chosen[0].settings);
      const log = chosen.flatMap((record) => record.sidecar.log).sort((a, b) => a.t - b.t);
      const states = chosen.flatMap((record) => record.cards.map((card) => record.sidecar.cards[card.id]).filter(Boolean));
      const window = Math.max(1, Math.min(3650, Math.round(input?.days ?? 30)));
      const retention = computeRetention(log, ctx, window);
      const streak = computeStreak(log, ctx);
      const today = chosen.reduce((sum, record) => sum + doneToday(record.sidecar, ctxFor(record.settings)).review, 0);
      return {
        decks: chosen.map((record) => record.name),
        reviewsLogged: log.length,
        reviewsToday: today,
        retention: {
          window: `${window} days`,
          matureCorrect: retention.mature.correct,
          matureTotal: retention.mature.total,
          matureRate: retention.mature.rate === null ? null : Math.round(retention.mature.rate * 100) / 100,
          allRate: retention.all.rate === null ? null : Math.round(retention.all.rate * 100) / 100,
        },
        streak: { current: streak.current, longest: streak.longest, studiedToday: streak.studiedToday },
        minutesPerStudyDay: Math.round(averageDailyMinutes(log, ctx, window) * 10) / 10,
        cards: breakdown(states),
        forecast: forecast(states, ctx, 7).map((day) => ({ date: day.date, due: day.due })),
      };
    },
  },
  {
    name: `${PREFIX}export`,
    description:
      'Return a deck as text: "markdown" gives Recall\'s own format (the file exactly as it is on disk), "tsv" gives tab-separated front/back/tags that Anki imports.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        deck: { type: 'string', description: 'The deck to export.' },
        format: { type: 'string', enum: ['markdown', 'tsv'], description: 'Default markdown.' },
      },
      required: ['deck'],
    },
    readOnly: true,
    async execute(input: { deck: string; format?: string }) {
      await ready();
      const record = findDeck(input?.deck ?? '');
      if (!record) return `There is no deck called "${input?.deck}". Decks: ${deckNames()}.`;
      const format = input.format === 'tsv' ? 'tsv' : 'markdown';
      const text =
        format === 'markdown'
          ? serialiseDeck(record.deck)
          : toTsv(
              record.cards.map((card) => ({
                question: card.kind === 'cloze' ? card.back : card.front,
                answer: card.kind === 'cloze' ? card.answerText : card.back,
                tags: card.tags,
              }))
            );
      return { deck: record.name, format, cards: record.cards.length, text };
    },
  },
];

/* ---------------------------------------------------------- intents */

export const intents = {
  /** kumin://recall/open?deck=Spanish - show a deck in the browser. */
  async open(params?: Record<string, string>) {
    await ready();
    const store = useStore.getState();
    const deck = params?.deck ? findDeck(params.deck) : null;
    if (deck) {
      store.select(deck.name);
      store.setView('browse');
      return { opened: deck.name };
    }
    store.setView('decks');
    return params?.deck ? `There is no deck called "${params.deck}". Showing the deck list instead.` : { opened: 'decks' };
  },

  /** kumin://recall/study?deck=Spanish - start reviewing straight away. */
  async study(params?: Record<string, string>) {
    await ready();
    const store = useStore.getState();
    const names = params?.deck ? [findDeck(params.deck)?.name].filter(Boolean) as string[] : store.order.filter((name) => countsFor(store.decks[name]).due > 0);
    if (!names.length) return params?.deck ? `There is no deck called "${params.deck}".` : 'Nothing is due right now.';
    store.startSession(names);
    return { studying: names, cards: useStore.getState().session?.queue.length ?? 0 };
  },
};

/* ---------------------------------------------------------- install */

/** Makes ~/Recall, so the first thing a new user sees is an app that
 *  already has somewhere to put a deck. Uninstalling deliberately leaves
 *  the folder alone: those files are the user's notes, not the app's
 *  data, and an uninstall that deleted them would be a betrayal. */
export async function onInstall(): Promise<void> {
  try {
    await ensureDeckDir();
    await sdk.notify({ title: 'Recall is ready', body: `Decks live in ${deckDir()} as Markdown files.` });
  } catch {
    // The folder is made again on first load; a failure here is not fatal.
  }
}
