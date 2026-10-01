import test from 'node:test';
import assert from 'node:assert/strict';
import { Exchange } from './engine.mjs';
import { DIGIT_ORDER, aisleOrigin, selectorSite } from './topology.mjs';
import { blockLayout, guideSelection } from './hall-guide.mjs';

function until(engine, predicate) {
  for (let i = 0; i < 9000 && !predicate(); i++) engine.step(.01);
  assert.ok(predicate(), engine.message);
}

test('expanded plan follows the permanent aisle layout and covers all hundred-groups once', () => {
  for (const prefix of ['11', '49', '90']) {
    const branches = blockLayout(prefix), positions = branches.map(b => aisleOrigin(b.prefix));
    const xs = [...new Set(positions.map(p => p[0]))].sort((a, b) => a - b);
    const zs = [...new Set(positions.map(p => p[2]))].sort((a, b) => b - a);
    assert.deepEqual(branches.map(b => b.digit), DIGIT_ORDER);
    assert.equal(new Set(branches.flatMap(b => b.banks.map(bank => bank.prefix))).size, 100);
    for (const branch of branches) {
      const point = aisleOrigin(branch.prefix);
      assert.equal(point[0], xs[branch.column]); assert.equal(point[2], zs[4 - branch.row]);
      assert.deepEqual(branch.banks.map(b => b.digit), DIGIT_ORDER);
      for (const bank of branch.banks) assert.equal(selectorSite(5, bank.prefix).area, prefix);
    }
  }
  assert.throws(() => blockLayout('00'));
});

test('guide opens upon reaching III GW, not from queued future digits', () => {
  const e = new Exchange(); e.dialNumber('493567');
  assert.equal(guideSelection(e), null);
  until(e, () => e.selectors[3]?.held);
  let selection = guideSelection(e);
  assert.equal(selection.prefix, '49'); assert.equal(selection.column, '4'); assert.equal(selection.row, '9');
  assert.equal(selection.third, null); assert.equal(selection.fourth, null);
  assert.equal(selection.previewThird, null);
  until(e, () => e.currentDigit === '3');
  selection = guideSelection(e);
  assert.equal(selection.previewThird, '3'); assert.equal(selection.third, null);
  until(e, () => e.currentDigit === '5');
  selection = guideSelection(e);
  assert.equal(selection.third, '3'); assert.equal(selection.previewFourth, '5'); assert.equal(selection.fourth, null);
  until(e, () => e.digits.length === 4);
  selection = guideSelection(e);
  assert.equal(selection.fourth, '5'); assert.equal(selection.fifth, null); assert.equal(selection.sixth, null);
  e.step(60); selection = guideSelection(e);
  assert.equal(selection.level, 6); assert.equal(selection.contact, 7);
});

test('zero remains the tenth selection within a block but leading zero opens no local guide', () => {
  const e = new Exchange(); e.dialNumber('900000'); e.step(60);
  const selection = guideSelection(e);
  assert.equal(selection.row, '0'); assert.equal(selection.third, '0'); assert.equal(selection.fourth, '0');
  assert.equal(selection.level, 10); assert.equal(selection.contact, 10);
  e.hangup(); e.step(60); e.dialNumber('0'); e.step(60);
  assert.equal(e.state, 'external'); assert.equal(guideSelection(e), null);
});

test('guide survives parallel release until the entire block is freed and resets between calls', () => {
  const e = new Exchange(); e.dialNumber('493567'); e.step(60); e.hangup();
  assert.equal(guideSelection(e).prefix, '49'); assert.equal(guideSelection(e).releasing, true);
  until(e, () => e.selectors[3]?.phase === 'fällt ab');
  assert.equal(guideSelection(e).prefix, '49');
  until(e, () => e.selectors.every(s => !s));
  assert.equal(guideSelection(e), null);
  e.step(60); e.dialNumber('119200'); until(e, () => e.selectors[3]?.held);
  assert.equal(guideSelection(e).prefix, '11'); assert.equal(guideSelection(e).third, null);
});
