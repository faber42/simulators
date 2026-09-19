// Stop requesting animation frames entirely while paused or hidden. A resize
// can invalidate the frozen image and request exactly one replacement frame.
export class RenderLoop {
  constructor(frame, request = callback => requestAnimationFrame(callback), cancel = id => cancelAnimationFrame(id)) {
    this.frame = frame; this.request = request; this.cancel = cancel;
    this.active = false; this.visible = true; this.dirty = false; this.pending = null;
    this.tick = now => {
      this.pending = null;
      const redraw = this.dirty; this.dirty = false;
      this.frame(now, redraw); this.schedule();
    };
  }
  setState(active, visible = true) { this.active = active; this.visible = visible; this.schedule(); }
  invalidate() { this.dirty = true; this.schedule(); }
  schedule() {
    const needed = this.visible && (this.active || this.dirty);
    if (!needed && this.pending !== null) { this.cancel(this.pending); this.pending = null; }
    if (needed && this.pending === null) this.pending = this.request(this.tick);
  }
}
