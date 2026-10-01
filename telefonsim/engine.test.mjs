import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, CONTACTS, SOURCE, CAMERA_TRAVEL_SECONDS, FINDER_SEARCH_SECONDS, pulsesFor, resolveNumber } from './engine.mjs';

function runUntil(e, state, limit = 90) {
  for (let n = 0; n < limit * 100 && e.state !== state; n++) e.step(.01);
  assert.equal(e.state, state, e.message);
}

test('all occupied selectors release together after the block view, then return to the finder', () => {
  const events = [], e = new Exchange((event, engine) => {
    if (engine.state === 'releasing') events.push({ ...event, snapshot: engine.snapshot() });
  });
  assert.equal(e.focus, 0);
  e.dialNumber('234567'); runUntil(e, 'ringing');
  const selectors = [...e.selectors], levels = selectors.map(s => s.level), rotary = selectors.map(s => s.rotary);
  e.hangup(); assert.equal(e.focus, 'release'); assert.equal(e.release.prefix, '23');
  e.step(CAMERA_TRAVEL_SECONDS + .34);
  assert.deepEqual(selectors.map(s => s.level), levels); assert.deepEqual(selectors.map(s => s.rotary), rotary);
  e.step(.02);
  assert.ok(selectors.every(s => s.rotary === 11 && s.held && s.phase === 'löst aus'));
  const paused = e.snapshot(); e.step(0); assert.deepEqual(e.snapshot(), paused);
  e.step(.45); assert.ok(selectors.every(s => s.level === 0 && s.phase === 'fällt ab'));
  e.step(.55); assert.ok(selectors.every(s => s.rotary === 0 && s.phase === 'dreht zurück'));
  e.step(.45); assert.ok(selectors.every(s => !s.held && s.phase === 'frei'));
  assert.equal(e.focus, 'release'); assert.equal(e.release.phase, 'free'); assert.ok(e.selectors.every(s => s === null));
  e.step(.6); assert.equal(e.focus, 0); assert.equal(e.release.phase, 'returning');
  runUntil(e, 'idle'); assert.equal(e.focus, 0); assert.equal(e.release, null);
  assert.deepEqual(events.filter(ev => ev.type === 'focus').map(ev => ev.snapshot.focus), ['release', 0]);
  assert.equal(events.filter(ev => ev.type === 'release').length, 1);
  assert.ok(events.every(ev => [0, 6].includes(ev.snapshot.selectors.filter(s => s?.held).length)), 'no sequential partial release');
});

test('release timing is independent of occupied stages and cancels pending dialing or tape answers', () => {
  const duration = CAMERA_TRAVEL_SECONDS * 2 + .35 + .45 + .55 + .45 + .6;
  for (const [number, elapsed] of [['234567', .01], ['234567', 8], ['234567', 60], ['0', 60], ['119100', 60]]) {
    const small = new Exchange(), large = new Exchange();
    for (const e of [small, large]) { e.dialNumber(number); e.step(elapsed); e.hangup(); }
    assert.equal(small.tapeRunning, false);
    const before = small.snapshot(); small.step(0); assert.deepEqual(small.snapshot(), before);
    for (let i = 0; i < 56; i++) small.step(.1);
    large.step(5.6); assert.deepEqual(small.snapshot(), large.snapshot());
    assert.equal(large.state, 'releasing'); assert.equal(large.focus, 0);
    for (const e of [small, large]) e.step(duration - 5.6 + .01);
    assert.equal(large.state, 'idle'); assert.equal(large.tasks.length, 0);
    assert.deepEqual(small.snapshot(), large.snapshot());
    large.step(90); assert.equal(large.state, 'idle'); assert.equal(large.focus, 0);
  }
});

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

