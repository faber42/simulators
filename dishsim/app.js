import { Cycle, PHASES, TOTAL_DURATION } from './cycle.mjs';
import { waterColor } from './water-color.mjs';

const $ = id => document.getElementById(id);
const cycle = new Cycle();
let scene;
let cutaway = true;
let showLabels = true;
let focusedComponent = null;
let currentView = 'overview';
let lastTime = performance.now();
let uiElapsed = 0;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const themeName = () => systemTheme.matches ? 'dark' : 'light';
let appliedTheme;
function syncTheme() {
  const nextTheme = themeName();
  if (scene && appliedTheme !== nextTheme) {
    scene.setTheme(nextTheme);
    appliedTheme = nextTheme;
  }
}
systemTheme.addEventListener('change', () => { syncTheme(); renderNow(); });

const chapters = [
  { title: 'Einlassen', caption: 'Der Wasserweg', phase: 'fill', end: 'prewash' },
  { title: 'Vorspülen', caption: 'Lose Reste lösen', phase: 'prewash', end: 'main-fill' },
  { title: 'Reinigen', caption: 'Wärme & Chemie', phase: 'main-fill', end: 'rinse' },
  { title: 'Zwischenspülen', caption: 'Reiniger ausspülen', phase: 'rinse', end: 'final-rinse' },
  { title: 'Klarspülen', caption: 'Wärme speichern', phase: 'final-rinse', end: 'dry' },
  { title: 'Trocknen', caption: 'Feuchte abgeben', phase: 'dry', end: 'complete' },
  { title: 'Fertig', caption: 'Sauber & trocken', phase: 'complete', end: null },
].map(chapter => ({ ...chapter, start: PHASES.find(phase => phase.id === chapter.phase).start,
  endTime: chapter.end ? PHASES.find(phase => phase.id === chapter.end).start : Infinity }));

const componentDetails = {
  pump: { label: 'Umwälzpumpe', title: 'Eine Füllung, viele Runden', text: 'Die Umwälzpumpe saugt Wasser aus dem Sumpf durch das Sieb an. Sie erzeugt den Druck für die rotierenden Sprüharme. Das abtropfende Wasser sammelt sich unten und wird erneut verwendet.', view: 'filter' },
  drain: { label: 'Ablaufpumpe', title: 'Hier verlässt die Füllung das Gerät', text: 'Diese eigene Pumpe fördert verbrauchtes Wasser aus dem Sumpf in den Ablaufschlauch. Sie läuft bei den Wasserwechseln und am Ende der Trocknung für das Kondensat.', view: 'filter' },
  heater: { label: 'Heizung', title: 'Die Wärme kommt aus der Heizung', text: 'Eine elektrische Heizung erwärmt das umgewälzte Wasser. Die Wassertasche gewinnt zusätzlich Wärme zurück. Während der Kondensationstrocknung ist die Heizung aus; dann arbeitet die im Geschirr gespeicherte Restwärme.', view: 'filter' },
  pocket: { label: 'Wassertasche', title: 'Ein Wärmetauscher an der Seite', text: 'Frischwasser bleibt hier vom Spülwasser getrennt. Während der Hauptwäsche nimmt es Wärme aus dem Spülraum auf und wird später zum Zwischenspülen verwendet. Eine kalte neue Füllung kühlt anschließend die Wand für die Trocknung.', view: 'pocket' },
  spray: { label: 'Sprüharme', title: 'Wasserdruck macht die Drehung', text: 'Die Umwälzpumpe versorgt die Sprüharme. Schräg gerichtete Düsen treiben sie durch Rückstoß an. Die Strahlen treffen das Geschirr aus wechselnden Richtungen; das Wasser fällt zurück zum Sieb.', view: 'overview' },
  filter: { label: 'Sieb & Ablauf', title: 'Zwei Pumpen, zwei Aufgaben', text: 'Das Sieb hält grobe Speisereste zurück. Die Umwälzpumpe schickt gefiltertes Wasser wieder zu den Düsen; die separate Ablaufpumpe entfernt die gebrauchte Füllung. Grobe Reste im Sieb müssen nach dem Spülen von Hand entfernt werden.', view: 'filter' },
  detergent: { label: 'Reiniger', title: 'Die Klappe öffnet zur Hauptwäsche', text: 'Der Reiniger bleibt beim Vorspülen noch im Dosierfach. Erst in der Hauptwäsche öffnet die Klappe und der Tab löst sich auf. Klarspüler wird separat und in kleiner Menge im letzten Spülgang dosiert.', view: 'overview' },
  drying: { label: 'Kühle Seitenwand', title: 'Hier wird Dampf wieder zu Wasser', text: 'Das heiße Klarspülen erwärmt Teller und Tassen. Danach verdunstet der Wasserfilm mit der gespeicherten Wärme. An der kälteren Edelstahlwand kondensiert die Feuchtigkeit und läuft nach unten. Die animierten Nebelpunkte machen den eigentlich unsichtbaren Wasserdampf sichtbar.', view: 'drying' },
};

