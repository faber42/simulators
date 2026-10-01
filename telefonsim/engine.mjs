// The exchange is independent of rendering. All delays use simulation time;
// replacing the task queue on clear-down prevents late pulses or auto-answers.
export const SOURCE = '210001';
export const CAMERA_TRAVEL_SECONDS = 1.7;
// Demonstration timing: the free-running finder takes two dial-pulse periods.
export const FINDER_SEARCH_SECONDS = .2;
export const CONTACTS = [
  { number: '234567', name: 'Feinmechanische Werkstatt', kind: 'phone', note: 'Am Zielapparat selbst abheben' },
  { number: '618204', name: 'Wohnzimmer', kind: 'phone', note: 'Ein zweiter Bakelitapparat' },
  { number: '405019', name: 'Bahnhofsbüro', kind: 'phone', note: 'Auch die Null macht zehn Schritte' },
  { number: '119100', name: 'Zeitansage', kind: 'time', tape: 'time', note: 'Tonband 01 · Beim nächsten Ton …' },
  { number: '119200', name: 'Kinoprogramm', kind: 'cinema', tape: 'program', note: 'Tonband 02 · Das heutige Programm' },
  { number: '119300', name: 'Wetterdienst', kind: 'weather', tape: 'program', note: 'Tonband 02 · Wetteransage' },
  { number: '234569', name: 'Besetzter Anschluss', kind: 'busy', note: 'Besetztprüfung ausprobieren' },
  { number: '0', name: 'Fernamtsabgang', kind: 'external', note: 'Weitervermittlung außerhalb des dargestellten Amts' },
];
export const TAPE_MACHINES = [
  { id: 'time', label: 'ZEITANSAGE', number: '119100', short: 'Band 01' },
  { id: 'program', label: 'PROGRAMMANSAGEN', number: '119200 / 119300', short: 'Band 02' },
];
export const STAGES = [
  { short: 'AS', name: 'Anrufsucher', digit: 'Leitung finden' },
  { short: 'I. GW', name: '1. Gruppenwähler', digit: 'Ziffer 1' },
  { short: 'II. GW', name: '2. Gruppenwähler', digit: 'Ziffer 2' },
  { short: 'III. GW', name: '3. Gruppenwähler', digit: 'Ziffer 3' },
  { short: 'IV. GW', name: '4. Gruppenwähler', digit: 'Ziffer 4' },
  { short: 'LW', name: 'Leitungswähler', digit: 'Ziffer 5 + 6' },
];
export const pulsesFor = digit => digit === '0' ? 10 : Number(digit);
export function resolveNumber(number) {
  if (!/^(?:0\d{0,5}|[1-9]\d{5})$/.test(number)) throw new Error('Ortsrufnummern haben sechs Ziffern; 0 führt zum Fernamt.');
  if (number === SOURCE) return { number, name: 'Eigener Anschluss', kind: 'busy' };
  if (number.startsWith('0')) return { number, name: 'Fernamt außerhalb der Darstellung', kind: 'external' };
  return CONTACTS.find(c => c.number === number) || { number, name: `Teilnehmer ${number}`, kind: 'phone', note: 'Freier Teilnehmeranschluss' };
}

