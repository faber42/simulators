import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from './engine.mjs';
import { UpperFloorTransition, upperFloorRequested, FLOOR_DESCENT_SECONDS, FLOOR_REVEAL_SECONDS } from './upper-floor.mjs';

test('the upper floor only appears after the sixth completed local digit', () => {
  for (const number of ['234567', '119100', '119200', '234569', '0']) {
    const engine = new Exchange(); engine.dialNumber(number);
    for (let i = 0; i < 4000; i++) {
      engine.step(.01);
      assert.equal(upperFloorRequested(engine), engine.digits.length === 6);
    }
    engine.hangup(); assert.equal(upperFloorRequested(engine), false);
    engine.step(60); assert.equal(upperFloorRequested(engine), false);
  }
});

test('the hall descends before the ceiling and upper floor are revealed', () => {
  const floor = new UpperFloorTransition();
  assert.equal(floor.phase, 'lower');
  floor.update(true, FLOOR_DESCENT_SECONDS / 2);
  assert.equal(floor.phase, 'descending'); assert.ok(floor.descent > 0); assert.equal(floor.reveal, 0);
  const elapsed = floor.elapsed; floor.update(true, 0); assert.equal(floor.elapsed, elapsed);
  floor.update(true, FLOOR_DESCENT_SECONDS / 2); assert.equal(floor.descent, 1); assert.equal(floor.reveal, 0);
  floor.update(true, FLOOR_REVEAL_SECONDS / 2); assert.equal(floor.phase, 'revealing'); assert.ok(floor.reveal > 0 && floor.reveal < 1);
  floor.update(true, FLOOR_REVEAL_SECONDS); assert.equal(floor.phase, 'upper'); assert.equal(floor.reveal, 1);
  floor.update(false, .5); assert.equal(floor.reveal, 0);
  floor.update(false, 1); assert.equal(floor.phase, 'lower'); assert.equal(floor.descent, 0);
});

test('an interrupted reveal clears without a late floor and is independent of frame rate', () => {
  for (const t of [.1, .9, 1.5, 3]) {
    const a = new UpperFloorTransition(), b = new UpperFloorTransition();
    a.update(true, t);
    for (let i = 0; i < 100; i++) b.update(true, t / 100);
    assert.ok(Math.abs(a.reveal - b.reveal) < 1e-10);
    a.update(false, 2); b.update(false, 2);
    assert.equal(a.phase, 'lower'); assert.equal(b.phase, 'lower');
    a.update(false, 60); assert.equal(a.reveal, 0);
  }
});
