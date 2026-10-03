/**
 * Westfalendamm / Voßkuhle / Semmerteichstraße, Dortmund.
 *
 * Hand-built reconstruction from the user's five map / street-view references.
 * Metres in a local, level coordinate system: +x east, +z south, +y up.
 * The B1 is straightened to the x axis; dimensions are illustrative estimates,
 * not a surveyed map. Signal order follows the user's description; timings,
 * traffic rates, heights and camera positions are editable assumptions.
 *
 * Keep location-specific geometry and operating parameters here. The engine
 * consumes routes and signal groups without knowing any Dortmund street names.
 */

const northApproach = {
  inner: [[-113.4, -168.9], [-66.4, -110.9], [-27.5, -64.1], [-5.2, -38], [-4.8, -31]],
  middle: [[-116.1, -166.7], [-69.1, -108.7], [-30.5, -62.3], [-8.7, -38], [-8.3, -31]],
  outer: [[-118.8, -164.5], [-71.8, -106.5], [-33.5, -60.5], [-12.2, -38], [-11.8, -31]],
};
const southApproach = {
  inner: [[10.75, 180], [8.75, 80], [1.75, 38], [1.75, 31]],
  middle: [[14.25, 180], [12.25, 80], [5.25, 38], [5.25, 31]],
  outer: [[17.75, 180], [15.75, 80], [8.75, 38], [8.75, 31]],
};

// Each direction has a dedicated left, shared left/straight and straight lane.
// Paired left-turn arcs are concentric, preserving 3.5 m between lane centres.
const southLeftArc = [[-2.368, 12.176], [-0.569, 14.869], [2.124, 16.668], [5.3, 17.3], [25, 17.3], [60, 17.3], [220, 17.3]];
const southSharedArc = [[-5.602, 13.516], [-3.044, 17.344], [0.784, 19.902], [5.3, 20.8], [25, 20.8], [60, 20.8], [220, 20.8]];
const northLeftArc = [[0.568, -12.176], [-1.231, -14.869], [-3.924, -16.668], [-7.1, -17.3], [-25, -17.3], [-60, -17.3], [-220, -17.3]];
const northSharedArc = [[3.802, -13.516], [1.244, -17.344], [-2.584, -19.902], [-7.1, -20.8], [-25, -20.8], [-60, -20.8], [-220, -20.8]];

const median = {
  south: {
    left: { id: 'south-left', entry: [-3.4, -6], point: [-3, 9], arrow: 'left' },
    shared: { id: 'south-shared', entry: [-7.2, -6], point: [-6.5, 9], arrow: 'left-straight' },
    through: { id: 'south-through', entry: [-10.5, -6], point: [-10, 9], arrow: 'straight' },
  },
  north: {
    left: { id: 'north-left', entry: [1.3, 7], point: [1.2, -9], arrow: 'left' },
    shared: { id: 'north-shared', entry: [4.5, 7], point: [4.7, -9], arrow: 'left-straight' },
    through: { id: 'north-through', entry: [8, 7], point: [8.2, -9], arrow: 'straight' },
  },
};

// Rerouting only chooses a compatible lane; the vehicle's destination is fixed.
const tails = {
  south: {
    left: { exitId: 'east1', points: [median.south.left.entry, median.south.left.point, ...southLeftArc] },
    sharedLeft: { exitId: 'east2', points: [median.south.shared.entry, median.south.shared.point, ...southSharedArc] },
    sharedStraight: { exitId: 'south1', points: [median.south.shared.entry, median.south.shared.point, [-5.25, 30], [1.75, 80], [3.75, 180]] },
    through: { exitId: 'south2', points: [median.south.through.entry, median.south.through.point, [-8.75, 30], [-1.75, 80], [0.25, 180]] },
  },
  north: {
    left: { exitId: 'west1', points: [median.north.left.entry, median.north.left.point, ...northLeftArc] },
    sharedLeft: { exitId: 'west2', points: [median.north.shared.entry, median.north.shared.point, ...northSharedArc] },
    sharedStraight: { exitId: 'north1', points: [median.north.shared.entry, median.north.shared.point, [2.2, -32], [-21.5, -67.7], [-60.9, -115.3], [-107.9, -173.3]] },
    through: { exitId: 'north2', points: [median.north.through.entry, median.north.through.point, [5.7, -32], [-18.5, -69.5], [-58.2, -117.5], [-105.2, -175.5]] },
  },
};

