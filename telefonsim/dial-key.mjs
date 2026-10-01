// Keep the pointer captured when it leaves the key. Clear ownership before
// releasing capture so the ensuing lostpointercapture cannot cancel a valid key-up.
export function bindDialKey(button, { press, release, cancel, activate }) {
  let pointerId = null;
  function finish(cancelled) {
    if (pointerId === null) return;
    const ended = pointerId; pointerId = null;
    button.classList.remove('held');
    if (button.hasPointerCapture(ended)) button.releasePointerCapture(ended);
    if (cancelled) cancel(); else release();
  }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || pointerId !== null || !press()) return;
    pointerId = event.pointerId; button.classList.add('held');
    button.setPointerCapture(pointerId); event.preventDefault();
  });
  button.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault(); finish(false);
  });
  button.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) finish(true); });
  button.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) finish(true); });
  // Keyboard activation and assistive technologies still get one complete turn.
  // A pointer's synthetic click must not add a second digit after pointerup.
  button.addEventListener('click', event => { if (event.detail === 0) activate(); });
  return { get pressed() { return pointerId !== null; }, cancel: () => finish(true) };
}
