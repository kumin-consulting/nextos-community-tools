// lib/apps/native/moduleGraph.ts
//
// Pure module linker for native apps: given a native app's source files
// (as read from ~/Apps/<id>/src by lib/apps/native/build.ts) and an entry
// path, transpiles every TS/TSX/JS/JSX file reached from the entry with
// TypeScript's own compiler (`ts.transpileModule`, CommonJS output, the
// automatic JSX runtime) and links them into ONE self-contained ES module
// string - `build/app.js` - with a `default` export (the component) and
// optional named exports `tools`, `intents`, `onInstall`, `onUninstall`,
// exactly the shape section 6 of the brief specifies.
//
// Deviation from the brief (say-so, in the W4 report too): the brief asks
// for esbuild-wasm, with a real bundler's plugin API resolving files from
// the VFS. `esbuild-wasm` is not installed - it is not in this repo's
// node_modules, and every worktree's node_modules is a symlink to the
// main checkout's, so `npm install esbuild-wasm` from here would write
// into /Users/jkumin/jonkum.in, which every convention this brief points
// at forbids outright. The design check that reviewed this brief called
// this out and named the fallback: TypeScript's `transpileModule` (already
// a devDependency) plus "a small VFS module-graph linker that wraps each
// module and maps the five bare specifiers" - option (b) in its section 6
// correction. This file is exactly that. It produces a working, if
// unminified and untree-shaken, bundle: no code splitting, no source
// maps, no CSS preprocessing beyond concatenation. If esbuild-wasm is
// added later (option (a), the design check's preferred answer, "the
// right answer if the install can be arranged"), only lib/apps/native/
// build.ts and buildWorker.ts need to change - this file's job (resolve
// the five bare specifiers, wrap each module) is exactly what an esbuild
// plugin would have done, so the interface (`buildBundle` in, one ESM
// string out) does not need to change.
//
// Pure - no DOM, no VFS, no `window` reference at build time (the
// generated CODE references `window.__kuminSdk` at RUN time, inside the
// string this module produces, which is a different thing entirely) - so
// this runs identically inside the build Web Worker (buildWorker.ts) and
// in plain node (scripts/test-apps-native-build.mjs).
//
// EXTEND SERIES ADDITION (E3, script-extension-kinds): a sixth bare
// specifier, `@kumin/script`, and a second output shape for `kind:
// 'script'|'extension'` inputs - `export default __appExports.default`
// (the script's `main`) plus `hooks`/`commands` instead of the app
// shape's `tools`/`intents`/`onInstall`/`onUninstall`. `kind` defaults to
// 'app' and every existing app kind's output is byte-for-byte unchanged
// (verified by re-running `build-app.mjs --check` on chess/recall/sketch/
// nextos-runner after this edit - see the E3 handoff).
//
// `@kumin/script` resolves at RUN time to `self.__kuminScript(id)` (a
// worker has no `window`) with a `window.__kuminScript(id)` fallback for
// a non-worker host - this is a PLACEHOLDER naming, not a contract: E2
// (lib/os/scripts, the actual worker sandbox) owns the real global and
// may name it differently. This vendored copy of moduleGraph.ts is kept
// in sync with lib/apps/native/moduleGraph.ts in kumin-consulting/
// jonkum.in by hand (see build-tool.mjs's header); the E3 handoff says to
// re-vendor from the site's own file once E2 lands its `@kumin/script`
// specifier on develop, rather than trust this guess indefinitely.

import ts from 'typescript';

