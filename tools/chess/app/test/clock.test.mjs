// test/clock.test.mjs
//
// Clocks, driven by an injected time source so a whole blitz game runs
// in a millisecond. The cases that matter are the ones an arbiter would
// rule on: the increment is added AFTER the move, a flag that has
// already fallen is not rescued by an increment, and a tab that slept
// for ten minutes comes back showing the truth.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./_ts-hook.mjs', import.meta.url));

const { createClock, clockAt, startClock, stopClock, pressClock, hasFlagged, formatClock, parseTimeControl, timeControlTag, BLITZ_3_2, PRESETS } =
  await import('../src/lib/clock.ts');
const { WHITE, BLACK } = await import('../src/lib/types.ts');

test('a stopped clock does not tick', () => {
  const clock = createClock(BLITZ_3_2, 0);
  assert.deepEqual(clockAt(clock, 60_000), [180_000, 180_000]);
});

test('the running side loses time and the other does not', () => {
  let clock = startClock(createClock(BLITZ_3_2, 0), WHITE, 0);
  const [white, black] = clockAt(clock, 5_000);
  assert.equal(white, 175_000);
  assert.equal(black, 180_000);
});

test('the increment is added after the move and the other clock starts', () => {
  let clock = startClock(createClock(BLITZ_3_2, 0), WHITE, 0);
  clock = pressClock(clock, WHITE, 5_000);
  assert.equal(clock.running, BLACK);
  assert.equal(clock.remaining[WHITE], 177_000, 'five seconds off, two back');
  const later = clockAt(clock, 8_000);
  assert.equal(later[BLACK], 177_000);
  assert.equal(later[WHITE], 177_000, "White's clock is stopped");
});

test('a flag falls exactly when the time is gone, and the increment does not rescue it', () => {
  let clock = startClock(createClock({ initialMs: 10_000, incrementMs: 5_000 }, 0), WHITE, 0);
  assert.equal(hasFlagged(clock, WHITE, 9_999), false);
  assert.equal(hasFlagged(clock, WHITE, 10_000), true);
  clock = pressClock(clock, WHITE, 12_000);
  assert.equal(clock.flagged, WHITE);
  assert.equal(clock.remaining[WHITE], 0);
  assert.equal(clock.running, WHITE, 'a fallen flag stops the game where it is');
});

test('a long sleep is accounted for in one go, not missed', () => {
  const clock = startClock(createClock({ initialMs: 60_000, incrementMs: 0 }, 0), BLACK, 0);
  assert.deepEqual(clockAt(clock, 600_000), [60_000, 0]);
  assert.equal(hasFlagged(clock, BLACK, 600_000), true);
});

test('stopping keeps the time already spent', () => {
  let clock = startClock(createClock(BLITZ_3_2, 0), WHITE, 0);
  clock = stopClock(clock, 4_000);
  assert.equal(clock.running, null);
  assert.deepEqual(clockAt(clock, 90_000), [176_000, 180_000]);
});

test('the clock reads the way clocks read', () => {
  assert.equal(formatClock(180_000), '3:00');
  assert.equal(formatClock(65_400), '1:05');
  assert.equal(formatClock(9_900), '0:09.9');
  assert.equal(formatClock(500), '0:00.5');
  assert.equal(formatClock(-1), '0:00.0');
  assert.equal(formatClock(3_725_000), '1:02:05');
});

test('time controls parse the way people type them', () => {
  assert.deepEqual(parseTimeControl('5+3'), { initialMs: 300_000, incrementMs: 3_000 });
  assert.deepEqual(parseTimeControl('10'), { initialMs: 600_000, incrementMs: 0 });
  assert.deepEqual(parseTimeControl(' 3 + 2 '), { initialMs: 180_000, incrementMs: 2_000 });
  assert.deepEqual(parseTimeControl('1:30+0'), { initialMs: 90_000, incrementMs: 0 });
  assert.equal(parseTimeControl('nonsense'), null);
  assert.equal(parseTimeControl('0'), null);
  assert.equal(timeControlTag(BLITZ_3_2), '180+2');
});

test('every preset is a real control', () => {
  assert.ok(PRESETS.length >= 4);
  for (const preset of PRESETS) {
    assert.ok(preset.control.initialMs > 0, preset.label);
    assert.ok(preset.control.incrementMs >= 0, preset.label);
    assert.ok(preset.label.length > 3);
  }
});
