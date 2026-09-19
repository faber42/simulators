// Frame intervals are measured before any simulation-time clamp. A stall counts
// for its full visible duration, not as just one bad frame among many fast ones.
export class FrameDiagnostics {
  constructor(windowMs = 60000, threshold = 30) {
    this.windowMs = windowMs; this.thresholdMs = 1000 / threshold;
    this.samples = []; this.head = 0; this.last = null;
  }
  resetClock() { this.last = null; }
  frame(now, work = null) {
    if (this.last !== null && now > this.last) this.samples.push({ start: this.last, end: now, bad: now - this.last > this.thresholdMs + .01, work });
    this.last = now; this.trim(now);
  }
  trim(now) {
    while (this.head < this.samples.length && this.samples[this.head].end <= now - this.windowMs) this.head++;
    if (this.head > 2048) { this.samples = this.samples.slice(this.head); this.head = 0; }
  }
  snapshot(now) {
    this.trim(now);
    let observed = 0, below = 0, recentMs = 0, recentFrames = 0, maxMs = 0;
    const intervals = [], slowFrames = [], history = Array.from({ length: 60 }, () => ({ ms: 0, frames: 0 }));
    for (let i = this.head; i < this.samples.length; i++) {
      const s = this.samples[i], dt = s.end - s.start;
      const visible = s.end - Math.max(s.start, now - this.windowMs);
      observed += visible; if (s.bad) below += visible;
      if (s.bad && s.work) slowFrames.push({ frameMs: dt, ...s.work });
      maxMs = Math.max(maxMs, dt); intervals.push(dt);
      const recent = Math.max(0, s.end - Math.max(s.start, now - 1000));
      recentMs += recent; recentFrames += recent / dt;
      // Split long intervals across second bins, so stalls remain visible.
      for (let j = Math.max(0, Math.floor((Math.max(s.start, now - 60000) - now + 60000) / 1000)); j < 60; j++) {
        const from = now - 60000 + j * 1000, to = from + 1000;
        if (from >= s.end) break;
        const overlap = Math.max(0, Math.min(s.end, to) - Math.max(s.start, from));
        history[j].ms += overlap; history[j].frames += overlap / dt;
      }
    }
    intervals.sort((a, b) => a - b);
    return { fps: recentMs ? recentFrames * 1000 / recentMs : 0, below30Percent: observed ? below / observed * 100 : 0,
      observedSeconds: observed / 1000, samples: intervals.length, maxFrameMs: maxMs,
      p95FrameMs: intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * .95))] : 0,
      slowFrames: slowFrames.slice(-6), history: history.map(h => h.ms ? h.frames * 1000 / h.ms : null) };
  }
}
