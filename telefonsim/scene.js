import * as THREE from '../pinsim/three.module.min.js';
import { STAGES, TAPE_MACHINES, SOURCE, CAMERA_TRAVEL_SECONDS, resolveNumber } from './engine.mjs';
import { SOURCE_POSITION, EXTERNAL_GATE_POSITION, selectorSite, targetPosition, subscriberHandoff, tapePosition, boundsOf, unionBounds, overviewFrame, releaseBlockView, WHOLE_OFFICE_BOUNDS, UPPER_FLOOR_Y, UPPER_FLOOR_CENTER } from './topology.mjs';
import { OfficeScene } from './office-scene.js';
import { UpperFloorTransition, upperFloorRequested } from './upper-floor.mjs';
import { FrostedView } from './frosted-view.js';
import { HallGuide } from './hall-guide.js';
import { subscriberAppearance } from './subscriber-catalog.mjs';
import { makeSubscriber } from './subscriber-scene.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const materials = new Map(), geometries = new Map(), labels = new Map();
function mat(color, metalness = .4, roughness = .55) {
  const key = `${color}/${metalness}/${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  return materials.get(key);
}
function geo(key, make) { if (!geometries.has(key)) geometries.set(key, make()); return geometries.get(key); }
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); parent.add(object); return object;
}
function box(p, w, h, d, m, x = 0, y = 0, z = 0) {
  return mesh(p, geo(`b${w}/${h}/${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
}
function cyl(p, r, h, m, x = 0, y = 0, z = 0, r2 = r, sides = 20) {
  return mesh(p, geo(`c${r}/${r2}/${h}/${sides}`, () => new THREE.CylinderGeometry(r, r2, h, sides)), m, x, y, z);
}
function sphere(p, r, m, x, y, z) { return mesh(p, geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 8)), m, x, y, z); }
function tube(p, points, radius, material, segments = 32) {
  return mesh(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false), material);
}
function labelMaterial(text, fg = '#d6c9a8', bg = '#29302a', size = 36) {
  const key = `${text}/${fg}/${bg}/${size}`;
  if (labels.has(key)) return labels.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#857b5a'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${size}px monospace`;
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: texture }); labels.set(key, m); return m;
}
function plaque(p, text, x, y, z, w = 1.9, h = .36) {
  return mesh(p, geo(`p${w}/${h}`, () => new THREE.PlaneGeometry(w, h)), labelMaterial(text), x, y, z);
}
// Repeated static parts are instanced, including thousands of contact fingers.
// Moving subassemblies are batched in their own local coordinate system.
function batch(root, excludeDynamic = true) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), buckets = new Map(), remove = [];
  function walk(obj) {
    if (obj !== root && excludeDynamic && obj.userData.dynamic) return;
    if (obj.isMesh && !obj.isInstancedMesh) {
      const key = `${obj.geometry.uuid}/${obj.material.uuid}`;
      if (!buckets.has(key)) buckets.set(key, { geometry: obj.geometry, material: obj.material, matrices: [] });
      buckets.get(key).matrices.push(new THREE.Matrix4().multiplyMatrices(inverse, obj.matrixWorld)); remove.push(obj);
    }
    [...obj.children].forEach(walk);
  }
  walk(root); remove.forEach(obj => obj.removeFromParent());
  for (const b of buckets.values()) {
    const instance = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
    b.matrices.forEach((m, i) => instance.setMatrixAt(i, m));
    instance.instanceMatrix.needsUpdate = true; instance.computeBoundingSphere(); root.add(instance);
  }
}

const iron = mat('#4c5147', .7), nickel = mat('#a5aaa0', .85, .29), dark = mat('#262c28', .5),
  brass = mat('#b39a59', .75, .32), copper = mat('#a77448', .6), insulator = mat('#191f1c', .1),
  bakelite = mat('#131a18', .2, .24), enamel = mat('#39493c', .55, .34), cloth = mat('#a4996c', .05, .9),
  redWire = mat('#714631', .1), tealWire = mat('#4d7a70', .1), paper = mat('#d2c7a2', .03, .83);

