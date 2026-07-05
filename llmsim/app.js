'use strict';

/* =============================================================
   Transformer-Simulator – wie ein Sprachmodell schreibt
   – Wörter (Token) stehen unten, jede Spalte wandert nach oben
     durch Embedding, +Position und drei Transformer-Ebenen
   – keine Mathematik: Bedeutung wird als Symbol gezeichnet,
     Attention als Bögen, Feed-Forward als Wissens-Ringe
   – nur die letzte Spalte wählt oben das nächste Wort
   – KV-Cache: erst rechnet jede Runde alles neu, nach ein paar
     Wörtern werden die alten Spalten eingefroren
   – reine Simulation mit festem Drehbuch, kein echtes Modell
   ============================================================= */

/* ---------- Farbwelt ---------- */
const C = {
  bg:     '#1a1d23',
  lane:   'rgba(255,255,255,0.028)',
  text:   '#e8eaed',
  dim:    '#9aa0a6',
  faint:  '#5c636e',
  embed:  '#e7c46a',   // gelb   – Embedding
  pos:    '#e09b52',   // orange – Position
  att:    '#e0699e',   // rosa   – Attention
  ffn:    '#a678e2',   // violett– Feed-Forward / Wissen
  sel:    '#7bc47f',   // grün   – Wortauswahl
  ice:    '#6fa8dc',   // blau   – KV-Cache / eingefroren
  gold:   '#d9b45b',
  chipBg: '#2b3038',
  chipBr: '#3a4048',
  stroke: '#dfe3ea',
  mono:   '#7d8797',
};

/* ---------- Drehbuch: der Beispieltext (Token = Wort) ---------- */
const TOK = [
  { w: 'Am',      icon: 'chip'      },
  { w: 'Abend',   icon: 'evening'   },
  { w: 'sitzt',   icon: 'sit'       },
  { w: 'Opa',     icon: 'opa'       },
  { w: 'auf',     icon: 'auf'       },
  { w: 'der',     icon: 'chip'      },   // ab hier: erzeugte Wörter
  { w: 'alten',   icon: 'alt'       },
  { w: 'Bank',    icon: 'bank'      },   // morpht zur Sitzbank!
  { w: 'im',      icon: 'chip'      },
  { w: 'Park',    icon: 'park'      },
  { w: 'und',     icon: 'link'      },
  { w: 'füttert', icon: 'feed'      },
  { w: 'dort',    icon: 'pin'       },
  { w: 'die',     icon: 'chip'      },
  { w: 'grauen',  icon: 'grau'      },
  { w: 'Tauben',  icon: 'taube'     },
  { w: 'bis',     icon: 'hourglass' },
  { w: 'es',      icon: 'chip'      },
  { w: 'dunkel',  icon: 'dark'      },
  { w: 'wird',    icon: 'become'    },
];
const N_INPUT = 5, N_ALL = TOK.length;

/* Attention-Drehbuch: wohin schaut ein Wort in welcher Ebene?
   src: [[Quellindex, Gewicht], …] – cap löst eine Erklär-Pause aus */
const ATT = {
  7: { // Bank
    0: { src: [[2, .5], [4, .35]], morphTo: 'bench',
         cap: '„Bank“ schaut auf „sitzt“ und „auf“ – man SITZT darauf: Gemeint ist die Sitzbank! Das Symbol wechselt von der Geldbank zur Parkbank.',
         sub: 'Dasselbe Wort, andere Bedeutung – der Kontext entscheidet.' },
    1: { src: [[6, .5]], detail: 1,
         cap: '„alten“ färbt ab: Aus der Bank wird eine alte, verwitterte Holzbank.' },
    2: { src: [[3, .35]] },
  },
  9: { // Park
    0: { src: [[7, .35], [8, .2]] },
  },
  11: { // füttert
    0: { src: [[3, .45], [9, .2]] },
  },
  15: { // Tauben
    0: { src: [[14, .5], [13, .15]], tint: '#9aa2ad',
         cap: '„grauen“ verändert „Tauben“: Die Vögel im Symbol werden grau.' },
    1: { src: [[11, .45]],
         cap: '„füttert“ passt zu „Tauben“ – da sammelt sich Futter.' },
    2: { src: [[9, .35], [3, .2]] },
  },
  18: { // dunkel
    0: { src: [[1, .5], [16, .2]],
         cap: '„dunkel“ schaut weit zurück – bis „Abend“ ganz am Satzanfang! Aufmerksamkeit erreicht jedes frühere Wort, egal wie weit weg.' },
  },
};

/* Feed-Forward-Drehbuch: wo reichert Wissen das Symbol an? */
const FFN = {
  3:  { 1: { detail: 1, cap: 'Wissen ergänzt „Opa“: graue Haare, Brille, Gehstock – das hat das Modell im Training über Opas gelernt.' } },
  9:  { 1: { detail: 1, cap: 'Wissen ergänzt „Park“: mehr Bäume, Büsche, Wiese.' } },
  15: { 2: { detail: 1, cap: 'Und Wissen dazu: Tauben leben in Parks und lieben Brotkrumen.' } },
};

/* Kandidatenlisten je Runde (Gewinner steht immer vorn) */
const ROUNDS = [
  { cands: [['der', 71], ['einer', 12], ['seiner', 9], ['dem', 8]] },
  { cands: [['alten', 38], ['Bank', 26], ['kleinen', 21], ['Terrasse', 15]],
    cap: 'Auch „Bank“ ist schon im Rennen – aber „alten“ ist gerade wahrscheinlicher.' },
  { cands: [['Bank', 74], ['Mauer', 11], ['Schaukel', 8], ['Wiese', 7]] },
  { cands: [['im', 55], ['und', 20], ['vor', 14], ['am', 11]] },
  { cands: [['Park', 82], ['Garten', 9], ['Hof', 6], ['Dorf', 3]],
    cap: 'Nach „auf der alten Bank im …“ ist „Park“ fast sicher.' },
  { cands: [['und', 46], ['wo', 21], ['neben', 18], ['während', 15]] },
  { cands: [['füttert', 41], ['beobachtet', 25], ['wartet', 19], ['liest', 15]] },
  { cands: [['dort', 33], ['die', 31], ['ein', 20], ['Tauben', 16]] },
  { cands: [['die', 58], ['ein', 17], ['viele', 15], ['hungrige', 10]] },
  { cands: [['grauen', 36], ['Tauben', 34], ['kleinen', 18], ['Enten', 12]] },
  { cands: [['Tauben', 88], ['Vögel', 7], ['Enten', 3], ['Spatzen', 2]],
    cap: 'Park + füttern + grau: Alles deutet auf „Tauben“.' },
  { cands: [['bis', 39], ['während', 22], ['und', 21], ['obwohl', 18]] },
  { cands: [['es', 64], ['die', 15], ['der', 12], ['zum', 9]] },
  { cands: [['dunkel', 71], ['Abend', 12], ['spät', 10], ['kalt', 7]] },
  { cands: [['wird', 90], ['ist', 6], ['war', 3], ['bleibt', 1]] },
];

/* ---------- Teilschritte einer Spalte ----------
   1 Embedding · 2 Position · 3/5/7 Attention E1–E3 · 4/6/8 Wissen E1–E3 */
const SUBS_PER_COL = 8;
const ROW_MIN_SUB = [1, 2, 3, 5, 7];   // ab wann eine Zelle sichtbar ist
const ROW_MAX_SUB = [1, 2, 4, 6, 8];   // welchen Zustand sie maximal zeigt
const PHASE_INFO = {
  embed: { sub: 1, row: 0, stage: 'embed' },
  pos:   { sub: 2, row: 1, stage: 'pos' },
  a0:    { sub: 3, row: 2, stage: 'att', L: 0 },
  f0:    { sub: 4, row: 2, stage: 'ffn', L: 0 },
  a1:    { sub: 5, row: 3, stage: 'att', L: 1 },
  f1:    { sub: 6, row: 3, stage: 'ffn', L: 1 },
  a2:    { sub: 7, row: 4, stage: 'att', L: 2 },
  f2:    { sub: 8, row: 4, stage: 'ffn', L: 2 },
};
const STAGE_COL = { embed: C.embed, pos: C.pos, att: C.att, ffn: C.ffn };
const SPOT_HOLD = 2.4;   // Erklär-Pause bei Highlights (s, im Sim-Takt)

