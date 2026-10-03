import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from './frame-loop.mjs';

function fakeRAF(refresh = 60, onFrame = () => false, callbackLatency = () => 0, timestampFor = time => time) {
  let time = 0, wallTime = 0, nextHandle = 0, ticks = 0;
  const pending = new Map();
  const frames = [];
  const loop = createFrameLoop({
    fps: 30,
    now: () => wallTime,
    requestFrame: callback => { const handle = nextHandle++; pending.set(handle, callback); return handle; },
    cancelFrame: handle => pending.delete(handle),
    onFrame: dt => { frames.push({ time, wallTime, dt }); return onFrame(dt, frames.length); },
  });
  return {
    loop, frames, pending,
    get time() { return time; },
    advance(milliseconds) { time += milliseconds; wallTime = time; },
    tick(milliseconds = 1000 / refresh) {
      time += milliseconds;
      wallTime = time + callbackLatency(ticks++);
      const ready = [...pending.values()];
      pending.clear();
      for (const callback of ready) callback(timestampFor(time));
    },
    ticks(count) { for (let i = 0; i < count; i++) this.tick(); },
  };
}

function assertPhaseAligned(frames, refresh) {
  for (let index = 0; index < frames.length; index++) {
    const deadline = frames[0].time + index * 1000 / 30;
    assert.ok(frames[index].time >= deadline - 1 - 1e-7, 'A frame cannot render before its slot beyond timestamp-rounding tolerance');
    assert.ok(frames[index].time <= deadline + 1000 / refresh + 1e-7, 'A slot should use the first available display frame, without accumulating drift');
  }
}

for (const refresh of [30, 59.94, 60, 120, 144]) {
  test(`continuous simulation follows 30 FPS slots on a ${refresh} Hz display without catch-up renders`, () => {
    const raf = fakeRAF(refresh);
    raf.loop.setRunning(true);
    raf.ticks(Math.floor(refresh * 10));
    assertPhaseAligned(raf.frames, refresh);
    assert.ok(Math.abs(raf.frames.length - raf.time / 1000 * 30) <= 1, 'Fractional display refresh must not reduce the target frame rate');
    const before = raf.frames.length;
    raf.tick(1000);
    assert.equal(raf.frames.length, before + 1, 'A stalled tab must not render a burst of catch-up frames');
    assert.equal(raf.pending.size, 1);
    const resumedAt = raf.frames.at(-1).time;
    raf.tick(1);
    assert.equal(raf.frames.length, before + 1, 'The next callback must not catch up another missed slot');
    raf.tick(1000 / 30 - 1);
    assert.equal(raf.frames.length, before + 2);
    assert.ok(raf.frames.at(-1).time - resumedAt >= 1000 / 30 - 1e-7);
  });
}

test('callback execution jitter cannot skip 60 Hz display frames or contaminate simulation delta', () => {
  const delays = [0.2, 0.01, 1.1, 0.4, 2.8, 0.05, 0.8];
  const raf = fakeRAF(60, () => false, tick => delays[tick % delays.length]);
  raf.loop.setRunning(true);
  raf.ticks(60 * 30);
  assert.equal(raf.frames.length, 900);
  for (let index = 1; index < raf.frames.length; index++) {
    assert.ok(Math.abs(raf.frames[index].time - raf.frames[index - 1].time - 1000 / 30) < 1e-7, 'Variable callback latency must not insert a 50 ms draw gap');
    assert.ok(Math.abs(raf.frames[index].dt - 1 / 30) < 1e-9, 'Simulation delta follows the RAF timestamp rather than callback start jitter');
  }
});

for (const precision of [0.1, 1]) {
  test(`RAF timestamps rounded to ${precision} ms do not produce alternating 50 ms and 16 ms draw gaps`, () => {
    const raf = fakeRAF(60, () => false, tick => (tick % 7) * 0.2, time => Math.round(time / precision) * precision);
    raf.loop.setRunning(true);
    raf.ticks(60 * 30);
    assert.equal(raf.frames.length, 900);
    for (let index = 1; index < raf.frames.length; index++) {
      assert.ok(Math.abs(raf.frames[index].time - raf.frames[index - 1].time - 1000 / 30) < 1e-7, 'Rounding a timestamp must not postpone an otherwise on-time display frame');
    }
  });
}

