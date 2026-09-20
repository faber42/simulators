import * as T from '../pinsim/three.module.min.js';
import { station, STATION_SETTLE } from './route.mjs';
import { CAR_LENGTH, DOOR_OFFSETS } from './traffic.mjs';

export function doorInspectionActive(enabled, train) {
  return enabled && (train.phase === 'settling' && train.timer >= STATION_SETTLE - .45
    || ['opening', 'open', 'closing'].includes(train.phase)
    || train.phase === 'dispatch' && train.timer < .3);
}

// Diagnostic only: a separate camera leaves the normal front camera untouched.
export class DoorInspection {
  constructor() {
    this.camera = new T.PerspectiveCamera(57, 1, .06, 225);
    this.camera.layers.enable(1); this.target = new T.Vector3();
  }
  update(enabled, train, vehicle, aspect) {
    if (!doorInspectionActive(enabled, train)) return null;
    const side = station(train.next).side, car = vehicle.cars[0];
    const z = DOOR_OFFSETS[0] - CAR_LENGTH / 2, distance = 3.65 - 1.485;
    car.updateWorldMatrix(true, false);
    this.camera.position.set(side * 3.65, 1.98, z).applyMatrix4(car.matrixWorld);
    this.target.set(side * 1.485, 1.98, z).applyMatrix4(car.matrixWorld);
    this.camera.lookAt(this.target);
    // Fit the full open leaves and threshold, also in a narrow preview pane.
    this.camera.aspect = aspect;
    this.camera.fov = T.MathUtils.radToDeg(2 * Math.atan(Math.max(1.25, 1.6 / aspect) / distance));
    this.camera.updateProjectionMatrix();
    return this.camera;
  }
}
