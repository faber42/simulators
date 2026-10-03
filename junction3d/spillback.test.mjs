import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30;
const WIDTHS = { car: 1.82, van: 2.05, bus: 2.5, tram: 2.5 };

// Independent separating-axis geometry. This deliberately does not call the
// engine's headway, lane-section or admission helpers.
function overlaps(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > (a.length + b.length) / 2 + 3) return false;
  const forwardA = [Math.sin(a.heading), Math.cos(a.heading)], rightA = [forwardA[1], -forwardA[0]];
  const forwardB = [Math.sin(b.heading), Math.cos(b.heading)], rightB = [forwardB[1], -forwardB[0]];
  return [forwardA, rightA, forwardB, rightB].every(axis => {
    const dot = vector => Math.abs(vector[0] * axis[0] + vector[1] * axis[1]);
    const extentA = dot(forwardA) * a.length / 2 + dot(rightA) * WIDTHS[a.kind] / 2;
    const extentB = dot(forwardB) * b.length / 2 + dot(rightB) * WIDTHS[b.kind] / 2;
    return Math.abs(dx * axis[0] + dz * axis[1]) < extentA + extentB - 1e-7;
  });
}

function assertSafe(simulation) {
  for (const vehicle of simulation.vehicles) {
    const gate = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (gate && simulation.getSignal(gate.group) !== 'green') assert.ok(
      vehicle.distance + vehicle.length / 2 <= gate.distance + 1e-7,
      `${vehicle.routeId} crossed closed gate ${gate.id} at ${simulation.elapsed.toFixed(2)} s`);
  }
  for (const tram of simulation.trams) {
    if (!tram.committed && simulation.getTransitSignal(tram.routeId) !== 'green') assert.ok(
      tram.distance + tram.length / 2 <= tram.route.stopDistance + 1e-7,
      `${tram.routeId} crossed a closed tram signal`);
    if (tram.committed && tram.distance - tram.length / 2 <= tram.route.clearDistance) assert.ok(
      simulation.phases[simulation.phaseIndex].groups.some(group => simulation.transitConfig.greenGroups.includes(group)),
      'Side traffic opened before the complete tram rear cleared the crossing');
  }
  const bodies = [...simulation.vehicles, ...simulation.trams.map(tram => ({ ...tram, kind: 'tram' }))];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) assert.equal(
    overlaps(bodies[i], bodies[j]), false,
    `${bodies[i].routeId}/${bodies[j].routeId} bodies overlap at ${simulation.elapsed.toFixed(2)} s`);
}

function quietConfig(location, { transit = false } = {}) {
  const result = structuredClone(location);
  result.density = 0; result.initialVehiclesPerLane = 0;
  result.routes.forEach(route => { route.rate = 0; route.vehicleKinds = ['car']; });
  if (!transit) delete result.transit;
  return result;
}

function addQueue(simulation, routeId, count) {
  const routes = (Array.isArray(routeId) ? routeId : [routeId]).map(id => {
    const route = simulation.routes.find(candidate => candidate.id === id);
    assert.ok(route, `Missing fixture route ${id}`); return route;
  });
  const vehicles = [];
  for (let i = 0; i < count; i++) {
    const route = routes[i % routes.length];
    const vehicle = simulation.createVehicle(route, route.stopDistance - 3.1 - i * 7.4);
    simulation.vehicles.push(vehicle); vehicles.push(vehicle);
  }
  return vehicles;
}

function occupancy(simulation) {
  const counts = new Map();
  for (const vehicle of simulation.vehicles) for (const reservation of vehicle.reservations) {
    counts.set(reservation.id, (counts.get(reservation.id) ?? 0) + 1);
  }
  return counts;
}

function advanceUntil(simulation, predicate, maximumSeconds) {
  for (let tick = 0; tick < maximumSeconds / STEP; tick++) {
    if (predicate()) return;
    simulation.update(STEP); assertSafe(simulation);
  }
  assert.ok(predicate(), `Condition not reached after ${maximumSeconds} s; phase ${simulation.phaseIndex}/${simulation.stage}`);
}

