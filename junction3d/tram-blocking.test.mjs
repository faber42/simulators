import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

const STEP = 1 / 30;
const EPSILON = 1e-7;
const width = body => body.routeId.startsWith('tram-') ? 2.5 : ({ car: 1.82, van: 2.05, bus: 2.5 })[body.kind];

// Independent rectangle intersection: these checks do not use the engine's
// rail reservations, obstacle distances or right-of-way classification.
function overlaps(a, b) {
  const delta = [b.x - a.x, b.z - a.z];
  if (Math.hypot(...delta) > (a.length + b.length) / 2 + 3) return false;
  const forward = body => [Math.sin(body.heading), Math.cos(body.heading)];
  const af = forward(a), bf = forward(b), ar = [af[1], -af[0]], br = [bf[1], -bf[0]];
  const dot = (first, second) => first[0] * second[0] + first[1] * second[1];
  return [af, ar, bf, br].every(axis => {
    const extent = (body, front, side) => Math.abs(dot(axis, front)) * body.length / 2 + Math.abs(dot(axis, side)) * width(body) / 2;
    return Math.abs(dot(axis, delta)) < extent(a, af, ar) + extent(b, bf, br) - EPSILON;
  });
}

function onRails(car) {
  const halfZ = Math.abs(Math.cos(car.heading)) * car.length / 2 + Math.abs(Math.sin(car.heading)) * width(car) / 2;
  return dortmund.transit.routes.some(route => Math.abs(car.z - route.trackZ) < halfZ + 1.25 - EPSILON);
}

function fixture(routeId, tramIds) {
  const config = structuredClone(dortmund);
  config.density = 0;
  config.initialVehiclesPerLane = 0;
  for (const route of config.routes) route.vehicleKinds = ['car'];
  for (const route of config.transit.routes) {
    // Retain both physical tracks even when only one train is due.
    route.offset = tramIds.includes(route.id) ? 0 : 100000;
    delete route.schedule;
    delete route.stationStop;
  }
  const simulation = new TrafficSimulation(config);
  const route = simulation.routes.find(candidate => candidate.id === routeId);
  // These are real median lane positions: the first car is at its red middle
  // line, the second blocks the rails, and the third is still before the rails.
  const cars = [3.05, 9.75, 16.45].map(offset => {
    const car = simulation.createVehicle(route, route.stops[1].distance - offset);
    car.passedGateIndex = 0;
    car.yieldApproachPassed = true;
    car.committedStops = [{ index: 0, phaseSerial: -1 }];
    car.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
    simulation.vehicles.push(car);
    return car;
  });
  assert.ok(onRails(cars[1]), 'The fixture must actually obstruct a rail');
  assert.ok(!onRails(cars[2]), 'The following car starts outside both tracks');
  return { simulation, cars, group: route.stops[1].group };
}

function assertNoContact(simulation) {
  const bodies = [...simulation.vehicles, ...simulation.trams];
  for (let first = 0; first < bodies.length; first++) for (let second = first + 1; second < bodies.length; second++) {
    assert.equal(overlaps(bodies[first], bodies[second]), false,
      `${bodies[first].id}/${bodies[second].id} touch at ${simulation.elapsed.toFixed(2)} s`);
  }
}

