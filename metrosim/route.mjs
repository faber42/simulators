// Metres and seconds. The train uses a fixed integration step in app.js.
export const BLOCK = 528;
export const FIRST_STATION = 264;
export const PLATFORM_LENGTH = 120;
export const STATIONS = [
  { name: 'Rathaus', color: '#477c78', side: -1, curve: 0, feature: 'escalator' },
  { name: 'Museum', color: '#b89862', side: 1, curve: 1, feature: 'lift' },
  { name: 'Westhafen', color: '#688ba1', side: 1, curve: -1, feature: 'escalator' },
  { name: 'Opernplatz', color: '#9b6154', side: -1, curve: .65, feature: 'lift' },
  { name: 'Botanischer Garten', color: '#7c8c63', side: 1, curve: 0, feature: 'escalator' },
  { name: 'Zentralbahnhof', color: '#a19a8d', side: -1, curve: -.8, feature: 'lift' },
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
  return base + local;
}
export function trackAngle(s) { return Math.atan2(trackX(s + .1) - trackX(s - .1), .2); }
export function junctionAt(s) {
  const index = Math.max(0, Math.ceil((s - FIRST_STATION) / BLOCK));
  const start = station(index).start - 246, fork = index % 4 < 2;
  const end = start + (fork ? 222 : 180), split = start + 132, side = index % 2 === 0 ? 1 : -1;
  if (s < start || s > end) return null;
  const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const separation = fork
    ? 3.6 * smooth(s, start + 18, start + 60) + 16 * (Math.max(0, s - start - 84) / 96) ** 2
    : 3.6 * smooth(s, start + 18, start + 60) * (1 - smooth(s, end - 60, end - 18));
  const extraWidth = fork
    ? (s < split ? Math.max(3.8, separation + .4) * smooth(s, start, start + 18) : 0)
    : 3.8 * smooth(s, start, start + 18) * (1 - smooth(s, end - 18, end));
  return { index, start, end, split, fork, side, extraWidth, leftWidth: side < 0 ? extraWidth : 0,
    rightWidth: side > 0 ? extraWidth : 0, branchX: side * separation, separate: fork && s >= split };
}
export function point(s, x = 0, y = 0) {
  const a = trackAngle(s);
  return [trackX(s) + x * Math.cos(a), y, -s + x * Math.sin(a)];
}
export class Train {
  constructor() { this.s = 0; this.speed = 0; this.time = 0; this.phase = 'signal'; this.timer = 0; this.next = 0; this.paused = false; this.visits = 0; }
  get stop() { return station(this.next); }
  get doors() { return ['opening', 'open', 'closing'].includes(this.phase); }
  get green() { return this.phase === 'depart' || this.phase === 'running'; }
  step(dt) {
    if (this.paused) return;
    this.time += dt;
    this.timer += dt;
    const transitions = { signal: [5.5, 'depart'], opening: [2, 'open'], open: [8, 'closing'], closing: [2.8, 'dispatch'], dispatch: [1.4, 'depart'] };
    if (transitions[this.phase]) {
      const [duration, phase] = transitions[this.phase];
      if (this.timer >= duration) { this.phase = phase; this.timer = 0; }
      return;
    }
    if (this.phase === 'depart') {
      if (this.timer < 1.25) return; // Signal clears before the train moves.
      if (this.s > this.stop.stop - 1) this.next++;
      this.phase = 'running'; this.timer = 0;
    }
    const distance = Math.max(0, this.stop.stop - this.s);
    const target = Math.min(16.7, Math.sqrt(2 * .83 * distance));
    const previous = this.speed;
    this.speed = Math.max(0, Math.min(this.speed + Math.max(-.86 * dt, Math.min(.92 * dt, target - this.speed)), 16.7));
    const advance = (previous + this.speed) * .5 * dt;
    if (advance >= distance || (distance < .018 && this.speed < .2)) {
      this.s = this.stop.stop; this.speed = 0; this.phase = 'opening'; this.timer = 0; this.visits++;
    } else this.s += advance;
  }
  snapshot() { return { distance: this.s, speedKmh: this.speed * 3.6, phase: this.phase, doors: this.doors, signal: this.green ? 'green' : 'red', station: this.stop.name, stationIndex: this.next, platformSide: this.stop.side < 0 ? 'left' : 'right', visits: this.visits, paused: this.paused }; }
}
