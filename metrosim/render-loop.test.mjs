import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderLoop } from './render-loop.mjs';

function browserFrames(frame) {
  let nextId = 0, now = 0;
  const pending = new Map();
  const loop = new RenderLoop(frame, callback => { pending.set(++nextId, callback); return nextId; }, id => pending.delete(id));
  const tick = () => {
    now += 1000 / 60;
    const callbacks = [...pending.values()]; pending.clear();
    callbacks.forEach(callback => callback(now));
  };
  return { loop, pending, tick };
}

test('pause cancels the pending callback and schedules no simulation or render work until resumed', () => {
  let frames = 0;
  const { loop, pending, tick } = browserFrames(() => frames++);
  loop.setState(true); tick(); assert.equal(frames, 1); assert.equal(pending.size, 1);
  loop.setState(false); assert.equal(pending.size, 0);
  for (let i = 0; i < 600; i++) tick();
  assert.equal(frames, 1); assert.equal(pending.size, 0);
  loop.setState(true); loop.setState(true); assert.equal(pending.size, 1);
  tick(); assert.equal(frames, 2); assert.equal(pending.size, 1);
});

test('a paused resize redraws once and coalesces repeated invalidations', () => {
  const draws = [];
  const { loop, pending, tick } = browserFrames((now, redraw) => draws.push(redraw));
  assert.equal(pending.size, 0, 'a paused initial page stays idle');
  loop.invalidate(); loop.invalidate(); loop.invalidate(); assert.equal(pending.size, 1);
  tick(); assert.deepEqual(draws, [true]); assert.equal(pending.size, 0);
  for (let i = 0; i < 60; i++) tick();
  assert.equal(draws.length, 1);
});

test('hidden pages stay idle and defer a requested repaint until visible', () => {
  let frames = 0;
  const { loop, pending, tick } = browserFrames(() => frames++);
  loop.setState(true); loop.setState(true, false);
  loop.invalidate(); assert.equal(pending.size, 0); tick(); assert.equal(frames, 0);
  loop.setState(false, true); tick();
  assert.equal(frames, 1); assert.equal(pending.size, 0);
});
