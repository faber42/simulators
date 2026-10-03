import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, samplePath, TrafficSimulation } from './engine.mjs';
import { buildLaneMarkings, sampleLaneMarking } from './lane-markings.mjs';
import dortmund from './locations/dortmund.mjs';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message ?? `${actual} should equal ${expected}`);
const line = (offset, style = 'dashed') => ({ offset, style });

function distanceToPath(point, path, start = 0, end = path.length) {
  let nearest = Infinity;
  for (let i = 1; i < path.samples.length; i++) {
    const a = path.samples[i - 1], b = path.samples[i];
    if (b.distance < start || a.distance > end) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const minimum = Math.max(0, (start - a.distance) / (b.distance - a.distance));
    const maximum = Math.min(1, (end - a.distance) / (b.distance - a.distance));
    const t = Math.max(minimum, Math.min(maximum, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz));
  }
  return nearest;
}

test('paint ranges stop at the outer gate and restart at the final inner gate', () => {
  const route = { id: 'two-gates', path: buildPath([[0, 0], [0, 150]]), stops: [{ distance: 40 }, { distance: 90 }], stopDistance: 40 };
  const markings = buildLaneMarkings([route], [
    { routeId: route.id, section: 'approach', offsets: [line(1.75)] },
    { routeId: route.id, section: 'departure', offsets: [line(-1.75, 'solid')] },
    { routeId: route.id, section: 'full', offsets: [line(1.75), line(-1.75)] },
  ]);
  assert.deepEqual(markings.map(({ start, end, offset, style }) => ({ start, end, offset, style })), [
    { start: 0, end: 40, offset: 1.75, style: 'dashed' },
    { start: 90, end: 150, offset: -1.75, style: 'solid' },
    { start: 0, end: 150, offset: 1.75, style: 'dashed' },
    { start: 0, end: 150, offset: -1.75, style: 'dashed' },
  ]);
  assert.ok(markings.every(marking => marking.path === route.path), 'Painting and vehicles must use the same sampled curve');
  near(sampleLaneMarking(markings[0], 1000).z, 40);
  near(sampleLaneMarking(markings[1], -1000).z, 90);
});

test('offset sign follows the driver left normal for both directions', () => {
  const routes = [
    { id: 'east', path: buildPath([[-100, 17.3], [100, 17.3]]) },
    { id: 'west', path: buildPath([[100, -17.3], [-100, -17.3]]) },
    { id: 'south', path: buildPath([[0, -100], [0, 100]]) },
    { id: 'north', path: buildPath([[0, 100], [0, -100]]) },
  ];
  const markings = buildLaneMarkings(routes, routes.map(route => ({ routeId: route.id, section: 'full', offsets: [line(1.75)] })));
  near(sampleLaneMarking(markings[0], 100).z, 15.55);
  near(sampleLaneMarking(markings[1], 100).z, -15.55);
  near(sampleLaneMarking(markings[2], 100).x, 1.75);
  near(sampleLaneMarking(markings[3], 100).x, -1.75);
});

test('curved approach paint remains perpendicular and exactly half a lane from the driven path', () => {
  const route = { id: 'curve', path: buildPath([[-80, -100], [-45, -62], [-18, -28], [-5, 0], [0, 50]]), stops: [{ distance: 130 }] };
  const [left, right] = buildLaneMarkings([route], [{ routeId: route.id, section: 'approach', offsets: [line(1.75), line(-1.75)] }]);
  for (let distance = 0; distance <= left.end; distance += 1.3) {
    const center = samplePath(route.path, distance);
    const a = sampleLaneMarking(left, distance), b = sampleLaneMarking(right, distance);
    const dx = a.x - center.x, dz = a.z - center.z;
    near(Math.hypot(dx, dz), 1.75);
    near(dx * Math.sin(center.heading) + dz * Math.cos(center.heading), 0, 'Paint offset must be normal to the direction of travel');
    near(Math.hypot(a.x - b.x, a.z - b.z), 3.5);
    near((a.x + b.x) / 2, center.x);
    near((a.z + b.z) / 2, center.z);
  }
});

test('between-route lines override nominal width and cannot project onto a nearby later turn', () => {
  const base = { id: 'base', path: buildPath([[0, 0], [0, 100]]), stops: [{ distance: 60 }] };
  const neighbor = { id: 'neighbor', path: buildPath([[4, 0], [4, 60], [4, 80], [0.4, 80], [0.4, 0]]), stops: [{ distance: 60 }] };
  const [marking] = buildLaneMarkings([base, neighbor], [{ routeId: base.id, section: 'approach', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: neighbor.id }] }]);
  near(sampleLaneMarking(marking, 20).x, 2);
  near(marking.neighborStart, 0);
  near(marking.neighborEnd, 60);
  assert.equal(marking.neighborPath, neighbor.path);
  assert.ok(distanceToPath({ x: 0, z: 20 }, neighbor.path) < 1, 'The later return leg is closer, but must not attract approach paint');
});