const insights = {
  fill: ['DER WASSERWEG', 'Kein Wasser bis zum Rand.', 'Nur unten steht eine kleine Menge Wasser. Die seitliche Tasche führt Frischwasser in den Pumpensumpf. Die Körbe bleiben oberhalb des Wasserspiegels.'],
  prewash: ['BEWEGUNG DURCH RÜCKSTOSS', 'Die Düsen drehen den Arm.', 'Die Pumpe setzt das Wasser unter Druck. Schräg gerichtete Düsen erzeugen den Rückstoß für die Drehung. Lose Speisereste lösen sich und landen im Sieb.'],
  'drain-prewash': ['WASSERWECHSEL', 'Schmutzwasser muss raus.', 'Jetzt arbeitet die Ablaufpumpe. Die Sprüharme stehen. Das Sieb hält grobe Reste zurück, während Schmutzwasser und feine Bestandteile in den Abfluss gelangen.'],
  'main-fill': ['EINE FRISCHE FÜLLUNG', 'Wenig Wasser, oft im Kreis.', 'Für die Hauptwäsche kommt frisches Wasser in die Maschine. Es wird gleich immer wieder umgewälzt. Die Reinigerklappe ist noch geschlossen.'],
  wash: ['WÄRME WEITER NUTZEN', 'Nebenan wird Wasser vorgewärmt.', 'Die Heizung erwärmt das Spülwasser auf 55 °C. Frischwasser in der Seitentasche nimmt Wärme durch die Wand auf und wartet auf den nächsten Spülgang. Die beiden Füllungen vermischen sich nicht.'],
  'drain-wash': ['NACH DER HAUPTWÄSCHE', 'Der Reiniger hat seine Arbeit getan.', 'Gelöster Schmutz und Reiniger gehen mit der Lauge zum Abfluss. Das schon vorgewärmte Frischwasser wartet getrennt davon in der Wassertasche.'],
  rinse: ['WÄRMETAUSCHER', 'Die gespeicherte Füllung kommt zum Einsatz.', 'Die Wassertasche entleert sich in den Spülraum. Ihr vorgewärmtes Frischwasser spült verbleibenden Reiniger ab und verringert den Temperatursprung am warmen Geschirr.'],
  'drain-rinse': ['NOCH EIN WASSERWECHSEL', 'Platz für den letzten Spülgang.', 'Die Ablaufpumpe entfernt das Zwischenspülwasser. Danach folgt eine neue Füllung zum heißen Klarspülen.'],
  'final-rinse': ['VORBEREITUNG ZUM TROCKNEN', 'Die Teller speichern Wärme.', 'Heißes Wasser erwärmt Keramik und Glas auf über 60 °C. Klarspüler senkt die Oberflächenspannung: Wasser läuft als dünner Film leichter ab. Diese Restwärme trocknet das Geschirr später.'],
  'drain-final': ['EINE KÜHLE SEITE', 'Kalt neben warm – mit Absicht.', 'Das heiße Spülwasser wird abgepumpt. Eine neue kalte Füllung in der Wassertasche kühlt die Seitenwand. Das Geschirr bleibt warm: Der Temperaturunterschied ist jetzt erwünscht.'],
  dry: ['SO FUNKTIONIERT DAS TROCKNEN', 'Warm verdunstet. Kalt kondensiert.', 'Der Wasserfilm verdunstet mit der Restwärme des Geschirrs. An der kühleren Seitenwand entstehen Tropfen, die nach unten laufen. Die Heizung und die Sprüharme bleiben dabei aus.'],
  complete: ['DER SPÜLGANG IST GESCHAFFT', 'Sauber, trocken – und noch warm.', 'Bei geöffneter Tür gibt das Geschirr seine Restwärme langsam an die Raumluft ab. Das Rot wird dabei dunkler. Grobe Speisereste bleiben im Sieb zurück und müssen von Hand entfernt werden.'],
};

