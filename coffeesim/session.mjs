import { DRINKS, getPhases, getState } from './cycle.mjs';

// Deliberately small teaching reservoir so depletion is visible after a few
// drinks. This is not the capacity of the real Philips water tank.
export const DEMO_TANK_CAPACITY_ML = 300;
export const DEMO_BEAN_CAPACITY_G = 60;
const RESOURCE_EPSILON = 1e-10;

/**
 * A seekable programme inside a persistent machine session. Moving the lesson
 * backwards does not put water or beans back, or remove a puck from the bin.
 * Replaying the same programme interval never charges its resources twice.
 */
export class MachineSession {
  constructor(drink = 'latte', {
    tankCapacityMl = DEMO_TANK_CAPACITY_ML,
    beanCapacityG = DEMO_BEAN_CAPACITY_G,
  } = {}) {
    this.tankCapacityMl = Number.isFinite(tankCapacityMl) && tankCapacityMl > 0
      ? tankCapacityMl : DEMO_TANK_CAPACITY_ML;
    this.beanCapacityG = Number.isFinite(beanCapacityG) && beanCapacityG > 0
      ? beanCapacityG : DEMO_BEAN_CAPACITY_G;
    this.speed = 1;
    this.drink = DRINKS[drink]?.id ?? 'latte';
    this.phases = getPhases(this.drink);
    this.duration = this.phases.at(-1).start;
    this.reset();
  }

  get resourceEmpty() { return this.waterEmpty || this.beansEmpty; }

  _beansAt(time) {
    const grind = this.phases.find(phase => phase.id === 'grind');
    const fraction = Math.max(0, Math.min(1, (time - grind.start) / grind.duration));
    return DRINKS[this.drink].coffeeGrams * fraction;
  }

  get state() {
    const sample = getState(this.time, this.drink);
    return {
      ...sample,
      tankCapacityMl: this.tankCapacityMl,
      tankRemainingMl: this.tankRemainingMl,
      tankLevel: this.tankRemainingMl / this.tankCapacityMl,
      waterEmpty: this.waterEmpty,
      beanCapacityG: this.beanCapacityG,
      beansRemainingG: this.beansRemainingG,
      beanLevel: this.beansRemainingG / this.beanCapacityG,
      beansEmpty: this.beansEmpty,
      resourceEmpty: this.resourceEmpty,
      beansUsedG: this._beanHighWaterG,
      storedPucks: this.storedPucks,
      priorPucks: this.priorPucks,
      currentPuckDeposited: this.currentPuckDeposited,
      ...(this.resourceEmpty ? {
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
    this._beanHighWaterG = 0;
    this.priorPucks = this.storedPucks;
    this.currentPuckDeposited = false;
    return this;
  }

  /** Explicit reset is the only operation that refills and empties the bin. */
  reset() {
    this.tankRemainingMl = this.tankCapacityMl;
    this.beansRemainingG = this.beanCapacityG;
    this.storedPucks = 0;
    this.waterEmpty = false;
    this.beansEmpty = false;
    return this._startRun();
  }

  setDrink(id) {
    if (this.resourceEmpty) return this;
    this.drink = DRINKS[id]?.id ?? 'latte';
    this.phases = getPhases(this.drink);
    this.duration = this.phases.at(-1).start;
    return this._startRun();
  }

  play() {
    if (this.resourceEmpty) return this;
    if (this.time >= this.duration) this._startRun();
    // An exactly finished dose can brew even with an empty hopper. A fresh
    // programme, however, cannot start grinding with no beans left.
    if (this.beansRemainingG === 0 && this._beanHighWaterG < DRINKS[this.drink].coffeeGrams - RESOURCE_EPSILON) {
      this.beansEmpty = true;
      this.playing = false;
      return this;
    }
    this.playing = true;
    return this;
  }

  pause() { this.playing = false; return this; }

  seek(requestedTime) {
    if (this.resourceEmpty) return this;
    let target = getState(requestedTime, this.drink);
    const doseG = DRINKS[this.drink].coffeeGrams;
    const availableDoseG = this._beanHighWaterG + this.beansRemainingG;
    const grind = this.phases.find(phase => phase.id === 'grind');
    const beanExhaustion = availableDoseG < doseG - RESOURCE_EPSILON
      && this._beansAt(target.time) >= availableDoseG
      && target.time > grind.start;
    if (beanExhaustion) {
      // Cap the request at the failed grinding step BEFORE calculating water
      // use. A seek to the end must not brew or deposit an incomplete dose.
      target = getState(grind.start + grind.duration * availableDoseG / doseG, this.drink);
    }
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

    const beansAtTimeG = this._beansAt(this.time);
    const additionalBeansG = Math.max(0, beansAtTimeG - this._beanHighWaterG);
    this.beansRemainingG = Math.max(0, this.beansRemainingG - additionalBeansG);
    if (this.beansRemainingG < RESOURCE_EPSILON) this.beansRemainingG = 0;
    this._beanHighWaterG = Math.max(this._beanHighWaterG, beansAtTimeG);
    if (beanExhaustion && !this.waterEmpty) {
      this.beansRemainingG = 0;
      this.beansEmpty = true;
      this.playing = false;
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
