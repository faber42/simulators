import * as T from '../pinsim/three.module.min.js';
import { Train, station, stationAt, point, trackX } from './route.mjs';
import { createMaterials } from './materials.js';
import { World } from './world.js';
import { CameraRenderer } from './render.js';
import { FrameDiagnostics } from './diagnostics.mjs';
import { FrameCadence } from './cadence.mjs';
import { Escalator } from './escalator.js';
import { RenderLoop } from './render-loop.mjs';

const $ = id => document.getElementById(id);
const loading = $('loading');

async function start() {
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
  const inspect = ['station', 'junction', 'access', 'seating'].includes(query.get('view'));
  let accessView = null;
  if (query.get('view') === 'junction') {
    const index = Math.max(0, Math.min(10000, Math.floor(Number(query.get('junction')) || 0)));
    train.next = index; train.s = station(index).start - 246 + T.MathUtils.clamp(Number(query.get('offset')) || 120, 0, 230);
    train.phase = 'running'; train.paused = query.get('play') !== '1';
  } else if (query.get('view') === 'seating') {
    const index = Math.max(0, Math.min(10000, Math.floor(Number(query.get('station')) || 0)));
    const st = station(index);
    train.next = index; train.s = st.start + 14; train.phase = 'running'; train.paused = true;
    accessView = { x: st.side * 3.9, eyeHeight: 2.05, target: point(st.start + 18, st.side * 6.72, 1.92) };
  } else if (query.get('view') === 'access') {
    const index = Math.max(0, Math.min(10000, Math.floor(Number(query.get('station')) || 0)));
    const st = station(index), escalator = query.get('kind') === 'escalator';
    accessView = { start: st.start + (escalator ? 78 : 36), x: st.side * (escalator ? 5.55 : 5.75) };
    const offset = Number(query.get('offset') ?? -2);
    train.next = index; train.s = accessView.start + T.MathUtils.clamp(Number.isFinite(offset) ? offset : -2, -8, 0);
    train.phase = 'running'; train.paused = true;
  } else if (inspect) {
    const index = Math.max(0, Math.min(10000, Number(query.get('station')) || 0));
    const st = station(Math.floor(index)); train.next = st.index;
    const offset = Number(query.get('offset') ?? 20);
    train.s = st.start + T.MathUtils.clamp(Number.isFinite(offset) ? offset : 20, -120, 110); train.phase = 'running'; train.paused = true;
  } else if (query.has('time')) {
    const seconds = T.MathUtils.clamp(Number(query.get('time')) || 0, 0, 1800);
    for (let i = 0; i < seconds * 60; i++) train.step(1 / 60);
    train.paused = query.get('paused') === '1';
  }
  if (inspect && query.has('time')) train.time = T.MathUtils.clamp(Number(query.get('time')) || 0, 0, 1800);
  const look = new T.Vector3();
  const diagnostics = new FrameDiagnostics(60000, 30, 2), cadence = new FrameCadence(30);
  const capturePose = () => ({ s: train.s, time: train.time, speed: train.speed, heave: train.ride.heave, pitch: train.ride.pitch, surge: train.ride.surge });
  let previousPose = capturePose();
  const displayedTrain = {};
  const phaseNames = { signal: 'SIGNALHALT', waiting: 'WARTEN AUF BLOCKFREIGABE', depart: 'AUSFAHRT', running: 'AUTOMATIKBETRIEB', settling: 'STATIONSHALT', opening: 'STATIONSHALT', open: 'FAHRGASTWECHSEL', closing: 'TÜREN SCHLIESSEN', dispatch: 'ABFAHRT VORBEREITET' };
  let exposure = 1.03, accumulator = 0, last = performance.now(), lastUI = -1, timeScale = T.MathUtils.clamp(Number(query.get('rate')) || 1, .25, 8), fps = 0, failure = false, ready = false, renderedFrames = 0;
  function resize() { output.resize(innerWidth, innerHeight); materials.distantLamp.uniforms.viewportHeight.value = output.height; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (ready) loop.invalidate(); }
  window.addEventListener('resize', resize); resize();
  $('diagnostics').hidden = query.get('diagnostics') !== '1';
  let perf = diagnostics.snapshot(performance.now());
  let lastWork = null;
  let lastDraw = performance.now();
  const loop = new RenderLoop(frame);
  function resetTiming() {
    last = lastDraw = performance.now(); lastUI = -1; accumulator = 0;
    previousPose = capturePose(); diagnostics.resetClock(); cadence.reset();
  }
  function setPaused(value) {
    train.paused = !!value; resetTiming(); syncDiagnostics(last); syncUI();
    if (ready) loop.setState(!train.paused, !document.hidden);
  }
  function syncDiagnostics(now) {
    perf = diagnostics.snapshot(now); fps = train.paused ? 0 : perf.fps;
    $('diag-fps').textContent = train.paused || perf.samples ? fps.toFixed(0) : '—';
    $('diag-below').textContent = perf.below30Percent.toFixed(1) + ' %';
    $('diag-detail').textContent = `${train.paused ? 'PAUSIERT · Rendering angehalten\n' : ''}Limit 30 FPS · Messfenster ${perf.observedSeconds.toFixed(1)} / 60 s\np95 ${perf.p95FrameMs.toFixed(1)} ms · Maximum ${perf.maxFrameMs.toFixed(1)} ms\n${output.sceneDrawCalls || 0} Drawcalls · ${world.chunks.size} Abschnitte`;
    $('diag-detail').style.whiteSpace = 'pre-line';
    if (!$('diagnostics').hidden) {
      const c = $('diag-chart').getContext('2d'), w = 288, h = 64;
      c.clearRect(0, 0, w, h); c.fillStyle = '#14242a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f0b47788'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, 32); c.lineTo(w, 32); c.stroke(); c.setLineDash([]);
      perf.history.forEach((value, i) => { if (value === null) return; const height = Math.min(62, value / 60 * 64); c.fillStyle = value < 29.5 ? '#e59c70' : '#8fc4a8'; c.fillRect(i * w / 60, h - height, w / 60 - 1, height); });
    }
  }
  function syncUI() {
    document.body.classList.toggle('paused', train.paused);
    const st = train.stop;
    $('destination').textContent = st.name;
    $('destination-label').textContent = train.doors || ['settling', 'dispatch'].includes(train.phase) ? 'AKTUELLER HALT' : 'NÄCHSTER HALT';
    $('phase').textContent = phaseNames[train.phase];
    $('speed').textContent = String(Math.round(train.speed * 3.6)).padStart(2, '0');
    $('doors').hidden = !train.doors;
    $('door-title').textContent = { opening: 'Türen werden geöffnet', open: 'Türen geöffnet', closing: 'Türen schließen' }[train.phase] || '';
    $('door-side').textContent = `Bahnsteig ${st.side < 0 ? 'links' : 'rechts'} · ${st.name}`;
    $('clock').textContent = new Date().toLocaleTimeString('de-DE');
    $('pause-indicator').hidden = !train.paused || inspect;
    $('view').dataset.diagnostics = JSON.stringify({ ...train.snapshot(), ...world.stats(), fps: Math.round(fps), below30Percent: perf.below30Percent, observedSeconds: perf.observedSeconds, p95FrameMs: perf.p95FrameMs, maxFrameMs: perf.maxFrameMs, drawCalls: output.sceneDrawCalls, geometries: output.renderer.info.memory.geometries, textures: output.renderer.info.memory.textures, slowFrames: perf.slowFrames });
  }
  function draw(dt = 0, interpolate = false) {
    if (!interpolate) previousPose = capturePose();
    const alpha = interpolate && !train.paused ? accumulator * 60 : 1;
    Object.assign(displayedTrain, train, { s: T.MathUtils.lerp(previousPose.s, train.s, alpha), time: T.MathUtils.lerp(previousPose.time, train.time, alpha), speed: T.MathUtils.lerp(previousPose.speed, train.speed, alpha) });
    const pose = displayedTrain;
    world.update(pose);
    const heave = T.MathUtils.lerp(previousPose.heave, train.ride.heave, alpha);
    const pitch = T.MathUtils.lerp(previousPose.pitch, train.ride.pitch, alpha);
    const surge = T.MathUtils.lerp(previousPose.surge, train.ride.surge, alpha);
    const speedFactor = pose.speed / 16.7;
    camera.position.set(trackX(pose.s + surge) - trackX(pose.s) + Math.sin(pose.time * 14.2) * .001 * speedFactor,
      2.22 + heave + Math.sin(pose.time * 10.1) * .0015 * speedFactor, -surge);
    const p = point(pose.s + surge + 13, 0, 2.18 + heave);
    look.set(p[0] - trackX(pose.s), p[1], p[2] + pose.s); camera.lookAt(look); camera.rotateX(pitch);
    if (accessView) {
      const eye = point(pose.s, accessView.x, accessView.eyeHeight ?? 2.6), target = accessView.target ?? point(accessView.start + 13, accessView.x, 6.05);
      camera.position.set(eye[0] - trackX(pose.s), eye[1], eye[2] + pose.s);
      look.set(target[0] - trackX(pose.s), target[1], target[2] + pose.s); camera.lookAt(look);
    }
    if (query.get('view') === 'mirror') {
      camera.copy(world.mirror.camera); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      world.mirror.rig.traverse(object => object.layers.set(2));
    }
    const headPoint = point(pose.s + 33, 0, .65); headlights.target.position.set(headPoint[0] - trackX(pose.s), .65, -33);
    const st = stationAt(pose.s + 8);
    const targetExposure = st ? .89 : 1.14;
    if (!ready) { exposure = targetExposure; ambient.intensity = st ? .48 : .3; }
    else {
      exposure += (targetExposure - exposure) * (1 - Math.exp(-dt * .65));
      ambient.intensity += ((st ? .48 : .3) - ambient.intensity) * (1 - Math.exp(-dt * .8));
    }
    output.render(scene, camera, pose.time, exposure, world.mirror);
    $('view').dataset.renderedFrames = String(++renderedFrames);
  }
  function fail(error) {
    failure = true; loop.setState(false, false); loading.style.display = 'flex'; loading.classList.add('error');
    loading.textContent = `Die Frontkamera konnte nicht gestartet werden: ${error.message}. Bitte einen Browser mit WebGL 2 verwenden.`; console.error(error);
  }
  $('view').addEventListener('webglcontextlost', event => { event.preventDefault(); train.paused = true; fail(new Error('Die Grafikverbindung wurde unterbrochen. Seite zum Neuverbinden laden')); });
  function frame(timestamp, redraw) {
    if (failure) return;
    try {
      // RAF's presentation timestamp keeps the limiter phase stable even when
      // callback delivery has a little CPU scheduling jitter.
      const now = timestamp, dt = Math.max(0, Math.min((now - last) / 1000, .1)); last = now;
      if (!document.hidden && !train.paused) {
        accumulator += dt * timeScale;
        while (accumulator >= 1 / 60) { previousPose = capturePose(); train.step(1 / 60); accumulator -= 1 / 60; }
      }
      if (redraw) cadence.reset();
      if (document.hidden || !cadence.take(now)) return;
      if (!train.paused) diagnostics.frame(performance.now(), lastWork);
      draw(train.paused ? 0 : Math.min((now - lastDraw) / 1000, .1), !train.paused); lastDraw = now;
      lastWork = { distance: train.s, buildMs: world.buildMs, updateMs: world.updateMs, renderMs: output.renderMs };
      if (train.paused || redraw || now - lastUI > 250) { syncDiagnostics(performance.now()); syncUI(); lastUI = now; }
    } catch (error) { fail(error); }
  }
  document.addEventListener('visibilitychange', () => {
    resetTiming(); if (!ready) return;
    loop.setState(!train.paused, !document.hidden);
    if (!document.hidden) loop.invalidate();
  });
  $('diag-close').addEventListener('click', () => { $('diagnostics').hidden = true; });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === 'Space' && event.target.tagName === 'BUTTON') return;
    if (event.code === 'Space' || event.code === 'KeyP') { event.preventDefault(); setPaused(!train.paused); }
    if (event.key.toLowerCase() === 'h') document.body.classList.toggle('clean');
    if (event.key.toLowerCase() === 'd') { $('diagnostics').hidden = !$('diagnostics').hidden; syncDiagnostics(performance.now()); }
    if (event.key.toLowerCase() === 'f') {
      const action = document.fullscreenElement ? document.exitFullscreen() : $('feed').requestFullscreen();
      action?.catch(() => {});
    }
  });
  // Deterministic inspection hooks, deliberately outside the camera UI.
  window.METROSIM = {
    snapshot: () => ({ ...train.snapshot(), ...world.stats(), fps: Math.round(fps), geometries: output.renderer.info.memory.geometries, textures: output.renderer.info.memory.textures }),
    pause: (value = true) => setPaused(value),
    setSpeed: value => { if (Number.isFinite(value)) timeScale = T.MathUtils.clamp(value, .25, 8); },
    advance: seconds => { if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1800) throw new RangeError('0–1800 Sekunden erwartet'); const paused = train.paused; train.paused = false; for (let i = 0; i < Math.round(seconds * 60); i++) train.step(1 / 60); train.paused = paused; draw(1); syncUI(); return train.snapshot(); },
    inspectStation: (index = 0, offset = 20) => { if (!Number.isInteger(index) || index < 0 || index > 10000 || !Number.isFinite(offset)) throw new RangeError('Ungültiger Stationsindex'); const st = station(index); train.next = index; train.s = st.start + T.MathUtils.clamp(offset, -120, 110); train.speed = 0; train.phase = 'running'; train.timer = 0; setPaused(true); draw(5); syncUI(); return train.snapshot(); },
    restart: () => { Object.assign(train, new Train()); setPaused(false); draw(5); syncUI(); },
  };
  // Compile the skinned crowd variant during the loading screen, so the first
  // approaching station does not stall the visible camera for shader creation.
  world.update(train);
  const warmup = world.crowd.create(() => .4).person;
  warmup.position.set(1000, 0, 0); scene.add(warmup);
  const treadWarmup = new Escalator(0, 1, 0, materials.escalatorSteps).mesh;
  treadWarmup.position.set(1000, 0, 0); scene.add(treadWarmup);
  camera.layers.enable(1); // Warm the own-train bodies and instanced door shaders, too.
  await output.renderer.compileAsync(scene, camera);
  camera.layers.disable(1);
  draw(0);
  output.renderer.getContext().finish(); // One startup sync, never in the frame loop.
  scene.remove(warmup); warmup.traverse(o => { if (o.isSkinnedMesh) { o.geometry.dispose(); o.skeleton.dispose(); } });
  scene.remove(treadWarmup); treadWarmup.geometry.dispose(); treadWarmup.dispose();
  ready = true; resetTiming(); syncDiagnostics(last); syncUI(); loading.style.display = 'none'; loop.setState(!train.paused, !document.hidden);
}
start().catch(error => {
  loading.classList.add('error'); loading.textContent = `Die Frontkamera konnte nicht gestartet werden: ${error.message}`; console.error(error);
});