const scenarios = [
  { route: 'east-south', mainPhase: 0, sideGroup: 'north', middleGroup: 'middleSouth', sideRoutes: ['north-shared-straight', 'north-through'] },
  { route: 'west-north', mainPhase: 2, sideGroup: 'south', middleGroup: 'middleNorth', sideRoutes: ['south-shared-straight', 'south-through'] },
  { route: 'east-uturn', mainPhase: 0, sideGroup: 'north', middleGroup: 'middleSouth', sideRoutes: ['north-left', 'north-shared-left'] },
  { route: 'west-uturn', mainPhase: 2, sideGroup: 'south', middleGroup: 'middleNorth', sideRoutes: ['south-left', 'south-shared-left'] },
  { route: ['east-south', 'east-uturn'], mainPhase: 0, sideGroup: 'north', middleGroup: 'middleSouth',
    sideRoutes: ['north-left', 'north-shared-straight', 'north-through'] },
  { route: ['west-north', 'west-uturn'], mainPhase: 2, sideGroup: 'south', middleGroup: 'middleNorth',
    sideRoutes: ['south-left', 'south-shared-straight', 'south-through'] },
];

for (const scenario of scenarios) test(`${scenario.route}: green admits spillback into the bend and existing turners merge before side traffic`, t => {
  const simulation = new TrafficSimulation(quietConfig(dortmund));
  advanceUntil(simulation, () => simulation.phaseIndex === scenario.mainPhase && simulation.stage === 'green', 150);
  const serial = simulation.phaseSerial;
  const turners = addQueue(simulation, scenario.route, 12);
  const sideCars = scenario.sideRoutes.flatMap(id => addQueue(simulation, id, 4));
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage)
    .map(stop => [stop.storage.id, stop.storage.capacity])));
  const maxOccupancy = new Map(), bentWaiters = new Set(), initialMergePriority = new Map();
  let sidePhaseStarted = false, sawGreenYield = false, sawNextMain = false;
  let maxSideStoppedFor = 0, stoppedFor = 0;

  for (let tick = 0; tick < 210 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    for (const [id, count] of occupancy(simulation)) maxOccupancy.set(id, Math.max(count, maxOccupancy.get(id) ?? 0));
    if (simulation.phaseSerial === serial) for (const vehicle of turners) {
      const entry = vehicle.route.stops[0];
      const approach = samplePath(vehicle.route.path, entry.distance).heading;
      if (vehicle.passedGateIndex === 0 && vehicle.speed < .2 && vehicle.distance - vehicle.length / 2 < entry.clearDistance
        && Math.abs(Math.sin(vehicle.heading - approach)) > .2) bentWaiters.add(vehicle.id);
    }
    if (!sidePhaseStarted && simulation.getSignal(scenario.sideGroup) === 'green') {
      sidePhaseStarted = true;
      assert.equal(simulation.getSignal(scenario.middleGroup), 'green', 'Middle and outer side signals must open simultaneously');
      for (const vehicle of turners.filter(car => car.passedGateIndex === 0)) {
        const storageId = vehicle.route.stops[0].storage.id;
        if (!initialMergePriority.has(storageId)) initialMergePriority.set(storageId, []);
        initialMergePriority.get(storageId).push(vehicle);
      }
    }
    if (sidePhaseStarted) for (const side of sideCars) {
      const pending = (initialMergePriority.get(side.route.stops[0].storage.id) ?? [])
        .filter(vehicle => vehicle.distance - vehicle.length / 2 < vehicle.route.laneSections[1].startDistance);
      const sideFront = side.distance + side.length / 2;
      if (pending.length) assert.ok(sideFront <= side.route.laneSections[1].startDistance + 1e-7,
        `Side traffic cut ahead of an existing B1 turner in ${side.route.stops[0].storage.id}`);
      if (pending.length && simulation.getSignal(scenario.sideGroup) === 'green' && side.speed < .2) sawGreenYield = true;
    }
    if (simulation.phaseSerial === serial + 1 && simulation.getSignal(scenario.sideGroup) === 'green') {
      const curveStillOccupied = turners.some(vehicle => vehicle.passedGateIndex >= 0
        && vehicle.distance - vehicle.length / 2 <= vehicle.route.stops[0].clearDistance);
      if (curveStillOccupied) for (const side of sideCars) {
        assert.equal(side.passedGateIndex, -1, 'An existing B1 tail still occupies the curve: the green side approach must wait at its outer gate');
        assert.ok(side.distance + side.length / 2 <= side.route.stopDistance + 1e-7);
      }
    }
    if (sidePhaseStarted && simulation.phaseSerial >= serial + 2) sawNextMain = true;
    const stillYielding = sidePhaseStarted && simulation.getSignal(scenario.sideGroup) === 'green'
      && sideCars.some(car => car.speed < .2 && car.passedGateIndex < 0);
    stoppedFor = stillYielding ? stoppedFor + STEP : 0; maxSideStoppedFor = Math.max(maxSideStoppedFor, stoppedFor);
    if (sawNextMain && sideCars.every(vehicle => vehicle.passedGateIndex >= 1)) break;
  }
  const overloaded = [...maxOccupancy].filter(([id, count]) => count > capacities.get(id));
  assert.ok(overloaded.length, 'At least one real holding lane must exceed its nominal two-car capacity during green');
  assert.ok(bentWaiters.size, 'At least one admitted car must actually stop while still turning, before the safe median clear point');
  assert.ok(sidePhaseStarted && sawGreenYield, 'Green side traffic must yield to already waiting B1 turners');
  assert.ok(sawNextMain, 'A car stopped in the bend may not lock the preceding B1 phase in clearance');
  assert.ok(sideCars.every(vehicle => vehicle.passedGateIndex >= 1), 'The side approach must eventually enter and pass its middle signal');
  t.diagnostic(`${overloaded.map(([id, count]) => `${id}: ${count}`).join(', ')}; ${bentWaiters.size} stopped bend cars; side yielded up to ${maxSideStoppedFor.toFixed(1)} s`);
});

