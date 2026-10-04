import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import dortmund from './locations/dortmund.mjs';

const STEP = 1 / 30;
const EPSILON = 1e-7;

function fixture({ ids = ['tram-east', 'tram-west'], offset, station = true, timetable = false, longGreen = false } = {}) {
  const config = structuredClone(dortmund);
  config.density = 0; config.initialVehiclesPerLane = 0;
  config.transit.routes = config.transit.routes.filter(route => ids.includes(route.id));
  for (const route of config.transit.routes) {
    if (offset !== undefined) route.offset = offset;
    if (!station) delete route.stationStop;
    if (!timetable) delete route.schedule;
  }
  if (longGreen) config.phases[0].duration = 180;
  return config;
}

function snapshot(simulation) {
  return { status: simulation.getStatus(), due: [...simulation.nextTransitDue], passed: simulation.transitPassed,
    clock: simulation.getClockTime(), trams: simulation.trams.map(tram => ({ id: tram.id, routeId: tram.routeId,
      distance: tram.distance, speed: tram.speed, committed: tram.committed, scheduledAt: tram.scheduledAt,
      stationState: tram.stationState, stationRemaining: tram.stationRemaining })) };
}

function assertSignalSafety(simulation) {
  if (simulation.transitProtected) for (const group of dortmund.transit.blockedGroups) {
    assert.equal(simulation.getSignal(group), 'red', 'Both B1 left turns stay red throughout a booked phase');
  }
  for (const tram of simulation.trams) {
    if (!tram.committed) assert.ok(tram.distance + tram.length / 2 <= tram.route.stopDistance + EPSILON,
      `${tram.routeId} crossed its closed or not-yet-due signal`);
    else if (tram.distance - tram.length / 2 <= tram.route.clearDistance) {
      assert.ok(simulation.phases[simulation.phaseIndex].groups.includes('main'), 'A train rear still in the crossing prevents side release');
    }
  }
}

// Body rectangles are checked independently of the engine's lane and signal
// conflict predicates, so a wrong request/clearance decision cannot pass itself.
function overlaps(a, b) {
  const delta = [b.x - a.x, b.z - a.z];
  if (Math.hypot(...delta) > (a.length + b.length) / 2 + 3) return false;
  const frontA = [Math.sin(a.heading), Math.cos(a.heading)], sideA = [frontA[1], -frontA[0]];
  const frontB = [Math.sin(b.heading), Math.cos(b.heading)], sideB = [frontB[1], -frontB[0]];
  const width = body => body.routeId.startsWith('tram-') ? 2.5 : ({ car: 1.82, van: 2.05, bus: 2.5 })[body.kind];
  const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
  return [frontA, sideA, frontB, sideB].every(axis => {
    const extent = (body, front, side) => Math.abs(dot(axis, front)) * body.length / 2 + Math.abs(dot(axis, side)) * width(body) / 2;
    return Math.abs(dot(axis, delta)) < extent(a, frontA, sideA) + extent(b, frontB, sideB) - EPSILON;
  });
}

function trace(simulation, seconds, inspect = () => {}) {
  const trips = new Map();
  const record = () => {
    for (const tram of simulation.trams) {
      if (!trips.has(tram.id)) trips.set(tram.id, { routeId: tram.routeId, samples: [] });
      trips.get(tram.id).samples.push({ at: simulation.elapsed, x: tram.x, z: tram.z, distance: tram.distance,
        speed: tram.speed, state: tram.stationState, remaining: tram.stationRemaining, committed: tram.committed });
    }
  };
  record();
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
    simulation.update(STEP); assertSignalSafety(simulation); record(); inspect(simulation);
  }
  return trips;
}

