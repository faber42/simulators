import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, samplePath, TrafficSimulation } from './engine.mjs';

function config(overrides = {}) {
  return {
    seed: 42, initialVehiclesPerLane: 0,
    timing: { yellow: 0.3, allRed: 0.3, redAmber: 0.2 },
    phases: [
      { id: 'main-a', groups: ['main'], duration: 4 },
      { id: 'southbound', groups: ['north'], duration: 2 },
      { id: 'main-b', groups: ['main'], duration: 4 },
      { id: 'northbound', groups: ['south'], duration: 2 },
    ],
    conflictBounds: { minX: -25, maxX: 25, minZ: -25, maxZ: 25 },
    routes: [
      { id: 'east', laneId: 'west', exitId: 'east', group: 'main', points: [[-160, 7], [-40, 7], [40, 7], [160, 7]], stopLine: [-30, 7], rate: 700, speed: 13.9 },
      { id: 'west', laneId: 'east', exitId: 'west', group: 'main', points: [[160, -7], [40, -7], [-40, -7], [-160, -7]], stopLine: [30, -7], rate: 700, speed: 13.9 },
      { id: 'south', laneId: 'north', exitId: 'south', group: 'north', points: [[-4, -160], [-4, -40], [-4, 40], [-4, 160]], stopLine: [-4, -30], rate: 400, speed: 11 },
      { id: 'north', laneId: 'south', exitId: 'north', group: 'south', points: [[4, 160], [4, 40], [4, -40], [4, -160]], stopLine: [4, 30], rate: 400, speed: 11 },
    ],
    ...overrides,
  };
}

function stagedConfig() {
  return {
    seed: 42, density: 0, initialVehiclesPerLane: 0,
    timing: { yellow: 0.3, allRed: 0.3, redAmber: 1 },
    conflictBounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
    phases: [
      { id: 'main-a', groups: ['main', 'leftSouth'], groupDelays: { leftSouth: 7 }, duration: 24 },
      { id: 'side-south', groups: ['middleSouth', 'north'], groupDelays: { north: 5 }, drainGroups: ['middleSouth'], duration: 14 },
      { id: 'main-b', groups: ['main', 'leftNorth'], groupDelays: { leftNorth: 7 }, duration: 16 },
      { id: 'side-north', groups: ['middleNorth', 'south'], groupDelays: { south: 5 }, drainGroups: ['middleNorth'], duration: 14 },
    ],
    routes: [{ id: 'staged-left', laneId: 'left', exitId: 'south', turn: 'left', group: 'leftSouth',
      points: [[-10, -120], [-10, -40], [-10, -12], [-10, 9], [-10, 120]], vehicleKinds: ['car'], rate: 0, speed: 9,
      stops: [
        { id: 'entry', group: 'leftSouth', point: [-10, -40], clearPoint: [-10, -12], storage: { id: 'median-south', capacity: 2 } },
        { id: 'middle', group: 'middleSouth', point: [-10, 9] },
      ],
    }],
  };
}

function transitConfig(offsets = [16, 16]) {
  const options = stagedConfig();
  options.phases[0].duration = 20;
  options.phases[1].groupDelays = {};
  options.phases[3].groupDelays = {};
  options.transit = {
    greenGroups: ['main'], blockedGroups: ['leftSouth', 'leftNorth'],
    routes: offsets.map((offset, index) => {
      const direction = index === 0 ? 1 : -1, z = index === 0 ? 2.4 : -2.4;
      return { id: `tram-${index}`, label: `Direction ${index}`, points: [[-140 * direction, z], [140 * direction, z]],
        stopLine: [-35 * direction, z], clearPoint: [35 * direction, z], interval: 600, offset, speed: 10, length: 28 };
    }),
  };
  return options;
}

function timetableConfig() {
  const options = transitConfig([16, 40]);
  options.timeZone = 'Europe/Berlin';
  options.transit.routes.forEach((route, index) => {
    route.schedule = { minuteOffset: index === 0 ? 9 : 2, intervalMinutes: 10,
      sundayIntervalMinutes: 20, serviceStart: 300, serviceEnd: 1410 };
  });
  return options;
}

test('path sampling uses metres and the renderer +Z heading convention', () => {
  const path = buildPath([[0, 0], [0, 100]]);
  assert.ok(Math.abs(path.length - 100) < 1e-9);
  assert.deepEqual(samplePath(path, 50), { x: 0, z: 50, heading: 0 });
  assert.equal(samplePath(buildPath([[0, 0], [100, 0]]), 50).heading, Math.PI / 2);
  assert.equal(samplePath(path, -10).z, 0);
  assert.equal(samplePath(path, 150).z, 100);
  assert.throws(() => buildPath([[0, 0], [0, 0]]));
});

test('closely spaced turn points followed by a long exit do not create spline loops', () => {
  const path = buildPath([[-4.5, -15], [-3, -3], [1, 7], [8, 12], [20, 13.8], [45, 13.8], [220, 13.8]]);
  let previous = samplePath(path, 0);
  for (let distance = 0.5; distance < path.length; distance += 0.5) {
    const current = samplePath(path, distance);
    const headingChange = Math.abs(Math.atan2(Math.sin(current.heading - previous.heading), Math.cos(current.heading - previous.heading)));
    assert.ok(current.x >= previous.x - 0.001, 'Eastbound exit must never double back on itself');
    assert.ok(headingChange < Math.PI / 6, 'Vehicle heading must remain smooth through the turn');
    previous = current;
  }
});

