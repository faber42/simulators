import * as T from '../pinsim/three.module.min.js';
import { point, trackX, trackAngle, stationAt, station, junctionAt, branchAt, signalSpecs, BLOCK, FIRST_STATION } from './route.mjs';
import { random } from './materials.js';
import { Crowd } from './crowd.js';
import { passengerAttention } from './attention.mjs';
import { boardingPlan } from './boarding.mjs';
import { updatePedestrians } from './pedestrians.mjs';
import { DistantLights } from './distant-lights.js';
import { Escalator, escalatorHeight } from './escalator.js';
import { seatedPose, SEAT_TOP, SEAT_X } from './seating.js';
import { Vehicles } from './vehicles.js';
import { PlatformMirror } from './mirrors.js';
import { PassengerExchange } from './exchanges.js';
import { doorOpening, ownExchangeAge, DOOR_OFFSETS, EXCHANGE_DOORS } from './traffic.mjs';

const box = new T.BoxGeometry(1, 1, 1).toNonIndexed();
const plane = new T.PlaneGeometry(1, 1).toNonIndexed();
const sphere = new T.SphereGeometry(1, 12, 8).toNonIndexed();
const matrix = new T.Matrix4(), normalMatrix = new T.Matrix3(), quat = new T.Quaternion(), euler = new T.Euler();
const vector = new T.Vector3(), normal = new T.Vector3();

// Static geometry is merged per material and 24 m section: hundreds of rail
// fastenings, tile strips and tunnel segments cost only a handful of draws.
class Batch {
  constructor(base) { this.base = base; this.origin = point(base); this.data = new Map(); }
  add(geometry, material, s, x, y, scale, rotation = [0, 0, 0]) {
    let data = this.data.get(material);
    if (!data) { data = { p: [], n: [], uv: [], light: [], span: [] }; this.data.set(material, data); }
    const p = point(s, x, y);
    euler.set(rotation[0], -trackAngle(s) + rotation[1], rotation[2], 'YXZ'); quat.setFromEuler(euler);
    const a = trackAngle(s), bend = (trackAngle(s + .1) - trackAngle(s - .1)) / .2;
    const lengthScale = 1 / Math.cos(a) - x * bend;
    matrix.compose(new T.Vector3(p[0] - this.origin[0], y, p[2] - this.origin[2]), quat, new T.Vector3(scale[0], scale[1], scale[2] * lengthScale));
    normalMatrix.getNormalMatrix(matrix);
    const pos = geometry.attributes.position, ns = geometry.attributes.normal, uv = geometry.attributes.uv;
    const lit = material.userData.infrastructure, stationSide = lit ? stationAt(s)?.side || 0 : 0;
    for (let i = 0; i < pos.count; i++) {
      vector.fromBufferAttribute(pos, i).applyMatrix4(matrix); normal.fromBufferAttribute(ns, i).applyMatrix3(normalMatrix).normalize();
      data.p.push(vector.x, vector.y, vector.z); data.n.push(normal.x, normal.y, normal.z); data.uv.push(uv.getX(i), uv.getY(i));
      if (lit) {
        const vertexS = this.base - vector.z, junction = junctionAt(vertexS), continuation = branchAt(vertexS);
        let lateral = vector.x + this.origin[0] - trackX(vertexS);
        const inBranch = continuation && Math.abs(lateral - continuation.branchX) < Math.abs(lateral);
        if (inBranch) lateral -= continuation.branchX;
        data.light.push(lateral, vector.y, ((this.base % BLOCK) + BLOCK) % BLOCK + vertexS - this.base, inBranch ? 0 : stationSide);
        data.span.push(inBranch ? 0 : junction?.leftWidth || 0, inBranch ? 0 : junction?.rightWidth || 0);
      }
    }
  }
  box(material, s, x, y, w, h, d, rotation) { this.add(box, material, s, x, y, [w, h, d], rotation); }
  sweptBox(material, from, to, x, y, width, height) {
    // Adjacent slices share exact end sections, instead of overlapping tangent
    // boxes whose almost coplanar faces fight on curved platforms.
    const s = (from + to) / 2, origin = point(s), angle = trackAngle(s);
    const geometry = box.clone(), positions = geometry.attributes.position;
    const c = Math.cos(angle), sn = Math.sin(angle);
    for (let i = 0; i < positions.count; i++) {
      const p = point(positions.getZ(i) > 0 ? from : to, x + positions.getX(i) * width, y + positions.getY(i) * height);
      const dx = p[0] - origin[0], dz = p[2] - origin[2];
      positions.setXYZ(i, c * dx + sn * dz, p[1] - y, -sn * dx + c * dz);
    }
    geometry.computeVertexNormals();
    this.add(geometry, material, s, 0, y, [1, 1, c]); geometry.dispose();
  }
  *finish(group, renderOrder = 0) {
    for (const [material, d] of this.data) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(d.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(d.uv, 2)); g.computeBoundingSphere();
      if (d.light.length) { g.setAttribute('lightCoord', new T.Float32BufferAttribute(d.light, 4)); g.setAttribute('lightSpan', new T.Float32BufferAttribute(d.span, 2)); }
      const mesh = new T.Mesh(g, material); mesh.renderOrder = renderOrder; group.add(mesh);
      yield;
    }
    this.data.clear();
  }
}
const arch = [[-3.05, -.32], [-3.05, 1.65]];
for (let i = 1; i <= 24; i++) { const a = Math.PI - Math.PI * i / 24; arch.push([Math.cos(a) * 3.05, 1.65 + Math.sin(a) * 3.05]); }
arch.push([3.05, -.32]);

