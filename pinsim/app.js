// ===========================================================================
// Pinsetter-Simulator — Blick ins Innere eines Bowling-Automaten.
//
// Physik (Rapier): Kugel und Pins auf dem Pindeck, Abräumen durch das
// Kehrwerk. Alles andere (Greifertisch, Grubenteppich, Aufzugsrad, Laufband,
// Karussell-Magazin, Ballrücklauf) läuft "wie auf Schienen": kinematisch
// choreografiert, mit Übergabepunkten an die Physik.
//
// Rendering: three.js. Fester Physik-Takt (120 Hz) mit Akkumulator und
// Pose-Interpolation — läuft auf 60/120/144-Hz-Displays gleich schnell.
// ===========================================================================

import * as THREE from './three.module.min.js';
import * as RAPIER from './rapier3d-compat.min.js';

const loader = document.getElementById('loader');

main().catch(err => {
    console.error(err);
    loader.classList.add('error');
    loader.textContent = 'FEHLER BEIM START: ' + (err && err.message ? err.message : err);
});

async function main() {

// ============ Maße der Anlage (Meter) ======================================
// Koordinaten: y=0 Bahnoberfläche, +z vom Spieler weg (zur Grube), +x rechts.
// Kopf-Pin (Pin 1) steht bei z=0.

const H = 1 / 120;                        // fester Physik-Zeitschritt

const LANE = {
    half: 0.5334,                         // halbe Bahnbreite (41,5 Zoll)
    gutterW: 0.24,                        // Rinnenbreite
    kickIn: 0.79,                         // Innenkante Kickback
    zFront: -3.8,                         // Bahn verschwindet vorn im Dunkel
    deckStart: -0.45,                     // Beginn Pindeck / flache Rinnen
    tailEnd: 1.03,                        // Ende Holz, Abbruchkante zur Grube
};

const ROWDZ = 0.3048 * Math.sqrt(3) / 2;  // Reihenabstand im 12-Zoll-Dreieck
const SPOTS = [                           // Pin 1..10 (Index 0..9)
    [0, 0],
    [-0.1524, ROWDZ], [0.1524, ROWDZ],
    [-0.3048, 2 * ROWDZ], [0, 2 * ROWDZ], [0.3048, 2 * ROWDZ],
    [-0.4572, 3 * ROWDZ], [-0.1524, 3 * ROWDZ], [0.1524, 3 * ROWDZ], [0.4572, 3 * ROWDZ],
];

const PIN  = { h: 0.381, rBelly: 0.0605, density: 684 };   // ergibt ~1,5 kg
const BALL = { r: 0.108, density: 1335 };                  // ergibt ~7,05 kg (15,5 lb)

// Die Grube ist keine Wanne, sondern eine schiefe Ebene: Hinter der Deckkante
// fällt der Boden als Rampe ab und endet in einer flachen Mulde direkt unter
// dem Aufzugsrad. Das Holz rollt die Rampe hinunter (Schwerkraft, dazu der
// Zug des Grubenteppichs) und liegt dort, wo die Schaufeln es aufnehmen —
// keine Abkürzung quer durch das Ballpolster.
const PIT = {
    yLip:    -0.16,                       // Boden an der Deckkante
    yTrough: -0.30,                       // Sohle der Mulde am Aufzug
    zRamp0:  1.05, zRamp1: 1.70,
    zEnd:     3.05,
    zLedge:   1.98, ledgeH: 0.07,         // Fangleiste vor dem Rad
    carpetV:  0.34,                       // Bandgeschwindigkeit des Teppichs
    seamLap:  0.30,                       // Überlappung der beiden Bodenplatten
    slabD:    0.20,                       // halbe Dicke der Bodenplatten
    floorAt(z) {
        if (z <= this.zRamp0) return this.yLip;
        if (z >= this.zRamp1) return this.yTrough;
        return this.yLip + (this.yTrough - this.yLip) *
               (z - this.zRamp0) / (this.zRamp1 - this.zRamp0);
    },
};
// Das Polster hängt frei über der Grube — hoch genug, dass auch ein Haufen
// Holz darunter durchgezogen wird, ohne sich zu verkeilen. Die Kugel fängt
// die Maschine vorher an der Balltür ab (siehe captureChecks).
const CUSHION = { z0: 1.52, z1: 1.66, yBot: 0.0, yTop: 0.56 };

const SWEEP = {
    width: 1.52, height: 0.22,
    zGuard: -0.55, zEnd: 1.16,            // Schutzposition / Ende Räumhub
    yUp: 0.95, yDown: 0.012,
};

const DECK = {
    cz: 0.396,                            // Mitte des Pin-Dreiecks
    yHome: 0.92, yDown: 0.445,
    gripDrop: 0.44,                       // Pinfuß hängt so weit unter Tischhöhe
};

const WHEEL = {                           // Pin-Aufzugsrad (dreht um die x-Achse)
    cx: 0, cy: 0.30, cz: 2.36,            // Rad, Band und Magazin auf einer Achse
    rimR: 0.47,                           // Seitenringe laufen INNEN
    shelfR: 0.55, shelves: 5, period: 9,
    plateOff: 0.02, plateT: 0.022,        // Lage und Dicke des Schaufelblechs
    pickA0: 0.45, pickA1: 0.72,           // Winkelfenster Aufnahme (an der Fangleiste)
    dropA: 2.50, dropA1: 2.95,            // Übergabe ans Laufband (oben vorn)
};

const BELT = {                            // Laufband oben, steigt zum Magazin an
    // Das Band endet vor dem Karussell: Sein Ende darf nicht in die Kreisbahn
    // der Becher ragen, sonst führen die Becher durch das Band hindurch.
    cx: 0, z0: 2.16, z1: 1.08, y0: 0.86, y1: 1.63,
    w: 0.46, speed: 0.42, gap: 0.30,
    yTop(z) { return this.y0 + (this.z0 - z) * (this.y1 - this.y0) / (this.z0 - this.z1); },
};
BELT.len = BELT.z0 - BELT.z1;

// Das Magazin sitzt so hoch über dem Tisch, dass die Rutschen von den
// Bechern zu den Löchern in der Tischplatte ein brauchbares Gefälle
// bekommen (der äußerste Pin muss 32 cm zur Seite versetzt werden).
// Der Ring ist weit: So kommen die Rutschen von außen an ihre Aufstellplätze
// heran, statt sich über der Tischmitte zu drängeln (numerisch gesucht —
// enger Ring heißt weniger Luft zwischen benachbarten Rutschen).
const TURRET = {                          // Karussell-Magazin über dem Tisch
    cx: 0, cy: 1.65, cz: 0.44, r: 0.46,
    baseY: 1.46,                          // Pinfuß-Höhe im Becher
    stepSpeed: 2.0,                       // rad/s beim Weiterdrehen
};

const HOLE_R  = 0.077;                    // Loch in der Tischplatte je Greifer
const CHUTE_R = 0.070;                    // lichte Weite der Rutschen

const RETURN = {                          // Ballrücklauf rechts
    x: 0.885, railY: -0.13,
    zDoor: 1.50, zAccel: 0.72, zExit: -0.32,
};

const HOUSING = { xIn: 1.10, yTop: 2.06, zBack: 3.15, zFront: -0.85 };

// ============ Kleine Helfer ================================================

const rand    = (a, b) => a + Math.random() * (b - a);
const clamp   = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp    = (a, b, k) => a + (b - a) * k;
const smooth  = k => k * k * (3 - 2 * k);
const TAU     = Math.PI * 2;
const norm2pi = a => ((a % TAU) + TAU) % TAU;
const X_AXIS  = new THREE.Vector3(1, 0, 0);
const Z_AXIS  = new THREE.Vector3(0, 0, 1);

const Q_UP    = new THREE.Quaternion();
const Q_LYING = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -Math.PI / 2);
const _q1     = new THREE.Quaternion();

function quatZ(a) {
    const q = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, a);
    return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function quatX(a) {
    const q = new THREE.Quaternion().setFromAxisAngle(X_AXIS, a);
    return { x: q.x, y: q.y, z: q.z, w: q.w };
}

// ---- Magazin-Ringplätze und ihre Rutschen ---------------------------------
// Das Karussell hält beim Entladen immer auf einem Vielfachen von 36°; die
// zehn Becher stehen dann stets an denselben zehn Stellen. Damit liegt auch
// fest, welcher Platz welchen Aufstell-Spot beliefert — und genau so sind die
// Rutschen gebaut (kürzeste Paare zuerst, damit sich keine kreuzt).
function ringPos(k) {
    const a = k * TAU / 10;
    return { x: TURRET.cx + TURRET.r * Math.sin(a), z: TURRET.cz + TURRET.r * Math.cos(a) };
}

const CHUTE_MAP = (() => {
    const cand = [];
    for (let k = 0; k < 10; k++) {
        const c = ringPos(k);
        for (let j = 0; j < 10; j++) {
            cand.push({ k, j, d: Math.hypot(c.x - SPOTS[j][0], c.z - SPOTS[j][1]) });
        }
    }
    cand.sort((a, b) => a.d - b.d);
    const map = new Array(10).fill(-1), used = new Set();
    for (const c of cand) {
        if (map[c.k] >= 0 || used.has(c.j)) continue;
        map[c.k] = c.j;
        used.add(c.j);
    }
    // Nachbessern: Gierig allein lässt einzelne Rutschen quer über den Tisch
    // laufen. Paare tauschen, solange das den LÄNGSTEN Versatz verkürzt — der
    // bestimmt, wie flach die flachste Rutsche werden muss.
    const dist = k => Math.hypot(ringPos(k).x - SPOTS[map[k]][0], ringPos(k).z - SPOTS[map[k]][1]);
    for (let iter = 0; iter < 60; iter++) {
        let getauscht = false;
        for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) {
            const vorher = Math.max(dist(a), dist(b));
            const t = map[a]; map[a] = map[b]; map[b] = t;
            if (Math.max(dist(a), dist(b)) < vorher - 1e-9) getauscht = true;
            else { const u = map[a]; map[a] = map[b]; map[b] = u; }
        }
        if (!getauscht) break;
    }
    return map;
})();

// Weg eines Pinfußes vom Becher durch die Rutsche bis in den Greifer.
// Der Bogen ist an beiden Enden senkrecht — oben steht der Pin im Becher,
// unten fällt er senkrecht in die Halterung.
function chuteCurve(k) {
    const c = ringPos(k), s = SPOTS[CHUTE_MAP[k]];
    const a = new THREE.Vector3(c.x, TURRET.baseY - 0.015, c.z);
    const d = new THREE.Vector3(s[0], DECK.yHome + 0.015, s[1]);
    const dy = (a.y - d.y) * 0.20;
    return new THREE.CubicBezierCurve3(a,
        new THREE.Vector3(a.x, a.y - dy, a.z),
        new THREE.Vector3(d.x, d.y + dy, d.z), d);
}

// Pose-Interpolation für flüssiges Rendern zwischen den Physikschritten
class PoseTrack {
    constructor() {
        this.pp = new THREE.Vector3(); this.cp = new THREE.Vector3();
        this.pq = new THREE.Quaternion(); this.cq = new THREE.Quaternion();
    }
    init(p, q) { this.pp.copy(p); this.cp.copy(p); this.pq.copy(q); this.cq.copy(q); }
    push(p, q) { this.pp.copy(this.cp); this.pq.copy(this.cq); this.cp.copy(p); this.cq.copy(q); }
    apply(obj, a) {
        obj.position.lerpVectors(this.pp, this.cp, a);
        obj.quaternion.slerpQuaternions(this.pq, this.cq, a);
    }
}

class STrack {
    constructor(v) { this.p = v; this.c = v; }
    set(v) { this.p = this.c; this.c = v; }
    val(a) { return lerp(this.p, this.c, a); }
}

// ============ Physik & Renderer ============================================

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = H;
if ('numSolverIterations' in world) world.numSolverIterations = 8;
const eventQueue  = new RAPIER.EventQueue(true);
const colliderTag = new Map();            // Collider-Handle -> Klang-Kategorie
const handleBody  = new Map();            // Collider-Handle -> RigidBody (für Panning)

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030404);
scene.fog = new THREE.FogExp2(0x040505, 0.10);

const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 30);

function onResize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

// ---- Licht -----------------------------------------------------------------
// Das Pinlicht sitzt tief vorn (wie die Leuchtstoffröhre hinter der Maske),
// damit weder Tisch noch gehobenes Kehrwerk den Pins den Schatten stehlen.

scene.add(new THREE.HemisphereLight(0x2b3138, 0x0a0b0c, 0.42));

const pinlight = new THREE.SpotLight(0xffe2bd, 160, 0, 0.55, 0.5, 1.6);
pinlight.position.set(0, 1.05, -1.95);
pinlight.target.position.set(0, 0.2, 0.6);
pinlight.castShadow = true;
pinlight.shadow.mapSize.set(2048, 2048);
pinlight.shadow.camera.near = 0.4;
pinlight.shadow.camera.far = 7;
pinlight.shadow.bias = -0.0002;
pinlight.shadow.normalBias = 0.015;
scene.add(pinlight, pinlight.target);

const fill = new THREE.PointLight(0x9fb8cf, 9, 0, 2);
fill.position.set(0, 1.86, 1.4);
scene.add(fill);

const worklamp = new THREE.PointLight(0xffc384, 12, 0, 2);
worklamp.position.set(0.62, 1.34, 2.40);
scene.add(worklamp);

const pitlight = new THREE.PointLight(0xa8b6c4, 7, 0, 2);
pitlight.position.set(0.45, 0.42, 1.35);
scene.add(pitlight);

// ============ Prozedurale Texturen =========================================

function makeTexture(w, h, draw, repeat) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function noiseOver(ctx, w, h, n, alpha, light) {
    const g = light ? 255 : 0;
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * alpha})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
}

const laneTex = makeTexture(512, 512, (ctx, w, h) => {
    const boards = 20;
    for (let i = 0; i < boards; i++) {
        const t = 198 + Math.floor(Math.random() * 28);
        ctx.fillStyle = `rgb(${t},${t - 36},${t - 84})`;
        ctx.fillRect(i * w / boards, 0, w / boards + 1, h);
        ctx.fillStyle = 'rgba(60,35,15,0.55)';
        ctx.fillRect(i * w / boards, 0, 1.5, h);
    }
    ctx.globalAlpha = 0.10;                       // Maserung
    for (let i = 0; i < 240; i++) {
        ctx.strokeStyle = Math.random() < 0.5 ? '#7a5a30' : '#e8cf9a';
        const x = Math.random() * w;
        ctx.beginPath();
        ctx.moveTo(x, Math.random() * h);
        ctx.lineTo(x + rand(-4, 4), Math.random() * h);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noiseOver(ctx, w, h, 900, 0.05, false);
}, true);
laneTex.repeat.set(1, 3);

const steelTex = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(w, y + rand(-3, 3));
        ctx.stroke();
    }
    noiseOver(ctx, w, h, 700, 0.09, false);
    noiseOver(ctx, w, h, 250, 0.05, true);
}, true);

const panelTex = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#23262b';
    ctx.fillRect(0, 0, w, h);
    noiseOver(ctx, w, h, 800, 0.08, false);
    noiseOver(ctx, w, h, 200, 0.04, true);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(4, 4, w - 8, h - 8);
}, true);

