import * as T from '../pinsim/three.module.min.js';
import { Train, station, stationAt, point, trackX } from './route.mjs';
import { createMaterials } from './materials.js';
import { World } from './world.js';
import { CameraRenderer } from './render.js';

const $ = id => document.getElementById(id);
const loading = $('loading');

try {
  const output = new CameraRenderer($('view'));
  const scene = new T.Scene(); scene.background = new T.Color('#030607');
  scene.fog = new T.FogExp2('#050909', .016);
  const camera = new T.PerspectiveCamera(57, 1, .06, 225);
  const ambient = new T.HemisphereLight('#b8cace', '#484236', .52); scene.add(ambient);
  const headlights = new T.SpotLight('#e8e6d8', 95, 88, .62, .9, 1.55);
  headlights.position.set(0, 1.15, -.3); scene.add(headlights); scene.add(headlights.target);
  const materials = createMaterials();
  const world = new World(scene, materials), train = new Train();
  const query = new URLSearchParams(location.search);
  const inspect = query.get('view') === 'station';
  if (inspect) {
    const index = Math.max(0, Math.min(10000, Number(query.get('station')) || 0));
    const st = station(Math.floor(index)); train.next = st.index;
    const offset = Number(query.get('offset') ?? 20);
    train.s = st.start + T.MathUtils.clamp(Number.isFinite(offset) ? offset : 20, -120, 110); train.phase = 'running'; train.paused = true;
  } else if (query.has('time')) {
    const seconds = T.MathUtils.clamp(Number(query.get('time')) || 0, 0, 1800);
    for (let i = 0; i < seconds * 60; i++) train.step(1 / 60);
    train.paused = query.get('paused') === '1';
  }
  const look = new T.Vector3();
  const phaseNames = { signal: 'SIGNALHALT', depart: 'FAHRT FREIGEGEBEN', running: 'AUTOMATIKBETRIEB', opening: 'STATIONSHALT', open: 'FAHRGASTWECHSEL', closing: 'TÜREN SCHLIESSEN', dispatch: 'ABFAHRT VORBEREITET' };
  let exposure = 1.03, accumulator = 0, last = performance.now(), lastUI = -1, timeScale = T.MathUtils.clamp(Number(query.get('rate')) || 1, .25, 8), frameCount = 0, fpsTime = last, fps = 0, failure = false;
  function resize() { output.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  function syncUI() {
    const st = train.stop;
    $('destination').textContent = st.name;
    $('destination-label').textContent = train.doors || train.phase === 'dispatch' ? 'AKTUELLER HALT' : 'NÄCHSTER HALT';
    $('phase').textContent = phaseNames[train.phase];
    $('speed').textContent = String(Math.round(train.speed * 3.6)).padStart(2, '0');
    $('doors').hidden = !train.doors;
    $('door-title').textContent = { opening: 'Türen werden geöffnet', open: 'Türen geöffnet', closing: 'Türen schließen' }[train.phase] || '';
    $('door-side').textContent = `Bahnsteig ${st.side < 0 ? 'links' : 'rechts'} · ${st.name}`;
    $('clock').textContent = new Date().toLocaleTimeString('de-DE');
    $('pause-indicator').hidden = !train.paused || inspect;
    $('view').dataset.diagnostics = JSON.stringify({ ...train.snapshot(), ...world.stats(), fps: Math.round(fps), geometries: output.renderer.info.memory.geometries, textures: output.renderer.info.memory.textures });
  }
  function draw(dt = 0) {
    world.update(train);
    const speedFactor = train.speed / 16.7;
    camera.position.set(Math.sin(train.time * 14.2) * .0025 * speedFactor, 2.22 + Math.sin(train.time * 10.1) * .004 * speedFactor, 0);
    const p = point(train.s + 13, 0, 2.18);
    look.set(p[0] - trackX(train.s), p[1], p[2] + train.s); camera.lookAt(look);
    camera.rotateZ(Math.sin(train.time * 1.4) * .0008 * speedFactor);
    const headPoint = point(train.s + 33, 0, .65); headlights.target.position.set(headPoint[0] - trackX(train.s), .65, -33);
    const st = stationAt(train.s + 8);
    const targetExposure = st ? .89 : 1.14;
    exposure += (targetExposure - exposure) * (1 - Math.exp(-dt * .65));
    ambient.intensity += ((st ? .48 : .3) - ambient.intensity) * (1 - Math.exp(-Math.max(.016, dt) * .8));
    output.render(scene, camera, train.time, exposure);
  }
  function fail(error) {
    failure = true; loading.style.display = 'flex'; loading.classList.add('error');
    loading.textContent = `Die Frontkamera konnte nicht gestartet werden: ${error.message}. Bitte einen Browser mit WebGL 2 verwenden.`; console.error(error);
  }
  $('view').addEventListener('webglcontextlost', event => { event.preventDefault(); train.paused = true; fail(new Error('Die Grafikverbindung wurde unterbrochen. Seite zum Neuverbinden laden')); });
  function frame(now) {
    if (failure) return;
    try {
      const dt = Math.min((now - last) / 1000, .1); last = now;
      if (!document.hidden && !train.paused) {
        accumulator += dt * timeScale;
        while (accumulator >= 1 / 60) { train.step(1 / 60); accumulator -= 1 / 60; }
      }
      draw(dt);
      if (now - lastUI > 100) { syncUI(); lastUI = now; }
      frameCount++;
      if (now - fpsTime >= 1000) { fps = frameCount * 1000 / (now - fpsTime); frameCount = 0; fpsTime = now; }
      requestAnimationFrame(frame);
    } catch (error) { fail(error); }
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); accumulator = 0; });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); train.paused = !train.paused; syncUI(); }
    if (event.key.toLowerCase() === 'h') document.body.classList.toggle('clean');
    if (event.key.toLowerCase() === 'f') {
      const action = document.fullscreenElement ? document.exitFullscreen() : $('feed').requestFullscreen();
      action?.catch(() => {});
    }
  });
  // Deterministic inspection hooks, deliberately outside the camera UI.
  window.METROSIM = {
    snapshot: () => ({ ...train.snapshot(), ...world.stats(), fps: Math.round(fps), geometries: output.renderer.info.memory.geometries, textures: output.renderer.info.memory.textures }),
    pause: (value = true) => { train.paused = !!value; accumulator = 0; syncUI(); },
    setSpeed: value => { if (Number.isFinite(value)) timeScale = T.MathUtils.clamp(value, .25, 8); },
    advance: seconds => { if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1800) throw new RangeError('0–1800 Sekunden erwartet'); const paused = train.paused; train.paused = false; for (let i = 0; i < Math.round(seconds * 60); i++) train.step(1 / 60); train.paused = paused; draw(1); syncUI(); return train.snapshot(); },
    inspectStation: (index = 0, offset = 20) => { if (!Number.isInteger(index) || index < 0 || index > 10000 || !Number.isFinite(offset)) throw new RangeError('Ungültiger Stationsindex'); const st = station(index); train.next = index; train.s = st.start + T.MathUtils.clamp(offset, -120, 110); train.speed = 0; train.phase = 'running'; train.timer = 0; train.paused = true; draw(5); syncUI(); return train.snapshot(); },
    restart: () => { Object.assign(train, new Train()); accumulator = 0; draw(5); syncUI(); },
  };
  draw(0); syncUI(); loading.style.display = 'none'; requestAnimationFrame(frame);
} catch (error) {
  loading.classList.add('error'); loading.textContent = `Die Frontkamera konnte nicht gestartet werden: ${error.message}`; console.error(error);
}
