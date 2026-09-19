import * as T from '../pinsim/three.module.min.js';
import { passengerAttention } from './attention.mjs';

export const SEAT_TOP = 1.41;
export const SEAT_X = 6.72;

export function seatedPose(p, trainS, time) {
  const t = time * p.pace + p.phase;
  // Fit the hips to the fixed seat and both soles to the platform, including
  // passengers of different heights. The lower legs remain vertical.
  p.body.position.y = (SEAT_TOP - p.rootY) / p.height + .075;
  const thighAngle = -Math.acos(T.MathUtils.clamp((p.body.position.y - .5) / .43, -1, 1));
  p.person.rotation.y = p.baseY;
  p.body.rotation.z = Math.sin(t * .55) * .005;
  p.chest.rotation.x = p.phone ? .06 : .015;
  for (let i = 0; i < 2; i++) {
    p.legs[i].pivot.rotation.x = thighAngle;
    p.legs[i].shin.rotation.x = -thighAngle;
    p.arms[i].pivot.rotation.x = -.48 + Math.sin(t * .6 + i) * .012;
    p.arms[i].forearm.rotation.x = -.48;
  }
  if (p.phone) {
    p.arms[1].pivot.rotation.x = -.4;
    p.arms[1].forearm.rotation.x = -1.18 + Math.sin(t * .7) * .016;
    p.arms[1].wrist.rotation.x = .62;
    p.head.rotation.set(.33 + Math.sin(t * .45) * .012, .06, 0);
  } else {
    const reaction = passengerAttention({ ...p, eyeHeight: p.rootY + (p.body.position.y + .72) * p.height }, trainS, time);
    const turn = reaction.headYaw + reaction.bodyYaw - p.baseY;
    p.head.rotation.set(reaction.pitch, T.MathUtils.clamp(Math.atan2(Math.sin(turn), Math.cos(turn)), -1.05, 1.05), 0);
  }
}
