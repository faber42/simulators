import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30;
const TYPES = { car: { length: 4.5, width: 1.82 }, van: { length: 5.4, width: 2.05 } };

function addVehicle(simulation, route, distance, kind = 'car') {
  const vehicle = simulation.createVehicle(route, distance);
  Object.assign(vehicle, { kind, length: TYPES[kind].length, speed: 0 }, samplePath(route.path, distance));
  simulation.vehicles.push(vehicle);
  return vehicle;
}

function bodiesOverlap(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > (a.length + b.length) / 2 + 3) return false;
  const forwardA = [Math.sin(a.heading), Math.cos(a.heading)], rightA = [forwardA[1], -forwardA[0]];
  const forwardB = [Math.sin(b.heading), Math.cos(b.heading)], rightB = [forwardB[1], -forwardB[0]];
  return [forwardA, rightA, forwardB, rightB].every(axis => {
    const dot = vector => Math.abs(vector[0] * axis[0] + vector[1] * axis[1]);
    const extentA = dot(forwardA) * a.length / 2 + dot(rightA) * TYPES[a.kind].width / 2;
    const extentB = dot(forwardB) * b.length / 2 + dot(rightB) * TYPES[b.kind].width / 2;
    return Math.abs(dx * axis[0] + dz * axis[1]) < extentA + extentB - 1e-7;
  });
}

function assertSafe(simulation, previousSerial) {
  for (const vehicle of simulation.vehicles) {
    const next = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (next && simulation.getSignal(next.group) !== 'green') assert.ok(
      vehicle.distance + vehicle.length / 2 <= next.distance + 1e-8,
      `${vehicle.routeId} crossed a red stop at ${simulation.elapsed.toFixed(2)} s`);
    if (simulation.phaseSerial !== previousSerial) for (const commitment of vehicle.committedStops) {
      if (commitment.phaseSerial === previousSerial) assert.ok(
        vehicle.distance - vehicle.length / 2 > vehicle.route.stops[commitment.index].clearDistance,
        `${vehicle.routeId} blocks the preceding crossing when the perpendicular axis opens`);
    }
  }
  for (let a = 0; a < simulation.vehicles.length; a++) for (let b = a + 1; b < simulation.vehicles.length; b++) {
    assert.equal(bodiesOverlap(simulation.vehicles[a], simulation.vehicles[b]), false,
      `${simulation.vehicles[a].routeId}/${simulation.vehicles[b].routeId} overlap at ${simulation.elapsed.toFixed(2)} s`);
  }
}

function run(simulation, seconds, inspect = () => {}) {
  for (let tick = 0; tick < seconds / STEP; tick++) {
    const previousSerial = simulation.phaseSerial;
    simulation.update(STEP); assertSafe(simulation, previousSerial); inspect();
  }
}

for (const kind of ['car', 'van']) test(`Opphoff fills its long Märkische median with ${kind}s while preserving short cross-street holding and safe release`, t => {
  const config = structuredClone(opphoff);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.routes.forEach(route => { route.rate = 0; });
  config.phases.forEach(phase => { phase.duration = 600; });
  const simulation = new TrafficSimulation(config);
  simulation.phaseIndex = simulation.phases.findIndex(phase => phase.id === 'north-south');
  const queues = new Map();
  for (const direction of ['north', 'south']) {
    const route = simulation.routes.find(route => route.id === `${direction}-left`);
    const cars = Array.from({ length: 10 }, (_, index) => addVehicle(simulation, route,
      route.stopDistance - .85 - TYPES[kind].length / 2 - index * (TYPES[kind].length + 2.2), kind));
    queues.set(direction, cars);
  }
  // A surface-road left turn already inside its own short median must wait at
  // its own INNER red during NS green, not be released by the target NS green.
  const crossStreetWaiters = ['east', 'west'].map(direction => {
    const route = simulation.routes.find(route => route.id === `${direction}-left`);
    const vehicle = addVehicle(simulation, route, route.stops[1].distance - .85 - TYPES.car.length / 2);
    vehicle.passedGateIndex = 0;
    vehicle.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
    return vehicle;
  });
  const waiterDistances = crossStreetWaiters.map(vehicle => vehicle.distance);
  run(simulation, 140, () => {
    for (const [index, vehicle] of crossStreetWaiters.entries()) {
      assert.equal(vehicle.passedGateIndex, 0, 'NS green must not release an EW left turn from its own middle red');
      assert.ok(Math.abs(vehicle.distance - waiterDistances[index]) < .06);
    }
  });

  const expectedLongQueue = kind === 'car' ? 7 : 6;
  for (const [direction, cars] of queues) {
    const longQueue = cars.filter(vehicle => vehicle.passedGateIndex === 0 && vehicle.speed < .05);
    const shortQueue = cars.filter(vehicle => vehicle.passedGateIndex === 1 && vehicle.speed < .05);
    assert.equal(shortQueue.length, 2, `${direction} must fill, but not overfill, the physically short EW destination`);
    assert.ok(longQueue.length >= expectedLongQueue,
      `${direction} only stores ${longQueue.length} ${kind}s despite the long free Märkische holding area; expected at least ${expectedLongQueue}`);
    assert.ok(cars.some(vehicle => vehicle.passedGateIndex < 0), 'Excess arrivals still wait outside rather than occupy the previous crossing');
    for (const vehicle of [...longQueue, ...shortQueue]) {
      const preceding = vehicle.route.stops[vehicle.passedGateIndex];
      assert.ok(vehicle.distance - vehicle.length / 2 > preceding.clearDistance,
        `${direction} ${kind} queue extends back into the preceding crossing`);
    }
    for (let index = 1; index < cars.length; index++) assert.ok(
      cars[index - 1].distance - cars[index].distance >= TYPES[kind].length + 2.19,
      'The additional cars must fit with a real bumper gap');
    t.diagnostic(`${direction}: ${longQueue.length} in long median, ${shortQueue.length} in short receiving median`);
  }
  simulation.requestNextPhase();
  let sawEastWest = false, crossStreetDeparted = false;
  run(simulation, 80, () => {
    sawEastWest ||= simulation.phases[simulation.phaseIndex].id === 'east-west' && simulation.stage === 'green';
    crossStreetDeparted ||= crossStreetWaiters.every(vehicle => vehicle.passedGateIndex >= 1);
  });
  assert.ok(sawEastWest, 'The filled long median must not deadlock clearance of the opposite axis');
  assert.ok(crossStreetDeparted, 'The surface-road left turns must move once their own middle turns green');
  assert.ok(simulation.passed >= 4, 'The cars in the short receiving medians must leave on the next perpendicular green');
});

