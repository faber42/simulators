import test from 'node:test';
import assert from 'node:assert/strict';
import { Train, station, entrySignal, SIGNAL_CLEARANCE, SIGNAL_REACTION } from './route.mjs';
import { TRAIN_LENGTH, CAR_COUNT, DOOR_OFFSETS, EXCHANGE_DOORS, doorOpening, ownExchangeAge } from './traffic.mjs';
import { exchangePose, exchangeCount } from './exchange.mjs';

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

test('boarders keep their identity through final braking and exchanges never restart at exit signals', () => {
  const train = new Train(), previousAge = new Map();
  let finalBraking = 0, exitWait = 0;
  for (let frame = 0; frame < 600 * 60; frame++) {
    train.step(1 / 60);
    for (const index of [train.next - 1, train.next]) {
      if (index < 0) continue;
      const st = station(index);
      if (train.s < st.start || train.s > st.end + 14) continue;
      const age = ownExchangeAge(train, st);
      assert.ok(age >= (previousAge.get(index) ?? -1), 'exchange lifecycle cannot run backwards');
      previousAge.set(index, age);
      if (train.visits <= index) {
        assert.equal(age, -1, 'approaching passengers must still be waiting');
        if (train.s >= st.stop - .01) finalBraking++;
      }
      if (train.next > index && train.phase === 'waiting') { exitWait++; assert.equal(age, 12); }
      for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
        const out = exchangePose(st, slot, true, age), into = exchangePose(st, slot, false, age);
        if (age < 0) {
          assert.equal(out.visible, false, 'alighters stay inside before the doors open');
          assert.equal(into.visible, true, 'the same boarder stays visible');
          assert.equal(into.progress, 0);
        }
        if (train.next > index) { assert.equal(out.visible, true); assert.equal(into.visible, false); }
      }
    }
  }
  assert.ok(finalBraking > 0, 'exercise the final centimetre before settling');
  assert.ok(exitWait > 0, 'exercise a second stop at a red exit');
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

test('one to three passengers per door queue without intersections and finish inside the dwell window', () => {
  const seenCounts = new Set();
  for (let index = 0; index < 6; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), doorS = st.stop - DOOR_OFFSETS[EXCHANGE_DOORS[slot]];
    const counts = [true, false].map(outgoing => exchangeCount(st, slot, outgoing));
    counts.forEach(count => { seenCounts.add(count); assert.ok(count >= 1 && count <= 3); });
    let lastOut = 0, firstIn = Infinity;
    for (let frame = -1; frame <= 8 * 60; frame++) {
      const age = frame / 60, people = [];
      for (const outgoing of [true, false]) for (let ordinal = 0; ordinal < 3; ordinal++) {
        const pose = exchangePose(st, slot, outgoing, age, false, ordinal);
        if (ordinal >= exchangeCount(st, slot, outgoing)) { assert.equal(pose.visible, false); continue; }
        if (age < 0) assert.equal(pose.visible, !outgoing, 'boarders already wait before opening');
        if (age === 8) { assert.equal(pose.visible, outgoing); assert.equal(pose.walking, false); }
        if (!pose.visible) continue;
        if (Math.abs(pose.x) < 1.8) assert.ok(Math.abs(pose.s - doorS) < .35, 'all passengers cross the actual door opening');
        if (pose.walking) { if (outgoing) lastOut = age; else firstIn = Math.min(firstIn, age); }
        people.push(pose);
      }
      for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++)
        assert.ok(Math.hypot(people[a].s - people[b].s, people[a].x - people[b].x) >= .62,
          `station ${index}, door ${slot}, age ${age}: passengers retain personal space`);
      for (let ordinal = 0; ordinal < counts[0]; ordinal++) {
        const earlier = exchangePose(st, slot, true, 12, true, ordinal);
        for (const person of people) assert.ok(Math.hypot(earlier.s - person.s, earlier.x - person.x) > 1.3,
          'earlier alighters leave room for the whole next group');
      }
    }
    assert.ok(lastOut < firstIn, 'the last alighter clears before the queue starts boarding');
  }
  assert.deepEqual([...seenCounts].sort(), [1, 2, 3]);
});
