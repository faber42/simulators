import * as THREE from '../pinsim/three.module.min.js';
import { AREA_PREFIXES, ENTRANCE_SITES, EXTERNAL_GATE_POSITION, areaOrigin, racksInArea, sitesInArea } from './topology.mjs';

// Permanent rack geometry for the whole office. Individual mechanisms are
// revealed near a camera; distant racks use the same repeating contact pattern.
const cube = new THREE.BoxGeometry(1, 1, 1), face = new THREE.PlaneGeometry(1, 1);
const iron = new THREE.MeshStandardMaterial({ color: '#586052', metalness: .65, roughness: .5 });
const bank = new THREE.MeshStandardMaterial({ color: '#373f36', metalness: .4, roughness: .6 });
const metal = new THREE.MeshStandardMaterial({ color: '#b8b4a0', metalness: .8, roughness: .35 });
const coil = new THREE.MeshStandardMaterial({ color: '#91724b', metalness: .65, roughness: .5 });
const dummy = new THREE.Object3D();

function instances(parent, geometry, material, parts) {
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  parts.forEach(([x, y, z, w, h, d], i) => {
    dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); parent.add(mesh); return mesh;
}
function rackTexture(rows, occupied) {
  const c = document.createElement('canvas'); c.width = 640; c.height = rows * 64;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#202a23'; ctx.fillRect(0, 0, c.width, c.height);
  for (let row = rows - occupied; row < rows; row++) for (let col = 0; col < 10; col++) {
    const x = col * 64, y = row * 64;
    ctx.fillStyle = '#62695b'; ctx.fillRect(x + 2, y + 1, 2, 60); ctx.fillRect(x + 58, y + 1, 2, 60);
    for (let band = 0; band < 3; band++) for (let level = 0; level < 6; level++) {
      ctx.fillStyle = level % 2 ? '#919482' : '#565f53'; ctx.fillRect(x + 9, y + 10 + band * 14 + level * 1.7, 30, 1);
    }
    ctx.fillStyle = '#bbb7a0'; ctx.fillRect(x + 24, y + 5, 3, 50);
    ctx.fillStyle = '#9c7e50'; ctx.fillRect(x + 46, y + 14, 8, 13); ctx.fillRect(x + 46, y + 35, 8, 13);
    ctx.fillStyle = '#7e8069'; ctx.fillRect(x, y + 61, 64, 3);
  }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: .75, metalness: .25 });
}
const rackMaterials = new Map();
function label(parent, text, position, width = 22) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#1b2a24'; ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#6a7a62'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#c5cbb6'; ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.position.fromArray(position); sprite.scale.set(width, width / 4, 1); parent.add(sprite); return sprite;
}
function racks(parent, descriptors) {
  const frames = [], backs = [], fronts = new Map();
  for (const r of descriptors) {
    const [x, , z] = r.position, h = r.shelves * 2.55;
    backs.push([x + 10.8, h / 2 + .4, z - 1, 24, h, .16]);
    for (const dx of [-1.3, 22.9]) frames.push([x + dx, h / 2, z + .8, .16, h + 1, .19]);
    for (let shelf = 0; shelf <= r.shelves; shelf++) frames.push([x + 10.8, .34 + shelf * 2.55, z, 24.4, .14, 2.2]);
    const key = `${r.shelves}/${r.occupied ?? r.shelves}`;
    if (!fronts.has(key)) fronts.set(key, []);
    fronts.get(key).push([x + 10.8, h / 2 + .42, z + .1, 24, h, 1]);
  }
  instances(parent, cube, iron, frames); instances(parent, cube, bank, backs);
  const facade = new THREE.Group(); parent.add(facade);
  for (const [key, parts] of fronts) {
    if (!rackMaterials.has(key)) rackMaterials.set(key, rackTexture(...key.split('/').map(Number)));
    instances(facade, face, rackMaterials.get(key), parts);
  }
  return facade;
}
function mechanisms(parent, sites, held) {
  const group = new THREE.Group(); parent.add(group);
  const banks = [], spindles = [], coils = [];
  for (const s of sites) {
    const [x, y, z] = s.position, hidden = held.has(s.id), size = hidden ? 0 : 1;
    for (let n = 0; n < 3; n++) banks.push([x - .23, y + .7 + n * .55, z - .05, 1.35 * size, .42 * size, .92 * size]);
    spindles.push([x - .22, y + 1.17, z + .53, .085 * size, 2.22 * size, .085 * size]);
    for (let n = 0; n < 2; n++) coils.push([x + .67, y + .65 + n * .85, z + .15, .34 * size, .49 * size, .35 * size]);
  }
  instances(group, cube, bank, banks); instances(group, cube, metal, spindles); instances(group, cube, coil, coils);
  return group;
}
function disposeInstances(group) {
  group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); group.removeFromParent();
}

