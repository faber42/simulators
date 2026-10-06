import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

const STEP = 1 / 30;
const EPSILON = 1e-7;
const lengths = { car: 4.5, van: 5.4 };
const widths = { car: 1.82, van: 2.05, bus: 2.5 };

// Test collision geometry independently of the engine's rail reservations.
function overlaps(first, second) {
  const forward = body => [Math.sin(body.heading), Math.cos(body.heading)];
  const a = forward(first), b = forward(second), ar = [a[1], -a[0]], br = [b[1], -b[0]];
  const delta = [second.x - first.x, second.z - first.z];
  const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
  const width = body => body.routeId.startsWith('tram-') ? 2.65 : widths[body.kind];
  return [a, ar, b, br].every(axis => {
    const extent = (body, front, side) => Math.abs(dot(axis, front)) * body.length / 2 + Math.abs(dot(axis, side)) * width(body) / 2;
    return Math.abs(dot(axis, delta)) < extent(first, a, ar) + extent(second, b, br) - EPSILON;
  });
}

function fixture({ direction = 'south', count = 1, kind = 'car', secondKind = kind, train = true, secondRow = false, extraMargin = 0 } = {}) {
  const config = structuredClone(dortmund);
  config.density = 0;
  config.initialVehiclesPerLane = 0;
  // Keep the median red throughout the observation, so a normal side green
  // cannot accidentally satisfy the test by releasing all the cars.
  config.phases[0].duration = 120;
  const tramId = direction === 'south' ? 'tram-east' : 'tram-west';
  for (const route of config.transit.routes) {
    route.offset = train && route.id === tramId ? 0 : 100000;
    delete route.schedule;
    delete route.stationStop;
  }
  const routeIds = direction === 'south'
    ? ['east-south', 'east-south-outer', 'east-uturn']
    : ['west-north', 'west-north-outer', 'west-uturn'];
  for (const route of config.routes) route.vehicleKinds = ['car', 'van'];
  const simulation = new TrafficSimulation(config);
  const cars = [];
  for (const [index, routeId] of routeIds.slice(0, count).entries()) {
    const route = simulation.routes.find(candidate => candidate.id === routeId);
    const selectedKind = index === 0 ? kind : secondKind;
    const add = offset => {
      const car = simulation.createVehicle(route, route.stops[1].distance - lengths[selectedKind] / 2 - .8 - extraMargin - offset);
      car.kind = selectedKind;
      car.length = lengths[selectedKind];
      car.passedGateIndex = 0;
      car.yieldApproachPassed = true;
      car.committedStops = [{ index: 0, phaseSerial: -1 }];
      car.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
      simulation.vehicles.push(car);
      cars.push(car);
    };
    add(0);
    if (secondRow) add(lengths[selectedKind] + 2.2);
  }
  return { simulation, cars, tramId };
}

function inspectSafety(simulation, cars) {
  for (const car of cars) {
    const stop = car.route.stops[1];
    assert.equal(simulation.getSignal(stop.group), 'red', 'The inner signal remains red throughout the test');
    assert.equal(car.passedGateIndex, 0, 'A nudge never commits a car through its red middle signal');
    assert.ok(car.distance + car.length / 2 <= stop.distance - .15 + EPSILON, 'At least fifteen centimetres remain before the red line');
  }
  const bodies = [...simulation.vehicles, ...simulation.trams];
  for (let first = 0; first < bodies.length; first++) for (let second = first + 1; second < bodies.length; second++) {
    assert.equal(overlaps(bodies[first], bodies[second]), false,
      `${bodies[first].id}/${bodies[second].id} touch at ${simulation.elapsed.toFixed(2)} seconds`);
  }
}

