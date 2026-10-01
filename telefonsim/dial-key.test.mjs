import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, dialStopAngle } from './engine.mjs';
import { bindDialKey } from './dial-key.mjs';

function ready() {
  const pulses = [], engine = new Exchange(event => { if (event.type === 'pulse') pulses.push(event); });
  engine.lift(); engine.step(3); assert.equal(engine.state, 'ready');
  return { engine, pulses };
}

test('press winds the wheel to the digit stop and holds indefinitely without any pulse', () => {
  const { engine: e, pulses } = ready();
  assert.equal(e.pressDigit('4'), true); e.step(.19);
  assert.equal(e.state, 'winding'); assert.ok(Math.abs(e.dialAngle - dialStopAngle('4') / 2) < 1e-10);
  const paused = e.snapshot(); e.step(0); assert.deepEqual(e.snapshot(), paused);
  e.step(60); assert.equal(e.state, 'holding'); assert.equal(e.dialAngle, dialStopAngle('4'));
  assert.equal(e.digits, ''); assert.equal(e.selectors[1].level, 0); assert.equal(pulses.length, 0);
  assert.equal(e.pressDigit('8'), false); assert.equal(e.enqueue('9'), false);
  assert.equal(e.releaseDigit(), true); e.step(.05);
  assert.equal(pulses.length, 1); assert.ok(e.dialAngle < dialStopAngle('4'));
  e.step(10); assert.equal(e.digits, '4'); assert.equal(pulses.length, 4); assert.equal(e.state, 'ready');
  assert.equal(e.releaseDigit(), false);
});

test('a short click finishes winding before its single pulse sequence returns the wheel', () => {
  const { engine: e, pulses } = ready();
  e.pressDigit('4'); e.step(.04); e.releaseDigit();
  assert.equal(e.state, 'winding'); const angle = e.dialAngle;
  e.step(.30); assert.ok(e.dialAngle > angle); assert.equal(pulses.length, 0);
  e.step(10); assert.equal(e.digits, '4'); assert.equal(pulses.length, 4); assert.equal(e.dialHeld, null);
});

test('held sixth digit zero releases ten rotary impulses without changing the fifth digit level', () => {
  const { engine: e, pulses } = ready();
  for (const digit of '23456') { e.enqueue(digit); e.step(10); }
  const before = pulses.length;
  assert.equal(e.pressDigit('0'), true); e.step(20);
  assert.equal(e.state, 'holding'); assert.equal(e.digits, '23456'); assert.equal(pulses.length, before);
  assert.equal(e.selectors[5].level, 6); assert.equal(e.selectors[5].rotary, 0);
  assert.equal(e.canPressDigit, false); e.releaseDigit(); e.step(10);
  assert.equal(e.digits, '234560'); assert.equal(e.state, 'ringing');
  assert.equal(pulses.length - before, 10); assert.equal(e.selectors[5].level, 6); assert.equal(e.selectors[5].rotary, 10);
});

test('cancelling or hanging up while winding or holding never leaves a late digit', () => {
  for (const time of [.05, 1]) for (const action of ['cancelDigit', 'hangup']) {
    const { engine: e, pulses } = ready(); e.pressDigit('4'); e.step(time);
    assert.equal(e[action](), true); assert.equal(e.releaseDigit(), false); e.step(60);
    assert.equal(e.state, action === 'hangup' ? 'idle' : 'ready');
    assert.equal(e.digits, ''); assert.equal(pulses.length, 0); assert.equal(e.dialAngle, 0);
    assert.equal(e.dialHeld, null); assert.equal(e.currentDigit, null);
    if (action === 'cancelDigit') { assert.equal(e.pressDigit('2'), true); e.releaseDigit(); e.step(10); assert.equal(e.digits, '2'); }
  }
});

class Key extends EventTarget {
  captured = new Set();
  classes = new Set();
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); this.send('lostpointercapture', { pointerId: id }); }
  send(type, fields = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, detail: 1 }, fields);
    this.dispatchEvent(event);
  }
}
function boundKey() {
  const { engine, pulses } = ready(), button = new Key();
  const key = bindDialKey(button, { press: () => engine.pressDigit('4'), release: () => engine.releaseDigit(),
    cancel: () => engine.cancelDigit(), activate: () => engine.enqueue('4') });
  return { engine, pulses, button, key };
}

test('pointer ownership survives leaving the key; release and synthetic click dial only once', () => {
  const { engine: e, pulses, button, key } = boundKey();
  button.send('pointerdown'); assert.equal(key.pressed, true); assert.ok(button.hasPointerCapture(1));
  button.send('pointerleave'); button.send('pointerup', { pointerId: 2 }); e.step(10);
  assert.equal(e.state, 'holding'); assert.equal(pulses.length, 0); assert.ok(button.classes.has('held'));
  button.send('pointerup'); button.send('click'); assert.equal(key.pressed, false);
  assert.equal(button.hasPointerCapture(1), false); assert.equal(button.classes.has('held'), false);
  e.step(10); assert.equal(e.digits, '4'); assert.equal(pulses.length, 4);
});

test('pointer cancellation, lost capture and explicit interruption discard the held digit', () => {
  for (const action of ['pointercancel', 'lostpointercapture', 'interrupt']) {
    const { engine: e, pulses, button, key } = boundKey(); button.send('pointerdown'); e.step(1);
    if (action === 'interrupt') key.cancel(); else button.send(action);
    button.send('pointerup'); button.send('click'); e.step(10);
    assert.equal(e.digits, ''); assert.equal(pulses.length, 0); assert.equal(key.pressed, false);
  }
});

test('secondary pointers do not wind the dial; keyboard activation keeps one complete turn', () => {
  const { engine: e, pulses, button } = boundKey();
  button.send('pointerdown', { button: 2 }); button.send('pointerdown', { isPrimary: false }); e.step(10);
  assert.equal(e.state, 'ready'); assert.equal(e.dialHeld, null);
  button.send('click', { detail: 0 }); e.step(10); assert.equal(e.digits, '4'); assert.equal(pulses.length, 4);
});
