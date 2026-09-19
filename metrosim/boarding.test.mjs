import test from 'node:test';
import assert from 'node:assert/strict';
import { boardingPlan, boardingPose } from './boarding.mjs';
import { station, Train } from './route.mjs';
import { random } from './materials.js';

test('boarding routes stay behind the tactile strip and clear of columns on both sides', () => {
  for (const index of [0, 1, 5]) {
    const st = station(index);
    for (let rel = 7; rel < 117; rel += 6) {
      const s = st.start + rel, x = st.side * (2.65 + (rel % 4) * .65);
      const plan = boardingPlan(s, x, st, random(index * 1337 + rel));
      boardingPose(plan, { s: plan.triggerS, time: 0 });
      let previous = boardingPose(plan, { s: st.start, time: 0 });
      for (let time = .05; time <= 28; time += .05) {
        const pose = boardingPose(plan, { s: st.start, time });
        assert.ok(pose.s >= st.start + 4 && pose.s <= st.end - 3);
        assert.ok(Math.abs(pose.x) >= 2.53, 'body stays behind tactile paving');
        assert.ok(Math.hypot(pose.s - previous.s, pose.x - previous.x) / .05 <= plan.speed + .001, 'no frame-dependent jumps or running');
        const columnDistance = Math.hypot(pose.s - Math.round(pose.s / 12) * 12, Math.abs(pose.x) - 4.02);
        assert.ok(columnDistance > .57, 'body clears the column footprint');
        previous = pose;
      }
      assert.equal(previous.settled, true);
      assert.ok(previous.s <= st.stop - 3);
      assert.ok(Math.abs(previous.x) <= 2.88);
      if (s < st.stop - 9) assert.ok(previous.s > s, 'walk towards the stopping area');
      if (s > st.stop) assert.ok(previous.s < s, 'front-end passengers return towards the doors');
    }
  }
});

test('boarding reaction is delayed, freezes with simulation time and ends in waiting', () => {
  const st = station(0), plan = boardingPlan(st.start + 31, -4.7, st, random(192));
  assert.equal(boardingPose(plan, { s: plan.triggerS - 1, time: 20 }).distance, 0);
  assert.equal(plan.startTime, null);
  const train = { s: plan.triggerS, time: 21 };
  assert.equal(boardingPose(plan, train).moving, false);
  train.time += 5;
  const walking = boardingPose(plan, train);
  assert.equal(walking.moving, true);
  for (let i = 0; i < 120; i++) assert.deepEqual(boardingPose(plan, train), walking);
  train.time += 30;
  const waiting = boardingPose(plan, train);
  assert.equal(waiting.settled, true);
  assert.equal(waiting.moving, false);
  assert.equal(waiting.amount, 0);
  assert.equal(waiting.settle, 1);
});

test('passengers near the train front occupy separate waiting spots', () => {
  const st = station(0), reserved = [];
  for (let i = 0; i < 12; i++) boardingPlan(st.stop - 15 + i * 1.7, -3.3, st, random(273 + i), reserved);
  reserved.forEach((a, i) => reserved.slice(i + 1).forEach(b => {
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= .76);
  }));
});

test('several boarding passengers are visibly walking while the train enters', () => {
  const train = new Train(), st = station(0);
  const plans = Array.from({ length: 18 }, (_, i) => boardingPlan(st.start + 7 + i * 6, -3.4, st, random(901 + i)));
  let framesWithWalkers = 0;
  for (let i = 0; i < 60 * 58; i++) {
    train.step(1 / 60);
    const moving = plans.map(p => boardingPose(p, train)).filter(p => p.moving && p.s - train.s > 3 && p.s - train.s < 70);
    if (train.s >= st.start && train.s < st.stop && moving.length >= 2) framesWithWalkers++;
  }
  assert.ok(framesWithWalkers > 300, 'multiple approaching passengers remain visible for at least five seconds');
});