const conciseTitles = { fill: 'Wasser einlassen', prewash: 'Erst einmal vorspülen.', 'drain-prewash': 'Schmutzwasser raus.', 'main-fill': 'Frisches Wasser.', wash: 'Jetzt wird’s sauber.', 'drain-wash': 'Lauge abpumpen.', rinse: 'Reiniger ausspülen.', 'drain-rinse': 'Wasser wechseln.', 'final-rinse': 'Heiß klarspülen.', 'drain-final': 'Die Wand wird kühl.', dry: 'Trocknen mit Restwärme.', complete: 'Sauber. Und trocken.' };
const symbols = { fill: '↓', prewash: '↻', 'drain-prewash': '↘', 'main-fill': '↓', wash: '✳', 'drain-wash': '↘', rinse: '↻', 'drain-rinse': '↘', 'final-rinse': '☼', 'drain-final': '↘', dry: '≋', complete: '✓' };
const formatTime = time => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;

for (const [index, chapter] of chapters.entries()) {
  const button = document.createElement('button');
  button.className = 'phase-step';
  button.innerHTML = `<span class="step-index">${String(index + 1).padStart(2, '0')}</span><span>${chapter.title}<small>${chapter.caption}</small></span>`;
  button.title = `Zu „${chapter.title}“ springen`;
  button.addEventListener('click', () => { cycle.seek(chapter.start); updateUI(); renderNow(); });
  $('phase-list').append(button);
}

for (const [id, detail] of Object.entries(componentDetails)) {
  const button = document.createElement('button');
  button.className = 'annotation';
  button.id = `annotation-${id}`;
  button.textContent = detail.label;
  button.setAttribute('aria-label', `${detail.label} erklären`);
  button.addEventListener('click', () => focusComponent(id));
  $('annotations').append(button);
}