test('four phases alternate main, southbound, main, northbound with protected transitions', () => {
  const simulation = new TrafficSimulation(config({ density: 0 }));
  const order = [simulation.phaseIndex];
  let previousStage = simulation.stage;
  for (let tick = 0; tick < 600; tick++) {
    simulation.update(1 / 30);
    const green = ['main', 'north', 'south'].filter(group => simulation.getSignal(group) === 'green');
    assert.ok(green.length <= 1, 'Conflicting signal groups cannot show green together');
    if (simulation.stage === 'clearance') assert.ok(['main', 'north', 'south'].every(group => simulation.getSignal(group) === 'red'));
    if (simulation.stage === 'green' && previousStage !== 'green') order.push(simulation.phaseIndex);
    previousStage = simulation.stage;
  }
  assert.deepEqual(order.slice(0, 5), [0, 1, 2, 3, 0]);
  assert.ok(simulation.cycle >= 2);
});

test('delayed left entry alternates with main phases and never flashes on when skipped early', () => {
  const simulation = new TrafficSimulation(stagedConfig());
  assert.equal(simulation.getSignal('main'), 'green');
  assert.equal(simulation.getSignal('leftSouth'), 'red');
  simulation.update(6);
  assert.equal(simulation.getSignal('leftSouth'), 'redAmber');
  simulation.update(1);
  assert.equal(simulation.getSignal('leftSouth'), 'green');
  assert.equal(simulation.getSignal('leftNorth'), 'red');
  while (!(simulation.phaseIndex === 2 && simulation.stage === 'redAmber')) simulation.update(1 / 30);
  assert.equal(simulation.getSignal('leftNorth'), 'red', 'Delayed group must stay red during global red-amber');
  simulation.update(1);
  assert.equal(simulation.getSignal('leftNorth'), 'red');
  simulation.update(7);
  assert.equal(simulation.getSignal('leftNorth'), 'green');
  assert.equal(simulation.getSignal('leftSouth'), 'red');

  const early = new TrafficSimulation(stagedConfig());
  early.requestNextPhase();
  assert.equal(early.getSignal('leftSouth'), 'red');
  early.update(0.1);
  assert.equal(early.getSignal('leftSouth'), 'red');
});

test('two-stage storage admits at most two vehicles, holds at inner red, then drains before outer release', () => {
  const simulation = new TrafficSimulation(stagedConfig());
  const route = simulation.routes[0];
  for (let index = 0; index < 5; index++) simulation.vehicles.push(simulation.createVehicle(route, route.stopDistance - 5 - index * 9));
  for (let tick = 0; tick < 23 * 30; tick++) {
    simulation.update(1 / 30);
    assert.ok(simulation.vehicles.filter(vehicle => vehicle.reservations.length).length <= 2);
    for (const vehicle of simulation.vehicles) {
      assert.ok(vehicle.passedGateIndex <= 0, 'Second red light must still stop cars after the first green');
      assert.ok(vehicle.distance + vehicle.length / 2 < route.stops[1].distance);
    }
  }
  assert.equal(simulation.vehicles.filter(vehicle => vehicle.passedGateIndex === 0).length, 2);
  assert.equal(simulation.getStatus().stagedWaiting, 2);
  const staged = simulation.vehicles.filter(vehicle => vehicle.passedGateIndex === 0);
  assert.ok(staged.every(vehicle => vehicle.distance - vehicle.length / 2 > route.stops[0].clearDistance), 'All admitted tails fit beyond the through-traffic conflict');
  simulation.requestNextPhase();
  while (!(simulation.phaseIndex === 1 && simulation.stage === 'green')) simulation.update(1 / 30);
  assert.equal(simulation.getSignal('middleSouth'), 'green');
  assert.equal(simulation.getSignal('north'), 'red');
  simulation.update(5);
  assert.equal(simulation.getSignal('north'), 'green');
  assert.ok(staged.every(vehicle => vehicle.passedGateIndex === 1), 'Staged traffic receives the early inner green');
  simulation.update(200);
  assert.ok(simulation.cycle >= 3, 'Safe parked cars must not deadlock phase clearance');
  assert.equal(simulation.passed, 5);
});

test('late side entrants see two real greens: inner drain stays green until their tails clear', () => {
  const options = stagedConfig();
  options.phases = [{ groups: ['north', 'middleSouth'], drainGroups: ['middleSouth'], duration: 5 }, { groups: ['main'], duration: 10 }];
  const routeConfig = options.routes[0];
  routeConfig.stops[0] = { id: 'outer', group: 'north', point: [-10, -40] };
  const simulation = new TrafficSimulation(options);
  const route = simulation.routes[0];
  const vehicle = simulation.createVehicle(route, route.stopDistance - 3.3);
  vehicle.speed = 9;
  simulation.vehicles.push(vehicle);
  simulation.stageElapsed = 4.8;
  let sawDrain = false, sawSecondGreen = false;
  for (let tick = 0; tick < 900 && simulation.phaseIndex === 0; tick++) {
    const previousGate = vehicle.passedGateIndex;
    simulation.update(1 / 30);
    if (simulation.stage === 'drain') {
      sawDrain = true;
      assert.equal(simulation.getSignal('north'), 'red');
      assert.equal(simulation.getSignal('middleSouth'), 'green');
    }
    if (vehicle.passedGateIndex === 1 && previousGate === 0) {
      assert.equal(simulation.getSignal('middleSouth'), 'green');
      sawSecondGreen = true;
    }
    if (simulation.stage === 'drainYellow') assert.ok(vehicle.distance - vehicle.length / 2 > route.clearDistance);
  }
  assert.equal(sawDrain, true);
  assert.equal(sawSecondGreen, true);
  assert.equal(simulation.phaseIndex, 1);
});

