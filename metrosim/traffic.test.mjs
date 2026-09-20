import test from 'node:test';
import assert from 'node:assert/strict';
import { Train, station, entrySignal, SIGNAL_CLEARANCE, SIGNAL_REACTION } from './route.mjs';
import { TRAIN_LENGTH, CAR_COUNT, DOOR_OFFSETS, EXCHANGE_DOORS, doorOpening, ownExchangeAge } from './traffic.mjs';
import { exchangePose, exchangeCount, MAX_EXCHANGE_PASSENGERS } from './exchange.mjs';

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
      if (train.next > index && train.phase === 'waiting') { exitWait++; assert.ok(age > 12); }
      for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
        const out = exchangePose(st, slot, true, age), into = exchangePose(st, slot, false, age);
        if (age < 0) {
          assert.equal(out.visible, false, 'alighters stay inside before the doors open');
          assert.equal(into.visible, true, 'the same boarder stays visible');
          assert.equal(into.progress, 0);
        }
        if (train.next > index) { assert.ok(out.visible || out.progress === 1); assert.equal(into.visible, false); }
      }
    }
  }
  assert.ok(finalBraking > 0, 'exercise the final centimetre before settling');
  assert.ok(exitWait > 0, 'exercise a second stop at a red exit');
});

test('passengers cross actual door centres, clear the exit before boarding, and finish before closing', () => {
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
      if (out.visible && Math.abs(out.x) < 2.1) lastOut = age;
      if (into.walking) firstIn = Math.min(firstIn, age);
      if (out.visible && into.visible) assert.ok(Math.hypot(out.s - into.s, out.x - into.x) > .54, 'separate passenger lanes');
    }
    assert.ok(lastOut < firstIn);
    assert.equal(exchangePose(st, slot, false, 8).visible, false);
    assert.equal(exchangePose(st, slot, true, 8).walking, true);
  }
  assert.equal(doorOpening('opening', 0), 0); assert.equal(doorOpening('opening', 2), 1);
  assert.equal(doorOpening('closing', 0), 1); assert.equal(doorOpening('closing', 2.8), 0);
});

test('earlier alighters continue towards the exit and leave room for the following train', () => {
  for (const index of [0, 1, 2, 5]) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), earlier = exchangePose(st, slot, true, 32, true), next = exchangePose(st, slot, true, 8);
    if (earlier.visible) {
      assert.equal(earlier.walking, true);
      assert.ok(Math.hypot(earlier.s - next.s, earlier.x - next.x, earlier.y - next.y) > 1.4);
    }
  }
});

test('one to four passengers per door queue without intersections and finish inside the dwell window', () => {
  const seenCounts = new Set();
  for (let index = 0; index < 36; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), doorS = st.stop - DOOR_OFFSETS[EXCHANGE_DOORS[slot]];
    const counts = [true, false].map(outgoing => exchangeCount(st, slot, outgoing));
    counts.forEach(count => { seenCounts.add(count); assert.ok(count >= 1 && count <= MAX_EXCHANGE_PASSENGERS); });
    let lastOut = 0, firstIn = Infinity;
    for (let frame = -1; frame <= 8 * 60; frame++) {
      const age = frame / 60, people = [];
      for (const outgoing of [true, false]) for (let ordinal = 0; ordinal < MAX_EXCHANGE_PASSENGERS; ordinal++) {
        const pose = exchangePose(st, slot, outgoing, age, false, ordinal);
        if (ordinal >= exchangeCount(st, slot, outgoing)) { assert.equal(pose.visible, false); continue; }
        if (age < 0) assert.equal(pose.visible, !outgoing, 'boarders already wait before opening');
        if (age === 8) { assert.equal(pose.visible, outgoing); assert.equal(pose.walking, outgoing); }
        if (!pose.visible) continue;
        if (Math.abs(pose.x) < 1.8) assert.ok(Math.abs(pose.s - doorS) < .35, 'all passengers cross the actual door opening');
        if (outgoing && Math.abs(pose.x) < 2.1) lastOut = age;
        if (!outgoing && pose.walking) firstIn = Math.min(firstIn, age);
        people.push(pose);
      }
      for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++)
        assert.ok(Math.hypot(people[a].s - people[b].s, people[a].x - people[b].x) >= .62,
          `station ${index}, door ${slot}, age ${age}: passengers retain personal space`);
      for (let ordinal = 0; ordinal < counts[0]; ordinal++) {
        const earlier = exchangePose(st, slot, true, 32, true, ordinal);
        if (earlier.visible) for (const person of people) assert.ok(Math.hypot(earlier.s - person.s, earlier.x - person.x, earlier.y - person.y) > 1.3,
          'earlier alighters leave room for the whole next group');
      }
    }
    assert.ok(lastOut < firstIn, 'the last alighter clears the doorway before boarding begins; onward walks may overlap');
  }
  assert.deepEqual([...seenCounts].sort(), [1, 2, 3, 4]);
});

