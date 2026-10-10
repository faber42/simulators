/**
 * Seekable teaching model of a Philips-style removable brew group.
 * All timing, temperatures, quantities and pressure curves are illustrative,
 * not a measured Philips 5400 programme or a CAD/mechanical specification.
 * The grinder, drive motor and heater belong to the machine, not the removable
 * brew group. Brewing uses hot liquid water; steam is used for milk foaming.
 * heaterTemp is the heater's model temperature, NOT the beverage temperature.
 */

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const ramp = (value, start = 0, end = 1) => clamp((value - start) / (end - start));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, amount) => a + (b - a) * amount;

export const DRINKS = Object.freeze({
  latte: Object.freeze({
    id: 'latte', label: 'Latte macchiato', hasMilk: true,
    coffeeMl: 40, milkMl: 120, foamMl: 60, coffeeGrams: 9,
    milkDuration: 18, extractionDuration: 24,
    description: 'Zuerst warme Milch und Schaum, danach Espresso.',
  }),
  cappuccino: Object.freeze({
    id: 'cappuccino', label: 'Cappuccino', hasMilk: true,
    coffeeMl: 40, milkMl: 65, foamMl: 55, coffeeGrams: 9,
    milkDuration: 14, extractionDuration: 24,
    description: 'Weniger Milch, viel Schaum und ein Espresso.',
  }),
  espresso: Object.freeze({
    id: 'espresso', label: 'Espresso', hasMilk: false,
    coffeeMl: 40, milkMl: 0, foamMl: 0, coffeeGrams: 9,
    milkDuration: 0, extractionDuration: 24,
    description: 'Heißes Wasser wird durch verdichtetes Kaffeemehl gepumpt.',
  }),
});

const recipe = drink => DRINKS[drink] ?? DRINKS.latte;

