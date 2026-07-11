(() => {
'use strict';

// ============================================================================
// Bingolett-Simulator — Geldspielautomat von 1959
//
// Mechanik (mit dem Besitzer des Originals abgestimmt):
//  - Kugel wird unten rechts vom Schlagwerk in die Kreisbahn geschleudert,
//    läuft im Uhrzeigersinn (unten nach links, links hinauf) und verlässt
//    die Bahn oben links durch eine Einweg-Klammer ins Nadelfeld.
//  - Zu schwacher Schlag: Kugel erreicht die Klammer nicht, rollt zur
//    Bahn zurück ans Schlagwerk — der Wurf zählt nicht.
//  - Nadelfeld: 3 Reihen mit 12 / 13 / 14 Nadeln, darunter 14 Taschen
//    mit den Ziffern 4 1 3 2 4 3 1 4 2 4 3 1 2 4 (von links).
//  - Reine Säulen (3·3·3, 4·4·4, 1·1·1, 2·2·2) füllen sich von oben nach
//    unten: die n-te passende Ziffer zündet die n-te Zelle — egal in
//    welchem Wurf. Gemischte Säulen (1·2·3, 2·3·4, 1·3·4): jede Zelle
//    leuchtet, sobald ihre Ziffer fällt, Reihenfolge egal.
//  - Volle Säule nach dem 3. Durchgang: Betragsfeld leuchtet, Auszahlung.
//  - Nach jedem Durchgang hält der Automat die Kugel ca. 3 s im mittigen
//    Halter (Loch unter dem O von BINGOLETT) und gibt sie dann wieder
//    vor das Schlagwerk frei. Nach dem 3. Wurf bleibt sie dort, bis die
//    nächste Münze fällt. Während des Spiels zeigt das Karo "SPIEL FREI".
// ============================================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ---- Logische Größe --------------------------------------------------------
const W = 760, H = 1100;

// ---- Geometrie -------------------------------------------------------------
const GLASS = { x: 40, y: 50, w: 680, h: 890 };          // Glasfläche
const C = { x: 380, y: 635, r: 272 };                    // Spielfeld-Kreis
const BAND_OUT = 272, BAND_IN = 248;                     // Ringbahn-Band
const TRACK_R = 260;                                     // Kugel-Mittellinie
const WALL_R = 239;                                      // max. Abstand Kugelmitte (freier Flug)
const BALL_R = 9;

const EXIT_DEG = 322;                                    // Ende der Bahn (Klammer, oben links)
const EXIT_POS = clockPt(319, 232);                      // Startpunkt freier Flug
const EXIT_DIR = norm2(0.892, -0.452);                   // Abwurfrichtung (rechts-oben)

const HAMMER = { x: 648, y: 907 };                       // Ruheposition vor dem Schlagwerk
const HOLE = { x: 380, y: 838, r: 12 };                  // Kugelhalter unter dem O

// Nadelfeld: 3 Reihen (12/13/14), Raster 34 px
const PIN_R = 4.5;
const PIN_ROWS = [
    { y: 480, n: 12, x0: 193 },
    { y: 520, n: 13, x0: 176 },
    { y: 560, n: 14, x0: 159 },
];
const PINS = [];
for (const row of PIN_ROWS)
    for (let i = 0; i < row.n; i++) PINS.push({ x: row.x0 + i * 34, y: row.y });

// Taschen: 15 Stege, 14 Fächer
const POCKET_DIGITS = [4, 1, 3, 2, 4, 3, 1, 4, 2, 4, 3, 1, 2, 4];
const PICKET_X0 = 142, PICKET_PITCH = 34, PICKET_N = 15;
const PICKET_TOP = 600, PICKET_BOT = 688, PICKET_R = 4;
const FLOOR_Y = 688;
// Keile, die die äußersten Taschen zur Ringwand hin abdichten
const WEDGES = [
    { x1: 152, y1: 568, x2: 142, y2: 602 },
    { x1: 608, y1: 568, x2: 618, y2: 602 },
];

// ---- Zahlenfeld -------------------------------------------------------------
const COLUMNS = [
    { digits: [1, 2, 3], value: 10,  color: 'green'  },
    { digits: [3, 3, 3], value: 20,  color: 'yellow' },
    { digits: [4, 4, 4], value: 40,  color: 'red'    },
    { digits: [1, 1, 1], value: 100, color: 'blue'   },
    { digits: [2, 2, 2], value: 80,  color: 'red'    },
    { digits: [2, 3, 4], value: 20,  color: 'blue'   },
    { digits: [1, 3, 4], value: 10,  color: 'green'  },
];
const PURE = COLUMNS.map(c => c.digits[0] === c.digits[1] && c.digits[1] === c.digits[2]);
const CELL = { x0: 180, pitch: 58, w: 50, y0: 78, rowPitch: 52, h: 46, valueY: 240, valueH: 54 };
const COL_COLORS = {
    green:  { dim: '#1e3d28', lit: '#3ecb6e', digitDim: '#7fa88b' },
    yellow: { dim: '#4a3a10', lit: '#ffd23e', digitDim: '#b3a06a' },
    red:    { dim: '#471712', lit: '#ff5844', digitDim: '#b08078' },
    blue:   { dim: '#16294d', lit: '#4d8aff', digitDim: '#7d92b8' },
};
const DIGIT_CHIP_COLORS = { 1: '#c03428', 2: '#2456a8', 3: '#c98f14', 4: '#2e7d46' };

// ---- Physik ----------------------------------------------------------------
const STEP = 1 / 240;            // fester Zeitschritt (bildratenunabhängig)
const TUNE = {
    G: 1500,                     // Schwerkraft px/s²
    ROLL: 60,                    // Rollreibung auf der Bahn px/s²
    DRAG: 0.0001,                // quadratischer Widerstand auf der Bahn
    V_MIN: 1170, V_MAX: 1630,    // Abschussgeschwindigkeit bei Kraft 0..1
};
const REST_PIN = 0.55, REST_WALL = 0.45, REST_PICKET = 0.4, REST_FLOOR = 0.2;

// ---- Hilfsfunktionen ---------------------------------------------------------
function clockPt(deg, r) {       // Uhrzeiger-Winkel: 0 = 12 Uhr, im Uhrzeigersinn
    const a = deg * Math.PI / 180;
    return { x: C.x + r * Math.sin(a), y: C.y - r * Math.cos(a) };
}
function norm2(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fmtPf(pf) {
    if (pf < 100) return pf + ' Pf';
    return (pf / 100).toFixed(2).replace('.', ',') + ' DM';
}

// ---- Bahn als 1D-Pfad --------------------------------------------------------
// Schlagwerk (s=0) → waagerechte Rampe (Tangente an die Kreisbahn) → unterer
// Scheitelpunkt → Bogen im Uhrzeigersinn links hinauf → Klammer (s=S_END).
// Kugelzustand auf der Bahn: (s, v).
const TRACK = buildTrack();
function buildTrack() {
    const raw = [];
    // Rampe: optisch waagerecht, minimal zum Schlagwerk geneigt, damit die
    // freigegebene Kugel von selbst vor das Schlagwerk rollt. Sie mündet
    // tangential in den unteren Scheitel der Kreisbahn — kein Hügel.
    const tangent = clockPt(180, TRACK_R);
    const steps = Math.ceil((HAMMER.x - tangent.x) / 3);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        raw.push({
            x: HAMMER.x + (tangent.x - HAMMER.x) * t,
            y: HAMMER.y + (tangent.y - HAMMER.y) * t,
        });
    }
    // Kreisbogen vom Scheitel im Uhrzeigersinn (unten → links hinauf) zur Klammer
    for (let d = 181; d <= EXIT_DEG; d += 1) raw.push(clockPt(d, TRACK_R));

    // gleichmäßig neu abtasten (ds ≈ 3 px)
    const xs = [raw[0].x], ys = [raw[0].y], ss = [0];
    let acc = 0, last = raw[0];
    for (let i = 1; i < raw.length; i++) {
        const p = raw[i];
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        acc += d;
        if (acc >= 3) {
            xs.push(p.x); ys.push(p.y);
            ss.push(ss[ss.length - 1] + acc);
            acc = 0;
        }
        last = p;
    }
    return { xs, ys, ss, len: ss[ss.length - 1] };
}
function trackIndex(s) {
    // binäre Suche nach Segment
    let lo = 0, hi = TRACK.ss.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (TRACK.ss[mid] <= s) lo = mid; else hi = mid;
    }
    return lo;
}
function trackPos(s) {
    s = clamp(s, 0, TRACK.len);
    const i = trackIndex(s);
    const t = (s - TRACK.ss[i]) / (TRACK.ss[i + 1] - TRACK.ss[i]);
    return {
        x: TRACK.xs[i] + (TRACK.xs[i + 1] - TRACK.xs[i]) * t,
        y: TRACK.ys[i] + (TRACK.ys[i + 1] - TRACK.ys[i]) * t,
    };
}
function trackSlope(s) {         // dy/ds (Canvas: +y = abwärts)
    const i = clamp(trackIndex(s), 1, TRACK.ss.length - 2);
    return (TRACK.ys[i + 1] - TRACK.ys[i - 1]) / (TRACK.ss[i + 1] - TRACK.ss[i - 1]);
}
const TRACK_DROP_S = (() => {    // Bahnposition unter dem Kugelhalter
    let best = 0, bd = 1e9;
    for (let i = 0; i < TRACK.xs.length; i++) {
        const d = Math.abs(TRACK.xs[i] - HOLE.x);
        if (TRACK.ys[i] > 800 && d < bd) { bd = d; best = i; }
    }
    return TRACK.ss[best];
})();

// ---- Spielzustand ------------------------------------------------------------
const S = {
    mode: 'ATTRACT',     // ATTRACT | INIT | RELEASE | AIM | ON_TRACK | IN_FIELD | POCKETED | PROGRAM | PAYOUT
    timer: 0,
    throwsDone: [],      // gefallene Ziffern des laufenden Spiels
    attempt: 1,          // 1..3 (nächster zu wertender Wurf)
    lit: COLUMNS.map(() => [false, false, false]),
    valueLit: COLUMNS.map(() => false),
    spielFrei: false,
    kontrolle: false,    // KONTROLLE-Knopf gedrückt: zeigt das gehaltene Relais-Bild
    msg: 'Münze einwerfen (Knopf rechts am Gerät oder Taste M).',
    charging: false,
    power: 0, powerDir: 1,
    leverAnim: 0,        // 0..1 Rückschnell-Animation
    kasseIn: 0, kasseOut: 0,
    lastWin: null,
    stuckTime: 0,
    ratchetT: 0,
    clatterT: 0,         // Schreibmaschinen-Klappern der Initialisierung
    flicker: 0,          // Flacker-Fenster der Lampen
    flickerScope: 'mixed', // 'mixed': nur gemischte Säulen (Init) | 'all': alles inkl. Gewinnfelder (Auszahlung)
    initPhase: null,     // show | fill | value | dark
    initFillTicks: 0,
    ball: {
        state: 'HELD',   // HELD (im Halter) | DROP | TRACK | FREE | SETTLE | SINK | HIDDEN | REST (am Schlagwerk)
        x: HOLE.x, y: HOLE.y, vx: 0, vy: 0,
        s: 0, v: 0,      // Bahnkoordinaten
        sink: 0,
        pocket: -1,
    },
    coins: [],           // Auszahl-Münzen in der Schale
    coinQueue: 0, coinDelay: 0,
};

// ---- Lampenlogik --------------------------------------------------------------
function computeLit(throwsArr) {
    return COLUMNS.map(col => {
        const pure = col.digits[0] === col.digits[1] && col.digits[1] === col.digits[2];
        if (pure) {
            const d = col.digits[0];
            const n = Math.min(3, throwsArr.filter(t => t === d).length);
            return [n >= 1, n >= 2, n >= 3];
        }
        return col.digits.map(d => throwsArr.includes(d));
    });
}
function refreshLamps() { S.lit = computeLit(S.throwsDone); }

// ---- Initialisierung beim Münzeinwurf -------------------------------------------
// Die Relais halten das letzte Ergebnis (Beleuchtung aus, KONTROLLE zeigt es).
// Um sie auf Null zu bringen, lässt der Automat das Programm zu Ende laufen:
// Das alte Bild leuchtet unverändert auf, dann werden im ~300-ms-Takt die
// angefangenen reinen Säulen Ziffer für Ziffer aufgefüllt, deren Gewinnfelder
// blitzen kurz, dann fällt alles ab. Bereits leuchtende Ziffern der gemischten
// Säulen flackern im gleichen Rhythmus mit.
function computeInitFillTicks() {
    let ticks = 0;
    COLUMNS.forEach((col, i) => {
        if (!PURE[i]) return;
        const n = S.lit[i].filter(Boolean).length;
        if (n > 0) ticks = Math.max(ticks, 3 - n);
    });
    return ticks;
}
function applyInitFill() {
    COLUMNS.forEach((col, i) => {
        if (!PURE[i]) return;
        const n = S.lit[i].filter(Boolean).length;
        if (n > 0 && n < 3) S.lit[i][n] = true;
    });
}
function applyInitValue() {
    S.lit.forEach((rows, i) => {
        if (rows[0] && rows[1] && rows[2]) S.valueLit[i] = true;
    });
}
function stepInit() {
    if (S.initPhase === 'show' || S.initPhase === 'fill') {
        if (S.initFillTicks > 0) {
            applyInitFill();
            S.initFillTicks--;
            S.initPhase = 'fill';
            S.flicker = 0.18;
            S.flickerScope = 'mixed';
            AudioFX.klack();
            S.timer = 0.3;
        } else {
            applyInitValue();
            S.initPhase = 'value';
            S.flicker = 0.18;
            S.flickerScope = 'mixed';
            AudioFX.klack();
            S.timer = 0.35;
        }
    } else if (S.initPhase === 'value') {
        // Relais fallen ab: alles dunkel, Zählwerk steht auf Null
        S.lit = COLUMNS.map(() => [false, false, false]);
        S.valueLit = COLUMNS.map(() => false);
        S.throwsDone = [];
        S.attempt = 1;
        S.initPhase = 'dark';
        S.timer = 0.3;
    } else {
        S.msg = 'Spiel frei! Der Automat gibt die Kugel frei …';
        setMode('RELEASE', 0.05);
    }
}

// ---- Audio ---------------------------------------------------------------------
const AudioFX = (() => {
    let ac = null, master = null, muted = false;
    let rollSrc = null, rollGain = null;
    function ensure() {
        if (ac) return true;
        try {
            ac = new (window.AudioContext || window.webkitAudioContext)();
            master = ac.createGain();
            master.gain.value = 0.5;
            master.connect(ac.destination);
            // Rollgeräusch: gefiltertes Rauschen, Lautstärke folgt der Kugel
            const len = ac.sampleRate * 1;
            const buf = ac.createBuffer(1, len, ac.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
            rollSrc = ac.createBufferSource();
            rollSrc.buffer = buf; rollSrc.loop = true;
            const bp = ac.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
            rollGain = ac.createGain(); rollGain.gain.value = 0;
            rollSrc.connect(bp); bp.connect(rollGain); rollGain.connect(master);
            rollSrc.start();
        } catch (e) { ac = null; }
        return !!ac;
    }
    function env(node, t0, vol, dur) {
        const g = ac.createGain();
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        node.connect(g); g.connect(master);
        return g;
    }
    function blip(freq, vol, dur, type, delay) {
        if (!ensure() || muted) return;
        const t0 = ac.currentTime + (delay || 0);
        const o = ac.createOscillator();
        o.type = type || 'square'; o.frequency.value = freq;
        env(o, t0, vol, dur);
        o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noiseBurst(vol, dur, freq, delay) {
        if (!ensure() || muted) return;
        const t0 = ac.currentTime + (delay || 0);
        const len = Math.max(1, (ac.sampleRate * dur) | 0);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource(); src.buffer = buf;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
        const g = env(bp, t0, vol, dur);
        src.connect(bp);
        src.start(t0);
    }
    return {
        unlock() { if (ensure() && ac.state === 'suspended') ac.resume(); },
        get muted() { return muted; },
        toggleMute() { muted = !muted; if (rollGain) rollGain.gain.value = 0; return muted; },
        klack()   { blip(1800, 0.25, 0.04); noiseBurst(0.2, 0.05, 2400); },   // Relais / Münze
        thock()   { blip(110, 0.5, 0.08, 'sine'); noiseBurst(0.3, 0.05, 700); }, // Schlagwerk
        tick(v)   { noiseBurst(clamp(v, 0.05, 0.35), 0.03, 1900 + Math.random() * 900); }, // Nadel
        plop()    { blip(240, 0.4, 0.1, 'sine'); blip(90, 0.3, 0.12, 'sine'); },  // Tasche
        ratchet() { noiseBurst(0.12, 0.025, 1300); },                          // Programmwerk
        coin()    { noiseBurst(0.35, 0.1, 3400); blip(3000 + Math.random() * 500, 0.12, 0.09, 'triangle'); },
        typebar() { noiseBurst(0.16, 0.02, 2300 + Math.random() * 1500); if (Math.random() < 0.3) blip(2600 + Math.random() * 900, 0.05, 0.025, 'triangle'); },
        kasching() {
            // schwerer Auszahlhebel drückt die unterste Münze aus der Säule …
            blip(85 + Math.random() * 20, 0.6, 0.11, 'sine');
            noiseBurst(0.45, 0.05, 800);
            // … und die Münzsäule rutscht klirrend um eine Münzbreite nach
            noiseBurst(0.4, 0.07, 3100, 0.05);
            blip(2300 + Math.random() * 700, 0.18, 0.07, 'triangle', 0.06);
            noiseBurst(0.3, 0.06, 4300, 0.1);
        },
        roll(v)   { if (rollGain && !muted) rollGain.gain.value = clamp(Math.abs(v) / 2600, 0, 1) * 0.22; },
        rollOff() { if (rollGain) rollGain.gain.value = 0; },
    };
})();

// ---- Spielablauf ----------------------------------------------------------------
function insertCoin() {
    if (S.mode !== 'ATTRACT') return false;
    AudioFX.unlock(); AudioFX.klack();
    S.kasseIn += 10;
    S.attempt = 1;
    S.coins = []; S.coinQueue = 0;
    S.lastWin = null;
    S.kontrolle = false;
    S.initFillTicks = computeInitFillTicks();
    S.initPhase = 'show';
    S.clatterT = 0;
    S.msg = 'Der Automat nullt das Zahlenfeld — das Programmwerk rattert durch …';
    setMode('INIT', 0.35);
    return true;
}
function setMode(m, t) { S.mode = m; S.timer = t || 0; }

function startRelease() {
    // Kugel fällt aus dem Halter unten in die Kreisbahn und rollt vor das
    // Schlagwerk — genau jetzt leuchtet „SPIEL FREI“ wieder auf
    const b = S.ball;
    b.state = 'DROP';
    b.x = HOLE.x; b.y = HOLE.y; b.vx = 0; b.vy = 0;
    S.spielFrei = true;
}
function launch() {
    if (S.mode !== 'AIM') return;
    const p = S.power;
    const jitter = 1 + (Math.random() - 0.5) * 0.016;
    const b = S.ball;
    b.state = 'TRACK';
    b.s = 0;
    b.v = (TUNE.V_MIN + p * (TUNE.V_MAX - TUNE.V_MIN)) * jitter;
    S.leverAnim = 1;
    S.charging = false;
    AudioFX.thock();
    setMode('ON_TRACK');
    S.msg = `${S.attempt}. Wurf: Die Kugel läuft …`;
}

function registerPocket(idx) {
    const digit = POCKET_DIGITS[idx];
    S.throwsDone.push(digit);
    refreshLamps();
    S.spielFrei = false; // Tasche erreicht: „SPIEL FREI“ erlischt, die Ziffer leuchtet auf
    AudioFX.klack();
    S.msg = `Die Kugel fällt in Tasche „${digit}“.`;
    // Nach der dritten Ziffer schalten die Relais einen Gewinn sofort durch:
    // das Betragsfeld zündet zeitgleich mit der dritten Zahl
    if (S.throwsDone.length >= 3) {
        let win = 0, winCol = -1;
        S.lit.forEach((rows, i) => {
            if (rows[0] && rows[1] && rows[2]) { win = COLUMNS[i].value; winCol = i; }
        });
        if (winCol >= 0) {
            S.valueLit[winCol] = true;
            S.lastWin = win;
            S.kasseOut += win;
            S.coinQueue = Math.round(win / 10);   // Auszahlung in 10-Pf-Stücken
            S.coinDelay = 0.9;                    // der Auswerfer braucht einen Moment
            S.msg = `Gewinn: ${fmtPf(win)}! Die Münzen fallen in die Schale.`;
            AudioFX.klack();
        } else {
            S.lastWin = 0;
        }
    }
}

// ---- Physik: ein fester Zeitschritt ----------------------------------------------
function update(dt) {
    const b = S.ball;

    // Kraftbalken (Pendeln zwischen 0 und 1, solange gehalten — auch schon,
    // während die Kugel noch zum Schlagwerk rollt)
    if (S.charging) {
        S.power += S.powerDir * 0.85 * dt;
        if (S.power >= 1) { S.power = 1; S.powerDir = -1; }
        if (S.power <= 0) { S.power = 0; S.powerDir = 1; }
    }
    if (S.leverAnim > 0) S.leverAnim = Math.max(0, S.leverAnim - dt * 4);

    // Modus-Timer
    if (S.timer > 0) {
        S.timer -= dt;
        if (S.timer <= 0) {
            if (S.mode === 'RELEASE') startRelease();
            else if (S.mode === 'INIT') stepInit();
            else if (S.mode === 'PAYOUT') setMode('ATTRACT');
            else if (S.mode === 'PROGRAM') {
                if (S.throwsDone.length >= 3) {
                    // Spielende: Gewinn wurde schon beim Taschentreffer geschaltet
                    if (S.lastWin > 0) S.msg = `Gewinn: ${fmtPf(S.lastWin)}! Münze einwerfen für ein neues Spiel.`;
                    else S.msg = 'Leider kein Gewinn. Das Zahlenfeld erlischt — KONTROLLE zeigt das Ergebnis noch einmal.';
                    if (S.coinQueue > 0) setMode('PAYOUT');
                    else setMode('ATTRACT');
                } else {
                    S.attempt = S.throwsDone.length + 1;
                    S.msg = 'Der Automat gibt die Kugel für den nächsten Wurf frei …';
                    setMode('RELEASE', 0.3);
                }
            }
        }
    }

    // Programmwerk-Ticken hörbar machen
    if (S.mode === 'PROGRAM') {
        S.ratchetT -= dt;
        if (S.ratchetT <= 0) { AudioFX.ratchet(); S.ratchetT = 0.45; }
    }

    // Initialisierung: Relais-Klappern wie bei einer alten Schreibmaschine
    if (S.mode === 'INIT') {
        S.clatterT -= dt;
        if (S.clatterT <= 0) { AudioFX.typebar(); S.clatterT = 0.045 + Math.random() * 0.035; }
    }
    if (S.flicker > 0) S.flicker -= dt;

    // Auszahlung: ein schwerer Hebel drückt alle ~300 ms die unterste Münze
    // aus der Münzsäule — „Kasching“, die Lampen flackern bei jedem Hub
    if (S.coinQueue > 0) {
        S.coinDelay -= dt;
        if (S.coinDelay <= 0) {
            S.coinDelay = 0.3;
            S.coinQueue--;
            S.coins.push({
                x: 380 + (Math.random() - 0.5) * 50, y: 946,
                vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 40,
                rot: Math.random() * Math.PI, settled: false,
            });
            AudioFX.kasching();
            S.flicker = 0.2;
            S.flickerScope = 'all';
            if (S.coinQueue === 0 && S.mode === 'PAYOUT') S.timer = 0.8; // kurzer Nachklang
        }
    }
    for (const c of S.coins) {
        if (c.settled) continue;
        c.vy += TUNE.G * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        const floor = 1000 + Math.sin(c.x * 0.3) * 6;
        if (c.y >= floor) {
            c.y = floor;
            if (Math.abs(c.vy) < 60) { c.settled = true; }
            else { c.vy *= -0.35; c.vx *= 0.6; AudioFX.coin(); }
        }
        c.x = clamp(c.x, 310, 450);
    }

    // ---- Kugel ----
    switch (b.state) {
        case 'DROP': {
            b.vy += TUNE.G * dt;
            b.y += b.vy * dt;
            const target = trackPos(TRACK_DROP_S);
            if (b.y >= target.y) {
                b.state = 'TRACK';
                b.s = TRACK_DROP_S;
                b.v = -180;             // rollt zum Schlagwerk (abnehmendes s)
                AudioFX.tick(0.15);
            }
            break;
        }
        case 'TRACK': {
            const slope = trackSlope(b.s);
            let a = TUNE.G * slope;
            if (b.v !== 0) a -= TUNE.ROLL * Math.sign(b.v) + TUNE.DRAG * b.v * Math.abs(b.v);
            b.v += a * dt;
            b.s += b.v * dt;
            AudioFX.roll(b.v);
            if (b.s >= TRACK.len) {
                // Klammer passiert → freier Flug ins Nadelfeld
                b.state = 'FREE';
                b.x = EXIT_POS.x; b.y = EXIT_POS.y;
                const ve = Math.max(60, b.v * 0.96);
                S.lastExitV = ve;
                b.vx = EXIT_DIR.x * ve; b.vy = EXIT_DIR.y * ve;
                S.stuckTime = 0;
                AudioFX.rollOff();
                if (S.mode === 'ON_TRACK') setMode('IN_FIELD');
            } else if (b.s <= 0) {
                // Anschlag am Schlagwerk: die Kugel bleibt liegen
                b.s = 0;
                if (Math.abs(b.v) > 60) AudioFX.tick(Math.min(0.3, Math.abs(b.v) / 900));
                b.v = 0; b.state = 'REST';
                AudioFX.rollOff();
                if (S.mode === 'ON_TRACK') {
                    S.msg = S.charging
                        ? 'Zu schwach! Die Kugel ist zurück — loslassen zum neuen Schlag!'
                        : 'Zu schwach! Die Kugel rollt zurück — Wurf wiederholen.';
                    setMode('AIM');
                } else {
                    setMode('AIM');
                    S.msg = S.charging
                        ? 'Die Kugel liegt am Schlagwerk — loslassen zum Schleudern!'
                        : `${S.attempt}. Wurf: Schlagknopf halten und im richtigen Moment loslassen.`;
                }
                // eine bereits laufende Aufladung bleibt erhalten
                if (!S.charging) { S.power = 0; S.powerDir = 1; }
            } else {
                const p = trackPos(b.s);
                b.x = p.x; b.y = p.y;
            }
            break;
        }
        case 'FREE': {
            b.vy += TUNE.G * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            collideFree(b);
            // Fangtasche erreicht?
            if (b.y + BALL_R >= FLOOR_Y && b.vy >= -10) {
                const idx = clamp(Math.floor((b.x - PICKET_X0) / PICKET_PITCH), 0, 13);
                b.pocket = idx;
                b.x = PICKET_X0 + PICKET_PITCH * (idx + 0.5);
                b.y = FLOOR_Y - BALL_R;
                b.vx = 0; b.vy = 0;
                b.state = 'SETTLE';
                b.sink = 0;
                AudioFX.plop();
                setMode('POCKETED', 0.35);
            }
            // Notanstoß, falls die Kugel auf einem Steg liegen bleibt
            if (Math.hypot(b.vx, b.vy) < 9 && b.y < FLOOR_Y - BALL_R - 2) {
                S.stuckTime += dt;
                if (S.stuckTime > 0.6) {
                    b.vx += (Math.random() - 0.5) * 60;
                    b.vy -= 25;
                    S.stuckTime = 0;
                }
            } else S.stuckTime = 0;
            break;
        }
        case 'SETTLE': {
            if (S.mode === 'POCKETED' && S.timer <= 0) {
                registerPocket(b.pocket);
                b.state = 'SINK'; b.sink = 0;
                setMode('PROGRAM', 3.0);
                S.ratchetT = 0.4;
            }
            break;
        }
        case 'SINK': {
            b.sink = Math.min(1, b.sink + dt * 2.2);
            if (b.sink >= 1) b.state = 'HIDDEN';
            break;
        }
    }

    // Nach dem 3. Wurf bzw. im Ruhezustand liegt die Kugel sichtbar im Halter
    if (S.mode === 'ATTRACT' && b.state !== 'HELD') {
        b.state = 'HELD'; b.x = HOLE.x; b.y = HOLE.y;
    }
}

// Kollisionsbehandlung der frei fliegenden Kugel
function collideFree(b) {
    // Ringwand (Kugel bleibt im Kreis)
    if (b.y < 606) {
        const dx = b.x - C.x, dy = b.y - C.y;
        const d = Math.hypot(dx, dy);
        if (d > WALL_R) {
            const nx = -dx / d, ny = -dy / d;   // Normale nach innen
            b.x = C.x + dx / d * WALL_R;
            b.y = C.y + dy / d * WALL_R;
            reflect(b, nx, ny, REST_WALL, 0.99);
            AudioFX.tick(Math.abs(b.vx * nx + b.vy * ny) / 1500);
        }
    }
    // Nadeln
    for (const p of PINS) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const rr = BALL_R + PIN_R;
        if (dx * dx + dy * dy < rr * rr) {
            const d = Math.hypot(dx, dy) || 0.001;
            const nx = dx / d, ny = dy / d;
            b.x = p.x + nx * rr;
            b.y = p.y + ny * rr;
            const vn = b.vx * nx + b.vy * ny;
            reflect(b, nx, ny, REST_PIN, 0.985);
            if (vn < -60) AudioFX.tick(-vn / 900);
        }
    }
    // Stege (Kapseln) + Keile
    for (let k = 0; k < PICKET_N; k++)
        collideCapsule(b, PICKET_X0 + k * PICKET_PITCH, PICKET_TOP, PICKET_X0 + k * PICKET_PITCH, PICKET_BOT, PICKET_R, REST_PICKET);
    for (const w of WEDGES) collideCapsule(b, w.x1, w.y1, w.x2, w.y2, 5, REST_PICKET);
}
function collideCapsule(b, x1, y1, x2, y2, r, rest) {
    const abx = x2 - x1, aby = y2 - y1;
    const t = clamp(((b.x - x1) * abx + (b.y - y1) * aby) / (abx * abx + aby * aby), 0, 1);
    const px = x1 + abx * t, py = y1 + aby * t;
    const dx = b.x - px, dy = b.y - py;
    const rr = BALL_R + r;
    if (dx * dx + dy * dy < rr * rr) {
        const d = Math.hypot(dx, dy) || 0.001;
        const nx = dx / d, ny = dy / d;
        b.x = px + nx * rr;
        b.y = py + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        reflect(b, nx, ny, rest, 0.99);
        if (vn < -80) AudioFX.tick(-vn / 1200);
    }
}
function reflect(b, nx, ny, rest, fric) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    b.vx -= (1 + rest) * vn * nx;
    b.vy -= (1 + rest) * vn * ny;
    b.vx *= fric; b.vy *= fric;
}

// ============================================================================
// Zeichnen
// ============================================================================
let SCALE = 1;
let bgLayer = null, fgLayer = null;

function makeLayer() {
    const c = document.createElement('canvas');
    c.width = W * SCALE; c.height = H * SCALE;
    const g = c.getContext('2d');
    g.scale(SCALE, SCALE);
    return { canvas: c, g };
}

// deterministischer Zufall für Dekor (Sterne)
function lcg(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function drawStar(g, x, y, r, color) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.42;
        g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
}

function buildBackground() {
    bgLayer = makeLayer(); fgLayer = makeLayer();
    const g = bgLayer.g;

    // ---- Gehäuse ----
    g.fillStyle = '#101216'; g.fillRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 26);
    const cab = g.createLinearGradient(0, 0, W, 0);
    cab.addColorStop(0, '#d6c9a8'); cab.addColorStop(0.5, '#efe4c6'); cab.addColorStop(1, '#cdbf9d');
    g.fillStyle = cab; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#8a7648'; g.stroke();

    // Goldrahmen um die Glasfläche
    for (const [inset, col, lw] of [[0, '#8a6d2f', 10], [7, '#d9b95c', 6], [12, '#a8842f', 3]]) {
        roundRect(g, GLASS.x - 14 + inset, GLASS.y - 14 + inset, GLASS.w + 28 - inset * 2, GLASS.h + 28 - inset * 2, 16 - inset);
        g.strokeStyle = col; g.lineWidth = lw; g.stroke();
    }
    // Art-déco-Eckwinkel
    g.strokeStyle = '#7c6226'; g.lineWidth = 4;
    for (const [ex, ey, sx, sy] of [[GLASS.x, GLASS.y, 1, 1], [GLASS.x + GLASS.w, GLASS.y, -1, 1], [GLASS.x, GLASS.y + GLASS.h, 1, -1], [GLASS.x + GLASS.w, GLASS.y + GLASS.h, -1, -1]]) {
        for (let i = 1; i <= 3; i++) {
            g.beginPath();
            g.moveTo(ex + sx * (6 + i * 9), ey + sy * 2);
            g.lineTo(ex + sx * 2, ey + sy * 2);
            g.lineTo(ex + sx * 2, ey + sy * (6 + i * 9));
            g.stroke();
        }
    }

    // ---- Glas-Hintergrund ----
    g.save();
    roundRect(g, GLASS.x, GLASS.y, GLASS.w, GLASS.h, 8);
    g.clip();
    g.fillStyle = '#141b33';
    g.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);

    // Rautengitter unten, Sternenhimmel oben
    g.save();
    g.beginPath();
    g.rect(GLASS.x, 560, GLASS.w, GLASS.h);
    g.clip();
    g.fillStyle = '#0e0e14';
    g.fillRect(GLASS.x, 560, GLASS.w, GLASS.h - 510);
    g.strokeStyle = 'rgba(214,203,178,0.4)';
    g.lineWidth = 1.4;
    for (let x = GLASS.x - 400; x < GLASS.x + GLASS.w + 400; x += 24) {
        g.beginPath(); g.moveTo(x, 540); g.lineTo(x + 420, 960); g.stroke();
        g.beginPath(); g.moveTo(x, 540); g.lineTo(x - 420, 960); g.stroke();
    }
    g.restore();

    // Sterne (deterministisch)
    const rnd = lcg(19590412);
    const starCols = ['#c03428', '#2e7d46', '#d9a520', '#2456a8', '#e8e2d0'];
    let placed = 0, guard = 0;
    while (placed < 90 && guard++ < 4000) {
        const x = GLASS.x + 14 + rnd() * (GLASS.w - 28);
        const y = GLASS.y + 290 + rnd() * (560 - GLASS.y - 300);
        const d = Math.hypot(x - C.x, y - C.y);
        if (d < C.r + 12) continue;
        drawStar(g, x, y, 3.5 + rnd() * 5.5, starCols[placed % starCols.length]);
        placed++;
    }
    for (let i = 0; i < 70; i++) {
        const x = GLASS.x + 10 + rnd() * (GLASS.w - 20);
        const y = GLASS.y + 285 + rnd() * 265;
        if (Math.hypot(x - C.x, y - C.y) < C.r + 8) continue;
        g.fillStyle = 'rgba(232,226,208,0.7)';
        g.fillRect(x, y, 1.6, 1.6);
    }

    // ---- Zahlenfeld-Kopf ----
    g.fillStyle = '#10162b';
    g.fillRect(GLASS.x, GLASS.y, GLASS.w, 280);
    g.strokeStyle = '#a8842f'; g.lineWidth = 2;
    g.strokeRect(GLASS.x + 3, GLASS.y + 3, GLASS.w - 6, 274);

    drawPlacard(g, 52, 70, 118, 250, 'SPIELREGEL', ['DREIMAL', 'GEWINNPLAN']);
    drawPlacard(g, 590, 70, 118, 250, 'EINWURF', ['10 PFENNIG']);

    // Zellen (ungezündeter Grundzustand) — die Leuchte wird dynamisch übermalt
    for (let c2 = 0; c2 < 7; c2++) drawColumnBase(g, c2);

    // ---- Spielfeld ----
    drawTailBand(g);
    drawRing(g);

    // Nadelfeld-Platte
    g.save();
    g.beginPath();
    g.arc(C.x, C.y, 236, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#cfc4a6';
    g.fillRect(C.x - 240, GLASS.y, 480, PICKET_TOP - GLASS.y);
    const plateShade = g.createLinearGradient(0, 380, 0, PICKET_TOP);
    plateShade.addColorStop(0, 'rgba(70,60,40,0.35)');
    plateShade.addColorStop(0.25, 'rgba(0,0,0,0)');
    plateShade.addColorStop(1, 'rgba(70,60,40,0.25)');
    g.fillStyle = plateShade;
    g.fillRect(C.x - 240, GLASS.y, 480, PICKET_TOP - GLASS.y);
    // ungenutzte Lochreihen (Optik wie beim Original)
    g.fillStyle = 'rgba(60,48,30,0.5)';
    for (const row of [{ y: 442, n: 11, x0: 210 }, { y: 410, n: 10, x0: 227 }])
        for (let i = 0; i < row.n; i++) {
            g.beginPath(); g.arc(row.x0 + i * 34, row.y, 3, 0, Math.PI * 2); g.fill();
        }
    // Bereich unter den Taschen: dunkel
    g.fillStyle = '#0c0c11';
    g.fillRect(C.x - 240, FLOOR_Y + 2, 480, 400);
    g.restore();

    // Nadeln (Kupferstifte mit Messinghülse)
    for (const p of PINS) {
        g.beginPath(); g.arc(p.x, p.y, PIN_R + 2.2, 0, Math.PI * 2);
        g.fillStyle = '#6e4a24'; g.fill();
        g.beginPath(); g.arc(p.x - 0.8, p.y - 0.8, PIN_R, 0, Math.PI * 2);
        g.fillStyle = '#c98a52'; g.fill();
        g.beginPath(); g.arc(p.x - 1.6, p.y - 1.6, 1.6, 0, Math.PI * 2);
        g.fillStyle = '#f0d0a8'; g.fill();
    }

    // Stege („Lattenzaun“) + Keile
    for (let k = 0; k < PICKET_N; k++) {
        const x = PICKET_X0 + k * PICKET_PITCH;
        g.beginPath();
        g.moveTo(x - PICKET_R, PICKET_BOT);
        g.lineTo(x - PICKET_R, PICKET_TOP + 4);
        g.arc(x, PICKET_TOP + 4, PICKET_R, Math.PI, 0);
        g.lineTo(x + PICKET_R, PICKET_BOT);
        g.closePath();
        const pg = g.createLinearGradient(x - 5, 0, x + 5, 0);
        pg.addColorStop(0, '#b9ad8f'); pg.addColorStop(0.5, '#f2ead6'); pg.addColorStop(1, '#a99c7c');
        g.fillStyle = pg; g.fill();
        g.strokeStyle = 'rgba(80,66,40,0.6)'; g.lineWidth = 1; g.stroke();
    }
    g.strokeStyle = '#e8dfc8'; g.lineWidth = 9; g.lineCap = 'round';
    for (const w2 of WEDGES) {
        g.beginPath(); g.moveTo(w2.x1, w2.y1); g.lineTo(w2.x2, w2.y2); g.stroke();
    }
    // Taschenboden
    g.fillStyle = '#1a1610';
    g.fillRect(PICKET_X0 - 6, FLOOR_Y, PICKET_PITCH * 14 + 12, 6);

    // ---- Emblem ----
    drawEmblem(g);

    // Kugelhalter-Loch
    const hg = g.createRadialGradient(HOLE.x, HOLE.y, 2, HOLE.x, HOLE.y, HOLE.r + 4);
    hg.addColorStop(0, '#000');
    hg.addColorStop(0.75, '#101014');
    hg.addColorStop(1, '#2a2a30');
    g.beginPath(); g.arc(HOLE.x, HOLE.y, HOLE.r + 3, 0, Math.PI * 2);
    g.fillStyle = hg; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 2; g.stroke();

    // Ösen (Klammer-Austritt oben links, Zieröse oben rechts)
    for (const deg of [320, 40]) {
        const p = clockPt(deg, BAND_IN);
        g.beginPath(); g.arc(p.x, p.y, 13, 0, Math.PI * 2);
        g.strokeStyle = '#d9b95c'; g.lineWidth = 5; g.stroke();
        g.beginPath(); g.arc(p.x, p.y, 13, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(90,70,20,0.8)'; g.lineWidth = 1.5; g.stroke();
    }

    g.restore(); // Glas-Clip Ende

    // ---- Untere Blende ----
    const apronY = GLASS.y + GLASS.h + 16;
    // KONTROLLE-Knopf
    g.beginPath(); g.arc(150, 992, 26, 0, Math.PI * 2);
    g.fillStyle = '#c9a24b'; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#5c4a1e';
    g.font = 'bold 8px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save();
    g.translate(150, 992);
    for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.32;
        g.save(); g.translate(Math.cos(a) * 19.5, Math.sin(a) * 19.5); g.rotate(a + Math.PI / 2);
        g.fillText('KONTROLLE'[i], 0, 0);
        g.restore();
    }
    g.restore();

    // Auszahlschale
    g.beginPath(); g.ellipse(380, 1002, 92, 42, 0, 0, Math.PI * 2);
    g.fillStyle = '#b9945a'; g.fill();
    g.beginPath(); g.ellipse(380, 1002, 78, 32, 0, 0, Math.PI * 2);
    const tg = g.createRadialGradient(380, 998, 8, 380, 1002, 80);
    tg.addColorStop(0, '#241d12'); tg.addColorStop(1, '#0e0b06');
    g.fillStyle = tg; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 2; g.stroke();

    // Schlagwerk-Konsole
    roundRect(g, 590, 942, 120, 84, 10);
    g.fillStyle = '#c9a24b'; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#5c4a1e';
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillText('SCHLAGWERK', 650, 1016);
    // Kabel zum Glas
    g.strokeStyle = '#e5e2da'; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(668, 948);
    g.bezierCurveTo(700, 915, 690, 890, 655, 902);
    g.stroke();

    // Kraftanzeige-Gehäuse
    roundRect(g, 552, 946, 26, 118, 8);
    g.fillStyle = '#c9a24b'; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#1c1610';
    g.fillRect(558, 952, 14, 100);
    g.fillStyle = '#5c4a1e';
    g.font = 'bold 8px system-ui, sans-serif';
    g.fillText('KRAFT', 565, 1072);

    // Münzplatte rechts an der Seitenleiste
    roundRect(g, 722, 330, 34, 148, 6);
    g.fillStyle = '#c9a24b'; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#241d12';
    roundRect(g, 735, 344, 8, 58, 3); g.fill();
    g.save();
    g.translate(739, 452); g.rotate(-Math.PI / 2);
    g.fillStyle = '#5c4a1e';
    g.font = 'bold 11px system-ui, sans-serif';
    g.fillText('10 PF', 0, 0);
    g.restore();

    // ---- Vordergrund-Ebene: Ziffernplättchen + Glasglanz ----
    const f = fgLayer.g;
    for (let k = 0; k < 14; k++) {
        const x = PICKET_X0 + PICKET_PITCH * (k + 0.5);
        const col = DIGIT_CHIP_COLORS[POCKET_DIGITS[k]];
        roundRect(f, x - 11, 601, 22, 22, 4);
        f.fillStyle = col; f.fill();
        f.strokeStyle = 'rgba(255,255,255,0.75)'; f.lineWidth = 1.6; f.stroke();
        f.fillStyle = '#fff';
        f.font = 'bold 15px Georgia, serif';
        f.textAlign = 'center'; f.textBaseline = 'middle';
        f.fillText(String(POCKET_DIGITS[k]), x, 613);
    }
    // Glasglanz
    f.save();
    roundRect(f, GLASS.x, GLASS.y, GLASS.w, GLASS.h, 8);
    f.clip();
    const glare = f.createLinearGradient(0, 0, W, H);
    glare.addColorStop(0.28, 'rgba(255,255,255,0)');
    glare.addColorStop(0.36, 'rgba(255,255,255,0.05)');
    glare.addColorStop(0.44, 'rgba(255,255,255,0)');
    f.fillStyle = glare;
    f.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);
    f.restore();
}

