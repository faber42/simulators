// These are construction sections, not camera-relative lighting changes.
// 96/144 m lengths align with the scenery batches and concrete ring joints.
export const TUNNEL_FINISHES = ['soot', 'limestone', 'brick', 'concrete', 'chalk'];
export function tunnelFinish(s) {
  const block = Math.floor(s / 240), within = ((s % 240) + 240) % 240;
  return TUNNEL_FINISHES[((block * 2 + (within >= 96 ? 1 : 0)) % 5 + 5) % 5];
}
