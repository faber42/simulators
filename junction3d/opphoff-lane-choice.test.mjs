import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30, LENGTH = 4.5, WIDTH = 1.82, GAP = 2.2;

function car(simulation, route, distance, passedGateIndex = -1) {
  const vehicle = simulation.createVehicle(route, distance);
  Object.assign(vehicle, { kind: 'car', length: LENGTH, speed: 0, passedGateIndex }, samplePath(route.path, distance));
  if (passedGateIndex === 0) vehicle.reservations = [{ id: route.stops[0].storage.id,
    releaseDistance: route.stops[1].distance }];
  simulation.vehicles.push(vehicle);
  return vehicle;
}

function overlap(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > LENGTH + WIDTH) return false;
  const af = [Math.sin(a.heading), Math.cos(a.heading)], ar = [af[1], -af[0]];
  const bf = [Math.sin(b.heading), Math.cos(b.heading)], br = [bf[1], -bf[0]];
  return [af, ar, bf, br].every(axis => {
    const dot = v => Math.abs(v[0] * axis[0] + v[1] * axis[1]);
    const extent = forward => dot(forward) * LENGTH / 2 + dot([forward[1], -forward[0]]) * WIDTH / 2;
    return Math.abs(dx * axis[0] + dz * axis[1]) < extent(af) + extent(bf) - 1e-7;
  });
}

function audit(simulation, previousSerial, fixedRoutes) {
  for (const vehicle of simulation.vehicles) {
    const next = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (next && simulation.getSignal(next.group) !== 'green') assert.ok(
      vehicle.distance + vehicle.length / 2 <= next.distance + 1e-8, `${vehicle.routeId} crosses a closed signal`);
    if (simulation.phaseSerial !== previousSerial) for (const commitment of vehicle.committedStops) {
      if (commitment.phaseSerial === previousSerial) assert.ok(
        vehicle.distance - vehicle.length / 2 > vehicle.route.stops[commitment.index].clearDistance,
        'Every admitted rear must leave the entry curve before NS traffic receives green');
    }
    if (fixedRoutes.has(vehicle.id)) assert.equal(vehicle.routeId, fixedRoutes.get(vehicle.id),
      `${vehicle.routeId} changed its already chosen turning path or its through lane`);
    if (vehicle.route.turn === 'left' && vehicle.passedGateIndex >= 1) fixedRoutes.set(vehicle.id, vehicle.routeId);
  }
  for (let a = 0; a < simulation.vehicles.length; a++) for (let b = a + 1; b < simulation.vehicles.length; b++) {
    assert.equal(overlap(simulation.vehicles[a], simulation.vehicles[b]), false,
      `${simulation.vehicles[a].routeId}/${simulation.vehicles[b].routeId} overlap at ${simulation.elapsed.toFixed(2)} s`);
  }
}

function fixture(direction) {
  const config = structuredClone(opphoff);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.routes.forEach(route => { route.rate = 0; });
  config.phases.forEach(phase => { phase.duration = 600; });
  const simulation = new TrafficSimulation(config);
  const primary = simulation.routes.find(route => route.id === `${direction}-left`);
  const alternative = simulation.routes.find(route => route.id === `${direction}-left-2`);
  assert.ok(alternative, 'The left approach must offer both NS receiving lanes');
  const firstThrough = simulation.routes.find(route => route.turn === 'straight' && route.exitId === primary.exitId);
  const secondThrough = simulation.routes.find(route => route.turn === 'straight' && route.exitId === alternative.exitId);
  const fixedRoutes = new Map();
  // Seven real cars occupy lane 1; lane 2 is empty. Reservations alone are
  // insufficient: the fixture checks their complete bodies and actual queues.
  for (let index = 0; index < 7; index++) {
    const vehicle = car(simulation, firstThrough,
      firstThrough.stops[1].distance - .85 - LENGTH / 2 - index * (LENGTH + GAP), 0);
    fixedRoutes.set(vehicle.id, vehicle.routeId);
  }
  const turning = [0, 1].map(index => car(simulation, primary,
    primary.stops[1].distance - .85 - LENGTH / 2 - index * (LENGTH + GAP), 0));
  const throughQueue = [];
  for (const route of [firstThrough, secondThrough]) for (let index = 0; index < 3; index++) {
    const vehicle = car(simulation, route, route.stopDistance - .85 - LENGTH / 2 - index * (LENGTH + GAP));
    throughQueue.push(vehicle); fixedRoutes.set(vehicle.id, vehicle.routeId);
  }
  return { simulation, primary, alternative, turning, throughQueue, fixedRoutes };
}

