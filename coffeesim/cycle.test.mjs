import test from 'node:test';
import assert from 'node:assert/strict';
import { Cycle, DRINKS, PHASES, TOTAL_DURATION, getPhases, getState } from './cycle.mjs';

function at(id, fraction = .5, drink = 'latte') {
  const phase = getPhases(drink).find(item => item.id === id);
  return getState(phase.start + phase.duration * fraction, drink);
}

test('schedules are contiguous, immutable and have exact phase boundaries', () => {
  assert.equal(TOTAL_DURATION, 110);
  assert.equal(PHASES, getPhases('latte'));
  for (const drink of Object.keys(DRINKS)) {
    let previousEnd = 0;
    for (const phase of getPhases(drink)) {
      assert.ok(Object.isFrozen(phase));
      assert.equal(phase.start, previousEnd);
      assert.equal(phase.end, phase.start + phase.duration);
      assert.equal(getState(phase.start, drink).phase.id, phase.id);
      if (phase.duration) assert.equal(getState(phase.end - 1e-7, drink).phase.id, phase.id);
      previousEnd = phase.end;
    }
    assert.equal(getState(previousEnd, drink).complete, true);
  }
});

test('reset is truly idle and clears cup, chamber and spent puck', () => {
  const cycle = new Cycle();
  const initial = cycle.state;
  for (const key of ['grind', 'pump', 'steam', 'milkFlow', 'brewFlow', 'preinfusion', 'draining', 'wastePuck', 'complete', 'heater']) {
    assert.equal(initial[key], false, key);
  }
  for (const key of ['coffeeMl', 'milkMl', 'foamMl', 'groundAmount', 'compression', 'ejectProgress', 'pressure', 'puckWetness']) {
    assert.equal(initial[key], 0, key);
  }
  cycle.play();
  cycle.update(.1);
  assert.equal(cycle.state.grind, true);
  cycle.seek(TOTAL_DURATION);
  cycle.reset();
  assert.deepEqual(cycle.state, initial);
});

test('milk finishes before coffee and preinfusion has a real pump-off pause', () => {
  for (const drink of ['latte', 'cappuccino']) {
    for (const id of ['milk', 'condition', 'prewet', 'bloom']) {
      const state = at(id, .5, drink);
      assert.equal(state.brewFlow, false, `${drink}/${id}`);
      assert.equal(state.coffeeMl, 0, `${drink}/${id}`);
    }
    const milk = at('milk', .5, drink);
    assert.equal(milk.steam, true);
    assert.equal(milk.milkFlow, true);
    assert.equal(milk.compression, 1);
    assert.equal(milk.groundAmount, 1);
    assert.equal(milk.heaterTemp, 130);
    const wetting = at('prewet', .3, drink);
    assert.equal(wetting.pump, true);
    assert.ok(wetting.puckWetness > 0 && wetting.puckWetness < 1);
    const bloom = at('bloom', .5, drink);
    assert.equal(bloom.pump, false);
    assert.equal(bloom.pressure, 0);
    assert.equal(bloom.puckWetness, 1);
    assert.equal(bloom.milkAmount, 1);
    assert.equal(bloom.heaterTemp, 93);
    const extraction = at('extract', .5, drink);
    assert.equal(extraction.brewFlow, true);
    assert.equal(extraction.milkFlow, false);
    assert.ok(extraction.coffeeMl > 0);
    assert.equal(extraction.pressure, 9);
  }
});

test('espresso bypasses every milk and steam operation', () => {
  const duration = getPhases('espresso').at(-1).start;
  assert.ok(!getPhases('espresso').some(phase => ['milk', 'condition'].includes(phase.id)));
  for (let time = 0; time <= duration; time += .25) {
    const state = getState(time, 'espresso');
    for (const key of ['milkAmount', 'foamAmount', 'milkMl', 'foamMl', 'targetMilkMl', 'targetFoamMl']) assert.equal(state[key], 0, key);
    assert.equal(state.milkFlow, false);
    assert.equal(state.steam, false);
    assert.equal(state.carafeLevel, .9);
    assert.ok(state.heaterTemp <= 93);
  }
});

