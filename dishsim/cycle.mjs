/**
 * Deterministic teaching model of a dishwasher with a side heat exchanger.
 * Time is compressed: 210 wash seconds represent an illustrative 140 minutes,
 * with one additional demo second at each end for closing/opening the door.
 * Temperatures, water quantities and phase lengths are examples, not a measured
 * appliance programme. Fractions are visual state, not a fluid/chemical solver.
 *
 * Physical references (read 2026-10-09):
 * - https://www.bosch-home.com/us/en/c/spotlight/bltcab88ca4f3027fe1
 * - https://www.bosch-home.com/kw/en/experience-bosch/buying-guides/dishwasher-buying-guide
 * - https://patents.google.com/patent/US20120073608A1/en
 * - https://www.bosch-home.com/us/owner-support/get-support/support-selfhelp-dishwasher-not-cleaning-dishes
 */

const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
const ramp = (value, start = 0, end = 1) => clamp((value - start) / (end - start));
const mix = (a, b, p) => a + (b - a) * p;
const smooth = p => p * p * (3 - 2 * p);
export const DOOR_MOTION_DURATION = 1;
// Illustrative demonstration timing, not a specification for a real appliance.
export const SPRAY_ARM_INTERVAL = 4;
export const DETERGENT_LID_DURATION = .6;
export const DETERGENT_DROP_DURATION = 1.2;

