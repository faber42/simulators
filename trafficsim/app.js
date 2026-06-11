'use strict';

/* =========================================================
   Kreuzungssimulation
   – große Kreuzung zweier vierspuriger Straßen
   – breiter Mittelstreifen, zentrale Insel
   – Linksabbieger mit vorgezogener Haltelinie + eigener
     Ampel im Inneren ("vier zusammengeschaltete Anlagen")
   – Fußgängerfurten mit Mittelinsel, in zwei Etappen
   ========================================================= */

/* ---------- Geometrie ---------- */
const LANE = 26;                    // Spurbreite
const MED  = 60;                    // halber Mittelstreifen
const INNER = MED + LANE * 0.5;     // 73  Linksabbiegespur (Mittellinie)
const OUTER = MED + LANE * 1.5;     // 99  Geradeaus-/Rechtsabbiegespur
const EDGE  = MED + LANE * 2;       // 112 Fahrbahnrand
const CW_NEAR = 124, CW_FAR = 140;  // Fußgängerfurt (Band)
const STOP_D = 148;                 // Haltelinie
const WORLD = 520;                  // halbe Weltgröße (Canvas 1040)

const CAR_LEN = 24, CAR_W = 12;
const VMAX = 88, ACC = 60, BRK = 130, LATA = 80;
const MAX_CARS = 150, MAX_PEDS = 40;

const DIRS = ['N', 'E', 'S', 'W'];

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* Drehung um k*90° (Bildschirmkoordinaten, y nach unten) */
function rot(k, x, y) {
  k = ((k % 4) + 4) % 4;
  for (let i = 0; i < k; i++) { const t = x; x = -y; y = t; }
  return [x, y];
}

/* ---------- Routen (Catmull-Rom, gleichmäßig abgetastet) ---------- */
function makeRoute(waypts, k, turn) {
  const raw = [];
  const P = [waypts[0], ...waypts, waypts[waypts.length - 1]];
  for (let i = 0; i + 3 < P.length; i++) {
    const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(4, Math.ceil(seg / 3));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const w0 = -0.5 * t3 + t2 - 0.5 * t;
      const w1 =  1.5 * t3 - 2.5 * t2 + 1;
      const w2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const w3 =  0.5 * t3 - 0.5 * t2;
      raw.push([p0[0] * w0 + p1[0] * w1 + p2[0] * w2 + p3[0] * w3,
                p0[1] * w0 + p1[1] * w1 + p2[1] * w2 + p3[1] * w3]);
    }
  }
  raw.push([...waypts[waypts.length - 1]]);

  const ST = 2;
  const xs = [raw[0][0]], ys = [raw[0][1]];
  let carry = 0, px = raw[0][0], py = raw[0][1];
  for (let i = 1; i < raw.length; i++) {
    const qx = raw[i][0], qy = raw[i][1];
    let d = Math.hypot(qx - px, qy - py);
    if (d === 0) continue;
    while (carry + d >= ST) {
      const r = (ST - carry) / d;
      px += (qx - px) * r; py += (qy - py) * r;
      xs.push(px); ys.push(py);
      d = Math.hypot(qx - px, qy - py);
      carry = 0;
      if (d === 0) break;
    }
    carry += d; px = qx; py = qy;
  }

  const n = xs.length;
  const hs = new Float32Array(n), mv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    hs[i] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
  }
  let blinkEnd = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    let dh = hs[b] - hs[a];
    while (dh >  Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const kappa = Math.abs(dh) / ((b - a) * ST);
    mv[i] = kappa > 1e-4 ? Math.max(15, Math.sqrt(LATA / kappa)) : VMAX;
    if (kappa > 0.004) blinkEnd = i * ST + 20;
  }

  return {
    k, turn, xs, ys, hs, mv, step: ST, len: (n - 1) * ST,
    stops: [], blinkEnd,
    at(s) {
      s = Math.max(0, Math.min(this.len, s));
      const i = Math.min(n - 1, Math.round(s / ST));
      return [xs[i], ys[i], hs[i]];
    },
    maxV(s) {
      const i = Math.max(0, Math.min(n - 1, Math.round(s / ST)));
      return mv[i];
    },
    findS(x, y) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < n; i += 2) {
        const dx = xs[i] - x, dy = ys[i] - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = i; }
      }
      return bi * ST;
    }
  };
}

