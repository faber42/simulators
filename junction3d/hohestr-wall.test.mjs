import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation, samplePath } from './engine.mjs';
import { buildSignalLayout } from './scene.mjs';
import location from './locations/hohestr-wall.mjs';

const STEP = 1 / 30;
const WIDTHS = { car: 1.82, van: 2.05, bus: 2.5 };
const LENGTHS = { car: 4.5, van: 5.4, bus: 11.5 };
const phaseMovements = [
  { incoming: ['east', 'west'], turns: ['straight', 'right'] },
  { incoming: ['east', 'west'], turns: ['left'] },
  { incoming: ['north', 'south'], turns: ['straight', 'right'] },
  { incoming: ['north', 'south'], turns: ['left'] },
];

function quietConfig() {
  const config = structuredClone(location);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.routes.forEach(route => { route.rate = 0; });
  return config;
}

function addQueue(simulation, routes, count) {
  const groups = new Map();
  for (const route of routes) {
    if (!groups.has(route.laneId)) groups.set(route.laneId, []);
    groups.get(route.laneId).push(route);
  }
  const vehicles = [];
  for (const lane of groups.values()) {
    let offset = .85;
    for (let index = 0; index < count; index++) {
      const route = lane[index % lane.length];
      const kind = index % 2 === 0 && route.vehicleKinds.includes('van') ? 'van' : 'car';
      const vehicle = simulation.createVehicle(route, route.stopDistance - offset - LENGTHS[kind] / 2);
      vehicle.kind = kind; vehicle.length = LENGTHS[kind]; vehicle.speed = 0;
      Object.assign(vehicle, samplePath(route.path, vehicle.distance));
      simulation.vehicles.push(vehicle); vehicles.push(vehicle);
      offset += vehicle.length + 2.8;
    }
  }
  return vehicles;
}

// Independent world-space OBBs, not the engine's route/headway relationships.
// Sixteen-metre cells cover the largest supported body pair with neighbouring
// cells and avoid an all-vehicles quadratic scan in the long traffic audits.
function body(vehicle) {
  const forward = [Math.sin(vehicle.heading), Math.cos(vehicle.heading)];
  return { vehicle, forward, right: [forward[1], -forward[0]] };
}

function overlap(a, b) {
  const dx = b.vehicle.x - a.vehicle.x, dz = b.vehicle.z - a.vehicle.z;
  if (Math.hypot(dx, dz) > (a.vehicle.length + b.vehicle.length) / 2 + 3) return false;
  return [a.forward, a.right, b.forward, b.right].every(axis => {
    const extent = item => Math.abs(item.forward[0] * axis[0] + item.forward[1] * axis[1]) * item.vehicle.length / 2
      + Math.abs(item.right[0] * axis[0] + item.right[1] * axis[1]) * WIDTHS[item.vehicle.kind] / 2;
    return Math.abs(dx * axis[0] + dz * axis[1]) < extent(a) + extent(b) - 1e-7;
  });
}

function assertSafe(simulation) {
  const cells = new Map();
  for (const vehicle of simulation.vehicles) {
    assert.ok(['distance', 'speed', 'x', 'z', 'heading'].every(key => Number.isFinite(vehicle[key])));
    assert.ok(vehicle.speed >= 0);
    const stop = vehicle.route.stops[vehicle.passedGateIndex + 1];
    if (stop && simulation.getSignal(stop.group) !== 'green') assert.ok(
      vehicle.distance + vehicle.length / 2 <= stop.distance + 1e-7,
      `${vehicle.routeId} crossed closed ${stop.id} at ${simulation.elapsed.toFixed(2)} s`);
    const current = body(vehicle), cx = Math.floor(vehicle.x / 16), cz = Math.floor(vehicle.z / 16);
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (const other of cells.get(`${x}/${z}`) || []) assert.equal(overlap(current, other), false,
        `${vehicle.routeId}/${other.vehicle.routeId} body overlap at ${simulation.elapsed.toFixed(2)} s`);
    }
    const key = `${cx}/${cz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(current);
  }
}

function assertClearedOnChange(simulation, previousSerial) {
  if (simulation.phaseSerial === previousSerial) return;
  for (const vehicle of simulation.vehicles) if (vehicle.passedGateIndex >= 0) assert.ok(
    vehicle.distance - vehicle.length / 2 > vehicle.route.clearDistance,
    `Next phase opened before ${vehicle.routeId}'s rear cleared the junction`);
}

