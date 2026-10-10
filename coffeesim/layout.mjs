// Coordinates are viewed from the dispensing face: +x is the user's right.
// Mechanical motion stays in brew-local coordinates; only its installation is mirrored.
export const LAYOUT = Object.freeze({
  brew: Object.freeze([.10, 1.39, -.64]),
  drive: Object.freeze([-.63, 1.31, -.54]),
  grinder: Object.freeze([.10, 3.33, -.47]),
  heater: Object.freeze([-.78, 2.50, -1.31]),
  valve: Object.freeze([-.67, 3.16, -1.11]),
  tankX: .98,
  frontInnerZ: .785,
  rearInnerZ: -1.595,
  sideInnerX: 1.2075,
  brewTravel: 2.90,
  tankTravel: 2.60,
});

export function brewPoint(x, y, z) {
  return [LAYOUT.brew[0] - x, LAYOUT.brew[1] + y, LAYOUT.brew[2] + z];
}

export function servicePose(amount) {
  const t = Math.max(0, Math.min(1, amount));
  // Withdraw the right-hand tank forward before the group moves out to the right.
  // Reversing the same path seats the brew group before replacing the tank.
  return {
    tankZ: LAYOUT.tankTravel * Math.min(1, t / .35),
    brewX: LAYOUT.brew[0] + LAYOUT.brewTravel * Math.max(0, (t - .35) / .65),
  };
}
