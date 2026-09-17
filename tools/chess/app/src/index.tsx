// src/index.tsx
//
// Chess for NextOS: the window, and the tools an agent can call.
//
// The rules, the search, the book and the notation all live under
// src/lib/ and know nothing about React; this file is the part that
// draws them. The game itself lives in src/store.ts rather than in
// React state, because the agent tools this module exports are live
// whether or not a window is open and both have to see the same game.
//
// The three effects worth knowing about:
//
//   * the engine's turn - runs whenever the live position is the
//     engine's to move, in its own Worker;
//   * the analysis - a second Worker, so switching on the evaluation bar
//     never slows the engine down or gets cancelled by it;
//   * the clock - one 100ms tick that only runs while a clock is
//     running, and reads the truth from the timestamp rather than
//     counting intervals.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import sdk from '@kumin/sdk';
import './styles.css';

import type { Color, Move, Position } from './lib/types';
import { BLACK, WHITE, moveFrom, moveTo, parseSquare, squareName } from './lib/types';
import { isCapture, isCastle } from './lib/types';
import { clonePosition, inCheck, makeMove } from './lib/board';
import { fromFen, parseFen, toAscii, toFen } from './lib/fen';
import { generateLegalMoves } from './lib/moves';
import { parseSan, toSan, toUci } from './lib/san';
import { describeStatus, gameStatus } from './lib/rules';
import type { GameStatus, Result } from './lib/rules';
import {
  addMove,
  createTree,
  mainLine,
  mainLineEnd,
  moveNumberFor,
  pathTo,
  positionAt,
  truncateAfter,
} from './lib/game';
import type { GameTree } from './lib/game';
import { mainLineSan, parsePgn, printPgn } from './lib/pgn';
import { nameOpening, openingLabel } from './lib/openings';
import { LEVELS, levelFor, search } from './lib/engine';
import { runEngineWorker } from './lib/engine';
import type { Judgement, GameReport, MoveQuality, Puzzle } from './lib/analysis';
import { buildReport, describeReport, findPuzzles, formatScore } from './lib/analysis';
import { materialBalance } from './lib/evaluate';
import type { ClockState } from './lib/clock';
import { clockAt, createClock, formatClock, hasFlagged, pressClock, startClock, stopClock } from './lib/clock';
import { resultOnFlag } from './lib/rules';

import { EngineClient } from './engineClient';
import type { EngineUpdate } from './engineClient';
import { playSound, soundForMove, disposeSound } from './sound';
import {
  copyText,
  deleteGame,
  listGames,
  readGame,
  readOwnBundle,
  saveGame,
  todayTag,
} from './files';
import type { GameFile } from './files';
import * as store from './store';
import type { Settings } from './store';

import { Board, PROMOTION_CHOICE } from './ui/Board';
import type { BoardArrow } from './ui/Board';
import { BOARD_THEMES, paletteFor } from './ui/themes';
import { PIECE_SETS } from './ui/pieces';
import { Icons } from './ui/icons';
import { MoveList } from './ui/MoveList';
import { CapturedRow, ClockRow, EngineInfo, EvalBar, ReportPanel, formatPv, moveLabel } from './ui/panels';
import { ImportDialog, NewGameDialog, PromotionDialog, ShortcutsOverlay } from './ui/dialogs';
import type { GameMode, NewGameSettings } from './ui/dialogs';

type Tab = 'moves' | 'report' | 'games' | 'puzzles';

interface PuzzleSession {
  puzzle: Puzzle;
  tree: GameTree;
  nodeId: number;
  state: 'unsolved' | 'solved' | 'wrong';
  revision: number;
  index: number;
}

const START_PIECES = [1, 2, 3, 4, 5, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4];