function tunnelRing(b, m, s, width, rib = false, branch = false) {
  const centre = branch ? branchAt(s) : junctionAt(s);
  const profile = (x, at) => {
    // Keep the common chamber open all the way to the double portal. It must
    // not taper back across the diverging rails at the last segment.
    const sample = centre?.fork
      ? (centre.separate ? Math.max(at, centre.split) : Math.min(at, centre.split - .001))
      : at;
    const j = branch ? branchAt(T.MathUtils.clamp(at, centre.split, centre.split + 300)) : junctionAt(sample);
    if (branch) return x + (j?.branchX || 0);
    return x + (j?.rightWidth || 0) * (x + 3.05) / 6.1 - (j?.leftWidth || 0) * (3.05 - x) / 6.1;
  };
  if (!rib) {
    const positions = [], normals = [], uv = [], indices = [];
    for (let end = 0; end < 2; end++) {
      const z = end === 0 ? width / 2 : -width / 2;
      const extra = branch ? 0 : centre?.extraWidth || 0;
      for (let j = 0; j < arch.length; j++) {
        const [x, y] = arch[j], nx = -x / 3.05 / (1 + extra / 6.1), ny = y <= 1.65 ? 0 : -(y - 1.65) / 3.05;
        const length = Math.hypot(nx, ny);
        positions.push(profile(x, s - z), y, z);
        normals.push(nx / length, ny / length, 0); uv.push(j / 4, end * width / 2);
      }
    }
    for (let j = 0; j < arch.length - 1; j++) { const far = j + arch.length; indices.push(j, far, j + 1, j + 1, far, far + 1); }
    const indexed = new T.BufferGeometry(); indexed.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); indexed.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); indexed.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); indexed.setIndex(indices);
    const geometry = indexed.toNonIndexed(); b.add(geometry, m.tunnel(s), s, 0, 0, [1, 1, 1]); geometry.dispose(); indexed.dispose(); return;
  }
  for (let j = 0; j < arch.length - 1; j++) {
    const a = [profile(arch[j][0], s), arch[j][1]];
    const c = [profile(arch[j + 1][0], s), arch[j + 1][1]], dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    const midX = (a[0] + c[0]) / 2, midY = (a[1] + c[1]) / 2;
    b.box(rib ? m.dark : m.concrete, s, midX + (rib ? dy / len * .086 : 0), midY - (rib ? dx / len * .086 : 0), len + .025, rib ? .018 : .16, width, [0, 0, Math.atan2(dy, dx)]);
  }
}
function forkPortal(b, m, s, junction) {
  const x = junction.branchX, low = Math.min(0, x) - 3.25, high = Math.max(0, x) + 3.25;
  const shape = new T.Shape();
  shape.moveTo(low, -.45); shape.lineTo(high, -.45); shape.lineTo(high, 5.25); shape.lineTo(low, 5.25); shape.closePath();
  for (const centre of [0, x]) {
    const hole = new T.Path();
    arch.forEach(([ax, y], i) => i === 0 ? hole.moveTo(ax + centre, y) : hole.lineTo(ax + centre, y));
    hole.closePath(); shape.holes.push(hole);
  }
  const indexed = new T.ExtrudeGeometry(shape, { depth: .55, bevelEnabled: false, curveSegments: 24 });
  b.add(indexed, m.tunnel(s), s, 0, 0, [1, 1, 1]); indexed.dispose();
  tunnelRing(b, m, s + .6, .2, true); tunnelRing(b, m, s + .6, .2, true, true);
}
function panel(b, material, s, x, y, w, h, facing = 0) { b.add(plane, material, s, x, y, [w, h, 1], [0, facing, 0]); }
function bench(b, m, s, side) {
  const x = side * SEAT_X;
  b.box(m.steel, s, x, 1.27, .12, .1, 2.85);
  for (const dz of [-1.17, 1.17]) {
    b.box(m.steel, s + dz, x, 1.12, .1, .35, .13);
    b.box(m.steel, s + dz, x, .977, .53, .065, .19);
  }
  for (const dz of [-1, 0, 1]) {
    b.box(m.seat, s + dz, x, SEAT_TOP - .045, .57, .09, .65);
    b.box(m.seat, s + dz, x + side * .26, 1.74, .085, .62, .65, [0, 0, -side * .08]);
    for (const edge of [-.4, .4]) {
      b.box(m.steel, s + dz + edge, x, 1.59, .52, .045, .045);
      b.box(m.steel, s + dz + edge, x + side * .2, 1.44, .045, .3, .045);
    }
  }
}
function stairs(b, m, s, side) {
  const x = side * 5.75, rise = .155, run = .3, steps = 24, slope = Math.atan2(rise, run);
  for (let i = 0; i < steps; i++) {
    const height = (i + 1) * rise;
    // Solid risers down to the foundation, with stone treads and thick cheeks.
    b.box(m.concrete, s + i * run, x, .945 + height / 2, 2.12, height, run + .015);
    b.box(m.floor, s + i * run - .01, x, .945 + height, 2.15, .065, run + .025);
    for (const dx of [-1.19, 1.19]) b.box(m.concrete, s + i * run, x + dx, .945 + (height + .8) / 2, .26, height + .8, run + .02);
    if (i === 0 || i === steps - 1) b.box(m.yellow, s + i * run - .12, x, 1.0 + height, 2.08, .015, .045);
  }
  for (const dx of [-1.05, 1.05]) b.box(m.steel, s + 3.48, x + dx, 3.73, .055, .07, 8.1, [slope, 0, 0]);
  b.box(m.concrete, s + 7.75, x, 2.81, 2.4, 3.74, 1.25);
  panel(b, m.sign('↑  Ausgang', 'exit'), s - 1.2, x, 3.95, 2.15, .48);
}
function escalator(b, m, s, side) {
  const x = side * 5.55;
  for (const [rel, y] of [[-.62, .96], [7.43, 4.625]]) {
    b.box(m.steel, s + rel, x, y - .035, 1.4, .07, .76);
    b.box(m.yellow, s + rel + (rel < 0 ? .36 : -.36), x, y + .004, 1.36, .009, .035);
  }
  b.box(m.dark, s + 3.55, x, 2.2, 1.52, .4, 8.1, [.464, 0, 0]);
  b.box(m.steel, s + 3.55, x, 2.02, 1.45, .07, 8.1, [.464, 0, 0]);
  for (const z of [3.55, 7.1]) {
    const top = escalatorHeight(z) - .26, height = top - .94;
    b.box(m.concrete, s + z, x, .94 + height / 2, 1.75, height, .6);
  }
  for (const dx of [-.79, .79]) {
    b.box(m.steel, s + 3.55, x + dx, 3.06, .13, .75, 8, [.464, 0, 0]);
    b.box(m.rubber, s + 3.55, x + dx, 3.49, .12, .08, 8.1, [.464, 0, 0]);
    b.box(m.coolLamp, s + 3.55, x + dx * .9, 2.98, .025, .035, 8, [.464, 0, 0]);
  }
  panel(b, m.sign('↑  Ausgang', 'exit'), s - .9, x, 4.18, 2, .48);
  b.box(m.concrete, s + 7.85, x, 2.7, 1.9, 3.7, 1.2);
}

