/**
 * A phase-aligned, demand-driven RAF loop. A paused, settled view owns no pending RAF
 * or timer. onFrame returns true only while a visual transition needs another
 * frame; invalidate() requests a fresh frame without starting the simulation.
 */
export function createFrameLoop({
  fps = 30,
  onFrame,
  now = globalThis.performance.now.bind(globalThis.performance),
  requestFrame = callback => globalThis.requestAnimationFrame(callback),
  cancelFrame = handle => globalThis.cancelAnimationFrame(handle),
} = {}) {
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('fps must be a positive finite number.');
  if (typeof onFrame !== 'function') throw new TypeError('onFrame must be a function.');

  const interval = 1000 / fps;
  // RAF timestamps can be rounded to a whole millisecond. A small
  // tolerance prevents a rounded-down display tick from becoming a 50 ms gap.
  const epsilon = 1;
  let running = false;
  let visible = true;
  let disposed = false;
  let dirty = false;
  let moving = false;
  let pending = null;
  let lastDraw = null;
  let nextDraw = null;
  let activeClock = null;

  const needsFrame = () => running || dirty || moving;

  function startClock(time) {
    if (activeClock === null) {
      // Idle time has no deadlines to catch up. A rapid pause/restart still
      // respects the preceding draw instead of producing an extra frame.
      nextDraw = lastDraw === null || time - lastDraw >= interval ? null : lastDraw + interval;
    }
    activeClock = time;
  }

  function reconcile() {
    if (disposed || !visible || !needsFrame()) {
      if (pending !== null) cancelFrame(pending);
      pending = null;
      activeClock = null;
      return;
    }
    if (activeClock === null) startClock(now());
    if (pending === null) pending = requestFrame(frame);
  }

  function frame(timestamp) {
    pending = null;
    if (disposed || !visible || !needsFrame()) {
      reconcile();
      return;
    }
    // RAF timestamps describe display frames. performance.now() additionally
    // contains callback latency, whose tiny jitter must not skip display ticks.
    const time = Number.isFinite(timestamp) ? timestamp : now();
    if (nextDraw === null || time + epsilon >= nextDraw) {
      const dt = Math.max(0, time - (activeClock ?? time)) / 1000;
      activeClock = time;
      lastDraw = time;
      if (nextDraw === null || time - nextDraw >= interval) {
        // A genuine stall drops missed slots; never emit catch-up bursts.
        nextDraw = time + interval;
      } else {
        // Retain fractional display-frame remainder. Resetting to time here
        // drifts below 30 FPS on 59.94/144 Hz displays and under callback jitter.
        nextDraw += interval;
      }
      // Clear this request before invoking the client, so an invalidate()
      // raised from inside onFrame is retained for the next frame.
      dirty = false;
      moving = onFrame(dt) === true;
    }
    reconcile();
  }

  return {
    setRunning(value) {
      if (disposed || running === Boolean(value)) return;
      running = Boolean(value);
      // Never carry paused time into a newly resumed simulation.
      if (visible && needsFrame()) startClock(now());
      else activeClock = null;
      reconcile();
    },
    setVisible(value) {
      if (disposed || visible === Boolean(value)) return;
      visible = Boolean(value);
      if (visible && needsFrame()) startClock(now());
      else activeClock = null;
      reconcile();
    },
    invalidate() {
      if (disposed) return;
      dirty = true;
      reconcile();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reconcile();
    },
  };
}
