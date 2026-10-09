import test from 'node:test';
import assert from 'node:assert/strict';
import { waterColor, waterRGB, dishColor, dishRGB } from './water-color.mjs';

const decodeHex = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
const linear = channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
const luminance = rgb => rgb.map(linear).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);

test('fresh water is blue, detergent violet, and pollution overwhelms both toward orange/brown', () => {
  for (const temperature of [20, 40, 65]) {
    const [br, bg, bb] = waterRGB(temperature, 0, 0);
    assert.ok(bb > bg && bg > br);
    const [vr, vg, vb] = waterRGB(temperature, 1, 0);
    assert.ok(vb > vr && vr > vg);
    const [dr, dg, db] = waterRGB(temperature, 1, 1);
    assert.ok(dr > dg && dg > db);
    assert.equal(waterColor(temperature, 0, 1), waterColor(temperature, 1, 1));
  }
});

test('all fixed water mixtures get continuously brighter from 20 through 65 degrees', () => {
  for (let detergent = 0; detergent <= 1.001; detergent += .1) {
    for (let soil = 0; soil <= 1.001; soil += .1) {
      let previousRGB = waterRGB(20, detergent, soil);
      let previousLuminance = luminance(decodeHex(waterColor(20, detergent, soil)));
      for (let temperature = 21; temperature <= 65; temperature++) {
        const color = waterRGB(temperature, detergent, soil);
        assert.ok(color.every((value, index) => value > previousRGB[index]));
        const brightness = luminance(decodeHex(waterColor(temperature, detergent, soil)));
        assert.ok(brightness > previousLuminance, `brightness reverses at ${temperature} / ${detergent} / ${soil}`);
        previousRGB = color;
        previousLuminance = brightness;
      }
      const midpoint = waterRGB(42.5, detergent, soil);
      const endpoints = [waterRGB(20, detergent, soil), waterRGB(65, detergent, soil)];
      midpoint.forEach((value, index) => assert.ok(Math.abs(value - (endpoints[0][index] + endpoints[1][index]) / 2) < 1e-12));
    }
  }
});

test('ceramics remain red and darken continuously when cooling across every variant', () => {
  for (const variant of [0, .5, 1]) {
    let previous = Infinity;
    for (let temperature = 65; temperature >= 20; temperature--) {
      const [r, g, b] = dishRGB(temperature, variant);
      assert.ok(r > g && r > b);
      const brightness = luminance(decodeHex(dishColor(temperature, variant)));
      assert.ok(brightness < previous);
      previous = brightness;
    }
  }
});

test('colour helpers are pure, usable hex strings and clamp malformed inputs', () => {
  for (const value of [waterColor(20), waterColor(65, 1, 1), dishColor(40)]) assert.match(value, /^#[0-9a-f]{6}$/);
  assert.equal(waterColor(-100, -1, -2), waterColor(20, 0, 0));
  assert.equal(waterColor(1000, 5, 4), waterColor(65, 1, 1));
  assert.equal(waterColor(NaN, NaN, NaN), waterColor(20, 0, 0));
  assert.equal(dishColor(-Infinity), dishColor(20));
  assert.equal(dishColor(Infinity, Infinity), dishColor(65, 1));
  const color = waterRGB(40, .5, .5);
  color[0] = -3;
  assert.ok(waterRGB(40, .5, .5)[0] > 0);
});
