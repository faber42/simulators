import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficSimulation } from './engine.mjs';
import { buildSignalLayout } from './scene.mjs';

const bodyWidths = { car: 1.82, van: 2.05, bus: 2.5 };

// Independent world-space separating-axis check, including corner/tail sweep.
function bodiesOverlap(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > (a.length + b.length) / 2 + 3) return false;
  const forwardA = [Math.sin(a.heading), Math.cos(a.heading)], rightA = [forwardA[1], -forwardA[0]];
  const forwardB = [Math.sin(b.heading), Math.cos(b.heading)], rightB = [forwardB[1], -forwardB[0]];
  return [forwardA, rightA, forwardB, rightB].every(axis => {
    const dot = vector => Math.abs(vector[0] * axis[0] + vector[1] * axis[1]);
    const extentA = dot(forwardA) * a.length / 2 + dot(rightA) * bodyWidths[a.kind] / 2;
    const extentB = dot(forwardB) * b.length / 2 + dot(rightB) * bodyWidths[b.kind] / 2;
    return Math.abs(dx * axis[0] + dz * axis[1]) < extentA + extentB;
  });
}

// A seven-car median feeding a two-car perpendicular median legitimately
// needs several ordinary cycles. Audit each COMPLETE offered green instead
// of assuming every admitted body leaves within a fixed wall-clock limit.
// At least one predecessor must pass on each offered green; a vehicle's own
// deadline is therefore its initial queue position in full green offers.
function gateProgressAudit(simulation) {
  const budgets = new Map();
  let offers = [], checked = 0;
  return () => {
    for (const { vehicle, gateIndex, gateId, ahead } of offers) {
      checked++;
      if (vehicle.passedGateIndex >= gateIndex) { budgets.delete(vehicle.id); continue; }
      const passedAhead = ahead.filter(other => other.passedGateIndex >=
        other.route.stops.findIndex(stop => stop.id === gateId));
      assert.ok(passedAhead.length > 0,
        `${vehicle.routeId} #${vehicle.id} neither passed ${gateId} nor lost a predecessor during a complete offered green`);
      const budget = budgets.get(vehicle.id);
      budget.remaining--;
      assert.ok(budget.remaining > 0,
        `${vehicle.routeId} #${vehicle.id} exceeded its FIFO queue-position deadline of ${budget.initial} full greens at ${gateId}`);
    }
    offers = [];
    const phase = simulation.phases[simulation.phaseIndex];
    for (const vehicle of simulation.vehicles) {
      const gateIndex = vehicle.passedGateIndex + 1, next = vehicle.route.stops[gateIndex];
      if (vehicle.passedGateIndex < 0 || !next || !phase.groups.includes(next.group)) continue;
      const remaining = next.distance - vehicle.distance;
      const ahead = simulation.vehicles.filter(other => {
        if (other === vehicle || other.passedGateIndex < 0) return false;
        const otherNext = other.route.stops[other.passedGateIndex + 1];
        return otherNext?.id === next.id && otherNext.distance - other.distance < remaining;
      });
      if (!budgets.has(vehicle.id)) budgets.set(vehicle.id, { initial: ahead.length + 1, remaining: ahead.length + 1 });
      offers.push({ vehicle, gateIndex, gateId: next.id, ahead });
    }
    return checked;
  };
}

test('three-stage left turns can wait safely at their own middle signal when the destination median is full', () => {
  const simulation = new TrafficSimulation({
    seed: 42, density: 0, initialVehiclesPerLane: 0,
    timing: { yellow: .3, allRed: .3, redAmber: .2 },
    phases: [
      { groups: ['outer-a', 'middle-a'], drainGroups: ['middle-a'], duration: 60 },
      { groups: ['middle-b'], drainGroups: ['middle-b'], duration: 30 },
    ],
    routes: [{ id: 'three-stage-left', group: 'outer-a', points: [[0, -150], [0, 200]],
      rate: 0, speed: 8, vehicleKinds: ['car'], stops: [
        { id: 'outer', group: 'outer-a', point: [0, -60], clearPoint: [0, -42], storage: { id: 'own-median', capacity: 2 } },
        { id: 'own-middle', group: 'middle-a', point: [0, -20], clearPoint: [0, 0], storage: { id: 'destination-median', capacity: 2 } },
        { id: 'destination-middle', group: 'middle-b', point: [0, 35], clearPoint: [0, 75] },
      ] }],
  });
  const route = simulation.routes[0];
  for (let index = 0; index < 6; index++) simulation.vehicles.push(simulation.createVehicle(route, route.stopDistance - 10 - index * 13));
  let sawBlockedOwnMedian = false, sawNextAxis = false;
  for (let tick = 0; tick < 360 * 30; tick++) {
    const previousPhase = simulation.phaseIndex;
    simulation.update(1 / 30);
    if (previousPhase === 0 && simulation.phaseIndex === 1) for (const vehicle of simulation.vehicles) {
      if (vehicle.passedGateIndex === 0 || vehicle.passedGateIndex === 1) {
        assert.ok(vehicle.distance - vehicle.length / 2 > route.stops[vehicle.passedGateIndex].clearDistance,
          'Storage saturation may not release conflicting traffic before every admitted rear reaches safe holding');
      }
    }
    const occupied = new Map();
    for (const vehicle of simulation.vehicles) for (const reservation of vehicle.reservations) {
      occupied.set(reservation.id, (occupied.get(reservation.id) ?? 0) + 1);
    }
    for (const count of occupied.values()) assert.ok(count <= 2);
    if (occupied.get('destination-median') === 2 && simulation.vehicles.some(vehicle =>
      vehicle.passedGateIndex === 0 && vehicle.speed < .1 && vehicle.distance - vehicle.length / 2 > route.stops[0].clearDistance)) {
      sawBlockedOwnMedian = true;
    }
    if (simulation.phaseIndex === 1) sawNextAxis = true;
    for (let index = 1; index < simulation.vehicles.length; index++) {
      const front = simulation.vehicles[index - 1], rear = simulation.vehicles[index];
      assert.ok(front.distance - rear.distance >= (front.length + rear.length) / 2 + 2.19);
    }
  }
  assert.ok(sawBlockedOwnMedian, 'The regression must fill the destination and leave a safe queue at the preceding middle signal');
  assert.ok(sawNextAxis, 'A full receiving median must not keep the outgoing phase in drain forever');
  assert.equal(simulation.passed, 6, 'All queued cars should progress over subsequent ordinary cycles');
  assert.ok(simulation.cycle >= 3);
});

