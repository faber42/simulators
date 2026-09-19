import * as T from '../pinsim/three.module.min.js';
import { point, trackAngle } from './route.mjs';

export const STEP_PITCH = .24;
export const STEP_COUNT = 32;
export const STEP_SPEED = .42;

// Horizontal treads flatten into the comb plates at both ends of the flight.
export function escalatorHeight(distance) {
  const r = T.MathUtils.clamp(distance, 0, 7.2);
  const rise = r < .5 ? r * r : r > 6.7 ? 6.7 - (7.2 - r) ** 2 : r - .25;
  return .945 + rise / 6.7 * 3.675;
}
export function stepPosition(index, time) {
  const length = STEP_COUNT * STEP_PITCH;
  const distance = ((index * STEP_PITCH + time * STEP_SPEED) % length + length) % length - .48;
  return { distance, height: escalatorHeight(distance) };
}

function treadGeometry() {
  const positions = [], normals = [], colors = [];
  const part = (w, h, d, x, y, z, color) => {
    const g = new T.BoxGeometry(w, h, d).toNonIndexed(), c = new T.Color(color);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
      normals.push(n.getX(i), n.getY(i), n.getZ(i)); colors.push(c.r, c.g, c.b);
    }
    g.dispose();
  };
  part(1.35, .15, STEP_PITCH - .005, 0, -.075, 0, '#87908e');
  for (let x = -.63; x <= .63; x += .045)
    part(.009, .002, STEP_PITCH - .015, x, .001, 0, '#303b3b');
  part(1.33, .003, .018, 0, .002, .108, '#c7b46a');
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere(); return g;
}

// One instanced draw for the entire conveyor, reusing the transform and buffers.
export class Escalator {
  constructor(start, side, base, material) {
    this.start = start; this.x = side * 5.55; this.origin = point(base);
    this.mesh = new T.InstancedMesh(treadGeometry(), material, STEP_COUNT);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.transform = new T.Object3D(); this.update(0);
    this.mesh.computeBoundingSphere(); this.mesh.boundingSphere.radius += .4;
  }
  update(time) {
    for (let i = 0; i < STEP_COUNT; i++) {
      const step = stepPosition(i, time), s = this.start + step.distance;
      const p = point(s, this.x, step.height), t = this.transform;
      t.position.set(p[0] - this.origin[0], p[1], p[2] - this.origin[2]);
      t.rotation.y = -trackAngle(s); t.updateMatrix();
      this.mesh.setMatrixAt(i, t.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