/* ---------- Hilfen ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const easeOut  = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn   = t => Math.pow(clamp(t, 0, 1), 2);
const easeBack = t => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function defaultSrc(c) {
  if (c <= 0) return [];
  const s = [[c - 1, .45]];
  if (c > 1) s.push([c - 2, .18]);
  return s;
}
function attSrcs(c, L) {
  const sc = ATT[c] && ATT[c][L];
  return (sc && sc.src) ? sc.src : defaultSrc(c);
}
/* Nur das Icon eines Zustands (für Kontext-Chips; berücksichtigt Morph) */
function stateIcon(c, sub) {
  let ic = TOK[c].icon;
  for (let L = 0; L < 3; L++) {
    const sc = ATT[c] && ATT[c][L];
    if (sub >= 3 + 2 * L && sc && sc.morphTo) ic = sc.morphTo;
  }
  return ic;
}
/* Symbolzustand einer Spalte nach `sub` Teilschritten (deterministisch) */
function buildState(c, sub) {
  const st = { icon: TOK[c].icon, morphFrom: null, morphStep: 0, detail: 0,
               chips: [], rings: 0, tint: null, posN: sub >= 2 ? c + 1 : 0 };
  for (let L = 0; L < 3; L++) {
    const aSub = 3 + 2 * L, fSub = 4 + 2 * L;
    if (sub >= aSub) {
      const sc = ATT[c] && ATT[c][L];
      if (sc) {
        if (sc.morphTo) { st.morphFrom = st.icon; st.icon = sc.morphTo; st.morphStep = aSub; }
        if (sc.tint) st.tint = sc.tint;
        if (sc.detail) st.detail += sc.detail;
      }
      for (const [s, w] of attSrcs(c, L)) {
        const ic = stateIcon(s, aSub);
        if (w >= .3 && ic !== 'chip' && st.chips.length < 3 && !st.chips.some(ch => ch.icon === ic))
          st.chips.push({ icon: ic, step: aSub });
      }
    }
    if (sub >= fSub) {
      st.rings = L + 1;
      const f = FFN[c] && FFN[c][L];
      if (f && f.detail) st.detail += f.detail;
    }
  }
  return st;
}

/* ---------- Zustand der Simulation ---------- */
let nTok, steps, doneAt, frozen, chipPopAt;
let round, cache, cacheTouched, cacheBannerDone;
let roundCost, totalCost, costHist, capsShown;
let phase, queue, waiting, roundComp;
let autoPlay, wordRun, stepping, ended;
let spotT, spotCell;
let orbs, arcs, sparkles, panelState, flyState, bannerT0, introT0;
let simNow = 0, speed = 1;
let hover = null;
let kvGuard = false;

function resetAll() {
  nTok = N_INPUT;
  steps = TOK.map(() => 0);
  doneAt = TOK.map(() => []);
  frozen = TOK.map(() => false);
  chipPopAt = TOK.map(() => -9);
  round = 0; roundCost = 0; totalCost = 0; costHist = [];
  cache = false; cacheTouched = false; cacheBannerDone = false;
  capsShown = new Set();
  phase = null; queue = ['intro']; waiting = true; roundComp = [];
  autoPlay = false; wordRun = false; stepping = false; ended = false;
  spotT = 0; spotCell = null;
  orbs = []; arcs = []; sparkles = [];
  panelState = null; flyState = null; bannerT0 = -9;
  introT0 = simNow;
  setKv(false, true);
  stepping = true; startNext();   // Intro (Wörter rutschen herein) läuft an
  syncButtons(); updateStatus();
}

/* ---------- Phasen-Maschine ---------- */
function buildRound() {
  if (nTok >= N_ALL) { queue = ['end']; return; }
  round = nTok - N_INPUT;
  queue = [];
  if (nTok === N_INPUT + 4 && !cache && !cacheTouched && !cacheBannerDone) queue.push('cacheOn');
  queue.push('embed', 'pos', 'a0', 'f0', 'a1', 'f1', 'a2', 'f2', 'select', 'choose', 'fly', 'append');
}

function startNext() {
  if (ended) return;
  if (!queue.length) buildRound();
  startPhase(queue.shift());
}

function rowStagger(n) { return clamp(0.7 / Math.max(1, n), 0.04, 0.13); }

function startPhase(name) {
  const info = PHASE_INFO[name];
  phase = { name, t: 0, dur: 1, fired: [] };
  waiting = false;

  if (name === 'intro') {
    introT0 = simNow;
    phase.dur = 0.6 + N_INPUT * 0.09;
  } else if (info) {                          // eine Zeilen-Welle
    if (name === 'embed') {
      roundCost = 0;
      if (!cache) steps = steps.map((_, c) => c < nTok ? 0 : steps[c]);
      roundComp = [];
      for (let c = 0; c < nTok; c++) {
        frozen[c] = steps[c] >= SUBS_PER_COL;
        if (!frozen[c]) roundComp.push(c);
      }
    }
    phase.stagger = rowStagger(roundComp.length);
    phase.dur = phase.stagger * Math.max(0, roundComp.length - 1) + 0.55;
    phase.fired = roundComp.map(() => false);
  } else if (name === 'select') {
    phase.dur = 1.7;
    panelState = { cands: ROUNDS[round].cands, chosen: false };
    costHist.push({ v: roundCost, cached: roundComp.length < nTok });
  } else if (name === 'choose') {
    phase.dur = 1.15;
    panelState.chosen = true;
  } else if (name === 'fly') {
    phase.dur = 0.9;
    flyState = { t0: simNow, word: TOK[nTok].w };
  } else if (name === 'append') {
    phase.dur = 0.5;
    nTok++;
    chipPopAt[nTok - 1] = simNow;
    panelState = null; flyState = null;
  } else if (name === 'cacheOn') {
    phase.dur = 3.4;
    bannerT0 = simNow;
    cacheBannerDone = true;
    setKv(true, true);
  } else if (name === 'end') {
    phase.dur = Infinity;
    ended = true; autoPlay = false; wordRun = false;
  }
  setPhaseCaption(name);
  syncButtons(); updateStatus();
}

function firePending(force) {
  const info = PHASE_INFO[phase.name];
  if (info) {
    for (let i = 0; i < roundComp.length; i++) {
      if (phase.fired[i]) continue;
      if (!force && phase.t < i * phase.stagger) break;
      phase.fired[i] = true;
      fireCell(roundComp[i], info, force);
      if (!force && spotT > 0) break;         // Erklär-Pause: Welle hält an
    }
  } else if (phase.name === 'cacheOn') {
    for (let c = 0; c < nTok; c++)
      if (!frozen[c] && steps[c] >= SUBS_PER_COL && (force || phase.t >= 0.4 + c * 0.07)) frozen[c] = true;
  }
}

function fireCell(c, info, quiet) {
  steps[c] = info.sub;
  doneAt[c][info.sub] = simNow;
  roundCost++; totalCost++;
  if (!quiet) orbs.push({ c, row: info.row, t0: simNow, col: STAGE_COL[info.stage] });
  if (info.stage === 'att') {
    const srcs = attSrcs(c, info.L);
    if (srcs.length && !quiet) arcs.push({ c, row: info.row, srcs, t0: simNow, ttl: 1.15 });
    heroCheck(c, ATT[c] && ATT[c][info.L], 'a' + info.L, info.row, quiet);
  } else if (info.stage === 'ffn') {
    if (!quiet) sparkles.push({ c, row: info.row, t0: simNow });
    heroCheck(c, FFN[c] && FFN[c][info.L], 'f' + info.L, info.row, quiet);
  }
  updateStatus();
}

function heroCheck(c, script, key, row, quiet) {
  if (!script || !script.cap) return;
  const id = c + ':' + key;
  if (capsShown.has(id)) return;
  capsShown.add(id);
  if (quiet) return;
  setCap(script.cap, script.sub || '');
  spotT = SPOT_HOLD; spotCell = { c, row };
  const a = arcs[arcs.length - 1];
  if (a && a.c === c) a.ttl += SPOT_HOLD;
}

function completePhase() {
  firePending(true);
  phase.t = phase.dur;
  waiting = true; stepping = false;
  if (wordRun && (phase.name === 'append' || phase.name === 'end' || nTok >= N_ALL && phase.name === 'fly')) wordRun = false;
  if (autoPlay || wordRun) startNext();
  syncButtons(); updateStatus();
}

function update(dt) {
  const d = dt * speed;
  simNow += d;
  if (!phase || waiting || ended && phase.name === 'end') return;
  if (spotT > 0) { spotT -= d; if (spotT > 0) return; spotCell = null; setPhaseCaption(phase.name); }
  phase.t += d;
  firePending(false);
  if (phase.t >= phase.dur) completePhase();
}

