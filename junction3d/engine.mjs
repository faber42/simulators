/**
 * Renderer-independent traffic model. Distances are metres, time is seconds.
 * Route points use [east, south]; heading is atan2(dx, dz), for a +Z vehicle.
 * No DOM, Three.js or intersection-specific constants are required here.
 */
import { nextTramDeparture } from './time-model.mjs';

const STEP = 1 / 30;
const GAP = 2.2;
const STOP_MARGIN = 0.8;
const VEHICLE_TYPES = {
  car: { weight: 83, length: 4.5, width: 1.82 },
  van: { weight: 14, length: 5.4, width: 2.05 },
  bus: { weight: 3, length: 11.5, width: 2.5 },
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function validateClockTime(epochMs) {
  if (!Number.isFinite(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) {
    throw new Error('Simulation startTime must be a valid epoch time in milliseconds.');
  }
  return epochMs;
}
const renderPose = body => ({ x: body.x, z: body.z, heading: body.heading });
function captureRenderPose(snapshots, body) {
  const previous = snapshots.get(body);
  if (previous) { previous.x = body.x; previous.z = body.z; previous.heading = body.heading; }
  else snapshots.set(body, renderPose(body));
}

function bodyConflict(pose, vehicle, other, margin = 0.35) {
  const dx = other.x - pose.x, dz = other.z - pose.z;
  if (Math.hypot(dx, dz) > (vehicle.length + other.length) / 2 + 3) return false;
  const a = [Math.sin(pose.heading), Math.cos(pose.heading)], ar = [a[1], -a[0]];
  const b = [Math.sin(other.heading), Math.cos(other.heading)], br = [b[1], -b[0]];
  return [a, ar, b, br].every(axis => {
    const dot = vector => Math.abs(vector[0] * axis[0] + vector[1] * axis[1]);
    const first = dot(a) * (vehicle.length / 2 + margin) + dot(ar) * (VEHICLE_TYPES[vehicle.kind].width / 2 + margin);
    const second = dot(b) * (other.length / 2 + margin) + dot(br) * (VEHICLE_TYPES[other.kind].width / 2 + margin);
    return Math.abs(dx * axis[0] + dz * axis[1]) < first + second;
  });
}

/** An arc-length sampled centripetal Catmull-Rom spline (no turn loops). */
export function buildPath(points) {
  if (!Array.isArray(points) || points.length < 2 || points.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    throw new Error('A route needs at least two finite [x, z] points.');
  }
  points = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-6);
  if (points.length < 2) throw new Error('A route must have a non-zero length.');
  const samples = [{ x: points[0][0], z: points[0][1], distance: 0 }];
  let length = 0;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const p1 = points[segment];
    const p2 = points[segment + 1];
    const p0 = points[segment - 1] ?? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3 = points[segment + 2] ?? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const t0 = 0, t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    const subdivisions = Math.max(12, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2));
    for (let step = 1; step <= subdivisions; step++) {
      const t = t1 + (t2 - t1) * step / subdivisions;
      const blend = (a, b, start, end) => ((end - t) * a + (t - start) * b) / (end - start);
      const interpolate = axis => {
        const a1 = blend(p0[axis], p1[axis], t0, t1);
        const a2 = blend(p1[axis], p2[axis], t1, t2);
        const a3 = blend(p2[axis], p3[axis], t2, t3);
        return blend(blend(a1, a2, t0, t2), blend(a2, a3, t1, t3), t1, t2);
      };
      const x = interpolate(0), z = interpolate(1), previous = samples.at(-1);
      const increment = Math.hypot(x - previous.x, z - previous.z);
      if (increment < 1e-8) continue;
      length += increment;
      samples.push({ x, z, distance: length });
    }
  }
  if (length < 0.01) throw new Error('A route must have a non-zero length.');
  return { samples, length };
}

/** Position and clockwise heading at a distance along a sampled path. */
export function samplePath(path, distance) {
  const samples = path.samples;
  const d = clamp(distance, 0, path.length);
  let low = 0, high = samples.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (samples[middle].distance <= d) low = middle;
    else high = middle;
  }
  const a = samples[low], b = samples[high];
  const fraction = (d - a.distance) / (b.distance - a.distance || 1);
  return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction,
    heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

