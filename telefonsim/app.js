import { Exchange, STAGES, CONTACTS, pulsesFor } from './engine.mjs';
import { ExchangeScene } from './scene.js';

const $ = id => document.getElementById(id);
const STATE_NAMES = { idle: 'Ruhelage', finding: 'Anrufsucher läuft', ready: 'Wählbereit', dialing: 'Impulswahl', hunting: 'Freisuche', ringing: 'Ruf zum Teilnehmer', connected: 'Sprechverbindung', busy: 'Besetzt', unavailable: 'Nicht beschaltet', releasing: 'Verbindung wird ausgelöst' };

class Sound {
  constructor() { this.enabled = false; this.context = null; }
  async toggle() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.context.createGain(); this.gain.gain.value = 0; this.gain.connect(this.context.destination);
      this.oscillator = this.context.createOscillator(); this.oscillator.frequency.value = 425; this.oscillator.connect(this.gain); this.oscillator.start();
    }
    await this.context.resume(); this.enabled = !this.enabled; return this.enabled;
  }
  click(kind) {
    if (!this.enabled || !this.context) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(kind === 'release' ? 170 : 950, now);
    oscillator.frequency.exponentialRampToValueAtTime(90, now + .045);
    gain.gain.setValueAtTime(.07, now); gain.gain.exponentialRampToValueAtTime(.001, now + .05);
    oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(now); oscillator.stop(now + .06);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  update(engine, paused) {
    if (!this.context) return;
    let volume = 0;
    if (this.enabled && !paused) {
      if (engine.state === 'ready' && !engine.digits.length) volume = .026;
      if (engine.state === 'ringing' && engine.time % 4 < 1) volume = .045;
      if (['busy', 'unavailable'].includes(engine.state) && engine.time % 1 < .5) volume = .03;
    }
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, .012);
  }
}

