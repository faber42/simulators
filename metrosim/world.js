import * as T from '../pinsim/three.module.min.js';
import { point, trackX, trackAngle, stationAt, station, BLOCK, FIRST_STATION } from './route.mjs';
import { random } from './materials.js';

const box = new T.BoxGeometry(1, 1, 1).toNonIndexed();
const plane = new T.PlaneGeometry(1, 1).toNonIndexed();
const cylinder = new T.CylinderGeometry(1, 1, 1, 10).toNonIndexed();
const sphere = new T.SphereGeometry(1, 12, 8).toNonIndexed();
const matrix = new T.Matrix4(), normalMatrix = new T.Matrix3(), quat = new T.Quaternion(), euler = new T.Euler();
const vector = new T.Vector3(), normal = new T.Vector3();

// Static geometry is merged per material and 24 m section: hundreds of rail
// fastenings, tile strips and tunnel segments cost only a handful of draws.
class Batch {
  constructor(base) { this.base = base; this.origin = point(base); this.data = new Map(); }
  add(geometry, material, s, x, y, scale, rotation = [0, 0, 0]) {
    let data = this.data.get(material);
    if (!data) { data = { p: [], n: [], uv: [] }; this.data.set(material, data); }
    const p = point(s, x, y);
    euler.set(rotation[0], -trackAngle(s) + rotation[1], rotation[2], 'YXZ'); quat.setFromEuler(euler);
    const a = trackAngle(s), bend = (trackAngle(s + .1) - trackAngle(s - .1)) / .2;
    const lengthScale = 1 / Math.cos(a) - x * bend;
    matrix.compose(new T.Vector3(p[0] - this.origin[0], y, p[2] - this.origin[2]), quat, new T.Vector3(scale[0], scale[1], scale[2] * lengthScale));
    normalMatrix.getNormalMatrix(matrix);
    const pos = geometry.attributes.position, ns = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      vector.fromBufferAttribute(pos, i).applyMatrix4(matrix); normal.fromBufferAttribute(ns, i).applyMatrix3(normalMatrix).normalize();
      data.p.push(vector.x, vector.y, vector.z); data.n.push(normal.x, normal.y, normal.z); data.uv.push(uv.getX(i), uv.getY(i));
    }
  }
  box(material, s, x, y, w, h, d, rotation) { this.add(box, material, s, x, y, [w, h, d], rotation); }
  finish(group) {
    for (const [material, d] of this.data) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(d.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(d.uv, 2)); g.computeBoundingSphere();
      group.add(new T.Mesh(g, material));
    }
    this.data.clear();
  }
}
const arch = [[-3.05, -.32], [-3.05, 1.65]];
for (let i = 1; i <= 24; i++) { const a = Math.PI - Math.PI * i / 24; arch.push([Math.cos(a) * 3.05, 1.65 + Math.sin(a) * 3.05]); }
arch.push([3.05, -.32]);

