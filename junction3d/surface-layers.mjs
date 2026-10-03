/**
 * Metres above the shared road datum. Real height gaps resolve overlapping
 * surfaces; a small, constant depth-buffer reserve protects distant views.
 * Only horizontal surface materials use these offsets, never whole objects.
 */
export const SURFACE_HEIGHTS = Object.freeze({
  terrain: -.10,
  roadUnderlay: -.015,
  road: .035,
  roadMarking: .065,
  grass: .04,
  paving: .14,
  parking: .15,
  parkingPaint: .18,
  bedTurf: .18,
  bedSoil: .215,
  curb: .24,
  turfGap: .035,
});

const SURFACE_DEPTH_UNITS = Object.freeze({
  terrain: 64, roadUnderlay: 32, grass: 16, paving: 8,
  parking: 4, road: 0, marking: -4, turf: -4,
});

export function surfaceMaterialOptions(layer) {
  if (!(layer in SURFACE_DEPTH_UNITS)) throw new RangeError(`Unknown surface layer: ${layer}`);
  return { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: SURFACE_DEPTH_UNITS[layer] };
}

export const CAMERA_FAR = 1100;

// Fixed near=.3 wastes most depth precision in an elevated overview. Keep
// street-level views usable, increasing precision as the camera rises.
export function cameraNearForHeight(height) {
  return Math.max(.3, Math.min(8, (Number.isFinite(height) ? height : 0) * .02));
}
