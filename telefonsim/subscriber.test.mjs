import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { subscriberAppearance, subscriberExamples, PHONE_MODELS, PHONE_COLOURS, PHONE_SETTINGS } from './subscriber-catalog.mjs';
import { makeSubscriber } from './subscriber-scene.js';
import { targetPosition, subscriberHandoff, UPPER_FLOOR_Y } from './topology.mjs';

test('all forms have dialable examples and use compatible colours and surroundings', () => {
  const examples = subscriberExamples();
  assert.ok(PHONE_MODELS.length >= 20); assert.equal(new Set(PHONE_MODELS.map(m => m.id)).size, PHONE_MODELS.length);
  assert.equal(examples.length, PHONE_MODELS.length);
  assert.equal(new Set(examples.map(p => p.model.id)).size, PHONE_MODELS.length);
  assert.ok(examples.some(p => p.setting.id === 'booth')); assert.ok(examples.some(p => p.setting.id === 'bar'));
  for (const p of examples) {
    assert.deepEqual(p, subscriberAppearance(p.number)); assert.equal(p.model.mount, p.setting.mount);
    assert.ok(p.model.colours.includes(p.colour.id)); assert.ok(PHONE_COLOURS.includes(p.colour));
  }
});

test('the full number fixes appearance and position independently of lookup order or outlet', () => {
  const numbers = ['100001', '234567', '234568', '618204', '999999'];
  const before = numbers.map(subscriberAppearance);
  [...numbers].reverse().forEach(subscriberAppearance);
  assert.deepEqual(numbers.map(subscriberAppearance), before);
  assert.notDeepEqual(before[1].planPosition, before[2].planPosition);
  for (const number of numbers) {
    for (let slot = 0; slot < 10; slot++) assert.deepEqual(targetPosition(number, slot), targetPosition(number));
    assert.notDeepEqual(targetPosition(number), subscriberHandoff(number));
  }
  for (const number of ['012345', '12345', 'abcdef']) assert.throws(() => subscriberAppearance(number));
});

test('sampled combinations cover every setting and colour, remain within the floor, and avoid the tapes', () => {
  const colours = new Set(), settings = new Set(), combinations = new Set();
  for (let n = 100000; n < 110000; n++) {
    const p = subscriberAppearance(String(n)), [x, z] = p.planPosition;
    assert.ok(x > -640 && x < 640 && z > -1120 && z < 110);
    assert.ok(Math.abs(x) >= 22 || Math.abs(z + 510) >= 24);
    assert.equal(p.model.mount, p.setting.mount); assert.ok(p.model.colours.includes(p.colour.id));
    colours.add(p.colour.id); settings.add(p.setting.id); combinations.add(`${p.model.id}/${p.colour.id}/${p.setting.id}/${p.finish.name}`);
  }
  assert.equal(colours.size, PHONE_COLOURS.length); assert.equal(settings.size, PHONE_SETTINGS.length); assert.ok(combinations.size > 3000);
});

test('all 26 built forms have finite geometry, reachable receivers and safe disposal', () => {
  const parent = new THREE.Group();
  for (const profile of subscriberExamples()) {
    const destination = makeSubscriber(parent, profile, targetPosition(profile.number), { labels: false });
    assert.equal(parent.children.length, 1);
    const bounds = new THREE.Box3().setFromObject(destination.root), size = bounds.getSize(new THREE.Vector3());
    assert.ok(bounds.min.y >= UPPER_FLOOR_Y, profile.model.id);
    assert.ok(size.x > 2 && size.y > 2 && size.z > 1, profile.model.id);
    const geometry = new Set(), materials = new Set();
    destination.root.traverse(object => {
      assert.equal(object.layers.mask, 2);
      if (object.geometry) { geometry.add(object.geometry); assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite)); }
      if (object.material) materials.add(object.material);
      if (object.isInstancedMesh) assert.ok([...object.instanceMatrix.array].every(Number.isFinite));
    });
    assert.equal(destination.handsetHit.userData.action, 'handset');
    assert.ok(destination.endpoint.toArray().every(Number.isFinite));
    for (const aspect of [.7, 1.3, 2]) {
      const shot = destination.view(aspect); assert.ok(shot.position.distanceTo(shot.target) > 5);
      assert.ok(shot.position.toArray().every(Number.isFinite));
      const camera = new THREE.PerspectiveCamera(42, aspect, .05, 10000);
      camera.position.copy(shot.position); camera.lookAt(shot.target); camera.updateMatrixWorld(true);
      const receiver = destination.handsetHit.getWorldPosition(new THREE.Vector3()).project(camera);
      assert.ok(Math.abs(receiver.x) < .85 && Math.abs(receiver.y) < .8, `${profile.model.id}: receiver in view`);
      const ray = new THREE.Raycaster(); ray.layers.set(1); ray.setFromCamera(receiver, camera);
      assert.ok(ray.intersectObject(destination.handsetHit).length, `${profile.model.id}: receiver can be picked`);
    }
    const receiverBefore = destination.handset.position.clone();
    destination.update(true, false, 0, 1); assert.ok(destination.handset.position.y > receiverBefore.y + .6);
    destination.update(false, false, 0, 1); assert.ok(destination.handset.position.distanceTo(receiverBefore) < .001);
    let disposedGeometry = 0, disposedMaterials = 0;
    geometry.forEach(g => g.addEventListener('dispose', () => disposedGeometry++));
    materials.forEach(m => m.addEventListener('dispose', () => disposedMaterials++));
    destination.dispose(); destination.dispose();
    assert.equal(parent.children.length, 0); assert.equal(disposedGeometry, geometry.size); assert.equal(disposedMaterials, materials.size);
  }
});
