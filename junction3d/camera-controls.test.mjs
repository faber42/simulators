import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { FreeCameraControls } from './camera-controls.mjs';

const vector = values => new THREE.Vector3(...values);
const EPSILON = 1e-10;
const direction = controls => controls.target.clone().sub(controls.position).normalize();
const radial = controls => controls.position.clone().sub(controls.pivot);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const azimuth = value => Math.atan2(value.x, value.z);
const polar = value => Math.acos(THREE.MathUtils.clamp(value.y / value.length(), -1, 1));

function nearVector(actual, expected, message, tolerance = EPSILON) {
  assert.ok(actual.distanceTo(expected) <= tolerance,
    `${message}: ${actual.toArray()} differs from ${expected.toArray()}`);
}

function controlsAt(position = [100, 100, 100], target = [8, 2, -6]) {
  const controls = new FreeCameraControls();
  controls.reset(vector(position), vector(target));
  return controls;
}

function cameraDirection(controls) {
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, .3, 1100);
  camera.position.copy(controls.position); camera.lookAt(controls.target); camera.updateMatrixWorld(true);
  assert.ok([...camera.quaternion.toArray(), ...camera.matrixWorld.elements].every(Number.isFinite));
  return camera.getWorldDirection(new THREE.Vector3());
}

function gazeOffset(controls) {
  const towardPivot = radial(controls).negate(), gaze = direction(controls);
  // The UI intentionally preserves separate yaw/pitch offsets without adding
  // camera roll, rather than preserving a geodesic angle on the view sphere.
  return [wrap(azimuth(gaze) - azimuth(towardPivot)), polar(gaze) - polar(towardPivot)];
}

test('reset adopts the preset pose and pivot exactly without retaining caller-owned vectors', () => {
  const controls = new FreeCameraControls();
  const position = vector([135, 82, -107]), target = vector([12, 3, -7]);
  controls.reset(position, target);
  assert.deepEqual(controls.position.toArray(), position.toArray());
  assert.deepEqual(controls.target.toArray(), target.toArray());
  assert.deepEqual(controls.pivot.toArray(), target.toArray());
  assert.ok(Math.abs(controls.distance - position.distanceTo(target)) < EPSILON);
  position.set(0, 0, 0); target.set(1, 1, 1);
  assert.deepEqual(controls.position.toArray(), [135, 82, -107]);
  assert.deepEqual(controls.target.toArray(), [12, 3, -7]);
  assert.deepEqual(controls.pivot.toArray(), [12, 3, -7]);
});

for (const position of [[100, 100, 100], [0, 2, 100], [0, 150, 0]]) {
  test(`look only changes gaze at ${position}, including poses outside the orbit limits`, () => {
    const controls = controlsAt(position, [0, 0, 0]);
    const originalPosition = controls.position.toArray(), originalPivot = controls.pivot.toArray();
    const before = direction(controls);
    for (const [dx, dy] of [[50, 20], [-12, 35], [40, -25]]) {
      controls.look(dx, dy);
      assert.deepEqual(controls.position.toArray(), originalPosition, 'Looking must never translate the camera');
      assert.deepEqual(controls.pivot.toArray(), originalPivot, 'Looking must never move the subsequent orbit center');
      nearVector(cameraDirection(controls), direction(controls), 'Three renders the requested gaze');
    }
    assert.ok(direction(controls).angleTo(before) > .01, 'The gesture must actually change the view');
  });
}

test('centered orbit preserves its radius and pivot while continuing to look at the center', () => {
  const controls = controlsAt(), radius = radial(controls).length(), pivot = controls.pivot.clone();
  const before = controls.position.clone();
  for (const [dx, dy] of [[35, 20], [-80, -17], [500, 35], [-12, -20]]) {
    controls.orbit(dx, dy);
    assert.deepEqual(controls.pivot.toArray(), pivot.toArray());
    assert.ok(Math.abs(radial(controls).length() - radius) < EPSILON);
    nearVector(controls.target, pivot, 'A centered camera keeps its target at the orbit pivot');
    nearVector(cameraDirection(controls), pivot.clone().sub(controls.position).normalize(), 'The rendered view stays centered');
  }
  assert.ok(controls.position.distanceTo(before) > 1);
});

test('orbit after looking away retains the separate yaw and pitch deviations, including an azimuth wrap', () => {
  const controls = controlsAt([40, 120, -110], [4, 1, 3]);
  controls.look(70, 18);
  const offset = gazeOffset(controls), pivot = controls.pivot.clone(), radius = radial(controls).length();
  for (const [dx, dy] of [[120, 18], [-720, -24], [460, 14]]) {
    controls.orbit(dx, dy);
    const current = gazeOffset(controls);
    assert.ok(Math.abs(wrap(current[0] - offset[0])) < EPSILON, 'Orbit must not erase the horizontal look deviation');
    assert.ok(Math.abs(current[1] - offset[1]) < EPSILON, 'Orbit must not erase the vertical look deviation');
    nearVector(controls.pivot, pivot, 'Orbit pivot remains fixed');
    assert.ok(Math.abs(radial(controls).length() - radius) < EPSILON);
  }
});