// Kachelmaß der laufenden Bänder in Metern. Jede Fläche leitet ihre
// Wiederholung aus ihrer eigenen Länge davon ab — sonst wären die Leisten
// auf der kurzen Rampe gestaucht und liefen dort langsamer als in der Mulde.
const TILE_M = 0.27;

// Vier kräftige Querleisten je Kachel, also alle 6,75 cm. Feiner darf das
// Muster nicht sein: Bei 30 Bildern/s und 0,34 m/s wandert es sonst um mehr
// als eine halbe Leiste pro Bild und die Laufrichtung kippt optisch um
// (Wagenrad-Effekt) — genau daran lag es, dass der Teppich rückwärts lief.
const slatted = (base, hell, dunkel, koerner) => (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const step = h / 4;
    for (let i = 0; i < 4; i++) {
        const y = i * step;
        ctx.fillStyle = hell;
        ctx.fillRect(0, y, w, Math.round(step * 0.16));
        ctx.fillStyle = dunkel;
        ctx.fillRect(0, y + Math.round(step * 0.16), w, Math.round(step * 0.07));
    }
    noiseOver(ctx, w, h, koerner, 0.09, false);
};

const carpetTex = makeTexture(256, 256,
    slatted('#141518', 'rgba(255,255,255,0.075)', 'rgba(0,0,0,0.45)', 900), true);
carpetTex.repeat.set(2, 5);

const beltTex = makeTexture(128, 256,
    slatted('#1c1e21', 'rgba(255,255,255,0.13)', 'rgba(0,0,0,0.40)', 300), true);
beltTex.repeat.set(1, 4);

const hazardTex = makeTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9a13b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#141414';
    for (let i = -h; i < w + h; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0);
        ctx.lineTo(i + 16 + h, h); ctx.lineTo(i + h, h);
        ctx.fill();
    }
    noiseOver(ctx, w, h, 300, 0.15, false);
}, true);

function stencilTexture(lines, fg, bg) {
    return makeTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.font = 'bold 40px Consolas, monospace';
        lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + 14 + (i - (lines.length - 1) / 2) * 54));
    });
}

// ============ Pin- und Kugel-Optik =========================================

const PIN_PROFILE = [
    [0.000, 0.000], [0.0268, 0.000], [0.040, 0.008], [0.049, 0.022], [0.0555, 0.048],
    [0.0595, 0.080], [0.0605, 0.115], [0.057, 0.150], [0.048, 0.185], [0.036, 0.215],
    [0.0268, 0.240], [0.0232, 0.253], [0.0228, 0.264], [0.0245, 0.282], [0.0295, 0.306],
    [0.0324, 0.326], [0.0316, 0.346], [0.0258, 0.363], [0.0150, 0.375], [0.000, 0.381],
];

// LatheGeometry verteilt v nach Punkt-Index — für die roten Halsringe wird
// die v-Position einer Zielhöhe aus dem Profil interpoliert.
function pinYtoV(y) {
    for (let i = 1; i < PIN_PROFILE.length; i++) {
        const y0 = PIN_PROFILE[i - 1][1], y1 = PIN_PROFILE[i][1];
        if (y >= y0 && y <= y1 && y1 > y0) {
            return (i - 1 + (y - y0) / (y1 - y0)) / (PIN_PROFILE.length - 1);
        }
    }
    return y / 0.381;
}

const pinTex = makeTexture(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f3efe4';
    ctx.fillRect(0, 0, w, h);
    noiseOver(ctx, w, h, 500, 0.03, false);
    const band = (yA, yB) => {
        const vA = pinYtoV(yA), vB = pinYtoV(yB);
        ctx.fillStyle = '#c22421';
        ctx.fillRect(0, (1 - vB) * h, w, (vB - vA) * h);
    };
    band(0.242, 0.256);
    band(0.270, 0.284);
    const vFoot = pinYtoV(0.03);                  // Abrieb am Fuß
    const g = ctx.createLinearGradient(0, h, 0, (1 - vFoot) * h);
    g.addColorStop(0, 'rgba(70,60,50,0.45)');
    g.addColorStop(1, 'rgba(70,60,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, (1 - vFoot) * h, w, vFoot * h);
});

const pinGeo = new THREE.LatheGeometry(PIN_PROFILE.map(p => new THREE.Vector2(p[0], p[1])), 22);
const pinMat = new THREE.MeshStandardMaterial({ map: pinTex, roughness: 0.32 });

function ballTexture(base, swirl1, swirl2) {
    return makeTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (const [color, n] of [[swirl1, 9], [swirl2, 7]]) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.55;
            for (let i = 0; i < n; i++) {
                ctx.lineWidth = rand(3, 14);
                const x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.bezierCurveTo(x + rand(-90, 90), y + rand(-60, 60),
                                  x + rand(-90, 90), y + rand(-60, 60),
                                  x + rand(-130, 130), y + rand(-90, 90));
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0a0c';                // Fingerlöcher
        for (const [dx, dy] of [[0, 0], [16, 10], [-4, 19]]) {
            ctx.beginPath();
            ctx.arc(w * 0.30 + dx, h * 0.34 + dy, 6.5, 0, TAU);
            ctx.fill();
        }
        noiseOver(ctx, w, h, 250, 0.05, true);
    });
}

const ballMats = [
    new THREE.MeshStandardMaterial({ map: ballTexture('#20306e', '#4a6fd4', '#101430'), roughness: 0.16 }),
    new THREE.MeshStandardMaterial({ map: ballTexture('#5e1620', '#b0404e', '#26060b'), roughness: 0.16 }),
    new THREE.MeshStandardMaterial({ map: ballTexture('#15201a', '#3f7a52', '#060a08'), roughness: 0.16 }),
];

// ============ Materialien & Bau-Helfer =====================================

const mat = {
    lane:     new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.42, metalness: 0.05 }),
    approach: new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.22, metalness: 0.08, color: 0x8f8f8f }),
    gutter:   new THREE.MeshStandardMaterial({ color: 0x2e3237, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }),
    kick:     new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.55, metalness: 0.4 }),
    panel:    new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.8, metalness: 0.2 }),
    steel:    new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.45, metalness: 0.65 }),
    darkSteel:new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.5, metalness: 0.55 }),
    black:    new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.95 }),
    rubber:   new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.92 }),
    carpet:   new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.97 }),
    belt:     new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }),
    hazard:   new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 }),
    red:      new THREE.MeshStandardMaterial({ color: 0x8e2320, roughness: 0.5 }),
    plexi:    new THREE.MeshStandardMaterial({ color: 0xaccdd4, roughness: 0.12, metalness: 0.05,
                                               transparent: true, opacity: 0.28,
                                               side: THREE.DoubleSide, depthWrite: false }),
};

const M = {};                             // Referenzen auf bewegliche Baugruppen

function box(parent, w, h, d, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = !!opts.cast;
    m.receiveShadow = opts.recv !== false;
    parent.add(m);
    return m;
}

function cyl(parent, rTop, rBot, hgt, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, hgt, opts.seg || 18, 1, !!opts.open), material);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = !!opts.cast;
    m.receiveShadow = opts.recv !== false;
    parent.add(m);
    return m;
}

function fixedCollider(desc, friction, restitution, tag) {
    desc.setFriction(friction).setRestitution(restitution);
    const col = world.createCollider(desc);
    if (tag) colliderTag.set(col.handle, tag);
    return col;
}

// ============ Statische Kulisse ============================================

{
    // ---- Bahn & Pindeck ----
    const zA0 = LANE.zFront, zA1 = LANE.deckStart;
    const appLen = zA1 - zA0, appMid = (zA0 + zA1) / 2;
    const deckLen = LANE.tailEnd - LANE.deckStart, deckMid = (LANE.deckStart + LANE.tailEnd) / 2;

    box(scene, LANE.half * 2, 0.1, appLen, mat.approach, 0, -0.05, appMid);
    box(scene, LANE.half * 2, 0.1, deckLen, mat.lane, 0, -0.05, deckMid);
    // EIN durchgehender Bahn-Collider: zwei aneinanderstoßende Quader erzeugen
    // an der inneren Kante Geisterkollisionen, die die Kugel hüpfen lassen.
    const laneLen = LANE.tailEnd - LANE.zFront;
    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.half, 0.05, laneLen / 2)
        .setTranslation(0, -0.05, (LANE.zFront + LANE.tailEnd) / 2), 0.15, 0.04, 'lane');

    const spotGeo = new THREE.CircleGeometry(0.028, 20);
    const spotMat = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.5 });
    for (const [sx, sz] of SPOTS) {
        const s = new THREE.Mesh(spotGeo, spotMat);
        s.rotation.x = -Math.PI / 2;
        s.position.set(sx, 0.0012, sz);
        s.receiveShadow = true;
        scene.add(s);
    }

    // ---- Rinnen ----
    // Flacher Kreisbogen wie in echt (~23,5 cm breit, 4,8 cm tief): die
    // innere Bogenkante schließt bündig mit der Bahnoberfläche ab, statt
    // als Halbrohr über die Bahn zu ragen.
    const GUT_R = 0.1678;                 // Bogenradius
    const GUT_A = 0.7754;                 // halber Öffnungswinkel (~44°)
    const GUT_CX = LANE.half + GUT_R * Math.sin(GUT_A);   // Bogenmitte
    for (const side of [-1, 1]) {
        const arc = new THREE.Mesh(
            new THREE.CylinderGeometry(GUT_R, GUT_R, appLen, 24, 1, true,
                Math.PI / 2 - GUT_A, GUT_A * 2),
            mat.gutter);
        arc.rotation.z = -Math.PI / 2;                // Schale unten, Öffnung nach oben
        arc.rotation.y = Math.PI / 2;
        arc.position.set(side * GUT_CX, GUT_R - 0.048, appMid);
        arc.receiveShadow = true;
        scene.add(arc);

        // Physik: Boden + zwei flache Schrägen entlang des Bogens
        fixedCollider(RAPIER.ColliderDesc.cuboid(0.045, 0.012, appLen / 2)
            .setTranslation(side * GUT_CX, -0.060, appMid), 0.12, 0.2, 'lane');
        fixedCollider(RAPIER.ColliderDesc.cuboid(0.050, 0.010, appLen / 2)
            .setTranslation(side * 0.5697, -0.024, appMid)
            .setRotation(quatZ(-side * 0.584)), 0.12, 0.2, 'lane');
        fixedCollider(RAPIER.ColliderDesc.cuboid(0.050, 0.010, appLen / 2)
            .setTranslation(side * 0.7322, -0.024, appMid)
            .setRotation(quatZ(side * 0.584)), 0.12, 0.2, 'lane');

        // flache Rinne neben dem Deck (leicht vertieft, bündig zur runden Rinne)
        const gx = side * (LANE.half + LANE.gutterW / 2);
        box(scene, LANE.gutterW, 0.06, deckLen, mat.panel, gx, -0.078, deckMid);
        fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.gutterW / 2, 0.03, deckLen / 2)
            .setTranslation(gx, -0.078, deckMid), 0.25, 0.15, 'lane');
    }

    // dunkler Unterbau — keine Kamera sieht "unter" die Bahn
    box(scene, HOUSING.xIn * 2, 0.56, LANE.tailEnd - LANE.zFront, mat.black,
        0, -0.40, (LANE.zFront + LANE.tailEnd) / 2, { recv: false });

    // ---- Kickbacks ----
    for (const side of [-1, 1]) {
        const kx = side * (LANE.kickIn + 0.03);
        box(scene, 0.06, 1.5, HOUSING.zBack + 0.70, mat.kick, kx, 0.13, (HOUSING.zBack - 0.70) / 2, { cast: true });
        fixedCollider(RAPIER.ColliderDesc.cuboid(0.03, 0.75, (HOUSING.zBack + 0.70) / 2)
            .setTranslation(kx, 0.13, (HOUSING.zBack - 0.70) / 2), 0.2, 0.6, 'kick');
    }

    // ---- Grube: Rampe, Mulde, Fangleiste ----
    // Rampe: schiefe Ebene von der Deckkante hinunter zur Mulde. Reibung
    // niedrig genug, dass das Holz von selbst rollt.
    {
        const dz = PIT.zRamp1 - PIT.zRamp0, dy = PIT.yLip - PIT.yTrough;
        const rLen = Math.hypot(dz, dy), tilt = Math.atan2(dy, dz);
        const midY = (PIT.yLip + PIT.yTrough) / 2, midZ = (PIT.zRamp0 + PIT.zRamp1) / 2;
        const rampTex = carpetTex.clone();
        rampTex.needsUpdate = true;
        rampTex.repeat.set(2, rLen / TILE_M);
        M.carpetRampTex = rampTex;
        M.pitRamp = new THREE.Mesh(new THREE.PlaneGeometry(LANE.kickIn * 2, rLen),
            new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.97 }));
        M.pitRamp.rotation.x = -Math.PI / 2 + tilt;
        M.pitRamp.position.set(0, midY, midZ);
        M.pitRamp.receiveShadow = true;
        scene.add(M.pitRamp);
        // Kollisionsplatte 3 cm unter der Oberfläche, entlang der Flächennormalen.
        // Sie ragt hinten unter die Muldensohle: Träfe ihre Stirnkante am Knick
        // frei auf die Kante der Mulde, blieben rollende Pins genau dort hängen
        // (die Kontaktnormale der Stirnfläche zeigt nach vorn und hebt den Zug
        // des Teppichs auf). Vergraben stören beide Kanten nicht mehr.
        // Wenig Reibung: Bei 12° Gefälle muss das Holz von selbst anrollen —
        // sonst bleibt es liegen und schläft ein.
        // Dick, nicht dünn: Eine 6-cm-Platte kann ein Pin beim Aufprall halb
        // durchdringen und klemmt dann zwischen Ober- und Unterseite fest —
        // die beiden Kontakte heben sich auf, und kein Schub bekommt ihn je
        // wieder frei. Mit 40 cm Dicke erreicht er die Unterseite nie.
        const nY = Math.cos(tilt), nZ = Math.sin(tilt);
        const D = PIT.slabD;
        fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, D, rLen / 2 + PIT.seamLap / 2)
            .setRotation(quatX(tilt))
            .setTranslation(0,
                midY - D * nY - (PIT.seamLap / 2) * Math.sin(tilt),
                midZ - D * nZ + (PIT.seamLap / 2) * Math.cos(tilt)), 0.16, 0.02, 'pit');
    }
    // Mulde: flache Sohle unter dem Aufzugsrad
    {
        const tLen = PIT.zEnd - PIT.zRamp1, tMid = (PIT.zRamp1 + PIT.zEnd) / 2;
        carpetTex.repeat.set(2, tLen / TILE_M);
        M.pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(LANE.kickIn * 2, tLen), mat.carpet);
        M.pitFloor.rotation.x = -Math.PI / 2;
        M.pitFloor.position.set(0, PIT.yTrough, tMid);
        M.pitFloor.receiveShadow = true;
        scene.add(M.pitFloor);
        // ebenso nach vorn verlängert — ihre Stirnkante liegt dann unter der Rampe
        fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, PIT.slabD, tLen / 2 + PIT.seamLap / 2)
            .setTranslation(0, PIT.yTrough - PIT.slabD, tMid - PIT.seamLap / 2), 0.16, 0.02, 'pit');
    }
    // Fangleiste: hält das rollende Holz vor dem Rad an — genau dort holen es
    // die Schaufeln ab. Ohne sie liefe alles unter das Rad und läge fest.
    box(scene, LANE.kickIn * 2, PIT.ledgeH, 0.05, mat.darkSteel,
        0, PIT.yTrough + PIT.ledgeH / 2, PIT.zLedge, { cast: true });
    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, PIT.ledgeH / 2, 0.025)
        .setTranslation(0, PIT.yTrough + PIT.ledgeH / 2, PIT.zLedge), 0.5, 0.02, 'pit');

    // Sturzblech an der Deckkante (Vorderwand der Grube)
    box(scene, LANE.kickIn * 2, 0.18, 0.04, mat.rubber, 0, PIT.yLip - 0.085, LANE.tailEnd + 0.02);
    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, 0.09, 0.02)
        .setTranslation(0, PIT.yLip - 0.085, LANE.tailEnd + 0.02), 0.5, 0.1, 'pit');

    // Umlenkleiste vor dem Polster: Ein Pin, der in der Grube aufrecht stehen
    // bleibt, passt nicht darunter durch und würde den Nachschub blockieren.
    // Die Leiste trifft ihn am Kopf — also über dem Schwerpunkt — und kippt
    // ihn um; liegendes Holz läuft weit darunter hindurch.
    // Sie steht bewusst ein Stück vor dem Polster: Das gekippte Holz hat so
    // Platz, flach zu liegen, bevor es unter das Polster gezogen wird.
    box(scene, LANE.kickIn * 2, 0.14, 0.03, mat.rubber, 0, 0.09, 1.36, { cast: true });
    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, 0.07, 0.015)
        .setTranslation(0, 0.09, 1.36), 0.35, 0.05, 'pit');
    for (const sx of [-0.55, 0, 0.55]) {
        cyl(scene, 0.012, 0.012, 0.22, mat.darkSteel, sx, 0.25, 1.36);
    }

    const czMid = (CUSHION.z0 + CUSHION.z1) / 2;
    box(scene, LANE.kickIn * 2 - 0.02, CUSHION.yTop - CUSHION.yBot, CUSHION.z1 - CUSHION.z0,
        mat.black, 0, (CUSHION.yTop + CUSHION.yBot) / 2, czMid, { cast: true });
    box(scene, LANE.kickIn * 2 - 0.02, 0.08, 0.02, mat.hazard, 0, CUSHION.yBot + 0.04, CUSHION.z0 - 0.012);
    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn - 0.01,
        (CUSHION.yTop - CUSHION.yBot) / 2, (CUSHION.z1 - CUSHION.z0) / 2)
        .setTranslation(0, (CUSHION.yTop + CUSHION.yBot) / 2, czMid), 0.85, 0.02, 'cushion');

    fixedCollider(RAPIER.ColliderDesc.cuboid(LANE.kickIn, 1.3, 0.03)
        .setTranslation(0, 0.7, HOUSING.zBack - 0.06), 0.5, 0.1, 'kick');

    // ---- Gehäuse ----
    // Einseitige Hülle (Flächen zeigen nach innen): von innen geschlossen,
    // von außen schaut die freie Service-Kamera wie in ein Puppenhaus hinein.
    const W = HOUSING.xIn, T = HOUSING.yTop, ZB = HOUSING.zBack, ZF = HOUSING.zFront;
    const len = ZB - ZF, zc = (ZB + ZF) / 2;
    const wall = (wdt, hgt, x, y, z, ry, rx) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), mat.panel);
        m.position.set(x, y, z);
        if (ry) m.rotation.y = ry;
        if (rx) m.rotation.x = rx;
        m.receiveShadow = true;
        scene.add(m);
        return m;
    };
    wall(len, T + 0.75, -W, T / 2 - 0.33, zc, Math.PI / 2);
    wall(len, T + 0.75, W, T / 2 - 0.33, zc, -Math.PI / 2);
    wall(W * 2, len, 0, T, zc, 0, Math.PI / 2).receiveShadow = false;
    wall(W * 2, T + 0.75, 0, T / 2 - 0.33, ZB, Math.PI);
    box(scene, W * 2, 0.05, len, mat.rubber, 0, -0.66, zc);
    // Frontwand mit Bahnöffnung + Maskenblende
    wall(W * 2, T - 0.56, 0, 0.56 + (T - 0.56) / 2, ZF);
    wall(W - LANE.kickIn, 1.3, -(LANE.kickIn + W) / 2, 0.0, ZF);
    wall(W - LANE.kickIn, 1.3, (LANE.kickIn + W) / 2, 0.0, ZF);
    // Warnstreifen flach an der Maskenfront — liegt HINTER den Pindeck-
    // Kameras, ragt also auch bei breitem Viewport nicht mehr ins Bild
    box(scene, LANE.kickIn * 2, 0.07, 0.04, mat.hazard, 0, 0.60, ZF + 0.05);

    for (const z of [-0.5, 0.4, 1.3, 2.2, 2.9]) {
        box(scene, W * 2 - 0.1, 0.09, 0.06, mat.darkSteel, 0, T - 0.07, z, { cast: true });
    }

    // Schaltschrank links mit Status-LEDs
    box(scene, 0.10, 0.5, 0.36, mat.steel, -W + 0.08, 0.9, 1.7, { cast: true });
    M.leds = {};
    const ledGeo = new THREE.SphereGeometry(0.014, 10, 8);
    [['ready', 0x2dcf5a], ['run', 0xffb63b], ['wait', 0xff4436]].forEach(([name, c], i) => {
        const led = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({
            color: 0x0a0a0a, emissive: c, emissiveIntensity: 0.15 }));
        led.position.set(-W + 0.14, 1.06, 1.56 + i * 0.12);
        scene.add(led);
        M.leds[name] = led;
    });

    // Hinweisschild an der rechten Wand
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36),
        new THREE.MeshStandardMaterial({
            map: stencilTexture(['PINSETTER 05', 'WARTUNG NUR BEI', 'STILLSTAND'], '#d8b24a', '#2a2118'),
            roughness: 0.85 }));
    sign.position.set(W - 0.04, 1.35, 1.5);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);

    // Arbeitslampe mit Käfig am Aufzug
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc36b, emissiveIntensity: 2.2 }));
    bulb.position.copy(worklamp.position);
    scene.add(bulb);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 14), mat.darkSteel);
    cage.position.copy(worklamp.position);
    scene.add(cage);
}