for (const direction of ['east', 'west']) test(`${direction} left turn can choose the free second receiving lane after its outer gate`, () => {
  const { simulation, primary, alternative, turning, throughQueue, fixedRoutes } = fixture(direction);
  const before = turning.map(vehicle => ({ x: vehicle.x, z: vehicle.z }));
  simulation.update(STEP); audit(simulation, simulation.phaseSerial, fixedRoutes);
  for (const [index, vehicle] of turning.entries()) {
    assert.equal(vehicle.passedGateIndex, 0, 'Lane selection takes place inside the original median before the turning gate');
    assert.equal(vehicle.routeId, alternative.id, 'A full first target must not block the free second target');
    assert.ok(Math.hypot(vehicle.x - before[index].x, vehicle.z - before[index].z) < .02,
      'Choosing a different outlet must preserve the current physical position');
    assert.equal(vehicle.reservations.length, 1);
    assert.equal(vehicle.reservations[0].id, primary.stops[0].storage.id,
      'Choosing a target must keep the existing own-median reservation until its rear exits');
  }
  const run = seconds => {
    for (let tick = 0; tick < seconds / STEP; tick++) {
      const previousSerial = simulation.phaseSerial;
      simulation.update(STEP); audit(simulation, previousSerial, fixedRoutes);
    }
  };
  run(45);
  for (const vehicle of turning) {
    assert.equal(vehicle.passedGateIndex, 1);
    assert.ok(vehicle.speed < .05, 'The turn must really wait at the perpendicular NS middle red');
    assert.deepEqual(vehicle.reservations.map(reservation => reservation.id), [alternative.stops[1].storage.id]);
    assert.ok(vehicle.distance - vehicle.length / 2 > vehicle.route.stops[1].clearDistance);
  }
  assert.ok(throughQueue.every(vehicle => vehicle.passedGateIndex === -1));
  simulation.requestNextPhase();
  run(100);
  assert.ok(turning.every(vehicle => vehicle.passedGateIndex === 2));
  assert.ok(throughQueue.every(vehicle => vehicle.passedGateIndex >= 1));
  assert.equal(simulation.passed, 15, 'Seven original cars, two turns and six through cars must all leave');
});

for (const direction of ['east', 'west']) test(`${direction} inner-green drainage accounts for a newly chosen free receiving lane before closing`, () => {
  const { simulation, alternative, turning, fixedRoutes } = fixture(direction);
  simulation.stage = 'drain'; simulation.stageElapsed = 0;
  simulation.update(STEP); audit(simulation, simulation.phaseSerial, fixedRoutes);
  assert.ok(turning.every(vehicle => vehicle.routeId === alternative.id));
  assert.equal(simulation.stage, 'drain', 'The inner green must remain open for the now-available alternate route');
  const entrySerial = simulation.phaseSerial;
  for (let tick = 0; tick < 60 / STEP && simulation.phaseSerial === entrySerial; tick++) {
    const previousSerial = simulation.phaseSerial;
    simulation.update(STEP); audit(simulation, previousSerial, fixedRoutes);
  }
  assert.notEqual(simulation.phaseSerial, entrySerial, 'The chosen traffic must drain and allow the opposite axis');
  assert.ok(turning.every(vehicle => vehicle.passedGateIndex >= 1 &&
    vehicle.distance - vehicle.length / 2 > vehicle.route.stops[1].clearDistance));
});

for (const direction of ['east', 'west']) test(`${direction} waiting turn cannot reopen a closed inner drain by choosing another outlet`, () => {
  for (const stage of ['drainYellow', 'clearance']) {
    const { simulation, primary, turning, fixedRoutes } = fixture(direction);
    simulation.stage = stage; simulation.stageElapsed = 0;
    const entrySerial = simulation.phaseSerial;
    for (let tick = 0; tick < 10 / STEP && simulation.phaseSerial === entrySerial; tick++) {
      const previousSerial = simulation.phaseSerial;
      simulation.update(STEP); audit(simulation, previousSerial, fixedRoutes);
      assert.ok(turning.every(vehicle => vehicle.routeId === primary.id && vehicle.passedGateIndex === 0),
        'After the middle closes, waiting cars retain their blocked outlet until the phase handover finishes');
    }
    assert.notEqual(simulation.phaseSerial, entrySerial, `${stage} must complete without a new blocked drainage request`);
  }
});