test('an immediate manual end of the side phase still releases waiting median vehicles', () => {
  const simulation = new TrafficSimulation(stagedConfig());
  const route = simulation.routes[0];
  const vehicle = simulation.createVehicle(route, route.stops[1].distance - 3.05);
  vehicle.passedGateIndex = 0;
  vehicle.reservations.push({ id: 'median-south', releaseDistance: route.stops[1].distance });
  simulation.vehicles.push(vehicle);
  simulation.phaseIndex = 1;
  simulation.phaseSerial = 1;
  simulation.requestNextPhase();
  assert.equal(simulation.getSignal('north'), 'red', 'Outer delay never opened, so it must not flash yellow');
  let drained = false;
  for (let tick = 0; tick < 900 && simulation.phaseIndex === 1; tick++) {
    simulation.update(1 / 30);
    if (vehicle.passedGateIndex === 1) drained = true;
    if (simulation.stage === 'drain') assert.equal(simulation.getSignal('middleSouth'), 'green');
  }
  assert.equal(drained, true);
  assert.equal(simulation.phaseIndex, 2);
});

test('invalid group delays and drain group membership are rejected', () => {
  for (const delay of [-1, NaN, Infinity, 24]) {
    const options = stagedConfig();
    options.phases[0].groupDelays.leftSouth = delay;
    assert.throws(() => new TrafficSimulation(options), /delay/);
  }
  const unknown = stagedConfig();
  unknown.phases[0].groupDelays.otherGroup = 1;
  assert.throws(() => new TrafficSimulation(unknown), /delay/);
  const invalidDrain = stagedConfig();
  invalidDrain.phases[0].drainGroups = ['middleSouth'];
  assert.throws(() => new TrafficSimulation(invalidDrain), /Drain/);
});

test('inner and outer signals can open together while protected median clearing remains independent', () => {
  const simulation = new TrafficSimulation(transitConfig([500, 524]));
  for (let tick = 0; tick < 8000 && simulation.cycle < 2; tick++) {
    simulation.update(1 / 30);
    if (simulation.stage !== 'green') continue;
    if (simulation.phaseIndex === 1) assert.equal(simulation.getSignal('middleSouth'), simulation.getSignal('north'));
    if (simulation.phaseIndex === 3) assert.equal(simulation.getSignal('middleNorth'), simulation.getSignal('south'));
  }
  assert.equal(simulation.cycle, 2);
});

test('a late scheduled tram reserves the entire B1 phase and both directions can cross together', () => {
  const simulation = new TrafficSimulation(transitConfig());
  assert.equal(simulation.getStatus().transit.protected, true);
  assert.equal(simulation.getSignal('leftSouth'), 'red');
  let crossedTogether = false;
  for (let tick = 0; tick < 1200; tick++) {
    simulation.update(1 / 30);
    if (simulation.phaseIndex === 0) {
      assert.equal(simulation.getSignal('leftSouth'), 'red');
      assert.equal(simulation.getSignal('leftNorth'), 'red');
    }
    if (simulation.trams.filter(tram => tram.committed).length === 2) crossedTogether = true;
    if (simulation.phaseIndex === 1) assert.ok(simulation.trams.every(tram => !tram.committed || tram.distance - tram.length / 2 > tram.route.clearDistance), 'Side traffic must wait for the complete rear of both trains');
  }
  assert.equal(crossedTogether, true);
  assert.equal(simulation.vehicles.length, 0, 'Transit schedules remain active at car density zero');
  assert.ok(simulation.transitPassed > 0);
});

test('a skipped reserved phase and an unexpected late request wait for a fully booked B1 phase', () => {
  const simulation = new TrafficSimulation(transitConfig([8]));
  simulation.update(2);
  simulation.requestNextPhase();
  let sawWaiting = false, enteredLater = false;
  for (let tick = 0; tick < 3000 && !enteredLater; tick++) {
    simulation.update(1 / 30);
    for (const tram of simulation.trams) {
      if (!tram.committed && simulation.phaseIndex === 1 && tram.speed < 0.5) sawWaiting = true;
      if (tram.committed) { assert.equal(simulation.transitProtected, true); assert.equal(simulation.phaseIndex, 2); enteredLater = true; }
    }
  }
  assert.equal(sawWaiting, true);
  assert.equal(enteredLater, true);
  const late = new TrafficSimulation(transitConfig([500]));
  assert.equal(late.transitProtected, false);
  late.nextTransitDue.set('tram-0', 0); // A newly announced request missed the phase's booking deadline.
  late.update(12);
  assert.equal(late.getTransitSignal('tram-0'), 'red');
  assert.equal(late.trams[0].committed, false);
  assert.ok(late.trams[0].distance + late.trams[0].length / 2 < late.trams[0].route.stopDistance);
});

test('tram schedules repeat at 600 seconds and reset reproduces the original booking', () => {
  const simulation = new TrafficSimulation(transitConfig([16, 40]));
  simulation.update(1250);
  assert.ok(simulation.transitPassed >= 4);
  assert.deepEqual([...simulation.nextTransitDue.values()], [1816, 1840]);
  simulation.reset();
  assert.equal(simulation.transitProtected, true);
  assert.equal(simulation.transitPassed, 0);
  assert.deepEqual(simulation.getStatus().transit.nextArrivals.map(arrival => arrival.in), [16, 40]);
});