function drawPlacard(g, x, y, w, h, title, mids) {
    roundRect(g, x, y, w, h, 5);
    g.fillStyle = '#d9a520'; g.fill();
    g.strokeStyle = '#8a6d2f'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#a01c12';
    g.font = 'bold 13px system-ui, sans-serif';
    g.fillText(title, x + w / 2, y + 16);
    // Fülltext als Balken + Zwischentitel
    let yy = y + 32;
    const blocks = mids.length + 1;
    const perBlock = Math.floor((h - 44) / blocks);
    for (let bIdx = 0; bIdx < blocks; bIdx++) {
        const lines = Math.floor((perBlock - 16) / 8);
        for (let l2 = 0; l2 < lines; l2++) {
            g.fillStyle = 'rgba(90,60,0,0.55)';
            const wl = w - 20 - (l2 % 3 === 2 ? 26 : 0);
            g.fillRect(x + 10, yy, wl, 2.5);
            yy += 8;
        }
        if (bIdx < mids.length) {
            g.fillStyle = '#a01c12';
            g.font = 'bold 11px system-ui, sans-serif';
            g.fillText(mids[bIdx], x + w / 2, yy + 8);
            yy += 18;
        }
    }
}

function drawColumnBase(g, c2) {
    const col = COLUMNS[c2];
    const cx = CELL.x0 + c2 * CELL.pitch;
    const theme = COL_COLORS[col.color];
    for (let r = 0; r < 3; r++) {
        const cy = CELL.y0 + r * CELL.rowPitch;
        roundRect(g, cx, cy, CELL.w, CELL.h, 6);
        g.fillStyle = theme.dim; g.fill();
        g.strokeStyle = 'rgba(200,170,90,0.5)'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = theme.digitDim;
        g.font = 'bold 30px Georgia, serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(col.digits[r]), cx + CELL.w / 2, cy + CELL.h / 2 + 1);
    }
    roundRect(g, cx, CELL.valueY, CELL.w, CELL.valueH, 6);
    g.fillStyle = theme.dim; g.fill();
    g.strokeStyle = 'rgba(200,170,90,0.5)'; g.lineWidth = 1.5; g.stroke();
    drawValueText(g, c2, theme.digitDim);
}
function drawValueText(g, c2, color) {
    const col = COLUMNS[c2];
    const cx = CELL.x0 + c2 * CELL.pitch + CELL.w / 2;
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (col.value >= 100) {
        g.font = 'bold 22px Georgia, serif';
        g.fillText('1.-', cx, CELL.valueY + 20);
        g.font = 'bold 13px Georgia, serif';
        g.fillText('DM', cx, CELL.valueY + 40);
    } else {
        g.font = 'bold 22px Georgia, serif';
        g.fillText(String(col.value), cx, CELL.valueY + 20);
        g.font = 'bold 13px Georgia, serif';
        g.fillText('PF', cx, CELL.valueY + 40);
    }
}

