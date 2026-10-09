import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, TOTAL_DURATION, PROGRAM_MINUTES, sampleCycle, Cycle } from './cycle.mjs';

const at = (id, fraction = .5) => {
  const phase = PHASES.find(item => item.id === id);
  return sampleCycle(phase.start + phase.duration * fraction);
};

test('the timeline covers the whole programme and selects exact boundaries', () => {
  assert.equal(TOTAL_DURATION, 210);
  assert.equal(PROGRAM_MINUTES, 140);
  assert.equal(PHASES[0].start, 0);
  for (const [index, phase] of PHASES.entries()) {
    assert.equal(sampleCycle(phase.start).phase.id, phase.id);
    if (index) assert.equal(phase.start, PHASES[index - 1].end);
  }
  assert.equal(sampleCycle(TOTAL_DURATION).minutesElapsed, PROGRAM_MINUTES);
});

test('water stays in the sump; pumping, chemistry and hygiene states are bounded', () => {
  const fractions = ['waterLevel', 'soil', 'wetness', 'detergent', 'detergentTablet', 'rinseAid',
    'pocketLevel', 'filterSoil', 'spray', 'evaporation', 'condensation', 'heatRecovery'];
  let previous = sampleCycle(0);
  for (let time = 0; time <= TOTAL_DURATION; time += .1) {
    const state = sampleCycle(time);
    for (const key of fractions) assert.ok(state[key] >= 0 && state[key] <= 1, `${key} at ${time}`);
    for (const key of ['waterTemp', 'dishTemp', 'wallTemp', 'pocketTemp']) {
      assert.ok(state[key] >= 20 && state[key] <= 65, `${key} at ${time}`);
    }
    assert.ok(state.soil <= previous.soil + 1e-9, `soil reappeared at ${time}`);
    assert.ok(state.waterUsed >= previous.waterUsed - 1e-9, `fresh-water counter reversed at ${time}`);
    if (state.spray > 0) assert.ok(state.waterLevel > .1, `dry pump at ${time}`);
    if (state.drain) assert.equal(state.spray, 0, `spraying during drain at ${time}`);
    previous = state;
  }
});

test('prewash has no detergent; the main wash dissolves the tab and removes soil', () => {
  assert.equal(at('prewash').detergentReleased, false);
  assert.equal(at('prewash').detergent, 0);
  assert.equal(at('prewash').detergentTablet, 1);
  const washEarly = at('wash', .05);
  const washLate = at('wash', .95);
  assert.ok(washLate.soil < washEarly.soil / 10);
  assert.equal(washLate.detergentTablet, 0);
  assert.equal(washLate.detergentCompartmentOpen, true);
  assert.ok(at('drain-wash', .95).detergent < washLate.detergent);
  assert.equal(at('final-rinse').detergent, 0);
});

test('the isolated pocket recovers heat, supplies the rinse, then refills cold', () => {
  assert.ok(at('wash', .8).pocketTemp > at('wash', .3).pocketTemp);
  assert.equal(at('wash', .8).pocketLevel, 1);
  const transferStart = at('rinse', .01);
  const transferEnd = at('rinse', .21);
  assert.ok(transferEnd.pocketLevel < transferStart.pocketLevel);
  assert.ok(transferEnd.waterLevel > transferStart.waterLevel);
  assert.equal(transferStart.waterUsed, transferEnd.waterUsed);
  assert.equal(transferStart.pocketRelease, true);
  assert.equal(at('rinse', .5).pocketLevel, 0);
  assert.ok(at('drain-final', .9).pocketLevel > .8);
  assert.equal(at('drain-final', .9).pocketTemp, 20);
});

