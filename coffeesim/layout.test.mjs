import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { CoffeeScene } from './scene.js';
import { getPhases, getState } from './cycle.mjs';
import { BREW_GEOMETRY, getBrewMechanics } from './brew-mechanics.mjs';
import { LAYOUT, brewPoint, servicePose } from './layout.mjs';

// Build the production meshes and run production animation without a browser
// or WebGL. Only canvas lettering, camera movement and rendering are replaced.
function makeScene() {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  };
  try {
    const scene = Object.create(CoffeeScene.prototype);
    Object.assign(scene, {
      scene: new THREE.Scene(), machine: new THREE.Group(), flowPaths: [], housing: [],
      cutaway: true, exploded: false, explodeAmount: 0, state: {},
      updateCamera() {}, render() {}, makeDisplayTexture: () => new THREE.Texture(),
    });
    scene.scene.add(scene.machine);
    scene.makeMaterials(); scene.makeHousing(); scene.makeHopper(); scene.makeGrinder();
    scene.makeBrewGroup(); scene.makeDrive(); scene.makeHydraulics();
    scene.makeMilk(); scene.makeCup(); scene.makeFlows();
    scene.update(getState(0), 0);
    return scene;
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

const scene = makeScene();
const vector = values => new THREE.Vector3(...values);
const EPSILON = 1e-5;

function sample(time, amount = 0) {
  scene.exploded = amount > 0;
  scene.explodeAmount = amount;
  scene.update(getState(time), 0);
  scene.machine.updateMatrixWorld(true);
}

function visibleBounds(root) {
  const bounds = new THREE.Box3();
  const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  function visit(object) {
    if (!object.visible) return;
    if (object.geometry) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, instance);
          world.multiplyMatrices(object.matrixWorld, instance);
          bounds.union(object.geometry.boundingBox.clone().applyMatrix4(world));
        }
      } else bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
    object.children.forEach(visit);
  }
  visit(root);
  assert.ok(!bounds.isEmpty(), 'geometry must be present in the bounds check');
  return bounds;
}

function assertInside(body, description) {
  const bounds = visibleBounds(body);
  assert.ok(bounds.max.z <= LAYOUT.frontInnerZ + EPSILON,
    `${description} protrudes through the dispensing wall: z=${bounds.max.z}`);
  assert.ok(bounds.min.z >= LAYOUT.rearInnerZ - EPSILON,
    `${description} protrudes through the rear wall: z=${bounds.min.z}`);
  assert.ok(bounds.min.x >= -LAYOUT.sideInnerX - EPSILON
    && bounds.max.x <= LAYOUT.sideInnerX + EPSILON,
  `${description} protrudes through a side wall: x=[${bounds.min.x}, ${bounds.max.x}]`);
}

function pointNear(a, b, tolerance = EPSILON, message = 'points coincide') {
  assert.ok(a.distanceTo(b) <= tolerance,
    `${message}: ${a.toArray()} vs ${b.toArray()}`);
}

test('installed brew group, entire wire linkage and motor stay inside the housing for a full cycle', () => {
  const duration = getPhases().at(-1).start;
  for (let time = 0; time <= duration; time += .25) {
    sample(time);
    assertInside(scene.brewUnit, `brew group at ${time}s`);
    assertInside(scene.drive, `external drive at ${time}s`);
    assert.ok(!visibleBounds(scene.tank).intersectsBox(visibleBounds(scene.brewUnit)),
      `brew group must clear the installed tank at ${time}s`);
  }
});

test('tank is on the user’s right; the chassis drive stays on the inward side of the removable group', () => {
  sample(0);
  assert.ok(visibleBounds(scene.tank).min.x > 0, 'tank must be on the right when facing the machine');
  assertInside(scene.tank, 'water tank');
  assertInside(scene.heater, 'heater');
  assert.ok(!visibleBounds(scene.heater).intersectsBox(visibleBounds(scene.drive)),
    'heater clears the motor after its rearward relocation');
  assert.ok(scene.drive.position.x < scene.brewUnit.position.x, 'drive must be inboard of the right-hand service path');
  pointNear(scene.brewUnit.localToWorld(new THREE.Vector3(.4, .2, .3)), vector(brewPoint(.4, .2, .3)),
    EPSILON, 'installed group uses the same mirrored coordinates as its connections');
  const brewAxis = scene.brewAxle.getWorldPosition(new THREE.Vector3());
  const driveAxis = scene.drive.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(brewAxis.y - driveAxis.y) < EPSILON
    && Math.abs(brewAxis.z - driveAxis.z) < EPSILON, 'coupling axes remain aligned after mirroring');
});

