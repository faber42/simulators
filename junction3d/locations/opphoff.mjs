import environment from './opphoff-environment.mjs';

/**
 * Opphoff: surface junction Märkische Straße / Rheinlanddamm / Westfalendamm.
 * Reconstruction from the user's annotated plan and street/3D screenshots.
 * The underground B1 is deliberately absent: every route here is at street level.
 * Dimensions, lane capacities and signal seconds are illustrative assumptions.
 *
 * Metres: +x east, +z south. u=x−0.6z follows the oblique Märkische axis.
 * Three lanes per incoming carriageway: one left, two straight. Left turns
 * pass their own outer+inner gates, then wait at the perpendicular inner gate.
 * All placement and routing remain location data, not renderer/engine rules.
 */
const shear = .6;
const axisLength = Math.hypot(shear, 1);
const laneWidth = 3.5;
const laneStep = laneWidth * axisLength;
const uv = (u, v) => [u + shear * v, v];
const directions = {
  east: { sign: 1, axis: 'ew', from: 'West', to: 'Ost', left: 'north', vector: [1, 0] },
  west: { sign: -1, axis: 'ew', from: 'Ost', to: 'West', left: 'south', vector: [-1, 0] },
  south: { sign: 1, axis: 'ns', from: 'Nord', to: 'Süd', left: 'east', vector: [shear / axisLength, 1 / axisLength] },
  north: { sign: -1, axis: 'ns', from: 'Süd', to: 'Nord', left: 'west', vector: [-shear / axisLength, -1 / axisLength] },
};

function point(direction, along, lane) {
  const d = directions[direction];
  return d.axis === 'ew' ? uv(along, d.sign * (26.5 + lane * laneWidth))
    : uv(-d.sign * (14 + lane * laneStep), along);
}
function gatePoint(direction, lane, gate) {
  const d = directions[direction];
  const distance = gate === 'outer' ? (d.axis === 'ew' ? -30 : -43)
    : gate === 'entry' ? (d.axis === 'ew' ? -9 : -4) : (d.axis === 'ew' ? 8 : 17);
  return point(direction, distance * d.sign, lane);
}
const stopId = (direction, gate, lane) => `${direction}-${gate}-${lane}`;
const storageId = (direction, lane) => `${direction}-holding-${lane}`;
const middleGroup = direction => `middle-${direction}`;
const outerGroup = direction => `outer-${direction}`;
const laneId = (direction, lane) => `${direction}-lane-${lane}`;
const extent = direction => directions[direction].axis === 'ew' ? 230 : 180;

function approach(direction, lane) {
  const sign = directions[direction].sign;
  return [point(direction, -sign * extent(direction), lane), point(direction, -sign * 85, lane),
    gatePoint(direction, lane, 'outer'), gatePoint(direction, lane, 'entry')];
}
function departure(direction, lane) {
  const d = directions[direction];
  const inner = d.axis === 'ew' ? 8 : 17;
  return [gatePoint(direction, lane, 'entry'), point(direction, d.sign * (inner - 7), lane),
    gatePoint(direction, lane, 'inner'), point(direction, d.sign * (inner + 20), lane),
    point(direction, d.sign * 85, lane), point(direction, d.sign * extent(direction), lane)];
}
function ownOuterStop(direction, lane) {
  return { id: stopId(direction, 'outer', lane), group: outerGroup(direction),
    point: gatePoint(direction, lane, 'outer'), clearPoint: gatePoint(direction, lane, 'entry'),
    storage: { id: storageId(direction, lane), capacity: 2 }, arrow: lane === 0 ? 'left' : 'straight' };
}
function ownInnerStop(direction, lane) {
  return { id: stopId(direction, 'inner', lane), group: middleGroup(direction),
    point: gatePoint(direction, lane, 'inner'), arrow: lane === 0 ? 'left' : 'straight', inner: true };
}
function middleSection(direction, lane) {
  return { id: `${direction}-median-${lane}`, from: gatePoint(direction, lane, 'entry'),
    to: point(direction, directions[direction].sign * extent(direction), lane) };
}
function bezier(start, controlA, controlB, end, steps = 9) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps, q = 1 - t;
    return [0, 1].map(axis => q ** 3 * start[axis] + 3 * q * q * t * controlA[axis]
      + 3 * q * t * t * controlB[axis] + t ** 3 * end[axis]);
  });
}
const add = (p, v, distance) => [p[0] + v[0] * distance, p[1] + v[1] * distance];

