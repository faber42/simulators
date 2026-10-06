import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

const STEP = 1 / 30;

function simulationFor() {
  const config = structuredClone(dortmund);
  config.density = 0;
  config.initialVehiclesPerLane = 0;
  for (const route of config.routes) { route.rate = 0; route.vehicleKinds = ['car']; }
  delete config.transit;
  return new TrafficSimulation(config);
}

function addCar(simulation, routeId, distance, admitted = false) {
  const route = simulation.routes.find(route => route.id === routeId);
  const car = simulation.createVehicle(route, distance);
  if (admitted) {
    car.passedGateIndex = 0;
    car.yieldApproachPassed = true;
    car.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
  }
  simulation.vehicles.push(car);
  return car;
}

// Independent body rectangles, including the actual turn heading. A green
// approach must not be kept flowing by weakening the occupied-path check.
function overlaps(a, b) {
  const forward = car => [Math.sin(car.heading), Math.cos(car.heading)];
  const af = forward(a), bf = forward(b), ar = [af[1], -af[0]], br = [bf[1], -bf[0]];
  const dot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1]);
  return [af, ar, bf, br].every(axis => {
    const extent = (car, front, side) => dot(axis, front) * car.length / 2 + dot(axis, side) * 1.82 / 2;
    return Math.abs((b.x - a.x) * axis[0] + (b.z - a.z) * axis[1]) < extent(a, af, ar) + extent(b, bf, br) - 1e-7;
  });
}

function step(simulation) {
  simulation.update(STEP);
  for (const car of simulation.vehicles) {
    const stop = car.route.stops[car.passedGateIndex + 1];
    if (stop && simulation.getSignal(stop.group) !== 'green') assert.ok(car.distance + car.length / 2 <= stop.distance + 1e-7);
  }
  for (let first = 0; first < simulation.vehicles.length; first++) {
    for (let second = first + 1; second < simulation.vehicles.length; second++) {
      assert.equal(overlaps(simulation.vehicles[first], simulation.vehicles[second]), false,
        `Contact at ${simulation.elapsed.toFixed(2)} s`);
    }
  }
}

for (const scenario of [
  { name: 'southbound', phase: 1, queued: 'south-left', blocked: 'north-left', free: 'north-through', turn: 'east-south', mainPhase: 0 },
  { name: 'northbound', phase: 3, queued: 'north-left', blocked: 'south-left', free: 'south-through', turn: 'west-north', mainPhase: 2 },
]) {
  test(`${scenario.name}: a blocked inner turn holds new side arrivals outside, while a free lane proceeds and the queue later recovers`, () => {
    const simulation = simulationFor();
    simulation.phaseIndex = scenario.phase;
    simulation.phaseSerial = scenario.phase;
    const queuedRoute = simulation.routes.find(route => route.id === scenario.queued);
    const parked = Array.from({ length: 4 }, (_, index) =>
      addCar(simulation, scenario.queued, queuedRoute.stops[1].distance - 3.05 - index * 6.7, true));
    const route = simulation.routes.find(route => route.id === scenario.blocked);
    const freeRoute = simulation.routes.find(route => route.id === scenario.free);
    const waiting = addCar(simulation, scenario.blocked, route.stopDistance - 3.05);
    const proceeding = addCar(simulation, scenario.free, freeRoute.stopDistance - 3.05);

    // Prove that this is a downstream obstruction: parked bodies intersect
    // the turning path beyond the inner signal, not the outer approach.
    assert.ok(parked.some(car => route.stopCorridors[1].some(pose => overlaps({ ...waiting, ...pose }, car))));
    assert.ok(parked.every(car => route.stopCorridors[0].every(pose => !overlaps({ ...waiting, ...pose }, car))));
    for (let tick = 0; tick < 18 / STEP; tick++) {
      step(simulation);
      assert.equal(simulation.getSignal(route.stops[0].group), 'green');
      assert.equal(simulation.getSignal(route.stops[1].group), 'green');
      assert.equal(waiting.passedGateIndex, -1, 'The outer green must not feed an already blocked inner turn');
      assert.ok(waiting.distance + waiting.length / 2 <= route.stopDistance - .79);
    }
    assert.equal(proceeding.passedGateIndex, 1, 'The geometrically free neighboring through lane must retain ordinary green entry');
    for (let tick = 0; tick < 200 / STEP && (waiting.passedGateIndex < 1 || parked.some(car => car.passedGateIndex < 1)); tick++) step(simulation);
    assert.equal(waiting.passedGateIndex, 1, 'Once the opposite queue clears, the held approach must resume');
    assert.ok(parked.every(car => car.passedGateIndex === 1), 'The retained outside queue must leave the opposite exit available to recover');
  });

  test(`${scenario.name}: B1 left turns still overflow their median storage`, () => {
    const simulation = simulationFor();
    simulation.phaseIndex = scenario.mainPhase;
    simulation.phaseSerial = scenario.mainPhase;
    simulation.stageElapsed = 8;
    const route = simulation.routes.find(route => route.id === scenario.turn);
    const cars = Array.from({ length: 12 }, (_, index) => addCar(simulation, scenario.turn, route.stopDistance - 3.05 - index * 6.7));
    let overflowed = false;
    for (let tick = 0; tick < 20 / STEP; tick++) {
      step(simulation);
      const counts = new Map();
      for (const car of simulation.vehicles) for (const reservation of car.reservations) {
        counts.set(reservation.id, (counts.get(reservation.id) ?? 0) + 1);
      }
      overflowed ||= [...counts.values()].some(count => count > route.stops[0].storage.capacity);
    }
    assert.ok(overflowed, 'Restricting blocked side approaches must not restore idealized B1 storage admission');
    assert.ok(cars.filter(car => car.passedGateIndex === 0).length > 4, 'Both receiving lanes must fill beyond their nominal two places');
  });
}