// ============ Bewegliche Baugruppen ========================================

// Veränderliche Ist-Werte + zugehörige Interpolations-Tracks
const V = {
    sweepY: SWEEP.yUp, sweepZ: SWEEP.zGuard,
    deckY: DECK.yHome, grip: 1,
    wheel: 0, turret: 0, belt: 0, carpet: 0,
    flap: 0, tire: 0,
};
const S = {};
for (const k in V) S[k] = new STrack(V[k]);

// ---- Kehrwerk ("die Schranke") ----------------------------------------------
{
    const g = new THREE.Group();
    box(g, SWEEP.width, SWEEP.height, 0.08, mat.darkSteel, 0, SWEEP.height / 2, 0, { cast: true });
    box(g, SWEEP.width, 0.075, 0.012, mat.hazard, 0, 0.06, -0.047, { cast: true });
    // Schriftzug auf der Front — kommt bei jedem Abräumen ins Bild
    const sweepWord = makeTexture(1024, 128, (ctx, w, h) => {
        ctx.fillStyle = '#e6e0d2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 84px Arial, sans-serif';
        const word = 'BOWLING';
        const step = w / (word.length + 1);
        for (let i = 0; i < word.length; i++) ctx.fillText(word[i], step * (i + 1), h / 2 + 4);
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.115),
        new THREE.MeshStandardMaterial({ map: sweepWord, transparent: true, roughness: 0.55 }));
    label.position.set(0, 0.158, -0.045);
    label.rotation.y = Math.PI;
    g.add(label);
    scene.add(g);
    M.sweep = g;
    // zwei Schubstangen nach oben, außen an den Barenden (nicht im Kamerabild)
    M.sweepPosts = [];
    for (const sx of [-0.72, 0.72]) {
        const post = cyl(scene, 0.016, 0.016, 1, mat.steel, sx, 1.4, SWEEP.zGuard, { cast: true });
        M.sweepPosts.push(post);
    }
    // Laufschienen unter dem Dach
    for (const sx of [-0.72, 0.72]) {
        box(scene, 0.05, 0.05, SWEEP.zEnd - SWEEP.zGuard + 0.4, mat.darkSteel,
            sx, HOUSING.yTop - 0.16, (SWEEP.zGuard + SWEEP.zEnd) / 2, { cast: true });
    }

    M.sweepBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(0, V.sweepY + SWEEP.height / 2, V.sweepZ));
    const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(SWEEP.width / 2, SWEEP.height / 2, 0.04)
            .setFriction(0.6).setRestitution(0.0), M.sweepBody);
    colliderTag.set(col.handle, 'sweep');
}

// ---- Greifertisch -------------------------------------------------------------
{
    const g = new THREE.Group();
    g.position.set(0, V.deckY, DECK.cz);
    // Tischplatte aus getöntem Acryl: man sieht von oben durch auf die Pins.
    // In den Rahmen geklemmt: Kanten stecken 5 mm in den Profilen, Scheibe
    // dünner als der Rahmen und leicht abgesenkt — keine Fläche liegt
    // koplanar zum Rahmen (sonst Z-Fighting auf den Auflagestreifen).
    // Die Scheibe hat über jedem Greifer ein Loch: Von oben fällt der Pin
    // hindurch, statt durch das Acryl zu schweben.
    {
        const shape = new THREE.Shape();
        shape.moveTo(-0.605, -0.49); shape.lineTo(0.605, -0.49);
        shape.lineTo(0.605, 0.49);   shape.lineTo(-0.605, 0.49);
        shape.closePath();
        for (const [sx, sz] of SPOTS) {
            const h = new THREE.Path();
            h.absarc(sx, DECK.cz - sz, HOLE_R, 0, TAU, true);
            shape.holes.push(h);
        }
        const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), mat.plexi);
        plate.rotation.x = -Math.PI / 2;
        plate.position.y = -0.008;
        g.add(plate);
    }
    // Metallrahmen drumherum
    box(g, 1.30, 0.05, 0.05, mat.darkSteel, 0, 0, -0.51, { cast: true });
    box(g, 1.30, 0.05, 0.05, mat.darkSteel, 0, 0, 0.51, { cast: true });
    box(g, 0.05, 0.05, 0.98, mat.darkSteel, -0.625, 0, 0, { cast: true });
    box(g, 0.05, 0.05, 0.98, mat.darkSteel, 0.625, 0, 0, { cast: true });
    box(g, 1.26, 0.02, 0.06, mat.red, 0, -0.02, -0.53, { cast: true });

    // Greifer: oben ein offener Trichter im Loch, darunter die Backen. Der Pin
    // fällt durch den Trichter zwischen die aufgeschwenkten Backen; die
    // schließen sich um seinen Hals und halten ihn.
    M.grippers = [];
    for (const [sx, sz] of SPOTS) {
        const unit = new THREE.Group();
        unit.position.set(sx, -0.03, sz - DECK.cz);
        cyl(unit, HOLE_R + 0.008, 0.068, 0.10, mat.darkSteel, 0, -0.03, 0, { open: true, seg: 14, cast: true });
        for (const bs of [-1, 1]) {                       // Halteblech seitlich
            box(unit, 0.012, 0.10, 0.05, mat.darkSteel, bs * 0.062, -0.05, 0, { cast: true });
        }
        const fingers = [];
        for (const fs of [-1, 1]) {
            const fin = new THREE.Group();
            fin.position.set(fs * 0.012, -0.09, 0);
            const fmesh = box(fin, 0.014, 0.11, 0.034, mat.steel, fs * 0.016, -0.055, 0, { cast: true });
            box(fin, 0.016, 0.035, 0.038, mat.red, fs * 0.021, -0.095, 0);
            fingers.push({ group: fin, side: fs, mesh: fmesh });
            unit.add(fin);
        }
        M.grippers.push(fingers);
        g.add(unit);
    }

    // Rutschen vom Magazin zu den Löchern — als Käfig aus vier Stäben, damit
    // man den Pin darin fallen sieht. Sie sitzen fest auf der Scheibe und
    // fahren mit dem Tisch mit; das Karussell richtet sich auf sie aus.
    for (let k = 0; k < 10; k++) {
        const curve = chuteCurve(k);
        const pts = curve.getPoints(16);
        const s0 = curve.getPoint(0), s1 = curve.getPoint(1);
        // Der Trog ist oben offen, und zwar zur Seite, über die sich der Pin
        // in der Kurve legt. So kann sein Kopf herausragen, ohne durch einen
        // Stab zu schneiden — genau wie bei einer offenen Rutsche.
        const hl = Math.hypot(s1.x - s0.x, s1.z - s0.z) || 1;
        const zu = Math.atan2((s0.z - s1.z) / hl, (s0.x - s1.x) / hl);
        for (let i = 0; i < 5; i++) {
            const ang = zu + (i / 4 - 0.5) * (4 * Math.PI / 3);
            const ox = Math.cos(ang) * CHUTE_R, oz = Math.sin(ang) * CHUTE_R;
            const rail = pts.map(p => new THREE.Vector3(
                p.x + ox, p.y - DECK.yHome, p.z + oz - DECK.cz));
            const tube = new THREE.Mesh(
                new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 22, 0.006, 5, false),
                mat.steel);
            tube.castShadow = true;
            g.add(tube);
        }
        // Einlauftrichter unter dem Becher
        cyl(g, 0.090, CHUTE_R, 0.05, mat.steel,
            s0.x, s0.y - DECK.yHome - 0.02, s0.z - DECK.cz, { open: true, seg: 14 });
    }
    scene.add(g);
    M.deck = g;
    // vier Tragstangen (Länge beim Rendern angepasst)
    M.deckRods = [];
    for (const [rx, rz] of [[-0.60, DECK.cz - 0.42], [0.60, DECK.cz - 0.42], [-0.60, DECK.cz + 0.42], [0.60, DECK.cz + 0.42]]) {
        M.deckRods.push(cyl(scene, 0.016, 0.016, 1, mat.steel, rx, 1.5, rz, { cast: true }));
    }
}

// ---- Pin-Aufzugsrad -------------------------------------------------------------
{
    const g = new THREE.Group();
    g.position.set(WHEEL.cx, WHEEL.cy, WHEEL.cz);
    // Seitenringe und Speichen bleiben INNERHALB der Schaufeln: Die Schaufel
    // ist das äußerste Teil am Rad und streift damit die Muldensohle, ohne
    // dass ein Ring durch den Grubenboden pflügen müsste.
    for (const ox of [-0.29, 0.29]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.rimR, 0.024, 10, 44), mat.steel);
        rim.rotation.y = Math.PI / 2;
        rim.position.x = ox;
        rim.castShadow = true;
        g.add(rim);
        for (let i = 0; i < WHEEL.shelves; i++) {
            const sp = cyl(g, 0.012, 0.012, (WHEEL.shelfR - 0.03) * 2, mat.darkSteel, ox, 0, 0, { cast: true });
            sp.rotation.x = i * TAU / WHEEL.shelves;
        }
    }
    cyl(g, 0.032, 0.032, 0.78, mat.darkSteel, 0, 0, 0, { rz: Math.PI / 2, cast: true });
    for (let i = 0; i < WHEEL.shelves; i++) {
        const holder = new THREE.Group();
        holder.rotation.x = i * TAU / WHEEL.shelves;
        box(holder, 0.56, WHEEL.plateT, 0.17, mat.steel,
            0, -WHEEL.shelfR - WHEEL.plateOff, 0.02, { cast: true });
        box(holder, 0.56, 0.10, 0.02, mat.steel, 0, -WHEEL.shelfR + 0.02, 0.105, { cast: true });
        g.add(holder);
    }
    scene.add(g);
    M.wheel = g;
    // Motorkasten
    box(scene, 0.22, 0.24, 0.24, mat.steel, 0.82, 0.30, 2.36, { cast: true });
}

