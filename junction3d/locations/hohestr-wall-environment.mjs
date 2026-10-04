/**
 * Approximate architectural context from the fifteen supplied photographs.
 * No imagery is embedded. Distinctive silhouettes are procedural landmarks;
 * building sizes and offsets remain editable independently of traffic logic.
 * Canonical u/v: Hiltropwall west, Südwall east, Hansa north, Hohe south.
 */
const world = (u, v) => [u - .2 * v, v + .1 * u];
const streetAngle = -Math.atan(.1);
const placed = (u, v, data) => {
  const [x, z] = world(u, v);
  return { x, z, rotation: streetAngle, ...data };
};
const patch = (id, points, options = {}) => ({ id, points: points.map(([u, v]) => world(u, v)), ...options });
const lamp = (u, v, towardU, towardV, extra = {}) => {
  const [x, z] = world(u, v), target = world(towardU, towardV);
  return { x, z, rotation: Math.atan2(target[0] - x, target[1] - z), height: 10.5, profile: 'white', ...extra };
};
const lights = [
  ...[-142, -105, -66].flatMap(u => [lamp(u, -20.5, u, -6), lamp(u, 23, u, 8)]),
  ...[66, 105, 142].flatMap(u => [lamp(u, -26.5, u, -11), lamp(u, 20, u, 5)]),
  ...[-137, -99, -62].flatMap(v => [lamp(-23, v, -7, v), lamp(16, v, 3, v)]),
  ...[62, 99, 137].flatMap(v => [lamp(-16, v, -3, v), lamp(23, v, 7, v)]),
  ...[[-34, -31], [33, -31], [-31, 31], [33, 31]].map(([u, v]) =>
    lamp(u, v, 0, 0, { height: 11, lighting: { radius: 42, intensity: 4.6, forward: 13, spread: 1.25 } })),
  lamp(-42, -66, -68, -64, { height: 5.5, profile: 'pedestrian' }),
  lamp(-104, -48, -81, -54, { height: 5.5, profile: 'pedestrian' }),
  lamp(54, -51, 71, -66, { height: 5.5, profile: 'pedestrian' }),
  lamp(124, -49, 106, -66, { height: 5.5, profile: 'pedestrian' }),
];

