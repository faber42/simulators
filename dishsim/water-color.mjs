/**
 * Explanatory colours, deliberately stronger than real water/ceramic colours.
 * Chemistry selects blue (fresh), violet (detergent), or orange/brown (dirty).
 * Temperature changes brightness independently: at a fixed mixture EVERY sRGB
 * channel increases with temperature, so perceived luminance cannot reverse.
 */
const clamp = value => Math.min(1, Math.max(0, value));
const number = (value, fallback = 0) => Number.isNaN(Number(value)) ? fallback : Number(value);
const fraction = value => clamp(number(value));
const heat = temperature => clamp((number(temperature, 20) - 20) / 45);
const mix = (a, b, amount) => a.map((channel, index) => channel + (b[index] - channel) * amount);
const rgb = values => values.map(value => value / 255);
const hex = values => `#${values.map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;

const WATER = {
  fresh: { cold: rgb([10, 46, 105]), hot: rgb([132, 210, 255]) },
  detergent: { cold: rgb([58, 18, 105]), hot: rgb([208, 160, 248]) },
  dirty: { cold: rgb([85, 37, 9]), hot: rgb([237, 167, 81]) },
};

/** Normalized sRGB channels [r,g,b], suitable for explicit sRGB colour inputs. */
export function waterRGB(temperature = 20, detergent = 0, waterSoil = 0) {
  const chemistry = fraction(detergent);
  const pollution = fraction(waterSoil) ** .72;
  const cold = mix(mix(WATER.fresh.cold, WATER.detergent.cold, chemistry), WATER.dirty.cold, pollution);
  const hot = mix(mix(WATER.fresh.hot, WATER.detergent.hot, chemistry), WATER.dirty.hot, pollution);
  return mix(cold, hot, heat(temperature));
}

/** CSS sRGB hex; use material.color.set(waterColor(...)) in Three.js. */
export function waterColor(temperature = 20, detergent = 0, waterSoil = 0) {
  return hex(waterRGB(temperature, detergent, waterSoil));
}

/** Red ceramic: dark when cold, light when hot; variant 0..1 adds variation. */
export function dishRGB(temperature = 20, variant = 0) {
  const amount = fraction(variant);
  const cold = mix(rgb([99, 22, 30]), rgb([116, 33, 37]), amount);
  const hot = mix(rgb([244, 135, 125]), rgb([255, 159, 145]), amount);
  return mix(cold, hot, heat(temperature));
}

export function dishColor(temperature = 20, variant = 0) {
  return hex(dishRGB(temperature, variant));
}
