import environment from './hohestr-wall-environment.mjs';

/**
 * Hohe Straße am Wall: a compact surface junction reconstructed from the
 * fifteen supplied aerial, map and street views. Lane counts and the four
 * movement phases follow the request; metres and seconds are model values.
 *
 * Local u points east (Südwall), v south (Hohe Straße). The small affine skew
 * follows the street alignment without affecting the reusable traffic model.
 * There are only four outer signal sites: no intermediate gates or storage.
 */
const world = (u, v) => [u - .2 * v, v + .1 * u];
const laneWidth = 3.5;
const approaches = {
  west: { street: 'Hiltropwall', from: 'West', axis: 'ew', extent: 150, left: 1, through: 2,
    outgoing: { straight: 'east', left: 'north', right: 'south' },
    rotate: (s, lateral) => [s, lateral] },
  east: { street: 'Südwall', from: 'Ost', axis: 'ew', extent: 150, left: 2, through: 2,
    outgoing: { straight: 'west', left: 'south', right: 'north' },
    rotate: (s, lateral) => [-s, -lateral] },
  north: { street: 'Hansastraße', from: 'Nord', axis: 'ns', extent: 140, left: 2, through: 1,
    outgoing: { straight: 'south', left: 'east', right: 'west' },
    rotate: (s, lateral) => [-lateral, s] },
  south: { street: 'Hohe Straße', from: 'Süd', axis: 'ns', extent: 140, left: 2, through: 1,
    outgoing: { straight: 'north', left: 'west', right: 'east' },
    rotate: (s, lateral) => [lateral, -s] },
};
const targetNames = { east: 'Südwall', west: 'Hiltropwall', north: 'Hansastraße', south: 'Hohe Straße' };
const sourceForDestination = { east: 'west', west: 'east', north: 'south', south: 'north' };
const point = (incoming, s, lateral) => world(...approaches[incoming].rotate(s, lateral));
const exitPoint = (outgoing, s, lateral) => point(sourceForDestination[outgoing], s, lateral);
const extentFor = outgoing => ['east', 'west'].includes(outgoing) ? 150 : 140;
const prefix = (incoming, lateral) => [-approaches[incoming].extent, -90, -55, -34, -28, -22]
  .map(s => point(incoming, s, lateral));
const suffix = (outgoing, lateral) => [22, 28, 40, 70, extentFor(outgoing)]
  .map(s => exitPoint(outgoing, s, lateral));

function bezier(start, a, b, end, count = 12) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count, q = 1 - t;
    return [0, 1].map(axis => q ** 3 * start[axis] + 3 * q * q * t * a[axis]
      + 3 * q * t * t * b[axis] + t ** 3 * end[axis]);
  });
}

function route(incoming, turn, lane, outgoingLane, ordinal = 0) {
  const approach = approaches[incoming], destination = approach.outgoing[turn];
  const lateral = (lane + 1) * laneWidth, outgoingLateral = (outgoingLane + 1) * laneWidth;
  const id = `${incoming}-${turn === 'straight' ? 'through' : turn}${turn === 'right' ? '' : `-${ordinal}`}`;
  const group = `${approach.axis}-${turn === 'left' ? 'left' : 'through'}`;
  let bend;
  if (turn === 'left') {
    // Concentric quarter circles keep two left lanes separate. The opposing
    // pair turns in front of one another, with no crossing at the centre.
    const radius = 22 + lateral;
    bend = Array.from({ length: 19 }, (_, index) => {
      const angle = Math.PI / 2 * (1 - index / 18);
      return point(incoming, -22 + radius * Math.cos(angle), -22 + radius * Math.sin(angle));
    });
  } else if (turn === 'right') {
    // Start beside the outer stop line so the five-lane eastern approach
    // still offers a van a realistic turning radius at the receiving lane.
    bend = Array.from({ length: 17 }, (_, index) => {
      const angle = Math.PI / 2 * index / 16;
      return point(incoming, -28 + (28 - outgoingLateral) * Math.sin(angle),
        28 - (28 - lateral) * Math.cos(angle));
    });
  } else {
    bend = bezier([-22, lateral], [-7, lateral], [7, outgoingLateral], [22, outgoingLateral])
      .map(([s, offset]) => point(incoming, s, offset));
  }
  const stopLine = point(incoming, -28, lateral);
  return {
    id, label: `${approach.street} · ${approach.from} → ${targetNames[destination]}${turn === 'left' ? ` · Links ${ordinal + 1}` : turn === 'right' ? ' · Rechts' : ` · Geradeaus ${ordinal + 1}`}`,
    incoming, group, laneId: `from-${incoming}-${lane}`, exitId: `to-${destination}-${outgoingLane}`,
    turn, vehicleKinds: turn === 'straight' ? ['car', 'van', 'bus'] : ['car', 'van'],
    points: [...prefix(incoming, lateral).slice(0, -1), ...bend, ...suffix(destination, outgoingLateral).slice(1)],
    stopLine, stops: [{ id: `${id}-stop`, group, point: stopLine, clearPoint: exitPoint(destination, 40, outgoingLateral), arrow: turn }],
    mergePoint: exitPoint(destination, turn === 'right' ? 28 : 22, outgoingLateral), renderFlare: false,
    rate: turn === 'left' ? (incoming === 'west' ? 105 : 75) : turn === 'right' ? 70 : approach.axis === 'ew' ? 190 : 150,
    speed: turn === 'left' ? 6.7 : turn === 'right' ? 5.6 : 11.1,
  };
}