function mkStop(route, k, x, y, group, kind) {
  const [wx, wy] = rot(k, x, y);
  return { s: route.findS(wx, wy), group, kind };
}

const routes = [], byK = [];
for (let k = 0; k < 4; k++) {
  const dir = DIRS[k];
  const M = pts => pts.map(([x, y]) => rot(k, x, y));

  // Geradeaus (äußere Spur)
  const rS = makeRoute(M([
    [-OUTER, -WORLD - 60], [-OUTER, -300], [-OUTER, 0], [-OUTER, 300], [-OUTER, WORLD + 60]
  ]), k, 'S');
  rS.stops = [mkStop(rS, k, -OUTER, -STOP_D, dir + '_T', 'main')];

  // Rechtsabbieger (äußere Spur)
  const rR = makeRoute(M([
    [-OUTER, -WORLD - 60], [-OUTER, -220], [-OUTER, -128], [-105, -105],
    [-128, -OUTER], [-220, -OUTER], [-WORLD - 60, -OUTER]
  ]), k, 'R');
  rR.stops = [mkStop(rR, k, -OUTER, -STOP_D, dir + '_T', 'main')];

  // Linksabbieger (innere Spur, mit vorgezogener Haltelinie im Inneren)
  const rL = makeRoute(M([
    [-INNER, -WORLD - 60], [-INNER, -240], [-INNER, -120], [-INNER, -60],
    [-52, 2], [-6, 34], [46, 49], [92, 60], [128, 72], [230, INNER], [WORLD + 60, INNER]
  ]), k, 'L');
  rL.stops = [
    mkStop(rL, k, -INNER, -STOP_D, dir + '_LE', 'entry'),
    mkStop(rL, k, 46, 49, dir + '_LC', 'cross')
  ];

  routes.push(rS, rR, rL);
  byK.push({ S: rS, R: rR, L: rL });
}

/* ---------- Signalanlage ---------- */
const VG = [], PG = [];
DIRS.forEach(d => { VG.push(d + '_T', d + '_LE', d + '_LC'); PG.push(d + '_in', d + '_out'); });
const sig = {}, psig = {};

const STEPS = [
  { d: 13,  v: { N_T:'g', S_T:'g', N_LE:'g', S_LE:'g' },              p: ['E_in','W_in'],                   label: 'Nord–Süd: Geradeaus, Abbieger einfahren' },
  { d: 3,   v: { N_T:'y', S_T:'y', N_LE:'g', S_LE:'g' },              p: ['E_in','W_in'],                   label: 'Nord–Süd: Gelb' },
  { d: 2,   v: { N_LE:'g', S_LE:'g', N_LC:'ry', S_LC:'ry' },          p: ['E_in','W_in'],                   label: 'Räumzeit' },
  { d: 8,   v: { N_LE:'g', S_LE:'g', N_LC:'g', S_LC:'g' },            p: ['E_in','W_in','N_out','S_out'],   label: 'Nord–Süd: Linksabbieger kreuzen' },
  { d: 3,   v: { N_LE:'y', S_LE:'y', N_LC:'y', S_LC:'y' },            p: [],                                label: 'Nord–Süd: Gelb (Abbieger)' },
  { d: 1.2, v: {},                                                    p: [],                                label: 'Räumzeit (alles Rot)' },
  { d: 1,   v: { E_T:'ry', W_T:'ry', E_LE:'ry', W_LE:'ry' },          p: ['N_in','S_in'],                   label: 'Ost–West: Rot-Gelb' },
  { d: 13,  v: { E_T:'g', W_T:'g', E_LE:'g', W_LE:'g' },              p: ['N_in','S_in'],                   label: 'Ost–West: Geradeaus, Abbieger einfahren' },
  { d: 3,   v: { E_T:'y', W_T:'y', E_LE:'g', W_LE:'g' },              p: ['N_in','S_in'],                   label: 'Ost–West: Gelb' },
  { d: 2,   v: { E_LE:'g', W_LE:'g', E_LC:'ry', W_LC:'ry' },          p: ['N_in','S_in'],                   label: 'Räumzeit' },
  { d: 8,   v: { E_LE:'g', W_LE:'g', E_LC:'g', W_LC:'g' },            p: ['N_in','S_in','E_out','W_out'],   label: 'Ost–West: Linksabbieger kreuzen' },
  { d: 3,   v: { E_LE:'y', W_LE:'y', E_LC:'y', W_LC:'y' },            p: [],                                label: 'Ost–West: Gelb (Abbieger)' },
  { d: 1.2, v: {},                                                    p: [],                                label: 'Räumzeit (alles Rot)' },
  { d: 1,   v: { N_T:'ry', S_T:'ry', N_LE:'ry', S_LE:'ry' },          p: [],                                label: 'Nord–Süd: Rot-Gelb' },
];

