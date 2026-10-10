import test from 'node:test';
import assert from 'node:assert/strict';
import { Cycle, DRINKS, getPhases, getState } from './cycle.mjs';
import { BREW_GEOMETRY as G, getBrewMechanics } from './brew-mechanics.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
function at(id, progress = .5, drink = 'latte') {
  const phase = getPhases(drink).find(item => item.id === id);
  return getState(phase.start + phase.duration * progress, drink);
}
const mechanicsAt = (id, progress, drink) => getBrewMechanics(at(id, progress, drink));

test('open chamber collects grounds; closed chamber presses them against the upper sieve', () => {
  const empty = getBrewMechanics(getState(0));
  assert.equal(empty.puckLocation, 'none');
  assert.equal(empty.doseHeight, 0);
  assert.equal(empty.driveTurning, false);
  const filled = mechanicsAt('grind', 1);
  close(filled.chamberY, G.fillY);
  close(filled.chamberZ, G.fillZ);
  close(filled.doseHeight, G.looseDoseHeight);
  const closed = mechanicsAt('compress', 1);
  close(closed.chamberY, G.closedY);
  close(closed.chamberZ, G.closedZ);
  close(closed.doseHeight, G.compressedDoseHeight);
  close(closed.puckPosition[1] + closed.doseHeight / 2, G.upperSieveY);
});

test('chamber clears fixed upper piston before sliding; dry grounds compress only at sieve contact', () => {
  for (let i = 0; i <= 100; i++) {
    const m = mechanicsAt('compress', i / 100);
    if (m.chamberZ > G.closedZ + 1e-8) close(m.chamberY, G.fillY);
    assert.ok(m.puckPosition[1] + m.doseHeight / 2 <= G.upperSieveY + 1e-9);
    if (m.doseHeight < G.looseDoseHeight - 1e-8) close(m.puckPosition[1] + m.doseHeight / 2, G.upperSieveY);
    const open = mechanicsAt('eject', i / 100 * .30);
    if (open.chamberZ > G.closedZ + 1e-8) close(open.chamberY, G.fillY);
    close(open.doseHeight, G.compressedDoseHeight);
    close(open.pistonLift, 0);
  }
});

test('puck lifts above the rim before the wire approaches, then moves only on wire contact', () => {
  const parked = mechanicsAt('eject', .30);
  close(parked.puckPosition[2], G.fillZ);
  close(parked.pistonLift, 0);
  const lifted = mechanicsAt('eject', .43);
  close(lifted.puckPosition[1] - lifted.doseHeight / 2, G.fillY + G.rimY + .0175);
  close(lifted.wiperZ, G.wiperParkZ);
  assert.ok(G.wiperY > lifted.puckPosition[1] - lifted.doseHeight / 2);
  assert.ok(G.wiperY < lifted.puckPosition[1] + lifted.doseHeight / 2);
  for (let i = 0; i <= 100; i++) {
    const approach = mechanicsAt('eject', .43 + .04 * i / 100);
    close(approach.puckPosition[2], G.fillZ);
    assert.ok(approach.wiperZ >= approach.puckPosition[2] + G.puckRadius - 1e-9);
    const sweep = mechanicsAt('eject', .47 + .17 * i / 100);
    close(sweep.wiperZ, sweep.puckPosition[2] + G.puckRadius);
    close(sweep.puckPosition[1], lifted.puckPosition[1]);
  }
});

test('puck clears the cup before falling and lands before piston and wire reset', () => {
  const clear = mechanicsAt('eject', .65);
  assert.equal(clear.puckLocation, 'sweeping');
  assert.ok(clear.puckPosition[2] + G.puckRadius < G.fillZ - G.rimHalfDepth);
  const falling = mechanicsAt('eject', .75);
  assert.equal(falling.puckLocation, 'falling');
  assert.ok(falling.puckPosition[1] < clear.puckPosition[1]);
  close(falling.pistonLift, G.liftHeight);
  close(falling.wiperZ, G.wiperEndZ);
  const landed = mechanicsAt('eject', .85);
  assert.equal(landed.puckLocation, 'bin');
  assert.deepEqual(landed.puckPosition, [0, G.binY, G.binZ]);
  const ready = mechanicsAt('eject', 1);
  close(ready.pistonLift, 0);
  close(ready.wiperZ, G.wiperParkZ);
  close(ready.chamberY, G.fillY);
  close(ready.chamberZ, G.fillZ);
});

