import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { createStreetLighting } from './street-lighting.mjs';

const lighting = () => createStreetLighting(THREE, {
  streetLights: { resolution: 128, profiles: {
    amber: { color: '#ffad38', intensity: 6, radius: 20, forward: 5, spread: 1.25 },
    white: { color: '#f0f4ff', intensity: 5, radius: 18, forward: 4, spread: 1.1 },
  } },
  lights: [{ x: -40, z: -20, height: 11, profile: 'amber' },
    { x: 40, z: 20, height: 9, rotation: Math.PI / 2, profile: 'white' }],
});

function fieldAt(controller, x, z) {
  const { image } = controller.texture, bounds = controller.uniforms.streetLightBounds.value;
  const u = (x - bounds.x) * bounds.z, v = (z - bounds.y) * bounds.w;
  if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0, 0];
  const column = Math.min(image.width - 1, Math.floor(u * image.width));
  const row = Math.min(image.height - 1, Math.floor(v * image.height));
  const index = (row * image.width + column) * 4, scale = controller.uniforms.streetLightScale.value / 255;
  return [image.data[index] * scale, image.data[index + 1] * scale, image.data[index + 2] * scale,
    image.data[index + 3] / 255 * 32];
}

test('lamp arms and road pools rotate together, with amber/white colours and smooth spatial falloff', () => {
  const controller = lighting(), [amber, white] = controller.emitters;
  assert.equal(amber.x, -40); assert.equal(amber.z, -17.75);
  assert.equal(amber.centerZ, -12.75);
  assert.equal(white.x, 42.25); assert.ok(Math.abs(white.centerX - 46.25) < 1e-8);
  const a = fieldAt(controller, amber.centerX, amber.centerZ), w = fieldAt(controller, white.centerX, white.centerZ);
  assert.ok(a[0] > a[1] * 2 && a[1] > a[2] * 4, 'B1 pool must stay distinctly yellow-orange');
  assert.ok(w[2] >= w[1] && w[2] / w[0] < 1.2, 'Side-street pool must remain neutral white');
  assert.ok(Math.abs(a[3] - 11) < .15 && Math.abs(w[3] - 9) < .15, 'Height cutoff follows the configured luminaire');
  assert.ok(fieldAt(controller, amber.centerX + 10, amber.centerZ)[0] < a[0] * .7);
  assert.equal(fieldAt(controller, amber.centerX + 21, amber.centerZ)[0], 0);
  assert.deepEqual(fieldAt(controller, 1000, 1000), [0, 0, 0, 0]);
  assert.equal(controller.texture.colorSpace, THREE.NoColorSpace, 'Irradiance data is already linear RGB');
  controller.dispose();
});

test('all materials share one passive night-strength uniform and daylight turns pools off', () => {
  const controller = lighting(), a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  controller.applyMaterial(a); controller.applyMaterial(b);
  const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader });
  const first = shader(), second = shader(); a.onBeforeCompile(first, {}); b.onBeforeCompile(second, {});
  assert.equal(first.uniforms.streetLightField, second.uniforms.streetLightField);
  assert.equal(first.uniforms.streetLightStrength, second.uniforms.streetLightStrength);
  controller.setLighting({ daylight: 0 }); assert.equal(first.uniforms.streetLightStrength.value, 1);
  controller.setLighting({ daylight: .4 }); assert.ok(first.uniforms.streetLightStrength.value > .5 && first.uniforms.streetLightStrength.value < .7);
  controller.setLighting({ daylight: 1 }); assert.equal(first.uniforms.streetLightStrength.value, 0);
  controller.dispose(); a.dispose(); b.dispose();
});

test('shader hook installs once and maps instanced positions plus surface normals into world space', () => {
  const controller = lighting(), material = new THREE.MeshStandardMaterial();
  let previousCalls = 0;
  material.onBeforeCompile = () => { previousCalls++; };
  controller.applyMaterial(material); const installedHook = material.onBeforeCompile;
  controller.applyMaterial(material); assert.equal(material.onBeforeCompile, installedHook);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {}); assert.equal(previousCalls, 1);
  assert.equal(shader.vertexShader.match(/varying vec3 vStreetWorldPosition;/g).length, 1);
  assert.equal(shader.fragmentShader.match(/texture2D\(streetLightField/g).length, 1);
  assert.ok(shader.vertexShader.indexOf('instanceMatrix * streetWorldPosition') < shader.vertexShader.indexOf('modelMatrix * streetWorldPosition'));
  assert.match(shader.fragmentShader, /inverseTransformDirection\(normal, viewMatrix\)/);
  assert.match(shader.fragmentShader, /clamp\(0\.45 \+ 0\.55 \* streetNormal\.y, 0\.0, 1\.0\)/);
  assert.match(shader.fragmentShader, /smoothstep\(streetCeiling \* 0\.65, streetCeiling \+ 1\.0, vStreetWorldPosition\.y\)/);
  assert.match(material.customProgramCacheKey(), /street-irradiance-v1/);
  // Nonuniform instance scale and a moving parent's transform must both affect
  // the sample position, while normals need inverse-transpose transformation.
  const instance = new THREE.Matrix4().compose(new THREE.Vector3(8, 0, 3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .3), new THREE.Vector3(2, 3, .5));
  const model = new THREE.Matrix4().makeTranslation(30, 0, -5);
  const world = model.clone().multiply(instance), view = new THREE.Matrix4().makeRotationY(.6);
  const p = new THREE.Vector3(.2, .5, 1);
  assert.ok(p.clone().applyMatrix4(instance).applyMatrix4(model).distanceTo(p.clone().applyMatrix4(world)) < 1e-10);
  const n = new THREE.Vector3(0, 1, 0), expected = n.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(world)).normalize();
  const fromView = n.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(view.clone().multiply(world))).normalize().transformDirection(view.clone().invert());
  assert.ok(fromView.distanceTo(expected) < 1e-10);
  controller.dispose(); material.dispose();
});

test('scenes without street lamps keep ordinary shaders untouched', () => {
  const controller = createStreetLighting(THREE), material = new THREE.MeshStandardMaterial();
  const original = material.onBeforeCompile; controller.applyMaterial(material);
  assert.equal(material.onBeforeCompile, original); assert.equal(controller.texture, null);
  controller.setLighting({ daylight: 0 }); controller.dispose(); material.dispose();
});
