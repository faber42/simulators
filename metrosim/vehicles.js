import * as T from '../pinsim/three.module.min.js';
import { point, trackX, trackAngle } from './route.mjs';
import { CAR_LENGTH, CAR_PITCH, CAR_COUNT, TRAIN_LENGTH, doorMotion } from './traffic.mjs';
import { OWN_SERVICE, OTHER_SERVICES, serviceLabel } from './services.mjs';

const box = new T.BoxGeometry(1, 1, 1).toNonIndexed();
const wheel = new T.CylinderGeometry(.27, .27, .13, 16).toNonIndexed();
const roofProfile = new T.Shape();
roofProfile.moveTo(-1.41, 3.02); roofProfile.quadraticCurveTo(-1.37, 3.46, -1.02, 3.46);
roofProfile.lineTo(1.02, 3.46); roofProfile.quadraticCurveTo(1.37, 3.46, 1.41, 3.02); roofProfile.closePath();
const roof = new T.ExtrudeGeometry(roofProfile, { depth: 17.4, bevelEnabled: false, curveSegments: 8 });
const noseProfile = new T.Shape();
noseProfile.moveTo(-1.22, .96); noseProfile.quadraticCurveTo(-1.43, .96, -1.43, 1.21);
noseProfile.lineTo(-1.43, 2.9); noseProfile.quadraticCurveTo(-1.38, 3.42, -1.03, 3.42);
noseProfile.lineTo(1.03, 3.42); noseProfile.quadraticCurveTo(1.38, 3.42, 1.43, 2.9);
noseProfile.lineTo(1.43, 1.21); noseProfile.quadraticCurveTo(1.43, .96, 1.22, .96); noseProfile.closePath();
const nose = new T.ExtrudeGeometry(noseProfile, { depth: .12, bevelEnabled: true, bevelThickness: .035, bevelSize: .025, bevelSegments: 2, steps: 1, curveSegments: 8 });
// One merged, vertex-coloured body per car; moving leaves share one instance mesh.
class Parts {
  constructor() { this.positions = []; this.normals = []; this.colors = []; }
  add(geometry, color, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const matrix = new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale));
    const normalMatrix = new T.Matrix3().getNormalMatrix(matrix), v = new T.Vector3(), n = new T.Vector3(), c = new T.Color(color);
    const p = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(v.x, v.y, v.z); this.normals.push(n.x, n.y, n.z); this.colors.push(c.r, c.g, c.b);
    }
  }
  box(color, x, y, z, w, h, d, rotation) { this.add(box, color, [x, y, z], [w, h, d], rotation); }
  geometry() {
    const g = new T.BufferGeometry();
    for (const [key, data] of [['position', this.positions], ['normal', this.normals], ['color', this.colors]]) g.setAttribute(key, new T.Float32BufferAttribute(data, 3));
    g.computeBoundingSphere(); return g;
  }
}