const definitions = [
  ['close-door', 'Tür schließen', DOOR_MOTION_DURATION, 0,
    'Zuerst schließt sich die Tür vollständig. Erst danach beginnt der Wasserzulauf.',
    'Während sich die Tür bewegt, bleiben Zulauf, Pumpen und Heizung aus. Auch die seitliche Wassertasche ist noch leer.'],
  ['fill', 'Wasser einlassen', 12, 3,
    'Frischwasser nimmt den Weg durch die seitliche Wassertasche in den Pumpensumpf.',
    'Nur der Bodenbereich wird gefüllt. Die Körbe stehen nicht unter Wasser: Eine kleine Wassermenge wird später immer wieder umgewälzt.'],
  ['prewash', 'Vorspülen', 18, 12,
    'Unterer und oberer Sprüharm lösen abwechselnd lose Speisereste; die Reinigerklappe bleibt geschlossen.',
    'Eine Wasserweiche leitet das Wasser der Umwälzpumpe abwechselnd zum unteren und oberen Arm. Nur der versorgte Arm sprüht und dreht sich durch den Rückstoß seiner Düsen. Das Sieb hält grobe Reste zurück.'],
  ['drain-prewash', 'Vorspülwasser abpumpen', 7, 2,
    'Die Ablaufpumpe entfernt das erste schmutzige Wasser.',
    'Umwälzpumpe und Ablaufpumpe haben verschiedene Aufgaben. Grobe Teilchen bleiben im Sieb; Schmutzwasser und feine Bestandteile gelangen zum Abfluss.'],
  ['main-fill', 'Frischwasser für die Hauptwäsche', 9, 3,
    'Die Maschine nimmt eine neue, kleine Wasserfüllung auf.',
    'Das schmutzige Vorspülwasser wurde abgepumpt. Der Reiniger wird erst im folgenden Hauptwaschgang dosiert.'],
  ['wash', 'Hauptwäsche & Wärmerückgewinnung', 45, 45,
    'Die Reinigerklappe öffnet sich. Der Tab fällt ins Wasser und löst sich dort auf. Heißes Wasser, Chemie und Wasserstrahlen lösen die Beläge.',
    'Die Heizung erwärmt das Spülwasser hier auf 55 °C. Gleichzeitig steht frisches Wasser in der Seitentasche: Wärme aus dem Spülraum wärmt es für den nächsten Spülgang vor. Die beiden Wasserkreisläufe vermischen sich dabei nicht.'],
  ['drain-wash', 'Lauge abpumpen', 8, 2,
    'Gelöster Schmutz und Reiniger verlassen den Spülraum mit der Lauge.',
    'Das vorgewärmte Frischwasser bleibt währenddessen in der Seitentasche bereit. Das Sieb muss auch nach einem erfolgreichen Programm regelmäßig gereinigt werden.'],
  ['rinse', 'Zwischenspülen', 22, 10,
    'Vorgewärmtes Wasser aus der Seitentasche spült Reinigerreste ab.',
    'Zuerst öffnet der Auslass der Wassertasche. Dann wälzen die Sprüharme die neue Füllung um. Die Wärmerückgewinnung verringert den Temperaturunterschied zum warmen Geschirr.'],
  ['drain-rinse', 'Spülwasser wechseln', 7, 2,
    'Die Maschine pumpt das Zwischenspülwasser ab.',
    'Vor dem heißen Klarspülen wird die Wasserfüllung erneut gewechselt. Die Sprüharme stehen, während die Ablaufpumpe arbeitet.'],
  ['final-rinse', 'Heiß klarspülen', 25, 15,
    'Frisches Wasser wird hier auf 65 °C erhitzt; eine kleine Dosis Klarspüler wird zugegeben.',
    'Klarspüler senkt die Oberflächenspannung, sodass Wasser leichter abläuft. Das heiße Wasser lädt vor allem Keramik und Glas mit Wärme auf: Diese gespeicherte Wärme hilft anschließend beim Trocknen.'],
  ['drain-final', 'Abpumpen & Seitenwand kühlen', 8, 2,
    'Das heiße Spülwasser wird abgepumpt. Kaltes Wasser füllt die Seitentasche.',
    'Die kalte Füllung kühlt die angrenzende Edelstahlwand. Sie bleibt vom Spülraum getrennt und schafft die kühle Fläche für die anschließende Kondensation.'],
  ['dry', 'Kondensationstrocknen', 49, 44,
    'Wasser verdunstet am warmen Geschirr und kondensiert an der kühleren Seitenwand.',
    'Die Sprüharme stehen. Restwärme lässt den dünnen Wasserfilm verdunsten; an der kalten Wand bilden sich Tropfen und laufen nach unten. Das Kondensat wird abgepumpt. Kunststoff trocknet oft schlechter, weil er weniger Wärme speichert.'],
  ['open-door', 'Tür öffnen', DOOR_MOTION_DURATION, 0,
    'Das Spülprogramm ist fertig. Die Tür öffnet sich langsam zum Entladen.',
    'Pumpen, Heizung und Wasserzulauf bleiben aus. Die Tür fährt dieselbe Bewegung wie beim Schließen in umgekehrter Richtung; anschließend kühlt das Geschirr an der Raumluft ab.'],
  ['complete', 'Sauber & trocken', 0, 0,
    'Der vollständige Spülgang ist beendet. Das Keramikgeschirr ist sauber und trocken.',
    'Die Restwärme hat das Geschirr getrocknet. Grobe Speisereste bleiben im Sieb zurück. Diese Darstellung zeigt ein Prinzip mit Wärmetauscher; andere Geräte nutzen beispielsweise Türöffnung oder Zeolith.'],
];

let seconds = 0;
let minutes = 0;
export const PHASES = Object.freeze(definitions.map(([id, title, duration, phaseMinutes, description, detail], index) => {
  const phase = Object.freeze({ id, title, duration, minutes: phaseMinutes, description, detail, index,
    start: seconds, end: seconds + duration, minutesStart: minutes, minutesEnd: minutes + phaseMinutes });
  seconds += duration;
  minutes += phaseMinutes;
  return phase;
}));
export const TOTAL_DURATION = seconds;
export const PROGRAM_MINUTES = minutes;
export const COOLING_DURATION = 90;
const mainWash = PHASES.find(phase => phase.id === 'wash');
const mainWashStart = mainWash.start;
const detergentReleaseTime = mainWashStart + DETERGENT_LID_DURATION;
const detergentLandingTime = mainWashStart + (DETERGENT_LID_DURATION + DETERGENT_DROP_DURATION);
const detergentDissolvedTime = mainWashStart + mainWash.duration * .3;

