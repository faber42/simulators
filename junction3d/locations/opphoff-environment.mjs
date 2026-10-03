/**
 * Surface context for the Märkische Straße / Westfalen-/Rheinlanddamm junction.
 * Approximate metres from the supplied 215325, 215550 and 221332 references.
 * The underground B1 and railway are intentionally absent from this model.
 * +x east, +z south; Märkische Straße follows x = .6z.
 */
const diagonalBed = (from, to, halfWidth = 8) => [
  [.6 * from - halfWidth, from], [.6 * from + halfWidth, from],
  [.6 * to + halfWidth, to], [.6 * to - halfWidth, to],
];

const mainLamps = [-205, -155, -105, -65, 65, 105, 155, 205].flatMap(x => [-1, 1].map(side => ({
  x, z: side * 42, height: 11, profile: 'main', rotation: side > 0 ? Math.PI : 0,
})));
const diagonalLamps = [-155, -110, -68, 68, 110, 155].flatMap(z => [-1, 1].map(side => {
  const nx = 1 / Math.hypot(.6, 1), nz = -.6 / Math.hypot(.6, 1);
  // Pull the two outer corner masts clear of the separate right-turn slips.
  if (Math.abs(z) === 68 && Math.sign(z) === side) return {
    x: side * 78, z: side * 53, height: 10, profile: 'side', rotation: Math.atan2(-nx * side, -nz * side),
  };
  return { x: .6 * z + nx * side * 32, z: z + nz * side * 32, height: 10,
    profile: 'side', rotation: Math.atan2(-nx * side, -nz * side) };
}));