/* ---------- Bedienung ---------- */
function doStep() {
  if (ended) return;
  autoPlay = false;
  if (!waiting && phase) {          // laufende Phase sofort abschließen
    spotT = 0; spotCell = null;
    completePhase();
  } else {
    stepping = true; startNext();
  }
  syncButtons();
}
function doWord() {
  if (ended) return;
  autoPlay = false; wordRun = true;
  if (waiting) startNext();
  syncButtons();
}
function doAuto() {
  if (ended) { syncButtons(); return; }
  autoPlay = !autoPlay; wordRun = false; stepping = false;
  if (autoPlay && waiting) startNext();
  syncButtons();
}
function setKv(on, silent) {
  kvGuard = true;
  kvEl.checked = on;
  kvGuard = false;
  cache = on;
  if (!silent) cacheTouched = true;
}

/* =============================================================
   Zeichnen
   ============================================================= */
const cv = document.getElementById('cv');
const g = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
const GUT = 152;                    // linke Spalte mit Ebenen-Beschriftung
let colW = 60, layoutN = N_INPUT;
let rows = [], panelBand = { y0: 0, y1: 0 }, wordH = 48, yWord = 0;

function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = Math.max(640, r.width); H = Math.max(380, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}

function updateLayout(dt) {
  layoutN = (phase && (phase.name === 'fly')) ? nTok + 1 : nTok;
  const target = clamp((W - GUT - 16) / Math.max(layoutN, N_INPUT), 42, 88);
  colW = !isFinite(colW) || Math.abs(colW - target) < .2 ? target : lerp(colW, target, clamp(dt * 6, 0, 1));

  wordH = clamp(H * 0.078, 40, 58);
  const panelH = clamp(H * 0.205, 118, 190);
  const avail = H - 10 - panelH - wordH - 14;
  const wE = 1.0, wP = 0.68, wB = 1.09, tot = wE + wP + 3 * wB;
  const hE = avail * wE / tot, hP = avail * wP / tot, hB = avail * wB / tot;
  yWord = H - 8 - wordH / 2;
  let y = H - 8 - wordH - 4;        // Unterkante Embedding-Zeile
  rows = [];
  const mk = (h, name, color, label, sub) => { rows.push({ name, color, label, sub, yc: y - h / 2, h }); y -= h; };
  mk(hE, 'embed', C.embed, 'Embedding', 'Wort → Symbol');
  mk(hP, 'pos', C.pos, '+ Position', 'Platz im Satz');
  mk(hB, 'b1', C.att, 'Ebene 1', '');
  mk(hB, 'b2', C.att, 'Ebene 2', '');
  mk(hB, 'b3', C.att, 'Ebene 3', '');
  panelBand = { y0: 8, y1: 8 + panelH };
}

const xOf = c => GUT + colW * (c + 0.5);