// An accelerated, exponential-shaped cooldown, normalized to reach room
// temperature at its endpoint. This is an explanatory animation, not a measured
// cooling rate; an opened door lets the load gradually release its residual heat.
const coolingRetention = (elapsed, constant) => {
  const endpoint = Math.exp(-COOLING_DURATION / constant);
  return clamp((Math.exp(-elapsed / constant) - endpoint) / (1 - endpoint));
};

// Exact integral of a linear spray ramp. Accumulating frame deltas in the scene
// would make arm orientation depend on pauses, playback speed and seek history.
const rampIntegral = (p, start, end) => p <= start ? 0 : p < end
  ? (p - start) ** 2 / (2 * (end - start)) : p - (start + end) / 2;
const spraySchedule = [
  { id: 'prewash', intensity: .72 },
  { id: 'wash', intensity: 1 },
  { id: 'rinse', intensity: .82, rampStart: .22, rampEnd: .27 },
  { id: 'final-rinse', intensity: .9, rampStart: .2, rampEnd: .25 },
].map(entry => ({ ...entry, phase: PHASES.find(phase => phase.id === entry.id) }));

function sampleSpray(time) {
  const state = { spray: 0, sprayLower: 0, sprayUpper: 0,
    sprayTimeLower: 0, sprayTimeUpper: 0, activeSprayArm: null };
  for (const { phase, intensity, rampStart, rampEnd } of spraySchedule) {
    const start = phase.start + phase.duration * (rampStart ?? 0);
    const end = Math.min(time, phase.end);
    const integral = absoluteTime => {
      const p = clamp((absoluteTime - phase.start) / phase.duration);
      return phase.duration * intensity * (rampStart === undefined ? p : rampIntegral(p, rampStart, rampEnd));
    };
    // Integrate each supplied interval separately. The inactive arm keeps its
    // angle, including across phase boundaries, seeks and playback changes.
    for (let index = 0; start + index * SPRAY_ARM_INTERVAL < end; index++) {
      const lower = index % 2 === 0;
      const slotStart = start + index * SPRAY_ARM_INTERVAL;
      const slotEnd = Math.min(end, start + (index + 1) * SPRAY_ARM_INTERVAL);
      state[lower ? 'sprayTimeLower' : 'sprayTimeUpper'] += integral(slotEnd) - integral(slotStart);
    }
    if (time >= start && time < phase.end) {
      const p = (time - phase.start) / phase.duration;
      state.spray = intensity * (rampStart === undefined ? 1 : ramp(p, rampStart, rampEnd));
      if (state.spray > 0) {
        // Comparing absolute boundaries avoids rounding a nominal switch time
        // down to the preceding interval after subtracting a fractional start.
        let index = 0;
        while (time >= start + (index + 1) * SPRAY_ARM_INTERVAL) index++;
        state.activeSprayArm = index % 2 === 0 ? 'lower' : 'upper';
        state[state.activeSprayArm === 'lower' ? 'sprayLower' : 'sprayUpper'] = state.spray;
      }
    }
  }
  state.sprayTime = state.sprayTimeLower + state.sprayTimeUpper;
  return state;
}

const initial = Object.freeze({
  waterLevel: 0, waterTemp: 20, dishTemp: 20, wallTemp: 20,
  soil: 1, waterSoil: 0, wetness: 0, detergent: 0, detergentTablet: 1, rinseAid: 0,
  pocketLevel: 0, pocketTemp: 20, filterSoil: 0, waterUsed: 0,
});