const throughRoutes = Object.entries(directions).flatMap(([direction, d]) => [1, 2].map(lane => ({
  id: `${direction}-through-${lane}`, label: `${d.from} → ${d.to} · Geradeaus ${lane}`,
  group: outerGroup(direction), laneId: laneId(direction, lane), exitId: laneId(direction, lane),
  turn: 'straight', points: [...approach(direction, lane).slice(0, -1), ...departure(direction, lane)],
  stopLine: gatePoint(direction, lane, 'outer'), stops: [ownOuterStop(direction, lane), ownInnerStop(direction, lane)],
  laneSections: [middleSection(direction, lane)], mergePoint: gatePoint(direction, lane, 'entry'),
  rate: lane === 1 ? 270 : 190, speed: 11.1,
})));

const leftRoutes = Object.entries(directions).map(([direction, d]) => {
  const target = d.left, targetDirection = directions[target];
  const innerAlong = d.axis === 'ew' ? 8 : 17;
  const start = point(direction, d.sign * (innerAlong + 2), 0);
  const entry = gatePoint(target, 1, 'entry');
  const handle = d.axis === 'ew' ? 14 : 5.5;
  const bend = bezier(start, add(start, d.vector, handle), add(entry, targetDirection.vector, -handle), entry);
  return {
    id: `${direction}-left`, label: `${d.from} → ${targetDirection.to} · Linksabbieger über die Mitte`,
    group: outerGroup(direction), laneId: laneId(direction, 0), exitId: laneId(target, 1),
    turn: 'left', vehicleKinds: ['car', 'van'], rate: 60, speed: 6.5,
    points: [...approach(direction, 0), gatePoint(direction, 0, 'inner'), ...bend, ...departure(target, 1).slice(1)],
    stopLine: gatePoint(direction, 0, 'outer'), renderFlare: false,
    stops: [ownOuterStop(direction, 0),
      { ...ownInnerStop(direction, 0), clearPoint: entry,
        storage: { id: storageId(target, 1), capacity: 2 } },
      ownInnerStop(target, 1)],
    mergePoint: entry, laneSections: [middleSection(target, 1)],
  };
});

// Exactly three separate right-turn slips shown in the annotated reference.
// They have their own narrow approach lane and one signal site apiece.
const slipDefinitions = [
  { id: 'east-north-slip', incoming: 'west', target: 'north',
    start: uv(90, -37), end: point('north', -80, 2),
    prefix: [uv(230, -37), uv(140, -37)],
    handleA: 40, handleB: 28 },
  { id: 'north-west-slip', incoming: 'south', target: 'west',
    start: uv(-26.25, -78), end: [-110, -33.5],
    prefix: [uv(-26.25, -180), uv(-26.25, -120)],
    handleA: 30, handleB: 30 },
  { id: 'south-east-slip', incoming: 'north', target: 'east',
    start: uv(26.25, 78), end: [110, 33.5],
    prefix: [uv(26.25, 180), uv(26.25, 120)],
    handleA: 30, handleB: 30 },
];
const slipRoutes = slipDefinitions.map(spec => {
  const incoming = directions[spec.incoming], target = directions[spec.target];
  const bend = bezier(spec.start, add(spec.start, incoming.vector, spec.handleA),
    add(spec.end, target.vector, -spec.handleB), spec.end, 12);
  const stopLine = bend[4];
  const tail = [spec.end, point(spec.target, target.sign * extent(spec.target), 2)];
  return { id: spec.id, label: `${incoming.from} → ${target.to} · separate Rechtsabbiegespur`,
    group: spec.id, laneId: spec.id, exitId: laneId(spec.target, 2), turn: 'right',
    points: [...spec.prefix, ...bend, ...tail.slice(1)], stopLine,
    stops: [{ id: `${spec.id}-stop`, group: spec.id, point: stopLine, clearPoint: spec.end, arrow: 'right' }],
    mergePoint: spec.end, vehicleKinds: ['car', 'van'], rate: 95, speed: 7.5, renderFlare: false };
});

