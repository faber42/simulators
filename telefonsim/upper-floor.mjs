// Presentation timing uses simulation time, so pause and speed remain coherent.
export const FLOOR_DESCENT_SECONDS = 1.2;
export const FLOOR_REVEAL_SECONDS = .8;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => n * n * (3 - 2 * n);

export function upperFloorRequested(engine) {
  return engine.offHook && /^[1-9]\d{5}$/.test(engine.digits) && engine.state !== 'releasing';
}

export class UpperFloorTransition {
  constructor() { this.elapsed = 0; }
  update(wanted, dt) {
    this.elapsed = Math.max(0, Math.min(FLOOR_DESCENT_SECONDS + FLOOR_REVEAL_SECONDS,
      this.elapsed + dt * (wanted ? 1 : -2)));
  }
  get descent() { return ease(clamp(this.elapsed / FLOOR_DESCENT_SECONDS)); }
  get reveal() { return ease(clamp((this.elapsed - FLOOR_DESCENT_SECONDS) / FLOOR_REVEAL_SECONDS)); }
  get phase() { return this.elapsed === 0 ? 'lower' : this.reveal === 0 ? 'descending' : this.reveal < 1 ? 'revealing' : 'upper'; }
}
