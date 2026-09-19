import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameCadence } from './cadence.mjs';
import { FrameDiagnostics } from './diagnostics.mjs';
import { passengerAttention } from './attention.mjs';
import { point, trackX } from './route.mjs';

test('presentation stays at 30 fps across common display refresh rates', () => {
  for (const hz of [60, 75, 90, 120, 144, 165, 240]) {
    const cadence = new FrameCadence(30); let count = 0;
    for (let i = 0; i < hz * 60; i++) if (cadence.take(i * 1000 / hz)) count++;
    assert.ok(Math.abs(count - 1800) <= 1, `${hz} Hz produced ${count} frames`);
    assert.equal(cadence.take(62000), true);
    assert.equal(cadence.take(62001), false, 'a stall never causes a catch-up burst');
    cadence.reset(); assert.equal(cadence.take(100000), true);
  }
});
test('30 fps timing tolerance excludes scheduling jitter but preserves missed frames', () => {
  const diagnostics = new FrameDiagnostics(60000, 30, 2);
  for (let i = 0; i <= 1800; i++) diagnostics.frame(i * 1000 / 30 + (i % 2) * .45);
  assert.equal(diagnostics.snapshot(60000).below30Percent, 0);
  diagnostics.frame(60066.67);
  assert.ok(diagnostics.snapshot(60066.67).below30Percent > .1);
});
test('passengers on both sides turn to the incoming camera and release after it passes', () => {
  for (const x of [-3.2, 3.2]) {
    const p = { s: 305, x, baseY: x < 0 ? Math.PI / 2 : -Math.PI / 2, phase: 1, height: 1, phone: true };
    assert.equal(passengerAttention(p, 205, 0).attention, 0);
    const near = passengerAttention(p, 285, 0), position = point(p.s, x);
    const target = Math.atan2(trackX(285) - position[0], -285 - position[2]);
    const error = Math.atan2(Math.sin(near.bodyYaw + near.headYaw - target), Math.cos(near.bodyYaw + near.headYaw - target));
    assert.ok(Math.abs(error) < .05, 'combined body and head face the approaching train');
    assert.ok(Math.abs(near.headYaw) <= 1.05);
    assert.equal(passengerAttention(p, 335, 0).attention, 0);
    let previous = null;
    for (let trainS = 240; trainS < 335; trainS += .1) {
      const pose = passengerAttention(p, trainS, 0);
      if (previous) assert.ok(Math.abs(pose.bodyYaw - previous.bodyYaw) < .05, 'no sudden turn');
      previous = pose;
    }
  }
});

test('late-noticing passengers keep their original pose while others already look at the train', () => {
  const base = { s: 305, x: -3.2, baseY: Math.PI / 2, phase: 1, height: 1, phone: true };
  const early = { ...base, noticeDistance: 70 }, late = { ...base, noticeDistance: 18 };
  assert.equal(passengerAttention(early, 275, 0).attention, 1);
  assert.equal(passengerAttention(late, 275, 0).attention, 0);
  assert.ok(passengerAttention(late, 297, 0).attention > .8);
});
