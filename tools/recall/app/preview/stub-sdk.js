/* preview/stub-sdk.js
 *
 * window.__kuminSdk for the preview harness: the five things a built
 * native app asks the OS for (react, react-dom, react/jsx-runtime,
 * zustand, @kumin/sdk), stubbed well enough to run Recall in a plain
 * browser tab.
 *
 * Nothing here ships inside the app - it exists so the app can be looked
 * at, clicked and screenshotted without NextOS. The in-memory VFS is
 * seeded with a few decks and a few months of review history so the
 * screens have something honest in them; `?seed=empty` starts with
 * nothing, which is how the empty state gets its picture.
 */
(function () {
  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const params = new URLSearchParams(window.location.search);

  /* ------------------------------------------------ jsx runtime */

  function jsx(type, props, key) {
    const config = Object.assign({}, props);
    if (key !== undefined) config.key = key;
    return React.createElement(type, config);
  }
  const jsxRuntime = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: React.Fragment };

  /* ----------------------------------------------------- zustand */

  function create(initializer) {
    let state;
    const listeners = new Set();
    const getState = () => state;
    const setState = (partial, replace) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      if (next === state) return;
      const previous = state;
      state = replace ? next : Object.assign({}, state, next);
      listeners.forEach((listener) => listener(state, previous));
    };
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const api = { getState, setState, subscribe };
    state = initializer(setState, getState, api);

    const useBound = (selector) => {
      const pick = selector || ((value) => value);
      const cache = React.useRef(null);
      const snapshot = React.useCallback(() => {
        const current = getState();
        if (cache.current && cache.current.state === current && cache.current.pick === pick) return cache.current.value;
        const value = pick(current);
        cache.current = { state: current, pick, value };
        return value;
      }, [pick]);
      return React.useSyncExternalStore(subscribe, snapshot, snapshot);
    };
    return Object.assign(useBound, api);
  }

  /* --------------------------------------------------------- vfs */

  const files = new Map(); // path -> { text, mtime }
  const dirs = new Set(['/', '/home', '/home/user']);

  const parent = (path) => path.slice(0, path.lastIndexOf('/')) || '/';
  const base = (path) => path.slice(path.lastIndexOf('/') + 1);

  const vfs = {
    async readText(path) {
      const file = files.get(path);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return file.text;
    },
    async writeFile(path, data) {
      let dir = parent(path);
      while (dir && dir !== '/' && !dirs.has(dir)) {
        dirs.add(dir);
        dir = parent(dir);
      }
      const stat = { text: String(data), mtime: Date.now() };
      files.set(path, stat);
      return { name: base(path), kind: 'file', mtime: stat.mtime, size: stat.text.length };
    },
    async mkdir(path) {
      let dir = path;
      const parts = [];
      while (dir && dir !== '/' && !dirs.has(dir)) {
        parts.push(dir);
        dir = parent(dir);
      }
      parts.forEach((part) => dirs.add(part));
    },
    async readdir(path) {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const out = [];
      for (const [full, file] of files) {
        if (!full.startsWith(prefix) || full.slice(prefix.length).includes('/')) continue;
        out.push({ name: base(full), kind: 'file', mtime: file.mtime, size: file.text.length });
      }
      for (const dir of dirs) {
        if (!dir.startsWith(prefix) || dir.slice(prefix.length).includes('/') || dir === path) continue;
        out.push({ name: base(dir), kind: 'dir', mtime: 0, size: 0 });
      }
      return out;
    },
    async stat(path) {
      const file = files.get(path);
      if (file) return { name: base(path), kind: 'file', mtime: file.mtime, size: file.text.length };
      if (dirs.has(path)) return { name: base(path), kind: 'dir', mtime: 0, size: 0 };
      throw new Error(`ENOENT: ${path}`);
    },
    async exists(path) {
      return files.has(path) || dirs.has(path);
    },
    async rm(path, opts) {
      if (!files.delete(path) && !(opts && opts.force)) throw new Error(`ENOENT: ${path}`);
    },
    async rename(from, to) {
      const file = files.get(from);
      if (!file) throw new Error(`ENOENT: ${from}`);
      files.set(to, file);
      files.delete(from);
    },
  };

  /* ------------------------------------------------------- seed */

  // Mirrors stableId in src/lib/markdown.ts - the preview has to produce
  // the same card ids the app will, or the seeded scheduling would not
  // attach to any card.
  function stableId(text) {
    const s = String(text).replace(/\r\n/g, '\n').trim();
    let a = 0x811c9dc5;
    let b = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = ((b << 5) + b + c) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }

  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DAY = 86400000;

  const SEED_DECKS = [
    {
      name: 'Spanish verbs',
      description: 'Irregular preterite forms, chapter by chapter.',
      cards: [
        ['ser / ir (yo, preterite)', 'fui', ['irregular']],
        ['tener (yo, preterite)', 'tuve', ['irregular']],
        ['estar (yo, preterite)', 'estuve', ['irregular']],
        ['poder (yo, preterite)', 'pude', ['irregular']],
        ['poner (yo, preterite)', 'puse', ['irregular']],
        ['saber (yo, preterite)', 'supe', ['irregular']],
        ['hacer (él, preterite)', 'hizo', ['irregular']],
        ['decir (ellos, preterite)', 'dijeron', ['irregular']],
        ['traer (ellos, preterite)', 'trajeron', ['irregular']],
        ['venir (yo, preterite)', 'vine', ['irregular']],
        ['querer (yo, preterite)', 'quise', ['irregular']],
        ['dar (yo, preterite)', 'di', ['irregular']],
        ['ver (yo, preterite)', 'vi', ['irregular']],
        ['andar (yo, preterite)', 'anduve', ['irregular', 'chapter-4']],
        ['caber (yo, preterite)', 'cupe', ['irregular', 'chapter-4']],
        ['conducir (ellos, preterite)', 'condujeron', ['irregular', 'chapter-4']],
      ],
    },
    {
      name: 'Neuroanatomy',
      description: 'Structures and what happens when they stop working.',
      cards: [
        ['Which structure consolidates new declarative memories?', 'The **hippocampus** - bilateral damage produces anterograde amnesia.', ['memory']],
        ['What does the cerebellum contribute to movement?', 'Timing and coordination: it compares the intended movement with the actual one and corrects the difference.', ['motor']],
        ['Broca\'s area: where, and what happens when it is damaged?', 'Left inferior frontal gyrus. Damage gives non-fluent aphasia - comprehension survives, production does not.', ['language']],
        ['Wernicke\'s area: where, and what happens when it is damaged?', 'Left posterior superior temporal gyrus. Damage gives fluent but meaningless speech.', ['language']],
        ['What is the function of the thalamus?', 'Nearly every sensory pathway relays through it on the way to cortex - it is the gate, not the destination.', ['subcortical']],
        ['Which neurotransmitter is lost in Parkinson\'s disease?', 'Dopamine, from the substantia nigra pars compacta.', ['pharmacology']],
        ['What does the amygdala do?', 'Assigns emotional weight, fear conditioning above all.', ['memory']],
        ['Where is cerebrospinal fluid made?', 'The choroid plexus, in the lateral, third and fourth ventricles.', []],
        ['What is the blood-brain barrier made of?', 'Endothelial cells joined by tight junctions, wrapped by astrocyte end-feet.', []],
        ['Which lobe processes visual information?', 'The occipital lobe - V1 sits either side of the calcarine sulcus.', ['sensory']],
        ['What is long-term potentiation?', 'A lasting strengthening of a synapse after high-frequency stimulation - the cellular story of learning.', ['memory']],
        ['C: The {{c1::corpus callosum}} carries roughly {{c2::200 million}} axons between the hemispheres.', '', ['anatomy']],
        ['What does the hypothalamus regulate?', 'Temperature, hunger, thirst, sleep and the endocrine system through the pituitary.', ['subcortical']],
        ['Which cranial nerve carries taste from the anterior tongue?', 'The facial nerve (VII), through the chorda tympani.', ['cranial-nerves']],
      ],
    },
    {
      name: 'Capital cities',
      description: 'The ones that are not the biggest city in the country.',
      cards: [
        ['Australia', 'Canberra', ['oceania']],
        ['Canada', 'Ottawa', ['americas']],
        ['Brazil', 'Brasília', ['americas']],
        ['Turkey', 'Ankara', ['asia']],
        ['Switzerland', 'Bern', ['europe']],
        ['Myanmar', 'Naypyidaw', ['asia']],
        ['Nigeria', 'Abuja', ['africa']],
        ['Tanzania', 'Dodoma', ['africa']],
        ['Bolivia', 'Sucre is the constitutional capital; La Paz is the seat of government.', ['americas']],
        ['New Zealand', 'Wellington', ['oceania']],
        ['Morocco', 'Rabat', ['africa']],
        ['Kazakhstan', 'Astana', ['asia']],
      ],
    },
    {
      name: 'JavaScript',
      description: 'Things I keep having to look up.',
      cards: [
        ['What does `Array.prototype.flatMap` do?', 'Maps each element, then flattens the result by one level. `[1,2].flatMap(n => [n, n*2])` gives `[1,2,2,4]`.', ['arrays']],
        ['What is the difference between `==` and `===`?', '`===` compares without coercion. `==` converts first, which is why `0 == ""` is true.', ['basics']],
        ['When does `Promise.allSettled` reject?', 'Never. It resolves with a status for every promise, which is what you want when one failure must not hide the rest.', ['async']],
        ['What is a `WeakMap` for?', 'Keys held weakly, so an entry disappears when nothing else references its key - metadata about objects you do not own.', ['collections']],
        ['What does the `??` operator do?', 'Returns the right side only when the left is `null` or `undefined` - unlike `||`, which also fires on `0` and `""`.', ['basics']],
        ['How do you copy an object without its prototype?', '`Object.assign(Object.create(null), source)`, or `structuredClone` when the values are data.', ['objects']],
        ['What is the temporal dead zone?', 'The gap between a `let` or `const` binding being hoisted and being initialised - touching it there throws.', ['basics']],
        ['C: `Array.prototype.sort` is {{c1::stable}} since ES2019 and sorts {{c2::as strings}} by default.', '', ['arrays']],
        ['What does `Object.groupBy` return?', 'A null-prototype object keyed by whatever the callback returns, with an array of items under each key.', ['objects']],
        ['Why use `structuredClone` over `JSON.parse(JSON.stringify(x))`?', 'It keeps Dates, Maps, Sets and cyclic references, and does not silently drop `undefined` or functions.', ['objects']],
      ],
    },
  ];

  function seedFilesystem() {
    const home = '/home/user';
    vfs.mkdir(`${home}/Recall`);
    if (params.get('seed') === 'empty') return;

    const now = Date.now();
    const HISTORY = 169;

    // Which days were studied at all. Decided once, for every deck, so
    // the streak and the heatmap look like one person's habit rather
    // than four independent ones (which would have no gaps at all).
    const studied = [];
    for (let back = 0; back < HISTORY; back++) {
      const roll = rng(9176 + back * 7919)();
      studied[back] = back <= 12 ? true : roll > 0.24;
    }

    for (let d = 0; d < SEED_DECKS.length; d++) {
      const deck = SEED_DECKS[d];
      const random = rng(20260317 + d * 104729);
      const lines = [`# ${deck.name}`, '', deck.description, ''];
      const states = {};
      const ids = [];
      for (const [question, answer, tags] of deck.cards) {
        const tagText = tags.length ? ` ${tags.map((t) => `#${t}`).join(' ')}` : '';
        if (!answer) lines.push(`${question}${tagText}`, '');
        else lines.push(`Q: ${question}${tagText}`, `A: ${answer}`, '');
        ids.push(stableId(answer ? question : `${question} c1`));
        if (!answer) ids.push(stableId(`${question} c2`));
      }

      ids.forEach((id) => {
        const roll = random();
        if (roll < 0.13) {
          states[id] = { state: 'new', due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 };
          return;
        }
        const reps = 2 + Math.floor(random() * 14);
        const interval = Math.max(1, Math.round(Math.pow(1.9, Math.min(8, reps * 0.6)) * (0.6 + random())));
        const overdue = random() < 0.3;
        states[id] = {
          state: roll < 0.18 ? 'learning' : 'review',
          due: overdue ? now - Math.floor(random() * 3) * DAY : now + (1 + Math.floor(random() * interval)) * DAY,
          interval,
          ease: Math.round((2.1 + random() * 0.7) * 100) / 100,
          reps,
          lapses: random() < 0.25 ? 1 + Math.floor(random() * 3) : 0,
          step: 0,
          lastReview: now - interval * DAY,
        };
        if (roll > 0.975) states[id].suspended = true;
        else if (roll > 0.95) states[id].marked = true;
      });

      // Five and a half months of history: a handful of cards a day in
      // each deck, on the days this person actually sat down.
      const log = [];
      for (let back = HISTORY - 1; back >= 0; back--) {
        if (!studied[back]) continue;
        const count = Math.round(3 + random() * 9);
        for (let i = 0; i < count; i++) {
          const id = ids[Math.floor(random() * ids.length)];
          const roll = random();
          const rating = roll < 0.11 ? 1 : roll < 0.28 ? 2 : roll < 0.9 ? 3 : 4;
          log.push({
            id,
            t: now - back * DAY - Math.floor(1800000 + random() * 3 * 3600000),
            rating,
            from: random() < 0.78 ? 'review' : random() < 0.5 ? 'learning' : 'new',
            interval: Math.round(random() * 40),
            ms: Math.round(2200 + random() * 9000),
          });
        }
      }
      log.sort((a, b) => a.t - b.t);

      vfs.writeFile(`${home}/Recall/${deck.name}.md`, lines.join('\n').replace(/\n+$/, '\n'));
      vfs.writeFile(
        `${home}/Recall/${deck.name}.recall.json`,
        JSON.stringify({ version: 1, settings: d === 2 ? { typedAnswers: true, newPerDay: 15 } : {}, cards: states, log }, null, 1)
      );
    }
  }

  seedFilesystem();

  /* --------------------------------------------------------- sdk */

  function useIsDark() {
    const forced = params.get('theme');
    const query = React.useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
    const subscribe = React.useCallback(
      (listener) => {
        query.addEventListener('change', listener);
        return () => query.removeEventListener('change', listener);
      },
      [query]
    );
    const system = React.useSyncExternalStore(subscribe, () => query.matches, () => false);
    const dark = forced === 'dark' ? true : forced === 'light' ? false : system;
    React.useEffect(() => {
      document.body.dataset.theme = dark ? 'dark' : 'light';
    }, [dark]);
    return dark;
  }

  const bus = new EventTarget();
  const reject = (what) => () => Promise.reject(new Error(`${what} is not available in the preview harness.`));

  function sdkFor(appId) {
    return {
      app: { id: appId, dir: `/home/user/Apps/${appId}` },
      useWindows: () => ({ windows: [], activeWindowId: null }),
      openApp: (id) => console.info('[preview] openApp', id),
      dispatchIntent: async (intent) => console.info('[preview] dispatchIntent', intent),
      getVfs: () => vfs,
      fs: { edit: reject('fs.edit'), patch: reject('fs.patch') },
      events: {
        subscribe: (pattern, cb) => {
          const handler = (event) => cb(event.detail);
          bus.addEventListener(pattern, handler);
          return () => bus.removeEventListener(pattern, handler);
        },
        emit: (type, payload) => bus.dispatchEvent(new CustomEvent(type, { detail: payload })),
      },
      notify: async (input) => {
        console.info('[preview] notify:', input.title, input.body ?? '');
      },
      theme: { useIsDark, tokens: () => ({ isDark: document.body.dataset.theme === 'dark', accentColor: '#5b4bd6' }) },
      storage: {
        get(key) {
          try {
            const raw = window.localStorage.getItem(`preview:${appId}:${key}`);
            return raw ? JSON.parse(raw) : undefined;
          } catch {
            return undefined;
          }
        },
        set(key, value) {
          try {
            window.localStorage.setItem(`preview:${appId}:${key}`, JSON.stringify(value));
          } catch {
            /* quota */
          }
        },
        remove(key) {
          window.localStorage.removeItem(`preview:${appId}:${key}`);
        },
      },
      agents: { run: reject('agents.run'), waitForRun: reject('agents.waitForRun') },
      assistant: { ask: reject('assistant.ask') },
      registerTool: () => () => undefined,
      db: {
        tables: () => [],
        createTable: () => {
          throw new Error('db is not available in the preview harness.');
        },
        rows: () => [],
        insert: reject('db.insert'),
        update: reject('db.update'),
        remove: reject('db.remove'),
        subscribe: () => () => undefined,
      },
    };
  }

  const cache = new Map();
  window.__kuminSdk = {
    react: React,
    reactDom: ReactDOM,
    reactJsxRuntime: jsxRuntime,
    zustand: { create, default: { create } },
    sdk: (appId) => {
      if (!cache.has(appId)) cache.set(appId, sdkFor(appId));
      return cache.get(appId);
    },
  };
  window.__previewVfs = vfs;
})();
