// A spatial model of the local destination number space, not a historical
// traffic-engineered exchange. Every pool has ten permanent equipment slots.
export const OFFICE = Object.freeze({ areas: 90, subscribers: 900_000, poolSize: 10,
  finalSelectors: 90_000, groupSelectors: 10_000, sourceFinders: 10,
  areaPitchX: 140, areaPitchZ: 112 });
export const SOURCE_POSITION = [0, -.10, 155];
export const EXTERNAL_GATE_POSITION = [-710, 1.4, 40];
export const STAGE_LABELS = ['AS', 'I. GW', 'II. GW', 'III. GW', 'IV. GW', 'LW'];
export const DIGIT_ORDER = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
const digitIndex = digit => (Number(digit) + 9) % 10;

export function areaOrigin(prefix) {
  if (!/^[1-9]\d$/.test(prefix)) throw new Error('Ortsbereich muss mit 1–9 beginnen');
  return [(Number(prefix[0]) - 5) * OFFICE.areaPitchX, 0, -42 - digitIndex(prefix[1]) * OFFICE.areaPitchZ];
}
export function aisleOrigin(prefix) {
  if (!/^\d{3}$/.test(prefix)) throw new Error('Gasse braucht drei Ziffern');
  const [x, , z] = areaOrigin(prefix.slice(0, 2)), aisle = digitIndex(prefix[2]);
  return [x - 60 + (aisle % 2) * 67, 0, z - 13 - Math.floor(aisle / 2) * 17];
}
export function selectorSite(stage, prefix = '', slot = 0) {
  if (!Number.isInteger(stage) || stage < 0 || stage > 5 || !Number.isInteger(slot) || slot < 0 || slot >= 10) throw new Error('Ungültiger Wählerplatz');
  const expected = stage < 2 ? null : stage - 1;
  if (expected !== null && !(new RegExp(`^[1-9]\\d{${expected - 1}}$`)).test(prefix)) throw new Error('Präfix passt nicht zur örtlichen Wahlstufe');
  let position, rack, shelf = 0;
  if (stage === 0) { position = [slot * 2.4, .42, 120]; rack = 'ZUGANG-AS'; }
  else if (stage === 1) { position = [slot * 2.4, .42, 80]; rack = 'ZUGANG-GW'; }
  else if (stage === 2) { position = [(Number(prefix) - 5) * 140 - 10.8 + slot * 2.4, .42, 27]; rack = `TOR-${prefix}`; }
  else if (stage === 3) {
    const [x, , z] = areaOrigin(prefix); position = [x - 10.8 + slot * 2.4, .42, z + 10]; rack = `B-${prefix}`;
  } else {
    const [x, , z] = aisleOrigin(prefix.slice(0, 3));
    const digit = stage === 5 ? digitIndex(prefix[3]) : 10;
    const half = digit >= 6 ? 1 : 0; shelf = digit >= 6 ? digit - 6 : digit;
    position = [x + half * 29 + slot * 2.4, .42 + shelf * 2.55, z];
    rack = `G-${prefix.slice(0, 3)}-${half + 1}`;
  }
  return { id: `${stage}:${stage === 0 ? '2100' : prefix}:${slot}`, stage, prefix, slot, position, rack, shelf,
    area: stage >= 3 ? prefix.slice(0, 2) : null,
    label: `${STAGE_LABELS[stage]} ${stage === 0 ? 'Anrufsucher' : prefix ? `${prefix}${'x'.repeat(6 - prefix.length)}` : 'Amtszugang'}` };
}
export function racksInArea(prefix) {
  const [x, , z] = areaOrigin(prefix);
  const racks = [{ id: `B-${prefix}`, position: [x - 10.8, 0, z + 10], shelves: 1, prefix }];
  for (let aisle = 0; aisle < 10; aisle++) {
    const key = `${prefix}${aisle}`, p = aisleOrigin(key);
    for (let half = 0; half < 2; half++) racks.push({ id: `G-${key}-${half + 1}`, position: [p[0] + half * 29, 0, p[2]], shelves: 6, occupied: half ? 5 : 6, prefix: key });
  }
  return racks;
}
export function sitesInArea(prefix) {
  const sites = [];
  for (let slot = 0; slot < 10; slot++) sites.push(selectorSite(3, prefix, slot));
  for (let aisle = 0; aisle < 10; aisle++) {
    for (let slot = 0; slot < 10; slot++) sites.push(selectorSite(4, `${prefix}${aisle}`, slot));
    for (let bank = 0; bank < 10; bank++) for (let slot = 0; slot < 10; slot++) sites.push(selectorSite(5, `${prefix}${aisle}${bank}`, slot));
  }
  return sites;
}
export const AREA_PREFIXES = Object.freeze(DIGIT_ORDER.slice(0, 9).flatMap(first => DIGIT_ORDER.map(second => first + second)));
export const ENTRANCE_SITES = [
  ...Array.from({ length: 10 }, (_, i) => selectorSite(0, '2100', i)),
  ...Array.from({ length: 10 }, (_, i) => selectorSite(1, '', i)),
  ...Array.from({ length: 90 }, (_, i) => selectorSite(2, String(1 + Math.floor(i / 10)), i % 10)),
];
export const WHOLE_OFFICE_BOUNDS = { min: [-760, -2, -1140], max: [800, 28, 175] };
export function tapePosition(id) {
  const [x, , z] = areaOrigin('11');
  return [x + 73, id === 'time' ? 4.55 : .90, z + 7];
}
export function targetPosition(number) {
  if (!/^[1-9]\d{5}$/.test(number)) throw new Error('Ungültige örtliche Zielnummer');
  const [, , z] = aisleOrigin(number.slice(0, 3));
  // The subscriber is outside the switching hall, with a visible line across
  // the boundary. This display desk is not a second switching cabinet.
  return [750, -.10, z + 6];
}
export function subscriberHandoff(number) { const p = targetPosition(number); return [675, 1.6, p[2]]; }
export function releaseBlockView(prefix) {
  if (/^[1-9]\d$/.test(prefix)) {
    const [x, , z] = areaOrigin(prefix);
    return { label: `BLOCK ${prefix}xxxx`, bounds: { min: [x - 65, -1, z - 87], max: [x + 66, 22, z + 16] } };
  }
  if (/^[1-9]$/.test(prefix)) {
    const p = selectorSite(2, prefix).position;
    return { label: `ZUGANG ${prefix}xxxxx`, bounds: boundsOf([p, [p[0] + 23, 5, p[2]]], 5) };
  }
  return { label: 'AMTSZUGANG', bounds: boundsOf([[0, 0, 80], [23, 5, 120]], 5) };
}
export function boundsOf(points, padding = 0) {
  return { min: [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis])) - padding),
    max: [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis])) + padding) };
}
export function unionBounds(a, b) { return { min: a.min.map((n, i) => Math.min(n, b.min[i])), max: a.max.map((n, i) => Math.max(n, b.max[i])) }; }
export function corners(bounds) {
  return Array.from({ length: 8 }, (_, i) => [0, 1, 2].map(axis => bounds[i & (1 << axis) ? 'max' : 'min'][axis]));
}
// Fit every corner in a perspective camera with a fixed, elevated direction.
// The route's geometry determines zoom, never the numeric value alone.
export function overviewFrame(bounds, aspect, fov = 38) {
  const target = bounds.min.map((v, i) => (v + bounds.max[i]) / 2);
  const length = Math.hypot(.12, .92, 1), back = [.12 / length, .92 / length, 1 / length];
  const rightLength = Math.hypot(back[0], back[2]), right = [back[2] / rightLength, 0, -back[0] / rightLength];
  const up = [back[1] * right[2], back[2] * right[0] - back[0] * right[2], -back[1] * right[0]];
  // right × back points down; the expression above is back × right.
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * Math.max(.1, aspect);
  let distance = 30;
  for (const point of corners(bounds)) {
    const delta = point.map((v, i) => v - target[i]);
    const dot = axis => delta.reduce((sum, v, i) => sum + v * axis[i], 0);
    distance = Math.max(distance, Math.abs(dot(right)) / tanX * 1.3 + dot(back), Math.abs(dot(up)) / tanY * 1.3 + dot(back));
  }
  return { target, position: target.map((v, i) => v + back[i] * distance), distance, right, up, back };
}
