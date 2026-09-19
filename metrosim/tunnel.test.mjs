import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { World } from './world.js';
import { point, trackX, branchAt, station } from './route.mjs';

// Exercise the actual merged scenery, without needing a WebGL context. The
// canvas stub only supplies the crowd's texture data during construction.
globalThis.document = { createElement: () => ({ getContext: () => ({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
}) }) };
function fixture() {
  const scene = new T.Scene(), material = new T.MeshStandardMaterial();
  const materials = new Proxy({ shadow: new T.Texture(), glow: new T.Texture(), sign: () => material,
    palette: () => material, tunnel: () => material, stationWall: () => material,
    posters: Array(6).fill(material) }, { get: (o, key) => o[key] ?? material });
  return { scene, world: new World(scene, materials) };
}
test('both portal openings and the rail paths are free of stray tunnel faces', () => {
  for (const index of [0, 1, 5, 18]) {
    const { scene, world } = fixture(), split = station(index).start - 102;
    for (let base = Math.floor((split - 48) / 24) * 24; base <= split + 324; base += 24) {
      for (const _ of world.build(base)) { /* complete each real scenery batch */ }
      world.chunks.get(base).group.position.set(trackX(base), 0, -base);
    }
    scene.updateMatrixWorld(true);
    const meshes = []; scene.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
    const sightline = (from, to) => {
      const origin = new T.Vector3(...from), target = new T.Vector3(...to);
      return new T.Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target) - .001).intersectObjects(meshes, false);
    };
    for (const depth of [2, 12, 24, 45]) {
      const targetS = split + depth;
      assert.equal(sightline(point(split - 39, 0, 2.22), point(targetS, branchAt(targetS).branchX, 2.22)).length, 0,
        `junction ${index}: alternate portal must reveal ${depth} m of bore`);
    }
    for (let s = split - 12; s < split + 70; s += 2) {
      assert.equal(sightline(point(s, 0, 2.22), point(s + 2, 0, 2.22)).length, 0, 'selected route remains traversable');
      if (s >= split) assert.equal(sightline(point(s, branchAt(s).branchX, 2.22), point(s + 2, branchAt(s + 2).branchX, 2.22)).length, 0,
        'alternate rails do not lead into a wall');
    }
    const end = split + 300;
    assert.equal(sightline(point(end - 12, 0, 2.22), point(end + 6, 0, 2.22)).length, 0,
      'the end of the distant bore must not stretch back across the running track');
    scene.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }
});
