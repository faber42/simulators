/**
 * Deterministic teaching model of a dishwasher with a side heat exchanger.
 * Time is compressed: 210 demo seconds represent an illustrative 140 minutes.
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

const definitions = [
  ['fill', 'Wasser einlassen', 12, 3,
    'Frischwasser nimmt den Weg durch die seitliche Wassertasche in den Pumpensumpf.',
    'Nur der Bodenbereich wird gefüllt. Die Körbe stehen nicht unter Wasser: Eine kleine Wassermenge wird später immer wieder umgewälzt.'],
  ['prewash', 'Vorspülen', 18, 12,
    'Die Sprüharme lösen lose Speisereste mit Wasser; die Reinigerklappe bleibt geschlossen.',
    'Die Umwälzpumpe drückt Wasser in die Arme. Schräg gerichtete Düsen erzeugen den Rückstoß, der die Arme dreht. Das Sieb hält grobe Reste zurück.'],
  ['drain-prewash', 'Vorspülwasser abpumpen', 7, 2,
    'Die Ablaufpumpe entfernt das erste schmutzige Wasser.',
    'Umwälzpumpe und Ablaufpumpe haben verschiedene Aufgaben. Grobe Teilchen bleiben im Sieb; Schmutzwasser und feine Bestandteile gelangen zum Abfluss.'],
  ['main-fill', 'Frischwasser für die Hauptwäsche', 9, 3,
    'Die Maschine nimmt eine neue, kleine Wasserfüllung auf.',
    'Das schmutzige Vorspülwasser wurde abgepumpt. Der Reiniger wird erst im folgenden Hauptwaschgang dosiert.'],
  ['wash', 'Hauptwäsche & Wärmerückgewinnung', 45, 45,
    'Der Reiniger löst sich. Heißes Wasser, Chemie und die Wasserstrahlen lösen die Beläge.',
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

function integratedSprayTime(time) {
  return spraySchedule.reduce((total, { phase, intensity, rampStart, rampEnd }) => {
    const p = clamp((time - phase.start) / phase.duration);
    return total + phase.duration * intensity * (rampStart === undefined ? p : rampIntegral(p, rampStart, rampEnd));
  }, 0);
}

const initial = Object.freeze({
  waterLevel: 0, waterTemp: 20, dishTemp: 20, wallTemp: 20,
  soil: 1, wetness: 0, detergent: 0, detergentTablet: 1, rinseAid: 0,
  pocketLevel: 0, pocketTemp: 20, filterSoil: 0, waterUsed: 0,
});

// Values at the END of each phase. Unspecified values carry over. This makes
// seeking independent of frame rate or the order in which phases are visited.
const ends = [
  { waterLevel: 1, waterUsed: 3 },
  { waterTemp: 23, dishTemp: 22, wallTemp: 22, soil: .76, wetness: 1, filterSoil: .18 },
  { waterLevel: 0, filterSoil: .14 },
  { waterLevel: 1, waterTemp: 20, waterUsed: 6 },
  { waterTemp: 55, dishTemp: 54, wallTemp: 48, soil: .025, detergent: 1, detergentTablet: 0,
    pocketLevel: 1, pocketTemp: 42, filterSoil: .55, waterUsed: 9 },
  { waterLevel: 0, waterTemp: 53, dishTemp: 52, wallTemp: 47, detergent: .06, filterSoil: .4 },
  { waterLevel: 1, waterTemp: 40, dishTemp: 43, wallTemp: 42, soil: 0, detergent: .006,
    pocketLevel: 0, filterSoil: .41 },
  { waterLevel: 0, detergent: 0, filterSoil: .38 },
  { waterLevel: 1, waterTemp: 65, dishTemp: 63, wallTemp: 58, rinseAid: 1, waterUsed: 12 },
  { waterLevel: .05, dishTemp: 61, wallTemp: 28, rinseAid: 0, wetness: .74,
    pocketLevel: 1, pocketTemp: 20, waterUsed: 15 },
  { waterLevel: 0, waterTemp: 30, dishTemp: 40, wallTemp: 30, wetness: 0, pocketTemp: 30 },
  {},
];
const endpointStates = ends.reduce((states, end) => [...states, Object.freeze({ ...states.at(-1), ...end })], [initial]);

/**
 * Sample the entire state at an absolute demo time in seconds.
 * Fractions: soil/wetness on dishes; detergent/rinseAid in circulating water;
 * detergentTablet remaining solid tab; waterLevel in sump (NOT tub depth);
 * pocketLevel in isolated side reservoir; filterSoil coarse debris retained.
 * Temperatures are °C, waterUsed is illustrative cumulative fresh litres.
 * spray/evaporation/condensation/heatRecovery are animation intensities, 0..1.
 * sprayTime is the exact cumulative integral of spray intensity in demo seconds;
 * multiply by an angular speed to obtain seek-stable spray-arm orientation.
 * pocketFilling and pocketRelease distinguish supply from reservoir discharge.
 */