test('Hohe Straße am Wall has four protected movement phases and the requested external left lanes', () => {
  const simulation = new TrafficSimulation(quietConfig());
  assert.equal(simulation.phases.length, 4);
  for (const [index, expected] of phaseMovements.entries()) {
    simulation.phaseIndex = index; simulation.stage = 'green'; simulation.stageElapsed = 0;
    const allowed = simulation.routes.filter(route => expected.incoming.includes(route.incoming) && expected.turns.includes(route.turn));
    assert.ok(allowed.length, `Phase ${index + 1} needs traffic`);
    assert.deepEqual(new Set(simulation.phases[index].groups), new Set(allowed.map(route => route.group)));
    for (const route of simulation.routes) assert.equal(simulation.getSignal(route.group), allowed.includes(route) ? 'green' : 'red',
      `${route.id} must follow the specified phase sequence without delayed sub-phases`);
  }
  for (const [incoming, expected] of Object.entries({ north: 2, east: 2, south: 2, west: 1 })) {
    const lefts = simulation.routes.filter(route => route.incoming === incoming && route.turn === 'left');
    assert.equal(new Set(lefts.map(route => route.laneId)).size, expected, `${incoming} left-turn lane count`);
  }
  for (const route of simulation.routes) {
    assert.equal(route.stops.length, 1, `${route.id} has only its external signal`);
    assert.ok(route.stops.every(stop => !stop.inner && !stop.storage && !stop.yieldApproach));
  }
  const layout = buildSignalLayout(location);
  assert.ok(layout.stops.every(stop => !stop.inner));
  const mounted = location.signalGantries.flatMap(gantry => gantry.stopIds);
  assert.equal(new Set(mounted).size, mounted.length, 'Each physical head belongs to one gantry');
  assert.deepEqual(new Set(mounted), new Set(layout.stops.map(stop => stop.id)));
  assert.equal(simulation.transitRoutes.length, 0);
  assert.ok(!location.environment.rails && !location.environment.station);
  assert.equal((location.islands || []).length, 0, 'The centre is a continuous junction, without a holding island');
  assert.equal(location.minimumArrivals.length, 4);
  for (const incoming of ['west', 'east', 'north', 'south']) {
    const routes = location.routes.filter(route => route.incoming === incoming);
    const group = location.minimumArrivals.find(item => item.routeIds.includes(routes[0].id));
    assert.equal(group?.interval, 120, `${incoming} needs its two-minute minimum arrival`);
    assert.deepEqual(new Set(group.routeIds), new Set(routes.map(route => route.id)),
      'Minimum traffic belongs to incoming directions, including their right turns');
  }
});

test('the four real phases recur in order with all-red clearance between movements', () => {
  const simulation = new TrafficSimulation(quietConfig());
  const order = [0], groups = new Set(simulation.phases.flatMap(phase => phase.groups));
  let lastSerial = simulation.phaseSerial;
  for (let tick = 0; tick < 300 / STEP && order.length < 9; tick++) {
    simulation.update(STEP);
    if (simulation.stage === 'clearance') for (const group of groups) assert.equal(simulation.getSignal(group), 'red');
    if (simulation.phaseSerial !== lastSerial) { order.push(simulation.phaseIndex); lastSerial = simulation.phaseSerial; }
  }
  assert.deepEqual(order, [0, 1, 2, 3, 0, 1, 2, 3, 0]);
});

