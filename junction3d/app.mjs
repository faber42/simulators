import config from './locations/dortmund.mjs';
import { TrafficSimulation } from './engine.mjs';
import { createScene } from './scene.mjs';

const $ = id => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const storageKey = `junction3d-cameras-${config.id}`;
let toastTimeout;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 3500); }

try { start(); } catch (error) {
  console.error(error);
  $('loading').classList.add('error');
  $('loading').querySelector('strong').textContent = 'Die 3D-Ansicht konnte nicht starten.';
  $('loading').querySelector('small').textContent = `${error.message} · Bitte einen Browser mit aktiviertem WebGL verwenden.`;
}

function start() {
  document.title = `${config.name} · Kreuzung in 3D`;
  const title = document.querySelector('h1'); title.firstChild.textContent = config.name;
  title.querySelector('span').textContent = ` ${config.city || config.subtitle.split(' · ')[0]}`;
  document.querySelector('.coordinates').firstChild.textContent = `${config.coordinates.latitude.toFixed(5)}° N   ${config.coordinates.longitude.toFixed(5)}° E`;
  document.querySelector('.coordinates span').textContent = config.subtitle;
  document.querySelector('.road-badge').textContent = config.ui?.roadBadge || '3D';
  document.querySelector('.phase-explainer').textContent = config.ui?.phaseExplainer || 'Die Freigaben folgen dem konfigurierten Umlauf.';
  document.querySelector('.location-note > p').textContent = config.description;
  document.querySelector('.location-note a').href = config.source.url;
  document.querySelector('.keyboard-hint').firstChild.textContent = `1–${Math.min(9, config.cameras.length)} Kamera`;
  const simulation = new TrafficSimulation(config);
  simulation.setDensity(Number($('density').value) / 100);
  const view = createScene($('scene'), config);
  const { THREE, camera } = view;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false, speed = 1, evening = false, activeCamera = 'overview', free = true;
  let desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  const orbit = { theta: .67, phi: .85, distance: 310, target: new THREE.Vector3() };
  let customCameras = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) customCameras = stored.filter(c => c && typeof c.id === 'string' && c.id.startsWith('custom-') && typeof c.label === 'string' && [c.position, c.target].every(v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 1000)) && Number.isFinite(c.fov) && c.fov >= 25 && c.fov <= 85).slice(0, 8);
  } catch { /* Browser privacy settings may disable local storage. */ }
  const cameras = () => [...config.cameras, ...customCameras];
  function persistCameras() { try { localStorage.setItem(storageKey, JSON.stringify(customCameras)); } catch { toast('Kamera für diese Sitzung gespeichert. Browserspeicher ist nicht verfügbar.'); } view.setMounts(cameras()); }
  function syncOrbit() {
    orbit.target.copy(desiredTarget);
    const offset = desiredPosition.clone().sub(desiredTarget);
    orbit.distance = offset.length(); orbit.theta = Math.atan2(offset.x, offset.z); orbit.phi = Math.acos(clamp(offset.y / orbit.distance, -1, 1));
  }
  function orbitPosition() { desiredPosition.set(orbit.distance * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.distance * Math.cos(orbit.phi), orbit.distance * Math.sin(orbit.phi) * Math.cos(orbit.theta)).add(orbit.target); desiredTarget.copy(orbit.target); }
  function refreshCameraButtons() {
    $('camera-list').replaceChildren();
    cameras().forEach((preset, index) => {
      const wrap = document.createElement('div'); wrap.style.position = 'relative';
      const button = document.createElement('button'); button.className = 'camera-button'; button.dataset.camera = preset.id; button.setAttribute('aria-pressed', String(preset.id === activeCamera));
      const number = document.createElement('span'); number.textContent = `CAM ${String(index + 1).padStart(2, '0')} ${preset.id.startsWith('custom-') ? '· EIGENE' : ''}`;
      const label = document.createElement('strong'); label.textContent = preset.label;
      button.append(number, label); button.addEventListener('click', () => selectCamera(preset.id)); wrap.append(button);
      if (preset.id.startsWith('custom-')) {
        const remove = document.createElement('button'); remove.className = 'camera-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', `${preset.label} entfernen`);
        remove.addEventListener('click', () => { customCameras = customCameras.filter(c => c.id !== preset.id); persistCameras(); if (activeCamera === preset.id) selectCamera('overview'); refreshCameraButtons(); toast('Eigene Kamera entfernt.'); }); wrap.append(remove);
      }
      $('camera-list').append(wrap);
    });
  }
  function selectCamera(id, immediate = true) {
    const preset = cameras().find(c => c.id === id); if (!preset) return;
    if (placing) cancelPlacement(false);
    activeCamera = id; free = id === 'overview';
    desiredPosition.fromArray(preset.position); desiredTarget.fromArray(preset.target);
    camera.fov = preset.fov; camera.updateProjectionMatrix(); syncOrbit();
    if (immediate || reducedMotion) { camera.position.copy(desiredPosition); lookTarget.copy(desiredTarget); camera.lookAt(lookTarget); }
    $('camera-index').textContent = `CAM ${String(cameras().indexOf(preset) + 1).padStart(2, '0')}`;
    $('camera-label').textContent = preset.label; $('camera-description').textContent = preset.description || 'Eigene Verkehrskamera';
    $('free-camera').setAttribute('aria-pressed', String(free));
    $('view-hint').textContent = free ? 'Ziehen zum Drehen · Scrollen zum Zoomen' : 'Feste Verkehrskamera · Scrollen zum Zoomen';
    document.querySelectorAll('[data-camera]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.camera === id)));
  }
  let placing = false, placementStep = 0, draftCamera = null, placementReturn = 'overview';
  refreshCameraButtons(); selectCamera('overview', true); view.setMounts(cameras());
  const phaseElements = config.phases.map((phase, index) => {
    const li = document.createElement('li');
    const num = document.createElement('span'); num.className = 'number'; num.textContent = String(index + 1).padStart(2, '0');
    const texts = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
    const split = phase.label.split(' · '); title.textContent = split[0]; detail.textContent = split.slice(1).join(' · ');
    const dot = document.createElement('span'); dot.className = 'signal-dot'; texts.append(title, detail); li.append(num, texts, dot); $('phase-list').append(li); return li;
  });
  const signalIndicators = (config.ui?.signalIndicators || []).map(indicator => {
    const row = document.createElement('div'); row.className = 'signal-indicator'; row.dataset.signalGroup = indicator.group;
    const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = indicator.label;
    const state = document.createElement('strong'); row.append(dot, label, state); $('signal-monitor').append(row);
    return { ...indicator, row, state };
  });
  $('signal-monitor').hidden = signalIndicators.length === 0;
  $('median-status').hidden = signalIndicators.length === 0;
  function updateStatus() {
    const status = simulation.getStatus();
    const phase = config.phases[status.phaseIndex];
    phaseElements.forEach((li, i) => { li.className = i === status.phaseIndex ? `active ${status.stage}` : ''; li.setAttribute('aria-current', i === status.phaseIndex ? 'step' : 'false'); });
    const labels = { green: 'Grünphase', yellow: 'Gelb · Einfahrt schließen', drain: 'Nachlauf · Mittelampel grün', drainYellow: 'Mittelampel · Gelb', clearance: 'Alle rot · Kreuzung räumen', redAmber: 'Rot-Gelb · Freigabe folgt' };
    $('stage-label').textContent = labels[status.stage]; $('remaining').textContent = status.stage === 'drain' || (status.stage === 'clearance' && status.remaining <= .05) ? 'räumt …' : `${Math.ceil(status.remaining)} s`;
    const duration = status.stage === 'green' ? phase.duration : ['yellow', 'drainYellow'].includes(status.stage) ? config.timing.yellow : status.stage === 'redAmber' ? config.timing.redAmber : config.timing.allRed;
    $('phase-progress-bar').style.width = status.stage === 'drain' ? '100%' : `${clamp(1 - status.remaining / duration, 0, 1) * 100}%`;
    $('phase-progress-bar').style.background = ['green', 'drain'].includes(status.stage) ? '#74a168' : status.stage === 'clearance' ? '#bd715b' : '#d3a653';
    const pending = status.stage === 'green' ? Object.entries(phase.groupDelays || {}).filter(([, delay]) => delay > simulation.stageElapsed) : [];
    $('release-note').textContent = pending.length ? `${phase.drainGroups?.length ? 'Mitte räumt zuerst. Äußere Ampel' : 'Geradeaus fährt zuerst. Linksabbieger'} in ${Math.ceil(Math.min(...pending.map(([, delay]) => delay - simulation.stageElapsed)))} s grün.` : status.stage === 'drain' || (status.stage === 'yellow' && phase.drainGroups?.length) ? 'Die Mittelampel bleibt für bereits eingefahrene Fahrzeuge grün.' : phase.uiNote || '';
    for (const indicator of signalIndicators) {
      const state = simulation.getSignal(indicator.group);
      const names = { red: 'Rot', green: 'Grün', yellow: 'Gelb', redAmber: 'Rot-Gelb' };
      indicator.row.dataset.state = state; indicator.state.textContent = names[state];
      indicator.row.setAttribute('aria-label', `${indicator.label}: ${names[state]}`);
    }
    $('median-count').textContent = status.stagedWaiting ?? simulation.vehicles.filter(v => v.speed < .5 && v.route.stops?.some((stop, i) => i > 0 && v.distance > v.route.stops[i - 1].distance && v.distance < stop.distance)).length;
    $('cycle-label').textContent = `UMLAUF ${String(status.cycle).padStart(2, '0')}`;
    $('active-count').textContent = status.active; $('waiting-count').textContent = status.waiting; $('passed-count').textContent = status.passed;
    const time = Math.floor(status.elapsed); $('simulation-clock').textContent = [Math.floor(time / 3600), Math.floor(time / 60) % 60, time % 60].map(n => String(n).padStart(2, '0')).join(':');
    $('next-phase').disabled = status.stage !== 'green';
  }
  function togglePause() { paused = !paused; $('pause').textContent = paused ? '▶ Fortsetzen' : 'Ⅱ Pause'; $('pause').setAttribute('aria-pressed', String(paused)); }
  $('pause').addEventListener('click', togglePause);
  $('reset').addEventListener('click', () => { simulation.reset(); updateStatus(); view.update(simulation); toast('Verkehr und Ampelumlauf zurückgesetzt.'); });
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => { speed = Number(button.dataset.speed); document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }));
  $('density').addEventListener('input', () => { const value = Number($('density').value); simulation.setDensity(value / 100); $('density-value').textContent = value === 0 ? 'Keine Zufahrt' : value < 60 ? 'Ruhig' : value < 120 ? 'Normal' : 'Berufsverkehr'; });
  $('next-phase').addEventListener('click', () => { simulation.requestNextPhase(); updateStatus(); });
  $('daylight').addEventListener('click', () => { evening = !evening; view.setEvening(evening); document.body.classList.toggle('evening', evening); $('daylight').textContent = evening ? '☀ Tageslicht' : '◐ Abendlicht'; $('daylight').setAttribute('aria-pressed', String(evening)); });
  $('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('Vollbild ist in diesem Browser nicht verfügbar.'); } });
  $('free-camera').addEventListener('click', () => {
    if (placing) cancelPlacement(false);
    if (free) { selectCamera(activeCamera); if (activeCamera === 'overview') toast('Übersicht auf die Ausgangsposition zurückgesetzt.'); return; }
    free = true; syncOrbit(); orbit.distance = Math.max(30, orbit.distance); orbit.phi = Math.min(orbit.phi, 1.48); orbitPosition();
    $('free-camera').setAttribute('aria-pressed', 'true'); $('camera-index').textContent = 'FREIE KAMERA'; $('view-hint').textContent = 'Ziehen zum Drehen · Scrollen zum Zoomen';
  });
  let drag = null;
  $('scene').addEventListener('pointerdown', event => { if (!free || event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, id: event.pointerId }; $('scene').setPointerCapture(event.pointerId); });
  $('scene').addEventListener('pointermove', event => { if (!drag) return; orbit.theta -= (event.clientX - drag.x) * .006; orbit.phi = clamp(orbit.phi - (event.clientY - drag.y) * .005, .08, 1.48); drag.x = event.clientX; drag.y = event.clientY; orbitPosition(); });
  const releaseDrag = () => { drag = null; };
  $('scene').addEventListener('pointerup', releaseDrag); $('scene').addEventListener('pointercancel', releaseDrag); $('scene').addEventListener('lostpointercapture', releaseDrag);
  $('scene').addEventListener('wheel', event => { event.preventDefault(); if (free) { orbit.distance = clamp(orbit.distance * Math.exp(event.deltaY * .001), 25, 520); orbitPosition(); } else { camera.fov = clamp(camera.fov + event.deltaY * .025, 25, 85); camera.updateProjectionMatrix(); } }, { passive: false });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && placing) { cancelPlacement(); return; }
    if (event.target.matches('input,textarea,select,[contenteditable=true]')) return;
    if (event.code === 'Space' && !event.target.matches('button')) { event.preventDefault(); togglePause(); }
    if (/^[1-9]$/.test(event.key)) selectCamera(config.cameras[Number(event.key) - 1]?.id);
  });

  function cancelPlacement(restore = true) {
    placing = false; placementStep = 0; draftCamera = null;
    $('camera-editor').hidden = true; $('map-hint').hidden = true; $('place-camera').textContent = '+ Kamera';
    if (restore) selectCamera(placementReturn);
  }
  $('place-camera').addEventListener('click', () => {
    if (placing) { cancelPlacement(); return; }
    if (customCameras.length >= 8) { toast('Acht eigene Kameras sind gespeichert. Mit × eine Kamera entfernen.'); return; }
    placementReturn = activeCamera; placing = true; placementStep = 0; draftCamera = null;
    $('camera-editor').hidden = false; $('map-hint').hidden = false; $('map-hint').textContent = '1 / 2 · Standort im Lageplan wählen'; $('place-camera').textContent = 'Abbrechen'; $('save-camera').disabled = true;
    $('camera-help').textContent = 'Im Lageplan erst den Standort, dann das Blickziel wählen.';
    $('minimap').focus();
  });
  $('cancel-camera').addEventListener('click', () => cancelPlacement());
  const map = $('minimap'), ctx = map.getContext('2d');
  const mapScale = 1.02, mapX = x => 220 + x * mapScale, mapZ = z => 148 + z * mapScale;
  function placeAt(x, z) {
    if (!placing) return;
    if (placementStep === 0) {
      draftCamera = { id: `custom-${Date.now()}`, label: `Eigene Kamera ${customCameras.length + 1}`, description: 'Selbst platzierte Verkehrskamera', position: [x, Number($('camera-height').value), z], target: [0, 1.2, 0], fov: Number($('camera-fov').value) };
      placementStep = 1; $('map-hint').textContent = '2 / 2 · Blickziel im Lageplan wählen';
    } else {
      if (Math.hypot(x - draftCamera.position[0], z - draftCamera.position[2]) < 4) { toast('Das Blickziel bitte etwas weiter vom Standort entfernt wählen.'); return; }
      draftCamera.target = [x, 1.2, z]; placementStep = 2; $('save-camera').disabled = false; $('map-hint').textContent = 'Blick prüfen · Höhe und Winkel rechts einstellen'; $('camera-help').textContent = 'Ein weiterer Klick verändert das Blickziel. Anschließend speichern.'; previewDraft();
    }
  }
  map.addEventListener('click', event => { const rect = map.getBoundingClientRect(); placeAt(((event.clientX - rect.left) / rect.width * 440 - 220) / mapScale, ((event.clientY - rect.top) / rect.height * 300 - 148) / mapScale); });
  let mapCursor = [0, 0];
  map.addEventListener('keydown', event => {
    if (!placing) return;
    const offsets = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
    if (offsets[event.key]) { event.preventDefault(); mapCursor = [clamp(mapCursor[0] + offsets[event.key][0], -200, 200), clamp(mapCursor[1] + offsets[event.key][1], -135, 140)]; }
    if (event.key === 'Enter') { event.preventDefault(); placeAt(...mapCursor); }
  });
  function previewDraft() {
    if (!draftCamera || placementStep < 2) return;
    free = false; desiredPosition.fromArray(draftCamera.position); desiredTarget.fromArray(draftCamera.target); camera.fov = draftCamera.fov; camera.updateProjectionMatrix();
    $('camera-index').textContent = 'KAMERA-VORSCHAU'; $('camera-label').textContent = draftCamera.label; $('camera-description').textContent = 'Standort und Blickrichtung aus dem Lageplan';
    $('free-camera').setAttribute('aria-pressed', 'false'); $('view-hint').textContent = 'Montagehöhe und Blickwinkel rechts einstellen';
  }
  $('camera-height').addEventListener('input', () => { const value = Number($('camera-height').value); $('height-value').textContent = `${value} m`; if (draftCamera) { draftCamera.position[1] = value; previewDraft(); } });
  $('camera-fov').addEventListener('input', () => { const value = Number($('camera-fov').value); $('fov-value').textContent = `${value}°`; if (draftCamera) { draftCamera.fov = value; previewDraft(); } });
  $('save-camera').addEventListener('click', () => { if (!draftCamera || placementStep !== 2) return; const saved = draftCamera; customCameras.push(saved); persistCameras(); cancelPlacement(false); refreshCameraButtons(); selectCamera(saved.id); toast('Kamera gespeichert. Sie erscheint unten bei den Perspektiven.'); });
  function drawMap() {
    ctx.clearRect(0, 0, 440, 300); ctx.fillStyle = '#e5ebdc'; ctx.fillRect(0, 0, 440, 300);
    ctx.fillStyle = '#c9d3bd';
    for (const building of config.environment?.buildings || []) { ctx.fillRect(mapX(building.x - building.width / 2), mapZ(building.z - building.depth / 2), building.width * mapScale, building.depth * mapScale); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const road of view.roads) {
      ctx.strokeStyle = '#b3bdb0'; ctx.lineWidth = (road.width + 3) * mapScale; ctx.beginPath();
      road.path.samples.forEach((p, i) => { if (i === 0) ctx.moveTo(mapX(p.x), mapZ(p.z)); else ctx.lineTo(mapX(p.x), mapZ(p.z)); }); ctx.stroke();
    }
    const rails = config.environment?.rails;
    if (rails) { ctx.strokeStyle = '#7d9476'; ctx.lineWidth = 1; for (const z of rails.tracks) { ctx.beginPath(); ctx.moveTo(mapX(rails.from), mapZ(z)); ctx.lineTo(mapX(rails.to), mapZ(z)); ctx.stroke(); } }
    for (const v of simulation.vehicles) { ctx.save(); ctx.translate(mapX(v.x), mapZ(v.z)); ctx.rotate(-v.heading); ctx.fillStyle = v.speed < .5 ? '#aa6b42' : '#3e6451'; ctx.fillRect(-1.3, -2.5, 2.6, 5); ctx.restore(); }
    const shownStops = new Set();
    for (const route of simulation.routes) for (const [index, stop] of (route.stops || [{ id: route.id, point: route.stopLine, group: route.group }]).entries()) {
      if (shownStops.has(stop.id)) continue; shownStops.add(stop.id);
      const state = simulation.getSignal(stop.group);
      ctx.fillStyle = state === 'green' ? '#4caa62' : state === 'yellow' || state === 'redAmber' ? '#e0af45' : '#bf6658';
      ctx.beginPath(); ctx.arc(mapX(stop.point[0]), mapZ(stop.point[1]), index > 0 ? 3.3 : 2.5, 0, Math.PI * 2); ctx.fill();
      if (index > 0) { ctx.strokeStyle = '#f5f8ed'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    const position = draftCamera && placementStep > 0 ? new THREE.Vector3(...draftCamera.position) : camera.position;
    const target = draftCamera && placementStep > 0 ? new THREE.Vector3(...draftCamera.target) : lookTarget;
    const angle = Math.atan2(target.z - position.z, target.x - position.x), radius = 46;
    ctx.fillStyle = '#44816f26'; ctx.beginPath(); ctx.moveTo(mapX(position.x), mapZ(position.z)); ctx.arc(mapX(position.x), mapZ(position.z), radius, angle - .42, angle + .42); ctx.closePath(); ctx.fill();
    cameras().forEach(c => { if (c.id === 'overview') return; ctx.beginPath(); ctx.arc(mapX(c.position[0]), mapZ(c.position[2]), 4, 0, Math.PI * 2); ctx.fillStyle = c.id === activeCamera ? '#244a3e' : '#8da085'; ctx.fill(); ctx.strokeStyle = '#f4f7ed'; ctx.lineWidth = 1.5; ctx.stroke(); });
    ctx.fillStyle = '#264f40'; ctx.beginPath(); ctx.arc(mapX(position.x), mapZ(position.z), 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#eff8df'; ctx.lineWidth = 2; ctx.stroke();
    if (placing) { ctx.strokeStyle = '#294c3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mapX(mapCursor[0]) - 6, mapZ(mapCursor[1])); ctx.lineTo(mapX(mapCursor[0]) + 6, mapZ(mapCursor[1])); ctx.moveTo(mapX(mapCursor[0]), mapZ(mapCursor[1]) - 6); ctx.lineTo(mapX(mapCursor[0]), mapZ(mapCursor[1]) + 6); ctx.stroke(); }
    ctx.fillStyle = '#4f6958'; ctx.font = 'bold 12px Segoe UI'; ctx.fillText('N ↑', 17, 24);
  }
  const resizeObserver = new ResizeObserver(() => view.resize()); resizeObserver.observe($('scene')); view.resize();
  view.update(simulation); updateStatus(); drawMap(); view.render(); $('loading').hidden = true;
  let previous = performance.now(), hudElapsed = 0;
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, .1); previous = now;
    if (!paused && !document.hidden) simulation.update(dt * speed);
    view.update(simulation);
    const easing = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    camera.position.lerp(desiredPosition, easing); lookTarget.lerp(desiredTarget, easing); camera.lookAt(lookTarget);
    hudElapsed += dt; if (hudElapsed > .15) { updateStatus(); drawMap(); hudElapsed = 0; }
    // Rotate north indicator to match the current camera's map heading.
    const northAngle = -Math.atan2(camera.position.x - lookTarget.x, camera.position.z - lookTarget.z);
    document.querySelector('.north-marker svg').style.transform = `rotate(${northAngle}rad)`;
    view.render(); requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { previous = performance.now(); });
  requestAnimationFrame(frame);
}