function drawRing(g) {
    // weißes Band mit roten Schrägstreifen (Zuckerstangen-Optik)
    g.beginPath(); g.arc(C.x, C.y, TRACK_R, 0, Math.PI * 2);
    g.strokeStyle = '#f2ead6'; g.lineWidth = BAND_OUT - BAND_IN; g.stroke();
    for (let d = 0; d < 360; d += 7) {
        const p1 = clockPt(d, BAND_IN + 1), p2 = clockPt(d + 4, BAND_OUT - 1);
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y);
        g.strokeStyle = '#c03428'; g.lineWidth = 5; g.stroke();
    }
    for (const r of [BAND_IN, BAND_OUT]) {
        g.beginPath(); g.arc(C.x, C.y, r, 0, Math.PI * 2);
        g.strokeStyle = '#d9b95c'; g.lineWidth = 2.5; g.stroke();
    }
}
function drawTailBand(g) {
    // Abschussbahn — gleiche Optik wie der Ring, entlang des Pfads
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(TRACK.xs[0], TRACK.ys[0]);
    let lastArcIdx = 0;
    for (let i = 0; i < TRACK.xs.length; i++) {
        const d = Math.hypot(TRACK.xs[i] - C.x, TRACK.ys[i] - C.y);
        if (Math.abs(d - TRACK_R) < 1) break; // ab hier übernimmt drawRing den Bogen
        g.lineTo(TRACK.xs[i], TRACK.ys[i]);
        lastArcIdx = i;
    }
    g.strokeStyle = '#d9b95c'; g.lineWidth = 27; g.stroke();
    g.strokeStyle = '#f2ead6'; g.lineWidth = 23; g.stroke();
    for (let i = 4; i < lastArcIdx - 2; i += 5) {
        const tx = TRACK.xs[i + 1] - TRACK.xs[i - 1], ty = TRACK.ys[i + 1] - TRACK.ys[i - 1];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        g.beginPath();
        g.moveTo(TRACK.xs[i] - nx * 10 - tx / tl * 4, TRACK.ys[i] - ny * 10 - ty / tl * 4);
        g.lineTo(TRACK.xs[i] + nx * 10 + tx / tl * 4, TRACK.ys[i] + ny * 10 + ty / tl * 4);
        g.strokeStyle = '#c03428'; g.lineWidth = 5; g.stroke();
    }
    g.lineCap = 'butt';
}

