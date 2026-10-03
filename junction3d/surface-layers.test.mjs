import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { SURFACE_HEIGHTS as heights, surfaceMaterialOptions, cameraNearForHeight, CAMERA_FAR } from './surface-layers.mjs';
import { buildEnvironment } from './environment.mjs';
import dortmund from './locations/dortmund.mjs';
import opphoff from './locations/opphoff.mjs';

const DEPTH_STEPS = 2 ** 24 - 1;
const resolution = { width: 1920, height: 1080 };

function cameraAt(position, target = [0, 0, 0], near = cameraNearForHeight(position[1]), fov = 48) {
  const camera = new THREE.PerspectiveCamera(fov, resolution.width / resolution.height, near, CAMERA_FAR);
  camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld(true);
  return camera;
}

function views() {
  const result = [...dortmund.cameras, ...opphoff.cameras].map(spec => cameraAt(spec.position, spec.target, undefined, spec.fov));
  for (const distance of [25, 310, 520]) for (const phi of [.15, .85, 1.48]) for (const theta of [0, .67, Math.PI]) {
    for (const jitter of [0, .037]) result.push(cameraAt([
      distance * Math.sin(phi) * Math.sin(theta) + jitter,
      distance * Math.cos(phi), distance * Math.sin(phi) * Math.cos(theta) - jitter,
    ]));
  }
  result.push(cameraAt([30, 3, 30], [0, 1, 0], undefined, 85));
  return result;
}

// Independent fixed-depth-buffer model using Three's actual projection matrix.
// Intersect parallel surfaces along the SAME pixel ray: equal x/z vertices do
// not land on the same pixel, especially in the shallow street cameras.
function planeDepth(camera, ndc, height) {
  const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(ndc, camera);
  const t = (Math.fround(height) - raycaster.ray.origin.y) / raycaster.ray.direction.y;
  const hit = raycaster.ray.at(t, new THREE.Vector3()).project(camera);
  return (hit.z * .5 + .5) * DEPTH_STEPS;
}

function bufferedDepth(camera, ndc, height, material = {}) {
  const depth = planeDepth(camera, ndc, height);
  if (!material.polygonOffset) return Math.round(depth);
  const dx = Math.abs(planeDepth(camera, new THREE.Vector2(ndc.x + 2 / resolution.width, ndc.y), height) - depth);
  const dy = Math.abs(planeDepth(camera, new THREE.Vector2(ndc.x, ndc.y + 2 / resolution.height), height) - depth);
  return Math.round(depth + Math.max(dx, dy) * (material.polygonOffsetFactor ?? 0) + (material.polygonOffsetUnits ?? 0));
}

function projectedPixel(camera, x, z) {
  const point = new THREE.Vector3(x, 0, z).project(camera);
  return Math.abs(point.x) < .97 && Math.abs(point.y) < .97 && point.z > -1 && point.z < 1
    ? new THREE.Vector2(point.x, point.y) : null;
}

test('the old distant overview collapses centimetre road layers into one depth value', () => {
  let foundTie = false;
  for (let displacement = 0; displacement < .3; displacement += .01) {
    const camera = cameraAt([0, 520 + displacement, 0], [0, 0, 0], .3);
    const pixel = projectedPixel(camera, 0, 0);
    if (bufferedDepth(camera, pixel, .005) === bufferedDepth(camera, pixel, .035)) foundTie = true;
  }
  assert.ok(foundTie, 'The regression must reproduce the old pavement/asphalt quantization collision');
});

test('surface stacks retain a depth reserve through far, shallow and street-level camera views', t => {
  const pairs = [
    ['terrain', heights.terrain, 'roadUnderlay', heights.roadUnderlay],
    ['roadUnderlay', heights.roadUnderlay, 'road', heights.road],
    ['road', heights.road, 'marking', heights.roadMarking],
    ['grass', heights.grass, 'paving', heights.paving],
    ['parking', heights.parking, 'marking', heights.parkingPaint],
    ['turf', heights.bedTurf, 'turf', heights.bedSoil],
    [null, heights.curb, 'turf', heights.curb + heights.turfGap],
  ];
  const points = [[0, 0], ...[dortmund, opphoff].flatMap(config => config.roads.flatMap(road => road.points))];
  let checks = 0, minimum = Infinity;
  for (const camera of views()) for (const [x, z] of points) {
    const pixel = projectedPixel(camera, x, z);
    if (!pixel) continue;
    for (const [lowerRole, lower, upperRole, upper] of pairs) {
      const behind = bufferedDepth(camera, pixel, lower, lowerRole ? surfaceMaterialOptions(lowerRole) : {});
      const front = bufferedDepth(camera, pixel, upper, surfaceMaterialOptions(upperRole));
      const gap = behind - front;
      assert.ok(gap >= 4, `${lowerRole || 'curb'} / ${upperRole} have only ${gap} depth steps at camera ${camera.position.toArray()}`);
      minimum = Math.min(minimum, gap); checks++;
    }
    // Depth bias must not make a road marking cover the bottom of a real car.
    assert.ok(bufferedDepth(camera, pixel, heights.roadMarking, surfaceMaterialOptions('marking'))
      > bufferedDepth(camera, pixel, .4), 'A visible vehicle body remains in front of the biased road paint');
  }
  assert.ok(checks > 3000, 'Exercise both location footprints and the supported camera extremes');
  t.diagnostic(`${checks} projected surface pairs; minimum separation ${minimum} / 24-bit depth steps`);
});

