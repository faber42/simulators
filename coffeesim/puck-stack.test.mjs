import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { CoffeeScene } from './scene.js';
import { getPhases, getState } from './cycle.mjs';
import { BREW_GEOMETRY as G, getBrewMechanics } from './brew-mechanics.mjs';
import { brewPoint } from './layout.mjs';

function makeScene() {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
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
    return scene;
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

const scene = makeScene();
const eject = getPhases().find(phase => phase.id === 'eject');
const at = (progress, extra = {}) => ({ ...getState(eject.start + eject.duration * progress), ...extra });
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const update = state => { scene.update(state, 0); scene.machine.updateMatrixWorld(true); };
const centre = mesh => mesh.getWorldPosition(new THREE.Vector3());
const bounds = mesh => new THREE.Box3().setFromObject(mesh);
const visiblePucks = () => scene.storedPuckMeshes.filter(puck => puck.visible);

test('all five stored pucks fit inside the production drawer with separate flat layers', () => {
  update(at(1, { priorPucks: 4, storedPucks: 5, currentPuckDeposited: true }));
  const pucks = visiblePucks();
  assert.equal(pucks.length, 5);
  const floor = bounds(scene.waste.children[0]);
  const walls = scene.waste.children.slice(1, 5).map(bounds);
  const left = walls.find(wall => wall.min.x < 0 && wall.max.x < 0);
  const right = walls.find(wall => wall.min.x > 0);
  const back = walls.find(wall => wall.max.z < -.8);
  const front = walls.find(wall => wall.min.z > -.2);
  for (let i = 0; i < pucks.length; i++) {
    const box = bounds(pucks[i]);
    near(centre(pucks[i]).y, .47 + i * G.puckSpacing);
    assert.ok(box.min.y > floor.max.y, 'bottom puck stays above drawer floor');
    assert.ok(box.max.y < walls[0].max.y, 'top puck stays below the rim');
    assert.ok(box.min.x > left.max.x && box.max.x < right.min.x, 'puck fits between side walls');
    assert.ok(box.min.z > back.max.z && box.max.z < front.min.z, 'puck fits between front and back walls');
    if (i) assert.ok(box.min.y > bounds(pucks[i - 1]).max.y, 'stack layers do not intersect');
    near(pucks[i].rotation.x, 0);
    near(pucks[i].rotation.z, 0);
  }
});

test('each new puck lands continuously and flat on top of the prior stack', () => {
  for (let priorPucks = 0; priorPucks < 5; priorPucks++) {
    update(at(.85 - 1e-8, { priorPucks, storedPucks: priorPucks, currentPuckDeposited: false }));
    assert.equal(scene.ejectedPuck.visible, true);
    assert.equal(visiblePucks().length, priorPucks);
    const falling = centre(scene.ejectedPuck);
    near(scene.ejectedPuck.rotation.x, 0);
    near(scene.ejectedPuck.rotation.z, 0);
    update(at(.85, { priorPucks, storedPucks: priorPucks + 1, currentPuckDeposited: true }));
    assert.equal(scene.ejectedPuck.visible, false);
    assert.equal(visiblePucks().length, priorPucks + 1);
    const landed = centre(scene.storedPuckMeshes[priorPucks]);
    assert.ok(falling.distanceTo(landed) < 1e-5, 'handoff from moving to stored mesh does not jump');
    const target = new THREE.Vector3(...brewPoint(0, G.binY + priorPucks * G.puckSpacing, G.binZ));
    assert.ok(target.distanceTo(landed) < 1e-5, 'drawer and mechanical target agree');
  }
});

test('all five falling trajectories clear the chamber before drifting into the drawer', () => {
  for (let priorPucks = 0; priorPucks < 5; priorPucks++) {
    for (let step = 0; step <= 200; step++) {
      const m = getBrewMechanics(at(.66 + .19 * step / 200, { priorPucks }));
      const top = m.puckPosition[1] + G.compressedDoseHeight / 2;
      const front = m.puckPosition[2] + G.puckRadius;
      if (top >= G.fillY + G.rimY - .025) assert.ok(front < G.fillZ - G.rimHalfDepth);
      if (top >= G.fillY + .085 - .38 / 2) assert.ok(front < G.fillZ - G.chamberRadius);
      assert.ok(m.puckPosition.every(Number.isFinite));
    }
  }
});

test('rewind preserves deposited pucks and suppresses their moving duplicate until a new run', () => {
  update(at(1, { priorPucks: 1, storedPucks: 2, currentPuckDeposited: true }));
  const positions = visiblePucks().map(puck => centre(puck).toArray());
  const colors = visiblePucks().map(puck => puck.material.color.getHex());
  for (const time of [0, 4, eject.start + eject.duration * .75]) {
    update({ ...getState(time), priorPucks: 1, storedPucks: 2, currentPuckDeposited: true });
    assert.deepEqual(visiblePucks().map(puck => centre(puck).toArray()), positions);
    assert.deepEqual(visiblePucks().map(puck => puck.material.color.getHex()), colors);
    assert.equal(scene.ejectedPuck.visible, false);
    assert.equal(scene.dose.visible, false);
    assert.equal(scene.grainTop.visible, false);
    assert.equal(scene.groundFall.visible, false);
    assert.equal(scene.fallingBeans.visible, false);
  }
  update({ ...getState(4), priorPucks: 2, storedPucks: 2, currentPuckDeposited: false });
  assert.equal(visiblePucks().length, 2);
  assert.equal(scene.dose.visible, true);
  assert.equal(scene.groundFall.visible, true);
});

test('reset empties the stored stack and restores water; an empty tank has no water mesh', () => {
  update(at(1, { priorPucks: 4, storedPucks: 5, currentPuckDeposited: true, tankLevel: 0 }));
  assert.equal(scene.tankWater.visible, false);
  assert.equal(scene.tankWater.scale.y, 0);
  for (const level of [.25, .50, 1]) {
    update({ ...getState(0), priorPucks: 0, storedPucks: 0, currentPuckDeposited: false, tankLevel: level });
    assert.equal(visiblePucks().length, 0);
    assert.equal(scene.tankWater.visible, true);
    const water = bounds(scene.tankWater);
    near(water.min.y, .85);
    near(water.max.y, .85 + 2.31 * level);
  }
});