/* ---------- Icon-Zeichenfunktionen ---------- */
function lineCol(o) { return o.mono ? C.mono : C.stroke; }
function accCol(o, col) { return o.mono ? '#77828f' : col; }
function lw(s) { return Math.max(1.3, s * 0.058); }
function star4(x, y, r, col, a) {
  g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = Math.max(1, r * 0.28);
  g.beginPath();
  g.moveTo(x - r, y); g.lineTo(x + r, y);
  g.moveTo(x, y - r); g.lineTo(x, y + r);
  g.stroke(); g.globalAlpha = 1;
}
function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const ICON = {
  chip(x, y, s, o) {                       // Funktionswort: Verbindungsstück
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    rr(x - s * .40, y - s * .16, s * .80, s * .32, s * .14); g.fill(); g.stroke();
    g.fillStyle = lineCol(o);
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(x + i * s * .17, y, s * .035, 0, 7); g.fill(); }
    g.fillRect(x - s * .52, y - s * .06, s * .12, s * .12);
    g.fillRect(x + s * .40, y - s * .06, s * .12, s * .12);
  },
  evening(x, y, s, o) {                    // Sonne am Horizont
    const sun = accCol(o, C.embed);
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    g.beginPath(); g.moveTo(x - s * .46, y + s * .2); g.lineTo(x + s * .46, y + s * .2); g.stroke();
    g.fillStyle = sun;
    g.beginPath(); g.arc(x, y + s * .2, s * .24, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = sun;
    for (const a of [-2.4, -1.57, -0.74]) {
      g.beginPath();
      g.moveTo(x + Math.cos(a) * s * .3, y + s * .2 + Math.sin(a) * s * .3);
      g.lineTo(x + Math.cos(a) * s * .4, y + s * .2 + Math.sin(a) * s * .4);
      g.stroke();
    }
    if (o.detail >= 1) {
      g.strokeStyle = lineCol(o);
      g.beginPath(); g.arc(x - s * .28, y - s * .16, s * .09, Math.PI * .9, Math.PI * 2.05);
      g.arc(x - s * .13, y - s * .16, s * .1, Math.PI * 1.1, Math.PI * 2.1); g.stroke();
      star4(x + s * .3, y - s * .22, s * .07, sun, .9);
    }
  },
  sit(x, y, s, o) {                        // sitzende Figur
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineCap = 'round';
    g.beginPath(); g.arc(x - s * .18, y - s * .3, s * .12, 0, 7); g.stroke();
    g.beginPath();
    g.moveTo(x - s * .18, y - s * .17); g.lineTo(x - s * .16, y + s * .06);
    g.lineTo(x + s * .14, y + s * .08); g.lineTo(x + s * .14, y + s * .3);
    g.moveTo(x - s * .17, y - s * .08); g.lineTo(x + s * .04, y - s * .01);
    g.stroke();
    g.beginPath(); g.moveTo(x - s * .3, y + s * .3); g.lineTo(x + s * .38, y + s * .3); g.stroke();
    g.lineCap = 'butt';
  },
  opa(x, y, s, o) {                        // Person / Opa (Detail: Bart, Brille, Stock)
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - s * .2, s * .15, 0, 7); g.stroke();
    g.beginPath();
    g.moveTo(x - s * .3, y + s * .42); g.quadraticCurveTo(x - s * .28, y + s * .02, x - s * .08, y - s * .01);
    g.lineTo(x + s * .08, y - s * .01); g.quadraticCurveTo(x + s * .28, y + s * .02, x + s * .3, y + s * .42);
    g.stroke();
    if (o.detail >= 1) {
      g.beginPath(); g.arc(x, y - s * .14, s * .1, Math.PI * .15, Math.PI * .85); g.stroke();
      g.beginPath(); g.arc(x - s * .06, y - s * .22, s * .045, 0, 7); g.moveTo(x + s * .105, y - s * .22);
      g.arc(x + s * .06, y - s * .22, s * .045, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x - s * .15, y - s * .28); g.quadraticCurveTo(x, y - s * .38, x + s * .15, y - s * .28); g.stroke();
    }
    if (o.detail >= 2) {
      g.beginPath(); g.moveTo(x + s * .36, y + s * .06); g.lineTo(x + s * .42, y + s * .42);
      g.arc(x + s * .3, y + s * .05, s * .07, 0, Math.PI, true); g.stroke();
    }
    g.lineCap = 'butt';
  },
  auf(x, y, s, o) {                        // Kugel AUF Kiste
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    g.strokeRect(x - s * .26, y + s * .04, s * .52, s * .3);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.arc(x, y - s * .2, s * .13, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * .04); g.lineTo(x, y); g.stroke();
    g.beginPath(); g.moveTo(x - s * .05, y - s * .03); g.lineTo(x, y + s * .02); g.lineTo(x + s * .05, y - s * .03); g.stroke();
  },
  alt(x, y, s, o) {                        // altes, rissiges Brett
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    rr(x - s * .4, y - s * .18, s * .8, s * .36, s * .05); g.stroke();
    g.beginPath();
    g.moveTo(x - s * .1, y - s * .18); g.lineTo(x - s * .03, y - s * .02); g.lineTo(x - s * .13, y + s * .18);
    g.moveTo(x + s * .22, y - s * .18); g.lineTo(x + s * .17, y - s * .04);
    g.stroke();
    g.globalAlpha = .5;
    g.beginPath();
    g.moveTo(x - s * .32, y + s * .08); g.lineTo(x - s * .2, y + s * .08);
    g.moveTo(x + s * .26, y + s * .1); g.lineTo(x + s * .34, y + s * .1);
    g.stroke(); g.globalAlpha = 1;
  },
  bank(x, y, s, o) {                       // Geldbank (Gebäude mit €)
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - s * .4, y - s * .08); g.lineTo(x, y - s * .34); g.lineTo(x + s * .4, y - s * .08); g.closePath(); g.stroke();
    g.lineWidth = lw(s) * 1.5;
    for (const dx of [-.22, 0, .22]) {
      g.beginPath(); g.moveTo(x + dx * s, y - s * .04); g.lineTo(x + dx * s, y + s * .22); g.stroke();
    }
    g.lineWidth = lw(s);
    g.beginPath(); g.moveTo(x - s * .42, y + s * .28); g.lineTo(x + s * .42, y + s * .28); g.stroke();
    g.fillStyle = accCol(o, C.gold);
    g.font = `bold ${Math.round(s * .2)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('€', x, y - s * .16);
  },
  bench(x, y, s, o) {                      // Parkbank (Detail: verwittert)
    const wood = accCol(o, '#b7895a');
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - s * .3, y + s * .08); g.lineTo(x - s * .3, y + s * .32);
    g.moveTo(x + s * .3, y + s * .08); g.lineTo(x + s * .3, y + s * .32);
    g.stroke();
    g.fillStyle = wood;
    rr(x - s * .42, y - s * .02, s * .84, s * .1, s * .03); g.fill(); g.stroke();
    rr(x - s * .42, y - s * .19, s * .84, s * .08, s * .03); g.fill(); g.stroke();
    rr(x - s * .42, y - s * .34, s * .84, s * .08, s * .03); g.fill(); g.stroke();
    if (o.detail >= 1) {
      g.strokeStyle = o.mono ? C.mono : '#6d4f33'; g.lineWidth = Math.max(1, s * .03);
      g.beginPath();
      g.moveTo(x - s * .3, y + s * .03); g.lineTo(x - s * .1, y + s * .03);
      g.moveTo(x + s * .05, y + s * .04); g.lineTo(x + s * .3, y + s * .04);
      g.moveTo(x - s * .05, y - s * .34); g.lineTo(x - s * .01, y - s * .26);
      g.stroke();
    }
    g.lineCap = 'butt';
  },
  park(x, y, s, o) {                       // Baum / Park
    const green = accCol(o, '#6faf72'), trunk = accCol(o, '#8a6a4a');
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    g.fillStyle = trunk; g.fillRect(x - s * .035, y + s * .02, s * .07, s * .26);
    g.fillStyle = green;
    g.beginPath();
    g.arc(x - s * .12, y - s * .06, s * .15, 0, 7);
    g.arc(x + s * .01, y - s * .18, s * .17, 0, 7);
    g.arc(x + s * .13, y - s * .04, s * .13, 0, 7);
    g.fill();
    g.beginPath(); g.moveTo(x - s * .42, y + s * .28); g.lineTo(x + s * .42, y + s * .28); g.stroke();
    if (o.detail >= 1) {
      g.fillStyle = trunk; g.fillRect(x + s * .28, y + s * .12, s * .045, s * .16);
      g.fillStyle = green;
      g.beginPath(); g.arc(x + s * .3, y + s * .05, s * .1, 0, 7); g.fill();
      g.beginPath(); g.arc(x - s * .32, y + s * .22, s * .08, Math.PI, 0); g.fill();
      g.strokeStyle = green; g.lineWidth = Math.max(1, s * .03);
      for (const dx of [-.16, .12, .2]) {
        g.beginPath(); g.moveTo(x + dx * s, y + s * .28); g.lineTo(x + dx * s + s * .03, y + s * .22); g.stroke();
      }
    }
  },
  link(x, y, s, o) {                       // Kettenglieder
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s) * 1.3;
    g.beginPath(); g.arc(x - s * .15, y, s * .17, 0, 7); g.stroke();
    g.beginPath(); g.arc(x + s * .15, y, s * .17, 0, 7); g.stroke();
  },
  feed(x, y, s, o) {                       // Brot + Krümel (Detail: Vogelkopf)
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s);
    g.fillStyle = accCol(o, '#caa06a');
    rr(x - s * .4, y - s * .3, s * .46, s * .42, s * .13); g.fill(); g.stroke();
    g.globalAlpha = .55;
    rr(x - s * .33, y - s * .23, s * .32, s * .28, s * .09); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = lineCol(o);
    for (const [dx, dy] of [[.16, .04], [.27, .16], [.13, .25], [.32, .3]]) {
      g.beginPath(); g.arc(x + dx * s, y + dy * s, s * .035, 0, 7); g.fill();
    }
    if (o.detail >= 1) {
      g.strokeStyle = lineCol(o);
      g.beginPath(); g.arc(x + s * .38, y + s * .33, s * .07, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x + s * .31, y + s * .33); g.lineTo(x + s * .25, y + s * .35); g.stroke();
    }
  },
  pin(x, y, s, o) {                        // Ortsmarke
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineJoin = 'round';
    g.beginPath();
    g.arc(x, y - s * .08, s * .2, Math.PI * .8, Math.PI * .2);
    g.lineTo(x, y + s * .3); g.closePath(); g.stroke();
    g.fillStyle = lineCol(o);
    g.beginPath(); g.arc(x, y - s * .08, s * .07, 0, 7); g.fill();
    g.globalAlpha = .4;
    g.beginPath(); g.ellipse(x, y + s * .34, s * .16, s * .045, 0, 0, 7); g.stroke();
    g.globalAlpha = 1;
  },
  grau(x, y, s, o) {                       // Grautöne
    const cols = ['#b7bec9', '#8b95a4', '#5d6673'];
    g.lineWidth = Math.max(1, s * .04); g.strokeStyle = 'rgba(255,255,255,0.25)';
    cols.forEach((cc, i) => {
      g.fillStyle = cc;
      g.beginPath(); g.arc(x + (i - 1) * s * .24, y, s * .155, 0, 7); g.fill(); g.stroke();
    });
  },
  taube(x, y, s, o) {                      // Taube (Tint: grau; Detail: Auge, Futter)
    const body = o.tint || (o.mono ? '#828c99' : '#cfd6df');
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineJoin = 'round';
    g.fillStyle = body;
    g.beginPath(); g.ellipse(x - s * .05, y + s * .04, s * .3, s * .2, -0.15, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(x + s * .24, y - s * .13, s * .1, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x + s * .33, y - s * .15); g.lineTo(x + s * .42, y - s * .11); g.lineTo(x + s * .33, y - s * .08); g.closePath();
    g.fillStyle = accCol(o, '#e0a13c'); g.fill();
    g.beginPath(); g.moveTo(x - s * .32, y - s * .02); g.lineTo(x - s * .46, y - s * .12);
    g.moveTo(x - s * .33, y + s * .05); g.lineTo(x - s * .47, y + 0); g.stroke();
    g.beginPath(); g.arc(x - s * .02, y + s * .02, s * .13, Math.PI * .2, Math.PI * .9); g.stroke();
    g.beginPath();
    g.moveTo(x - s * .02, y + s * .23); g.lineTo(x - s * .02, y + s * .32);
    g.moveTo(x + s * .1, y + s * .22); g.lineTo(x + s * .1, y + s * .31);
    g.stroke();
    if (o.detail >= 1) {
      g.fillStyle = '#1a1d23';
      g.beginPath(); g.arc(x + s * .26, y - s * .15, s * .025, 0, 7); g.fill();
      g.fillStyle = lineCol(o);
      for (const [dx, dy] of [[.38, .28], [.46, .33], [.42, .2]]) {
        g.beginPath(); g.arc(x + dx * s, y + dy * s, s * .03, 0, 7); g.fill();
      }
    }
  },
  hourglass(x, y, s, o) {                  // Sanduhr
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - s * .24, y - s * .3); g.lineTo(x + s * .24, y - s * .3);
    g.moveTo(x - s * .24, y + s * .3); g.lineTo(x + s * .24, y + s * .3); g.stroke();
    g.beginPath();
    g.moveTo(x - s * .19, y - s * .28); g.lineTo(x + s * .19, y - s * .28); g.lineTo(x + s * .02, y);
    g.lineTo(x + s * .19, y + s * .28); g.lineTo(x - s * .19, y + s * .28); g.lineTo(x - s * .02, y);
    g.closePath(); g.stroke();
    g.fillStyle = lineCol(o);
    g.beginPath(); g.arc(x, y + s * .2, s * .045, 0, 7); g.fill();
    g.beginPath(); g.arc(x, y - s * .2, s * .035, 0, 7); g.fill();
  },
  dark(x, y, s, o) {                       // Mondsichel + Sterne
    const moon = accCol(o, '#cdd6e4');
    g.fillStyle = moon;
    g.beginPath(); g.arc(x - s * .06, y, s * .26, 0, 7); g.fill();
    g.fillStyle = C.bg;
    g.beginPath(); g.arc(x + s * .06, y - s * .05, s * .22, 0, 7); g.fill();
    star4(x + s * .24, y - s * .2, s * .06, moon, .9);
    star4(x + s * .3, y + s * .14, s * .045, moon, .7);
  },
  become(x, y, s, o) {                     // Kreislauf: „werden“
    g.strokeStyle = lineCol(o); g.lineWidth = lw(s); g.lineCap = 'round';
    const r = s * .26;
    g.beginPath(); g.arc(x, y, r, -2.7, -0.5); g.stroke();
    g.beginPath(); g.arc(x, y, r, 0.44, 2.64); g.stroke();
    for (const a of [-0.5, 2.64]) {
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const t = a + Math.PI / 2;
      g.beginPath();
      g.moveTo(px + Math.cos(t) * s * .1, py + Math.sin(t) * s * .1);
      g.lineTo(px + Math.cos(a) * s * .09, py + Math.sin(a) * s * .09);
      g.lineTo(px - Math.cos(t) * s * .02, py - Math.sin(t) * s * .02);
      g.stroke();
    }
    g.lineCap = 'butt';
  },
};

function drawIcon(name, x, y, s, o) {
  const fn = ICON[name] || ICON.chip;
  g.save(); fn(x, y, s, o || { detail: 0 }); g.restore();
}

/* Schneeflocke (KV-Cache-Markierung) */
function drawSnow(x, y, r, col, a) {
  g.save();
  g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = Math.max(1, r * .22); g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const an = i * Math.PI / 3;
    g.beginPath();
    g.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r);
    g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    g.stroke();
  }
  g.restore();
}

/* ---------- Symbol samt Zubehör (Chips, Ringe, Positionsmarke) ---------- */
function drawSymbol(c, rowIdx, x, y, R, st, mono) {
  const minSub = ROW_MIN_SUB[rowIdx];
  const pop = easeBack(clamp((simNow - (doneAt[c][minSub] || -9)) / 0.32, 0, 1));
  if (pop <= 0) return;
  const s = R * 1.65;
  g.save();
  g.translate(x, y); g.scale(pop, pop); g.translate(-x, -y);

  const o = { detail: st.detail, tint: st.tint, mono };

  if (st.morphFrom && st.morphStep >= minSub) {
    // Übergang Geldbank → Sitzbank
    const mt = easeOut(clamp((simNow - (doneAt[c][st.morphStep] || -9)) / 0.75, 0, 1));
    if (mt < 1) {
      g.globalAlpha = 1 - mt;
      drawIcon(st.morphFrom, x, y, s * (1 - 0.2 * mt), { detail: 0, mono });
      g.globalAlpha = 1;
    }
    if (mt > 0) {
      g.globalAlpha = mt;
      drawIcon(st.icon, x, y, s * (0.8 + 0.2 * easeBack(mt)), o);
      g.globalAlpha = 1;
    }
  } else {
    drawIcon(st.morphFrom && st.morphStep > minSub ? st.morphFrom : st.icon, x, y, s, o);
  }

  // goldene Wissens-Ringe (eine pro durchlaufener Ebene)
  if (st.rings > 0) {
    g.lineWidth = Math.max(1.4, R * .08);
    g.strokeStyle = mono ? C.mono : C.gold;
    g.globalAlpha = mono ? .5 : .85;
    for (let i = 0; i < st.rings; i++) {
      const a0 = -Math.PI / 2 + i * 2 * Math.PI / 3 + 0.16;
      g.beginPath(); g.arc(x, y, R * 1.06, a0, a0 + 2 * Math.PI / 3 - 0.32); g.stroke();
    }
    g.globalAlpha = 1;
  }

  // Kontext-Chips: aufgenommene Bedeutung anderer Wörter
  const chR = clamp(R * .34, 7, 12);
  st.chips.forEach((ch, i) => {
    if (ch.step > ROW_MAX_SUB[rowIdx]) return;
    const cp = easeBack(clamp((simNow - (doneAt[c][ch.step] || -9)) / 0.3, 0, 1));
    if (cp <= 0) return;
    const cx = x + R * 1.02, cy = y - R * .7 + i * chR * 2.15;
    g.save();
    g.translate(cx, cy); g.scale(cp, cp); g.translate(-cx, -cy);
    g.fillStyle = C.chipBg; g.strokeStyle = mono ? C.mono : C.chipBr; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, chR, 0, 7); g.fill(); g.stroke();
    drawIcon(ch.icon, cx, cy, chR * 1.5, { detail: 0, mono });
    g.restore();
  });

  // Positionsmarke
  if (st.posN > 0) {
    const bw = Math.max(15, R * .56), bh = bw * .72;
    const bx = x - R * 1.18, by = y + R * .62;
    g.fillStyle = mono ? '#3a4250' : '#4a3c1f';
    g.strokeStyle = mono ? C.mono : C.pos; g.lineWidth = 1;
    rr(bx - bw / 2, by - bh / 2, bw, bh, 3); g.fill(); g.stroke();
    g.fillStyle = mono ? C.mono : '#f0c069';
    g.font = `bold ${Math.round(bh * .62)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(st.posN), bx, by + 0.5);
  }
  g.restore();
}