const routes = Object.entries(approaches).flatMap(([incoming, approach]) => [
  ...Array.from({ length: approach.left }, (_, lane) => route(incoming, 'left', lane, lane, lane)),
  ...Array.from({ length: approach.through }, (_, lane) => route(incoming, 'straight', approach.left + lane,
    approach.axis === 'ew' ? lane + 1 : 0, lane)),
  route(incoming, 'right', approach.left + approach.through, approach.axis === 'ew' ? 1 : 2),
]);

const laneMarkings = Object.entries(approaches).flatMap(([incoming, approach]) => {
  const sourceRoutes = routes.filter(route => route.incoming === incoming);
  return sourceRoutes.map((route, lane) => ({ routeId: route.id, section: 'approach', offsets: [
    { offset: laneWidth / 2, style: lane === 0 ? 'solid' : 'dashed',
      ...(lane > 0 ? { betweenRouteId: sourceRoutes[lane - 1].id } : {}) },
    ...(lane === sourceRoutes.length - 1 ? [{ offset: -laneWidth / 2, style: 'solid' }] : []),
  ] })).concat({ routeId: `${incoming}-through-0`, section: 'departure', offsets: approach.axis === 'ew' ? [
    { offset: 5.25, style: 'solid' }, { offset: 1.75, style: 'dashed' },
    { offset: -1.75, style: 'dashed' }, { offset: -5.25, style: 'solid' },
  ] : [
    { offset: 1.75, style: 'solid' }, { offset: -1.75, style: 'dashed' }, { offset: -5.25, style: 'solid' },
  ] });
});

