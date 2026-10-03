/**
 * Renderer-independent traffic model. Distances are metres, time is seconds.
 * Route points use [east, south]; heading is atan2(dx, dz), for a +Z vehicle.
 * No DOM, Three.js or intersection-specific constants are required here.
 */
const STEP = 1 / 30;
const GAP = 2.2;
const STOP_MARGIN = 0.8;
const VEHICLE_TYPES = {
  car: { weight: 83, length: 4.5 },
  van: { weight: 14, length: 5.4 },
  bus: { weight: 3, length: 11.5 },
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

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
  constructor(config) {
    if (!config?.phases?.length || !config?.routes?.length) throw new Error('TrafficSimulation needs phases and routes.');
    this.config = config;
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
        return { ...stop, id: stop.id ?? `${route.id}-stop-${index}`, distance, clearDistance };
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
        vehicleKinds: [...new Set(vehicleKinds)],
        laneId: route.laneId ?? route.id, exitId: route.exitId ?? route.id,
        rate: Math.max(0, Number(route.rate) || 0), speed: Math.max(1, Number(route.speed) || 13.9) };
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
    this.passed = 0;
    this.phaseIndex = 0;
    this.stage = 'green';
    this.stageElapsed = 0;
    this.closedGreenElapsed = 0;
    this.phaseSerial = 0;
    this.cycle = 1;
    this.accumulator = 0;
    this.nextId = 1;
    this.vehicles = [];
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

  setDensity(value) {
    if (!Number.isFinite(value)) return;
    const wasZero = this.density === 0;
    const oldDensity = this.density;
    this.density = clamp(value, 0, 5);
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

  createVehicle(route, distance = 0) {
    // A location may restrict a tight curve to vehicles its geometry supports.
    // Preserve the usual fleet proportions within the permitted vehicle kinds.
    let variety = this.random() * route.vehicleKinds.reduce((sum, kind) => sum + VEHICLE_TYPES[kind].weight, 0);
    const kind = route.vehicleKinds.find(kind => (variety -= VEHICLE_TYPES[kind].weight) <= 0) ?? route.vehicleKinds[0];
    const length = VEHICLE_TYPES[kind].length;
    return { id: this.nextId++, routeId: route.id, route, distance, speed: 0, length, kind,
      color: Math.floor(this.random() * 10), turn: route.turn ?? 'straight', braking: false,
      committed: false, passedGateIndex: -1, committedStops: [], reservations: [],
      ...samplePath(route.path, distance) };
  }

  getSignal(group) {
    const phase = this.phases[this.phaseIndex];
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
      signals: Object.fromEntries([...groups].map(group => [group, this.getSignal(group)])) };
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
    } else if (this.stage === 'redAmber' && this.stageElapsed + 1e-9 >= this.timing.redAmber) {
      this.stage = 'green'; this.stageElapsed = 0;
    }
  }

  hasPhaseTraffic() {
    const drainGroups = this.phases[this.phaseIndex].drainGroups ?? [];
    return this.vehicles.some(vehicle => vehicle.committedStops.some(commitment =>
      commitment.phaseSerial === this.phaseSerial && vehicle.distance - vehicle.length / 2 <= vehicle.route.stops[commitment.index].clearDistance) ||
      // A manual early phase change must still release traffic waiting in the
      // median, even if its front has not yet crossed the newly green gate.
      (vehicle.passedGateIndex >= 0 && drainGroups.includes(vehicle.route.stops[vehicle.passedGateIndex + 1]?.group)));
  }

  // Signed lane-relative center separation; Infinity means unrelated paths.
  separation(follower, leader) {
    if (follower.id === leader.id) return Infinity;
    const route = follower.route, other = leader.route;
    if (route.id === other.id) return leader.distance - follower.distance;
    if (route.laneId === other.laneId && follower.distance <= route.stopDistance + 7 && leader.distance <= other.stopDistance + 7) {
      return (leader.distance - other.stopDistance) - (follower.distance - route.stopDistance);
    }
    // Begin checking a shared outlet before the physical join, so a vehicle
    // cannot enter the shared segment inside an existing queue's headway.
    if (route.exitId === other.exitId && follower.distance >= route.mergeDistance - follower.length - GAP && leader.distance >= other.mergeDistance - leader.length - GAP) {
      return (route.length - follower.distance) - (other.length - leader.distance);
    }
    return Infinity;
  }

  tick(dt) {
    this.elapsed += dt;
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
    if (this.density > 0) for (const route of this.routes) {
      const due = this.arrivals.get(route.id) - dt;
      if (due > 0) { this.arrivals.set(route.id, due); continue; }
      const free = !this.vehicles.some(vehicle => vehicle.route.laneId === route.laneId &&
        vehicle.distance - vehicle.route.stopDistance < 18 - route.stopDistance);
      if (free) {
        const vehicle = this.createVehicle(route);
        vehicle.speed = Math.min(route.speed, 8);
        this.vehicles.push(vehicle);
        this.arrivals.set(route.id, this.arrivalInterval(route));
      } else this.arrivals.set(route.id, 0);
    }

    const occupiedStorage = new Map();
    for (const vehicle of this.vehicles) for (const reservation of vehicle.reservations) {
      occupiedStorage.set(reservation.id, (occupiedStorage.get(reservation.id) ?? 0) + 1);
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
      for (const leader of this.vehicles) {
        const separation = this.separation(vehicle, leader);
        if (separation > 0 && Number.isFinite(separation)) considerObstacle(separation, leader.length, leader.speed);
      }
      const stopIndex = vehicle.passedGateIndex + 1;
      const stop = vehicle.route.stops[stopIndex];
      const storageFull = stop?.storage && (occupiedStorage.get(stop.storage.id) ?? 0) >= stop.storage.capacity;
      if (stop && (this.getSignal(stop.group) !== 'green' || storageFull)) {
        const distanceToStop = stop.distance - vehicle.length / 2 - STOP_MARGIN - vehicle.distance;
        maximumAdvance = Math.min(maximumAdvance, Math.max(0, distanceToStop));
        // A virtual leader produces smooth approach braking; the final clamp
        // guarantees the front bumper cannot jump a stop line in a long frame.
        const targetSpeed = Math.sqrt(2 * 2.7 * Math.max(0, distanceToStop));
        acceleration = Math.min(acceleration, (targetSpeed - vehicle.speed) * 2.5);
      }
      let speed = Math.max(0, vehicle.speed + clamp(acceleration, -5, 2.1) * dt);
      let advance = speed * dt;
      if (advance > maximumAdvance) { advance = maximumAdvance; speed = advance / dt; }
      const crossesGate = stop && vehicle.distance + advance + vehicle.length / 2 > stop.distance && this.getSignal(stop.group) === 'green' && !storageFull;
      if (crossesGate && stop.storage) {
        occupiedStorage.set(stop.storage.id, (occupiedStorage.get(stop.storage.id) ?? 0) + 1);
        vehicle.reservations.push({ id: stop.storage.id,
          releaseDistance: vehicle.route.stops[stopIndex + 1]?.distance ?? stop.clearDistance });
      }
      return { vehicle, speed, advance, crossesGate, stopIndex, braking: speed < vehicle.speed - 0.015 || speed < 0.15 };
    });
    for (const { vehicle, speed, advance, braking, crossesGate, stopIndex } of moves) {
      vehicle.distance += advance;
      vehicle.speed = speed;
      vehicle.braking = braking;
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
