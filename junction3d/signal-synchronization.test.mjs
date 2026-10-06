import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';
import opphoff from './locations/opphoff.mjs';

const STEP = 1 / 30;
const pairs = [['north', 'middleSouth'], ['south', 'middleNorth']];

function quietConfig(location = dortmund) {
  const config = structuredClone(location);
  config.density = 0;
  config.initialVehiclesPerLane = 0;
  for (const route of config.routes) { route.rate = 0; route.vehicleKinds = ['car']; }
  delete config.transit;
  return config;
}

function assertSynchronized(simulation) {
  for (const [outer, inner] of pairs) assert.equal(simulation.getSignal(inner), simulation.getSignal(outer),
    `${inner}/${outer} disagree during ${simulation.phases[simulation.phaseIndex].id}/${simulation.stage}`);
  assert.ok(!['drain', 'drainYellow'].includes(simulation.stage), 'Voßkuhle must not insert an inner-only green or yellow extension');
}

test('Voßkuhle switches inner and outer signals together in every stage and has a 136-second empty cycle', () => {
  const simulation = new TrafficSimulation(quietConfig());
  const observed = pairs.map(() => new Set());
  const phaseOrder = [simulation.phases[simulation.phaseIndex].id];
  let previousSerial = simulation.phaseSerial;
  for (let tick = 0; tick < 140 / STEP; tick++) {
    simulation.update(STEP);
    assertSynchronized(simulation);
    pairs.forEach(([outer], index) => observed[index].add(simulation.getSignal(outer)));
    if (simulation.phaseSerial !== previousSerial) {
      phaseOrder.push(simulation.phases[simulation.phaseIndex].id);
      previousSerial = simulation.phaseSerial;
    }
    if (simulation.phaseSerial === 4 && simulation.stage === 'green') break;
  }
  assert.equal(simulation.phaseSerial, 4);
  assert.equal(simulation.stage, 'green');
  assert.ok(Math.abs(simulation.elapsed - 136) < 1e-7, `Unexpected cycle duration: ${simulation.elapsed}`);
  assert.deepEqual(phaseOrder, ['main-a', 'north', 'main-b', 'south', 'main-a']);
  for (const signals of observed) assert.deepEqual([...signals].sort(), ['green', 'red', 'redAmber', 'yellow']);
});

for (const scenario of [
  { name: 'southbound', route: 'east-south', phase: 1 },
  { name: 'northbound', route: 'west-north', phase: 3 },
]) test(`Voßkuhle ${scenario.name}: a median car waits through inner red and resumes at its next matching green`, () => {
  const simulation = new TrafficSimulation(quietConfig());
  simulation.phaseIndex = scenario.phase;
  simulation.phaseSerial = scenario.phase;
  simulation.stageElapsed = simulation.phases[scenario.phase].duration - STEP;
  const route = simulation.routes.find(route => route.id === scenario.route);
  const vehicle = simulation.createVehicle(route, route.stops[1].distance - 3.05);
  vehicle.speed = 0;
  vehicle.passedGateIndex = 0;
  vehicle.committedStops = [];
  vehicle.reservations = [{ id: route.stops[0].storage.id, releaseDistance: route.stops[1].distance }];
  Object.assign(vehicle, samplePath(route.path, vehicle.distance));
  simulation.vehicles.push(vehicle);
  const position = vehicle.distance, firstSerial = simulation.phaseSerial;
  let sawRed = false, sawOtherPhase = false;
  for (let tick = 0; tick < 150 / STEP && vehicle.passedGateIndex === 0; tick++) {
    simulation.update(STEP);
    assertSynchronized(simulation);
    const signal = simulation.getSignal(route.stops[1].group);
    sawRed ||= signal === 'red';
    sawOtherPhase ||= simulation.phaseSerial > firstSerial && simulation.phaseIndex !== scenario.phase;
    if (simulation.phaseSerial < firstSerial + 4) {
      assert.equal(vehicle.passedGateIndex, 0, 'The median car must not run the synchronized red');
      assert.ok(Math.abs(vehicle.distance - position) < 1e-7, 'No hidden drain may move a car waiting at the inner stop');
    }
    if (vehicle.passedGateIndex === 1) assert.equal(signal, 'green');
  }
  assert.ok(sawRed && sawOtherPhase, 'Other phases must run while the median car remains waiting');
  assert.equal(vehicle.passedGateIndex, 1, 'The next matching side phase must release the waiting median car');
  assert.equal(simulation.phaseSerial, firstSerial + 4);
});

test('Opphoff retains its separately configured inner-green drain', () => {
  const simulation = new TrafficSimulation(quietConfig(opphoff));
  const phase = simulation.phases[0], inner = phase.drainGroups[0];
  const outer = phase.groups.find(group => !phase.drainGroups.includes(group));
  simulation.stageElapsed = phase.duration - STEP;
  simulation.update(STEP);
  assert.equal(simulation.getSignal(outer), 'yellow');
  assert.equal(simulation.getSignal(inner), 'green');
  for (let tick = 0; tick < simulation.timing.yellow / STEP; tick++) simulation.update(STEP);
  assert.equal(simulation.stage, 'drain');
  assert.equal(simulation.getSignal(inner), 'green');
  assert.equal(simulation.getSignal(outer), 'red');
});
