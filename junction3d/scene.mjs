import * as THREE from '../pinsim/three.module.min.js';
import { buildPath, samplePath } from './engine.mjs';
import { buildEnvironment } from './environment.mjs';

// The renderer knows road geometry, routes and scene objects, never street names.
export function createScene(canvas, config) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c4d9df');
  scene.fog = new THREE.Fog('#c4d9df', 270, 710);
  const camera = new THREE.PerspectiveCamera(48, 1, .3, 1100);
  const sky = new THREE.HemisphereLight('#d6e7ff', '#7d8068', 2.4);
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff0d4', 3.1);
  sun.position.set(-100, 160, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 5, far: 500 });
  sun.shadow.normalBias = .16;
  sun.shadow.bias = -.00015;
  scene.add(sun);

  let seed = 831;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(base, variation, repeat) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(256, 256);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = (rand() - .5) * variation;
      data.data[i] = base[0] + v; data.data[i + 1] = base[1] + v; data.data[i + 2] = base[2] + v; data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return t;
  }
  const grass = new THREE.MeshStandardMaterial({ map: texture([100, 120, 75], 32, 100), roughness: 1 });
  const asphalt = new THREE.MeshStandardMaterial({ map: texture([91, 94, 90], 20, 1), roughness: .94 });
  const pavement = new THREE.MeshStandardMaterial({ color: '#b8b6a5', roughness: 1 });
  const marking = new THREE.MeshStandardMaterial({ color: '#e4e2cf', roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#87918c', metalness: .55, roughness: .4 });
  const black = new THREE.MeshStandardMaterial({ color: '#17211f', roughness: .65 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.025; ground.receiveShadow = true; scene.add(ground);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function box(parent, mat, x, y, z, w, h, d) {
    const m = new THREE.Mesh(boxGeo, mat); m.position.set(x, y, z); m.scale.set(w, h, d);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function strip(path, width, material, height, start = 0, end = path.length) {
    const positions = [], uvs = [], indices = [];
    const steps = Math.max(1, Math.ceil((end - start) / 1.5));
    for (let i = 0; i <= steps; i++) {
      const s = start + (end - start) * i / steps, p = samplePath(path, s);
      const nx = Math.cos(p.heading) * width / 2, nz = -Math.sin(p.heading) * width / 2;
      positions.push(p.x + nx, height, p.z + nz, p.x - nx, height, p.z - nz);
      uvs.push(0, s / 6, width / 6, s / 6);
      if (i < steps) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; scene.add(m); return m;
  }
  const roads = config.roads.map(road => ({ ...road, path: buildPath(road.points) }));
  roads.forEach(r => strip(r.path, r.width + 5.2, pavement, .005));
  roads.forEach(r => strip(r.path, r.width, asphalt, .035));
  const bounds = config.conflictBounds;
  const inJunction = p => p.x > bounds.minX - 3 && p.x < bounds.maxX + 3 && p.z > bounds.minZ - 7 && p.z < bounds.maxZ + 7;
  // Paint only outside the crossing; each lane uses its actual route heading.
  for (const road of roads) {
    for (let s = 0; s < road.path.length - 3; s += 6) {
      const p = samplePath(road.path, s + 1.5);
      if (inJunction(p)) continue;
      for (let lane = 1; lane < road.lanes; lane++) {
        const offset = -road.width / 2 + lane * road.width / road.lanes;
        const m = box(scene, marking, p.x + Math.cos(p.heading) * offset, .056, p.z - Math.sin(p.heading) * offset, .12, .016, 3);
        m.rotation.y = p.heading; m.castShadow = false;
      }
      for (const side of [-1, 1]) {
        const offset = side * (road.width / 2 - .2);
        const m = box(scene, marking, p.x + Math.cos(p.heading) * offset, .055, p.z - Math.sin(p.heading) * offset, .12, .012, 6);
        m.rotation.y = p.heading; m.castShadow = false;
      }
    }
  }

  function arrow(turn) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const ctx = c.getContext('2d'); ctx.strokeStyle = ctx.fillStyle = '#e1e1ce'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(64, 230);
    if (turn === 'straight') { ctx.lineTo(64, 50); ctx.stroke(); ctx.beginPath(); ctx.moveTo(64, 20); ctx.lineTo(27, 87); ctx.lineTo(101, 87); }
    else { const sign = turn === 'left' ? -1 : 1; ctx.lineTo(64, 140); ctx.quadraticCurveTo(64, 91, 64 + sign * 28, 91); ctx.stroke(); ctx.beginPath(); ctx.moveTo(64 + sign * 58, 91); ctx.lineTo(64 + sign * 14, 49); ctx.lineTo(64 + sign * 14, 133); }
    ctx.closePath(); ctx.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1 });
  }
  const arrows = { straight: arrow('straight'), left: arrow('left'), right: arrow('right') };
  const signalHeads = [];
  const occupiedLanes = new Set();
  const lampGeo = new THREE.SphereGeometry(.16, 12, 8);
  const darkLamp = ['#541c14', '#60511e', '#133c28'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .3 }));
  const litLamp = ['#ff281c', '#ffc338', '#36fa80'].map(color => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const processedRoutes = config.routes.map(route => {
    const path = buildPath(route.points);
    let nearest = 0, distance = Infinity;
    for (let s = 0; s <= path.length; s += .25) { const p = samplePath(path, s), d = Math.hypot(p.x - route.stopLine[0], p.z - route.stopLine[1]); if (d < distance) { distance = d; nearest = s; } }
    return { ...route, path, stopDistance: nearest };
  });
  // Turning-lane flares soften the road joins without filling the planted median.
  for (const route of processedRoutes.filter(r => r.turn !== 'straight')) {
    let end = route.stopDistance;
    while (end < route.path.length && inJunction(samplePath(route.path, end))) end += 1;
    strip(route.path, 4.5, asphalt, .034, Math.max(0, route.stopDistance - 3), end + 2);
  }
  const clusters = [];
  for (const route of processedRoutes) {
    if (occupiedLanes.has(route.laneId)) continue;
    occupiedLanes.add(route.laneId);
    const p = samplePath(route.path, route.stopDistance);
    const line = box(scene, marking, p.x, .063, p.z, 3.2, .02, .45); line.rotation.y = p.heading; line.castShadow = false;
    for (const before of [14, 35, 60]) {
      const a = samplePath(route.path, route.stopDistance - before);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 4.1), arrows[route.turn]);
      m.rotation.set(-Math.PI / 2, 0, a.heading + Math.PI); m.position.set(a.x, .067, a.z); scene.add(m);
    }
    let cluster = clusters.find(c => c.group === route.group && Math.hypot(c.center.x - p.x, c.center.z - p.z) < 16);
    if (!cluster) { cluster = { group: route.group, center: p, stops: [] }; clusters.push(cluster); }
    cluster.stops.push(p);
  }
  // Short boundary dashes guide traffic across the separate carriageways.
  for (const route of processedRoutes) {
    for (let s = route.stopDistance + 6; s < route.path.length; s += 5) {
      const p = samplePath(route.path, s);
      if (!inJunction(p)) break;
      const m = box(scene, marking, p.x + Math.cos(p.heading) * 1.65, .061, p.z - Math.sin(p.heading) * 1.65, .1, .014, 1.3);
      m.rotation.y = p.heading; m.castShadow = false;
    }
  }
  for (const cluster of clusters) {
    const heading = cluster.center.heading;
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
    const center = new THREE.Vector3(); cluster.stops.forEach(p => center.add(new THREE.Vector3(p.x, 0, p.z))); center.divideScalar(cluster.stops.length);
    for (const ahead of [2.5, 5]) for (let across = -cluster.stops.length * 1.75; across <= cluster.stops.length * 1.75; across += 1.15) {
      const p = center.clone().addScaledVector(dir, ahead).addScaledVector(right, across);
      const m = box(scene, marking, p.x, .061, p.z, .6, .015, .35); m.rotation.y = heading; m.castShadow = false;
    }
    const anchor = center.clone().addScaledVector(right, cluster.stops.length * 1.8 + 1).addScaledVector(dir, 1.1);
    const outer = center.clone().addScaledVector(right, -cluster.stops.length * 1.8 + .8).addScaledVector(dir, 1.1);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(anchor.x, 0, anchor.z), new THREE.Vector3(anchor.x, 4.1, anchor.z), new THREE.Vector3(anchor.x, 5.9, anchor.z), new THREE.Vector3(center.x + dir.x, 6.6, center.z + dir.z), new THREE.Vector3(outer.x, 6.6, outer.z)]);
    const pole = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, .11, 8, false), metal); pole.castShadow = true; scene.add(pole);
    for (const p of cluster.stops) {
      const group = new THREE.Group(); group.position.set(p.x + dir.x, 5.6, p.z + dir.z); group.rotation.y = heading + Math.PI; scene.add(group);
      box(group, black, 0, 0, 0, .66, 1.85, .34);
      const lamps = [0, 1, 2].map((n) => { const lamp = new THREE.Mesh(lampGeo, darkLamp[n]); lamp.position.set(0, .57 - n * .57, .2); lamp.scale.z = .45; group.add(lamp); box(group, black, 0, .81 - n * .57, .33, .58, .055, .5); return lamp; });
      signalHeads.push({ lamps, group: cluster.group });
    }
    // A lower repeat signal makes the indication visible in roadside views.
    const repeat = new THREE.Group(); repeat.position.set(anchor.x, 2.6, anchor.z); repeat.rotation.y = heading + Math.PI; scene.add(repeat);
    box(repeat, black, 0, 0, 0, .48, 1.43, .3);
    const lamps = [0, 1, 2].map(n => { const m = new THREE.Mesh(lampGeo, darkLamp[n]); m.position.set(0, .43 - n * .43, .18); m.scale.set(.8, .8, .4); repeat.add(m); return m; });
    signalHeads.push({ lamps, group: cluster.group });
  }

  // Hundreds of road-paint segments share one draw call instead of one each.
  const batches = new Map();
  for (const mesh of [...scene.children]) {
    if (!mesh.isMesh || mesh.geometry !== boxGeo) continue;
    const key = `${mesh.material.uuid}-${mesh.castShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    const batch = new THREE.InstancedMesh(boxGeo, meshes[0].material, meshes.length);
    batch.castShadow = meshes[0].castShadow; batch.receiveShadow = true;
    meshes.forEach((mesh, index) => { mesh.updateMatrix(); batch.setMatrixAt(index, mesh.matrix); scene.remove(mesh); });
    batch.computeBoundingSphere(); scene.add(batch);
  }
  buildEnvironment(THREE, scene, config);
  const carTemplates = new Map();
  const carMeshes = new Map();
  const carColors = ['#ecede7', '#324a5e', '#3b4144', '#984235', '#aab4b4', '#d4cbb5', '#305c58', '#353237', '#bd9a50'];
  const tireMat = new THREE.MeshStandardMaterial({ color: '#17201f', roughness: .95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#9ca9ad', metalness: .8, roughness: .26 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#496573', metalness: .45, roughness: .19 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#f2ecd3', emissive: '#ffefc8', emissiveIntensity: .4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#9b2118', emissive: '#ee2818', emissiveIntensity: .25 });
  const brakeMat = new THREE.MeshBasicMaterial({ color: '#ff2c19', toneMapped: false });
  const blinkMat = new THREE.MeshBasicMaterial({ color: '#ffae18', toneMapped: false });
  const blinkOff = new THREE.MeshStandardMaterial({ color: '#955b29' });
  const tireGeo = new THREE.CylinderGeometry(.34, .34, .21, 12); tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(.19, .19, .225, 10); hubGeo.rotateZ(Math.PI / 2);
  function cabinGeometry(width) {
    const bottom = width * .455, top = width * .385;
    const vertices = [-bottom,1.01,-1.43, bottom,1.01,-1.43, bottom,1.01,1.06, -bottom,1.01,1.06,
      -top,1.56,-1.13, top,1.56,-1.13, top,1.56,.53, -top,1.56,.53];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0, 4,7,6,4,6,5, 0,1,2,0,2,3]);
    geometry.computeVertexNormals(); return geometry;
  }
  function carTemplate(kind, color) {
    const key = `${kind}-${color}`; if (carTemplates.has(key)) return carTemplates.get(key);
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: carColors[color % carColors.length], metalness: .34, roughness: .32 });
    const van = kind === 'van', bus = kind === 'bus';
    const length = bus ? 10.8 : van ? 5.7 : 4.5, width = bus ? 2.5 : van ? 2.05 : 1.82;
    box(group, tireMat, 0, .41, 0, width * .93, .35, length * .96);
    box(group, bodyMat, 0, .74, 0, width, .61, length);
    if (van || bus) box(group, glassMat, 0, van ? 1.38 : 1.85, bus ? 0 : -.22, width * .88, bus ? 1.5 : 1, bus ? length * .94 : length * .78);
    else { const cabin = new THREE.Mesh(cabinGeometry(width), glassMat); cabin.castShadow = true; group.add(cabin); }
    box(group, bodyMat, 0, bus ? 2.66 : van ? 1.95 : 1.59, bus ? 0 : -.3, width * (van || bus ? .9 : .79), .1, bus ? length * .96 : van ? length * .8 : 1.72);
    if (van || bus) {
      for (let z = -length * .37; z < length * .45; z += bus ? 1.5 : 2) box(group, bodyMat, 0, bus ? 1.85 : 1.4, z, width * .91, bus ? 1.5 : 1, .09);
      if (van) box(group, bodyMat, 0, 1.4, -1.15, width * .93, .95, 2.6);
    } else {
      // Roof pillars, rear window, hood and side mirrors preserve a readable car silhouette.
      for (const side of [-1, 1]) {
        for (const [z, slope] of [[-1.28, .49], [-.22, 0], [.79, -.73]]) { const m = box(group, bodyMat, side * width * .423, 1.29, z, .055, .65, .065); m.rotation.x = slope; }
        for (const z of [-.7, .48]) box(group, hubMat, side * width * .502, .96, z, .018, .035, .18);
      }
      box(group, bodyMat, 0, 1.0, 1.52, width * .96, .14, 1.18);
      box(group, bodyMat, 0, 1.0, -1.7, width * .96, .12, .95);
    }
    for (const side of [-1, 1]) {
      box(group, bodyMat, side * (width / 2 + .06), 1.04, .75, .23, .13, .31);
      for (const z of [-length * .31, length * .31]) {
        const tire = new THREE.Mesh(tireGeo, tireMat); tire.position.set(side * width / 2, .37, z); tire.castShadow = true; group.add(tire);
        const hub = new THREE.Mesh(hubGeo, hubMat); hub.position.copy(tire.position); group.add(hub);
      }
      box(group, headMat, side * width * .32, .79, length / 2 + .015, .43, .2, .04);
      const tail = box(group, tailMat, side * width * .34, .8, -length / 2 - .015, .34, .22, .04); tail.name = 'brake';
      for (const z of [-length / 2 - .02, length / 2 + .02]) { const blink = box(group, blinkOff, side * width * .43, .79, z, .13, .14, .045); blink.name = side > 0 ? 'blink-left' : 'blink-right'; }
    }
    box(group, black, 0, .59, length / 2 + .02, .66, .19, .05);
    box(group, headMat, 0, .64, -length / 2 - .035, .38, .11, .01);
    carTemplates.set(key, group); return group;
  }

  const mounts = new THREE.Group(); scene.add(mounts);
  function setMounts(cameras) {
    mounts.clear();
    for (const c of cameras) {
      if (c.position[1] > 45) continue;
      const [x, y, z] = c.position;
      box(mounts, metal, x, y / 2, z, .13, y, .13);
      const rig = new THREE.Group(); rig.position.set(x, y, z); rig.lookAt(...c.target); mounts.add(rig);
      // The viewpoint is the lens origin, with the physical housing behind it.
      box(rig, pavement, 0, 0, -.7, .4, .3, .72); box(rig, black, 0, 0, -.33, .25, .18, .035);
    }
  }
  setMounts(config.cameras);
  function update(simulation) {
    const live = new Set();
    for (const vehicle of simulation.vehicles) {
      live.add(vehicle.id);
      let model = carMeshes.get(vehicle.id);
      if (!model) { model = carTemplate(vehicle.kind, vehicle.color || 0).clone(true); carMeshes.set(vehicle.id, model); scene.add(model); }
      const actualLength = vehicle.kind === 'bus' ? 10.8 : vehicle.kind === 'van' ? 5.7 : 4.5;
      model.scale.z = vehicle.length / actualLength;
      model.position.set(vehicle.x, .04, vehicle.z); model.rotation.y = vehicle.heading;
      const blink = Math.floor(simulation.elapsed * 2.5) % 2 === 0;
      model.children.forEach(m => {
        if (m.name === 'brake') m.material = vehicle.braking ? brakeMat : tailMat;
        else if (m.name.startsWith('blink-')) m.material = vehicle.turn !== 'straight' && m.name === `blink-${vehicle.turn}` && blink && vehicle.distance < vehicle.route.clearDistance ? blinkMat : blinkOff;
      });
    }
    for (const [id, mesh] of carMeshes) { if (!live.has(id)) { scene.remove(mesh); carMeshes.delete(id); } }
    for (const head of signalHeads) {
      const state = simulation.getSignal(head.group);
      head.lamps.forEach((m, n) => { m.material = (n === 0 && (state === 'red' || state === 'redAmber')) || (n === 1 && (state === 'yellow' || state === 'redAmber')) || (n === 2 && state === 'green') ? litLamp[n] : darkLamp[n]; });
    }
  }
  function setEvening(enabled) {
    scene.background.set(enabled ? '#647888' : '#c4d9df'); scene.fog.color.copy(scene.background);
    sun.color.set(enabled ? '#ffb16b' : '#fff0d4'); sun.intensity = enabled ? 1.8 : 3.1;
    sun.position.set(enabled ? -170 : -100, enabled ? 65 : 160, 90);
    sky.intensity = enabled ? 1.25 : 2.4; renderer.toneMappingExposure = enabled ? 1.02 : 1.18;
    headMat.emissiveIntensity = enabled ? 2.8 : .4;
  }
  function resize() { const { width, height } = canvas.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); }
  function render() { renderer.render(scene, camera); }
  return { scene, camera, renderer, roads, update, resize, render, setEvening, setMounts, THREE };
}