test('long fractional-refresh runs retain phase instead of periodically accumulating a lost frame', () => {
  for (const refresh of [59.94, 144]) {
    const raf = fakeRAF(refresh, () => false, tick => (tick % 9) * 0.17);
    raf.loop.setRunning(true);
    raf.ticks(Math.floor(refresh * 120));
    assertPhaseAligned(raf.frames, refresh);
    assert.ok(Math.abs(raf.frames.length - raf.time / 1000 * 30) <= 1);
  }
});

test('initial and paused idle states have no pending RAF or automatic draws', () => {
  const raf = fakeRAF();
  assert.equal(raf.pending.size, 0);
  raf.ticks(120);
  assert.equal(raf.frames.length, 0);
  raf.loop.setRunning(true);
  raf.ticks(5);
  raf.loop.setRunning(false);
  assert.equal(raf.pending.size, 0);
  const before = raf.frames.length;
  raf.ticks(120);
  assert.equal(raf.frames.length, before);
});

test('multiple invalidations coalesce into one paused draw and return to zero pending work', () => {
  const raf = fakeRAF();
  for (let event = 0; event < 20; event++) raf.loop.invalidate();
  assert.equal(raf.pending.size, 1);
  raf.tick();
  assert.equal(raf.frames.length, 1);
  assert.equal(raf.pending.size, 0);
  raf.ticks(60);
  assert.equal(raf.frames.length, 1);
});

test('a paused camera transition schedules only its necessary capped frames', () => {
  const raf = fakeRAF(120, (_dt, count) => count < 4);
  raf.loop.invalidate();
  raf.ticks(40);
  assert.equal(raf.frames.length, 4);
  assert.equal(raf.pending.size, 0);
  assertPhaseAligned(raf.frames, 120);
});

test('pause and resume exclude idle time while rapid toggles retain the last draw cap', () => {
  const raf = fakeRAF(120);
  raf.loop.setRunning(true);
  raf.tick();
  raf.loop.setRunning(false);
  raf.advance(10000);
  raf.loop.setRunning(true);
  raf.tick();
  assert.ok(raf.frames.at(-1).dt < 0.01, 'Ten paused seconds must not advance the simulation on resume');
  const before = raf.frames.length;
  raf.loop.setRunning(false);
  raf.loop.invalidate();
  raf.loop.setRunning(true);
  raf.tick();
  assert.equal(raf.frames.length, before, 'A rapid restart must not bypass the previous render timestamp');
  raf.ticks(4);
  assert.ok(raf.frames.at(-1).time - raf.frames[before - 1].time >= 1000 / 30 - 1e-7);
});

test('an isolated paused redraw after a long idle excludes that idle interval', () => {
  const raf = fakeRAF();
  raf.loop.invalidate();
  raf.tick();
  raf.advance(60000);
  raf.loop.invalidate();
  raf.tick();
  assert.ok(raf.frames.at(-1).dt < 0.02);
  assert.equal(raf.pending.size, 0);
});

test('hidden views cancel RAF, preserve dirty requests and resume without hidden elapsed time', () => {
  const raf = fakeRAF();
  raf.loop.setRunning(true);
  raf.tick();
  raf.loop.setVisible(false);
  assert.equal(raf.pending.size, 0);
  raf.loop.invalidate();
  raf.advance(120000);
  assert.equal(raf.pending.size, 0);
  raf.loop.setVisible(true);
  assert.equal(raf.pending.size, 1);
  raf.tick();
  assert.ok(raf.frames.at(-1).dt < 0.02);
  raf.loop.setRunning(false);
  raf.loop.setVisible(false);
  raf.loop.invalidate();
  raf.advance(10000);
  raf.loop.setVisible(true);
  raf.tick();
  assert.equal(raf.pending.size, 0, 'A dirty paused view settles immediately after becoming visible');
});

test('an invalidate from inside onFrame is not lost', () => {
  let raf;
  raf = fakeRAF(60, (_dt, count) => {
    if (count === 1) raf.loop.invalidate();
    return false;
  });
  raf.loop.invalidate();
  raf.ticks(10);
  assert.equal(raf.frames.length, 2);
  assert.equal(raf.pending.size, 0);
});

test('disposing cancels work permanently and repeated setters are harmless', () => {
  const raf = fakeRAF();
  raf.loop.setRunning(true);
  raf.loop.setRunning(true);
  assert.equal(raf.pending.size, 1);
  raf.loop.dispose();
  raf.loop.dispose();
  raf.loop.invalidate();
  raf.loop.setVisible(false);
  raf.loop.setVisible(true);
  raf.loop.setRunning(true);
  raf.ticks(60);
  assert.equal(raf.pending.size, 0);
  assert.equal(raf.frames.length, 0);
});