function projectedDistance(path, point) {
  let bestSquared = Infinity, result = 0;
  for (let i = 1; i < path.samples.length; i++) {
    const a = path.samples[i - 1], b = path.samples[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const fraction = clamp(((point[0] - a.x) * dx + (point[1] - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const squared = (point[0] - a.x - dx * fraction) ** 2 + (point[1] - a.z - dz * fraction) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      result = a.distance + (b.distance - a.distance) * fraction;
    }
  }
  return result;
}

function lastConflictDistance(path, bounds, stopDistance) {
  if (!bounds) return Math.min(path.length, stopDistance + 55);
  let result = stopDistance;
  for (const sample of path.samples) {
    if (sample.x >= bounds.minX && sample.x <= bounds.maxX && sample.z >= bounds.minZ && sample.z <= bounds.maxZ) {
      result = Math.max(result, sample.distance);
    }
  }
  return Math.min(path.length, result + 1);
}

export class TrafficSimulation {
  constructor(config, { startTime = null, minimumTraffic = false } = {}) {
    if (!config?.phases?.length || !config?.routes?.length) throw new Error('TrafficSimulation needs phases and routes.');
    this.config = config;
    this.startEpochMs = startTime === null ? null : validateClockTime(startTime);
    this.minimumTraffic = Boolean(minimumTraffic);
    this.phases = config.phases.map(phase => {
      const duration = Math.max(1, Number(phase.duration) || 25);
      if (!Array.isArray(phase.groups) || !phase.groups.length || phase.groups.some(group => typeof group !== 'string' || !group)) {
        throw new Error('Each phase needs named signal groups.');
      }
      const groups = [...new Set(phase.groups)];
      for (const [group, delay] of Object.entries(phase.groupDelays ?? {})) {
        if (!groups.includes(group) || !Number.isFinite(delay) || delay < 0 || delay >= duration) {
          throw new Error(`Invalid delay for signal group ${group}.`);
        }
      }
      if (phase.drainGroups && (!Array.isArray(phase.drainGroups) || phase.drainGroups.some(group => !groups.includes(group)))) {
        throw new Error('Drain groups must belong to their phase.');
      }
      return { ...phase, groups, duration };
    });
    this.timing = { yellow: 3, allRed: 3, redAmber: 1, ...config.timing };
    for (const key of ['yellow', 'allRed', 'redAmber']) {
      if (!Number.isFinite(this.timing[key]) || this.timing[key] < 0) throw new Error(`Invalid timing: ${key}`);
    }
    const ids = new Set();
    this.routes = config.routes.map(route => {
      if (!route.id || ids.has(route.id)) throw new Error('Route ids must be present and unique.');
      ids.add(route.id);
      const path = buildPath(route.points);
      const rawStops = route.stops ?? [{ id: `${route.id}-stop`, group: route.group, point: route.stopLine, distance: route.stopDistance }];
      if (!rawStops.length) throw new Error(`Route ${route.id} needs at least one stop.`);
      const stops = rawStops.map((stop, index) => {
        const distance = clamp(stop.distance ?? (stop.point ? projectedDistance(path, stop.point) : path.length * 0.35), 0, path.length);
        const clearDistance = clamp(stop.clearDistance ?? (stop.clearPoint ? projectedDistance(path, stop.clearPoint) :
          route.clearDistance ?? lastConflictDistance(path, config.conflictBounds, distance)), distance, path.length);
        if (stop.storage && (!stop.storage.id || !Number.isInteger(stop.storage.capacity) || stop.storage.capacity < 1)) {
          throw new Error(`Invalid storage on ${route.id} stop ${index}.`);
        }
        if (stop.yieldToGroups && (!Array.isArray(stop.yieldToGroups) || stop.yieldToGroups.some(group => typeof group !== 'string' || !group))) {
          throw new Error(`Invalid yield groups on ${route.id} stop ${index}.`);
        }
        if (stop.storage?.allowOverflow && (index !== 0 || rawStops.length < 2)) {
          throw new Error(`Overflow storage on ${route.id} requires an entry gate followed by a middle gate.`);
        }
        let yieldApproach;
        if (stop.yieldApproach) {
          const { point, speed } = stop.yieldApproach;
          if (index !== 0 || !stop.storage || !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value)) ||
            !Number.isFinite(speed) || speed <= 0) throw new Error(`Invalid yield approach on ${route.id}.`);
          const yieldDistance = projectedDistance(path, point);
          if (yieldDistance <= distance || yieldDistance >= clearDistance) throw new Error(`Yield approach on ${route.id} must lie between its entry and clearing point.`);
          yieldApproach = { ...stop.yieldApproach, distance: yieldDistance };
        }
        return { ...stop, ...(yieldApproach ? { yieldApproach } : {}), id: stop.id ?? `${route.id}-stop-${index}`, distance, clearDistance };
      });
      if (stops.some((stop, index) => index > 0 && stop.distance <= stops[index - 1].distance)) {
        throw new Error(`Stops on ${route.id} must follow route order.`);
      }
      const stopDistance = stops[0].distance;
      const clearDistance = stops.at(-1).clearDistance;
      const vehicleKinds = route.vehicleKinds ?? Object.keys(VEHICLE_TYPES);
      if (!Array.isArray(vehicleKinds) || !vehicleKinds.length || vehicleKinds.some(kind => !VEHICLE_TYPES[kind])) {
        throw new Error(`Route ${route.id} needs valid vehicleKinds: car, van or bus.`);
      }
      return { ...route, path, length: path.length, stops, group: stops[0].group,
        stopLine: stops[0].point ?? route.stopLine, stopDistance, clearDistance,
        mergeDistance: route.mergePoint ? projectedDistance(path, route.mergePoint) : clearDistance - 22,
        laneSections: (route.laneSections ?? []).map(section => ({ ...section,
          startDistance: projectedDistance(path, section.from), endDistance: projectedDistance(path, section.to) })),
        vehicleKinds: [...new Set(vehicleKinds)],
        laneId: route.laneId ?? route.id, exitId: route.exitId ?? route.id,
        rate: Math.max(0, Number(route.rate) || 0), speed: Math.max(1, Number(route.speed) || 13.9) };
    });
    for (const route of this.routes) {
      route.sharedSections = new Map();
      route.followRouteIds = [];
      for (const other of this.routes) {
        const sections = route.laneSections.flatMap(section => other.laneSections.filter(shared => shared.id === section.id).map(shared => [section, shared]));
        if (sections.length) route.sharedSections.set(other.id, sections);
        if (route.id === other.id || route.laneId === other.laneId || route.exitId === other.exitId || sections.length) route.followRouteIds.push(other.id);
      }
    }
    const minimumIds = new Set();
    this.minimumArrivalByRoute = new Map();
    this.minimumArrivals = (config.minimumArrivals ?? []).map(spec => {
      if (!spec.id || minimumIds.has(spec.id) || !Number.isFinite(spec.interval) || spec.interval <= 0 ||
        !Array.isArray(spec.routeIds) || !spec.routeIds.length) throw new Error('Invalid minimum arrival group.');
      minimumIds.add(spec.id);
      const routes = spec.routeIds.map(id => {
        const route = this.routes.find(candidate => candidate.id === id);
        if (!route || this.minimumArrivalByRoute.has(id)) throw new Error(`Unknown or repeated minimum arrival route: ${id}`);
        this.minimumArrivalByRoute.set(id, spec);
        return route;
      });
      return { ...spec, routes };
    });
    this.transitConfig = { greenGroups: [], blockedGroups: [], ...config.transit };
    this.transitRoutes = (config.transit?.routes ?? []).map(route => {
      const path = buildPath(route.points);
      if (!Number.isFinite(route.interval) || route.interval <= 0 || !Number.isFinite(route.offset) || route.offset < 0 ||
        !Number.isFinite(route.speed) || route.speed <= 0 || !Number.isFinite(route.length) || route.length <= 0) {
        throw new Error(`Transit route ${route.id} needs a positive interval, speed, length and nonnegative offset.`);
      }
      const stopDistance = projectedDistance(path, route.stopLine);
      return { ...route, path, pathLength: path.length, stopDistance,
        clearDistance: route.clearPoint ? projectedDistance(path, route.clearPoint) : lastConflictDistance(path, config.conflictBounds, stopDistance),
        approachTime: Math.max(0, (stopDistance - route.length / 2 - STOP_MARGIN) / route.speed) };
    });
    this.density = clamp(Number.isFinite(config.density) ? config.density : 1, 0, 5);
    this.reset();
  }

  random() {
    // Mulberry32: resets and tests are reproducible across browsers.
    this.randomState = (this.randomState + 0x6D2B79F5) | 0;
    let value = this.randomState;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  reset() {
    this.randomState = (this.config.seed ?? 42) | 0;
    this.elapsed = 0;
    this.resetMinimumArrivalDeadlines();
    this.passed = 0;
    this.phaseIndex = 0;
    this.stage = 'green';
    this.stageElapsed = 0;
    this.closedGreenElapsed = 0;
    this.phaseSerial = 0;
    this.cycle = 1;
    this.accumulator = 0;
    this.previousRenderPoses = new WeakMap();
    this.nextId = 1;
    this.vehicles = [];
    this.trams = [];
    this.transitPassed = 0;
    this.nextTramId = 1;
    this.nextTransitDue = new Map(this.transitRoutes.map(route => [route.id, this.nextTransitDeparture(route)]));
    this.bookTransitPhase(0);
    this.spawnTrams();
    this.arrivals = new Map(this.routes.map(route => [route.id, this.arrivalInterval(route)]));
    const laneGroups = new Map();
    for (const route of this.routes) {
      if (route.rate <= 0) continue;
      if (!laneGroups.has(route.laneId)) laneGroups.set(route.laneId, []);
      laneGroups.get(route.laneId).push(route);
    }
    const initialCount = Math.max(0, Math.floor(this.config.initialVehiclesPerLane ?? 3));
    if (this.density > 0) for (const routes of laneGroups.values()) {
      let offset = 9;
      for (let index = 0; index < initialCount; index++) {
        let pick = this.random() * routes.reduce((sum, route) => sum + route.rate, 0);
        const route = routes.find(candidate => (pick -= candidate.rate) <= 0) ?? routes[0];
        const vehicle = this.createVehicle(route, route.stopDistance - offset);
        if (vehicle.distance < vehicle.length / 2 + 1) break;
        vehicle.speed = this.getSignal(route.group) === 'green' ? Math.min(6, route.speed * 0.5) : 0;
        this.vehicles.push(vehicle);
        offset += 15 + this.random() * 6;
      }
    }
    return this;
  }

  /** Chosen local-clock instant advances only with explicitly supplied simulation time. */
  getClockTime() {
    return this.startEpochMs === null ? null : this.startEpochMs + (this.elapsed + this.accumulator) * 1000;
  }

  /** Rebase the clock and start a clean, reproducible traffic/phase/timetable run. */
  setClockTime(epochMs) {
    this.startEpochMs = validateClockTime(epochMs);
    return this.reset();
  }

  nextTransitDeparture(route, previousDue) {
    if (this.startEpochMs !== null && route.schedule) {
      // The timetable API is inclusive. Advancing one millisecond past a known
      // departure selects its successor, including night and weekday changes.
      const earliest = previousDue === undefined ? this.startEpochMs : Math.round(this.startEpochMs + previousDue * 1000) + 1;
      return (nextTramDeparture(earliest, route.schedule, this.config.timeZone) - this.startEpochMs) / 1000;
    }
    return previousDue === undefined ? route.offset : previousDue + route.interval;
  }

  setDensity(value) {
    if (!Number.isFinite(value)) return;
    const wasZero = this.density === 0;
    const oldDensity = this.density;
    this.density = clamp(value, 0, 5);
    if (wasZero && this.density > 0) this.resetMinimumArrivalDeadlines();
    for (const route of this.routes) {
      if (this.density === 0) this.arrivals.set(route.id, Infinity);
      else if (wasZero) this.arrivals.set(route.id, this.arrivalInterval(route));
      else this.arrivals.set(route.id, this.arrivals.get(route.id) * oldDensity / this.density);
    }
  }

  arrivalInterval(route) {
    const rate = route.rate * this.density;
    return rate > 0 ? Math.max(0.7, -Math.log(Math.max(1e-9, 1 - this.random())) * 3600 / rate) : Infinity;
  }

  resetMinimumArrivalDeadlines() {
    this.minimumArrivalDue = new Map(this.minimumArrivals.map(group => [group.id, this.elapsed + group.interval]));
  }

  setMinimumTraffic(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.minimumTraffic) return;
    this.minimumTraffic = enabled;
    // No catch-up burst after manual control or an empty-traffic interval.
    this.resetMinimumArrivalDeadlines();
  }

  hasArrivalSpace(route) {
    return !this.vehicles.some(vehicle => vehicle.route.laneId === route.laneId &&
      vehicle.distance - vehicle.route.stopDistance < 18 - route.stopDistance);
  }

  spawnArrival(route) {
    const vehicle = this.createVehicle(route);
    vehicle.speed = Math.min(route.speed, 8);
    this.vehicles.push(vehicle);
    this.arrivals.set(route.id, this.arrivalInterval(route));
    const group = this.minimumArrivalByRoute.get(route.id);
    if (group) this.minimumArrivalDue.set(group.id, this.elapsed + group.interval);
  }

  spawnMinimumArrivals() {
    if (!this.minimumTraffic || this.density === 0) return;
    for (const group of this.minimumArrivals) {
      if (this.elapsed + 1e-9 < this.minimumArrivalDue.get(group.id)) continue;
      // One deadline covers the whole incoming direction. Zero-rate routing
      // alternatives never create extra demand, and a full lane is not forced.
      const available = group.routes.filter(route => route.rate > 0 && this.hasArrivalSpace(route));
      if (!available.length) continue;
      let pick = this.random() * available.reduce((sum, route) => sum + route.rate, 0);
      const route = available.find(candidate => (pick -= candidate.rate) <= 0) ?? available.at(-1);
      this.spawnArrival(route);
    }
  }

  createVehicle(route, distance = 0) {
    // A location may restrict a tight curve to vehicles its geometry supports.
    // Preserve the usual fleet proportions within the permitted vehicle kinds.
    let variety = this.random() * route.vehicleKinds.reduce((sum, kind) => sum + VEHICLE_TYPES[kind].weight, 0);
    const kind = route.vehicleKinds.find(kind => (variety -= VEHICLE_TYPES[kind].weight) <= 0) ?? route.vehicleKinds[0];
    const length = VEHICLE_TYPES[kind].length;
    const vehicle = { id: this.nextId++, routeId: route.id, route, distance, speed: 0, length, kind,
      color: Math.floor(this.random() * 10), turn: route.turn ?? 'straight', braking: false,
      committed: false, passedGateIndex: -1, committedStops: [], reservations: [], yieldApproachPassed: false,
      ...samplePath(route.path, distance) };
    this.previousRenderPoses.set(vehicle, renderPose(vehicle));
    return vehicle;
  }

  /**
   * Read-only display pose, one fixed tick behind the simulation. Fractional
   * frame time advances this interpolation even when update() runs zero ticks.
   * No wall clock is read, so a paused scene and its minimap remain frozen.
   */
  getRenderPose(body) {
    const previous = this.previousRenderPoses.get(body);
    if (!previous) return renderPose(body);
    const alpha = clamp(this.accumulator / STEP, 0, 1);
    const turn = Math.atan2(Math.sin(body.heading - previous.heading), Math.cos(body.heading - previous.heading));
    return { x: previous.x + (body.x - previous.x) * alpha,
      z: previous.z + (body.z - previous.z) * alpha,
      heading: previous.heading + turn * alpha };
  }

  getSignal(group) {
    const phase = this.phases[this.phaseIndex];
    if (this.transitProtected && this.transitConfig.blockedGroups.includes(group)) return 'red';
    if (!phase.groups.includes(group) || this.stage === 'clearance') return 'red';
    const delay = Math.max(0, phase.groupDelays?.[group] ?? 0);
    const opened = this.closedGreenElapsed + 1e-9 >= delay;
    const drains = phase.drainGroups?.includes(group);
    if (this.stage === 'drain') return drains && opened ? 'green' : 'red';
    if (this.stage === 'drainYellow') return drains && opened ? 'yellow' : 'red';
    if (this.stage === 'redAmber') return delay === 0 ? 'redAmber' : 'red';
    if (this.stage === 'yellow') return opened ? drains ? 'green' : 'yellow' : 'red';
    if (this.stageElapsed + 1e-9 >= delay) return 'green';
    return this.stageElapsed + 1e-9 >= delay - this.timing.redAmber ? 'redAmber' : 'red';
  }

  requestNextPhase() {
    if (this.stage === 'green') {
      this.closedGreenElapsed = this.stageElapsed;
      this.stage = 'yellow';
      this.stageElapsed = 0;
    }
  }

  getStatus() {
    const duration = this.stage === 'green' ? this.phases[this.phaseIndex].duration :
      this.stage === 'yellow' || this.stage === 'drainYellow' ? this.timing.yellow :
        this.stage === 'clearance' ? this.timing.allRed : this.stage === 'drain' ? 0 : this.timing.redAmber;
    const groups = new Set(this.phases.flatMap(phase => phase.groups));
    return { phaseIndex: this.phaseIndex, stage: this.stage, remaining: Math.max(0, duration - this.stageElapsed),
      elapsed: this.elapsed, passed: this.passed, waiting: this.vehicles.filter(vehicle => vehicle.speed < 0.5).length,
      active: this.vehicles.length, cycle: this.cycle,
      stagedWaiting: this.vehicles.filter(vehicle => vehicle.passedGateIndex >= 0 && vehicle.passedGateIndex < vehicle.route.stops.length - 1 && vehicle.speed < 0.5).length,
      signals: Object.fromEntries([...groups].map(group => [group, this.getSignal(group)])),
      transit: { protected: this.transitProtected, active: this.trams.length, passed: this.transitPassed,
        nextArrivals: this.transitRoutes.map(route => {
          const due = Math.min(this.nextTransitDue.get(route.id), ...this.trams.filter(tram => tram.routeId === route.id && !tram.committed).map(tram => tram.scheduledAt));
          return { id: route.id, label: route.label, in: Math.max(0, due - this.elapsed),
            scheduledTime: this.startEpochMs === null ? null : this.startEpochMs + due * 1000 };
        }) } };
  }

  bookTransitPhase(greenStart) {
    const phase = this.phases[this.phaseIndex];
    const eligible = phase.groups.some(group => this.transitConfig.greenGroups.includes(group));
    const deadline = greenStart + phase.duration;
    this.transitProtected = eligible && (this.transitRoutes.some(route => this.nextTransitDue.get(route.id) <= deadline + 1e-9) ||
      this.trams.some(tram => !tram.committed && tram.scheduledAt <= deadline + 1e-9));
  }

  getTransitSignal(routeId) {
    if (!this.transitProtected || !this.transitRoutes.some(route => route.id === routeId)) return 'red';
    // Never admit a train over cars that are still using a median holding lane.
    if (this.vehicles.some(vehicle => vehicle.passedGateIndex >= 0 && vehicle.reservations.length)) return 'red';
    return this.stage === 'green' ? 'green' : this.stage === 'yellow' ? 'yellow' : 'red';
  }

  spawnTrams() {
    for (const route of this.transitRoutes) {
      let scheduledAt = this.nextTransitDue.get(route.id);
      while (scheduledAt - route.approachTime <= this.elapsed + 1e-9) {
        const distance = Math.max(0, route.stopDistance - route.length / 2 - STOP_MARGIN - Math.max(0, scheduledAt - this.elapsed) * route.speed);
        const tram = { id: `tram-${this.nextTramId++}`, routeId: route.id, route, distance, scheduledAt,
          length: route.length, speed: scheduledAt > this.elapsed ? route.speed : 0, committed: false, braking: false,
          ...samplePath(route.path, distance) };
        this.previousRenderPoses.set(tram, renderPose(tram));
        this.trams.push(tram);
        scheduledAt = this.nextTransitDeparture(route, scheduledAt);
      }
      this.nextTransitDue.set(route.id, scheduledAt);
    }
  }

  moveTrams(dt) {
    for (const tram of this.trams) {
      let limit = Infinity;
      let target = tram.route.speed;
      if (!tram.committed && this.getTransitSignal(tram.routeId) !== 'green') {
        limit = Math.max(0, tram.route.stopDistance - tram.length / 2 - STOP_MARGIN - tram.distance);
        target = Math.min(target, Math.sqrt(2 * 1.3 * limit));
      } else if (!tram.committed && this.elapsed + 1e-9 < tram.scheduledAt) {
        // Keep the timetable without braking a train that approaches an open
        // signal; the front may not cross before its scheduled arrival time.
        limit = Math.max(0, tram.route.stopDistance - tram.length / 2 - STOP_MARGIN - tram.distance);
      }
      for (const other of this.trams) if (other.routeId === tram.routeId && other.distance > tram.distance) {
        const gap = Math.max(0, other.distance - tram.distance - (other.length + tram.length) / 2 - 4);
        limit = Math.min(limit, gap);
        target = Math.min(target, Math.sqrt(other.speed ** 2 + 2 * 1.3 * gap));
      }
      const speed = Math.max(0, tram.speed + clamp(target - tram.speed, -1.8 * dt, 1.1 * dt));
      const advance = Math.min(speed * dt, limit);
      tram.braking = advance / dt < tram.speed - 0.005;
      tram.speed = advance / dt;
      tram.distance += advance;
      if (!tram.committed && tram.distance + tram.length / 2 > tram.route.stopDistance && this.getTransitSignal(tram.routeId) === 'green') tram.committed = true;
      Object.assign(tram, samplePath(tram.route.path, tram.distance));
    }
    const count = this.trams.length;
    this.trams = this.trams.filter(tram => tram.distance < tram.route.pathLength);
    this.transitPassed += count - this.trams.length;
  }

  /** Fixed simulation ticks make browser frame rate independent of traffic. */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= STEP) {
      this.tick(STEP);
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }
  }

  advanceSignal(dt) {
    this.stageElapsed += dt;
    if (this.stage === 'green' && this.stageElapsed + 1e-9 >= this.phases[this.phaseIndex].duration) {
      this.closedGreenElapsed = this.stageElapsed;
      this.stage = 'yellow'; this.stageElapsed = 0;
    } else if (this.stage === 'yellow' && this.stageElapsed + 1e-9 >= this.timing.yellow) {
      this.stage = this.phases[this.phaseIndex].drainGroups?.length ? 'drain' : 'clearance'; this.stageElapsed = 0;
    } else if (this.stage === 'drain' && !this.hasPhaseTraffic()) {
      this.stage = 'drainYellow'; this.stageElapsed = 0;
    } else if (this.stage === 'drainYellow' && this.stageElapsed + 1e-9 >= this.timing.yellow) {
      this.stage = 'clearance'; this.stageElapsed = 0;
    } else if (this.stage === 'clearance' && this.stageElapsed + 1e-9 >= this.timing.allRed &&
      !this.hasPhaseTraffic()) {
      this.phaseIndex = (this.phaseIndex + 1) % this.phases.length;
      if (this.phaseIndex === 0) this.cycle++;
      this.phaseSerial++;
      this.stage = 'redAmber'; this.stageElapsed = 0;
      this.bookTransitPhase(this.elapsed + this.timing.redAmber);
    } else if (this.stage === 'redAmber' && this.stageElapsed + 1e-9 >= this.timing.redAmber) {
      this.stage = 'green'; this.stageElapsed = 0;
    }
  }

  hasPhaseTraffic() {
    const drainGroups = this.phases[this.phaseIndex].drainGroups ?? [];
    const successor = this.phases[(this.phaseIndex + 1) % this.phases.length];
    const occupancy = new Map();
    for (const vehicle of this.vehicles) for (const reservation of vehicle.reservations) {
      occupancy.set(reservation.id, (occupancy.get(reservation.id) ?? 0) + 1);
    }
    return this.trams.some(tram => tram.committed && tram.distance - tram.length / 2 <= tram.route.clearDistance) || this.vehicles.some(vehicle => {
      if (vehicle.committedStops.some(commitment => {
        if (commitment.phaseSerial !== this.phaseSerial) return false;
        const stop = vehicle.route.stops[commitment.index];
        if (vehicle.distance - vehicle.length / 2 > stop.clearDistance) return false;
        const receivingGroup = vehicle.route.stops[commitment.index + 1]?.group;
        // A queue intentionally extending into its entry curve can hand over
        // only to the phase that opens AND drains its receiving middle signal.
        // Its side entry yields to that curve; the middle signal then remains
        // green until every inherited vehicle has cleared. Other locations
        // retain the ordinary requirement to reach a safe holding area first.
        const handsOver = stop.storage?.allowOverflow && vehicle.passedGateIndex === commitment.index &&
          successor.groups.includes(receivingGroup) && successor.drainGroups?.includes(receivingGroup);
        return !handsOver;
      })) return true;
      const nextStop = vehicle.route.stops[vehicle.passedGateIndex + 1];
      const storageFull = nextStop?.storage && !nextStop.storage.allowOverflow && (occupancy.get(nextStop.storage.id) ?? 0) >= nextStop.storage.capacity;
      // Drain admitted cars, including a manually shortened phase. A vehicle
      // whose receiving median is full can remain at this middle signal once
      // its rear has cleared the preceding gate's safe holding point. Waiting
      // for that perpendicular median to empty here would deadlock both axes.
      return vehicle.passedGateIndex >= 0 && drainGroups.includes(nextStop?.group) && !storageFull;
    });
  }

  chooseRoute(vehicle, occupiedStorage) {
    const original = vehicle.route;
    if (!original.choiceGroup || vehicle.passedGateIndex >= 0) return;
    const freePlaces = route => {
      const storage = route.stops[0].storage;
      return storage ? storage.capacity - (occupiedStorage.get(storage.id) ?? 0) : Infinity;
    };
    let chosen = original;
    for (const candidate of this.routes) {
      if (candidate.choiceGroup === original.choiceGroup && candidate.laneId === original.laneId && candidate.group === original.group &&
        candidate.vehicleKinds.includes(vehicle.kind) && freePlaces(candidate) > freePlaces(chosen)) chosen = candidate;
    }
    if (chosen === original) return;
    // Alternatives share their physical approach. Preserve stationing relative
    // to the first stop; the choice becomes immutable as soon as it is passed.
    vehicle.distance += chosen.stopDistance - original.stopDistance;
    vehicle.route = chosen;
    vehicle.routeId = chosen.id;
    vehicle.turn = chosen.turn ?? 'straight';
    Object.assign(vehicle, samplePath(chosen.path, vehicle.distance));
  }

  // Signed lane-relative center separation; Infinity means unrelated paths.
  separation(follower, leader) {
    if (follower.id === leader.id) return Infinity;
    const route = follower.route, other = leader.route;
    if (route.id === other.id) return leader.distance - follower.distance;
    if (route.laneId === other.laneId && follower.distance <= route.stopDistance + 7 && leader.distance <= other.stopDistance + 7) {
      return (leader.distance - other.stopDistance) - (follower.distance - route.stopDistance);
    }
    for (const [section, shared] of route.sharedSections.get(other.id) ?? []) {
      if (follower.distance >= section.startDistance - follower.length - GAP && follower.distance <= section.endDistance + follower.length / 2 &&
        leader.distance >= shared.startDistance - leader.length - GAP && leader.distance <= shared.endDistance + leader.length / 2) {
        return (leader.distance - shared.startDistance) - (follower.distance - section.startDistance);
      }
    }
    // Begin checking a shared outlet before the physical join, so a vehicle
    // cannot enter the shared segment inside an existing queue's headway.
    if (route.exitId === other.exitId && follower.distance >= route.mergeDistance - follower.length - GAP && leader.distance >= other.mergeDistance - leader.length - GAP) {
      return (route.length - follower.distance) - (other.length - leader.distance);
    }
    return Infinity;
  }

  fanoutClearance(vehicle, other) {
    const route = vehicle.route, neighbor = other.route;
    if (vehicle.id === other.id || route.laneId !== neighbor.laneId || !route.stops[0].storage?.allowOverflow ||
      !neighbor.stops[0].storage?.allowOverflow || route.stops[0].storage.id === neighbor.stops[0].storage.id ||
      vehicle.distance < route.stopDistance + 5 || vehicle.distance > route.stops[1].distance + vehicle.length ||
      other.distance < neighbor.stopDistance + 5 || other.distance > neighbor.stops[1].distance + other.length ||
      Math.hypot(vehicle.x - other.x, vehicle.z - other.z) > 25) return Infinity;
    // Different receiving lanes become independent as soon as their actual
    // swept bodies separate. Check the approaching path, not an artificial
    // station shared by all turning lanes; an empty parallel lane stays usable.
    const end = Math.min(route.stops[1].distance + vehicle.length,
      vehicle.distance + 12 + vehicle.speed * 1.5 + vehicle.speed ** 2 / 10);
    for (let distance = vehicle.distance; distance <= end; distance += 0.4) {
      if (bodyConflict(samplePath(route.path, distance), vehicle, other)) return Math.max(0, distance - vehicle.distance - 0.4);
    }
    return Infinity;
  }

  tick(dt) {
    // Snapshot only display state. Physics, RNG order and collision decisions
    // continue to use the unchanged current body objects throughout this tick.
    for (const vehicle of this.vehicles) captureRenderPose(this.previousRenderPoses, vehicle);
    for (const tram of this.trams) captureRenderPose(this.previousRenderPoses, tram);
    this.elapsed += dt;
    this.spawnTrams();
    for (const vehicle of this.vehicles) {
      if (vehicle.committed && vehicle.passedGateIndex < 0) {
        vehicle.passedGateIndex = 0;
        vehicle.committedStops.push({ index: 0, phaseSerial: this.phaseSerial });
      }
      vehicle.committedStops = vehicle.committedStops.filter(commitment =>
        vehicle.distance - vehicle.length / 2 <= vehicle.route.stops[commitment.index].clearDistance);
      vehicle.committed = vehicle.committedStops.length > 0;
      vehicle.reservations = vehicle.reservations.filter(reservation => vehicle.distance - vehicle.length / 2 <= reservation.releaseDistance);
    }
    this.advanceSignal(dt);
    this.moveTrams(dt);
    if (this.density > 0) for (const route of this.routes) {
      const due = this.arrivals.get(route.id) - dt;
      if (due > 1e-9) { this.arrivals.set(route.id, due); continue; }
      if (this.hasArrivalSpace(route)) this.spawnArrival(route);
      else this.arrivals.set(route.id, 0);
    }
    this.spawnMinimumArrivals();

    const occupiedStorage = new Map(), storageEntryGroups = new Map();
    const occupyStorage = (id, group) => {
      occupiedStorage.set(id, (occupiedStorage.get(id) ?? 0) + 1);
      if (!storageEntryGroups.has(id)) storageEntryGroups.set(id, new Set());
      storageEntryGroups.get(id).add(group);
    };
    for (const vehicle of this.vehicles) for (const reservation of vehicle.reservations) {
      occupyStorage(reservation.id, vehicle.route.stops[0].group);
    }
    for (const vehicle of this.vehicles) this.chooseRoute(vehicle, occupiedStorage);
    const vehiclesByRoute = new Map();
    const unclearedEntryGroups = new Set();
    for (const vehicle of this.vehicles) {
      if (!vehiclesByRoute.has(vehicle.routeId)) vehiclesByRoute.set(vehicle.routeId, []);
      vehiclesByRoute.get(vehicle.routeId).push(vehicle);
      if (vehicle.passedGateIndex >= 0 && vehicle.distance - vehicle.length / 2 <= vehicle.route.stops[0].clearDistance) {
        unclearedEntryGroups.add(vehicle.route.stops[0].group);
      }
    }
    const moves = this.vehicles.map(vehicle => {
      let maximumAdvance = Infinity;
      let acceleration = 2.1 * (1 - (vehicle.speed / vehicle.route.speed) ** 4);
      const considerObstacle = (centerDistance, length, speed) => {
        const gap = centerDistance - (vehicle.length + length) / 2;
        const available = Math.max(0, gap - GAP);
        maximumAdvance = Math.min(maximumAdvance, available);
        const desiredGap = GAP + Math.max(0, vehicle.speed * 1.1 +
          vehicle.speed * (vehicle.speed - speed) / (2 * Math.sqrt(2.1 * 3.2)));
        acceleration = Math.min(acceleration, 2.1 * (1 - (vehicle.speed / vehicle.route.speed) ** 4 - (desiredGap / Math.max(0.1, gap)) ** 2));
      };
      for (const routeId of vehicle.route.followRouteIds) for (const leader of vehiclesByRoute.get(routeId) ?? []) {
        const separation = this.separation(vehicle, leader);
        if (separation > 0 && Number.isFinite(separation)) considerObstacle(separation, leader.length, leader.speed);
        const clearance = this.fanoutClearance(vehicle, leader);
        if (Number.isFinite(clearance)) considerObstacle(clearance + (vehicle.length + leader.length) / 2 + GAP, leader.length, 0);
      }
      const stopIndex = vehicle.passedGateIndex + 1;
      const stop = vehicle.route.stops[stopIndex];
      const storageFull = stop?.storage && !stop.storage.allowOverflow && (occupiedStorage.get(stop.storage.id) ?? 0) >= stop.storage.capacity;
      const yields = stop?.yieldToGroups?.some(group => unclearedEntryGroups.has(group));
      const approachStop = vehicle.route.stops[0];
      const approach = approachStop.yieldApproach;
      const pendingApproach = approach && !vehicle.yieldApproachPassed;
      const approachFull = pendingApproach && (occupiedStorage.get(approachStop.storage.id) ?? 0) >= approachStop.storage.capacity;
      const approachYields = pendingApproach && approachStop.yieldToGroups?.some(group => unclearedEntryGroups.has(group));
      const approachBlocked = approachFull || approachYields;
      // Capacity alone still requires a free slot at the yield point, but
      // following our own traffic is ordinary car-following, not cautious
      // entry behind a crossing queue. Include priority cars already inside
      // this median until their rears release their reservations.
      const creepRequired = approachYields || (approachFull && approachStop.yieldToGroups?.some(
        group => storageEntryGroups.get(approachStop.storage.id)?.has(group)));
      const limitAt = distance => {
        const distanceToStop = distance - vehicle.length / 2 - STOP_MARGIN - vehicle.distance;
        maximumAdvance = Math.min(maximumAdvance, Math.max(0, distanceToStop));
        // A virtual leader produces smooth approach braking; the final clamp
        // guarantees the front bumper cannot jump a stop line in a long frame.
        const targetSpeed = Math.sqrt(2 * 2.7 * Math.max(0, distanceToStop));
        acceleration = Math.min(acceleration, (targetSpeed - vehicle.speed) * 2.5);
      };
      if (stop && (this.getSignal(stop.group) !== 'green' || (!stop.yieldApproach && (storageFull || yields)))) limitAt(stop.distance);
      if (approachBlocked) limitAt(approach.distance);
      if (creepRequired) {
        // Brake before the outer line so the admitted approach is walking pace,
        // with no instantaneous speed change when the gate becomes committed.
        const beforeEntry = Math.max(0, approachStop.distance - vehicle.length / 2 - vehicle.distance);
        // Solve the braking envelope at the END of this tick; evaluating it at
        // the old position leaves a small overspeed on the crossing tick.
        const brakingStep = 2.7 * dt;
        const targetSpeed = Math.max(approach.speed,
          Math.sqrt(brakingStep ** 2 + approach.speed ** 2 + 2 * 2.7 * beforeEntry) - brakingStep);
        acceleration = Math.min(acceleration, (targetSpeed - vehicle.speed) / dt);
      }
      let speed = Math.max(0, vehicle.speed + clamp(acceleration, -5, 2.1) * dt);
      let advance = speed * dt;
      if (advance > maximumAdvance) { advance = maximumAdvance; speed = advance / dt; }
      const crossesGate = stop && vehicle.distance + advance + vehicle.length / 2 > stop.distance && this.getSignal(stop.group) === 'green' && (stop.yieldApproach || (!storageFull && !yields));
      const crossesApproach = pendingApproach && !approachBlocked && vehicle.distance + advance + vehicle.length / 2 > approach.distance;
      const reserves = crossesApproach ? approachStop : crossesGate && !stop.yieldApproach ? stop : null;
      if (reserves?.storage) {
        occupyStorage(reserves.storage.id, approachStop.group);
        vehicle.reservations.push({ id: reserves.storage.id,
          releaseDistance: vehicle.route.stops[crossesApproach ? 1 : stopIndex + 1]?.distance ?? reserves.clearDistance });
      }
      return { vehicle, speed, advance, crossesGate, crossesApproach, stopIndex, braking: speed < vehicle.speed - 0.015 || speed < 0.15 };
    });
    for (const { vehicle, speed, advance, braking, crossesGate, crossesApproach, stopIndex } of moves) {
      vehicle.distance += advance;
      vehicle.speed = speed;
      vehicle.braking = braking;
      if (crossesApproach) vehicle.yieldApproachPassed = true;
      if (crossesGate) {
        vehicle.passedGateIndex = stopIndex;
        vehicle.committedStops.push({ index: stopIndex, phaseSerial: this.phaseSerial });
        vehicle.committed = true;
      }
      Object.assign(vehicle, samplePath(vehicle.route.path, vehicle.distance));
    }
    const count = this.vehicles.length;
    this.vehicles = this.vehicles.filter(vehicle => vehicle.distance < vehicle.route.length);
    this.passed += count - this.vehicles.length;
  }
}
