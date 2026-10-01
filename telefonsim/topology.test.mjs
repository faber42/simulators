import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from './engine.mjs';
import { OFFICE, AREA_PREFIXES, ENTRANCE_SITES, DIGIT_ORDER, aisleOrigin, releaseBlockView, sitesInArea, selectorSite, racksInArea,
  areaOrigin, targetPosition, subscriberHandoff, tapePosition, UPPER_FLOOR_Y, UPPER_FLOOR_CENTER, SOURCE_POSITION, EXTERNAL_GATE_POSITION, boundsOf, overviewFrame, corners, WHOLE_OFFICE_BOUNDS } from './topology.mjs';

test('all nine local number branches have unique permanent equipment sites', () => {
  const ids = new Set(), positions = new Set(), counts = [0, 0, 0, 0, 0, 0];
  for (const site of [...ENTRANCE_SITES, ...AREA_PREFIXES.flatMap(sitesInArea)]) {
    assert.ok(!ids.has(site.id), site.id); ids.add(site.id);
    const position = site.position.join('/'); assert.ok(!positions.has(position), site.id); positions.add(position);
    counts[site.stage]++;
    assert.ok(site.position.every((v, axis) => v >= WHOLE_OFFICE_BOUNDS.min[axis] && v <= WHOLE_OFFICE_BOUNDS.max[axis]));
  }
  assert.deepEqual(counts, [10, 10, 90, 900, 9000, 90000]);
  assert.equal(counts[5], OFFICE.finalSelectors);
  assert.equal(counts.slice(1, 5).reduce((a, b) => a + b), OFFICE.groupSelectors);
  assert.equal(AREA_PREFIXES.length, OFFICE.areas);
  for (const prefix of AREA_PREFIXES) {
    const visibleSlots = racksInArea(prefix).reduce((sum, r) => sum + (r.occupied ?? r.shelves) * 10, 0);
    assert.equal(visibleSlots, sitesInArea(prefix).length, 'distant rack facades preserve the occupied equipment count');
  }
});

test('each hundred-group has ten final selectors in a fixed rack with both last digits sharing the site', () => {
  for (const prefix of ['1000', '1191', '2345', '6182', '9999']) {
    const sites = Array.from({ length: 10 }, (_, slot) => selectorSite(5, prefix, slot));
    const rack = racksInArea(prefix.slice(0, 2)).find(r => r.id === sites[0].rack);
    assert.ok(rack); assert.ok(sites.every(s => s.rack === rack.id && s.shelf < rack.shelves));
    assert.notDeepEqual(selectorSite(5, prefix, 0).position, selectorSite(5, prefix, 1).position);
    assert.notDeepEqual(targetPosition(prefix + '01'), targetPosition(prefix + '99'), 'different subscribers have their own fixed upper-floor positions');
  }
  assert.notDeepEqual(selectorSite(5, '2345').position, selectorSite(5, '6182').position);
  assert.throws(() => selectorSite(5, '234')); assert.throws(() => selectorSite(3, 'ab'));
  assert.throws(() => selectorSite(5, '2345', 10));
});

test('outlet hunting selects the matching fixed equipment slot; revisiting a group preserves identity', () => {
  const e = new Exchange(); e.dialNumber('234567'); e.step(60);
  for (let i = 1; i < 5; i++) assert.equal(e.selectors[i + 1].slot, e.selectors[i].rotary - 1);
  const first = e.selectors.map(s => selectorSite(s.stage, s.prefix, s.slot));
  e.hangup(); e.step(60); e.dialNumber('618204'); e.step(60);
  assert.notEqual(first[5].id, e.selectors[5].key);
  e.hangup(); e.step(60); e.dialNumber('234568'); e.step(60);
  assert.deepEqual(e.selectors.map(s => selectorSite(s.stage, s.prefix, s.slot)), first);
});

test('perspective overview fits every corner for local routes and the complete office, including portrait views', () => {
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const local = boundsOf([SOURCE_POSITION, selectorSite(5, '9999', 2).position, subscriberHandoff('999999'), targetPosition('999999')], 12);
  for (const bounds of [WHOLE_OFFICE_BOUNDS, local, boundsOf([SOURCE_POSITION, EXTERNAL_GATE_POSITION], 12)]) {
    for (const aspect of [.7, 1, 2.5, 4]) {
      const f = overviewFrame(bounds, aspect);
      assert.ok(Math.abs(dot(f.back, f.up)) < 1e-10);
      assert.ok(Math.abs(dot(f.right, f.up)) < 1e-10);
      for (const p of corners(bounds)) {
        const offset = p.map((v, i) => v - f.position[i]), depth = -dot(offset, f.back);
        assert.ok(depth > 0);
        assert.ok(Math.abs(dot(offset, f.right)) < depth * Math.tan(38 * Math.PI / 360) * aspect);
        assert.ok(Math.abs(dot(offset, f.up)) < depth * Math.tan(38 * Math.PI / 360));
      }
    }
  }
});

