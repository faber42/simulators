import * as THREE from '../pinsim/three.module.min.js';

// Coordinates: +y is up; the loading door faces +z. Distances are illustrative.
const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
// Stop presentation easing exactly, so a paused, settled view is pixel-stable.
const easeTo = (a, b, t) => { const value = lerp(a, b, t); return Math.abs(value - b) < 1e-4 ? b : value; };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);
const DUMMY = new THREE.Object3D();
const RANDOM = n => { const a = Math.sin(n * 127.1 + 311.7) * 43758.5453; return a - Math.floor(a); };

function box(parent, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}
function cylinder(parent, material, top, bottom, length, position, radial = 36) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, length, radial), material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}
function sphere(parent, material, radius, position, scale) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12), material);
  mesh.position.set(...position); if (scale) mesh.scale.set(...scale); parent.add(mesh); return mesh;
}
function pipe(parent, points, radius, material, smooth = true) {
  const curve = smooth
    ? new THREE.CatmullRomCurve3(points.map(p => Array.isArray(p) ? v3(...p) : p), false, 'centripetal')
    : new THREE.CurvePath();
  if (!smooth) points.slice(1).forEach((p, i) => curve.add(new THREE.LineCurve3(v3(...points[i]), v3(...p))));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 8), radius, 8, false), material);
  parent.add(mesh); return { mesh, curve };
}
function wires(parent, segments, material, radius = .012) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 6), material, segments.length);
  segments.forEach(([a, b], i) => {
    const start = v3(...a), end = v3(...b), direction = end.clone().sub(start);
    DUMMY.position.copy(start.add(end).multiplyScalar(.5));
    DUMMY.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
    DUMMY.scale.set(1, direction.length(), 1); DUMMY.updateMatrix(); mesh.setMatrixAt(i, DUMMY.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; parent.add(mesh); return mesh;
}

export class DishwasherScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .93;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f0efe9');
    this.scene.fog = new THREE.Fog('#f0efe9', 15, 34);
    this.camera = new THREE.PerspectiveCamera(37, 1, .08, 65);
    this.target = v3(-.05, 1.6, .25);
    this.targetGoal = this.target.clone();
    this.orbit = { theta: -.68, phi: 1.14, radius: 10.2 };
    this.orbitGoal = { ...this.orbit };
    this.cutaway = true; this.labels = true; this.doorAngle = Math.PI / 2;
    this.shellMaterials = []; this.soilMeshes = []; this.wetDrops = []; this.arms = [];
    this.flowPaths = []; this.disposables = []; this.listeners = [];
    this.width = 1; this.height = 1;
    this.createMaterials(); this.createStage(); this.createMachine(); this.createPocket();
    this.createHydraulics(); this.createDishes(); this.createDoor(); this.createParticles();
    this.anchorPoints = {
      pocket: v3(-1.62, 2.17, -.03), spray: v3(.4, .99, .84),
      filter: v3(.52, .55, .61), detergent: v3(-.66, 1.55, 1.43), drying: v3(-1.30, 2.67, -.66),
      pump: v3(-.66,.23,.25), drain: v3(.78,.18,.57), heater: v3(-.46,.23,.24)
    };
    this.bindControls(); this.resize(); this.updateCamera(1);
    this.renderer.render(this.scene, this.camera);
  }

  createMaterials() {
    const standard = options => new THREE.MeshStandardMaterial(options);
    this.mat = {
      steel: standard({ color: '#b8c3c1', metalness: .77, roughness: .29 }),
      polished: standard({ color: '#e3e7df', metalness: .82, roughness: .19 }),
      wire: standard({ color: '#9eaeb0', metalness: .58, roughness: .27 }),
      graphite: standard({ color: '#263c44', metalness: .2, roughness: .45 }),
      dark: standard({ color: '#455865', metalness: .38, roughness: .43 }),
      ceramic: standard({ color: '#6950d6', metalness: .06, roughness: .22 }),
      ceramicLight: standard({ color: '#8e78e2', metalness: .04, roughness: .2 }),
      rim: standard({ color: '#b8a6f7', metalness: .09, roughness: .21 }),
      blue: standard({ color: '#4cb7d0', metalness: .25, roughness: .22 }),
      water: standard({ color: '#55c4de', transparent: true, opacity: .42, metalness: .1, roughness: .12, depthWrite: false }),
      glass: standard({ color: '#c3e7e9', transparent: true, opacity: .16, metalness: .1, roughness: .2, depthWrite: false, side: THREE.DoubleSide }),
      pocketTrack: standard({ color: '#e0f4ed', metalness: .05, roughness: .2, transparent: true, opacity: .58, depthWrite: false }),
      heat: standard({ color: '#e39a58', metalness: .5, roughness: .3, emissive: '#d97533', emissiveIntensity: .1 }),
      drain: standard({ color: '#63858b', metalness: .4, roughness: .28 }),
      soap: standard({ color: '#ecf2e4', metalness: .08, roughness: .38 }),
      soapBlue: standard({ color: '#449fbd', metalness: .02, roughness: .3 }),
    };
  }

  createStage() {
    this.scene.add(new THREE.HemisphereLight('#f7faff', '#a5a997', 2.05));
    const key = new THREE.DirectionalLight('#fff6e5', 3.0); key.position.set(-4, 8, 5);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: .1, far: 20 });
    key.shadow.normalBias = .025; key.shadow.bias = -.0003; this.scene.add(key);
    const fill = new THREE.DirectionalLight('#c6e3f4', 1.5); fill.position.set(5, 5, -4); this.scene.add(fill);
    const front = new THREE.DirectionalLight('#ffffff', .8); front.position.set(0, 3, 7); this.scene.add(front);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#e5e5dc', roughness: .86 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.17; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(24, 48, '#c6cec3', '#d7dcd0'); grid.position.y = -.165;
    grid.material.transparent = true; grid.material.opacity = .46; this.scene.add(grid);
    const plinth = box(this.scene, new THREE.MeshStandardMaterial({ color: '#d8dcd3', roughness: .75 }), [4.1, .065, 4.05], [0, -.12, .13]);
    plinth.receiveShadow = true;
    this.machine = new THREE.Group(); this.scene.add(this.machine);
  }

  createMachine() {
    const m = this.mat, body = this.machine;
    // Narrow frame members keep the cutaway readable from every side.
    const frame = [];
    [-1.36, 1.36].forEach(x => {
      [-1.27, 1.27].forEach(z => frame.push([[x, .48, z], [x, 3.68, z]]));
      [.48, 3.68].forEach(y => frame.push([[x, y, -1.27], [x, y, 1.27]]));
    });
    [.48, 3.68].forEach(y => [-1.27, 1.27].forEach(z => frame.push([[-1.36, y, z], [1.36, y, z]])));
    wires(body, frame, m.steel, .037);
    this.baseMaterial=m.steel.clone();this.baseMaterial.transparent=true;
    this.base=box(body, this.baseMaterial, [2.77, .13, 2.61], [0, .45, 0]);this.base.receiveShadow=true;
    box(body, m.graphite, [2.69, .13, .12], [0, .35, 1.23]);
    [-1.16, 1.16].forEach(x => [-1.1, 1.1].forEach(z => cylinder(body, m.graphite, .1, .11, .16, [x, -.015, z])));
    const shell = new THREE.MeshStandardMaterial({ color: '#b2c4c4', metalness: .45, roughness: .3, transparent: true, opacity: .10, depthWrite: false, side: THREE.DoubleSide });
    this.shellMaterials.push(shell);
    box(body, shell, [.035, 3.14, 2.48], [-1.32, 2.08, 0]);
    box(body, shell, [.035, 3.14, 2.48], [1.32, 2.08, 0]);
    box(body, shell, [2.63, 3.14, .035], [0, 2.08, -1.24]);
    box(body, shell, [2.64, .035, 2.48], [0, 3.66, 0]);
    const edgeSegments = [];
    // Subtle horizontal stamping in the stainless inner tub.
    for (let y = .8; y < 3.5; y += .45) edgeSegments.push([[-1.25, y, -1.222], [1.25, y, -1.222]]);
    wires(body, edgeSegments, m.steel, .006);
    this.water = box(body, m.water, [2.55, .02, 2.32], [0, .545, 0]);
    this.water.renderOrder = 2;
    // Two baskets, with coated rods and separate runners.
    this.createBasket(1.18, .34, 0);
    this.createBasket(2.72, .31, 1);
    this.createBasket(3.42, .12, 2, 2.42, 1.96);
    this.createSprayArm(.96, 1.11, 0);
    this.createSprayArm(2.50, .96, 1);
    // Return riser feeds the upper rotating spray arm.
    pipe(body, [[0, .6, -1.14], [0, 2.47, -1.14], [0, 2.48, 0]], .052, m.dark, false);
  }

  createBasket(y, lip, level, width = 2.4, depth = 2.13) {
    const segments = [], x = width / 2, z = depth / 2;
    [y, y + lip].forEach(h => {
      segments.push([[-x, h, -z], [x, h, -z]], [[-x, h, z], [x, h, z]], [[-x, h, -z], [-x, h, z]], [[x, h, -z], [x, h, z]]);
    });
    for (let a = -x + .08; a <= x; a += .145) {
      segments.push([[a, y, -z], [a, y, z]], [[a, y, -z], [a, y + lip, -z]], [[a, y, z], [a, y + lip, z]]);
    }
    for (let a = -z + .08; a <= z; a += .15) {
      segments.push([[-x, y, a], [x, y, a]], [[-x, y, a], [-x, y + lip, a]], [[x, y, a], [x, y + lip, a]]);
    }
    if (level === 0) {
      for (let a = -.91; a <= 1; a += .28) [-.39, .51].forEach(b => segments.push([[a, y, b], [a - .07, y + .35, b - .06]]));
    }
    wires(this.machine, segments, this.mat.wire, level === 2 ? .009 : .012);
    [-1.28, 1.28].forEach(a => {
      box(this.machine, this.mat.steel, [.043, .045, 2.21], [a, y - .075, -.035]);
      if (level < 2) [-.76, .78].forEach(b => {
        const wheel = cylinder(this.machine, this.mat.graphite, .059, .059, .037, [a, y - .03, b], 16); wheel.rotation.z = Math.PI / 2;
      });
    });
    box(this.machine, this.mat.graphite, [.57, .065, .07], [0, y + lip - .013, z + .015]);
  }

  createSprayArm(y, radius, index) {
    const group = new THREE.Group(); group.position.y = y; this.machine.add(group);
    const armMat = new THREE.MeshStandardMaterial({ color: index ? '#b4bcc7' : '#d1d8d5', metalness: .5, roughness: .28 });
    const hub = cylinder(group, this.mat.graphite, .12, .14, .105, [0, 0, 0]); hub.castShadow = true;
    const arm = box(group, armMat, [radius * 2, .065, .14], [0, .01, 0]); arm.castShadow = true;
    sphere(group, armMat, .08, [radius, .01, 0], [1, .45, .9]); sphere(group, armMat, .08, [-radius, .01, 0], [1, .45, .9]);
    const nozzles = [];
    [-1, 1].forEach(sign => [.24, .51, .8, .96].forEach((r, n) => {
      const x = sign * r * radius, z = n % 2 ? .03 : -.03;
      cylinder(group, this.mat.graphite, .02, .019, .018, [x, .049, z], 10);
      nozzles.push({ x, z, vx: sign * (.13 + .1 * (n % 2)), vz: sign * (index ? -.26 : .26), h: index ? .66 : 1.04 });
    }));
    const count = nozzles.length * 8;
    const positions = new Float32Array(count * 6);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: '#0783ad', transparent: true, opacity: .65, depthWrite: false });
    const streams = new THREE.LineSegments(geometry, material); streams.frustumCulled = false; group.add(streams);
    const jetBodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(.009, .011, 1, 5), new THREE.MeshBasicMaterial({ color: '#158dae', transparent: true, opacity: .52, depthWrite: false }), count);
    jetBodies.frustumCulled = false; group.add(jetBodies);
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(.014, 5, 4), new THREE.MeshBasicMaterial({ color: '#39b8d7', transparent: true, opacity: .84, depthWrite: false }), nozzles.length * 7);
    drops.frustumCulled = false; group.add(drops);
    this.arms.push({ group, nozzles, geometry, material, streams, jetBodies, drops, index });
  }

  createPocket() {
    const m = this.mat, group = new THREE.Group(); this.machine.add(group); this.pocket = group;
    const border = [];
    [-1.26, 1.04].forEach(z => border.push([[-1.53, .59, z], [-1.53, 3.51, z]]));
    [.59, 3.51].forEach(y => border.push([[-1.53, y, -1.26], [-1.53, y, 1.04]]));
    wires(group, border, m.polished, .022);
    box(group, m.glass, [.075, 2.89, 2.28], [-1.53, 2.05, -.11]);
    // A flat serpentine pocket: fresh water exchanges heat through the tub wall.
    const trackPoints = [[-1.59, .72, -.93]];
    for (let row = 0; row < 7; row++) {
      const y = .82 + row * .36, from = row % 2 ? .79 : -.99, to = row % 2 ? -.99 : .79;
      trackPoints.push([-1.59, y, from], [-1.59, y, to]);
      if (row < 6) trackPoints.push([-1.59, y + .18, to]);
    }
    trackPoints.push([-1.59, 3.22, .86], [-1.59, 3.37, .86]);
    this.pocketCurve = pipe(group, trackPoints, .063, m.pocketTrack).curve;
    this.pocketFlowMat = new THREE.MeshStandardMaterial({ color: '#1296bd', roughness: .18, transparent: true, opacity: .86, depthWrite: false });
    this.pocketFlow = pipe(group, trackPoints, .043, this.pocketFlowMat).mesh;
    this.pocketGeometry = this.pocketFlow.geometry;
    this.pocketTotalIndices = this.pocketGeometry.index.count;
    this.pocketReservoir = box(group, this.pocketFlowMat, [.087, .32, 1.92], [-1.59, .77, -.1]);
    [-.97, .76].forEach(z => cylinder(group, m.graphite, .065, .065, .10, [-1.59, .57, z]));
    // Arrow-like heat fins on the inner side make the transfer wall visible.
    const fins = [];
    for (let y = .88; y < 3.3; y += .28) fins.push([[-1.365, y, -.8], [-1.365, y, .68]]);
    wires(group, fins, m.polished, .009);
    this.wallTint = new THREE.MeshStandardMaterial({ color: '#6abfd5', transparent: true, opacity: .08, roughness: .34, metalness: .08, depthWrite: false, side: THREE.DoubleSide });
    box(group, this.wallTint, [.014, 2.7, 2.12], [-1.343, 2.02, -.09]);
  }

  createHydraulics() {
    const m = this.mat, group = this.machine;
    // Filter basket and fine mesh sit in the shallow sump, above the drain pump.
    const filter = new THREE.Group(); filter.position.set(.52, .55, .61); group.add(filter); this.filter = filter;
    cylinder(filter, m.graphite, .23, .23, .045, [0, 0, 0]);
    cylinder(filter, m.steel, .18, .15, .20, [0, .09, 0]);
    const sieveSegments = [];
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU;
      sieveSegments.push([[Math.cos(a) * .184, .01, Math.sin(a) * .184], [Math.cos(a) * .184, .185, Math.sin(a) * .184]]);
    }
    wires(filter, sieveSegments, m.graphite, .005);
    [.055, .105, .155, .19].forEach(y => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.184, .006, 4, 36), m.graphite); ring.rotation.x = Math.PI / 2; ring.position.y = y; filter.add(ring);
    });
    cylinder(filter, m.graphite, .056, .056, .025, [0, .21, 0], 18);
    const coarse = [];
    for (let a = -.43; a <= .43; a += .045) coarse.push([[a, -.011, -.39], [a, -.011, .39]]);
    wires(filter, coarse, m.steel, .009);
    this.filterDebris = new THREE.InstancedMesh(new THREE.SphereGeometry(.024, 6, 4), new THREE.MeshStandardMaterial({ color: '#9c6a32', roughness: .93 }), 28);
    filter.add(this.filterDebris);
    const sump = cylinder(group, m.dark, .30, .22, .29, [.35, .29, .48]); sump.castShadow = true;
    this.pump = cylinder(group, m.steel, .22, .22, .41, [-.62, .23, .24]); this.pump.rotation.z = Math.PI / 2;
    cylinder(group, m.graphite, .24, .24, .12, [-.83, .23, .24]).rotation.z = Math.PI / 2;
    this.heater = cylinder(group, m.heat, .235, .235, .17, [-.50, .23, .24]); this.heater.rotation.z = Math.PI / 2;
    const pumpFeet = box(group, m.graphite, [.63, .09, .51], [-.62, .015, .24]); pumpFeet.castShadow = true;
    const drainPump = cylinder(group, m.graphite, .12, .12, .28, [.75, .18, .55]); drainPump.rotation.z = Math.PI / 2;
    const paths = [
      { kind: 'circulating', points: [[.36,.28,.45],[-.32,.23,.3],[-.63,.23,.22],[-.69,.20,-.5],[0,.24,-1.02],[0,.76,-1.02],[0,.84,0]], radius: .057 },
      { kind: 'circulating', points: [[0,.65,-1.10],[0,1.1,-1.10],[0,2.38,-1.10],[0,2.45,0]], radius: .047 },
      { kind: 'drain', points: [[.38,.22,.5],[.79,.17,.57],[1.22,.13,.49],[1.58,.13,.16],[1.63,.2,-1.24]], radius: .05 },
      { kind: 'supply', points: [[-1.82,.02,-1.46],[-1.8,.15,-1.01],[-1.59,.3,-.98],[-1.59,.71,-.98]], radius: .045 },
      { kind: 'pocketOutlet', points: [[-1.59,.61,.77],[-1.61,.34,.83],[-1.08,.26,.80],[-.45,.32,.66],[.35,.48,.40]], radius: .043 },
      { kind: 'directFill', points: [[-1.8,.15,-1.01],[-1.47,.20,-.9],[-.86,.22,-.77],[.15,.30,-.42],[.35,.48,.40]], radius: .04 },
    ];
    paths.forEach(({ kind, points, radius }) => {
      const { curve } = pipe(group, points, radius, kind === 'drain' ? m.drain : m.blue);
      const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(radius * .67, 6, 4), new THREE.MeshBasicMaterial({ color: kind === 'drain' ? '#bd9d52' : '#a9eeef', transparent: true, opacity: .95, depthWrite: false }), 20);
      group.add(particles); this.flowPaths.push({ kind, curve, particles });
    });
  }

  createDishes() {
    const m = this.mat;
    // Revolved ceramic profile leaves a shallow concave eating surface and a rim.
    const profile = [[0,.021],[.12,.021],[.34,.024],[.47,.04],[.54,.075],[.59,.104],[.615,.09],[.608,.059],[.55,.034],[.42,-.016],[.16,-.045],[.11,-.051],[0,-.045]].map(p => new THREE.Vector2(...p));
    const geometry = new THREE.LatheGeometry(profile, 56);
    for (let i = 0; i < 8; i++) {
      const plate = new THREE.Group(); plate.position.set(-.98 + i * .279, 1.78, .11); plate.rotation.z = Math.PI / 2 - .075;
      this.machine.add(plate);
      const ceramic = new THREE.Mesh(geometry, i % 3 === 0 ? m.ceramicLight : m.ceramic); ceramic.castShadow = true; ceramic.receiveShadow = true; plate.add(ceramic);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.602, .009, 6, 60), m.rim); rim.rotation.x = Math.PI / 2; rim.position.y = .097; plate.add(rim);
      this.addDishDirt(plate, i, .48, .038, 8);
      this.addSurfaceDrops(plate, i, .49, .062, 9);
    }
    // Inverted cups and bowls drain instead of collecting wash water.
    [-.87, -.30, .3, .87].forEach((x, i) => {
      const bowl = new THREE.Group(); bowl.position.set(x, 2.89, -.47); bowl.rotation.z = .12 * (i % 2 ? 1 : -1); this.machine.add(bowl);
      const bowlProfile = [[.11,.27],[.13,.29],[.17,.27],[.22,.13],[.27,-.11],[.29,-.12],[.30,-.08],[.26,.13],[.18,.31],[.10,.32]].map(p => new THREE.Vector2(...p));
      const mesh = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 36), i % 2 ? m.ceramicLight : m.ceramic); mesh.castShadow = true; bowl.add(mesh);
      this.addDishDirt(bowl, 20 + i, .15, .33, 3);
      this.addSurfaceDrops(bowl, 20 + i, .16, .335, 4);
      const cup = new THREE.Group(); cup.position.set(x, 2.94, .40); cup.rotation.z = -.11; this.machine.add(cup);
      const cupProfile = [[0,.23],[.15,.23],[.175,.19],[.17,-.18],[.145,-.20],[.139,.15],[0,.17]].map(p => new THREE.Vector2(...p));
      const cupMesh = new THREE.Mesh(new THREE.LatheGeometry(cupProfile, 30), i % 2 ? m.ceramic : m.ceramicLight); cup.add(cupMesh); cupMesh.castShadow = true;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(.1, .034, 7, 24, Math.PI * 1.8), m.ceramic); handle.position.set(.19, -.01, 0); handle.rotation.z = -Math.PI * .9; cup.add(handle);
      this.addSurfaceDrops(cup, 30 + i, .13, .24, 4);
    });
    // A small cutlery drawer preserves the three visible levels of the reference.
    const cutlerySegments = [];
    for (let i = 0; i < 9; i++) {
      const x = -.96 + i * .24;
      cutlerySegments.push([[x,3.45,-.66],[x,3.45,.22]]);
      if (i % 3 === 0) {
        for (let j = -1; j <= 1; j++) cutlerySegments.push([[x + j*.025,3.45,-.67],[x + j*.025,3.45,-.85]]);
      } else sphere(this.machine, m.polished, .073, [x,3.45,-.74], [.75,.14,1.25]);
    }
    wires(this.machine, cutlerySegments, m.polished, .018);
  }

  addDishDirt(parent, seed, radius, height, count) {
    // Each patch has its own opacity so the last stubborn marks dissolve later.
    for (let i = 0; i < count; i++) {
      const a = RANDOM(seed * 31 + i) * TAU, r = Math.sqrt(RANDOM(seed * 47 + i + 3)) * radius;
      const material = new THREE.MeshStandardMaterial({ color: i % 3 ? '#b37d38' : '#795832', roughness: .92, transparent: true, opacity: .93, depthWrite: false, side: THREE.DoubleSide });
      const patch = new THREE.Mesh(new THREE.CircleGeometry(.035 + RANDOM(seed + i * 21) * .061, 9), material);
      patch.rotation.x = -Math.PI / 2; patch.rotation.z = a; patch.position.set(Math.cos(a) * r, height + Math.max(0, r - .33) * .20, Math.sin(a) * r);
      patch.scale.set(1, .57 + RANDOM(i + seed) * .6, 1); parent.add(patch);
      this.soilMeshes.push({ mesh: patch, threshold: RANDOM(seed * 71 + i) * .5 });
    }
  }

  addSurfaceDrops(parent, seed, radius, height, count) {
    const mat = new THREE.MeshPhysicalMaterial({ color: '#b7e0f3', metalness: .1, roughness: .08, transparent: true, opacity: .66, depthWrite: false });
    for (let i = 0; i < count; i++) {
      const a = RANDOM(seed * 21 + i) * TAU, r = Math.sqrt(RANDOM(seed * 41 + i + 2)) * radius;
      const mesh = sphere(parent, mat, .02 + RANDOM(seed + i) * .011, [Math.cos(a)*r, height + Math.max(0,r-.33)*.2, Math.sin(a)*r], [1,.36,1.25]);
      this.wetDrops.push({ mesh, threshold: RANDOM(seed * 19 + i) * .75 });
    }
  }

  createDoor() {
    const m = this.mat, door = new THREE.Group(); door.position.set(0, .49, 1.29); this.machine.add(door); this.door = door;
    const material = new THREE.MeshStandardMaterial({ color: '#bccbc7', metalness: .61, roughness: .32, transparent: true, opacity: .17, depthWrite: false, side: THREE.DoubleSide });
    this.doorMaterial = material;
    box(door, material, [2.64, 3.10, .077], [0, 1.55, 0]);
    const edges = [ [[-1.32,0,0],[-1.32,3.1,0]], [[1.32,0,0],[1.32,3.1,0]], [[-1.32,0,0],[1.32,0,0]], [[-1.32,3.1,0],[1.32,3.1,0]] ];
    wires(door, edges, m.steel, .03);
    box(door, m.graphite, [2.66,.16,.11], [0,3.075,.015]);
    box(door, m.steel, [1.06,.065,.07], [0,3.07,.105]);
    const control = new THREE.MeshBasicMaterial({ color: '#a3dfc5' });
    box(door, control, [.18,.035,.012], [.98,3.079,.077]);
    // Detergent dispenser is mounted on the inside of the door.
    this.dispenser = new THREE.Group(); this.dispenser.position.set(-.69,1.40,-.070); door.add(this.dispenser);
    box(this.dispenser, m.graphite, [.53,.42,.05], [0,0,0]);
    box(this.dispenser, m.steel, [.42,.3,.03], [0,0,-.04]);
    this.tablet = new THREE.Group(); this.tablet.position.set(0,0,-.072); this.dispenser.add(this.tablet);
    box(this.tablet, m.soap, [.22,.16,.048], [0,0,0]); box(this.tablet,m.soapBlue,[.09,.14,.009],[.055,0,-.03]);
    this.dispenserLid = new THREE.Group(); this.dispenserLid.position.set(-.24,0,-.11); this.dispenser.add(this.dispenserLid);
    box(this.dispenserLid, m.dark, [.47,.35,.035], [.235,0,0]);
    const rinseCap = cylinder(this.dispenser, m.blue, .063,.063,.025,[.37,0,0],22); rinseCap.rotation.x=Math.PI/2;
    [-1.17,1.17].forEach(x => cylinder(this.machine,m.steel,.055,.055,.18,[x,.50,1.29],18).rotation.z=Math.PI/2);
    door.rotation.x = this.doorAngle;
  }

  createParticles() {
    const makeParticles = (count, color, radius, opacity) => {
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), count);
      mesh.frustumCulled = false; this.machine.add(mesh); return mesh;
    };
    this.vapor = makeParticles(70, '#d2e7e7', .04, .28);
    this.condensate = makeParticles(56, '#56b3d1', .023, .78);
    this.soapParticles = makeParticles(38, '#d9f4f2', .017, .66);
    this.pocketBubbles = makeParticles(15, '#daf8f1', .018, .82);
    this.heatTransfer = makeParticles(18, '#dc892b', .023, .86);
    // Few subtle visible wisps emphasize vapor, without suggesting boiling water.
    this.vapor.material.color.set('#cadedd');
  }

  bindControls() {
    const on = (name, fn, options) => { this.canvas.addEventListener(name, fn, options); this.listeners.push([name,fn,options]); };
    this.canvas.style.touchAction = 'none';
    let drag = null;
    on('pointerdown', e => {
      if (e.button !== 0) return;
      drag = { x:e.clientX, y:e.clientY, id:e.pointerId };
      this.canvas.setPointerCapture(e.pointerId); this.canvas.style.cursor = 'grabbing';
    });
    on('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      this.orbitGoal.theta -= (e.clientX-drag.x)*.007;
      this.orbitGoal.phi = clamp(this.orbitGoal.phi+(e.clientY-drag.y)*.006,.25,1.5);
      drag.x=e.clientX; drag.y=e.clientY;
    });
    const end = e => { if (drag && drag.id === e.pointerId) { drag=null; this.canvas.style.cursor='grab'; } };
    on('pointerup',end); on('pointercancel',end); on('lostpointercapture',end);
    on('wheel', e => { e.preventDefault(); this.orbitGoal.radius=clamp(this.orbitGoal.radius*Math.exp(e.deltaY*.0009),3.2,17); }, {passive:false});
    this.canvas.style.cursor='grab';
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(this.canvas); }
  }

  resize() {
    const rect=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,rect.width); this.height=Math.max(1,rect.height);
    this.renderer.setSize(this.width,this.height,false); this.camera.aspect=this.width/this.height; this.camera.updateProjectionMatrix();
  }

  setCutaway(enabled) { this.cutaway=Boolean(enabled); }
  setLabels(enabled) { this.labels=Boolean(enabled); }

  setView(name) {
    const views={
      overview:{theta:-.68,phi:1.14,radius:10.2,target:[-.05,1.6,.25]},
      pocket:{theta:-1.20,phi:1.21,radius:7.2,target:[-.63,1.94,-.07]},
      filter:{theta:-.53,phi:1.07,radius:5.45,target:[.05,.60,.23]},
      drying:{theta:-.89,phi:1.11,radius:7.3,target:[-.1,2.21,.03]}
    };
    const view=views[name] || views.overview;
    this.view=name;
    this.orbitGoal={theta:view.theta,phi:view.phi,radius:view.radius}; this.targetGoal.set(...view.target);
  }

  updateCamera(k) {
    this.orbit.theta=easeTo(this.orbit.theta,this.orbitGoal.theta,k);
    this.orbit.phi=easeTo(this.orbit.phi,this.orbitGoal.phi,k);
    this.orbit.radius=easeTo(this.orbit.radius,this.orbitGoal.radius,k);
    this.target.lerp(this.targetGoal,k);
    if(this.target.distanceToSquared(this.targetGoal)<1e-8) this.target.copy(this.targetGoal);
    const o=this.orbit;
    // Vertical canvases need a wider effective distance to keep both side pocket and door in frame.
    const portraitScale=Math.max(1,1.05/this.camera.aspect);
    const r=o.radius*portraitScale;
    this.camera.position.set(this.target.x+Math.sin(o.theta)*Math.sin(o.phi)*r,this.target.y+Math.cos(o.phi)*r,this.target.z+Math.cos(o.theta)*Math.sin(o.phi)*r);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }

  update(state = {}, dt = 1 / 60) {
    const elapsed=clamp(Number(dt)||0,0,.12);
    const cycleTime=Number(state.time)||0, visualTime=cycleTime;
    const soil=clamp(state.soil ?? 1), wetness=clamp(state.wetness ?? 0), spray=clamp(state.spray ?? 0);
    const drying=clamp(state.drying ?? 0), waterLevel=clamp(state.waterLevel ?? 0);
    const pocketLevel=clamp(state.pocketLevel ?? 0), evaporation=clamp(state.evaporation ?? drying);
    const condensation=clamp(state.condensation ?? drying);
    const k=1-Math.exp(-elapsed*7);
    this.updateCamera(k);
    this.doorAngle=state.complete ? Math.PI/2 : Math.PI/2*(1-clamp(cycleTime));
    this.door.rotation.x=this.doorAngle;
    this.shellMaterials.forEach(mat=>mat.opacity=easeTo(mat.opacity,this.cutaway ? .08 : .94,k));
    // Door pose and transparency must agree immediately after a timeline seek.
    this.doorMaterial.opacity=this.cutaway ? (this.doorAngle>.4 ? .42 : .07) : .96;
    this.water.visible=waterLevel>.005; this.water.scale.y=.8+waterLevel*4.8; this.water.position.y=.535+waterLevel*.042;
    this.mat.water.color.set('#20a2c4');
    this.mat.heat.emissiveIntensity=state.heater ? .85 : .03;
    this.wallTint.opacity=.035+condensation*.16;
    const serviceView=this.view==='filter' && this.cutaway;
    this.mat.water.opacity=serviceView?.16:.42;
    this.baseMaterial.opacity=easeTo(this.baseMaterial.opacity,serviceView?.09:1,k);
    this.baseMaterial.depthWrite=!serviceView;
    for(const name of ['ceramic','ceramicLight','rim','wire']) {
      const material=this.mat[name];
      if(material.transparent!==serviceView){material.transparent=serviceView;material.needsUpdate=true;}
      material.opacity=serviceView?.10:1;material.depthWrite=!serviceView;
    }
    this.dispenser.visible=!serviceView;
    this.soilMeshes.forEach(({mesh,threshold})=>{ const amount=clamp((soil-threshold*.26)/(1-threshold*.26));mesh.material.opacity=amount*.92;mesh.visible=amount>.012&&!serviceView;mesh.scale.z=Math.max(.01,amount); });
    this.wetDrops.forEach(({mesh,threshold})=>{ mesh.visible=wetness>threshold*.8+.025&&!serviceView; });
    this.pocketGeometry.setDrawRange(0,Math.floor(this.pocketTotalIndices*pocketLevel/6)*6);
    this.pocketReservoir.visible=pocketLevel>.01; this.pocketReservoir.scale.y=Math.max(.01,pocketLevel);this.pocketReservoir.position.y=.61+pocketLevel*.16;
    const pocketWarm=clamp(((state.pocketTemp ?? 18)-18)/38);
    this.pocketFlowMat.color.set('#149bc2').lerp(new THREE.Color('#e7992d'),pocketWarm);
    this.dispenserLid.rotation.y=state.detergentCompartmentOpen || state.detergentReleased ? -1.83 : 0;
    const tabletAmount=clamp(state.detergentTablet ?? (state.detergentReleased ? 0 : 1));
    this.tablet.scale.setScalar(Math.max(.001,tabletAmount)); this.tablet.visible=tabletAmount>.025;
    this.arms.forEach(arm=>this.updateSprayArm(arm,spray,state.sprayTime ?? visualTime,visualTime));
    this.flowPaths.forEach(({kind,curve,particles})=>{
      const active=clamp(kind==='circulating' ? (state.circulating ?? spray)
        : kind==='supply' ? state.pocketFilling
        : kind==='pocketOutlet' ? state.pocketRelease
        : kind==='directFill' ? (state.fill && state.phase?.id==='final-rinse')
        : state[kind] ?? 0);
      particles.visible=active>.015;
      for(let i=0;i<particles.count;i++) {
        const t=(i/particles.count+visualTime*(kind==='drain'?.4:.26))%1;
        DUMMY.position.copy(curve.getPoint(t));DUMMY.quaternion.identity();DUMMY.scale.setScalar(.45+active*.55);DUMMY.updateMatrix();particles.setMatrixAt(i,DUMMY.matrix);
      }
      particles.instanceMatrix.needsUpdate=true;
    });
    for(let i=0;i<this.filterDebris.count;i++) {
      const a=i*2.39996,r=.05+RANDOM(i*7)*.15,amount=clamp(state.filterSoil ?? (1-soil)*.65);
      DUMMY.position.set(Math.cos(a)*r,.206+RANDOM(i)*.02,Math.sin(a)*r);DUMMY.quaternion.identity();DUMMY.scale.setScalar(i/this.filterDebris.count<amount ? .6+RANDOM(i)*.9 : 0);DUMMY.updateMatrix();this.filterDebris.setMatrixAt(i,DUMMY.matrix);
    }
    this.filterDebris.instanceMatrix.needsUpdate=true;
    this.updateAtmosphere(state,visualTime,evaporation,condensation,pocketLevel);
    this.renderer.render(this.scene,this.camera);
  }

  updateSprayArm(arm,spray,sprayTime,time) {
    const {group,nozzles,geometry,streams,jetBodies,drops,index}=arm;
    group.rotation.y=(index?-1:1)*sprayTime*2.6;
    streams.visible=jetBodies.visible=drops.visible=spray>.02;arm.material.opacity=.25+spray*.48;
    const a=geometry.attributes.position.array;let p=0,d=0,jet=0;
    nozzles.forEach((n,j)=>{
      for(let step=0;step<8;step++) {
        const t0=step/8,t1=(step+1)/8;
        [t0,t1].forEach(t=>{a[p++]=n.x+n.vx*t*t;a[p++]=.055+n.h*t*spray;a[p++]=n.z+n.vz*t*t;});
        const start=v3(n.x+n.vx*t0*t0,.055+n.h*t0*spray,n.z+n.vz*t0*t0);
        const end=v3(n.x+n.vx*t1*t1,.055+n.h*t1*spray,n.z+n.vz*t1*t1);
        const direction=end.clone().sub(start);
        DUMMY.position.copy(start.add(end).multiplyScalar(.5));DUMMY.quaternion.setFromUnitVectors(UP,direction.clone().normalize());DUMMY.scale.set(1,direction.length(),1);DUMMY.updateMatrix();jetBodies.setMatrixAt(jet++,DUMMY.matrix);
      }
      for(let i=0;i<7;i++) {
        const t=(i/7+time*(1.0+j*.016))%1;
        DUMMY.position.set(n.x+n.vx*t*t,.055+n.h*t*spray,n.z+n.vz*t*t);
        DUMMY.quaternion.identity();DUMMY.scale.set(.8,2.2,.8);DUMMY.updateMatrix();drops.setMatrixAt(d++,DUMMY.matrix);
      }
    });
    geometry.attributes.position.needsUpdate=true;jetBodies.instanceMatrix.needsUpdate=true;drops.instanceMatrix.needsUpdate=true;
  }

  updateAtmosphere(state,time,evaporation,condensation,pocketLevel) {
    this.vapor.visible=evaporation>.025;
    this.vapor.material.opacity=.06+evaporation*.24;
    for(let i=0;i<this.vapor.count;i++) {
      const t=(time*.17+RANDOM(i*3))%1;
      const sourceX=lerp(-1,1,RANDOM(i*17)),sourceZ=lerp(-.85,.8,RANDOM(i*29));
      DUMMY.position.set(lerp(sourceX,-1.23,t*.55)+Math.sin(t*6+i)*.06,1.4+t*2.13,sourceZ);
      DUMMY.quaternion.identity();const scale=Math.sin(t*Math.PI)*(.8+evaporation*1.7);DUMMY.scale.set(scale,scale*1.6,scale);DUMMY.updateMatrix();this.vapor.setMatrixAt(i,DUMMY.matrix);
    }
    this.vapor.instanceMatrix.needsUpdate=true;
    this.condensate.visible=condensation>.015;
    for(let i=0;i<this.condensate.count;i++) {
      const t=(time*.105+RANDOM(i*11))%1;
      DUMMY.position.set(-1.302,3.42-t*2.83,lerp(-1.04,1.05,RANDOM(i*9)));
      DUMMY.quaternion.identity();const s=clamp(condensation*1.9)*(.6+RANDOM(i)*.6);DUMMY.scale.set(s*.5,s*(1.15+t*2),s);DUMMY.updateMatrix();this.condensate.setMatrixAt(i,DUMMY.matrix);
    }
    this.condensate.instanceMatrix.needsUpdate=true;
    this.soapParticles.visible=(state.detergent ?? 0)>.015 && (state.spray ?? 0)>.01;
    for(let i=0;i<this.soapParticles.count;i++) {
      const t=(time*.31+RANDOM(i*7))%1;
      DUMMY.position.set(Math.sin(i*7.13+t*6)*1.09,.6+t*2.52,Math.cos(i*3.79+t*5)*.96);
      DUMMY.quaternion.identity();DUMMY.scale.setScalar(.55+Math.sin(t*Math.PI)*.65);DUMMY.updateMatrix();this.soapParticles.setMatrixAt(i,DUMMY.matrix);
    }
    this.soapParticles.instanceMatrix.needsUpdate=true;
    this.pocketBubbles.visible=pocketLevel>.03 && Boolean(state.pocketFilling);
    for(let i=0;i<this.pocketBubbles.count;i++) {
      const t=((time*.11+i/this.pocketBubbles.count)%1)*Math.max(.001,pocketLevel);
      DUMMY.position.copy(this.pocketCurve.getPoint(t));DUMMY.quaternion.identity();DUMMY.scale.setScalar(1);DUMMY.updateMatrix();this.pocketBubbles.setMatrixAt(i,DUMMY.matrix);
    }
    this.pocketBubbles.instanceMatrix.needsUpdate=true;
    this.heatTransfer.visible=(state.heatRecovery ?? 0)>.01;
    for(let i=0;i<this.heatTransfer.count;i++) {
      const t=(time*.42+RANDOM(i*13))%1;
      DUMMY.position.set(-1.21-t*.42,.88+RANDOM(i*7)*2.2,-.91+RANDOM(i*17)*1.73);
      DUMMY.quaternion.identity();DUMMY.scale.set(2.4,.64,.64);DUMMY.updateMatrix();this.heatTransfer.setMatrixAt(i,DUMMY.matrix);
    }
    this.heatTransfer.instanceMatrix.needsUpdate=true;
  }

  getAnchors() {
    if(!this.labels) return [];
    this.machine.updateMatrixWorld();
    return Object.entries(this.anchorPoints).filter(([id])=>this.view==='filter' || !['pump','drain','heater'].includes(id)).map(([id,point])=>{
      let p=point.clone();
      if(id==='detergent') { p.set(-.69,1.4,-.10); this.door.localToWorld(p); }
      p.project(this.camera);
      return {id,x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height,visible:p.z>-1 && p.z<1 && Math.abs(p.x)<1.06 && Math.abs(p.y)<1.06};
    });
  }

  dispose() {
    this.resizeObserver?.disconnect();this.listeners.forEach(([name,fn,options])=>this.canvas.removeEventListener(name,fn,options));
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.renderer.dispose();
  }
}