test('semantic material priority also resolves exactly coplanar ground, paving and paint', () => {
  for (const camera of views()) {
    const pixel = projectedPixel(camera, 0, 0);
    if (!pixel) continue;
    const depth = role => bufferedDepth(camera, pixel, .052, surfaceMaterialOptions(role));
    assert.ok(depth('terrain') > depth('grass'));
    assert.ok(depth('grass') - depth('paving') >= 4);
    assert.ok(depth('paving') > depth('road'));
    assert.ok(depth('road') - depth('marking') >= 4);
  }
});

function withEnvironment(environment, inspect) {
  const original = globalThis.document;
  // Texture drawing is irrelevant to these geometry/depth checks; real Three
  // geometries, materials, world transforms and static batching still execute.
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };
  let controller;
  try {
    const scene = new THREE.Scene(); controller = buildEnvironment(THREE, scene, { environment });
    scene.updateMatrixWorld(true);
    return inspect(controller.group);
  } finally {
    controller?.dispose();
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

test('the actual Opphoff terrace and footways stay in front of the garden underneath them', () => {
  withEnvironment({ surfacePatches: opphoff.environment.surfacePatches }, root => {
    const garden = root.getObjectByName('east-pavilion-garden');
    const samples = [
      ['pavilion-terrace', 80, -12], ['pavilion-terrace', 110, 13],
      ['pavilion-footway-north', 100, -20.5], ['pavilion-footway-south', 100, 20.5],
    ];
    assert.ok(garden);
    let checks = 0;
    for (const [name, x, z] of samples) {
      const paved = root.getObjectByName(name);
      const down = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
      const grassHit = down.intersectObject(garden)[0], pavedHit = down.intersectObject(paved)[0];
      assert.ok(grassHit && pavedHit, `${name} fixture must really overlap the garden`);
      assert.ok(pavedHit.point.y > grassHit.point.y, 'The terrace/footway has a real height separation');
      for (const camera of views()) {
        const pixel = projectedPixel(camera, x, z);
        if (!pixel) continue;
        assert.ok(bufferedDepth(camera, pixel, grassHit.point.y, garden.material)
          - bufferedDepth(camera, pixel, pavedHit.point.y, paved.material) >= 4);
        checks++;
      }
    }
    assert.ok(checks > 80);
  });
});

function meshesWithColor(root, hex) {
  const meshes = [];
  root.traverse(object => { if (object.isMesh && object.material.color?.getHexString() === hex) meshes.push(object); });
  return meshes;
}

test('parking paint and planted soil are physically above their supporting surfaces', () => {
  withEnvironment({ parkingLots: [{ x: 0, z: 0, width: 20, depth: 16, occupancy: 0 }] }, root => {
    const paving = meshesWithColor(root, 'aaa79a')[0], asphalt = meshesWithColor(root, '818580')[0];
    const paint = meshesWithColor(root, 'dfded3')[0];
    assert.ok(paving && asphalt && paint);
    const base = new THREE.Box3().setFromObject(paving), road = new THREE.Box3().setFromObject(asphalt), lines = new THREE.Box3().setFromObject(paint);
    assert.ok(road.min.y > base.max.y, 'The parking overlay does not intersect its underlying paving box');
    assert.ok(lines.min.y > road.max.y, 'Parking stripes do not share the asphalt top plane');
  });
  withEnvironment({ landscapeBeds: [{ x: 0, z: 0, width: 12, depth: 6 }] }, root => {
    const soil = meshesWithColor(root, '6b604a')[0];
    const turf = meshesWithColor(root, 'ffffff').find(mesh => mesh.material.map?.repeat.x === 6);
    assert.ok(soil && turf);
    const soilBounds = new THREE.Box3().setFromObject(soil), turfBounds = new THREE.Box3().setFromObject(turf);
    assert.ok(soilBounds.min.y > turfBounds.max.y, 'The soil slab must not intersect and expose the turf slab beneath it');
    for (const camera of views()) {
      const pixel = projectedPixel(camera, 0, 0);
      if (!pixel) continue;
      assert.ok(bufferedDepth(camera, pixel, turfBounds.max.y, turf.material)
        - bufferedDepth(camera, pixel, soilBounds.max.y, soil.material) >= 4,
      'Actual soil and turf material biases must preserve their top-surface separation');
    }
  });
});

test('intersecting park footways have one covering face, with neither coplanar duplicates nor holes', () => {
  const width = 50, depth = 60;
  const paths = [
    [[-width / 2 + 2, depth / 2 - 2], [width / 2 - 2, -depth / 2 + 2], 2.15],
    [[-width / 2 + 2, -depth / 2 + 2], [width / 2 - 2, depth / 2 - 2], 2.15],
    [[-width / 2 + 2, depth / 2 - 2], [width / 2 - 2, depth / 2 - 2], 2],
  ];
  const insideStrip = (x, z, [a, b, w]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const along = ((x - a[0]) * dx + (z - a[1]) * dz) / length;
    const across = Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / length;
    return along > 0 && along < length && across < w / 2;
  };
  withEnvironment({ park: { x: 0, z: 0, width, depth } }, root => {
    const pathsOnly = meshesWithColor(root, 'd0c6ad');
    assert.ok(pathsOnly.length);
    const down = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    let covered = 0;
    for (let x = -25 + .137; x < 25; x += .61) for (let z = -30 + .293; z < 30; z += .67) {
      down.ray.origin.set(x, 2, z);
      const hits = down.intersectObjects(pathsOnly);
      const expected = paths.some(path => insideStrip(x, z, path));
      assert.equal(hits.length, expected ? 1 : 0, `Footway coverage at ${x.toFixed(3)}, ${z.toFixed(3)}`);
      if (expected) covered++;
    }
    assert.ok(covered > 600, 'Probe all three strips and their overlapping crossings');
  });
});