export interface ModuleGraphInput {
  /** Path to the entry file, relative to the app's own directory, e.g.
   *  'src/index.tsx' (AppManifest.source, normalized). */
  entryPath: string;
  /** Every file under the app's src/ the build should be able to import,
   *  keyed the same way as entryPath (path relative to the app dir),
   *  value the raw text. Non-source files (images, etc.) are not
   *  included - lib/apps/native/build.ts filters to
   *  .ts/.tsx/.js/.jsx/.css/.json before calling this. */
  files: Record<string, string>;
  /** The installed app's id - baked into the generated bundle's
   *  '@kumin/sdk' accessor so each app's bundle resolves to ITS OWN sdk
   *  instance (see sdk.ts's getSdkFor) rather than a single shared
   *  global, which could not be correct once more than one native app
   *  has ever loaded on the page (see sdk.ts's header comment). For a
   *  script/extension input this is its id, baked the same way into the
   *  '@kumin/script' accessor. */
  appId: string;
  /** 'app' (default, unchanged output) or 'script'/'extension' - picks
   *  the bare-specifier set and the exported shape. See this file's
   *  header. */
  kind?: 'app' | 'script' | 'extension';
}

export interface ModuleGraphResult {
  /** The finished build/app.js text - a self-contained ES module. */
  code: string;
  /** Concatenated CSS from every `.css` file reached by the graph
   *  (build/app.css); empty string if none. */
  css: string;
  /** One-line-per-fact human log for apps_build's return value. */
  log: string;
}

/** The five specifiers the brief says the build maps to
 *  `window.__kuminSdk.<x>` accessors - everything else must resolve to a
 *  file under the app's own src/. `@kumin/script` is the sixth, added for
 *  script/extension inputs (see this file's header). */
const BARE_SPECIFIERS = new Set(['react', 'react-dom', 'react/jsx-runtime', 'zustand', '@kumin/sdk', '@kumin/script']);

const RESOLVE_SUFFIXES = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '.css', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Collapses '.' and '..' segments in a posix-style path. No leading
 *  slash handling needed - every path here is relative to the app dir. */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function resolveRelative(files: Record<string, string>, fromPath: string, spec: string): string | undefined {
  const base = normalizePath(dirnameOf(fromPath) ? `${dirnameOf(fromPath)}/${spec}` : spec);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (Object.prototype.hasOwnProperty.call(files, candidate)) return candidate;
  }
  return undefined;
}

/** EXTEND SERIES ADDITION (E3): every top-level named export the entry
 *  file declares (not `default`, tracked separately by the fixed
 *  `export default __appExports.default;` line every kind emits). An app
 *  entry's shape is fixed (tools/intents/onInstall/onUninstall) and never
 *  calls this - only a script/extension entry does, because MASTER's
 *  contract lets an extension name its hook/handler exports anything
 *  (`hooks`, `commands`, or an arbitrary `previewCsv`/`onNoteSave` a
 *  `contributes.*.handler` string points at) - the wrapper has to
 *  re-export whatever the entry actually exports, not a fixed list.
 *  Covers `export function x() {}`, `export const x = ...`, and
 *  `export { x, y as z }` (the exported name, not the local one). Does
 *  NOT resolve `export * from './other'` - MASTER's shape never asks a
 *  script/extension entry to do that, and the linker's job is to mirror
 *  what NextOS's own runtime import() sees, not to add capability the
 *  brief never specified. */
function extractExportNames(path: string, text: string): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2020, false, scriptKindFor(path));
  const names = new Set<string>();
  const hasExportModifier = (node: ts.Node): boolean => !!ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefaultModifier = (node: ts.Node): boolean => !!ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  source.statements.forEach((statement) => {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const el of statement.exportClause.elements) {
        const exported = el.name.text;
        if (exported !== 'default') names.add(exported);
      }
      return;
    }
    if (!hasExportModifier(statement) || isDefaultModifier(statement)) return;
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  });
  return Array.from(names);
}

function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.ts')) return ts.ScriptKind.TS;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/** Every static import/re-export specifier a file mentions - not dynamic
 *  `import()` (a real limitation: a native app's build must be reachable
 *  by static imports from its entry alone; noted in the template's
 *  README and in the W4 report). */
function extractSpecifiers(path: string, text: string): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2020, false, scriptKindFor(path));
  const specifiers: string[] = [];
  source.statements.forEach((statement) => {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  });
  return specifiers;
}

