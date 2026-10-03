import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, samplePath, TrafficSimulation } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

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

test('Dortmund side turns and shared exits do not overlap vehicle bodies over ten minutes', () => {
  const simulation = new TrafficSimulation(dortmund);
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage).map(stop => [stop.storage.id, stop.storage.capacity])));
  const stagedDirections = new Set();
  const widths = { car: 1.82, van: 2.05, bus: 2.5 };
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
  for (let tick = 0; tick < 18000; tick++) {
    simulation.update(1 / 30);
    if (tick % 10 !== 0) continue;
    const occupancy = new Map();
    for (const vehicle of simulation.vehicles) {
      for (const reservation of vehicle.reservations) occupancy.set(reservation.id, (occupancy.get(reservation.id) ?? 0) + 1);
      const nextStop = vehicle.route.stops[vehicle.passedGateIndex + 1];
      if (vehicle.passedGateIndex >= 0 && nextStop && vehicle.speed < 0.5 && simulation.getSignal(nextStop.group) === 'red') stagedDirections.add(nextStop.group);
    }
    for (const [id, count] of occupancy) assert.ok(count <= capacities.get(id), `Median storage ${id} exceeded its reserved capacity`);
    for (let a = 0; a < simulation.vehicles.length; a++) {
      for (let b = a + 1; b < simulation.vehicles.length; b++) {
        const first = simulation.vehicles[a], second = simulation.vehicles[b];
        assert.equal(overlaps(first, second), false, `Body overlap: ${first.routeId}/${second.routeId} at ${simulation.elapsed.toFixed(1)} s`);
      }
    }
  }
  assert.ok(simulation.passed > 250, 'Collision avoidance must preserve flowing traffic with dedicated turning lanes');
  assert.ok(simulation.cycle >= 3, 'Staged vehicles must not deadlock later phases');
  assert.ok(stagedDirections.has('middleNorth') && stagedDirections.has('middleSouth'), 'Both alternating B1 turns must actually wait at their second red light');
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
