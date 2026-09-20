import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { World } from './world.js';
import { point, trackX, branchAt, station } from './route.mjs';
import { updatePedestrians } from './pedestrians.mjs';
import { DOOR_OFFSETS } from './traffic.mjs';
import { DoorInspection } from './door-inspection.js';

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

test('platform structures leave the dispatch mirror sightlines to every door clear', () => {
  for (const index of [0, 1, 2, 3, 4, 5, 7]) {
    const { scene, world } = fixture(), st = station(index), meshes = [];
    for (let base = st.start; base < st.end; base += 24) {
      for (const _ of world.build(base)) { /* actual platform geometry */ }
      const chunk = world.chunks.get(base);
      chunk.group.position.set(trackX(base) - trackX(st.stop), 0, st.stop - base);
      chunk.group.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
    }
    world.vehicles.place(world.vehicles.own, st.stop, st.stop, 1, st.side);
    world.mirror.update({ s: st.stop }); scene.updateMatrixWorld(true);
    const inspection = new DoorInspection().update(true, { next: index, phase: 'open', timer: 1 }, world.vehicles.own, 1.2);
    for (const z of [-6.65, -5.4, -4.15]) for (const y of [1, 2.9]) {
      const target = new T.Vector3(st.side * 1.51, y, z).applyMatrix4(world.vehicles.own.cars[0].matrixWorld);
      const delta = target.sub(inspection.position);
      const ray = new T.Raycaster(inspection.position, delta.clone().normalize(), .1, delta.length() - .05);
      assert.equal(ray.intersectObjects(meshes, false).length, 0, 'platform columns must not hide the frontal diagnostic view');
    }
    for (let door = 0; door < DOOR_OFFSETS.length; door++) {
      const car = world.vehicles.own.cars[Math.floor(door / 3)];
      const target = new T.Vector3(st.side * 1.51, 2.1, [-5.4, 0, 5.4][door % 3]).applyMatrix4(car.matrixWorld);
      const eye = world.mirror.camera.position, delta = target.sub(eye);
      const ray = new T.Raycaster(eye, delta.clone().normalize(), .1, delta.length() - .18);
      assert.equal(ray.intersectObjects(meshes, false).length, 0, `station ${index}, door ${door}: columns/walls must not obstruct the mirror`);
    }
  }
});
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