/* ---------- Ebenen-Bänder + Beschriftung ---------- */
function drawLanes() {
  const activeRow = phase && PHASE_INFO[phase.name] ? PHASE_INFO[phase.name].row : -1;
  const x0 = GUT - 8, x1 = W - 10;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y0 = r.yc - r.h / 2 + 2;
    g.fillStyle = i === activeRow && !waiting ? 'rgba(255,255,255,0.055)' : C.lane;
    rr(x0, y0, x1 - x0, r.h - 4, 8); g.fill();
    g.fillStyle = r.color; g.globalAlpha = .8;
    g.fillRect(x0, y0 + 4, 3, r.h - 12);
    g.globalAlpha = 1;

    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = i === activeRow && !waiting ? C.text : C.dim;
    g.font = `600 13px system-ui, sans-serif`;
    g.fillText(r.label, 12, r.yc - 8);
    if (r.name.startsWith('b')) {
      g.font = '10px system-ui, sans-serif';
      g.fillStyle = C.att; g.beginPath(); g.arc(16, r.yc + 9, 3, 0, 7); g.fill();
      g.fillStyle = C.dim; g.fillText('Kontext', 23, r.yc + 9);
      g.fillStyle = C.ffn; g.beginPath(); g.arc(72, r.yc + 9, 3, 0, 7); g.fill();
      g.fillStyle = C.dim; g.fillText('Wissen', 79, r.yc + 9);
    } else {
      g.font = '10px system-ui, sans-serif'; g.fillStyle = C.faint;
      g.fillText(r.sub, 12, r.yc + 9);
    }
  }

  // oberstes Band: Wortauswahl
  g.fillStyle = C.lane;
  rr(x0, panelBand.y0, x1 - x0, panelBand.y1 - panelBand.y0 - 4, 8); g.fill();
  g.fillStyle = C.sel; g.globalAlpha = .8;
  g.fillRect(x0, panelBand.y0 + 4, 3, panelBand.y1 - panelBand.y0 - 16);
  g.globalAlpha = 1;
  g.fillStyle = phase && ['select', 'choose', 'fly'].includes(phase.name) ? C.text : C.dim;
  g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'left';
  const pyc = (panelBand.y0 + panelBand.y1) / 2;
  g.fillText('Wortauswahl', 12, pyc - 8);
  g.font = '10px system-ui, sans-serif'; g.fillStyle = C.faint;
  g.fillText('nur die letzte', 12, pyc + 7);
  g.fillText('Spalte zählt', 12, pyc + 19);

  // unterstes Band: der Text
  g.fillStyle = C.dim; g.font = '600 13px system-ui, sans-serif';
  g.fillText('Text', 12, yWord - 8);
  g.font = '10px system-ui, sans-serif'; g.fillStyle = C.faint;
  g.fillText('Token = Wort', 12, yWord + 7);
}