test('hot final rinse stores heat and stationary-arm drying condenses on the cool wall', () => {
  const hot = at('final-rinse', .95);
  assert.ok(hot.dishTemp > 60);
  assert.equal(hot.rinseAid, 1);
  const drying = at('dry', .5);
  assert.equal(drying.spray, 0);
  assert.equal(drying.heater, false);
  assert.ok(drying.dishTemp > drying.wallTemp);
  assert.ok(drying.condensation > 0);
  assert.ok(drying.wetness < at('dry', .1).wetness);
  const complete = sampleCycle(TOTAL_DURATION);
  assert.equal(complete.soil, 0);
  assert.equal(complete.wetness, 0);
  assert.equal(complete.waterLevel, 0);
  assert.ok(complete.filterSoil > 0, 'coarse food still needs manual filter cleaning');
  assert.equal(complete.waterUsed, 15);
});

test('seeking produces the same state as playback, independent of sampling history', () => {
  const cycle = new Cycle();
  cycle.play();
  for (let n = 0; n < 127; n++) cycle.advance(.5);
  assert.deepEqual(cycle.state, sampleCycle(63.5));
  cycle.seek(180);
  cycle.seek(63.5);
  assert.deepEqual(cycle.state, sampleCycle(63.5));
  const dirtyInitial = sampleCycle(0);
  sampleCycle(100).soil = 99;
  assert.deepEqual(sampleCycle(0), dirtyInitial);
});

test('spray rotation integrates intensity continuously and freezes when the arms stop', () => {
  let previous = sampleCycle(0).sprayTime;
  const step = .01;
  let numericIntegral = 0;
  for (let time = step; time < TOTAL_DURATION; time += step) {
    const state = sampleCycle(time);
    numericIntegral += sampleCycle(time - step / 2).spray * step;
    assert.ok(state.sprayTime >= previous, `rotation reversed at ${time}`);
    assert.ok(Math.abs(state.sprayTime - numericIntegral) < .011, `wrong spray integral at ${time}`);
    previous = state.sprayTime;
  }
  for (const phase of PHASES) {
    const before = sampleCycle(phase.start - 1e-6).sprayTime;
    const after = sampleCycle(phase.start + 1e-6).sprayTime;
    assert.ok(after - before < 3e-6, `orientation jumped entering ${phase.id}`);
  }
  for (const id of ['drain-prewash', 'drain-wash', 'drain-rinse', 'drain-final', 'dry']) {
    assert.equal(at(id, .01).sprayTime, at(id, .99).sprayTime, `arms rotate during ${id}`);
  }
  const cycle = new Cycle();
  cycle.play();
  cycle.seek(PHASES.find(phase => phase.id === 'wash').start + 10);
  cycle.pause();
  const pausedAngle = cycle.state.sprayTime;
  cycle.advance(10);
  assert.equal(cycle.state.sprayTime, pausedAngle);
  cycle.seek(TOTAL_DURATION);
  cycle.seek(PHASES.find(phase => phase.id === 'wash').start + 10);
  assert.equal(cycle.state.sprayTime, pausedAngle);
});

test('pause, completion, replay and reset cannot advance accidentally', () => {
  const cycle = new Cycle();
  cycle.advance(10);
  assert.equal(cycle.time, 0);
  cycle.play();
  cycle.advance(30);
  cycle.pause();
  cycle.advance(30);
  assert.equal(cycle.time, 30);
  cycle.play();
  cycle.advance(1000);
  assert.equal(cycle.time, TOTAL_DURATION);
  assert.equal(cycle.playing, false);
  assert.equal(cycle.state.complete, true);
  cycle.play();
  assert.equal(cycle.time, 0);
  assert.equal(cycle.playing, true);
  cycle.advance(20);
  cycle.reset();
  assert.equal(cycle.playing, false);
  assert.deepEqual(cycle.state, sampleCycle(0));
});

test('invalid input is contained and negative deltas never reverse playback', () => {
  assert.equal(sampleCycle(-100).time, 0);
  assert.equal(sampleCycle(Infinity).time, TOTAL_DURATION);
  assert.equal(sampleCycle(NaN).time, 0);
  assert.equal(sampleCycle('invalid').time, 0);
  const cycle = new Cycle();
  cycle.play();
  cycle.advance(10);
  for (const delta of [-1, Infinity, NaN]) cycle.advance(delta);
  assert.equal(cycle.time, 10);
});
