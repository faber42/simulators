import { DOOR_OFFSETS, EXCHANGE_DOORS, ease } from './traffic.mjs';

export const MAX_EXCHANGE_PASSENGERS = 4;
export const exchangeCount = (station, slot, outgoing) => 1 + (station.index * (outgoing ? 7 : 5) + slot * (outgoing ? 5 : 3) + (outgoing ? 2 : 3)) % MAX_EXCHANGE_PASSENGERS;

function variation(station, slot, ordinal, salt) {
  const n = Math.sin((station.index + 1) * 127.1 + slot * 311.7 + ordinal * 74.7 + salt * 19.3) * 43758.5453;
  return n - Math.floor(n);
}

// Arc-length sampling makes walking speed independent of the bend.
function curve(points) {
  const samples = [{ s: points[0][0], x: points[0][1], distance: 0 }];
  for (let i = 1; i <= 128; i++) {
    const t = i / 128, u = 1 - t;
    const value = axis => u ** 3 * points[0][axis] + 3 * u * u * t * points[1][axis]
      + 3 * u * t * t * points[2][axis] + t ** 3 * points[3][axis];
    const s = value(0), x = value(1), previous = samples.at(-1);
    samples.push({ s, x, distance: previous.distance + Math.hypot(s - previous.s, x - previous.x) });
  }
  return samples;
}
function append(path, section) {
  const distance = path.at(-1).distance;
  for (const p of section.slice(1)) path.push({ ...p, distance: distance + p.distance });
}

function entryPath(waitS, waitX) {
  const path = curve([[0, .76], [0, 1.04], [0, 1.32], [0, 1.6]]);
  append(path, curve([[0, 1.6], [0, 2.27], [waitS * .64, waitX - .18], [waitS, waitX]]));
  return path;
}

function exitPath(stair, direction) {
  // Walk straight through the gap between both waiting groups before turning.
  const path = curve([[0, .82], [0, 1.5], [0, 2.2], [0, 2.9]]);
  append(path, curve([[0, 2.9], [0, 3.1485], [direction * .2015, 3.35], [direction * .45, 3.35]]));
  append(path, curve([[direction * .45, 3.35], [direction * 1.4, 3.35], [direction * 2.3, 3.35], [direction * 3.2, 3.35]]));
  if (direction < 0) {
    // Pass the foot of the stairs before making a broad turn into the flight.
    // This keeps the route clear of the solid side wall and the column at +36.
    const last = path.at(-1);
    append(path, curve([[last.s, 3.35], [last.s - 1, 3.35], [stair - 1, 3.35], [stair - 2, 3.35]]));
    append(path, curve([[stair - 2, 3.35], [stair - 5.5, 3.35], [stair - 5.5, 5.75], [stair - 2, 5.75]]));
  } else {
    const last = path.at(-1);
    append(path, curve([[last.s, 3.35], [stair - 6, 3.35], [stair - 6, 5.75], [stair - 2, 5.75]]));
  }
  path.stairDistance = path.at(-1).distance;
  append(path, curve([[stair - 2, 5.75], [stair + 1, 5.75], [stair + 5, 5.75], [stair + 8.5, 5.75]]));
  return path;
}

function along(path, distance) {
  const last = path.at(-1);
  if (distance >= last.distance) return { s: last.s + distance - last.distance, x: last.x };
  let low = 0, high = path.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (path[mid].distance < distance) low = mid; else high = mid;
  }
  const a = path[low], b = path[high], t = Math.max(0, (distance - a.distance) / (b.distance - a.distance));
  return { s: a.s + (b.s - a.s) * t, x: a.x + (b.x - a.x) * t };
}

function travel(time, length, speed = 1.45, ramp = .2) {
  const duration = length / speed + ramp;
  const t = Math.max(0, Math.min(duration, time));
  const distance = t < ramp ? speed * t * t / (2 * ramp)
    : t > duration - ramp ? length - speed * (duration - t) ** 2 / (2 * ramp)
      : speed * (t - ramp / 2);
  return { distance, duration, amount: Math.min(1, t / ramp, (duration - t) / ramp) };
}

// Plans are immutable and bounded for endless routes. No randomness is drawn
// per frame, so pause, seeking and the two cameras always agree.
const plans = new Map();
function plan(station, slot) {
  const key = `${station.index}/${slot}`;
  if (plans.has(key)) return plans.get(key);
  const s = station.stop - DOOR_OFFSETS[EXCHANGE_DOORS[slot]];
  const direction = Math.sign(station.start + 36 - s) || 1;
  const incoming = [], outgoing = [];
  const path = exitPath(station.start + 36 - s, direction);
  let outDelay = slot * .035;
  for (let ordinal = 0; ordinal < MAX_EXCHANGE_PASSENGERS; ordinal++) {
    const random = salt => variation(station, slot, ordinal, salt);
    const longerPause = (variation(station, slot, 0, 14) > .5) === (ordinal === 1);
    outDelay += ordinal ? (longerPause ? .82 + .12 * random(11) : .6 + .08 * random(11)) : .12 * random(11);
    outgoing.push({ length: path.at(-1).distance, delay: outDelay, ramp: .26 + .12 * random(12),
      speed: Math.min(1.6 - ordinal * .045 + .06 * random(13), (outgoing.at(-1)?.speed ?? Infinity) - .015) });
  }
  const lastOut = outgoing[exchangeCount(station, slot, true) - 1];
  const clearAt = lastOut.delay + 2.08 / lastOut.speed + lastOut.ramp / 2 + .12;
  const firstSide = variation(station, slot, 0, 16) < .5 ? -1 : 1;
  let previousArrival = 0;
  for (let ordinal = 0; ordinal < MAX_EXCHANGE_PASSENGERS; ordinal++) {
    const random = salt => variation(station, slot, ordinal, salt), row = Math.floor(ordinal / 2);
    const sign = firstSide * (ordinal % 2 ? -1 : 1);
    const route = entryPath(1.12 + row * .84 + .16 * random(1), 2.36 + .1 * random(10));
    const length = route.at(-1).distance, ramp = .25 + .18 * random(3), speed = 1.4 + .3 * random(4), gap = .88 + .22 * random(5);
    const duration = length / speed + ramp / 2;
    const arriveAt = Math.max(clearAt + .12 * random(2) + duration, previousArrival + gap / speed + .05);
    incoming.push({ path: route, sign, length, delay: arriveAt - duration, ramp, gap, speed });
    previousArrival = arriveAt;
  }
  // Account for the entire alternating queue, including a slower leader's
  // virtual walk inside the car. Keep a margin before the eight-second close.
  const count = exchangeCount(station, slot, false);
  let finishAt = 0, followingGaps = 0;
  for (let i = count - 1; i >= 0; i--) {
    const q = incoming[i];
    finishAt = Math.max(finishAt, q.delay + (q.length + followingGaps) / q.speed + q.ramp / 2);
    followingGaps += q.gap;
  }
  const tempo = Math.max(1, (finishAt - clearAt) / (7.75 - clearAt));
  for (const q of incoming) { q.delay = clearAt + (q.delay - clearAt) / tempo; q.speed *= tempo; q.ramp /= tempo; }
  const result = { s, direction, incoming, outgoing, path };
  plans.set(key, result);
  if (plans.size > 48) plans.delete(plans.keys().next().value);
  return result;
}