test('Opphoff has eleven complete signal sites, four synchronized outer/middle pairs and three controlled bypasses', async () => {
  const { default: opphoff } = await import('./locations/opphoff.mjs');
  const simulation = new TrafficSimulation(opphoff);
  const layout = buildSignalLayout(opphoff);
  assert.equal(layout.clusters.length, 11);
  assert.equal(opphoff.signalGantries.length, 11, 'Every requested site is intentionally positioned');
  const assignments = new Map();
  for (const gantry of opphoff.signalGantries) {
    assert.ok(gantry.stopIds.length > 0);
    for (const id of gantry.stopIds) {
      assert.ok(layout.stops.some(stop => stop.id === id), `Gantry ${gantry.id} references missing stop ${id}`);
      assignments.set(id, (assignments.get(id) ?? 0) + 1);
    }
  }
  for (const stop of layout.stops) assert.equal(assignments.get(stop.id), 1, `Stop ${stop.id} needs exactly one mast site`);
  assert.equal(layout.clusters.filter(cluster => cluster.inner).length, 4);
  const lefts = simulation.routes.filter(route => route.turn === 'left');
  assert.equal(new Set(lefts.map(route => route.laneId)).size, 4,
    'Four physical left approaches may offer alternative receiving lanes');
  const pairs = new Set();
  for (const route of lefts) {
    assert.equal(route.stops.length, 3, 'A left turn passes its own outer and middle gate before the perpendicular middle gate');
    const [outer, middle, destination] = route.stops;
    pairs.add(`${outer.group}/${middle.group}`);
    const phase = simulation.phases.find(candidate => candidate.groups.includes(outer.group));
    assert.ok(phase.groups.includes(middle.group));
    assert.ok(!phase.groups.includes(destination.group), 'The left turn waits before crossing the opposing carriageway');
    assert.equal(phase.groupDelays?.[outer.group] ?? 0, 0);
    assert.equal(phase.groupDelays?.[middle.group] ?? 0, 0);
    assert.ok(phase.drainGroups.includes(middle.group));
    assert.ok(simulation.phases.some(candidate => candidate.groups.includes(destination.group)));
  }
  assert.equal(pairs.size, 4);
  assert.equal(simulation.phases.length, 2, 'Both axes recur on every ordinary cycle');
  const bypasses = simulation.routes.filter(route => route.turn === 'right');
  assert.equal(bypasses.length, 3);
  for (const route of bypasses) {
    assert.equal(route.stops.length, 1);
    assert.ok(simulation.phases.some(phase => phase.groups.includes(route.stops[0].group)), 'Every bypass signal receives a real green phase');
  }
  assert.equal(simulation.transitRoutes.length, 0);
  assert.deepEqual(simulation.getStatus().transit, { protected: false, active: 0, passed: 0, nextArrivals: [] });
});

