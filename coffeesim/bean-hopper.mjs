// Deterministic teaching model: beans keep their size and leave through the
// grinder inlet one at a time. The remaining pile settles as stock is consumed.
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const HOPPER_GEOMETRY = Object.freeze({
  capacity: 145,
  origin: Object.freeze([0, 3.97, -.30]),
  inlet: Object.freeze([.10, -.268, -.17]),
  beanScale: Object.freeze([.79, .64, 1.35]),
});

export function getHopperState(state = {}) {
  const rawLevel = Number(state.beanLevel ?? 1);
  const level = Number.isFinite(rawLevel) ? clamp(rawLevel) : 1;
  const count = Math.ceil(level * HOPPER_GEOMETRY.capacity);
  const time = Number(state.time) || 0;
  const progress = clamp(Number(state.phaseProgress ?? .5));
  const grinding = Boolean(state.grind) && !state.resourceEmpty && !state.currentPuckDeposited && count > 0;
  const vibration = grinding ? smooth(progress / .08) * smooth((1 - progress) / .08) : 0;
  return {
    level, count, time, vibration,
    position: vibration ? [
      .0045 * Math.sin(time * 43) * vibration,
      .0024 * Math.sin(time * 61) * vibration,
      .0035 * Math.sin(time * 53) * vibration,
    ] : [0, 0, 0],
    rotation: vibration ? [
      .0025 * Math.sin(time * 47) * vibration,
      0,
      .003 * Math.sin(time * 37) * vibration,
    ] : [0, 0, 0],
  };
}

export function getBeanPose(index, hopper) {
  const { level, time, vibration } = hopper;
  const inlet = HOPPER_GEOMETRY.inlet;
  const spread = Math.pow(level, .22);
  const fullX = (rand(index * 11) - .5) * 1.91;
  const fullZ = (rand(index * 19) - .5) * 1.33;
  const radial = Math.hypot(fullX / 1.0, fullZ / .70) / Math.SQRT2;
  const baseX = mix(inlet[0], fullX, spread);
  const baseZ = mix(inlet[2], fullZ, spread);
  const baseY = -.097 + rand(index * 7) * .182 * level
    + .020 * radial * (1 - level);
  // The highest remaining index is next to be consumed. It first slides over
  // the pile to the inlet, then drops vertically through the hopper opening.
  const feed = 1 - smooth(level * HOPPER_GEOMETRY.capacity - index);
  const slide = smooth(feed / .65);
  const drop = smooth((feed - .60) / .40);
  const jiggle = vibration * (1 - slide);
  return {
    position: [
      mix(baseX, inlet[0], slide) + Math.sin(time * 37 + index * 2.3) * .0028 * jiggle,
      mix(baseY, inlet[1], drop) + Math.sin(time * 41 + index * 1.7) * .0018 * jiggle,
      mix(baseZ, inlet[2], slide) + Math.sin(time * 31 + index * 1.3) * .0028 * jiggle,
    ],
    rotation: [rand(index * 3) * 2 + slide * .25, rand(index * 13) * Math.PI * 2, rand(index * 29) * 2 + slide * .18],
    feed,
  };
}
