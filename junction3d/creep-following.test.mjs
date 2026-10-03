import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

const STEP = 1 / 30;
const directions = [
  { side: 'north-left', shared: 'north-shared-straight', main: 'east-south', phase: 1, middle: 'middleSouth' },
  { side: 'south-left', shared: 'south-shared-straight', main: 'west-north', phase: 3, middle: 'middleNorth' },
];
const widths = { car: 1.82, van: 2.05 };

function makeSimulation(direction, middleDelay = 0) {
  const config = structuredClone(dortmund);
  config.density = 0; config.initialVehiclesPerLane = 0; delete config.transit;
  config.routes.forEach(route => { route.rate = 0; route.vehicleKinds = ['car', 'van']; });
  config.phases[direction.phase].duration = 65;
  config.phases[direction.phase].groupDelays = middleDelay ? { [direction.middle]: middleDelay } : {};
  const simulation = new TrafficSimulation(config);
  simulation.phaseIndex = direction.phase; simulation.phaseSerial = 1;
  return simulation;
}

function routeOf(simulation, id) {
  const route = simulation.routes.find(route => route.id === id);
  assert.ok(route); return route;
}

function addCar(simulation, route, distance, kind = 'car') {
  const vehicle = simulation.createVehicle(route, distance);
  vehicle.kind = kind; vehicle.length = kind === 'van' ? 5.4 : 4.5; vehicle.speed = 0;
  Object.assign(vehicle, samplePath(route.path, distance));
  simulation.vehicles.push(vehicle); return vehicle;
}

// Independent oriented-rectangle collision check; no engine following/merge
// helper is used to decide whether real vehicle bodies remain disjoint.
function overlap(a, b) {
  const delta = [b.x - a.x, b.z - a.z];
  if (Math.hypot(...delta) > (a.length + b.length) / 2 + 3) return false;
  const frontA = [Math.sin(a.heading), Math.cos(a.heading)], sideA = [frontA[1], -frontA[0]];
  const frontB = [Math.sin(b.heading), Math.cos(b.heading)], sideB = [frontB[1], -frontB[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  return [frontA, sideA, frontB, sideB].every(axis => {
    const extent = (car, front, side) => Math.abs(dot(axis, front)) * car.length / 2 + Math.abs(dot(axis, side)) * widths[car.kind] / 2;
    return Math.abs(dot(axis, delta)) < extent(a, frontA, sideA) + extent(b, frontB, sideB) - 1e-7;
  });
}

function assertSafe(simulation) {
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage)
    .map(stop => [stop.storage.id, stop.storage.capacity])));
  const occupied = new Map();
  for (const vehicle of simulation.vehicles) {
    for (const reservation of vehicle.reservations) occupied.set(reservation.id, (occupied.get(reservation.id) ?? 0) + 1);
    const stop = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (stop && simulation.getSignal(stop.group) !== 'green') assert.ok(vehicle.distance + vehicle.length / 2 <= stop.distance + 1e-7,
      `${vehicle.routeId} crossed closed ${stop.id}`);
  }
  for (const [id, count] of occupied) assert.ok(count <= capacities.get(id), `${id} exceeded its two reserved places`);
  for (let i = 0; i < simulation.vehicles.length; i++) for (let j = i + 1; j < simulation.vehicles.length; j++) assert.equal(
    overlap(simulation.vehicles[i], simulation.vehicles[j]), false, `Vehicle bodies overlapped at ${simulation.elapsed.toFixed(2)} s`);
  return occupied;
}

for (const direction of directions) test(`${direction.side}: followers keep accelerating behind departing side cars even while both middle places are reserved`, t => {
  const simulation = makeSimulation(direction), route = routeOf(simulation, direction.side);
  const cars = Array.from({ length: 8 }, (_, index) => addCar(simulation, route, route.stopDistance - 3.1 - index * 6.7));
  const follower = cars[2]; let followingUnderFullStorage = 0, measured = null;
  for (let tick = 0; tick < 20 / STEP; tick++) {
    simulation.update(STEP); const occupied = assertSafe(simulation);
    if ((occupied.get(route.stops[0].storage.id) ?? 0) === 2 && !follower.yieldApproachPassed
      && cars.slice(0, 2).every(car => car.speed > 4) && follower.speed > 3.5) followingUnderFullStorage += STEP;
    if (tick === 269) measured = { speed: follower.speed, progress: follower.distance + follower.length / 2 - route.stopDistance };
  }
  // 53fe22b: at 9 s the third car travels exactly 1.4 m/s and its front is
  // only 4.013 m beyond the outer line, despite predecessors at ~5 m/s.
  assert.ok(measured.speed > 3.5, `The third car was unnecessarily limited to ${measured.speed.toFixed(3)} m/s`);
  assert.ok(measured.progress > 7.5, `The third car advanced only ${measured.progress.toFixed(3)} m beyond the outer line`);
  assert.ok(followingUnderFullStorage > .3, 'Normal following must occur while two moving side cars still own the middle reservations');
  assert.ok(cars.filter(car => car.passedGateIndex >= 1).length >= 4, 'Removing artificial creep must produce sustained queue discharge');
  t.diagnostic(`Third car at 9 s: ${measured.speed.toFixed(2)} m/s, front ${measured.progress.toFixed(2)} m past outer line; normal following with full storage ${followingUnderFullStorage.toFixed(2)} s`);
});