test('boarders wait on both sides and alternate at the threshold while alighters first walk straight through the middle', () => {
  const singleSides = new Set(), firstSides = new Set();
  for (let index = 0; index < 36; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), doorS = st.stop - DOOR_OFFSETS[EXCHANGE_DOORS[slot]], count = exchangeCount(st, slot, false);
    const waiting = Array.from({ length: count }, (_, ordinal) => exchangePose(st, slot, false, -1, false, ordinal));
    const sides = waiting.map(p => Math.sign(p.s - doorS));
    firstSides.add(sides[0]); if (count === 1) singleSides.add(sides[0]);
    assert.ok(waiting.every(p => Math.abs(p.s - doorS) > 1.1 && Math.abs(p.x) > 2.3), 'leave the doorway and central exit corridor clear');
    assert.ok(sides.filter(side => side === -1).length <= 2 && sides.filter(side => side === 1).length <= 2);
    for (let i = 1; i < count; i++) assert.equal(sides[i], -sides[i - 1]);
    const crossed = [];
    for (let frame = 0; frame <= 8 * 60; frame++) {
      for (let ordinal = 0; ordinal < count; ordinal++) {
        const p = exchangePose(st, slot, false, frame / 60, false, ordinal);
        if (Math.abs(p.x) < 1.485 && !crossed.includes(ordinal)) crossed.push(ordinal);
      }
      for (let ordinal = 0; ordinal < exchangeCount(st, slot, true); ordinal++) {
        const p = exchangePose(st, slot, true, frame / 60, false, ordinal);
        if (Math.abs(p.x) <= 2.9) assert.ok(Math.abs(p.s - doorS) < 1e-6, 'walk several steps straight past the waiting groups');
      }
    }
    assert.deepEqual(crossed, waiting.map((_, i) => i), 'door crossings follow the alternating side order');
  }
  assert.equal(singleSides.size, 2); assert.equal(firstSides.size, 2);
});

test('boarding queues vary spacing, pace, reaction time and stride without frame-dependent randomness', () => {
  const st = station(0), poses = age => [0, 1, 2, 3].map(i => exchangePose(st, 0, false, age, false, i));
  const moving = poses(4.4);
  const walks = [0, 1, 2, 3].map(i => {
    let start = null, finish = null, length = 0;
    for (let frame = 0; frame <= 8 * 60; frame++) {
      const p = poses(frame / 60)[i];
      if (p.walking && start === null) start = frame / 60;
      if (!p.visible && finish === null) finish = frame / 60;
      length = p.distance;
    }
    return { start, finish, speed: length / (finish - start) };
  });
  const speeds = walks.map(p => p.speed), gaps = walks.slice(1).map((p, i) => p.finish - walks[i].finish);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) > .1, 'individual walking speeds differ');
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > .1, 'alternating boarders do not cross at a fixed cadence');
  assert.equal(new Set(walks.map(p => p.start)).size, 4, 'the queue does not start marching at once');
  assert.equal(new Set(moving.map(p => Math.round(p.stridePhase * 100))).size, 4, 'independent leg phases');
  poses(7); assert.deepEqual(poses(4.4), moving, 'pause, seeking and rendering order do not change the motion');
});

test('boarding is diagonal and alighters follow continuous bends towards the stairs on either side', () => {
  for (let index = 0; index < 36; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), doorS = st.stop - DOOR_OFFSETS[EXCHANGE_DOORS[slot]];
    const direction = Math.sign(st.start + 36 - doorS);
    for (const outgoing of [false, true]) for (let ordinal = 0; ordinal < exchangeCount(st, slot, outgoing); ordinal++) {
      let previous = exchangePose(st, slot, outgoing, -1, false, ordinal), diagonal = 0;
      for (let frame = 0; frame <= 8 * 60; frame++) {
        const p = exchangePose(st, slot, outgoing, frame / 60, false, ordinal);
        if (p.visible && previous.visible) {
          const ds = p.s - previous.s, dx = Math.abs(p.x) - Math.abs(previous.x);
          const turn = Math.atan2(Math.sin(p.yaw - previous.yaw), Math.cos(p.yaw - previous.yaw));
          assert.ok(Math.abs(turn) < .09, 'no instant quarter-turn, including departure from the waiting pose');
          const walkDirection = outgoing ? direction : Math.sign(doorS - exchangePose(st, slot, false, -1, false, ordinal).s);
          assert.ok(walkDirection * ds >= -1e-8, 'walk towards the door or the stairs without reversing sideways');
          if (Math.abs(ds) > .006 && Math.abs(dx) > .003) diagonal++;
          if (outgoing) assert.ok(dx >= -1e-8); else assert.ok(dx <= 1e-8);
        }
        previous = p;
      }
      assert.ok(diagonal > 15, 'a sustained diagonal approach/bend replaces the L-shaped path');
      if (outgoing) {
        assert.ok(direction * (previous.s - doorS) > 2, 'continue along the platform towards the stairs');
        assert.ok(Math.abs(previous.x) > 3.2 && Math.abs(previous.x) <= 5.75, 'walk away from the edge towards the stairs');
      }
    }
  }
});

