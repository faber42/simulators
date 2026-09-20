import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { Vehicles } from './vehicles.js';
import { PlatformMirror } from './mirrors.js';
import { station, point, trackX } from './route.mjs';
import { CAR_COUNT, DOOR_OFFSETS, doorOpening } from './traffic.mjs';
import { Crowd } from './crowd.js';
import { PassengerExchange } from './exchanges.js';

const material = new T.MeshStandardMaterial();
const materials = { dark: material, steel: material, sign: () => material };

test('only platform-side door leaves move and all cars remain articulated along the route', () => {
  const vehicles = new Vehicles(new T.Scene(), materials), matrix = new T.Matrix4();
  for (const index of [0, 1, 2, 5]) {
    const st = station(index);
    vehicles.place(vehicles.own, st.stop, st.stop, 0, st.side);
    const closed = vehicles.own.leaves.map(mesh => [...mesh.instanceMatrix.array]);
    vehicles.place(vehicles.own, st.stop, st.stop, 1, st.side);
    assert.equal(vehicles.own.cars.length, CAR_COUNT);
    for (let car = 0; car < CAR_COUNT; car++) for (let leaf = 0; leaf < 12; leaf++) {
      vehicles.own.leaves[car].getMatrixAt(leaf, matrix);
      const side = leaf < 6 ? -1 : 1, offset = leaf * 16;
      assert.ok(Math.abs(Math.abs(matrix.elements[14] - closed[car][offset + 14]) - (side === st.side ? .66 : 0)) < 1e-5);
      if (side !== st.side) assert.deepEqual([...matrix.elements], closed[car].slice(offset, offset + 16));
    }
    vehicles.own.group.traverse(o => assert.equal(o.layers.mask, 2, 'own cab is visible only in the mirror camera'));
  }
});

test('station mirrors frame every door on both platform sides, including curved platforms', () => {
  const scene = new T.Scene(), mirror = new PlatformMirror(scene, materials), vehicles = new Vehicles(scene, materials);
  for (let index = 0; index < 36; index++) {
    const st = station(index), train = { s: st.stop };
    vehicles.place(vehicles.own, st.stop, st.stop, 1, st.side);
    mirror.update(train); scene.updateMatrixWorld(true); mirror.camera.updateMatrixWorld(true);
    assert.equal(mirror.active, true);
    for (const offset of DOOR_OFFSETS) {
      const p = point(st.stop - offset, st.side * 1.5, 1.95);
      const image = new T.Vector3(p[0] - trackX(train.s), p[1], train.s + p[2]).project(mirror.camera);
      assert.ok(Math.abs(image.x) < 1 && Math.abs(image.y) < 1 && image.z > -1 && image.z < 1,
        `station ${index}, door ${offset}: ${image.toArray()}`);
    }
    for (let door = 0; door < DOOR_OFFSETS.length; door++) {
      const car = Math.floor(door / 3);
      for (const y of [.97, 2.95]) for (const edge of [-.65, .65]) {
        const corner = new T.Vector3(st.side * 1.51, y, [-5.4, 0, 5.4][door % 3] + edge)
          .applyMatrix4(vehicles.own.cars[car].matrixWorld).project(mirror.camera);
        assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1,
          `station ${index}, door ${door}: frame the whole opening including the threshold`);
      }
      const target = new T.Vector3(st.side * 1.51, 2.1, [-5.4, 0, 5.4][door % 3]).applyMatrix4(vehicles.own.cars[car].matrixWorld);
      const delta = target.sub(mirror.camera.position);
      assert.ok(mirror.camera.position.y + delta.clone().normalize().y * 2.5 > 2.9,
        'door sightlines pass above even a tall passenger standing directly in front of the camera');
      const ray = new T.Raycaster(mirror.camera.position, delta.clone().normalize(), .1, delta.length() - .18); ray.layers.set(1);
      const blockers = vehicles.own.cars.filter((_, i) => i !== car).map(c => c.children[0]);
      assert.equal(ray.intersectObjects(blockers, false).length, 0, `station ${index}, door ${door}: nearer cars must not hide the rear doors`);
    }
  }
});