for (const direction of directions) test(`${direction.shared}: two B1-owned middle places still require walking pace and the inner yield stop`, () => {
  const simulation = makeSimulation(direction, 25);
  const mainRoute = routeOf(simulation, direction.main), sideRoute = routeOf(simulation, direction.shared);
  const mainCars = [0, 1].map(index => {
    const vehicle = addCar(simulation, mainRoute, mainRoute.stops[1].distance - 3.05 - index * 6.7);
    vehicle.passedGateIndex = 0; vehicle.yieldApproachPassed = true;
    vehicle.committedStops = [{ index: 0, phaseSerial: 0 }];
    vehicle.reservations = [{ id: mainRoute.stops[0].storage.id, releaseDistance: mainRoute.stops[1].distance }];
    return vehicle;
  });
  assert.ok(mainCars.every(car => car.distance - car.length / 2 > mainRoute.stops[0].clearDistance),
    'The entry bend is already clear: this fixture specifically tests B1-owned full storage, not an uncleared group');
  const side = addCar(simulation, sideRoute, sideRoute.stopDistance - 3.55, 'van');
  const approach = sideRoute.stops[0].yieldApproach;
  let sawCreep = false, stoppedAtYield = false;
  for (let tick = 0; tick < 60 / STEP; tick++) {
    const b1StillFull = mainCars.filter(car => car.reservations.some(reservation =>
      car.distance - car.length / 2 <= reservation.releaseDistance)).length >= 2;
    simulation.update(STEP); assertSafe(simulation);
    if (b1StillFull && side.passedGateIndex === 0) {
      sawCreep = true;
      assert.ok(side.speed <= approach.speed + 1e-7, 'The same-direction exception must not release cautious speed for B1-owned storage');
      assert.ok(side.distance + side.length / 2 <= approach.distance - .8 + 1e-6);
      assert.equal(side.reservations.length, 0, 'The side van must wait to reserve a genuine free place');
      stoppedAtYield ||= side.speed < .1 && approach.distance - side.distance - side.length / 2 < 1;
    }
    if (side.passedGateIndex >= 1) break;
  }
  assert.ok(sawCreep && stoppedAtYield, 'B1 reservations must still cause visible creep and a real yield stop');
  assert.ok(side.passedGateIndex >= 1 && side.speed > approach.speed, 'The side van must resume once the B1 storage clears');
});

for (const direction of directions) test(`${direction.shared}: normal following never reserves a third place when side predecessors remain stopped at middle red`, () => {
  const simulation = makeSimulation(direction, 25), route = routeOf(simulation, direction.shared);
  for (const index of [0, 1]) {
    const predecessor = addCar(simulation, route, route.stops[1].distance - 3.05 - index * 6.7);
    predecessor.passedGateIndex = 0; predecessor.yieldApproachPassed = true;
    predecessor.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
  }
  const follower = addCar(simulation, route, route.stopDistance - 3.1), approach = route.stops[0].yieldApproach;
  let reachedYield = false;
  for (let tick = 0; tick < 60 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    if (simulation.getSignal(direction.middle) === 'red') {
      assert.equal(follower.reservations.length, 0, 'A stopped full median cannot gain a third reservation merely because all owners came from the side road');
      assert.ok(follower.distance + follower.length / 2 <= approach.distance - .8 + 1e-6);
      reachedYield ||= follower.speed < .1 && approach.distance - follower.distance - follower.length / 2 < 1;
    }
    if (follower.passedGateIndex >= 1) break;
  }
  assert.ok(reachedYield, 'Ordinary following must still stop at the yield point when the real receiving storage remains full');
  assert.ok(follower.passedGateIndex >= 1, 'The same side queue must resume after middle green frees storage');
});