for (const routeId of ['east-south', 'west-north']) for (const tramId of ['tram-east', 'tram-west']) {
  test(`${tramId} enters up to a red ${routeId} median queue, then clears after its own signal turns red`, () => {
    const { simulation, cars, group } = fixture(routeId, [tramId]);
    const blocker = cars[1], follower = cars[2], initialBlockerDistance = blocker.distance;
    let stoppedInside = false, releasedByMiddleGreen = false, movedUnderRed = false, followerWaited = false;
    let heldSeconds = 0;
    for (let tick = 0; tick < 190 / STEP; tick++) {
      const train = simulation.trams[0], previousTrainDistance = train?.distance;
      simulation.update(STEP);
      assertNoContact(simulation);
      const tram = simulation.trams[0];
      if (simulation.getSignal(group) === 'red' && !releasedByMiddleGreen) {
        assert.ok(blocker.distance <= initialBlockerDistance + .05, 'A red median queue must not be cleared preemptively for the train');
      }
      if (tram?.committed && tram.speed < .01 && onRails(blocker)) {
        stoppedInside = true;
        heldSeconds += STEP;
        assert.ok(tram.distance + tram.length / 2 > tram.route.stopDistance + 5,
          'The train approaches the obstruction inside the crossing instead of waiting at its signal');
      }
      if (stoppedInside && simulation.getSignal(group) === 'green' && blocker.distance > initialBlockerDistance + .5) releasedByMiddleGreen = true;
      if (releasedByMiddleGreen && tram?.committed && tram.distance > previousTrainDistance + EPSILON && simulation.getTransitSignal(tramId) === 'red') movedUnderRed = true;
      if (releasedByMiddleGreen && tram?.committed && !onRails(blocker) && !onRails(follower) && follower.speed < .05) followerWaited = true;
    }
    assert.ok(stoppedInside && heldSeconds > 2, 'The train must visibly wait inside the junction for an occupied median');
    assert.ok(releasedByMiddleGreen, 'The normal middle green must release the blocking cars without an all-red deadlock');
    assert.ok(movedUnderRed, 'An already admitted train continues under its now-red signal');
    assert.ok(followerWaited, 'Following turners wait before the rails while the admitted train passes');
    assert.equal(simulation.transitPassed, 1, 'The complete coupled train eventually leaves');
    assert.equal(simulation.vehicles.length, 0, 'Both the original obstruction and its waiting follower eventually leave');
    assert.ok(simulation.cycle >= 2, 'The junction must keep cycling after the obstructed passage');
  });
}

for (const routeId of ['east-south', 'west-north']) {
  test(`opposing trains leave the ${routeId} median queue room to clear both tracks`, () => {
    const { simulation, cars, group } = fixture(routeId, ['tram-east', 'tram-west']);
    const stoppedTrains = new Set(), releasedTrains = new Set();
    let middleOpened = false;
    for (let tick = 0; tick < 210 / STEP; tick++) {
      simulation.update(STEP);
      assertNoContact(simulation);
      if (simulation.getSignal(group) === 'green') middleOpened = true;
      for (const tram of simulation.trams) {
        if (tram.committed && tram.speed < .01 && onRails(cars[1])) stoppedTrains.add(tram.routeId);
        if (middleOpened && tram.committed && tram.speed > .1 && simulation.getTransitSignal(tram.routeId) === 'red') releasedTrains.add(tram.routeId);
      }
    }
    assert.equal(stoppedTrains.size, 2, 'Both directions really encounter the occupied rail crossing');
    assert.equal(releasedTrains.size, 2, 'Neither train may pin the clearing car between the tracks');
    assert.equal(simulation.transitPassed, 2);
    assert.equal(simulation.vehicles.length, 0);
  });
}

for (const [routeId, phaseIndex] of [['north-through', 1], ['south-through', 3]]) {
  test(`a waiting tram does not preemptively close the open ${routeId} approach`, () => {
    const { simulation } = fixture('east-south', ['tram-east']);
    simulation.vehicles.length = 0;
    simulation.phaseIndex = phaseIndex;
    simulation.stage = 'green';
    simulation.stageElapsed = 0;
    simulation.bookTransitPhase(0);
    const route = simulation.routes.find(candidate => candidate.id === routeId);
    const car = simulation.createVehicle(route, route.stopDistance - 3.05);
    simulation.vehicles.push(car);
    let entered = false, crossedRails = false;
    for (let tick = 0; tick < 15 / STEP; tick++) {
      simulation.update(STEP);
      assertNoContact(simulation);
      assert.equal(simulation.getTransitSignal('tram-east'), 'red');
      assert.equal(simulation.trams[0].committed, false);
      if (car.passedGateIndex >= 0) entered = true;
      if (onRails(car)) crossedRails = true;
    }
    assert.ok(entered && crossedRails, 'An announced train awaiting its own green must not reserve a still-open side approach');
    assert.equal(car.passedGateIndex, 1, 'The car traverses its green inner gate in the normal side phase');
  });
}