// ---- Laufband oben ---------------------------------------------------------------
{
    const midZ = (BELT.z0 + BELT.z1) / 2;
    const midY = (BELT.y0 + BELT.y1) / 2 - 0.035;
    const tilt = Math.atan2(BELT.y1 - BELT.y0, BELT.z0 - BELT.z1);
    const g = new THREE.Group();
    g.position.set(BELT.cx, midY, midZ);
    g.rotation.x = tilt;
    beltTex.repeat.set(1, (BELT.len + 0.06) / TILE_M);
    box(g, BELT.w, 0.05, BELT.len + 0.06, mat.belt, 0, 0, 0, { cast: true });
    // Seitenführungen enden vor dem Rad — dort schwingen die Schaufeln durch
    const railLen = BELT.len - 0.30;
    box(g, 0.035, 0.10, railLen, mat.darkSteel, -BELT.w / 2 - 0.02, 0.02, -0.15, { cast: true });
    box(g, 0.035, 0.10, railLen, mat.darkSteel, BELT.w / 2 + 0.02, 0.02, -0.15, { cast: true });
    cyl(g, 0.045, 0.045, BELT.w, mat.rubber, 0, -0.01, -BELT.len / 2 - 0.03, { rz: Math.PI / 2, cast: true });
    cyl(g, 0.045, 0.045, BELT.w, mat.rubber, 0, -0.01, BELT.len / 2 + 0.03, { rz: Math.PI / 2, cast: true });
    scene.add(g);
    // Aufhängungen
    for (const z of [1.25, 1.7, 2.1]) {
        cyl(scene, 0.014, 0.014, HOUSING.yTop - BELT.yTop(z) - 0.1, mat.darkSteel,
            BELT.cx - BELT.w / 2 - 0.04, (HOUSING.yTop + BELT.yTop(z)) / 2 - 0.03, z);
        cyl(scene, 0.014, 0.014, HOUSING.yTop - BELT.yTop(z) - 0.1, mat.darkSteel,
            BELT.cx + BELT.w / 2 + 0.04, (HOUSING.yTop + BELT.yTop(z)) / 2 - 0.03, z);
    }
}

// ---- Karussell-Magazin --------------------------------------------------------------
{
    const g = new THREE.Group();
    g.position.set(TURRET.cx, TURRET.cy, TURRET.cz);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(TURRET.r, 0.016, 10, 40), mat.steel);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.05;
    ring1.castShadow = true;
    g.add(ring1);
    const ring2 = ring1.clone();
    ring2.position.y = -0.10;
    g.add(ring2);
    cyl(g, 0.05, 0.05, 0.22, mat.darkSteel, 0, 0, 0, { cast: true });
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10;
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.064, 0.17, 14, 1, true), cupMat);
        cup.position.set(TURRET.r * Math.sin(a), -0.055, TURRET.r * Math.cos(a));
        cup.castShadow = true;
        g.add(cup);
        box(g, 0.02, 0.012, TURRET.r - 0.06, mat.darkSteel,
            (TURRET.r / 2) * Math.sin(a), 0.05, (TURRET.r / 2) * Math.cos(a), { ry: a });
    }
    scene.add(g);
    M.turret = g;
    // Träger + Motor (statisch)
    cyl(scene, 0.03, 0.03, HOUSING.yTop - TURRET.cy - 0.14, mat.darkSteel,
        TURRET.cx, (HOUSING.yTop + TURRET.cy) / 2 + 0.07, TURRET.cz, { cast: true });
    box(scene, 0.2, 0.16, 0.2, mat.steel, TURRET.cx, HOUSING.yTop - 0.2, TURRET.cz, { cast: true });
}

// ---- Balltür & Rücklauf -----------------------------------------------------------
{
    const kx = LANE.kickIn;                       // Innenkante rechte Wand
    // dunkle Öffnung im Kickback
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.40),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.position.set(kx - 0.002, RETURN.railY, RETURN.zDoor);
    hole.rotation.y = -Math.PI / 2;
    scene.add(hole);
    box(scene, 0.015, 0.44, 0.05, mat.hazard, kx + 0.01, RETURN.railY, RETURN.zDoor - 0.17);
    box(scene, 0.015, 0.44, 0.05, mat.hazard, kx + 0.01, RETURN.railY, RETURN.zDoor + 0.17);

    // Pendelklappe (öffnet zur Rinne hin)
    const flap = new THREE.Group();
    flap.position.set(kx + 0.05, RETURN.railY + 0.07, RETURN.zDoor);
    const plate = box(flap, 0.02, 0.38, 0.30, mat.steel, 0, -0.19, 0, { cast: true });
    plate.material = mat.steel;
    scene.add(flap);
    M.flap = flap;

    // zwei Schienen nach vorn
    for (const dx of [-0.055, 0.055]) {
        cyl(scene, 0.011, 0.011, RETURN.zDoor - RETURN.zExit + 0.25, mat.steel,
            RETURN.x + dx, RETURN.railY - 0.075, (RETURN.zDoor + RETURN.zExit) / 2, { rx: Math.PI / 2, cast: true });
    }
    for (const z of [1.25, 0.7, 0.15]) {
        box(scene, 0.16, 0.02, 0.03, mat.darkSteel, RETURN.x, RETURN.railY - 0.10, z);
        cyl(scene, 0.012, 0.012, 0.42, mat.darkSteel, RETURN.x, RETURN.railY - 0.32, z);
    }

    // Beschleuniger-Reifen über der Schiene
    const tire = new THREE.Group();
    tire.position.set(RETURN.x, RETURN.railY + 0.20, RETURN.zAccel);
    const tmesh = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.034, 12, 22), mat.rubber);
    tmesh.rotation.y = Math.PI / 2;
    tmesh.castShadow = true;
    tire.add(tmesh);
    cyl(tire, 0.02, 0.02, 0.12, mat.darkSteel, 0, 0, 0, { rz: Math.PI / 2 });
    scene.add(tire);
    M.tire = tire;
    box(scene, 0.06, 0.30, 0.06, mat.darkSteel, RETURN.x - 0.09, RETURN.railY + 0.28, RETURN.zAccel);

    // Tunnelmündung vorn
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 24), mat.hazard);
    mouth.position.set(RETURN.x, RETURN.railY, RETURN.zExit);
    scene.add(mouth);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    dark.position.set(RETURN.x, RETURN.railY, RETURN.zExit - 0.005);
    scene.add(dark);
}

// ============ Pins & Kugel =================================================

const PIN_COLS = [   // [Form, halfHeight, Radius, y-Offset]
    ['cyl',  0.015, 0.031,  0.016],
    ['caps', 0.018, 0.0605, 0.112],
    ['caps', 0.020, 0.040,  0.166],
    ['caps', 0.045, 0.0235, 0.228],
    ['ball', 0,     0.031,  0.333],
];

class PinEnt {
    constructor(id) {
        this.id = id;
        this.mesh = new THREE.Mesh(pinGeo, pinMat);
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, -3 - id * 0.5, -2)
            .setCcdEnabled(true)
            .setLinearDamping(0.04).setAngularDamping(0.05));
        this.cols = [];
        for (const [shape, hh, r, y] of PIN_COLS) {
            const desc = shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(hh, r)
                       : shape === 'caps' ? RAPIER.ColliderDesc.capsule(hh, r)
                       : RAPIER.ColliderDesc.ball(r);
            desc.setTranslation(0, y, 0).setDensity(PIN.density)
                .setFriction(0.13).setRestitution(0.55)
                .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                .setContactForceEventThreshold(35);
            const col = world.createCollider(desc, this.body);
            colliderTag.set(col.handle, 'pin');
            handleBody.set(col.handle, this.body);
            this.cols.push(col);
        }

        this.mode = 'rail';               // 'phys' | 'rail'
        this.st = 'depot';                // Transport-Zustand
        this.pose = { p: new THREE.Vector3(0, -3, -2), q: new THREE.Quaternion() };
        this.track = new PoseTrack();
        this.track.init(this.pose.p, this.pose.q);
        this.blend = null;                // aktiver Übergang
        this.attachFn = null;             // Verfolgung einer Baugruppe
        this.spot = -1;                   // zugewiesener Aufstell-Spot
        this.beltPos = 0;
        this.slotIdx = -1;
        this.stillT = 0;
        this.setRailMode();
    }

    setRailMode() {
        if (this.mode === 'phys') {
            const t = this.body.translation(), r = this.body.rotation();
            this.pose.p.set(t.x, t.y, t.z);
            this.pose.q.set(r.x, r.y, r.z, r.w);
        }
        this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
        for (const c of this.cols) c.setEnabled(false);
        this.mode = 'rail';
    }

    setPhysAt(px, py, pz, quat) {
        for (const c of this.cols) c.setEnabled(true);
        this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        // Rapier 0.19 stellt die Masse nach col.setEnabled(true) nicht selbst wieder her
        if (this.body.recomputeMassPropertiesFromColliders) this.body.recomputeMassPropertiesFromColliders();
        this.body.setTranslation({ x: px, y: py, z: pz }, true);
        this.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        // Wichtig: NICHT sofort schlafen legen — ein schlafend aktivierter
        // Collider landet nie in der Broad-Phase und wäre für Kugel und
        // Kehrwerk unsichtbar. Der Pin schläft nach dem Aufstellen von selbst ein.
        this.body.wakeUp();
        this.mode = 'phys';
        this.st = 'free';
        this.blend = null;
        this.attachFn = null;
        this.pose.p.set(px, py, pz);
        this.pose.q.copy(quat);
    }

    railUpdate(dt) {
        if (this.blend) {
            const b = this.blend;
            b.t += dt;
            const kRaw = clamp(b.t / b.dur, 0, 1);
            const k = smooth(kRaw);
            const tgt = b.targetFn();
            if (b.path) {
                // vorgegebener Weg (Rutsche): Lage UND Neigung kommen daher
                b.path(k, this.pose.p, this.pose.q);
            } else {
                this.pose.p.lerpVectors(b.from.p, tgt.p, k);
                this.pose.p.y += (b.arc || 0) * Math.sin(Math.PI * kRaw);
                this.pose.q.slerpQuaternions(b.from.q, tgt.q, k);
            }
            if (b.t >= b.dur) {
                this.pose.p.copy(tgt.p);
                this.pose.q.copy(tgt.q);
                this.blend = null;
                if (b.onDone) b.onDone();
            }
        } else if (this.attachFn) {
            const tgt = this.attachFn();
            this.pose.p.copy(tgt.p);
            this.pose.q.copy(tgt.q);
        }
    }
}

function railBlend(pin, targetFn, dur, opts = {}) {
    pin.blend = {
        t: 0, dur,
        from: { p: pin.pose.p.clone(), q: pin.pose.q.clone() },
        targetFn, arc: opts.arc || 0, path: opts.path || null,
        onDone: opts.onDone || null,
    };
    pin.attachFn = null;
}

function railAttach(pin, poseFn) {
    pin.attachFn = poseFn;
    pin.blend = null;
}

const pins = [];
for (let i = 0; i < 22; i++) pins.push(new PinEnt(i));

// ---- Ziel-Posen der Transportstationen ----

const _tp = { p: new THREE.Vector3(), q: new THREE.Quaternion() };

// Der Pin liegt quer auf der Schaufel, sein Fuß ist der Bezugspunkt — also
// muss die Pose um eine halbe Pinlänge zurückgesetzt werden, sonst hinge er
// einseitig über das Blech hinaus. Und seine Achse gehört einen Bauchradius
// über die Blechoberseite, sonst steckt der Körper im Blech.
const SHELF_PIN_R = WHEEL.shelfR + WHEEL.plateOff - WHEEL.plateT / 2 - PIN.rBelly;

function shelfPoseAt(a) {
    _tp.p.set(WHEEL.cx - PIN.h / 2,
              WHEEL.cy - SHELF_PIN_R * Math.cos(a),
              WHEEL.cz - SHELF_PIN_R * Math.sin(a));
    _tp.q.copy(Q_LYING);
    return _tp;
}
function shelfAngle(i) { return norm2pi(V.wheel + i * TAU / WHEEL.shelves); }
function shelfPose(i) { return shelfPoseAt(shelfAngle(i)); }

// Ebenso auf dem Band: eine halbe Pinlänge zurück, damit er mittig liegt und
// nicht durch die Seitenführung ragt, und auf statt über der Gurtfläche.
// (Die Gurtoberseite liegt 4,3 mm unter BELT.yTop — Folge der Neigung.)
function beltPose(d) {
    const z = BELT.z0 - d;
    _tp.p.set(BELT.cx - PIN.h / 2, BELT.yTop(z) - 0.0043 + PIN.rBelly, z);
    _tp.q.copy(Q_LYING);
    return _tp;
}

function slotPose(i) {
    const a = V.turret + i * TAU / 10;
    _tp.p.set(TURRET.cx + TURRET.r * Math.sin(a), TURRET.baseY, TURRET.cz + TURRET.r * Math.cos(a));
    _tp.q.copy(Q_UP);
    return _tp;
}

// Fallweg eines Pins: erst durch die Rutsche, dann senkrecht in den Greifer.
const CHUTE_SPLIT = 0.62;
const _tan = new THREE.Vector3(), _upv = new THREE.Vector3(0, 1, 0);
function chuteDropPath(k) {
    const curve = chuteCurve(k);
    const end = curve.getPoint(1);
    return (u, outP, outQ) => {
        if (u <= CHUTE_SPLIT) {
            const s = u / CHUTE_SPLIT;
            curve.getPoint(s, outP);
            // Der Pin legt sich in die Rutsche: seine Achse folgt dem Bogen,
            // sonst ragte sein Kopf in der Kurve aus dem Käfig heraus.
            curve.getTangent(s, _tan).negate();
            outQ.setFromUnitVectors(_upv, _tan);
        } else {
            const t = (u - CHUTE_SPLIT) / (1 - CHUTE_SPLIT);
            outP.set(end.x, lerp(end.y, V.deckY - DECK.gripDrop, t), end.z);
            outQ.identity();
        }
    };
}

function cellPose(spotIdx) {
    const s = SPOTS[spotIdx];
    _tp.p.set(s[0], V.deckY - DECK.gripDrop, s[1]);
    _tp.q.copy(Q_UP);
    return _tp;
}