function drawEmblem(g) {
    // Schwingen
    g.save();
    g.translate(380, 754);
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(side * 30, 6 + i * 9);
            g.quadraticCurveTo(side * 95, -6 + i * 9, side * 168, -26 + i * 9);
            g.strokeStyle = i === 1 ? '#d9b95c' : '#181510';
            g.lineWidth = 7 - i;
            g.stroke();
        }
    }
    g.restore();
    // Karo (SPIEL-FREI-Anzeige) — Grundzustand
    drawDiamond(g, false);
    // Schriftzug BINGOLETT im flachen Bogen (Tal in der Mitte)
    const word = 'BINGOLETT';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < word.length; i++) {
        const t = i - 4;
        const x = 380 + t * 37;
        const y = 800 + (16 - t * t) * 0.85;
        g.save();
        g.translate(x, y); g.rotate(Math.atan2(-1.7 * t, 37));
        g.font = '900 36px Georgia, serif';
        g.lineWidth = 7; g.strokeStyle = '#14100a';
        g.strokeText(word[i], 0, 0);
        const lg = g.createLinearGradient(0, -16, 0, 16);
        lg.addColorStop(0, '#f6e7b8'); lg.addColorStop(0.55, '#d9b95c'); lg.addColorStop(1, '#a8842f');
        g.fillStyle = lg;
        g.fillText(word[i], 0, 0);
        g.restore();
    }
}
function drawDiamond(g, active) {
    g.save();
    g.translate(380, 752);
    g.rotate(Math.PI / 4);
    roundRect(g, -26, -26, 52, 52, 6);
    g.fillStyle = active ? '#2f6fe0' : '#1c3a72';
    g.fill();
    g.strokeStyle = '#d9b95c'; g.lineWidth = 3; g.stroke();
    g.restore();
    roundRect(g, 380 - 30, 752 - 8, 60, 16, 8);
    g.fillStyle = active ? '#ffd23e' : '#8a6d2f';
    g.fill();
    g.strokeStyle = 'rgba(20,16,10,0.7)'; g.lineWidth = 1.5; g.stroke();
    if (active) {
        g.fillStyle = '#4a3000';
        g.font = 'bold 9px system-ui, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('SPIEL FREI', 380, 752.5);
        g.shadowColor = '#ffd23e'; g.shadowBlur = 14;
        roundRect(g, 380 - 30, 752 - 8, 60, 16, 8);
        g.strokeStyle = 'rgba(255,210,62,0.8)'; g.lineWidth = 1.5; g.stroke();
        g.shadowBlur = 0;
    }
}