export const hohestrWall = {
  id: 'dortmund-hohestr-wall', name: 'Hohe Straße am Wall', city: 'Dortmund', timeZone: 'Europe/Berlin',
  subtitle: 'Dortmund · Hiltropwall / Südwall × Hansastraße / Hohe Straße',
  description: 'Eine kompakte Innenstadt-Kreuzung am Opernhaus und Stadtgarten mit vier äußeren Ampelträgern und geschützten, zweispurigen Linksabbiegern.',
  coordinates: { latitude: 51.5100897, longitude: 7.4625376 },
  source: { url: 'https://www.google.de/maps/@51.5100897,7.4625376,91m/data=!3m1!1e3',
    credit: 'Räumliche Annäherung anhand der fünfzehn vom Nutzer bereitgestellten Karten-, Luftbild- und Straßenansichten.',
    note: 'Spurführung und Phasenfolge folgen der Vorlage. Abstände, Verkehrsaufkommen und Signalzeiten sind Modellannahmen.' },
  ui: { roadBadge: 'AM WALL', phaseExplainer: 'Erst Geradeaus und Rechts auf dem Wall, dann dessen Linksabbieger; anschließend dieselbe Folge für Hansastraße und Hohe Straße.',
    minimumTrafficNote: 'Mindestens ein Fahrzeug je zwei Minuten aus jeder der vier Zufahrtsrichtungen.',
    modelNote: 'Die sieben Linksabbiegespuren werden in jedem Umlauf geschützt bedient. Fahrbahnbreiten, Abstände, Verkehrsaufkommen und Sekundenwerte sind Modellannahmen.',
    signalIndicators: [
      { group: 'ew-through', label: 'Wall · Geradeaus / Rechts' }, { group: 'ew-left', label: 'Wall · Links' },
      { group: 'ns-through', label: 'Hohe / Hansa · Geradeaus / Rechts' }, { group: 'ns-left', label: 'Hohe / Hansa · Links' },
    ] },
  seed: 107, initialVehiclesPerLane: 2, laneWidth,
  minimumArrivals: Object.keys(approaches).map(incoming => ({ id: `from-${incoming}`, interval: 120,
    routeIds: routes.filter(route => route.incoming === incoming).map(route => route.id) })),
  conflictBounds: { minX: -33, maxX: 33, minZ: -32, maxZ: 32 },
  timing: { yellow: 3, allRed: 3, redAmber: 1 },
  phases: [
    { id: 'ew-through', label: 'Wall · Geradeaus & Rechts', groups: ['ew-through'], duration: 28,
      uiNote: 'Hiltropwall und Südwall: beide Gegenrichtungen geradeaus und rechts frei.' },
    { id: 'ew-left', label: 'Wall · Linksabbieger', groups: ['ew-left'], duration: 16,
      uiNote: 'Die geschützten Linksabbieger aus West und Ost fahren voreinander. Aus West gibt es eine, aus Ost zwei Linksabbiegespuren.' },
    { id: 'ns-through', label: 'Hohe / Hansa · Geradeaus & Rechts', groups: ['ns-through'], duration: 24,
      uiNote: 'Hansastraße und Hohe Straße: beide Gegenrichtungen geradeaus und rechts frei.' },
    { id: 'ns-left', label: 'Hohe / Hansa · Linksabbieger', groups: ['ns-left'], duration: 16,
      uiNote: 'Die jeweils zwei geschützten Linksabbiegespuren fahren voreinander.' },
  ],
  roads: [
    { id: 'intersection', label: 'Kreuzungsfläche', points: [world(-24.5, 0), world(24.5, 0)], width: 50, lanes: 1 },
    { id: 'hiltropwall', label: 'Hiltropwall', points: [world(-150, 1.75), world(-23, 1.75)], width: 29, lanes: 7 },
    { id: 'suedwall', label: 'Südwall', points: [world(23, -3.5), world(150, -3.5)], width: 32.5, lanes: 8 },
    { id: 'hansastrasse', label: 'Hansastraße', points: [world(-3.5, -140), world(-3.5, -23)], width: 25.5, lanes: 6 },
    { id: 'hohe-strasse', label: 'Hohe Straße', points: [world(3.5, 23), world(3.5, 140)], width: 25.5, lanes: 6 },
  ],
  routes, laneMarkings, islands: [],
  signalGantries: Object.entries(approaches).map(([incoming, approach]) => ({
    id: `from-${incoming}-site`, stopIds: routes.filter(route => route.incoming === incoming).map(route => route.stops[0].id),
    lowerStopIds: routes.filter(route => route.incoming === incoming && route.turn === 'right').map(route => route.stops[0].id),
    style: 'straight', height: 6.3, anchor: point(incoming, -27, (approach.left + approach.through + 1) * laneWidth + 3.4),
  })),
  cameras: [
    { id: 'overview', label: 'Übersicht', description: 'Vom Stadtgarten über den Wall zur Oper und Hohe Straße', position: [145, 145, -175], target: [0, 1, 0], fov: 48 },
    { id: 'east', label: 'Südwall', description: 'Westblick entlang des Walls zur Oper', position: [world(56, -23)[0], 9, world(56, -23)[1]], target: [-4, 1, 0], fov: 58 },
    { id: 'west', label: 'Hiltropwall', description: 'Blick vom Hiltropwall auf Stadtgarten und Südwall', position: [world(-54, 19)[0], 9, world(-54, 19)[1]], target: [5, 1, 0], fov: 58 },
    { id: 'north', label: 'Hansastraße', description: 'Blick von Norden auf die geschützten Linksabbieger', position: [world(-20, -51)[0], 9, world(-20, -51)[1]], target: [0, 1, 4], fov: 58 },
    { id: 'south', label: 'Hohe Straße', description: 'Blick am Volkswohl-Bund-Hochhaus vorbei nach Norden', position: [world(20, 53)[0], 9, world(20, 53)[1]], target: [0, 1, -4], fov: 58 },
    { id: 'opera', label: 'Opernplatz', description: 'Diagonalansicht vom Platz der Alten Synagoge', position: [world(-32, -32)[0], 11, world(-32, -32)[1]], target: [3, 1, 3], fov: 61 },
    { id: 'top', label: 'Vogelperspektive', description: 'Die vier Phasen und gegenläufigen Linksabbieger von oben', position: [0, 125, 4], target: [0, 0, 0], fov: 48, mount: false },
  ],
  environment,
};

export default hohestrWall;
