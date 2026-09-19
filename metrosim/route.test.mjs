import test from 'node:test';
import assert from 'node:assert/strict';
import { Train, station, stationAt, trackX, trackAngle, junctionAt, branchAt, takesBranch, exitSignal, exitReleaseOffset, signalSpecs, SIGNAL_CLEARANCE, SIGNAL_REACTION, STATION_SETTLE, BRAKE_RELEASE, STATIONS } from './route.mjs';

function advance(train, seconds, dt = 1 / 60) { for (let i = 0; i < Math.round(seconds / dt); i++) train.step(dt); }

test('starts at red, clears before any movement, then accelerates', () => {
  const train = new Train();
  advance(train, 5); assert.equal(train.s, 0); assert.equal(train.green, false);
  advance(train, .6); assert.equal(train.phase, 'depart'); assert.equal(train.green, true); assert.equal(train.s, 0);
  advance(train, 2); assert.ok(train.speed > 0); assert.ok(train.s > 0); assert.equal(train.doors, false);
});

test('standing trains react to green after a short delay that freezes on pause', () => {
  for (const kind of ['initial', 'exit', 'block']) {
    const train = new Train();
    const signal = kind === 'initial' ? train.nextSignal : kind === 'exit' ? exitSignal(0)
      : signalSpecs(station(1).start - 172, station(1).start).find(s => s.kind === 'block');
    if (kind !== 'initial') {
      Object.assign(train, { s: signal.s - SIGNAL_CLEARANCE, next: 1, visits: 1, phase: 'waiting', pendingSignal: signal });
      train.signals.releases.set(signal.id, { s: signal.s, at: .5 });
    }
    const stoppedAt = train.s;
    while (!train.signals.isGreen(signal, train.time)) train.step(1 / 60);
    const greenAt = train.time;
    advance(train, .5);
    assert.equal(train.s, stoppedAt, `${kind}: no immediate start on green`);
    assert.equal(train.speed, 0);
    train.paused = true;
    const pausedAt = train.time;
    advance(train, 10);
    assert.equal(train.time, pausedAt);
    assert.equal(train.s, stoppedAt);
    train.paused = false;
    while (train.s === stoppedAt && train.time - greenAt < 3) {
      train.step(1 / 60);
      if (train.time - greenAt < SIGNAL_REACTION - 1e-8) assert.equal(train.speed, 0);
    }
    assert.ok(train.s > stoppedAt, `${kind}: service resumes`);
    assert.ok(train.time - greenAt >= SIGNAL_REACTION - 1e-8);
    assert.ok(train.time - greenAt <= SIGNAL_REACTION + 2 / 60 + 1e-8);
    assert.equal(train.doors, false);
  }
});

test('complete endless service: stops at every station, interlocks doors, repeats all variants', () => {
  const train = new Train(); const visited = new Set(), phases = new Set();
  let previousS = 0, previousV = 0, previousVisit = 0;
  for (let i = 0; i < 60 * 3600; i++) {
    train.step(1 / 60); phases.add(train.phase);
    assert.ok(train.s >= previousS, 'train must never reverse');
    assert.ok(train.speed >= 0 && train.speed <= 16.7, 'service speed limit');
    if (train.doors || ['settling', 'dispatch'].includes(train.phase)) {
      assert.equal(train.speed, 0); assert.equal(train.s, train.stop.stop);
    }
    if (train.visits !== previousVisit) { assert.equal(train.visits, previousVisit + 1); visited.add(train.next % STATIONS.length); }
    if (train.phase === 'running') assert.ok(Math.abs(train.speed - previousV) <= .92 / 60 + 1e-8, 'bounded acceleration/braking');
    assert.ok(Math.abs(train.ride.heave) < .006 && Math.abs(train.ride.surge) < .005 && Math.abs(train.ride.pitch) < .003, 'body motion stays subtle throughout service');
    previousS = train.s; previousV = train.speed; previousVisit = train.visits;
  }
  assert.equal(visited.size, 6); assert.ok(train.visits > 40);
  assert.deepEqual(phases, new Set(['signal', 'depart', 'running', 'settling', 'opening', 'open', 'closing', 'dispatch', 'waiting']));
});