test('a selected clock advances with simulation time, pauses, and resets to its chosen base', () => {
  const startTime = Date.parse('2026-10-03T12:08:50+02:00');
  const simulation = new TrafficSimulation(timetableConfig(), { startTime });
  assert.equal(simulation.getClockTime(), startTime);
  assert.deepEqual(simulation.getStatus().transit.nextArrivals.map(arrival => [arrival.in, arrival.scheduledTime]), [
    [10, Date.parse('2026-10-03T12:09:00+02:00')],
    [190, Date.parse('2026-10-03T12:12:00+02:00')],
  ]);
  const originalStatus = simulation.getStatus();
  simulation.update(.017);
  assert.equal(simulation.elapsed, 0, 'The displayed clock includes sub-tick time without advancing physics early');
  assert.equal(simulation.getClockTime(), startTime + 17);
  simulation.update(4 - .017);
  assert.ok(Math.abs(simulation.getClockTime() - startTime - 4000) < .001);
  for (let frame = 0; frame < 60; frame++) simulation.update(0);
  assert.ok(Math.abs(simulation.getClockTime() - startTime - 4000) < .001, 'Paused updates never consult the real clock');
  simulation.reset();
  assert.equal(simulation.getClockTime(), startTime);
  assert.deepEqual(simulation.getStatus(), originalStatus);
  simulation.update(80);
  const sunday = Date.parse('2026-10-04T12:01:59+02:00');
  simulation.setClockTime(sunday);
  assert.equal(simulation.getClockTime(), sunday);
  assert.equal(simulation.elapsed, 0);
  assert.equal(simulation.phaseIndex, 0);
  assert.equal(simulation.transitPassed, 0);
  assert.equal(simulation.nextId, 1);
  assert.deepEqual(simulation.getStatus().transit.nextArrivals.map(arrival => arrival.in), [421, 1]);
  simulation.update(5);
  simulation.reset();
  assert.equal(simulation.getClockTime(), sunday, 'Later resets retain the newly selected start time');
  for (const invalid of [NaN, Infinity, -Infinity, '2026-10-04', 9e15]) {
    assert.throws(() => simulation.setClockTime(invalid), /startTime/);
    assert.equal(simulation.getClockTime(), sunday, 'Invalid clock input cannot partially rebase the running model');
  }
});

test('clockless scenarios retain relative schedules and clocked routes without timetables do too', () => {
  const legacy = new TrafficSimulation(timetableConfig());
  assert.equal(legacy.getClockTime(), null);
  assert.deepEqual(legacy.getStatus().transit.nextArrivals.map(arrival => [arrival.in, arrival.scheduledTime]), [[16, null], [40, null]]);
  const startTime = Date.parse('2026-10-04T02:00:00+02:00');
  const clockedLegacy = new TrafficSimulation(transitConfig([16, 40]), { startTime });
  assert.deepEqual(clockedLegacy.getStatus().transit.nextArrivals.map(arrival => arrival.in), [16, 40]);
  clockedLegacy.update(50);
  assert.deepEqual([...clockedLegacy.nextTransitDue.values()], [616, 640]);
});

test('an exact timetable boundary creates one tram and reserves the entire phase before its arrival', () => {
  const startTime = Date.parse('2026-10-03T12:08:45+02:00');
  const simulation = new TrafficSimulation(timetableConfig(), { startTime });
  assert.equal(simulation.transitProtected, true, 'A departure near the end of B1 green must be booked at its beginning');
  assert.equal(simulation.trams.length, 0, 'Distant approaching trains need not exist before their approach lead time');
  for (let tick = 0; tick < 20 * 30; tick++) {
    simulation.update(1 / 30);
    assert.equal(simulation.getSignal('leftSouth'), 'red');
    assert.equal(simulation.getSignal('leftNorth'), 'red');
  }
  assert.equal(simulation.nextTramId, 2);
  assert.equal(simulation.trams[0].scheduledAt, 15);
  simulation.setClockTime(Date.parse('2026-10-03T12:09:00+02:00'));
  assert.equal(simulation.trams.length, 1, 'An inclusive departure exactly at the selected time appears once');
  assert.equal(simulation.trams[0].scheduledAt, 0);
  assert.equal(simulation.nextTransitDue.get('tram-0'), 600);
  simulation.update(.02); simulation.update(0); simulation.update(.02);
  assert.equal(simulation.nextTramId, 2, 'Fractional update calls must never create duplicate scheduled trips');
  assert.equal(simulation.nextTransitDue.get('tram-0'), 600);
});

test('Sunday timetable uses twenty minutes and update subdivisions leave identical traffic and departures', () => {
  const startTime = Date.parse('2026-10-04T12:01:59+02:00');
  const whole = new TrafficSimulation(timetableConfig(), { startTime });
  const sliced = new TrafficSimulation(timetableConfig(), { startTime });
  whole.update(45);
  for (let frame = 0; frame < 2700; frame++) sliced.update(1 / 60);
  assert.equal(whole.nextTransitDue.get('tram-1'), 1201);
  assert.equal(whole.nextTramId, 2);
  const snapshot = simulation => ({ status: simulation.getStatus(), due: [...simulation.nextTransitDue],
    trams: simulation.trams.map(({ id, scheduledAt, distance, speed, committed }) => ({ id, scheduledAt, distance, speed, committed })) });
  assert.deepEqual(snapshot(whole), snapshot(sliced));
  assert.ok(Math.abs(whole.getClockTime() - startTime - 45000) < .001);
  assert.ok(Math.abs(sliced.getClockTime() - whole.getClockTime()) < .001);
});

