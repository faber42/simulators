import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameDiagnostics } from './diagnostics.mjs';

test('steady 60 fps and empty warmup', () => {
  const d = new FrameDiagnostics(); assert.equal(d.snapshot(0).below30Percent, 0);
  for (let i = 0; i <= 3600; i++) d.frame(i * 1000 / 60);
  const s = d.snapshot(60000); assert.ok(Math.abs(s.fps - 60) < 1e-8); assert.equal(s.below30Percent, 0); assert.equal(s.observedSeconds, 60);
});
test('time-weighted slow percentage includes full stalls and clips the rolling boundary', () => {
  const d = new FrameDiagnostics(1000); d.frame(0);
  for (let i = 1; i <= 30; i++) d.frame(i * 1000 / 60);
  d.frame(1000); assert.ok(Math.abs(d.snapshot(1000).below30Percent - 50) < .001);
  for (let i = 1; i <= 30; i++) d.frame(1000 + i * 1000 / 60);
  assert.ok(Math.abs(d.snapshot(1500).below30Percent - 50) < .001);
  assert.equal(d.snapshot(2100).below30Percent, 0);
});
test('hidden time is excluded after resetting the measurement clock', () => {
  const d = new FrameDiagnostics(); d.frame(0); d.frame(20); d.resetClock(); d.frame(60000); d.frame(60020);
  const s = d.snapshot(60020); assert.equal(s.below30Percent, 0); assert.equal(s.observedSeconds, .02);
});