test('entry proceeds forward, branches 1 through 9 run left to right, and zero has no local rack', () => {
  const finder = selectorSite(0, '2100'), entry = selectorSite(1);
  assert.equal(SOURCE_POSITION[0], finder.position[0]); assert.equal(finder.position[0], entry.position[0]);
  assert.ok(SOURCE_POSITION[2] > finder.position[2] && finder.position[2] > entry.position[2]);
  for (let digit = 1; digit <= 9; digit++) {
    const gateway = selectorSite(2, String(digit)); assert.ok(gateway.position[2] < entry.position[2]);
    if (digit < 9) assert.ok(gateway.position[0] < selectorSite(2, String(digit + 1)).position[0]);
  }
  assert.ok(AREA_PREFIXES.every(p => !p.startsWith('0')));
  assert.throws(() => selectorSite(2, '0')); assert.throws(() => areaOrigin('00'));
  assert.throws(() => targetPosition('012345'));
});

test('both announcement machines share a central upper-floor station', () => {
  const time = tapePosition('time'), program = tapePosition('program');
  for (const p of [time, program]) {
    assert.equal(p[0], UPPER_FLOOR_CENTER[0]); assert.equal(p[2], UPPER_FLOOR_CENTER[2]);
    assert.ok(p[1] > UPPER_FLOOR_Y);
  }
  assert.notEqual(time[1], program[1]);
  assert.notDeepEqual(time, targetPosition('119100')); assert.notDeepEqual(program, targetPosition('119200'));
});

test('subscriber risers are vertical above the actual final selector outlet', () => {
  for (const number of ['100010', '234567', '999999']) for (let slot = 0; slot < 10; slot++) {
    const lw = selectorSite(5, number.slice(0, 4), slot).position;
    const riser = subscriberHandoff(number, slot), phone = targetPosition(number, slot);
    assert.equal(riser[0], lw[0]); assert.equal(riser[2], lw[2] + 1);
    assert.deepEqual(phone, targetPosition(number), 'phone position depends on the full number, not the selected outlet');
    assert.ok(riser[1] > WHOLE_OFFICE_BOUNDS.max[1]); assert.ok(phone[1] > riser[1]);
  }
});

test('subgroups use pulse order 1 through 9 then 0, while equipment identities stay numeric', () => {
  assert.deepEqual(DIGIT_ORDER, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  for (let i = 0; i < 10; i++) {
    const digit = DIGIT_ORDER[i];
    assert.equal(areaOrigin(`2${digit}`)[2], -42 - i * OFFICE.areaPitchZ);
    const aisle = aisleOrigin(`23${digit}`), origin = areaOrigin('23');
    assert.equal(aisle[0], origin[0] - 60 + (i % 2) * 67);
    assert.equal(aisle[2], origin[2] - 13 - Math.floor(i / 2) * 17);
    const site = selectorSite(5, `234${digit}`);
    assert.equal(site.id, `5:234${digit}:0`);
    assert.equal(site.shelf, i % 6); assert.ok(site.rack.endsWith(i < 6 ? '-1' : '-2'));
  }
});

test('release view encloses the complete selected block and has safe early-hangup fallbacks', () => {
  for (const prefix of AREA_PREFIXES) {
    const { bounds, label } = releaseBlockView(prefix);
    assert.equal(label, `BLOCK ${prefix}xxxx`);
    for (const site of sitesInArea(prefix)) assert.ok(site.position.every((v, axis) => v >= bounds.min[axis] && v <= bounds.max[axis]));
  }
  for (const prefix of ['', '0', '2', '23', '90']) {
    const frame = overviewFrame(releaseBlockView(prefix).bounds, .7, 42);
    assert.ok(frame.position.every(Number.isFinite)); assert.ok(frame.distance > 0);
  }
  assert.equal(releaseBlockView('0').label, 'AMTSZUGANG');
});
