import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import { getTrafficProfile, localDateTimeToEpoch } from './time-model.mjs';
import dortmund from './locations/dortmund.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30;
const TINY_DENSITY = 1e-12;
const EPSILON = 1e-6;

function fixture({ density = TINY_DENSITY, interval = 10, rates = [10, 30, 0], red = false } = {}) {
  return {
    seed: 42, density, initialVehiclesPerLane: 0,
    phases: [{ id: 'steady', groups: [red ? 'other' : 'flow'], duration: 10000 }],
    timing: { yellow: 1, allRed: 1, redAmber: 1 },
    routes: rates.map((rate, index) => ({ id: `lane-${index}`, laneId: `lane-${index}`, exitId: `exit-${index}`,
      group: 'flow', points: [[index * 8, 0], [index * 8, 1200]], stopLine: [index * 8, red ? 10 : 1100],
      rate, speed: 12, vehicleKinds: ['car'] })),
    minimumArrivals: [{ id: 'one-direction', interval, routeIds: rates.map((_, index) => `lane-${index}`) }],
  };
}

function traceArrivals(simulation, seconds) {
  const known = new Set(simulation.vehicles.map(vehicle => vehicle.id)), events = [];
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
    simulation.update(STEP);
    for (const vehicle of simulation.vehicles) if (!known.has(vehicle.id)) {
      known.add(vehicle.id); events.push({ id: vehicle.id, routeId: vehicle.routeId, laneId: vehicle.route.laneId, at: simulation.elapsed });
    }
  }
  return events;
}

function state(simulation) {
  return { elapsed: simulation.elapsed, randomState: simulation.randomState, passed: simulation.passed,
    phase: [simulation.phaseIndex, simulation.stage, simulation.stageElapsed], arrivals: [...simulation.arrivals],
    cars: simulation.vehicles.map(vehicle => ({ id: vehicle.id, routeId: vehicle.routeId, distance: vehicle.distance,
      speed: vehicle.speed, kind: vehicle.kind, color: vehicle.color })) };
}

for (const [location, expectedIntervals] of [[dortmund, [60, 60, 300, 300]], [opphoff, [120, 120, 120, 120]]]) {
  test(`${location.name}: minima describe four incoming directions, not one timer per lane or destination`, () => {
    assert.deepEqual(location.minimumArrivals.map(group => group.interval).sort((a, b) => a - b), expectedIntervals);
    assert.equal(new Set(location.minimumArrivals.map(group => group.id)).size, 4);
    for (const route of location.routes.filter(route => route.rate > 0)) assert.equal(
      location.minimumArrivals.filter(group => group.routeIds.includes(route.id)).length, 1,
      `Positive-demand route ${route.id} needs exactly one incoming direction`);
  });

  for (const date of ['2026-10-04', '2026-10-05']) test(`${location.name}: ${date} at 01:30 retains the minimum per free incoming direction`, t => {
    const startTime = localDateTimeToEpoch(date, '01:30', location.timeZone);
    const profile = getTrafficProfile(startTime, location.timeZone);
    assert.equal(profile.density, .02, 'Exercise the real Sunday and Monday night profile');
    const simulation = new TrafficSimulation({ ...location, density: profile.density, initialVehiclesPerLane: 0 },
      { startTime, minimumTraffic: true });
    const lanes = new Map(location.minimumArrivals.map(group => [group.id, new Set(group.routeIds.map(id =>
      simulation.routes.find(route => route.id === id).laneId))]));
    const history = new Map(location.minimumArrivals.map(group => [group.id, [0]]));
    const known = new Set();
    for (let tick = 0; tick < 900 / STEP; tick++) {
      simulation.update(STEP);
      for (const vehicle of simulation.vehicles) if (!known.has(vehicle.id)) {
        known.add(vehicle.id);
        // Lane membership remains stable when a B1 car chooses a zero-rate
        // alternative after spawning, unlike its chosen destination route id.
        const group = location.minimumArrivals.find(group => lanes.get(group.id).has(vehicle.route.laneId));
        assert.ok(group, `${vehicle.routeId} has no incoming direction`);
        history.get(group.id).push(simulation.elapsed);
      }
      for (const group of location.minimumArrivals) {
        const gap = simulation.elapsed - history.get(group.id).at(-1);
        const eligible = simulation.routes.filter(route => group.routeIds.includes(route.id) && route.rate > 0);
        const free = eligible.some(route => !simulation.vehicles.some(vehicle =>
          vehicle.route.laneId === route.laneId && vehicle.distance < 18));
        assert.ok(gap <= group.interval + STEP + EPSILON || !free,
          `${group.id} remained empty for ${gap.toFixed(2)} simulated seconds despite a free approach`);
      }
    }
    for (const group of location.minimumArrivals) {
      const times = history.get(group.id), gaps = times.slice(1).map((time, index) => time - times[index]);
      gaps.push(900 - times.at(-1));
      assert.ok(times.length > 1, `${group.id} needs actual incoming vehicles`);
      assert.ok(Math.max(...gaps) <= group.interval + STEP + EPSILON,
        `The low-demand free fixture exceeded ${group.id}'s ${group.interval} s interval`);
      t.diagnostic(`${group.id}: ${times.length - 1} arrivals, largest gap ${Math.max(...gaps).toFixed(2)} s`);
    }
    assert.equal(simulation.trams.length, 0, 'Minimum road traffic must not invent night train service');
    assert.ok(Math.abs(simulation.getClockTime() - startTime - 900000) < .01);
  });

  test(`${location.name}: fallback-only traffic creates one car per direction interval rather than per route`, () => {
    const simulation = new TrafficSimulation({ ...location, density: TINY_DENSITY, initialVehiclesPerLane: 0 }, { minimumTraffic: true });
    const events = traceArrivals(simulation, 900);
    const byLane = new Map(location.minimumArrivals.map(group => [group.id, new Set(group.routeIds.map(id =>
      simulation.routes.find(route => route.id === id).laneId))]));
    for (const group of location.minimumArrivals) assert.equal(
      events.filter(event => byLane.get(group.id).has(event.laneId)).length, Math.floor(900 / group.interval),
      `${group.id} must not multiply its minimum by lane count or turning alternatives`);
    assert.equal(events.length, location.minimumArrivals.reduce((sum, group) => sum + Math.floor(900 / group.interval), 0));
  });
}

