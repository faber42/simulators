import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { Crowd } from './crowd.js';
import { random } from './materials.js';
import { seatedPose, SEAT_TOP, SEAT_X } from './seating.js';
import { Escalator, STEP_COUNT, STEP_PITCH, STEP_SPEED, escalatorHeight } from './escalator.js';

test('escalator treads move uphill, repeat under the landings and freeze at the same simulation time', () => {
  const material = new T.MeshStandardMaterial();
  for (const side of [-1, 1]) {
    const e = new Escalator(342, side, 336, material), a = new T.Matrix4(), b = new T.Matrix4();
    e.update(0); e.mesh.getMatrixAt(12, a);
    e.update(.25); e.mesh.getMatrixAt(12, b);
    const from = new T.Vector3().setFromMatrixPosition(a), to = new T.Vector3().setFromMatrixPosition(b);
    assert.ok(to.y > from.y && to.z < from.z, 'the actual rendered tread rises along the flight');
    assert.ok(from.distanceTo(to) > .09 && from.distanceTo(to) < .14);
    const frozen = [...e.mesh.instanceMatrix.array];
    e.update(.25); assert.deepEqual([...e.mesh.instanceMatrix.array], frozen);
    e.update(.25 + STEP_COUNT * STEP_PITCH / STEP_SPEED);
    e.mesh.instanceMatrix.array.forEach((value, i) => assert.ok(Math.abs(value - frozen[i]) < 1e-5));
    assert.equal(e.mesh.count, STEP_COUNT);
    e.mesh.geometry.dispose(); e.mesh.dispose();
  }
  assert.equal(escalatorHeight(-.48), .945);
  assert.equal(escalatorHeight(7.2), 4.62);
  material.dispose();
});

test('seated passengers fit their seat and floor, keeping phones in hand and watching independently', () => {
  const crowd = Object.create(Crowd.prototype); crowd.material = new T.MeshStandardMaterial();
  for (const side of [-1, 1]) for (const phone of [false, true]) for (const seed of [5, 93, 614]) {
    const p = crowd.create(random(seed), { seated: true, phone });
    Object.assign(p, { s: 300, x: side * SEAT_X, rootY: .945, baseY: -side * Math.PI / 2, phase: 0, pace: 1, noticeDistance: 60 });
    p.person.scale.setScalar(p.height); p.person.position.y = p.rootY;
    seatedPose(p, 190, 0); const farYaw = p.head.rotation.y;
    seatedPose(p, 285, 0);
    assert.equal(p.person.rotation.y, p.baseY, 'the hips stay aligned with the seat');
    assert.ok(Math.abs(p.body.position.y * p.height + p.rootY - SEAT_TOP - .075 * p.height) < 1e-8);
    assert.ok(phone ? p.head.rotation.x > .3 && p.head.rotation.y === farYaw : Math.abs(p.head.rotation.y - farYaw) > .2);
    const mesh = p.person.children[0]; p.person.updateMatrixWorld(true); mesh.skeleton.update();
    for (const leg of p.legs) {
      const ankle = leg.shin.children[0], g = mesh.geometry;
      let soleY = Infinity;
      for (let i = 0; i < g.attributes.position.count; i++) if (g.attributes.skinIndex.getX(i) === ankle.userData.index) {
        const v = new T.Vector3().fromBufferAttribute(g.attributes.position, i);
        mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); soleY = Math.min(soleY, v.y);
      }
      assert.ok(Math.abs(soleY - .945) < .003, 'both soles meet the platform, without floating or sinking');
    }
    assert.equal(mesh.isSkinnedMesh, true); assert.equal(p.person.children.length, 1);
    mesh.geometry.dispose(); mesh.skeleton.dispose();
  }
  crowd.material.dispose();
});