test('night closure and a Sunday-to-Monday advance skip out-of-service trips without catch-up duplicates', () => {
  const options = timetableConfig();
  const startTime = Date.parse('2026-10-04T23:28:59+02:00');
  const simulation = new TrafficSimulation(options, { startTime });
  const departures = new Map(simulation.trams.map(tram => [tram.id, [tram.routeId, startTime + tram.scheduledAt * 1000]]));
  const spawn = simulation.spawnTrams.bind(simulation);
  simulation.spawnTrams = () => {
    spawn();
    for (const tram of simulation.trams) departures.set(tram.id, [tram.routeId, startTime + tram.scheduledAt * 1000]);
  };
  simulation.update(61);
  assert.equal(simulation.getClockTime(), Date.parse('2026-10-04T23:30:00+02:00'));
  assert.equal(simulation.trams.length, 0, 'The last admitted tram may clear after closing, but no new night trip is created');
  assert.equal(simulation.transitPassed, 1);
  assert.deepEqual(simulation.getStatus().transit.nextArrivals.map(arrival => arrival.scheduledTime), [
    Date.parse('2026-10-05T05:09:00+02:00'), Date.parse('2026-10-05T05:02:00+02:00'),
  ]);
  simulation.update(6 * 3600 - 61);
  const expected = [
    ['tram-0', '2026-10-04T23:29:00+02:00'],
    ['tram-1', '2026-10-05T05:02:00+02:00'],
    ['tram-0', '2026-10-05T05:09:00+02:00'],
    ['tram-1', '2026-10-05T05:12:00+02:00'],
    ['tram-0', '2026-10-05T05:19:00+02:00'],
    ['tram-1', '2026-10-05T05:22:00+02:00'],
    ['tram-0', '2026-10-05T05:29:00+02:00'],
  ].map(([id, time]) => [id, Date.parse(time)]);
  assert.deepEqual([...departures.values()], expected, 'Only actual service departures spawn, with Monday back on its ten-minute cadence');
  assert.equal(simulation.nextTramId, expected.length + 1);
  assert.equal(simulation.vehicles.length, 0, 'Tram timetable remains independent of zero car density');
  assert.equal(simulation.passed, 0);
  assert.ok(Math.abs(simulation.getClockTime() - startTime - 6 * 3600 * 1000) < .01);
  simulation.setClockTime(Date.parse('2026-10-05T02:00:00+02:00'));
  simulation.update(8);
  assert.equal(simulation.trams.length, 0);
  assert.equal(simulation.transitProtected, false, 'A closed timetable does not unnecessarily suppress B1 left turns');
  assert.equal(simulation.getSignal('leftSouth'), 'green');
});

test('entry route alternatives select available median storage and lock after admission', () => {
  const options = stagedConfig();
  const first = options.routes[0];
  first.choiceGroup = 'same-destination';
  first.laneSections = [{ id: 'shared-entry', from: [-10, -120], to: [-10, -40] }];
  const alternative = { ...first, id: 'alternate-left', rate: 0, stops: first.stops.map(stop => ({ ...stop })) };
  alternative.stops[0].storage = { id: 'second-holding-lane', capacity: 2 };
  options.routes.push(alternative);
  const simulation = new TrafficSimulation(options);
  const vehicle = simulation.createVehicle(simulation.routes[0], simulation.routes[0].stopDistance - 4);
  const occupied = new Map([['median-south', 2], ['second-holding-lane', 0]]);
  simulation.chooseRoute(vehicle, occupied);
  assert.equal(vehicle.routeId, 'alternate-left');
  vehicle.passedGateIndex = 0;
  simulation.chooseRoute(vehicle, new Map([['median-south', 0], ['second-holding-lane', 2]]));
  assert.equal(vehicle.routeId, 'alternate-left', 'An admitted vehicle must retain its selected lane');
});

test('different destinations sharing a median lane maintain one physical queue', () => {
  const options = stagedConfig();
  const first = options.routes[0];
  first.laneSections = [{ id: 'median-shared', from: [-10, -12], to: [-10, 9] }];
  const second = { ...first, id: 'another-destination', exitId: 'east', laneId: 'different-entry', points: [[-10, -120], [-10, -40], [-10, -12], [-10, 9], [0, 20], [120, 20]] };
  options.routes.push(second);
  const simulation = new TrafficSimulation(options);
  const leading = simulation.createVehicle(simulation.routes[0], simulation.routes[0].stops[1].distance - 3.05);
  const following = simulation.createVehicle(simulation.routes[1], simulation.routes[1].stops[1].distance - 15);
  leading.passedGateIndex = following.passedGateIndex = 0;
  simulation.vehicles.push(leading, following);
  simulation.update(5);
  assert.ok(simulation.separation(following, leading) >= (following.length + leading.length) / 2 + 2.19);
});

test('red stops front bumpers before the stop line and queues do not overlap', () => {
  const simulation = new TrafficSimulation(config({ density: 0, phases: [{ groups: ['main'], duration: 120 }] }));
  const route = simulation.routes.find(route => route.id === 'south');
  for (let index = 0; index < 8; index++) {
    const vehicle = simulation.createVehicle(route, route.stopDistance - 8 - index * 15);
    vehicle.kind = 'car'; vehicle.length = 4.5; vehicle.speed = 11;
    simulation.vehicles.push(vehicle);
  }
  for (let tick = 0; tick < 1800; tick++) {
    simulation.update(1 / 30);
    const queue = [...simulation.vehicles].sort((a, b) => b.distance - a.distance);
    for (let index = 0; index < queue.length; index++) {
      const vehicle = queue[index];
      assert.ok(vehicle.distance + vehicle.length / 2 <= route.stopDistance - 0.79);
      if (index > 0) assert.ok(queue[index - 1].distance - vehicle.distance >= (vehicle.length + queue[index - 1].length) / 2 + 2.19);
      assert.equal(vehicle.committed, false);
    }
  }
  assert.equal(simulation.getStatus().waiting, 8);
});

test('clearance waits for a committed vehicle before enabling the next phase', () => {
  const simulation = new TrafficSimulation(config({ density: 0 }));
  const route = simulation.routes[0];
  route.speed = 1;
  const vehicle = simulation.createVehicle(route, route.stopDistance + 1);
  vehicle.committed = true;
  simulation.vehicles.push(vehicle);
  simulation.requestNextPhase();
  simulation.update(5);
  assert.equal(simulation.stage, 'clearance');
  assert.equal(simulation.phaseIndex, 0);
  assert.equal(simulation.getSignal('north'), 'red');
  assert.ok(vehicle.distance > route.stopDistance + 1, 'Committed traffic keeps clearing under red');
  vehicle.distance = route.clearDistance + vehicle.length / 2 + 1;
  simulation.update(1 / 30);
  assert.equal(simulation.phaseIndex, 1);
  assert.equal(simulation.stage, 'redAmber');
  assert.equal(simulation.getSignal('north'), 'redAmber');
  simulation.update(0.2);
  assert.equal(simulation.getSignal('north'), 'green');
});