// Ablageplatz in der Mulde: Das Holz liegt physisch dort, wo es hingerollt
// ist — diese Pose dient nur dem Nachschieben von außen (Restholz, das die
// Maschine von Hand aus dem Deck räumt).
function pitDropPose(n) {
    _tp.p.set(WHEEL.cx - 0.19 + (n % 2 ? 0.10 : -0.10),
              PIT.yTrough + PIN.rBelly + 0.01,
              PIT.zLedge - 0.16 - (n % 5) * 0.15);
    _tp.q.copy(Q_LYING);
    return _tp;
}

// ---- Kugel ----

const ball = {
    mesh: new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 36, 24), ballMats[0]),
    body: world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, -5, -2).setCcdEnabled(true).setAngularDamping(0.06)),
    mode: 'idle',                          // idle | roll | rail
    matIdx: 0,
    pose: { p: new THREE.Vector3(0, -5, -2), q: new THREE.Quaternion() },
    track: new PoseTrack(),
    railQ: [], railT: 0,
    pitT: 0,
};
ball.mesh.castShadow = true;
ball.mesh.visible = false;
scene.add(ball.mesh);
{
    const desc = RAPIER.ColliderDesc.ball(BALL.r).setDensity(BALL.density)
        .setFriction(0.05).setRestitution(0.02)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(150);
    // Kugel prallt nie federnd von Pins ab (Min statt Mittelwert der Restitution)
    if (RAPIER.CoefficientCombineRule && desc.setRestitutionCombineRule) {
        desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
    }
    ball.col = world.createCollider(desc, ball.body);
    colliderTag.set(ball.col.handle, 'ball');
    handleBody.set(ball.col.handle, ball.body);
    ball.col.setEnabled(false);
    ball.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
    ball.track.init(ball.pose.p, ball.pose.q);
}

function ballPark() {
    ball.mode = 'idle';
    ball.mesh.visible = false;
    ball.col.setEnabled(false);
    ball.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
}

function ballLaunch(x, y, vx, v) {
    ball.matIdx = (ball.matIdx + 1) % ballMats.length;
    ball.mesh.material = ballMats[ball.matIdx];
    ball.mesh.visible = true;
    ball.col.setEnabled(true);
    ball.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (ball.body.recomputeMassPropertiesFromColliders) ball.body.recomputeMassPropertiesFromColliders();
    ball.body.setTranslation({ x, y, z: LANE.zFront + 0.15 }, true);
    ball.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    ball.body.setLinvel({ x: vx, y: 0, z: v }, true);
    ball.body.setAngvel({ x: v / BALL.r * 0.97, y: rand(-6, 6), z: 0 }, true);
    ball.body.wakeUp();
    ball.mode = 'roll';
    ball.pitT = 0;
    ball.pose.p.set(x, y, LANE.zFront + 0.15);
    ball.pose.q.identity();
    ball.track.init(ball.pose.p, ball.pose.q);
}

function captureBall(silent) {
    if (ball.mode !== 'roll') return;
    const t = ball.body.translation(), r = ball.body.rotation();
    ball.pose.p.set(t.x, t.y, t.z);
    ball.pose.q.set(r.x, r.y, r.z, r.w);
    ball.col.setEnabled(false);
    ball.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
    ball.mode = 'rail';
    ball.railT = 0;
    const yPit = PIT.floorAt(1.32) + BALL.r;
    ball.railQ = [
        { p: [0.45, yPit, 1.32], dur: 0.8 },
        { p: [0.68, PIT.floorAt(RETURN.zDoor) + BALL.r, RETURN.zDoor], dur: 0.5, flap: true },
        { p: [RETURN.x, RETURN.railY, RETURN.zDoor], dur: 0.45, flap: true },
        { p: [RETURN.x, RETURN.railY, RETURN.zAccel], dur: 0.8 },
        { p: [RETURN.x, RETURN.railY, RETURN.zExit], dur: 0.35, accel: true },
    ];
    if (!silent) sfx.thud(0.5, t.x);
}

function ballRailUpdate(dt) {
    if (ball.mode !== 'rail') return;
    const seg = ball.railQ[0];
    if (!seg) { ballPark(); return; }
    if (seg.t === undefined) {
        seg.t = 0;
        seg.from = ball.pose.p.clone();
        if (seg.accel) sfx.whir();
    }
    seg.t += dt;
    const kRaw = clamp(seg.t / seg.dur, 0, 1);
    const k = seg.accel ? kRaw * kRaw : smooth(kRaw);
    const oldZ = ball.pose.p.z;
    ball.pose.p.set(
        lerp(seg.from.x, seg.p[0], k),
        lerp(seg.from.y, seg.p[1], k),
        lerp(seg.from.z, seg.p[2], k));
    // Roll-Optik: Drehung passend zur z-Bewegung
    const dz = ball.pose.p.z - oldZ;
    _q1.setFromAxisAngle(X_AXIS, dz / BALL.r);
    ball.pose.q.premultiply(_q1);
    // Klappe & Reifen ansteuern
    V.flap += ((seg.flap ? 1 : 0) - V.flap) * Math.min(1, dt * 7);
    if (seg.accel) V.tire += dt * 40;
    if (seg.t >= seg.dur) ball.railQ.shift();
}

// ============ Transport (Grube -> Rad -> Band -> Magazin -> Tisch) =========

const transport = {
    shelfPins: new Array(WHEEL.shelves).fill(null),
    beltPins: [],                          // [0] ist vorderster Pin
    slots: new Array(10).fill(null),       // Karussell-Becher
    unload: null,                          // {phase, t, launched}
    turretTurn: null,                      // {target}
    dropBusy: false,
    wheelRun: false, beltRun: false, carpetRun: false,
};

const turretCount = () => transport.slots.filter(Boolean).length;
const pinsInDeckCount = () => pins.filter(p => p.st === 'deck').length;

// Liegt der Pin körperlich in der Grube (also hinter der Deckkante, vor dem
// Rad)? Solche Pins sind dynamisch — sie rollen die Rampe hinunter und warten
// an der Fangleiste auf die nächste Schaufel.
function inPit(p) {
    if (p.mode !== 'phys') return false;
    const t = p.body.translation();
    return t.z > LANE.tailEnd + 0.04 && t.z < PIT.zLedge + 0.12 && t.y < 0.05;
}
const pitCount = () => pins.filter(inPit).length;
const transitCount = () => pitCount() + pins.filter(p =>
    ['toShelf', 'shelf', 'toBelt', 'belt', 'toTurret'].includes(p.st)).length;

// Holz, das die Maschine selbst aus dem Deck räumt (Klemmer, Reset), wird
// hinten in die Mulde gelegt — dynamisch, damit es sich normal einreiht.
let pitDropN = 0;
function capturePinToPit(p) {
    const pose = pitDropPose(pitDropN++);
    p.setPhysAt(pose.p.x, pose.p.y, pose.p.z, pose.q);
    p.stillT = 0;
}

function slotAngleDist(i, target) {
    const a = norm2pi(V.turret + i * TAU / 10 - target);
    return Math.min(a, TAU - a);
}

function transportUpdate(dt) {
    const tr = transport;

    // ---- Grubenteppich ----
    // Der Grubenboden ist ein Förderband: Es zieht das aufliegende Holz nach
    // hinten gegen die Fangleiste. Zusammen mit dem Gefälle der Rampe kommt
    // jeder Pin von selbst dort an, wo ihn die Schaufeln abholen.
    const inPitPins = [];
    for (const p of pins) {
        if (!inPit(p)) continue;
        inPitPins.push(p);
        const t = p.body.translation();
        if (t.y > PIT.floorAt(t.z) + 0.32) continue;       // fliegt gerade noch
        const m = p.body.mass(), vz = p.body.linvel().z;
        // Mitnahme wie von einem Band: Das Holz wird auf Bandgeschwindigkeit
        // gezogen (begrenzte Kraft, damit ein Stau nicht durchgeschoben wird).
        // Der Impuls weckt auch schlafende Körper wieder auf.
        const dv = PIT.carpetV - vz;
        if (dv > 0) p.body.applyImpulse({ x: 0, y: 0, z: m * Math.min(dv, 6 * dt) }, true);
        // Lattenband: Alle 6,75 cm läuft eine Querleiste unter dem Holz durch
        // und hebt es kurz an. Das ist nicht Kosmetik — ein Haufen Pins verkeilt
        // sich gegenseitig und gegen die Kickbacks, und gegen so eine Verspannung
        // richtet eine gleichmäßige Schubkraft nichts aus, egal wie groß sie ist.
        // Das Rütteln löst die Verspannung, wie bei jedem Rüttelförderer.
        if (vz < PIT.carpetV * 0.8) {
            p.slatStall = Math.min((p.slatStall || 0) + dt, 3);
            const ph = Math.floor((V.carpet + t.z) / TILE_M);
            if (p.slatPh === undefined) p.slatPh = ph;
            if (ph !== p.slatPh) {
                p.slatPh = ph;
                // Die Leiste schiebt vor allem NACH VORN und hebt nur leicht
                // an — sonst hüpft der Pin auf der Stelle. Angriffspunkt unten
                // am Pin, nicht im Schwerpunkt: So rollt er über die Kante ab,
                // statt sich nur zu heben. Je länger er schon liegt, desto
                // beherzter greift die Leiste zu.
                const k = 1 + p.slatStall * 0.5;
                p.body.applyImpulseAtPoint(
                    { x: m * rand(-0.05, 0.05), y: m * 0.09, z: m * 0.26 * k },
                    { x: t.x, y: PIT.floorAt(t.z), z: t.z }, true);
            }
        } else p.slatStall = 0;
    }
    tr.carpetRun = inPitPins.length > 0;
    if (tr.carpetRun) V.carpet += dt * PIT.carpetV;   // in Metern Bandweg

    // Kopf des Laufbands blockiert? (Magazin voll oder Übergabe belegt)
    const head = tr.beltPins[0];
    const headWaiting = head && head.st === 'belt' && head.beltPos >= BELT.len - 0.02;
    const headStuck = headWaiting && (tr.dropBusy || tr.unload || turretCount() === 10);

    // ---- Aufzugsrad ----
    const hasWork = inPitPins.length > 0 || tr.shelfPins.some(Boolean);
    const nearDrop = tr.shelfPins.some((p, i) => {
        if (!p) return false;
        const a = shelfAngle(i);
        return a > WHEEL.dropA - 0.45 && a < WHEEL.dropA;
    });
    tr.wheelRun = hasWork && !(nearDrop && headStuck);
    if (tr.wheelRun) V.wheel += dt * TAU / WHEEL.period;

    // Aufnahme an der Fangleiste: Die Schaufel fährt durch die Mulde und nimmt
    // den Pin mit, der ihr am nächsten liegt. Der Übergabeweg ist kurz — der
    // Pin springt nicht mehr aus der Grube hoch, er wird untergriffen.
    for (let s = 0; s < WHEEL.shelves; s++) {
        if (tr.shelfPins[s]) continue;
        const a = shelfAngle(s);
        if (a < WHEEL.pickA0 || a > WHEEL.pickA1) continue;
        // Maßgeblich ist das vorderste Ende des Pins, nicht sein Fußpunkt: Ein
        // längs liegender Pin berührt die Fangleiste schon mit der Spitze,
        // während sein Bezugspunkt noch 38 cm dahinter liegt. Nach dem Fußpunkt
        // zu greifen hieße, ihn zu übersehen — und alles hinter ihm blockiert.
        let best = null, bestZ = -1e9;
        for (const p of inPitPins) {
            const t = p.body.translation(), r = p.body.rotation();
            const az = 2 * (r.y * r.z - r.w * r.x);         // z-Anteil der Pinachse
            const front = t.z + Math.max(0, az) * PIN.h;
            if (front < PIT.zLedge - 0.45) continue;        // noch außer Reichweite
            const v = p.body.linvel();
            if (v.x * v.x + v.y * v.y + v.z * v.z > 0.6) continue;   // rollt noch
            if (front > bestZ) { bestZ = front; best = p; }
        }
        if (!best) break;
        const p = best;
        p.setRailMode();
        tr.shelfPins[s] = p;
        p.st = 'toShelf';
        railBlend(p, () => shelfPose(s), 0.55, {
            onDone: () => { p.st = 'shelf'; railAttach(p, () => shelfPose(s)); },
        });
        break;
    }

    // Übergabe Rad -> Band
    for (let s = 0; s < WHEEL.shelves; s++) {
        const p = tr.shelfPins[s];
        if (!p || p.st !== 'shelf') continue;
        const a = shelfAngle(s);
        if (a >= WHEEL.dropA && a <= WHEEL.dropA1) {
            const last = tr.beltPins[tr.beltPins.length - 1];
            if (!last || last.beltPos > BELT.gap) {
                tr.shelfPins[s] = null;
                p.st = 'toBelt';
                p.beltPos = 0;
                tr.beltPins.push(p);
                railBlend(p, () => beltPose(p.beltPos), 0.7, {
                    arc: 0.12,
                    onDone: () => { p.st = 'belt'; railAttach(p, () => beltPose(p.beltPos)); },
                });
            }
        }
    }

    // ---- Band ----
    let anyMoved = false;
    for (let i = 0; i < tr.beltPins.length; i++) {
        const p = tr.beltPins[i];
        if (p.st !== 'belt') continue;
        const limit = i === 0 ? BELT.len : tr.beltPins[i - 1].beltPos - BELT.gap;
        const next = Math.min(p.beltPos + BELT.speed * dt, Math.max(limit, p.beltPos));
        if (next > p.beltPos + 1e-6) { p.beltPos = next; anyMoved = true; }
    }
    tr.beltRun = anyMoved;
    if (anyMoved) V.belt += dt * BELT.speed;

    // ---- Karussell hält proaktiv einen leeren Becher bereit ----
    // Wie beim echten Automaten: Becher füllen, SOFORT weiterdrehen, und
    // dann mit dem leeren Becher an der Übergabe auf den nächsten Pin warten.
    if (!tr.unload && !tr.dropBusy && !tr.turretTurn && turretCount() < 10) {
        let emptyAligned = false;
        for (let i = 0; i < 10; i++) {
            if (!tr.slots[i] && slotAngleDist(i, 0) < 0.06) { emptyAligned = true; break; }
        }
        if (!emptyAligned) {
            // nächsten freien Becher heranholen — das Karussell indexiert
            // wie ein echtes Ratschen-Magazin immer in DIESELBE Richtung
            let best = -1, bestA = 1e9;
            for (let i = 0; i < 10; i++) {
                if (tr.slots[i]) continue;
                const cur = norm2pi(V.turret + i * TAU / 10);
                if (cur < bestA) { bestA = cur; best = i; }
            }
            if (best >= 0) tr.turretTurn = { target: V.turret - bestA };
        }
    }

    // ---- Übergabe Band -> Karussell (der leere Becher wartet schon) ----
    if (headWaiting && !tr.dropBusy && !tr.unload && !tr.turretTurn) {
        let aligned = -1;
        for (let i = 0; i < 10; i++) {
            if (!tr.slots[i] && slotAngleDist(i, 0) < 0.06) { aligned = i; break; }
        }
        if (aligned >= 0) {
            const p = tr.beltPins.shift();
            tr.dropBusy = true;
            tr.slots[aligned] = p;
            p.st = 'toTurret';
            p.slotIdx = aligned;
            // Das Bandende liegt über dem Becherrand — der Pin kippt herunter
            // und fällt in den Becher, ohne Bogen nach oben.
            railBlend(p, () => slotPose(p.slotIdx), 0.8, {
                onDone: () => {
                    p.st = 'turret';
                    railAttach(p, () => slotPose(p.slotIdx));
                    tr.dropBusy = false;
                    sfx.tick();
                },
            });
        }
    }

    // Karussell-Drehung (Zustellen / Ausrichten)
    if (tr.turretTurn) {
        const d = tr.turretTurn.target - V.turret;
        const step = clamp(d, -TURRET.stepSpeed * dt, TURRET.stepSpeed * dt);
        V.turret += step;
        if (Math.abs(d) < 0.005) { V.turret = tr.turretTurn.target; tr.turretTurn = null; }
    }

    // ---- Magazin entlädt in den Tisch ----
    if (tr.unload) {
        const u = tr.unload;
        if (u.phase === 'align') {
            // auch das Ausrichten dreht nur in der festen Richtung weiter
            const stepAng = TAU / 10;
            const target = Math.floor(V.turret / stepAng + 1e-6) * stepAng;
            const d = target - V.turret;
            V.turret += clamp(d, -TURRET.stepSpeed * dt, TURRET.stepSpeed * dt);
            if (Math.abs(d) < 0.005) {
                V.turret = target;
                u.phase = 'launch';
                u.t = 0;
                // Jeder Becher steht jetzt exakt über "seiner" Rutsche — die
                // Zuordnung Ringplatz → Aufstell-Spot liegt fest (CHUTE_MAP).
                u.order = [];
                const m = Math.round(V.turret / stepAng);
                for (let i = 0; i < 10; i++) {
                    if (!tr.slots[i] || tr.slots[i].st !== 'turret') continue;
                    const ring = ((m + i) % 10 + 10) % 10;
                    u.order.push({ slot: i, ring, spot: CHUTE_MAP[ring] });
                }
            }
        } else {
            // Alle 10 Pins fallen GLEICHZEITIG los — jeder durch seine
            // Rutsche und durch das Loch in der Tischplatte in die geöffneten
            // Backen darunter.
            if (!u.dropped) {
                u.dropped = true;
                for (const pick of u.order) {
                    const p = tr.slots[pick.slot];
                    tr.slots[pick.slot] = null;
                    p.st = 'toDeck';
                    p.spot = pick.spot;
                    p.slotIdx = -1;
                    railBlend(p, () => cellPose(p.spot), 0.8, {
                        path: chuteDropPath(pick.ring),
                        onDone: () => { p.st = 'deck'; railAttach(p, () => cellPose(p.spot)); },
                    });
                }
                sfx.click();
            }
            if (u.dropped && pinsInDeckCount() === u.order.length) {
                tr.unload = null;
                sfx.clack(900, 0);            // Pins rasten in den Halterungen ein
            }
        }
    }
}

