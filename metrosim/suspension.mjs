// Small, damped car-body motion relative to the stopped/running wheelset.
// Metres and radians; integrated in simulation time, never in render time.
export class Suspension {
  constructor() {
    this.heave = 0; this.pitch = 0; this.surge = 0;
    this.heaveVelocity = 0; this.pitchVelocity = 0; this.surgeVelocity = 0;
  }
  stop() {
    this.heaveVelocity += .017;
    this.pitchVelocity += .003;
    this.surgeVelocity -= .035;
  }
  release() {
    this.heaveVelocity += .0025;
    this.pitchVelocity += .0005;
  }
  step(dt, acceleration) {
    const a = Math.max(-.86, Math.min(.92, acceleration));
    this.spring('heave', a * .003, 8, .58, dt);
    this.spring('pitch', a * .0012, 6.5, .62, dt);
    this.spring('surge', -a * .003, 7, .55, dt);
  }
  spring(key, target, frequency, damping, dt) {
    // Analytic damped-spring step avoids frame-rate-dependent settling.
    const velocityKey = key + 'Velocity', x = this[key] - target, v = this[velocityKey];
    const decay = damping * frequency, w = frequency * Math.sqrt(1 - damping * damping);
    const e = Math.exp(-decay * dt), c = Math.cos(w * dt), s = Math.sin(w * dt);
    this[key] = target + e * (x * c + (v + decay * x) / w * s);
    this[velocityKey] = e * (v * c - (frequency * frequency * x + decay * v) / w * s);
  }
}