function boardingMotion(profiles, ordinal, age) {
  let leader = Infinity, leaderVelocity = 0, result;
  for (let i = 0; i <= ordinal; i++) {
    const profile = profiles[i], { length, speed, ramp, gap, delay } = profile;
    // Continue virtually inside the car so a follower does not jump forward
    // when their leader vanishes into the vestibule.
    const free = travel(age - delay, length + MAX_EXCHANGE_PASSENGERS * 1.2, speed, ramp);
    const coordinate = Math.min(free.distance - length, leader - gap);
    const velocity = coordinate < free.distance - length ? leaderVelocity : free.amount * speed;
    const distance = Math.max(0, Math.min(length, coordinate + length));
    result = { ...profile, distance, amount: distance > 0 && distance < length ? Math.min(1, velocity / 1.45) : 0 };
    leader = coordinate; leaderVelocity = velocity;
  }
  return result;
}

// Reserve the actual curved corridors, including the earlier service's onward
// walk. This also keeps ordinary platform walkers out of the exchange routes.
const corridors = new Map();
export function exchangeCorridors(station) {
  if (corridors.has(station.index)) return corridors.get(station.index);
  const points = [];
  for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) {
    const p = plan(station, slot);
    const routes = [{ path: p.path, sign: 1, length: p.path.stairDistance },
      ...p.incoming.slice(0, exchangeCount(station, slot, false))];
    for (const { path, sign, length } of routes) {
      for (let distance = 0; distance <= length + .4; distance += .65) {
        const at = along(path, Math.min(length, distance));
        const location = { s: p.s + at.s * sign, x: station.side * at.x };
        if (at.x > 1.7 && !points.some(other => Math.hypot(other.s - location.s, other.x - location.x) < .45)) points.push(location);
      }
    }
  }
  corridors.set(station.index, points);
  if (corridors.size > 12) corridors.delete(corridors.keys().next().value);
  return points;
}

export function exchangePose(station, slot, outgoing, age, _previousService = false, ordinal = 0) {
  const p = plan(station, slot), profile = (outgoing ? p.outgoing : p.incoming)[ordinal];
  const length = profile.length;
  const motion = outgoing ? travel(age - profile.delay, length + 3, profile.speed, profile.ramp)
    : boardingMotion(p.incoming, ordinal, age);
  // Alighters keep their pace until the upper landing hides them completely.
  if (outgoing) motion.distance = Math.min(length, motion.distance);
  const progress = Math.min(1, motion.distance / length), walking = motion.amount > .001;
  const path = outgoing ? p.path : profile.path, coordinate = outgoing ? motion.distance : length - motion.distance;
  const position = along(path, coordinate), sign = outgoing ? 1 : profile.sign;
  const a = along(path, Math.max(0, coordinate - .06)), b = along(path, coordinate + .06);
  const facing = outgoing ? 1 : -1;
  const routeYaw = Math.atan2(station.side * (b.x - a.x) * facing, -sign * (b.s - a.s) * facing);
  const waitingYaw = -station.side * Math.PI / 2;
  // Turn towards the actual diagonal walk, without an extra sideways step.
  const turn = ease((age - profile.delay + .4) / .5);
  const yaw = outgoing ? routeYaw : waitingYaw + Math.atan2(Math.sin(routeYaw - waitingYaw), Math.cos(routeYaw - waitingYaw)) * turn;
  const s = p.s + sign * position.s;
  const y = outgoing && coordinate > path.stairDistance ? .945 + Math.max(0, Math.min(1, (s - station.start - 35.8) / 7.25)) * 3.805 : .945;
  return { s, x: station.side * position.x, y,
    visible: ordinal < exchangeCount(station, slot, outgoing) && progress < 1 && (!outgoing || age >= profile.delay),
    walking, yaw, amount: motion.amount,
    stridePhase: motion.distance * (5.9 + 1.2 * variation(station, slot, ordinal, outgoing ? 6 : 7))
      + variation(station, slot, ordinal, outgoing ? 8 : 9) * Math.PI * 2,
    distance: motion.distance, progress, door: EXCHANGE_DOORS[slot], outgoing };
}