function carGeometry(first, last) {
  const b = new Parts(), silver = '#abb7b6', teal = '#267b79', dark = '#242d30', rubber = '#151c1f';
  b.box(dark, 0, .72, 0, 2.62, .34, 17.4);
  b.box('#8c9691', 0, .94, 0, 2.87, .09, 17.4);
  b.add(roof, '#bfc8c3', [0, 0, -8.7]);
  for (const side of [-1, 1]) {
    b.box(silver, side * 1.33, 3.12, 0, .24, .34, 17.4, [0, 0, side * .3]);
    b.box(teal, side * 1.435, 3.01, 0, .065, .15, 17.4);
    b.box('#747f7d', side * 1.39, .83, 0, .1, .12, 17.4);
    // Solid panels between doors. Windows are opaque, milky glazing with seals.
    const spans = [[-8.7, -6.05], [-4.75, -.65], [.65, 4.75], [6.05, 8.7]];
    for (const [a, z] of spans) {
      const length = z - a, mid = (a + z) / 2;
      b.box(silver, side * 1.42, 1.42, mid, .09, .91, length);
      b.box(teal, side * 1.475, 1.69, mid, .025, .17, length);
      b.box(silver, side * 1.42, 2.83, mid, .09, .28, length);
      b.box(rubber, side * 1.436, 2.29, mid, .06, .92, length - .24);
      b.box('#718d91', side * 1.475, 2.3, mid, .022, .78, length - .36);
      b.box('#a2b5b2', side * 1.489, 2.61, mid, .01, .05, length - .42);
      for (const edge of [a + .06, z - .06]) b.box(silver, side * 1.435, 2.29, edge, .085, 1.08, .12);
    }
    for (const z of [-5.4, 0, 5.4]) {
      b.box('#e7d69c', side * 1.47, .97, z, .23, .055, 1.28);
      for (const edge of [-.69, .69]) b.box('#263939', side * 1.44, 1.98, z + edge, .12, 2.04, .065);
      b.box('#252f30', side * 1.44, 3.0, z, .13, .08, 1.45);
    }
  }
  // The vestibule has a floor and a dim inner partition, no detailed interior.
  b.box('#4b5d59', 0, 1.97, 0, .09, 2.02, 17.2);
  for (const z of [-8.72, 8.72]) {
    const cab = z < 0 ? first : last;
    if (cab) b.add(nose, teal, [0, 0, z - .06]);
    else {
      b.box(dark, 0, 1.86, z, 2.79, 1.8, .12);
      b.box(silver, 0, 2.98, z, 2.65, .49, .13);
    }
    b.box('#17292e', 0, 2.37, z + Math.sign(z) * .11, 2.48, .91, .025);
    b.box('#48676c', 0, 2.4, z + Math.sign(z) * .13, 2.28, .74, .012);
    b.box('#112122', 0, 1.01, z, 1.7, .19, .22);
    b.box('#3b4848', 0, .64, z + Math.sign(z) * .2, .48, .24, .48);
    if (cab) {
      b.box('#171f23', -.3, 2.16, z + Math.sign(z) * .15, .72, .024, .025, [0, 0, .16]);
      for (const x of [-.91, .91]) b.box('#17272c', x, 1.38, z + Math.sign(z) * .125, .32, .18, .04);
    } else {
      b.box('#293233', 0, 2.0, z + Math.sign(z) * .11, 1.5, 2.1, .22);
      for (let x = -.7; x <= .7; x += .12) b.box('#151e21', x, 2.0, z + Math.sign(z) * .24, .035, 2.1, .09);
    }
  }
  for (const z of [-5.55, 5.55]) {
    b.box('#283033', 0, .43, z, 1.82, .34, 2.12);
    for (const dz of [-.65, .65]) for (const side of [-1, 1]) b.add(wheel, '#454c4b', [side * .72, .43, z + dz], [1, 1, 1], [0, 0, Math.PI / 2]);
  }
  return b.geometry();
}

function doorGeometry() {
  const b = new Parts();
  b.box('#c7ceca', 0, 1.97, 0, .072, 1.96, .63);
  // Permanent perimeter seals keep the closed leaves distinct from the body.
  for (const z of [-.307, .307]) b.box('#263332', .04, 1.97, z, .012, 1.96, .016);
  for (const y of [1, 2.94]) b.box('#455753', .04, y, 0, .012, .02, .63);
  b.box('#204a4b', .041, 2.33, 0, .014, .87, .46);
  b.box('#839d9b', .05, 2.34, 0, .012, .73, .34);
  b.box('#297d79', .042, 1.68, 0, .01, .15, .63);
  b.box('#535f5c', .046, 1.83, .21, .023, .15, .023);
  b.box('#b9aa70', .046, 1.46, -.2, .018, .07, .035);
  return b.geometry();
}