for (const phaseIndex of [1, 3]) test(`opposing left phase ${phaseIndex + 1} admits both directions together and keeps parallel turning bodies apart`, t => {
  const config = quietConfig(); config.phases[phaseIndex].duration = 75;
  const simulation = new TrafficSimulation(config);
  simulation.phaseIndex = phaseIndex;
  const expected = phaseMovements[phaseIndex].incoming;
  const routes = simulation.routes.filter(route => route.turn === 'left' && expected.includes(route.incoming));
  const cars = addQueue(simulation, routes, 4);
  const entered = new Map(), departed = new Set();
  let simultaneousInside = false;
  for (let tick = 0; tick < 70 / STEP; tick++) {
    simulation.update(STEP); assertSafe(simulation);
    for (const vehicle of cars) {
      if (vehicle.passedGateIndex >= 0 && !entered.has(vehicle.routeId)) entered.set(vehicle.routeId, simulation.elapsed);
      if (vehicle.distance - vehicle.length / 2 > vehicle.route.clearDistance) departed.add(vehicle.id);
    }
    const inside = new Set(cars.filter(vehicle => vehicle.passedGateIndex >= 0 &&
      vehicle.distance - vehicle.length / 2 <= vehicle.route.clearDistance).map(vehicle => vehicle.route.incoming));
    simultaneousInside ||= expected.every(incoming => inside.has(incoming));
    if (departed.size === cars.length) break;
  }
  assert.equal(entered.size, routes.length, 'Every configured left lane actually enters');
  assert.ok(Math.max(...entered.values()) - Math.min(...entered.values()) < .2,
    'Opposing lanes must enter together, not use hidden alternating left phases');
  assert.ok(simultaneousInside, 'Both opposing directions must occupy their separate turning paths at the same time');
  assert.equal(departed.size, cars.length, 'Free opposing left turns must clear without waiting for the other direction');
  t.diagnostic(`${cars.length} cars/vans cleared concurrently offered left lanes in ${simulation.elapsed.toFixed(1)} s`);
});

test('manually shortened greens wait for admitted rears before the next movement opens', () => {
  const simulation = new TrafficSimulation(quietConfig());
  addQueue(simulation, simulation.routes, 5);
  const ended = new Set(), order = [0];
  for (let tick = 0; tick < 300 / STEP && order.length < 9; tick++) {
    if (ended.size < 8 && simulation.stage === 'green' && simulation.stageElapsed >= 3 && !ended.has(simulation.phaseSerial)) {
      assert.ok(simulation.vehicles.some(vehicle => vehicle.passedGateIndex >= 0 &&
        simulation.phases[simulation.phaseIndex].groups.includes(vehicle.route.group)
        && vehicle.distance - vehicle.length / 2 <= vehicle.route.clearDistance),
      'Each manual end must really interrupt admitted crossing traffic');
      ended.add(simulation.phaseSerial); simulation.requestNextPhase();
    }
    const previousSerial = simulation.phaseSerial;
    simulation.update(STEP); assertSafe(simulation); assertClearedOnChange(simulation, previousSerial);
    if (simulation.phaseSerial !== previousSerial) order.push(simulation.phaseIndex);
  }
  assert.ok(ended.size >= 8, 'Every movement must survive repeated manual endings');
  assert.deepEqual(order, [0, 1, 2, 3, 0, 1, 2, 3, 0]);
  assert.ok(simulation.passed > 0);
});

