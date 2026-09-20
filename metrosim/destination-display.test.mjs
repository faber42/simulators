import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { Train, station, entrySignal } from './route.mjs';
import { occupiedService } from './traffic.mjs';
import { OWN_SERVICE, OTHER_SERVICES, precedingService, serviceLabel } from './services.mjs';
import { boardPosition, displayTransition, arrivalDisplay, departuresDisplay } from './destination-display.mjs';
import { DestinationDisplays, drawDestinationDisplay } from './destination-displays.js';
import { Vehicles } from './vehicles.js';

test('three upcoming services switch to the own train with its full five-car stopping position', () => {
  const st = station(0), list = departuresDisplay(st);
  assert.equal(list.rows.length, 3);
  assert.deepEqual(list.rows[0], { ...OWN_SERVICE, minutes: 1 });
  assert.deepEqual(list.rows.map(row => row.minutes), [1, 3, 6]);
  assert.equal(new Set(list.rows.map(row => row.line)).size, 3);
  for (let index = 0; index < 60; index++) {
    const st = station(index), entry = entrySignal(index);
    for (const s of [entry.s - 60, entry.s, entry.s + 4]) assert.equal(displayTransition(st, { s }).progress, 0);
    const midway = displayTransition(st, { s: st.start + 30 });
    assert.ok(midway.progress > 0 && midway.progress < 1);
    const final = displayTransition(st, { s: boardPosition(st, 1) - 5 });
    assert.equal(final.progress, 1);
    assert.equal(final.to.mode, 'arrival'); assert.deepEqual(final.to.service, OWN_SERVICE);
    assert.equal(final.to.cars, 5); assert.equal(final.to.length, 89.6);
    assert.equal(final.from.mode, occupiedService(index) ? 'arrival' : 'departures');
    if (occupiedService(index)) {
      assert.deepEqual(final.from.service, precedingService(index));
      assert.notEqual(final.from.service.line, OWN_SERVICE.line);
      assert.notEqual(final.from.service.destination, OWN_SERVICE.destination);
    }
  }
});

test('real station entries retain the old display at red and through the signal; pause freezes a running flip', () => {
  const train = new Train(); let occupiedWaits = 0, transitions = 0, completions = 0, paused = false;
  const previous = new Map();
  for (let frame = 0; frame < 700 * 60; frame++) {
    train.step(1 / 60);
    const st = station(train.next), state = displayTransition(st, train);
    assert.ok(state.progress >= (previous.get(st.index) ?? 0)); previous.set(st.index, state.progress);
    if (train.s <= entrySignal(st.index).s) assert.equal(state.progress, 0);
    if (train.phase === 'waiting' && train.pendingSignal?.kind === 'entry') {
      occupiedWaits++; assert.equal(state.from.mode, 'arrival');
      assert.deepEqual(state.from.service, train.traffic.pose(st.index, train.time).service);
    }
    if (state.progress > 0 && state.progress < 1) {
      transitions++;
      if (!paused) {
        train.paused = true; for (let i = 0; i < 100; i++) train.step(1 / 60);
        assert.deepEqual(displayTransition(st, train), state); train.paused = false; paused = true;
      }
    }
    if (train.s >= boardPosition(st, 1) - 5) { completions++; assert.equal(state.progress, 1); }
  }
  assert.ok(occupiedWaits > 0 && transitions > 0 && completions > 0 && paused);
});

test('both board faces share the same flip and endless travel retains only nearby materials and five textures', () => {
  let uploads = 0, disposed = 0;
  const displays = new DestinationDisplays(() => { uploads++; return new T.Texture(); });
  for (let index = 0; index < 100; index++) {
    const st = station(index), material = displays.material(st);
    material.addEventListener('dispose', () => disposed++);
    assert.equal(displays.material(st), material);
    displays.update({ s: st.start + 30 }, st.start - 96, st.end + 216);
    assert.equal(material.uniforms.progress.value, displayTransition(st, { s: st.start + 30 }).progress);
    const before = uploads;
    for (let frame = 0; frame < 60; frame++) displays.update({ s: st.start + 30 + frame / 60 }, st.start - 96, st.end + 216);
    assert.equal(uploads, before, 'no canvas redraws or texture uploads during animation');
    assert.equal(displays.entries.size, 1);
  }
  assert.equal(uploads, 5); assert.equal(disposed, 99);
  const warmed = new DestinationDisplays(() => new T.Texture()), anchor = warmed.warmupMaterial(station(0));
  let anchorDisposed = false; anchor.addEventListener('dispose', () => anchorDisposed = true);
  warmed.update({ s: 600 }, 500, 720);
  assert.equal(warmed.entries.size, 0); assert.equal(anchorDisposed, false, 'keep the shader program compiled through the tunnel gap');
  assert.equal(warmed.warmupMaterial(station(1)), anchor);
  warmed.material(station(1)); warmed.update({ s: 900 }, 790, 1020);
  assert.equal(warmed.entries.size, 1);
});

test('canvas layouts show the requested destinations and timings without intermediate destinations', () => {
  const text = [], ctx = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {},
    fillText(value) { text.push(value); } };
  drawDestinationDisplay(ctx, departuresDisplay(station(0)));
  assert.deepEqual(text, ['U8', 'Waldheim', '1 Min', 'U3', 'Lindenau', '3 Min', 'U6', 'Falkenried', '6 Min']);
  text.length = 0; drawDestinationDisplay(ctx, arrivalDisplay(OWN_SERVICE));
  assert.deepEqual(text, ['U8', 'Waldheim', 'A', 'B', 'C', 'D', 'E']);
});

test('front, rear and side signs on both trains use the same service identities as the platform boards', () => {
  const materials = { sign: text => { const material = new T.MeshBasicMaterial(); material.name = text; return material; } };
  const vehicles = new Vehicles(new T.Scene(), materials);
  for (const service of OTHER_SERVICES) {
    vehicles.setService(vehicles.ahead, service);
    assert.ok(vehicles.ahead.signs.every(sign => sign.material.name === serviceLabel(service)));
    assert.ok(vehicles.own.signs.every(sign => sign.material.name === serviceLabel(OWN_SERVICE)));
  }
  assert.equal(vehicles.own.signs.length, 12); assert.equal(vehicles.ahead.signs.length, 12);
});