function formatDiagnostics(path: string, diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        return `${path}:${line + 1}:${character + 1} - ${message}`;
      }
      return `${path} - ${message}`;
    })
    .join('\n');
}

/** Transpiles one TS/TSX/JS/JSX file to CommonJS with the automatic JSX
 *  runtime (so `react/jsx-runtime` shows up as a plain bare require - one
 *  of the five mapped specifiers - with no manual `import React` needed
 *  in app source). Throws with file:line:col-formatted messages on any
 *  error-level diagnostic. */
function transpileSource(path: string, text: string): string {
  const result = ts.transpileModule(text, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: 'react',
      esModuleInterop: true,
      allowJs: true,
      resolveJsonModule: true,
    },
  });
  const errors = (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(formatDiagnostics(path, errors));
  return result.outputText;
}

/**
 * Walks the module graph from `entryPath`, transpiles every file it
 * reaches, and links them into one bundle string. The runtime it embeds
 * is a minimal CommonJS-shaped `require`: bare specifiers resolve through
 * `window.__kuminSdk` accessors (baked in as literal property lookups,
 * not a lookup table an app could tamper with), relative ones through a
 * per-file resolve map computed here at build time - so there is no
 * resolution work left to do at import time at all, only two object
 * property reads per `require` call.
 */
