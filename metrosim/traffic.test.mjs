import test from 'node:test';
import assert from 'node:assert/strict';
import { Train, station, entrySignal, SIGNAL_CLEARANCE, SIGNAL_REACTION } from './route.mjs';
import { TRAIN_LENGTH, CAR_COUNT, DOOR_OFFSETS, EXCHANGE_DOORS, doorOpening } from './traffic.mjs';
import { exchangePose } from './exchange.mjs';

test('an occupied entry stays red until the complete preceding train leaves; both dwell variants clear safely', () => {
  const train = new Train(), encountered = new Map();
  for (let i = 0; i < 850 * 60; i++) {
    const index = train.next, entry = entrySignal(index);
    train.step(1 / 60);
    const lead = train.traffic.pose(index, train.time);
    if (!lead) continue;
    const green = train.signals.isGreen(entry, train.time);
    assert.equal(green, lead.rear > station(index).end + 2, 'release follows the actual tail position');
    assert.ok(Math.abs(lead.s - lead.rear - TRAIN_LENGTH) < 1e-8);
    if (!green) assert.ok(train.s <= entry.s - SIGNAL_CLEARANCE + 1e-6, 'never pass red');
    if (lead.opening > 0) assert.equal(lead.speed, 0, 'closed-door traction interlock');
    if (lead.rear > train.s) assert.ok(lead.rear - train.s > 30, 'separate train bodies');
    let seen = encountered.get(index);
    if (!seen) { seen = { stopped: false, doors: false, waiting: false, greenAt: null }; encountered.set(index, seen); }
    seen.doors ||= lead.opening > 0; seen.waiting ||= lead.phase === 'waiting';
    seen.stopped ||= train.phase === 'waiting' && train.pendingSignal?.id === entry.id;
    if (green && seen.greenAt === null) seen.greenAt = train.time;
    if (seen.stopped && seen.greenAt !== null && train.time < seen.greenAt + SIGNAL_REACTION - 1 / 60) assert.equal(train.speed, 0);
  }
  assert.ok(encountered.get(2)?.doors && encountered.get(2)?.stopped);
  assert.ok(encountered.get(5)?.waiting && encountered.get(5)?.stopped);
  assert.ok(train.visits >= 8 && train.traffic.services.size <= 1, 'endless bounded service continues');
});

test('pause also freezes visible predecessor doors and tail position', () => {
  const train = new Train(); for (let i = 0; i < 208 * 60; i++) train.step(1 / 60);
  const before = train.traffic.pose(2, train.time); assert.ok(before);
  train.paused = true;
  for (let i = 0; i < 1000; i++) train.step(1 / 60);
  assert.deepEqual(train.traffic.pose(2, train.time), before);
});

test('passengers cross actual door centres, alight before boarding, and finish before closing', () => {
  assert.equal(DOOR_OFFSETS.length, CAR_COUNT * 3);
  for (const index of [0, 1, 2, 5]) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), offset = DOOR_OFFSETS[EXCHANGE_DOORS[slot]];
    assert.ok(offset > 0 && offset < TRAIN_LENGTH && st.stop - offset > st.start);
    assert.equal(exchangePose(st, slot, true, -1).visible, false);
    assert.equal(exchangePose(st, slot, false, -1).visible, true);
    let lastOut = 0, firstIn = Infinity;
    for (let age = 0; age < 8; age += .025) {
      const out = exchangePose(st, slot, true, age), into = exchangePose(st, slot, false, age);
      for (const p of [out, into]) if (p.walking) {
        assert.equal(doorOpening('open', age), 1);
        if (Math.abs(p.x) < 1.8) assert.ok(Math.abs(p.s - (st.stop - offset)) < .35, 'inside the 1.3 metre doorway');
      }
      if (out.walking) lastOut = age;
      if (into.walking) firstIn = Math.min(firstIn, age);
      if (out.visible && into.visible) assert.ok(Math.hypot(out.s - into.s, out.x - into.x) > .54, 'separate passenger lanes');
    }
    assert.ok(lastOut < firstIn);
    assert.equal(exchangePose(st, slot, false, 8).visible, false);
    assert.equal(exchangePose(st, slot, true, 8).walking, false);
  }
  assert.equal(doorOpening('opening', 0), 0); assert.equal(doorOpening('opening', 2), 1);
  assert.equal(doorOpening('closing', 0), 1); assert.equal(doorOpening('closing', 2.8), 0);
});

test('earlier alighters remain present and leave room for passengers from the following train', () => {
  for (const index of [0, 1, 2, 5]) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), earlier = exchangePose(st, slot, true, 12, true), next = exchangePose(st, slot, true, 8);
    assert.equal(earlier.visible, true); assert.equal(earlier.walking, false);
    assert.ok(Math.hypot(earlier.s - next.s, earlier.x - next.x) > 1.4);
    assert.ok(Math.abs(earlier.x) > 2.5 && Math.abs(earlier.x) < 3.4);
  }
});