// Construct the enclosure in the same three-metre slices as the opening in
// the platform ceiling. This follows curved stations with shared joints,
// and keeps its walls alive when the stair mesh's earlier chunk is streamed out.
function accessEnclosure(b, m, s, side, rel, escalator = false) {
  const floor = escalator ? 4.62 : 4.75;
  const centre = side * 5.815;
  // The front caps form disjoint rectangles: side walls stop under the roof,
  // and the header fits between their inner faces. An overlapping fascia here
  // used to flicker at the exposed corner directly above the first step.
  b.sweptBox(m.accessWall, s, s + 3, side * 4.38, 5.985, .24, 3.43);
  // The platform wall ends at 5.15 m. Continue exactly above it, never cover
  // the same face with a second material in the 4.27–5.15 m band.
  b.sweptBox(m.accessWall, s, s + 3, side * 7.23, 6.425, .2, 2.55);
  b.sweptBox(m.accessCeiling, s, s + 3, centre, 7.82, 3.2, .24);
  if (rel === 0) b.sweptBox(m.accessWall, s, s + .2, centre, 6.51, 2.63, 2.38);
  if (rel >= 6) {
    const start = Math.max(0, 7.05 - rel);
    b.sweptBox(m.concrete, s + start, s + 3, centre, floor - .18, 2.88, .29);
    b.sweptBox(m.floor, s + start, s + 3, centre, floor - .035, 2.88, .07);
  }
  if (rel === 12) {
    const end = s + 3;
    b.box(m.accessWall, end, centre, (floor + 7.82) / 2, 3.2, 7.82 - floor, .26);
    // A closed double door gives the landing a plausible continuation without
    // exposing unbuilt space beyond the station. It faces back down the steps.
    b.box(m.steel, end - .15, centre, floor + 1.17, 1.92, 2.34, .08);
    for (const dx of [-.44, .44]) {
      b.box(m.accessDoor, end - .2, centre + dx, floor + 1.14, .83, 2.2, .035);
      b.box(m.accessGlazing, end - .224, centre + dx, floor + 1.62, .59, .72, .014);
      b.box(m.steel, end - .24, centre + Math.sign(dx) * .12, floor + 1.02, .032, .36, .055);
    }
    panel(b, m.sign('↑  Ausgang', 'exit'), end - .21, centre, floor + 2.66, 1.86, .36);
  }
  if (rel % 6 === 0) {
    b.box(m.dark, s + 1.5, side * 5.75, 7.65, 1.08, .1, 1.3);
    b.box(m.coolLamp, s + 1.5, side * 5.75, 7.58, .88, .035, 1.1);
  }
}
function emergencyExit(b, m, s) {
  const shift = -(junctionAt(s)?.leftWidth || 0);
  b.box(m.concrete, s, shift - 2.66, .23, 1.15, .35, 2.25);
  b.box(m.dark, s, shift - 2.86, 1.56, .3, 2.5, 1.65);
  b.box(m.palette('#5d7770'), s, shift - 2.675, 1.54, .065, 2.14, 1.21);
  for (const dz of [-.68, .68]) b.box(m.steel, s + dz, shift - 2.6, 1.55, .11, 2.36, .09);
  b.box(m.steel, s, shift - 2.6, 2.7, .11, .09, 1.45);
  b.box(m.steel, s, shift - 2.61, .41, .12, .065, 1.45);
  b.box(m.steel, s, shift - 2.53, 1.38, .08, .055, .72);
  panel(b, m.sign('NOTAUSGANG →', 'exit'), s, shift - 2.56, 2.97, 1.56, .32, Math.PI / 2);
  b.box(m.coolLamp, s, shift - 2.43, 3.12, .12, .04, .55);
  b.box(m.palette('#8b4237'), s + 1.06, shift - 2.69, 1.36, .3, .64, .35);
}
function branchTrack(b, m, s, junction) {
  const x = junction.branchX; if (Math.abs(x) < .04) return;
  const before = (branchAt(s - 1.5) || junctionAt(s - 1.5))?.branchX || 0, after = (branchAt(s + 1.5) || junctionAt(s + 1.5))?.branchX || 0;
  const angle = -Math.atan2(after - before, 3), length = 3.04 / Math.cos(angle);
  for (const offset of [-.7175, .7175]) {
    b.box(m.railSide, s, x + offset, .085, .068, .15, length, [0, angle, 0]);
    b.box(m.railTop, s, x + offset, .171, .068, .032, length, [0, angle, 0]);
  }
  for (let z = s - 1.5; z < s + 1.5; z += .6) {
    const offset = (branchAt(z) || junctionAt(z))?.branchX || 0;
    if (Math.abs(offset) > 2.2) b.box(m.sleeper, z, offset, -.024, 2.02, .13, .22, [0, angle, 0]);
    if (Math.abs(offset) > .16) for (const rail of [-.7175, .7175]) b.box(m.dark, z, offset + rail, .052, .21, .025, .18, [0, angle, 0]);
  }
  if (Math.abs(s - junction.start - 25.5) < 1) {
    b.box(m.steel, s, junction.side * 1.65, .23, .44, .35, .85);
    b.box(m.dark, s, junction.side * .92, .045, 1.15, .07, .09);
    for (const dx of [1.46, 1.84]) b.box(m.yellow, s, junction.side * dx, .418, .03, .012, .76);
  }
}
function lift(b, m, s, side) {
  const x = side * 5.8;
  b.box(m.glass, s, x, 2.55, 2.5, 3.3, 2.8);
  for (const dz of [-1.43, 1.43]) for (const dx of [-1.28, 1.28]) b.box(m.steel, s + dz, x + dx, 2.55, .1, 3.4, .1);
  b.box(m.steel, s, x, 4.22, 2.65, .12, 2.9);
  for (const dz of [-.48, .48]) b.box(m.bench, s + dz, x - side * 1.29, 2.06, .035, 2.28, .94);
  b.box(m.dark, s, x - side * 1.315, 2.06, .02, 2.28, .025);
  b.box(m.steel, s + 1.12, x - side * 1.35, 2, .05, .34, .16);
  b.box(m.green, s + 1.12, x - side * 1.39, 2.02, .015, .035, .04);
  panel(b, m.sign('↕  Aufzug', 'exit'), s, x - side * 1.36, 3.7, 2, .36, -side * Math.PI / 2);
}
function passage(b, m, s, side, color) {
  const accent = m.palette(color);
  // A real, lit L-shaped connecting passage behind the platform wall.
  b.box(m.concrete, s, side * 10.7, .4, 7.4, 1.02, 5.7);
  b.box(m.floor, s, side * 10.7, .905, 7.4, .08, 5.7);
  b.box(m.ceiling, s, side * 10.7, 3.8, 7.4, .18, 5.7);
  for (const dz of [-2.7, 2.7]) {
    const opening = dz > 0;
    b.box(m.tiles, s + dz, side * (opening ? 9.25 : 10.7), 2.32, opening ? 4.5 : 7.4, 2.78, .2);
    b.box(accent, s + dz - Math.sign(dz) * .115, side * (opening ? 9.25 : 10.7), 2.25, opening ? 4.5 : 7.4, .4, .025);
    b.box(m.steel, s + dz - Math.sign(dz) * .16, side * 9.3, 1.78, 4.5, .045, .045);
  }
  b.box(m.tiles, s + 3.2, side * 14.3, 2.32, .2, 2.78, 12);
  b.box(accent, s + 3.2, side * 14.18, 2.25, .025, .4, 12);
  b.box(m.floor, s + 5.4, side * 12.8, .905, 3, .08, 5.6);
  b.box(m.ceiling, s + 5.4, side * 12.8, 3.8, 3, .18, 5.6);
  b.box(m.tiles, s + 5.5, side * 11.4, 2.32, .2, 2.78, 5.4);
  for (const dz of [-2.8, 2.8]) b.box(m.concrete, s + dz, side * 7.22, 2.42, .5, 3, .36);
  b.box(m.concrete, s, side * 7.22, 3.86, .55, .33, 5.9);
  for (const x of [8.7, 11.6]) {
    b.box(m.dark, s, side * x, 3.67, .9, .1, .2);
    b.box(m.coolLamp, s, side * x, 3.6, .85, .03, .12);
  }
  panel(b, m.sign('Gegenrichtung  →', 'exit'), s, side * 7.02, 3.53, 4.7, .36, -side * Math.PI / 2);
  panel(b, m.sign('←  Gleis 2', 'exit'), s, side * 14.17, 2.8, 2.65, .46, -side * Math.PI / 2);
}