export class Vehicles {
  constructor(scene, materials) {
    this.scene = scene;
    this.material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .25, emissive: '#9caeaa', emissiveIntensity: .07 });
    this.geometries = [carGeometry(true, false), carGeometry(false, false), carGeometry(false, true)];
    this.doorGeometry = doorGeometry();
    this.signMaterials = new Map([OWN_SERVICE, ...OTHER_SERVICES].map(service => [serviceLabel(service), materials.sign(serviceLabel(service), 'vehicle')]));
    this.red = new T.MeshBasicMaterial({ color: new T.Color(3.5, .055, .018) }); this.white = new T.MeshBasicMaterial({ color: new T.Color(2, 2.1, 1.8) });
    this.lightGeometry = new T.SphereGeometry(.072, 10, 6);
    this.own = this.create(true); this.ahead = this.create(false);
    this.matrix = new T.Matrix4(); this.quaternion = new T.Quaternion(); this.position = new T.Vector3(); this.unit = new T.Vector3(1, 1, 1);
    this.axis = new T.Vector3(0, 1, 0);
  }
  create(own) {
    const group = new T.Group(), cars = [], leaves = [], signs = [];
    const service = own ? OWN_SERVICE : OTHER_SERVICES[0], signMaterial = this.signMaterials.get(serviceLabel(service));
    for (let i = 0; i < CAR_COUNT; i++) {
      const car = new T.Group(); car.add(new T.Mesh(this.geometries[i === 0 ? 0 : i === CAR_COUNT - 1 ? 2 : 1], this.material));
      const doors = new T.InstancedMesh(this.doorGeometry, this.material, 12); doors.instanceMatrix.setUsage(T.DynamicDrawUsage); doors.frustumCulled = false; car.add(doors);
      for (const side of [-1, 1]) {
        const sign = new T.Mesh(new T.PlaneGeometry(2.6, .25), signMaterial); signs.push(sign);
        sign.position.set(side * 1.485, 2.85, -2.6); sign.rotation.y = side * Math.PI / 2; car.add(sign);
      }
      if (i === 0 || i === CAR_COUNT - 1) {
        const end = i === 0 ? -1 : 1, sign = new T.Mesh(new T.PlaneGeometry(2.12, .26), signMaterial); signs.push(sign);
        sign.position.set(0, 3.0, end * 8.855); sign.rotation.y = end < 0 ? Math.PI : 0; car.add(sign);
        for (const x of [-.91, .91]) {
          const light = new T.Mesh(this.lightGeometry, end > 0 ? this.red : this.white); light.position.set(x, 1.38, end * 8.86); light.scale.set(1, 1, .3); car.add(light);
        }
      }
      group.add(car); cars.push(car); leaves.push(doors);
    }
    if (own) group.traverse(o => o.layers.set(1));
    group.visible = false; this.scene.add(group); return { group, cars, leaves, signs, service };
  }
  setService(vehicle, service) {
    if (vehicle.service === service) return;
    vehicle.service = service;
    for (const sign of vehicle.signs) sign.material = this.signMaterials.get(serviceLabel(service));
  }
  place(vehicle, front, originS, opening, side) {
    vehicle.group.visible = true;
    for (let i = 0; i < CAR_COUNT; i++) {
      const s = front - CAR_LENGTH / 2 - i * CAR_PITCH, p = point(s);
      const car = vehicle.cars[i]; car.position.set(p[0] - trackX(originS), 0, originS - s); car.rotation.y = -trackAngle(s);
      let leaf = 0;
      for (const wall of [-1, 1]) for (const z of [-5.4, 0, 5.4]) for (const direction of [-1, 1]) {
        const motion = doorMotion(wall === side ? opening : 0);
        this.position.set(wall * (1.485 + motion.plug), 0, z + direction * (.325 + motion.slide));
        this.quaternion.setFromAxisAngle(this.axis, wall < 0 ? Math.PI : 0);
        this.matrix.compose(this.position, this.quaternion, this.unit); vehicle.leaves[i].setMatrixAt(leaf++, this.matrix);
      }
      vehicle.leaves[i].instanceMatrix.needsUpdate = true;
    }
  }
  update(train, ownOpening, ownSide) {
    this.place(this.own, train.s, train.s, ownOpening, ownSide);
    this.ahead.group.visible = false; this.preceding = null;
    for (const [index] of train.traffic.services) {
      const lead = train.traffic.pose(index, train.time);
      if (lead.rear > train.s - 30 && lead.rear < train.s + 225) {
        this.preceding = lead; this.setService(this.ahead, lead.service);
        this.place(this.ahead, lead.s, train.s, lead.opening, lead.side); break;
      }
    }
  }
  stats() { return { ownService: this.own.service, precedingTrain: this.preceding ? { front: this.preceding.s, rear: this.preceding.rear, phase: this.preceding.phase, doorOpening: this.preceding.opening, station: this.preceding.station.index, service: this.preceding.service } : null, trainLength: TRAIN_LENGTH }; }
}
