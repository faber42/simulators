import test from 'node:test';
import assert from 'node:assert/strict';
import { Train, station, stationAt, trackX, trackAngle, junctionAt, STATIONS } from './route.mjs';

function advance(train, seconds, dt = 1 / 60) { for (let i = 0; i < Math.round(seconds / dt); i++) train.step(dt); }

test('starts at red, clears before any movement, then accelerates', () => {
  const train = new Train();
  advance(train, 5); assert.equal(train.s, 0); assert.equal(train.green, false);
  advance(train, .6); assert.equal(train.phase, 'depart'); assert.equal(train.green, true); assert.equal(train.s, 0);
  advance(train, 2); assert.ok(train.speed > 0); assert.ok(train.s > 0); assert.equal(train.doors, false);
});

test('complete endless service: stops at every station, interlocks doors, repeats all variants', () => {
  const train = new Train(); const visited = new Set(), phases = new Set();
  let previousS = 0, previousV = 0, previousVisit = 0;
  for (let i = 0; i < 60 * 3600; i++) {
    train.step(1 / 60); phases.add(train.phase);
    assert.ok(train.s >= previousS, 'train must never reverse');
    assert.ok(train.speed >= 0 && train.speed <= 16.7, 'service speed limit');
    if (train.doors || train.phase === 'dispatch') {
      assert.equal(train.speed, 0); assert.equal(train.s, train.stop.stop); assert.equal(train.green, false);
    }
    if (train.visits !== previousVisit) { assert.equal(train.visits, previousVisit + 1); visited.add(train.next % STATIONS.length); }
    if (train.phase === 'running') assert.ok(Math.abs(train.speed - previousV) <= .92 / 60 + 1e-8, 'bounded acceleration/braking');
    previousS = train.s; previousV = train.speed; previousVisit = train.visits;
  }
  assert.equal(visited.size, 6); assert.ok(train.visits > 50);
  assert.deepEqual(phases, new Set(['signal', 'depart', 'running', 'opening', 'open', 'closing', 'dispatch']));
});

test('pause freezes both the movement and door cycle', () => {
  const train = new Train(); advance(train, 52); assert.equal(train.phase, 'open'); train.paused = true;
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

test('passing loops stay clear of stations and have continuous widening and turnouts', () => {
  for (let i = 0; i < 12; i++) {
    const st = station(i), start = st.start - 246, end = start + 180;
    assert.equal(junctionAt(st.start + 20), null);
    assert.equal(junctionAt(start).branchX, 0); assert.equal(junctionAt(end).branchX, 0);
    for (let s = start; s <= end; s += .25) {
      const j = junctionAt(s);
      assert.ok(j.branchX >= 0 && j.branchX <= 3.6);
      assert.ok(j.extraWidth + .001 >= j.branchX, 'full train envelope fits beside the running track');
      const next = junctionAt(s + .01);
      if (next) assert.ok(Math.abs(next.branchX - j.branchX) < .002);
    }
  }
});
