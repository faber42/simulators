import { Vector3 } from '../pinsim/three.module.min.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const LOOK_LIMIT = .02;

/** Free camera with a fixed orbit pivot and an independently movable gaze. */
export class FreeCameraControls {
  constructor() {
    this.pivot = new Vector3();
    this.position = new Vector3();
    this.target = new Vector3();
  }

  reset(position, target) {
    this.pivot.copy(target);
    this.capture(position, target);
  }

  // Adopt the currently visible pose when a gesture interrupts camera easing.
  // The orbit pivot stays put even when the user is looking away from it.
  capture(position, target) {
    this.position.copy(position); this.target.copy(target);
    const offset = position.clone().sub(this.pivot);
    this.distance = Math.max(offset.length(), .001);
    this.theta = Math.atan2(offset.x, offset.z);
    this.phi = Math.acos(clamp(offset.y / this.distance, -1, 1));
    const direction = target.clone().sub(position);
    this.lookTheta = Math.atan2(direction.x, direction.z);
    this.lookPhi = Math.acos(clamp(direction.y / Math.max(direction.length(), .001), -1, 1));
  }

  look(dx, dy) {
    this.lookTheta -= dx * .006;
    this.lookPhi = clamp(this.lookPhi - dy * .005, LOOK_LIMIT, Math.PI - LOOK_LIMIT);
    this.updateTarget();
  }

  orbit(dx, dy) {
    const nextPhi = clamp(this.phi - dy * .005, .08, 1.48);
    this.theta -= dx * .006;
    this.lookTheta -= dx * .006;
    this.lookPhi = clamp(this.lookPhi - (nextPhi - this.phi), LOOK_LIMIT, Math.PI - LOOK_LIMIT);
    this.phi = nextPhi;
    this.updatePosition();
  }

  zoom(delta, minDistance = 25) {
    this.distance = clamp(this.distance * Math.exp(delta * .001), minDistance, 520);
    this.updatePosition();
  }

  updatePosition() {
    this.position.setFromSphericalCoords(this.distance, this.phi, this.theta).add(this.pivot);
    this.updateTarget();
  }

  updateTarget() {
    this.target.setFromSphericalCoords(this.distance, this.lookPhi, this.lookTheta).add(this.position);
  }
}