let stepIdx = 0, stepT = 0;
let allRed = false, paused = false, tempo = 1;

function updateSignals(dt) {
  if (allRed) return;
  stepT += dt;
  while (stepT >= STEPS[stepIdx].d) {
    stepT -= STEPS[stepIdx].d;
    stepIdx = (stepIdx + 1) % STEPS.length;
  }
}

function applySignals() {
  for (const g of VG) sig[g] = 'r';
  for (const g of PG) psig[g] = 'red';
  if (allRed) return;
  const st = STEPS[stepIdx];
  for (const g in st.v) sig[g] = st.v[g];
  for (const g of st.p) psig[g] = 'walk';
}
applySignals();

/* ---------- Fahrzeuge ---------- */
const COLORS = ['#d94f4f', '#4f7bd9', '#e3e6ea', '#2e333b', '#d9b44f',
                '#5fae6b', '#a96bc4', '#8a8f98', '#c97b3d', '#5bb8c4'];
let cars = [];
const spawnT = [1, 2, 3, 4];

function expRand(mean) {
  return Math.max(0.15, -Math.log(1 - Math.random()) * mean);
}

function spawnMean() {
  const d = +ui.density.value / 100;
  return 11 * Math.pow(0.085, d);   // 11 s (leer) … ~0,9 s (dicht) je Zufahrt
}

function trySpawn(k) {
  if (cars.length >= MAX_CARS) return;
  const r = Math.random();
  const t = r < 0.26 ? 'L' : r < 0.5 ? 'R' : 'S';
  const route = byK[k][t];
  const lanes = t === 'L' ? [byK[k].L] : [byK[k].S, byK[k].R];
  for (const c of cars) {
    if (lanes.includes(c.route) && c.s < CAR_LEN * 2.6) return;
  }
  cars.push({
    route, s: CAR_LEN, v: VMAX * 0.7, len: CAR_LEN, w: CAR_W,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    blink: t === 'L' ? 'L' : t === 'R' ? 'R' : null,
    braking: false, dead: false
  });
}

