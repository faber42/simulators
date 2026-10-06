import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30;
const LENGTHS = { car: 4.5, van: 5.4 };
const WIDTHS = { car: 1.82, van: 2.05, bus: 2.5, tram: 2.5 };
const directions = [
  { name: 'southbound', main: 'east-south', outer: 'east-south-outer', uturn: 'east-uturn', sharedUTurn: 'east-uturn-shared',
    mainPhase: 0, sidePhase: 1, sideGroup: 'north', middleGroup: 'middleSouth', sharedSide: 'north-shared-straight', outerSide: 'north-through',
    sideRoutes: ['north-left', 'north-shared-straight', 'north-through'] },
  { name: 'northbound', main: 'west-north', outer: 'west-north-outer', uturn: 'west-uturn', sharedUTurn: 'west-uturn-shared',
    mainPhase: 2, sidePhase: 3, sideGroup: 'south', middleGroup: 'middleNorth', sharedSide: 'south-shared-straight', outerSide: 'south-through',
    sideRoutes: ['south-left', 'south-shared-straight', 'south-through'] },
];

function configFor(location = dortmund, transit = false) {
  const config = structuredClone(location);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.routes.forEach(route => { route.rate = 0; route.vehicleKinds = ['car', 'van']; });
  if (!transit) delete config.transit;
  return config;
}

function routeFor(simulation, id) {
  const route = simulation.routes.find(route => route.id === id);
  assert.ok(route, `Missing route ${id}`); return route;
}

function addVehicle(simulation, routeId, distance, kind = 'car', admitted = false) {
  const route = routeFor(simulation, routeId), vehicle = simulation.createVehicle(route, distance);
  vehicle.kind = kind; vehicle.length = LENGTHS[kind]; vehicle.speed = 0;
  if (admitted) {
    vehicle.passedGateIndex = 0; vehicle.committed = true;
    vehicle.committedStops = [{ index: 0, phaseSerial: simulation.phaseSerial }];
    vehicle.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
  }
  Object.assign(vehicle, samplePath(route.path, distance));
  simulation.vehicles.push(vehicle); return vehicle;
}

function queue(simulation, ids, count) {
  const routes = Array.isArray(ids) ? ids : [ids];
  const result = []; let frontOffset = .85;
  for (let i = 0; i < count; i++) {
    const kind = i % 3 === 0 ? 'van' : 'car', id = routes[i % routes.length];
    const route = routeFor(simulation, id), length = LENGTHS[kind];
    result.push(addVehicle(simulation, id, route.stopDistance - frontOffset - length / 2, kind));
    frontOffset += length + 2.8;
  }
  return result;
}

// Independent geometric projection of a configured yield point, not an
// assertion against the engine's own derived yield-distance implementation.
function project(path, point) {
  let error = Infinity, distance = 0;
  for (let i = 1; i < path.samples.length; i++) {
    const a = path.samples[i - 1], b = path.samples[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point[0] - a.x) * dx + (point[1] - a.z) * dz) / (dx * dx + dz * dz)));
    const e = Math.hypot(a.x + t * dx - point[0], a.z + t * dz - point[1]);
    if (e < error) { error = e; distance = a.distance + t * (b.distance - a.distance); }
  }
  return distance;
}

