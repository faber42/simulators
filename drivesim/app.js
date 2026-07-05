(() => {
'use strict';

// ===========================================================================
// Nachtfahrt-Simulator: Beifahrerblick durch die regennasse Windschutzscheibe.
// WebGL2-Pipeline: Szene (HDR) -> Blur-Pyramide -> Tropfen-Normalmap -> Composite.
// Die Welt draußen ist bewusst abstrakt: nur Lichter, Spiegelungen und Nebel —
// die nasse Scheibe davor macht daraus das Bild.
// ===========================================================================

const canvas = document.getElementById('gl');
const errBox = document.getElementById('err');
const DEBUG = new URLSearchParams(location.search).has('debug');

const gl = canvas.getContext('webgl2', {
    antialias: false, depth: false, stencil: false, alpha: false,
    powerPreference: 'high-performance',
});
if (!gl){
    errBox.textContent = 'WebGL2 wird von diesem Browser nicht unterstützt.';
    errBox.style.display = 'block';
    return;
}
const HDR = !!gl.getExtension('EXT_color_buffer_float');
const SCENE_GAIN = HDR ? 1.0 : 0.16;     // 8-Bit-Fallback: Intensitäten stauchen

function fail(msg){
    errBox.textContent = msg;
    errBox.style.display = 'block';
    console.error(msg);
}

// ---- Shader-Werkzeug -------------------------------------------------------
function compile(type, src, name){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        fail(`Shader "${name}": ` + gl.getShaderInfoLog(s));
        return null;
    }
    return s;
}
function program(vsSrc, fsSrc, name){
    const p = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, vsSrc, name + '.vs');
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc, name + '.fs');
    if (!vs || !fs) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
        fail(`Link "${name}": ` + gl.getProgramInfoLog(p));
        return null;
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
}

const progEnv    = program(VS_QUAD, FS_ENV, 'env');
const progSprite = program(VS_SPRITE, FS_SPRITE, 'sprite');
const progDown   = program(VS_QUAD, FS_DOWN, 'down');
const progUp     = program(VS_QUAD, FS_UP, 'up');
const progDrops  = program(VS_DROPS, FS_DROPS, 'drops');
const progComp   = program(VS_QUAD, FS_COMP, 'comp');
if (!progEnv || !progSprite || !progDown || !progUp || !progDrops || !progComp) return;

// ---- Rendertargets ---------------------------------------------------------
function makeTarget(w, h, float){
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, float ? gl.RGBA16F : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
}
function freeTarget(t){ if (t){ gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

const LEVELS = 6;                 // D0 = Szene, D1..D5 Downsamples
let D = [], U = [], dropsRT = null;
let W = 0, H = 0, aspect = 16 / 9;
let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

function resize(){
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw === W && ch === H) return;
    W = cw; H = ch;
    canvas.width = W; canvas.height = H;
    const oldAspect = aspect;
    aspect = W / H;
    drops.rescale(aspect / oldAspect);

    D.forEach(freeTarget); U.forEach(freeTarget); freeTarget(dropsRT);
    D = []; U = [];
    let w = Math.max(2, W >> 1), h = Math.max(2, H >> 1);
    for (let i = 0; i < LEVELS; i++){
        D.push(makeTarget(w, h, HDR));
        U.push(i > 0 && i < LEVELS - 1 ? makeTarget(w, h, HDR) : null);
        w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
    }
    dropsRT = makeTarget(Math.max(2, W >> 1), Math.max(2, H >> 1), false);
}

// ---- Geometrie: Fullscreen-VAO, Sprite- und Tropfen-Instanzen ---------------
const vaoQuad = gl.createVertexArray();

const cornerBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

const MAX_SPRITES = 640;
const spriteData = new Float32Array(MAX_SPRITES * 12);
let spriteCount = 0;
const spriteBuf = gl.createBuffer();
const vaoSprite = gl.createVertexArray();
gl.bindVertexArray(vaoSprite);
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
gl.bufferData(gl.ARRAY_BUFFER, spriteData.byteLength, gl.DYNAMIC_DRAW);
for (let i = 1; i <= 3; i++){
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 48, (i - 1) * 16);
    gl.vertexAttribDivisor(i, 1);
}
gl.bindVertexArray(null);