export const hohestrWallEnvironment = {
  seed: 514970,
  streetLights: { defaultProfile: 'white', resolution: 256, profiles: {
    white: { color: '#f0f2ed', intensity: 4.7, radius: 30, forward: 8, spread: 1.15 },
    pedestrian: { color: '#f3e7cd', intensity: 2.9, radius: 20, forward: 3.5, spread: 1.3 },
  } },
  lights,
  surfacePatches: [
    patch('platz-der-alten-synagoge', [[-128, -82], [-35, -82], [-35, -41], [-43, -33], [-128, -33]],
      { color: '#e2e0d2', pattern: 'hex', curb: true }),
    patch('theater-west-footway', [[-129, -155], [-119, -155], [-119, -82], [-129, -82]], { color: '#c0bcb0' }),
    patch('volkswohl-forecourt', [[34, 35], [151, 35], [151, 42], [75, 42], [75, 76], [35, 76]],
      { color: '#c6c3b6', curb: true }),
    patch('hohe-corner-footway', [[-87, 34], [-35, 34], [-31, 45], [-31, 140], [-38, 140], [-38, 80], [-87, 80]],
      { color: '#bdb9ab' }),
    patch('stadtgarten-west-entrance', [[23, -40], [36, -46], [49, -67], [43, -76], [24, -51]],
      { color: '#c8c1ad' }),
    patch('stadtgarten-south-path', [[38, -35], [157, -35], [157, -40], [44, -43]], { color: '#c7bd9f' }),
  ],
  landmarks: [
    placed(-83, -111, { id: 'theater-dortmund-opera', type: 'shell-hall', width: 58, depth: 48,
      height: 24, roofColor: '#a9c3a9', label: 'THEATER DORTMUND · OPER' }),
    placed(-58, 58, { id: 'hohe-blue-corner', type: 'rounded-corner', width: 36, depth: 36,
      height: 32, floors: 6, radius: 13, roofLevels: 3, color: '#d5d5c9', roofColor: '#337c9d', label: 'BERLITZ · HOHE STRASSE' }),
    placed(95, -62, { id: 'stadtgarten-skate-court', type: 'skate-court', width: 36, depth: 20, height: 1.7 }),
  ],
  buildings: [
    placed(-83, -152, { id: 'opera-stagehouse', width: 62, depth: 25, height: 31, floors: 7,
      style: 'office', color: '#d4c8ab' }),
    placed(-38, -157, { id: 'hansa-city-office', width: 24, depth: 26, height: 28, floors: 8,
      style: 'office', color: '#a68e75', label: 'HANSA' }),
    placed(-113, 51, { id: 'hiltropwall-brick-block', width: 65, depth: 24, height: 22, floors: 6,
      style: 'office', color: '#985b4b', rotation: streetAngle + Math.PI, label: 'HILTROPWALL' }),
    placed(-67, 111, { id: 'hohe-southwest-block', width: 49, depth: 52, height: 19, floors: 5,
      style: 'office', color: '#d1cbbd' }),
    placed(57, 57, { id: 'volkswohl-bund-tower', width: 25, depth: 30, height: 70, floors: 19,
      style: 'grid', color: '#d7d8cd', rotation: streetAngle + Math.PI, label: 'VOLKSWOHL BUND', labelHeight: 69,
      windowColors: ['#536d78', '#758c95', '#4c6570', '#536d78', '#a57966', '#70838a'] }),
    placed(113, 53, { id: 'volkswohl-east-wing', width: 83, depth: 22, height: 20.5, floors: 6,
      style: 'grid', color: '#d9d9ce', rotation: streetAngle + Math.PI }),
    placed(59, 110, { id: 'volkswohl-hohe-wing', width: 25, depth: 76, height: 20.5, floors: 6,
      style: 'grid', color: '#d6d5c9' }),
    placed(111, 126, { id: 'volkswohl-courtyard-wing', width: 72, depth: 20, height: 17.5, floors: 5,
      style: 'grid', color: '#d2d1c4' }),
  ],
  park: placed(92, -110, { width: 116, depth: 136 }),
  treeZones: [
    placed(-80, -27, { width: 84, depth: 6, count: 9, height: 13, radius: 4.4 }),
    placed(-29, -92, { width: 6, depth: 104, count: 10, height: 12, radius: 4.0 }),
    placed(30, -98, { width: 6, depth: 118, count: 12, height: 13, radius: 4.5 }),
    placed(87, -29, { width: 108, depth: 6, count: 12, height: 13, radius: 4.4 }),
    placed(-105, 29, { width: 85, depth: 5, count: 9, height: 12, radius: 4.0 }),
    placed(-25, 103, { width: 5, depth: 112, count: 10, height: 12, radius: 3.9 }),
    placed(29, 115, { width: 5, depth: 87, count: 9, height: 12, radius: 3.8 }),
    placed(112, 28, { width: 82, depth: 6, count: 9, height: 11.5, radius: 3.8 }),
    placed(131, -132, { width: 21, depth: 79, count: 17, height: 12, radius: 4.0 }),
    placed(67, -150, { width: 40, depth: 30, count: 10, height: 12, radius: 4.1 }),
  ],
  treeExclusions: lights.map(light => ({ x: light.x, z: light.z, width: 4, depth: 4 })),
  landscapeBeds: [
    placed(-42, -56, { width: 3, depth: 29 }),
    placed(-100, -38, { width: 38, depth: 3.5 }),
    placed(36, 59, { width: 3, depth: 28 }),
    placed(91, 107, { width: 33, depth: 20 }),
  ],
  shrubs: [
    ...[-70, -59, -48].map(v => placed(-33, v, { radius: 1.8, height: 1.0 })),
    ...[44, 57, 70, 84, 98, 112, 126, 141].map(u => placed(u, -40, { radius: 1.5, height: .95 })),
    ...[45, 62, 80, 100, 121, 143].map(u => placed(u, 37, { radius: 1.3, height: .85 })),
  ],
  backgroundZones: [
    placed(-172, -100, { width: 48, depth: 135, count: 14, minHeight: 15, maxHeight: 28 }),
    placed(-82, -218, { width: 105, depth: 56, count: 13, minHeight: 16, maxHeight: 29 }),
    placed(103, -221, { width: 128, depth: 50, count: 10, minHeight: 12, maxHeight: 22 }),
    placed(204, -82, { width: 52, depth: 137, count: 11, minHeight: 14, maxHeight: 25 }),
    placed(-177, 101, { width: 51, depth: 130, count: 13, minHeight: 15, maxHeight: 25 }),
    placed(-82, 202, { width: 104, depth: 58, count: 12, minHeight: 13, maxHeight: 24 }),
    placed(95, 211, { width: 123, depth: 54, count: 11, minHeight: 13, maxHeight: 25 }),
    placed(203, 101, { width: 49, depth: 121, count: 10, minHeight: 14, maxHeight: 24 }),
  ],
};

export default hohestrWallEnvironment;