function makeSelector(parent, stage) {
  const group = new THREE.Group(); parent.add(group);
  box(group, 2.08, 2.35, .09, dark, 0, 1.17, -.92);
  box(group, 2.12, .14, 1.55, iron, 0, .08, .03);
  box(group, 2.12, .10, 1.12, iron, 0, 2.27, -.1);
  for (const x of [-.94, .94]) {
    cyl(group, .045, 2.2, nickel, x, 1.15, .13);
    for (const y of [.19, 2.15]) cyl(group, .082, .10, nickel, x, y, .13, .082, 6);
  }
  // Three sets of ten bank levels, each with ten individual brass contacts.
  const arcGeometry = geo('bank-arc', () => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, .78, -.10 * Math.PI, 1.10 * Math.PI, false);
    shape.absarc(0, 0, .60, 1.10 * Math.PI, -.10 * Math.PI, true); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: .019, bevelEnabled: false, curveSegments: 22 });
    g.rotateX(-Math.PI / 2); return g;
  });
  for (let bank = 0; bank < 3; bank++) for (let level = 0; level < 10; level++) {
    const y = .50 + bank * .55 + level * .045;
    mesh(group, arcGeometry, insulator, -.22, y, .01);
    for (let contact = 0; contact < 10; contact++) {
      const angle = -.10 * Math.PI + (contact + .5) / 10 * Math.PI * 1.2;
      const finger = box(group, .18, .016, .044, level % 2 ? nickel : brass,
        -.22 + Math.cos(angle) * .715, y + .023, -Math.sin(angle) * .715);
      finger.rotation.y = angle;
    }
  }
  cyl(group, .055, 2.25, nickel, -.22, 1.15, 0);
  for (const y of [.32, 2.16]) { cyl(group, .14, .12, nickel, -.22, y, 0); cyl(group, .19, .024, brass, -.22, y + .07, 0); }
  // Pawl, lift magnet, rotary magnet, and a fine exposed return spring.
  for (const y of [.63, 1.49]) {
    cyl(group, .17, .49, copper, .68, y, -.09);
    for (const dy of [-.25, .25]) cyl(group, .22, .065, dark, .68, y + dy, -.09);
    cyl(group, .065, .67, nickel, .68, y, -.09);
    box(group, .36, .04, .22, brass, .66, y + .39, .02);
  }
  const springGeometry = geo('spring', () => {
    const points = [];
    for (let i = 0; i <= 240; i++) points.push(V(Math.cos(i / 240 * TAU * 18) * .066, i / 240 * .69, Math.sin(i / 240 * TAU * 18) * .066));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 240, .013, 5, false);
  });
  mesh(group, springGeometry, nickel, .37, 1.41, .24);
  for (let n = 0; n < 8; n++) box(group, .035, .5, .018, nickel, .39 + n * .05, .34, .43);
  for (let n = 0; n < 3; n++) {
    const x = .64 + .09 * n;
    tube(group, [V(x, .25, -.38), V(1, .5, .35), V(.98, 1.2, .49), V(x, 1.95, -.2)], .022, [cloth, tealWire, redWire][n], 20);
  }
  for (const x of [-.88, .88]) for (const y of [.11, 2.28]) {
    const screw = cyl(group, .045, .022, nickel, x, y, .66, .045, 12); screw.rotation.x = Math.PI / 2;
    box(group, .052, .009, .01, dark, x, y, .676);
  }
  const carriage = new THREE.Group(); carriage.userData.dynamic = true; carriage.position.set(-.22, 0, 0); group.add(carriage);
  cyl(carriage, .12, .23, nickel, 0, .34, 0);
  const wipers = new THREE.Group(); carriage.add(wipers);
  for (let bank = 0; bank < 3; bank++) {
    const arm = box(wipers, .72, .024, .049, brass, .35, .455 + bank * .55, 0);
    arm.rotation.z = -.025;
    box(wipers, .1, .045, .09, nickel, .67, .455 + bank * .55, 0);
  }
  batch(wipers, false); wipers.rotation.y = -.70;
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#605638', emissive: '#000000', roughness: .35 });
  const lamp = sphere(group, .065, lampMaterial, .77, 2.30, .67); lamp.userData.dynamic = true;
  const tag = plaque(group, STAGES[stage].short, 0, .07, .82, 1.05, .20);
  tag.userData.dynamic = true;
  return { group, carriage, wipers, lamp, tag, stage, y: 0, angle: -.70, lastLabel: '' };
}

function makePhone(scene, position, color, number) {
  const root = new THREE.Group(); root.position.copy(position); scene.add(root);
  const plastic = color === 'black' ? bakelite : mat('#82745b', .15, .32);
  box(root, 3.4, .19, 2.65, mat('#483c2c', .15, .85), 0, -.16, 0);
  for (const x of [-1.45, 1.45]) for (const z of [-1.05, 1.05]) box(root, .12, 1.6, .12, iron, x, -.98, z);
  const body = cyl(root, .86, .48, plastic, 0, .18, 0, 1.15, 48); body.scale.set(1.21, 1, .89);
  const foot = cyl(root, 1.09, .10, bakelite, 0, -.02, 0, 1.10, 48); foot.scale.set(1.17, 1, .89);
  for (const x of [-.73, .73]) { box(root, .10, .37, .12, nickel, x, .59, -.49); box(root, .18, .07, .22, plastic, x, .78, -.49); }
  const handset = new THREE.Group(); handset.userData.dynamic = true; handset.position.set(0, .91, -.46); root.add(handset);
  tube(handset, [V(-.89, 0, 0), V(-.61, .15, 0), V(0, .21, 0), V(.61, .15, 0), V(.89, 0, 0)], .14, plastic, 28);
  for (const x of [-.90, .90]) {
    cyl(handset, .20, .30, plastic, x, -.06, 0, .27, 32);
    cyl(handset, .29, .09, plastic, x, -.22, 0, .27, 32);
    cyl(handset, .24, .015, dark, x, -.27, 0, .24, 28);
  }
  // A generous invisible hit target follows the receiver when it is lifted.
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const handsetHit = box(handset, 2.3, .6, .63, hitMaterial, 0, 0, 0); handsetHit.userData.action = 'handset';
  const dialMount = new THREE.Group(); dialMount.position.set(0, .447, .26); dialMount.rotation.x = -.28; root.add(dialMount);
  cyl(dialMount, .655, .055, nickel, 0, .015, 0, .655, 64);
  cyl(dialMount, .604, .016, paper, 0, .05, 0, .604, 64);
  const wheel = new THREE.Group(); wheel.userData.dynamic = true; dialMount.add(wheel);
  const wheelShape = new THREE.Shape(); wheelShape.absarc(0, 0, .562, 0, TAU, false);
  const dialHits = [];
  for (let n = 1; n <= 10; n++) {
    const angle = .21 + (n - 1) * Math.PI / 6;
    const x = Math.cos(angle) * .433, z = -Math.sin(angle) * .433;
    const hole = new THREE.Path(); hole.absarc(x, -z, .080, 0, TAU, true); wheelShape.holes.push(hole);
    // A face with real finger holes; numerals stay on the plate below.
    const digit = String(n % 10), c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#292c25'; ctx.font = 'bold 44px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(digit, 32, 34);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const numberMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const numberFace = mesh(dialMount, new THREE.PlaneGeometry(.145, .145), numberMat, x, .074, z); numberFace.rotation.x = -Math.PI / 2;
    const hit = cyl(dialMount, .088, .05, hitMaterial, x, .14, z, .088, 16);
    hit.userData.digit = digit; hit.userData.dynamic = true; dialHits.push(hit);
  }
  const wheelGeo = new THREE.ExtrudeGeometry(wheelShape, { depth: .026, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 1, curveSegments: 40 });
  wheelGeo.rotateX(-Math.PI / 2); mesh(wheel, wheelGeo, nickel, 0, .089, 0);
  cyl(wheel, .254, .026, bakelite, 0, .128, 0, .254, 48);
  const centre = plaque(wheel, number, 0, .146, 0, .37, .12); centre.rotation.x = -Math.PI / 2;
  const stop = box(dialMount, .20, .10, .055, brass, .39, .16, .43); stop.rotation.y = -.84;
  const cordPoints = [V(-.95, .74, -.46)];
  for (let i = 0; i <= 210; i++) {
    const t = i / 210; cordPoints.push(V(-1.09 - .32 * Math.sin(t * Math.PI) + Math.cos(t * 38 * Math.PI) * .048,
      .67 - t * .73 + Math.sin(t * 38 * Math.PI) * .048, -.47 + t * .96));
  }
  tube(root, cordPoints, .024, bakelite, 225);
  tube(root, [V(0, -.04, -.8), V(.3, -.07, -1.12), V(.72, -1.42, -1.48), V(1.6, -1.61, -2)], .021, cloth, 36);
  const nameTag = plaque(root, number === SOURCE ? `TEILNEHMER ${SOURCE}` : 'ZIELANSCHLUSS', 0, -.05, 1.18, 1.8, .22);
  nameTag.userData.dynamic = true;
  return { root, handset, handsetHit, dialMount, wheel, dialHits, nameTag, pickup: 0 };
}

