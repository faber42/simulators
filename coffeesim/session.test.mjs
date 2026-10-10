import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhases, getState } from './cycle.mjs';
import { DEMO_TANK_CAPACITY_ML, MachineSession } from './session.mjs';

const close = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const timeAt = (id, fraction = .5, drink = 'latte') => {
  const phase = getPhases(drink).find(item => item.id === id);
  return phase.start + phase.duration * fraction;
};
const finish = session => session.play().update(1000);

test('a new machine session has a full demo tank and an empty container', () => {
  const session = new MachineSession();
  assert.equal(DEMO_TANK_CAPACITY_ML, 300);
  assert.equal(session.state.tankCapacityMl, 300);
  assert.equal(session.state.tankRemainingMl, 300);
  assert.equal(session.state.tankLevel, 1);
  assert.equal(session.state.storedPucks, 0);
  assert.equal(session.state.priorPucks, 0);
  assert.equal(session.state.currentPuckDeposited, false);
  assert.equal(session.state.waterEmpty, false);
  assert.equal(session.playing, false);
});

test('steam reduces the tank more slowly and consumes less water than brewing', () => {
  const session = new MachineSession();
  session.seek(timeAt('milk', 0));
  const steamStart = session.state.tankRemainingMl;
  session.seek(timeAt('milk', 1));
  const steamUse = steamStart - session.state.tankRemainingMl;
  const steamRate = steamUse / getPhases().find(item => item.id === 'milk').duration;
  session.seek(timeAt('prewet', 0));
  const brewStart = session.state.tankRemainingMl;
  session.seek(timeAt('extract', 1));
  const brewUse = brewStart - session.state.tankRemainingMl;
  const extractionRate = 40 / (getPhases().find(item => item.id === 'extract').duration * .93);
  close(steamUse, 24);
  close(brewUse, 56);
  assert.ok(steamRate < extractionRate);
  close(session.state.tankRemainingMl, 198);
});

test('two complete lattes retain both pucks; the third stops with a partial coffee', () => {
  const session = new MachineSession();
  finish(session);
  assert.equal(session.state.complete, true);
  close(session.state.tankRemainingMl, 198);
  assert.equal(session.state.storedPucks, 1);
  assert.equal(session.state.priorPucks, 0);
  session.play();
  assert.equal(session.time, 0);
  assert.equal(session.state.storedPucks, 1);
  assert.equal(session.state.priorPucks, 1);
  assert.equal(session.state.currentPuckDeposited, false);
  session.update(1000);
  close(session.state.tankRemainingMl, 96);
  assert.equal(session.state.storedPucks, 2);
  finish(session);
  assert.equal(session.state.waterEmpty, true);
  assert.equal(session.state.phase.id, 'extract');
  assert.equal(session.state.complete, false);
  assert.equal(session.state.tankRemainingMl, 0);
  close(session.state.coffeeMl, 34);
  assert.equal(session.state.storedPucks, 2);
  assert.equal(session.state.priorPucks, 2);
  assert.equal(session.state.currentPuckDeposited, false);
});

test('five espressos fit the tank; the sixth cannot add a puck after running dry', () => {
  const session = new MachineSession('espresso');
  for (let count = 1; count <= 5; count++) {
    finish(session);
    assert.equal(session.state.complete, true);
    assert.equal(session.state.storedPucks, count);
    close(session.state.tankRemainingMl, 300 - 56 * count);
  }
  finish(session);
  assert.equal(session.state.waterEmpty, true);
  close(session.state.coffeeMl, 4);
  assert.equal(session.state.storedPucks, 5);
  assert.equal(session.state.priorPucks, 5);
});

test('changing drinks preserves water and pucks, including an unfinished drink', () => {
  const session = new MachineSession('espresso');
  finish(session);
  session.setDrink('cappuccino');
  assert.equal(session.playing, false);
  assert.equal(session.state.priorPucks, 1);
  close(session.state.tankRemainingMl, 244);
  session.seek(timeAt('milk', .5, 'cappuccino'));
  close(session.state.tankRemainingMl, 232);
  session.setDrink('latte');
  close(session.state.tankRemainingMl, 232);
  assert.equal(session.state.storedPucks, 1);
  finish(session);
  close(session.state.tankRemainingMl, 130);
  assert.equal(session.state.storedPucks, 2);
});

test('rewinding and replaying never refunds water, double-charges it, or duplicates a puck', () => {
  const session = new MachineSession();
  session.seek(timeAt('milk', .5));
  close(session.state.tankRemainingMl, 288);
  session.seek(0).play().update(timeAt('milk', .5));
  close(session.state.tankRemainingMl, 288);
  session.seek(timeAt('extract', .5));
  const remaining = session.state.tankRemainingMl;
  session.seek(timeAt('milk', 0));
  close(session.state.tankRemainingMl, remaining);
  session.seek(timeAt('extract', .5));
  close(session.state.tankRemainingMl, remaining);
  session.seek(session.duration);
  assert.equal(session.state.storedPucks, 1);
  session.seek(timeAt('eject', .5));
  assert.equal(session.state.currentPuckDeposited, true);
  assert.equal(session.state.priorPucks, 0);
  assert.equal(session.state.storedPucks, 1);
  session.seek(session.duration);
  close(session.state.tankRemainingMl, 198);
  assert.equal(session.state.storedPucks, 1);
});