// Values at the END of each phase. Unspecified values carry over. This makes
// seeking independent of frame rate or the order in which phases are visited.
const ends = [
  {}, // close-door: only the door moves; the hydraulic initial state is unchanged.
  { waterLevel: 1, waterUsed: 3 },
  { waterTemp: 23, dishTemp: 22, wallTemp: 22, soil: .76, waterSoil: .32, wetness: 1, filterSoil: .18 },
  { waterLevel: 0, filterSoil: .14 },
  { waterLevel: 1, waterTemp: 20, waterSoil: 0, waterUsed: 6 },
  { waterTemp: 55, dishTemp: 54, wallTemp: 48, soil: .025, waterSoil: .9, detergent: 1, detergentTablet: 0,
    pocketLevel: 1, pocketTemp: 42, filterSoil: .55, waterUsed: 9 },
  { waterLevel: 0, waterTemp: 53, dishTemp: 52, wallTemp: 47, detergent: .06, filterSoil: .4 },
  { waterLevel: 1, waterTemp: 40, dishTemp: 43, wallTemp: 42, soil: 0, waterSoil: .042, detergent: .006,
    pocketLevel: 0, filterSoil: .41 },
  { waterLevel: 0, detergent: 0, filterSoil: .38 },
  { waterLevel: 1, waterTemp: 65, dishTemp: 63, wallTemp: 58, waterSoil: 0, rinseAid: 1, waterUsed: 12 },
  { waterLevel: .05, dishTemp: 61, wallTemp: 28, rinseAid: 0, wetness: .74,
    pocketLevel: 1, pocketTemp: 20, waterUsed: 15 },
  { waterLevel: 0, waterTemp: 30, dishTemp: 40, wallTemp: 30, wetness: 0, pocketTemp: 30 },
  {}, // open-door: preserve the finished wash until the door is fully open.
  {},
];
const endpointStates = ends.reduce((states, end) => [...states, Object.freeze({ ...states.at(-1), ...end })], [initial]);

/**
 * Sample the entire state at an absolute demo time in seconds.
 * Fractions: soil/wetness on dishes; detergent/rinseAid in circulating water;
 * detergentTablet remaining solid tab; waterLevel in sump (NOT tub depth);
 * detergentLidOpen and detergentDropProgress describe the opening and fall.
 * detergentReleased follows a fully open lid; detergentInWater follows landing.
 * The solid tab only dissolves after landing; detergentTabletStage distinguishes
 * 'stored', 'falling', 'in-water' and 'dissolved', independently of seek history.
 * pocketLevel in isolated side reservoir; filterSoil coarse debris retained.
 * waterSoil is the pollution concentration/tint of the current water filling,
 * independent of dirt still on dishes. Draining reduces water volume without
 * making the remaining water cleaner; a new fill replaces or dilutes the tint.
 * Temperatures are °C, waterUsed is illustrative cumulative fresh litres.
 * spray/evaporation/condensation/heatRecovery are animation intensities, 0..1.
 * sprayTime is the exact cumulative integral of spray intensity in demo seconds;
 * multiply by an angular speed to obtain seek-stable spray-arm orientation.
 * sprayLower/Upper split the supply between alternating arms, with separate
 * sprayTimeLower/Upper integrals. activeSprayArm is 'lower', 'upper' or null.
 * pocketFilling and pocketRelease distinguish supply from reservoir discharge.
 * doorOpen is 0 when closed and 1 when open; close-door and open-door use the
 * same smooth motion in reverse and never run hydraulics or heating.
 * Optional coolingElapsed advances the opened-door cooldown only at completion;
 * programme time remains TOTAL_DURATION and the completed phase stays selected.
 */