function medianStops(direction, lane, entryId, outerGroup, outerPoint, arrow, { allowOverflow = false, yieldToGroups } = {}) {
  const m = median[direction][lane];
  return [
    { id: entryId, group: outerGroup, point: outerPoint, clearPoint: m.entry,
      storage: { id: `holding-${m.id}`, capacity: 2, allowOverflow }, arrow,
      ...(yieldToGroups ? { yieldToGroups } : {}) },
    { id: `middle-${m.id}`, group: direction === 'south' ? 'middleSouth' : 'middleNorth', point: m.point, arrow: m.arrow },
  ];
}

function medianSection(direction, lane, movement) {
  const m = median[direction][lane];
  // Keep headway until divergent vehicle bodies have actually separated.
  const to = lane !== 'shared' ? m.point : movement === 'sharedLeft'
    ? (direction === 'south' ? southSharedArc[2] : northSharedArc[2])
    : (direction === 'south' ? [-5.6, 24] : [3.1, -24]);
  return { id: `median-${m.id}`, from: m.entry, to };
}

/** The innermost B1 lanes are dedicated left-turn lanes, never through lanes. */
const mainRoutes = [17.3, 20.8].flatMap((z, index) => [
  {
    id: `west-east-${index + 1}`, label: `B1 · West → Ost · Geradeaus ${index + 1}`,
    group: 'main', laneId: `w${index + 1}`, exitId: `east${index + 1}`, turn: 'straight',
    points: [[-220, z], [-80, z], [-28, z], [34, z], [100, z], [220, z]],
    stops: [{ id: `west-east-${index + 1}-entry`, group: 'main', point: [-28, z], arrow: 'straight' }],
    stopLine: [-28, z], rate: [560, 420][index], speed: 13.9,
  },
  {
    id: `east-west-${index + 1}`, label: `B1 · Ost → West · Geradeaus ${index + 1}`,
    group: 'main', laneId: `e${index + 1}`, exitId: `west${index + 1}`, turn: 'straight',
    points: [[220, -z], [80, -z], [28, -z], [-34, -z], [-100, -z], [-220, -z]],
    stops: [{ id: `east-west-${index + 1}-entry`, group: 'main', point: [28, -z], arrow: 'straight' }],
    stopLine: [28, -z], rate: [540, 430][index], speed: 13.9,
  },
]);

function mainTurn({ id, from, direction, lane, movement, choiceGroup, rate, label }) {
  const east = from === 'east';
  const group = direction === 'south' ? 'mainLeftSouth' : 'mainLeftNorth';
  const m = median[direction][lane], tail = tails[direction][movement];
  const stopLine = east ? [28, -13.8] : [-28, 13.8];
  const prefix = east ? [[220, -13.8], [80, -13.8], stopLine, [10, -13.8]] : [[-220, 13.8], [-80, 13.8], stopLine, [-10, 13.8]];
  const radius = east ? 7.8 : 6.8;
  const bend = east ? [
    [m.entry[0] + radius, -13.8],
    [m.entry[0] + radius * 0.5, -6 - radius * 0.8660254],
    [m.entry[0] + radius * 0.1339746, -6 - radius * 0.5],
  ] : [
    [m.entry[0] - radius, 13.8],
    [m.entry[0] - radius * 0.5, 7 + radius * 0.8660254],
    [m.entry[0] - radius * 0.1339746, 7 + radius * 0.5],
  ];
  return {
    id, label, choiceGroup, rate, group, laneId: east ? 'e0' : 'w0',
    vehicleKinds: ['car', 'van'], renderFlare: false,
    exitId: tail.exitId, turn: 'left', speed: 6.5, stopLine,
    points: [...prefix, ...bend, ...tail.points],
    mergePoint: movement === 'left' || movement === 'sharedLeft' ? tail.points.at(-3) : m.entry,
    laneSections: [
      { id: east ? 'e0-entry' : 'w0-entry', from: prefix[0], to: east ? [4.4, -13.8] : [-5.5, 13.8] },
      medianSection(direction, lane, movement),
    ],
    // Local driving behaviour: an open B1 turn fills its curve beyond the two
    // regular median spaces. The next side phase lets those admitted cars out.
    stops: medianStops(direction, lane, `${from}-${direction}-entry`, group, stopLine, 'left', { allowOverflow: true }),
  };
}