function updateCar(c, dt) {
  const route = c.route;
  let limit = Infinity;            // freie Strecke vor der Front

  // Haltelinien / Ampeln
  for (const st of route.stops) {
    const d = st.s - c.s;
    if (d < -4) continue;
    const col = sig[st.group];
    let stop = (col === 'r' || col === 'ry');
    if (col === 'y') stop = (c.v * c.v / (2 * BRK)) < d - 2;
    if (!stop && st.kind === 'entry') {
      // Pförtner: nur 1 Wartender zwischen Einfahrt und innerer Haltelinie,
      // damit das Kreuzungsinnere für die anderen Abbiegeströme frei bleibt
      const intS = route.stops[1].s;
      let nWait = 0;
      for (const o of cars) {
        if (o.route === route && o !== c && o.s > st.s + 4 && o.s < intS + CAR_LEN) nWait++;
      }
      if (nWait >= 1) stop = true;
    }
    if (stop) limit = Math.min(limit, d);
  }

  // Vordermann auf gleicher Route
  for (const o of cars) {
    if (o === c || o.route !== route) continue;
    if (o.s > c.s) limit = Math.min(limit, o.s - o.len - c.s - 6);
  }

  // Fahrzeuge auf fremden Routen (geteilte, zusammenführende, kreuzende Spuren).
  // Gleichgerichtete und (fast) stehende Fahrzeuge blockieren immer;
  // einfahrende Linksabbieger weichen zusätzlich allem aus (Vorrangregel,
  // dadurch kein gegenseitiges Blockieren mit den kreuzenden Abbiegern).
  const entryRegion = route.turn === 'L' &&
    c.s > route.stops[0].s - 10 && c.s < route.stops[1].s;
  const lookMax = Math.min(90, 30 + c.v * 0.7);
  for (let d = 10; d <= lookMax; d += 7) {
    const [pxx, pyy, ph] = route.at(c.s + d);
    for (const o of cars) {
      if (o === c || o.route === route) continue;
      const [ox, oy, oh] = o.route.at(o.s - o.len / 2);
      const dx = ox - pxx, dy = oy - pyy;
      if (dx * dx + dy * dy < 169 &&
          (Math.cos(ph - oh) > 0.15 || o.v < 8 || entryRegion)) {
        limit = Math.min(limit, d - CAR_LEN / 2 - 8);
      }
    }
  }

  // Kurven-Tempolimit
  let vt = route.maxV(c.s);
  for (let d = 8; d <= 40; d += 8) vt = Math.min(vt, route.maxV(c.s + d));

  let target = vt;
  if (limit < Infinity) {
    target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRK * 0.85 * Math.max(0, limit))));
  }
  const prevV = c.v;
  if (target < c.v) c.v = Math.max(target, c.v - BRK * dt);
  else              c.v = Math.min(target, c.v + ACC * dt);
  if (limit < 1 && c.v < 3) c.v = 0;
  c.braking = (c.v < prevV - 1e-4) || (c.v < 1 && limit < 60);

  c.s += c.v * dt;
  if (c.s > route.len - 4) c.dead = true;
}

/* ---------- Fußgänger ---------- */
let peds = [], pedT = 2;
const PED_COLORS = ['#ffd9a0', '#a0c8ff', '#ffb3c8', '#c8ffb3', '#e8e8e8', '#caa0ff'];

function spawnPed() {
  if (peds.length >= MAX_PEDS) return;
  const k = (Math.random() * 4) | 0;
  const side = Math.random() < 0.5 ? 1 : -1;
  peds.push({
    k, u: 126 * side, dir: -side,
    off: (Math.random() - 0.5) * 12,
    speed: 20 + Math.random() * 10,
    color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0],
    wait: false, dead: false
  });
}

function pedGates(p) {
  const D = DIRS[p.k];
  return p.dir > 0
    ? [{ at: -118, g: D + '_in'  }, { at:  50, g: D + '_out' }]
    : [{ at:  118, g: D + '_out' }, { at: -50, g: D + '_in'  }];
}

function updatePed(p, dt) {
  p.wait = false;
  let nu = p.u + p.dir * p.speed * dt;
  for (const g of pedGates(p)) {
    const crossing = p.dir > 0 ? (p.u <= g.at && nu > g.at) : (p.u >= g.at && nu < g.at);
    if (crossing && psig[g.g] !== 'walk') { nu = g.at; p.wait = true; }
  }
  p.u = nu;
  if (Math.abs(p.u) > 127) p.dead = true;
}