test('stair and escalator rooms enclose the entire ceiling opening without blocking access', () => {
  for (const index of [0, 1, 2, 5]) {
    const { scene, world } = fixture(), st = station(index);
    for (let base = Math.floor(st.start / 24) * 24; base < st.end; base += 24) {
      for (const _ of world.build(base)) { /* actual merged station geometry */ }
      world.chunks.get(base).group.position.set(trackX(base), 0, -base);
    }
    scene.updateMatrixWorld(true);
    const meshes = []; scene.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
    const between = (a, b) => {
      const from = new T.Vector3(...a), to = new T.Vector3(...b);
      return new T.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to)).intersectObjects(meshes, false);
    };
    const seats = [...world.chunks.values()].flatMap(c => c.seats);
    const seated = [...world.chunks.values()].flatMap(c => c.people).filter(p => p.seated);
    assert.equal(seats.length, 9); assert.equal(seated.length, 6);
    assert.equal(seated.filter(p => p.phone).length, 3);
    for (const p of seated) {
      assert.ok(seats.some(seat => seat.s === p.s && seat.x === p.x));
      assert.ok(!p.journey && !p.walker, 'seated passengers stay at their assigned seats');
    }
    const openings = st.feature === 'escalator' ? [36, 78] : [36];
    for (const offset of openings) {
      const start = st.start + offset, x = st.side * 5.75;
      for (const rel of [.2, 1.5, 6.1, 10.3, 14.8]) {
        const from = point(start + rel, x, 6.3);
        for (const to of [point(start + rel, x, 9), point(start + rel, st.side * 3.8, 6.3), point(start + rel, st.side * 8, 6.3)]) {
          assert.ok(between(from, to).length, `station ${index}, access ${offset}, depth ${rel}: roof and both side walls close the void`);
        }
      }
      assert.ok(between(point(start + .4, x, 6.3), point(start - 1, x, 6.3)).length, 'front header closes space above the lower ceiling');
      assert.ok(between(point(start + 14, x, 6.3), point(start + 16, x, 6.3)).length, 'upper landing has a closed far wall');
      assert.ok(between(point(start + 12.13, x, 6.3), point(start + 12.13, x, 4.2)).length, 'upper landing has its own floor');
      const landingTop = offset === 78 ? 4.62 : 4.75;
      for (const rel of [7.53, 8.13, 12.13]) {
        const floorHits = between(point(start + rel, x, 6.3), point(start + rel, x, 4.2));
        assert.equal(floorHits.filter(h => Math.abs(h.point.y - landingTop) < .001).length, 1,
          'the original landing and extended floor must not duplicate the same tread surface');
      }
      for (const rel of [.137, 3.53, 6.137, 11.53, 14.137]) for (const y of [4.8, 6.3]) {
        const hits = between(point(start + rel, st.side * 6, y), point(start + rel, st.side * 8, y));
        assert.equal(hits.filter(h => Math.abs(h.distance - 1.13) < .05).length, 1,
          'upper and lower walls expose one face, never two coplanar layers');
      }
      const header = between(point(start - .1, x, 4.5), point(start - .1, x, 6));
      assert.equal(header.filter(h => Math.abs(h.distance - .54) < .01).length, 1,
        'the access header must not duplicate the platform ceiling underside');
      for (const [lateral, y] of [[4.43, 4.98], [4.35, 6.1], [4.35, 7.78], [7.2, 6.1]]) {
        const from = point(start - 1.1, st.side * lateral, y), corner = point(start, st.side * lateral, y);
        const distance = new T.Vector3(...from).distanceTo(new T.Vector3(...corner));
        const cornerHits = between(from, point(start + .5, st.side * lateral, y));
        assert.equal(cornerHits.filter(h => Math.abs(h.distance - distance) < .01).length, 1,
          `access front corner ${lateral}/${y}: wall, header and roof must share a single exposed cap`);
      }
      const walkX = st.side * (offset === 78 ? 5.55 : 5.75);
      const headHeight = rel => (offset === 78 ? Math.min(4.62, .95 + rel * .5) : Math.min(4.75, 1.1 + rel * .155 / .3)) + 1.75;
      for (let rel = .2; rel < 13; rel += .4) {
        assert.equal(between(point(start + rel, walkX, headHeight(rel)), point(start + rel + .4, walkX, headHeight(rel + .4))).length, 0,
          'passengers retain clear headroom from the flight to the upper landing');
      }
    }
    scene.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }
});

test('actual platform crowds keep their separation while some boarders stop for others', () => {
  let blocked = 0, travelled = 0;
  for (const index of [0, 1, 5]) {
    const { scene, world } = fixture(), st = station(index);
    for (let base = Math.floor(st.start / 24) * 24; base < st.end; base += 24)
      for (const _ of world.build(base)) { /* real passenger distributions */ }
    const people = [...world.chunks.values()].flatMap(c => c.people);
    for (let frame = 0; frame < 30 * 35; frame++) {
      const time = frame / 30;
      const train = { time, s: Math.min(st.stop, st.start - 42 + time * 10) };
      world.exchange.update(train, [{ key: 'own', station: st, age: time < 25 ? -1 : Math.min(8, time - 25) }]);
      updatePedestrians([...people, ...world.exchange.obstacles], train);
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
        const a = people[i], b = people[j];
        assert.ok(Math.hypot(a.motion.s - b.motion.s, a.motion.x - b.motion.x) >= .78 * Math.max(a.height, b.height) - .001,
          `station ${index}: passenger bodies remain separated`);
      }
      for (const p of people) for (const entry of world.exchange.groups.values()) for (const other of entry.people) {
        if (!other.person.visible) continue;
        const at = point(p.motion.s, p.motion.x, .945);
        assert.ok(Math.hypot(at[0] - trackX(train.s) - other.person.position.x, at[2] + train.s - other.person.position.z) > .62,
          `station ${index}, time ${time}: ordinary platform walkers leave the curved exchange paths clear`);
      }
    }
    blocked += people.filter(p => p.halt && p.journey).length;
    travelled += people.filter(p => p.journey && p.motion.distance > 3).length;
    scene.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }
  assert.ok(blocked > 0, 'crowded routes actually trigger waiting');
  assert.ok(travelled > 0, 'unobstructed passengers still approach the train');
});