function setView(view) {
  currentView = view;
  document.querySelector('.machine-stage').dataset.view = view;
  scene?.setView(view);
  document.querySelectorAll('button[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function focusComponent(id) {
  focusedComponent = id;
  const detail = componentDetails[id];
  $('component-title').textContent = detail.title;
  $('component-text').textContent = detail.text;
  $('component-info').hidden = false;
  document.querySelectorAll('.annotation').forEach(button => button.classList.toggle('active', button.id === `annotation-${id}`));
  setView(detail.view);
}

function updateUI() {
  const s = cycle.state;
  const ready = s.time === 0 && !cycle.playing;
  const chapterIndex = chapters.findIndex(chapter => s.time >= chapter.start && s.time < chapter.endTime);
  $('phase-number').textContent = ready ? 'BEREIT FÜR DEN SPÜLGANG' : `SCHRITT ${String(chapterIndex + 1).padStart(2, '0')} / 07 · ${s.phase.title.toUpperCase()}`;
  if (ready) $('phase-title').innerHTML = 'Dreck rein.<br>Wissen raus.';
  else $('phase-title').textContent = conciseTitles[s.phase.id];
  $('phase-symbol').textContent = symbols[s.phase.id];
  $('phase-description').textContent = ready ? 'Starte einen vollständigen Spülgang und verfolge, wie aus schmutzigen Tellern sauberes, trockenes Geschirr wird.' : s.phase.description;
  const temperature = s.drying || s.complete ? s.dishTemp : s.waterTemp;
  $('temperature-label').textContent = s.drying || s.complete ? 'Geschirr' : s.waterLevel < .01 ? 'Wasserzulauf' : 'Spülwasser';
  $('water-temp').innerHTML = `${Math.round(temperature)}<small> °C</small>`;
  $('clean-value').innerHTML = `${Math.round((1 - s.soil) * 100)}<small> %</small>`;
  $('wet-value').innerHTML = `${Math.round(s.wetness * 100)}<small> %</small>`;
  $('water-meter').style.width = `${Math.max(0, (temperature - 15) / 55) * 100}%`;
  $('annotation-pocket').textContent = s.pocketLevel > .02 ? `Wassertasche · ${Math.round(s.pocketTemp)} °C` : 'Wassertasche';
  $('annotation-drying').textContent = `Seitenwand · ${Math.round(s.wallTemp)} °C`;
  $('clean-meter').style.width = `${(1 - s.soil) * 100}%`;
  $('wet-meter').style.width = `${s.wetness * 100}%`;
  const waterKind = s.waterSoil > .2 ? 'Schmutzwasser' : s.detergent > .1 ? 'Lauge' : 'Klares Wasser';
  const hasWater = s.waterLevel > .01 && !s.complete;
  $('water-sample').style.backgroundColor = waterColor(s.waterTemp, s.detergent, s.waterSoil);
  $('water-sample').hidden = !hasWater;
  $('water-properties-text').textContent = hasWater ? `${waterKind} · ${Math.round(s.waterTemp)} °C` : s.complete ? 'Tür offen · Raumluft 20 °C' : ready ? 'Spülraum noch ohne Wasser' : 'Spülraum ohne Wasser';
  $('dish-temperature').textContent = `Geschirr ${Math.round(s.dishTemp)} °C`;
  $('water-used').textContent = `${s.waterUsed.toFixed(1).replace('.', ',')} l`;
  $('water-used').title = 'Bisher eingefülltes Frischwasser · illustrative Modellwerte';
  $('flow-icon').classList.toggle('running', cycle.playing);
  const flows = [];
  if (s.fill) flows.push(s.pocketFilling && !s.pocketRelease ? 'Wassertasche füllt' : 'Wasserzulauf');
  if (s.circulating) flows.push('Umwälzpumpe an');
  if (s.drain) flows.push('Ablaufpumpe an');
  if (s.drying && !s.drain) flows.push('Restwärme trocknet');
  if (s.pocketRelease && !s.fill) flows.push('Tasche entleert');
  $('flow-text').textContent = ready ? 'Bereit · Geschirr ist beladen' : s.complete ? (s.cooling ? 'Programm beendet · Geschirr kühlt ab' : 'Programm beendet · Abgekühlt') : `${!cycle.playing ? 'Pause · ' : ''}${flows.join(' · ') || 'Wasser im Spülraum'}`;
  const [kicker, title, explanation] = insights[s.phase.id];
  $('explain-kicker').textContent = kicker;
  $('explain-title').textContent = title;
  $('explain-text').textContent = explanation;
  $('thermal-comparison').hidden = !(s.drying || s.phase.id === 'drain-final');
  $('dish-temp').textContent = `${Math.round(s.dishTemp)} °C`;
  $('wall-temp').textContent = `${Math.round(s.wallTemp)} °C`;
  $('play-icon').textContent = cycle.playing ? 'Ⅱ' : s.complete ? '↻' : '▶';
  $('play-text').textContent = cycle.playing ? 'Pause' : s.complete ? 'Neuer Spülgang' : s.time > 0 ? 'Weiter spülen' : 'Spülgang starten';
  $('play').setAttribute('aria-label', cycle.playing ? 'Spülgang pausieren' : s.complete ? 'Neuen Spülgang starten' : s.time > 0 ? 'Spülgang fortsetzen' : 'Spülgang starten');
  $('elapsed').textContent = formatTime(s.time);
  $('timeline').value = s.time;
  $('timeline').style.setProperty('--progress', `${s.progress * 100}%`);
  $('timeline').setAttribute('aria-valuetext', `${s.phase.title}, ${Math.round(s.progress * 100)} Prozent, ${formatTime(s.time)} von ${formatTime(TOTAL_DURATION)}`);
  $('timeline-status').textContent = ready ? 'BELADEN & BEREIT' : `${s.phase.title.toUpperCase()}${!cycle.playing && !s.complete ? ' · PAUSIERT' : ''}`;
  $('timeline-percent').textContent = `${Math.round(s.progress * 100)} %`;
  [...$('phase-list').children].forEach((button, index) => {
    button.classList.toggle('active', index === chapterIndex);
    button.classList.toggle('done', index < chapterIndex);
    if (index === chapterIndex) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
}

function updateAnnotations() {
  if (!scene) return;
  const canvas = $('scene');
  $('annotations').hidden = !showLabels || !cutaway;
  if (!showLabels || !cutaway) return;
  const relevant = {
    overview: ['pocket', 'spray', 'filter', 'detergent'],
    pocket: ['pocket', 'drying'],
    filter: ['filter', 'pump', 'drain'],
    drying: ['pocket', 'drying'],
  }[currentView];
  const anchors = new Map(scene.getAnchors().map(anchor => [anchor.id, anchor]));
  for (const id of Object.keys(componentDetails)) {
    const button = $(`annotation-${id}`);
    const anchor = anchors.get(id);
    const visible = Boolean(anchor?.visible && relevant.includes(id));
    button.hidden = !visible;
    if (visible) {
      // Keep labels within the interactive viewport at narrow screen widths.
      const halfWidth = button.offsetWidth / 2 + 8;
      // Keep the dispenser itself unobstructed, including its visible tablet.
      const anchorX = anchor.x + (id === 'detergent' ? 72 : 0);
      button.style.left = `${Math.max(halfWidth, Math.min(canvas.clientWidth - halfWidth, anchorX))}px`;
      button.style.top = `${Math.max(currentView === 'overview' ? 175 : 82, Math.min(canvas.clientHeight - 108, anchor.y))}px`;
    }
  }
}

function renderNow() { scene?.update(cycle.state, 0); updateAnnotations(); }
function togglePlay() { cycle.playing ? cycle.pause() : cycle.play(); updateUI(); renderNow(); }
$('play').addEventListener('click', togglePlay);
$('reset').addEventListener('click', () => { cycle.reset(); updateUI(); renderNow(); });
$('timeline').max = TOTAL_DURATION;
$('timeline').addEventListener('input', event => { cycle.seek(Number(event.target.value)); updateUI(); renderNow(); });
$('speed').addEventListener('change', () => { lastTime = performance.now(); });
$('total').textContent = formatTime(TOTAL_DURATION);
$('cutaway').addEventListener('click', () => {
  cutaway = !cutaway;
  scene?.setCutaway(cutaway);
  $('cutaway').classList.toggle('active', cutaway);
  $('cutaway').setAttribute('aria-pressed', String(cutaway));
  $('cutaway').innerHTML = `<span aria-hidden="true">◫</span> ${cutaway ? 'Schnittansicht' : 'Gehäuse'} `;
  updateAnnotations();
});
$('labels').addEventListener('click', () => {
  showLabels = !showLabels;
  scene?.setLabels(showLabels);
  $('labels').classList.toggle('active', showLabels);
  $('labels').setAttribute('aria-pressed', String(showLabels));
  updateAnnotations();
});
document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('close-component').addEventListener('click', () => {
  focusedComponent = null;
  $('component-info').hidden = true;
  document.querySelectorAll('.annotation').forEach(button => button.classList.remove('active'));
});
$('about').addEventListener('click', () => $('about-dialog').showModal());
$('close-about').addEventListener('click', () => $('about-dialog').close());
$('about-done').addEventListener('click', () => $('about-dialog').close());
$('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) {
  const box = $('about-dialog').getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('about-dialog').close();
} });
window.addEventListener('keydown', event => {
  if ($('about-dialog').open || /^(INPUT|SELECT|BUTTON|A|TEXTAREA)$/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space' && scene) { event.preventDefault(); togglePlay(); }
  if (event.code === 'KeyR') { cycle.reset(); updateUI(); renderNow(); }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) setView(['overview', 'pocket', 'filter', 'drying'][Number(event.code.slice(-1)) - 1]);
});
window.addEventListener('resize', () => { scene?.resize(); updateAnnotations(); });
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); syncTheme(); });