function makeTapeMachine(scene, descriptor, baseY) {
  const root = new THREE.Group(); root.position.set(10.15, baseY, .25); scene.add(root);
  const cream = mat('#b5b09a', .5, .5), tapeMaterial = mat('#51372a', .15, .8);
  box(root, 3.65, 2.92, .82, enamel, 0, 1.4, -.1);
  box(root, 3.46, 2.72, .08, cream, 0, 1.42, .36);
  for (const x of [-1.68, 1.68]) {
    box(root, .09, 2.7, .15, nickel, x, 1.4, .44);
    for (const y of [.13, 2.69]) {
      const screw = cyl(root, .041, .025, nickel, x, y, .49); screw.rotation.x = Math.PI / 2;
      box(root, .051, .009, .009, dark, x, y, .51);
    }
  }
  plaque(root, `${descriptor.short.toUpperCase()} · ${descriptor.label}`, 0, 2.63, .42, 2.98, .24);
  plaque(root, descriptor.number, 0, .17, .42, 2.35, .20);
  const reels = [];
  for (const x of [-.85, .85]) {
    const spindle = cyl(root, .095, .28, nickel, x, 1.81, .51); spindle.rotation.x = Math.PI / 2;
    const reel = new THREE.Group(); reel.position.set(x, 1.81, .57); reel.userData.dynamic = true; root.add(reel);
    const pack = cyl(reel, .48, .075, tapeMaterial, 0, 0, -.035, .48, 48); pack.rotation.x = Math.PI / 2;
    const ring = mesh(reel, geo('tape-reel-rim', () => new THREE.TorusGeometry(.60, .034, 8, 64)), nickel, 0, 0, .048);
    for (let spoke = 0; spoke < 3; spoke++) {
      const angle = spoke * TAU / 3;
      const arm = box(reel, .47, .105, .035, nickel, Math.cos(angle) * .34, Math.sin(angle) * .34, .05);
      arm.rotation.z = angle;
    }
    const hub = cyl(reel, .15, .09, nickel, 0, 0, .07, .15, 24); hub.rotation.x = Math.PI / 2;
    const lock = box(reel, .20, .048, .045, dark, 0, 0, .14); lock.rotation.z = Math.PI / 4;
    // A small red index makes even slow rotation unambiguous.
    box(reel, .12, .046, .014, redWire, .52, 0, .085);
    batch(reel, false); reels.push(reel);
  }
  // Tape runs off the reels, around guides, across the head block and capstan.
  const points = [V(-.85, 1.34, .59), V(-1.37, 1.12, .59), V(-1.30, .91, .59),
    V(-.46, .70, .59), V(.47, .70, .59), V(1.30, .91, .59), V(1.37, 1.12, .59), V(.85, 1.34, .59)];
  const tapePath = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], midpoint = a.clone().add(b).multiplyScalar(.5);
    const ribbon = box(root, a.distanceTo(b), .029, .025, tapeMaterial, midpoint.x, midpoint.y, midpoint.z);
    ribbon.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    tapePath.add(new THREE.LineCurve3(a, b));
  }
  for (const x of [-1.30, 1.30, .50]) {
    const guide = cyl(root, .078, .13, nickel, x, x === .50 ? .78 : 1.04, .57); guide.rotation.x = Math.PI / 2;
    const cap = cyl(root, .035, .04, dark, x, x === .50 ? .78 : 1.04, .67); cap.rotation.x = Math.PI / 2;
  }
  box(root, .65, .28, .23, dark, -.08, .82, .46);
  box(root, .48, .17, .025, nickel, -.08, .82, .59);
  plaque(root, 'WIEDERGABE', -.08, .85, .61, .47, .10);
  // A small analogue level meter and mechanical transport keys.
  box(root, .58, .30, .04, dark, -.84, .39, .43);
  plaque(root, '−20  −10   0  +3', -.84, .42, .46, .48, .21);
  const meter = new THREE.Group(); meter.position.set(-.84, .31, .49); meter.userData.dynamic = true; root.add(meter);
  box(meter, .012, .15, .01, brass, 0, .07, 0);
  for (let i = 0; i < 4; i++) box(root, .16, .12, .07, i === 1 ? brass : nickel, .19 + i * .22, .39, .47);
  const lamp = sphere(root, .058, new THREE.MeshStandardMaterial({ color: '#534d36', emissive: '#000000' }), 1.27, .39, .49);
  lamp.userData.dynamic = true;
  const status = plaque(root, 'BEREIT', 0, 1.14, .49, .82, .18); status.userData.dynamic = true;
  const splice = box(root, .045, .035, .034, cloth); splice.userData.dynamic = true; splice.position.copy(tapePath.getPoint(.05));
  const jack = cyl(root, .062, .11, dark, -1.51, .40, .46); jack.rotation.x = Math.PI / 2;
  tube(root, [V(-1.51, .40, .54), V(-1.76, .20, .49), V(-1.86, -.15, -.17)], .032, cloth, 18);
  return { root, reels, lamp, status, meter, splice, tapePath, descriptor, state: '',
    endpoint: root.position.clone().add(V(-1.51, .40, .65)) };
}