test('between-route departure projection excludes the neighboring approach', () => {
  const base = { id: 'base', path: buildPath([[0, 0], [0, 100]]), stops: [{ distance: 20 }, { distance: 60 }] };
  const path = buildPath([[0.4, 0], [0.4, 100], [4, 100], [4, 70], [4, 0]]);
  const departure = path.samples.find(sample => Math.hypot(sample.x - 4, sample.z - 70) < 1e-8).distance;
  const neighbor = { id: 'neighbor', path, stops: [{ distance: 40 }, { distance: departure }] };
  const [marking] = buildLaneMarkings([base, neighbor], [{ routeId: base.id, section: 'departure', offsets: [{ style: 'dashed', betweenRouteId: neighbor.id }] }]);
  near(marking.neighborStart, departure);
  const point = sampleLaneMarking(marking, 65);
  assert.ok(point.x > 1.9, 'A nearby incoming lane must not pull paint away from the departure lane pair');
});

test('Dortmund B1 dividers bisect the actual 3.5 m lane centres, independent of 12 m road width', () => {
  const simulation = new TrafficSimulation({ ...dortmund, density: 0 });
  const specifications = [
    { routeId: 'west-east-1', section: 'full', offsets: [line(1.75), line(-1.75)] },
    { routeId: 'east-west-1', section: 'full', offsets: [line(1.75), line(-1.75)] },
  ];
  const markings = buildLaneMarkings(simulation.routes, specifications);
  for (let distance = 0; distance < 440; distance += 11) {
    const eastInner = sampleLaneMarking(markings[0], distance);
    const eastOuter = sampleLaneMarking(markings[1], distance);
    const westInner = sampleLaneMarking(markings[2], distance);
    const westOuter = sampleLaneMarking(markings[3], distance);
    near(eastInner.z, (13.8 + 17.3) / 2);
    near(eastOuter.z, (17.3 + 20.8) / 2);
    near(westInner.z, -(13.8 + 17.3) / 2);
    near(westOuter.z, -(17.3 + 20.8) / 2);
  }
});

test('Dortmund curved side approaches and departures use their own lane paths and correct gates', () => {
  const simulation = new TrafficSimulation({ ...dortmund, density: 0 });
  for (const id of ['north-shared-straight', 'south-shared-straight']) {
    const route = simulation.routes.find(candidate => candidate.id === id);
    const [approach, departure] = buildLaneMarkings(simulation.routes, [
      { routeId: id, section: 'approach', offsets: [line(1.75)] },
      { routeId: id, section: 'departure', offsets: [line(-1.75)] },
    ]);
    near(approach.end, route.stops[0].distance);
    near(departure.start, route.stops.at(-1).distance);
    for (const marking of [approach, departure]) for (let d = marking.start; d <= marking.end; d += 3) {
      const center = samplePath(route.path, d), paint = sampleLaneMarking(marking, d);
      near(Math.hypot(paint.x - center.x, paint.z - center.z), 1.75);
      near((paint.x - center.x) * Math.sin(center.heading) + (paint.z - center.z) * Math.cos(center.heading), 0);
    }
  }
});

test('Dortmund midpoint paint shares curved lane clearance instead of encroaching on one neighboring lane', () => {
  const simulation = new TrafficSimulation({ ...dortmund, density: 0 });
  const markings = buildLaneMarkings(simulation.routes, dortmund.laneMarkings);
  const between = markings.filter(marking => marking.neighborPath);
  assert.equal(between.length, 6);
  for (const marking of between) {
    for (let d = marking.start + 2; d < marking.end - 2; d += 2) {
      const paint = sampleLaneMarking(marking, d);
      const first = distanceToPath(paint, marking.path, marking.start, marking.end);
      const second = distanceToPath(paint, marking.neighborPath, marking.neighborStart, marking.neighborEnd);
      assert.ok(Math.abs(first - second) < 0.06, `Paint should share curved-lane clearance: ${marking.routeId} differs by ${Math.abs(first - second)} m`);
      assert.ok(Math.min(first, second) > 1.3, `Paint must stay clear of both adjacent vehicle centre paths: ${marking.routeId}`);
    }
  }
});

test('route typos and invalid painting specifications fail explicitly', () => {
  const route = { id: 'valid', path: buildPath([[0, 0], [0, 100]]), stops: [{ distance: 40 }] };
  const spec = { routeId: 'valid', section: 'approach', offsets: [line(1.75)] };
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, routeId: 'typo' }]), /Unknown.*route/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, section: 'aproach' }]), /section/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, offsets: [line(NaN)] }]), /finite offset/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, offsets: [line(1.75, 'dotted')] }]), /style/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, offsets: [{ ...line(1.75), betweenRouteId: 'missing' }] }]), /Unknown neighboring/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, offsets: [{ ...line(1.75), betweenRouteId: 'valid' }] }]), /different routes/);
  assert.throws(() => buildLaneMarkings([route], [{ ...spec, offsets: [] }]), /offsets/);
  assert.throws(() => buildLaneMarkings([{ ...route, stops: [{ distance: 101 }] }], [spec]), /stop distance/);
  assert.throws(() => buildLaneMarkings([route, route], [spec]), /unique/);
  assert.deepEqual(buildLaneMarkings([route], []), []);
});