for (const scenario of scenarios.slice(4)) test(`${scenario.route}: immediately ending the receiving side phase still drains inherited spillback`, () => {
  const simulation = new TrafficSimulation(quietConfig(dortmund));
  advanceUntil(simulation, () => simulation.phaseIndex === scenario.mainPhase && simulation.stage === 'green', 150);
  const initialSerial = simulation.phaseSerial;
  const turners = addQueue(simulation, scenario.route, 12);
  const sideCars = scenario.sideRoutes.flatMap(id => addQueue(simulation, id, 3));
  advanceUntil(simulation, () => simulation.phaseSerial === initialSerial + 1 && simulation.stage === 'green', 90);
  const admitted = turners.filter(vehicle => vehicle.passedGateIndex === 0);
  assert.ok(admitted.length > 6, 'The early-end fixture must inherit more cars than fit in the three middle lanes');
  assert.ok(admitted.some(vehicle => vehicle.distance - vehicle.length / 2 < vehicle.route.stops[0].clearDistance));
  simulation.requestNextPhase();
  assert.equal(simulation.getSignal(scenario.middleGroup), 'green', 'The receiving middle signal must keep draining after the manual end');
  assert.notEqual(simulation.getSignal(scenario.sideGroup), 'green');
  advanceUntil(simulation, () => simulation.phaseSerial >= initialSerial + 2, 100);
  for (const vehicle of admitted) assert.ok(vehicle.distance - vehicle.length / 2 > vehicle.route.stops.at(-1).clearDistance,
    `Next conflicting main phase opened before inherited turner ${vehicle.id} fully cleared`);
  assert.ok(sideCars.every(vehicle => vehicle.passedGateIndex < 0), 'A manual early end must not admit the side queue through its closed outer gate');
});

for (const unavailable of ['middle group absent', 'middle group does not drain']) test(`overflow cannot hand off to an unsafe next phase: ${unavailable}`, () => {
  const config = quietConfig(dortmund);
  if (unavailable === 'middle group absent') {
    config.phases[1].groups = ['north']; config.phases[1].drainGroups = [];
  } else config.phases[1].drainGroups = [];
  const simulation = new TrafficSimulation(config);
  const turners = addQueue(simulation, 'east-south', 12);
  let overloaded = false;
  for (let tick = 0; tick < 60 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    overloaded ||= [...occupancy(simulation).values()].some(count => count > 2);
  }
  assert.ok(overloaded);
  assert.ok(turners.some(vehicle => vehicle.passedGateIndex === 0 && vehicle.distance - vehicle.length / 2 < vehicle.route.stops[0].clearDistance));
  assert.equal(simulation.phaseSerial, 0, 'An unsafe next phase must not receive live spillback across its path');
  assert.equal(simulation.stage, 'clearance');
  assert.equal(simulation.getSignal('north'), 'red');
});

