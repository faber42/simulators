import * as THREE from '../pinsim/three.module.min.js';
import { BREW_GEOMETRY, getBrewMechanics } from './brew-mechanics.mjs';
import { HOPPER_GEOMETRY, getHopperState, getBeanPose } from './bean-hopper.mjs';
import { LAYOUT, brewPoint, servicePose } from './layout.mjs';

// Illustrative cutaway. +y is up and the dispensing face points towards +z.
const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dummy = new THREE.Object3D();
const up = v(0, 1, 0);
function box(parent, mat, size, p) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...p); parent.add(mesh); return mesh;
}
function cylinder(parent, mat, r1, r2, h, p, n = 40, open = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, n, 1, open), mat);
  mesh.position.set(...p); parent.add(mesh); return mesh;
}
function sphere(parent, mat, r, p, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), mat);
  mesh.position.set(...p); mesh.scale.set(...scale); parent.add(mesh); return mesh;
}
function rounded(parent, mat, size, p, radius = .12) {
  const [w, h, d] = size, r = Math.min(radius, w / 2, h / 2);
  const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -d / 2);
  const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...p); parent.add(mesh); return mesh;
}
function rod(parent, mat, a, b, r = .025) {
  const av = v(...a), bv = v(...b), direction = bv.clone().sub(av);
  const mesh = cylinder(parent, mat, r, r, direction.length(), av.add(bv).multiplyScalar(.5).toArray(), 12);
  mesh.quaternion.setFromUnitVectors(up, direction.normalize()); return mesh;
}
function setRod(mesh, a, b) {
  const start = v(...a), end = v(...b), direction = end.clone().sub(start);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
  mesh.scale.y = direction.length();
}
function sidePlate(parent, material, x) {
  // Molded side profile in the y/z plane, with a real opening through it.
  const outline = [[.84,-.35],[-.50,-.35],[-.48,1.30],[-.12,1.30],[.08,.87],[.35,.66],[.86,.62]];
  const shape = new THREE.Shape();
  outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-.64,-.18);hole.lineTo(.31,-.18);hole.lineTo(.30,.57);hole.lineTo(.13,.68);hole.lineTo(-.17,.40);hole.lineTo(-.65,.36);hole.closePath();shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:.074,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.013,bevelThickness:.009});
  geometry.translate(0,0,-.037);geometry.rotateY(Math.PI/2);
  const mesh = new THREE.Mesh(geometry,material);mesh.position.x=x;parent.add(mesh);return mesh;
}
function torus(parent, mat, radius, tube, p, axis = 'y') {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 48), mat);
  if (axis === 'y') mesh.rotation.x = Math.PI / 2;
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  mesh.position.set(...p); parent.add(mesh); return mesh;
}
function pipe(parent, mat, points, radius = .025) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => v(...p)), false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, radius, 8, false), mat);
  parent.add(mesh); return { mesh, curve };
}
function textTexture(lines, background = '#10161b', color = '#fff') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  lines.forEach((line, i) => { ctx.font = `${i === 0 ? '600 80' : '500 48'}px system-ui, sans-serif`; ctx.fillText(line, 512, 135 + i * 105); });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CoffeeScene {
  constructor(canvas) {
    this.canvas = canvas; this.listeners = []; this.flowPaths = []; this.housing = [];
    this.width = 1; this.height = 1; this.cutaway = true; this.exploded = false; this.explodeAmount = 0;
    this.theme = 'light'; this.view = 'overview'; this.labels = true; this.state = {};
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#eee9df');
    this.scene.fog = new THREE.Fog('#eee9df', 17, 35);
    this.camera = new THREE.PerspectiveCamera(35, 1, .06, 60);
    this.target = v(0, 1.98, .05); this.targetGoal = this.target.clone();
    this.orbit = { theta: .57, phi: 1.16, radius: 10.25 }; this.orbitGoal = { ...this.orbit };
    this.makeMaterials(); this.makeStage(); this.makeHousing(); this.makeHopper(); this.makeGrinder();
    this.makeBrewGroup(); this.makeDrive(); this.makeHydraulics(); this.makeMilk(); this.makeCup(); this.makeFlows();
    this.anchorPoints = {
      hopper: v(-.05, 4.05, -.34), grinder: v(...LAYOUT.grinder), brew: v(...brewPoint(0,.58,.16)),
      drive: v(-.63,1.57,-.95), heater: v(-.78,2.60,-1.06), tank: v(.98,2.82,-.75),
      milk: v(-.90, 1.92, 1.69), waste: v(.10,.53,-.52), pump: v(-.72, .75, -.65),
      wiper:v(), lowerSieve:v(), linkage:v()
    };
    this.bindControls(); this.setCutaway(true); this.resize(); this.updateCamera(1); this.update({}, 0);
  }

  makeMaterials() {
    const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .12, ...extra });
    this.mat = {
      charcoal: material('#22282a', { roughness: .30, metalness: .28 }),
      black: material('#172023', { roughness: .47 }), frame: material('#344248', { roughness: .39 }),
      chrome: material('#d0dbdf', { roughness: .22, metalness: .85 }), steel: material('#96aaad', { roughness: .36, metalness: .72 }),
      yellow: material('#f2cb37', { roughness: .40 }), red: material('#c84327', { roughness: .50 }),
      bean: material('#4f291c', { roughness: .72 }), seam: material('#251b15', { roughness: .84 }),
      coffee: material('#7b411f', { roughness: .42 }), grounds: material('#573021', { roughness: .96 }),
      milk: material('#fff1ce', { roughness: .36 }), foam: material('#fff8e9', { roughness: .9 }),
      glass: material('#c9e6e3', { transparent: true, opacity: .17, depthWrite: false, roughness: .12, metalness: .06, side: THREE.DoubleSide }),
      water: material('#449ccd', { transparent: true, opacity: .42, depthWrite: false, roughness: .12 }),
      blue: material('#439cce', { emissive: '#439cce', emissiveIntensity: .13 }),
      hot: material('#f5a258', { emissive: '#ed8435', emissiveIntensity: .20 }),
      steam: material('#b5eeed', { emissive: '#b5eeed', emissiveIntensity: .25 }),
      heat: material('#cf7c48', { metalness: .65, emissive: '#ed762c', emissiveIntensity: .10 }),
      clearBrew: material('#798a89', { transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide }),
      cream: material('#d39956', { roughness: .55 }), drain: material('#867e70', { roughness: .7 }),
    };
  }

  makeStage() {
    this.scene.add(new THREE.HemisphereLight('#fff7e8', '#aab7b7', 2.0));
    const light = new THREE.DirectionalLight('#fff4df', 3.8); light.position.set(-4, 8, 7); light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: .1, far: 20 });
    light.shadow.normalBias = .03; light.shadow.intensity = .25; this.scene.add(light);
    const fill = new THREE.DirectionalLight('#d4eaff', 2.0); fill.position.set(5, 4, -3); this.scene.add(fill);
    const front = new THREE.DirectionalLight('#ffffff', .75); front.position.set(1, 3, 7); this.scene.add(front);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#e6e0d4', roughness: .9 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -.095; this.floor.receiveShadow = true; this.scene.add(this.floor);
    this.plinth = rounded(this.scene, new THREE.MeshStandardMaterial({ color: '#dcd6ca', roughness: .75 }), [3.45, .075, 4.25], [0, -.052, .16], .16);
    this.plinth.receiveShadow = true;
    this.machine = new THREE.Group(); this.scene.add(this.machine);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.563, 100), new THREE.MeshBasicMaterial({ color: '#c9bdab', transparent: true, opacity: .5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -.009; this.scene.add(ring); this.stageRing = ring;
  }

  makeHousing() {
    const m = this.mat, body = this.machine;
    const shell = m.charcoal.clone(); this.housing.push({ mat: shell, opacity: .055 });
    const steelShell = m.chrome.clone(); this.housing.push({ mat: steelShell, opacity: .085 });
    rounded(body, shell, [.105, 3.53, 3.0], [-1.26, 1.96, -.14], .035);
    rounded(body, shell, [.105, 3.53, 3.0], [1.26, 1.96, -.14], .035);
    rounded(body, shell, [2.54, 3.58, .11], [0, 1.95, -1.65], .20);
    rounded(body, shell, [2.55, .18, 2.97], [0, 3.75, -.13], .05);
    rounded(body, shell, [2.56, .32, 3.2], [0, .16, -.02], .13);
    // Preserve the appliance silhouette; hide foreground edges in the detail view.
    this.housingEdges=new THREE.Group();body.add(this.housingEdges);
    [-1.26, 1.26].forEach(x => {
      rod(this.housingEdges, m.charcoal, [x, .28, -1.59], [x, 3.56, -1.59], .036);
      rod(this.housingEdges, m.chrome, [x, .26, 1.29], [x, 2.79, 1.29], .035);
      rod(this.housingEdges, m.charcoal, [x, 3.73, -1.53], [x, 3.73, 1.28], .036);
      for (let i = 0; i < 8; i++) {
        const vent = box(body, shell, [.013, .09, .19], [x + Math.sign(x) * .059, 3.33, -.96 + i * .25]);
        vent.rotation.x = .42;
      }
    });
    const backplate = rounded(body, steelShell, [2.33, 2.50, .07], [0, 1.53, .82], .20); backplate.receiveShadow = true;
    this.front = new THREE.Group(); this.front.position.set(0, 3.23, 1.25); this.front.rotation.x = -.12; body.add(this.front);
    rounded(this.front, steelShell, [2.72, 1.06, .20], [0, 0, 0], .17);
    rounded(this.front, shell, [2.63, .96, .22], [0, .008, .012], .15);
    this.displayMat = new THREE.MeshBasicMaterial({ map: this.makeDisplayTexture(), transparent: true, opacity: .94 });
    this.housing.push({ mat: this.displayMat, opacity: .36 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.34, .70), this.displayMat); panel.position.set(0, .015, .129); this.front.add(panel);
    // Center coffee dispenser has two real coffee outlets; milk has its own outlet.
    this.spout = new THREE.Group(); this.spout.position.set(.06, 2.56, 1.36); body.add(this.spout);
    rounded(this.spout, m.charcoal, [.56, .63, .40], [0, 0, 0], .08);
    [-.26, .26].forEach(x => box(this.spout, m.chrome, [.046, .57, .41], [x, .005, .015]));
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(.33, .115), new THREE.MeshBasicMaterial({ map: textTexture(['PHILIPS']), transparent: false }));
    logo.position.set(0, .065, .205); this.spout.add(logo);
    [-.13, .13].forEach(x => cylinder(this.spout, m.chrome, .044, .035, .19, [x, -.35, .07], 24));
    rounded(body, m.charcoal, [2.63, .24, .92], [0, .22, 1.44], .10);
    rounded(body, m.chrome, [2.49, .052, .82], [0, .357, 1.44], .06);
    for (let x = -1.12; x <= 1.12; x += .16) {
      for (let z = 1.14; z <= 1.78; z += .13) cylinder(body, m.black, .021, .021, .004, [x, .386, z], 10);
    }
    // Open top waste drawer, directly beneath the brew group.
    this.waste = new THREE.Group(); this.waste.position.set(...brewPoint(.07,-1.02,.08));this.waste.scale.x=-1;body.add(this.waste);
    this.wasteSkin = m.frame.clone();
    box(this.waste, m.charcoal, [1.02, .085, .85], [0, 0, 0]);
    [[-.49, .30, 0], [.49, .30, 0]].forEach(p => box(this.waste, this.wasteSkin, [.045, .60, .85], p));
    [[0, .30, -.41], [0, .30, .41]].forEach(p => box(this.waste, this.wasteSkin, [1.02, .60, .045], p));
    this.spentMaterials = ['#39271f', '#493025'].map(color => { const mat=m.grounds.clone();mat.color.set(color);return mat; });
    this.spentPuck = cylinder(this.waste, this.spentMaterials[0], .278, .278, .105, [-.07, .10, .04], 36);
    this.spentPuck.visible = false; this.storedPuckMeshes = [this.spentPuck];
  }

  makeDisplayTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 480;
    const c = canvas.getContext('2d'); c.fillStyle = '#11191c'; c.fillRect(0, 0, 1400, 480);
    c.fillStyle = '#edf0e5'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const names = ['Espresso', 'Kaffee', 'Cappuccino', 'Latte macchiato'];
    names.forEach((name, i) => {
      const x = 260 + i * 285;
      c.strokeStyle = '#d0cbb4'; c.lineWidth = 5; c.beginPath(); c.roundRect(x - 25, 67, 50, 61, 8); c.stroke();
      c.fillStyle = i > 1 ? '#e6d0a6' : '#8c5834'; c.fillRect(x - 19, 89, 38, 29);
      c.fillStyle = '#e9ece5'; c.font = '25px sans-serif'; c.fillText(name, x, 169);
    });
    c.strokeStyle = '#3e4646'; c.lineWidth = 2; c.beginPath(); c.moveTo(170, 216); c.lineTo(1290, 216); c.stroke();
    c.fillStyle = '#e7b97a'; c.font = '600 34px sans-serif'; c.fillText('LATTE MACCHIATO', 727, 290);
    c.fillStyle = '#9dabaf'; c.font = '25px sans-serif'; c.fillText('5400 SERIES   •   LatteGo', 727, 351);
    c.strokeStyle = '#c9d0ca'; c.lineWidth = 5; c.beginPath(); c.arc(79, 254, 29, -.98, Math.PI * 2 - 2.17); c.stroke(); c.beginPath(); c.moveTo(79, 214); c.lineTo(79, 252); c.stroke();
    c.fillStyle = '#dbe7d0'; c.beginPath(); c.moveTo(1320, 279); c.lineTo(1320, 329); c.lineTo(1350, 304); c.closePath(); c.fill();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  makeHopper() {
    const m = this.mat, body = this.machine;
    const glass = m.glass.clone(); glass.opacity = .26;
    this.hopper = new THREE.Group();this.hopper.position.set(...HOPPER_GEOMETRY.origin);body.add(this.hopper);
    rounded(this.hopper, glass, [2.24, .40, 1.60], [0, 0, 0], .13);
    this.hopperLidMaterial = m.charcoal.clone();
    rounded(this.hopper, this.hopperLidMaterial, [2.29, .055, 1.66], [0, .230, 0], .025);
    rounded(this.hopper, glass, [2.21, .035, 1.60], [0, .265, 0], .012);
    box(this.hopper, this.hopperLidMaterial, [.70, .05, .55], [0, .299, 0]);
    this.beans = new THREE.InstancedMesh(new THREE.SphereGeometry(.068, 10, 7), m.bean, HOPPER_GEOMETRY.capacity);
    const seam = new THREE.CatmullRomCurve3(Array.from({length:13},(_,i)=>{
      const z=(i/12-.5)*.14;
      return v(Math.sin(i/12*Math.PI*2)*.002,.04352*Math.sqrt(1-(z/.0918)**2)+.0008,z);
    }));
    this.beanGrooves = new THREE.InstancedMesh(new THREE.TubeGeometry(seam,12,.0028,4,false),m.seam,HOPPER_GEOMETRY.capacity);
    this.beans.boundingSphere=new THREE.Sphere(v(.10,-.05,-.17),1.5);
    this.beanGrooves.boundingSphere=this.beans.boundingSphere.clone();
    this.hopper.add(this.beans, this.beanGrooves);
    this.updateHopper({});
    this.beanThroat = cylinder(body, m.glass, .36, .18, .18, [.10,3.76,-.47], 36, true);
  }

  updateHopper(state) {
    const hopper=getHopperState(state);this.hopperState=hopper;
    this.hopper.position.set(...HOPPER_GEOMETRY.origin).add(v(...hopper.position));
    this.hopper.rotation.set(...hopper.rotation);
    this.beans.count=this.beanGrooves.count=hopper.count;
    this.beans.visible=this.beanGrooves.visible=hopper.count>0;
    for(let i=0;i<hopper.count;i++){
      const pose=getBeanPose(i,hopper);
      dummy.position.set(...pose.position);dummy.rotation.set(...pose.rotation);
      dummy.scale.set(...HOPPER_GEOMETRY.beanScale);dummy.updateMatrix();this.beans.setMatrixAt(i,dummy.matrix);
      dummy.scale.set(1,1,1);dummy.updateMatrix();this.beanGrooves.setMatrixAt(i,dummy.matrix);
    }
    this.beans.instanceMatrix.needsUpdate=true;this.beanGrooves.instanceMatrix.needsUpdate=true;
  }

  makeGrinder() {
    const m = this.mat; this.grinder = new THREE.Group(); this.grinder.position.set(...LAYOUT.grinder); this.machine.add(this.grinder);
    const casing = m.glass.clone(); casing.color.set('#849692'); casing.opacity = .26;
    cylinder(this.grinder, casing, .48, .42, .61, [0, .13, 0], 48, true);
    cylinder(this.grinder, m.frame, .40, .40, .09, [0, -.21, 0]);
    torus(this.grinder, m.chrome, .42, .032, [0, .40, 0]);
    this.burr = new THREE.Group(); this.grinder.add(this.burr);
    cylinder(this.burr, m.steel, .095, .30, .35, [0, .10, 0]);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      rod(this.burr, m.chrome, [Math.sin(a) * .105, .25, Math.cos(a) * .105], [Math.sin(a + .26) * .29, -.03, Math.cos(a + .26) * .29], .024);
    }
    cylinder(this.grinder, m.charcoal, .23, .23, .28, [0, -.43, -.02]);
    for (let i = 0; i < 6; i++) torus(this.grinder, m.frame, .235, .011, [0, -.32 - i * .04, -.02]);
    const funnelMat = m.clearBrew.clone(); funnelMat.opacity = .35;
    const [fillX,,fillZ]=brewPoint(0,.15,.60);
    pipe(this.machine, funnelMat, [[fillX,3.15,-.09],[fillX,3.02,.02],[fillX,2.82,fillZ]], .10);
    cylinder(this.machine, funnelMat, .18,.09,.31,[fillX,2.67,fillZ],32,true);
    torus(this.machine,m.frame,.182,.023,[fillX,2.825,fillZ]);
    // The falling dose is visible between the separate grinder and the brew cup.
    this.groundFall = new THREE.InstancedMesh(new THREE.SphereGeometry(.023, 6, 4), m.grounds, 60); this.machine.add(this.groundFall);
    this.fallingBeans = new THREE.InstancedMesh(new THREE.SphereGeometry(.062, 8, 6), m.bean, 12); this.machine.add(this.fallingBeans);
  }

  makeBrewGroup() {
    const m = this.mat;
    this.brewUnit = new THREE.Group(); this.brewUnit.position.set(...LAYOUT.brew);this.brewUnit.scale.x=-1;this.machine.add(this.brewUnit);
    const g = this.brewUnit;
    // Two broad molded cheeks, open inspection windows and reinforcing ribs.
    // Their skin becomes translucent in cutaway, while the molded edges remain.
    this.brewSkin = m.black.clone();
    // Open base frame: the spent puck must fall through, not through a plate.
    [-.50,.50].forEach(x=>rounded(g,m.black,[.10,.13,1.43],[x,-.35,.18],.025));
    [-.49,.85].forEach(z=>rounded(g,m.black,[1.0,.13,.09],[0,-.35,z],.02));
    [-.50,.50].forEach(x=>{
      sidePlate(g,this.brewSkin,x);
      rod(g,m.black,[x,-.27,.80],[x,.51,.80],.04);
      rod(g,m.black,[x,.58,.75],[x,.69,.25],.05);
      rod(g,m.black,[x,.69,.25],[x,1.26,-.18],.047);
      rod(g,m.black,[x,-.27,-.46],[x,1.26,-.46],.045);
      for(let i=0;i<5;i++)box(g,m.frame,[.096,.035,.22],[x,.76+i*.095,-.34]);
      // A fixed L-shaped guide makes the carriage path legible.
      pipe(g,m.steel,[[x*.93,.08,.65],[x*.93,.08,-.12],[x*.93,.72,-.12]],.017);
      for(const [y,z] of [[-.24,.72],[-.24,-.39],[1.20,-.38],[.54,.65]])
        cylinder(g,m.steel,.029,.029,.085,[x,y,z],12).rotation.z=Math.PI/2;
    });
    rounded(g,m.black,[1.12,.14,.47],[0,1.26,-.27],.04);
    for(let i=0;i<5;i++)box(g,m.frame,[.07,.17,.48],[-.40+i*.20,1.25,-.27]);
    rounded(g,m.black,[1.05,.10,.14],[0,.73,-.30],.025);
    this.piston = new THREE.Group(); this.piston.position.set(0, .99, -.12); g.add(this.piston);
    cylinder(this.piston, m.charcoal, .32, .30, .34, [0, 0, 0]);
    cylinder(this.piston, m.steel, .272, .272, .026, [0, -.165, 0]);
    torus(this.piston, m.red, .306, .031, [0, -.10, 0]);
    for (let x = -.16; x <= .16; x += .08) for (let z = -.16; z <= .16; z += .08) {
      if (x * x + z * z < .042) cylinder(this.piston, m.black, .009, .009, .001, [x, -.1785, z], 6);
    }
    rod(g, m.chrome, [0, 1.20, -.12], [0, 1.44, -.12], .032);
    this.chamber = new THREE.Group(); this.chamber.position.set(0, .15, .60); g.add(this.chamber);
    cylinder(this.chamber, m.clearBrew, .33, .295, .38, [0, .085, 0], 48, true);
    // Square loading mouth like the reference unit, with a round chamber below.
    const funnelPositions=[];
    const top=[[-.43,.297,-.37],[.43,.297,-.37],[.43,.297,.37],[-.43,.297,.37]];
    const bottom=[[-.29,.07,-.29],[.29,.07,-.29],[.29,.07,.29],[-.29,.07,.29]];
    for(let i=0;i<4;i++){const j=(i+1)%4;funnelPositions.push(...top[i],...bottom[i],...top[j],...top[j],...bottom[i],...bottom[j]);}
    const funnelGeo=new THREE.BufferGeometry();funnelGeo.setAttribute('position',new THREE.Float32BufferAttribute(funnelPositions,3));funnelGeo.computeVertexNormals();
    this.funnelMaterial=m.black.clone();this.funnelMaterial.side=THREE.DoubleSide;
    this.chamber.add(new THREE.Mesh(funnelGeo,this.funnelMaterial));
    [-.43,.43].forEach(x=>box(this.chamber,m.black,[.055,.025,.795],[x,.297,0]));
    [-.37,.37].forEach(z=>box(this.chamber,m.black,[.805,.025,.055],[0,.297,z]));
    torus(this.chamber,m.steel,.294,.009,[0,.073,0]);
    this.lowerPiston = cylinder(this.chamber, m.steel, .292, .285, .041, [0, -.106, 0]);
    this.lowerStem = cylinder(this.chamber, m.yellow, .10, .10, .15, [0, -.194, 0]);
    this.doseMaterial = m.grounds.clone();
    this.dose = cylinder(this.chamber, this.doseMaterial, .282, .278, 1, [0, -.05, 0], 48);
    this.dose.visible = false;
    this.grainTop = new THREE.InstancedMesh(new THREE.SphereGeometry(.014, 6, 4), m.grounds, 90); this.chamber.add(this.grainTop);
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996, r = Math.sqrt(rand(i * 7)) * .267;
      dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.0, .5 + rand(i), 1.0); dummy.updateMatrix(); this.grainTop.setMatrixAt(i, dummy.matrix);
    }
    // The coupling axis is across the removable unit, aligned with the chassis.
    this.brewAxle=new THREE.Group();this.brewAxle.position.set(.565,-.08,.10);this.brewAxle.rotation.y=Math.PI/2;g.add(this.brewAxle);
    this.brewGear=this.makeGear(this.brewAxle,.265,[0,0,0],m.yellow,18);
    this.crankPin=sphere(g,m.chrome,.046,[.64,.05,.10]);
    this.linkA=cylinder(g,m.yellow,.030,.030,1,[0,0,0],12);
    this.linkB=cylinder(g,m.yellow,.030,.030,1,[0,0,0],12);
    this.elbow=sphere(g,m.chrome,.043,[0,0,0]);
    this.follower=sphere(g,m.yellow,.049,[.64,.07,.60]);
    this.carriage=box(this.chamber,m.frame,[1.02,.09,.14],[0,-.08,0]);
    rod(this.chamber,m.chrome,[.49,-.08,0],[.65,-.08,0],.035);
    [-.46,.46].forEach(x=>cylinder(this.chamber,m.yellow,.038,.038,.07,[x,-.08,0],20).rotation.z=Math.PI/2);
    const latch = rounded(g, m.yellow, [.14, .28, .23], [.56, .59, .60], .03); latch.rotation.x = -.18;
    box(g, m.black, [.15, .06, .09], [.575, .64, .60]);
    cylinder(g, m.yellow, .089, .089, .09, [.57, -.08, .10], 8).rotation.z = Math.PI / 2;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.25, .10), new THREE.MeshBasicMaterial({ map: textTexture(['PUSH'], '#273135', '#f3efe4') }));
    label.position.set(.28,.52,.842);label.scale.x=-1;g.add(label);
    // Cream-colored elbow fitting is a characteristic separate water connector.
    const fitting=m.milk.clone();fitting.color.set('#e4dfc7');
    cylinder(g,fitting,.083,.083,.27,[-.54,.12,.21],24);
    cylinder(g,fitting,.061,.061,.18,[-.47,.14,.21],24).rotation.z=Math.PI/2;
    torus(g,fitting,.071,.017,[-.54,.255,.21]);
    // A real U-shaped wire: crossbar at sieve level, two side arms on guides.
    this.wiper=new THREE.Group();g.add(this.wiper);
    rod(g,m.chrome,[-.59,-.08,.10],[.65,-.08,.10],.047);
    this.wiperCam=new THREE.Group();this.wiperCam.position.set(-.59,-.08,.10);g.add(this.wiperCam);
    cylinder(this.wiperCam,m.yellow,.14,.14,.025,[0,0,0],32).rotation.z=Math.PI/2;
    rod(this.wiper,m.chrome,[-.59,.37,.24],[-.49,.37,.24],.026);
    rod(this.wiper,m.chrome,[-.49,.50,0],[.49,.50,0],.021);
    [-.49,.49].forEach(x=>{
      rod(this.wiper,m.chrome,[x,.50,0],[x,.42,.19],.021);
      rod(this.wiper,m.chrome,[x,.42,.19],[x,.37,.24],.021);
      sphere(this.wiper,m.yellow,.035,[x,.37,.24]);
      rod(g,m.frame,[x,.37,.37],[x,.37,1.29],.019);
    });
    this.wiperActuator=cylinder(g,m.yellow,.018,.018,1,[0,0,0],12);
    this.wiperActuatorB=cylinder(g,m.yellow,.018,.018,1,[0,0,0],12);
    this.wiperElbow=sphere(g,m.chrome,.030,[0,0,0]);
    this.wiperCamPin=sphere(g,m.chrome,.033,[0,0,0]);
    this.ejectedPuck=cylinder(g,this.doseMaterial,.278,.278,.105,[0,.53,.60]);this.ejectedPuck.visible=false;
    this.ejectedGrains=this.grainTop.clone();this.ejectedGrains.position.y=.055;this.ejectedPuck.add(this.ejectedGrains);
  }

  makeGear(parent, radius, pos, material, teeth = 18) {
    const group = new THREE.Group(); group.position.set(...pos); parent.add(group);
    const disc = cylinder(group, material, radius, radius, .065, [0, 0, 0]); disc.rotation.x = Math.PI / 2;
    const hub = cylinder(group, this.mat.steel, radius * .28, radius * .28, .09, [0, 0, 0]); hub.rotation.x = Math.PI / 2;
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * TAU;
      const tooth = box(group, material, [radius * .20, radius * .24, .067], [Math.sin(a) * radius, Math.cos(a) * radius, 0]); tooth.rotation.z = -a;
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU; const hole = cylinder(group, this.mat.black, radius * .13, radius * .13, .073, [Math.sin(a) * radius * .60, Math.cos(a) * radius * .60, .001], 12); hole.rotation.x = Math.PI / 2;
    }
    return group;
  }

  makeDrive() {
    const m = this.mat;
    this.drive = new THREE.Group(); this.drive.position.set(...LAYOUT.drive);this.drive.scale.x=-1;this.machine.add(this.drive);
    // Motor along z, worm above the reduction wheel, output/coupling along x.
    // End cap and metal body have disjoint axial extents: no coincident mantles.
    const motor=cylinder(this.drive,m.steel,.22,.22,.38,[0,.34,-.58]);motor.rotation.x=Math.PI/2;
    const cap=cylinder(this.drive,m.charcoal,.211,.211,.10,[0,.34,-.832]);cap.rotation.x=Math.PI/2;
    cylinder(this.drive,m.charcoal,.225,.225,.033,[0,.34,-.365]).rotation.x=Math.PI/2;
    cylinder(this.drive,m.chrome,.034,.034,.64,[0,.34,-.03]).rotation.x=Math.PI/2;
    this.worm=new THREE.Group();this.worm.position.set(0,.34,.02);this.drive.add(this.worm);
    const helix=[];for(let i=0;i<=120;i++){const t=i/120;helix.push([Math.cos(t*TAU*5)*.055,Math.sin(t*TAU*5)*.055,-.10+t*.26]);}
    pipe(this.worm,m.chrome,helix,.014);
    const axle=new THREE.Group();axle.rotation.y=Math.PI/2;this.drive.add(axle);
    this.driveGear=this.makeGear(axle,.278,[0,0,0],m.steel,20);
    this.driveMarker=box(this.driveGear,m.yellow,[.044,.10,.08],[0,.21,.01]);
    this.coupling=new THREE.Group();this.drive.add(this.coupling);
    cylinder(this.coupling,m.chrome,.055,.055,.235,[-.135,0,0],24).rotation.z=Math.PI/2;
    cylinder(this.coupling,m.yellow,.084,.084,.075,[-.238,0,0],8).rotation.z=Math.PI/2;
    box(this.drive,m.black,[.09,.82,.77],[.16,.13,-.21]);
    [-.21,.49].forEach(y=>sphere(this.drive,m.chrome,.031,[.212,y,-.46]));
    box(this.drive,m.frame,[.34,.07,.48],[0,.055,-.60]);
  }

  makeHydraulics() {
    const m = this.mat, body = this.machine;
    this.tank=new THREE.Group();body.add(this.tank);
    const tank=this.tank;
    const tankGlass = m.glass.clone(); tankGlass.opacity = .18;
    rounded(tank,tankGlass,[.44,2.69,1.72],[LAYOUT.tankX,2.12,-.56],.075);
    this.tankWater=box(tank,m.water,[.37,1,1.61],[LAYOUT.tankX,2.03,-.56]);
    rounded(tank,m.charcoal,[.44,.07,1.73],[LAYOUT.tankX,3.49,-.56],.025);
    const handle=new THREE.Group();handle.position.set(LAYOUT.tankX,3.57,-.35);tank.add(handle);
    rod(handle, m.frame, [-.17, 0, -.3], [-.17, .10, -.3]); rod(handle, m.frame, [.17, 0, -.3], [.17, .10, -.3]); rod(handle, m.frame, [-.17, .10, -.3], [.17, .10, -.3]);
    for(let i=0;i<4;i++)box(tank,m.chrome,[.008,.012,.14],[1.20,1.19+i*.54,.15]);
    cylinder(tank,m.chrome,.16,.16,.45,[LAYOUT.tankX,1.05,-.70]);
    cylinder(tank,m.blue,.17,.17,.06,[LAYOUT.tankX,1.29,-.70]);
    // A separate vibration pump and thermoblock, neither is inside the brew unit.
    this.pump = new THREE.Group(); this.pump.position.set(-.64, .78, -.79); body.add(this.pump);
    const pumpCylinder = cylinder(this.pump, m.chrome, .19, .19, .48, [0, 0, 0]); pumpCylinder.rotation.z = Math.PI / 2;
    cylinder(this.pump, m.charcoal, .20, .20, .16, [.20, 0, 0]).rotation.z = Math.PI / 2;
    cylinder(this.pump, m.red, .11, .11, .08, [-.29, 0, 0]).rotation.z = Math.PI / 2;
    box(this.pump, m.black, [.52, .065, .43], [0, -.24, 0]);
    this.heater = new THREE.Group(); this.heater.position.set(...LAYOUT.heater); body.add(this.heater);
    rounded(this.heater, m.heat, [.66, .81, .30], [0, 0, 0], .075);
    for (let i = 0; i < 5; i++) box(this.heater, m.chrome, [.62, .023, .025], [0, -.27 + i * .13, .171]);
    [[-.23, -.30], [.23, -.30], [-.23, .30], [.23, .30]].forEach(([x, y]) => sphere(this.heater, m.steel, .025, [x, y, .177]));
    const heatingPipe = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50; heatingPipe.push([Math.sin(t * Math.PI * 7) * .22, -.29 + t * .58, .218]);
    }
    pipe(this.heater, m.hot, heatingPipe, .028);
    this.valve=sphere(body,m.chrome,.105,LAYOUT.valve);
    torus(body,m.yellow,.112,.017,LAYOUT.valve,'z');
  }

  makeMilk() {
    const m = this.mat;
    this.carafe = new THREE.Group(); this.carafe.position.set(-.94, .97, 1.56); this.machine.add(this.carafe);
    cylinder(this.carafe, m.glass, .32, .25, 1.25, [0, .57, 0], 48, true);
    cylinder(this.carafe, m.glass, .25, .25, .06, [0, -.055, 0]);
    this.carafeMilk = cylinder(this.carafe, m.milk, .294, .237, 1, [0, .47, 0], 48);
    cylinder(this.carafe, m.charcoal, .32, .32, .10, [0, 1.23, 0]);
    rounded(this.carafe, m.charcoal, [.16, 1.27, .24], [.255, .57, .075], .045);
    rounded(this.carafe, m.charcoal, [.57, .13, .59], [0, -.05, .01], .04);
    torus(this.carafe, m.chrome, .29, .018, [0, 1.19, 0]);
    this.mixer = sphere(this.carafe, m.glass, .15, [.15, 1.21, .05]);
    const milkChannelMat = m.glass.clone(); milkChannelMat.opacity = .43;
    pipe(this.carafe, milkChannelMat, [[.13, .09, .03], [.22, .57, .035], [.22, 1.07, .035], [.15, 1.20, .05]], .052);
    pipe(this.carafe, m.charcoal, [[.15, 1.22, .05], [.38, 1.20, .07], [.72, 1.13, .17]], .087);
    pipe(this.carafe, m.chrome, [[.16, 1.24, .105], [.38, 1.22, .122], [.70, 1.145, .222]], .015);
    for (let i = 0; i < 4; i++) box(this.carafe, m.chrome, [.043, .011, .010], [.266, .3 + i * .19, .208]);
    // Visible air inlet: air and steam entrain milk inside the carafe lid.
    pipe(this.carafe, m.steam, [[.15, 1.36, .06], [.15, 1.28, .06], [.15, 1.21, .05]], .018);
    cylinder(this.carafe, m.frame, .043, .043, .027, [.15, 1.375, .06], 16);
    this.milkBubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 8, 6), m.foam, 16); this.carafe.add(this.milkBubbles);
  }

  makeCup() {
    const m = this.mat; this.cup = new THREE.Group(); this.cup.position.set(.06, .43, 1.55); this.machine.add(this.cup);
    cylinder(this.cup, m.glass, .40, .28, .94, [0, .50, 0], 64, true);
    cylinder(this.cup, m.glass, .28, .28, .08, [0, .035, 0], 64);
    torus(this.cup, m.glass, .397, .018, [0, .97, 0]);
    torus(this.cup, m.chrome, .279, .009, [0, .075, 0]);
    this.cupMilk = cylinder(this.cup, m.milk, 1, 1, 1, [0, .15, 0], 64);
    this.cupCoffeeMat = m.coffee.clone(); this.cupCoffee = cylinder(this.cup, this.cupCoffeeMat, 1, 1, 1, [0, .30, 0], 64);
    this.cupFoam = cylinder(this.cup, m.foam, 1, 1, 1, [0, .40, 0], 64);
    this.crema = cylinder(this.cup, m.cream, 1, 1, 1, [0, .40, 0], 64);
    this.foamBubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(.019, 8, 5), m.foam, 45); this.cup.add(this.foamBubbles);
  }

  flow(kind, points, mat, radius = .028, count = 14, parent = this.machine) {
    const tubeMaterial = mat.clone(); tubeMaterial.transparent = true; tubeMaterial.opacity = .46; tubeMaterial.depthWrite = false;
    const route = pipe(parent, tubeMaterial, points, radius);
    const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(radius * 1.26, 8, 6), mat, count); parent.add(particles);
    this.flowPaths.push({ ...route, kind, particles, parent, active: false }); return route;
  }

  makeFlows() {
    const m = this.mat, inlet=brewPoint(-.54,.12,.21), outlet=brewPoint(0,1.06,-.12);
    this.flow('supply', [[LAYOUT.tankX,.92,-.71],[.86,.61,-1.05],[-.85,.60,-1.05],[-.90,.67,-.80]], m.blue, .031, 13);
    this.flow('pump', [[-.37,.78,-.80],[-.49,1.08,-1.43],[-1.09,1.52,-1.47],[-.91,2.10,-1.13]], m.blue, .035, 13);
    this.flow('heater', [[-.91,2.10,-1.09],[-1.03,2.26,-1.08],[-.56,2.46,-1.08],[-1.01,2.73,-1.08],[-.68,2.91,-1.08],LAYOUT.valve], m.hot, .033, 15);
    this.flow('hot', [LAYOUT.valve,[-.42,2.87,-1.36],[.59,2.68,-1.31],[.65,1.80,-.61],inlet], m.hot, .028, 13);
    this.flow('steam', [LAYOUT.valve,[-.84,2.98,-.53],[-.85,2.68,.52],[-.91,2.49,1.19],[-.79,2.20,1.61]], m.steam, .035, 20);
    this.flow('milkUptake', [[.13, .09, .03], [.22, .58, .035], [.22, 1.07, .035], [.15, 1.20, .05]], m.milk, .025, 11, this.carafe);
    this.flow('milkOutlet', [[-.79, 2.17, 1.61], [-.60, 2.16, 1.65], [-.22, 2.10, 1.73]], m.milk, .038, 10);
    this.flow('milkPour', [[-.22, 2.10, 1.73], [-.18, 1.84, 1.71], [-.10, 1.46, 1.66], [-.03, .53, 1.61]], m.milk, .027, 13);
    this.flow('coffee', [outlet,[-.17,2.60,-.55],[-.10,2.73,.67],[.06,2.68,1.39]], m.coffee, .029, 16);
    [-.07, .19].forEach(x => this.flow('coffeePour', [[x, 2.15, 1.43], [x, 1.70, 1.46], [x, .53, 1.51]], m.coffee, .016, 10));
    // The lower inlet feeds the bottom sieve. Water travels upward through the
    // puck; the upper piston collects coffee and feeds the separate outlet.
    this.flow('infuse', [inlet,brewPoint(-.29,.36,.16),brewPoint(0,.59,-.12),brewPoint(0,.70,-.12),brewPoint(0,.81,-.12),outlet], m.hot, .038, 13);
    this.flow('drain', [brewPoint(-.44,.25,.20),[.55,1.11,-.40],[.50,.51,.30],[-.26,.27,1.02]], m.drain, .023, 9);
    this.flow('flush', [LAYOUT.valve,[-1.05,2.23,-.60],[-1.07,1.44,.10],[-.58,.63,.57],[-.43,.27,1.04]], m.hot, .024, 15);
  }

  bindControls() {
    const on = (name, fn, options) => { this.canvas.addEventListener(name, fn, options); this.listeners.push([name, fn, options]); };
    this.canvas.style.touchAction = 'none'; this.canvas.style.cursor = 'grab';
    const pointers = new Map(); let previousDistance = 0;
    on('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.canvas.setPointerCapture(e.pointerId); this.canvas.style.cursor = 'grabbing';
      if (pointers.size === 2) { const p = [...pointers.values()]; previousDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    });
    on('pointermove', e => {
      const p = pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const ps = [...pointers.values()], distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (previousDistance > 0) this.orbitGoal.radius = clamp(this.orbitGoal.radius * previousDistance / Math.max(1, distance), 3.1, 17);
        previousDistance = distance;
      } else { this.orbitGoal.theta -= dx * .007; this.orbitGoal.phi = clamp(this.orbitGoal.phi - dy * .006, .18, 2.48); }
    });
    const end = e => { pointers.delete(e.pointerId); previousDistance = 0; if (!pointers.size) this.canvas.style.cursor = 'grab'; };
    on('pointerup', end); on('pointercancel', end); on('lostpointercapture', end);
    on('wheel', e => { e.preventDefault(); this.orbitGoal.radius = clamp(this.orbitGoal.radius * Math.exp(e.deltaY * .0009), 3.1, 17); }, { passive: false });
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvas); }
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect(); this.width = Math.max(1, bounds.width); this.height = Math.max(1, bounds.height);
    this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
  }

  setView(name) {
    const views = {
      overview: { theta: .57, phi: 1.16, radius: 10.25, target: [0, 2.00, .02] },
      brew: { theta: -.90, phi: 1.18, radius: 5.6, target: [.02, 1.98, -.55] },
      milk: { theta: -.49, phi: 1.25, radius: 5.5, target: [-.51, 1.71, 1.44] },
      water: { theta: 1.35, phi: 1.17, radius: 6.8, target: [.42, 2.03, -.59] },
    };
    const selected = views[name] || views.overview; this.view = name in views ? name : 'overview';
    this.housingEdges.visible=this.view!=='brew'||!this.cutaway;
    this.orbitGoal = { theta: selected.theta, phi: selected.phi, radius: selected.radius }; this.targetGoal.set(...selected.target);
    if (this.exploded) { this.targetGoal.x+=1.12;this.targetGoal.z+=.35;this.orbitGoal.theta=-.20;this.orbitGoal.radius=Math.max(this.orbitGoal.radius,10.6); }
  }

  setCutaway(enabled) {
    this.cutaway = Boolean(enabled);
    this.housingEdges.visible=this.view!=='brew'||!this.cutaway;
    this.housing.forEach(({ mat, opacity }) => { mat.transparent = this.cutaway || mat === this.displayMat; mat.opacity = this.cutaway ? opacity : 1; mat.depthWrite = !this.cutaway; mat.needsUpdate = true; });
    this.mat.clearBrew.opacity = this.cutaway ? .25 : .92;
    for(const [mat,opacity] of [[this.brewSkin,.42],[this.funnelMaterial,.40],[this.wasteSkin,.32],[this.hopperLidMaterial,.16]]){
      mat.transparent=this.cutaway;mat.opacity=this.cutaway?opacity:1;mat.depthWrite=!this.cutaway;mat.needsUpdate=true;
    }
    this.machine.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow = materials.every(mat => !mat.transparent);
      object.receiveShadow = object.castShadow;
    });
  }

  setExploded(enabled) { this.exploded = Boolean(enabled); if (this.exploded) this.setCutaway(true); this.setView(this.exploded ? 'brew' : this.view); }
  setLabels(enabled) { this.labels = Boolean(enabled); }

  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light'; const dark = this.theme === 'dark';
    this.scene.background.set(dark ? '#1d2528' : '#eee9df'); this.scene.fog.color.copy(this.scene.background);
    this.floor.material.color.set(dark ? '#172023' : '#e6e0d4'); this.plinth.material.color.set(dark ? '#263236' : '#dcd6ca');
    this.stageRing.material.color.set(dark ? '#667071' : '#c9bdab');
  }

  updateCamera(k) {
    const ease = (a, b) => Math.abs(a - b) < 1e-5 ? b : mix(a, b, k);
    ['theta', 'phi', 'radius'].forEach(key => this.orbit[key] = ease(this.orbit[key], this.orbitGoal[key]));
    this.target.lerp(this.targetGoal, k); if (this.target.distanceToSquared(this.targetGoal) < 1e-8) this.target.copy(this.targetGoal);
    const { theta, phi } = this.orbit, radius = this.orbit.radius * Math.max(1, .92 / this.camera.aspect);
    this.camera.position.set(this.target.x + Math.sin(theta) * Math.sin(phi) * radius, this.target.y + Math.cos(phi) * radius, this.target.z + Math.cos(theta) * Math.sin(phi) * radius);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }

  update(state = {}, dt = 1 / 60) {
    this.state = state; const t = Number(state.time) || 0, k = 1 - Math.exp(-clamp(Number(dt) || 0, 0, .15) * 8);
    this.updateHopper(state);
    this.updateCamera(k); this.explodeAmount = mix(this.explodeAmount, this.exploded ? 1 : 0, k);
    if (Math.abs(this.explodeAmount - (this.exploded ? 1 : 0)) < 1e-4) this.explodeAmount = this.exploded ? 1 : 0;
    const service=servicePose(this.explodeAmount);
    this.brewUnit.position.x=service.brewX;this.tank.position.z=service.tankZ;
    this.brewSkin.opacity=this.cutaway?mix(.42,.96,this.explodeAmount):1;
    this.funnelMaterial.opacity=this.cutaway?mix(.40,.86,this.explodeAmount):1;
    const mechanics=getBrewMechanics({time:0,compression:0,ejectProgress:0,groundAmount:0,driveAngle:0,phase:{id:'grind'},...state});
    this.mechanics=mechanics;
    this.chamber.position.set(0,mechanics.chamberY,mechanics.chamberZ);
    const angle=mechanics.driveAngle;
    this.brewGear.rotation.z=-angle;this.driveGear.rotation.z=-angle;this.coupling.rotation.x=-angle;this.wiperCam.rotation.x=-angle;this.worm.rotation.z=angle*20;
    const crank=[.65,-.08+.13*Math.cos(angle),.10-.13*Math.sin(angle)];
    const follower=[.65,mechanics.chamberY-.08,mechanics.chamberZ];
    // Two constant-length articulated links visibly connect crank to carriage.
    const linkPair=(a,b,length,first,second,joint)=>{
      const dy=b[1]-a[1],dz=b[2]-a[2],d=Math.max(.0001,Math.hypot(dy,dz));
      const offset=Math.sqrt(Math.max(0,length*length-d*d/4));
      const elbow=[a[0],(a[1]+b[1])/2+dz/d*offset,(a[2]+b[2])/2-dy/d*offset];
      setRod(first,a,elbow);setRod(second,elbow,b);joint.position.set(...elbow);
    };
    linkPair(crank,follower,.57,this.linkA,this.linkB,this.elbow);
    this.crankPin.position.set(...crank);this.follower.position.set(...follower);
    this.wiper.position.z=mechanics.wiperZ;
    const cam=[-.59,-.08+.10*Math.cos(angle),.10-.10*Math.sin(angle)];
    const wireSlider=[-.59,.37,mechanics.wiperZ+.24];
    this.wiperCamPin.position.set(...cam);linkPair(cam,wireSlider,.75,this.wiperActuator,this.wiperActuatorB,this.wiperElbow);
    this.burr.rotation.y = state.grinderAngle ?? (state.grind ? t * 12 : 0);
    const puckHeight=mechanics.doseHeight,ejectLift=mechanics.pistonLift;
    this.lowerPiston.position.y = -.106 + ejectLift;
    this.lowerStem.position.y = -.194 + ejectLift / 2; this.lowerStem.scale.y = 1 + ejectLift / .15;
    const currentPuckVisible = !state.currentPuckDeposited;
    this.dose.visible=this.grainTop.visible=currentPuckVisible&&mechanics.puckLocation==='chamber'&&puckHeight>.001;
    this.dose.scale.y=Math.max(.001,puckHeight);this.dose.position.y=-.085+puckHeight/2+ejectLift;
    this.grainTop.position.y=-.082+puckHeight+ejectLift;
    this.doseMaterial.color.set(state.puckWetness > .25 ? '#39271f' : '#71442a');
    this.groundFall.visible = this.fallingBeans.visible = currentPuckVisible && Boolean(state.grind) && this.hopperState.count>0 && !state.resourceEmpty && !this.exploded;
    if (state.grind) {
      for (let i = 0; i < this.groundFall.count; i++) {
        const f = (i / this.groundFall.count + t * 1.7) % 1;
        dummy.position.set(LAYOUT.brew[0]+(rand(i*11)-.5)*.13,2.52-f*.77,LAYOUT.brew[2]+.60+(rand(i*19)-.5)*.15); dummy.rotation.set(0, 0, i); dummy.scale.setScalar(.65 + rand(i) * .85); dummy.updateMatrix(); this.groundFall.setMatrixAt(i, dummy.matrix);
      }
      this.groundFall.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < this.fallingBeans.count; i++) {
        const f = (i / this.fallingBeans.count + t * .72) % 1;
        dummy.position.set(LAYOUT.grinder[0]+(rand(i*11)-.5)*.16,3.73-f*.38,LAYOUT.grinder[2]+(rand(i*17)-.5)*.16); dummy.rotation.set(i, i + f * 3, i); dummy.scale.set(.75, .67, 1.2); dummy.updateMatrix(); this.fallingBeans.setMatrixAt(i, dummy.matrix);
      }
      this.fallingBeans.instanceMatrix.needsUpdate = true;
    }
    this.ejectedPuck.visible=currentPuckVisible&&['sweeping','falling'].includes(mechanics.puckLocation);
    if (this.ejectedPuck.visible) {
      this.ejectedPuck.position.set(...mechanics.puckPosition);
      const fall=mechanics.puckLocation==='falling'?clamp((state.ejectProgress-.66)/.19):0;
      // A small tumble settles flat exactly at the top of the existing stack.
      const tilt=Math.sin(fall*Math.PI)*.025;
      this.ejectedPuck.rotation.z=-tilt;this.ejectedPuck.rotation.x=tilt;
    }
    const storedPucks = Math.max(0, Math.floor(Number(state.storedPucks ?? (state.wastePuck ? 1 : 0)) || 0));
    while(this.storedPuckMeshes.length<storedPucks){
      const puck=this.spentPuck.clone();
      puck.material=this.spentMaterials[this.storedPuckMeshes.length%this.spentMaterials.length];
      this.waste.add(puck);this.storedPuckMeshes.push(puck);
    }
    this.storedPuckMeshes.forEach((puck,index)=>{
      puck.visible=index<storedPucks;
      puck.position.set(-.07,.10+index*BREW_GEOMETRY.puckSpacing,.04);
    });
    const tankLevel = clamp(state.tankLevel ?? 1);
    this.tankWater.visible=tankLevel>0;
    this.tankWater.scale.y=tankLevel*2.31;this.tankWater.position.y=.85+this.tankWater.scale.y/2;
    const carafeLevel = clamp(state.carafeLevel ?? 1); this.carafeMilk.scale.y = Math.max(.01, carafeLevel * 1.00); this.carafeMilk.position.y = .035 + carafeLevel * .50;
    this.mat.heat.emissiveIntensity = .035 + clamp(((state.heaterTemp || 20) - 20) / 120) * .72;
    this.mat.heat.color.set(state.heaterTemp > 110 ? '#ef9a4f' : '#be865e');
    this.updateCup(state, t); this.updateFlows(state, t);
    this.render();
  }

  updateCup(state, time) {
    // A shared ml-to-height scale keeps the visible recipe volumes consistent
    // with the counters, including the smaller espresso and cappuccino servings.
    const milk = (state.milkMl ?? clamp(state.milkAmount || 0) * 120) * .0036;
    const coffee = (state.coffeeMl ?? clamp(state.coffeeAmount || 0) * 40) * .0036;
    const foam = (state.foamMl ?? clamp(state.foamAmount || 0) * 60) * .0036;
    const setLayer = (mesh, base, height) => {
      mesh.visible = height > .002; const radius = .28 + ((base + height / 2) / .94) * .115;
      mesh.position.y = base + height / 2; mesh.scale.set(radius - .010, Math.max(.001, height), radius - .010);
    };
    setLayer(this.cupMilk, .085, milk); setLayer(this.cupCoffee, .085 + milk, coffee); setLayer(this.cupFoam, .085 + milk + coffee, foam);
    setLayer(this.crema, .085 + milk + coffee, foam < .002 && coffee > .01 ? .024 : 0);
    this.cupCoffeeMat.color.set(milk > .01 ? '#a77448' : '#683818');
    this.foamBubbles.visible = foam > .008;
    for (let i = 0; i < this.foamBubbles.count; i++) {
      const a = i * 2.39996, r = Math.sqrt(rand(i * 7)) * .30;
      dummy.position.set(Math.cos(a) * r, .088 + milk + coffee + foam, Math.sin(a) * r); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.4 + rand(i) * .9); dummy.updateMatrix(); this.foamBubbles.setMatrixAt(i, dummy.matrix);
    }
    this.foamBubbles.instanceMatrix.needsUpdate = true;
    this.milkBubbles.visible = Boolean(state.milkFlow) && !this.exploded;
    if (state.milkFlow) for (let i = 0; i < this.milkBubbles.count; i++) {
      const f = (i / this.milkBubbles.count + time * .9) % 1;
      dummy.position.set(.14 + Math.sin(i * 3 + f * 5) * .09, 1.16 + f * .15, .05 + Math.cos(i + f * 6) * .08); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.sin(f * Math.PI) * .9); dummy.updateMatrix(); this.milkBubbles.setMatrixAt(i, dummy.matrix);
    }
    this.milkBubbles.instanceMatrix.needsUpdate = true;
  }

  updateFlows(state, time) {
    const brewingWater = Boolean(state.pump) && ['prewet', 'extract'].includes(state.phase?.id);
    const activity = {
      supply: state.pump, pump: state.pump, heater: state.pump,
      hot: brewingWater, infuse: brewingWater,
      steam: state.steam, milkUptake: state.milkFlow, milkOutlet: state.milkFlow, milkPour: state.milkFlow,
      coffee: state.brewFlow, coffeePour: state.brewFlow,
      drain: state.draining && state.phase?.id !== 'condition', flush: state.draining && state.phase?.id === 'condition',
    };
    for (const route of this.flowPaths) {
      const disconnected = this.explodeAmount > .001 && ['supply','hot','infuse','coffee','drain'].includes(route.kind);
      const pouring = route.kind === 'milkPour' || route.kind === 'coffeePour' || route.kind === 'infuse';
      route.active = Boolean(activity[route.kind]) && !disconnected && !this.exploded;
      route.particles.visible = route.active; route.mesh.visible = !disconnected && (!pouring || route.active);
      route.mesh.material.opacity = route.active ? .78 : .32;
      if (!route.active) continue;
      for (let i = 0; i < route.particles.count; i++) {
        const f = (i / route.particles.count + time * (pouring ? .85 : .42)) % 1;
        dummy.position.copy(route.curve.getPoint(f)); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(pouring ? .86 : 1.03); dummy.updateMatrix(); route.particles.setMatrixAt(i, dummy.matrix);
      }
      route.particles.instanceMatrix.needsUpdate = true;
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  getAnnotations() {
    if (!this.labels) return {};
    this.machine.updateMatrixWorld(true); const result = {};
    for (const [id, anchor] of Object.entries(this.anchorPoints)) {
      const point=anchor.clone();if(id==='brew')this.brewUnit.localToWorld(point.set(0,.58,.16));
      if(id==='tank')point.z+=this.tank.position.z;
      if(id==='wiper')this.brewUnit.localToWorld(point.set(0,.50,this.mechanics.wiperZ));
      if(id==='lowerSieve')this.brewUnit.localToWorld(point.set(0,this.mechanics.chamberY-.085+this.mechanics.pistonLift,this.mechanics.chamberZ));
      if(id==='linkage')this.brewUnit.localToWorld(point.copy(this.elbow.position));
      point.project(this.camera); result[id] = { x: (point.x * .5 + .5) * this.width, y: (-point.y * .5 + .5) * this.height, visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 };
    }
    return result;
  }

  inspect() {
    return {
      cutaway: this.cutaway, exploded: this.exploded, explodeAmount: this.explodeAmount, view: this.view,
      phase: this.state.phase?.id,mechanics:this.mechanics, groundFall: this.groundFall.visible, chamberY: this.chamber.position.y,
      doseVisible: this.dose.visible, ejectedPuck: this.ejectedPuck.visible, wastePuck: this.spentPuck.visible,
      storedPucks:this.storedPuckMeshes.filter(puck=>puck.visible).length,tankWaterVisible:this.tankWater.visible,tankWaterHeight:this.tankWater.scale.y,
      beanCount:this.beans.count,beanLevel:this.hopperState.level,hopperPosition:this.hopper.position.toArray(),hopperRotation:this.hopper.rotation.toArray().slice(0,3),
      cup: { milk: this.cupMilk.visible, coffee: this.cupCoffee.visible, foam: this.cupFoam.visible },
      routes: this.flowPaths.map(r => ({ kind: r.kind, active: r.active })),
      brewX:this.brewUnit.position.x,motorX:this.drive.position.x,tankX:LAYOUT.tankX,tankPull:this.tank.position.z,materials:this.housing.map(h=>({opacity:h.mat.opacity,transparent:h.mat.transparent}))
    };
  }

  dispose() {
    this.resizeObserver?.disconnect(); this.listeners.forEach(([name, fn, options]) => this.canvas.removeEventListener(name, fn, options));
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => { materials.add(mat); if (mat.map) textures.add(mat.map); });
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.renderer.dispose();
  }
}