/* ---------- Wort-Chips unten ---------- */
function fitFont(word, maxW, base) {
  let px = base;
  g.font = `600 ${px}px system-ui, sans-serif`;
  while (px > 8 && g.measureText(word).width > maxW) {
    px--; g.font = `600 ${px}px system-ui, sans-serif`;
  }
  return px;
}
function drawWordChips() {
  const chw = colW - 6, chh = wordH - 14;
  for (let c = 0; c < nTok; c++) {
    let x = xOf(c);
    if (c < N_INPUT) {                       // Intro: von links hereinrutschen
      const t = easeOut(clamp((simNow - introT0 - c * 0.09) / 0.5, 0, 1));
      x = lerp(-colW, xOf(c), t);
      if (t <= 0) continue;
    }
    const pop = easeBack(clamp((simNow - chipPopAt[c]) / 0.35, 0, 1));
    const sc = chipPopAt[c] > 0 ? pop : 1;
    if (sc <= 0) continue;
    g.save();
    g.translate(x, yWord); g.scale(sc, sc); g.translate(-x, -yWord);

    const isNew = simNow - chipPopAt[c] < 1.2 && chipPopAt[c] > 0;
    g.fillStyle = C.chipBg;
    g.strokeStyle = frozen[c] ? C.ice : isNew ? C.sel : C.chipBr;
    g.lineWidth = frozen[c] || isNew ? 1.6 : 1;
    rr(x - chw / 2, yWord - chh / 2, chw, chh, 7); g.fill(); g.stroke();

    g.fillStyle = c < N_INPUT ? C.text : '#bfe3c1';
    fitFont(TOK[c].w, chw - 10, 13);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(TOK[c].w, x, yWord + 0.5);
    if (frozen[c]) drawSnow(x - chw / 2 + 7, yWord - chh / 2 + 6, 4, C.ice, .9);
    g.restore();
  }
  // blinkende Schreibmarke hinter dem letzten Wort
  if (!ended && (performance.now() / 1000) % 1 < .55) {
    const cx = GUT + colW * nTok + 4;
    g.fillStyle = C.dim;
    g.fillRect(cx, yWord - chh / 2 + 3, 2, chh - 6);
  }
}

/* ---------- Zellen (Symbolzustände) ---------- */
function drawCells() {
  for (let c = 0; c < nTok; c++) {
    const mono = frozen[c];
    if (mono) {                              // eingefrorene Spalte hinterlegen
      const top = rows[4].yc - rows[4].h / 2 + 3;
      const bot = rows[0].yc + rows[0].h / 2 - 3;
      g.fillStyle = 'rgba(111,168,220,0.055)';
      rr(xOf(c) - colW / 2 + 1.5, top, colW - 3, bot - top, 6); g.fill();
      drawSnow(xOf(c), top + 8, 4.5, C.ice, .8);
    }
    for (let ri = 0; ri < rows.length; ri++) {
      if (steps[c] < ROW_MIN_SUB[ri]) continue;
      const st = buildState(c, Math.min(steps[c], ROW_MAX_SUB[ri]));
      const R = Math.min(colW * .38, rows[ri].h * .3);
      drawSymbol(c, ri, xOf(c), rows[ri].yc, R, st, mono);
    }
  }
}

