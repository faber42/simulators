import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../pinsim/three.module.min.js';
import { Train, station, entrySignal } from './route.mjs';
import { occupiedService } from './traffic.mjs';
import { OWN_SERVICE, OTHER_SERVICES, precedingService, serviceLabel } from './services.mjs';
import { boardPosition, displayTransition, arrivalDisplay, departuresDisplay, FLAP_TURNS, flapMotion, flapPage } from './destination-display.mjs';
import { DestinationDisplays, drawDestinationDisplay } from './destination-displays.js';
import { Vehicles } from './vehicles.js';

test('two upcoming services switch to the own train with its full five-car stopping position', () => {
  const st = station(0), list = departuresDisplay(st);
  assert.equal(list.rows.length, 2);
  assert.deepEqual(list.rows[0], { ...OWN_SERVICE, minutes: 1 });
  assert.deepEqual(list.rows.map(row => row.minutes), [1, 3]);
  assert.equal(new Set(list.rows.map(row => row.line)).size, 2);
  for (let index = 0; index < 60; index++) {
    const st = station(index), entry = entrySignal(index);
    for (const s of [entry.s - 60, entry.s, entry.s + 1]) assert.equal(displayTransition(st, { s }).progress, 0);
    const firstBoard = displayTransition(st, { s: boardPosition(st, 0) - 5 });
    assert.ok(flapMotion(firstBoard.progress).turn >= 1 && firstBoard.progress < 1, 'a whole leaf has already fallen before the first board');
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

test('a full-width flap falls repeatedly and only reaches our final page on the last turn', () => {
  for (const index of [0, 1, 2, 5]) {
    const st = station(index), state = displayTransition(st, { s: st.start });
    assert.deepEqual(flapPage(state, 0), state.from);
    for (let turn = 0; turn < FLAP_TURNS; turn++) {
      const upper = flapMotion((turn + .2) / FLAP_TURNS), lower = flapMotion((turn + .7) / FLAP_TURNS);
      assert.equal(upper.turn, turn); assert.equal(lower.turn, turn);
      assert.ok(upper.angle > 0 && upper.angle < Math.PI / 2);
      assert.ok(lower.angle > Math.PI / 2 && lower.angle <= Math.PI, 'the entire top half falls onto the bottom half');
      if (turn) {
        assert.equal(flapPage(state, turn).mode, 'arrival');
        assert.notDeepEqual(flapPage(state, turn), state.to, 'intermediate printed leaves precede our destination');
        assert.notDeepEqual(flapPage(state, turn), flapPage(state, turn - 1));
      }
    }
    assert.deepEqual(flapMotion(0), { turn: 0, angle: 0 });
    assert.deepEqual(flapMotion(1), { turn: FLAP_TURNS, angle: 0 });
    assert.deepEqual(flapPage(state, FLAP_TURNS), state.to);
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
    assert.equal(material.uniforms.angle.value, flapMotion(displayTransition(st, { s: st.start + 30 }).progress).angle);
    const before = uploads;
    for (let frame = 0; frame <= 80; frame++) displays.update({ s: st.start - 8 + frame }, st.start - 96, st.end + 216);
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

test('both physical leaves pivot at the central spindle and share the printed pages with their backing', () => {
  const displays = new DestinationDisplays(() => new T.Texture()), st = station(0), backing = displays.material(st);
  const front = displays.createFlap(st), back = displays.createFlap(st);
  front.geometry.computeBoundingBox();
  assert.ok(Math.abs(front.geometry.boundingBox.min.y) < 1e-6);
  assert.ok(Math.abs(front.geometry.boundingBox.max.y - .284) < 1e-6);
  assert.equal(front.material.side, T.DoubleSide);
  assert.equal(front.material, back.material);
  for (const key of ['angle', 'oldImage', 'newImage']) assert.equal(front.material.uniforms[key], backing.uniforms[key]);
  const { start, finish } = displayTransition(st, { s: 0 });
  displays.update({ s: start + (finish - start) * .7 / FLAP_TURNS }, st.start - 96, st.end + 216);
  assert.ok(front.material.uniforms.angle.value > Math.PI / 2, 'the reverse side of the falling physical leaf is exposed');
  front.geometry.dispose(); back.geometry.dispose();
});

test('canvas layouts show the requested destinations and timings without intermediate destinations', () => {
  const text = [], ctx = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {},
    fillText(value) { text.push(value); } };
  drawDestinationDisplay(ctx, departuresDisplay(station(0)));
  assert.deepEqual(text, ['U8', 'Waldheim', '1 Min', 'U3', 'Lindenau', '3 Min']);
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