function assertFullStop(trip, route) {
  const samples = trip.samples, dwell = samples.filter(sample => sample.state === 'dwelling');
  assert.ok(dwell.length > 0, `${route.id} never served its platform`);
  const arrival = dwell[0], departure = samples.find(sample => sample.at > arrival.at && sample.state === 'departed');
  assert.ok(departure, `${route.id} never finished its stop`);
  assert.ok(Math.abs(departure.at - arrival.at - 20) < STEP + EPSILON, 'The dwell state lasts twenty simulated seconds');
  const movement = samples.find(sample => sample.at > arrival.at && sample.distance > arrival.distance + EPSILON);
  assert.ok(movement && movement.at - arrival.at >= 20 - EPSILON, 'The actual body remains motionless for a full twenty seconds');
  assert.ok(movement.at - arrival.at <= 20 + 2 * STEP + EPSILON, 'An open track does not hold an already served train indefinitely');
  for (const sample of dwell) {
    assert.equal(sample.speed, 0);
    assert.ok(Math.hypot(sample.x - route.stationStop.point[0], sample.z - route.stationStop.point[1]) < EPSILON,
      'The configured station point describes the body center, not its front');
    assert.ok(sample.remaining >= 0 && sample.remaining <= 20);
  }
  let stops = 0;
  for (let index = 0; index < samples.length; index++) {
    const current = samples[index], previous = samples[index - 1];
    if (current.state === 'dwelling' && previous?.state !== 'dwelling') stops++;
    if (!previous) continue;
    assert.ok(current.distance >= previous.distance - EPSILON, 'A stopping train never snaps backwards');
    assert.ok(current.distance - previous.distance <= route.speed * STEP + EPSILON, 'No teleport occurs at arrival or departure');
    assert.ok(current.speed - previous.speed <= 1.1 * STEP + EPSILON, 'Departure accelerates smoothly');
    assert.ok(previous.speed - current.speed <= 1.8 * STEP + .002, 'Station braking never requires a final abrupt speed clamp');
    if (previous.state === 'departed') assert.equal(current.state, 'departed', 'A train must not repeat the same platform stop');
  }
  assert.equal(stops, 1);
}

test('Voßkuhle places both twenty-second stops within the platform, with the complete eastbound train clear of the crossing', () => {
  const simulation = new TrafficSimulation(fixture());
  const platform = dortmund.environment.station;
  for (const route of simulation.transitRoutes) {
    assert.equal(route.stationStop.dwell, 20);
    const x = route.stationStop.point[0];
    assert.ok(x - route.length / 2 >= platform.x - platform.length / 2);
    assert.ok(x + route.length / 2 <= platform.x + platform.length / 2);
    if (route.id === 'tram-west') assert.ok(route.stationStop.distance + route.length / 2 < route.stopDistance);
    else assert.ok(route.stationStop.distance - route.length / 2 > route.clearDistance);
  }
});

for (const id of ['tram-east', 'tram-west']) test(`${id}: one smooth approach, a physically stationary twenty-second stop, then departure`, () => {
  const simulation = new TrafficSimulation(fixture({ ids: [id], offset: 60, longGreen: true }));
  const trips = trace(simulation, 160);
  assert.equal(trips.size, 1);
  assertFullStop([...trips.values()][0], simulation.transitRoutes[0]);
  assert.equal(simulation.transitPassed, 1);
});

test('westbound platform arrival registers early enough to reserve the complete B1 phase before left turns open', () => {
  const simulation = new TrafficSimulation(fixture({ ids: ['tram-west'], offset: 40 }));
  assert.equal(simulation.transitProtected, true,
    'The stop during this phase must be announced even though scheduled signal passage is after its nominal end');
  let heldInFirstSlot = false, committedLater = false;
  trace(simulation, 140, current => {
    const tram = current.trams[0];
    if (current.phaseIndex === 0 && current.cycle === 1) {
      assert.equal(current.transitProtected, true);
      if (tram?.stationState === 'dwelling') heldInFirstSlot = true;
    }
    if (tram?.committed) committedLater = true;
  });
  assert.equal(heldInFirstSlot, true, 'The regression actually includes a westbound train dwelling during the initially booked slot');
  assert.equal(committedLater, true);
});

