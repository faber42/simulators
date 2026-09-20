import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { DiagnosticViews, diagnosticViewURL } from './diagnostic-views.js';
import { Vehicles } from './vehicles.js';
import { PlatformMirror } from './mirrors.js';
import { station } from './route.mjs';

test('switching monitor, door and normal views restores visibility and preserves each camera lens', () => {
  const scene = new T.Scene(), material = new T.MeshStandardMaterial();
  const materials = { dark: material, steel: material, sign: () => material };
  const vehicles = new Vehicles(scene, materials), mirror = new PlatformMirror(scene, materials), views = new DiagnosticViews();
  const st = station(0), train = { s: st.stop, next: 0, phase: 'open', timer: 3, paused: true };
  vehicles.place(vehicles.own, train.s, train.s, 1, st.side); mirror.update(train);
  const before = { ...train }, originalAspect = mirror.camera.aspect;
  for (let i = 0; i < 3; i++) {
    views.mode = 'mirror';
    const monitor = views.update(train, vehicles.own, mirror, 1.8);
    assert.equal(views.active, 'mirror'); assert.equal(monitor.fov, 28);
    assert.equal(monitor.aspect, 1.8); assert.equal(mirror.camera.aspect, originalAspect);
    assert.notEqual(monitor, mirror.camera); assert.equal(monitor.layers.mask, 3);
    assert.deepEqual(monitor.position, mirror.camera.position);
    mirror.rig.traverse(o => assert.equal(o.layers.mask, 4));
    views.mode = 'door';
    assert.equal(views.update(train, vehicles.own, mirror, 1.8), views.door.camera);
    assert.equal(views.active, 'door');
    views.mode = 'front';
    assert.equal(views.update(train, vehicles.own, mirror, 1.8), null);
    assert.equal(views.active, 'front');
    mirror.rig.traverse(o => assert.equal(o.layers.mask, 1, 'the normal cockpit can see the physical monitor again'));
  }
  assert.deepEqual(train, before, 'switching views while paused must not advance the simulation');
  views.mode = 'mirror'; mirror.active = false;
  assert.equal(views.update(train, vehicles.own, mirror, 1), null, 'show the cockpit while the next platform is outside the loaded scene');
  assert.equal(views.mode, 'mirror', 'keep the monitor selected for the next approach');
});

test('camera selection removes static inspection URLs and reloads the selected mode', () => {
  const href = 'http://localhost:3000/metrosim/?view=vehicle&end=rear&station=2&offset=18&junction=1&kind=escalator&board=0&play=1&rate=0.5';
  for (const mode of ['front', 'door', 'mirror']) {
    const url = diagnosticViewURL(href, mode, { time: 61.4, paused: true }, true);
    assert.equal(url.searchParams.get('view'), mode === 'front' ? null : mode);
    for (const key of ['end', 'station', 'offset', 'junction', 'kind', 'board', 'play']) assert.equal(url.searchParams.has(key), false);
    assert.equal(url.searchParams.get('time'), '61.400');
    assert.equal(url.searchParams.get('paused'), '1');
    assert.equal(url.searchParams.get('diagnostics'), '1');
    assert.equal(url.searchParams.get('rate'), '0.5');
  }
  const running = diagnosticViewURL(href + '&paused=1&diagnostics=1', 'front', { time: 64, paused: false }, false);
  assert.equal(running.searchParams.has('paused'), false); assert.equal(running.searchParams.has('diagnostics'), false);
});