export default function ChessApp(): JSX.Element {
  const isDark = sdk.theme.useIsDark();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // --- state ---------------------------------------------------------
  const [game, setGame] = useState(store.getState);
  const [settings, setSettings] = useState<Settings>(store.loadSettings);
  const [tab, setTab] = useState<Tab>('moves');
  const [dialog, setDialog] = useState<'new' | 'keys' | 'import' | null>(null);
  const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [playInfo, setPlayInfo] = useState<EngineUpdate | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<EngineUpdate | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [games, setGames] = useState<GameFile[]>([]);
  const [report, setReport] = useState<GameReport | null>(null);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [moveText, setMoveText] = useState('');
  const [moveError, setMoveError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [ended, setEnded] = useState<{ result: Result; reason: string } | null>(null);
  const [engineWhere, setEngineWhere] = useState<'worker' | 'main' | null>(null);

  const moveBoxRef = useRef<HTMLInputElement | null>(null);
  const playEngine = useRef<EngineClient | null>(null);
  const analysisEngine = useRef<EngineClient | null>(null);
  // The whole-game report gets a worker of its own: it runs dozens of
  // searches back to back, and sharing a client with the live analysis
  // would have each cancelling the other every time the board moved.
  const reportEngine = useRef<EngineClient | null>(null);
  const thinkingRef = useRef(false);
  const savedGameRef = useRef<string>('');

  if (!playEngine.current) playEngine.current = new EngineClient(readOwnBundle);
  if (!analysisEngine.current) analysisEngine.current = new EngineClient(readOwnBundle);
  if (!reportEngine.current) reportEngine.current = new EngineClient(readOwnBundle);

  // --- store wiring ---------------------------------------------------
  useEffect(() => {
    store.ensureRestored();
    setGame(store.getState());
    return store.subscribe(() => setGame(store.getState()));
  }, []);

  useEffect(() => {
    store.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    void listGames().then(setGames);
  }, []);

  useEffect(() => {
    const flush = (): void => store.persistNow();
    window.addEventListener('blur', flush);
    return () => {
      window.removeEventListener('blur', flush);
      store.persistNow();
      playEngine.current?.dispose();
      analysisEngine.current?.dispose();
      reportEngine.current?.dispose();
      disposeSound();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- derived --------------------------------------------------------
  const tree = session ? session.tree : game.tree;
  const nodeId = session ? session.nodeId : game.nodeId;
  const revision = session ? session.revision : game.revision;

  const position = useMemo<Position>(() => positionAt(tree, nodeId), [tree, nodeId, revision]);
  const status = useMemo<GameStatus>(() => gameStatus(position), [position]);
  const legal = useMemo<Move[]>(() => generateLegalMoves(position), [position]);
  const liveEnd = useMemo(() => mainLineEnd(game.tree), [game.tree, game.revision]);
  const atLiveEnd = !session && nodeId === liveEnd;
  const sanSoFar = useMemo(() => mainLineSan(tree), [tree, revision]);
  const opening = useMemo(() => nameOpening(sanSoFar.slice(0, tree.nodes[nodeId]?.ply ?? 0)), [sanSoFar, nodeId, tree, revision]);
  const lastMove = nodeId > 0 ? tree.nodes[nodeId].move : null;
  const checkSquare = status.inCheck ? position.kings[position.turn] : -1;

  const engineToMove =
    !session &&
    atLiveEnd &&
    !status.over &&
    !ended &&
    (game.mode === 'engine-engine' || (game.mode === 'human-engine' && position.turn !== game.humanColor));

  const interactive = !ended && !status.over && !(engineToMove && atLiveEnd);
  const boardMoves = interactive ? legal : [];

  const quality = useMemo(() => {
    const map = new Map<number, MoveQuality>();
    if (report) for (const move of report.moves) map.set(move.nodeId, move.quality);
    return map;
  }, [report]);

  // Captured material, by difference from a full set.
  const captured = useMemo(() => countCaptured(position), [position]);
  const balance = useMemo(() => materialBalance(position), [position]);

  const analysisLine = useMemo(() => {
    if (!analysisInfo) return { san: [] as string[], moves: [] as Move[] };
    return uciLine(position, analysisInfo.pv);
  }, [analysisInfo, position]);

  const playLineSan = useMemo(() => {
    if (!playInfo) return { san: [] as string[], moves: [] as Move[] };
    return uciLine(position, playInfo.pv);
  }, [playInfo, position]);

  const shownInfo = settings.analysis && !thinking ? analysisInfo : playInfo ?? analysisInfo;
  const shownLine = settings.analysis && !thinking ? analysisLine : playLineSan.san.length ? playLineSan : analysisLine;

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!settings.analysis || !analysisInfo?.bestMove || session) return [];
    const from = parseSquare(analysisInfo.bestMove.slice(0, 2));
    const to = parseSquare(analysisInfo.bestMove.slice(2, 4));
    if (from < 0 || to < 0) return [];
    return [{ from, to }];
  }, [analysisInfo, settings.analysis, session]);

  const palette = paletteFor(settings.boardTheme, isDark);
  const level = levelFor(game.level);
  const numbering = nodeId > 0 ? moveNumberFor(tree, nodeId) : { number: 1, black: true };
  const pvStartNumber = numbering.black ? numbering.number + 1 : numbering.number;

  // --- playing a move --------------------------------------------------

  const finishIfOver = useCallback(
    (next: Position, after: GameTree, newNode: number): boolean => {
      const s = gameStatus(next);
      if (!s.over) return false;
      after.result = s.result;
      setEnded({ result: s.result, reason: s.reason ?? 'unknown' });
      void autoSave(after, s.result);
      return true;
    },
    []
  );

  const autoSave = useCallback(async (finished: GameTree, result: Result): Promise<void> => {
    const signature = `${finished.tags.Date}|${mainLineSan(finished).join(' ')}`;
    if (savedGameRef.current === signature) return;
    savedGameRef.current = signature;
    finished.result = result;
    const path = await saveGame(printPgn(finished), finished.tags);
    if (path) {
      setGames(await listGames());
      setToast(`Saved to ${path.split('/').slice(-2).join('/')}`);
    }
  }, []);

  const commitMove = useCallback(
    (move: Move, options: { silent?: boolean } = {}): void => {
      if (session) {
        // Puzzle mode: the only question is whether this was the move.
        const expected = session.puzzle.solution[0];
        const before = positionAt(session.tree, session.nodeId);
        const san = toSan(before, move);
        const correct = san === expected;
        const child = addMove(session.tree, session.nodeId, move, before);
        const after = positionAt(session.tree, child);
        playSound(correct ? 'check' : 'capture', settings.sound);
        setSession({
          ...session,
          nodeId: child,
          state: correct ? 'solved' : 'wrong',
          revision: session.revision + 1,
        });
        void after;
        return;
      }

      const from = positionAt(tree, nodeId);
      const capture = isCapture(move);
      const castle = isCastle(move);
      const child = addMove(tree, nodeId, move, from);
      const after = positionAt(tree, child);
      const wasLive = nodeId === mainLineEnd(game.tree) || tree.nodes[tree.nodes[child].parent].children[0] === child;
      const nextStatus = gameStatus(after);
      if (!options.silent) {
        playSound(
          soundForMove({ capture, castle, check: nextStatus.inCheck, gameOver: nextStatus.over }),
          settings.sound
        );
      }
      store.update({ nodeId: child });
      if (wasLive && clock) {
        setClock((current) => (current ? pressClock(current, from.turn, Date.now()) : current));
      }
      if (wasLive) finishIfOver(after, tree, child);
    },
    [clock, finishIfOver, game.tree, nodeId, session, settings.sound, tree]
  );

  const onBoardMove = useCallback(
    (raw: Move): void => {
      if (raw & PROMOTION_CHOICE) {
        setPromotion({ from: moveFrom(raw), to: moveTo(raw) });
        return;
      }
      commitMove(raw);
    },
    [commitMove]
  );

  const choosePromotion = useCallback(
    (pieceType: number): void => {
      if (!promotion) return;
      const move = legal.find(
        (m) => moveFrom(m) === promotion.from && moveTo(m) === promotion.to && ((m >> 16) & 7) === pieceType
      );
      setPromotion(null);
      if (move !== undefined) commitMove(move);
    },
    [commitMove, legal, promotion]
  );

  // --- the engine's turn ------------------------------------------------
  useEffect(() => {
    if (!engineToMove || dialog || promotion) return;
    const engine = playEngine.current;
    if (!engine || thinkingRef.current) return;
    let cancelled = false;
    thinkingRef.current = true;
    setThinking(true);
    setPlayInfo(null);
    const useBook = mainLine(game.tree).length < 16 && game.level < 8;
    const current = positionAt(game.tree, game.nodeId);
    void engine
      .think({
        position: current,
        tree: game.tree,
        nodeId: game.nodeId,
        options: { level: game.level, useBook },
        onInfo: (update) => {
          if (!cancelled) {
            setPlayInfo(update);
            setEngineWhere(update.where);
          }
        },
      })
      .then((update) => {
        thinkingRef.current = false;
        if (cancelled) return;
        setThinking(false);
        setPlayInfo(update);
        if (!update.bestMove) return;
        const move = parseSan(current, update.bestMove);
        if (move === null) return;
        commitMove(move);
      });
    return () => {
      cancelled = true;
      thinkingRef.current = false;
      engine.stop();
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineToMove, game.revision, game.level, dialog, promotion]);

  // --- background analysis ----------------------------------------------
  useEffect(() => {
    if (!settings.analysis) {
      setAnalysisInfo(null);
      return;
    }
    const engine = analysisEngine.current;
    if (!engine) return;
    let cancelled = false;
    const target = position;
    void engine
      .think({
        position: target,
        tree: session ? undefined : game.tree,
        nodeId: session ? undefined : nodeId,
        options: { level: 8, depth: 18, movetimeMs: 900 },
        onInfo: (update) => {
          if (!cancelled) {
            setAnalysisInfo(update);
            setEngineWhere(update.where);
          }
        },
      })
      .then((update) => {
        if (!cancelled && update.bestMove) setAnalysisInfo(update);
      });
    return () => {
      cancelled = true;
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.analysis, revision, nodeId, session !== null]);

  // --- the clock ---------------------------------------------------------
  useEffect(() => {
    if (!clock || clock.running === null || clock.flagged !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    if (!clock || clock.flagged !== null || ended) return;
    const flagged = (['0', '1'] as const).map((_, i) => i as Color).find((c) => hasFlagged(clock, c, now));
    if (flagged === undefined) return;
    const outcome = resultOnFlag(position, flagged);
    setClock(stopClock({ ...clock, flagged }, now));
    game.tree.result = outcome.result;
    setEnded({ result: outcome.result, reason: outcome.reason });
    playSound('end', settings.sound);
    void autoSave(game.tree, outcome.result);
  }, [autoSave, clock, ended, game.tree, now, position, settings.sound]);

  // --- autoplay -----------------------------------------------------------
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      const children = tree.nodes[nodeId]?.children ?? [];
      if (!children.length) {
        setAutoplay(false);
        return;
      }
      goTo(children[0]);
    }, 750);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, nodeId, revision]);

  // --- navigation ----------------------------------------------------------
  const goTo = useCallback(
    (id: number): void => {
      if (session) setSession({ ...session, nodeId: id, revision: session.revision + 1 });
      else store.update({ nodeId: id }, { persist: false });
    },
    [session]
  );

  const stepBack = useCallback((): void => {
    const parent = tree.nodes[nodeId]?.parent ?? -1;
    if (parent >= 0) goTo(parent);
  }, [goTo, nodeId, tree]);

  const stepForward = useCallback((): void => {
    const children = tree.nodes[nodeId]?.children ?? [];
    if (children.length) goTo(children[0]);
  }, [goTo, nodeId, tree]);

  const goStart = useCallback(() => goTo(0), [goTo]);
  const goEnd = useCallback(() => goTo(mainLineEnd(tree)), [goTo, tree]);

  const takeBack = useCallback((): void => {
    if (session) return;
    const last = mainLineEnd(game.tree);
    if (last === 0) return;
    // In a game against the engine, take back a full move so it is your
    // turn again rather than the engine's.
    let target = game.tree.nodes[last].parent;
    if (game.mode === 'human-engine' && target > 0) {
      const beforeThat = game.tree.nodes[target].parent;
      const at = positionAt(game.tree, target);
      if (at.turn !== game.humanColor && beforeThat >= 0) target = beforeThat;
    }
    truncateAfter(game.tree, target);
    setEnded(null);
    store.update({ nodeId: target });
  }, [game.humanColor, game.mode, game.tree, session]);

  // --- new game, import, save ------------------------------------------------
  const startGame = useCallback(
    (options: NewGameSettings): void => {
      playEngine.current?.stop();
      analysisEngine.current?.stop();
      setSession(null);
      setReport(null);
      setPuzzles([]);
      setEnded(null);
      setPlayInfo(null);
      setAnalysisInfo(null);
      savedGameRef.current = '';
      const parsed = options.startFen ? parseFen(options.startFen) : null;
      if (options.startFen && parsed && !parsed.ok) {
        setToast(`That FEN did not parse: ${parsed.error}`);
        return;
      }
      store.newGame({
        mode: options.mode,
        humanColor: options.humanColor,
        level: options.level,
        timeControl: options.timeControl,
        startFen: options.startFen || undefined,
      });
      setSettings((s) => ({ ...s, mode: options.mode, humanColor: options.humanColor, level: options.level }));
      setClock(options.timeControl ? startClock(createClock(options.timeControl, Date.now()), WHITE, Date.now()) : null);
      setDialog(null);
      setTab('moves');
    },
    []
  );

  const importPgn = useCallback(
    (text: string): string | null => {
      const { games: loaded, problems } = parsePgn(text);
      if (!loaded.length) return problems[0] ?? 'No game was found in that text.';
      playEngine.current?.stop();
      setSession(null);
      setReport(null);
      setPuzzles([]);
      setEnded(null);
      setClock(null);
      savedGameRef.current = '';
      store.loadTree(loaded[0]);
      store.update({ mode: 'human-human' });
      setDialog(null);
      setTab('moves');
      setToast(problems.length ? `Imported with ${problems.length} problem(s): ${problems[0]}` : 'Game imported.');
      return null;
    },
    []
  );

  const saveNow = useCallback(async (): Promise<void> => {
    const path = await saveGame(store.currentPgn(), game.tree.tags);
    if (path) {
      setGames(await listGames());
      setToast(`Saved to ${path.split('/').slice(-2).join('/')}`);
    } else {
      setToast('Could not write the file - the app may not have permission to your home folder.');
    }
  }, [game.tree.tags]);

  const copyPgn = useCallback(async (): Promise<void> => {
    setToast((await copyText(store.currentPgn())) ? 'PGN copied.' : 'Could not reach the clipboard.');
  }, []);

  const copyFen = useCallback(async (): Promise<void> => {
    setToast((await copyText(toFen(position))) ? 'FEN copied.' : 'Could not reach the clipboard.');
  }, [position]);

  // --- whole-game analysis -------------------------------------------------
  const analyseGame = useCallback(async (): Promise<void> => {
    const engine = reportEngine.current;
    const line = mainLine(game.tree);
    if (!engine || !line.length) {
      setToast('There are no moves to analyse yet.');
      return;
    }
    setTab('report');
    setProgress({ done: 0, total: line.length + 1 });
    const judgements: Judgement[] = [];
    const nodes = [0, ...line];
    for (let i = 0; i < nodes.length; i++) {
      const at = positionAt(game.tree, nodes[i]);
      const update = await engine.think({
        position: at,
        tree: game.tree,
        nodeId: nodes[i],
        options: { level: 8, depth: 12, movetimeMs: 320 },
      });
      judgements.push({ score: update.score, mate: update.mate, pv: uciLine(at, update.pv).moves });
      setProgress({ done: i + 1, total: nodes.length });
    }
    const built = buildReport(game.tree, judgements);
    setReport(built);
    setPuzzles(findPuzzles(game.tree, built));
    setProgress(null);
  }, [game.tree]);

  const startPuzzle = useCallback(
    (index: number): void => {
      const puzzle = puzzles[index];
      if (!puzzle) return;
      const parsed = parseFen(puzzle.fen);
      if (!parsed.ok) return;
      const tree2 = createTree(puzzle.fen, {
        Event: 'Puzzle from your game',
        White: game.tree.tags.White ?? 'White',
        Black: game.tree.tags.Black ?? 'Black',
      });
      setSession({ puzzle, tree: tree2, nodeId: 0, state: 'unsolved', revision: 0, index });
      setSettings((s) => ({ ...s, flipped: puzzle.color === BLACK }));
      setTab('puzzles');
    },
    [game.tree.tags, puzzles]
  );

  // --- keyboard -------------------------------------------------------------
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === 'Escape') {
        if (promotion) setPromotion(null);
        else if (dialog) setDialog(null);
        else if (session) setSession(null);
        else if (typing) (target as HTMLInputElement).blur();
        return;
      }
      if (typing) return;
      if (promotion) {
        const map: Record<string, number> = { q: 5, r: 4, b: 3, n: 2 };
        const piece = map[event.key.toLowerCase()];
        if (piece) {
          event.preventDefault();
          choosePromotion(piece);
        }
        return;
      }
      if (dialog) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveNow();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copyPgn();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          stepBack();
          break;
        case 'ArrowRight':
          event.preventDefault();
          stepForward();
          break;
        case 'Home':
          event.preventDefault();
          goStart();
          break;
        case 'End':
          event.preventDefault();
          goEnd();
          break;
        case ' ':
          event.preventDefault();
          setAutoplay((a) => !a);
          break;
        case '?':
          event.preventDefault();
          setDialog('keys');
          break;
        case '/':
          event.preventDefault();
          moveBoxRef.current?.focus();
          break;
        default:
          break;
      }
      switch (event.key.toLowerCase()) {
        case 'f':
          setSettings((s) => ({ ...s, flipped: !s.flipped }));
          break;
        case 'n':
          setDialog('new');
          break;
        case 't':
          takeBack();
          break;
        case 'a':
          setSettings((s) => ({ ...s, analysis: !s.analysis }));
          break;
        case 's':
          setSettings((s) => ({ ...s, sound: !s.sound }));
          break;
        case 'c':
          setSettings((s) => ({ ...s, coordinates: !s.coordinates }));
          break;
        case 'm':
          event.preventDefault();
          moveBoxRef.current?.focus();
          break;
        case 'p':
          setSettings((s) => ({ ...s, pieceSet: s.pieceSet === 'classic' ? 'line' : 'classic' }));
          break;
        case 'b':
          setSettings((s) => {
            const index = BOARD_THEMES.findIndex((t) => t.id === s.boardTheme);
            return { ...s, boardTheme: BOARD_THEMES[(index + 1) % BOARD_THEMES.length].id };
          });
          break;
        case 'r':
          void analyseGame();
          break;
        case 'e':
          if (!thinking && !status.over) void forceEngineMove();
          break;
        default:
          break;
      }
      if (/^[1-8]$/.test(event.key)) {
        const chosen = Number(event.key);
        store.update({ level: chosen });
        setSettings((s) => ({ ...s, level: chosen }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyseGame, choosePromotion, copyPgn, dialog, goEnd, goStart, promotion, saveNow, session, status.over, stepBack, stepForward, takeBack, thinking]
  );

  const forceEngineMove = useCallback(async (): Promise<void> => {
    const engine = playEngine.current;
    if (!engine || status.over) return;
    setThinking(true);
    const update = await engine.think({
      position,
      tree: session ? undefined : tree,
      nodeId: session ? undefined : nodeId,
      options: { level: game.level },
      onInfo: setPlayInfo,
    });
    setThinking(false);
    if (!update.bestMove) return;
    const move = parseSan(position, update.bestMove);
    if (move !== null) commitMove(move);
  }, [commitMove, game.level, nodeId, position, session, status.over, tree]);

  const submitMoveText = useCallback((): void => {
    const move = parseSan(position, moveText);
    if (move === null) {
      setMoveError(true);
      return;
    }
    setMoveError(false);
    setMoveText('');
    commitMove(move);
  }, [commitMove, moveText, position]);

  // --- render -----------------------------------------------------------------
  const statusText = ended
    ? describeEnded(ended, game.tree)
    : session
      ? describePuzzle(session)
      : describeStatus(status, position);

  const whiteName = game.tree.tags.White ?? 'White';
  const blackName = game.tree.tags.Black ?? 'Black';

  return (
    <div
      ref={rootRef}
      className={`chessapp${isDark ? ' dark' : ''}`}
      onKeyDown={onKeyDown}
      data-testid="chess-root"
    >
      <div className="chessapp-bar">
        <button type="button" className="chessapp-btn is-primary" onClick={() => setDialog('new')} title="New game (N)">
          <Icons.plus />
          New game
        </button>
        <button type="button" className="chessapp-btn" onClick={takeBack} disabled={!!session || liveEnd === 0} title="Take back (T)">
          <Icons.undo />
          Take back
        </button>
        <span className="chessapp-label">Level</span>
        <select
          className="chessapp-select"
          value={game.level}
          aria-label="Engine strength"
          onChange={(event) => {
            const value = Number(event.target.value);
            store.update({ level: value });
            setSettings((s) => ({ ...s, level: value }));
          }}
        >
          {LEVELS.map((entry) => (
            <option key={entry.level} value={entry.level}>
              {entry.level} · {entry.name}
            </option>
          ))}
        </select>
        <span className="chessapp-bar-spacer" />
        <button
          type="button"
          className={`chessapp-btn${settings.analysis ? ' is-on' : ''}`}
          aria-pressed={settings.analysis}
          onClick={() => setSettings((s) => ({ ...s, analysis: !s.analysis }))}
          title="Engine analysis (A)"
        >
          <Icons.brain />
          Analysis
        </button>
        <button
          type="button"
          className="chessapp-btn is-icon"
          onClick={() => setSettings((s) => ({ ...s, flipped: !s.flipped }))}
          title="Flip the board (F)"
          aria-label="Flip the board"
        >
          <Icons.flip />
        </button>
        <button
          type="button"
          className={`chessapp-btn is-icon${settings.sound ? '' : ' is-on'}`}
          onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
          title={settings.sound ? 'Sound on (S)' : 'Sound off (S)'}
          aria-label={settings.sound ? 'Turn the sound off' : 'Turn the sound on'}
          aria-pressed={!settings.sound}
        >
          {settings.sound ? <Icons.sound /> : <Icons.mute />}
        </button>
        <select
          className="chessapp-select"
          value={settings.boardTheme}
          aria-label="Board theme"
          onChange={(event) => setSettings((s) => ({ ...s, boardTheme: event.target.value as Settings['boardTheme'] }))}
        >
          {BOARD_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
        <select
          className="chessapp-select"
          value={settings.pieceSet}
          aria-label="Piece set"
          onChange={(event) => setSettings((s) => ({ ...s, pieceSet: event.target.value as Settings['pieceSet'] }))}
        >
          {PIECE_SETS.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="chessapp-btn is-icon"
          onClick={() => setDialog('keys')}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Icons.question />
        </button>
      </div>

      <div className="chessapp-body">
        <div className="chessapp-left">
          <div className="chessapp-board-stack">
            <div className="chessapp-players">
              <span className="chessapp-playername">
                <span className="chessapp-swatch" style={{ background: settings.flipped ? '#f4f2ee' : '#26232b' }} />
                {settings.flipped ? whiteName : blackName}
              </span>
              <CapturedRow
                captured={settings.flipped ? captured.byWhite : captured.byBlack}
                advantage={settings.flipped ? Math.max(0, balance) : Math.max(0, -balance)}
                set={settings.pieceSet}
              />
            </div>
            <div className="chessapp-board-row">
              <EvalBar
                score={evalForWhite(shownInfo, position)}
                mate={mateForWhite(shownInfo, position)}
                flipped={settings.flipped}
                active={Boolean(shownInfo) && settings.analysis}
                result={status.over ? status.result : ended?.result ?? null}
              />
              <Board
              position={position}
              flipped={settings.flipped}
              legalMoves={boardMoves}
              onMove={onBoardMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              arrows={arrows}
              palette={palette}
              pieceSet={settings.pieceSet}
              showCoordinates={settings.coordinates}
              describedBy="chessapp-status-text"
              />
            </div>
            <div className="chessapp-players">
              <span className="chessapp-playername">
                <span className="chessapp-swatch" style={{ background: settings.flipped ? '#26232b' : '#f4f2ee' }} />
                {settings.flipped ? blackName : whiteName}
              </span>
              <CapturedRow
                captured={settings.flipped ? captured.byBlack : captured.byWhite}
                advantage={settings.flipped ? Math.max(0, -balance) : Math.max(0, balance)}
                set={settings.pieceSet}
              />
            </div>
            <div className="chessapp-row" style={{ width: '100%', justifyContent: 'center', gap: 4 }}>
              <button type="button" className="chessapp-btn is-icon" onClick={goStart} title="Start (Home)" aria-label="Go to the start">
                <Icons.first />
              </button>
              <button type="button" className="chessapp-btn is-icon" onClick={stepBack} title="Back (←)" aria-label="One move back">
                <Icons.previous />
              </button>
              <button
                type="button"
                className={`chessapp-btn is-icon${autoplay ? ' is-on' : ''}`}
                onClick={() => setAutoplay((a) => !a)}
                title="Play through the game (Space)"
                aria-label={autoplay ? 'Stop playing through' : 'Play through the game'}
              >
                {autoplay ? <Icons.pause /> : <Icons.play />}
              </button>
              <button type="button" className="chessapp-btn is-icon" onClick={stepForward} title="Forward (→)" aria-label="One move forward">
                <Icons.next />
              </button>
              <button type="button" className="chessapp-btn is-icon" onClick={goEnd} title="End (End)" aria-label="Go to the end">
                <Icons.last />
              </button>
            </div>
          </div>
        </div>

        <div className="chessapp-panel">
          <div className="chessapp-tabs" role="tablist" aria-label="Panel">
            {(
              [
                ['moves', 'Moves'],
                ['report', 'Report'],
                ['games', 'Games'],
                ['puzzles', 'Puzzles'],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="chessapp-tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'puzzles' && puzzles.length ? ` (${puzzles.length})` : ''}
              </button>
            ))}
          </div>

          <div className="chessapp-tabpanel" role="tabpanel">
            {clock ? (
              <div className="chessapp-section">
                <ClockRow
                  clock={clock}
                  now={now}
                  color={settings.flipped ? WHITE : BLACK}
                  name={settings.flipped ? whiteName : blackName}
                  running={clock.running === (settings.flipped ? WHITE : BLACK)}
                />
                <ClockRow
                  clock={clock}
                  now={now}
                  color={settings.flipped ? BLACK : WHITE}
                  name={settings.flipped ? blackName : whiteName}
                  running={clock.running === (settings.flipped ? BLACK : WHITE)}
                />
              </div>
            ) : null}

            {opening ? (
              <div className="chessapp-section">
                <h3 className="chessapp-section-title">Opening</h3>
                <div className="chessapp-row">
                  <span className="chessapp-strong">{opening.name}</span>
                  <span className="chessapp-kv">{opening.eco}</span>
                </div>
              </div>
            ) : null}

            {settings.analysis || thinking || playInfo ? (
              <EngineInfo
                update={shownInfo}
                thinking={thinking}
                pvSan={shownLine.san}
                firstMoveNumber={pvStartNumber}
                firstIsBlack={position.turn === BLACK}
                levelName={settings.analysis && !thinking ? 'Analysis' : `Level ${game.level} · ${level.name}`}
                note={playEngine.current?.lastError ?? null}
              />
            ) : null}

            {tab === 'moves' ? (
              <>
                <div className="chessapp-scroll">
                  <MoveList
                    tree={tree}
                    currentNode={nodeId}
                    onSelect={goTo}
                    quality={quality}
                    showVariations={settings.analysis || !!report}
                  />
                </div>
                <div className="chessapp-section" style={{ borderBottom: 0, borderTop: '1px solid var(--line)' }}>
                  <div className="chessapp-row" style={{ gap: 6 }}>
                    <input
                      ref={moveBoxRef}
                      className={`chessapp-input${moveError ? ' is-error' : ''}`}
                      value={moveText}
                      placeholder="Type a move: Nf3, exd5, O-O, e2e4"
                      aria-label="Type a move in algebraic notation"
                      aria-invalid={moveError}
                      onChange={(event) => {
                        setMoveText(event.target.value);
                        setMoveError(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitMoveText();
                        }
                      }}
                    />
                    <button type="button" className="chessapp-btn" onClick={submitMoveText} disabled={!moveText.trim()}>
                      Play
                    </button>
                  </div>
                  {moveError ? (
                    <p className="chessapp-error">
                      {moveText} is not a legal move here. {legal.length} moves are: {legalSample(position, legal)}
                    </p>
                  ) : null}
                  <div className="chessapp-row" style={{ marginTop: 8, gap: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    <button type="button" className="chessapp-btn" onClick={() => void saveNow()} title="Save as PGN (Ctrl/⌘ S)">
                      <Icons.save />
                      Save
                    </button>
                    <button type="button" className="chessapp-btn" onClick={() => void copyPgn()} title="Copy PGN (Ctrl/⌘ C)">
                      <Icons.copy />
                      PGN
                    </button>
                    <button type="button" className="chessapp-btn" onClick={() => void copyFen()}>
                      <Icons.copy />
                      FEN
                    </button>
                    <button type="button" className="chessapp-btn" onClick={() => setDialog('import')}>
                      <Icons.folder />
                      Import
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'report' ? (
              <ReportPanel
                report={report}
                summaryWhite={report ? describeReport(report, WHITE, game.tree.result) : ''}
                summaryBlack={report ? describeReport(report, BLACK, game.tree.result) : ''}
                onSelectMove={(id) => {
                  setSession(null);
                  goTo(id);
                }}
                progress={progress}
                onAnalyse={() => void analyseGame()}
              />
            ) : null}

            {tab === 'games' ? (
              <GamesPanel
                games={games}
                onOpen={async (file) => {
                  const text = await readGame(file.path);
                  if (!text) {
                    setToast('That file could not be read.');
                    return;
                  }
                  importPgn(text);
                }}
                onDelete={async (file) => {
                  if (await deleteGame(file.path)) {
                    setGames(await listGames());
                    setToast('Game deleted.');
                  }
                }}
                onRefresh={async () => setGames(await listGames())}
                onImport={() => setDialog('import')}
              />
            ) : null}

            {tab === 'puzzles' ? (
              <PuzzlePanel
                puzzles={puzzles}
                session={session}
                onStart={startPuzzle}
                onExit={() => setSession(null)}
                onReveal={() => session && setSession({ ...session, state: 'solved', revision: session.revision + 1 })}
                onAnalyse={() => void analyseGame()}
                hasReport={!!report}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="chessapp-status">
        <span id="chessapp-status-text">
          <b>{statusText}</b>
        </span>
        {opening && !session ? <span>{opening.eco} {opening.name}</span> : null}
        {clock ? <span className="chessapp-mono">{formatClock(clockAt(clock, now)[WHITE])} / {formatClock(clockAt(clock, now)[BLACK])}</span> : null}
        <span className="chessapp-saved">
          {toast ?? (engineWhere === null ? 'Engine idle' : engineWhere === 'worker' ? 'Engine in a worker' : 'Engine on the main thread')}
        </span>
      </div>

      {dialog === 'new' ? (
        <NewGameDialog
          initial={{
            mode: game.mode as GameMode,
            humanColor: game.humanColor,
            level: game.level,
            timeControl: game.timeControl,
            startFen: '',
          }}
          onStart={startGame}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'keys' ? <ShortcutsOverlay onClose={() => setDialog(null)} /> : null}
      {dialog === 'import' ? <ImportDialog onImport={importPgn} onClose={() => setDialog(null)} /> : null}
      {promotion ? (
        <PromotionDialog
          color={position.turn}
          set={settings.pieceSet}
          onChoose={choosePromotion}
          onCancel={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Panels that need the window's own types
// ---------------------------------------------------------------------

function GamesPanel(props: {
  games: GameFile[];
  onOpen: (file: GameFile) => void;
  onDelete: (file: GameFile) => void;
  onRefresh: () => void;
  onImport: () => void;
}): JSX.Element {
  if (!props.games.length) {
    return (
      <div className="chessapp-empty">
        <Icons.folder size={22} />
        <h3>No saved games yet</h3>
        <p>
          A game is written to <span className="chessapp-mono">~/Chess/games</span> as PGN when it ends, or whenever you
          press Save. You can also bring one in from elsewhere.
        </p>
        <button type="button" className="chessapp-btn" style={{ marginTop: 12 }} onClick={props.onImport}>
          Import a PGN
        </button>
      </div>
    );
  }
  return (
    <div className="chessapp-scroll">
      <ul className="chessapp-list">
        {props.games.map((file) => (
          <li key={file.path}>
            <button type="button" className="chessapp-listitem" onClick={() => props.onOpen(file)}>
              <span className="chessapp-listitem-title">
                <span>
                  {file.white} <span className="chessapp-kv">vs</span> {file.black}
                </span>
                <span className="chessapp-badge">{file.result}</span>
              </span>
              <span className="chessapp-listitem-sub">
                {file.date}
                {file.opening ? ` · ${file.opening}` : ''} · {Math.max(1, Math.round(file.size / 1024))} KB
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="chessapp-section" style={{ borderBottom: 0 }}>
        <div className="chessapp-row" style={{ gap: 6, justifyContent: 'flex-start' }}>
          <button type="button" className="chessapp-btn" onClick={props.onRefresh}>
            Refresh
          </button>
          <button type="button" className="chessapp-btn" onClick={props.onImport}>
            Import a PGN
          </button>
        </div>
      </div>
    </div>
  );
}

function PuzzlePanel(props: {
  puzzles: Puzzle[];
  session: PuzzleSession | null;
  onStart: (index: number) => void;
  onExit: () => void;
  onReveal: () => void;
  onAnalyse: () => void;
  hasReport: boolean;
}): JSX.Element {
  const { puzzles, session } = props;
  if (session) {
    return (
      <div className="chessapp-section" style={{ borderBottom: 0 }}>
        <h3 className="chessapp-section-title">Puzzle {session.index + 1} of {puzzles.length}</h3>
        <p className="chessapp-pv" style={{ margin: '0 0 8px' }}>
          {session.state === 'unsolved'
            ? `${session.puzzle.color === WHITE ? 'White' : 'Black'} to play. You played ${session.puzzle.playedSan} here - there was something better.`
            : session.state === 'solved'
              ? `That is it: ${session.puzzle.solution.join(' ')}.`
              : `Not quite. Try again, or reveal the answer.`}
        </p>
        <div className="chessapp-row" style={{ gap: 6, justifyContent: 'flex-start' }}>
          {session.state !== 'solved' ? (
            <button type="button" className="chessapp-btn" onClick={props.onReveal}>
              Show me
            </button>
          ) : null}
          {session.index + 1 < puzzles.length ? (
            <button type="button" className="chessapp-btn is-primary" onClick={() => props.onStart(session.index + 1)}>
              Next puzzle
            </button>
          ) : null}
          <button type="button" className="chessapp-btn" onClick={props.onExit}>
            Back to the game
          </button>
        </div>
      </div>
    );
  }
  if (!puzzles.length) {
    return (
      <div className="chessapp-empty">
        <Icons.target size={22} />
        <h3>No puzzles yet</h3>
        <p>
          {props.hasReport
            ? 'Nothing in this game was missed by two pawns or more - which is a good sign.'
            : 'Analyse a game and every tactic you missed in it becomes a puzzle here.'}
        </p>
        {!props.hasReport ? (
          <button type="button" className="chessapp-btn is-primary" style={{ marginTop: 12 }} onClick={props.onAnalyse}>
            Analyse this game
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="chessapp-scroll">
      <ul className="chessapp-list">
        {puzzles.map((puzzle, index) => (
          <li key={`${puzzle.ply}-${puzzle.fen}`}>
            <button type="button" className="chessapp-listitem" onClick={() => props.onStart(index)}>
              <span className="chessapp-listitem-title">
                <span>{puzzle.label.split(' - ')[0]}</span>
                <span className="chessapp-badge is-bad">+{(puzzle.gain / 100).toFixed(1)}</span>
              </span>
              <span className="chessapp-listitem-sub">
                {puzzle.color === WHITE ? 'White' : 'Black'} to play · a better move was available
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** Turns a UCI line into SAN without touching the position it starts
 *  from. Used for the principal variation and the analysis report. */
function uciLine(pos: Position, uci: string[]): { san: string[]; moves: Move[] } {
  const work = clonePosition(pos);
  const san: string[] = [];
  const moves: Move[] = [];
  for (const text of uci.slice(0, 10)) {
    const move = parseSan(work, text);
    if (move === null) break;
    san.push(toSan(work, move));
    makeMove(work, move);
    moves.push(move);
  }
  return { san, moves };
}

function evalForWhite(update: EngineUpdate | null, pos: Position): number {
  if (!update) return 0;
  return pos.turn === WHITE ? update.score : -update.score;
}

function mateForWhite(update: EngineUpdate | null, pos: Position): number | null {
  if (!update || update.mate === null) return null;
  return pos.turn === WHITE ? update.mate : -update.mate;
}

/** What is missing from a full set, per colour - the captured pieces row. */
function countCaptured(pos: Position): { byWhite: number[]; byBlack: number[] } {
  const have: Record<number, number> = {};
  for (let color = 0 as Color; color <= 1; color = (color + 1) as Color) {
    const base = color * 16;
    for (let i = 0; i < pos.pieceCount[color]; i++) {
      const code = pos.board[pos.pieceSquares[base + i]];
      have[code] = (have[code] ?? 0) + 1;
    }
  }
  const byWhite: number[] = [];
  const byBlack: number[] = [];
  const counts: Record<number, number> = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
  for (const type of [5, 4, 3, 2, 1]) {
    const missingBlack = Math.max(0, counts[type] - (have[type | 8] ?? 0));
    const missingWhite = Math.max(0, counts[type] - (have[type] ?? 0));
    for (let i = 0; i < missingBlack; i++) byWhite.push(type | 8);
    for (let i = 0; i < missingWhite; i++) byBlack.push(type);
  }
  return { byWhite, byBlack };
}

function legalSample(pos: Position, moves: Move[]): string {
  return moves
    .slice(0, 6)
    .map((m) => toSan(pos, m))
    .join(', ');
}

function describeEnded(ended: { result: Result; reason: string }, tree: GameTree): string {
  const who = ended.result === '1-0' ? `${tree.tags.White ?? 'White'} wins` : ended.result === '0-1' ? `${tree.tags.Black ?? 'Black'} wins` : 'Drawn';
  const reasons: Record<string, string> = {
    checkmate: 'by checkmate',
    stalemate: 'by stalemate',
    'insufficient-material': 'for want of mating material',
    'fivefold-repetition': 'by fivefold repetition',
    'seventy-five-move': 'by the seventy-five-move rule',
    timeout: 'on time',
    'timeout-vs-insufficient': 'on time, with no mating material left',
    resignation: 'by resignation',
    agreement: 'by agreement',
  };
  return `${who} ${reasons[ended.reason] ?? ''} (${ended.result}).`.replace('  ', ' ');
}

function describePuzzle(session: PuzzleSession): string {
  if (session.state === 'solved') return 'Solved. That was the move.';
  if (session.state === 'wrong') return 'Not the move - take it back and look again.';
  return `Puzzle: find the best move for ${session.puzzle.color === WHITE ? 'White' : 'Black'}.`;
}

// The engine's Worker entry point travels on the component itself: the
// module linker re-exports only `default`, `tools`, `intents`,
// `onInstall` and `onUninstall`, so a named export would not survive the
// build. See src/engineClient.ts for the other half of this.
(ChessApp as unknown as { runEngineWorker: typeof runEngineWorker }).runEngineWorker = runEngineWorker;

// ---------------------------------------------------------------------
// Agent tools
// ---------------------------------------------------------------------

export { tools } from './tools';
export { intents } from './tools';