// ============ Zählung, Greifen, Setzen =====================================

function pinUpY(p) {
    const r = p.body.rotation();
    return 1 - 2 * (r.x * r.x + r.z * r.z);   // y-Komponente der Pin-Hochachse
}

function surveyPins() {
    const standing = [], deadwood = [];
    const freeSpots = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const p of pins) {
        if (p.mode !== 'phys') continue;
        const t = p.body.translation();
        let ok = false;
        if (t.y < 0.08 && t.y > -0.05 && pinUpY(p) > 0.90 && t.z > -0.5 && t.z < 1.0) {
            let best = -1, bestD = 1e9;
            for (const i of freeSpots) {
                const dx = t.x - SPOTS[i][0], dz = t.z - SPOTS[i][1];
                const d = Math.hypot(dx, dz);
                if (d < bestD) { bestD = d; best = i; }
            }
            if (best >= 0 && bestD <= 0.078) {
                freeSpots.delete(best);
                standing.push({ pin: p, spot: best });
                ok = true;
            }
        }
        if (!ok) deadwood.push(p);
    }
    return { standing, deadwood };
}

function grabStandingPins() {
    const survey = surveyPins();
    for (const { pin, spot } of survey.standing) {
        pin.setRailMode();
        pin.st = 'toCell';
        pin.spot = spot;
        railBlend(pin, () => cellPose(pin.spot), 0.28, {
            onDone: () => { pin.st = 'deck'; railAttach(pin, () => cellPose(pin.spot)); },
        });
    }
    if (survey.standing.length) sfx.click();
}

function releaseDeckPins() {
    for (const p of pins) {
        if (p.st === 'deck' || p.st === 'toCell') {
            const s = SPOTS[p.spot];
            p.setPhysAt(s[0], 0.001, s[1], Q_UP);
        }
    }
}

// Vor dem Neuaufstellen darf NICHTS mehr auf dem Deck liegen oder stehen —
// sonst würde das neue Rack in Altbestand hineingesetzt. Was in der Grube
// liegt, bleibt liegen: Das ist der normale Weg zum Aufzug.
function clearDeckCompletely() {
    let n = 0;
    for (const p of pins) {
        if (p.mode !== 'phys') continue;
        const t = p.body.translation();
        if (t.z < LANE.tailEnd + 0.06 && t.z > -0.8 && t.y > PIT.yLip - 0.02) {
            capturePinToPit(p);
            n++;
        }
    }
    if (n) toast('RESTHOLZ ENTFERNT (' + n + ')');
}

// ============ Maschinenzyklus (Sequencer) ==================================

const machine = {
    state: 'IDLE',                        // IDLE | ROLLING | CYCLE
    idleT: 0, rollT: 0,
    pendingDef: null, launchT: 0, launchedAt: 0,
    guard: null,                          // laufender Schranken-Abwurf
    q: [], step: null,
    frame: 1, wurf: 1,
    auto: false, pending: [],             // vorgemerkte Würfe, in Klickreihenfolge
    phase: 'BEREIT',
    thrownType: '',
    sweepRetries: 0,
    cycles: 0,
    lastResult: '—',
};

function stMove(props, dur) {
    let t = 0; const from = {};
    return {
        enter() { t = 0; for (const k in props) from[k] = V[k]; },
        update(dt) {
            t += dt;
            const k = smooth(clamp(t / dur, 0, 1));
            for (const key in props) V[key] = lerp(from[key], props[key], k);
            return t >= dur;
        },
    };
}
const stWait  = dur => { let t = 0; return { enter() { t = 0; }, update(dt) { t += dt; return t >= dur; } }; };
const stPhase = txt => ({ enter() { machine.phase = txt; }, update: () => true });
const stCall  = fn  => ({ enter() { fn(); }, update: () => true });
const stUntil = (cond, waitPhase) => ({
    enter() { if (waitPhase) machine.phase = waitPhase; },
    update: () => cond(),
});

// ---- Ballpolster-Schalter ------------------------------------------------
// In echten Automaten hängt die Schranke nicht am Räumzyklus: Sie fällt in
// dem Moment, in dem die Kugel hinten ans Polster schlägt. Das ist ihr
// eigentlicher Zweck: das Pindeck absperren, bevor Restholz zurückspringt
// oder ein zweiter Ball nachkommt. Der Zyklus wartet danach weiter, bis das
// Holz liegt — das sieht man der Schranke dann aber nicht mehr an.
function armSweepGuard() {
    if (machine.state !== 'ROLLING') return;
    if (machine.guard || V.sweepY <= SWEEP.yDown + 1e-4) return;
    machine.guard = { t: 0, from: V.sweepY, dur: 0.55 };
    machine.phase = 'KEHRWERK SENKT SICH';
}

function guardUpdate(dt) {
    const g = machine.guard;
    if (!g) return;
    g.t += dt;
    const k = smooth(clamp(g.t / g.dur, 0, 1));
    V.sweepY = lerp(g.from, SWEEP.yDown, k);
    if (g.t >= g.dur) {
        V.sweepY = SWEEP.yDown;
        machine.guard = null;
        if (machine.state === 'ROLLING') machine.phase = 'HOLZ KOMMT ZUR RUHE';
    }
}

function pushSweepStrokes(steps) {
    steps.push(stPhase('KEHRWERK RÄUMT'), stMove({ sweepZ: SWEEP.zEnd }, 1.25));
    steps.push(stPhase('KEHRWERK ZURÜCK'), stMove({ sweepZ: SWEEP.zGuard }, 1.05));
    steps.push(stCall(secondPassIfNeeded));
}

function secondPassIfNeeded() {
    // Liegt nach dem Hub noch loses Holz auf dem Deck?
    const leftovers = pins.filter(p => {
        if (p.mode !== 'phys') return false;
        const t = p.body.translation();
        return t.z < LANE.tailEnd && t.y < 0.2 && pinUpY(p) < 0.90;
    });
    if (!leftovers.length) { machine.sweepRetries = 0; return; }
    if (machine.sweepRetries < 1) {
        machine.sweepRetries++;
        machine.q.unshift(
            stPhase('KEHRWERK RÄUMT (2. HUB)'),
            stMove({ sweepZ: SWEEP.zEnd }, 1.15),
            stMove({ sweepZ: SWEEP.zGuard }, 1.0),
            stCall(secondPassIfNeeded));
    } else {
        machine.sweepRetries = 0;
        for (const p of leftovers) capturePinToPit(p);
        toast('PIN KLEMMT – MANUELL ENTFERNT');
    }
}

// Absetzen wie in echt: Klammern lösen, dann taucht der Tisch noch gut
// 2 cm nach und gleitet ohne Absetzer aus der Abwärts- in die
// Aufwärtsbewegung — so wirft er die frisch gestellten Pins beim
// Hochfahren nicht wieder um.
function pushSetDownSteps(steps) {
    steps.push(stMove({ grip: 1 }, 0.3), stCall(releaseDeckPins));
    steps.push(stMove({ deckY: DECK.yDown - 0.022 }, 0.45));
    steps.push(stMove({ deckY: DECK.yHome }, 1.15));
}

// Wartet aufs volle Magazin, entlädt es in den Tisch und stellt das Rack.
function pushRackSetSteps(steps) {
    steps.push(stUntil(() =>
        turretCount() >= 10 && !transport.dropBusy &&
        transport.slots.every(p => !p || p.st === 'turret'),
        'WARTE AUF PINNACHSCHUB'));
    // Backen auf, sonst kommt kein Pin durch die Halterung; sie schnappen erst
    // zu, wenn alle zehn unten sind — dann hängen sie am Hals.
    steps.push(stPhase('MAGAZIN ENTLÄDT'), stMove({ grip: 1 }, 0.25));
    steps.push(stCall(() => { transport.unload = { phase: 'align', t: 0 }; }));
    steps.push(stUntil(() => !transport.unload && pinsInDeckCount() === 10));
    steps.push(stMove({ grip: 0 }, 0.16));    // Backen zu
    steps.push(stWait(0.5));                  // kurz setzen lassen, dann absetzen
    steps.push(stPhase('RACK WIRD GESETZT'), stMove({ deckY: DECK.yDown }, 1.15));
    pushSetDownSteps(steps);
    steps.push(stPhase('KEHRWERK HEBT SICH'), stMove({ sweepY: SWEEP.yUp }, 0.65));
}

function finishCycleSteps(steps) {
    steps.push(stPhase('BEREIT'), stCall(() => { machine.state = 'IDLE'; machine.idleT = 0; }));
    machine.q = steps;
    machine.step = null;
    machine.state = 'CYCLE';
}

function buildCycle() {
    // Notfall-Auslöser: Steckt die Kugel irgendwo auf der Bahn, hat der
    // Polsterschalter nie ausgelöst — dann sperrt der Zyklus das Deck jetzt.
    armSweepGuard();
    const survey = surveyPins();
    scoreThrow(survey);
    const steps = [];
    const n = survey.standing.length;
    const isBall1 = machine.wurf === 1;

    // Die Schranke fällt nicht mehr hier: Sie ist beim Anschlag ans Ballpolster
    // schon unten. Läuft der Abwurf noch, wartet der Zyklus ihn ab.
    if (machine.guard) steps.push(stPhase('KEHRWERK SENKT SICH'), stUntil(() => !machine.guard));

    if (isBall1 && n > 0) {
        // Erster Wurf, es steht noch etwas (auch: gar nichts gefallen):
        // stehende Pins heben, Holz räumen, dieselben Pins nachsetzen
        steps.push(stPhase('GREIFER SENKT SICH'), stMove({ deckY: DECK.yDown }, 1.05));
        steps.push(stMove({ grip: 0 }, 0.3), stCall(grabStandingPins), stWait(0.35));
        steps.push(stPhase('GREIFER HEBT PINS'), stMove({ deckY: DECK.yHome }, 1.05));
        pushSweepStrokes(steps);
        steps.push(stPhase('PINS NACHSETZEN'), stMove({ deckY: DECK.yDown }, 1.05));
        pushSetDownSteps(steps);
        steps.push(stPhase('KEHRWERK HEBT SICH'), stMove({ sweepY: SWEEP.yUp }, 0.65));
        steps.push(stCall(() => { machine.wurf = 2; }));
    } else {
        // Strike oder zweiter Wurf: alles räumen, neues Rack aus dem Magazin
        pushSweepStrokes(steps);
        steps.push(stCall(clearDeckCompletely));
        pushRackSetSteps(steps);
        steps.push(stCall(() => { machine.wurf = 1; machine.frame++; machine.cycles++; }));
    }
    finishCycleSteps(steps);
}

// Reset Frame: alles abräumen und ein frisches Rack stellen (ohne Wertung,
// der Frame beginnt wieder mit Wurf 1). Reset Game macht dasselbe und setzt
// zusätzlich die Zählung auf Frame 1 zurück — das gehört immer zusammen.
function buildReset(resetGame) {
    // Reset heißt reiner Tisch — auch für die vorgemerkten Würfe
    machine.pending.length = 0;
    updateThrowButtons();
    const steps = [];
    steps.push(stPhase(resetGame ? 'RESET GAME: ABRÄUMEN' : 'RESET: ABRÄUMEN'),
               stMove({ sweepY: SWEEP.yDown }, 0.7));
    pushSweepStrokes(steps);
    steps.push(stCall(clearDeckCompletely));
    pushRackSetSteps(steps);
    steps.push(stCall(() => {
        machine.wurf = 1;
        machine.lastResult = '—';
        if (resetGame) machine.frame = 1;
    }));
    finishCycleSteps(steps);
}