test('different turning routes sharing one approach maintain the same queue', () => {
  const base = config();
  const shared = { ...base.routes[2], id: 'south-left', exitId: 'east', points: [[-4, -160], [-4, -40], [-4, -18], [4, 7], [40, 7], [160, 7]] };
  const simulation = new TrafficSimulation(config({ routes: [base.routes[2], shared], density: 0, phases: [{ groups: ['main'], duration: 120 }] }));
  for (let index = 0; index < 6; index++) {
    const route = simulation.routes[index % 2];
    const vehicle = simulation.createVehicle(route, route.stopDistance - 8 - index * 16);
    vehicle.length = 4.5; vehicle.speed = 9;
    simulation.vehicles.push(vehicle);
  }
  simulation.update(50);
  const queue = [...simulation.vehicles].sort((a, b) => (b.distance - b.route.stopDistance) - (a.distance - a.route.stopDistance));
  for (let index = 1; index < queue.length; index++) {
    assert.ok(simulation.separation(queue[index], queue[index - 1]) >= 6.69);
  }
});

test('zero density creates no traffic; changing density stops future arrivals', () => {
  const simulation = new TrafficSimulation(config({ density: 0, initialVehiclesPerLane: 3 }));
  simulation.update(120);
  assert.equal(simulation.vehicles.length, 0);
  assert.equal(simulation.passed, 0);
  simulation.setDensity(1);
  simulation.update(20);
  assert.ok(simulation.vehicles.length > 0);
  simulation.setDensity(0);
  const created = simulation.nextId;
  simulation.update(120);
  assert.equal(simulation.nextId, created);
});

test('route vehicleKinds restrict the fleet to vehicles supported by its geometry', () => {
  const options = config();
  options.routes[0].vehicleKinds = ['bus'];
  options.routes[2].vehicleKinds = ['car', 'van'];
  const simulation = new TrafficSimulation(options);
  const observed = new Set();
  for (let index = 0; index < 1000; index++) {
    const bus = simulation.createVehicle(simulation.routes[0]);
    assert.equal(bus.kind, 'bus');
    assert.equal(bus.length, 11.5);
    const sideVehicle = simulation.createVehicle(simulation.routes[2]);
    assert.ok(['car', 'van'].includes(sideVehicle.kind));
    assert.equal(sideVehicle.length, sideVehicle.kind === 'van' ? 5.4 : 4.5);
    observed.add(sideVehicle.kind);
  }
  assert.deepEqual([...observed].sort(), ['car', 'van']);
  options.routes[2].vehicleKinds = [];
  assert.throws(() => new TrafficSimulation(options), /vehicleKinds/);
});

for (const scenario of [
  { name: 'baseline', overrides: {} },
  { name: 'Monday rush hour with six initial vehicles per lane', overrides: { density: 1.65, initialVehiclesPerLane: 6 },
    startTime: Date.parse('2026-10-05T06:00:00Z') },
]) test(`Dortmund ${scenario.name}: cars, shared lanes and scheduled trams remain conflict-free over twenty-one minutes`, async () => {
  const { default: dortmund } = await import('./locations/dortmund.mjs');
  const simulation = new TrafficSimulation({ ...dortmund, ...scenario.overrides }, { startTime: scenario.startTime });
  if (scenario.overrides.initialVehiclesPerLane) {
    const initialCounts = new Map();
    for (const vehicle of simulation.vehicles) initialCounts.set(vehicle.route.laneId, (initialCounts.get(vehicle.route.laneId) ?? 0) + 1);
    const arrivingLanes = new Set(simulation.routes.filter(route => route.rate > 0).map(route => route.laneId));
    assert.equal(initialCounts.size, arrivingLanes.size);
    assert.ok([...initialCounts.values()].every(count => count === 6), 'The rush-hour audit must actually start with six vehicles in every arriving lane');
  }
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage).map(stop => [stop.storage.id, stop.storage.capacity])));
  const stagedDirections = new Set();
  const scheduledTrips = new Set();
  const widths = { car: 1.82, van: 2.05, bus: 2.5, tram: 2.65 };
  const observedUTurns = new Set();
  // Independent separating-axis check: longitudinal headway alone cannot catch
  // a long bus clipping an adjacent lane with its tail on a tight side turn.
  const overlaps = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.hypot(dx, dz) > (a.length + b.length) / 2 + 3) return false;
    const forwardA = [Math.sin(a.heading), Math.cos(a.heading)];
    const rightA = [forwardA[1], -forwardA[0]];
    const forwardB = [Math.sin(b.heading), Math.cos(b.heading)];
    const rightB = [forwardB[1], -forwardB[0]];
    return [forwardA, rightA, forwardB, rightB].every(axis => {
      const dot = vector => Math.abs(vector[0] * axis[0] + vector[1] * axis[1]);
      const extentA = dot(forwardA) * a.length / 2 + dot(rightA) * widths[a.kind] / 2;
      const extentB = dot(forwardB) * b.length / 2 + dot(rightB) * widths[b.kind] / 2;
      return Math.abs(dx * axis[0] + dz * axis[1]) < extentA + extentB;
    });
  };
  for (let tick = 0; tick < 37800; tick++) {
    simulation.update(1 / 30);
    if (tick % 10 !== 0) continue;
    if (simulation.transitProtected) for (const group of dortmund.transit.blockedGroups) assert.equal(simulation.getSignal(group), 'red', 'Both B1 left turns stay closed for the whole booked train phase');
    assert.equal(simulation.getSignal('north'), simulation.getSignal('middleSouth'));
    assert.equal(simulation.getSignal('south'), simulation.getSignal('middleNorth'));
    const occupancy = new Map();
    for (const vehicle of simulation.vehicles) {
      for (const reservation of vehicle.reservations) {
        // B1 turns may queue beyond nominal holding spaces. A side vehicle
        // already beyond outer green can also join after synchronous closure;
        // ordinary new storage admissions still obey the nominal capacity.
        const admission = vehicle.route.stops.find(stop => stop.storage?.id === reservation.id);
        if (reservation.closingOverflow) assert.ok(vehicle.passedGateIndex >= 0,
          'Closing overflow is only for a car that already passed its outer signal');
        if (!admission?.storage.allowOverflow && !reservation.closingOverflow) occupancy.set(reservation.id, (occupancy.get(reservation.id) ?? 0) + 1);
      }
      if (vehicle.routeId.includes('uturn')) observedUTurns.add(vehicle.routeId.startsWith('east') ? 'east' : 'west');
      const nextStop = vehicle.route.stops[vehicle.passedGateIndex + 1];
      if (vehicle.passedGateIndex >= 0 && nextStop && vehicle.speed < 0.5 && simulation.getSignal(nextStop.group) === 'red') stagedDirections.add(nextStop.group);
    }
    for (const [id, count] of occupancy) assert.ok(count <= capacities.get(id), `Median storage ${id} exceeded its reserved capacity`);
    const bodies = [...simulation.vehicles, ...simulation.trams.map(tram => ({ ...tram, kind: 'tram' }))];
    for (const tram of simulation.trams) {
      scheduledTrips.add(tram.scheduledAt);
      if (!tram.committed && simulation.getTransitSignal(tram.routeId) !== 'green') assert.ok(
        tram.distance + tram.length / 2 <= tram.route.stopDistance + 1e-7,
        'A train may only begin crossing on its green; once committed it can finish after red');
    }
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const first = bodies[a], second = bodies[b];
        assert.equal(overlaps(first, second), false, `Body overlap: ${first.routeId}/${second.routeId} at ${simulation.elapsed.toFixed(1)} s`);
      }
    }
  }
  assert.ok(simulation.passed > 500, 'Collision avoidance must preserve flowing traffic with dedicated turning lanes');
  assert.ok(simulation.cycle >= 6, 'Staged vehicles must not deadlock later phases');
  assert.ok(stagedDirections.has('middleNorth') && stagedDirections.has('middleSouth'), 'Both alternating B1 turns must actually wait at their second red light');
  assert.equal(observedUTurns.size, 2, 'U-turn demand from both B1 directions must be simulated');
  // The eastbound train can have completely cleared the junction while still
  // boarding at its outbound platform. Count that finished crossing as well
  // as trains which have already reached the end of the simulated route.
  const completedTrainCrossings = simulation.transitPassed + simulation.trams.filter(tram =>
    tram.committed && tram.distance - tram.length / 2 > tram.route.clearDistance).length;
  assert.ok(completedTrainCrossings >= 4, 'Each train direction should completely clear the junction on at least two scheduled passages');
  if (scenario.startTime !== undefined) {
    assert.deepEqual([...scheduledTrips].sort((a, b) => a - b), [120, 540, 720, 1140],
      'The rush-hour audit must use real Monday departures at 08:02, 08:09, 08:12 and 08:19');
    assert.ok(Math.abs(simulation.getClockTime() - scenario.startTime - 1260000) < .01);
  }
});