test('a booked tram phase still closes both spilling B1 left entries until a later unprotected phase', () => {
  const config = quietConfig(dortmund, { transit: true });
  config.transit.routes.forEach((route, index) => { delete route.schedule; route.offset = 14 + index * 4; });
  const simulation = new TrafficSimulation(config);
  const cars = [...addQueue(simulation, 'east-south', 6), ...addQueue(simulation, 'west-north', 6)];
  let sawTram = false, resumed = false;
  for (let tick = 0; tick < 210 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    if (simulation.transitProtected) {
      for (const group of config.transit.blockedGroups) assert.equal(simulation.getSignal(group), 'red');
      if (simulation.phaseSerial === 0) assert.ok(cars.every(vehicle => vehicle.passedGateIndex < 0), 'Spillback permission cannot bypass the train reservation');
    }
    sawTram ||= simulation.trams.some(tram => tram.committed);
    resumed ||= !simulation.transitProtected && cars.some(vehicle => vehicle.passedGateIndex >= 0);
    if (sawTram && resumed && simulation.transitPassed === 2) break;
  }
  assert.ok(sawTram && resumed); assert.equal(simulation.transitPassed, 2);
});

test('the tram phase following spillback begins only after the whole inherited turning queue has cleared', () => {
  const config = quietConfig(dortmund, { transit: true });
  config.transit.routes.forEach((route, index) => { delete route.schedule; route.offset = 65 + index * 6; });
  const simulation = new TrafficSimulation(config);
  assert.equal(simulation.transitProtected, false, 'The first B1 phase must allow a real overflowing queue');
  const turners = addQueue(simulation, ['east-south', 'east-uturn'], 12);
  ['north-left', 'north-shared-straight', 'north-through'].forEach(id => addQueue(simulation, id, 3));
  let overloaded = false, sawFollowingReservation = false, sawTrain = false;
  for (let tick = 0; tick < 150 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    overloaded ||= [...occupancy(simulation).values()].some(count => count > 2);
    if (simulation.transitProtected && simulation.phaseIndex === 2) {
      sawFollowingReservation = true;
      for (const group of config.transit.blockedGroups) assert.equal(simulation.getSignal(group), 'red');
      for (const vehicle of turners.filter(vehicle => vehicle.passedGateIndex >= 0)) assert.ok(
        vehicle.distance - vehicle.length / 2 > vehicle.route.stops.at(-1).clearDistance,
        'Booked following tram phase started with a residual B1 turning tail in the crossing');
    }
    sawTrain ||= simulation.trams.some(tram => tram.committed && simulation.phaseIndex === 2);
    if (simulation.transitPassed === 2) break;
  }
  assert.ok(overloaded && sawFollowingReservation && sawTrain);
  assert.equal(simulation.transitPassed, 2, 'Both trains must eventually traverse after the spilled queue drains');
});

test('Opphoff keeps hard storage capacity on every gate and continues alternating both axes', () => {
  const config = quietConfig(opphoff);
  const simulation = new TrafficSimulation(config);
  const candidates = simulation.routes.filter(route => route.stops.length === 3);
  assert.equal(candidates.length, 4);
  const cars = candidates.flatMap(route => addQueue(simulation, route.id, 7));
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage)
    .map(stop => [stop.storage.id, stop.storage.capacity])));
  let sawFull = false;
  for (let tick = 0; tick < 240 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    for (const [id, count] of occupancy(simulation)) {
      assert.ok(count <= capacities.get(id), `Opphoff ${id} must retain its hard admission limit`);
      sawFull ||= count === capacities.get(id);
    }
  }
  assert.ok(sawFull, 'The capacity fixture must actually saturate a median');
  assert.ok(simulation.cycle >= 3, 'Both axes must continue cycling under full-median demand');
  assert.ok(simulation.passed >= 12, 'Original queues must keep completing journeys');
  assert.ok(cars.filter(vehicle => vehicle.passedGateIndex === 2).length >= 16,
    'Repeated batches must pass all three gates without changing Opphoff capacity');
});