function bodiesOverlap(a, b) {
  const displacement = [b.x - a.x, b.z - a.z];
  if (Math.hypot(...displacement) > (a.length + b.length) / 2 + 3) return false;
  const frontA = [Math.sin(a.heading), Math.cos(a.heading)], sideA = [frontA[1], -frontA[0]];
  const frontB = [Math.sin(b.heading), Math.cos(b.heading)], sideB = [frontB[1], -frontB[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  return [frontA, sideA, frontB, sideB].every(axis => {
    const extent = (body, front, side) => Math.abs(dot(front, axis)) * body.length / 2 + Math.abs(dot(side, axis)) * WIDTHS[body.kind] / 2;
    return Math.abs(dot(displacement, axis)) < extent(a, frontA, sideA) + extent(b, frontB, sideB) - 1e-7;
  });
}

function assertSafe(simulation) {
  for (const vehicle of simulation.vehicles) {
    const next = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (next && simulation.getSignal(next.group) !== 'green') assert.ok(vehicle.distance + vehicle.length / 2 <= next.distance + 1e-7,
      `${vehicle.routeId} crossed closed ${next.id} at ${simulation.elapsed.toFixed(2)} s`);
  }
  for (const tram of simulation.trams) {
    if (!tram.committed && simulation.getTransitSignal(tram.routeId) !== 'green') assert.ok(tram.distance + tram.length / 2 <= tram.route.stopDistance + 1e-7);
  }
  const bodies = [...simulation.vehicles, ...simulation.trams.map(tram => ({ ...tram, kind: 'tram' }))];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) assert.equal(
    bodiesOverlap(bodies[i], bodies[j]), false,
    `${bodies[i].routeId}/${bodies[j].routeId} bodies overlap at ${simulation.elapsed.toFixed(2)} s`);
}

function step(simulation) { simulation.update(STEP); assertSafe(simulation); }
function until(simulation, predicate, seconds) {
  for (let tick = 0; tick < seconds / STEP && !predicate(); tick++) step(simulation);
  assert.ok(predicate(), `Fixture did not reach its state within ${seconds} s (${simulation.phaseIndex}/${simulation.stage})`);
}

for (const direction of directions) test(`${direction.name}: a stopped adjacent median queue cannot indefinitely block the empty destination lane`, () => {
  const config = configFor(); config.phases[direction.mainPhase].duration = 90;
  const simulation = new TrafficSimulation(config);
  simulation.phaseIndex = direction.mainPhase; simulation.stageElapsed = 8;
  const leaderRoute = routeFor(simulation, direction.main), outerRoute = routeFor(simulation, direction.outer);
  const frontDistance = leaderRoute.stops[1].distance - LENGTHS.car / 2 - .8;
  const front = addVehicle(simulation, direction.main, frontDistance, 'car', true);
  const rear = addVehicle(simulation, direction.main, frontDistance - LENGTHS.car - 2.2, 'car', true);
  assert.ok(rear.distance - rear.length / 2 > leaderRoute.stops[0].clearDistance,
    'The stationary rear vehicle must already be entirely past the shared entry bend');
  const follower = addVehicle(simulation, direction.outer, outerRoute.stopDistance + 8, 'van', true);
  for (let tick = 0; tick < 20 / STEP; tick++) step(simulation);
  assert.equal(simulation.getSignal(direction.middleGroup), 'red');
  assert.ok(follower.distance - follower.length / 2 > outerRoute.stops[0].clearDistance,
    'A geometrically free adjacent lane must fill while the other lane stays red and stationary');
  assert.ok(follower.distance + follower.length / 2 > outerRoute.stops[1].distance - 2,
    'The following van should reach the empty middle stop, not remain in an imaginary common queue');
  assert.ok(Math.abs(front.distance - frontDistance) < .01 && rear.speed < .01, 'The fixture must not pass because the parked queue moved away');
});

for (const direction of directions) for (const cause of ['occupied curve', 'full median']) test(`${direction.name}: green side traffic creeps past the outer line for ${cause}, stops before the bend, then continues`, () => {
  const config = configFor();
  config.phases[direction.mainPhase].duration = 90;
  config.phases[direction.sidePhase].duration = 65;
  config.phases[direction.sidePhase].groupDelays = { [direction.middleGroup]: 25 };
  const simulation = new TrafficSimulation(config);
  simulation.phaseIndex = direction.mainPhase; simulation.stageElapsed = 8;
  const mainRoute = routeFor(simulation, direction.main), leadDistance = mainRoute.stops[1].distance - 3.05;
  const mainCars = [addVehicle(simulation, direction.main, leadDistance, 'car', true),
    addVehicle(simulation, direction.sharedUTurn, leadDistance - 6.7, 'car', true)];
  if (cause === 'occupied curve') mainCars.push(addVehicle(simulation, direction.main, leadDistance - 13.4, 'car', true));
  const side = queue(simulation, cause === 'occupied curve' ? direction.outerSide : direction.sharedSide, 2)[0];
  const approach = side.route.stops[0].yieldApproach;
  assert.ok(approach?.point && approach.speed > 0, 'The real location must declare the creep point and walking-speed limit');
  const yieldDistance = project(side.route.path, approach.point);
  assert.ok(yieldDistance > side.route.stopDistance + 4 && yieldDistance < side.route.stops[0].clearDistance);
  for (let tick = 0; tick < 3 / STEP; tick++) step(simulation);
  assert.ok(side.distance + side.length / 2 <= side.route.stopDistance, 'Red must retain the original outer stop line');
  simulation.phaseIndex = direction.sidePhase; simulation.phaseSerial++;
  simulation.stage = 'green'; simulation.stageElapsed = 0; simulation.closedGreenElapsed = 0;
  let crossedWhileBlocked = false, stoppedAtYield = false, maximumCreepSpeed = 0, sawDeferredReservation = false;
  for (let tick = 0; tick < 60 / STEP; tick++) {
    const blocked = cause === 'occupied curve'
      ? mainCars.some(vehicle => vehicle.distance - vehicle.length / 2 <= vehicle.route.stops[0].clearDistance)
      : mainCars.filter(vehicle => vehicle.reservations.some(reservation => reservation.id === side.route.stops[0].storage.id
        && vehicle.distance - vehicle.length / 2 <= reservation.releaseDistance)).length >= 2;
    step(simulation);
    if (blocked && side.passedGateIndex === 0) {
      crossedWhileBlocked = true;
      assert.ok(side.speed <= approach.speed + 1e-7,
        `Admitted yielding traffic reached ${side.speed.toFixed(4)} m/s instead of at most ${approach.speed} m/s at ${simulation.elapsed.toFixed(2)} s`);
      assert.ok(side.distance + side.length / 2 <= yieldDistance - .8 + 1e-6, 'Front bumper must stop before the physical entry curve');
      assert.equal(side.reservations.length, 0, 'Creeping before the yield point must not consume nonexistent middle storage');
      sawDeferredReservation = true; maximumCreepSpeed = Math.max(maximumCreepSpeed, side.speed);
      stoppedAtYield ||= side.speed < .1 && yieldDistance - side.distance - side.length / 2 < 1.0;
    }
    if (side.passedGateIndex >= 1) break;
  }
  assert.ok(crossedWhileBlocked && sawDeferredReservation, 'Green must allow visible movement beyond the outer line even before admission to middle storage');
  assert.ok(stoppedAtYield && maximumCreepSpeed > .8, 'The fixture must actually creep to and stop at the configured yield point');
  assert.ok(side.passedGateIndex >= 1 && side.speed > approach.speed, 'Once the priority queue drains, the side vehicle must continue normally');
});

for (const direction of directions) test(`${direction.name}: mixed cars and creeping entrants stop at synchronous inner red and resume in a later cycle`, () => {
  const simulation = new TrafficSimulation(configFor());
  until(simulation, () => simulation.phaseIndex === direction.mainPhase && simulation.stage === 'green', 150);
  const initialSerial = simulation.phaseSerial;
  const mainCars = queue(simulation, [direction.main, direction.uturn], 14);
  const sideCars = direction.sideRoutes.flatMap(id => queue(simulation, id, 4));
  until(simulation, () => simulation.phaseSerial === initialSerial + 1 && simulation.stage === 'green', 100);
  const admittedMain = mainCars.filter(vehicle => vehicle.passedGateIndex === 0);
  assert.ok(admittedMain.length >= 7, 'Mixed traffic must actually fill multiple middle lanes and their approach');
  const reached = new Set(admittedMain.map(vehicle => vehicle.route.stops[0].storage.id));
  assert.equal(reached.size, 3, 'Regular turns and U-turns must use all three compatible middle lanes');
  until(simulation, () => sideCars.some(vehicle => vehicle.passedGateIndex === 0 && !vehicle.reservations.length), 18);
  const admittedSide = sideCars.filter(vehicle => vehicle.passedGateIndex >= 0);
  assert.ok(admittedSide.length, 'The manual-end fixture must include already creeping side traffic');
  simulation.requestNextPhase();
  assert.equal(simulation.getSignal(direction.middleGroup), 'yellow');
  assert.equal(simulation.getSignal(direction.sideGroup), 'yellow');
  until(simulation, () => simulation.phaseSerial >= initialSerial + 2, 120);
  assert.ok([...admittedMain, ...admittedSide].some(vehicle => vehicle.passedGateIndex === 0),
    'An early end must leave cars waiting on the median rather than prolong its green');
  until(simulation, () => [...admittedMain, ...admittedSide].every(vehicle => vehicle.passedGateIndex >= 1), 280);
});

test('mixed turners, creeping side traffic and the following trams all progress without collisions', () => {
  const config = configFor(dortmund, true);
  config.transit.routes.forEach((route, index) => { delete route.schedule; route.offset = 65 + index * 6; });
  const simulation = new TrafficSimulation(config);
  const mainCars = queue(simulation, ['east-south', 'east-uturn'], 14);
  const sideCars = directions[0].sideRoutes.flatMap(id => queue(simulation, id, 4));
  let sawPendingSide = false, sawReserved = false;
  for (let tick = 0; tick < 360 / STEP; tick++) {
    step(simulation);
    sawPendingSide ||= sideCars.some(vehicle => vehicle.passedGateIndex === 0 && !vehicle.reservations.length);
    if (simulation.transitProtected) {
      sawReserved = true;
      for (const group of config.transit.blockedGroups) assert.equal(simulation.getSignal(group), 'red');
    }
    if (simulation.transitPassed === 2 && [...mainCars, ...sideCars].every(vehicle => vehicle.passedGateIndex >= 1)) break;
  }
  assert.ok(sawPendingSide && sawReserved); assert.equal(simulation.transitPassed, 2);
  assert.ok([...mainCars, ...sideCars].every(vehicle => vehicle.passedGateIndex >= 1),
    'Train priority must not indefinitely prevent any of the original road queues from leaving the median');
});

test('Opphoff gates keep hard capacity and ordinary admission without yielding-creep configuration', () => {
  const simulation = new TrafficSimulation(configFor(opphoff));
  assert.ok(simulation.routes.every(route => route.stops.every(stop => !stop.yieldApproach)));
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage)
    .map(stop => [stop.storage.id, stop.storage.capacity])));
  // Outlet variants share one physical approach; seed its queue only once.
  const approaches = new Map();
  for (const route of simulation.routes) if (route.stops.length === 3 && !approaches.has(route.laneId)) approaches.set(route.laneId, route);
  const cars = [...approaches.values()].flatMap(route => queue(simulation, route.id, 6));
  let sawFull = false;
  for (let tick = 0; tick < 240 / STEP; tick++) {
    step(simulation);
    const occupied = new Map();
    for (const vehicle of simulation.vehicles) for (const reservation of vehicle.reservations) occupied.set(reservation.id, (occupied.get(reservation.id) ?? 0) + 1);
    for (const [id, count] of occupied) { assert.ok(count <= capacities.get(id)); sawFull ||= count === capacities.get(id); }
  }
  assert.ok(sawFull && simulation.cycle >= 3);
  assert.ok(cars.filter(vehicle => vehicle.passedGateIndex === 2).length >= 12);
});
