import { DOOR_OFFSETS, EXCHANGE_DOORS, ease } from './traffic.mjs';

export const MAX_EXCHANGE_PASSENGERS = 3;
export const exchangeCount = (station, slot, outgoing) => 1 + (station.index * (outgoing ? 7 : 5) + slot * (outgoing ? 5 : 4) + 2) % MAX_EXCHANGE_PASSENGERS;

// Constant walking speed with short acceleration/deceleration at the ends.
// Followers retain their spacing instead of each easing over a different path.
function travel(time, length) {
  const speed = 1.45, ramp = .2, duration = length / speed + ramp;
  const t = Math.max(0, Math.min(duration, time));
  const distance = t < ramp ? speed * t * t / (2 * ramp)
    : t > duration - ramp ? length - speed * (duration - t) ** 2 / (2 * ramp)
      : speed * (t - ramp / 2);
  return { distance, duration, amount: Math.min(1, t / ramp, (duration - t) / ramp) };
}

function along(path, distance) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= length || i === path.length - 1) {
      const t = Math.max(0, Math.min(1, distance / length));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    distance -= length;
  }
}

export function exchangePose(station, slot, outgoing, age, previousService = false, ordinal = 0) {
  const door = EXCHANGE_DOORS[slot], s = station.stop - DOOR_OFFSETS[door];
  // Alighters use one lane and fan out along the platform, furthest person
  // first. Boarders follow a spaced queue from the other side of the opening.
  const path = outgoing ? [[.28, .82], [.28, 3.3], [2.35 - ordinal * .9, 3.3]]
    : [[-.9 - ordinal, 2.95], [-.28, 2.95], [-.28, .76]];
  const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
  const delay = slot * .08 + (outgoing ? ordinal * .72 : 3.85);
  const motion = travel(age - delay, length), progress = motion.distance / length;
  const position = along(path, motion.distance), ahead = along(path, Math.min(length, motion.distance + .16));
  const behind = along(path, Math.max(0, motion.distance - .16));
  // Earlier alighters continue clear of all three places used by our service.
  const stepAside = outgoing && previousService ? ease((age - 4 - ordinal * .1) / 2.8) : 0;
  const movingAside = stepAside > 0 && stepAside < 1;
  const walking = motion.amount > .001 || movingAside;
  const waitingYaw = -station.side * Math.PI / 2;
  const queueYaw = waitingYaw + Math.atan2(Math.sin(Math.PI - waitingYaw), Math.cos(Math.PI - waitingYaw)) * ease((age - delay + .35) / .35);
  const yaw = movingAside ? Math.PI : walking ? Math.atan2(station.side * (ahead[1] - behind[1]), -(ahead[0] - behind[0]))
    : outgoing ? progress === 0 ? station.side * Math.PI / 2 : Math.PI : queueYaw;
  return { s: s + position[0] + 3.2 * stepAside, x: station.side * position[1],
    visible: ordinal < exchangeCount(station, slot, outgoing) && (outgoing ? age >= delay : progress < 1),
    walking, yaw, amount: movingAside ? Math.sin(Math.PI * stepAside) ** .4 : motion.amount,
    distance: motion.distance + 3.2 * stepAside, progress, door, outgoing };
}