export class World {
  constructor(scene, materials) {
    this.scene = scene; this.m = materials; this.chunks = new Map();
    this.lightPool = Array.from({ length: 16 }, () => { const light = new T.PointLight('#e4ece0', 0, 27, 1.65); scene.add(light); return light; });
    this.crowd = new Crowd(); this.pending = null; this.lastBase = null;
    this.shadowMaterial = new T.MeshBasicMaterial({ map: materials.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.vehicles = new Vehicles(scene, materials); this.mirror = new PlatformMirror(scene, materials);
    this.exchange = new PassengerExchange(scene, this.crowd, this.shadowMaterial);
  }
  *build(base) {
    const group = new T.Group(); const b = new Batch(base), sideBore = new Batch(base), m = this.m, rng = random(base + 907);
    const distantLights = new DistantLights(base, m.distantLamp);
    const chunk = { group, base, people: [], signals: [], lamps: [], escalators: [], seats: [] };
    const addLamp = (s, x, y, stationLight) => chunk.lamps.push({ s, x, y, stationLight, key: `${s}:${x}` });
    for (let s = base; s < base + 24; s += 3) {
      const st = stationAt(s + 1.5);
      const junction = st ? null : junctionAt(s + 1.5), extra = junction?.extraWidth || 0;
      const left = junction?.leftWidth || 0, right = junction?.rightWidth || 0;
      b.box(m.ballast, s + 1.5, (right - left) / 2, -.28, 6.1 + extra, .36, 3.02);
      b.box(m.concrete, s + 1.5, 0, -.075, 2.24, .06, 3.02);
      // Rails: web, foot and polished running head, with actual gauge and sleepers.
      for (const x of [-.7175, .7175]) {
        b.box(m.railSide, s + 1.5, x, .085, .068, .15, 3.04);
        b.box(m.railSide, s + 1.5, x, .028, .15, .026, 3.04);
        b.box(m.railTop, s + 1.5, x, .169, .068, .032, 3.04);
      }
      for (let z = s; z < s + 3; z += .6) {
        const offset = junctionAt(z)?.branchX || 0, shared = Math.abs(offset) < 2.2 ? offset : 0;
        b.box(m.sleeper, z, shared / 2, -.024, 2.02 + Math.abs(shared), .13, .22);
        for (const x of [-.7175, .7175]) {
          b.box(m.dark, z, x, .052, .23, .025, .18);
          for (const off of [-.095, .095]) b.box(m.railFastener, z, x + off, .081, .028, .035, .085);
        }
      }
      b.box(m.dark, s + 1.5, -1.3, .19, .1, .18, 3.02);
      b.box(m.railCover, s + 1.5, -1.3, .3, .22, .035, 3.02);
      b.box(m.dark, s + 1.5, 1.28, -.06, .12, .05, 3.02);
      const continuation = branchAt(s + 1.5);
      if (junction || continuation) branchTrack(continuation ? sideBore : b, m, s + 1.5, continuation || junction);
      if (continuation) {
          tunnelRing(sideBore, m, s + 1.5, 3.035, false, true);
          tunnelRing(sideBore, m, s, .033, true, true);
          sideBore.box(m.ballast, s + 1.5, continuation.branchX, -.28, 6.12, .36, 3.15);
          sideBore.box(m.concrete, s + 1.5, continuation.branchX, -.075, 2.24, .06, 3.2);
          for (const side of [-1, 1]) {
            sideBore.box(m.concrete, s + 1.5, continuation.branchX + side * 2.6, .12, .7, .32, 3.2);
            for (const y of [.81, 1.32]) sideBore.box(m.rubber, s + 1.5, continuation.branchX + side * 2.95, y, .055, .055, 3.3);
          }
          if (s % 6 === 0) {
            // Ceiling fixtures reveal the receding bore from an oblique view
            // through the portal, even when the side wall hides a wall lamp.
            sideBore.box(m.dark, s + 1.5, continuation.branchX, 4.51, .28, .12, .9);
            sideBore.box(m.tunnelLamp, s + 1.5, continuation.branchX, 4.43, .2, .035, .72);
            distantLights.add(s + 1.5, continuation.branchX, 4.43);
            addLamp(s + 1.5, continuation.branchX, 4.2, false);
          }
          if (s === continuation.split) forkPortal(b, m, s, junctionAt(s));
      }
      if (!st) {
        tunnelRing(b, m, s + 1.5, 3.035);
        tunnelRing(b, m, s, .033, true);
        for (const side of [-1, 1]) {
          const shift = side > 0 ? right : -left;
          b.box(m.concrete, s + 1.5, side * 2.57 + shift, .12, .8, .32, 3.04);
          b.box(m.dark, s + 1.5, side * 2.58 + shift, .305, .51, .026, 3.04);
          for (const y of [.7, .81, 1.2, 1.32, 2.12]) b.box(m.rubber, s + 1.5, side * 2.96 + shift, y, .055, .055, 3.08);
          b.box(m.dark, s, side * 2.91 + shift, 1.4, .07, 1.63, .045);
        }
        if (s % 12 === 0) {
          const side = (s / 12) % 2 === 0 ? -1 : 1;
          const shift = side > 0 ? right : -left;
          b.box(m.dark, s + 1.5, side * 2.57 + shift, 3.08, .34, .18, .85, [0, 0, side * .55]);
          b.box(m.tunnelLamp, s + 1.5, side * 2.53 + shift, 3.02, .23, .06, .64, [0, 0, side * .55]);
          distantLights.add(s + 1.5, side * 2.53 + shift, 3.02);
          addLamp(s + 1.5, side * 2.35 + shift, 2.9, false);
        }
        if (s % 48 === 0) {
          panel(b, m.sign('←  Notausgang', 'exit'), s + 2, -2.87 - left, 2.13, .92, .24, Math.PI / 2);
          b.box(m.steel, s + .7, 2.8 + right, 1.76, .21, .85, .52);
          b.box(m.dark, s + .7, 2.685 + right, 1.76, .025, .5, .33);
        }
        if (s % 144 === 0) emergencyExit(b, m, s + 4.5);
        if (s % 96 === 0) panel(b, m.sign(String(((Math.floor(s / 12) % 32) + 32) % 32).padStart(3, '0')), s + .5, -2.84 - left, 1.74, .38, .2, Math.PI / 2);
      } else {
        const side = st.side, accent = m.palette(st.color), wall = m.stationWall(st);
        const rel = s - st.start;
        const stairwell = rel >= 36 && rel <= 48 || st.feature === 'escalator' && rel >= 78 && rel <= 90;
        if (stairwell) accessEnclosure(b, m, s, side, rel - (rel >= 78 ? 78 : 36), rel >= 78);
        b.box(m.concrete, s + 1.5, side * 4.42, .34, 5.56, 1.05, 3.01);
        b.box(m.floor, s + 1.5, side * 4.42, .905, 5.56, .08, 3.01);
        b.box(m.white, s + 1.5, side * 1.72, .94, .14, .06, 3.01);
        b.box(m.yellow, s + 1.5, side * 2.01, .956, .4, .015, 3.01);
        for (let z = s; z < s + 3; z += .18) for (const dx of [1.86, 1.99, 2.12]) b.box(m.yellow, z, side * dx, .969, .037, .01, .045);
        b.box(m.dark, s + 1.5, side * 1.66, .55, .025, .16, 3.01);
        const passageOpening = st.passage && rel >= 54 && rel < 60;
        if (passageOpening) b.sweptBox(wall, s, s + 3, side * 7.23, 4.5, .2, 1.3);
        else {
          b.sweptBox(wall, s, s + 3, side * 7.23, 3.03, .2, 4.24);
          if (st.wallStyle === 'band') b.box(accent, s + 1.5, side * 7.105, 2.6, .03, .64, 3.02);
          b.box(m.dark, s + 1.5, side * 7.11, 1.08, .035, .24, 3.02);
        }
        // The wall opposite the platform remains close to the track.
        b.box(wall, s + 1.5, -side * 2.93, 2.3, .25, 5, 3.02);
        if (st.wallStyle === 'band') b.box(accent, s + 1.5, -side * 2.79, 2.18, .028, .58, 3.02);
        b.box(m.concrete, s + 1.5, -side * 2.48, .22, .66, .5, 3.02);
        b.box(m.dark, s + 1.5, -side * 2.79, .74, .06, .1, 3.02);
        b.sweptBox(m.ceiling, s, s + 3, side * (stairwell ? .65 : 2.1), 5.18, stairwell ? 7.5 : 10.4, .28);
        for (const x of [side * 2.6, side * 5.65]) {
          if (stairwell && Math.abs(x) > 4.4) continue;
          b.box(m.dark, s + 1.5, x, 4.79, .18, .18, 3.02);
          b.box(m.coolLamp, s + 1.5, x, 4.68, .105, .036, 2.86);
        }
        if (s % 6 === 0) {
          b.box(m.steel, s, side * (stairwell ? .65 : 2.1), 4.96, stairwell ? 7.4 : 10.2, .24, .13);
          addLamp(s + 1.5, side * 3.4, 4.3, true);
        }
        if (s % 12 === 0) {
          b.box(accent, s, side * 4.02, 2.84, .43, 3.8, .48);
          b.box(m.steel, s, side * 4.02, 1.09, .48, .3, .53);
          b.box(m.white, s, side * 4.02, 3.63, .445, .08, .49);
          panel(b, m.sign(st.name), s + .248, side * 4.02, 2.74, .39, .19);
          // Backlit abstract advertising across the tracks.
          const x = -side * 2.77, facing = side * Math.PI / 2;
          b.box(m.steel, s + 5, x, 2.88, .11, 1.87, 1.25);
          panel(b, m.posters[(Math.floor(s / 12) + st.index) % 6], s + 5, x + side * .06, 2.88, 1.1, 1.7, facing);
        }
        if (rel === 12 || rel === 72) {
          const boardS = s - 1.2;
          b.box(m.dark, boardS, side * 3.2, 3.86, 2.55, .68, .12);
          panel(b, m.sign('', 'led'), boardS - .075, side * 3.2, 3.86, 2.45, .57);
          panel(b, m.sign('', 'led'), boardS + .075, side * 3.2, 3.86, 2.45, .57, Math.PI);
          for (const x of [2.3, 4.1]) b.box(m.steel, boardS, side * x, 4.52, .04, .63, .04);
          panel(b, m.sign('↑  Ausgang', 'exit'), s + 8, side * 5.6, 4.05, 1.75, .43);
        }
        if (rel === 18 || rel === 63 || rel === 102) {
          bench(b, m, s, side);
          for (const dz of [-1, 0, 1]) chunk.seats.push({ s: s + dz, x: side * SEAT_X, y: SEAT_TOP });
          const seatedRng = random(s + 5189);
          for (const dz of [-1, 1]) this.person(chunk, s + dz, side * SEAT_X, seatedRng, { seated: true, phone: dz === 1 });
        }
        if (rel === 36) stairs(b, m, s, side);
        if (rel === 54 && st.passage) { passage(b, m, s + 3, side, st.color); addLamp(s + 3, side * 9.1, 3.35, true); }
        if (rel === 78) {
          if (st.feature === 'escalator') {
            escalator(b, m, s, side);
            const conveyor = new Escalator(s, side, base, m.escalatorSteps);
            chunk.escalators.push(conveyor); group.add(conveyor.mesh);
          } else lift(b, m, s, side);
        }
        if (rel === 6 || rel === 66 || rel === 108) panel(b, m.sign(st.name), s, side * 7.1, 3.14, 3.4, .6, -side * Math.PI / 2);
        if (rel % 6 === 0 && rel > 3 && rel < 117) {
          const count = rel % 18 === 0 ? 2 : 1;
          for (let j = 0; j < count; j++) this.person(chunk, s + 1 + rng() * 2, side * (2.65 + rng() * (rel >= 30 && rel <= 51 || rel >= 72 && rel <= 93 ? .95 : 2.2)), rng);
        }
      }
      yield;
    }
    // Close the station ends around the running tunnel, with a concrete portal.
    for (let i = Math.max(0, Math.floor((base - FIRST_STATION) / BLOCK) - 1); i <= Math.floor((base + 24 - FIRST_STATION) / BLOCK) + 1; i++) {
      const st = station(i);
      for (const end of [st.start, st.end]) if (end >= base && end < base + 24) {
        b.box(st.wallStyle === 'solid' || st.wallStyle === 'white' ? m.stationWall(st) : m.tiles, end, st.side * 5.19, 2.6, 4.33, 5.2, .4);
        b.box(m.concrete, end, 0, 5.02, 6.12, .42, .4);
        tunnelRing(b, m, end, .55);
        // Spandrels fill the wall above the curved opening, avoiding black gaps.
        for (let j = 1; j < arch.length - 2; j++) {
          const a = arch[j], c = arch[j + 1];
          const shape = new T.Shape(); shape.moveTo(a[0], a[1]); shape.lineTo(c[0], c[1]); shape.lineTo(c[0], 5.12); shape.lineTo(a[0], 5.12); shape.closePath();
          const geometry = new T.ShapeGeometry(shape).toNonIndexed();
          b.add(geometry, m.concrete, end - .21, 0, 0, [1, 1, 1]);
          b.add(geometry, m.concrete, end + .21, 0, 0, [1, 1, 1], [0, Math.PI, 0]); geometry.dispose();
        }
      }
    }
    // Signals are placed independently of geometry sections, including stop signals.
    for (const spec of signalSpecs(base, base + 24)) if (spec.s < base + 24) this.signal(chunk, b, spec);
    yield* b.finish(group);
    // Separate bounds allow hidden parallel bores to be culled. Draw them after
    // the main opaque scene so its walls reject their covered fragments early.
    yield* sideBore.finish(group, 1);
    distantLights.finish(group);
    this.scene.add(group); this.chunks.set(base, chunk); return chunk;
  }
  signal(chunk, b, spec) {
    const { s } = spec, m = this.m, j = junctionAt(s);
    const x = spec.kind === 'exit' ? -station(spec.stationIndex).side * 2.23 : j && Math.abs(j.branchX) > 1 ? -j.side * 2.23 : 2.23;
    b.box(m.steel, s, x, 1.16, .07, 2.1, .07);
    b.box(m.dark, s, x, 2.17, .39, .76, .27);
    b.box(m.dark, s - .13, x, 2.6, .47, .05, .38);
    // Camera travels toward -z, so front faces point toward +z.
    panel(b, m.sign('S ' + String(Math.floor(s) % 24).padStart(2, '0')), s - .15, x, 1.68, .38, .17);
    const lights = [];
    for (let i = 0; i < 2; i++) {
      const mesh = new T.Mesh(sphere, i === 0 ? m.red : m.green); mesh.scale.set(.103, .103, .035);
      const p = point(s - .152, x, 2.35 - i * .33), o = point(chunk.base);
      mesh.position.set(p[0] - o[0], p[1], p[2] - o[2]); chunk.group.add(mesh); lights.push(mesh);
    }
    const glow = new T.Sprite(new T.SpriteMaterial({ map: m.glow, color: '#ff3820', transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .58 }));
    glow.scale.set(1.4, 1.4, 1); glow.position.copy(lights[0].position); chunk.group.add(glow);
    chunk.signals.push({ ...spec, lights, glow });
  }
  person(chunk, s, x, rng, options = {}) {
    const st = stationAt(s);
    // Reserve the exchange lanes beside the selected doors. Ordinary walkers
    // also see the boarding/alighting passengers as pedestrian obstacles.
    const reserved = at => st && EXCHANGE_DOORS.some(i => {
      const relative = at - (st.stop - DOOR_OFFSETS[i]); return relative > -1.2 && relative < 2.7;
    });
    const neighbours = [...this.chunks.values(), chunk].flatMap(c => c.people);
    for (let attempt = 0; !options.seated && attempt < 12 && (reserved(s) || neighbours.some(p => Math.hypot(p.s - s, p.x - x) < .86)); attempt++) s += .86;
    const p = this.crowd.create(rng, options);
    p.person.scale.setScalar(p.height);
    p.rootY = .945;
    const location = point(s, x, p.rootY), origin = point(chunk.base);
    p.person.position.set(location[0] - origin[0], p.rootY, location[2] - origin[2]);
    p.baseY = (x < 0 ? Math.PI / 2 : -Math.PI / 2) - trackAngle(s) + (p.seated ? 0 : (rng() - .5) * .9);
    p.person.rotation.y = p.baseY;
    chunk.group.add(p.person);
    const shadow = new T.Mesh(plane, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.05, .8, 1); shadow.position.copy(p.person.position); shadow.position.y = .948;
    chunk.group.add(shadow);
    Object.assign(p, { s, x, shadow, phase: rng() * Math.PI * 2, pace: .65 + rng() * .5, walker: !p.seated && rng() > .8 });
    const attentionRng = random(Math.floor(s * 997) ^ Math.floor(x * 101));
    p.noticeDistance = attentionRng() < (p.phone ? .7 : .35) ? 14 + attentionRng() * 17 : 43 + attentionRng() * 32;
    const boardingRng = random(Math.floor(s * 1337) ^ Math.floor(x * 391));
    if (!p.seated && boardingRng() < .58) {
      const reserved = [...this.chunks.values(), chunk].flatMap(c => c.people)
        .filter(other => other.journey).map(other => other.journey.path.at(-1));
      p.journey = boardingPlan(s, x, stationAt(s), boardingRng, reserved);
      p.walker = false;
    }
    if (p.seated) seatedPose(p, s - 100, 0);
    chunk.people.push(p);
  }
  update(train) {
    const start = performance.now();
    const base = Math.floor(train.s / 24) * 24;
    this.mirror.update(train);
    const st = this.mirror.station, nearPlatform = train.s > st.start - 24 && train.s < st.end + 14;
    const rear = nearPlatform ? 96 : 24;
    const ownStation = stationAt(train.s), ownSide = ownStation?.side || 0;
    this.vehicles.update(train, doorOpening(train.phase, train.timer), ownSide);
    const exchanges = [];
    if (st.start - train.s < 150 && train.s < st.end + 14) {
      const lead = train.traffic.pose(st.index, train.time);
      if (lead && !train.traffic.services.get(st.index).waiting)
        exchanges.push({ key: `lead-${st.index}`, station: st, age: lead.exchange, previousService: true });
      if (!lead || lead.clear || train.traffic.services.get(st.index).waiting) exchanges.push({ key: `own-${st.index}`, station: st,
        age: ownExchangeAge(train, st) });
    }
    this.exchange.update(train, exchanges);
    if (this.lastBase === null || Math.abs(base - this.lastBase) > 48) {
      this.pending?.iterator.return(); this.pending = null;
      for (let b = base - rear; b <= base + 216; b += 24) if (!this.chunks.has(b)) for (const _ of this.build(b)) { /* initial load / diagnostic teleport */ }
    } else {
      if (!this.pending) {
        for (let b = base - rear; b <= base + 216; b += 24) if (!this.chunks.has(b)) { this.pending = { base: b, iterator: this.build(b) }; break; }
      }
      const deadline = performance.now() + 2.5;
      while (this.pending && performance.now() < deadline) if (this.pending.iterator.next().done) this.pending = null;
    }
    this.lastBase = base;
    this.buildMs = performance.now() - start;
    const people = [...this.chunks.values()].filter(c => c.base >= base - rear && c.base <= base + 216).flatMap(c => c.people);
    updatePedestrians([...people, ...this.exchange.obstacles], train);
    for (const [key, chunk] of this.chunks) {
      if (key < base - rear || key > base + 216) {
        this.scene.remove(chunk.group);
        chunk.group.traverse(o => { if (o.isMesh && ![box, plane, sphere].includes(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); if (o.isSprite) o.material.dispose(); });
        this.chunks.delete(key); continue;
      }
      chunk.group.position.set(trackX(key) - trackX(train.s), 0, train.s - key);
      for (const conveyor of chunk.escalators) conveyor.update(train.time);
      for (const signal of chunk.signals) {
        const green = train.signals.isGreen(signal, train.time);
        signal.lights[0].material = green ? this.m.dark : this.m.red; signal.lights[1].material = green ? this.m.green : this.m.dark;
        signal.glow.position.copy(signal.lights[green ? 1 : 0].position); signal.glow.material.color.set(green ? '#72ffa0' : '#ff361b');
      }
      for (const p of chunk.people) {
        const t = train.time * p.pace + p.phase;
        const motion = p.motion;
        p.boardingMoving = !!p.journey && motion.moving;
        p.boardingDistance = p.journey ? motion.distance : 0;
        const walkS = motion.s, walkX = motion.x;
        p.person.visible = walkS - train.s < 140 && walkS - train.s > (nearPlatform ? -96 : -18);
        p.shadow.visible = p.person.visible;
        if (!p.person.visible) continue;
        if (p.seated) { seatedPose(p, train.s, train.time); continue; }
        const walking = motion.amount;
        const stridePhase = motion.stridePhase ?? motion.distance * 5.2;
        const edgeYaw = (walkX < 0 ? Math.PI / 2 : -Math.PI / 2) - trackAngle(walkS);
        const baseY = p.baseY + Math.atan2(Math.sin(edgeYaw - p.baseY), Math.cos(edgeYaw - p.baseY)) * motion.settle;
        const reaction = passengerAttention({ ...p, s: walkS, x: walkX, baseY }, train.s, train.time);
        const idleYaw = reaction.bodyYaw + Math.sin(t * .31) * .04 * (1 - reaction.attention);
        let bodyYaw = idleYaw;
        if (p.journey || p.halt) {
          const blend = motion.turn * (1 - motion.settle);
          bodyYaw += Math.atan2(Math.sin(motion.yaw - bodyYaw), Math.cos(motion.yaw - bodyYaw)) * blend;
        } else if (p.walker) bodyYaw = motion.yaw;
        p.person.rotation.y = bodyYaw;
        const wp = point(walkS, walkX, p.rootY), op = point(chunk.base);
        p.person.position.set(wp[0] - op[0], p.rootY, wp[2] - op[2]);
        p.shadow.position.x = p.person.position.x; p.shadow.position.z = p.person.position.z;
        p.body.rotation.z = Math.sin(t * 1.3) * .018;
        const headTurn = reaction.headYaw + reaction.bodyYaw - bodyYaw;
        p.head.rotation.y = T.MathUtils.clamp(Math.atan2(Math.sin(headTurn), Math.cos(headTurn)), -.95, .95);
        p.head.rotation.x = reaction.pitch;
        p.body.position.y = p.hipHeight + Math.abs(Math.sin(stridePhase)) * .014 * walking + Math.sin(t * 1.7) * .003 * (1 - walking);
        for (let i = 0; i < 2; i++) {
          const stride = Math.sin(stridePhase + i * Math.PI);
          p.legs[i].pivot.rotation.x = stride * .38 * walking + Math.sin(t * .6 + i) * .025 * (1 - walking);
          p.legs[i].shin.rotation.x = Math.max(0, -stride) * .43 * walking + .015 * (1 - walking);
          if (!(i === 1 && p.phone)) { p.arms[i].pivot.rotation.x = -stride * .24 * walking + Math.sin(t + i) * .05 * (1 - walking); p.arms[i].forearm.rotation.x = -.1 + Math.sin(t * .7) * .065; }
        }
        if (p.phone) {
          p.arms[1].pivot.rotation.x = -.35 * (1 - reaction.attention);
          p.arms[1].forearm.rotation.x = -1.26 + reaction.attention * .92;
        }
      }
    }
    const lamps = [...this.chunks.values()].flatMap(c => c.lamps).filter(l => l.s - train.s > -12 && l.s - train.s < 72 && Math.abs(l.x) < 14);
    const byKey = new Map(lamps.map(l => [l.key, l]));
    for (const light of this.lightPool) if (!byKey.has(light.userData.key)) { light.userData.key = null; light.intensity = 0; }
    const assigned = new Set(this.lightPool.map(l => l.userData.key));
    for (const lamp of lamps) if (!assigned.has(lamp.key)) { const slot = this.lightPool.find(l => l.userData.key === null); if (slot) slot.userData.key = lamp.key; }
    this.lightPool.forEach(light => {
      const lamp = byKey.get(light.userData.key); if (!lamp) return;
      const p = point(lamp.s, lamp.x, lamp.y); light.position.set(p[0] - trackX(train.s), p[1], p[2] + train.s);
      const d = lamp.s - train.s, fade = T.MathUtils.smoothstep(d, -12, -3) * (1 - T.MathUtils.smoothstep(d, 48, 72)) * (1 - T.MathUtils.smoothstep(Math.abs(lamp.x), 8, 14));
      light.color.set(lamp.stationLight ? '#dce5d9' : '#e2d1b6'); light.intensity = (lamp.stationLight ? 12 : 3) * fade; light.distance = lamp.stationLight ? 27 : 18;
    });
    this.updateMs = performance.now() - start;
  }
  stats() {
    const people = [...this.chunks.values()].flatMap(c => c.people);
    return { chunks: this.chunks.size, passengers: people.length,
      ...this.vehicles.stats(), ...this.exchange.stats(), mirrorActive: this.mirror.active,
      seatedPassengers: people.filter(p => p.seated).length,
      seatedPhones: people.filter(p => p.seated && p.phone).length,
      escalators: [...this.chunks.values()].reduce((n, c) => n + c.escalators.length, 0),
      boardingWalking: people.filter(p => p.boardingMoving).length,
      boardingBlocked: people.filter(p => p.journey && p.halt).length,
      boardingMetres: Math.round(people.reduce((n, p) => n + (p.boardingDistance || 0), 0) * 10) / 10,
      signals: [...this.chunks.values()].reduce((n, c) => n + c.signals.length, 0) };
  }
}