/* ---------- Effekte: Kugeln, Bögen, Funken ---------- */
function drawOrbs() {
  orbs = orbs.filter(o => simNow - o.t0 < 0.34);
  for (const o of orbs) {
    const t = easeOut((simNow - o.t0) / 0.3);
    const y0 = o.row === 0 ? yWord - wordH * .4 : rows[o.row - 1].yc;
    const y = lerp(y0, rows[o.row].yc, t);
    const x = xOf(o.c);
    g.fillStyle = o.col; g.globalAlpha = .22;
    g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    g.globalAlpha = .95;
    g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
    g.globalAlpha = 1;
  }
}
function arcAlpha(a) {
  const age = simNow - a.t0;
  if (age < 0.15) return age / 0.15;
  if (age > a.ttl - 0.3) return clamp((a.ttl - age) / 0.3, 0, 1);
  return 1;
}
function drawArcSet(cDst, row, srcs, baseA) {
  const r = rows[row];
  const xd = xOf(cDst), yd = r.yc + r.h * .16;
  for (const [s, w] of srcs) {
    const xs = xOf(s), ys = r.yc + r.h * .2;
    const cpx = (xs + xd) / 2, cpy = r.yc + r.h * .52;
    g.strokeStyle = C.att; g.globalAlpha = baseA * clamp(.3 + w * 1.3, 0, 1);
    g.lineWidth = 1 + 5 * w;
    g.beginPath(); g.moveTo(xs, ys); g.quadraticCurveTo(cpx, cpy, xd, yd); g.stroke();
    // Pfeilspitze am Ziel
    const dx = xd - cpx, dy = yd - cpy, an = Math.atan2(dy, dx);
    g.fillStyle = C.att;
    g.beginPath();
    g.moveTo(xd, yd);
    g.lineTo(xd - Math.cos(an - .45) * 7, yd - Math.sin(an - .45) * 7);
    g.lineTo(xd - Math.cos(an + .45) * 7, yd - Math.sin(an + .45) * 7);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}
function drawArcs() {
  arcs = arcs.filter(a => simNow - a.t0 < a.ttl);
  for (const a of arcs) drawArcSet(a.c, a.row, a.srcs, arcAlpha(a));
}
function drawSparkles() {
  sparkles = sparkles.filter(s => simNow - s.t0 < 0.55);
  for (const s of sparkles) {
    const t = (simNow - s.t0) / 0.55;
    const x = xOf(s.c), y = rows[s.row].yc;
    const rad = 8 + t * 16;
    for (let i = 0; i < 5; i++) {
      const an = -Math.PI / 2 + i * 2 * Math.PI / 5;
      star4(x + Math.cos(an) * rad, y + Math.sin(an) * rad, 3.2 * (1 - t), C.ffn, (1 - t) * .9);
    }
  }
}

/* ---------- Wortauswahl-Panel oben rechts ---------- */
function panelRect() {
  const w = clamp(W * .27, 250, 340);
  const h = panelBand.y1 - panelBand.y0 - 14;
  return { x: W - 14 - w, y: panelBand.y0 + 3, w, h };
}
function candRowY(p, i) { return p.y + 34 + i * (p.h - 40) / 4 + (p.h - 40) / 8; }

function drawPanel() {
  if (!panelState) return;
  const p = panelRect();
  const t = phase && phase.name === 'select' ? phase.t : 99;

  // Pfeil von der letzten Spalte hinauf ins Panel
  const lx = xOf(nTok - 1), ly = rows[4].yc - rows[4].h * .42;
  const ax = p.x - 6, ay = p.y + p.h - 8;
  const prog = clamp(t / 0.5, 0, 1);
  if (prog > 0) {
    g.save();
    g.strokeStyle = C.sel; g.lineWidth = 2.2; g.setLineDash([7, 6]);
    g.lineDashOffset = -simNow * 26;
    g.globalAlpha = .9;
    g.beginPath(); g.moveTo(lx, ly);
    g.quadraticCurveTo(lx, p.y + p.h * .55, lerp(lx, ax, prog), lerp(ly, ay, prog));
    g.stroke(); g.restore();
  }

  // Panel-Kasten
  g.fillStyle = '#23262e'; g.strokeStyle = '#3a4048'; g.lineWidth = 1.2;
  rr(p.x, p.y, p.w, p.h, 10); g.fill(); g.stroke();
  g.fillStyle = C.text; g.font = '600 13px system-ui, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('Nächstes Wort?', p.x + 12, p.y + 16);
  g.fillStyle = C.faint; g.font = '10px system-ui, sans-serif'; g.textAlign = 'right';
  g.fillText('immer das wahrscheinlichste', p.x + p.w - 12, p.y + 16);

  const barX = p.x + 86, barMax = p.w - 86 - 48;
  panelState.cands.forEach(([word, pct], i) => {
    const show = clamp((t - (0.35 + i * 0.14)) / 0.3, 0, 1);
    if (show <= 0) return;
    const y = candRowY(p, i);
    const win = i === 0, chosen = panelState.chosen;
    const dim = chosen && !win;
    g.globalAlpha = show * (dim ? .35 : 1);

    g.fillStyle = win && chosen ? '#d3f0d4' : C.text;
    g.font = `${win ? '600 ' : ''}12px system-ui, sans-serif`; g.textAlign = 'right';
    g.fillText(word, barX - 8, y);
    g.fillStyle = win ? C.sel : '#4a5160';
    rr(barX, y - 5, Math.max(3, barMax * pct / 100) * easeOut(show), 10, 4); g.fill();
    g.fillStyle = C.dim; g.font = '11px system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText(pct + ' %', barX + barMax + 8, y);

    if (win && chosen) {                       // Gewinner pulsiert
      const pu = .5 + .5 * Math.sin(simNow * 6);
      g.strokeStyle = C.sel; g.globalAlpha = .35 + .4 * pu; g.lineWidth = 1.6;
      rr(p.x + 6, y - 11, p.w - 12, 22, 6); g.stroke();
    }
    g.globalAlpha = 1;
  });

  // grüner Rahmen um die entscheidende letzte Spalte
  if (phase && ['select', 'choose'].includes(phase.name)) {
    const pu = .5 + .5 * Math.sin(simNow * 5);
    g.strokeStyle = C.sel; g.globalAlpha = .25 + .35 * pu; g.lineWidth = 2;
    rr(lx - colW / 2 + 2, rows[4].yc - rows[4].h / 2 + 3, colW - 4,
       yWord + wordH / 2 - rows[4].yc + rows[4].h / 2 - 8, 8);
    g.stroke(); g.globalAlpha = 1;
  }
}

/* Gewähltes Wort fliegt nach unten an den Text */
function drawFly() {
  if (!flyState) return;
  const p = panelRect();
  const t = easeIn(clamp((simNow - flyState.t0) / 0.85, 0, 1));
  const x0 = p.x + 40, y0 = candRowY(p, 0);
  const x1 = GUT + colW * (nTok + 0.5), y1 = yWord;
  const cx = lerp(x0, x1, .4), cy = Math.min(y0, y1) - H * .06;
  const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
  const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
  const chw = Math.max(colW - 6, 46), chh = wordH - 14;
  g.fillStyle = '#2f4a33'; g.strokeStyle = C.sel; g.lineWidth = 1.6;
  rr(x - chw / 2, y - chh / 2, chw, chh, 7); g.fill(); g.stroke();
  g.fillStyle = '#d3f0d4';
  fitFont(flyState.word, chw - 8, 13);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(flyState.word, x, y + 0.5);
}

/* ---------- KV-Cache-Banner ---------- */
function drawBanner() {
  if (!phase || phase.name !== 'cacheOn') return;
  const t = phase.t;
  const a = t < .4 ? t / .4 : t > phase.dur - .5 ? (phase.dur - t) / .5 : 1;
  const w = Math.min(620, W * .62), h = 108;
  const x = GUT + (W - GUT - w) / 2, y = rows[3].yc - h / 2;
  g.save(); g.globalAlpha = clamp(a, 0, 1);
  g.fillStyle = 'rgba(26,32,44,0.94)'; g.strokeStyle = C.ice; g.lineWidth = 1.6;
  rr(x, y, w, h, 12); g.fill(); g.stroke();
  drawSnow(x + 34, y + h / 2, 13, C.ice, .95);
  g.fillStyle = C.text; g.font = '600 17px system-ui, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('KV-Cache aktiviert', x + 60, y + 26);
  g.fillStyle = C.dim; g.font = '12.5px system-ui, sans-serif';
  g.fillText('Die fertigen Spalten werden eingefroren und gespeichert.', x + 60, y + 52);
  g.fillText('Ab jetzt wird nur noch das NEUE Wort durchgerechnet.', x + 60, y + 72);
  g.restore();
}

/* ---------- Erklär-Pause hervorheben ---------- */
function drawSpot() {
  if (spotT <= 0 || !spotCell) return;
  const x = xOf(spotCell.c), r = rows[spotCell.row];
  const pu = .5 + .5 * Math.sin(simNow * 5);
  g.strokeStyle = C.embed; g.globalAlpha = .5 + .4 * pu; g.lineWidth = 2.4;
  rr(x - colW / 2 + 2, r.yc - r.h / 2 + 4, colW - 4, r.h - 8, 9); g.stroke();
  g.globalAlpha = 1;
}

/* ---------- Mini-Diagramm: Rechenaufwand je Runde ---------- */
function drawCostChart() {
  if (!costHist.length) return;
  const x0 = 12, bw = 6.5, gap = 2, hMax = 30;
  const base = panelBand.y1 - 12;
  const vMax = SUBS_PER_COL * N_ALL;
  g.font = '9px system-ui, sans-serif'; g.fillStyle = C.faint; g.textAlign = 'left';
  g.fillText('Aufwand je Wort:', x0, base - hMax - 8);
  costHist.forEach((e, i) => {
    const h = Math.max(2, e.v / vMax * hMax);
    g.fillStyle = e.cached ? C.sel : '#c9636f';
    g.globalAlpha = i === costHist.length - 1 ? 1 : .65;
    g.fillRect(x0 + i * (bw + gap), base - h, bw, h);
  });
  g.globalAlpha = 1;
}

/* ---------- Maus-Info ---------- */
function drawHover() {
  if (!hover || spotT > 0) return;
  const { c, row } = hover;
  if (c >= nTok) return;
  let lines = [];
  if (row === 'word') {
    lines = [`Token ${c + 1}: „${TOK[c].w}“` + (c < N_INPUT ? ' (Eingabe)' : ' (erzeugt)')];
  } else if (rows[row] && rows[row].name.startsWith('b') && steps[c] >= ROW_MIN_SUB[row]) {
    const L = row - 2;
    const srcs = attSrcs(c, L).filter(([, w]) => w > .1);
    if (srcs.length) {
      drawArcSet(c, row, srcs, .85);
      lines = [`„${TOK[c].w}“ · Ebene ${L + 1}`,
               'schaut auf: ' + srcs.map(([s, w]) => `${TOK[s].w}${w >= .4 ? ' (stark)' : ''}`).join(', ')];
    }
    if (frozen[c]) lines.push('❄ aus dem KV-Cache – nicht neu berechnet');
  } else if (frozen[c] && row !== 'word') {
    lines = ['❄ aus dem KV-Cache – nicht neu berechnet'];
  }
  if (!lines.length) return;
  g.font = '11.5px system-ui, sans-serif';
  const tw = Math.max(...lines.map(l => g.measureText(l).width));
  const bx = clamp(xOf(c) - tw / 2 - 8, 8, W - tw - 24);
  const by = (row === 'word' ? yWord - wordH : rows[row].yc - rows[row].h / 2) - lines.length * 15 - 10;
  g.fillStyle = 'rgba(20,23,29,0.94)'; g.strokeStyle = '#3a4048'; g.lineWidth = 1;
  rr(bx, by, tw + 16, lines.length * 15 + 9, 6); g.fill(); g.stroke();
  g.fillStyle = C.text; g.textAlign = 'left'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, bx + 8, by + 12 + i * 15));
}

/* ---------- Abschluss-Schimmer ---------- */
function drawEnd() {
  if (!ended) return;
  const pu = .5 + .5 * Math.sin(simNow * 2.2);
  g.strokeStyle = C.gold; g.globalAlpha = .25 + .3 * pu; g.lineWidth = 2;
  rr(GUT - 4, yWord - wordH / 2 - 2, colW * nTok + 8, wordH + 4, 9); g.stroke();
  g.globalAlpha = 1;
}

function render() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  drawLanes();
  drawCells();
  drawWordChips();
  drawArcs();
  drawOrbs();
  drawSparkles();
  drawSpot();
  drawPanel();
  drawFly();
  drawBanner();
  drawCostChart();
  drawEnd();
  drawHover();
}

/* =============================================================
   Erklärtexte
   ============================================================= */
const capMain = document.getElementById('capMain');
const capSub = document.getElementById('capSub');
function setCap(m, s) { capMain.textContent = m; capSub.textContent = s || ''; }