test('preceding-service alighters keep variable intervals throughout their longer onward walk', () => {
  for (let index = 0; index < 36; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index), count = exchangeCount(st, slot, true);
    for (let frame = 0; frame <= 12 * 60; frame++) {
      const poses = Array.from({ length: count }, (_, i) => exchangePose(st, slot, true, frame / 60, true, i)).filter(p => p.visible);
      for (let i = 1; i < poses.length; i++) assert.ok(Math.hypot(poses[i].s - poses[i - 1].s, poses[i].x - poses[i - 1].x) > .62);
      if (frame === 12 * 60) assert.ok(poses.every(p => p.walking), 'the platform walk continues after the doors close');
    }
  }
  const st = station(0), times = [0, 1, 2].map(i => {
    for (let frame = 0; frame < 240; frame++) if (exchangePose(st, 0, true, frame / 60, false, i).visible) return frame / 60;
  });
  assert.ok(Math.abs((times[1] - times[0]) - (times[2] - times[1])) > .1, 'alighters do not leave at a fixed cadence');
});

test('variable queues leave sufficient time for all followers even over a thousand station seeds', () => {
  for (let index = 0; index < 1000; index++) for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const st = station(index);
    for (let i = 0; i < exchangeCount(st, slot, false); i++)
      assert.equal(exchangePose(st, slot, false, 7.9, false, i).visible, false,
        `station ${index}, door ${slot}: a slower leader cannot strand a follower at door closure`);
  }
});

test('alighters keep walking through closing, dispatch and exit waits; pause freezes their clock', () => {
  const train = new Train(); let previous = null, checked = 0, paused = false;
  for (let frame = 0; frame < 600 * 60; frame++) {
    train.step(1 / 60);
    const st = station(Math.max(0, train.visits - 1)), age = ownExchangeAge(train, st);
    if (age < 0) continue;
    const pose = exchangePose(st, 0, true, age);
    if (previous?.index === st.index) {
      assert.ok(Math.abs(age - previous.age - 1 / 60) < 1e-7, 'phase changes must not jump or freeze the exchange clock');
      if (age > 5 && pose.visible && train.s < st.end + 14) {
        assert.ok(pose.distance > previous.pose.distance, 'no standing still in the monitor during the station stop');
        assert.ok(pose.walking); checked++;
      }
    }
    if (!paused && train.phase === 'closing') {
      train.paused = true;
      for (let i = 0; i < 120; i++) train.step(1 / 60);
      assert.equal(ownExchangeAge(train, st), age);
      assert.deepEqual(exchangePose(st, 0, true, ownExchangeAge(train, st)), pose);
      train.paused = false; paused = true;
    }
    previous = { index: st.index, age, pose };
  }
  assert.ok(checked > 1000 && paused);
});

test('all door groups keep their separation until they reach the enclosed upper stair landing', () => {
  for (let index = 0; index < 36; index++) {
    const st = station(index);
    for (let frame = 0; frame <= 90 * 30; frame++) {
      const people = [];
      for (let slot = 0; slot < 4; slot++) for (let ordinal = 0; ordinal < exchangeCount(st, slot, true); ordinal++) {
        const p = exchangePose(st, slot, true, frame / 30, false, ordinal);
        if (p.visible) people.push(p);
        if (p.progress === 1) {
          assert.equal(p.visible, false);
          assert.ok(p.y > 4.7 && p.s > st.start + 43 && Math.abs(p.x) > 5, 'only retire passengers inside the upper access enclosure');
        }
      }
      for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++)
        assert.ok(Math.hypot(people[a].s - people[b].s, people[a].x - people[b].x, people[a].y - people[b].y) > .62,
          `station ${index}, time ${frame / 30}: different door groups must not walk through each other at the stairs`);
      if (frame === 90 * 30) assert.equal(people.length, 0);
    }
  }
});