// A choice group's first route owns the arrival rate; alternatives must stay at 0.
// The engine favours the least occupied compatible lane, never a new destination.
const mainTurnRoutes = [
  mainTurn({ id: 'east-south', from: 'east', direction: 'south', lane: 'shared', movement: 'sharedStraight', choiceGroup: 'east-to-south', rate: 45, label: 'B1 aus Ost → Semmerteichstraße · gemeinsame Spur' }),
  mainTurn({ id: 'east-south-outer', from: 'east', direction: 'south', lane: 'through', movement: 'through', choiceGroup: 'east-to-south', rate: 0, label: 'B1 aus Ost → Semmerteichstraße · Geradeausspur' }),
  mainTurn({ id: 'east-uturn', from: 'east', direction: 'south', lane: 'left', movement: 'left', choiceGroup: 'east-return-east', rate: 20, label: 'B1 aus Ost → Mitte → B1 Ost · Wendefahrt' }),
  mainTurn({ id: 'east-uturn-shared', from: 'east', direction: 'south', lane: 'shared', movement: 'sharedLeft', choiceGroup: 'east-return-east', rate: 0, label: 'B1 aus Ost → Mitte → B1 Ost · gemeinsame Spur' }),
  mainTurn({ id: 'west-north', from: 'west', direction: 'north', lane: 'shared', movement: 'sharedStraight', choiceGroup: 'west-to-north', rate: 45, label: 'B1 aus West → Voßkuhle · gemeinsame Spur' }),
  mainTurn({ id: 'west-north-outer', from: 'west', direction: 'north', lane: 'through', movement: 'through', choiceGroup: 'west-to-north', rate: 0, label: 'B1 aus West → Voßkuhle · Geradeausspur' }),
  mainTurn({ id: 'west-uturn', from: 'west', direction: 'north', lane: 'left', movement: 'left', choiceGroup: 'west-return-west', rate: 20, label: 'B1 aus West → Mitte → B1 West · Wendefahrt' }),
  mainTurn({ id: 'west-uturn-shared', from: 'west', direction: 'north', lane: 'shared', movement: 'sharedLeft', choiceGroup: 'west-return-west', rate: 0, label: 'B1 aus West → Mitte → B1 West · gemeinsame Spur' }),
];

function sideRoute({ from, direction, lane, movement, id, rate, label }) {
  const north = from === 'north';
  const laneIndex = lane === 'left' ? 0 : lane === 'shared' ? 1 : 2;
  const approach = (north ? northApproach : southApproach)[['inner', 'middle', 'outer'][laneIndex]];
  const transition = north ? [[-4.2, -18], [-7.7, -18], [-11.3, -18]][laneIndex] : [[1.5, 19], [4.8, 19], [8.3, 19]][laneIndex];
  const m = median[direction][lane], tail = tails[direction][movement];
  const stopLine = approach.at(-1), entryId = `${from}-${lane}-entry`;
  return {
    id, label, rate, group: from, laneId: `${north ? 'n' : 's'}${laneIndex}`,
    vehicleKinds: ['car', 'van'], exitId: tail.exitId,
    turn: movement === 'left' || movement === 'sharedLeft' ? 'left' : 'straight',
    speed: movement === 'left' || movement === 'sharedLeft' ? 5.5 : 9.7,
    points: [...approach, transition, ...tail.points], stopLine,
    mergePoint: movement === 'left' || movement === 'sharedLeft' ? tail.points.at(-3) : m.entry,
    laneSections: [
      { id: `${north ? 'n' : 's'}${laneIndex}-entry`, from: approach[0], to: m.entry },
      medianSection(direction, lane, movement),
    ],
    stops: medianStops(direction, lane, entryId, from, stopLine, m.arrow,
      { yieldToGroups: [direction === 'south' ? 'mainLeftSouth' : 'mainLeftNorth'] }),
  };
}

