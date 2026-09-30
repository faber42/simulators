import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, CONTACTS, pulsesFor, resolveNumber } from './engine.mjs';

function runUntil(e, state, limit = 90) {
  for (let n = 0; n < limit * 100 && e.state !== state; n++) e.step(.01);
  assert.equal(e.state, state, e.message);
}

test('six digits traverse four groups and the final selector keeps digit 5 as its level', () => {
  const pulses = [];
  const e = new Exchange(event => { if (event.type === 'pulse') pulses.push([event.digit, event.stage]); });
  assert.equal(e.dialNumber('234567'), true); runUntil(e, 'ringing');
  assert.equal(e.digits, '234567');
  assert.deepEqual(e.selectors.map(s => s.level), [10, 2, 3, 4, 5, 6]);
  assert.equal(e.selectors[5].rotary, 7);
  assert.deepEqual(e.selectors.slice(1).map(s => s.prefix), ['', '2', '23', '234', '2345']);
  assert.equal(pulses.length, 27); assert.equal(e.targetOffHook, false);
  e.step(10); assert.equal(e.state, 'ringing', 'ordinary phones do not auto-answer');
  assert.equal(e.answer(), true); assert.equal(e.state, 'connected');
  assert.equal(e.targetHangup(), true); assert.equal(e.offHook, true); assert.equal(e.targetOffHook, false);
  e.hangup(); runUntil(e, 'idle'); assert.equal(e.selectors.filter(Boolean).length, 0);
  assert.ok([...e.instances.values()].every(s => !s.held && s.level === 0 && s.rotary === 0));
});

test('all zero digits generate ten pulses; leading zeros survive number input', () => {
  const pulses = []; const e = new Exchange(event => { if (event.type === 'pulse') pulses.push(event); });
  e.dialNumber('000010'); runUntil(e, 'ringing');
  assert.equal(e.target.number, '000010'); assert.equal(pulses.length, 51);
  assert.deepEqual(e.selectors.map(s => s.level), [10, 10, 10, 10, 10, 1]);
  assert.equal(e.selectors[5].rotary, 10); assert.equal(pulsesFor('0'), 10);
});

test('all three services auto-answer and have distinct simulated text', () => {
  for (const contact of CONTACTS.filter(c => ['time', 'cinema', 'weather'].includes(c.kind))) {
    const e = new Exchange(); e.dialNumber(contact.number); runUntil(e, 'connected');
    assert.equal(e.target.kind, contact.kind); assert.equal(e.targetOffHook, false);
    assert.equal(e.focus, 'tape'); assert.equal(e.tapeRunning, true);
    assert.match(e.announcement, contact.kind === 'time' ? /Beim nächsten Ton/ : contact.kind === 'cinema' ? /Kinoprogramm heute/ : /Wetter heute/);
    e.hangup(); runUntil(e, 'idle');
  }
});

test('hangup at every phase cancels queued digits and delayed answers', () => {
  for (const duration of [.01, .7, 2, 3, 5, 9, 15, 23, 30]) {
    const e = new Exchange(); e.dialNumber('119100'); e.step(duration); e.hangup(); e.step(100);
    assert.equal(e.state, 'idle', `hangup at ${duration}`); assert.equal(e.offHook, false);
    assert.equal(e.targetOffHook, false); assert.equal(e.pending.length, 0);
    assert.equal(e.tapeRunning, false);
    assert.equal(e.currentDigit, null); assert.equal(e.activeTask, null); assert.equal(e.tasks.length, 0);
    assert.equal(e.selectors.filter(Boolean).length, 0);
  }
});

test('manual digits, limits, invalid input, busy, self-call, and unavailable', () => {
  const e = new Exchange(); assert.equal(e.enqueue('1'), false); assert.equal(e.dialNumber('12345'), false);
  e.lift(); runUntil(e, 'ready');
  for (const digit of '901208') { assert.equal(e.enqueue(digit), true); runUntil(e, digit === '8' ? 'ringing' : 'ready'); }
  assert.equal(e.target.number, '901208'); assert.equal(e.enqueue('9'), false);
  e.hangup(); runUntil(e, 'idle');
  for (const [number, state] of [['234569', 'busy'], ['010001', 'busy'], ['000000', 'unavailable']]) {
    assert.equal(e.dialNumber(number), true); assert.equal(e.enqueue('2'), false); runUntil(e, state);
    assert.equal(e.answer(), false); e.hangup(); runUntil(e, 'idle');
  }
  assert.throws(() => resolveNumber('abc123')); assert.equal(e.enqueue('a'), false);
});

