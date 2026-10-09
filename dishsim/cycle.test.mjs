import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, TOTAL_DURATION, PROGRAM_MINUTES, COOLING_DURATION, DOOR_MOTION_DURATION, SPRAY_ARM_INTERVAL,
  DETERGENT_LID_DURATION, DETERGENT_DROP_DURATION, sampleCycle, Cycle } from './cycle.mjs';

const at = (id, fraction = .5) => {
  const phase = PHASES.find(item => item.id === id);
  return sampleCycle(phase.start + phase.duration * fraction);
};

test('the timeline covers the whole programme and selects exact boundaries', () => {
  assert.equal(TOTAL_DURATION, 212);
  assert.equal(PROGRAM_MINUTES, 140);
  assert.equal(PHASES[0].start, 0);
  for (const [index, phase] of PHASES.entries()) {
    assert.equal(sampleCycle(phase.start).phase.id, phase.id);
    if (index) assert.equal(phase.start, PHASES[index - 1].end);
  }
  assert.equal(sampleCycle(TOTAL_DURATION).minutesElapsed, PROGRAM_MINUTES);
});

test('water stays in the sump; pumping, chemistry and hygiene states are bounded', () => {
  const fractions = ['waterLevel', 'soil', 'waterSoil', 'wetness', 'detergent', 'detergentTablet', 'rinseAid',
    'pocketLevel', 'filterSoil', 'spray', 'sprayLower', 'sprayUpper', 'evaporation', 'condensation', 'heatRecovery', 'doorOpen',
    'detergentLidOpen', 'detergentDropProgress'];
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
  assert.equal(at('main-fill', .99).detergentReleased, false);
  assert.equal(at('main-fill', .99).detergentCompartmentOpen, false);
  assert.equal(at('wash', 0).detergentReleased, false);
  assert.equal(at('wash', 0).detergentCompartmentOpen, true);
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

test('the lid clears the solid tab before release and dissolution waits until it lands in water', () => {
  const wash = PHASES.find(phase => phase.id === 'wash');
  const release = wash.start + DETERGENT_LID_DURATION;
  const landing = wash.start + (DETERGENT_LID_DURATION + DETERGENT_DROP_DURATION);
  const dissolved = wash.start + wash.duration * .3;
  const stored = sampleCycle(wash.start - .01);
  assert.equal(stored.detergentLidOpen, 0);
  assert.equal(stored.detergentDropProgress, 0);
  assert.equal(stored.detergentTabletStage, 'stored');
  const opening = sampleCycle(wash.start + DETERGENT_LID_DURATION / 2);
  assert.ok(opening.detergentLidOpen > 0 && opening.detergentLidOpen < 1);
  assert.equal(opening.detergentReleased, false);
  assert.equal(opening.detergentTabletStage, 'stored');
  const released = sampleCycle(release);
  assert.equal(released.detergentLidOpen, 1);
  assert.equal(released.detergentReleased, true);
  assert.equal(released.detergentDropProgress, 0);
  assert.equal(released.detergentTabletStage, 'falling');
  const falling = sampleCycle(release + DETERGENT_DROP_DURATION / 2);
  assert.ok(falling.detergentDropProgress > 0 && falling.detergentDropProgress < 1);
  assert.equal(falling.detergentTabletStage, 'falling');
  for (const state of [stored, opening, released, falling, sampleCycle(landing - 1e-6)]) {
    assert.equal(state.detergentTablet, 1, `tab shrank before landing at ${state.time}`);
    assert.equal(state.detergent, 0, `detergent reached water before landing at ${state.time}`);
    assert.equal(state.detergentInWater, false);
  }
  const landed = sampleCycle(landing);
  assert.equal(landed.detergentDropProgress, 1);
  assert.equal(landed.detergentInWater, true);
  assert.equal(landed.detergentTabletStage, 'in-water');
  assert.equal(landed.detergentTablet, 1);
  assert.equal(landed.detergent, 0);
  assert.ok(landed.waterLevel > .1, 'tab must land in water');
  const dissolving = sampleCycle((landing + dissolved) / 2);
  assert.ok(dissolving.detergentTablet > 0 && dissolving.detergentTablet < 1);
  assert.ok(dissolving.detergent > 0 && dissolving.detergent < 1);
  assert.equal(dissolving.detergentTabletStage, 'in-water');
  assert.equal(sampleCycle(dissolved).detergentTabletStage, 'dissolved');
  for (const phase of PHASES.filter(phase => phase.start >= dissolved)) {
    const state = sampleCycle(phase.start);
    assert.equal(state.detergentLidOpen, 1);
    assert.equal(state.detergentDropProgress, 1);
    assert.equal(state.detergentReleased, true);
    assert.equal(state.detergentInWater, true);
    assert.equal(state.detergentTablet, 0);
    assert.equal(state.detergentTabletStage, 'dissolved');
  }
});

test('lid opening, tab falling and dissolution remain continuous at their boundaries', () => {
  const wash = PHASES.find(phase => phase.id === 'wash');
  const release = wash.start + DETERGENT_LID_DURATION;
  for (const boundary of [wash.start, release, wash.start + (DETERGENT_LID_DURATION + DETERGENT_DROP_DURATION), wash.start + wash.duration * .3]) {
    const before = sampleCycle(boundary - 1e-6);
    const after = sampleCycle(boundary + 1e-6);
    for (const key of ['detergentLidOpen', 'detergentDropProgress', 'detergentTablet', 'detergent']) {
      assert.ok(Math.abs(after[key] - before[key]) < 1e-5, `${key} jumped at ${boundary}`);
    }
  }
});

test('tab motion and dissolution pause, seek and reset with deterministic programme time', () => {
  const wash = PHASES.find(phase => phase.id === 'wash');
  const cycle = new Cycle();
  for (const offset of [DETERGENT_LID_DURATION / 2,
    DETERGENT_LID_DURATION + DETERGENT_DROP_DURATION / 2, wash.duration * .15]) {
    const target = wash.start + offset;
    cycle.seek(target - .125);
    cycle.play();
    cycle.advance(.125);
    const expected = sampleCycle(target);
    assert.deepEqual(cycle.state, expected);
    cycle.pause();
    cycle.advance(10);
    assert.deepEqual(cycle.state, expected);
    cycle.seek(TOTAL_DURATION);
    cycle.seek(target);
    assert.deepEqual(cycle.state, expected);
    cycle.reset();
    assert.equal(cycle.state.detergentTabletStage, 'stored');
    assert.equal(cycle.state.detergentTablet, 1);
    assert.equal(cycle.state.detergentLidOpen, 0);
    assert.equal(cycle.state.detergentDropProgress, 0);
    assert.equal(cycle.state.detergentReleased, false);
    assert.equal(cycle.state.detergentInWater, false);
  }
});

test('soil moves off dishes into each water filling and fresh rinses do not inherit all removed dirt', () => {
  const early = at('wash', .1);
  const late = at('wash', .9);
  assert.ok(late.soil < early.soil);
  assert.ok(late.waterSoil > early.waterSoil);
  assert.ok(at('prewash', .9).waterSoil > at('prewash', .1).waterSoil);
  assert.equal(at('drain-wash', .9).waterSoil, at('drain-wash', .1).waterSoil,
    'draining less water must not pretend the remaining water becomes clean');
  assert.ok(at('drain-wash', .9).waterLevel < at('drain-wash', .1).waterLevel);
  assert.equal(at('wash', .22).waterSoil, 0, 'early dissolved detergent must have a clear violet interval');
  assert.ok(at('wash', .22).detergent > .6);
  assert.equal(at('main-fill').waterSoil, 0);
  assert.ok(at('rinse').waterSoil < .05);
  assert.equal(at('final-rinse').waterSoil, 0);
  assert.equal(at('final-rinse').soil, 0);
  assert.equal(at('dry').waterSoil, 0);
  for (const phase of PHASES) {
    const before = sampleCycle(phase.start - 1e-6).waterSoil;
    const after = sampleCycle(phase.start + 1e-6).waterSoil;
    if (sampleCycle(phase.start).waterLevel > .01) {
      assert.ok(Math.abs(after - before) < 1e-5, `water pollution jumped in a filled sump entering ${phase.id}`);
    }
  }
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
  for (const id of ['close-door', 'drain-prewash', 'drain-wash', 'drain-rinse', 'drain-final', 'dry', 'open-door']) {
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

test('the water diverter supplies only one arm and reaches both baskets in every spraying phase', () => {
  const supplied = new Map();
  for (let tick = 0; tick <= TOTAL_DURATION * 100; tick++) {
    const state = sampleCycle(tick / 100);
    assert.equal(state.sprayLower + state.sprayUpper, state.spray);
    assert.equal(state.sprayTimeLower + state.sprayTimeUpper, state.sprayTime);
    assert.ok(state.sprayLower === 0 || state.sprayUpper === 0, `both arms supplied at ${state.time}`);
    if (state.spray > 0) {
      assert.equal(state.activeSprayArm, state.sprayLower > 0 ? 'lower' : 'upper');
      if (!supplied.has(state.phase.id)) supplied.set(state.phase.id, new Set());
      supplied.get(state.phase.id).add(state.activeSprayArm);
    } else {
      assert.equal(state.activeSprayArm, null);
    }
  }
  assert.deepEqual([...supplied.keys()], ['prewash', 'wash', 'rinse', 'final-rinse']);
  for (const [id, arms] of supplied) assert.deepEqual(arms, new Set(['lower', 'upper']), id);
});

test('alternation starts with actual spraying, preserves angles at every switch and freezes the inactive arm', () => {
  for (const [id, fraction] of [['prewash', 0], ['wash', 0], ['rinse', .22], ['final-rinse', .2]]) {
    const phase = PHASES.find(item => item.id === id);
    const start = phase.start + phase.duration * fraction;
    assert.equal(sampleCycle(start + .01).activeSprayArm, 'lower', id);
    if (fraction) {
      assert.equal(sampleCycle(start - .01).activeSprayArm, null);
      assert.equal(sampleCycle(start - .01).sprayTimeLower, sampleCycle(phase.start).sprayTimeLower);
      assert.equal(sampleCycle(start - .01).sprayTimeUpper, sampleCycle(phase.start).sprayTimeUpper);
    }
    for (let index = 0; start + index * SPRAY_ARM_INTERVAL < phase.end; index++) {
      const boundary = start + index * SPRAY_ARM_INTERVAL;
      const end = Math.min(phase.end, boundary + SPRAY_ARM_INTERVAL);
      const arm = index % 2 === 0 ? 'lower' : 'upper';
      const frozen = arm === 'lower' ? 'sprayTimeUpper' : 'sprayTimeLower';
      const moving = arm === 'lower' ? 'sprayTimeLower' : 'sprayTimeUpper';
      const early = sampleCycle(boundary + (end - boundary) * .1);
      const late = sampleCycle(boundary + (end - boundary) * .9);
      assert.equal(early.activeSprayArm, arm);
      assert.equal(late.activeSprayArm, arm);
      assert.equal(early[frozen], late[frozen], `${id}: inactive ${frozen} moved`);
      assert.ok(late[moving] > early[moving]);
      if (index) {
        assert.equal(sampleCycle(boundary).activeSprayArm, arm, `${id}: late switch at ${boundary}`);
        for (const key of ['sprayTimeLower', 'sprayTimeUpper']) {
          const delta = sampleCycle(boundary + 1e-6)[key] - sampleCycle(boundary - 1e-6)[key];
          assert.ok(delta >= 0 && delta < 3e-6, `${id}: ${key} jumped at ${boundary}`);
        }
      }
    }
  }
});

test('each arm has the correct integrated rotation including ramps, with no history or speed dependence', () => {
  const numeric = { lower: 0, upper: 0 };
  const step = .01;
  for (let tick = 1; tick <= TOTAL_DURATION / step; tick++) {
    const state = sampleCycle(tick * step);
    const midpoint = sampleCycle((tick - .5) * step);
    for (const arm of ['lower', 'upper']) {
      const suffix = arm === 'lower' ? 'Lower' : 'Upper';
      numeric[arm] += midpoint[`spray${suffix}`] * step;
      assert.ok(Math.abs(state[`sprayTime${suffix}`] - numeric[arm]) < .011,
        `wrong ${arm} spray integral at ${state.time}`);
    }
  }
  const phase = PHASES.find(item => item.id === 'wash');
  const cycle = new Cycle();
  cycle.seek(phase.start + SPRAY_ARM_INTERVAL - .5);
  cycle.play();
  cycle.advance(1);
  assert.equal(cycle.state.activeSprayArm, 'upper');
  assert.deepEqual(cycle.state, sampleCycle(phase.start + SPRAY_ARM_INTERVAL + .5));
  cycle.pause();
  const paused = cycle.state;
  cycle.advance(10);
  assert.deepEqual(cycle.state, paused);
  cycle.seek(TOTAL_DURATION);
  cycle.seek(paused.time);
  assert.deepEqual(cycle.state, paused);
  cycle.play();
  cycle.advance(SPRAY_ARM_INTERVAL * 3);
  assert.deepEqual(cycle.state, sampleCycle(paused.time + SPRAY_ARM_INTERVAL * 3));
  cycle.reset();
  assert.equal(cycle.state.activeSprayArm, null);
  assert.equal(cycle.state.sprayTimeLower, 0);
  assert.equal(cycle.state.sprayTimeUpper, 0);
});

test('water, pumps and heater wait for a fully closed door and remain off while opening', () => {
  const hydraulicFlags = ['fill', 'drain', 'circulating', 'pocketFilling', 'pocketRelease', 'heater'];
  for (let index = 0; index < 100; index++) {
    const fraction = index / 100;
    const closing = at('close-door', fraction);
    const opening = at('open-door', fraction);
    for (const state of [closing, opening]) {
      for (const flag of hydraulicFlags) assert.equal(state[flag], false, `${flag} active while ${state.phase.id}`);
      assert.equal(state.spray, 0);
      assert.equal(state.waterLevel, 0);
      assert.equal(state.evaporation, 0);
      assert.equal(state.condensation, 0);
      assert.equal(state.cooling, false);
      assert.equal(state.complete, false);
    }
    assert.equal(closing.pocketLevel, 0);
    assert.equal(closing.waterUsed, 0);
    assert.equal(closing.waterTemp, 20);
    assert.equal(closing.dishTemp, 20);
    assert.equal(opening.waterUsed, 15);
    assert.equal(opening.pocketLevel, 1);
    assert.equal(opening.dishTemp, 40);
  }
  const fillStart = PHASES.find(phase => phase.id === 'fill').start;
  assert.equal(fillStart, DOOR_MOTION_DURATION);
  assert.equal(sampleCycle(fillStart).doorOpen, 0);
  assert.equal(sampleCycle(fillStart).fill, true);
  assert.ok(sampleCycle(fillStart + .1).waterUsed > 0);
  assert.equal(sampleCycle(TOTAL_DURATION).doorOpen, 1);
  assert.equal(sampleCycle(TOTAL_DURATION).cooling, true);
});

test('door opening exactly reverses the continuous monotonic closing movement', () => {
  const close = PHASES.find(phase => phase.id === 'close-door');
  const open = PHASES.find(phase => phase.id === 'open-door');
  assert.equal(close.duration, DOOR_MOTION_DURATION);
  assert.equal(open.duration, close.duration);
  assert.equal(close.minutes, 0);
  assert.equal(open.minutes, 0);
  assert.equal(close.start, 0);
  assert.equal(open.start, TOTAL_DURATION - DOOR_MOTION_DURATION);
  let previousClose = 1;
  let previousOpen = 0;
  for (let index = 0; index <= 100; index++) {
    const p = index / 100;
    const closing = at('close-door', p).doorOpen;
    const opening = at('open-door', p).doorOpen;
    assert.ok(closing <= previousClose);
    assert.ok(opening >= previousOpen);
    assert.ok(Math.abs(closing - at('open-door', 1 - p).doorOpen) < 1e-12);
    previousClose = closing;
    previousOpen = opening;
  }
  for (const boundary of [close.end, open.start, open.end]) {
    assert.ok(Math.abs(sampleCycle(boundary - 1e-4).doorOpen - sampleCycle(boundary + 1e-4).doorOpen) < 1e-6,
      `door jumps at ${boundary}`);
  }
  for (const phase of PHASES.filter(phase => !['close-door', 'open-door', 'complete'].includes(phase.id))) {
    assert.equal(at(phase.id).doorOpen, 0, `door open during ${phase.id}`);
  }
});

test('door phases pause, resume, seek and reset without depending on earlier frames', () => {
  const cycle = new Cycle();
  for (const id of ['close-door', 'open-door']) {
    const phase = PHASES.find(item => item.id === id);
    cycle.seek(phase.start + phase.duration * .25);
    cycle.play();
    cycle.advance(phase.duration * .25);
    assert.deepEqual(cycle.state, at(id, .5));
    cycle.pause();
    const paused = cycle.state;
    cycle.advance(5);
    assert.deepEqual(cycle.state, paused);
    cycle.seek(phase.start + phase.duration * .75);
    assert.deepEqual(cycle.state, at(id, .75));
    cycle.seek(phase.start + phase.duration * .5);
    cycle.play();
    cycle.advance(phase.duration * .25);
    assert.deepEqual(cycle.state, at(id, .75));
    cycle.reset();
    assert.equal(cycle.state.doorOpen, 1);
    assert.equal(cycle.state.waterUsed, 0);
    assert.equal(cycle.playing, false);
  }
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

test('the opened-door cooldown is gradual, bounded and leaves the programme complete', () => {
  let previous = sampleCycle(TOTAL_DURATION);
  assert.equal(previous.dishTemp, 40);
  assert.equal(previous.cooling, true);
  for (let elapsed = 1; elapsed <= COOLING_DURATION; elapsed++) {
    const state = sampleCycle(TOTAL_DURATION, elapsed);
    for (const key of ['dishTemp', 'wallTemp', 'waterTemp', 'pocketTemp']) {
      assert.ok(state[key] < previous[key], `${key} did not cool`);
      assert.ok(state[key] >= 20, `${key} fell below ambient`);
    }
    assert.equal(state.complete, true);
    assert.equal(state.time, TOTAL_DURATION);
    assert.equal(state.phase.id, 'complete');
    assert.equal(state.soil, 0);
    assert.equal(state.wetness, 0);
    previous = state;
  }
  assert.equal(previous.dishTemp, 20);
  assert.equal(previous.cooling, false);
  assert.deepEqual(sampleCycle(TOTAL_DURATION, 1000), previous);
  assert.deepEqual(sampleCycle(TOTAL_DURATION, NaN), sampleCycle(TOTAL_DURATION));
  assert.deepEqual(sampleCycle(100, 30), sampleCycle(100));
});

test('passive cooling uses real elapsed time after natural completion, even when playback stops', () => {
  const cycle = new Cycle();
  cycle.seek(TOTAL_DURATION - .5);
  cycle.play();
  cycle.advance(2, 1);
  assert.equal(cycle.playing, false);
  assert.equal(cycle.coolingElapsed, .75);
  cycle.advance(20, 1);
  assert.equal(cycle.coolingElapsed, 1.75);
  assert.equal(cycle.time, TOTAL_DURATION);
  assert.deepEqual(cycle.state, sampleCycle(TOTAL_DURATION, 1.75));
  const split = new Cycle();
  split.seek(TOTAL_DURATION - .5);
  split.play();
  for (let n = 0; n < 4; n++) split.advance(.5, .25);
  assert.deepEqual(split.state, sampleCycle(TOTAL_DURATION, .75));
});

test('choosing the final phase starts cooldown, explicit pause freezes it, and reset removes it', () => {
  const cycle = new Cycle();
  cycle.pause();
  cycle.seek(TOTAL_DURATION);
  cycle.advance(10, 10);
  assert.equal(cycle.coolingElapsed, 10);
  cycle.pause();
  const frozen = cycle.state;
  cycle.advance(10, 10);
  assert.deepEqual(cycle.state, frozen);
  cycle.seek(TOTAL_DURATION);
  assert.equal(cycle.coolingElapsed, 0);
  cycle.advance(4);
  assert.equal(cycle.coolingElapsed, 4);
  cycle.play();
  assert.equal(cycle.time, 0);
  assert.equal(cycle.coolingElapsed, 0);
  assert.equal(cycle.state.cooling, false);
  cycle.seek(TOTAL_DURATION);
  cycle.advance(20);
  cycle.reset();
  assert.deepEqual(cycle.state, sampleCycle(0));
  cycle.advance(20);
  assert.equal(cycle.time, 0);
  assert.equal(cycle.coolingElapsed, 0);
});