const sideRoutes = [
  sideRoute({ from: 'north', direction: 'south', lane: 'left', movement: 'left', id: 'north-left', rate: 90, label: 'Voßkuhle → B1 Ost · Linksabbiegerspur' }),
  sideRoute({ from: 'north', direction: 'south', lane: 'shared', movement: 'sharedLeft', id: 'north-shared-left', rate: 60, label: 'Voßkuhle → B1 Ost · gemeinsame Spur' }),
  sideRoute({ from: 'north', direction: 'south', lane: 'shared', movement: 'sharedStraight', id: 'north-shared-straight', rate: 25, label: 'Voßkuhle → Semmerteichstraße · gemeinsame Spur' }),
  sideRoute({ from: 'north', direction: 'south', lane: 'through', movement: 'through', id: 'north-through', rate: 50, label: 'Voßkuhle → Semmerteichstraße · Geradeausspur' }),
  sideRoute({ from: 'south', direction: 'north', lane: 'left', movement: 'left', id: 'south-left', rate: 90, label: 'Semmerteichstraße → B1 West · Linksabbiegerspur' }),
  sideRoute({ from: 'south', direction: 'north', lane: 'shared', movement: 'sharedLeft', id: 'south-shared-left', rate: 60, label: 'Semmerteichstraße → B1 West · gemeinsame Spur' }),
  sideRoute({ from: 'south', direction: 'north', lane: 'shared', movement: 'sharedStraight', id: 'south-shared-straight', rate: 25, label: 'Semmerteichstraße → Voßkuhle · gemeinsame Spur' }),
  sideRoute({ from: 'south', direction: 'north', lane: 'through', movement: 'through', id: 'south-through', rate: 50, label: 'Semmerteichstraße → Voßkuhle · Geradeausspur' }),
];