export function sampleCycle(requestedTime = 0, requestedCoolingElapsed = 0) {
  const numericTime = Number(requestedTime);
  const time = Number.isNaN(numericTime) ? 0 : clamp(numericTime, 0, TOTAL_DURATION);
  const phaseIndex = time === TOTAL_DURATION ? PHASES.length - 1 : PHASES.findIndex(phase => time < phase.end);
  const phase = PHASES[phaseIndex];
  const numericCooling = Number(requestedCoolingElapsed);
  const coolingElapsed = time === TOTAL_DURATION && !Number.isNaN(numericCooling)
    ? clamp(numericCooling, 0, COOLING_DURATION) : 0;
  const p = phase.duration ? clamp((time - phase.start) / phase.duration) : 1;
  const before = endpointStates[phaseIndex];
  const after = endpointStates[phaseIndex + 1];
  const state = Object.fromEntries(Object.keys(initial).map(key => [key, mix(before[key], after[key], p)]));
  Object.assign(state, {
    time, total: TOTAL_DURATION, progress: time / TOTAL_DURATION,
    phase, phaseIndex, phaseProgress: p,
    minutesElapsed: mix(phase.minutesStart, phase.minutesEnd, p), programMinutes: PROGRAM_MINUTES,
    ...sampleSpray(time),
    drain: false, fill: false, drying: phase.id === 'dry', complete: phase.id === 'complete',
    coolingElapsed, cooling: phase.id === 'complete' && coolingElapsed < COOLING_DURATION,
    doorOpen: phase.id === 'complete' ? 1 : 0,
    doorClosing: phase.id === 'close-door', doorOpening: phase.id === 'open-door',
    circulating: false, heater: false, pocketFilling: false, pocketRelease: false,
    evaporation: 0, condensation: 0, heatRecovery: 0,
    detergentLidOpen: smooth(ramp(time, mainWashStart, detergentReleaseTime)),
    detergentDropProgress: ramp(time, detergentReleaseTime, detergentLandingTime),
    detergentReleased: time >= detergentReleaseTime,
    detergentInWater: time >= detergentLandingTime,
    detergentCompartmentOpen: time >= mainWashStart,
    rinseAidActive: false,
  });

  switch (phase.id) {
    case 'close-door':
      state.doorOpen = 1 - smooth(p);
      break;
    case 'open-door':
      state.doorOpen = smooth(p);
      break;
    case 'fill':
    case 'main-fill':
      state.fill = p < .96;
      state.pocketFilling = p < .5;
      state.pocketRelease = p >= .5 && p < 1;
      state.pocketLevel = p < .5 ? p * 2 : 2 * (1 - p);
      state.waterLevel = ramp(p, .5, 1);
      state.waterUsed = before.waterUsed + 3 * ramp(p, 0, .5);
      state.waterSoil = 0;
      break;
    case 'prewash':
      state.wetness = ramp(p, 0, .14);
      break;
    case 'wash': {
      const dissolve = ramp(time, detergentLandingTime, detergentDissolvedTime);
      state.heater = p < .38;
      state.waterTemp = mix(before.waterTemp, 55, ramp(p, 0, .38));
      state.dishTemp = mix(before.dishTemp, 54, ramp(p, 0, .58));
      state.detergent = dissolve;
      state.detergentTablet = 1 - dissolve;
      state.soil = mix(before.soil, after.soil, smooth(ramp(p, .08, .95)));
      // Detergent first creates a clearly violet solution; loosened food then
      // progressively dominates its tint while the dishes become cleaner.
      state.waterSoil = .9 * smooth(ramp(p, .24, .95));
      state.pocketFilling = p > .1 && p < .28;
      state.fill = state.pocketFilling;
      state.pocketLevel = ramp(p, .1, .28);
      state.pocketTemp = mix(20, 42, smooth(ramp(p, .28, 1)));
      state.waterUsed = before.waterUsed + 3 * state.pocketLevel;
      state.heatRecovery = p > .28 ? Math.sin(ramp(p, .28, 1) * Math.PI) * .7 + .2 : 0;
      break;
    }
    case 'rinse':
      state.waterLevel = ramp(p, 0, .22);
      state.pocketLevel = 1 - state.waterLevel;
      state.pocketRelease = p < .22;
      state.waterTemp = mix(before.waterTemp, 42, ramp(p, 0, .22)) - 2 * ramp(p, .22, 1);
      state.soil = mix(before.soil, 0, ramp(p, .25, .9));
      state.waterSoil = mix(before.waterSoil, .002, ramp(p, 0, .16)) + .04 * ramp(p, .25, .9);
      break;
    case 'final-rinse':
      state.waterSoil = 0;
      state.fill = p < .2;
      state.waterUsed = before.waterUsed + 3 * ramp(p, 0, .2);
      state.waterLevel = ramp(p, 0, .2);
      state.waterTemp = p < .2 ? mix(before.waterTemp, 25, p / .2) : mix(25, 65, ramp(p, .2, .8));
      state.heater = p >= .2 && p < .8;
      state.rinseAid = ramp(p, .32, .45);
      state.rinseAidActive = p >= .32 && p < .45;
      break;
    case 'drain-prewash':
    case 'drain-wash':
    case 'drain-rinse':
      state.drain = true;
      break;
    case 'drain-final':
      state.drain = true;
      state.pocketFilling = true;
      state.fill = true;
      // Cold water is a new, separate reservoir charge, not cooled wash water.
      state.pocketTemp = mix(before.pocketTemp, 20, ramp(p, 0, .08));
      break;
    case 'dry':
      state.wetness = .74 * (1 - smooth(p));
      state.evaporation = Math.sin(Math.PI * p) * .8 + .15 * (1 - p);
      state.condensation = state.evaporation * .95;
      state.waterLevel = .05 * (1 - ramp(p, .86, 1));
      state.drain = p >= .86;
      break;
  }

  state.detergentTabletStage = !state.detergentReleased ? 'stored'
    : !state.detergentInWater ? 'falling'
    : state.detergentTablet > 0 ? 'in-water' : 'dissolved';
  if (state.complete) {
    for (const [key, constant] of [['dishTemp', 24], ['wallTemp', 18], ['waterTemp', 30], ['pocketTemp', 40]]) {
      state[key] = 20 + (state[key] - 20) * coolingRetention(coolingElapsed, constant);
    }
  }
  state.circulating = state.spray > 0;
  return state;
}