const carriagewayRoads = [
  { id: 'surface-east', label: 'Rheinlanddamm / Westfalendamm · oberirdisch Richtung Ost', points: [uv(-230, 30), uv(230, 30)], width: 12, lanes: 3 },
  { id: 'surface-west', label: 'Westfalendamm / Rheinlanddamm · oberirdisch Richtung West', points: [uv(-230, -30), uv(230, -30)], width: 12, lanes: 3 },
  { id: 'maerkische-south', label: 'Märkische Straße · Richtung Süd', points: [point('south', -180, 1), point('south', 180, 1)], width: 12, lanes: 3 },
  { id: 'maerkische-north', label: 'Märkische Straße · Richtung Nord', points: [point('north', -180, 1), point('north', 180, 1)], width: 12, lanes: 3 },
];
const signalGantries = Object.entries(directions).flatMap(([direction, d]) => {
  const ew = d.axis === 'ew';
  return [
    { id: `${direction}-outer-site`, stopIds: [0, 1, 2].map(lane => stopId(direction, 'outer', lane)), height: 6.4,
      anchor: ew ? uv(-d.sign * 30, d.sign * 39) : uv(-d.sign * 29, -d.sign * 43) },
    { id: `${direction}-inner-site`, stopIds: [0, 1, 2].map(lane => stopId(direction, 'inner', lane)), height: 6.1,
      anchor: ew ? uv(d.sign * 8, d.sign * 22.6) : uv(-d.sign * 8, d.sign * 17), crossing: false },
  ];
});
for (const route of slipRoutes) {
  const index = route.points.findIndex(p => p === route.stopLine);
  const before = route.points[index - 1], after = route.points[index + 1];
  const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz);
  signalGantries.push({ id: `${route.id}-site`, stopIds: [`${route.id}-stop`], height: 5.6,
    anchor: [route.stopLine[0] - dz / length * 4.5, route.stopLine[1] + dx / length * 4.5] });
}