test('puck is retained until the eject mechanism drops it, after pressure release', () => {
  assert.equal(at('depressurize', .5).compression, 1);
  assert.ok(at('depressurize', .5).pressure > 0);
  assert.equal(at('eject', .1).pressure, 0);
  assert.equal(at('eject', .1).groundAmount, 1);
  assert.equal(at('eject', .1).wastePuck, false);
  assert.equal(at('eject', .8).wastePuck, false);
  assert.equal(at('eject', .9).wastePuck, true);
  assert.equal(at('eject', .9).groundAmount, 0);
  const returned = at('return', .5);
  assert.equal(returned.compression, 0);
  assert.equal(returned.brewPosition, 0);
  assert.equal(returned.ejectProgress, 1);
  assert.equal(returned.wastePuck, true);
});

test('all quantities are bounded and cup volumes and reservoir use are monotonic', () => {
  const fractions = ['progress', 'phaseProgress', 'groundAmount', 'compression', 'brewPosition', 'milkAmount', 'coffeeAmount', 'foamAmount', 'tankLevel', 'carafeLevel', 'puckWetness', 'ejectProgress'];
  for (const drink of Object.keys(DRINKS)) {
    let previous = getState(0, drink);
    for (let tick = 0; tick <= previous.duration * 10; tick++) {
      const state = getState(tick / 10, drink);
      for (const key of fractions) assert.ok(state[key] >= 0 && state[key] <= 1, `${drink}: ${key}=${state[key]}`);
      assert.ok(state.pressure >= 0 && state.pressure <= 9);
      for (const key of ['coffeeMl', 'milkMl', 'foamMl', 'waterUsedMl']) assert.ok(state[key] >= previous[key]);
      for (const key of ['tankLevel', 'carafeLevel']) assert.ok(state[key] <= previous[key]);
      previous = state;
    }
    assert.equal(previous.coffeeMl, DRINKS[drink].coffeeMl);
    assert.equal(previous.milkMl, DRINKS[drink].milkMl);
    assert.equal(previous.foamMl, DRINKS[drink].foamMl);
  }
});

test('absolute seeking restores earlier quantities, positions and all flags deterministically', () => {
  const cycle = new Cycle();
  cycle.play();
  for (let count = 0; count < 147; count++) cycle.update(.5);
  const expected = getState(73.5);
  assert.deepEqual(cycle.state, expected);
  cycle.seek(TOTAL_DURATION);
  assert.equal(cycle.state.wastePuck, true);
  cycle.seek(73.5);
  assert.deepEqual(cycle.state, expected);
  assert.equal(cycle.state.wastePuck, false);
  cycle.seek(1);
  assert.equal(cycle.state.coffeeMl, 0);
  assert.equal(cycle.state.milkMl, 0);
  assert.equal(cycle.state.puckWetness, 0);
  getState(40).groundAmount = 99;
  assert.equal(getState(40).groundAmount, 1);
});

test('pause, playback speed, completion, replay and drink changes are predictable', () => {
  const cycle = new Cycle();
  cycle.update(10);
  assert.equal(cycle.time, 0);
  cycle.play();
  cycle.speed = 2;
  cycle.update(10);
  assert.equal(cycle.time, 20);
  cycle.pause();
  const paused = cycle.state;
  cycle.update(5);
  assert.deepEqual(cycle.state, paused);
  cycle.play();
  cycle.update(1000);
  assert.equal(cycle.playing, false);
  assert.equal(cycle.time, TOTAL_DURATION);
  assert.equal(cycle.state.complete, true);
  for (const key of ['grind', 'pump', 'steam', 'milkFlow', 'brewFlow', 'draining', 'preinfusion', 'heater']) assert.equal(cycle.state[key], false, key);
  cycle.play();
  assert.equal(cycle.time, 0);
  assert.equal(cycle.playing, true);
  cycle.setDrink('espresso');
  assert.equal(cycle.time, 0);
  assert.equal(cycle.playing, false);
  assert.equal(cycle.drink, 'espresso');
  assert.equal(cycle.state.targetMilkMl, 0);
});

test('invalid input never creates NaN or reverses playback', () => {
  assert.equal(getState(-10).time, 0);
  assert.equal(getState(NaN).time, 0);
  assert.equal(getState('nonsense').time, 0);
  assert.equal(getState(Infinity).time, TOTAL_DURATION);
  assert.equal(getState(0, 'nonsense').drink, 'latte');
  const cycle = new Cycle();
  cycle.play();
  cycle.update(10);
  for (const dt of [-5, Infinity, NaN, 0]) cycle.update(dt);
  assert.equal(cycle.time, 10);
  for (const speed of [-1, 0, Infinity, NaN]) { cycle.speed = speed; cycle.update(1); }
  assert.equal(cycle.time, 10);
});
