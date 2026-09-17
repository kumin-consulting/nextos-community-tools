/* A stand-in for the NextOS app runtime, so the built bundle can run in a
   plain browser tab. It provides exactly what lib/apps/native/sdk.ts
   provides - window.__kuminSdk with react, reactDom, reactJsxRuntime,
   zustand and an sdk(appId) factory - over an in-memory VFS, localStorage
   and the browser's own colour-scheme preference. Nothing here ships: it
   exists so a person (or a screenshot script) can see the real app. */
(function () {
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  /* ---- react/jsx-runtime over the UMD build ------------------------ */
  function jsxWith(type, props, key) {
    const config = Object.assign({}, props);
    delete config.children;
    if (key !== undefined) config.key = key;
    const children = props ? props.children : undefined;
    if (children === undefined) return React.createElement(type, config);
    return Array.isArray(children)
      ? React.createElement.apply(null, [type, config].concat(children))
      : React.createElement(type, config, children);
  }
  const reactJsxRuntime = { jsx: jsxWith, jsxs: jsxWith, jsxDEV: jsxWith, Fragment: React.Fragment };

  /* ---- the slice of zustand the app uses -------------------------- */
  function create(initializer) {
    let state;
    const listeners = new Set();
    const getState = () => state;
    const setState = (partial, replace) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      const previous = state;
      state = replace ? next : Object.assign({}, state, next);
      listeners.forEach((l) => l(state, previous));
    };
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const api = { getState, setState, subscribe, getInitialState: () => initial };
    state = initializer(setState, getState, api);
    const initial = state;
    const useBound = (selector) => {
      const select = selector || ((s) => s);
      return React.useSyncExternalStore(
        subscribe,
        () => select(getState()),
        () => select(getState())
      );
    };
    return Object.assign(useBound, api);
  }

  /* ---- an in-memory VFS ------------------------------------------- */
  function makeVfs() {
    const files = new Map(); // path -> { text, mtime }
    const dirs = new Set(['/', '/home', '/home/user']);
    const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
    const name = (p) => p.slice(p.lastIndexOf('/') + 1);
    const statOf = (path) => {
      if (files.has(path)) {
        const f = files.get(path);
        return { path, name: name(path), kind: 'file', size: f.text.length, mtime: f.mtime, mode: 0o644 };
      }
      if (dirs.has(path)) return { path, name: name(path) || '/', kind: 'dir', size: 0, mtime: 0, mode: 0o755 };
      return null;
    };
    const ensureDir = (path) => {
      const parts = path.split('/').filter(Boolean);
      let acc = '';
      for (const part of parts) {
        acc += '/' + part;
        dirs.add(acc);
      }
    };
    return {
      async exists(path) {
        return files.has(path) || dirs.has(path);
      },
      async stat(path) {
        const s = statOf(path);
        if (!s) throw new Error(`ENOENT: ${path}`);
        return s;
      },
      async readText(path) {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
        return files.get(path).text;
      },
      async writeFile(path, data) {
        ensureDir(parent(path));
        files.set(path, { text: typeof data === 'string' ? data : new TextDecoder().decode(data), mtime: Date.now() });
        return statOf(path);
      },
      async mkdir(path) {
        ensureDir(path);
      },
      async readdir(path) {
        const out = [];
        for (const p of files.keys()) if (parent(p) === path) out.push(statOf(p));
        for (const d of dirs) if (d !== path && parent(d) === path) out.push(statOf(d));
        return out;
      },
      async walk(path) {
        const out = [];
        for (const p of files.keys()) if (p.startsWith(path)) out.push(statOf(p));
        return out;
      },
      async rm(path) {
        files.delete(path);
        dirs.delete(path);
      },
      async rename(from, to) {
        if (!files.has(from)) throw new Error(`ENOENT: ${from}`);
        files.set(to, files.get(from));
        files.delete(from);
      },
    };
  }

  const vfs = makeVfs();
  const params = new URLSearchParams(location.search);
  const forcedDark = params.get('theme') === 'dark' ? true : params.get('theme') === 'light' ? false : null;
  const prefersDark = () => (forcedDark === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : forcedDark);
  const events = new EventTarget();
  const rejected = (what) => () => Promise.reject(new Error(`${what} is not available in the preview harness.`));

  function sdkFor(appId) {
    const prefix = `sketch-preview:${appId}:`;
    return {
      app: { id: appId, dir: `/home/user/Apps/${appId}` },
      useWindows: () => ({ windows: [], activeWindowId: null }),
      openApp() {},
      dispatchIntent: rejected('dispatchIntent'),
      getVfs: () => vfs,
      fs: { edit: rejected('fs.edit'), patch: rejected('fs.patch') },
      events: {
        subscribe(pattern, cb) {
          const handler = (e) => cb(e.detail);
          events.addEventListener(pattern, handler);
          return () => events.removeEventListener(pattern, handler);
        },
        emit(type, payload) {
          events.dispatchEvent(new CustomEvent(type, { detail: { type, payload } }));
        },
      },
      async notify(input) {
        console.info('[notify]', input.title, input.body ?? '');
      },
      theme: {
        useIsDark() {
          const subscribe = (cb) => {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            mq.addEventListener('change', cb);
            return () => mq.removeEventListener('change', cb);
          };
          return React.useSyncExternalStore(subscribe, prefersDark, prefersDark);
        },
        tokens: () => ({ isDark: prefersDark(), accentColor: '#3b5bdb' }),
      },
      storage: {
        get(key) {
          try {
            const raw = localStorage.getItem(prefix + key);
            return raw === null ? undefined : JSON.parse(raw);
          } catch {
            return undefined;
          }
        },
        set(key, value) {
          try {
            localStorage.setItem(prefix + key, JSON.stringify(value));
          } catch {
            /* a full quota must never break the app */
          }
        },
        remove(key) {
          localStorage.removeItem(prefix + key);
        },
      },
      agents: { run: rejected('agents.run'), waitForRun: rejected('agents.waitForRun') },
      assistant: { ask: rejected('assistant.ask') },
      registerTool: () => () => {},
      db: {
        tables: () => [],
        createTable() {
          throw new Error('db is not available in the preview harness.');
        },
        rows: () => [],
        insert: rejected('db.insert'),
        update: rejected('db.update'),
        remove: rejected('db.remove'),
        subscribe: () => () => {},
      },
    };
  }

  const instances = new Map();
  window.__kuminSdk = {
    react: Object.assign({}, React, { default: React }),
    reactDom: Object.assign({}, ReactDOM, { default: ReactDOM }),
    reactJsxRuntime,
    zustand: { create, createStore: create, useStore: (api, selector) => api(selector), default: { create } },
    sdk(appId) {
      if (!instances.has(appId)) instances.set(appId, sdkFor(appId));
      return instances.get(appId);
    },
  };
  window.__previewVfs = vfs;
})();
