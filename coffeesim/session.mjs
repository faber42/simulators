import { DRINKS, getPhases, getState } from './cycle.mjs';

// Deliberately small teaching reservoir so depletion is visible after a few
// drinks. This is not the capacity of the real Philips water tank.
export const DEMO_TANK_CAPACITY_ML = 300;

/**
 * A seekable programme inside a persistent machine session. Moving the lesson
 * backwards does not put water back or remove a puck from the waste container.
 * Replaying the same programme interval never charges its water twice.
 */
export class MachineSession {
  constructor(drink = 'latte', { tankCapacityMl = DEMO_TANK_CAPACITY_ML } = {}) {
    this.tankCapacityMl = Number.isFinite(tankCapacityMl) && tankCapacityMl > 0
      ? tankCapacityMl : DEMO_TANK_CAPACITY_ML;
    this.speed = 1;
    this.drink = DRINKS[drink]?.id ?? 'latte';
    this.phases = getPhases(this.drink);
    this.duration = this.phases.at(-1).start;
    this.reset();
  }

  get state() {
    const sample = getState(this.time, this.drink);
    return {
      ...sample,
      tankCapacityMl: this.tankCapacityMl,
      tankRemainingMl: this.tankRemainingMl,
      tankLevel: this.tankRemainingMl / this.tankCapacityMl,
      waterEmpty: this.waterEmpty,
      storedPucks: this.storedPucks,
      priorPucks: this.priorPucks,
      currentPuckDeposited: this.currentPuckDeposited,
      ...(this.waterEmpty ? {
        grind: false, pump: false, steam: false, milkFlow: false,
        brewFlow: false, heater: false, preinfusion: false,
        draining: false, pressure: 0,
      } : {}),
    };
  }

  _startRun() {
    this.time = 0;
    this.playing = false;
    this._waterHighWaterMl = 0;
    this.priorPucks = this.storedPucks;
    this.currentPuckDeposited = false;
    return this;
  }

  /** Explicit reset is the only operation that refills and empties the bin. */
  reset() {
    this.tankRemainingMl = this.tankCapacityMl;
    this.storedPucks = 0;
    this.waterEmpty = false;
    return this._startRun();
  }

  setDrink(id) {
    if (this.waterEmpty) return this;
    this.drink = DRINKS[id]?.id ?? 'latte';
    this.phases = getPhases(this.drink);
    this.duration = this.phases.at(-1).start;
    return this._startRun();
  }

  play() {
    if (this.waterEmpty) return this;
    if (this.time >= this.duration) this._startRun();
    this.playing = true;
    return this;
  }

  pause() { this.playing = false; return this; }

  seek(requestedTime) {
    if (this.waterEmpty) return this;
    const target = getState(requestedTime, this.drink);
    const additionalWaterMl = Math.max(0, target.waterUsedMl - this._waterHighWaterMl);

    if (additionalWaterMl > 0 && additionalWaterMl >= this.tankRemainingMl) {
      // Find the first instant of exhaustion, including when a large seek or
      // update would otherwise skip straight through extraction and ejection.
      const emptyAtWaterMl = this._waterHighWaterMl + this.tankRemainingMl;
      let low = this.time;
      let high = target.time;
      for (let iteration = 0; iteration < 60; iteration++) {
        const middle = (low + high) / 2;
        if (getState(middle, this.drink).waterUsedMl < emptyAtWaterMl) low = middle;
        else high = middle;
      }
      this.time = high;
      this._waterHighWaterMl = emptyAtWaterMl;
      this.tankRemainingMl = 0;
      this.waterEmpty = true;
      this.playing = false;
    } else {
      this.time = target.time;
      this.tankRemainingMl -= additionalWaterMl;
      this._waterHighWaterMl = Math.max(this._waterHighWaterMl, target.waterUsedMl);
      if (this.time >= this.duration) this.playing = false;
    }

    if (!this.currentPuckDeposited && getState(this.time, this.drink).wastePuck) {
      this.currentPuckDeposited = true;
      this.storedPucks++;
    }
    return this;
  }

  update(dt) {
    if (this.playing && Number.isFinite(dt) && dt > 0 && Number.isFinite(this.speed) && this.speed > 0) {
      this.seek(this.time + dt * this.speed);
    }
    return this.state;
  }
}