export class Exchange {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.state = 'idle'; this.offHook = false; this.targetOffHook = false;
    this.digits = ''; this.pending = []; this.tasks = []; this.activeTask = null;
    this.selectors = Array(6).fill(null); this.instances = new Map();
    this.focus = 0; this.release = null; this.message = 'Hörer abheben, dann eine sechsstellige Nummer wählen.';
    this.pulse = 0; this.pulseTotal = 0; this.currentDigit = null;
    this.dialAngle = 0; this.time = 0; this.target = null; this.revision = 0;
    this.history = []; this.announcement = ''; this.answerAt = 0;
    this.playbackSeconds = 0;
  }
  get tapeRunning() { return this.state === 'connected' && this.offHook && !!this.target?.tape; }
  get dialTone() {
    return this.offHook && ['finding', 'ready'].includes(this.state) && !!this.selectors[1]?.held
      && !this.digits.length && this.currentDigit === null;
  }
  emit(type, detail = {}) { this.revision++; this.onEvent({ type, ...detail }, this); }
  say(text) {
    this.message = text;
    this.history.unshift({ time: this.time, text });
    this.history.length = Math.min(40, this.history.length);
    this.emit('message');
  }
  look(focus) { this.focus = focus; this.emit('focus'); }
  task(duration, start = () => {}, update = null, end = () => {}) {
    this.tasks.push({ duration, start, update, end, elapsed: 0 });
  }
  acquire(stage, prefix = '', slot = 0) {
    const key = `${stage}:${prefix}:${slot}`;
    let selector = this.instances.get(key);
    if (!selector) {
      selector = { key, stage, prefix, slot,
        level: 0, rotary: 0, held: false, phase: 'frei' };
      this.instances.set(key, selector);
    }
    selector.held = true; selector.phase = 'bereit';
    this.selectors[stage] = selector;
    this.emit('acquire', { stage });
    return selector;
  }
  lift() {
    if (this.state !== 'idle') return false;
    this.offHook = true; this.digits = ''; this.pending = []; this.target = null;
    this.announcement = ''; this.targetOffHook = false; this.playbackSeconds = 0; this.state = 'finding';
    const finder = this.acquire(0, SOURCE.slice(0, 4));
    this.look(0); this.say(`Schleife geschlossen. Der Anrufsucher sucht Anschluss ${SOURCE}.`);
    // Camera 2 is already at the finder in idle: search starts immediately.
    for (let n = 1; n <= 10; n++) this.task(FINDER_SEARCH_SECONDS / 12, () => {
      finder.level = n; finder.phase = 'sucht'; this.emit('step', { stage: 0 });
    });
    this.task(FINDER_SEARCH_SECONDS / 6, () => { finder.rotary = 1; this.emit('step', { stage: 0 }); }, null, () => {
      finder.phase = 'gehalten'; this.acquire(1); this.emit('route');
      this.say('Anschluss gefunden. Wählton – der erste Gruppenwähler ist bereit.');
    });
    // Let the found line and Wählton register before leaving the finder.
    this.task(.25, () => {}, null, () => this.look(1));
    // Wählton is available now. Keep the existing camera allowance before
    // showing the first dialled digit at the next selector.
    this.task(CAMERA_TRAVEL_SECONDS + .1, () => {}, null, () => { this.state = 'ready'; this.look(1); this.nextDigit(); });
    return true;
  }
  enqueue(digit, prewound = false) {
    if (!/^\d$/.test(String(digit)) || !this.offHook || ['releasing', 'ringing', 'connected', 'busy', 'unavailable', 'external'].includes(this.state)) return false;
    if (this.digits.length + this.pending.length + (this.currentDigit !== null ? 1 : 0) >= 6) return false;
    this.prewound = prewound && this.state === 'ready' && !this.pending.length;
    this.pending.push(String(digit)); this.emit('queue');
    if (this.state === 'ready') this.nextDigit();
    return true;
  }
  dialNumber(number) {
    if (!/^(?:0\d{0,5}|[1-9]\d{5})$/.test(number) || !['idle', 'ready'].includes(this.state) || this.digits.length || this.pending.length) return false;
    if (this.state === 'idle') this.lift();
    for (const digit of number) this.enqueue(digit);
    return true;
  }
  nextDigit() {
    if (this.state !== 'ready' || !this.pending.length) { this.emit('state'); return; }
    const index = this.digits.length;
    const digit = this.pending.shift(), count = pulsesFor(digit), stage = Math.min(index + 1, 5);
    const selector = this.selectors[stage];
    this.currentDigit = digit; this.state = 'dialing'; this.pulse = 0; this.pulseTotal = count;
    this.look(stage);
    this.say(`${STAGES[stage].name}: ${index === 5 ? 'Drehen' : 'Heben'} für Ziffer ${digit}${digit === '0' ? ' – zehn Impulse' : ` – ${count} Impulse`}.`);
    const wound = (count + 1) * Math.PI / 6;
    if (this.prewound) {
      // The mouse already brought the dial to the stop; return immediately.
      this.dialAngle = wound; this.prewound = false;
    } else {
      // Leave enough time for the camera to arrive before the first pulse.
      this.task(.65);
      this.task(.38, () => this.emit('wind'), t => { this.dialAngle = wound * t; });
    }
    for (let n = 1; n <= count; n++) this.task(.1, () => {
      this.pulse = n; selector.phase = index === 5 ? 'dreht' : 'hebt';
      if (index === 5) selector.rotary = n; else selector.level = n;
      this.emit('pulse', { stage, digit, pulse: n });
    }, t => { this.dialAngle = wound * (1 - (n - 1 + t) / count); });
    this.task(.22, () => {
      this.dialAngle = 0; this.digits += digit; this.currentDigit = null; this.emit('digit', { digit });
    });
    if (index < 4) {
      // The vertical level selects the number group. Rotary motion hunts an
      // outlet within that group, and is deliberately NOT the next digit.
      const outlet = 1 + ([...this.digits, digit].reduce((a, d) => a + Number(d), stage) % 3);
      this.task(.25, () => {
        this.state = 'hunting'; selector.phase = 'Freisuche';
        this.say(`${STAGES[stage].short}: Ebene ${count}. Freisuche im abgehenden Bündel.`);
      });
      for (let n = 1; n <= outlet; n++) this.task(.22, () => { selector.rotary = n; this.emit('step', { stage }); });
      if (index === 0 && digit === '0') {
        this.task(.3, () => {
          selector.phase = 'Fernamtsabgang'; this.pending = []; this.state = 'external';
          this.target = { number: '0', name: 'Fernamt außerhalb der Darstellung', kind: 'external' };
          this.look('external'); this.emit('route');
          this.say('Abgang 0 zum Fernamt geschaltet. Die weitere Vorwahl und Vermittlung erfolgen außerhalb dieses Modells. Zum Freigeben auflegen.');
        });
        return;
      }
      this.task(CAMERA_TRAVEL_SECONDS + .1, () => {
        selector.phase = 'gehalten'; this.acquire(stage + 1, this.digits, outlet - 1); this.look(stage + 1); this.emit('route');
        this.say(`Gruppe ${this.digits}… verbunden. ${STAGES[stage + 1].name} übernimmt.`);
      }, null, () => { this.state = 'ready'; this.look(stage + 1); this.nextDigit(); });
    } else if (index === 4) {
      this.task(.25, () => { selector.phase = 'wartet auf Ziffer 6'; this.say('Leitungswähler steht auf der Höhe. Die sechste Ziffer bestimmt jetzt den Drehschritt.'); }, null,
        () => { this.state = 'ready'; this.nextDigit(); });
    } else {
      this.task(.6, () => { selector.phase = 'Leitungsprüfung'; this.say('Zielanschluss wird auf frei / besetzt geprüft.'); }, null, () => this.connect());
    }
  }
  connect() {
    this.target = resolveNumber(this.digits);
    this.selectors[5].phase = 'gehalten';
    if (['busy', 'unavailable'].includes(this.target.kind)) {
      this.state = this.target.kind;
      this.say(this.state === 'busy' ? `${this.digits} ist besetzt. Zum Freigeben bitte auflegen.` : `${this.digits} ist nicht beschaltet. Bitte auflegen.`);
      return;
    }
    this.state = 'ringing'; this.look(this.target.tape ? 'tape' : 'target'); this.emit('route');
    this.say(this.target.tape
      ? `${this.target.name} · ${this.digits}: Verbindung zum Tonbandgerät. Der Ansagedienst schaltet automatisch ein.`
      : `${this.target.name} · ${this.digits} wird gerufen. Den Hörer in Kamera 02 anklicken.`);
    if (this.target.kind !== 'phone') this.task(2.1, () => {}, null, () => this.answer());
  }
  answer() {
    if (this.state !== 'ringing') return false;
    this.state = 'connected'; this.targetOffHook = this.target.kind === 'phone'; this.answerAt = this.time;
    this.say(this.target.tape
      ? `${this.target.name}: Tonband läuft. Die Ansage wiederholt sich, bis Sie den Hörer auflegen.`
      : `${this.target.name} hat abgenommen. Sprechverbindung durchgeschaltet.`);
    this.announcement = this.serviceText(); this.emit('answer'); return true;
  }
  serviceText(date = new Date()) {
    if (!this.target) return '';
    if (this.target.kind === 'time') return `Beim nächsten Ton ist es ${date.getHours()} Uhr, ${String(date.getMinutes()).padStart(2, '0')} Minuten und ${String(date.getSeconds()).padStart(2, '0')} Sekunden. … Piep.`;
    if (this.target.kind === 'cinema') return 'Das Kinoprogramm heute: „Die Reise zum Mond“ um 17 Uhr. Um 20 Uhr: „Eine Stadt am Draht“. Wir wünschen gute Unterhaltung!';
    if (this.target.kind === 'weather') return 'Wetter heute: heiter bis wolkig, am Nachmittag einzelne Schauer. Schwacher Westwind, 18 Grad. Eine gute Reise wünscht der Wetterdienst.';
    return `„Hallo, hier ist ${this.target.name}. Die Verbindung steht!“`;
  }
  targetHangup() {
    if (this.state !== 'connected' || this.target?.kind !== 'phone') return false;
    this.targetOffHook = false; this.state = 'busy'; this.announcement = '';
    this.say('Der Zielapparat hat aufgelegt. Bitte auch den eigenen Hörer auflegen, um den Verbindungsweg freizugeben.');
    return true;
  }
  hangup() {
    if (!this.offHook || this.state === 'releasing') return false;
    this.offHook = false; this.targetOffHook = false; this.state = 'releasing';
    this.tasks = []; this.activeTask = null; this.pending = []; this.currentDigit = null;
    this.dialAngle = 0; this.announcement = ''; this.pulse = 0; this.pulseTotal = 0;
    const selectors = this.selectors.filter(s => s?.held), last = selectors.at(-1);
    this.release = { prefix: last?.stage >= 2 ? last.prefix.slice(0, 2) : '',
      stages: selectors.map(s => s.stage), phase: 'overview' };
    this.look('release');
    this.say('Schleife geöffnet. Kamera 2 zeigt den Nummernblock, dann stellen alle belegten Wähler gleichzeitig zurück.');
    // A single set of tasks drives every occupied selector. The pause before
    // release is purely for the demonstration camera, not a relay delay.
    this.task(CAMERA_TRAVEL_SECONDS + .35);
    this.task(.45, () => {
      this.release.phase = 'resetting';
      for (const s of selectors) { s.rotary = 11; s.phase = 'löst aus'; }
      this.emit('release', { stages: this.release.stages });
      this.say(`${selectors.length} Wähler stellen gleichzeitig zurück.`);
    });
    this.task(.55, () => {
      for (const s of selectors) { s.level = 0; s.phase = 'fällt ab'; }
      this.emit('step', { stages: this.release.stages });
    });
    this.task(.45, () => {
      for (const s of selectors) { s.rotary = 0; s.phase = 'dreht zurück'; }
      this.emit('state');
    });
    this.task(.6, () => {
      for (const s of selectors) { s.held = false; s.phase = 'frei'; this.selectors[s.stage] = null; }
      this.release.phase = 'free'; this.emit('route');
    });
    this.task(CAMERA_TRAVEL_SECONDS, () => { this.release.phase = 'returning'; this.look(0); }, null, () => {
      this.state = 'idle'; this.digits = ''; this.target = null; this.release = null;
      this.say('Alle Wähler in Ruhelage. Der Anschluss ist wieder frei.');
    });
    return true;
  }
  step(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Ungültiger Zeitschritt');
    this.time += dt;
    let remaining = dt, guard = 0;
    while (remaining > 1e-8 && guard++ < 10000) {
      if (!this.activeTask) {
        if (!this.tasks.length) {
          if (this.tapeRunning) this.playbackSeconds += remaining;
          break;
        }
        this.activeTask = this.tasks.shift(); this.activeTask.start();
      }
      const task = this.activeTask, consumed = Math.min(remaining, task.duration - task.elapsed);
      task.elapsed += consumed; remaining -= consumed;
      task.update?.(Math.min(1, task.elapsed / task.duration));
      if (task.elapsed + 1e-8 >= task.duration) { this.activeTask = null; task.end(); }
    }
  }
  snapshot() {
    return { state: this.state, offHook: this.offHook, digits: this.digits, pending: this.pending.join(''),
      focus: this.focus, pulse: this.pulse, dialTone: this.dialTone, target: this.target, targetOffHook: this.targetOffHook,
      release: this.release ? { ...this.release, stages: [...this.release.stages] } : null,
      tapeRunning: this.tapeRunning, playbackSeconds: this.playbackSeconds,
      selectors: this.selectors.map(s => s ? { ...s } : null), allocated: this.instances.size,
      message: this.message, announcement: this.announcement };
  }
}