const MAX_DROPS = 1024;
const dropData = new Float32Array(MAX_DROPS * 8);
const dropBuf = gl.createBuffer();
const vaoDrops = gl.createVertexArray();
gl.bindVertexArray(vaoDrops);
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
gl.bufferData(gl.ARRAY_BUFFER, dropData.byteLength, gl.DYNAMIC_DRAW);
for (let i = 1; i <= 2; i++){
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 32, (i - 1) * 16);
    gl.vertexAttribDivisor(i, 1);
}
gl.bindVertexArray(null);

// ===========================================================================
// Fahrt & Verkehr: alles nur Lichtquellen in einer 1D-Welt entlang der Straße.
// Koordinaten: x quer (m, + rechts), y Höhe (m), wz absolute Strecke (m).
// ===========================================================================
const F = 0.85;          // Brennweite (Bildhöhen)
const CAMH = 1.25;       // Aughöhe über Fahrbahn

const world = {
    odo: 0, speed: 30.5, targetSpeed: 30.5,
    camX: 0, horizon: 0.5,
    pitch: 0, pitchV: 0, nextJoint: 25,
    rain: 0.8, rainSlider: 0.8, traffic: 0.6,
    vis: 80,
    statics: [],          // Laternen, Leitpfosten, Schilder
    oncoming: [],         // Gegenverkehr
    tails: [],            // Vorausfahrende
    nextStreetZ: 0, streetLit: true, streetRemain: 700,
    nextPostZ: 0, nextSignZ: 400,
    spawnOncoming: 2,
    t: 0,
};

function rnd(a, b){ return a + Math.random() * (b - a); }