/* ---------- Zeichnen ---------- */
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* statische Elemente eines Arms (lokales Koordinatensystem = Nord-Arm) */
function drawArmStatic() {
  // Randlinien (durchgezogen)
  ctx.strokeStyle = 'rgba(238,242,246,0.85)';
  ctx.lineWidth = 2;
  for (const x of [-EDGE + 2, -MED - 2, MED + 2, EDGE - 2]) {
    ctx.beginPath();
    ctx.moveTo(x, -WORLD - 20);
    ctx.lineTo(x, -118);
    ctx.stroke();
  }
  // Spurtrennung (gestrichelt)
  ctx.setLineDash([14, 12]);
  for (const x of [-(MED + LANE), MED + LANE]) {
    ctx.beginPath();
    ctx.moveTo(x, -WORLD - 20);
    ctx.lineTo(x, -154);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Haltelinie
  ctx.strokeStyle = '#eef2f6';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-EDGE + 4, -STOP_D);
  ctx.lineTo(-MED - 4, -STOP_D);
  ctx.stroke();

  // Zebrastreifen
  ctx.fillStyle = 'rgba(235,238,240,0.8)';
  for (let x = -EDGE + 8; x <= EDGE - 16; x += 16) {
    ctx.fillRect(x, -CW_FAR + 2, 9, CW_FAR - CW_NEAR - 4);
  }

  // Mittelstreifen (lang) mit Grünfläche
  ctx.fillStyle = '#79838c';
  roundRect(-54, -WORLD - 20, 108, WORLD + 20 - (CW_FAR + 3), 10);
  ctx.fill();
  ctx.fillStyle = '#56814b';
  roundRect(-48, -WORLD - 14, 96, WORLD + 14 - (CW_FAR + 10), 8);
  ctx.fill();
  // Inselnase zwischen Furt und Kreuzung
  ctx.fillStyle = '#79838c';
  roundRect(-54, -CW_NEAR + 3, 108, CW_NEAR - 3 - (EDGE + 2), 6);
  ctx.fill();

  // Fahrbahnpfeile
  drawArrow(-INNER, -176, 'L');
  drawArrow(-OUTER, -176, 'SR');
}