test('weighted fallback chooses positive-demand free routes and never activates a dormant route', () => {
  const simulation = new TrafficSimulation(fixture({ interval: 5 }), { minimumTraffic: true });
  const events = traceArrivals(simulation, 1000);
  assert.equal(events.length, 200, 'A group creates exactly one car on each missed deadline');
  assert.ok(events.every(event => event.routeId !== 'lane-2'), 'A zero-rate lane is an alternative, not an extra demand source');
  const highWeight = events.filter(event => event.routeId === 'lane-1').length;
  assert.ok(highWeight > 125 && highWeight < 180, `The 3:1 route weighting produced ${highWeight} / 200 high-weight choices`);
});

test('a natural arrival resets its whole direction deadline and wins a same-tick tie with fallback', () => {
  const simulation = new TrafficSimulation(fixture({ density: .02, interval: 10 }), { minimumTraffic: true });
  simulation.routes.forEach(route => simulation.arrivals.set(route.id, Infinity));
  simulation.arrivals.set('lane-0', 10);
  const events = traceArrivals(simulation, 10);
  assert.equal(events.length, 1, 'Natural and fallback arrivals on the same tick must not create two cars');
  assert.equal(events[0].routeId, 'lane-0');
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - 20) < EPSILON);
  simulation.routes.forEach(route => simulation.arrivals.set(route.id, Infinity));
  simulation.arrivals.set('lane-1', 3);
  assert.equal(traceArrivals(simulation, 3).length, 1);
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - 23) < EPSILON,
    'An arrival in any lane postpones the shared direction deadline');
  simulation.routes.forEach(route => simulation.arrivals.set(route.id, Infinity));
  assert.equal(traceArrivals(simulation, 9).length, 0, 'The former deadline at 20 must not emit an extra car');
  assert.equal(traceArrivals(simulation, 1).length, 1);
});

test('frequent natural arrivals are bit-for-bit unchanged when minimum traffic is enabled', () => {
  const config = fixture({ density: 1, interval: 30, rates: [3600, 3600, 0] });
  const ordinary = new TrafficSimulation(config), minimum = new TrafficSimulation(config, { minimumTraffic: true });
  for (let tick = 0; tick < 90 / STEP; tick++) { ordinary.update(STEP); minimum.update(STEP); }
  assert.ok(ordinary.nextId > 20, 'The comparison must contain substantial ordinary traffic');
  assert.deepEqual(state(minimum), state(ordinary), 'An inactive floor must not add cars or consume randomness');
});

test('a blocked lane is skipped when another positive-demand lane in that direction is free', () => {
  const simulation = new TrafficSimulation(fixture({ red: true }), { minimumTraffic: true });
  const route = simulation.routes[0], blocker = simulation.createVehicle(route, 6.5);
  simulation.vehicles.push(blocker);
  const events = traceArrivals(simulation, 10);
  assert.equal(events.length, 1); assert.equal(events[0].routeId, 'lane-1');
  assert.equal(simulation.vehicles.filter(vehicle => vehicle.routeId === 'lane-0').length, 1,
    'The standing blocker may not receive a new vehicle through its body');
});

