import { entrySignal } from './route.mjs';
import { occupiedService, CAR_COUNT, TRAIN_LENGTH } from './traffic.mjs';
import { OWN_SERVICE, OTHER_SERVICES, precedingService } from './services.mjs';

export const BOARD_ANCHORS = [12, 72];
export const FLAP_TURNS = 8;
export const boardPosition = (station, number) => station.start + BOARD_ANCHORS[number] - 1.2;
export const arrivalDisplay = service => ({ mode: 'arrival', service, cars: CAR_COUNT, length: TRAIN_LENGTH });
export function departuresDisplay(station) {
  return { mode: 'departures', rows: [
    { ...OWN_SERVICE, minutes: 1 },
    { ...OTHER_SERVICES[station.index % 2], minutes: 3 },
  ] };
}

export function displayTransition(station, train) {
  const start = entrySignal(station.index).s + 1;
  const finish = boardPosition(station, 1) - 5;
  const distance = Math.max(0, Math.min(1, (train.s - start) / (finish - start)));
  // The whole board starts moving at once. Spread the drum's full turns over
  // the existing arrival interval, without the former left-to-right sweep.
  const progress = distance;
  // An occupied platform retains its previous service even after that train
  // has left. Our arrival replaces it directly, without an intermediate list.
  const from = occupiedService(station.index) ? arrivalDisplay(precedingService(station.index)) : departuresDisplay(station);
  const to = arrivalDisplay(OWN_SERVICE);
  return { from, to, progress, start, finish };
}

export function flapMotion(progress) {
  if (progress <= 0 || progress >= 1) return { turn: progress >= 1 ? FLAP_TURNS : 0, angle: 0 };
  const cycle = progress * FLAP_TURNS, turn = Math.floor(cycle), phase = cycle - turn;
  const fall = Math.max(0, Math.min(1, (phase - .06) / .76));
  const settle = Math.max(0, (phase - .82) / .18);
  // A brief release, gravity-like acceleration and a small rebound on landing.
  const angle = Math.PI * fall ** 1.65 - .075 * Math.sin(settle * Math.PI) * Math.exp(-3 * settle);
  return { turn, angle };
}

export function flapPage(state, index) {
  if (index <= 0) return state.from;
  if (index >= FLAP_TURNS) return state.to;
  // Printed drum leaves pass through other destinations on the way to ours.
  // A predecessor's full view never falls back to a departures list.
  const first = state.from.service === OTHER_SERVICES[0] ? 1 : 0;
  return arrivalDisplay(OTHER_SERVICES[(first + index - 1) % OTHER_SERVICES.length]);
}
