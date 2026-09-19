import { point, trackX } from './route.mjs';
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angleDifference = a => Math.atan2(Math.sin(a), Math.cos(a));
export function passengerAttention(passenger, trainS, time) {
  const distance = passenger.s - trainS, onset = passenger.noticeDistance ?? 44 + Math.sin(passenger.phase) * 26;
  const attention = smooth(onset - distance, 0, Math.min(30, onset * .7)) * (1 - smooth(-distance, 6, 24));
  const p = point(passenger.s, passenger.x), dx = trackX(trainS) - p[0], dz = -trainS - p[2];
  const target = Math.atan2(dx, dz);
  const bodyYaw = passenger.baseY + angleDifference(target - passenger.baseY) * attention * .64;
  const headYaw = Math.max(-1.05, Math.min(1.05, angleDifference(target - bodyYaw))) * attention + Math.sin(time * .32 + passenger.phase) * .035 * (1 - attention);
  const pitch = Math.atan2((passenger.eyeHeight ?? .945 + 1.66 * passenger.height) - 2.22, Math.max(1.2, Math.hypot(dx, dz)));
  return { attention, bodyYaw, headYaw, pitch: (passenger.phone ? .18 : .025) * (1 - attention) + pitch * attention };
}