function updateWorld(dt){
    const w = world;
    w.t += dt;

    // Regen wandert langsam um den Slider-Wert (Regenbänder)
    const meander = Math.sin(w.t * 0.023) * 0.5 + Math.sin(w.t * 0.011 + 2.1) * 0.5;
    w.rain = Math.min(1, Math.max(0.12, w.rainSlider * (1 + meander * 0.18)));
    w.vis = 95 / (0.35 + w.rain * 0.95);

    // Tempo sanft anfahren, Strecke zählen
    const dv = w.targetSpeed - w.speed;
    w.speed += Math.sign(dv) * Math.min(Math.abs(dv), 1.3 * dt);
    w.odo += w.speed * dt;

    // Karosserie: Wanken, Spurpendeln, Stoß an Dehnungsfugen
    const bob = Math.sin(w.t * 1.7) * 0.0016 + Math.sin(w.t * 2.83 + 1.3) * 0.0011;
    if (w.odo > w.nextJoint){
        w.nextJoint = w.odo + rnd(22, 28);
        w.pitchV += rnd(0.01, 0.022) * (Math.random() < 0.5 ? -1 : 1) * Math.min(1, w.speed / 28);
    }
    w.pitchV += (-w.pitch * 60 - w.pitchV * 8) * dt;
    w.pitch += w.pitchV * dt;
    w.horizon = 0.5 + bob + w.pitch;
    w.camX = Math.sin(w.t * 0.21) * 0.25 + Math.sin(w.t * 0.047) * 0.3;

    const ahead = w.odo + 700;

    // Laternen: beleuchtete Abschnitte wechseln mit dunklen
    while (w.nextStreetZ < ahead){
        if (w.streetLit){
            const side = (Math.round(w.nextStreetZ / 45) % 2) ? -12 : 12;
            w.statics.push({ type: 'street', wz: w.nextStreetZ, x: side, y: 9.5, seed: Math.random() });
        }
        w.streetRemain -= 45;
        if (w.streetRemain <= 0){
            w.streetLit = !w.streetLit;
            w.streetRemain = w.streetLit ? rnd(400, 900) : rnd(500, 1500);
        }
        w.nextStreetZ += 45;
    }
    // Leitpfosten alle 50 m beidseitig
    while (w.nextPostZ < ahead){
        w.statics.push({ type: 'post', wz: w.nextPostZ, x: 9.8, y: 0.8, seed: Math.random() });
        w.statics.push({ type: 'post', wz: w.nextPostZ + 25, x: -9.8, y: 0.8, seed: Math.random() });
        w.nextPostZ += 50;
    }
    // Schilder / Schilderbrücken
    if (w.nextSignZ < ahead){
        const gantry = Math.random() < 0.45;
        w.statics.push(gantry
            ? { type: 'sign', wz: w.nextSignZ, x: 0,   y: 6.6, hw: 6.0, hh: 1.35, seed: Math.random() }
            : { type: 'sign', wz: w.nextSignZ, x: 8.6, y: 3.1, hw: 1.9, hh: 1.5,  seed: Math.random() });
        w.nextSignZ = ahead + rnd(300, 1400);
    }
    w.statics = w.statics.filter(s => s.wz - w.odo > -10);

    // Gegenverkehr (linke Fahrbahn, kommt uns entgegen)
    w.spawnOncoming -= dt;
    if (w.spawnOncoming <= 0){
        w.spawnOncoming = rnd(1.2, 8) / (0.15 + w.traffic);
        const truck = Math.random() < 0.22;
        w.oncoming.push({
            wz: w.odo + 700, v: truck ? rnd(21, 25) : rnd(26, 39),
            x: -7.3 - (Math.random() < 0.4 ? 3.6 : 0), truck, seed: Math.random(),
        });
    }
    w.oncoming.forEach(v => { v.wz -= v.v * dt; });
    w.oncoming = w.oncoming.filter(v => v.wz - w.odo > -12);

    // Vorausfahrende: Rücklichter, halten grob unser Tempo
    const wantTails = Math.round(1 + w.traffic * 2.4);
    if (w.tails.length < wantTails){
        w.tails.push({
            wz: w.odo + rnd(60, 450), v: w.speed + rnd(-5, 5),
            x: Math.random() < 0.6 ? 0 : -3.7, seed: Math.random(),
            brake: 0, brakeT: rnd(4, 18),
        });
    }
    w.tails.forEach(v => {
        v.brakeT -= dt;
        if (v.brakeT <= 0){
            v.brake = v.brake > 0 ? 0 : rnd(0.8, 2.6);
            v.brakeT = v.brake > 0 ? v.brake : rnd(5, 22);
        }
        if (v.brake > 0){ v.brake -= dt; v.v -= 2.2 * dt; }
        else if (v.v < w.targetSpeed - 6) v.v += 0.8 * dt;
        const z = v.wz - w.odo;
        if (z < 26 && v.v < w.speed) v.v = w.speed + 0.5;   // nicht auffahren
        v.wz += v.v * dt;
    });
    w.tails = w.tails.filter(v => { const z = v.wz - w.odo; return z > -10 && z < 620; });

    // Strecke gelegentlich zurücksetzen (Float-Präzision auf langen Fahrten)
    if (w.odo > 40000){
        const s = 30000;
        w.odo -= s; w.nextJoint -= s; w.nextStreetZ -= s; w.nextPostZ -= s; w.nextSignZ -= s;
        w.statics.forEach(o => o.wz -= s);
        w.oncoming.forEach(o => o.wz -= s);
        w.tails.forEach(o => o.wz -= s);
    }
}

// ---- Projektion & Sprite-Erzeugung ------------------------------------------
const envLights = [];   // hellste Quellen, beleuchten den Regen in der Luft

function pushSprite(sx, sy, hw, hh, r, g, b, kind, flare, seed){
    if (spriteCount >= MAX_SPRITES) return;
    const o = spriteCount * 12;
    spriteData[o]     = sx * 2 - 1;
    spriteData[o + 1] = sy * 2 - 1;
    spriteData[o + 2] = hw * 2 / aspect;
    spriteData[o + 3] = hh * 2;
    spriteData[o + 4] = r * SCENE_GAIN;
    spriteData[o + 5] = g * SCENE_GAIN;
    spriteData[o + 6] = b * SCENE_GAIN;
    spriteData[o + 7] = kind;
    spriteData[o + 8] = flare;
    spriteData[o + 9] = seed;
    spriteCount++;
}

