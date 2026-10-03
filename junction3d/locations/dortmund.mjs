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

/** A route's points include its stop line and continue to the scene boundary. */
const mainRoutes = [13.8, 17.3, 20.8].flatMap((z, lane) => [
  {
    id: `west-east-${lane}`, label: `B1 · West → Ost · Spur ${lane + 1}`,
    group: 'main', laneId: `w${lane}`, exitId: `east${lane}`, turn: 'straight',
    points: [[-220, z], [-80, z], [-28, z], [34, z], [100, z], [220, z]],
    stopLine: [-28, z], rate: [490, 560, 420][lane], speed: 13.9,
  },
  {
    id: `east-west-${lane}`, label: `B1 · Ost → West · Spur ${lane + 1}`,
    group: 'main', laneId: `e${lane}`, exitId: `west${lane}`, turn: 'straight',
    points: [[220, -z], [80, -z], [28, -z], [-34, -z], [-100, -z], [-220, -z]],
    stopLine: [28, -z], rate: [500, 540, 430][lane], speed: 13.9,
  },
]);

export const dortmund = {
  id: 'dortmund-westfalendamm',
  name: 'Westfalendamm',
  subtitle: 'Dortmund · B1 × Voßkuhle / Semmerteichstraße',
  ui: { roadBadge: 'B 1', phaseExplainer: 'Die B1 erhält jede zweite Grünphase.' },
  description: 'Eine räumliche Rekonstruktion der Kreuzung mit getrennten Nebenstraßenphasen.',
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
    { id: 'main-a', label: 'Hauptstraße · West ↔ Ost', groups: ['main'], duration: 32 },
    { id: 'north', label: 'Nebenstraße → Süd · links nach Ost', groups: ['north'], duration: 22 },
    { id: 'main-b', label: 'Hauptstraße · West ↔ Ost', groups: ['main'], duration: 32 },
    { id: 'south', label: 'Nebenstraße → Nord · links nach West', groups: ['south'], duration: 22 },
  ],
  roads: [
    { id: 'b1-west', label: 'Westfalendamm · Richtung West', points: [[-220, -18], [220, -18]], width: 12, lanes: 3 },
    { id: 'b1-east', label: 'Westfalendamm · Richtung Ost', points: [[-220, 18], [220, 18]], width: 12, lanes: 3 },
    { id: 'side', label: 'Voßkuhle / Semmerteichstraße', points: [[-112, -170], [-65, -112], [-26, -65], [-3, -32], [0, 30], [7, 80], [9, 180]], width: 22, lanes: 6 },
  ],
  routes: [
    ...mainRoutes,
    {
      id: 'north-through', label: 'Voßkuhle → Semmerteichstraße',
      vehicleKinds: ['car', 'van'],
      group: 'north', laneId: 'n1', exitId: 'south1', turn: 'straight',
      points: [...northApproach.middle, [-7, 0], [-5.25, 30], [1.75, 80], [3.75, 180]],
      stopLine: [-8.3, -31], rate: 190, speed: 9.7,
    },
    {
      id: 'north-left', label: 'Voßkuhle → B1 Ost',
      vehicleKinds: ['car', 'van'],
      group: 'north', laneId: 'n0', exitId: 'east0', turn: 'left',
      points: [...northApproach.inner, [-4.5, -15], [-3, -3], [1, 7], [8, 12], [20, 13.8], [45, 13.8], [220, 13.8]],
      stopLine: [-4.8, -31], rate: 170, speed: 7.5,
    },
    {
      id: 'north-right', label: 'Voßkuhle → B1 West',
      vehicleKinds: ['car', 'van'],
      group: 'north', laneId: 'n2', exitId: 'west2', turn: 'right',
      points: [...northApproach.outer, [-14, -25], [-20, -21.5], [-30, -20.8], [-60, -20.8], [-220, -20.8]],
      stopLine: [-11.8, -31], rate: 110, speed: 6.5,
    },
    {
      id: 'south-through', label: 'Semmerteichstraße → Voßkuhle',
      vehicleKinds: ['car', 'van'],
      group: 'south', laneId: 's1', exitId: 'north1', turn: 'straight',
      points: [...southApproach.middle, [4, 0], [2.2, -32], [-21.5, -67.7], [-60.9, -115.3], [-107.9, -173.3]],
      stopLine: [5.25, 31], rate: 210, speed: 9.7,
    },
    {
      id: 'south-left', label: 'Semmerteichstraße → B1 West',
      vehicleKinds: ['car', 'van'],
      group: 'south', laneId: 's0', exitId: 'west0', turn: 'left',
      points: [...southApproach.inner, [1.3, 15], [-0.5, 1], [-7, -8], [-17, -13], [-30, -13.8], [-60, -13.8], [-220, -13.8]],
      stopLine: [1.75, 31], rate: 180, speed: 7.5,
    },
    {
      id: 'south-right', label: 'Semmerteichstraße → B1 Ost',
      vehicleKinds: ['car', 'van'],
      group: 'south', laneId: 's2', exitId: 'east2', turn: 'right',
      points: [...southApproach.outer, [14, 24], [24, 20.8], [45, 20.8], [220, 20.8]],
      stopLine: [8.75, 31], rate: 120, speed: 6.5,
    },
  ],
  cameras: [
    { id: 'overview', label: 'Übersicht', description: 'Freier Blick über den gesamten Knotenpunkt', position: [165, 180, 210], target: [0, 0, 0], fov: 48 },
    { id: 'north', label: 'Voßkuhle', description: 'Nordmast · Blick Richtung Süd', position: [-30, 10, -47], target: [0, 1.2, 16], fov: 58 },
    { id: 'south', label: 'Semmerteichstraße', description: 'Südmast · Blick Richtung Nord', position: [22, 10, 49], target: [-3, 1.2, -16], fov: 58 },
    { id: 'west', label: 'B1 · West', description: 'Westmast · Blick Richtung Ost', position: [-49, 10, 33], target: [8, 1.5, -3], fov: 57 },
    { id: 'east', label: 'B1 · Ost', description: 'Ostmast · Blick Richtung West', position: [49, 10, -33], target: [-8, 1.5, 3], fov: 57 },
    { id: 'station', label: 'Stadtbahn', description: 'Haltestelle Voßkuhle · Blick über die Gleise', position: [63, 8, 7], target: [-4, 1.5, -1], fov: 62 },
  ],
  environment: {
    rails: { from: -220, to: 220, tracks: [-2.4, 2.4] },
    station: { x: 85, length: 80, label: 'Voßkuhle', infoLines: ['U47', 'Dortmund'] },
    fuelStation: { x: 130, z: -65 },
    park: { x: 76, z: 99, width: 94, depth: 118 },
    lights: [
      ...[-200, -150, -100, -50, 50, 100, 150, 200].flatMap(x => [
        { x, z: -29, height: 11 },
        { x, z: 29, height: 11, rotation: Math.PI },
      ]),
      { x: -83, z: -111, height: 9, rotation: Math.PI / 2 },
      { x: -58, z: -78, height: 9, rotation: Math.PI / 2 },
      { x: 22, z: 76, height: 9, rotation: -Math.PI / 2 },
      { x: 24, z: 130, height: 9, rotation: -Math.PI / 2 },
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
      { x: -44, z: -60, width: 6, depth: 22 },
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