test('puck deposit is counted at its landing threshold, once per run', () => {
  const session = new MachineSession();
  session.seek(timeAt('eject', .849));
  assert.equal(session.state.storedPucks, 0);
  session.seek(timeAt('eject', .851));
  assert.equal(session.state.storedPucks, 1);
  assert.equal(session.state.currentPuckDeposited, true);
  session.seek(timeAt('eject', .849)).seek(timeAt('eject', .851));
  assert.equal(session.state.storedPucks, 1);
});

test('empty tank latches every playback, chapter, seek and drink path until reset', () => {
  const session = new MachineSession('espresso', { tankCapacityMl: 20 });
  finish(session);
  const empty = session.state;
  for (const key of ['grind', 'pump', 'steam', 'milkFlow', 'brewFlow', 'heater', 'preinfusion', 'draining']) {
    assert.equal(empty[key], false, key);
  }
  assert.equal(empty.pressure, 0);
  assert.equal(session.playing, false);
  for (const action of [
    () => session.play(),
    () => session.update(1000),
    () => session.seek(0),
    () => session.seek(session.duration),
    () => session.seek(timeAt('eject', .9, 'espresso')),
    () => session.setDrink('latte'),
    () => session.pause().play(),
  ]) {
    action();
    assert.deepEqual(session.state, empty);
    assert.equal(session.playing, false);
  }
  session.reset().play().update(.1);
  assert.equal(session.state.waterEmpty, false);
  assert.equal(session.state.grind, true);
  assert.equal(session.state.tankRemainingMl, 20);
  assert.equal(session.state.storedPucks, 0);
});

test('depletion lands at the exact instant in steam, flushing, wetting and extraction', () => {
  for (const [drink, capacity, phase, milkMl, coffeeMl] of [
    ['latte', 12, 'milk', 60, 0],
    ['latte', 35, 'condition', 120, 0],
    ['espresso', 8, 'prewet', 0, 0],
    ['espresso', 20, 'extract', 0, 4],
  ]) {
    const session = new MachineSession(drink, { tankCapacityMl: capacity });
    finish(session);
    assert.equal(session.state.phase.id, phase);
    assert.equal(session.state.waterEmpty, true);
    close(session.state.waterUsedMl, capacity);
    close(session.state.milkMl, milkMl);
    close(session.state.coffeeMl, coffeeMl);
    assert.ok(getState(session.time - 1e-7, drink).waterUsedMl < capacity);
    assert.equal(session.state.storedPucks, 0);
  }
});

test('an exactly depleted tank halts before pressure release or puck ejection', () => {
  const session = new MachineSession('espresso', { tankCapacityMl: 56 });
  finish(session);
  assert.equal(session.state.waterEmpty, true);
  close(session.time, timeAt('extract', 1, 'espresso'));
  close(session.state.coffeeMl, 40);
  assert.equal(session.state.storedPucks, 0);
  assert.equal(session.state.complete, false);
});

test('large updates, tiny steps and forward seeks produce the same empty state', () => {
  const large = new MachineSession('latte', { tankCapacityMl: 75 });
  const steps = new MachineSession('latte', { tankCapacityMl: 75 });
  const seek = new MachineSession('latte', { tankCapacityMl: 75 });
  finish(large);
  steps.play();
  while (steps.playing) steps.update(.013);
  seek.seek(seek.duration);
  for (const session of [steps, seek]) {
    close(session.time, large.time);
    close(session.state.coffeeMl, large.state.coffeeMl);
    assert.equal(session.state.storedPucks, large.state.storedPucks);
    assert.equal(session.state.tankRemainingMl, 0);
  }
});

test('rewinding before an exhaustion seek still stops at the correct resource limit', () => {
  const session = new MachineSession('latte', { tankCapacityMl: 75 });
  session.seek(timeAt('prewet', 1));
  close(session.state.tankRemainingMl, 13);
  session.seek(0).seek(session.duration);
  close(session.state.coffeeMl, 13);
  assert.equal(session.state.waterEmpty, true);
  assert.equal(session.state.storedPucks, 0);
});

test('reset alone clears all resources and paused or invalid updates consume nothing', () => {
  const session = new MachineSession();
  const initial = session.state;
  finish(session);
  session.play().seek(timeAt('milk', .5)).pause();
  const paused = session.state;
  session.update(100);
  assert.deepEqual(session.state, paused);
  session.play();
  for (const dt of [-1, NaN, Infinity, 0]) session.update(dt);
  for (const speed of [-1, NaN, Infinity, 0]) {
    session.speed = speed;
    session.update(100);
  }
  assert.deepEqual(session.state, paused);
  session.speed = 2;
  session.reset();
  assert.deepEqual(session.state, initial);
  assert.equal(session.speed, 2);
  assert.equal(session.playing, false);
});