export const opphoffEnvironment = {
  seed: 35816,
  streetLights: { defaultProfile: 'side', resolution: 256, profiles: {
    main: { color: '#ffb24a', intensity: 5.4, radius: 34, forward: 7, spread: 1.15 },
    side: { color: '#f0f4ff', intensity: 4.8, radius: 31, forward: 7, spread: 1.12 },
  } },
  lights: [...mainLamps, ...diagonalLamps,
    { x: 0, z: 0, height: 11, double: true, rotation: Math.PI / 2, profile: 'side',
      lighting: { radius: 40, forward: 14 } },
  ],
  surfacePatches: [
    { id: 'west-surface-green', points: [[-230, -20.9], [-48, -20.9], [-48, 20.9], [-230, 20.9]], surface: 'grass', color: '#8b9368' },
    { id: 'east-pavilion-garden', points: [[50, -20.9], [230, -20.9], [230, 20.9], [50, 20.9]], surface: 'grass', color: '#8d996c' },
    { id: 'pavilion-terrace', points: [[73, -17], [114, -17], [118, -10], [118, 15], [108, 18], [78, 18], [74, 12], [67, 11], [64, 4], [69, -2], [65, -8], [68, -14]], color: '#bc9180', curb: true },
    { id: 'pavilion-footway-north', points: [[44, -23], [230, -23], [230, -20], [48, -20]], color: '#bdb8aa' },
    { id: 'pavilion-footway-south', points: [[53, 20], [230, 20], [230, 23], [55, 23]], color: '#bdb8aa' },
    { id: 'north-median-garden', points: diagonalBed(-185, -62), surface: 'grass', color: '#8a966c' },
    { id: 'south-median-garden', points: diagonalBed(62, 185), surface: 'grass', color: '#8a966c' },
  ],
  pavilions: [
    { id: 'opphoff-pavilion', x: 94, z: 0, width: 37, depth: 22, height: 5.15, label: 'PAVILLON' },
  ],
  parkingLots: [
    { id: 'dealership-sales-court', x: 98, z: -57, width: 100, depth: 25, rows: 2, occupancy: .87, label: 'AUTOHAUS' },
    { id: 'residence-court', x: -130, z: 133, width: 28, depth: 22, rows: 2, occupancy: .62, rotation: -.13 },
    { id: 'east-surface-parking', x: 150, z: 74, width: 43, depth: 38, rows: 2, occupancy: .24 },
  ],
  buildings: [
    { id: 'senior-residence', x: -63, z: 77, width: 68, depth: 25, height: 22, floors: 7,
      style: 'residential', color: '#dad6c7', rotation: Math.PI - .2, label: 'SENIOREN-RESIDENZ' },
    { id: 'residence-west-wing', x: -94, z: 105, width: 25, depth: 32, height: 18.5, floors: 6,
      style: 'residential', color: '#d0c8b4', rotation: -.2 },
    { id: 'residence-east-wing', x: -37, z: 107, width: 24, depth: 32, height: 16, floors: 5,
      style: 'residential', color: '#d7d1be', rotation: .33 },
    { id: 'west-neighborhood-shops', x: -158, z: 72, width: 42, depth: 27, height: 14, floors: 4,
      style: 'residential', color: '#d1c4ae', rotation: Math.PI, label: 'RHEINLANDDAMM' },
    { id: 'volkswagen-showroom', x: 96, z: -95, width: 82, depth: 34, height: 8.5, floors: 2,
      style: 'showroom', color: '#dce1de', label: 'VOLKSWAGEN ZENTRUM · DORTMUND' },
    { id: 'dealership-workshop', x: 140, z: -129, width: 62, depth: 30, height: 7.5, floors: 1,
      style: 'showroom', color: '#c9d0cf' },
    { id: 'north-local-office', x: -2, z: -107, width: 37, depth: 31, height: 15, floors: 4,
      style: 'office', color: '#c4bda8', rotation: -.2 },
    { id: 'northwest-corner-shops', x: -111, z: -72, width: 37, depth: 29, height: 17, floors: 5,
      style: 'residential', color: '#c3b398', rotation: -.48, label: 'MÄRKISCHE STRASSE' },
    { id: 'northwest-residential', x: -151, z: -112, width: 30, depth: 46, height: 18.5, floors: 6,
      style: 'residential', color: '#c6bba6', rotation: -.48 },
    { id: 'southeast-corner', x: 158, z: 134, width: 42, depth: 33, height: 19, floors: 6,
      style: 'residential', color: '#cec6b4', rotation: -.48 },
  ],
  shrubs: [
    { x: 12, z: -43, radius: 1.45, height: 1.25, elevation: .24 },
    { x: -65, z: -46, radius: 1.6, height: 1.3, elevation: .24 },
    { x: 65, z: 46, radius: 1.6, height: 1.3, elevation: .24 },
    ...[-11, -7, -2, 3, 8, 12].flatMap((z, index) => [-1, 1].map(side => ({
      x: .6 * z + side * (Math.abs(z) > 9 ? .8 : 1.8), z,
      radius: Math.abs(z) > 9 ? 1.25 : 1.65, height: 1.4 + index % 3 * .2, elevation: .24,
      color: ['#64773e', '#7b8651', '#536d40'][index % 3],
    }))),
    ...[-19, 19].flatMap(z => [55, 63, 123, 132, 142, 155].map(x => ({ x, z, radius: 1.45, height: 1.4 }))),
    ...[-18, 18].flatMap(z => [-65, -78, -93, -112, -135, -162, -190].map(x => ({ x, z, radius: 1.8, height: 1.35 }))),
  ],
  landscapeBeds: [
    { x: -135, z: 48, width: 50, depth: 4 },
    { x: 183, z: -44, width: 43, depth: 4 },
  ],
  treeZones: [
    { x: -197, z: 0, width: 65, depth: 20, count: 15, height: 11, radius: 3.6 },
    { x: -113, z: 0, width: 83, depth: 14, count: 15, height: 10, radius: 3.5 },
    { x: 181, z: 0, width: 82, depth: 24, count: 18, height: 11, radius: 3.5 },
    { x: -88, z: -146, width: 14, depth: 35, count: 8, height: 11, radius: 3.8 },
    { x: -50, z: -87, width: 12, depth: 29, count: 7, height: 11, radius: 3.8 },
    { x: 55, z: 95, width: 17, depth: 31, count: 8, height: 10, radius: 3.5 },
    { x: 91, z: 151, width: 16, depth: 29, count: 8, height: 11, radius: 3.5 },
    { x: -169, z: -51, width: 68, depth: 11, count: 11, height: 12, radius: 3.8 },
    { x: -182, z: 113, width: 23, depth: 110, count: 14, height: 12, radius: 4 },
    { x: -4, z: 145, width: 54, depth: 28, count: 14, height: 12, radius: 4 },
    { x: 210, z: 124, width: 34, depth: 126, count: 20, height: 12, radius: 4 },
    { x: 35, z: -157, width: 75, depth: 25, count: 15, height: 11, radius: 3.8 },
    { x: 192, z: -113, width: 18, depth: 122, count: 16, height: 11, radius: 3.8 },
  ],
  directionSigns: [
    { x: -83, z: -54, rotation: .54, width: 4.9, lines: ['↑ Hörde', '← B1 · Unna', 'B1 · Essen →'] },
    { x: 83, z: 54, rotation: Math.PI + .54, width: 4.9, lines: ['↑ Zentrum', '← B1 · Essen', 'B1 · Unna →'] },
  ],
  backgroundZones: [
    { x: -231, z: -143, width: 75, depth: 120, count: 13, minHeight: 12, maxHeight: 24 },
    { x: -36, z: -240, width: 123, depth: 68, count: 11, minHeight: 12, maxHeight: 25 },
    { x: 157, z: -235, width: 152, depth: 66, count: 10, minHeight: 10, maxHeight: 23 },
    { x: 254, z: -105, width: 63, depth: 107, count: 9, minHeight: 12, maxHeight: 25 },
    { x: -198, z: 217, width: 149, depth: 65, count: 12, minHeight: 10, maxHeight: 22 },
    { x: -21, z: 223, width: 151, depth: 61, count: 13, minHeight: 12, maxHeight: 24 },
    { x: 250, z: 196, width: 58, depth: 112, count: 10, minHeight: 13, maxHeight: 28 },
  ],
};

export default opphoffEnvironment;