function drawArrow(x, y, type) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(240,244,248,0.9)';
  ctx.fillStyle = 'rgba(240,244,248,0.9)';
  ctx.lineWidth = 3;
  // Schaft (Fahrtrichtung = +y)
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(0, 6);
  ctx.stroke();
  if (type === 'L') {
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(8, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 1);
    ctx.lineTo(15, 6);
    ctx.lineTo(8, 11);
    ctx.closePath();
    ctx.fill();
  } else {
    // geradeaus
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.lineTo(0, 13);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    // rechts-Zweig
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-8, -6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, -11);
    ctx.lineTo(-15, -6);
    ctx.lineTo(-8, -1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* gestrichelte Führungslinien der Linksabbieger + innere Haltelinien */
function drawGuides() {
  ctx.save();
  ctx.strokeStyle = 'rgba(240,244,248,0.22)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 9]);
  for (let k = 0; k < 4; k++) {
    const L = byK[k].L;
    const s0 = L.stops[0].s + 6;
    const [mx, my] = rot(k, 132, 72);
    const s1 = L.findS(mx, my);
    ctx.beginPath();
    let first = true;
    for (let s = s0; s <= s1; s += 8) {
      const [x, y] = L.at(s);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // innere Haltelinien (quer zur Fahrtrichtung)
  ctx.strokeStyle = '#eef2f6';
  ctx.lineWidth = 4;
  for (let k = 0; k < 4; k++) {
    const L = byK[k].L;
    const st = L.stops[1];
    const [x, y, h] = L.at(st.s);
    const pxv = Math.cos(h + Math.PI / 2), pyv = Math.sin(h + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(x + pxv * 13, y + pyv * 13);
    ctx.lineTo(x - pxv * 13, y - pyv * 13);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCentralIsland() {
  ctx.fillStyle = '#79838c';
  circle(0, 0, 28);
  ctx.fillStyle = '#56814b';
  circle(0, 0, 21);
  ctx.strokeStyle = 'rgba(238,242,246,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.stroke();
}

/* Ampelkasten */
function drawTL(x, y, state, opts = {}) {
  const w = opts.small ? 12 : 14, h = opts.small ? 30 : 34;
  ctx.save();
  ctx.translate(x, y);
  // Mast-Sockel
  ctx.fillStyle = '#14171b';
  circle(0, h / 2 + 3, 2.5);
  ctx.fillStyle = '#1c2025';
  roundRect(-w / 2, -h / 2, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  const lampR = w * 0.28;
  const lamps = [
    { cy: -h / 2 + h * 0.18, on: state === 'r' || state === 'ry', col: '#ff4040', dim: '#481416' },
    { cy: 0,                 on: state === 'y' || state === 'ry', col: '#ffc832', dim: '#46390f' },
    { cy:  h / 2 - h * 0.18, on: state === 'g',                   col: '#3dff6e', dim: '#0f3a1b' },
  ];
  for (const l of lamps) {
    ctx.fillStyle = l.on ? l.col : l.dim;
    if (l.on) { ctx.shadowColor = l.col; ctx.shadowBlur = 9; }
    circle(0, l.cy, lampR);
    ctx.shadowBlur = 0;
  }
  if (opts.arrow) {
    // kleines Linksabbieger-Symbol über dem Kasten
    ctx.fillStyle = '#dfe5ec';
    ctx.beginPath();
    ctx.moveTo(5, -h / 2 - 5);
    ctx.lineTo(-2, -h / 2 - 5);
    ctx.lineTo(-2, -h / 2 - 9);
    ctx.lineTo(-8, -h / 2 - 3.5);
    ctx.lineTo(-2, -h / 2 + 2);
    ctx.lineTo(-2, -h / 2 - 2);
    ctx.lineTo(5, -h / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPedLamp(x, y, state) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1c2025';
  roundRect(-5, -9, 10, 18, 2.5);
  ctx.fill();
  ctx.fillStyle = state === 'walk' ? '#3a1212' : '#ff4040';
  if (state !== 'walk') { ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 6; }
  circle(0, -4, 2.8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = state === 'walk' ? '#3dff6e' : '#123a1b';
  if (state === 'walk') { ctx.shadowColor = '#3dff6e'; ctx.shadowBlur = 6; }
  circle(0, 4, 2.8);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawArmSignals(k) {
  const d = DIRS[k];
  drawTL(-EDGE - 14, -STOP_D - 4, sig[d + '_T']);
  drawTL(-46, -STOP_D - 4, sig[d + '_LE'], { arrow: true });
  drawTL(46, 12, sig[d + '_LC'], { arrow: true, small: true });
  drawPedLamp(-118, -152, psig[d + '_in']);
  drawPedLamp(118, -152, psig[d + '_out']);
}

function drawCar(c, t) {
  const [x, y, h] = c.route.at(c.s - c.len / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(h);
  // Karosserie
  ctx.fillStyle = c.color;
  roundRect(-c.len / 2, -c.w / 2, c.len, c.w, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Scheiben
  ctx.fillStyle = 'rgba(22,28,38,0.85)';
  ctx.fillRect(c.len / 2 - 9, -c.w / 2 + 2, 3.5, c.w - 4);
  ctx.fillRect(-c.len / 2 + 4, -c.w / 2 + 2, 2.5, c.w - 4);
  // Bremslichter
  if (c.braking) {
    ctx.fillStyle = '#ff2222';
    ctx.shadowColor = '#ff2222';
    ctx.shadowBlur = 5;
    ctx.fillRect(-c.len / 2 - 0.5, -c.w / 2 + 1, 2, 2.5);
    ctx.fillRect(-c.len / 2 - 0.5, c.w / 2 - 3.5, 2, 2.5);
    ctx.shadowBlur = 0;
  }
  // Blinker
  if (c.blink && c.s < c.route.blinkEnd && Math.floor(t * 2.4) % 2 === 0) {
    const side = c.blink === 'L' ? -1 : 1;
    ctx.fillStyle = '#ffb52e';
    ctx.shadowColor = '#ffb52e';
    ctx.shadowBlur = 7;
    circle(c.len / 2 - 2, side * c.w / 2, 2.4);
    circle(-c.len / 2 + 2, side * c.w / 2, 2.4);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawPed(p) {
  const [x, y] = rot(p.k, p.u, -132 + p.off);
  ctx.fillStyle = p.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCompass() {
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', -EDGE - 30, -498);
  ctx.fillText('O', 498, -EDGE - 30);
  ctx.fillText('S', EDGE + 30, 498);
  ctx.fillText('W', -498, EDGE + 30);
}

function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#48714a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(1, 0, 0, 1, cv.width / 2, cv.height / 2);

  // Fahrbahnen
  ctx.fillStyle = '#3a4045';
  ctx.fillRect(-EDGE, -WORLD - 20, EDGE * 2, (WORLD + 20) * 2);
  ctx.fillRect(-WORLD - 20, -EDGE, (WORLD + 20) * 2, EDGE * 2);

  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate(k * Math.PI / 2);
    drawArmStatic();
    ctx.restore();
  }

  drawGuides();
  drawCentralIsland();

  for (const c of cars) drawCar(c, t);
  for (const p of peds) drawPed(p);

  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate(k * Math.PI / 2);
    drawArmSignals(k);
    ctx.restore();
  }

  drawCompass();
}

/* ---------- UI ---------- */
const ui = {
  density:  document.getElementById('density'),
  densVal:  document.getElementById('densVal'),
  tempo:    document.getElementById('tempo'),
  tempoVal: document.getElementById('tempoVal'),
  btnRed:   document.getElementById('btnRed'),
  btnPause: document.getElementById('btnPause'),
  phase:    document.getElementById('phase'),
  phaseT:   document.getElementById('phaseT'),
  nCars:    document.getElementById('nCars'),
  nPeds:    document.getElementById('nPeds'),
};

ui.density.addEventListener('input', () => {
  ui.densVal.textContent = ui.density.value + ' %';
});
ui.tempo.addEventListener('input', () => {
  ui.tempoVal.textContent = ui.tempo.value + ' %';
  tempo = +ui.tempo.value / 100;
});
ui.btnRed.addEventListener('click', () => {
  allRed = !allRed;
  ui.btnRed.classList.toggle('active', allRed);
  ui.btnRed.textContent = allRed ? '🟢 Normalbetrieb' : '🔴 Alle Ampeln rot';
});
ui.btnPause.addEventListener('click', () => {
  paused = !paused;
  ui.btnPause.classList.toggle('active', paused);
  ui.btnPause.textContent = paused ? '▶ Weiter' : '⏸ Pause';
});

function updateHud() {
  if (allRed) {
    ui.phase.textContent = 'Alle Ampeln Rot';
    ui.phaseT.textContent = '–';
  } else {
    ui.phase.textContent = STEPS[stepIdx].label;
    ui.phaseT.textContent = Math.ceil((STEPS[stepIdx].d - stepT) / tempo) + ' s';
  }
  ui.nCars.textContent = cars.length;
  ui.nPeds.textContent = peds.length;
}

/* ---------- Hauptschleife ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    updateSignals(dt * tempo);
    applySignals();
    for (let k = 0; k < 4; k++) {
      spawnT[k] -= dt;
      if (spawnT[k] <= 0) { trySpawn(k); spawnT[k] = expRand(spawnMean()); }
    }
    pedT -= dt;
    if (pedT <= 0) { spawnPed(); pedT = expRand(3.2); }
    for (const c of cars) updateCar(c, dt);
    cars = cars.filter(c => !c.dead);
    for (const p of peds) updatePed(p, dt);
    peds = peds.filter(p => !p.dead);
  }
  draw(now / 1000);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
