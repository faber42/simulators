import * as T from '../pinsim/three.module.min.js';
import { DoorInspection } from './door-inspection.js';

export function diagnosticViewURL(href, mode, train, diagnostics) {
  const url = new URL(href);
  for (const key of ['view', 'station', 'offset', 'junction', 'kind', 'board', 'end', 'play']) url.searchParams.delete(key);
  if (mode !== 'front') url.searchParams.set('view', mode);
  url.searchParams.set('time', train.time.toFixed(3));
  if (train.paused) url.searchParams.set('paused', '1'); else url.searchParams.delete('paused');
  if (diagnostics) url.searchParams.set('diagnostics', '1'); else url.searchParams.delete('diagnostics');
  return url;
}

export class DiagnosticViews {
  constructor(mode = 'front') {
    this.mode = mode; this.active = mode === 'inspection' ? 'inspection' : 'front';
    this.door = new DoorInspection(); this.monitor = new T.PerspectiveCamera();
  }
  update(train, vehicle, mirror, aspect) {
    let camera = this.door.update(this.mode === 'door', train, vehicle, aspect);
    this.active = camera ? 'door' : this.mode === 'inspection' ? 'inspection' : 'front';
    if (this.mode === 'mirror' && mirror.active) {
      // Copy into a dedicated camera: never leave the 28-degree monitor lens
      // or the own-train layer enabled on the normal cockpit camera.
      camera = this.monitor; camera.copy(mirror.camera); camera.aspect = aspect; camera.updateProjectionMatrix();
      this.active = 'mirror';
    }
    // The physical monitor must reappear on returning to the cockpit view.
    mirror.rig.traverse(object => object.layers.set(this.active === 'mirror' ? 2 : 0));
    return camera;
  }
}