test('zero inside a local number still produces ten pulses and uses the local selectors', () => {
  const pulses = []; const e = new Exchange(event => { if (event.type === 'pulse') pulses.push(event); });
  e.dialNumber('100010'); runUntil(e, 'ringing');
  assert.equal(e.target.number, '100010'); assert.equal(pulses.length, 42);
  assert.deepEqual(e.selectors.map(s => s.level), [10, 1, 10, 10, 10, 1]);
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

test('manual digits, limits, invalid input, busy and self-call', () => {
  const e = new Exchange(); assert.equal(e.enqueue('1'), false); assert.equal(e.dialNumber('12345'), false);
  e.lift(); runUntil(e, 'ready');
  for (const digit of '901208') { assert.equal(e.enqueue(digit), true); runUntil(e, digit === '8' ? 'ringing' : 'ready'); }
  assert.equal(e.target.number, '901208'); assert.equal(e.enqueue('9'), false);
  e.hangup(); runUntil(e, 'idle');
  for (const [number, state] of [['234569', 'busy'], [SOURCE, 'busy']]) {
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
  runUntil(e, 'external'); assert.equal(e.digits, '0'); assert.equal(e.selectors[1].level, 10);
  assert.equal(e.dialAngle, 0);
});

test('leading zero exits after the first group without allocating local destination selectors', () => {
  for (const number of ['0', '012345', '000000']) {
    assert.equal(resolveNumber(number).kind, 'external');
    const pulses = [], e = new Exchange(event => { if (event.type === 'pulse') pulses.push(event); });
    assert.equal(e.dialNumber(number), true); runUntil(e, 'external');
    assert.equal(e.focus, 'external'); assert.equal(e.digits, '0'); assert.equal(e.pending.length, 0);
    assert.equal(pulses.length, 10); assert.ok(pulses.every(p => p.stage === 1));
    assert.equal(e.instances.size, 2); assert.ok(e.selectors.slice(2).every(s => s === null));
    assert.equal(e.answer(), false); assert.equal(e.enqueue('4'), false); assert.equal(e.targetOffHook, false);
    e.step(30); assert.equal(e.state, 'external');
    e.hangup(); runUntil(e, 'idle'); assert.ok([...e.instances.values()].every(s => !s.held));
    assert.equal(e.dialNumber('234567'), true); runUntil(e, 'ringing');
  }
  for (const time of [.2, 2, 4, 6, 8, 10]) {
    const e = new Exchange(); e.dialNumber('012345'); e.step(time); e.hangup(); e.step(90);
    assert.equal(e.state, 'idle'); assert.equal(e.target, null); assert.equal(e.tasks.length, 0);
  }
});

test('dial-controlled selectors still wait for camera arrival; the finder is already in view', () => {
  let changedAt = 0, focus = 'source'; const checked = new Set();
  const e = new Exchange((event, engine) => {
    if (event.type === 'focus' && engine.focus !== focus) { focus = engine.focus; changedAt = engine.time; }
    if (['pulse', 'step', 'release'].includes(event.type) && focus === event.stage && event.stage > 0) {
      assert.ok(engine.time - changedAt >= CAMERA_TRAVEL_SECONDS - .02, `stage ${focus} started before camera arrived`);
      checked.add(event.stage);
    }
  });
  e.dialNumber('234567'); runUntil(e, 'ringing'); e.hangup(); runUntil(e, 'idle');
  assert.equal(checked.size, 5);
});

test('finder supplies dial tone after two pulse periods and holds the camera for another 250 ms', () => {
  const events = [], e = new Exchange((event, engine) => events.push({ ...event, time: engine.time }));
  e.lift(); assert.equal(e.dialTone, false);
  e.step(.001); assert.equal(e.selectors[0].level, 1);
  e.step(FINDER_SEARCH_SECONDS - .002); assert.equal(e.dialTone, false);
  e.step(.001); assert.equal(e.dialTone, true); assert.equal(e.focus, 0);
  assert.equal(e.selectors[0].level, 10); assert.equal(e.selectors[0].rotary, 1);
  assert.equal(events.filter(ev => ev.type === 'step' && ev.stage === 0).length, 11);
  assert.equal(e.time, .2);
  e.enqueue('2');
  e.step(.249); assert.equal(e.focus, 0); assert.equal(e.dialTone, true);
  const paused = e.snapshot(); e.step(0); assert.deepEqual(e.snapshot(), paused);
  e.step(.001); assert.equal(e.focus, 1); assert.equal(e.dialTone, true);
  e.step(CAMERA_TRAVEL_SECONDS - .01);
  assert.equal(e.dialTone, true); assert.equal(events.filter(ev => ev.type === 'pulse').length, 0);
  runUntil(e, 'ready');
  const pulses = events.filter(ev => ev.type === 'pulse');
  assert.equal(pulses.length, 2); assert.ok(Math.abs(pulses[1].time - pulses[0].time - .1) < .011);
  assert.equal(e.dialTone, false);
});

test('hanging up during the fast search or camera departure cancels the dial tone and queued digits', () => {
  for (const time of [.01, .08, .18, .21, .4, .449, .46]) {
    const e = new Exchange(); e.dialNumber('234567'); e.step(time); e.hangup();
    assert.equal(e.dialTone, false); e.step(60);
    assert.equal(e.state, 'idle'); assert.equal(e.dialTone, false); assert.equal(e.target, null);
    assert.ok(e.selectors.every(s => s === null));
  }
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