// Punktlicht mit optionaler Spiegelung auf der nassen Fahrbahn
function pushLight(w, x, y, z, size, I, col, flare, seed, reflect){
    if (z < 0.7 || z > 750) return;
    const fogT = Math.exp(-z / w.vis) * 0.45 + Math.exp(-z / (w.vis * 2.6)) * 0.55;
    const atten = 1 / (1 + z * 0.02 + z * z * 0.00045);
    const I2 = Math.min(I * fogT * (0.2 + 5 * atten), 18);
    if (I2 < 0.004) return;
    const sy = w.horizon + F * (y - CAMH) / z;
    const sx = 0.5 + F * (x - w.camX) / z / aspect;
    if (sx < -0.2 || sx > 1.2 || sy < -0.3 || sy > 1.3) return;
    const s = Math.min(Math.max(F * size / z, 0.0016), 0.22);
    pushSprite(sx, sy, s * 3.2, s * 3.2, col[0] * I2, col[1] * I2, col[2] * I2, 0, flare, seed);
    if (envLights.length < 24) envLights.push([sx, sy, Math.min(I2 * 0.05, 0.25), Math.min(Math.max(s * 6, 0.05), 0.22)]);
    if (reflect){
        const syr = w.horizon + F * (-y - CAMH) / z;
        const stretch = 4.5 + 4 * (seed % 1);
        pushSprite(sx, syr - s * stretch * 0.8, s * 1.4, s * stretch,
                   col[0] * I2 * 0.5, col[1] * I2 * 0.5, col[2] * I2 * 0.5, 1, 0, seed);
    }
}

function buildSprites(){
    const w = world;
    spriteCount = 0;
    envLights.length = 0;

    for (const s of w.statics){
        const z = s.wz - w.odo;
        if (s.type === 'street'){
            pushLight(w, s.x, s.y, z, 0.55, 7.5, [1.0, 0.56, 0.18], 0.25, s.seed, true);
        } else if (s.type === 'post'){
            // Leitpfosten-Reflektor: leuchtet nur im eigenen Scheinwerferlicht
            const retro = 3.2 * Math.exp(-z / 42);
            pushLight(w, s.x, s.y, z, 0.14, retro * (s.x > 0 ? 1 : 0.55), [1, 1, 0.85], 0, s.seed, false);
        } else if (s.type === 'sign' && z > 4 && z < 500){
            const retro = Math.min(5, 2800 / (z * z + 90)) + 0.25;
            const sy = w.horizon + F * (s.y - CAMH) / z;
            const sx = 0.5 + F * (s.x - w.camX) / z / aspect;
            const hw = F * s.hw / z, hh = F * s.hh / z;
            if (hw < 0.9) pushSprite(sx, sy, hw, hh, 0.10 * retro, 0.17 * retro, 0.48 * retro, 2, 0, s.seed);
        }
    }

    for (const v of w.oncoming){
        const z = v.wz - w.odo;
        const y = v.truck ? 1.35 : 0.68;
        const I = v.truck ? 16 : 13;
        const glare = 1 + Math.max(0, 1 - z / 55) * 1.1;   // Blendung beim Passieren
        const cool = 0.9 + (v.seed % 0.2);
        pushLight(w, v.x - 0.78, y, z, 0.5, I * glare, [1, 0.97, 0.88 * cool], 0.9, v.seed, true);
        pushLight(w, v.x + 0.78, y, z, 0.5, I * glare, [1, 0.97, 0.88 * cool], 0.9, v.seed + 3, true);
        if (v.truck){
            for (let i = -1; i <= 1; i++)
                pushLight(w, v.x + i * 1.05, 3.1, z, 0.16, 0.9, [1, 0.55, 0.15], 0, v.seed + i, false);
            pushLight(w, v.x, 0.9, z - 6, 2.6, 2.6 * Math.exp(-z / 90), [0.72, 0.75, 0.82], 0, v.seed + 7, false);
        }
    }

    for (const v of w.tails){
        const z = v.wz - w.odo;
        const bright = v.brake > 0 ? 5.5 : 1.0;
        pushLight(w, v.x - 0.72, 0.78, z, 0.34, 2.3 * bright, [1, 0.05, 0.015], 0.3, v.seed, true);
        pushLight(w, v.x + 0.72, 0.78, z, 0.34, 2.3 * bright, [1, 0.05, 0.015], 0.3, v.seed + 3, true);
        if (v.brake > 0) pushLight(w, v.x, 1.24, z, 0.3, 3.2, [1, 0.08, 0.02], 0, v.seed + 5, false);
        // Gischtfahne, vom eigenen Scheinwerfer angestrahlt
        const spray = 2.1 * Math.exp(-z / 42) * Math.min(1, v.v / 20);
        if (spray > 0.02){
            pushLight(w, v.x - 0.9, 0.42, z + 1.5, 1.5, spray, [0.62, 0.66, 0.74], 0, v.seed + 9, false);
            pushLight(w, v.x + 0.9, 0.42, z + 1.5, 1.5, spray, [0.62, 0.66, 0.74], 0, v.seed + 11, false);
        }
    }

    envLights.sort((a, b) => b[2] - a[2]);
}

