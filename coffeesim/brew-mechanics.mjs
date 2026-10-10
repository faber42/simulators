/**
 * Seekable, deliberately simplified brew-group mechanics. Distances are scene
 * units, relative to brewUnit. This is an explanatory mechanism, not Philips CAD.
 * puckPosition denotes the puck CENTRE; pistonLift is relative to the chamber.
 */
const clamp = value => Math.max(0, Math.min(1, value));
const ramp = (value, start, end) => clamp((value - start) / (end - start));
const smooth = value => value * value * (3 - 2 * value);
const between = (value, start, end) => smooth(ramp(value, start, end));
const mix = (a, b, amount) => a + (b - a) * amount;

export const BREW_GEOMETRY = Object.freeze({
  fillY: .15, fillZ: .60, closedY: .792, closedZ: -.12,
  pistonTop: -.085, rimY: .3095, rimHalfDepth: .3975, upperSieveY: .812,
  looseDoseHeight: .25, compressedDoseHeight: .105,
  chamberRadius: .334, puckRadius: .278,
  liftHeight: .412, wiperY: .50, wiperParkZ: 1.05,
  wiperContactZ: .878, wiperEndZ: .18,
  binY: -.92, binZ: .12, puckSpacing: .111,
});

/** All output depends only on the supplied cycle sample: seeking is reversible. */
export function getBrewMechanics(state) {
  const g = BREW_GEOMETRY;
  const previousPucks = Math.max(0, Math.floor(Number(state.priorPucks) || 0));
  const landingY = g.binY + previousPucks * g.puckSpacing;
  const eject = clamp(state.ejectProgress);
  const compress = clamp(state.compression);
  const phase = state.phase.id;
  const afterBrewing = eject > 0 || phase === 'eject' || phase === 'return' || phase === 'complete';
  let chamberY = mix(g.fillY, g.closedY, between(compress, .4, 1));
  let chamberZ = mix(g.fillZ, g.closedZ, between(compress, 0, .4));
  let pistonLift = 0;
  let wiperTravel = 0;
  let stage = state.time > 0 ? 'fill' : 'idle';
  let label = state.time > 0 ? 'Kaffeemehl fällt in den Becher' : 'Offene Kammer · Grundstellung';

  if (compress > 0 && compress < .4) {
    stage = 'slide'; label = 'Außenantrieb schiebt die Kammer unter den Kolben';
  } else if (compress >= .4 && compress < 1) {
    stage = 'compress'; label = 'Kammer fährt hoch · Kolben verdichtet';
  } else if (compress === 1) {
    stage = 'closed'; label = 'Kammer dicht geschlossen';
  }

  if (afterBrewing) {
    // Open vertically before moving out from under the fixed upper piston.
    chamberY = mix(g.closedY, g.fillY, between(eject, 0, .18));
    chamberZ = mix(g.closedZ, g.fillZ, between(eject, .18, .30));
    pistonLift = g.liftHeight * between(eject, .30, .43)
      * (1 - between(eject, .85, .94));
    const approach = between(eject, .43, .47);
    const sweep = between(eject, .47, .64);
    const contactTravel = (g.wiperParkZ - g.wiperContactZ) / (g.wiperParkZ - g.wiperEndZ);
    wiperTravel = (contactTravel * approach + (1 - contactTravel) * sweep)
      * (1 - between(eject, .88, 1));
    if (eject < .18) {
      stage = 'open'; label = 'Außenantrieb senkt die Kammer ab';
    } else if (eject < .30) {
      stage = 'present'; label = 'Kammer fährt in die Auswurfstellung';
    } else if (eject < .43) {
      stage = 'lift-puck'; label = 'Unteres Sieb hebt den Puck über den Rand';
    } else if (eject < .47) {
      stage = 'approach'; label = 'Drahtbügel fährt an den Puck';
    } else if (eject < .66) {
      stage = 'sweep'; label = 'Drahtbügel streicht den Puck vom Sieb';
    } else if (eject < .85) {
      stage = 'fall'; label = 'Puck fällt in den Tresterbehälter';
    } else if (eject < 1 || phase === 'return') {
      stage = 'reset'; label = 'Antrieb, Sieb und Drahtbügel fahren zurück';
    } else {
      stage = 'ready'; label = 'Leere Kammer · bereit für den nächsten Kaffee';
    }
  }

  const hasDose = state.groundAmount > 0 || state.wastePuck;
  // The fixed upper sieve compresses the dry bed only on actual contact. Once
  // brewed, the coherent puck keeps its height while the chamber opens.
  const doseHeight = !hasDose ? 0 : afterBrewing || state.puckWetness > 0
    ? g.compressedDoseHeight
    : Math.min(g.looseDoseHeight * state.groundAmount, g.upperSieveY - chamberY - g.pistonTop);
  const wiperZ = mix(g.wiperParkZ, g.wiperEndZ, wiperTravel);
  const raisedPuckY = g.fillY + g.pistonTop + g.liftHeight + g.compressedDoseHeight / 2;
  const sweepEndZ = g.wiperEndZ - g.puckRadius;
  let puckPosition = [0, chamberY + g.pistonTop + pistonLift + doseHeight / 2, chamberZ];
  let puckLocation = hasDose ? 'chamber' : 'none';

  if (afterBrewing && hasDose) {
    if (eject >= .85) {
      puckLocation = 'bin';
      puckPosition = [0, landingY, g.binZ];
    } else if (eject >= .66) {
      const fall = ramp(eject, .66, .85);
      puckLocation = 'falling';
      // Clear the entire chamber before drifting towards the drawer. The drop
      // shortens as the stack grows, so clearance must follow height, not time.
      const clearY = g.fillY + .085 - .38 / 2 - g.compressedDoseHeight / 2 - .025;
      const driftStart = Math.sqrt(clamp((raisedPuckY - clearY) / (raisedPuckY - landingY)));
      puckPosition = [0, mix(raisedPuckY, landingY, fall * fall), mix(sweepEndZ, g.binZ, between(fall, driftStart, 1))];
    } else if (eject >= .47) {
      puckLocation = 'sweeping';
      puckPosition = [0, raisedPuckY, wiperZ - g.puckRadius];
    }
  }

  return {
    chamberY, chamberZ, pistonLift, doseHeight, puckLocation, puckPosition,
    wiperTravel, wiperZ,
    // The cycle supplies one continuous turn through compression/ejection/return.
    // Its dwell periods correspond to a cam mechanism, not independent motors.
    driveAngle: state.driveAngle,
    driveTurning: ['compress', 'eject', 'return'].includes(phase)
      && state.phaseProgress > 0 && state.phaseProgress < 1,
    stage, label,
  };
}