function machineUpdate(dt) {
    guardUpdate(dt);                      // läuft zustandsübergreifend zu Ende
    if (machine.state === 'IDLE') {
        machine.idleT += dt;
        const delay = machine.wurf === 1 ? 1.5 : 1.2;
        if (machine.pending.length && machine.idleT > 0.5) {
            const t = machine.pending.shift();
            updateThrowButtons();
            // 'random' erst jetzt auflösen: beim Abspielen kann Wurf 2 anstehen
            doThrow(t === 'random' ? pickThrowType() : t);
        } else if (machine.auto && machine.idleT > delay) {
            doThrow(pickThrowType());
        }
    } else if (machine.state === 'ROLLING') {
        machine.rollT += dt;
        if (machine.pendingDef) {
            // Kugel ist noch auf der (unsichtbaren) Bahn unterwegs
            machine.launchT -= dt;
            if (machine.launchT <= 0) {
                const d = machine.pendingDef;
                machine.pendingDef = null;
                machine.launchedAt = machine.rollT;
                ballLaunch(d.x, d.y || BALL.r + 0.004, d.vx, d.v);
            }
            return;
        }
        const since = machine.rollT - machine.launchedAt;
        // Auslöser der Schranke ist der Polsterkontakt (siehe drainContacts).
        // Bleibt der aus, weil die Kugel schon vorher in der Grube liegen
        // bleibt, löst die Grube selbst aus.
        if (ball.mode !== 'roll' || ball.pitT > 0.12) armSweepGuard();
        const ballGone = ball.mode !== 'roll' || ball.body.translation().z > 1.10;
        let quiet = true;
        for (const p of pins) {
            if (p.mode !== 'phys') continue;
            // Nur das Holz auf dem Deck zählt. Was in der Grube rollt, geht
            // den Zyklus nichts an — sonst wartet die Maschine auf einen Pin,
            // der längst auf dem Weg zum Aufzug ist.
            if (p.body.translation().z > LANE.tailEnd) continue;
            const lv = p.body.linvel(), av = p.body.angvel();
            if (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z > 0.012 ||
                av.x * av.x + av.y * av.y + av.z * av.z > 0.08) { quiet = false; break; }
        }
        if ((since > 1.7 && ballGone && quiet) || since > 4.6) buildCycle();
    } else if (machine.state === 'CYCLE') {
        let guard = 0;
        while (guard++ < 24) {
            if (!machine.step) {
                machine.step = machine.q.shift() || null;
                if (!machine.step) break;
                machine.step.enter();
            }
            if (machine.step.update(dt)) machine.step = null;
            else break;
        }
    }
}

// ============ Würfe & Wertung ==============================================

// Würfe werden über die gewünschte ANKUNFT am Kopf-Pin definiert; die
// Startposition ergibt sich aus der Seitwärtsgeschwindigkeit und der Flugzeit.
function aimedThrow(arriveX, vx, v) {
    const t = (0 - (LANE.zFront + 0.15)) / v;      // Zeit bis Pin 1
    // Start bleibt sicher auf der Bahn (Kugelrand vor der Rinne)
    return { x: clamp(arriveX - vx * t, -0.41, 0.41), vx, v };
}

const THROW_DEFS = {
    pocket:   () => aimedThrow(rand(0.075, 0.105), rand(-0.68, -0.50), rand(7.8, 8.6)),
    brooklyn: () => aimedThrow(rand(-0.105, -0.075), rand(0.50, 0.68), rand(7.7, 8.4)),
    headon:   () => aimedThrow(rand(-0.02, 0.02), rand(-0.05, 0.05), rand(7.4, 8.3)),
    thin:     () => { const s = Math.random() < 0.6 ? 1 : -1;
                      return aimedThrow(s * rand(0.17, 0.24), -s * rand(0, 0.15), rand(6.9, 7.8)); },
    five:     () => { const s = Math.random() < 0.5 ? 1 : -1;
                      return aimedThrow(s * rand(0.26, 0.34), 0, rand(6.8, 7.7)); },
    edge:     () => { const s = Math.random() < 0.5 ? 1 : -1;
                      return aimedThrow(s * rand(0.40, 0.47), s * rand(-0.05, 0.08), rand(6.9, 7.9)); },
    gutter:   () => { const s = Math.random() < 0.5 ? 1 : -1;
                      return { x: s * (LANE.half + LANE.gutterW / 2), vx: 0, v: rand(6.4, 7.4),
                               y: 0.064, gutter: true }; },
    // Zielwurf: nimmt den vordersten noch stehenden Pin ins Visier. Die Kugel
    // startet immer in Bahnmitte und läuft bei außermittigem Ziel leicht
    // schräg an — beim vollen Rack also praktisch ein Frontalwurf auf Pin 1.
    ziel:     () => {
        const standing = surveyPins().standing;
        let tx = 0, tz = 0;               // leeres Deck: auf den Kopf-Pin-Spot
        if (standing.length) {
            const order = standing.map(s => s.spot).sort((a, b) =>
                (SPOTS[a][1] - SPOTS[b][1]) ||                      // vorderste Reihe
                (Math.abs(SPOTS[a][0]) - Math.abs(SPOTS[b][0])));   // dann nah zur Mitte
            // Spiegel-Patt (z. B. 7–10): fairer Münzwurf unter den Gleichauf-Pins
            const tied = order.filter(s =>
                SPOTS[s][1] === SPOTS[order[0]][1] &&
                Math.abs(SPOTS[s][0]) === Math.abs(SPOTS[order[0]][0]));
            const spot = tied[Math.floor(Math.random() * tied.length)];
            tx = SPOTS[spot][0]; tz = SPOTS[spot][1];
        }
        const v = rand(7.2, 8.1);
        const x0 = rand(-0.02, 0.02);
        const t = (tz - (LANE.zFront + 0.15)) / v; // Flugzeit bis zum Ziel-Spot
        return { x: x0, vx: (tx + rand(-0.02, 0.02) - x0) / t, v };
    },
};

const AUTO_WEIGHTS = [
    ['pocket', 38], ['brooklyn', 8], ['headon', 6], ['ziel', 5], ['thin', 13],
    ['five', 12], ['edge', 10], ['gutter', 8],
];

function pickThrowType() {
    // Zweiter Wurf: meist aufs Grüppchen (Schwerpunkt), gelegentlich als
    // Zielwurf gezielt auf den vordersten stehenden Pin.
    if (machine.wurf === 2) return Math.random() < 0.35 ? 'ziel' : '_second';
    let sum = 0;
    for (const [, w] of AUTO_WEIGHTS) sum += w;
    let r = Math.random() * sum;
    for (const [t, w] of AUTO_WEIGHTS) { r -= w; if (r <= 0) return t; }
    return 'pocket';
}

function doThrow(type) {
    let def;
    if (type === '_second') {
        // auf die stehengebliebenen Pins zielen
        const survey = surveyPins();
        if (survey.standing.length) {
            let mx = 0;
            for (const s of survey.standing) mx += SPOTS[s.spot][0];
            mx /= survey.standing.length;
            const target = clamp(mx, -0.45, 0.45) + rand(-0.05, 0.05);
            const x0 = clamp(target + rand(-0.06, 0.06), -0.5, 0.5);
            def = { x: x0, vx: (target - x0) * 2.2, v: rand(6.9, 7.8) };
        } else {
            def = THROW_DEFS.pocket();
        }
        machine.thrownType = 'second';
    } else {
        def = THROW_DEFS[type]();
        machine.thrownType = type;
    }
    // seltener "Powerwurf" — sonst gemächliches Haus-Tempo
    if (!def.gutter && Math.random() < 0.12) def.v += rand(0.6, 1.0);
    // Anrollzeit: die Kugel braucht sichtbar lange über die (unsichtbare) Bahn
    machine.pendingDef = def;
    machine.launchT = rand(0.95, 1.30);
    machine.launchedAt = 0;
    machine.state = 'ROLLING';
    machine.rollT = 0;
    machine.phase = 'KUGEL AUF DER BAHN';
}

function isSplit(standingSpots) {
    if (standingSpots.includes(0) || standingSpots.length < 2) return null;
    // Zusammenhangsprüfung über Spot-Nachbarschaft (Abstand <= 0,32 m)
    const seen = new Set([standingSpots[0]]);
    const stack = [standingSpots[0]];
    while (stack.length) {
        const a = stack.pop();
        for (const b of standingSpots) {
            if (seen.has(b)) continue;
            const dx = SPOTS[a][0] - SPOTS[b][0], dz = SPOTS[a][1] - SPOTS[b][1];
            if (Math.hypot(dx, dz) <= 0.32) { seen.add(b); stack.push(b); }
        }
    }
    if (seen.size < standingSpots.length) {
        return standingSpots.map(i => i + 1).sort((a, b) => a - b).join('–');
    }
    return null;
}

function scoreThrow(survey) {
    const n = survey.standing.length;
    if (machine.wurf === 1) {
        const knocked = 10 - n;
        if (knocked === 10) { flash('STRIKE!'); machine.lastResult = 'STRIKE'; }
        else if (knocked === 0) {
            const txt = machine.thrownType === 'gutter' ? 'GASSE' : 'DANEBEN';
            toast(txt);
            machine.lastResult = txt;
        } else {
            const spl = isSplit(survey.standing.map(s => s.spot));
            if (spl) { flash('SPLIT ' + spl); machine.lastResult = 'SPLIT ' + spl; }
            else { toast(knocked + ' PINS GEFALLEN'); machine.lastResult = knocked + ' PINS'; }
        }
    } else {
        if (n === 0) { flash('SPARE!'); machine.lastResult = 'SPARE'; }
        else { toast('OFFEN – ' + n + ' STEHEN'); machine.lastResult = 'OFFEN (' + n + ')'; }
    }
}

// ============ Einfangen in der Grube =======================================

function captureChecks() {
    if (ball.mode === 'roll') {
        const t = ball.body.translation();
        const v = ball.body.linvel();
        const speed2 = v.x * v.x + v.y * v.y + v.z * v.z;
        // Die Kugel wird gleich nach dem Anschlag ans Polster abgeholt —
        // sie soll gar nicht erst die Rampe hinunter zum Aufzug rollen.
        if (t.z > 1.10) {
            ball.pitT += H;
            if (speed2 < 1.0 || ball.pitT > 0.40) captureBall();
        }
        if (machine.rollT - machine.launchedAt > 7) { captureBall(true); toast('KUGEL MANUELL ENTFERNT'); }
        if (t.y < -0.75) captureBall(true);
    }
    for (const p of pins) {
        if (p.mode !== 'phys') continue;
        const t = p.body.translation();
        if (Math.abs(t.x) > 1.02 || t.z < -1.2 || t.y < -0.9) {
            capturePinToPit(p);
            toast('PIN AUSSER BEREICH – ENTFERNT');
            continue;
        }
        // Hinter die Fangleiste gehüpft: zurück vor das Rad legen, sonst
        // läge der Pin für immer unter dem Aufzug.
        if (t.z > PIT.zLedge + 0.12) capturePinToPit(p);
    }
}

// ============ Klang (WebAudio, synthetisch) ================================

const sfx = {
    ctx: null, master: null, noiseBuf: null,
    rollGain: null, motorGain: null, wheelGain: null,
    muted: true, lastImpact: 0,

    ensure() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(comp);

        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {              // "braunes" Rauschen
            last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
            d[i] = last * 6;
        }

        // Kugelrollen
        const roll = this.ctx.createBufferSource();
        roll.buffer = this.noiseBuf; roll.loop = true;
        const rollLP = this.ctx.createBiquadFilter();
        rollLP.type = 'lowpass'; rollLP.frequency.value = 150;
        this.rollGain = this.ctx.createGain(); this.rollGain.gain.value = 0;
        roll.connect(rollLP).connect(this.rollGain).connect(this.master);
        roll.start();

        // Antriebsbrummen (Kehrwerk/Tisch)
        const mk = (freq) => {
            const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = freq;
            const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 2.02;
            const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
            const g = this.ctx.createGain(); g.gain.value = 0;
            o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
            o1.start(); o2.start();
            return g;
        };
        this.motorGain = mk(46);
        this.wheelGain = mk(33);
    },

    setMuted(m) {
        this.muted = m;
        if (this.master) this.master.gain.value = m ? 0 : 0.75;
    },

    burst(dur, filterType, freq, q, vol, pan) {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.playbackRate.value = rand(0.8, 1.25);
        const f = this.ctx.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq; f.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        const pn = this.ctx.createStereoPanner();
        pn.pan.value = clamp(pan || 0, -1, 1);
        src.connect(f).connect(g).connect(pn).connect(this.master);
        src.start(now, Math.random());
        src.stop(now + dur + 0.05);
    },

    tone(freq0, freq1, dur, vol) {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq0, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), now + dur);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.connect(g).connect(this.master);
        o.start(now); o.stop(now + dur + 0.05);
    },

    clack(force, x) {
        const t = performance.now();
        if (t - this.lastImpact < 18) return;
        this.lastImpact = t;
        const vol = clamp(force / 2600, 0.05, 0.85);
        this.burst(rand(0.05, 0.09), 'bandpass', rand(1900, 3100), 3.5, vol, x * 1.3);
    },
    thud(vol, x) { this.tone(120, 70, 0.14, clamp(vol, 0.05, 0.7)); this.burst(0.09, 'lowpass', 300, 1, vol * 0.6, x); },
    boom() { this.tone(78, 42, 0.3, 0.65); this.burst(0.2, 'lowpass', 200, 1, 0.5, 0.3); },
    click() { this.burst(0.035, 'highpass', 2600, 2, 0.25, 0); },
    tick() { this.tone(1250, 900, 0.05, 0.14); },
    whir() { this.tone(240, 950, 0.5, 0.30); },

    frame(rollLevel, motorOn, wheelOn) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        this.rollGain.gain.setTargetAtTime(rollLevel * 0.5, t, 0.08);
        this.motorGain.gain.setTargetAtTime(motorOn ? 0.11 : 0, t, 0.10);
        this.wheelGain.gain.setTargetAtTime(wheelOn ? 0.07 : 0, t, 0.15);
    },
};

function drainContacts() {
    eventQueue.drainContactForceEvents(ev => {
        const h1 = ev.collider1(), h2 = ev.collider2();
        const t1 = colliderTag.get(h1) || '?', t2 = colliderTag.get(h2) || '?';
        const f = ev.totalForceMagnitude();
        const body = handleBody.get(h1) || handleBody.get(h2);
        const x = body ? body.translation().x : 0;
        const pair = t1 < t2 ? t1 + ':' + t2 : t2 + ':' + t1;
        if (pair === 'ball:pin') { sfx.thud(f / 4000, x); sfx.clack(f * 0.8, x); }
        else if (pair === 'ball:cushion') { sfx.boom(); armSweepGuard(); }
        else if (pair === 'pin:pin' || pair === 'kick:pin' || pair === 'lane:pin' || pair === 'pin:sweep' || pair === 'pin:pit') sfx.clack(f, x);
        else if (pair === 'ball:lane' && f > 800) sfx.thud(f / 6000, x);
    });
}

// ============ Kameras & HUD ================================================

const CAMS = [
    { n: 'PINDECK LINKS',    pos: [-0.70, 0.62, -0.74], look: [0.14, 0.24, 0.55], fov: 60 },
    { n: 'PINDECK RECHTS',   pos: [0.70, 0.62, -0.74],  look: [-0.14, 0.24, 0.55], fov: 60 },
    { n: 'TISCH & MAGAZIN',  pos: [0.60, 1.62, -0.72],  look: [-0.10, 0.58, 0.55], fov: 64 },
    { n: 'AUFZUG & GRUBE',   pos: [-0.88, 1.92, 0.15],  look: [0.18, 0.32, 2.25], fov: 72 },
    { n: 'GRUBE & BALLTÜR',  pos: [-0.58, 0.45, 1.34],  look: [0.72, -0.50, 1.54], fov: 74 },
    { n: 'FREI (SERVICE)',   orbit: true, fov: 58 },
];

const orbit = { theta: -1.98, phi: 1.09, r: 2.4, tx: 0, ty: 0.40, tz: 1.20, drag: false, lx: 0, ly: 0 };
let camIdx = 0;

