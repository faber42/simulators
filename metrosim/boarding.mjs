import { point } from './route.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

// Walk in the clear strip between the tactile paving and the columns. People
// near the front of the platform walk back towards the first doors instead.
export function boardingPlan(s, x, st, rng, reserved = []) {
  let targetS = Math.min(st.stop - 3, s + 6 + rng() * 9);
  const lane = Math.min(Math.abs(x), 3.22);
  const targetX = Math.min(lane, 2.53 + rng() * .35);
  // In particular, several people near the front must not all converge on
  // the same clamped endpoint. Leave room for shoulders at each waiting spot.
  while (reserved.some(p => Math.hypot(targetS - p[0], st.side * targetX - p[1]) < .76)) targetS -= .82;
  reserved.push([targetS, st.side * targetX]);
  const direction = Math.sign(targetS - s) || 1;
  const lead = Math.min(.9, Math.abs(targetS - s) * .3), finish = Math.min(1.3, Math.abs(targetS - s) * .4);
  const path = [[s, x], [s + direction * lead, st.side * lane],
    [targetS - direction * finish, st.side * lane], [targetS, st.side * targetX]];
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  return { path, lengths, length: lengths.reduce((a, b) => a + b, 0),
    speed: .86 + rng() * .37, delay: .3 + rng() * 2.4,
    triggerS: Math.max(st.start - 42, s - 54 - rng() * 40),
    startTime: null, stop: st.stop };
}

function onPath(plan, distance) {
  let remaining = clamp(distance, 0, plan.length);
  for (let i = 0; i < plan.lengths.length; i++) {
    const length = plan.lengths[i];
    if (remaining <= length || i === plan.lengths.length - 1) {
      const t = length ? clamp(remaining / length, 0, 1) : 1;
      return { s: plan.path[i][0] + (plan.path[i + 1][0] - plan.path[i][0]) * t,
        x: plan.path[i][1] + (plan.path[i + 1][1] - plan.path[i][1]) * t };
    }
    remaining -= length;
  }
}

export function boardingPose(plan, train) {
  if (plan.startTime === null && train.s >= plan.triggerS && train.s <= plan.stop)
    plan.startTime = train.time + plan.delay;
  const elapsed = plan.startTime === null ? -1 : train.time - plan.startTime;
  const ramp = .65, duration = plan.length / plan.speed + ramp;
  const t = clamp(elapsed, 0, duration);
  // Integrate a trapezoidal speed profile, using simulation time so P freezes
  // both feet and translation. Frame rate cannot change the walking speed.
  const distance = t < ramp ? plan.speed * t * t / (2 * ramp)
    : t > duration - ramp ? plan.length - plan.speed * (duration - t) ** 2 / (2 * ramp)
      : plan.speed * (t - ramp / 2);
  const position = onPath(plan, distance);
  const a = onPath(plan, distance - .45), b = onPath(plan, distance + .45);
  const pa = point(a.s, a.x), pb = point(b.s, b.x);
  return { ...position, distance, moving: elapsed > 0 && elapsed < duration,
    amount: smooth(t / ramp) * smooth((duration - t) / ramp),
    yaw: Math.atan2(pb[0] - pa[0], pb[2] - pa[2]),
    turn: smooth((elapsed + .45) / .7), settled: elapsed >= duration,
    settle: smooth((elapsed - duration + .45) / 1.1) };
}