test('brakes ease off before the stop, then the body settles before any door indication', () => {
  const train = new Train();
  Object.assign(train, { s: station(0).stop - 8, speed: 3.1, phase: 'running' });
  let ordinaryBrake = 0, finalBrake = 0;
  for (let i = 0; i < 1200 && train.phase !== 'settling'; i++) {
    const speed = train.speed; train.step(1 / 60);
    const braking = (speed - train.speed) * 60;
    if (speed > .65 && speed < 1) ordinaryBrake = Math.max(ordinaryBrake, braking);
    if (speed > .05 && speed < .15) finalBrake = Math.max(finalBrake, braking);
  }
  assert.equal(train.phase, 'settling'); assert.equal(train.speed, 0);
  assert.ok(ordinaryBrake > .7 && finalBrake > 0 && finalBrake < ordinaryBrake * .7);
  const stoppedAt = train.time, stopS = train.s;
  advance(train, .2); assert.equal(train.doors, false);
  train.paused = true; const frozen = train.snapshot();
  advance(train, 5); assert.deepEqual(train.snapshot(), frozen); train.paused = false;
  let minSurge = 0, maxHeave = 0;
  while (train.phase === 'settling') {
    assert.equal(train.doors, false); assert.equal(train.s, stopS);
    minSurge = Math.min(minSurge, train.ride.surge); maxHeave = Math.max(maxHeave, train.ride.heave);
    train.step(1 / 60);
  }
  assert.equal(train.phase, 'opening'); assert.equal(train.doors, true);
  assert.ok(Math.abs(train.time - stoppedAt - STATION_SETTLE) < 1 / 60);
  assert.ok(minSurge < -.004 && minSurge > -.005, 'the body rebounds by only four to five millimetres');
  assert.ok(maxHeave > .0004 && maxHeave < .003, 'a restrained vertical settling movement remains visible');
  assert.ok(Math.abs(train.ride.heave) < .0001 && Math.abs(train.ride.surge) < .00015, 'settled by door release');
});

test('the second stop at a red exit repeats the stronger rebound without reopening doors', () => {
  const train = new Train();
  for (let i = 0; i < 12000 && train.phase !== 'waiting'; i++) train.step(1 / 60);
  assert.equal(train.phase, 'waiting'); assert.equal(train.pendingSignal.id, 'exit-1');
  assert.equal(train.visits, 2); assert.equal(train.signalWaits, 1);
  const stopS = train.s;
  assert.equal(stopS, exitSignal(1).s - SIGNAL_CLEARANCE);
  let minSurge = 0, maxHeave = 0;
  for (let i = 0; i < 60; i++) {
    train.step(1 / 60);
    assert.equal(train.phase, 'waiting'); assert.equal(train.green, false);
    assert.equal(train.speed, 0); assert.equal(train.s, stopS); assert.equal(train.doors, false);
    minSurge = Math.min(minSurge, train.ride.surge); maxHeave = Math.max(maxHeave, train.ride.heave);
  }
  assert.ok(minSurge < -.004 && minSurge > -.005, 'signal stops repeat the same four-to-five-millimetre rebound');
  assert.ok(maxHeave > .0004 && maxHeave < .003, 'the second stop also settles vertically');
  assert.equal(train.visits, 2);
});