test('turns merging into occupied exit lanes keep a real bumper gap behind the preceding flow', t => {
  const exits = new Map();
  for (const route of location.routes) {
    if (!exits.has(route.exitId)) exits.set(route.exitId, []);
    exits.get(route.exitId).push(route);
  }
  let checked = 0;
  const destinations = new Set();
  for (const [exitId, members] of exits) {
    const leaderConfig = members.find(route => route.turn === 'straight');
    if (!leaderConfig) continue;
    for (const followerConfig of members.filter(route => route.laneId !== leaderConfig.laneId)) {
      assert.deepEqual(followerConfig.points.at(-1), leaderConfig.points.at(-1), `${exitId} must have one common endpoint`);
      const config = quietConfig();
      config.phases.forEach(phase => { phase.duration = 90; });
      const simulation = new TrafficSimulation(config);
      const leaderRoute = simulation.routes.find(route => route.id === leaderConfig.id);
      const followerRoute = simulation.routes.find(route => route.id === followerConfig.id);
      simulation.phaseIndex = simulation.phases.findIndex(phase => phase.groups.includes(followerRoute.group));
      const distance = Math.min(leaderRoute.length - 30, Math.max(leaderRoute.mergeDistance + 12, leaderRoute.clearDistance + 8));
      const leader = simulation.createVehicle(leaderRoute, distance);
      leader.kind = 'van'; leader.length = LENGTHS.van; leader.speed = .25;
      leaderRoute.speed = .25; leader.passedGateIndex = 0;
      simulation.vehicles.push(leader);
      assert.ok(leader.distance - leader.length / 2 > leaderRoute.clearDistance,
        'The preceding flow must be safely outside the signal conflict area');
      const [follower] = addQueue(simulation, [followerRoute], 1);
      for (let tick = 0; tick < 40 / STEP; tick++) { simulation.update(STEP); assertSafe(simulation); }
      assert.ok(follower.passedGateIndex >= 0 && follower.distance > followerRoute.mergeDistance,
        `${follower.routeId} must enter the shared exit, not simply wait at its green signal`);
      assert.ok(follower.speed < .6, `${follower.routeId} must adapt to the slow exit queue`);
      const laneDistance = (followerRoute.length - follower.distance) - (leaderRoute.length - leader.distance);
      assert.ok(laneDistance >= (leader.length + follower.length) / 2 + 2.19,
        `${follower.routeId}/${leader.routeId} lost the common-exit bumper gap`);
      destinations.add(exitId); checked++;
    }
  }
  assert.ok(destinations.size >= 4 && checked >= 4, 'The fixture must exercise merging across all four outgoing directions');
  t.diagnostic(`${checked} turning/preceding-flow combinations on ${destinations.size} shared exit lanes`);
});

for (const scenario of [
  { name: 'normal traffic', density: .8, initialVehiclesPerLane: 3, seconds: 360 },
  { name: 'high traffic', density: 1.65, initialVehiclesPerLane: 6, seconds: 600 },
]) test(`Hohe Straße am Wall ${scenario.name} preserves every movement and shared exits`, t => {
  const simulation = new TrafficSimulation({ ...location, density: scenario.density,
    initialVehiclesPerLane: scenario.initialVehiclesPerLane });
  const passed = new Map(simulation.routes.map(route => [route.id, 0]));
  let previous = new Map(simulation.vehicles.map(vehicle => [vehicle.id, vehicle]));
  for (let tick = 0; tick < scenario.seconds / STEP; tick++) {
    const previousSerial = simulation.phaseSerial;
    simulation.update(STEP); assertClearedOnChange(simulation, previousSerial);
    const current = new Map(simulation.vehicles.map(vehicle => [vehicle.id, vehicle]));
    for (const [id, vehicle] of previous) if (!current.has(id)) passed.set(vehicle.routeId, passed.get(vehicle.routeId) + 1);
    previous = current;
    if (tick % 5 === 0) assertSafe(simulation);
  }
  for (const [id, count] of passed) assert.ok(count >= 1, `${id} never completed a journey`);
  assert.ok(simulation.passed > scenario.seconds * .25, 'Signals must preserve useful flow');
  assert.ok(simulation.cycle >= Math.floor(scenario.seconds / 180), 'No protected movement may deadlock later phases');
  assert.equal(simulation.trams.length, 0);
  t.diagnostic(`${simulation.passed} passed, ${simulation.cycle} cycles, ${simulation.vehicles.length} still in scene`);
});
