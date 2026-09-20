import { DOOR_OFFSETS, EXCHANGE_DOORS, ease } from './traffic.mjs';

export function exchangePose(station, slot, outgoing, age, previousService = false) {
  const door = EXCHANGE_DOORS[slot], s = station.stop - DOOR_OFFSETS[door];
  // Alighting first, boarding second, in separate longitudinal lanes. Both
  // finish before closing begins; passengers never cross a closed door.
  const delay = outgoing ? slot * .18 : 3.7 + slot * .16;
  const duration = outgoing ? 2.8 : 2.65;
  const progress = ease((age - delay) / duration);
  const lateral = outgoing ? .82 + 2.36 * progress : 2.88 - 2.12 * progress;
  // People from the earlier train step clear of the next service's doorway
  // and remain on the platform rather than disappearing when its tail clears.
  const stepAside = outgoing && previousService ? ease((age - 3.8 - slot * .18) / 3.2) : 0;
  return { s: s + (outgoing ? .28 : -.28) + 1.5 * stepAside, x: station.side * lateral,
    visible: outgoing ? age >= delay : progress < 1,
    walking: age > delay && age < delay + duration || stepAside > 0 && stepAside < 1,
    alongPlatform: stepAside > 0, strideProgress: stepAside > 0 && stepAside < 1 ? stepAside : progress,
    distance: (outgoing ? 2.36 : 2.12) * progress + 1.5 * stepAside,
    direction: outgoing ? station.side : -station.side,
    progress, door, outgoing };
}
