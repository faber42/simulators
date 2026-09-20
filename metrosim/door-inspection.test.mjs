import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { DoorInspection, doorInspectionActive } from './door-inspection.js';
import { Vehicles } from './vehicles.js';
import { station, STATION_SETTLE } from './route.mjs';

test('door inspection is opt-in, starts before opening, and restores the front view after closing', () => {
  for (const [phase, timer, active] of [
    ['running', 0, false], ['settling', 0, false], ['settling', STATION_SETTLE - .3, true],
    ['opening', 0, true], ['open', 7, true], ['closing', 2.79, true],
    ['dispatch', 0, true], ['dispatch', .31, false], ['depart', 0, false], ['waiting', 10, false],
  ]) {
    assert.equal(doorInspectionActive(false, { phase, timer }), false);
    assert.equal(doorInspectionActive(true, { phase, timer }), active);
    assert.equal(doorInspectionActive(true, { phase, timer, paused: true }), active, 'pause retains the inspection phase');
  }
});

test('frontal inspection fits the complete moving leaves on both sides and curved platforms', () => {
  const scene = new T.Scene(), material = new T.MeshStandardMaterial();
  const vehicles = new Vehicles(scene, { sign: () => material }), inspection = new DoorInspection();
  for (let index = 0; index < 36; index++) for (const aspect of [.65, 1.2, 2]) {
    const st = station(index), train = { s: st.stop, next: index, phase: 'open', timer: 1 };
    vehicles.place(vehicles.own, st.stop, st.stop, 1, st.side);
    const camera = inspection.update(true, train, vehicles.own, aspect);
    camera.updateMatrixWorld(true);
    assert.equal(camera.layers.mask, 3, 'the own train is visible in the diagnostic view');
    for (const z of [-6.71, -5.4, -4.09]) for (const y of [.97, 2.95]) {
      const corner = new T.Vector3(st.side * 1.60, y, z).applyMatrix4(vehicles.own.cars[0].matrixWorld).project(camera);
      assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, 'open doors and threshold fit the preview');
    }
    const middle = new T.Vector3(st.side * 1.485, 1.98, -5.4).applyMatrix4(vehicles.own.cars[0].matrixWorld).project(camera);
    assert.ok(Math.abs(middle.x) < 1e-8 && Math.abs(middle.y) < 1e-8, 'look directly at the door centre');
    assert.equal(inspection.update(false, train, vehicles.own, aspect), null);
  }
});