test('number routing reuses prefixes and changes branches for a different number', () => {
  const e = new Exchange(); e.dialNumber('234567'); runUntil(e, 'ringing');
  const first = e.selectors.map(s => s.key), count = e.instances.size;
  e.hangup(); runUntil(e, 'idle'); e.dialNumber('234568'); runUntil(e, 'ringing');
  assert.deepEqual(e.selectors.map(s => s.key), first); assert.equal(e.instances.size, count);
  e.hangup(); runUntil(e, 'idle'); e.dialNumber('618204'); runUntil(e, 'ringing');
  assert.notEqual(e.selectors[5].key, first[5]); assert.equal(e.selectors[5].prefix, '6182');
});

test('different time steps yield identical switching outcomes and no time means no movement', () => {
  const slow = new Exchange(), fast = new Exchange(); slow.dialNumber('405019'); fast.dialNumber('405019');
  const before = fast.snapshot(); fast.step(0); assert.deepEqual(fast.snapshot(), before);
  for (let i = 0; i < 6000; i++) slow.step(.01); fast.step(60);
  assert.deepEqual(fast.snapshot(), slow.snapshot());
});

test('a dial wound with the mouse starts returning immediately and still emits the correct pulses', () => {
  const e = new Exchange(); e.lift(); runUntil(e, 'ready');
  assert.equal(e.enqueue('0', true), true); assert.ok(e.dialAngle > 5);
  e.step(.05); assert.equal(e.pulse, 1); assert.ok(e.dialAngle < 11 * Math.PI / 6);
  runUntil(e, 'ready'); assert.equal(e.digits, '0'); assert.equal(e.selectors[1].level, 10);
  assert.equal(e.dialAngle, 0);
});

test('announcement tapes run until the caller hangs up and never lift or ring a target handset', () => {
  const e = new Exchange(); e.dialNumber('119100'); runUntil(e, 'ringing');
  assert.equal(e.focus, 'tape'); assert.equal(e.target.tape, 'time');
  assert.equal(e.tapeRunning, false); assert.equal(e.targetOffHook, false);
  runUntil(e, 'connected');
  const start = e.playbackSeconds; e.step(120);
  assert.equal(e.state, 'connected'); assert.equal(e.tapeRunning, true);
  assert.ok(Math.abs(e.playbackSeconds - start - 120) < 1e-8);
  assert.equal(e.targetOffHook, false); assert.equal(e.targetHangup(), false);
  const paused = e.snapshot(); e.step(0); assert.deepEqual(e.snapshot(), paused);
  e.hangup(); assert.equal(e.tapeRunning, false);
  const stoppedAt = e.playbackSeconds; e.step(60);
  assert.equal(e.state, 'idle'); assert.equal(e.playbackSeconds, stoppedAt);
  e.dialNumber('119200'); runUntil(e, 'connected');
  assert.equal(e.target.name, 'Kinoprogramm'); assert.equal(e.target.tape, 'program');
  assert.ok(e.playbackSeconds < .02, 'new playback starts at the beginning');
});

test('tape playback accounts only for connected simulation time, independent of step size', () => {
  const slow = new Exchange(), fast = new Exchange(); slow.dialNumber('119200'); fast.dialNumber('119200');
  for (let i = 0; i < 6000; i++) slow.step(.01); fast.step(60);
  assert.equal(slow.state, 'connected'); assert.equal(fast.state, 'connected');
  assert.ok(Math.abs(slow.playbackSeconds - fast.playbackSeconds) < 1e-8);
  assert.ok(fast.playbackSeconds > 30 && fast.playbackSeconds < 60);
});
