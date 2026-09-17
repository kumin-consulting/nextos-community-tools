// preview/stub-sdk.js
//
// A stand-in for NextOS, just complete enough to run the app in a plain
// browser tab: the five module specifiers the bundle resolves through
// `window.__kuminSdk`, an in-memory filesystem with the VFS's own method
// names, storage over localStorage, and a theme that follows either the
// `?theme=` parameter or the operating system.
//
// It is a HARNESS, not a mock of NextOS: where the real thing would ask
// a person for permission or reach the agent runtime, this rejects, and
// the app has to cope with that - which is the point.

(function () {
  const params = new URLSearchParams(location.search);
  const APP_ID = 'chess';
  const HOME = '/home/demo';
  const APP_DIR = HOME + '/Apps/' + APP_ID;

  // ---------------------------------------------------------------- VFS
  const files = new Map(); // path -> string
  const dirs = new Set(['/', '/home', HOME, HOME + '/Apps', APP_DIR]);

  function parentOf(path) {
    const index = path.lastIndexOf('/');
    return index <= 0 ? '/' : path.slice(0, index);
  }
  function ensureParents(path) {
    let current = parentOf(path);
    const parts = [];
    while (current && current !== '/' && !dirs.has(current)) {
      parts.push(current);
      current = parentOf(current);
    }
    for (let i = parts.length - 1; i >= 0; i--) dirs.add(parts[i]);
  }

  const vfs = {
    async readText(path) {
      if (!files.has(path)) throw new Error('ENOENT: ' + path);
      return files.get(path);
    },
    async readFile(path) {
      return new TextEncoder().encode(await vfs.readText(path));
    },
    async writeFile(path, data) {
      ensureParents(path);
      files.set(path, typeof data === 'string' ? data : new TextDecoder().decode(data));
      return { path, name: path.split('/').pop(), kind: 'file', size: files.get(path).length };
    },
    async mkdir(path) {
      ensureParents(path + '/x');
      dirs.add(path);
    },
    async readdir(path) {
      const prefix = path.endsWith('/') ? path : path + '/';
      const out = [];
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (rest.includes('/')) continue;
        out.push({ path: key, name: rest, kind: 'file', size: files.get(key).length, mtime: Date.now() });
      }
      for (const key of dirs) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        out.push({ path: key, name: rest, kind: 'dir', size: 0, mtime: Date.now() });
      }
      return out;
    },
    async walk(path) {
      return vfs.readdir(path);
    },
    async stat(path) {
      if (files.has(path)) return { path, name: path.split('/').pop(), kind: 'file', size: files.get(path).length };
      if (dirs.has(path)) return { path, name: path.split('/').pop(), kind: 'dir', size: 0 };
      throw new Error('ENOENT: ' + path);
    },
    async exists(path) {
      return files.has(path) || dirs.has(path);
    },
    async rm(path) {
      files.delete(path);
      dirs.delete(path);
    },
    async rename(from, to) {
      if (!files.has(from)) throw new Error('ENOENT: ' + from);
      ensureParents(to);
      files.set(to, files.get(from));
      files.delete(from);
    },
  };

  // ------------------------------------------------------------ storage
  const STORAGE_PREFIX = 'chess-preview:';
  const storage = {
    get(key) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      } catch {
        /* a full quota is not this harness's problem */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        /* ignore */
      }
    },
  };

  // -------------------------------------------------------------- theme
  const forced = params.get('theme');
  function isDark() {
    if (forced === 'dark') return true;
    if (forced === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  const bus = new EventTarget();
  const rejecting = (what) => () => Promise.reject(new Error(what + ' is not available in the preview harness'));

  const sdkFor = () => ({
    app: { id: APP_ID, dir: APP_DIR },
    useWindows: () => ({ windows: [], activeWindowId: null }),
    openApp: (id, title) => console.info('[preview] openApp', id, title),
    dispatchIntent: rejecting('dispatchIntent'),
    getVfs: () => vfs,
    fs: { edit: rejecting('fs.edit'), patch: rejecting('fs.patch') },
    events: {
      subscribe(pattern, cb) {
        const handler = (event) => cb(event.detail);
        bus.addEventListener('event', handler);
        return () => bus.removeEventListener('event', handler);
      },
      emit(type, payload) {
        bus.dispatchEvent(new CustomEvent('event', { detail: { type, payload } }));
      },
    },
    notify: async (input) => console.info('[preview] notify:', input.title, input.body ?? ''),
    theme: {
      useIsDark: () => {
        // The real sdk subscribes to the OS theme; the harness only has
        // to be right at render time.
        const [dark, setDark] = window.React.useState(isDark);
        window.React.useEffect(() => {
          if (!window.matchMedia) return undefined;
          const query = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = () => setDark(isDark());
          query.addEventListener('change', handler);
          return () => query.removeEventListener('change', handler);
        }, []);
        return dark;
      },
      tokens: () => ({ isDark: isDark(), accentColor: '#3b6ea5' }),
    },
    storage,
    agents: { run: rejecting('agents.run'), waitForRun: rejecting('agents.waitForRun') },
    assistant: { ask: rejecting('assistant.ask') },
    registerTool: () => () => undefined,
    db: {
      tables: () => [],
      createTable: () => ({ id: 'x', name: 'x' }),
      rows: () => [],
      insert: rejecting('db.insert'),
      update: rejecting('db.update'),
      remove: rejecting('db.remove'),
      subscribe: () => () => undefined,
    },
  });

  window.__kuminPreview = { vfs, storage, HOME, APP_DIR, params };
  window.__kuminSdk = {
    react: window.React,
    reactDom: window.ReactDOM,
    reactJsxRuntime: {
      jsx: (type, props, key) => window.React.createElement(type, Object.assign({ key }, props)),
      jsxs: (type, props, key) => window.React.createElement(type, Object.assign({ key }, props)),
      Fragment: window.React.Fragment,
    },
    zustand: undefined,
    sdk: sdkFor,
  };
})();