test('plug doors stay visible, clear the body before sliding, and reseat along the same path', () => {
  const vehicles = new Vehicles(new T.Scene(), materials), matrix = new T.Matrix4();
  const st = station(0), positions = [];
  for (let frame = 0; frame <= 120; frame++) {
    const opening = doorOpening('opening', frame / 60);
    vehicles.place(vehicles.own, st.stop, st.stop, opening, st.side);
    assert.equal(vehicles.own.leaves[0].visible, true);
    vehicles.own.leaves[0].getMatrixAt(0, matrix);
    const plug = Math.abs(matrix.elements[12]) - 1.485;
    const slide = Math.abs(matrix.elements[14] + 5.4) - .325;
    assert.ok(plug >= -1e-6 && plug <= .060001);
    if (slide > .00001) {
      assert.ok(Math.abs(plug - .06) < 1e-6, 'the full 6 cm outward movement precedes any lateral movement');
      assert.ok(Math.abs(matrix.elements[12]) - .036 > 1.50, 'the inner leaf face clears the outer body and seals');
    }
    positions.push([...matrix.elements]);
    vehicles.place(vehicles.own, st.stop, st.stop, doorOpening('closing', 2.8 * (1 - frame / 120)), st.side);
    vehicles.own.leaves[0].getMatrixAt(0, matrix);
    matrix.elements.forEach((value, i) => assert.ok(Math.abs(value - positions.at(-1)[i]) < 1e-6, 'closing retraces the opening movement'));
  }
  assert.ok(positions.slice(1, 30).some(p => Math.abs(p[12] - positions[0][12]) > .02 && p[14] === positions[0][14]),
    'a visible outward-only stage precedes sliding');
});

test('monitor housing leaves depth clearance behind the picture and stays live throughout approach', () => {
  const scene = new T.Scene(), mirror = new PlatformMirror(scene, materials), st = station(0);
  mirror.rig.visible = true; scene.updateMatrixWorld(true);
  for (const x of [-.9, 0, .9]) for (const y of [2.34, 2.94, 3.54]) {
    const ray = new T.Raycaster(new T.Vector3(x, y, 1), new T.Vector3(0, 0, -1));
    const hits = ray.intersectObject(mirror.rig, true);
    assert.equal(hits[0].object, mirror.surface, 'the screen is the only front face inside the bezel');
    for (const hit of hits.filter(hit => hit.object !== mirror.surface))
      assert.ok(hit.distance - hits[0].distance > .2, 'no almost-coplanar plate can break through at distant depth precision');
  }
  for (const distance of [209, 150, 90, 68.1, 67.9, 20, 0]) {
    mirror.update({ s: st.stop - distance });
    let draws = 0;
    scene.fog = { density: .016 };
    mirror.render({ getRenderTarget: () => null, setRenderTarget() {}, render() { draws++; } });
    assert.equal(draws, 1, 'every visible image is current, with no frozen/live distance boundary');
  }
});

test('endless passenger exchanges reuse a fixed pair of prebuilt groups', () => {
  const crowd = Object.create(Crowd.prototype); crowd.material = material;
  const scene = new T.Scene(), exchange = new PassengerExchange(scene, crowd, material);
  const geometry = new Set(); scene.traverse(o => { if (o.isSkinnedMesh) geometry.add(o.geometry); });
  assert.equal(geometry.size, 48);
  for (let index = 0; index < 30; index++) {
    const st = station(index), train = { s: st.stop, time: index * 80 };
    for (const age of [-1, 1, 5, 12]) exchange.update(train, [
      { key: `previous-${index}`, station: st, age: 12, previousService: true },
      { key: `own-${index}`, station: st, age },
    ]);
    assert.equal(exchange.groups.size + exchange.pool.length, 2);
    scene.traverse(o => { if (o.isSkinnedMesh) assert.ok(geometry.has(o.geometry)); });
    exchange.update(train, []);
    assert.equal(exchange.groups.size, 0); assert.equal(exchange.pool.length, 2);
  }
});