test('service withdraws the tank forward before the group exits right, and neither sweep collides', () => {
  sample(0);
  const drivePosition = scene.drive.position.clone();
  for (let step = 0; step <= 100; step++) {
    const amount = step / 100;
    sample(0, amount);
    const pose = servicePose(amount);
    assert.ok(Math.abs(scene.brewUnit.position.x - pose.brewX) < EPSILON);
    assert.ok(Math.abs(scene.tank.position.z - pose.tankZ) < EPSILON);
    pointNear(scene.drive.position, drivePosition, EPSILON, 'motor remains in the chassis');
    const tank = visibleBounds(scene.tank), group = visibleBounds(scene.brewUnit);
    assert.ok(!tank.intersectsBox(group), 'tank and brew group clear each other throughout removal');
    if (amount <= .35) assert.equal(pose.brewX, LAYOUT.brew[0], 'group waits for the tank');
    else {
      assert.ok(tank.min.z > LAYOUT.frontInnerZ, 'tank clears the machine before sideways removal');
    }
  }
  assert.ok(visibleBounds(scene.brewUnit).min.x > LAYOUT.sideInnerX,
    'fully removed group is outside the right wall');
  for (let step = 100; step >= 0; step--) {
    sample(0, step / 100);
    if (step / 100 < .35) assert.equal(scene.brewUnit.position.x, LAYOUT.brew[0],
      'group is seated before the tank returns');
  }
});

test('ground coffee falls into the relocated loading cup', () => {
  sample(5);
  const cup = scene.chamber.getWorldPosition(new THREE.Vector3());
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (let i = 0; i < scene.groundFall.count; i++) {
    scene.groundFall.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix).applyMatrix4(scene.groundFall.matrixWorld);
    assert.ok(Math.hypot(point.x - cup.x, point.z - cup.z) < BREW_GEOMETRY.chamberRadius,
      `grain ${i} misses the relocated cup: ${point.toArray()}`);
    assert.ok(point.y > cup.y, 'grounds fall from above the chamber');
  }
});

test('the hot-water route crosses the closed puck and joins the relocated coffee outlet', () => {
  sample(getPhases().find(phase => phase.id === 'extract').start + 1);
  const inlet = scene.flowPaths.find(route => route.kind === 'infuse');
  const outlet = scene.flowPaths.find(route => route.kind === 'coffee');
  const puck = scene.dose.getWorldPosition(new THREE.Vector3());
  let nearest = Infinity;
  for (let i = 0; i <= 200; i++) {
    const point = inlet.parent.localToWorld(inlet.curve.getPoint(i / 200));
    nearest = Math.min(nearest, point.distanceTo(puck));
  }
  assert.ok(nearest < .06, `water misses the closed puck by ${nearest}`);
  pointNear(inlet.parent.localToWorld(inlet.curve.getPoint(1)),
    outlet.parent.localToWorld(outlet.curve.getPoint(0)), .01, 'brew outlet and coffee hose join');
});

test('the ejected puck lands continuously in the relocated waste drawer', () => {
  const eject = getPhases().find(phase => phase.id === 'eject');
  sample(eject.start + eject.duration * (.85 - 1e-7));
  assert.equal(scene.ejectedPuck.visible, true);
  const falling = scene.ejectedPuck.getWorldPosition(new THREE.Vector3());
  sample(eject.start + eject.duration * .85);
  assert.equal(scene.spentPuck.visible, true);
  const landed = scene.spentPuck.getWorldPosition(new THREE.Vector3());
  pointNear(falling, landed, .001, 'puck position does not jump when entering the drawer');
  const mechanics = getBrewMechanics(getState(eject.end));
  pointNear(landed, vector(brewPoint(...mechanics.puckPosition)), EPSILON,
    'waste drawer and mechanics agree on the landing point');
});