test('ten-minute traffic run stays finite, passes vehicles, and preserves lane headway', () => {
  const simulation = new TrafficSimulation(config({ initialVehiclesPerLane: 3 }));
  for (let tick = 0; tick < 18000; tick++) {
    simulation.update(1 / 30);
    if (tick % 30 !== 0) continue;
    for (const vehicle of simulation.vehicles) {
      for (const property of ['distance', 'speed', 'x', 'z', 'heading']) assert.ok(Number.isFinite(vehicle[property]));
      assert.ok(vehicle.speed >= 0);
      for (const leader of simulation.vehicles) {
        const separation = simulation.separation(vehicle, leader);
        if (Number.isFinite(separation) && separation > 0) assert.ok(separation >= (vehicle.length + leader.length) / 2 + 2.19, 'Following traffic must preserve a bumper gap');
      }
    }
  }
  assert.ok(simulation.passed > 60);
  assert.ok(simulation.cycle > 3);
  assert.ok(simulation.vehicles.length < 150);
});

test('reset and frame subdivision reproduce the same seeded traffic', () => {
  const options = config({ initialVehiclesPerLane: 3 });
  const first = new TrafficSimulation(options);
  const second = new TrafficSimulation(options);
  first.update(30);
  for (let frame = 0; frame < 1800; frame++) second.update(1 / 60);
  const snapshot = simulation => JSON.stringify({ status: simulation.getStatus(), vehicles: simulation.vehicles.map(({ id, routeId, distance, speed, kind }) => ({ id, routeId, distance, speed, kind })) });
  assert.equal(snapshot(first), snapshot(second));
  first.reset(); first.update(30);
  assert.equal(snapshot(first), snapshot(second));
});

function constantMotionSimulation() {
  const simulation = new TrafficSimulation(config({ density: 0,
    phases: [{ groups: ['main'], duration: 1000 }],
    routes: [{ id: 'constant-car', group: 'main', points: [[0, 0], [1000, 0]], stopLine: [900, 0], rate: 0, speed: 12 }],
    transit: { greenGroups: ['main'], blockedGroups: [], routes: [
      { id: 'constant-tram', points: [[0, 4], [1000, 4]], stopLine: [900, 4], clearPoint: [950, 4],
        interval: 600, offset: 0, speed: 12, length: 28 },
    ] },
  }));
  const car = simulation.createVehicle(simulation.routes[0], 100);
  car.speed = 12; simulation.vehicles.push(car);
  const tram = simulation.trams[0];
  tram.distance = 100; tram.speed = 12; tram.committed = true;
  Object.assign(tram, samplePath(tram.route.path, tram.distance));
  return simulation;
}