for (const scenario of [
  { name: 'normal traffic', density: .8, initialVehiclesPerLane: 3, duration: 600 },
  { name: 'rush hour', density: 1.65, initialVehiclesPerLane: 6, duration: 1200 },
]) test(`Opphoff ${scenario.name} keeps every movement flowing with safe middle queues`, async t => {
  const { default: opphoff } = await import('./locations/opphoff.mjs');
  const simulation = new TrafficSimulation({ ...opphoff, density: scenario.density, initialVehiclesPerLane: scenario.initialVehiclesPerLane },
    { startTime: Date.parse('2026-10-05T06:00:00Z') });
  const capacities = new Map(simulation.routes.flatMap(route => route.stops.filter(stop => stop.storage).map(stop => [stop.storage.id, stop.storage.capacity])));
  const counts = new Map(simulation.routes.map(route => [route.id, 0]));
  const enteredAt = new Map();
  const stagedDirections = new Set();
  const checkGateProgress = gateProgressAudit(simulation);
  let checkedGreenOffers = checkGateProgress();
  let longestMiddleStay = 0;
  let previous = new Map(simulation.vehicles.map(vehicle => [vehicle.id, vehicle]));
  for (let tick = 0; tick < scenario.duration * 30; tick++) {
    const previousSerial = simulation.phaseSerial;
    simulation.update(1 / 30);
    if (simulation.phaseSerial !== previousSerial) checkedGreenOffers = checkGateProgress();
    if (simulation.phaseSerial !== previousSerial) for (const vehicle of simulation.vehicles) {
      assert.ok(vehicle.committedStops.every(commitment => commitment.phaseSerial !== previousSerial ||
        vehicle.distance - vehicle.length / 2 > vehicle.route.stops[commitment.index].clearDistance),
      'The opposite axis cannot open before every outgoing vehicle rear reaches a safe clear point');
    }
    const current = new Map(simulation.vehicles.map(vehicle => [vehicle.id, vehicle]));
    for (const [id, vehicle] of previous) if (!current.has(id)) {
      counts.set(vehicle.routeId, counts.get(vehicle.routeId) + 1);
      enteredAt.delete(id);
    }
    previous = current;
    for (const vehicle of simulation.vehicles) {
      const nextStop = vehicle.route.stops[vehicle.passedGateIndex + 1];
      if (vehicle.passedGateIndex >= 0 && nextStop) {
        if (!enteredAt.has(vehicle.id)) enteredAt.set(vehicle.id, simulation.elapsed);
        longestMiddleStay = Math.max(longestMiddleStay, simulation.elapsed - enteredAt.get(vehicle.id));
        if (vehicle.route.turn === 'left' && vehicle.passedGateIndex === 1 && vehicle.speed < .2) stagedDirections.add(vehicle.route.incoming);
      } else if (!nextStop) enteredAt.delete(vehicle.id);
    }
    if (tick % 6 !== 0) continue;
    assert.equal(simulation.trams.length, 0);
    assert.equal(simulation.transitProtected, false);
    if (simulation.stage === 'green' || simulation.stage === 'redAmber') {
      for (const route of simulation.routes.filter(route => route.turn === 'left')) {
        assert.equal(simulation.getSignal(route.stops[0].group), simulation.getSignal(route.stops[1].group),
          `Outer and middle signals for ${route.id} must start together`);
        if (simulation.stage === 'green' && simulation.phases[simulation.phaseIndex].groups.includes(route.group)) {
          assert.equal(simulation.getSignal(route.group), 'green', `${route.id} receives its green on every occurrence of its axis phase`);
        }
      }
    }
    const occupancy = new Map();
    for (const vehicle of simulation.vehicles) {
      assert.ok(['distance', 'speed', 'x', 'z', 'heading'].every(property => Number.isFinite(vehicle[property])));
      const nextStop = vehicle.route.stops[vehicle.passedGateIndex + 1];
      if (nextStop && simulation.getSignal(nextStop.group) !== 'green') {
        // A car already inside the comfort margin at the green/yellow change
        // stops in place; it must not reverse to restore that optional margin.
        assert.ok(vehicle.distance + vehicle.length / 2 <= nextStop.distance + 1e-8,
          `${vehicle.routeId} front bumper crosses a closed signal`);
      }
      for (const reservation of vehicle.reservations) occupancy.set(reservation.id, (occupancy.get(reservation.id) ?? 0) + 1);
    }
    for (const [id, count] of occupancy) assert.ok(count <= capacities.get(id), `Median ${id} exceeds reserved capacity`);
    for (let a = 0; a < simulation.vehicles.length; a++) for (let b = a + 1; b < simulation.vehicles.length; b++) {
      const first = simulation.vehicles[a], second = simulation.vehicles[b];
      assert.equal(bodiesOverlap(first, second), false,
        `${first.routeId}/${second.routeId} body overlap at ${simulation.elapsed.toFixed(2)} s`);
    }
  }
  assert.ok(simulation.cycle >= scenario.duration / 180, 'The two axes must keep cycling without a stuck drain');
  assert.ok(simulation.passed > scenario.duration * .4, 'Protected turning must preserve useful throughput');
  for (const [id, count] of counts) assert.ok(count >= 2, `${id} must complete repeated journeys`);
  assert.equal(stagedDirections.size, 4, 'Every left direction must really stop at the perpendicular middle signal');
  assert.ok(checkedGreenOffers > 0, 'The run must verify individual queue progress across complete green offers');
  t.diagnostic(`${simulation.passed} passed, ${simulation.cycle} cycles; ${checkedGreenOffers} individual green offers checked; longest admitted middle stay ${longestMiddleStay.toFixed(1)} s`);
});
