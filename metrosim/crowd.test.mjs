import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { Crowd } from './crowd.js';
import { random } from './materials.js';

test('passengers use one skinned body draw with valid bounded skinning data', () => {
  // The mesh builder is independent of the browser-only cloth texture setup.
  const crowd = Object.create(Crowd.prototype); crowd.material = new T.MeshStandardMaterial();
  for (const seed of [12, 105, 906]) {
    const p = crowd.create(random(seed)), meshes = [];
    p.person.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 1); assert.equal(meshes[0].isSkinnedMesh, true);
    const mesh = meshes[0], g = mesh.geometry;
    g.computeBoundingBox(); assert.ok(g.boundingBox.min.y >= -.001 && g.boundingBox.max.y < 1.9);
    for (const attribute of ['position', 'normal', 'color', 'uv', 'skinWeight']) for (const value of g.attributes[attribute].array) assert.ok(Number.isFinite(value));
    for (let i = 0; i < g.attributes.skinWeight.count; i++) {
      const a = g.attributes.skinWeight.array, sum = a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] + a[i * 4 + 3];
      assert.ok(Math.abs(sum - 1) < 1e-6);
      for (let k = 0; k < 4; k++) assert.ok(g.attributes.skinIndex.array[i * 4 + k] < mesh.skeleton.bones.length);
    }
    // A head turn must deform facial vertices through the skeleton.
    const index = g.attributes.skinIndex.array.findIndex((value, i) => i % 4 === 0 && value === p.head.userData.index && Math.abs(g.attributes.position.getX(i / 4)) > .04) / 4;
    const before = new T.Vector3().fromBufferAttribute(g.attributes.position, index);
    const after = before.clone();
    p.person.updateMatrixWorld(true); mesh.skeleton.update(); mesh.applyBoneTransform(index, before);
    p.head.rotation.y += .4; p.person.updateMatrixWorld(true); mesh.skeleton.update(); mesh.applyBoneTransform(index, after);
    assert.ok(before.distanceTo(after) > .001);
    g.dispose(); mesh.skeleton.dispose();
  }
  crowd.material.dispose();
});