async function main() {
  const sound = new Sound(); let dirty = true, speed = 1, paused = false, drag = null, lastTimeAnnouncement = -1;
  const engine = new Exchange(event => { dirty = true; if (['pulse', 'step', 'release'].includes(event.type) && !paused) sound.click(event.type); });
  const scene = new ExchangeScene($('scene'), { source: $('source-view'), follow: $('follow-view'), overview: $('overview-view') });
  $('loader').hidden = true;
  const routeElements = STAGES.map((stage, index) => {
    const element = document.createElement('div'); element.className = 'route-stage';
    element.innerHTML = `<b>${stage.short}</b><span class="digit">—</span><small>${stage.digit}</small><small class="stage-state">frei</small>`;
    element.title = stage.name; $('route').append(element); return element;
  });
  for (const digit of ['1','2','3','4','5','6','7','8','9','0']) {
    if (digit === '0') { const note = document.createElement('span'); note.className = 'key-label'; note.textContent = 'IMPULSWAHL'; $('keypad').append(note); }
    const button = document.createElement('button'); button.textContent = digit; button.dataset.digit = digit; button.setAttribute('aria-label', `Ziffer ${digit} wählen`);
    button.onclick = () => dial(digit); $('keypad').append(button);
    if (digit === '0') { const note = document.createElement('span'); note.className = 'key-label'; note.textContent = '0 = 10'; $('keypad').append(note); }
  }
  for (const contact of CONTACTS) {
    const button = document.createElement('button'); button.className = 'directory-entry'; button.title = contact.note;
    button.innerHTML = `<span class="entry-icon">${contact.kind === 'phone' || contact.kind === 'busy' ? '☎' : '◷'}</span><span class="entry-copy"><strong>${contact.name}</strong><small>${contact.number}</small></span><span class="entry-kind">${contact.kind === 'phone' ? 'APPARAT' : contact.kind === 'busy' ? 'BESETZT' : 'ANSAGE'}</span>`;
    button.onclick = () => { $('target-number').value = contact.number; feedback(`${contact.name} ausgewählt. „Wählen“ startet den Anruf.`); };
    $('directory').append(button);
  }
  function feedback(text) { $('input-feedback').textContent = text; }
  function dial(digit, prewound = false) {
    if (paused) { feedback('Die Simulation ist pausiert. Mit „Weiter“ fortsetzen.'); return; }
    if (!engine.enqueue(digit, prewound)) feedback(!engine.offHook ? 'Bitte zuerst den Hörer abheben.' : 'Für eine neue Rufnummer bitte auflegen. Die laufende Wahl wird vollständig geschaltet.');
    else feedback('');
  }
  function hook() {
    drag = null;
    if (engine.offHook) { engine.hangup(); feedback(''); }
    else if (engine.state === 'idle') { engine.lift(); feedback(''); }
    else feedback('Die Wähler kehren noch in die Ruhelage zurück.');
  }
  $('hook').onclick = hook;
  $('answer').onclick = () => { engine.answer(); };
  $('target-hangup').onclick = () => engine.targetHangup();
  $('number-form').onsubmit = event => {
    event.preventDefault();
    const number = $('target-number').value.trim();
    if (!/^\d{6}$/.test(number)) { feedback('Bitte genau sechs Ziffern eingeben.'); return; }
    if (paused) { feedback('Bitte die Simulation mit „Weiter“ fortsetzen.'); return; }
    if (!engine.dialNumber(number)) feedback('Bitte die aktuelle Verbindung zuerst auflegen und die Rückstellung abwarten.');
    else feedback('Die Nummer wird Ziffer für Ziffer mit der Wählscheibe gewählt.');
  };
  $('target-number').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); feedback(''); });
  const speeds = [.5, 1, 2, 4];
  $('speed').onclick = () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; $('speed').textContent = `Tempo ${String(speed).replace('.', ',')}×`; };
  $('pause').onclick = () => {
    paused = !paused; drag = null; $('pause').textContent = paused ? 'Weiter' : 'Pause';
    $('pause').setAttribute('aria-pressed', String(paused)); document.body.classList.toggle('paused', paused);
  };
  $('sound').onclick = async () => {
    try { const enabled = await sound.toggle(); $('sound').textContent = enabled ? 'Ton an' : 'Ton aus'; $('sound').setAttribute('aria-pressed', String(enabled)); }
    catch { feedback('Audio ist in diesem Browser nicht verfügbar. Die Textanzeigen bleiben nutzbar.'); }
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { drag = null; engine.hangup(); return; }
    if (event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); dial(event.key); }
    if (event.code === 'Space' && !/BUTTON|SUMMARY|A/.test(event.target.tagName)) { event.preventDefault(); $('pause').click(); }
  });
  const hit = $('source-hit');
  hit.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const picked = scene.pick('source', event.clientX, event.clientY);
    if (picked?.action === 'handset') { hook(); return; }
    if (picked?.digit === undefined) return;
    if (!engine.offHook) { feedback('Bitte zuerst den Hörer abheben.'); return; }
    if (paused || engine.state !== 'ready' || engine.currentDigit !== null) { feedback('Bitte warten, bis der Wähler bereit ist. Ziffern können auch auf der Tastatur vorgemerkt werden.'); return; }
    const angle = scene.dialPointerAngle(event.clientX, event.clientY);
    if (angle === null) return;
    drag = { digit: picked.digit, last: angle, angle: 0, max: (pulsesFor(picked.digit) + 1) * Math.PI / 6, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
    hit.setPointerCapture(event.pointerId); event.preventDefault();
  });
  hit.addEventListener('pointermove', event => {
    if (!drag) { const picked = scene.pick('source', event.clientX, event.clientY); hit.style.cursor = picked ? 'pointer' : 'default'; return; }
    const angle = scene.dialPointerAngle(event.clientX, event.clientY); if (angle === null) return;
    let delta = angle - drag.last;
    if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2;
    drag.last = angle; drag.angle = Math.max(0, Math.min(drag.max, drag.angle + delta));
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) drag.moved = true;
    $('dial-hint').textContent = drag.angle > drag.max - .23 ? 'Anschlag erreicht – jetzt loslassen' : 'Im Uhrzeigersinn bis zum Anschlag drehen';
  });
  function finishDrag(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const ended = drag; drag = null;
    if (hit.hasPointerCapture(event.pointerId)) hit.releasePointerCapture(event.pointerId);
    if (!cancelled && (!ended.moved || ended.angle > ended.max - .23)) dial(ended.digit, ended.moved);
    else feedback('Wählscheibe vor dem Anschlag losgelassen – keine Ziffer gewählt.');
    dirty = true;
  }
  hit.addEventListener('pointerup', event => finishDrag(event));
  hit.addEventListener('pointercancel', event => finishDrag(event, true));
  hit.addEventListener('lostpointercapture', event => { if (drag?.pointerId === event.pointerId) { drag = null; dirty = true; } });
  $('follow-hit').addEventListener('pointerdown', event => {
    if (engine.focus !== 'target') return;
    const picked = scene.pick('follow', event.clientX, event.clientY);
    if (picked?.action === 'handset') {
      if (engine.state === 'ringing') engine.answer();
      else if (engine.state === 'connected') engine.targetHangup();
    }
  });

  function updateUI() {
    $('hook').textContent = engine.offHook ? 'Hörer auflegen' : engine.state === 'releasing' ? 'Amt stellt zurück …' : 'Hörer abheben';
    $('hook').disabled = engine.state === 'releasing';
    $('state-label').textContent = STATE_NAMES[engine.state].toUpperCase(); $('status').textContent = engine.message;
    $('status-light').className = `status-light ${['busy', 'unavailable'].includes(engine.state) ? 'busy' : !['idle', 'connected'].includes(engine.state) ? 'working' : ''}`;
    $('route-summary').textContent = `${engine.digits.length} / 6 Ziffern`;
    $('queue-count').textContent = engine.pending.length ? `${engine.pending.length} vorgemerkt` : '';
    const number = engine.digits + (engine.currentDigit ?? '') + engine.pending.join('');
    $('number-display').replaceChildren(...Array.from({ length: 6 }, (_, i) => {
      const span = document.createElement('span'); span.textContent = number[i] ?? '—';
      if (i >= engine.digits.length) span.className = 'queued'; return span;
    }));
    const allowDigit = engine.offHook && !['ringing', 'connected', 'busy', 'unavailable', 'releasing'].includes(engine.state) && number.length < 6;
    document.querySelectorAll('[data-digit]').forEach(button => { button.disabled = !allowDigit; });
    routeElements.forEach((element, index) => {
      const selector = engine.selectors[index];
      element.classList.toggle('held', !!selector?.held); element.classList.toggle('active', engine.focus === index && !!selector);
      element.querySelector('.digit').textContent = index === 0 ? selector ? '●' : '—' : index === 5 ? (engine.digits.slice(4) || '—') : (engine.digits[index - 1] || '—');
      element.querySelector('.stage-state').textContent = selector?.phase || 'frei';
    });
    const s = typeof engine.focus === 'number' ? engine.selectors[engine.focus] : null;
    $('focus-name').textContent = s ? STAGES[s.stage].name.toUpperCase() : engine.focus === 'target' ? (engine.target?.name || 'ZIELAPPARAT').toUpperCase() : 'VERBINDUNG VERFOLGEN';
    $('level').textContent = s ? `${s.level} / 10` : '—'; $('rotation').textContent = s ? `${s.rotary} / 10` : '—';
    $('pulses').textContent = engine.currentDigit !== null ? `${engine.pulse} / ${engine.pulseTotal}` : '—';
    $('mechanism-readout').hidden = !s;
    $('focus-description').textContent = s ? `${s.stage === 0 ? 'Anschluss 010001' : `Gruppe ${s.prefix || 'alle Anschlüsse'}${s.prefix ? '…' : ''}`} · ${s.phase}` : engine.focus === 'target' ? `${engine.digits} · ${engine.state === 'ringing' ? 'Rufstrom liegt an' : 'Zielanschluss'}` : 'Vom Apparat durch das Amt bis zum Ziel.';
    $('answer').hidden = engine.state !== 'ringing' || engine.target?.kind !== 'phone';
    $('announcement').hidden = engine.state !== 'connected';
    $('announcement-type').textContent = engine.target?.kind === 'phone' ? 'SPRECHVERBINDUNG' : 'AUTOMATISCHER ANSAGEDIENST · SIMULIERTE ANSAGE';
    $('announcement-text').textContent = engine.announcement;
    $('dial-hint').textContent = engine.offHook ? engine.currentDigit !== null ? `Wählscheibe läuft zurück · Ziffer ${engine.currentDigit}` : 'Ziffer anklicken oder bis zum Anschlag drehen' : 'Hörer anklicken · dann Wählscheibe drehen';
    $('log').replaceChildren(...engine.history.map(item => { const li = document.createElement('li'); li.textContent = `${item.time.toFixed(1)} s · ${item.text}`; return li; }));
    dirty = false;
  }
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.max(0, Math.min((now - last) / 1000, .075)); last = now;
    if (!paused) engine.step(realDt * speed);
    if (engine.state === 'connected' && engine.target?.kind === 'time') {
      const seconds = new Date().getSeconds();
      if (seconds !== lastTimeAnnouncement && !paused) { lastTimeAnnouncement = seconds; engine.announcement = engine.serviceText(); dirty = true; }
    }
    if (dirty) updateUI();
    scene.update(engine, paused ? 0 : realDt * speed, drag?.angle ?? null); scene.render(); sound.update(engine, paused);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) sound.update(engine, true); });
  $('scene').addEventListener('webglcontextlost', event => {
    event.preventDefault(); paused = true; sound.update(engine, true);
    $('loader').hidden = false; $('loader').classList.add('error'); $('loader').textContent = 'Die 3D-Verbindung wurde unterbrochen. Bitte die Seite neu laden.';
  });
  // A read-only snapshot helps inspect the independent switching model.
  window.TELEFONSIM = { snapshot: () => engine.snapshot() };
  updateUI(); scene.update(engine, 1); scene.render(); requestAnimationFrame(frame);
}

main().catch(error => {
  console.error(error); const loader = $('loader'); loader.hidden = false; loader.classList.add('error');
  loader.textContent = `Das Fernsprechamt konnte nicht starten: ${error.message}. Bitte einen Browser mit WebGL 2 verwenden und die Seite über „npm start“ öffnen.`;
});