export const opphoff = {
  id: 'dortmund-opphoff', name: 'Opphoff', city: 'Dortmund', timeZone: 'Europe/Berlin',
  subtitle: 'Dortmund · Märkische Straße × Rheinlanddamm / Westfalendamm',
  description: 'Elf Signalstandorte, gemeinsam freigegebene Außen- und Innenampeln, drei separate Rechtsabbieger und ein begrünter Mittelbereich.',
  coordinates: { latitude: 51.5005523, longitude: 7.4829435 },
  source: {
    url: 'https://www.google.com/maps/@51.5005523,7.4829435,18.51z?entry=ttu',
    credit: 'Räumliche Annäherung anhand der vom Nutzer bereitgestellten Opphoff-Ansichten und des Plans mit elf markierten Signalstandorten.',
    note: 'Maße, Spuraufteilung und Signalzeiten sind Modellannahmen. Die unterirdische B1 und unterirdische Stadtbahn sind nicht Bestandteil der Szene.',
  },
  ui: { roadBadge: 'OPPHOFF', phaseExplainer: 'Ost–West und Nord–Süd wechseln sich ab. Außen- und Innenampeln derselben Richtung starten gleichzeitig.',
    modelNote: 'Fahrbahnbreiten, Spuraufteilung, Verkehrsaufkommen, Sekundenwerte und die Zuordnung der Rechtsabbieger zu den Achsenphasen sind Modellannahmen. Tunnelverkehr und unterirdische Stadtbahn sind ausgelassen.',
    signalIndicators: [
      { group: 'middle-east', label: 'Mitte → Ost' }, { group: 'middle-west', label: 'Mitte → West' },
      { group: 'middle-north', label: 'Mitte → Nord' }, { group: 'middle-south', label: 'Mitte → Süd' },
      { group: 'east-north-slip', label: 'Rechts aus Ost → Nord' },
      { group: 'north-west-slip', label: 'Rechts aus Nord → West' },
      { group: 'south-east-slip', label: 'Rechts aus Süd → Ost' },
    ] },
  seed: 73, initialVehiclesPerLane: 2, laneWidth,
  conflictBounds: { minX: -65, maxX: 65, minZ: -45, maxZ: 45 },
  timing: { yellow: 3, allRed: 3, redAmber: 1 },
  phases: [
    { id: 'east-west', label: 'Rheinlanddamm / Westfalendamm · West ↔ Ost',
      groups: ['outer-east', 'middle-east', 'outer-west', 'middle-west', 'east-north-slip'],
      drainGroups: ['middle-east', 'middle-west'], duration: 32,
      uiNote: 'Außen- und Innenampeln Richtung Ost und West gleichzeitig frei; Linksabbieger warten anschließend vor der Märkischen Gegenfahrbahn.' },
    { id: 'north-south', label: 'Märkische Straße · Nord ↔ Süd',
      groups: ['outer-north', 'middle-north', 'outer-south', 'middle-south', 'north-west-slip', 'south-east-slip'],
      drainGroups: ['middle-north', 'middle-south'], duration: 32,
      uiNote: 'Außen- und Innenampeln Richtung Nord und Süd gleichzeitig frei; die Linksabbieger beider Achsen werden in jedem Umlauf bedient.' },
  ],
  roads: [...carriagewayRoads, ...slipRoutes.map(route => ({ id: `${route.id}-road`, label: route.label,
    points: route.points, width: 4.2, lanes: 1 }))],
  routes: [...throughRoutes, ...leftRoutes, ...slipRoutes], signalGantries,
  laneMarkings: [
    ...Object.keys(directions).map(direction => ({ routeId: `${direction}-through-1`, section: 'full', offsets: [
      { offset: 5.25, style: 'solid' }, { offset: 1.75, style: 'dashed' },
      { offset: -1.75, style: 'dashed' }, { offset: -5.25, style: 'solid' },
    ] })),
    ...slipRoutes.map(route => ({ routeId: route.id, section: 'approach', offsets: [
      { offset: 1.75, style: 'solid' }, { offset: -1.75, style: 'solid' },
    ] })),
  ],
  islands: [
    { id: 'opphoff-middle-garden', surface: 'grass', points: [
      uv(-2.5, -15), uv(2.5, -15), uv(5, -11), uv(5, 11), uv(2.5, 15),
      uv(-2.5, 15), uv(-5, 11), uv(-5, -11),
    ] },
    { id: 'north-east-refuge', surface: 'grass', points: [[6, -40], [27, -39], [5, -49]] },
    { id: 'north-west-refuge', surface: 'grass', points: [[-58, -42], [-76, -39], [-61, -56]] },
    { id: 'south-east-refuge', surface: 'grass', points: [[58, 42], [76, 39], [61, 56]] },
  ],
  cameras: [
    { id: 'overview', label: 'Übersicht', description: 'Die oberirdische Kreuzung mit elf Signalstandorten', position: [185, 180, 215], target: [0, 0, 0], fov: 48 },
    { id: 'north', label: 'Märkische · Nord', description: 'Blick vom Norden über die versetzten Fahrbahnen', position: [-80, 10, -72], target: [0, 1, 9], fov: 58 },
    { id: 'south', label: 'Märkische · Süd', description: 'Blick aus Süden auf Mittelinsel und innere Ampeln', position: [78, 10, 72], target: [0, 1, -9], fov: 58 },
    { id: 'west', label: 'Rheinlanddamm', description: 'Westlicher Straßenmast mit Blick Richtung Ost', position: [-72, 9, 42], target: [8, 1, 4], fov: 58 },
    { id: 'east', label: 'Westfalendamm', description: 'Östlicher Straßenmast mit Blick Richtung West', position: [74, 9, -42], target: [-6, 1, 0], fov: 58 },
    { id: 'pavilion', label: 'Am Pavillon', description: 'Blick vom östlichen Mittelstreifen zum grünen Zentrum', position: [57, 8, 7], target: [-3, 1, 0], fov: 60 },
    { id: 'middle', label: 'Mittelbereich', description: 'Innere Ampeln und gestaffelte Linksabbieger', position: [55, 48, 62], target: [0, 0, 0], fov: 53, mount: false },
  ],
  environment,
};

export default opphoff;
