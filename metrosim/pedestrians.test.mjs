import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePedestrians } from './pedestrians.mjs';

function passenger(from, to = null) {
  const p = { s: from[0], x: from[1], height: 1, pace: 1, phase: 0 };
  if (to) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    p.journey = { path: [from, to], lengths: [length], length, speed: 1.1,
      startTime: 0, delay: 0, triggerS: 0, stop: 100 };
  }
  return p;
}
function run(people, step = 1 / 30, duration = 20) {
  let nearest = Infinity;
  for (let time = 0; time <= duration; time += step) {
    updatePedestrians(people, { s: 0, time });
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++)
      nearest = Math.min(nearest, Math.hypot(people[i].motion.s - people[j].motion.s, people[i].motion.x - people[j].motion.x));
  }
  return nearest;
}

test('a boarding passenger stops before a standing passenger and stays there', () => {
  const p = passenger([10, 2.7], [22, 2.7]), standing = passenger([15, 2.7]);
  assert.ok(run([p, standing]) >= .78);
  assert.ok(p.halt);
  assert.equal(p.motion.moving, false);
  assert.equal(p.motion.amount, 0);
  const stopped = { s: p.motion.s, x: p.motion.x, distance: p.motion.distance };
  updatePedestrians([p, standing], { s: 0, time: 50 });
  assert.deepEqual({ s: p.motion.s, x: p.motion.x, distance: p.motion.distance }, stopped);
});

test('head-on and crossing walks stop without walking through one another', () => {
  for (const step of [1 / 60, 1 / 30, .25]) {
    const headOn = [passenger([10, 2.7], [22, 2.7]), passenger([22, 2.7], [10, 2.7])];
    assert.ok(run(headOn, step) >= .78);
    assert.ok(headOn.every(p => p.halt));
    const crossing = [passenger([10, 2.7], [20, 2.7]), passenger([15, 7.7], [15, -2.3])];
    assert.ok(run(crossing, step) >= .78);
    assert.ok(crossing.every(p => p.halt));
  }
});

test('clear parallel paths continue while slow frames cannot skip a collision', () => {
  const clear = [passenger([10, 2.6], [22, 2.6]), passenger([10, 3.7], [22, 3.7])];
  run(clear);
  assert.ok(clear.every(p => !p.halt && p.motion.settled));
  const crossing = [passenger([10, 2.7], [22, 2.7]), passenger([22, 2.7], [10, 2.7])];
  updatePedestrians(crossing, { s: 0, time: 0 });
  updatePedestrians(crossing, { s: 0, time: 15 });
  assert.ok(crossing.every(p => p.halt));
  assert.equal(crossing[0].motion.s, 10);
  assert.equal(crossing[1].motion.s, 22);
});

test('pacing passengers also stop and pause preserves the stopped pose', () => {
  const p = passenger([10, 2.7]); p.walker = true;
  const people = [p, passenger([12, 2.7])];
  assert.ok(run(people) >= .78);
  assert.ok(p.halt);
  updatePedestrians(people, { s: 0, time: 20, paused: true });
  const pose = { ...p.motion };
  for (let i = 0; i < 20; i++) updatePedestrians(people, { s: 0, time: 20, paused: true });
  assert.deepEqual(p.motion, pose);
});