/** Small playback controller; all visible state is derived by sampleCycle. */
export class Cycle {
  constructor() {
    this.time = 0;
    this.playing = false;
    this.coolingElapsed = 0;
    this.coolingPaused = false;
  }

  get state() { return sampleCycle(this.time, this.coolingElapsed); }

  play() {
    if (this.time >= TOTAL_DURATION) this.time = 0;
    this.coolingElapsed = 0;
    this.coolingPaused = false;
    this.playing = true;
    return this.state;
  }

  pause() {
    this.playing = false;
    this.coolingPaused = true;
    return this.state;
  }

  reset() {
    this.time = 0;
    this.playing = false;
    this.coolingElapsed = 0;
    this.coolingPaused = false;
    return this.state;
  }

  seek(time) {
    this.time = sampleCycle(time).time;
    this.coolingElapsed = 0;
    if (this.time >= TOTAL_DURATION) {
      this.playing = false;
      // Choosing the final chapter opens the door and starts passive cooling,
      // even if earlier playback was paused. An explicit pause AFTER this seek
      // freezes cooling as well, useful for inspection and deterministic checks.
      this.coolingPaused = false;
    }
    return this.state;
  }

  // Pass raw real-time dt as the optional second argument when the wash playback
  // speed is accelerated. Cooling remains passive after playing becomes false.
  advance(deltaSeconds, coolingDeltaSeconds = deltaSeconds) {
    const delta = Number(deltaSeconds);
    const rawCoolingDelta = Number(coolingDeltaSeconds);
    const coolingDelta = Number.isFinite(rawCoolingDelta) && rawCoolingDelta > 0 ? rawCoolingDelta : 0;
    if (this.playing && Number.isFinite(delta) && delta > 0) {
      const remaining = TOTAL_DURATION - this.time;
      this.time = clamp(this.time + delta, 0, TOTAL_DURATION);
      if (this.time >= TOTAL_DURATION) {
        this.playing = false;
        this.coolingPaused = false;
        this.coolingElapsed = clamp(coolingDelta * clamp((delta - remaining) / delta), 0, COOLING_DURATION);
      }
    } else if (this.time >= TOTAL_DURATION && !this.coolingPaused) {
      this.coolingElapsed = clamp(this.coolingElapsed + coolingDelta, 0, COOLING_DURATION);
    }
    return this.state;
  }
}