test('render interpolation removes synchronized fixed-tick stutter for cars and trams under jitter', () => {
  for (const cadence of [[.028, .035, .031, .038, .022, .044], [.064, .068, .065, .067]]) {
    const simulation = constantMotionSimulation();
    const baseline = constantMotionSimulation();
    const bodies = [...simulation.vehicles, ...simulation.trams];
    simulation.update(1 / 30);
    let wallTime = 1 / 30;
    let previousRender = bodies.map(body => simulation.getRenderPose(body));
    let previousTick = simulation.elapsed;
    const stepCounts = new Set();
    for (let frame = 0; frame < 120; frame++) {
      const dt = cadence[frame % cadence.length];
      simulation.update(dt); wallTime += dt;
      stepCounts.add(Math.round((simulation.elapsed - previousTick) * 30));
      previousTick = simulation.elapsed;
      bodies.forEach((body, index) => {
        const pose = simulation.getRenderPose(body);
        assert.ok(Math.abs(pose.x - previousRender[index].x - 12 * dt) < 1e-8,
          'Rendered displacement must follow frame duration, including zero-tick and multi-tick frames');
        assert.ok(Math.abs(pose.x - (100 + 12 * (wallTime - 1 / 30))) < 1e-8,
          'The interpolated timeline has one fixed tick of latency, not a variable lag');
        assert.ok(pose.x <= body.x + 1e-9, 'Rendering never extrapolates beyond collision-checked physics');
        previousRender[index] = pose;
      });
    }
    assert.ok(stepCounts.size > 1, 'The regression must actually cross different fixed-step counts');
    if (cadence[0] === .028) assert.ok(stepCounts.has(0) && stepCounts.has(2));
    else assert.ok(stepCounts.has(1) && stepCounts.has(3), 'Recorded ~66 ms cadence includes one- and three-tick advances');
    baseline.update(wallTime);
    const physics = sim => ({ status: sim.getStatus(), bodies: [...sim.vehicles, ...sim.trams].map(
      ({ id, routeId, distance, speed, x, z, heading }) => ({ id, routeId, distance, speed, x, z, heading })) });
    assert.deepEqual(physics(simulation), physics(baseline), 'Render reads and jitter must not alter deterministic physical state');
  }
});

test('interpolated headings cross the north-facing angle wrap without rotating the long way', () => {
  const simulation = new TrafficSimulation(config({ density: 0,
    phases: [{ groups: ['main'], duration: 1000 }],
    routes: [{ id: 'north-curve', group: 'main', points: [[0, 20], [.2, 0], [0, -20], [-.2, -40]],
      stopLine: [-.15, -35], rate: 0, speed: 12 }],
  }));
  const car = simulation.createVehicle(simulation.routes[0], 19.9);
  car.speed = 12; simulation.vehicles.push(car);
  assert.ok(car.heading > 3);
  simulation.update(.05);
  assert.ok(car.heading < -3, 'The physical curve must cross +π to -π in this tick');
  const pose = simulation.getRenderPose(car);
  assert.ok(Math.cos(pose.heading) < -.9999, 'Interpolated heading continues to face north');
  assert.ok(Math.abs(pose.z - (20 - 20.1)) < .003);
});

test('paused render reads, reset identity reuse and newly spawned bodies have stable display poses', () => {
  const simulation = constantMotionSimulation();
  simulation.update(.05);
  const car = simulation.vehicles[0], tram = simulation.trams[0];
  const before = [simulation.getRenderPose(car), simulation.getRenderPose(tram)];
  const physicalTime = simulation.elapsed, remainder = simulation.accumulator;
  for (let redraw = 0; redraw < 100; redraw++) {
    assert.deepEqual([simulation.getRenderPose(car), simulation.getRenderPose(tram)], before);
    simulation.update(0);
  }
  assert.equal(simulation.elapsed, physicalTime); assert.equal(simulation.accumulator, remainder);
  simulation.reset();
  const fresh = simulation.createVehicle(simulation.routes[0], 450);
  assert.equal(fresh.id, car.id, 'Reset reuses numeric IDs but must never reuse a different body snapshot');
  assert.deepEqual(simulation.getRenderPose(fresh), { x: fresh.x, z: fresh.z, heading: fresh.heading });
  const freshTram = simulation.trams[0];
  assert.equal(freshTram.id, tram.id);
  assert.deepEqual(simulation.getRenderPose(freshTram), { x: freshTram.x, z: freshTram.z, heading: freshTram.heading });
  fresh.distance = simulation.routes[0].length - .01;
  Object.assign(fresh, samplePath(fresh.route.path, fresh.distance));
  fresh.speed = 12; simulation.vehicles.push(fresh);
  simulation.update(1 / 30);
  assert.equal(simulation.vehicles.length, 0, 'Removed vehicles are not retained as display ghosts');
});

test('route reassignment with different stationing keeps the same interpolated world pose', () => {
  const options = stagedConfig();
  options.routes[0].choiceGroup = 'same-destination';
  const alternative = { ...options.routes[0], id: 'longer-approach', points: [[-10, -150], [-10, -40], [-10, -12], [-10, 9], [-10, 120]],
    stops: options.routes[0].stops.map(stop => ({ ...stop })) };
  alternative.stops[0].storage = { id: 'second-holding-lane', capacity: 2 };
  options.routes.push(alternative);
  const simulation = new TrafficSimulation(options);
  const car = simulation.createVehicle(simulation.routes[0], 35);
  car.speed = 5; simulation.vehicles.push(car);
  simulation.update(.05);
  const before = simulation.getRenderPose(car), distance = car.distance;
  simulation.chooseRoute(car, new Map([['median-south', 2], ['second-holding-lane', 0]]));
  assert.equal(car.routeId, 'longer-approach');
  assert.ok(car.distance > distance + 25, 'Route stationing changes although the approach is physically shared');
  const after = simulation.getRenderPose(car);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 1e-8);
});