test('falling puck remains clear of both the square rim and round chamber wall', () => {
  for (let i = 0; i < 200; i++) {
    const m = mechanicsAt('eject', .66 + .19 * i / 200);
    const puckTop = m.puckPosition[1] + m.doseHeight / 2;
    const puckFront = m.puckPosition[2] + G.puckRadius;
    if (puckTop >= G.fillY + G.rimY - .025) {
      assert.ok(puckFront < G.fillZ - G.rimHalfDepth, 'puck must stay behind square rim until below its underside');
    }
    if (puckTop >= G.fillY + .085 - .38 / 2) {
      assert.ok(puckFront < G.fillZ - G.chamberRadius, 'puck must stay behind chamber until below its floor');
    }
  }
});

test('both constant-length link pairs can reach their followers throughout every cycle', () => {
  for (const drink of Object.keys(DRINKS)) {
    const duration = getPhases(drink).at(-1).start;
    for (let tick = 0; tick <= duration * 50; tick++) {
      const m = getBrewMechanics(getState(tick / 50, drink));
      const c = Math.cos(m.driveAngle), s = Math.sin(m.driveAngle);
      const chamberDistance = Math.hypot(m.chamberY - .08 - (-.08 + .13 * c), m.chamberZ - (.10 - .13 * s));
      const wiperDistance = Math.hypot(.37 - (-.08 + .10 * c), m.wiperZ + .24 - (.10 - .10 * s));
      assert.ok(chamberDistance > .0001 && chamberDistance < 2 * .57, `carriage links at ${drink}/${tick / 50}`);
      assert.ok(wiperDistance > .0001 && wiperDistance < 2 * .75, `wire links at ${drink}/${tick / 50}`);
    }
  }
});

test('mechanical movement starts only with pump off and pressure released for every recipe', () => {
  for (const drink of Object.keys(DRINKS)) {
    for (const phase of ['compress', 'eject', 'return']) {
      for (let i = 1; i < 100; i++) {
        const state = at(phase, i / 100, drink);
        const m = getBrewMechanics(state);
        assert.equal(state.pump, false, `${drink}/${phase}`);
        assert.equal(state.pressure, 0, `${drink}/${phase}`);
        assert.equal(m.driveTurning, true);
      }
    }
    for (const phase of ['heat', 'prewet', 'bloom', 'extract', 'depressurize']) {
      const m = mechanicsAt(phase, .5, drink);
      assert.equal(m.driveTurning, false);
      close(m.chamberY, G.closedY);
      close(m.chamberZ, G.closedZ);
    }
  }
});

test('geometry and puck positions remain continuous across pickup, sweep, fall and all phase boundaries', () => {
  const numeric = ['chamberY', 'chamberZ', 'pistonLift', 'doseHeight', 'wiperTravel', 'wiperZ', 'driveAngle'];
  for (const drink of Object.keys(DRINKS)) {
    const phases = getPhases(drink);
    const eject = phases.find(phase => phase.id === 'eject');
    const times = [
      ...phases.map(phase => phase.start),
      ...[.18, .30, .43, .47, .64, .66, .85, .88, .94, 1].map(p => eject.start + eject.duration * p),
    ];
    for (const time of times) {
      const before = getBrewMechanics(getState(time - 1e-7, drink));
      const after = getBrewMechanics(getState(time + 1e-7, drink));
      for (const key of numeric) close(before[key], after[key], 1e-5);
      for (let axis = 0; axis < 3; axis++) close(before.puckPosition[axis], after.puckPosition[axis], 1e-5);
    }
  }
});

test('rewind, replay and reset restore identical mechanics without accumulated animation state', () => {
  const cycle = new Cycle();
  const initial = getBrewMechanics(cycle.state);
  const samples = [.1, .32, .445, .55, .70, .9].map(progress => at('eject', progress));
  const expected = samples.map(state => getBrewMechanics(state));
  for (let i = samples.length - 1; i >= 0; i--) {
    cycle.seek(samples[i].time);
    assert.deepEqual(getBrewMechanics(cycle.state), expected[i]);
  }
  cycle.seek(cycle.duration);
  close(getBrewMechanics(cycle.state).driveAngle, 2 * Math.PI);
  cycle.reset();
  assert.deepEqual(getBrewMechanics(cycle.state), initial);
});