test('selecting the exact westbound timetable minute serves the whole stop before safely crossing a booked phase', () => {
  const startTime = Date.parse('2026-10-05T12:02:00+02:00');
  const simulation = new TrafficSimulation(fixture({ ids: ['tram-west'], timetable: true, longGreen: true }), { startTime });
  const initial = simulation.trams[0];
  assert.ok(initial); assert.equal(initial.scheduledAt, 0);
  assert.equal(initial.stationState, 'dwelling'); assert.equal(initial.stationRemaining, 20);
  assert.equal(initial.committed, false); assert.equal(simulation.transitProtected, true);
  const trips = trace(simulation, 100);
  assert.equal(trips.size, 1);
  const trip = [...trips.values()][0];
  assertFullStop(trip, simulation.transitRoutes[0]);
  assert.ok(trip.samples.find(sample => sample.committed).at > 20, 'A late-start train cannot skip its stop to meet the old ETA');
  assert.equal(simulation.nextTransitDue.get('tram-west'), 600);
});

test('westbound departure shortly after green protects actual B1 left-turn queues and keeps all bodies disjoint', () => {
  const simulation = new TrafficSimulation(fixture({ ids: ['tram-west'], offset: 0 }));
  for (const id of ['east-south', 'west-north']) {
    const route = simulation.routes.find(route => route.id === id);
    const vehicle = simulation.createVehicle(route, route.stopDistance - 5);
    simulation.vehicles.push(vehicle);
  }
  let crossed = false, laterCarsMoved = false;
  trace(simulation, 180, current => {
    const bodies = [...current.vehicles, ...current.trams];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      assert.equal(overlaps(bodies[i], bodies[j]), false,
        `${bodies[i].routeId}/${bodies[j].routeId} overlapped at ${current.elapsed.toFixed(2)} s`);
    }
    if (current.phaseIndex === 0 && current.cycle === 1) for (const vehicle of current.vehicles) {
      assert.equal(vehicle.passedGateIndex, -1, 'Queued B1 turners may not enter under the approaching train reservation');
    }
    if (current.trams.some(tram => tram.committed)) crossed = true;
    if (current.vehicles.some(vehicle => vehicle.passedGateIndex >= 0)) laterCarsMoved = true;
  });
  assert.ok(crossed && laterCarsMoved, 'The test exercises a train crossing and later releases the waiting cars');
});

test('an unexpected westbound request never retrospectively books an open left-turn phase', () => {
  const simulation = new TrafficSimulation(fixture({ ids: ['tram-west'], offset: 500 }));
  assert.equal(simulation.transitProtected, false);
  simulation.nextTransitDue.set('tram-west', 0);
  let sawDwell = false, sawUnprotectedLeftGreen = false, crossedInLaterSlot = false;
  trace(simulation, 150, current => {
    const tram = current.trams[0];
    if (current.phaseIndex === 0 && current.cycle === 1) {
      assert.equal(current.transitProtected, false);
      assert.equal(current.getTransitSignal('tram-west'), 'red');
      if (tram) assert.equal(tram.committed, false);
      if (tram?.stationState === 'dwelling') sawDwell = true;
      if (current.getSignal('mainLeftSouth') === 'green') sawUnprotectedLeftGreen = true;
    }
    if (tram?.committed) { crossedInLaterSlot = true; assert.equal(current.transitProtected, true); }
  });
  assert.ok(sawDwell && sawUnprotectedLeftGreen && crossedInLaterSlot);
});

test('manually ending a booked phase while a westbound tram dwells postpones its crossing without dropping the request', () => {
  const simulation = new TrafficSimulation(fixture({ ids: ['tram-west'], offset: 0 }));
  simulation.update(2); simulation.requestNextPhase();
  let sawSide = false, sawLaterPassage = false;
  trace(simulation, 150, current => {
    const tram = current.trams[0];
    if (current.phaseIndex === 1) { sawSide = true; if (tram) assert.equal(tram.committed, false); }
    if (tram?.committed) { sawLaterPassage = true; assert.equal(current.transitProtected, true); }
  });
  assert.ok(sawSide && sawLaterPassage);
  assert.equal(simulation.transitPassed, 1);
});

