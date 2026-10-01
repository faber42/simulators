import { DIGIT_ORDER, areaOrigin } from './topology.mjs';
import { pulsesFor } from './engine.mjs';

export function blockLayout(prefix) {
  areaOrigin(prefix); // Use the same validated coordinates as the 3D hall.
  return DIGIT_ORDER.map((digit, index) => ({ digit, prefix: prefix + digit,
    // Front of the hall is at the bottom of the plan, as in camera 3.
    column: index % 2, row: 4 - Math.floor(index / 2),
    banks: DIGIT_ORDER.map(bank => ({ digit: bank, prefix: prefix + digit + bank })),
  }));
}

export function guideSelection(engine) {
  const selector = engine.selectors[3];
  if (!selector?.held) return null;
  const prefix = selector.prefix, digits = engine.digits;
  return { prefix, column: prefix[0], row: prefix[1], third: digits[2] || null,
    fourth: digits[3] || null, fifth: digits[4] || null, sixth: digits[5] || null,
    previewThird: digits.length === 2 ? engine.currentDigit : null,
    previewFourth: digits.length === 3 ? engine.currentDigit : null,
    level: digits[4] ? pulsesFor(digits[4]) : null,
    contact: digits[5] ? pulsesFor(digits[5]) : null,
    releasing: engine.state === 'releasing' };
}
