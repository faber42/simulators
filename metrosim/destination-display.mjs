import { entrySignal } from './route.mjs';
import { occupiedService, CAR_COUNT, TRAIN_LENGTH } from './traffic.mjs';
import { OWN_SERVICE, OTHER_SERVICES, precedingService } from './services.mjs';

export const BOARD_ANCHORS = [12, 72];
export const boardPosition = (station, number) => station.start + BOARD_ANCHORS[number] - 1.2;
export const arrivalDisplay = service => ({ mode: 'arrival', service, cars: CAR_COUNT, length: TRAIN_LENGTH });
export function departuresDisplay(station) {
  return { mode: 'departures', rows: [
    { ...OWN_SERVICE, minutes: 1 },
    { ...OTHER_SERVICES[station.index % 2], minutes: 3 },
    { ...OTHER_SERVICES[(station.index + 1) % 2], minutes: 6 },
  ] };
}

export function displayTransition(station, train) {
  const start = entrySignal(station.index).s + 4;
  const finish = boardPosition(station, 1) - 5;
  const progress = Math.max(0, Math.min(1, (train.s - start) / (finish - start)));
  // An occupied platform retains its previous service even after that train
  // has left. Our arrival replaces it directly, without an intermediate list.
  const from = occupiedService(station.index) ? arrivalDisplay(precedingService(station.index)) : departuresDisplay(station);
  const to = arrivalDisplay(OWN_SERVICE);
  return { from, to, progress, start, finish };
}
