import { boardingPose } from './boarding.mjs';
import { trackAngle } from './route.mjs';

const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const distance = (a, b) => Math.hypot(a.s - b.s, a.x - b.x);

// Closest approach of two swept discs, including head-on and crossing paths.
export function closestApproach(a, nextA, b, nextB) {
  const s = a.s - b.s, x = a.x - b.x;
  const ds = nextA.s - a.s - nextB.s + b.s, dx = nextA.x - a.x - nextB.x + b.x;
  const length = ds * ds + dx * dx;
  const t = length ? Math.max(0, Math.min(1, -(s * ds + x * dx) / length)) : 0;
  return Math.hypot(s + ds * t, x + dx * t);
}

function poseAt(p, train, time) {
  if (p.halt) {
    const settle = smooth((time - p.halt.time) / .35);
    return { ...p.halt.pose, amount: p.halt.pose.amount * (1 - settle),
      moving: false, settled: true, settle, blocked: true };
  }
  if (p.journey) return boardingPose(p.journey, { ...train, time });
  if (p.walker) {
    const elapsed = time - p.walkStartedAt, phase = elapsed * p.pace * .24;
    const s = p.s + Math.sin(phase) * 2.3, turn = Math.cos(phase);
    return { s, x: p.x, distance: elapsed * p.pace * .55,
      stridePhase: elapsed * p.pace * 3 + p.phase,
      amount: Math.abs(turn), moving: Math.abs(turn) > .01,
      yaw: Math.PI * smooth((turn + .13) / .26) - trackAngle(s), turn: 1, settle: 0 };
  }
  return { s: p.s, x: p.x, distance: 0, amount: 0, moving: false, turn: 0, settle: 0 };
}

export function updatePedestrians(people, train) {
  const now = train.time, lookAhead = .65;
  const states = people.map(p => {
    p.walkStartedAt ??= now;
    const current = poseAt(p, train, now);
    return { p, current, previous: p.motion || current,
      future: poseAt(p, train, now + lookAhead) };
  });
  const stopping = new Set();
  if (!train.paused) for (let i = 0; i < states.length; i++) for (let j = i + 1; j < states.length; j++) {
    const a = states[i], b = states[j];
    const movingA = a.current.moving || distance(a.previous, a.current) > .001;
    const movingB = b.current.moving || distance(b.previous, b.current) > .001;
    if (!movingA && !movingB) continue;
    const clearance = .78 * Math.max(a.p.height || 1, b.p.height || 1);
    const swept = closestApproach(a.previous, a.current, b.previous, b.current);
    const anticipated = closestApproach(a.current, a.future, b.current, b.future);
    const collision = swept < clearance && swept < distance(a.previous, b.previous) - .001;
    const approaching = anticipated < clearance && anticipated < distance(a.current, b.current) - .005;
    if (collision || approaching) {
      if (movingA) stopping.add(a);
      if (movingB) stopping.add(b);
    }
  }
  for (const state of states) {
    const { p, previous, current } = state;
    // Keep the last displayed safe position; do not move through an obstacle
    // between slow frames, reroute, or restart the walk into the same person.
    if (stopping.has(state)) p.halt = { pose: previous, time: now };
    p.motion = p.halt ? poseAt(p, train, now) : current;
  }
}