test('surface-road left arrivals use the long Märkische receiving lanes and hand over safely to green through traffic', t => {
  const config = structuredClone(opphoff);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.routes.forEach(route => { route.rate = 0; });
  config.phases.forEach(phase => { phase.duration = 600; });
  const simulation = new TrafficSimulation(config);
  const turningQueues = [];
  for (const direction of ['east', 'west']) {
    const route = simulation.routes.find(route => route.id === `${direction}-left`);
    turningQueues.push(Array.from({ length: 18 }, (_, index) => addVehicle(simulation, route,
      route.stopDistance - .85 - TYPES.car.length / 2 - index * (TYPES.car.length + 2.2))));
  }
  const throughCars = [];
  for (const direction of ['north', 'south']) for (const lane of [1, 2]) {
    const route = simulation.routes.find(route => route.id === `${direction}-through-${lane}`);
    for (let index = 0; index < 4; index++) throughCars.push(addVehicle(simulation, route,
      route.stopDistance - .85 - TYPES.car.length / 2 - index * (TYPES.car.length + 2.2)));
  }
  run(simulation, 140);
  for (const cars of turningQueues) {
    const waiting = cars.filter(vehicle => vehicle.passedGateIndex === 1 && vehicle.speed < .05);
    assert.equal(waiting.length, 14,
      `${cars[0].routeId} only brings ${waiting.length} cars into its long perpendicular receiving median`);
    const occupiedLanes = new Map();
    for (const vehicle of waiting) {
      const id = vehicle.route.stops[1].storage.id;
      occupiedLanes.set(id, (occupiedLanes.get(id) ?? 0) + 1);
    }
    assert.deepEqual([...occupiedLanes.values()].sort(), [7, 7],
      'Both receiving through lanes must really fill with seven cars');
    for (const vehicle of waiting) assert.ok(vehicle.distance - vehicle.length / 2 > vehicle.route.stops[1].clearDistance,
      `${vehicle.routeId} #${vehicle.id} cannot hand over: rear ${(vehicle.distance - vehicle.length / 2).toFixed(2)} m, safe boundary ${vehicle.route.stops[1].clearDistance.toFixed(2)} m, position ${vehicle.x.toFixed(2)},${vehicle.z.toFixed(2)}`);
    t.diagnostic(`${cars[0].routeId}: ${waiting.length} waiting at the perpendicular NS middle red`);
  }
  assert.ok(throughCars.every(vehicle => vehicle.passedGateIndex === -1), 'NS through traffic waits outside during the EW phase');
  simulation.requestNextPhase();
  let sawNorthSouth = false;
  run(simulation, 100, () => {
    sawNorthSouth ||= simulation.phases[simulation.phaseIndex].id === 'north-south' && simulation.stage === 'green';
  });
  assert.ok(sawNorthSouth, 'The long receiving queue must allow a safe handover to the NS phase');
  assert.ok(throughCars.every(vehicle => vehicle.passedGateIndex >= 1),
    'Green through traffic must merge behind the previously waiting turns and pass its middle signal');
  for (const cars of turningQueues) assert.ok(cars.filter(vehicle => vehicle.passedGateIndex === 2).length >= 14,
    'All cars waiting in the long receiving median must leave on its next green');
  assert.ok(simulation.passed >= 44, 'All four receiving queues and sixteen through cars must continue through the junction');
});