function tunnelRing(b, m, s, width, rib = false) {
  for (let j = 0; j < arch.length - 1; j++) {
    const a = arch[j], c = arch[j + 1], dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    const midX = (a[0] + c[0]) / 2, midY = (a[1] + c[1]) / 2;
    b.box(rib ? m.dark : m.concrete, s, midX + (rib ? dy / len * .086 : 0), midY - (rib ? dx / len * .086 : 0), len + .025, rib ? .018 : .16, width, [0, 0, Math.atan2(dy, dx)]);
  }
}
function panel(b, material, s, x, y, w, h, facing = 0) { b.add(plane, material, s, x, y, [w, h, 1], [0, facing, 0]); }
function bench(b, m, s, side) {
  b.box(m.bench, s, side * 5.6, 1.43, .52, .1, 2.9);
  b.box(m.bench, s, side * 5.86, 1.82, .08, .73, 2.9);
  for (const dz of [-1.12, 1.12]) { b.box(m.steel, s + dz, side * 5.6, 1.12, .1, .5, .12); b.box(m.steel, s + dz, side * 5.57, 1.66, .56, .07, .07); }
  for (let j = -1; j <= 1; j++) b.box(m.dark, s + j, side * 5.6, 1.49, .53, .006, .025);
}
function escalator(b, m, s, side) {
  const x = side * 5.55;
  for (let i = 0; i < 32; i++) {
    b.box(m.steel, s + i * .23, x, .95 + i * .115, 1.35, .14, .24);
    b.box(m.dark, s + i * .23 - .09, x, 1.025 + i * .115, 1.34, .006, .027);
  }
  for (const dx of [-.79, .79]) {
    b.box(m.steel, s + 3.55, x + dx, 3.06, .09, .75, 8, [-.464, 0, 0]);
    b.box(m.rubber, s + 3.55, x + dx, 3.49, .12, .08, 8.1, [-.464, 0, 0]);
    b.box(m.coolLamp, s + 3.55, x + dx * .9, 2.98, .025, .035, 8, [-.464, 0, 0]);
  }
  panel(b, m.sign('↑  Ausgang', 'exit'), s - .9, x, 4.18, 2, .48);
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

export class World {
  constructor(scene, materials) {
    this.scene = scene; this.m = materials; this.chunks = new Map(); this.signals = []; this.people = []; this.lamps = []; this.origin = 0;
    this.lightPool = Array.from({ length: 10 }, () => { const light = new T.PointLight('#e4ece0', 30, 21, 1.65); scene.add(light); return light; });
    this.bodyMaterials = new Map();
    this.shadowMaterial = new T.MeshBasicMaterial({ map: materials.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  }
  build(base) {
    const group = new T.Group(); const b = new Batch(base), m = this.m, rng = random(base + 907);
    const chunk = { group, base, people: [], signals: [], lamps: [] };
    const addLamp = (s, x, y, stationLight) => chunk.lamps.push({ s, x, y, stationLight });
    for (let s = base; s < base + 24; s += 3) {
      const st = stationAt(s + 1.5);
      b.box(m.ballast, s + 1.5, 0, -.28, 6.1, .36, 3.02);
      b.box(m.concrete, s + 1.5, 0, -.075, 2.24, .06, 3.02);
      // Rails: web, foot and polished running head, with actual gauge and sleepers.
      for (const x of [-.7175, .7175]) {
        b.box(m.railSide, s + 1.5, x, .085, .068, .15, 3.04);
        b.box(m.railSide, s + 1.5, x, .028, .15, .026, 3.04);
        b.box(m.railTop, s + 1.5, x, .169, .068, .032, 3.04);
      }
      for (let z = s; z < s + 3; z += .6) {
        b.box(m.sleeper, z, 0, -.024, 2.02, .13, .22);
        for (const x of [-.7175, .7175]) {
          b.box(m.dark, z, x, .052, .23, .025, .18);
          for (const off of [-.095, .095]) b.box(m.steel, z, x + off, .081, .028, .035, .085);
        }
      }
      b.box(m.dark, s + 1.5, -1.3, .19, .1, .18, 3.02);
      b.box(m.railCover, s + 1.5, -1.3, .3, .22, .035, 3.02);
      b.box(m.dark, s + 1.5, 1.28, -.06, .12, .05, 3.02);
      if (!st) {
        tunnelRing(b, m, s + 1.5, 3.035);
        tunnelRing(b, m, s, .033, true);
        for (const side of [-1, 1]) {
          b.box(m.concrete, s + 1.5, side * 2.57, .12, .8, .32, 3.01);
          b.box(m.dark, s + 1.5, side * 2.58, .305, .51, .026, 3.01);
          for (const y of [.7, .81, 1.2, 1.32, 2.12]) b.box(m.rubber, s + 1.5, side * 2.96, y, .055, .055, 3.01);
          b.box(m.dark, s, side * 2.91, 1.4, .07, 1.63, .045);
        }
        if (s % 12 === 0) {
          const side = (s / 12) % 2 === 0 ? -1 : 1;
          b.box(m.dark, s + 1.5, side * 2.57, 3.08, .34, .18, .85, [0, 0, side * .55]);
          b.box(m.lamp, s + 1.5, side * 2.53, 3.02, .23, .06, .64, [0, 0, side * .55]);
          addLamp(s + 1.5, side * 2.35, 2.9, false);
        }
        if (s % 48 === 0) {
          panel(b, m.sign('←  Notausgang', 'exit'), s + 2, -2.87, 2.13, .92, .24, Math.PI / 2);
          b.box(m.steel, s + .7, 2.8, 1.76, .21, .85, .52);
          b.box(m.dark, s + .7, 2.685, 1.76, .025, .5, .33);
        }
        if (s % 96 === 0) panel(b, m.sign(String(((Math.floor(s / 12) % 32) + 32) % 32).padStart(3, '0')), s + .5, -2.84, 1.74, .38, .2, Math.PI / 2);
      } else {
        const side = st.side, accent = m.palette(st.color);
        b.box(m.concrete, s + 1.5, side * 4.42, .34, 5.56, 1.05, 3.01);
        b.box(m.floor, s + 1.5, side * 4.42, .905, 5.56, .08, 3.01);
        b.box(m.white, s + 1.5, side * 1.72, .94, .14, .06, 3.01);
        b.box(m.yellow, s + 1.5, side * 2.01, .956, .4, .015, 3.01);
        for (let z = s; z < s + 3; z += .18) for (const dx of [1.86, 1.99, 2.12]) b.box(m.yellow, z, side * dx, .969, .037, .01, .045);
        b.box(m.dark, s + 1.5, side * 1.66, .55, .025, .16, 3.01);
        b.box(m.tiles, s + 1.5, side * 7.23, 3.03, .2, 4.24, 3.02);
        b.box(accent, s + 1.5, side * 7.105, 2.6, .03, .64, 3.02);
        b.box(m.dark, s + 1.5, side * 7.11, 1.08, .035, .24, 3.02);
        // The wall opposite the platform remains close to the track.
        b.box(m.tiles, s + 1.5, -side * 2.93, 2.3, .25, 5, 3.02);
        b.box(accent, s + 1.5, -side * 2.79, 2.18, .028, .58, 3.02);
        b.box(m.concrete, s + 1.5, -side * 2.48, .22, .66, .5, 3.02);
        b.box(m.dark, s + 1.5, -side * 2.79, .74, .06, .1, 3.02);
        b.box(m.ceiling, s + 1.5, side * 2.1, 5.18, 10.4, .28, 3.03);
        for (const x of [side * 2.6, side * 5.65]) {
          b.box(m.dark, s + 1.5, x, 4.79, .18, .18, 3.02);
          b.box(m.coolLamp, s + 1.5, x, 4.68, .105, .036, 2.86);
        }
        if (s % 6 === 0) {
          b.box(m.steel, s, side * 2.1, 4.96, 10.2, .24, .13);
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
        const rel = s - st.start;
        if (rel === 12 || rel === 72) {
          const boardS = s - 1.2;
          b.box(m.dark, boardS, side * 3.2, 3.86, 2.55, .68, .12);
          panel(b, m.sign('', 'led'), boardS - .075, side * 3.2, 3.86, 2.45, .57);
          panel(b, m.sign('', 'led'), boardS + .075, side * 3.2, 3.86, 2.45, .57, Math.PI);
          for (const x of [2.3, 4.1]) b.box(m.steel, boardS, side * x, 4.52, .04, .63, .04);
          panel(b, m.sign('↑  Ausgang', 'exit'), s + 8, side * 5.6, 4.05, 1.75, .43);
        }
        if (rel === 24 || rel === 90) bench(b, m, s, side);
        if (rel === 42) { if (st.feature === 'escalator') escalator(b, m, s, side); else lift(b, m, s, side); }
        if (rel === 6 || rel === 66 || rel === 108) panel(b, m.sign(st.name), s, side * 7.1, 3.14, 3.4, .6, -side * Math.PI / 2);
        if (rel % 6 === 0 && rel > 3 && rel < 117) {
          const count = rel % 18 === 0 ? 2 : 1;
          for (let j = 0; j < count; j++) this.person(chunk, s + 1 + rng() * 2, side * (2.65 + rng() * 2.2), rng);
        }
      }
    }
    // Close the station ends around the running tunnel, with a concrete portal.
    for (let i = Math.max(0, Math.floor((base - FIRST_STATION) / BLOCK) - 1); i <= Math.floor((base + 24 - FIRST_STATION) / BLOCK) + 1; i++) {
      const st = station(i);
      for (const end of [st.start, st.end]) if (end >= base && end < base + 24) {
        b.box(m.palette(st.color), end, st.side * 5.19, 2.6, 4.33, 5.2, .4);
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
    const stIndex = Math.max(0, Math.floor((base - FIRST_STATION) / BLOCK));
    const candidates = [{ s: 11, initial: true }];
    for (let i = Math.max(0, stIndex - 1); i <= stIndex + 1; i++) {
      const st = station(i);
      candidates.push({ s: st.end + 4, stationIndex: i });
      candidates.push({ s: st.start - 76 }, { s: st.start - 172 });
    }
    for (const spec of candidates) if (spec.s >= base && spec.s < base + 24) this.signal(chunk, b, spec);
    b.finish(group); this.scene.add(group); this.chunks.set(base, chunk); return chunk;
  }
  signal(chunk, b, spec) {
    const { s } = spec, m = this.m, x = 2.23;
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
  humanMaterial(color) {
    if (!this.bodyMaterials.has(color)) this.bodyMaterials.set(color, new T.MeshStandardMaterial({ color, roughness: .92 }));
    return this.bodyMaterials.get(color);
  }
  person(chunk, s, x, rng) {
    const person = new T.Group(), body = new T.Group(); person.add(body);
    const palettes = ['#29353a', '#625b51', '#8d7c63', '#4d5b66', '#333b31', '#724740', '#bab4a2', '#4b3d4c'];
    const coat = this.humanMaterial(palettes[Math.floor(rng() * palettes.length)]), trousers = this.humanMaterial(rng() > .55 ? '#28313a' : '#3b3835');
    const skin = this.humanMaterial(['#be9073', '#95694e', '#d1b294', '#6c4b37'][Math.floor(rng() * 4)]), hair = this.humanMaterial(['#342d26', '#625340', '#242424', '#a29d8e'][Math.floor(rng() * 4)]);
    const part = (parent, geo, mat, pos, scale) => { const mesh = new T.Mesh(geo, mat); mesh.position.set(...pos); mesh.scale.set(...scale); parent.add(mesh); return mesh; };
    const limb = (parent, mat, pos, length, radius) => { const pivot = new T.Group(); pivot.position.set(...pos); parent.add(pivot); part(pivot, cylinder, mat, [0, -length / 2, 0], [radius, length, radius]); return pivot; };
    part(body, sphere, coat, [0, 1.1, 0], [.225, .34, .135]);
    part(body, cylinder, coat, [0, .98, 0], [.195, .28, .135]);
    part(body, cylinder, skin, [0, 1.43, 0], [.062, .14, .06]);
    const head = part(body, sphere, skin, [0, 1.58, 0], [.105, .14, .106]);
    part(body, sphere, hair, [0, 1.64, -.022], [.11, .104, .097]);
    part(body, sphere, skin, [0, 1.568, .1], [.025, .035, .033]);
    for (const dx of [-.04, .04]) part(body, sphere, hair, [dx, 1.6, .095], [.012, .009, .007]);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = limb(body, trousers, [side * .105, .86, 0], .42, .082);
      const shin = limb(leg, trousers, [0, -.4, 0], .38, .066); part(shin, sphere, this.m.rubber, [0, -.36, .045], [.079, .065, .135]); legs.push({ pivot: leg, shin });
      const arm = limb(body, coat, [side * .215, 1.32, 0], .3, .069); arm.rotation.z = side * .12;
      const forearm = limb(arm, coat, [0, -.285, 0], .26, .055); part(forearm, sphere, skin, [0, -.265, 0], [.047, .07, .038]); arms.push({ pivot: arm, forearm });
    }
    const phone = rng() > .65;
    if (phone) { arms[1].pivot.rotation.x = -.36; arms[1].forearm.rotation.x = -1.3; part(arms[1].forearm, box, this.m.dark, [0, -.28, .024], [.072, .12, .016]); }
    if (rng() > .48) { part(body, sphere, this.humanMaterial('#66553f'), [.24, .93, -.04], [.12, .22, .13]); part(body, box, this.m.dark, [.185, 1.17, -.055], [.035, .48, .035]); }
    if (rng() > .6) {
      part(body, sphere, hair, [0, 1.51, -.065], [.116, .18, .078]);
      part(body, cylinder, coat, [0, .84, 0], [.208, .34, .147]);
    }
    if (rng() > .68) {
      const scarf = this.humanMaterial(['#b3a183', '#606f74', '#866754'][Math.floor(rng() * 3)]);
      part(body, sphere, scarf, [0, 1.4, 0], [.105, .07, .088]);
      part(body, box, scarf, [.09, 1.2, .128], [.075, .3, .025]);
    }
    // Seams, lapels and a hem break up the smooth clothing silhouette.
    part(body, box, trousers, [0, 1.08, .135], [.009, .39, .007]);
    const height = .88 + rng() * .21; person.scale.setScalar(height);
    const rootY = .945 - .035 * height;
    const p = point(s, x, rootY), o = point(chunk.base); person.position.set(p[0] - o[0], p[1], p[2] - o[2]); person.rotation.y = (x < 0 ? Math.PI / 2 : -Math.PI / 2) + (rng() - .5) * 1.1;
    chunk.group.add(person);
    const shadow = new T.Mesh(plane, this.shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.25, 1, 1); shadow.position.copy(person.position); shadow.position.y = .957; chunk.group.add(shadow);
    chunk.people.push({ person, body, head, legs, arms, phone, phase: rng() * Math.PI * 2, pace: .65 + rng() * .55, walker: rng() > .76, s, x, shadow, rootY, baseY: person.rotation.y });
  }
  update(train) {
    const base = Math.floor(train.s / 24) * 24;
    for (let b = base - 24; b <= base + 216; b += 24) if (!this.chunks.has(b)) this.build(b);
    for (const [key, chunk] of this.chunks) {
      if (key < base - 24 || key > base + 216) {
        this.scene.remove(chunk.group);
        chunk.group.traverse(o => { if (o.isMesh && ![box, plane, sphere, cylinder].includes(o.geometry)) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
        this.chunks.delete(key); continue;
      }
      chunk.group.position.set(trackX(key) - trackX(train.s), 0, train.s - key);
      for (const signal of chunk.signals) {
        const green = signal.initial ? train.phase !== 'signal' : signal.stationIndex === undefined || train.next > signal.stationIndex || (train.next === signal.stationIndex && train.phase === 'depart');
        signal.lights[0].material = green ? this.m.dark : this.m.red; signal.lights[1].material = green ? this.m.green : this.m.dark;
        signal.glow.position.copy(signal.lights[green ? 1 : 0].position); signal.glow.material.color.set(green ? '#72ffa0' : '#ff361b');
      }
      for (const p of chunk.people) {
        if (p.s - train.s > 140 || p.s - train.s < -18) continue;
        const t = train.time * p.pace + p.phase, walking = p.walker;
        p.body.rotation.z = Math.sin(t * 1.3) * .018;
        p.head.rotation.y = Math.sin(t * .43) * .16;
        p.body.position.y = walking ? Math.abs(Math.sin(t * 3)) * .021 : Math.sin(t * 1.7) * .007;
        for (let i = 0; i < 2; i++) {
          const stride = Math.sin(t * 3 + i * Math.PI);
          p.legs[i].pivot.rotation.x = walking ? stride * .32 : Math.sin(t * .6 + i) * .025;
          p.legs[i].shin.rotation.x = walking ? Math.max(0, -stride) * .38 : .015;
          if (!(i === 1 && p.phone)) { p.arms[i].pivot.rotation.x = walking ? -stride * .23 : Math.sin(t + i) * .05; p.arms[i].forearm.rotation.x = -.1 + Math.sin(t * .7) * .065; }
        }
        if (walking) {
          // Short pacing paths stay behind the tactile strip and inside each station.
          const walkS = p.s + Math.sin(t * .24) * 2.3;
          const wp = point(walkS, p.x, p.rootY), op = point(chunk.base);
          p.person.position.set(wp[0] - op[0], p.rootY, wp[2] - op[2]);
          p.person.rotation.y = Math.cos(t * .24) > 0 ? Math.PI : 0;
          p.shadow.position.x = p.person.position.x; p.shadow.position.z = p.person.position.z;
        } else p.person.rotation.y = p.baseY + Math.sin(t * .31) * .08;
      }
    }
    const lamps = [...this.chunks.values()].flatMap(c => c.lamps).sort((a, b) => Math.abs(a.s - train.s - 16) - Math.abs(b.s - train.s - 16));
    this.lightPool.forEach((light, i) => {
      const lamp = lamps[i]; light.visible = !!lamp; if (!lamp) return;
      const p = point(lamp.s, lamp.x, lamp.y); light.position.set(p[0] - trackX(train.s), p[1], p[2] + train.s);
      light.color.set(lamp.stationLight ? '#dce5d9' : '#e2d1b6'); light.intensity = lamp.stationLight ? 21 : 10; light.distance = lamp.stationLight ? 27 : 16;
    });
  }
  stats() { return { chunks: this.chunks.size, passengers: [...this.chunks.values()].reduce((n, c) => n + c.people.length, 0), signals: [...this.chunks.values()].reduce((n, c) => n + c.signals.length, 0) }; }
}