test('closed-door departure releases the brake before smoothly building traction', () => {
  const train = new Train();
  Object.assign(train, { s: station(0).stop, next: 0, visits: 1, phase: 'closing', timer: 2.8 - 1 / 60 });
  train.step(1 / 60); assert.equal(train.phase, 'dispatch');
  const readyAt = train.tractionAt, releaseAt = train.brakeReleaseAt;
  assert.ok(Math.abs(readyAt - releaseAt - BRAKE_RELEASE) < 1e-8);
  while (train.time < releaseAt - 1 / 60) { train.step(1 / 60); assert.equal(train.speed, 0); assert.equal(train.brakeReleased, false); }
  train.step(1 / 60); assert.equal(train.brakeReleased, true);
  while (train.time < readyAt - 1 / 60) { train.step(1 / 60); assert.equal(train.speed, 0); assert.equal(train.doors, false); }
  let earlyAcceleration = 0, laterAcceleration = 0;
  for (let i = 0; i < 70; i++) {
    const before = train.speed; train.step(1 / 60);
    const acceleration = (train.speed - before) * 60;
    if (train.time - readyAt < .2) earlyAcceleration = Math.max(earlyAcceleration, acceleration);
    if (train.time - readyAt > .9) laterAcceleration = Math.max(laterAcceleration, acceleration);
  }
  assert.ok(earlyAcceleration > 0 && earlyAcceleration < .2);
  assert.ok(laterAcceleration > .8 && laterAcceleration <= .92 + 1e-8);
});

test('pause freezes both the movement and door cycle', () => {
  const train = new Train(); for (let i = 0; i < 6000 && train.phase !== 'open'; i++) train.step(1 / 60);
  assert.equal(train.phase, 'open'); train.paused = true;
  const snapshot = train.snapshot(), time = train.time;
  advance(train, 100); assert.deepEqual(train.snapshot(), snapshot); assert.equal(train.time, time);
  train.paused = false; advance(train, 15); assert.ok(train.s > snapshot.distance);
});

test('station boundaries and continuous curved track', () => {
  for (let i = 0; i < 18; i++) {
    const st = station(i);
    assert.equal(stationAt(st.start - .01), null); assert.equal(stationAt(st.start).index, i);
    assert.equal(stationAt(st.end - .01).index, i); assert.equal(stationAt(st.end), null);
    for (const s of [st.start, st.end]) {
      assert.ok(Math.abs(trackX(s - .001) - trackX(s + .001)) < .001);
      assert.ok(Math.abs(trackAngle(s - .001) - trackAngle(s + .001)) < .001);
    }
  }
  assert.equal(station(0).side, -1); assert.equal(station(1).side, 1);
});

test('integration remains consistent at different simulation tick rates', () => {
  const a = new Train(), b = new Train(); advance(a, 35, 1 / 60); advance(b, 35, 1 / 120);
  assert.ok(Math.abs(a.s - b.s) < .5); assert.ok(Math.abs(a.speed - b.speed) < .05);
});

test('left/right passing loops and independent forks stay clear of stations', () => {
  for (let i = 0; i < 12; i++) {
    const st = station(i), start = st.start - 246, first = junctionAt(start), end = first.end;
    assert.equal(junctionAt(st.start + 20), null);
    assert.ok(Math.abs(first.branchX) < 1e-8);
    assert.equal(first.side, (i % 2 === 0 ? 1 : -1) * (takesBranch(i) ? -1 : 1));
    assert.ok(end < st.start);
    if (first.fork) {
      assert.ok(Math.abs(junctionAt(end).branchX) > 20, 'fork continues away instead of rejoining');
      assert.ok(Math.abs(junctionAt(first.split).branchX) > 6.1, 'separate portals leave a solid centre pier');
    } else assert.ok(Math.abs(junctionAt(end).branchX) < 1e-8);
    for (let s = start; s <= end; s += .25) {
      const j = junctionAt(s);
      assert.ok(j.branchX * j.side >= 0);
      if (!j.separate) assert.ok(j.extraWidth + .001 >= Math.abs(j.branchX), 'train envelope fits the shared chamber');
      else assert.equal(j.extraWidth, 0, 'main running tunnel returns to its own bore');
      const next = junctionAt(s + .01);
      if (next) assert.ok(Math.abs(next.branchX - j.branchX) < .006);
    }
  }
});