// ===========================================================================
// Scheibenwischer: Tandem-Arme, Phase M wird integriert (Tempo darf variieren).
// Der Shader rekonstruiert aus M analytisch die letzte Wischzeit pro Pixel.
// ===========================================================================
const ARM_DEFS = [
    { fx: 0.30, py: -0.10, r0: 0.16, r1: 0.80, a0: 0.42, a1: 2.40, off: 0 },
    { fx: 0.64, py: -0.12, r0: 0.14, r1: 0.88, a0: 0.48, a1: 2.50, off: 0.38 },
];
const wiper = {
    M: 0, omega: 2 * Math.PI / 1.3, mode: 'auto', on: true,
    prevA: ARM_DEFS.map(() => 0),
    angle(def, M){ return def.a0 + (def.a1 - def.a0) * 0.5 * (1 - Math.cos(M - def.off)); },
};

function updateWiper(dt){
    const T = wiper.mode === 'auto' ? 2.0 - 1.15 * world.rain
            : wiper.mode === 'slow' ? 2.2
            : wiper.mode === 'normal' ? 1.4 : 0.9;
    const target = 2 * Math.PI / T;
    wiper.omega += (target - wiper.omega) * Math.min(1, dt * 1.5);
    const Mprev = wiper.M;
    wiper.M += wiper.omega * dt;

    // Tropfen im überstrichenen Winkelband löschen
    ARM_DEFS.forEach((def, i) => {
        const A0 = wiper.angle(def, Mprev), A1 = wiper.angle(def, wiper.M);
        const lo = Math.min(A0, A1), hi = Math.max(A0, A1);
        const px = def.fx * aspect, py = def.py;
        drops.wipe(px, py, def.r0, def.r1, lo, hi);
        wiper.prevA[i] = A1;
    });

    // Umkehrpunkt: das Blatt drückt eine Linie feiner Tropfen zusammen
    ARM_DEFS.forEach((def, i) => {
        const s = Math.sin(wiper.M - def.off);
        const prev = wiper.prevA[i + 2] || 0;
        if (prev !== 0 && Math.sign(s) !== Math.sign(prev)){
            const A = wiper.angle(def, wiper.M);
            const px = def.fx * aspect, py = def.py;
            for (let k = 0; k < 7; k++){
                const r = def.r0 + (def.r1 - def.r0) * Math.random();
                drops.addStatic(px + Math.cos(A) * r, py + Math.sin(A) * r,
                                rnd(0.0016, 0.0042));
            }
        }
        wiper.prevA[i + 2] = s;
    });
}

