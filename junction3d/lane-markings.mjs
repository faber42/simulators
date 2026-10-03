import { samplePath } from './engine.mjs';

function sectionRange(route, section) {
  const path = route.path;
  if (!path || !Array.isArray(path.samples) || path.samples.length < 2 || !Number.isFinite(path.length) || path.length <= 0) {
    throw new Error(`Lane-marking route ${route.id} needs a processed path.`);
  }
  let start = 0, end = path.length;
  if (section !== 'full') {
    const stops = route.stops?.length ? route.stops : [{ distance: route.stopDistance }];
    const stop = section === 'approach' ? stops[0] : stops.at(-1);
    if (!Number.isFinite(stop?.distance) || stop.distance < 0 || stop.distance > path.length) {
      throw new Error(`Lane-marking route ${route.id} has an invalid ${section} stop distance.`);
    }
    if (section === 'approach') end = stop.distance;
    else start = stop.distance;
  }
  return { path, start, end };
}

function clippedSegments(path, start, end) {
  const segments = [];
  for (let i = 1; i < path.samples.length; i++) {
    const a = path.samples[i - 1], b = path.samples[i];
    if (b.distance < start || a.distance > end) continue;
    const span = b.distance - a.distance;
    if (span <= 0) continue;
    const low = Math.max(0, (start - a.distance) / span), high = Math.min(1, (end - a.distance) / span);
    const x = a.x + (b.x - a.x) * low, z = a.z + (b.z - a.z) * low;
    const dx = (b.x - a.x) * (high - low), dz = (b.z - a.z) * (high - low);
    segments.push({ x, z, dx, dz, squaredLength: dx * dx + dz * dz });
  }
  return segments;
}

/**
 * Describe paint relative to actual vehicle paths, in metres. Positive offset
 * is the driver's left (+X while driving south, -Z while driving east).
 * A marking keeps the original path and an arc-distance drawing range; this
 * avoids resampling a second curve that could drift away from its lane.
 * betweenRouteId instead paints midway to the neighboring lane's closest
 * point, accounting for locally narrowing or widening lane separation.
 */
export function buildLaneMarkings(processedRoutes, specs = []) {
  if (!Array.isArray(processedRoutes) || !Array.isArray(specs)) throw new TypeError('Lane-marking routes and specs must be arrays.');
  const routes = new Map();
  for (const route of processedRoutes) {
    if (!route?.id || routes.has(route.id)) throw new Error('Lane-marking route ids must be present and unique.');
    routes.set(route.id, route);
  }

  return specs.flatMap(spec => {
    const route = routes.get(spec?.routeId);
    if (!route) throw new Error(`Unknown lane-marking route: ${spec?.routeId}`);
    if (!['full', 'approach', 'departure'].includes(spec.section)) throw new Error(`Invalid lane-marking section: ${spec.section}`);
    const { path, start, end } = sectionRange(route, spec.section);
    if (!Array.isArray(spec.offsets) || !spec.offsets.length) throw new Error(`Lane-marking route ${route.id} needs offsets.`);
    return spec.offsets.map(line => {
      const between = line?.betweenRouteId !== undefined;
      if ((!between || line.offset !== undefined) && !Number.isFinite(line?.offset)) throw new Error(`Lane-marking route ${route.id} needs a finite offset.`);
      if (!['dashed', 'solid'].includes(line.style)) throw new Error(`Invalid lane-marking style: ${line.style}`);
      const marking = { routeId: route.id, path, start, end, offset: line.offset, style: line.style };
      if (between) {
        const neighbor = routes.get(line.betweenRouteId);
        if (!neighbor) throw new Error(`Unknown neighboring lane-marking route: ${line.betweenRouteId}`);
        if (neighbor === route) throw new Error('A lane divider needs two different routes.');
        const range = sectionRange(neighbor, spec.section);
        Object.assign(marking, { neighborRouteId: neighbor.id, neighborPath: range.path, neighborStart: range.start, neighborEnd: range.end,
          neighborSegments: clippedSegments(range.path, range.start, range.end) });
      }
      return marking;
    });
  });
}

/** Sample an offset line at a route arc distance, bounded to its paint section. */
export function sampleLaneMarking(marking, distance) {
  if (!Number.isFinite(distance)) throw new TypeError('Lane-marking sample distance must be finite.');
  const point = samplePath(marking.path, Math.max(marking.start, Math.min(marking.end, distance)));
  if (marking.neighborPath) {
    let nearest = null, best = Infinity;
    for (const segment of marking.neighborSegments) {
      const fraction = Math.max(0, Math.min(1, ((point.x - segment.x) * segment.dx + (point.z - segment.z) * segment.dz) / (segment.squaredLength || 1)));
      const x = segment.x + segment.dx * fraction, z = segment.z + segment.dz * fraction;
      const squared = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (squared < best) { best = squared; nearest = { x, z }; }
    }
    if (!nearest) throw new Error(`No usable neighboring lane section for ${marking.routeId}.`);
    return { x: (point.x + nearest.x) / 2, z: (point.z + nearest.z) / 2, heading: point.heading };
  }
  return { x: point.x + Math.cos(point.heading) * marking.offset,
    z: point.z - Math.sin(point.heading) * marking.offset, heading: point.heading };
}
