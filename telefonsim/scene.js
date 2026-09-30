import * as THREE from '../pinsim/three.module.min.js';
import { STAGES } from './engine.mjs';

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

function makeSelector(parent, stage, row) {
  const group = new THREE.Group(); group.position.set((stage - 2.5) * 2.48, .42 + row * 2.55, 0); parent.add(group);
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
  const tag = plaque(group, `${STAGES[stage].short} / ${String(row + 1).padStart(2, '0')}`, 0, .07, .82, 1.05, .20);
  tag.userData.dynamic = true;
  return { group, carriage, wipers, lamp, tag, stage, row, y: 0, angle: -.70, boundKey: '', lastLabel: '' };
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
  const nameTag = plaque(root, number === '010001' ? 'TEILNEHMER 010001' : 'ZIELANSCHLUSS', 0, -.05, 1.18, 1.8, .22);
  nameTag.userData.dynamic = true;
  return { root, handset, handsetHit, dialMount, wheel, dialHits, nameTag, pickup: 0 };
}

export class ExchangeScene {
  constructor(canvas, viewElements) {
    this.canvas = canvas; this.viewElements = viewElements;
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
    box(this.scene, 65, .15, 50, mat('#222d25', .15, .83), 0, -1.79, 0);
    box(this.scene, 45, 19, .16, mat('#2c382e', .15, .9), 0, 6, -5.5);
    for (let i = -4; i <= 4; i++) box(this.scene, .016, .005, 34, mat('#3e483c', .1), i * 4, -1.707, 0);
    const rack = new THREE.Group(); this.scene.add(rack);
    for (let col = 0; col <= 6; col++) {
      const x = (col - 3) * 2.48;
      box(rack, .12, 8.9, .14, enamel, x, 3.65, .94);
      box(rack, .12, 8.9, .14, enamel, x, 3.65, -.84);
      for (const y of [-.65, 8.02]) box(rack, .18, .14, 1.95, enamel, x, y, .05);
    }
    for (const y of [.34, 2.9, 5.45, 8.0]) { box(rack, 15.05, .15, 1.93, enamel, 0, y, .06); }
    box(rack, 15.2, .30, 2.1, enamel, 0, -.67, .05);
    for (let i = 0; i < 6; i++) {
      plaque(rack, STAGES[i].short, (i - 2.5) * 2.48, 8.38, .98, 1.8, .36);
      for (let j = 0; j < 6; j++) tube(rack, [V((i - 2.5) * 2.48 + j * .10, -.45, .4), V((i - 2.5) * 2.48 + j * .11, -.19, 1.03), V((i - 2.5) * 2.48 + .7, .26, .74)], .024, j % 2 ? cloth : dark, 10);
    }
    this.devices = Array.from({ length: 6 }, (_, stage) => Array.from({ length: 3 }, (_, row) => makeSelector(rack, stage, row)));
    // Cable combs behind each bay, like the cotton-wrapped bundles in the references.
    for (let stage = 0; stage < 6; stage++) for (let wire = 0; wire < 9; wire++) {
      const x = (stage - 2.5) * 2.48 + wire * .065 - .27;
      tube(rack, [V(x, -.5, -.8), V(x + .3, 1.2, -.85), V(x + .25, 4.5, -.85), V(x, 7.95, -.7)], .021, wire % 3 ? cloth : tealWire, 15);
    }
    this.source = makePhone(this.scene, V(-11, -.10, 5.4), 'black', '010001');
    this.target = makePhone(this.scene, V(11, -.10, 5.4), 'cream', 'ZIEL');
    this.routeGroup = new THREE.Group(); this.routeGroup.userData.dynamic = true; this.scene.add(this.routeGroup);
    this.routeMaterial = new THREE.MeshBasicMaterial({ color: '#edb961', transparent: true, opacity: .93, depthTest: false });
    this.routeGlow = new THREE.MeshBasicMaterial({ color: '#e7b35c', transparent: true, opacity: .10, depthTest: false, depthWrite: false });
    this.routeDots = [];
    const lampGeo = new THREE.SphereGeometry(.065, 8, 6);
    for (let i = 0; i < 10; i++) {
      const dot = mesh(this.routeGroup, lampGeo, new THREE.MeshBasicMaterial({ color: '#fff4c6', depthTest: false }));
      dot.renderOrder = 9; dot.visible = false; this.routeDots.push(dot);
    }
    this.routeLines = []; this.routePoints = []; this.routeKey = '';
    batch(this.scene);
    this.cameras = {
      source: new THREE.PerspectiveCamera(39, 1, .05, 140),
      follow: new THREE.PerspectiveCamera(42, 1, .05, 140),
      overview: new THREE.PerspectiveCamera(37, 1, .05, 140),
    };
    this.sourceLook = V(-11, .15, 5.4);
    this.cameras.source.position.set(-11, 4.7, 9.75); this.cameras.source.lookAt(this.sourceLook);
    this.cameras.follow.position.set(-10, 3.8, 10.4); this.followLook = this.sourceLook.clone();
    this.goalPosition = this.cameras.follow.position.clone(); this.goalLook = this.followLook.clone(); this.cameraFocus = '';
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.width = 0; this.height = 0;
  }
  focusFor(engine) {
    if (engine.focus === 'source') return { position: V(-10, 3.8, 10.4), target: V(-11, .3, 5.4) };
    if (engine.focus === 'target') return { position: V(11.6, 3.9, 10.4), target: V(11, .3, 5.4) };
    const selector = engine.selectors[engine.focus];
    const device = this.devices[engine.focus][selector?.row ?? 1];
    const p = device.group.position;
    return { position: V(p.x + 2.45, p.y + 2.05, 4.55), target: V(p.x, p.y + 1.16, .1) };
  }
  route(engine) {
    const key = `${engine.selectors.map(s => s?.held ? s.key : '-').join('|')}/${engine.state === 'connected'}/${['ringing', 'connected'].includes(engine.state)}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    for (const line of this.routeLines) { line.geometry.dispose(); line.removeFromParent(); }
    this.routeLines = []; this.routePoints = [];
    const held = engine.selectors.filter(s => s?.held);
    const color = engine.state === 'connected' ? '#a0e3bf' : '#edb961';
    this.routeMaterial.color.set(color); this.routeGlow.color.set(color);
    if (!held.length) return;
    const points = [V(-11, .1, 5.4), V(-9, -.1, 1.3)];
    for (const s of held) {
      const d = this.devices[s.stage][s.row].group.position;
      points.push(V(d.x - .65, d.y + .23, 1.07), V(d.x, d.y + 1.15, 1.08), V(d.x + .7, d.y + .23, 1.07));
    }
    if (['ringing', 'connected'].includes(engine.state)) points.push(V(9, -.1, 1.3), V(11, .1, 5.4));
    const path = new THREE.CatmullRomCurve3(points, false, 'centripetal', .1);
    for (const [r, m] of [[.024, this.routeMaterial], [.078, this.routeGlow]]) {
      const line = mesh(this.routeGroup, new THREE.TubeGeometry(path, points.length * 10, r, 5, false), m);
      line.renderOrder = 8; this.routeLines.push(line);
    }
    this.routePath = path; this.routePoints = points;
  }
  update(engine, dt, dragAngle = null) {
    const blend = 1 - Math.exp(-dt * 16);
    for (const stages of this.devices) for (const d of stages) {
      const state = engine.selectors[d.stage], active = state?.row === d.row && state.held;
      const y = active ? state.level * .045 : 0;
      // Shaft motion and rotary wipers are separate, so the last selector can
      // retain its level while responding to the final pulse train.
      const angle = active && state.rotary ? Math.PI * -.1 + (state.rotary - .5) / 10 * Math.PI * 1.2 : -.70;
      d.y += (y - d.y) * blend; d.angle += (angle - d.angle) * blend;
      d.carriage.position.y = d.y; d.wipers.rotation.y = d.angle;
      d.lamp.material.color.set(active ? engine.state === 'connected' ? '#a4ddb4' : '#e9bd6c' : '#514b31');
      d.lamp.material.emissive.set(active ? '#93632a' : '#000000');
      if (active) {
        const text = state.stage === 0 ? 'AS · 010001' : `${STAGES[d.stage].short} ${state.prefix || 'AMT'}${state.prefix ? '…' : ''}`;
        if (text !== d.lastLabel) { d.tag.material = labelMaterial(text); d.lastLabel = text; }
      }
    }
    for (const [phone, up] of [[this.source, engine.offHook], [this.target, engine.targetOffHook]]) {
      phone.pickup += ((up ? 1 : 0) - phone.pickup) * blend;
      phone.handset.position.set(-phone.pickup * .18, .91 + phone.pickup * .55, -.46 - phone.pickup * .10);
      phone.handset.rotation.z = phone.pickup * .2;
    }
    if (engine.state === 'ringing') this.target.handset.rotation.z = Math.sin(engine.time * 48) * .025 * (engine.time % 3 < 1 ? 1 : 0);
    this.source.wheel.rotation.y = -(dragAngle === null ? engine.dialAngle : dragAngle);
    const focusKey = `${engine.focus}/${typeof engine.focus === 'number' ? engine.selectors[engine.focus]?.row : ''}`;
    if (focusKey !== this.cameraFocus) {
      this.cameraFocus = focusKey; const shot = this.focusFor(engine);
      this.goalPosition.copy(shot.position); this.goalLook.copy(shot.target);
    }
    const cameraBlend = 1 - Math.exp(-dt * 4.5);
    this.cameras.follow.position.lerp(this.goalPosition, cameraBlend); this.followLook.lerp(this.goalLook, cameraBlend);
    this.cameras.follow.lookAt(this.followLook);
    if (engine.target && this.targetNumber !== engine.target.number) {
      this.targetNumber = engine.target.number;
      this.target.nameTag.material = labelMaterial(`${engine.target.number} · ${engine.target.kind === 'phone' ? 'TEILNEHMER' : 'ANSCHLUSS'}`, '#e5dab8', '#29302a', 29);
    }
    this.route(engine);
    this.routeDots.forEach((dot, i) => {
      dot.visible = !!this.routePoints.length;
      if (dot.visible) dot.position.copy(this.routePath.getPoint((engine.time * .13 + i / 10) % 1));
    });
  }
  render() {
    const bounds = this.canvas.getBoundingClientRect();
    if (this.width !== bounds.width || this.height !== bounds.height) {
      this.width = bounds.width; this.height = bounds.height; this.renderer.setSize(bounds.width, bounds.height, false);
    }
    this.renderer.setScissorTest(false); this.renderer.setClearColor('#101716'); this.renderer.clear(); this.renderer.setScissorTest(true);
    for (const [name, element] of Object.entries(this.viewElements)) {
      const r = element.getBoundingClientRect(), camera = this.cameras[name];
      const x = r.left - bounds.left, y = bounds.bottom - r.bottom;
      this.renderer.setViewport(x, y, r.width, r.height); this.renderer.setScissor(x, y, r.width, r.height);
      camera.aspect = r.width / r.height;
      if (name === 'overview') {
        const distance = Math.max(15.6, 24 / camera.aspect);
        camera.position.set(.6, 5.8, distance); camera.lookAt(0, 3.7, 0);
      }
      camera.updateProjectionMatrix();
      // The illuminated overlay is the maintenance view's circuit tracing aid.
      this.routeGroup.visible = name === 'overview';
      this.renderer.render(this.scene, camera);
    }
  }
  pick(viewName, clientX, clientY) {
    const r = this.viewElements[viewName].getBoundingClientRect();
    this.pointer.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.cameras[viewName]);
    const phone = viewName === 'source' ? this.source : this.target;
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