// ===========================================================================
// Große Tropfen auf der Scheibe. Glasraum: x in [0, aspect], y in [0,1] (oben=1).
// Kleine kleben, große reißen los, gleiten (bei Tempo nach oben/außen),
// hinterlassen Spuren, verschmelzen — und der Wischer räumt sie ab.
// ===========================================================================
const drops = {
    list: [],
    spawnAcc: 0,

    rescale(f){ if (f !== 1) this.list.forEach(d => d.x *= f); },

    addStatic(x, y, r){
        if (this.list.length >= MAX_DROPS) return;
        this.list.push({ x, y, r, vx: 0, vy: 0, sliding: false, isStatic: true,
                         age: 0, life: rnd(5, 11), seed: Math.random(), dist: 0 });
    },

    wipe(px, py, r0, r1, lo, hi){
        if (hi - lo < 1e-5) return;
        const L = this.list;
        for (let i = L.length - 1; i >= 0; i--){
            const d = L[i];
            const dx = d.x - px, dy = d.y - py;
            const r = Math.hypot(dx, dy);
            if (r < r0 - d.r || r > r1 + d.r) continue;
            const al = Math.atan2(dy, dx);
            const m = d.r / Math.max(r, 0.01);
            if (al > lo - m && al < hi + m) L.splice(i, 1);
        }
    },

    update(dt){
        const w = world;
        const L = this.list;

        // Nachschub
        this.spawnAcc += (1.6 + w.rain * 7.5) * dt;
        while (this.spawnAcc >= 1){
            this.spawnAcc -= 1;
            if (L.length < MAX_DROPS - 8){
                const r = 0.0042 + Math.pow(Math.random(), 2.0) * 0.013;
                L.push({ x: Math.random() * aspect, y: 1 - Math.pow(Math.random(), 1.4),
                         r, vx: 0, vy: 0, sliding: false, isStatic: false,
                         age: 0, life: 1e9, seed: Math.random(), dist: 0 });
            }
        }

        // Fahrtwind: ab ~60 km/h wandern Tropfen nach oben/außen statt nach unten
        const wind = Math.min(1.4, Math.pow(w.speed / 33, 2));
        const windMix = Math.min(0.92, wind * 0.75);

        for (let i = L.length - 1; i >= 0; i--){
            const d = L[i];
            d.age += dt;
            if (d.isStatic){
                d.r *= 1 - 0.008 * dt;
                if (d.age > d.life || d.r < 0.0012){ L.splice(i, 1); }
                continue;
            }
            if (!d.sliding){
                d.r += 0.00045 * dt * (0.5 + Math.random());
                const thresh = 0.0085 + (d.seed - 0.5) * 0.005;
                if (d.r > thresh && Math.random() < dt * 2.5) d.sliding = true;
            } else {
                const gx = 0, gy = -1;
                let ax = (d.x / aspect - 0.45) * 1.3, ay = 1.0;
                const an = Math.hypot(ax, ay); ax /= an; ay /= an;
                let dirx = gx * (1 - windMix) + ax * windMix;
                let diry = gy * (1 - windMix) + ay * windMix;
                const dn = Math.hypot(dirx, diry) || 1; dirx /= dn; diry /= dn;
                // Zittern quer zur Laufrichtung
                const jig = (Math.sin(d.age * 7 + d.seed * 40) + Math.sin(d.age * 13.7)) * 0.35;
                const px = -diry, py = dirx;
                const spd = Math.max(0.02, (d.r * 34 - 0.09)) * (0.55 + d.seed * 0.8);
                d.vx = (dirx + px * jig) * spd;
                d.vy = (diry + py * jig) * spd;
                d.x += d.vx * dt;
                d.y += d.vy * dt;
                d.dist += spd * dt;
                if (d.dist > d.r * 1.15){
                    d.dist = 0;
                    this.addStatic(d.x - d.vx * 0.03, d.y - d.vy * 0.03, d.r * 0.34);
                    d.r *= 0.982;
                }
                if (d.r < 0.0034) d.sliding = false;
            }
            if (d.x < -0.02 || d.x > aspect + 0.02 || d.y < -0.02 || d.y > 1.02){
                L.splice(i, 1);
            }
        }

        // Verschmelzen (einfaches O(n²) über die gleitenden Tropfen)
        for (let i = 0; i < L.length; i++){
            const a = L[i];
            if (a.isStatic || !a.sliding) continue;
            for (let j = 0; j < L.length; j++){
                if (i === j) continue;
                const b = L[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const rr = (a.r + b.r) * 0.72;
                if (dx * dx + dy * dy < rr * rr){
                    a.r = Math.min(0.02, Math.cbrt(a.r ** 3 + b.r ** 3));
                    L.splice(j, 1);
                    if (j < i) i--;
                    break;
                }
            }
        }

        // Überlauf: älteste statische Tropfen entfernen
        if (L.length > MAX_DROPS - 40){
            let removed = 0;
            for (let i = 0; i < L.length && removed < 60; i++){
                if (L[i].isStatic){ L.splice(i, 1); i--; removed++; }
            }
        }
    },

    fill(){
        const L = this.list;
        let n = 0;
        for (const d of L){
            if (n >= MAX_DROPS) break;
            const o = n * 8;
            const spd = Math.hypot(d.vx, d.vy);
            const stretch = Math.min(1.1, spd * 5);
            let c = 0, s = 1;   // statisch: Birnenbauch nach unten
            if (spd > 0.001){ c = d.vx / spd; s = d.vy / spd; }
            const fade = Math.min(1, d.age / 0.12) * (d.isStatic ? Math.min(1, (d.life - d.age) / 1.5) : 1);
            dropData[o]     = d.x;
            dropData[o + 1] = d.y;
            dropData[o + 2] = d.r * (1 + stretch);
            dropData[o + 3] = d.r * (1 - stretch * 0.28);
            dropData[o + 4] = c;
            dropData[o + 5] = s;
            dropData[o + 6] = Math.max(0, fade);
            dropData[o + 7] = 0;
            n++;
        }
        return n;
    },
};

// ===========================================================================
// Rendern
// ===========================================================================
function setUniforms(pr, pairs){
    for (const [name, val] of Object.entries(pairs)){
        const loc = pr.u[name];
        if (loc == null) continue;
        if (typeof val === 'number') gl.uniform1f(loc, val);
        else if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
        else if (val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
        else gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
    }
}

const envLightArr = new Float32Array(24);
const armPArr = new Float32Array(8);
const armAArr = new Float32Array(8);

function render(){
    const w = world;

    // ---- 1) Szene (halbe Auflösung, HDR) --------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, D[0].fb);
    gl.viewport(0, 0, D[0].w, D[0].h);
    gl.disable(gl.BLEND);
    gl.useProgram(progEnv.p);
    gl.bindVertexArray(vaoQuad);
    envLightArr.fill(0);
    for (let i = 0; i < 6 && i < envLights.length; i++) envLightArr.set(envLights[i], i * 4);
    gl.uniform4fv(progEnv.u['uLights[0]'], envLightArr);
    setUniforms(progEnv, {
        uT: w.t, uAspect: aspect, uHorizon: w.horizon, uCamX: w.camX,
        uOdo: w.odo, uRain: w.rain, uVis: w.vis, uSceneGain: SCENE_GAIN,
        uHeadCone: 0.45 + w.rain * 0.25,
        uGlow: [0.050 * SCENE_GAIN, 0.036 * SCENE_GAIN, 0.020 * SCENE_GAIN],
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (spriteCount > 0){
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(progSprite.p);
        gl.bindVertexArray(vaoSprite);
        gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteData.subarray(0, spriteCount * 12));
        gl.uniform1f(progSprite.u.uT, w.t);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, spriteCount);
        gl.disable(gl.BLEND);
    }

    // ---- 2) Blur-Pyramide -------------------------------------------------
    gl.useProgram(progDown.p);
    gl.bindVertexArray(vaoQuad);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(progDown.u.uTex, 0);
    for (let i = 1; i < LEVELS; i++){
        gl.bindFramebuffer(gl.FRAMEBUFFER, D[i].fb);
        gl.viewport(0, 0, D[i].w, D[i].h);
        gl.bindTexture(gl.TEXTURE_2D, D[i - 1].tex);
        gl.uniform2f(progDown.u.uTexel, 1 / D[i - 1].w, 1 / D[i - 1].h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.useProgram(progUp.p);
    gl.uniform1i(progUp.u.uTex, 0);
    gl.uniform1i(progUp.u.uBase, 1);
    gl.uniform1f(progUp.u.uMix, 0.62);
    for (let i = LEVELS - 2; i >= 1; i--){
        const src = (i === LEVELS - 2) ? D[i + 1] : U[i + 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, U[i].fb);
        gl.viewport(0, 0, U[i].w, U[i].h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, D[i].tex);
        gl.uniform2f(progUp.u.uTexel, 1 / src.w, 1 / src.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- 3) Tropfen-Normalmap ----------------------------------------------
    const nDrops = drops.fill();
    gl.bindFramebuffer(gl.FRAMEBUFFER, dropsRT.fb);
    gl.viewport(0, 0, dropsRT.w, dropsRT.h);
    gl.clearColor(0.5, 0.5, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (nDrops > 0){
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(progDrops.p);
        gl.bindVertexArray(vaoDrops);
        gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dropData.subarray(0, nDrops * 8));
        gl.uniform1f(progDrops.u.uAspect, aspect);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nDrops);
        gl.disable(gl.BLEND);
    }

    // ---- 4) Composite -------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(progComp.p);
    gl.bindVertexArray(vaoQuad);
    for (let i = 0; i < ARM_DEFS.length; i++){
        const def = ARM_DEFS[i];
        armPArr.set([def.fx * aspect, def.py, def.r0, def.r1], i * 4);
        armAArr.set([def.a0, def.a1, def.off, 0], i * 4);
    }
    gl.uniform4fv(progComp.u['uArmP[0]'], armPArr);
    gl.uniform4fv(progComp.u['uArmA[0]'], armAArr);
    const bind = (unit, tex, name) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(progComp.u[name], unit);
    };
    bind(0, D[0].tex, 'uScene');
    bind(1, U[1].tex, 'uBlurMid');
    bind(2, U[3].tex, 'uBlurHeavy');
    bind(3, dropsRT.tex, 'uDrops');
    setUniforms(progComp, {
        uT: w.t, uAspect: aspect, uRain: w.rain,
        uSceneDecode: 1 / SCENE_GAIN, uM: wiper.M, uWFreq: wiper.omega,
        uWiperOn: wiper.on ? 1 : 0, uDebug: DEBUG ? 1 : 0, uExposure: 1.25,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ===========================================================================
// UI & Hauptschleife
// ===========================================================================
const $ = id => document.getElementById(id);
$('rainSlider').addEventListener('input', e => {
    world.rainSlider = +e.target.value / 100;
    $('rainVal').textContent = Math.round(world.rainSlider * 100) + ' %';
});
$('speedSlider').addEventListener('input', e => {
    world.targetSpeed = +e.target.value / 3.6;
    $('speedVal').textContent = e.target.value + ' km/h';
});
$('trafficSlider').addEventListener('input', e => {
    world.traffic = +e.target.value / 100;
    $('trafficVal').textContent = Math.round(world.traffic * 100) + ' %';
});
$('wiperSel').addEventListener('change', e => { wiper.mode = e.target.value; });
$('fsBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
});

// Bedienfeld nach kurzer Ruhe ausblenden
let idleT = 0;
const panel = $('panel'), title = $('title');
['mousemove', 'pointerdown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => {
        idleT = 0;
        panel.classList.remove('hidden');
        document.body.classList.remove('noCursor');
    }));

// Adaptive Auflösung: bei dauerhaft langsamen Frames DPR senken
let frameAcc = 0, frameN = 0;

let last = performance.now();
function tick(now){
    // Echtzeit statt Frame-Zählung: läuft auf 60 wie auf 144 Hz gleich schnell
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    resize();
    updateWorld(dt);
    updateWiper(dt);
    drops.update(dt);
    buildSprites();
    render();

    idleT += dt;
    if (idleT > 3.2){
        panel.classList.add('hidden');
        document.body.classList.add('noCursor');
    }
    title.style.opacity = Math.max(0, 1 - Math.max(0, world.t - 5) / 2);

    frameAcc += dt * 1000; frameN++;
    if (frameN >= 90){
        const avg = frameAcc / frameN;
        frameAcc = 0; frameN = 0;
        if (avg > 15 && dpr > 0.75){ dpr -= 0.25; W = 0; resize(); }
    }
    if (DEBUG) $('fps').textContent = (1 / dt).toFixed(0) + ' fps';

    requestAnimationFrame(tick);
}
resize();
if (DEBUG) $('fps').style.display = 'block';
requestAnimationFrame(tick);
})();
