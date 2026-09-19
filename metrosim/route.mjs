import { Suspension } from './suspension.mjs';

// Metres and seconds. The train uses a fixed integration step in app.js.
export const BLOCK = 528;
export const FIRST_STATION = 264;
export const PLATFORM_LENGTH = 120;
export const DOOR_CYCLE = 2 + 8 + 2.8 + 1.4;
export const SIGNAL_CLEARANCE = 4.5; // Keep the mast in the front camera's field of view.
export const SIGNAL_REACTION = 1.25; // Release brakes after a standing signal wait.
export const STATION_SETTLE = 1.15;
export const BRAKE_RELEASE = .55;
export const TRACTION_RAMP = .8;
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const BRANCH_SHIFT = 24;
// A small route choice table is kept separate from the scenery. Later a network
// itinerary can select these same outgoing edges instead of this 5/6/7 cadence.
export function takesBranch(index) { return index > 0 && [0, 5, 11].includes(index % 18); }
function separationAt(s, start, fork) {
  if (!fork) return 3.6 * smooth(s, start + 18, start + 60) * (1 - smooth(s, start + 120, start + 162));
  // The approach has a long, shallow throat. Beyond the portal the bore keeps
  // going for more than a camera's sight distance; it never returns to zero.
  const r = s - start;
  if (r < 78) return 3.6 * smooth(s, start + 18, start + 72);
  if (r < 144) return 3.6 + 4.2 * ((r - 78) / 66) ** 2;
  const slope = 8.4 / 66;
  if (r < 168) return 7.8 + slope * (r - 144);
  const t = Math.max(0, Math.min(1, (r - 168) / 60)), a = 7.8 + slope * 24;
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * slope * 60 + (-2 * t ** 3 + 3 * t ** 2) * BRANCH_SHIFT;
}
function itineraryOffset(s) {
  const index = Math.max(0, Math.ceil((s - FIRST_STATION) / BLOCK)), start = station(index).start - 246;
  const rightTurns = Math.max(0, Math.floor((index - 1) / 18));
  const leftFive = index > 5 ? Math.floor((index - 6) / 18) + 1 : 0;
  const leftEleven = index > 11 ? Math.floor((index - 12) / 18) + 1 : 0;
  let offset = BRANCH_SHIFT * (rightTurns - leftFive - leftEleven);
  if (takesBranch(index)) offset += (index % 2 === 0 ? 1 : -1) * separationAt(s, start, true);
  return offset;
}
export const STATIONS = [
  { name: 'Rathaus', color: '#428780', wallStyle: 'solid', side: -1, curve: 0, feature: 'escalator' },
  { name: 'Museum', color: '#c09552', wallStyle: 'diagonal', side: 1, curve: 1, feature: 'lift' },
  { name: 'Westhafen', color: '#427b9e', wallStyle: 'circles', side: 1, curve: -1, feature: 'escalator' },
  { name: 'Opernplatz', color: '#ad5947', wallStyle: 'solid', side: -1, curve: .65, feature: 'lift' },
  { name: 'Botanischer Garten', color: '#7c8c63', wallStyle: 'band', side: 1, curve: 0, feature: 'escalator' },
  { name: 'Zentralbahnhof', color: '#eeeee7', wallStyle: 'white', side: -1, curve: -.8, feature: 'lift' },
];
export function station(index) {
  const style = STATIONS[((index % STATIONS.length) + STATIONS.length) % STATIONS.length];
  const start = FIRST_STATION + index * BLOCK;
  return { ...style, index, start, end: start + PLATFORM_LENGTH, stop: start + PLATFORM_LENGTH - 9, passage: index % 3 !== 2 };
}
export function stationAt(s) {
  const st = station(Math.floor((s - FIRST_STATION) / BLOCK));
  return st.index >= 0 && s >= st.start && s < st.end ? st : null;
}
// Continuous centreline: broad tunnel bends; straight or gently curved platforms.
export function trackX(s) {
  const i = Math.floor((s - FIRST_STATION) / BLOCK);
  const st = station(i);
  const t = (s - st.start) / BLOCK;
  const base = 6 * Math.sin((s + 70) / 190);
  const local = t < PLATFORM_LENGTH / BLOCK
    ? st.curve * 3 * Math.sin(Math.PI * (s - st.start) / PLATFORM_LENGTH) ** 2
    : 20 * Math.sin(Math.PI * (s - st.end) / (BLOCK - PLATFORM_LENGTH)) ** 2;
  // Both ends have zero slope, so curved tunnels meet platforms continuously.
  return base + local + itineraryOffset(s);
}
export function trackAngle(s) { return Math.atan2(trackX(s + .1) - trackX(s - .1), .2); }
export function junctionAt(s) {
  const index = Math.max(0, Math.ceil((s - FIRST_STATION) / BLOCK));
  const takeBranch = takesBranch(index), start = station(index).start - 246, fork = takeBranch || index % 4 < 2;
  const end = start + (fork ? 228 : 180), split = start + 144;
  const turnSide = index % 2 === 0 ? 1 : -1, side = takeBranch ? -turnSide : turnSide;
  if (s < start || s > end) return null;
  const separation = separationAt(s, start, fork);
  const extraWidth = fork
    ? (s < split ? Math.max(3.8, separation + .4) * smooth(s, start, start + 18) : 0)
    : 3.8 * smooth(s, start, start + 18) * (1 - smooth(s, end - 18, end));
  return { index, start, end, split, fork, side, turnSide, takeBranch, selectedEdge: takeBranch ? 'branch' : 'through', extraWidth, leftWidth: side < 0 ? extraWidth : 0,
    rightWidth: side > 0 ? extraWidth : 0, branchX: side * separation, separate: fork && s >= split };
}
export function point(s, x = 0, y = 0) {
  const a = trackAngle(s);
  return [trackX(s) + x * Math.cos(a), y, -s + x * Math.sin(a)];
}
export function branchAt(s) {
  const index = Math.floor((s - (FIRST_STATION - 246 + 144)) / BLOCK);
  if (index < 0) return null;
  const start = station(index).start - 246, j = junctionAt(Math.min(s, start + 228));
  return j?.fork && s >= j.split && s <= j.split + 300 ? j : null;
}
export function exitSignal(index) { return { id: `exit-${index}`, kind: 'exit', s: station(index).end + 1, stationIndex: index }; }
export function signalSpecs(from, to) {
  const result = [{ id: 'initial', kind: 'initial', s: 11 }];
  for (let i = Math.max(0, Math.floor((from - FIRST_STATION) / BLOCK) - 1); i <= Math.ceil((to - FIRST_STATION) / BLOCK); i++) {
    const st = station(i); result.push(exitSignal(i));
    for (let slot = 0; slot < 2; slot++) result.push({ id: `block-${i}-${slot}`, kind: 'block', s: st.start - 172 + slot * 96, stationIndex: i, slot });
  }
  return result.filter(signal => signal.s >= from && signal.s <= to).sort((a, b) => a.s - b.s);
}
export function exitReleaseOffset(index) { return [-6, 7, 0, 2.2, 7.4, -3][index % 6]; }
function motion(speed, distance, dt, traction = 1) {
  // Unload the brakes over the final low-speed approach. The two curves join
  // with the same speed and deceleration, then braking tapers towards zero.
  const gentleSpeed = .55, gentleDistance = 2 * gentleSpeed ** 2 / (3 * .83);
  const d = Math.max(0, distance);
  const target = Math.min(16.7, d < gentleDistance
    ? gentleSpeed * (d / gentleDistance) ** (2 / 3)
    : Math.sqrt(gentleSpeed ** 2 + 2 * .83 * (d - gentleDistance)));
  const next = Math.max(0, Math.min(speed + Math.max(-.86 * dt, Math.min(.92 * traction * dt, target - speed)), 16.7));
  return { speed: next, advance: (speed + next) * .5 * dt };
}
function brakingArrival(speed, distance) {
  // Predict once when the preceding block enters the approach horizon. The
  // resulting release is a clock deadline, independent of later door phases.
  let elapsed = 0;
  while (distance > .0005 && elapsed < 90) {
    const next = motion(speed, distance, 1 / 30); speed = next.speed; distance -= next.advance; elapsed += 1 / 30;
  }
  return elapsed;
}
export class BlockSignals {
  constructor() { this.releases = new Map(); }
  isGreen(signal, time) {
    if (signal.kind === 'initial') return time >= 5.5;
    const release = this.releases.get(signal.id);
    if (release) return time + 1e-8 >= release.at;
    return signal.kind === 'block' && (signal.stationIndex * 2 + signal.slot) % 3 !== 0;
  }
  arrive(index, time) {
    const signal = exitSignal(index);
    this.releases.set(signal.id, { at: time + DOOR_CYCLE + exitReleaseOffset(index), s: signal.s });
  }
  update(train) {
    for (const [id, release] of this.releases) if (release.s < train.s - 64) this.releases.delete(id);
    if (!['running', 'depart'].includes(train.phase)) return;
    const blocking = signalSpecs(train.s, Math.min(train.stop.stop, train.s + 210)).find(signal => !this.isGreen(signal, train.time));
    if (blocking?.kind === 'block' && !this.releases.has(blocking.id)) {
      const lead = [1.8, 2.7, 1.1][blocking.stationIndex % 3];
      this.releases.set(blocking.id, { s: blocking.s, at: train.time + Math.max(.5, brakingArrival(train.speed, blocking.s - SIGNAL_CLEARANCE - train.s) - lead) });
    }
  }
}
export class Train {
  constructor() {
    this.s = 0; this.speed = 0; this.time = 0; this.phase = 'signal'; this.timer = 0;
    this.next = 0; this.paused = false; this.visits = 0; this.signals = new BlockSignals();
    this.pendingSignal = null; this.signalWaits = 0; this.signalReadyAt = null;
    this.ride = new Suspension(); this.tractionAt = null; this.brakeReleaseAt = null; this.brakeReleased = false;
  }
  get stop() { return station(this.next); }
  get doors() { return ['opening', 'open', 'closing'].includes(this.phase); }
  get nextSignal() { return signalSpecs(this.s, this.s + BLOCK)[0]; }
  get green() { return this.signals.isGreen(this.nextSignal, this.time); }
  step(dt) {
    if (this.paused) return;
    const previousSpeed = this.speed;
    this.time += dt; this.timer += dt; this.signals.update(this);
    this.advanceMotion(dt);
    if (this.brakeReleaseAt !== null && !this.brakeReleased && this.time + 1e-8 >= this.brakeReleaseAt) {
      this.brakeReleased = true; this.ride.release();
    }
    this.ride.step(dt, dt > 0 ? (this.speed - previousSpeed) / dt : 0);
  }
  prepareDeparture(readyAt) {
    this.tractionAt = readyAt; this.brakeReleaseAt = readyAt - BRAKE_RELEASE; this.brakeReleased = false;
  }
  advanceMotion(dt) {
    if (this.phase === 'signal') {
      if (this.green) { this.phase = 'depart'; this.timer = 0; this.prepareDeparture(this.time + SIGNAL_REACTION); }
      return;
    }
    const transitions = { settling: [STATION_SETTLE, 'opening'], opening: [2, 'open'], open: [8, 'closing'], closing: [2.8, 'dispatch'], dispatch: [1.4, 'depart'] };
    if (transitions[this.phase]) {
      const [duration, phase] = transitions[this.phase];
      if (this.timer + 1e-8 >= duration) {
        if (this.phase === 'settling') this.signals.arrive(this.next, this.time);
        if (phase === 'dispatch') this.prepareDeparture(this.time + 1.4);
        if (this.phase === 'dispatch') this.next++;
        this.phase = phase; this.timer = 0;
      }
      return;
    }
    if (this.phase === 'waiting') {
      if (!this.signals.isGreen(this.pendingSignal, this.time)) {
        this.signalReadyAt = null; this.brakeReleaseAt = null; this.tractionAt = null; return;
      }
      // Only a train that stopped at red needs this reaction/brake-release time.
      // Use simulation time so pausing cannot consume the delay.
      if (this.signalReadyAt === null) {
        this.signalReadyAt = this.time + SIGNAL_REACTION; this.prepareDeparture(this.signalReadyAt);
      }
      if (this.time + 1e-8 < this.signalReadyAt) return;
      this.pendingSignal = null; this.signalReadyAt = null; this.phase = 'depart'; this.timer = SIGNAL_REACTION;
    }
    if (this.phase === 'depart') {
      if (this.visits === 0 && this.timer < SIGNAL_REACTION) return;
      if (this.s > (this.next ? exitSignal(this.next - 1).s : 11)) this.phase = 'running';
    }
    // A closed-door departure may roll towards a red exit, but never cross it.
    // A signal stop is a separate event and cannot start another door cycle.
    const red = signalSpecs(this.s, this.stop.stop + SIGNAL_CLEARANCE).find(signal => !this.signals.isGreen(signal, this.time));
    const signalStop = red && red.s - SIGNAL_CLEARANCE < this.stop.stop;
    const stopS = signalStop ? red.s - SIGNAL_CLEARANCE : this.stop.stop, distance = Math.max(0, stopS - this.s);
    const traction = this.tractionAt === null ? 1 : smooth(this.time - this.tractionAt, 0, TRACTION_RAMP);
    const next = motion(this.speed, distance, dt, traction); this.speed = next.speed;
    if (next.advance >= distance || (distance < .0005 && this.speed < .025)) {
      this.s = stopS; this.speed = 0; this.timer = 0;
      this.ride.stop(); this.tractionAt = null; this.brakeReleaseAt = null; this.brakeReleased = false;
      if (signalStop) { this.phase = 'waiting'; this.pendingSignal = red; this.signalWaits++; }
      else { this.phase = 'settling'; this.visits++; }
    } else this.s += next.advance;
  }
  snapshot() {
    const signal = this.nextSignal, j = junctionAt(this.s), release = this.signals.releases.get(signal.id);
    return { distance: this.s, speedKmh: this.speed * 3.6, phase: this.phase, doors: this.doors, simulationTime: this.time,
      bodyMotion: { heaveMm: this.ride.heave * 1000, surgeMm: this.ride.surge * 1000, pitchDegrees: this.ride.pitch * 180 / Math.PI },
      signal: this.green ? 'green' : 'red', nextSignal: { id: signal.id, distance: signal.s - this.s, releaseIn: release ? Math.max(0, release.at - this.time) : null },
      station: this.stop.name, stationIndex: this.next, platformSide: this.stop.side < 0 ? 'left' : 'right', visits: this.visits,
      paused: this.paused, signalWaits: this.signalWaits, routeChoice: j?.selectedEdge || 'through', junctionIndex: j?.index ?? null };
  }
}