test('capture adopts the visible intermediate pose without moving the pivot or snapping when Shift-look begins', () => {
  const controls = controlsAt([160, 120, 180], [7, 2, -8]);
  const pivot = controls.pivot.clone();
  controls.look(80, 30); controls.orbit(35, 15);
  const visiblePosition = vector([80, 42, 105]).lerp(controls.position, .37);
  const visibleTarget = vector([-25, 1, -10]).lerp(controls.target, .37);
  const actualGaze = visibleTarget.clone().sub(visiblePosition).normalize();
  controls.capture(visiblePosition, visibleTarget);
  assert.deepEqual(controls.position.toArray(), visiblePosition.toArray());
  assert.deepEqual(controls.target.toArray(), visibleTarget.toArray());
  assert.deepEqual(controls.pivot.toArray(), pivot.toArray());
  assert.ok(Math.abs(controls.distance - visiblePosition.distanceTo(pivot)) < EPSILON);
  nearVector(cameraDirection(controls), actualGaze, 'Capture preserves the image currently on screen');
  controls.look(0, 0);
  assert.deepEqual(controls.position.toArray(), visiblePosition.toArray());
  nearVector(cameraDirection(controls), actualGaze, 'Switching gesture mode without movement introduces no angular snap');
  controls.look(.01, -.01);
  assert.deepEqual(controls.position.toArray(), visiblePosition.toArray());
  assert.ok(cameraDirection(controls).angleTo(actualGaze) < .001, 'The first small Shift gesture continues from the visible gaze');
});

test('switching back from look to orbit during easing continues from the visible pose and original center', () => {
  const controls = controlsAt([100, 95, 140], [5, 0, -3]);
  const pivot = controls.pivot.clone();
  controls.look(70, -18);
  const visiblePosition = vector([120, 80, 110]);
  const visibleTarget = vector([-20, 3, 10]).lerp(controls.target, .43);
  const gaze = visibleTarget.clone().sub(visiblePosition).normalize();
  controls.capture(visiblePosition, visibleTarget);
  controls.orbit(0, 0);
  nearVector(controls.position, visiblePosition, 'Zero-delta orbit preserves an admissible captured position');
  nearVector(cameraDirection(controls), gaze, 'Zero-delta orbit preserves the captured gaze');
  const offset = gazeOffset(controls), radius = controls.position.distanceTo(pivot);
  controls.orbit(.01, .01);
  assert.ok(controls.position.distanceTo(visiblePosition) < .03, 'A small orbit does not resume an obsolete easing destination');
  assert.ok(Math.abs(radial(controls).length() - radius) < EPSILON);
  nearVector(controls.pivot, pivot, 'Switching input mode keeps the original orbit center');
  const after = gazeOffset(controls);
  assert.ok(Math.abs(wrap(after[0] - offset[0])) < EPSILON && Math.abs(after[1] - offset[1]) < EPSILON);
});

test('zoom changes only orbit distance while preserving gaze, radial bearing and center', () => {
  const controls = controlsAt(); controls.look(95, 20);
  const gaze = cameraDirection(controls), bearing = radial(controls).normalize(), pivot = controls.pivot.clone();
  for (const delta of [150, -200, 1e8, -1e8]) {
    controls.zoom(delta);
    nearVector(cameraDirection(controls), gaze, 'Zoom preserves the current look direction');
    nearVector(radial(controls).normalize(), bearing, 'Zoom travels along the orbit radius');
    nearVector(controls.pivot, pivot, 'Zoom keeps its center fixed');
    assert.ok(controls.distance >= 25 && controls.distance <= 520);
    assert.ok(Math.abs(radial(controls).length() - controls.distance) < EPSILON);
  }
  assert.equal(controls.distance, 25);
  controls.zoom(1e8); assert.equal(controls.distance, 520);
  controls.zoom(-1e8, 30); assert.equal(controls.distance, 30);
});

test('reset after look, orbit and zoom restores the preset instead of retaining a previous gaze offset', () => {
  const controls = controlsAt();
  controls.look(170, 50); controls.orbit(-70, 40); controls.zoom(-550);
  const position = vector([-92, 71, 155]), target = vector([15, 3, 9]);
  controls.reset(position, target);
  assert.deepEqual(controls.position.toArray(), position.toArray());
  assert.deepEqual(controls.target.toArray(), target.toArray());
  assert.deepEqual(controls.pivot.toArray(), target.toArray());
  controls.orbit(20, 10);
  nearVector(controls.target, target, 'The next orbit starts centered on the newly selected preset');
});

test('pole and extreme finite gestures keep a finite upright view and cannot flip the orbit below its pivot', () => {
  for (const position of [[0, 100, 0], [0, -100, 0], [0, 0, 0]]) {
    const controls = controlsAt(position, [0, 0, 0]);
    for (const sign of [1, -1, 1, -1]) {
      const fixed = controls.position.toArray(), pivot = controls.pivot.toArray();
      controls.look(sign * 1e9, sign * 1e9);
      assert.deepEqual(controls.position.toArray(), fixed); assert.deepEqual(controls.pivot.toArray(), pivot);
      assert.ok(Math.abs(direction(controls).y) < 1, 'Look pitch remains short of a singular pole');
      controls.orbit(sign * 1e9, sign * 1e9);
      controls.zoom(sign * 1e9);
      const offset = radial(controls);
      assert.ok(offset.y > 0, 'Orbital pitch cannot cross below the pivot');
      assert.ok(Math.hypot(offset.x, offset.z) > 0, 'Orbital pitch remains short of the vertical singularity');
      assert.ok([...controls.position.toArray(), ...controls.target.toArray(), ...controls.pivot.toArray()].every(Number.isFinite));
      assert.ok(cameraDirection(controls).length() > .999999);
    }
  }
});