export class ExchangeScene {
  constructor(canvas, viewElements) {
    this.canvas = canvas; this.viewElements = viewElements;
    this.overviewSection = document.getElementById('overview-view');
    this.hallGuide = new HallGuide(this.overviewSection);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.22;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#17231f');
    this.scene.fog = new THREE.FogExp2('#17231f', .018);
    this.scene.add(new THREE.HemisphereLight('#e6e5cb', '#475548', 2.8));
    const warm = new THREE.DirectionalLight('#ffe2a6', 3.6); warm.position.set(-5, 12, 9); this.scene.add(warm);
    const fill = new THREE.DirectionalLight('#acd9db', 2.1); fill.position.set(8, 7, 5); this.scene.add(fill);
    const back = new THREE.DirectionalLight('#d6bc85', 2); back.position.set(0, 10, -8); this.scene.add(back);
    box(this.scene, 1640, .15, 1500, mat('#101914', 0, 1), 0, -1.79, -500);
    for (let column = 0; column <= 9; column++) box(this.scene, .20, .01, 1150, mat('#68745a', .1), -630 + column * 140, -1.70, -510);
    for (let row = 0; row <= 10; row++) box(this.scene, 1260, .01, .20, mat('#68745a', .1), 0, -1.70, -22 - row * 112);
    this.office = new OfficeScene(this.scene);
    // The full mechanisms are render detail for permanent sites, never a
    // substitute location for a prefix. Rack and site coordinates stay fixed.
    this.devices = Array.from({ length: 6 }, (_, stage) => {
      const d = makeSelector(this.scene, stage); d.group.userData.dynamic = true;
      batch(d.group); d.group.visible = false; d.site = null; return d;
    });
    this.source = makePhone(this.scene, new THREE.Vector3(...SOURCE_POSITION), 'black', SOURCE);
    this.upperFloor = new THREE.Group(); this.upperFloor.userData.dynamic = true; this.scene.add(this.upperFloor);
    this.floorTransition = new UpperFloorTransition(); this.frostedView = new FrostedView();
    const glass = new THREE.MeshBasicMaterial({ color: '#90aba4', transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide });
    box(this.upperFloor, 1320, .5, 1280, glass, 0, UPPER_FLOOR_Y, -500);
    const trim = mat('#607f77', .3, .8);
    for (const x of [-660, 660]) box(this.upperFloor, .9, .8, 1280, trim, x, UPPER_FLOOR_Y, -500);
    for (const z of [-1140, 140]) box(this.upperFloor, 1320, .8, .9, trim, 0, UPPER_FLOOR_Y, z);
    // A sparse floor grid gives the empty upper level a readable surface.
    for (let x = -560; x <= 560; x += 140) box(this.upperFloor, .18, .05, 1280, glass, x, UPPER_FLOOR_Y + .3, -500);
    for (let z = -1050; z <= 70; z += 112) box(this.upperFloor, 1320, .05, .18, glass, 0, UPPER_FLOOR_Y + .3, z);
    this.target = null; this.targetNumber = null;
    const external = new THREE.Group(); external.position.fromArray(EXTERNAL_GATE_POSITION); this.scene.add(external);
    cyl(external, .12, 3.6, nickel, 0, -1.2, 0);
    plaque(external, '← 0 · FERNAMT', 0, 1.1, .2, 12, 2.4);
    plaque(external, 'WEITERE VERMITTLUNG AUSSERHALB', 0, -.7, .2, 12, .65);
    this.tapes = Object.fromEntries(TAPE_MACHINES.map(descriptor => {
      const tape = makeTapeMachine(this.upperFloor, descriptor, 0);
      tape.root.position.fromArray(tapePosition(descriptor.id));
      tape.endpoint.copy(tape.root.position).add(V(-1.51, .40, .65));
      tape.root.userData.dynamic = true; batch(tape.root);
      return [descriptor.id, tape];
    }));
    const station = new THREE.Group(); station.position.fromArray(tapePosition('program')); this.upperFloor.add(station);
    station.position.y = UPPER_FLOOR_Y + 1.7;
    for (const x of [-1.92, 1.92]) {
      box(station, .12, 9.15, .16, enamel, x, 2.86, -.4);
      box(station, .45, .13, 1.7, iron, x, -1.62, -.25);
    }
    for (const y of [.7, 4.35, 7.7]) box(station, 3.96, .12, 1.22, enamel, 0, y, -.15);
    plaque(station, 'ANSAGEDIENSTE · OBERGESCHOSS', 0, 8.16, .23, 3.55, .35);
    box(this.upperFloor, 12, .15, 8, mat('#2f4540', .2), UPPER_FLOOR_CENTER[0], UPPER_FLOOR_Y + .35, UPPER_FLOOR_CENTER[2]);
    batch(this.upperFloor);
    this.upperFloor.traverse(o => o.layers.set(1)); this.upperFloor.visible = false;
    this.scene.traverse(o => { if (o.isLight) o.layers.enable(1); });
    this.routeGroup = new THREE.Group(); this.routeGroup.userData.dynamic = true; this.scene.add(this.routeGroup);
    this.routeMaterial = new THREE.MeshBasicMaterial({ color: '#edb961', transparent: true, depthTest: false, depthWrite: false });
    this.routeGlow = new THREE.MeshBasicMaterial({ color: '#e7b35c', transparent: true, opacity: .14, depthTest: false, depthWrite: false });
    this.subscriberMaterial = new THREE.MeshBasicMaterial({ color: '#85dcf3', depthTest: false, depthWrite: false });
    this.segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.dotGeometry = new THREE.SphereGeometry(1, 8, 6);
    this.dotMaterial = new THREE.MeshBasicMaterial({ color: '#fff4c6', depthTest: false, depthWrite: false });
    this.routeLines = []; this.routeDots = []; this.routeNodes = []; this.routeKey = '';
    this.overviewMode = 'route'; this.overviewLook = new THREE.Vector3(); this.overviewStarted = false;
    this.initialBounds = boundsOf([SOURCE_POSITION, [-3, 0, 80], [26, 7, 120]], 9);
    this.callBounds = this.initialBounds;
    this.overlay = document.getElementById('overview-labels');
    batch(this.scene);
    this.cameras = {
      source: new THREE.PerspectiveCamera(39, 1, .05, 10000),
      follow: new THREE.PerspectiveCamera(42, 1, .05, 10000),
      overview: new THREE.PerspectiveCamera(38, 1, .5, 10000),
    };
    const p = this.source.root.position;
    this.sourceLook = p.clone().add(V(0, .25, 0));
    this.cameras.source.position.copy(p).add(V(0, 4.8, 4.35)); this.cameras.source.lookAt(this.sourceLook);
    this.finderSite = selectorSite(0, SOURCE.slice(0, 4));
    const finder = new THREE.Vector3(...this.finderSite.position);
    this.cameras.follow.position.copy(finder).add(V(2.45, 2.05, 4.55)); this.followLook = finder.clone().add(V(0, 1.16, .1));
    this.cameraFocus = `0/${this.finderSite.id}`; this.flight = null;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.width = 0; this.height = 0;
  }
  setOverviewMode(mode) { this.overviewMode = mode; }
  focusFor(engine) {
    if (engine.focus === 'release') {
      const view = releaseBlockView(engine.release.prefix);
      const frame = overviewFrame(view.bounds, this.cameras.follow.aspect, this.cameras.follow.fov);
      return { position: new THREE.Vector3(...frame.position), target: new THREE.Vector3(...frame.target) };
    }
    if (engine.focus === 'external') {
      const p = new THREE.Vector3(...EXTERNAL_GATE_POSITION);
      return { position: p.clone().add(V(1, 4.5, 19)), target: p.clone().add(V(0, .5, 0)) };
    }
    if (engine.focus === 'target' && this.target) return this.target.view(this.cameras.follow.aspect);
    if (engine.focus === 'source') {
      const p = this.source.root.position;
      return { position: p.clone().add(V(.7, 4, 5)), target: p.clone().add(V(0, .4, 0)) };
    }
    if (engine.focus === 'tape') {
      const p = this.tapes[engine.target.tape].root.position;
      return { position: p.clone().add(V(.55, 2.45, 6.55)), target: p.clone().add(V(0, 1.35, .15)) };
    }
    const p = this.devices[engine.focus].group.position;
    return { position: p.clone().add(V(2.45, 2.05, 4.55)), target: p.clone().add(V(0, 1.16, .1)) };
  }
  route(engine) {
    const key = `${engine.selectors.map(s => s?.held ? s.key : '-').join('|')}/${engine.state === 'connected'}/${['ringing', 'connected', 'external'].includes(engine.state)}/${engine.target?.number || ''}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.routeGroup.clear(); this.routeLines = []; this.routeDots = []; this.routeNodes = [];
    this.overlay?.replaceChildren();
    this.leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.leaders.classList.add('map-leaders'); this.overlay?.append(this.leaders);
    const held = engine.selectors.filter(s => s?.held);
    const sites = held.map(s => selectorSite(s.stage, s.prefix, s.slot));
    this.office.setHeld(sites, engine.state === 'connected');
    const color = engine.state === 'connected' ? '#a0e3bf' : '#edb961';
    this.routeMaterial.color.set(color); this.routeGlow.color.set(color);
    const nodes = [{ point: this.source.root.position.clone().add(V(0, .3, 0)), label: `☎ Quelle ${SOURCE}`, important: true }];
    if (!held.length) { this.mapLabel(nodes[0]); this.routeNodes = nodes; return; }
    for (const site of sites) nodes.push({ point: new THREE.Vector3(...site.position).add(V(0, 1.2, 1)), label: site.label, important: site.stage === 5 });
    const endpoint = ['ringing', 'connected'].includes(engine.state);
    const subscriberStart = endpoint ? nodes.length : Infinity;
    if (endpoint) nodes.push({ point: new THREE.Vector3(...subscriberHandoff(engine.target.number, engine.selectors[5].slot)), label: 'Steigleitung ↑ OG', subscriber: true, upper: true });
    if (endpoint && !engine.target.tape) nodes.push({ point: this.target.root.position.clone(), label: 'Teilnehmerleitung · OG', subscriber: true, upper: true });
    if (['ringing', 'connected'].includes(engine.state)) nodes.push({
      point: engine.target?.tape ? this.tapes[engine.target.tape].endpoint.clone() : this.target.endpoint,
      label: engine.target.tape ? `◉ ${engine.target.name} · OG` : `☎ Ziel ${engine.target.number} · OG`, important: true, subscriber: true, upper: true,
    });
    if (engine.state === 'external') nodes.push({ point: new THREE.Vector3(...EXTERNAL_GATE_POSITION), label: '← 0 · Fernamt (außerhalb)', important: true });
    const points = [nodes[0].point.clone()];
    const lineTypes = [false];
    for (let i = 1; i < nodes.length; i++) {
      // Direct tracing avoids descending and climbing the same device twice,
      // which looked like a reversal in the overview's compressed perspective.
      points.push(nodes[i].point.clone());
      lineTypes.push(i >= subscriberStart);
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = a.distanceTo(b); if (length < .001) continue;
      for (const glow of [true, false]) {
        const line = mesh(this.routeGroup, this.segmentGeometry, glow ? this.routeGlow : lineTypes[i] ? this.subscriberMaterial : this.routeMaterial);
        line.position.copy(a).add(b).multiplyScalar(.5);
        line.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
        line.userData = { length, glow, subscriber: lineTypes[i] }; line.layers.set(2); line.renderOrder = glow ? 7 : 8; this.routeLines.push(line);
      }
    }
    this.routePath = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++) this.routePath.add(new THREE.LineCurve3(points[i - 1], points[i]));
    for (let i = 0; i < 12; i++) {
      const dot = mesh(this.routeGroup, this.dotGeometry, this.dotMaterial); dot.layers.set(2); dot.renderOrder = 9; this.routeDots.push(dot);
    }
    for (const tape of Object.values(this.tapes)) if (tape.descriptor.id !== engine.target?.tape) nodes.push({
      point: tape.endpoint.clone(), label: `${tape.descriptor.short} · ${tape.descriptor.label}`, upper: true, subscriber: true,
    });
    nodes.forEach(node => this.mapLabel(node));
    this.routeNodes = nodes;
    this.callBounds = unionBounds(this.callBounds, boundsOf(points.filter(p => p.y < UPPER_FLOOR_Y).map(p => p.toArray()), 12));
  }
  mapLabel(node) {
    const element = document.createElement('span'); element.className = `map-label${node.important ? ' endpoint-label' : ''}${node.subscriber ? ' subscriber-label' : ''}`;
    element.textContent = node.label; this.overlay?.append(element); node.element = element;
    node.leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    node.anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    node.leader.setAttribute('stroke', node.subscriber ? '#85dcf3' : '#d4bc89');
    node.anchor.setAttribute('fill', node.subscriber ? '#85dcf3' : '#d4bc89');
    node.anchor.setAttribute('r', node.important ? '3' : '2');
    this.leaders.append(node.leader, node.anchor);
  }
  update(engine, dt, dragAngle = null) {
    this.dt = dt;
    this.releaseView = engine.focus === 'release';
    if (upperFloorRequested(engine) && this.floorTransition.elapsed === 0) {
      this.floorShot = { position: this.cameras.overview.position.clone(), target: this.overviewLook.clone() };
    }
    this.floorTransition.update(upperFloorRequested(engine), dt);
    if (this.floorTransition.elapsed === 0) this.floorShot = null;
    this.overviewSection.dataset.floor = this.floorTransition.phase;
    this.hallGuide.update(engine);
    const floorLabel = document.getElementById('floor-label');
    floorLabel.hidden = this.floorTransition.elapsed === 0;
    floorLabel.textContent = this.floorTransition.reveal > 0 ? 'OG · TEILNEHMER & ANSAGEDIENSTE'
      : engine.offHook ? 'WÄHLERSAAL SENKT SICH · OBERE ETAGE FOLGT' : 'ZURÜCK ZUM WÄHLERSAAL';
    const blend = 1 - Math.exp(-dt * 16);
    for (const d of this.devices) {
      const state = engine.selectors[d.stage], active = !!state?.held;
      if (active) {
        d.site = selectorSite(state.stage, state.prefix, state.slot);
        d.group.position.fromArray(d.site.position);
      } else {
        d.site = d.stage === 0 ? this.finderSite : null;
        if (d.site) d.group.position.fromArray(d.site.position);
      }
      const y = active ? state.level * .045 : 0;
      const angle = active && state.rotary ? Math.PI * -.1 + (state.rotary - .5) / 10 * Math.PI * 1.2 : -.70;
      const mechanismBlend = d.stage === 0 && engine.state === 'finding' ? 1 - Math.exp(-dt * 90) : blend;
      d.y += (y - d.y) * mechanismBlend; d.angle += (angle - d.angle) * mechanismBlend;
      d.carriage.position.y = d.y; d.wipers.rotation.y = d.angle;
      d.lamp.material.color.set(active ? engine.state === 'connected' ? '#a4ddb4' : '#e9bd6c' : '#514b31');
      d.lamp.material.emissive.set(active ? '#93632a' : '#000000');
      if (active) {
        const text = `${STAGES[d.stage].short} ${state.prefix || 'AMT'} / ${state.slot + 1}`;
        if (text !== d.lastLabel) { d.tag.material = labelMaterial(text); d.lastLabel = text; }
      }
    }
    const destination = /^[1-9]\d{5}$/.test(engine.digits) ? engine.target || resolveNumber(engine.digits) : null;
    if (destination && !destination.tape && this.targetNumber !== destination.number) {
      this.target?.dispose(); this.targetNumber = destination.number;
      this.target = makeSubscriber(this.upperFloor, subscriberAppearance(destination.number), targetPosition(destination.number));
    } else if ((!destination || destination.tape) && this.target) {
      this.target.dispose(); this.target = null; this.targetNumber = null;
    }
    this.subscriberActive = ['ringing', 'connected'].includes(engine.state);
    for (const [phone, up] of [[this.source, engine.offHook]]) {
      phone.pickup += ((up ? 1 : 0) - phone.pickup) * blend;
      phone.handset.position.set(-phone.pickup * .18, .91 + phone.pickup * .55, -.46 - phone.pickup * .10);
      phone.handset.rotation.z = phone.pickup * .2;
    }
    this.target?.update(engine.targetOffHook, engine.state === 'ringing' && engine.target?.kind === 'phone', engine.time, dt);
    for (const [id, tape] of Object.entries(this.tapes)) {
      const selected = engine.target?.tape === id;
      const running = selected && engine.tapeRunning;
      const waiting = selected && engine.state === 'ringing';
      if (running) {
        const t = engine.playbackSeconds;
        tape.reels[0].rotation.z = -t * 1.7; tape.reels[1].rotation.z = -t * 1.9;
        tape.splice.position.copy(tape.tapePath.getPoint((t * .20) % 1));
        tape.meter.rotation.z = -.5 + .35 * Math.sin(t * 8) + .12 * Math.sin(t * 23);
      } else tape.meter.rotation.z = -.7;
      const state = running ? `LÄUFT · ${engine.target.name.toUpperCase()}` : waiting ? 'STARTET …' : 'BEREIT';
      if (state !== tape.state) {
        tape.state = state; tape.status.material = labelMaterial(state, running ? '#a0e3bf' : '#d6c9a8', '#29302a', 27);
        tape.lamp.material.color.set(running ? '#a0e3bf' : waiting ? '#edb961' : '#534d36');
        tape.lamp.material.emissive.set(running ? '#3f9366' : waiting ? '#93632a' : '#000000');
      }
    }
    this.source.wheel.rotation.y = -(dragAngle === null ? engine.dialAngle : dragAngle);

    const focusKey = `${engine.focus}/${typeof engine.focus === 'number' ? engine.selectors[engine.focus]?.key ?? (engine.focus === 0 ? this.finderSite.id : '') : engine.focus === 'release' ? engine.release.prefix : engine.target?.number || ''}`;
    if (focusKey !== this.cameraFocus) {
      this.cameraFocus = focusKey; const shot = this.focusFor(engine), from = this.cameras.follow.position.clone();
      this.flight = { from, lookFrom: this.followLook.clone(), to: shot.position, lookTo: shot.target,
        elapsed: 0, duration: CAMERA_TRAVEL_SECONDS, height: Math.min(90, from.distanceTo(shot.position) * .20) };
    }
    if (this.flight) {
      const f = this.flight; f.elapsed = Math.min(f.duration, f.elapsed + dt);
      const t = f.elapsed / f.duration, ease = t * t * (3 - 2 * t);
      this.cameras.follow.position.lerpVectors(f.from, f.to, ease);
      this.cameras.follow.position.y += Math.sin(t * Math.PI) * f.height;
      this.followLook.lerpVectors(f.lookFrom, f.lookTo, ease);
      if (t === 1) this.flight = null;
    }
    this.cameras.follow.lookAt(this.followLook);
    this.route(engine);
    if (engine.state === 'idle') this.callBounds = this.initialBounds;
    this.routeDots.forEach((dot, i) => dot.position.copy(this.routePath.getPoint((engine.time * .13 + i / 12) % 1)));
  }
  updateOverview(camera) {
    const { descent, reveal } = this.floorTransition;
    let frameBounds = this.overviewMode === 'whole' ? WHOLE_OFFICE_BOUNDS : this.callBounds;
    if (this.office.addressBounds && this.overviewMode !== 'whole') frameBounds = unionBounds(frameBounds, this.office.addressBounds);
    if (descent > 0) frameBounds = unionBounds(frameBounds, boundsOf([
      ...Object.values(this.tapes).map(tape => tape.endpoint.toArray()),
      ...(this.target ? [this.target.root.position.toArray()] : []),
    ], 15));
    const frame = overviewFrame(frameBounds, camera.aspect, camera.fov);
    const shift = descent * Math.max(UPPER_FLOOR_Y * .35, frame.distance * .085);
    frame.position[1] += shift; frame.target[1] += shift;
    // View controls also work while the switching mechanism is paused.
    const blend = this.overviewStarted ? 1 - Math.exp(-Math.max(this.dt, 1 / 60) * 3) : 1;
    if (this.floorShot) {
      // Complete the camera move before the reveal starts; a second smoothing
      // filter here would let the floor appear while the hall was still moving.
      camera.position.lerpVectors(this.floorShot.position, new THREE.Vector3(...frame.position), descent);
      this.overviewLook.lerpVectors(this.floorShot.target, new THREE.Vector3(...frame.target), descent);
    } else {
      camera.position.lerp(new THREE.Vector3(...frame.position), blend);
      this.overviewLook.lerp(new THREE.Vector3(...frame.target), blend);
    }
    camera.lookAt(this.overviewLook); camera.updateMatrixWorld();
    this.overviewStarted = true;
    this.routeMaterial.opacity = 1 - reveal * .8;
    const radius = Math.max(.035, camera.position.distanceTo(this.overviewLook) * .00125);
    for (const line of this.routeLines) {
      const r = radius * (line.userData.glow ? 3.5 : line.userData.subscriber ? 1.65 : 1);
      line.scale.set(r, line.userData.length, r);
      line.visible = !line.userData.subscriber || reveal > .1;
    }
    this.routeDots.forEach(dot => {
      dot.scale.setScalar(radius * 2);
      dot.visible = dot.position.y < UPPER_FLOOR_Y - 1 || reveal > .2;
    });
    const rect = this.viewElements.overview.getBoundingClientRect();
    const occupied = this.overviewMode === 'whole' || this.office.address ? this.office.coordinateObstacles(camera, rect) : [];
    const priority = [...this.routeNodes].reverse().sort((a, b) => Number(!!b.important) - Number(!!a.important));
    for (const node of priority) if (node.element) {
      const p = node.point.clone().project(camera), w = Math.min(190, node.label.length * 6 + 18), h = 21;
      const px = (p.x + 1) / 2 * rect.width, py = (1 - p.y) / 2 * rect.height;
      // Place labels to either side before changing height. Leader lines keep
      // their attachment unambiguous when the full hall compresses the entry.
      const candidates = [[px + 9, py - 10], [px - w - 9, py - 10], [px + 9, py - 35], [px - w - 9, py + 16],
        [px + 9, py + 40], [px - w - 9, py - 65], [px + 9, py + 65], [px - w - 9, py - 90]];
      const placement = candidates.map(([x, y]) => ({ x: Math.max(8, Math.min(rect.width - w - 8, x)), y: Math.max(reveal > 0 ? 128 : this.subscriberActive ? 100 : 64, Math.min(rect.height - 60, y)) }))
        .find(a => !occupied.some(b => a.x < b.x + b.w + 4 && a.x + w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + h + 3 > b.y));
      const visible = !!placement && p.z > -1 && p.z < 1 && (!node.upper || reveal > .2);
      node.element.hidden = !visible;
      node.element.style.opacity = node.upper ? reveal : 1 - reveal * .7;
      node.leader.style.display = node.anchor.style.display = visible ? '' : 'none';
      if (visible) {
        const { x, y } = placement; node.element.style.transform = `translate(${x}px,${y}px)`; occupied.push({ x, y, w, h });
        for (const [key, value] of Object.entries({ x1: px, y1: py, x2: px < x ? x : Math.min(x + w, px), y2: y + h / 2 })) node.leader.setAttribute(key, value);
        node.anchor.setAttribute('cx', px); node.anchor.setAttribute('cy', py);
      }
    }
    this.hallGuide.project(camera, rect);
  }
  render() {
    const bounds = this.canvas.getBoundingClientRect();
    if (this.width !== bounds.width || this.height !== bounds.height) {
      this.width = bounds.width; this.height = bounds.height; this.renderer.setSize(bounds.width, bounds.height, false);
    }
    this.renderer.setScissorTest(false); this.renderer.setClearColor('#101716'); this.renderer.clear(); this.renderer.setScissorTest(true);
    for (const [name, element] of Object.entries(this.viewElements)) {
      const r = element.getBoundingClientRect(), camera = this.cameras[name];
      this.renderer.setViewport(r.left - bounds.left, bounds.bottom - r.bottom, r.width, r.height);
      this.renderer.setScissor(r.left - bounds.left, bounds.bottom - r.bottom, r.width, r.height);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
      if (name === 'overview') this.updateOverview(camera);
      this.routeGroup.visible = name === 'overview';
      this.upperFloor.visible = this.floorTransition.reveal > 0 && (name === 'overview' || (name === 'follow' && !this.releaseView));
      const wide = name === 'overview' || (name === 'follow' && this.releaseView);
      this.scene.fog.density = wide ? .00006 : .014;
      this.office.prepare(camera, wide, name === 'overview' && (this.overviewMode === 'whole' || !!this.office.address));
      for (const d of this.devices) d.group.visible = !!d.site && camera.position.distanceTo(d.group.position) < 135;
      camera.layers.set(0); camera.layers.enable(1); camera.layers.enable(2);
      if (name === 'overview' && this.floorTransition.reveal > 0) {
        this.frostedView.render(this.renderer, this.scene, camera,
          [r.left - bounds.left, bounds.bottom - r.bottom, r.width, r.height], this.floorTransition.reveal);
      } else this.renderer.render(this.scene, camera);
    }
  }
  pick(viewName, clientX, clientY) {
    const r = this.viewElements[viewName].getBoundingClientRect();
    this.pointer.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    this.raycaster.layers.set(viewName === 'follow' ? 1 : 0);
    this.raycaster.setFromCamera(this.pointer, this.cameras[viewName]);
    const phone = viewName === 'source' ? this.source : this.target;
    if (!phone) return null;
    const hits = this.raycaster.intersectObjects([phone.handsetHit, ...phone.dialHits], false);
    return hits[0]?.object.userData || null;
  }
  dialPointerAngle(clientX, clientY) {
    const camera = this.cameras.source, r = this.viewElements.source.getBoundingClientRect();
    this.pointer.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, camera);
    const normal = V(0, 1, 0).transformDirection(this.source.dialMount.matrixWorld);
    const center = this.source.dialMount.getWorldPosition(V(0, 0, 0));
    const point = this.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center), V(0, 0, 0));
    if (!point) return null;
    this.source.dialMount.worldToLocal(point); return Math.atan2(point.z, point.x);
  }
}
