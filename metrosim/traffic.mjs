// Shared dimensions keep block occupancy, doors and visible vehicles in agreement.
export const CAR_LENGTH = 17.6;
export const CAR_PITCH = 18;
export const CAR_COUNT = 5;
export const TRAIN_LENGTH = CAR_LENGTH + CAR_PITCH * (CAR_COUNT - 1);
export const DOOR_OFFSETS = Array.from({ length: CAR_COUNT }, (_, car) =>
  [3.4, 8.8, 14.2].map(offset => car * CAR_PITCH + offset)).flat();
export const EXCHANGE_DOORS = [0, 4, 9, 14];
export const occupiedService = index => index % 7 === 2 || index % 7 === 5;
const clamp = value => Math.max(0, Math.min(1, value));
export const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export function doorOpening(phase, timer) {
  return phase === 'opening' ? ease(timer / 2) : phase === 'open' ? 1 : phase === 'closing' ? 1 - ease(timer / 2.8) : 0;
}
export function exchangeAge(phase, timer) {
  return phase === 'open' ? timer : phase === 'closing' ? 8 + timer : ['dispatch', 'depart', 'running'].includes(phase) ? 12 : -1;
}

export function ownExchangeAge(train, station) {
  // Position alone cannot distinguish the last centimetre of braking from a
  // completed stop: "running" would briefly put alighters on the platform and
  // hide boarders, before "settling" reset the exchange. Use the actual visit.
  if (train.visits <= station.index) return -1;
  // Once dispatched, preserve the completed exchange even at a red exit.
  if (train.next > station.index) return 12;
  return exchangeAge(train.phase, train.timer);
}

// Deterministic predecessor services. Only approaching stations are retained.
// Their real rear axle/body position, never a release timer, clears the entry.
export class Traffic {
  constructor() { this.services = new Map(); }
  update(train, arrivalSeconds) {
    for (const [index, service] of this.services)
      if (service.station.end < train.s - 140) this.services.delete(index);
    const st = train.stop;
    if (!occupiedService(st.index) || this.services.has(st.index) || train.s > st.start - 8 || train.s < st.start - 240) return;
    const waiting = st.index % 7 === 5;
    this.services.set(st.index, { station: st, waiting, createdAt: train.time,
      departAt: train.time + arrivalSeconds(train.speed, st.start - 12.5 - train.s) + (waiting ? 4 : 8) });
  }
  pose(index, time) {
    const service = this.services.get(index); if (!service) return null;
    const { station: st, departAt, waiting } = service;
    const elapsed = Math.max(0, time - departAt), acceleration = .78, limit = 14, ramp = limit / acceleration;
    const advance = elapsed < ramp ? .5 * acceleration * elapsed ** 2 : .5 * acceleration * ramp ** 2 + limit * (elapsed - ramp);
    const s = (waiting ? st.end - 3.5 : st.stop) + advance;
    const closeAt = departAt - 4.2;
    const phase = time >= departAt ? 'running' : waiting ? 'waiting' : time >= departAt - 1.4 ? 'dispatch' : time >= closeAt ? 'closing' : 'open';
    const timer = phase === 'closing' ? time - closeAt : phase === 'open' ? Math.max(0, 8 - (closeAt - time)) : 0;
    return { s, rear: s - TRAIN_LENGTH, speed: Math.min(limit, acceleration * elapsed), phase, timer,
      opening: doorOpening(phase, timer), exchange: waiting ? 12 : exchangeAge(phase, timer),
      side: st.side, station: st, exitGreen: time >= departAt - (waiting ? 1.25 : 5.5),
      clear: s - TRAIN_LENGTH > st.end + 2 };
  }
  entryGreen(index, time) {
    return !occupiedService(index) || !!this.pose(index, time)?.clear;
  }
}