export class OfficeScene {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.userData.dynamic = true; scene.add(this.root);
    this.areas = []; this.held = new Set([ENTRANCE_SITES[0].id]); this.heldKey = ''; this.clock = 0;
    for (const prefix of AREA_PREFIXES) {
      const group = new THREE.Group(); this.root.add(group);
      const facade = racks(group, racksInArea(prefix)), origin = new THREE.Vector3(...areaOrigin(prefix));
      const sign = label(group, `${prefix}xxxx`, [origin.x, 20, origin.z - 42], 36);
      this.areas.push({ prefix, group, facade, origin, sign, detail: null, touched: 0 });
    }
    const entranceRacks = ENTRANCE_SITES.filter(s => s.slot === 0).map(s => ({ position: [s.position[0], 0, s.position[2]], shelves: 1 }));
    this.entrance = new THREE.Group(); this.root.add(this.entrance);
    this.entranceFacade = racks(this.entrance, entranceRacks);
    this.entranceSigns = ENTRANCE_SITES.filter(s => s.slot === 0).map(s => label(this.entrance,
      s.stage === 0 ? 'ANRUFSUCHER' : s.stage === 1 ? 'AMTSZUGANG' : `${s.prefix}xxxxx`,
      [s.position[0] + 10.8, 4.5, s.position[2]], s.stage < 2 ? 16 : 22));
    this.entranceSigns.push(label(this.entrance, '← 0 FERNAMT', [EXTERNAL_GATE_POSITION[0], 10, EXTERNAL_GATE_POSITION[2]], 48));
    this.entranceDetail = mechanisms(this.entrance, ENTRANCE_SITES, this.held);
    this.highlights = new THREE.Group(); this.root.add(this.highlights);
    this.highlightMaterial = new THREE.LineBasicMaterial({ color: '#e9b76d', depthTest: false, transparent: true, opacity: .85 });
  }
  setHeld(sites, connected) {
    this.highlightMaterial.color.set(connected ? '#96dfb5' : '#e9b76d');
    const key = sites.map(s => s.id).join('|'); if (key === this.heldKey) return;
    // The source finder always has its detailed mechanism, including at rest.
    this.heldKey = key; this.held = new Set([ENTRANCE_SITES[0].id, ...sites.map(s => s.id)]);
    for (const area of this.areas) if (area.detail) { disposeInstances(area.detail); area.detail = null; }
    disposeInstances(this.entranceDetail); this.entranceDetail = mechanisms(this.entrance, ENTRANCE_SITES, this.held);
    for (const child of [...this.highlights.children]) { child.geometry.dispose(); child.removeFromParent(); }
    const regions = new Set(sites.map(s => s.area).filter(Boolean));
    const outlined = new Set();
    for (const site of sites) if (!outlined.has(site.rack)) {
      outlined.add(site.rack);
      const h = site.stage >= 4 ? 15.3 : 2.55;
      const shape = new THREE.BoxGeometry(24.5, h + .5, 2.3), edges = new THREE.EdgesGeometry(shape); shape.dispose();
      const outline = new THREE.LineSegments(edges, this.highlightMaterial);
      outline.position.set(site.position[0] - site.slot * 2.4 + 10.8, h / 2 + .4, site.position[2]);
      outline.renderOrder = 4; this.highlights.add(outline);
    }
    for (const prefix of regions) {
      const [x, , z] = areaOrigin(prefix);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x - 63, 17, z + 14), new THREE.Vector3(x + 64, 17, z + 14),
        new THREE.Vector3(x + 64, 17, z - 85), new THREE.Vector3(x - 63, 17, z - 85),
      ]);
      const outline = new THREE.LineLoop(geometry, this.highlightMaterial); outline.renderOrder = 4; this.highlights.add(outline);
    }
  }
  prepare(camera, overview) {
    this.clock++;
    for (const area of this.areas) {
      const distance = camera.position.distanceTo(area.origin.clone().add(new THREE.Vector3(0, 6, -40)));
      area.group.visible = overview || distance < 230;
      const near = area.group.visible && distance < 135;
      if (near && !area.detail) area.detail = mechanisms(area.group, sitesInArea(area.prefix), this.held);
      if (near) area.touched = this.clock;
      if (area.detail) area.detail.visible = near;
      area.facade.visible = !near;
      area.sign.visible = overview;
    }
    // Keep a small reusable neighbourhood while the follow camera crosses the hall.
    const cached = this.areas.filter(a => a.detail).sort((a, b) => b.touched - a.touched);
    for (const area of cached.slice(8)) { disposeInstances(area.detail); area.detail = null; area.facade.visible = true; }
    this.entranceFacade.visible = overview && camera.position.y > 110;
    this.entranceDetail.visible = !this.entranceFacade.visible;
    this.entranceSigns.forEach(sign => { sign.visible = overview; });
    this.highlights.visible = overview;
  }
}