function applyCamera() {
    const c = CAMS[camIdx];
    camera.fov = c.fov;
    if (c.orbit) {
        camera.position.set(
            orbit.tx + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
            orbit.ty + orbit.r * Math.cos(orbit.phi),
            orbit.tz + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta));
        camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
    } else {
        camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
        camera.lookAt(c.look[0], c.look[1], c.look[2]);
    }
    camera.updateProjectionMatrix();
}

function setCam(i) {
    camIdx = i;
    document.getElementById('camlabel').textContent = 'KAM ' + (i + 1) + ' · ' + CAMS[i].n;
    document.querySelectorAll('#camButtons button').forEach((b, j) =>
        b.classList.toggle('on', j === i));
    applyCamera();
}

canvas.addEventListener('pointerdown', e => {
    if (!CAMS[camIdx].orbit) return;
    orbit.drag = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
});
addEventListener('pointermove', e => {
    if (!orbit.drag || !CAMS[camIdx].orbit) return;
    // "Szene anfassen": der zur Kamera gerichtete Teil folgt dem Mauszeiger
    orbit.theta += (e.clientX - orbit.lx) * 0.005;
    orbit.phi = clamp(orbit.phi - (e.clientY - orbit.ly) * 0.005, 0.15, 1.5);
    orbit.lx = e.clientX; orbit.ly = e.clientY;
});
addEventListener('pointerup', () => { orbit.drag = false; });
canvas.addEventListener('wheel', e => {
    if (!CAMS[camIdx].orbit) return;
    orbit.r = clamp(orbit.r * (1 + Math.sign(e.deltaY) * 0.08), 1.2, 7);
}, { passive: true });

// ---- HUD-Elemente ----

const el = {
    status: document.getElementById('status'),
    clock: document.getElementById('clock'),
    flash: document.getElementById('flash'),
    toast: document.getElementById('toast'),
    btnAuto: document.getElementById('btnAuto'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnSound: document.getElementById('btnSound'),
    btnPause: document.getElementById('btnPause'),
};

let flashTimer = null, toastTimer = null;
function flash(txt) {
    el.flash.textContent = txt;
    el.flash.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.flash.classList.remove('show'), 2000);
}
function toast(txt) {
    el.toast.textContent = txt;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2400);
}

const camBtnBox = document.getElementById('camButtons');
CAMS.forEach((c, i) => {
    const b = document.createElement('button');
    b.textContent = String(i + 1);
    b.title = c.n;
    b.addEventListener('click', () => setCam(i));
    camBtnBox.appendChild(b);
});

const throwBtns = [...document.querySelectorAll('[data-throw]')];

// Zähler auf den Schaltflächen: "Strike-Wurf (2)" = zweimal vorgemerkt
function updateThrowButtons() {
    for (const b of throwBtns) {
        const n = machine.pending.filter(t => t === b.dataset.throw).length;
        b.textContent = b.dataset.base + (n ? ` (${n})` : '');
    }
}

throwBtns.forEach(b => {
    b.dataset.base = b.textContent;
    b.addEventListener('click', () => {
        // Nur direkt werfen, wenn nichts wartet — sonst hinten anstellen
        // (auch im kurzen IDLE-Fenster, bevor die Warteschlange weiterspielt)
        if (machine.state === 'IDLE' && !machine.pending.length) {
            doThrow(b.dataset.throw === 'random' ? pickThrowType() : b.dataset.throw);
        } else {
            machine.pending.push(b.dataset.throw);
            updateThrowButtons();
            const n = machine.pending.length;
            toast(n > 1 ? n + ' WÜRFE VORGEMERKT' : 'WURF VORGEMERKT');
        }
    });
});

let timeScale = 1, paused = false;
const SPEEDS = [0.5, 1, 2, 4];

el.btnAuto.addEventListener('click', () => {
    machine.auto = !machine.auto;
    el.btnAuto.classList.toggle('on', machine.auto);
});
el.btnSpeed.addEventListener('click', () => {
    timeScale = SPEEDS[(SPEEDS.indexOf(timeScale) + 1) % SPEEDS.length];
    el.btnSpeed.textContent = timeScale + '×';
});
el.btnSound.addEventListener('click', () => {
    sfx.ensure();
    sfx.setMuted(!sfx.muted);
    el.btnSound.textContent = sfx.muted ? 'Ton aus' : 'Ton an';
    el.btnSound.classList.toggle('on', !sfx.muted);
});
el.btnPause.addEventListener('click', () => {
    paused = !paused;
    el.btnPause.classList.toggle('on', paused);
});
document.getElementById('btnResetFrame').addEventListener('click', () => {
    if (machine.state === 'IDLE') buildReset(false);
    else toast('ZYKLUS LÄUFT – RESET GERADE NICHT MÖGLICH');
});
document.getElementById('btnResetGame').addEventListener('click', () => {
    if (machine.state === 'IDLE') buildReset(true);
    else toast('ZYKLUS LÄUFT – RESET GERADE NICHT MÖGLICH');
});

addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '6') setCam(+e.key - 1);
    else if (e.key === ' ') { e.preventDefault(); el.btnPause.click(); }
    else if (e.key === 'n' || e.key === 'N') {
        if (machine.state === 'IDLE' && !machine.pending.length) doThrow(pickThrowType());
    }
    else if (e.key === 'a' || e.key === 'A') el.btnAuto.click();
    else if (e.key === 'm' || e.key === 'M') el.btnSound.click();
    else if (e.key === '+') { timeScale = SPEEDS[Math.min(SPEEDS.indexOf(timeScale) + 1, SPEEDS.length - 1)]; el.btnSpeed.textContent = timeScale + '×'; }
    else if (e.key === '-') { timeScale = SPEEDS[Math.max(SPEEDS.indexOf(timeScale) - 1, 0)]; el.btnSpeed.textContent = timeScale + '×'; }
});
addEventListener('pointerdown', () => sfx.ensure(), { once: true });

function updateHud() {
    const mag = turretCount();
    const bar = '█'.repeat(mag) + '░'.repeat(10 - mag);
    let standing = 0;
    for (const p of pins) {
        if (p.mode !== 'phys') continue;
        const t = p.body.translation();
        if (t.y < 0.08 && t.y > -0.05 && t.z < 1.0 && pinUpY(p) > 0.9) standing++;
    }
    const ballTxt = ball.mode === 'roll' ? (ball.body.translation().z > 1.05 ? 'IN DER GRUBE' : 'AUF DER BAHN')
                  : ball.mode === 'rail' ? 'IM RÜCKLAUF'
                  : machine.state === 'ROLLING' ? 'AUF DER BAHN' : '—';
    el.status.textContent =
        `PHASE    ${machine.phase}\n` +
        `FRAME ${machine.frame} · WURF ${machine.wurf}\n` +
        `LETZTER  ${machine.lastResult}\n` +
        `STEHEND  ${standing}/10\n` +
        `MAGAZIN  ${bar} ${mag}/10\n` +
        `UMLAUF   ${transitCount()} PINS\n` +
        `KUGEL    ${ballTxt}` +
        (paused ? '\n― PAUSE ―' : '');
    // LEDs
    M.leds.ready.material.emissiveIntensity = machine.state === 'IDLE' ? 1.6 : 0.12;
    M.leds.run.material.emissiveIntensity = machine.state === 'CYCLE' ? 1.6 : 0.12;
    M.leds.wait.material.emissiveIntensity = machine.phase.startsWith('WARTE') ? 1.8 : 0.12;
}

function updateClock() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    el.clock.textContent = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
                           `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ============ Startzustand =================================================

// 10 Pins stehen, 10 sitzen im Magazin, 2 warten auf dem Band
for (let i = 0; i < 10; i++) {
    const p = pins[i];
    p.spot = i;
    p.setPhysAt(SPOTS[i][0], 0.001, SPOTS[i][1], Q_UP);
    p.track.init(p.pose.p, p.pose.q);
}
for (let i = 10; i < 20; i++) {
    const p = pins[i];
    p.st = 'turret';
    p.slotIdx = i - 10;
    transport.slots[i - 10] = p;
    railAttach(p, () => slotPose(p.slotIdx));
    p.railUpdate(0);
    p.track.init(p.pose.p, p.pose.q);
}
{
    const p20 = pins[20], p21 = pins[21];
    p20.st = 'belt'; p20.beltPos = 0.95; transport.beltPins.push(p20);
    railAttach(p20, () => beltPose(p20.beltPos));
    p21.st = 'belt'; p21.beltPos = 0.45; transport.beltPins.push(p21);
    railAttach(p21, () => beltPose(p21.beltPos));
    p20.railUpdate(0); p21.railUpdate(0);
    p20.track.init(p20.pose.p, p20.pose.q);
    p21.track.init(p21.pose.p, p21.pose.q);
}

setCam(0);
updateClock();
setInterval(updateClock, 500);
setInterval(updateHud, 120);

// ============ Hauptschleife ================================================

function fixedStep() {
    machineUpdate(H);
    transportUpdate(H);
    ballRailUpdate(H);
    for (const p of pins) if (p.mode === 'rail') p.railUpdate(H);

    M.sweepBody.setNextKinematicTranslation({ x: 0, y: V.sweepY + SWEEP.height / 2, z: V.sweepZ });
    world.step(eventQueue);
    drainContacts();
    captureChecks();

    // Selbstheilung: Rapier wendet Collider-(De)Aktivierung verzögert an;
    // ein aktiver Körper darf nie mit Masse 0 weiterlaufen (wäre "unendlich
    // schwer": ignoriert Gravitation und schiebt alles beiseite).
    for (const p of pins) {
        if (p.mode === 'phys' && p.body.mass() === 0) p.body.recomputeMassPropertiesFromColliders();
    }
    if (ball.mode === 'roll' && ball.body.mass() === 0) ball.body.recomputeMassPropertiesFromColliders();

    // Posen für die Interpolation einfrieren
    for (const p of pins) {
        if (p.mode === 'phys') {
            const t = p.body.translation(), r = p.body.rotation();
            p.pose.p.set(t.x, t.y, t.z);
            p.pose.q.set(r.x, r.y, r.z, r.w);
        }
        p.track.push(p.pose.p, p.pose.q);
    }
    if (ball.mode === 'roll') {
        const t = ball.body.translation(), r = ball.body.rotation();
        ball.pose.p.set(t.x, t.y, t.z);
        ball.pose.q.set(r.x, r.y, r.z, r.w);
    }
    ball.track.push(ball.pose.p, ball.pose.q);
    for (const k in V) S[k].set(V[k]);
}

let acc = 0, lastNow = performance.now(), lastAlpha = 0;

// Render-Deckel: rAF feuert mit Monitor-Frequenz (60/120/144 Hz), die Szene
// braucht aber keine 144 Bilder/s — 30 reichen und schonen die GPU.
const FPS_MAX = 30, FRAME_MS = 1000 / FPS_MAX;
let lastRender = -FRAME_MS;

function renderFrame(a) {
    // Physik-/Rail-Posen
    for (const p of pins) p.track.apply(p.mesh, a);
    ball.track.apply(ball.mesh, a);

    // Baugruppen
    M.sweep.position.set(0, S.sweepY.val(a), S.sweepZ.val(a));
    const sweepTop = S.sweepY.val(a) + SWEEP.height;
    for (const post of M.sweepPosts) {
        post.position.z = S.sweepZ.val(a);
        const top = HOUSING.yTop - 0.18;
        post.scale.y = Math.max(top - sweepTop, 0.05);
        post.position.y = (top + sweepTop) / 2;
    }
    const dy = S.deckY.val(a);
    M.deck.position.y = dy;
    const rodTop = HOUSING.yTop - 0.1;
    for (const rod of M.deckRods) {
        rod.scale.y = Math.max(rodTop - dy - 0.03, 0.05);
        rod.position.y = (rodTop + dy + 0.03) / 2;
    }
    const open = S.grip.val(a);
    for (const fingers of M.grippers) {
        for (const f of fingers) f.group.rotation.z = f.side * lerp(0.02, 0.6, open);
    }
    M.wheel.rotation.x = S.wheel.val(a);
    M.turret.rotation.y = S.turret.val(a);
    M.flap.rotation.z = S.flap.val(a) * 1.15;
    M.tire.children[0].rotation.x = S.tire.val(a) + performance.now() * 0.0004;
    // Der Teppich zieht nach HINTEN zum Aufzug. Auf beiden Grubenflächen
    // wächst die v-Achse nach vorn, also muss der Versatz wachsen, damit das
    // Muster nach hinten läuft — mit steigendem Versatz wandert es zu -v.
    const carpetOff = (S.carpet.val(a) / TILE_M) % 1;
    carpetTex.offset.y = carpetOff;
    M.carpetRampTex.offset.y = carpetOff;
    // Beim Laufband zeigt die v-Achse zum Magazin, also läuft das Muster bei
    // FALLENDEM Versatz mit den Pins mit.
    beltTex.offset.y = -(S.belt.val(a) / TILE_M) % 1;

    if (CAMS[camIdx].orbit) applyCamera();

    renderer.render(scene, camera);
    loader.classList.add('hidden');
}

renderer.setAnimationLoop(() => {
    const now = performance.now();
    // Auf den 30-Hz-Takt heruntersieben. Anker per Restglied statt auf `now`,
    // sonst driftet die Rate unter FPS_MAX, wenn rAF-Ticks das Raster verfehlen.
    const sinceRender = now - lastRender;
    if (sinceRender < FRAME_MS) return;
    lastRender = now - (sinceRender % FRAME_MS);

    let dt = (now - lastNow) / 1000;
    lastNow = now;
    dt = Math.min(dt, 0.1);

    if (!paused) {
        acc += dt * timeScale;
        let n = 0;
        while (acc >= H && n < 40) { fixedStep(); acc -= H; n++; }
        if (n === 40) acc = 0;
        lastAlpha = acc / H;
    }
    renderFrame(lastAlpha);

    // Klangpegel
    let rollLevel = 0;
    if (ball.mode === 'roll') {
        const v = ball.body.linvel();
        const t = ball.body.translation();
        if (t.y < BALL.r + 0.06) rollLevel = clamp(Math.hypot(v.x, v.z) / 10, 0, 1);
    }
    sfx.frame(rollLevel, machine.state === 'CYCLE', transport.wheelRun || transport.beltRun);
});

// ---- Debug-Schnittstelle (für Tests) --------------------------------------
window.PINSIM = {
    machine, transport, pins, ball, V, world, RAPIER, orbit, camera, renderer,
    CHUTE_MAP, chuteCurve, chuteDropPath, ringPos,
    throwNow: t => { if (machine.state === 'IDLE') doThrow(t || pickThrowType()); },
    setSpeed: s => { timeScale = s; },
    setCam,
    tick: (n = 1) => { for (let i = 0; i < n; i++) fixedStep(); renderFrame(1); },
    snapshot: () => ({
        phase: machine.phase, state: machine.state,
        frame: machine.frame, wurf: machine.wurf,
        cycles: machine.cycles, lastResult: machine.lastResult,
        magazin: turretCount(), umlauf: transitCount(),
        deck: pinsInDeckCount(),
        ball: ball.mode,
        standing: surveyPins().standing.length,
        pinStates: pins.map(p => p.mode === 'phys' ? 'phys' : p.st),
    }),
};

} // Ende main()