export function buildBundle(input: ModuleGraphInput): ModuleGraphResult {
  const { entryPath, files, appId, kind = 'app' } = input;
  if (!Object.prototype.hasOwnProperty.call(files, entryPath)) {
    throw new Error(`Entry file "${entryPath}" was not found. Files seen: ${Object.keys(files).sort().join(', ') || '(none)'}`);
  }

  const compiled = new Map<string, { code: string; resolveMap: Record<string, string> }>();
  const cssPaths: string[] = [];
  const order: string[] = [];
  const queue: string[] = [entryPath];
  const queued = new Set(queue);

  while (queue.length) {
    const path = queue.shift() as string;
    if (compiled.has(path)) continue;
    const text = files[path];
    if (text === undefined) throw new Error(`Could not resolve "${path}" - it isn't among this app's files.`);

    if (path.endsWith('.json')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
      compiled.set(path, { code: `module.exports = ${JSON.stringify(parsed)};`, resolveMap: {} });
      order.push(path);
      continue;
    }
    if (path.endsWith('.css')) {
      cssPaths.push(path);
      // A CSS "module" has no JS value - the import is for its side
      // effect, which build.ts fulfils by writing build/app.css and the
      // loader by injecting it as a <style> tag when the app loads.
      compiled.set(path, { code: 'module.exports = {};', resolveMap: {} });
      order.push(path);
      continue;
    }

    const specifiers = extractSpecifiers(path, text);
    const resolveMap: Record<string, string> = {};
    for (const spec of specifiers) {
      if (BARE_SPECIFIERS.has(spec)) continue;
      const resolved = resolveRelative(files, path, spec);
      if (!resolved) {
        throw new Error(
          `Cannot find "${spec}" imported from "${path}". Only files under this app's src/ and the bare specifiers ` +
            '(react, react-dom, react/jsx-runtime, zustand, @kumin/sdk, @kumin/script) can be imported - no dynamic import(), no network fetch of code.'
        );
      }
      resolveMap[spec] = resolved;
      if (!compiled.has(resolved) && !queued.has(resolved)) {
        queue.push(resolved);
        queued.add(resolved);
      }
    }
    compiled.set(path, { code: transpileSource(path, text), resolveMap });
    order.push(path);
  }

  const css = cssPaths.map((p) => files[p]).join('\n\n');
  const resolveMapJson = JSON.stringify(Object.fromEntries(order.map((p) => [p, compiled.get(p)!.resolveMap])));
  const appIdJson = JSON.stringify(appId);
  const entryJson = JSON.stringify(entryPath);
  const modulesSrc = order
    .map((p) => `  modules[${JSON.stringify(p)}] = function (module, exports, require) {\n${compiled.get(p)!.code}\n  };`)
    .join('\n');

  // `@kumin/sdk` (app) reads window.__kuminSdk (a native app is trusted
  // OS-origin code with a DOM). `@kumin/script` (script/extension) reads
  // self.__kuminScript first - the worker sandbox has no `window` - with
  // a window fallback for a host that runs it off the main thread
  // instead; see this file's header on why this global's name is a
  // placeholder pending E2's real worker runtime.
  const sdkBareLine =
    kind === 'app'
      ? `    "@kumin/sdk": function () { return window.__kuminSdk && window.__kuminSdk.sdk(${appIdJson}); }`
      : `    "@kumin/script": function () { var g = (typeof self !== "undefined" && self.__kuminScript) ? self.__kuminScript : (typeof window !== "undefined" ? window.__kuminScript : undefined); return g && g(${appIdJson}); }`;
  const exportTail =
    kind === 'app'
      ? ['export default __appExports.default;', 'export const tools = __appExports.tools;', 'export const intents = __appExports.intents;', 'export const onInstall = __appExports.onInstall;', 'export const onUninstall = __appExports.onUninstall;']
      : [
          'export default __appExports.default;',
          // Whatever the entry actually names its exports - see
          // extractExportNames' header. `hooks`/`commands` (MASTER's two
          // named conventions) always end up in this list when the entry
          // declares them; nothing is hardcoded. Every name here is a
          // syntactic JS identifier (extractExportNames only ever reads
          // one off a real binding), so a plain property access is safe.
          ...extractExportNames(entryPath, files[entryPath]).map((name) => `export const ${name} = __appExports.${name};`),
        ];

  const code = [
    `// Generated by ${kind === 'app' ? 'lib/apps/native/build.ts - do not edit. Rebuild from src/ with apps_build.' : 'lib/os/scripts (build-tool.mjs on the community side) - do not edit.'}`,
    'var __appExports = (function () {',
    '  "use strict";',
    '  var modules = Object.create(null);',
    '  var cache = Object.create(null);',
    `  var resolveMap = ${resolveMapJson};`,
    '  var bareMap = {',
    '    "react": function () { return window.__kuminSdk && window.__kuminSdk.react; },',
    '    "react-dom": function () { return window.__kuminSdk && window.__kuminSdk.reactDom; },',
    '    "react/jsx-runtime": function () { return window.__kuminSdk && window.__kuminSdk.reactJsxRuntime; },',
    '    "zustand": function () { return window.__kuminSdk && window.__kuminSdk.zustand; },',
    sdkBareLine,
    '  };',
    '  function req(fromPath, spec) {',
    '    if (Object.prototype.hasOwnProperty.call(bareMap, spec)) return bareMap[spec]();',
    '    var to = resolveMap[fromPath] && resolveMap[fromPath][spec];',
    '    if (!to) throw new Error(\'Unresolved import "\' + spec + \'" from "\' + fromPath + \'"\');',
    '    return runModule(to);',
    '  }',
    '  function runModule(path) {',
    '    if (cache[path]) return cache[path].exports;',
    '    var m = { exports: {} };',
    '    cache[path] = m;',
    '    modules[path](m, m.exports, function (spec) { return req(path, spec); });',
    '    return m.exports;',
    '  }',
    modulesSrc,
    `  return runModule(${entryJson});`,
    '})();',
    ...exportTail,
    '',
  ].join('\n');

  const log =
    `Compiled ${order.length} file(s): ${order.join(', ')}.` +
    (cssPaths.length ? ` Bundled CSS from: ${cssPaths.join(', ')}.` : '') +
    ` Output ${(code.length / 1024).toFixed(1)} KB${css ? ` + ${(css.length / 1024).toFixed(1)} KB CSS` : ''}.`;

  return { code, css, log };
}