test('exit blocks release before, during and after departure without bypassing door interlocks', () => {
  for (const index of [0, 1, 2, 3, 4, 5]) {
    const train = new Train(), signal = exitSignal(index);
    Object.assign(train, { s: station(index).stop, next: index, visits: index + 1, phase: 'opening', time: 100 });
    train.signals.arrive(index, train.time);
    let earlyGreen = false, departed = false, departureAspect = null, waited = false, waitSeconds = 0;
    for (let i = 0; i < 3600 && train.s <= signal.s; i++) {
      train.step(1 / 60);
      const green = train.signals.isGreen(signal, train.time);
      if (train.doors) { assert.equal(train.speed, 0); assert.equal(train.visits, index + 1); if (green) earlyGreen = true; }
      if (train.phase === 'depart' && !departed) { departed = true; departureAspect = green; }
      if (!green) assert.ok(train.s <= signal.s - SIGNAL_CLEARANCE + 1e-8, 'cannot cross a red block boundary');
      if (train.phase === 'waiting') {
        waited = true; if (!green) waitSeconds += 1 / 60;
        assert.equal(train.speed, 0); assert.equal(train.doors, false);
        assert.equal(train.s, signal.s - SIGNAL_CLEARANCE); assert.ok(train.s < station(index).end);
      }
    }
    assert.ok(train.s > signal.s, 'service resumes after the block clears');
    assert.equal(train.visits, index + 1, 'signal stops do not reopen doors or count as stations');
    assert.equal(departureAspect, exitReleaseOffset(index) <= 0);
    if (exitReleaseOffset(index) < -4) assert.equal(earlyGreen, true);
    assert.equal(waited, exitReleaseOffset(index) >= 6.5);
    if (waited) assert.ok(waitSeconds > 1 && waitSeconds < 2.2);
  }
});

test('tunnel signals can enter view red and clear on approach; no red signal is passed', () => {
  const train = new Train(), approaches = new Map();
  let cleared = 0;
  for (let i = 0; i < 600 * 60; i++) {
    const ahead = signalSpecs(train.s, train.s + 160);
    for (const signal of ahead) if (signal.kind === 'block' && !train.signals.isGreen(signal, train.time)) approaches.set(signal.id, signal);
    train.step(1 / 60);
    for (const signal of ahead) if (!train.signals.isGreen(signal, train.time)) assert.ok(train.s <= signal.s - SIGNAL_CLEARANCE + 1e-7);
    for (const [id, signal] of approaches) if (train.signals.isGreen(signal, train.time)) {
      assert.ok(signal.s - train.s > SIGNAL_CLEARANCE && signal.s - train.s < 30, 'block clears shortly before arrival');
      approaches.delete(id); cleared++;
    }
  }
  assert.ok(train.visits >= 7); assert.ok(cleared >= 5);
});

test('itinerary selects a branch every 5–7 stations, with continuous rails and extended alternate bores', () => {
  let last = 0, count = 0;
  for (let index = 0; index <= 60; index++) {
    const st = station(index), start = st.start - 246;
    if (takesBranch(index)) {
      assert.ok(index - last >= 5 && index - last <= 7); last = index; count++;
      assert.equal(junctionAt(start + 100).selectedEdge, 'branch');
    }
    const j = junctionAt(start);
    if (j.fork) {
      assert.ok(branchAt(j.split + 290), 'unselected bore extends beyond the 225 m viewing distance');
      assert.ok(Math.abs(branchAt(j.split + 290).branchX) > 20);
    }
    for (const s of [start, start + 18, start + 72, start + 78, start + 144, start + 168, start + 228, st.start]) {
      assert.ok(Math.abs(trackX(s - .001) - trackX(s + .001)) < .003);
      assert.ok(Math.abs(trackAngle(s - .001) - trackAngle(s + .001)) < .001, 'no camera heading jump at route choices');
    }
  }
  assert.ok(count >= 9);
});
