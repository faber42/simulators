// Keep a stable presentation cadence without accumulating a catch-up burst.
// Simulation ticks remain independent of the display's refresh rate.
export class FrameCadence {
  constructor(fps = 30) { this.interval = 1000 / fps; this.next = null; }
  reset() { this.next = null; }
  take(now) {
    if (this.next === null) { this.next = now + this.interval; return true; }
    if (now < this.next - .5) return false;
    this.next += this.interval;
    if (this.next < now + .5) this.next = now + this.interval;
    return true;
  }
}