// A small diagnostic surface, also useful for deterministic browser checks.
window.DISHSIM = Object.freeze({
  snapshot: () => ({ ...cycle.state, playing: cycle.playing, speed: Number($('speed').value), view: currentView, cutaway, labels: showLabels, focusedComponent, theme: themeName(), visuals: scene?.inspect() ?? null }),
  seek: time => { cycle.seek(time); updateUI(); renderNow(); return cycle.state; },
  play: () => { cycle.play(); updateUI(); },
  pause: () => { cycle.pause(); updateUI(); },
  reset: () => { cycle.reset(); updateUI(); renderNow(); },
});

updateUI();
try {
  const { DishwasherScene } = await import('./scene.js');
  scene = new DishwasherScene($('scene'));
  syncTheme();
  $('loader').hidden = true;
  $('play').disabled = false;
  renderNow();
  requestAnimationFrame(function frame(now) {
    const dt = document.hidden ? 0 : Math.min((now - lastTime) / 1000, .1);
    lastTime = now;
    // Keep the WebGL canvas aligned with CSS even if an embedded browser delays
    // the media-query change event while hidden or during a frame capture.
    syncTheme();
    // The selected speed compresses the programme; the open dishes cool in real time.
    cycle.advance(dt * Number($('speed').value), dt);
    // Camera easing continues while paused, simulation positions depend on time.
    scene.update(cycle.state, dt);
    updateAnnotations();
    uiElapsed += dt;
    if (uiElapsed > .12) { updateUI(); uiElapsed = 0; }
    requestAnimationFrame(frame);
  });
} catch (error) {
  console.error('DishLab konnte nicht gestartet werden:', error);
  $('loader').hidden = true;
  $('scene-error').hidden = false;
  $('scene-error').textContent = `Die 3D-Ansicht konnte nicht gestartet werden. Bitte nutze einen Browser mit aktiviertem WebGL und lade die Seite über „npm start“. Technische Meldung: ${error.message}`;
}