test('fully blocked entry does not renew the deadline and clearing it emits no catch-up burst', () => {
  const simulation = new TrafficSimulation(fixture({ red: true, rates: [10, 30] }), { minimumTraffic: true });
  for (const route of simulation.routes) simulation.vehicles.push(simulation.createVehicle(route, 6.5));
  simulation.arrivals.set('lane-0', 2);
  const blockers = new Set(simulation.vehicles.map(vehicle => vehicle.id));
  assert.equal(traceArrivals(simulation, 25).length, 0);
  assert.equal(simulation.minimumArrivalDue.get('one-direction'), 10,
    'Neither repeated natural retries nor missed fallback attempts count as an arrival');
  assert.ok(simulation.vehicles.every(vehicle => blockers.has(vehicle.id)));
  simulation.vehicles = [];
  assert.equal(traceArrivals(simulation, STEP).length, 1, 'A freed overdue direction gets one car');
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - simulation.elapsed - 10) < EPSILON);
  assert.equal(traceArrivals(simulation, 2).length, 0, 'Missed intervals do not accumulate as a burst');
});

test('minimum traffic defaults off, toggles start fresh intervals, and repeated enabling does not postpone them', () => {
  const simulation = new TrafficSimulation(fixture());
  assert.equal(traceArrivals(simulation, 40).length, 0);
  simulation.setMinimumTraffic(true);
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - 50) < EPSILON);
  assert.equal(traceArrivals(simulation, 5).length, 0);
  simulation.setMinimumTraffic(true);
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - 50) < EPSILON);
  assert.equal(traceArrivals(simulation, 4).length, 0);
  simulation.setMinimumTraffic(false);
  assert.equal(traceArrivals(simulation, 20).length, 0);
  simulation.setMinimumTraffic(true);
  assert.ok(Math.abs(simulation.minimumArrivalDue.get('one-direction') - 79) < EPSILON);
  assert.equal(traceArrivals(simulation, 10).length, 1);
});

test('zero density remains empty even with the floor enabled, including a manual zero after running', () => {
  const empty = new TrafficSimulation(fixture({ density: 0 }), { minimumTraffic: true });
  assert.equal(traceArrivals(empty, 100).length, 0);
  empty.setDensity(TINY_DENSITY);
  assert.ok(Math.abs(empty.minimumArrivalDue.get('one-direction') - 110) < EPSILON);
  assert.equal(traceArrivals(empty, 9).length, 0, 'Leaving zero density starts a fresh interval without overdue traffic');
  assert.equal(traceArrivals(empty, 1).length, 1);
  const simulation = new TrafficSimulation(fixture(), { minimumTraffic: true });
  assert.equal(traceArrivals(simulation, 10).length, 1);
  simulation.setMinimumTraffic(false); simulation.setDensity(0);
  assert.equal(traceArrivals(simulation, 100).length, 0);
  simulation.setMinimumTraffic(true);
  assert.equal(traceArrivals(simulation, 100).length, 0, 'Zero density is authoritative even if the floor is enabled separately');
});

test('reset and clock rebasing reproduce a clean full-period minimum schedule', () => {
  const startTime = localDateTimeToEpoch('2026-10-05', '01:30');
  const simulation = new TrafficSimulation(fixture(), { minimumTraffic: true, startTime });
  traceArrivals(simulation, 27); simulation.reset();
  const fresh = new TrafficSimulation(fixture(), { minimumTraffic: true, startTime });
  assert.equal(simulation.elapsed, 0); assert.equal(simulation.minimumArrivalDue.get('one-direction'), 10);
  assert.deepEqual(traceArrivals(simulation, 20), traceArrivals(fresh, 20));
  assert.deepEqual(state(simulation), state(fresh));
  simulation.setClockTime(startTime + 86400000);
  assert.equal(simulation.getClockTime(), startTime + 86400000);
  assert.equal(simulation.minimumArrivalDue.get('one-direction'), 10);
  assert.equal(traceArrivals(simulation, 9).length, 0);
  assert.equal(traceArrivals(simulation, 1).length, 1);
});

test('minimum arrivals follow simulated time, remain paused without positive dt, and ignore frame partitioning', () => {
  const startTime = localDateTimeToEpoch('2026-10-04', '01:30');
  const fast = new TrafficSimulation(fixture(), { minimumTraffic: true, startTime });
  const framed = new TrafficSimulation(fixture(), { minimumTraffic: true, startTime });
  for (let i = 0; i < 100; i++) { fast.update(0); fast.update(NaN); fast.update(-1); }
  assert.equal(fast.elapsed, 0); assert.equal(fast.nextId, 1); assert.equal(fast.getClockTime(), startTime);
  fast.update(60);
  for (let frame = 0; frame < 60 * 120; frame++) framed.update(1 / 120);
  assert.deepEqual(state(fast), state(framed));
  assert.deepEqual([...fast.minimumArrivalDue], [...framed.minimumArrivalDue]);
  assert.equal(fast.nextId - 1, 6);
  assert.ok(Math.abs(fast.getClockTime() - startTime - 60000) < .01);
});