test('eastbound dwell after rear clearance causes neither a longer phase nor an additional booked phase', () => {
  const stopping = new TrafficSimulation(fixture({ ids: ['tram-east'], offset: 5 }));
  const through = new TrafficSimulation(fixture({ ids: ['tram-east'], offset: 5, station: false }));
  let sawDwell = false, sideGreenDuringDwell = false;
  const protectedSlots = new Set();
  for (let tick = 0; tick < 160 / STEP; tick++) {
    stopping.update(STEP); through.update(STEP);
    assertSignalSafety(stopping);
    assert.deepEqual([stopping.phaseIndex, stopping.stage, stopping.stageElapsed, stopping.transitProtected],
      [through.phaseIndex, through.stage, through.stageElapsed, through.transitProtected],
      `Serving the already-cleared east platform altered signal timing at ${stopping.elapsed.toFixed(2)} s`);
    if (stopping.transitProtected) protectedSlots.add(stopping.phaseSerial);
    const tram = stopping.trams[0];
    if (tram?.stationState === 'dwelling') {
      sawDwell = true;
      assert.ok(tram.distance - tram.length / 2 > tram.route.clearDistance);
      if (stopping.getSignal('north') === 'green') sideGreenDuringDwell = true;
    }
  }
  assert.ok(sawDwell && sideGreenDuringDwell, 'Side traffic must actually run while the eastbound train boards passengers');
  assert.equal(protectedSlots.size, 1, 'A committed train at its outbound station cannot reserve another B1 slot');
});

test('station timers pause, reset cleanly and produce identical states across update subdivisions', () => {
  const config = fixture({ offset: 0 });
  const whole = new TrafficSimulation(config), sliced = new TrafficSimulation(config);
  const initial = snapshot(whole);
  whole.update(12);
  const paused = snapshot(whole);
  for (let index = 0; index < 100; index++) { whole.update(0); whole.update(NaN); whole.update(-1); }
  assert.deepEqual(snapshot(whole), paused);
  whole.reset(); assert.deepEqual(snapshot(whole), initial);
  whole.update(45);
  for (let frame = 0; frame < 2700; frame++) sliced.update(1 / 60);
  assert.deepEqual(snapshot(whole), snapshot(sliced));
  whole.reset(); assert.deepEqual(snapshot(whole), initial);
});

test('Sunday service retains twenty-minute departures and night closure does not create station requests', () => {
  const config = fixture({ timetable: true });
  const sunday = new TrafficSimulation(config, { startTime: Date.parse('2026-10-04T12:01:59+02:00') });
  assert.equal(sunday.trams[0].routeId, 'tram-west');
  assert.equal(sunday.trams[0].scheduledAt, 1);
  const trips = trace(sunday, 180);
  assert.equal(trips.size, 1);
  assertFullStop([...trips.values()][0], sunday.transitRoutes.find(route => route.id === 'tram-west'));
  assert.equal(sunday.nextTransitDue.get('tram-west'), 1201);
  const night = Date.parse('2026-10-05T01:30:00+02:00');
  sunday.setClockTime(night); sunday.update(900);
  assert.equal(sunday.trams.length, 0); assert.equal(sunday.nextTramId, 1);
  assert.equal(sunday.transitProtected, false);
  assert.ok([...sunday.nextTransitDue.values()].every(due => due > 3 * 3600));
});

test('routes without a station retain legacy relative scheduling and do not acquire station state', () => {
  const simulation = new TrafficSimulation(fixture({ station: false }));
  trace(simulation, 1300, current => {
    for (const tram of current.trams) assert.equal(tram.stationState, undefined);
  });
  assert.ok(simulation.transitPassed >= 4);
  assert.deepEqual([...simulation.nextTransitDue.values()], [1875, 1899]);
});