export const dortmund = {
  id: 'dortmund-westfalendamm',
  name: 'Voßkuhle',
  timeZone: 'Europe/Berlin',
  subtitle: 'Dortmund · B1 × Voßkuhle / Semmerteichstraße',
  ui: {
    roadBadge: 'B 1',
    phaseExplainer: 'Die B1 erhält jede zweite Grünphase. Innere und äußere Nebenstraßenampeln starten gemeinsam.',
    signalIndicators: [
      { group: 'mainLeftSouth', label: 'B1 links → Süd' },
      { group: 'mainLeftNorth', label: 'B1 links → Nord' },
      { group: 'middleSouth', label: 'Mitte → Süd' },
      { group: 'middleNorth', label: 'Mitte → Nord' },
    ],
  },
  description: 'Drei Nebenstraßenspuren je Richtung, flexible Wendefahrten über die Mitte und Stadtbahn-Vorrang während der B1-Phasen.',
  coordinates: { latitude: 51.5034529, longitude: 7.4972166 },
  source: {
    url: 'https://www.google.de/maps/@51.5034529,7.4972166,17.99z/data=!5m1!1e1?entry=ttu',
    credit: 'Geometrie anhand der vom Nutzer bereitgestellten Google-Maps- und Street-View-Ansichten angenähert.',
    note: 'Eigenständig modellierte Szene, keine Google-Kacheln oder Fototexturen. Kein amtlicher Signalplan.',
  },
  seed: 42,
  conflictBounds: { minX: -34, maxX: 34, minZ: -32, maxZ: 32 },
  timing: { yellow: 3, allRed: 3, redAmber: 1 },
  phases: [
    { id: 'main-a', label: 'Hauptstraße · West ↔ Ost', groups: ['main', 'mainLeftSouth'], groupDelays: { mainLeftSouth: 7 }, duration: 32,
      uiNote: 'B1 geradeaus; nach 7 s links aus Ost in den Wartebereich Richtung Süd.' },
    { id: 'north', label: 'Nebenstraße → Süd · Mitte und Voßkuhle gemeinsam', groups: ['middleSouth', 'north'], drainGroups: ['middleSouth'], duration: 22,
      uiNote: 'Voßkuhle und Mittelbereich werden gleichzeitig frei. Noch in der Kurve wartende B1-Abbieger räumen zuerst.' },
    { id: 'main-b', label: 'Hauptstraße · West ↔ Ost', groups: ['main', 'mainLeftNorth'], groupDelays: { mainLeftNorth: 7 }, duration: 32,
      uiNote: 'B1 geradeaus; nach 7 s links aus West in den Wartebereich Richtung Nord.' },
    { id: 'south', label: 'Nebenstraße → Nord · Mitte und Semmerteichstraße gemeinsam', groups: ['middleNorth', 'south'], drainGroups: ['middleNorth'], duration: 22,
      uiNote: 'Semmerteichstraße und Mittelbereich werden gleichzeitig frei. Noch in der Kurve wartende B1-Abbieger räumen zuerst.' },
  ],
  roads: [
    { id: 'b1-west', label: 'Westfalendamm · Richtung West', points: [[-220, -18], [220, -18]], width: 12, lanes: 3 },
    { id: 'b1-east', label: 'Westfalendamm · Richtung Ost', points: [[-220, 18], [220, 18]], width: 12, lanes: 3 },
    { id: 'side', label: 'Voßkuhle / Semmerteichstraße', points: [[-112, -170], [-65, -112], [-26, -65], [-3, -32], [0, 30], [7, 80], [9, 180]], width: 24, lanes: 6 },
  ],
  laneWidth: 3.5,
  // Painting follows real lane paths, independently of the wider paved surface.
  // Positive offsets are left of travel; a shared physical lane is listed once.
  laneMarkings: [
    { routeId: 'west-east-1', section: 'full', offsets: [
      { offset: 5.25, style: 'solid' }, { offset: 1.75, style: 'dashed' },
      { offset: -1.75, style: 'dashed' }, { offset: -5.25, style: 'solid' },
    ] },
    { routeId: 'east-west-1', section: 'full', offsets: [
      { offset: 5.25, style: 'solid' }, { offset: 1.75, style: 'dashed' },
      { offset: -1.75, style: 'dashed' }, { offset: -5.25, style: 'solid' },
    ] },
    { routeId: 'north-left', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed' }] },
    { routeId: 'north-shared-straight', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'north-left' }] },
    { routeId: 'north-through', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'north-shared-straight' }, { offset: -1.75, style: 'solid' }] },
    { routeId: 'south-left', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed' }] },
    { routeId: 'south-shared-straight', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'south-left' }] },
    { routeId: 'south-through', section: 'approach', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'south-shared-straight' }, { offset: -1.75, style: 'solid' }] },
    { routeId: 'north-shared-straight', section: 'departure', offsets: [{ offset: 1.75, style: 'dashed' }] },
    { routeId: 'north-through', section: 'departure', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'north-shared-straight' }, { offset: -1.75, style: 'solid' }] },
    { routeId: 'south-shared-straight', section: 'departure', offsets: [{ offset: 1.75, style: 'dashed' }] },
    { routeId: 'south-through', section: 'departure', offsets: [{ offset: 1.75, style: 'dashed', betweenRouteId: 'south-shared-straight' }, { offset: -1.75, style: 'solid' }] },
  ],
  islands: [
    { id: 'median-refuge-north', points: [[-1.6, -5], [-0.4, -5], [-0.4, -3.9], [-1.6, -3.9]] },
    { id: 'median-refuge-south', points: [[-1.6, 3.9], [-0.4, 3.9], [-0.4, 5], [-1.6, 5]] },
  ],
  signalGantries: [
    { id: 'b1-from-west', stopIds: ['west-east-1-entry', 'west-east-2-entry', 'west-north-entry'], anchor: [-30, 26.5], height: 6.6 },
    { id: 'b1-from-east', stopIds: ['east-west-1-entry', 'east-west-2-entry', 'east-south-entry'], anchor: [30, -26.5], height: 6.6 },
    { id: 'side-from-north', stopIds: ['north-left-entry', 'north-shared-entry', 'north-through-entry'], anchor: [-17, -32], height: 6.3 },
    { id: 'side-from-south', stopIds: ['south-left-entry', 'south-shared-entry', 'south-through-entry'], anchor: [14.2, 32], height: 6.3 },
    { id: 'median-to-south', stopIds: ['middle-south-left', 'middle-south-shared', 'middle-south-through'], anchor: [-1, 4.2], height: 5.8 },
    { id: 'median-to-north', stopIds: ['middle-north-left', 'middle-north-shared', 'middle-north-through'], anchor: [-1, -4.2], height: 5.8 },
  ],
  transit: {
    greenGroups: ['main'],
    blockedGroups: ['mainLeftSouth', 'mainLeftNorth'],
    // User-provided clock minutes. Sundays use every other departure;
    // 23:30–05:00 has no service. Signals may delay a scheduled passage.
    routes: [
      { id: 'tram-east', label: 'Stadtbahn → Ost', line: 'U47', destination: 'Aplerbeck', trackZ: 2.4, direction: 1,
        points: [[-260, 2.4], [-36, 2.4], [36, 2.4], [260, 2.4]],
        stopLine: [-36, 2.4], clearPoint: [36, 2.4], signalPosition: [-36, 4.6],
        interval: 600, offset: 75, speed: 11, length: 28,
        schedule: { minuteOffset: 9, intervalMinutes: 10, sundayIntervalMinutes: 20, serviceStart: 300, serviceEnd: 1410 } },
      { id: 'tram-west', label: 'Stadtbahn → West', line: 'U47', destination: 'Westerfilde', trackZ: -2.4, direction: -1,
        points: [[260, -2.4], [36, -2.4], [-36, -2.4], [-260, -2.4]],
        stopLine: [36, -2.4], clearPoint: [-36, -2.4], signalPosition: [36, -4.6],
        interval: 600, offset: 99, speed: 11, length: 28,
        schedule: { minuteOffset: 2, intervalMinutes: 10, sundayIntervalMinutes: 20, serviceStart: 300, serviceEnd: 1410 } },
    ],
  },
  routes: [...mainRoutes, ...mainTurnRoutes, ...sideRoutes],
  cameras: [
    { id: 'overview', label: 'Übersicht', description: 'Freier Blick über den gesamten Knotenpunkt', position: [165, 180, 210], target: [0, 0, 0], fov: 48 },
    { id: 'north', label: 'Voßkuhle', description: 'Nordmast · Blick Richtung Süd', position: [-30, 10, -47], target: [0, 1.2, 16], fov: 58 },
    { id: 'south', label: 'Semmerteichstraße', description: 'Südmast · Blick Richtung Nord', position: [22, 10, 49], target: [-3, 1.2, -16], fov: 58 },
    { id: 'west', label: 'B1 · West', description: 'Westmast · Blick Richtung Ost', position: [-49, 10, 33], target: [8, 1.5, -3], fov: 57 },
    { id: 'east', label: 'B1 · Ost', description: 'Ostmast · Blick Richtung West', position: [49, 10, -33], target: [-8, 1.5, 3], fov: 57 },
    { id: 'station', label: 'Stadtbahn', description: 'Haltestelle Voßkuhle · Blick über die Gleise', position: [63, 8, 7], target: [-4, 1.5, -1], fov: 62 },
    { id: 'middle', label: 'Mittelbereich', description: 'Die inneren Ampeln und Wartebereiche im Detail', position: [45, 40, 55], target: [-1, 0, 0], fov: 53, mount: false },
  ],
  environment: {
    rails: { from: -280, to: 280, tracks: [-2.4, 2.4] },
    station: { x: 85, length: 80, label: 'Voßkuhle', infoLines: ['U47', 'Dortmund'], platformOffset: 5.5 },
    fuelStation: { x: 130, z: -65 },
    park: { x: 76, z: 99, width: 94, depth: 118 },
    streetLights: {
      defaultProfile: 'side', resolution: 256,
      profiles: {
        b1: { color: '#ffb24a', intensity: 5.5, radius: 25, forward: 7, spread: 1.25 },
        side: { color: '#f0f4ff', intensity: 4.5, radius: 20, forward: 6, spread: 1.15 },
      },
    },
    lights: [
      // Sodium light along both B1 carriageways, including the junction mouths.
      ...[-200, -150, -100, -50, -26, 26, 50, 100, 150, 200].flatMap(x => {
        // Broader, slightly softer corner pools also cover the central holding
        // area, while lamps farther along the B1 retain their regular spacing.
        const override = Math.abs(x) === 26
          ? { lighting: { radius: 40, spread: 1.15, intensity: 4.8 } } : {};
        return [
          { x, z: -29, height: 11, profile: 'b1', ...override },
          { x, z: 29, height: 11, rotation: Math.PI, profile: 'b1', ...override },
        ];
      }),
      // White lamps follow each side-road tangent. Pairs stand 15 m from the
      // reference centre, outside the curved asphalt, with arms facing inward.
      // Entries are [centre x, centre z, tangent dx, tangent dz].
      ...[
        [-96, -150, 47, 58], [-65, -112, 39, 47],
        [-34, -75, 39, 47], [-15, -49, 23, 33],
        [3.5, 55, 7, 50], [7.3, 95, 2, 100],
        [8.1, 135, 2, 100], [8.7, 165, 2, 100],
      ].flatMap(([x, z, dx, dz]) => {
        const length = Math.hypot(dx, dz), nx = dz / length, nz = -dx / length;
        return [-1, 1].map(side => ({
          x: x + side * nx * 15, z: z + side * nz * 15,
          height: 9, rotation: Math.atan2(-side * nx, -side * nz), profile: 'side',
        }));
      }),
    ],
    directionSigns: [
      { x: -22, z: -35, rotation: Math.PI, lines: ['↑ DO-Hörde', '← B1 · Unna', 'B1 · Essen →'] },
      { x: 21, z: 38, lines: ['↑ DO-Körne', '← B1 · Essen', 'B1 · Unna →'] },
    ],
    // Distant illustrative city blocks; leave the continuation of each road open.
    backgroundZones: [
      { x: -54, z: -236, width: 108, depth: 62, count: 9, minHeight: 10, maxHeight: 28 },
      { x: 147, z: -228, width: 150, depth: 72, count: 11, minHeight: 9, maxHeight: 25 },
      { x: -167, z: 238, width: 185, depth: 70, count: 12, minHeight: 10, maxHeight: 26 },
      { x: 143, z: 240, width: 156, depth: 67, count: 10, minHeight: 8, maxHeight: 22 },
      { x: -304, z: -116, width: 76, depth: 114, count: 9, minHeight: 10, maxHeight: 26 },
      { x: -305, z: 133, width: 79, depth: 132, count: 10, minHeight: 11, maxHeight: 29 },
      { x: 299, z: -117, width: 72, depth: 119, count: 9, minHeight: 9, maxHeight: 23 },
      { x: 297, z: 143, width: 72, depth: 139, count: 10, minHeight: 8, maxHeight: 24 },
    ],
    landscapeBeds: [
      { x: 20, z: -55, width: 28, depth: 9 },
      { x: -44, z: -48, width: 6, depth: 9 },
      { x: -29, z: 80, width: 5, depth: 38 },
      { x: 77, z: 35, width: 91, depth: 4 },
    ],
    buildings: [
      { id: 'westfalentower', x: -53, z: 76, width: 39, depth: 46, height: 43, style: 'office', label: 'WESTFALENTOWER' },
      { id: 'tower-wing', x: -86, z: 96, width: 27, depth: 32, height: 19, style: 'office' },
      { id: 'pace', x: -69, z: -56, width: 35, depth: 34, height: 11, style: 'museum', label: 'PACE · AUTOMOBIL MUSEUM', rotation: -0.08 },
      { id: 'glass-office', x: 18, z: -94, width: 37, depth: 41, height: 28, style: 'glass', label: 'VOẞKUHLE', rotation: -0.13 },
      { id: 'glass-wing', x: -10, z: -121, width: 40, depth: 26, height: 20, style: 'glass', rotation: -0.25 },
      { id: 'north-shops', x: 129, z: -107, width: 76, depth: 29, height: 8, style: 'shop', label: 'GARTENSTADT' },
      { id: 'west-block', x: -157, z: -64, width: 46, depth: 34, height: 16, style: 'office' },
      { id: 'west-block-south', x: -154, z: 71, width: 48, depth: 46, height: 17, style: 'office' },
      { id: 'east-block', x: 180, z: 61, width: 38, depth: 30, height: 13, style: 'office' },
      { id: 'east-block-south', x: 167, z: 123, width: 43, depth: 38, height: 11, style: 'office' },
    ],
    treeZones: [
      { x: -129, z: 0, width: 163, depth: 16, count: 42 },
      { x: 174, z: 0, width: 85, depth: 16, count: 18 },
      { x: -147, z: 36, width: 130, depth: 9, count: 18 },
      { x: -128, z: -36, width: 150, depth: 9, count: 21 },
      { x: 78, z: -112, width: 34, depth: 77, count: 24 },
      { x: 67, z: 101, width: 83, depth: 105, count: 27 },
      { x: 58, z: 160, width: 78, depth: 20, count: 13 },
      { x: -129, z: -133, width: 48, depth: 48, count: 12 },
    ],
  },
};

export default dortmund;