for (const direction of ['south', 'north']) for (const count of [1, 2]) {
  test(`${count} first-row ${direction} car(s) edge forward under red to release a physically waiting tram`, () => {
    const { simulation, cars } = fixture({ direction, count });
    const initial = cars.map(car => car.distance);
    const started = new Set();
    let witnessedWait = false;
    for (let tick = 0; tick < 80 / STEP; tick++) {
      const before = cars.map(car => car.distance);
      simulation.update(STEP);
      inspectSafety(simulation, cars);
      const tram = simulation.trams[0];
      if (tram?.committed && tram.speed < .12 && tram.distance + tram.length / 2 > tram.route.stopDistance + 5) witnessedWait = true;
      for (const [index, car] of cars.entries()) {
        assert.ok(car.distance >= before[index] - EPSILON, 'A nudge never snaps backwards to the old stopping margin');
        assert.ok(car.distance - initial[index] <= .65 + EPSILON, 'The whole manoeuvre remains within 65 centimetres');
        assert.ok(car.speed <= .7 + EPSILON, 'The red-light adjustment is slower than walking pace');
        if (car.distance > initial[index] + EPSILON && !started.has(car.id)) {
          assert.ok(witnessedWait, 'Cars respond only after the train has actually stopped inside the crossing');
          started.add(car.id);
        }
      }
    }
    assert.equal(started.size, count, 'Every first-row car needed to clear the train moves a small distance');
    for (const [index, car] of cars.entries()) assert.ok(car.distance - initial[index] >= .025, 'The fixture exercises a real visible adjustment');
    assert.equal(simulation.transitPassed, 1, 'The complete double-unit train passes before the cars ever receive green');
    assert.equal(simulation.vehicles.length, count, 'All cars still wait for their own green after making room');
  });
}

for (const direction of ['south', 'north']) for (const reason of ['second-row', 'long-van', 'no-tram', 'three-abreast', 'car-beside-van']) {
  test(`${direction}: no futile red-light nudge with ${reason}`, () => {
    const { simulation, cars } = fixture({ direction,
      secondRow: reason === 'second-row', kind: reason === 'long-van' ? 'van' : 'car',
      train: reason !== 'no-tram', count: reason === 'three-abreast' ? 3 : reason === 'car-beside-van' ? 2 : 1,
      secondKind: reason === 'car-beside-van' ? 'van' : reason === 'long-van' ? 'van' : 'car' });
    const initial = cars.map(car => car.distance);
    let sawWaitingTrain = false;
    for (let tick = 0; tick < 45 / STEP; tick++) {
      simulation.update(STEP);
      inspectSafety(simulation, cars);
      if (simulation.trams.some(tram => tram.committed && tram.speed < .12)) sawWaitingTrain = true;
      for (const [index, car] of cars.entries()) {
        assert.ok(Math.abs(car.distance - initial[index]) < EPSILON, 'An ineffective manoeuvre must not move even the front car');
      }
    }
    if (reason !== 'no-tram') assert.ok(sawWaitingTrain, 'The rejected manoeuvre is tested against a genuinely waiting train');
    assert.equal(simulation.transitPassed, 0);
  });
}

for (const direction of ['south', 'north']) {
  test(`${direction}: a car still far from the middle line follows ordinary red-light braking`, () => {
    // Establish an already stopped, admitted train using an ineligible van.
    // Replace the parked obstacle with a car farther behind the line; this
    // isolates the first seconds before that car reaches its ordinary stop.
    const waiting = fixture({ direction, kind: 'van' });
    waiting.simulation.update(15);
    const tram = waiting.simulation.trams[0];
    assert.ok(tram.committed && tram.speed < .1, 'The setup needs a physically waiting train');
    const withTrain = fixture({ direction, extraMargin: 1.2 });
    const withoutTrain = fixture({ direction, extraMargin: 1.2, train: false });
    const newRoute = withTrain.simulation.transitRoutes.find(route => route.id === tram.routeId);
    withTrain.simulation.trams = [{ ...tram, route: newRoute }];
    withTrain.simulation.elapsed = waiting.simulation.elapsed;
    withoutTrain.simulation.elapsed = waiting.simulation.elapsed;
    for (let tick = 0; tick < .8 / STEP; tick++) {
      withTrain.simulation.update(STEP);
      withoutTrain.simulation.update(STEP);
      inspectSafety(withTrain.simulation, withTrain.cars);
      const actual = withTrain.cars[0], ordinary = withoutTrain.cars[0];
      assert.ok(actual.route.stops[1].distance - actual.length / 2 - actual.distance > .9,
        'The comparison ends before the car reaches its normal stopping position');
      assert.ok(Math.abs(actual.distance - ordinary.distance) < EPSILON,
        'A distant car must not start the special clearing manoeuvre before reaching the red line');
      assert.ok(Math.abs(actual.speed - ordinary.speed) < EPSILON,
        'Ordinary approach braking remains unchanged while a small nudge could not clear the rails');
    }
  });
}
