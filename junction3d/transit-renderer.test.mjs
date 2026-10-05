import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { createTransitRenderer } from './transit-renderer.mjs';
import dortmund from './locations/dortmund.mjs';

// Only destination-text painting needs a DOM. The actual vehicle geometry,
// transforms, batching and material updates use the production Three objects.
function withRenderer(run) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  } });
  const scene = new THREE.Scene();
  const renderer = createTransitRenderer(THREE, scene, { transit: { routes: [] } });
  try { run(renderer, scene); }
  finally {
    renderer.dispose();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
}

function body(id, route) {
  return { id, route, routeId: route.id, length: route.length, x: 0, z: 0, heading: 0 };
}

function vertices(model, predicate = () => true) {
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert(), points = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || !predicate(mesh)) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const attribute = mesh.geometry.getAttribute('position');
    for (let index = 0; index < attribute.count; index++) {
      points.push(new THREE.Vector3().fromBufferAttribute(attribute, index).applyMatrix4(matrix));
    }
  });
  return points;
}

const colour = hex => mesh => mesh.material.color.getHexString() === hex;

test('Voßkuhle renders two original articulated units, one raised collector and only exterior end lights', () => {
  withRenderer(renderer => {
    const trams = dortmund.transit.routes.map((route, index) => body(`test-${index}`, route));
    renderer.update({ trams });
    for (const tram of trams) {
      assert.equal(tram.length, 56);
      const model = renderer.vehicles.get(tram.id);
      assert.equal(model.userData.unitCount, 2);
      assert.equal(model.userData.nominalLength, 56);
      assert.equal(model.scale.z, 1, 'The original 28 m body must be duplicated, not stretched');
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.z > 55.9 && size.z <= 56.01, 'Visible coupled length must match the simulated 56 m body');
      assert.ok(Math.abs(size.x - 2.5) < 1e-6);

      // Each existing articulated model has its own central rubber bellows.
      // Looking at rendered vertices catches a single model stretched to 56 m.
      const joints = vertices(model, colour('343b3a'));
      assert.ok(joints.some(point => point.z < -13.7) && joints.some(point => point.z > 13.7));
      assert.ok(joints.every(point => Math.abs(Math.abs(point.z) - 14) < .28));
      const raised = vertices(model).filter(point => point.y > 5);
      assert.ok(raised.length > 0);
      assert.ok(raised.every(point => point.z > 0), 'Only the leading unit reaches the overhead wire');
      const rear = vertices(model).filter(point => point.z < 0);
      assert.ok(Math.max(...rear.map(point => point.y)) < 4, 'The rear pantograph stays folded on its roof');
      const headlights = vertices(model, colour('fff4da'));
      const taillights = vertices(model, colour('c9362e'));
      assert.ok(headlights.length > 0 && taillights.length > 0);
      assert.ok(headlights.every(point => point.z > 27));
      assert.ok(taillights.every(point => point.z < -27));
    }
  });
});

test('single and double units keep distinct cached geometry, share clones and retain night lighting', () => {
  withRenderer(renderer => {
    const route = dortmund.transit.routes[0];
    const singleRoute = { ...route, id: 'single', length: 28 };
    delete singleRoute.units;
    const single = body('single', singleRoute), double = body('double', route), clone = body('clone', route);
    renderer.update({ trams: [single, double, clone] });
    const one = renderer.vehicles.get(single.id), two = renderer.vehicles.get(double.id), another = renderer.vehicles.get(clone.id);
    assert.equal(one.userData.nominalLength, 28);
    assert.equal(one.scale.z, 1);
    assert.ok(vertices(one, colour('343b3a')).every(point => Math.abs(point.z) < .28));
    assert.equal(two.userData.nominalLength, 56);
    const geometrySet = model => {
      const result = new Set(); model.traverse(mesh => { if (mesh.isMesh) result.add(mesh.geometry); }); return result;
    };
    const doubleGeometries = geometrySet(two);
    assert.deepEqual(geometrySet(another), doubleGeometries, 'Live clones reuse their batched model');
    assert.ok(doubleGeometries.size <= 24, 'The second unit must not add a draw call for every detail');
    renderer.setLighting({ daylight: 0 });
    let illuminatedWindows = 0;
    two.traverse(mesh => {
      if (mesh.isMesh && mesh.material.emissive?.getHexString() === 'edd4a1' && mesh.material.emissiveIntensity > 0) illuminatedWindows++;
    });
    assert.ok(illuminatedWindows > 0);
    const removed = two;
    renderer.update({ trams: [body('double', route)] });
    assert.equal(renderer.vehicles.size, 1);
    assert.notEqual(renderer.vehicles.get('double'), removed, 'Reset identity reuse must replace the prior simulation body');
    assert.equal(removed.parent, null);
  });
});
