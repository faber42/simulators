import { Exchange, STAGES, CONTACTS, TAPE_MACHINES, dialStopAngle } from './engine.mjs';
import { ExchangeScene } from './scene.js';
import { selectorSite, releaseBlockView } from './topology.mjs';
import { bindDialKey } from './dial-key.mjs';
import { subscriberAppearance, subscriberExamples } from './subscriber-catalog.mjs';

const $ = id => document.getElementById(id);
const STATE_NAMES = { idle: 'Ruhelage', finding: 'Anrufsucher läuft', ready: 'Wählbereit', winding: 'Wählscheibe aufziehen', holding: 'Wählscheibe am Anschlag', dialing: 'Impulswahl', hunting: 'Freisuche', ringing: 'Ruf zum Teilnehmer', connected: 'Sprechverbindung', busy: 'Besetzt', unavailable: 'Nicht beschaltet', external: 'Fernamtsabgang 0', releasing: 'Verbindung wird ausgelöst' };

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
      if (engine.dialTone) volume = .026;
      if (engine.state === 'ringing' && !engine.target?.tape && engine.time % 4 < 1) volume = .045;
      if (['busy', 'unavailable'].includes(engine.state) && engine.time % 1 < .5) volume = .03;
    }
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, .012);
  }
}

async function main() {
  const sound = new Sound(); let dirty = true, speed = 1, paused = false, drag = null, lastTimeAnnouncement = -1;
  const engine = new Exchange(event => { dirty = true; if (['pulse', 'step', 'release'].includes(event.type) && !paused) sound.click(event.type); });
  const scene = new ExchangeScene($('scene'), { source: $('source-view'), follow: $('follow-view'), overview: $('overview-world') });
  $('loader').hidden = true;
  const routeElements = STAGES.map((stage, index) => {
    const element = document.createElement('div'); element.className = 'route-stage';
    element.innerHTML = `<b>${stage.short}</b><span class="digit">—</span><small>${stage.digit}</small><small class="stage-state">frei</small>`;
    element.title = stage.name; $('route').append(element); return element;
  });
  const digitKeys = [];
  for (const digit of ['1','2','3','4','5','6','7','8','9','0']) {
    if (digit === '0') { const note = document.createElement('span'); note.className = 'key-label'; note.textContent = 'IMPULSWAHL'; $('keypad').append(note); }
    const button = document.createElement('button'); button.textContent = digit; button.dataset.digit = digit; button.setAttribute('aria-label', `Ziffer ${digit} wählen`);
    const key = bindDialKey(button, {
      press: () => {
        if (paused || drag || !engine.pressDigit(digit)) return false;
        feedback(''); return true;
      },
      release: () => engine.releaseDigit(), cancel: () => engine.cancelDigit(), activate: () => dial(digit),
    });
    digitKeys.push({ button, key }); $('keypad').append(button);
    if (digit === '0') { const note = document.createElement('span'); note.className = 'key-label'; note.textContent = '0 = 10'; $('keypad').append(note); }
  }
  for (const contact of CONTACTS) {
    const button = document.createElement('button'); button.className = 'directory-entry'; button.title = contact.note;
    button.innerHTML = `<span class="entry-icon">${contact.kind === 'phone' || contact.kind === 'busy' ? '☎' : contact.kind === 'external' ? '↗' : '◷'}</span><span class="entry-copy"><strong>${contact.name}</strong><small>${contact.number}</small></span><span class="entry-kind">${contact.kind === 'phone' ? 'APPARAT' : contact.kind === 'busy' ? 'BESETZT' : contact.kind === 'external' ? 'FERNAMT' : 'ANSAGE'}</span>`;
    button.onclick = () => { $('target-number').value = contact.number; feedback(`${contact.name} ausgewählt. „Wählen“ startet den Anruf.`); };
    $('directory').append(button);
  }
  for (const profile of subscriberExamples()) {
    const button = document.createElement('button'); button.className = 'apparatus-example';
    const name = document.createElement('span'); name.textContent = profile.model.name;
    const number = document.createElement('b'); number.textContent = profile.number; button.append(name, number);
    button.onclick = () => { $('target-number').value = profile.number; feedback(`${profile.model.name} ausgewählt. „Wählen“ startet den Anruf.`); };
    $('apparatus-examples').append(button);
  }
  function feedback(text) { $('input-feedback').textContent = text; }
  function dial(digit, prewound = false) {
    if (paused) { feedback('Die Simulation ist pausiert. Mit „Weiter“ fortsetzen.'); return; }
    if (drag || engine.dialHeld) { feedback('Bitte die Wählscheibe oder die gedrückte Zifferntaste erst loslassen.'); return; }
    if (!engine.enqueue(digit, prewound)) feedback(!engine.offHook ? 'Bitte zuerst den Hörer abheben.' : 'Für eine neue Rufnummer bitte auflegen. Die laufende Wahl wird vollständig geschaltet.');
    else feedback('');
  }
  function hook() {
    cancelManualInput();
    if (engine.offHook) { engine.hangup(); feedback(''); }
    else if (engine.state === 'idle') { engine.lift(); feedback(''); }
    else feedback('Die Wähler kehren noch in die Ruhelage zurück.');
  }
  $('hook').onclick = hook;
  for (const mode of ['route', 'whole']) $('overview-' + mode).onclick = () => {
    scene.setOverviewMode(mode);
    for (const option of ['route', 'whole']) $('overview-' + option).setAttribute('aria-pressed', String(option === mode));
  };
  $('answer').onclick = () => { engine.answer(); };
  $('target-hangup').onclick = () => engine.targetHangup();
  $('number-form').onsubmit = event => {
    event.preventDefault();
    const number = $('target-number').value.trim();
    if (!/^(?:0\d{0,5}|[1-9]\d{5})$/.test(number)) { feedback('Bitte sechs Ziffern für einen Ortsanschluss eingeben, oder 0 für das Fernamt.'); return; }
    if (paused) { feedback('Bitte die Simulation mit „Weiter“ fortsetzen.'); return; }
    if (!engine.dialNumber(number)) feedback('Bitte die aktuelle Verbindung zuerst auflegen und die Rückstellung abwarten.');
    else feedback(number.startsWith('0') ? 'Die erste 0 schaltet zum Fernamt. Weitere Ziffern werden dort außerhalb dieses Modells verarbeitet.' : 'Die Nummer wird Ziffer für Ziffer mit der Wählscheibe gewählt.');
  };
  $('target-number').addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); feedback(''); });
  const speeds = [.5, 1, 2, 4];
  $('speed').onclick = () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; $('speed').textContent = `Tempo ${String(speed).replace('.', ',')}×`; };
  $('pause').onclick = () => {
    paused = !paused; cancelManualInput(); dirty = true; $('pause').textContent = paused ? 'Weiter' : 'Pause';
    $('pause').setAttribute('aria-pressed', String(paused)); document.body.classList.toggle('paused', paused);
  };
  $('sound').onclick = async () => {
    try { const enabled = await sound.toggle(); $('sound').textContent = enabled ? 'Ton an' : 'Ton aus'; $('sound').setAttribute('aria-pressed', String(enabled)); }
    catch { feedback('Audio ist in diesem Browser nicht verfügbar. Die Textanzeigen bleiben nutzbar.'); }
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancelManualInput(); engine.hangup(); return; }
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
    if (paused || !engine.canPressDigit) { feedback('Bitte warten, bis der Wähler bereit ist. Ziffern können auch auf der Computertastatur vorgemerkt werden.'); return; }
    const angle = scene.dialPointerAngle(event.clientX, event.clientY);
    if (angle === null) return;
    drag = { digit: picked.digit, last: angle, angle: 0, max: dialStopAngle(picked.digit), x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
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
  function cancelManualInput() {
    digitKeys.forEach(({ key }) => key.cancel());
    if (drag) {
      const pointerId = drag.pointerId; drag = null;
      if (hit.hasPointerCapture(pointerId)) hit.releasePointerCapture(pointerId);
    }
    dirty = true;
  }
  window.addEventListener('blur', cancelManualInput);
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
    const tape = TAPE_MACHINES.find(t => t.id === engine.target?.tape);
    $('state-label').textContent = (tape && engine.state === 'ringing' ? 'Tonbandanlauf' : engine.tapeRunning ? 'Bandwiedergabe' : engine.dialTone ? 'Wählton · Anschluss gefunden' : STATE_NAMES[engine.state]).toUpperCase(); $('status').textContent = engine.message;
    $('status-light').className = `status-light ${['busy', 'unavailable'].includes(engine.state) ? 'busy' : !['idle', 'connected'].includes(engine.state) ? 'working' : ''}`;
    $('route-summary').textContent = engine.state === 'external' ? '0 → Fernamt' : `${engine.digits.length} / 6 Ziffern`;
    $('queue-count').textContent = engine.pending.length ? `${engine.pending.length} vorgemerkt` : '';
    const number = engine.digits + (engine.currentDigit ?? '') + engine.pending.join('');
    $('number-display').replaceChildren(...Array.from({ length: 6 }, (_, i) => {
      const span = document.createElement('span'); span.textContent = number[i] ?? '—';
      if (i >= engine.digits.length) span.className = 'queued'; return span;
    }));
    digitKeys.forEach(({ button, key }) => { button.disabled = paused || (!key.pressed && !engine.canPressDigit); });
    routeElements.forEach((element, index) => {
      const selector = engine.selectors[index];
      element.classList.toggle('held', !!selector?.held); element.classList.toggle('active', engine.focus === index && !!selector);
      element.querySelector('.digit').textContent = index === 0 ? selector ? '●' : '—' : index === 5 ? (engine.digits.slice(4) || '—') : (engine.digits[index - 1] || '—');
      element.querySelector('.stage-state').textContent = selector?.phase || 'frei';
    });
    const s = typeof engine.focus === 'number' ? engine.selectors[engine.focus] ?? (engine.focus === 0 ? { stage: 0, prefix: '2100', slot: 0, level: 0, rotary: 0, phase: 'Ruhelage · wartet auf Abheben' } : null) : null;
    $('focus-name').textContent = s ? STAGES[s.stage].name.toUpperCase() : engine.focus === 'external' ? '0 · FERNAMTSABGANG' : ['target', 'tape'].includes(engine.focus) ? (engine.target?.name || 'ZIELAPPARAT').toUpperCase() : 'VERBINDUNG VERFOLGEN';
    $('level').textContent = s ? `${s.level} / 10` : '—'; $('rotation').textContent = s ? `${s.rotary} / 10` : '—';
    $('pulses').textContent = engine.currentDigit !== null ? `${engine.pulse} / ${engine.pulseTotal}` : '—';
    $('mechanism-readout').hidden = !s;
    const site = s ? selectorSite(s.stage, s.prefix, s.slot) : null;
    $('focus-description').textContent = s ? `${site.rack} · Fach ${site.shelf + 1} / Wähler ${s.slot + 1} · ${s.phase}` : engine.focus === 'tape' ? `${engine.digits} · ${engine.tapeRunning ? 'Band läuft bis zum Auflegen' : 'Tonbandgerät schaltet ein'}` : engine.focus === 'target' ? `${engine.digits} · ${engine.state === 'ringing' ? 'Rufstrom liegt an' : 'Zielanschluss'}` : 'Vom Apparat durch das Amt bis zum Ziel.';
    if (engine.focus === 'external') $('focus-description').textContent = 'Weitere Vorwahl und Vermittlung im nicht dargestellten Fernamt. Zum Freigeben auflegen.';
    $('release-readout').hidden = engine.focus !== 'release';
    if (engine.focus === 'release') {
      const view = releaseBlockView(engine.release.prefix);
      $('focus-name').textContent = view.label.toUpperCase();
      const phase = engine.release.phase;
      $('focus-description').textContent = phase === 'overview' ? 'Überblick vor der gemeinsamen Rückstellung'
        : phase === 'free' ? 'Alle Wähler frei · zurück zum Anrufsucher' : 'Alle belegten Wähler stellen gleichzeitig zurück';
      $('release-readout').replaceChildren(...engine.release.stages.map(stage => {
        const element = document.createElement('span'), selector = engine.selectors[stage];
        element.className = phase === 'free' ? 'released' : '';
        const name = document.createElement('b'); name.textContent = STAGES[stage].short;
        const state = document.createElement('small'); state.textContent = phase === 'overview' ? 'gehalten' : selector?.phase || 'frei';
        element.append(name, state); return element;
      }));
    }
    const last = engine.selectors.filter(v => v?.held).at(-1), prefix = last?.stage > 1 ? last.prefix : '';
    $('office-location').textContent = prefix.length >= 2
      ? `Zugang → Bereich ${prefix.slice(0, 2)}xxxx${prefix.length >= 3 ? ` → Gasse ${prefix.slice(0, 3)}xxx` : ''}${prefix.length >= 4 ? ` → Gruppe ${prefix.slice(0, 4)}xx` : ''}${engine.target?.tape && ['ringing', 'connected'].includes(engine.state) ? ' → Tonband' : ''}`
      : prefix ? `Zugang → Hauptgruppe ${prefix}xxxxx` : 'Zugang · Anrufsucher und erste Gruppenwähler';
    if (engine.state === 'external') $('office-location').textContent = 'Quellapparat → Anrufsucher → I. GW → 0 → Fernamt außerhalb';
    const subscriber = ['ringing', 'connected'].includes(engine.state);
    $('subscriber-detail').hidden = !subscriber;
    if (subscriber) $('subscriber-detail').textContent = `LW ${engine.digits.slice(0, 4)}xx ↑ OG → ${engine.target.tape ? engine.target.name : `☎ ${engine.digits}`}`;
    $('follow-view').classList.toggle('tape-view', engine.focus === 'tape');
    $('target-style').hidden = engine.focus !== 'target' || !engine.target;
    if (engine.focus === 'target' && engine.target) {
      const profile = subscriberAppearance(engine.target.number);
      $('target-model').textContent = profile.model.name;
      $('target-setting').textContent = `${profile.colour.name} · ${profile.setting.name} · ${profile.finish.name}`;
    }
    $('tape-transport').hidden = engine.focus !== 'tape';
    $('tape-name').textContent = tape?.short.toUpperCase() || '';
    $('tape-mode').textContent = engine.tapeRunning ? 'WIEDERGABE · ENDLOSSCHLEIFE' : 'AUTOMATISCHER ANLAUF';
    $('answer').hidden = engine.state !== 'ringing' || engine.target?.kind !== 'phone';
    $('announcement').hidden = engine.state !== 'connected';
    $('announcement-type').textContent = engine.target?.kind === 'phone' ? 'SPRECHVERBINDUNG' : 'AUTOMATISCHER ANSAGEDIENST · SIMULIERTE ANSAGE';
    $('announcement-text').textContent = engine.announcement;
    $('target-hangup').hidden = engine.target?.kind !== 'phone';
    $('dial-hint').textContent = engine.dialHeld
      ? engine.state === 'holding' ? `Ziffer ${engine.currentDigit} am Anschlag · Taste loslassen` : `Wählscheibe zieht auf · Ziffer ${engine.currentDigit}`
      : engine.offHook ? engine.currentDigit !== null ? `Wählscheibe läuft zurück · Ziffer ${engine.currentDigit}` : 'Zifferntaste halten oder Wählscheibe drehen' : 'Hörer anklicken · dann Wählscheibe drehen';
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
    if (engine.focus === 'tape') {
      const seconds = Math.floor(engine.playbackSeconds);
      const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if ($('tape-counter').textContent !== text) $('tape-counter').textContent = text;
    }
    scene.update(engine, paused ? 0 : realDt * speed, drag?.angle ?? null); scene.render(); sound.update(engine, paused);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) { cancelManualInput(); sound.update(engine, true); } });
  $('scene').addEventListener('webglcontextlost', event => {
    event.preventDefault(); paused = true; cancelManualInput(); sound.update(engine, true);
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