function setPhaseCaption(name) {
  const r = round, first = r === 0;
  const solo = roundComp.length === 1;
  const newWord = TOK[nTok - 1].w;
  switch (name) {
    case 'intro':
      setCap('Links unten steht der Anfang eines Satzes – fünf Wörter. Das Sprachmodell soll ihn Wort für Wort fortsetzen.',
        '⏭ Schritt = ein Teilschritt · ⏩ Wort = ein ganzes Wort erzeugen · ▶ Auto = laufen lassen. (Vereinfachte Simulation, kein echtes Modell.)');
      break;
    case 'embed':
      if (first)
        setCap('1 · Embedding: Jedes Wort wird in ein Symbol übersetzt – seine „Bedeutung“, mit der das Modell arbeitet. Echte Modelle benutzen dafür lange Zahlenreihen.',
          'Funktionswörter wie „am“ oder „der“ bekommen schlichte Verbinder-Symbole.');
      else if (cache && solo)
        setCap(`Embedding – aber nur für das neue Wort „${newWord}“. Alles andere liegt schon im Cache.`,
          'Blau eingefärbte Spalten: eingefroren und gespeichert.');
      else if (cache)
        setCap('Der vorhandene Text wird EINMAL komplett eingelesen („Prefill“) – danach übernimmt der Cache.', '');
      else
        setCap('Neue Runde: Alle Ergebnisse wurden weggeworfen – jedes Wort wird wieder von vorn berechnet. Auch die alten!',
          `Ohne KV-Cache: ${nTok} Wörter × 8 Teilschritte, jede Runde aufs Neue.` +
          (nTok - 1 === 7 ? ' Neu dabei: „Bank“ – ohne Kontext zeigt das Symbol erst mal eine Geldbank …' : ''));
      break;
    case 'pos':
      if (first)
        setCap('2 · Position: Jedes Symbol bekommt seine Platznummer im Satz. Reihenfolge ist entscheidend – „Opa füttert Tauben“ ist nicht „Tauben füttern Opa“.', '');
      else setCap('Positionsnummern anheften.', '');
      break;
    case 'a0': case 'a1': case 'a2': {
      const L = PHASE_INFO[name].L + 1;
      if (first && L === 1)
        setCap('3 · Aufmerksamkeit (Attention): Jedes Wort schaut auf die Wörter VOR sich. Was es dort findet, verändert seine eigene Bedeutung.',
          'Strichstärke = wie stark hingeschaut wird. Kleine Kreise am Symbol = aufgenommener Kontext.');
      else
        setCap(`Ebene ${L} · Aufmerksamkeit: Die Wörter gleichen sich mit ihrem Kontext ab.`,
          cache && solo ? 'Die Pfeile lesen die eingefrorenen Spalten einfach aus dem Cache – dort wird nichts neu berechnet.' : '');
      break;
    }
    case 'f0': case 'f1': case 'f2': {
      const L = PHASE_INFO[name].L + 1;
      if (first && L === 1)
        setCap('… danach Feed-Forward: Jedes Wort reichert sein Symbol aus dem antrainierten WISSEN des Modells an – wie aus einer riesigen Bibliothek.',
          'Goldener Bogen am Symbol = eine durchlaufene Ebene.');
      else setCap(`Ebene ${L} · Wissen: Details aus dem Training kommen dazu.`, '');
      break;
    }
    case 'select':
      setCap('Oben angekommen. Nur die LETZTE Spalte entscheidet: Aus ihrem fertigen Symbol berechnet das Modell, wie gut jedes Wort als Fortsetzung passt.',
        'Die anderen Spalten haben trotzdem mitgeholfen – über die Aufmerksamkeit stecken sie im Ergebnis der letzten.');
      break;
    case 'choose': {
      const [w, p] = ROUNDS[round].cands[0];
      setCap(`Gewählt wird schlicht das wahrscheinlichste Wort: „${w}“ (${p} %).`,
        ROUNDS[round].cap || 'In dieser Simulation wird nie gewürfelt – immer der Spitzenreiter.');
      break;
    }
    case 'fly':
      setCap(`„${TOK[nTok].w}“ wird hinten an den Text angehängt …`, '');
      break;
    case 'append':
      if (cache)
        setCap('… angehängt. Dank KV-Cache war diese Runde winzig – vergleiche die Aufwands-Balken oben links.', 'Rot = alles neu gerechnet · Grün = mit Cache.');
      else if (r >= 2)
        setCap('Schon wieder ALLES neu … dabei kommt bei den alten Wörtern jedes Mal exakt dasselbe heraus. Das schreit nach einer Abkürzung!',
          'Beobachte die roten Aufwands-Balken oben links: Jede Runde wird teurer.');
      else
        setCap('… und alles beginnt von vorn: ein Wort mehr im Text, eine komplette Neuberechnung mehr.', '');
      break;
    case 'cacheOn':
      setCap('Die Abkürzung heißt KV-Cache: Alle fertigen Spalten werden eingefroren ❄ und gespeichert. Ab jetzt wird nur noch das NEUE Wort berechnet – die Aufmerksamkeit liest die alten Werte einfach aus dem Speicher.',
        'Genau so machen es echte Sprachmodelle. Mit dem Schalter oben kannst du den Cache jederzeit ein- und ausschalten.');
      break;
    case 'end':
      setCap('Fertig – 20 Wörter! So entsteht jede KI-Antwort: Wort für Wort, immer das wahrscheinlichste zuerst. Genau das siehst du, wenn die Antwort im Chat „tippt“.',
        '↺ Neustart zum Wiederholen – zum Beispiel einmal ganz ohne und einmal von Anfang an mit KV-Cache.');
      break;
  }
}

/* =============================================================
   Verkabelung
   ============================================================= */
const btnStep = document.getElementById('btnStep');
const btnWord = document.getElementById('btnWord');
const btnAuto = document.getElementById('btnAuto');
const btnReset = document.getElementById('btnReset');
const tempoEl = document.getElementById('tempo');
const tempoVal = document.getElementById('tempoVal');
const kvEl = document.getElementById('kv');
const statusEl = document.getElementById('status');

btnStep.addEventListener('click', doStep);
btnWord.addEventListener('click', doWord);
btnAuto.addEventListener('click', doAuto);
btnReset.addEventListener('click', resetAll);
tempoEl.addEventListener('input', () => {
  speed = tempoEl.value / 100;
  tempoVal.textContent = '×' + speed.toFixed(1).replace('.', ',');
});
kvEl.addEventListener('change', () => {
  if (kvGuard) return;
  cache = kvEl.checked; cacheTouched = true;
  updateStatus();
});

function syncButtons() {
  btnAuto.textContent = autoPlay ? '⏸ Pause' : '▶ Auto';
  btnAuto.classList.toggle('active', autoPlay);
  btnWord.classList.toggle('active', wordRun);
}
function updateStatus() {
  statusEl.textContent =
    `Wort ${nTok}/${N_ALL} · Runde ${Math.min(round + 1, ROUNDS.length)}/${ROUNDS.length} · Rechenschritte gesamt: ${totalCost}`;
}

cv.addEventListener('mousemove', e => {
  const b = cv.getBoundingClientRect();
  const mx = e.clientX - b.left, my = e.clientY - b.top;
  hover = null;
  const c = Math.floor((mx - GUT) / colW);
  if (c < 0 || c >= nTok) return;
  if (Math.abs(my - yWord) < wordH / 2) { hover = { c, row: 'word' }; return; }
  for (let i = 0; i < rows.length; i++)
    if (Math.abs(my - rows[i].yc) < rows[i].h / 2) { hover = { c, row: i }; return; }
});
cv.addEventListener('mouseleave', () => { hover = null; });

window.addEventListener('resize', resize);

/* Debug-Zugriff für Tests: llmsim.skipTo(11) springt vor Runde 12 */
window.llmsim = {
  skipTo(r) {
    r = clamp(Math.round(r), 0, ROUNDS.length - 1);
    resetAll();
    nTok = N_INPUT + r;
    round = r;
    cache = r >= 4; setKv(cache, true); cacheBannerDone = r >= 4;
    steps = TOK.map((_, c) => c < nTok - (r > 0 ? 1 : 0) ? SUBS_PER_COL : 0);
    if (r > 0) steps[nTok - 1] = 0;
    for (let c = 0; c < nTok; c++) {
      if (steps[c] === SUBS_PER_COL)
        for (let s = 1; s <= SUBS_PER_COL; s++) doneAt[c][s] = simNow - 9;
      for (const key of ['a0', 'a1', 'a2', 'f0', 'f1', 'f2'])
        if (c < nTok - 1) capsShown.add(c + ':' + key);
    }
    costHist = [];
    totalCost = 0;
    for (let k = 0; k < r; k++) {
      const v = SUBS_PER_COL * (k < 4 ? N_INPUT + k : 1);
      costHist.push({ v, cached: k >= 4 });
      totalCost += v;
    }
    frozen = TOK.map((_, c) => cache && steps[c] === SUBS_PER_COL);
    queue = []; phase = null; waiting = true; stepping = false;
    setCap(`(Testsprung) Bereit vor Runde ${r + 1} – „${TOK[nTok - 1].w}“ ist das letzte Wort.`, '');
    updateStatus();
  },
  step: doStep, word: doWord, auto: doAuto,
  get state() {
    return { nTok, round, cache, waiting, phaseName: phase && phase.name, totalCost, ended, frozenCount: frozen.filter(Boolean).length };
  },
};

/* ---------- Hauptschleife (delta-basiert, bildratenunabhängig) ---------- */
let lastT = performance.now();
function frame(t) {
  const dt = clamp((t - lastT) / 1000, 0, 0.05);
  lastT = t;
  update(dt);
  updateLayout(dt);
  render();
  requestAnimationFrame(frame);
}

resize();
resetAll();
updateLayout(0.1);
requestAnimationFrame(frame);