// ---- dynamisches Zeichnen -----------------------------------------------------
function render(nowSec) {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgLayer.canvas, 0, 0, W, H);

    // Lampen: leuchten nur im Spielbetrieb bzw. bei der Initialisierung.
    // Im Ruhezustand ist das Feld dunkel (Relais halten das Ergebnis) —
    // der KONTROLLE-Knopf legt es wieder auf die Lampen.
    const lampsOn = S.mode !== 'ATTRACT' || S.kontrolle;
    const pulse = 0.85 + 0.15 * Math.sin(nowSec * 5);
    if (lampsOn) for (let c2 = 0; c2 < 7; c2++) {
        const col = COLUMNS[c2];
        const theme = COL_COLORS[col.color];
        const cx = CELL.x0 + c2 * CELL.pitch;
        // Flackern: bei der Initialisierung nur die gemischten Säulen, bei
        // der Auszahlung sackt das Licht überall kurz ab (schwerer Hebel)
        const fa = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowSec * 78 + c2 * 2.3));
        const flick = (S.flicker > 0 && (S.flickerScope === 'all' || !PURE[c2])) ? fa : 1;
        for (let r = 0; r < 3; r++) {
            if (!S.lit[c2][r]) continue;
            const cy = CELL.y0 + r * CELL.rowPitch;
            ctx.save();
            ctx.globalAlpha = flick;
            ctx.shadowColor = theme.lit; ctx.shadowBlur = 16;
            roundRect(ctx, cx, cy, CELL.w, CELL.h, 6);
            ctx.fillStyle = theme.lit; ctx.fill();
            ctx.shadowBlur = 0;
            roundRect(ctx, cx, cy, CELL.w, CELL.h, 6);
            ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#141414';
            ctx.font = 'bold 30px Georgia, serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(col.digits[r]), cx + CELL.w / 2, cy + CELL.h / 2 + 1);
            ctx.restore();
        }
        if (S.valueLit[c2]) {
            ctx.save();
            if (S.flicker > 0 && S.flickerScope === 'all') ctx.globalAlpha = fa;
            ctx.shadowColor = theme.lit; ctx.shadowBlur = 20 * pulse;
            roundRect(ctx, cx, CELL.valueY, CELL.w, CELL.valueH, 6);
            ctx.fillStyle = theme.lit; ctx.fill();
            ctx.shadowBlur = 0;
            drawValueText(ctx, c2, '#141414');
            ctx.restore();
        }
    }

    // SPIEL FREI — nur solange die Kugel für den Spieler freigegeben ist
    if (S.spielFrei) drawDiamond(ctx, true);

    // Kugel
    const b = S.ball;
    if (b.state !== 'HIDDEN') {
        let bx = b.x, by = b.y, alpha = 1, r = BALL_R;
        if (b.state === 'HELD') { bx = HOLE.x; by = HOLE.y; r = BALL_R - 0.5; }
        if (b.state === 'SINK') { by = b.y + b.sink * 14; alpha = 1 - b.sink; r = BALL_R * (1 - b.sink * 0.4); }
        ctx.save();
        ctx.globalAlpha = alpha;
        const bg2 = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, r);
        bg2.addColorStop(0, '#ffffff');
        bg2.addColorStop(0.35, '#c9ccd2');
        bg2.addColorStop(1, '#5a5e66');
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = bg2; ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,25,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }

    // Auszahl-Münzen
    for (const c2 of S.coins) {
        ctx.save();
        ctx.translate(c2.x, c2.y);
        ctx.rotate(c2.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#d9b95c'; ctx.fill();
        ctx.strokeStyle = '#8a6d2f'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#8a6d2f';
        ctx.font = 'bold 8px Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('10', 0, 0.5);
        ctx.restore();
    }

    // Schlagwerk-Hebel
    const chargePull = (S.charging ? S.power : 0) * 0.5 + S.leverAnim * -0.7;
    ctx.save();
    ctx.translate(652, 986);
    ctx.rotate(-0.5 - chargePull * 0.6);
    roundRect(ctx, -5, -46, 10, 52, 5);
    ctx.fillStyle = '#8a6d2f'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -46, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#c03428'; ctx.fill();
    ctx.strokeStyle = '#5c1610'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(652, 986, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#5c4a1e'; ctx.fill();

    // Kraftanzeige
    if (S.power > 0 || S.charging) {
        const hgt = 100 * S.power;
        const grad = ctx.createLinearGradient(0, 1052 - 100, 0, 1052);
        grad.addColorStop(0, '#ff5844'); grad.addColorStop(0.5, '#ffd23e'); grad.addColorStop(1, '#3ecb6e');
        ctx.fillStyle = grad;
        ctx.fillRect(558, 1052 - hgt, 14, hgt);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(558, 952 + i * 20); ctx.lineTo(572, 952 + i * 20); ctx.stroke();
    }

    // KONTROLLE gedrückt?
    ctx.beginPath(); ctx.arc(150, 992, 15, 0, Math.PI * 2);
    ctx.fillStyle = S.kontrolle ? '#8a1810' : '#c03428';
    ctx.fill();
    ctx.strokeStyle = '#5c1610'; ctx.lineWidth = 2; ctx.stroke();
    const shine = ctx.createRadialGradient(146, 987, 1, 150, 992, 14);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(150, 992, 14, 0, Math.PI * 2);
    ctx.fillStyle = shine; ctx.fill();

    // Vordergrund (Ziffernplättchen, Glanz)
    ctx.drawImage(fgLayer.canvas, 0, 0, W, H);
}

// ---- Sidebar-DOM ----------------------------------------------------------------
const el = {
    msg: document.getElementById('statusMsg'),
    wurf: document.getElementById('statWurf'),
    ziffern: document.getElementById('statZiffern'),
    ein: document.getElementById('statEin'),
    aus: document.getElementById('statAus'),
    saldo: document.getElementById('statSaldo'),
    coinBtn: document.getElementById('coinBtn'),
    muteBtn: document.getElementById('muteBtn'),
};
function updateDom() {
    if (el.msg.textContent !== S.msg) el.msg.textContent = S.msg;
    const wurfTxt = S.mode === 'ATTRACT' ? '–' : `${Math.min(S.attempt, 3)} / 3`;
    if (el.wurf.textContent !== wurfTxt) el.wurf.textContent = wurfTxt;
    const zTxt = S.throwsDone.length ? S.throwsDone.join(' · ') : '–';
    if (el.ziffern.textContent !== zTxt) el.ziffern.textContent = zTxt;
    const einTxt = fmtPf(S.kasseIn) || '0 Pf';
    if (el.ein.textContent !== einTxt) el.ein.textContent = einTxt;
    const ausTxt = fmtPf(S.kasseOut) || '0 Pf';
    if (el.aus.textContent !== ausTxt) el.aus.textContent = ausTxt;
    const saldo = S.kasseOut - S.kasseIn;
    const saldoTxt = (saldo >= 0 ? '+' : '−') + fmtPf(Math.abs(saldo));
    if (el.saldo.textContent !== saldoTxt) el.saldo.textContent = saldoTxt;
    el.coinBtn.disabled = S.mode !== 'ATTRACT';
}

// ---- Eingabe ----------------------------------------------------------------------
function beginCharge() {
    AudioFX.unlock();
    // Die Hand liegt schon am Hebel, während die Kugel noch anrollt:
    // Kraftaufbau ist jederzeit im laufenden Spiel erlaubt
    if (S.mode === 'ATTRACT' || S.mode === 'PAYOUT' || S.charging) return;
    S.charging = true;
    S.power = 0; S.powerDir = 1;
    S.msg = S.mode === 'AIM' && S.ball.state === 'REST'
        ? `${S.attempt}. Wurf: … und loslassen!`
        : 'Schlagkraft wird aufgebaut — die Kugel ist noch nicht am Schlagwerk …';
}
function endCharge() {
    if (!S.charging) return;
    S.charging = false;
    if (S.mode === 'AIM' && S.ball.state === 'REST') { launch(); return; }
    // Schlag ins Leere: die Kugel war noch nicht da — neu ansetzen erlaubt
    S.leverAnim = 1;
    S.power = 0; S.powerDir = 1;
    AudioFX.thock();
    S.msg = 'Ins Leere geschlagen — die Kugel war noch nicht am Schlagwerk. Einfach neu ansetzen!';
}

function canvasPos(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
}
canvas.addEventListener('pointerdown', ev => {
    const p = canvasPos(ev);
    AudioFX.unlock();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* synthetische/abgelaufene Pointer */ }
    if (p.x > 715 && p.y > 320 && p.y < 490) { insertCoin(); return; }
    if (Math.hypot(p.x - 150, p.y - 992) < 30) { S.kontrolle = true; AudioFX.klack(); return; }
    if (p.x > 540 && p.y > 930) { beginCharge(); return; }
    beginCharge(); // überall sonst: ebenfalls Schlagwerk (bequemer)
});
canvas.addEventListener('pointerup', () => { if (S.kontrolle) { S.kontrolle = false; AudioFX.klack(); } endCharge(); });
canvas.addEventListener('pointercancel', () => { S.kontrolle = false; S.charging = false; });
canvas.addEventListener('pointermove', ev => {
    const p = canvasPos(ev);
    const hot = (p.x > 715 && p.y > 320 && p.y < 490) || Math.hypot(p.x - 150, p.y - 992) < 30 || (p.x > 540 && p.y > 930);
    canvas.style.cursor = hot ? 'pointer' : 'default';
});
window.addEventListener('keydown', ev => {
    if (ev.repeat) return;
    if (ev.code === 'Space') { ev.preventDefault(); beginCharge(); }
    if (ev.key === 'm' || ev.key === 'M') insertCoin();
});
window.addEventListener('keyup', ev => {
    if (ev.code === 'Space') { ev.preventDefault(); endCharge(); }
});
el.coinBtn.addEventListener('click', () => insertCoin());
el.muteBtn.addEventListener('click', () => {
    const m = AudioFX.toggleMute();
    el.muteBtn.textContent = m ? '🔇 Ton aus' : '🔊 Ton an';
});

// ---- Hauptschleife -----------------------------------------------------------------
// Fester Physik-Zeitschritt mit Akkumulator: läuft auf 60/120/144-Hz-Displays gleich.
let acc = 0, lastT = performance.now();
function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05;
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(now / 1000);
    updateDom();
    requestAnimationFrame(frame);
}

function setup() {
    SCALE = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    buildBackground();
}
setup();
window.addEventListener('resize', () => {
    const s = Math.min(2, window.devicePixelRatio || 1);
    if (s !== SCALE) { setup(); }
});
requestAnimationFrame(frame);

// ---- Debug-/Test-Haken ---------------------------------------------------------------
window.__bingo = {
    S, TRACK, TUNE, insertCoin, launch,
    setPower(p) { S.power = clamp(p, 0, 1); },
    forceLaunch(p) {
        if (S.mode === 'AIM') { S.power = clamp(p, 0, 1); S.charging = true; launch(); }
    },
    fastForward(sec) {
        const n = Math.min(240 * 120, Math.round(sec * 240));
        for (let i = 0; i < n; i++) update(STEP);
    },
    computeLit,
};

})();