function buildPhases(config) {
  const definitions = [
    ['grind', 'Bohnen mahlen', 10,
      'Das separate Mahlwerk zerkleinert die Bohnen. Das Kaffeemehl fällt in die offene Brühkammer.',
      'Das Mahlwerk sitzt oberhalb der Brühgruppe und bleibt beim Herausnehmen der Brühgruppe im Gerät.'],
    ['compress', 'Brühkammer schließen', 8,
      'Ein Motor im Gehäuse bewegt die Brühgruppe über ihre Antriebskupplung. Die Kammer fährt unter den Kolben und verdichtet das Kaffeemehl.',
      'In der herausnehmbaren Brühgruppe steckt kein eigener Motor. Die äußere Kupplung überträgt die Bewegung auf ihre Mechanik.'],
    ['heat', config.hasMilk ? 'Dampf vorbereiten' : 'Brühwasser erhitzen', 15,
      config.hasMilk
        ? 'Der Durchlauferhitzer im Gerät heizt für den Dampfbezug auf. Die geschlossene Brühkammer wartet.'
        : 'Der Durchlauferhitzer im Gerät erwärmt das Wasser für die Extraktion.',
      config.hasMilk
        ? 'Die beispielhaften 130 °C zeigen die Heizertemperatur im Dampfmodus. Die Brühgruppe selbst ist keine Heizung.'
        : 'Der Wassertank bleibt kalt. Erst auf dem Weg zur Brühgruppe wird die kleine benötigte Wassermenge erhitzt.'],
    ...(config.hasMilk ? [
      ['milk', 'Milch aufschäumen', config.milkDuration,
        'Dampf strömt zum vorderen LatteGo-Behälter. Dort werden Milch und Luft mitgerissen; warme Milch und Schaum fließen zuerst ins Glas.',
        'Milch läuft nicht durch die Brühgruppe. Im LatteGo-System treffen Dampf, Milch und Luft in einer eigenen Mischkammer zusammen.'],
      ['condition', 'Auf Brühtemperatur wechseln', 8,
        'Das Gerät schaltet vom Dampfbezug auf heißes Brühwasser um. Die Heizertemperatur sinkt im Modell auf 93 °C.',
        'Kaffee wird mit heißem flüssigem Wasser gebrüht. Dampf zum Milchaufschäumen und Wasser zur Extraktion brauchen unterschiedliche Temperaturen.'],
    ] : []),
    ['prewet', 'Kaffeemehl vorbefeuchten', 4,
      'Ein kurzer Pumpenimpuls bringt heißes Wasser in den verdichteten Kaffee. Der Puck nimmt zunächst Wasser auf.',
      'Beim Vorbefeuchten wird das Kaffeebett durchfeuchtet. In diesem Lehrmodell gelangt dabei noch kein Kaffee ins Glas.'],
    ['bloom', 'Kurz ziehen lassen', 4,
      'Die Pumpe hält an. Das angefeuchtete Kaffeemehl quillt in der geschlossenen Brühkammer.',
      'Die Pause ist eine echte Unterbrechung: kein Pumpenantrieb und kein Getränkefluss. Ablauf und Dauer hängen am realen Gerät vom Rezept ab.'],
    ['extract', 'Kaffee extrahieren', config.extractionDuration,
      'Die Pumpe drückt heißes Wasser durch das Kaffeebett. Gelöste Aromastoffe gelangen über das Sieb und den Kaffeeauslauf ins Glas.',
      '93 °C und etwa 9 bar sind hier anschauliche Modellwerte. Die maximale Pumpenangabe von 15 bar ist nicht gleich dem tatsächlichen Brühdruck.'],
    ['depressurize', 'Druck abbauen', 5,
      'Die Pumpe stoppt. Der Restdruck wird abgebaut und Restwasser gelangt in die Tropfschale.',
      'Erst nach dem Druckabbau öffnet die Mechanik die Brühkammer. Tropfschale und Tresterbehälter erfüllen verschiedene Aufgaben.'],
    ['eject', 'Kaffeepuck auswerfen', 9,
      'Der äußere Antrieb öffnet die Brühgruppe. Der gebrauchte Kaffeepuck wird herausgeschoben und fällt in den Tresterbehälter.',
      'Der feste Trester landet im separaten Sammelbehälter unter der Brühgruppe. Restwasser sammelt sich in der Tropfschale.'],
    ['return', 'In Grundstellung fahren', 5,
      'Die Antriebsmechanik fährt zurück. Die leere Brühkammer steht wieder unter dem Mahlwerkschacht bereit.',
      'Die Brühgruppe bleibt als mechanische Einheit herausnehmbar. Mahlwerk, Heizung, Pumpe und Motor bleiben im Gehäuse.'],
    ['complete', 'Getränk fertig', 0,
      'Das Getränk steht bereit. Die Brühkammer ist wieder leer, der gebrauchte Puck liegt im Tresterbehälter.',
      'Diese Simulation macht Wege und Bewegungen sichtbar. Geometrie, Zeiten, Mengen und Messwerte sind didaktisch vereinfacht.'],
  ];
  let start = 0;
  return Object.freeze(definitions.map(([id, title, duration, description, insight], index) => {
    const phase = Object.freeze({ id, title, duration, description, insight, index, start, end: start + duration });
    start = phase.end;
    return phase;
  }));
}

const schedules = Object.freeze(Object.fromEntries(Object.values(DRINKS).map(config => [config.id, buildPhases(config)])));
export const getPhases = (drink = 'latte') => schedules[recipe(drink).id];
export const PHASES = getPhases();
export const TOTAL_DURATION = PHASES.at(-1).start;

