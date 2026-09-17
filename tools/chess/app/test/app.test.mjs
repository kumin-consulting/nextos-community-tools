// test/app.test.mjs
//
// The app's contract with the operating system: the manifest it installs
// with, the names of the tools it exports, and the way a game becomes a
// file name. A tool whose name loses its prefix stops being callable; a
// player called "../../etc" must not become a path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { safeSegment, gameFileName, readTags, todayTag } = await import('../src/lib/naming.ts');

const manifest = JSON.parse(readFileSync(new URL('../files/app.json', import.meta.url), 'utf8'));
const toolsSource = readFileSync(new URL('../src/tools.ts', import.meta.url), 'utf8');

const KNOWN_PERMISSIONS = new Set([
  'intents',
  'events',
  'notifications',
  'clipboard',
  'agents',
  'network',
  'storage',
  'windows',
  'db:read',
  'db:write',
]);

test('the manifest is the shape NextOS accepts', () => {
  assert.equal(manifest.id, 'chess');
  assert.match(manifest.id, /^[a-z][a-z0-9-]{2,63}$/);
  assert.ok(manifest.name.length >= 1 && manifest.name.length <= 40);
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  assert.equal(manifest.kind, 'native');
  assert.equal(manifest.entry, 'build/app.js');
  assert.equal(manifest.source, 'src/index.tsx');
  assert.ok(manifest.description.length <= 200, 'the description must be 200 characters or fewer');
  assert.ok(manifest.icon.length > 0);
});

test('every permission asked for is one the app actually uses', () => {
  for (const permission of manifest.permissions) {
    const known = KNOWN_PERMISSIONS.has(permission) || /^fs:(read|write):/.test(permission);
    assert.ok(known, `${permission} is not a NextOS permission`);
  }
  // Each of these is earned by something in the source; if a use goes
  // away, the permission should go with it.
  assert.ok(manifest.permissions.includes('fs:read:home'), 'games are read from the home folder');
  assert.ok(manifest.permissions.includes('fs:write:home'), 'games are written to the home folder');
  assert.ok(manifest.permissions.includes('storage'), 'settings and the game in progress live in storage');
  assert.ok(manifest.permissions.includes('clipboard'), 'PGN and FEN can be copied');
  assert.ok(manifest.permissions.includes('intents'), 'the app exports intents');
  assert.ok(!manifest.permissions.includes('network'), 'nothing here talks to the network');
  assert.ok(!manifest.permissions.includes('agents'), 'the app never starts an agent run');
});

test('the declared tools match the tools the module exports', () => {
  const declared = manifest.tools.map((tool) => tool.name).sort();
  const exported = [...toolsSource.matchAll(/name: `\$\{PREFIX\}(\w+)`/g)].map((m) => `chess_${m[1]}`).sort();
  assert.deepEqual(declared, exported, 'app.json and src/tools.ts disagree about the tool list');
  assert.equal(declared.length, 6);
  for (const tool of manifest.tools) {
    assert.ok(tool.name.startsWith('chess_'), `${tool.name} must carry the app's prefix`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(typeof tool.inputSchema.properties === 'object');
    assert.ok(tool.description.length > 40, `${tool.name} needs a description an agent can act on`);
  }
  const readOnly = manifest.tools.filter((t) => t.readOnly).map((t) => t.name);
  assert.deepEqual(readOnly.sort(), ['chess_analyze', 'chess_list_games', 'chess_position']);
});

test('the declared intents match the intents the module exports', () => {
  const declared = manifest.intents.map((i) => i.action).sort();
  assert.deepEqual(declared, ['analyze', 'open']);
  for (const intent of manifest.intents) {
    assert.ok(toolsSource.includes(`${intent.action}:`), `${intent.action} is declared but not implemented`);
  }
});

test('a game becomes a safe file name', () => {
  assert.equal(
    gameFileName({ Date: '2026.09.17', White: 'Ada Lovelace', Black: 'Chess engine (level 5)' }),
    '2026-09-17-Ada-Lovelace-Chess-engine-level-5.pgn'
  );
  // Nothing a player can be called may escape the games folder.
  for (const nasty of ['../../etc/passwd', '/etc/passwd', '....', '..', './.', '']) {
    const name = gameFileName({ Date: '2026.01.01', White: nasty, Black: nasty });
    assert.ok(!name.includes('/'), `${nasty} produced ${name}`);
    assert.ok(!name.includes('..'), `${nasty} produced ${name}`);
    assert.match(name, /\.pgn$/);
  }
  assert.equal(safeSegment('', 'fallback'), 'fallback');
  assert.equal(safeSegment('   ', 'fallback'), 'fallback');
  assert.equal(safeSegment('A'.repeat(200), 'x').length, 40);
});

test('tags are read from a PGN without parsing it', () => {
  const text = '[Event "A \\"quoted\\" event"]\n[White "Ada"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n';
  const tags = readTags(text);
  assert.equal(tags.Event, 'A "quoted" event');
  assert.equal(tags.White, 'Ada');
  assert.equal(tags.Result, '1-0');
  assert.deepEqual(readTags('1. e4 e5 *'), {});
});

test('the date tag is the format PGN wants', () => {
  assert.equal(todayTag(new Date(2026, 8, 17)), '2026.09.17');
  assert.equal(todayTag(new Date(2026, 0, 1)), '2026.01.01');
});