export function sampleCycle(requestedTime = 0) {
  const numericTime = Number(requestedTime);
  const time = Number.isNaN(numericTime) ? 0 : clamp(numericTime, 0, TOTAL_DURATION);
  const phaseIndex = time === TOTAL_DURATION ? PHASES.length - 1 : PHASES.findIndex(phase => time < phase.end);
  const phase = PHASES[phaseIndex];
  const p = phase.duration ? clamp((time - phase.start) / phase.duration) : 1;
  const before = endpointStates[phaseIndex];
  const after = endpointStates[phaseIndex + 1];
  const state = Object.fromEntries(Object.keys(initial).map(key => [key, mix(before[key], after[key], p)]));
  Object.assign(state, {
    time, total: TOTAL_DURATION, progress: time / TOTAL_DURATION,
    phase, phaseIndex, phaseProgress: p,
    minutesElapsed: mix(phase.minutesStart, phase.minutesEnd, p), programMinutes: PROGRAM_MINUTES,
    spray: 0, drain: false, fill: false, drying: phase.id === 'dry', complete: phase.id === 'complete',
    sprayTime: integratedSprayTime(time),
    circulating: false, heater: false, pocketFilling: false, pocketRelease: false,
    evaporation: 0, condensation: 0, heatRecovery: 0,
    detergentReleased: time >= PHASES[4].start,
    detergentCompartmentOpen: time >= PHASES[4].start,
    rinseAidActive: false,
  });

  switch (phase.id) {
    case 'fill':
    case 'main-fill':
      state.fill = p < .96;
      state.pocketFilling = p < .5;
      state.pocketRelease = p >= .5 && p < 1;
      state.pocketLevel = p < .5 ? p * 2 : 2 * (1 - p);
      state.waterLevel = ramp(p, .5, 1);
      state.waterUsed = before.waterUsed + 3 * ramp(p, 0, .5);
      break;
    case 'prewash':
      state.spray = .72;
      state.wetness = ramp(p, 0, .14);
      break;
    case 'wash': {
      const dissolve = ramp(p, .04, .3);
      state.spray = 1;
      state.heater = p < .38;
      state.waterTemp = mix(before.waterTemp, 55, ramp(p, 0, .38));
      state.dishTemp = mix(before.dishTemp, 54, ramp(p, 0, .58));
      state.detergent = dissolve;
      state.detergentTablet = 1 - dissolve;
      state.soil = mix(before.soil, after.soil, smooth(ramp(p, .08, .95)));
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
      state.spray = .82 * ramp(p, .22, .27);
      state.soil = mix(before.soil, 0, ramp(p, .25, .9));
      break;
    case 'final-rinse':
      state.fill = p < .2;
      state.waterUsed = before.waterUsed + 3 * ramp(p, 0, .2);
      state.waterLevel = ramp(p, 0, .2);
      state.waterTemp = p < .2 ? mix(before.waterTemp, 25, p / .2) : mix(25, 65, ramp(p, .2, .8));
      state.spray = .9 * ramp(p, .2, .25);
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

  state.circulating = state.spray > 0;
  return state;
}

/** Small playback controller; all visible state is derived by sampleCycle. */
export class Cycle {
  constructor() {
    this.time = 0;
    this.playing = false;
  }

  get state() { return sampleCycle(this.time); }

  play() {
    if (this.time >= TOTAL_DURATION) this.time = 0;
    this.playing = true;
    return this.state;
  }

  pause() {
    this.playing = false;
    return this.state;
  }

  reset() {
    this.time = 0;
    this.playing = false;
    return this.state;
  }

  seek(time) {
    this.time = sampleCycle(time).time;
    if (this.time >= TOTAL_DURATION) this.playing = false;
    return this.state;
  }

  advance(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (this.playing && Number.isFinite(delta) && delta > 0) this.seek(this.time + delta);
    return this.state;
  }
}