/** Sample the whole model from absolute demo seconds; no accumulated state. */
export function getState(requestedTime = 0, drink = 'latte') {
  const config = recipe(drink);
  const phases = getPhases(config.id);
  const duration = phases.at(-1).start;
  const numericTime = Number(requestedTime);
  const time = Number.isNaN(numericTime) ? 0 : clamp(numericTime, 0, duration);
  const phase = time === duration ? phases.at(-1) : phases.find(item => time < item.end);
  const phaseProgress = phase.duration ? clamp((time - phase.start) / phase.duration) : 1;
  const phaseById = Object.fromEntries(phases.map(item => [item.id, item]));
  const at = id => {
    const item = phaseById[id];
    return item ? ramp(time, item.start, item.end) : 0;
  };
  const inPhase = id => time > 0 && phase.id === id;
  const p = phaseProgress;
  const ejectProgress = at('eject');
  const wastePuck = ejectProgress >= .85;
  const compression = smooth(at('compress')) * (1 - smooth(ramp(ejectProgress, 0, .4)));
  const milkAmount = config.hasMilk ? at('milk') : 0;
  const foamAmount = milkAmount;
  // The extraction first fills the short outlet path, then reaches the cup.
  const coffeeAmount = ramp(at('extract'), .07, 1);
  const puckWetness = ramp(at('prewet'), 0, .7);
  const prewetPulse = inPhase('prewet') && p < .7;
  const milkFlow = inPhase('milk');
  const brewFlow = inPhase('extract') && p >= .07;
  let heaterTemp = mix(20, config.hasMilk ? 130 : 93, smooth(at('heat')));
  if (config.hasMilk && time >= phaseById.condition.start) heaterTemp = mix(130, 93, smooth(at('condition')));
  let pressure = 0;
  if (prewetPulse) pressure = 3 * smooth(ramp(p, 0, .12)) * (1 - smooth(ramp(p, .55, .7)));
  if (inPhase('extract')) pressure = 9 * smooth(ramp(p, 0, .07));
  if (inPhase('depressurize')) pressure = 9 * (1 - smooth(p));
  // Volumes are teaching values. Foamed milk includes air: foam volume is not
  // removed one-for-one from the carafe. Steam and flushing consume tank water.
  const milkDrawnMl = (config.milkMl + config.foamMl * .35) * milkAmount;
  const steamWaterMl = config.hasMilk ? 24 * milkAmount : 0;
  const flushWaterMl = config.hasMilk ? 22 * at('condition') : 0;
  const waterUsedMl = config.coffeeMl * coffeeAmount + 16 * puckWetness + steamWaterMl + flushWaterMl;
  return {
    time, phase, phaseProgress, progress: time / duration, duration,
    drink: config.id, config,
    grind: inPhase('grind'),
    groundAmount: wastePuck ? 0 : at('grind'),
    compression, brewPosition: compression,
    driveAngle: Math.PI * (.8 * smooth(at('compress')) + .9 * smooth(ejectProgress) + .3 * smooth(at('return'))),
    grinderAngle: at('grind') * phaseById.grind.duration * 14,
    heaterTemp, brewTemp: time >= phaseById.prewet.start ? 93 : 20,
    heater: inPhase('heat') || milkFlow || inPhase('prewet') || inPhase('extract'),
    pressure,
    pump: milkFlow || inPhase('condition') || prewetPulse || inPhase('extract'),
    steam: milkFlow, milkFlow, brewFlow,
    preinfusion: inPhase('prewet'),
    draining: inPhase('condition') || inPhase('depressurize'),
    milkAmount, coffeeAmount, foamAmount,
    milkMl: config.milkMl * milkAmount,
    coffeeMl: config.coffeeMl * coffeeAmount,
    foamMl: config.foamMl * foamAmount,
    targetMilkMl: config.milkMl, targetCoffeeMl: config.coffeeMl, targetFoamMl: config.foamMl,
    tankLevel: clamp(.9 - waterUsedMl / 1800),
    carafeLevel: clamp(.9 - milkDrawnMl / 260),
    waterUsedMl, milkDrawnMl,
    puckWetness, ejectProgress, wastePuck,
    complete: time === duration,
  };
}

export class Cycle {
  constructor(drink = 'latte') {
    this.speed = 1;
    this.setDrink(drink);
  }

  get state() { return getState(this.time, this.drink); }

  setDrink(id) {
    this.drink = recipe(id).id;
    this.phases = getPhases(this.drink);
    this.duration = this.phases.at(-1).start;
    return this.reset();
  }

  play() {
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
    return this;
  }

  pause() { this.playing = false; return this; }

  reset() { this.time = 0; this.playing = false; return this; }

  seek(requestedTime) {
    this.time = getState(requestedTime, this.drink).time;
    if (this.time >= this.duration) this.playing = false;
    return this;
  }

  update(dt) {
    if (!this.playing || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(this.speed) || this.speed <= 0) return this.state;
    this.time = Math.min(this.duration, this.time + dt * this.speed);
    if (this.time === this.duration) this.playing = false;
    return this.state;
  }
}
