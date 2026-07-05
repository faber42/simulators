// GLSL-Quellen für den Nachtfahrt-Simulator.
// Pipeline: Szene (HDR, additive Licht-Sprites) -> Blur-Pyramide (Dual-Kawase)
//           -> Tropfen-Normalmap -> Composite (Wischer, Refraktion, Grading).
'use strict';

const GLSL_COMMON = `
const float TAU = 6.28318530718;
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec4 hash4(vec2 p){
    vec4 n = vec4(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)),
                  dot(p, vec2(419.2, 371.9)), dot(p, vec2(213.5,  97.4)));
    return fract(sin(n) * 43758.5453123);
}
float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i),                hash1(i + vec2(1, 0)), u.x),
               mix(hash1(i + vec2(0, 1)),   hash1(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.13 + 17.7; a *= 0.5; }
    return s;
}
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 aces(vec3 x){
    return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
`;

// Fullscreen-Dreieck ohne Vertexbuffer.
const VS_QUAD = `#version 300 es
out vec2 vUv;
void main(){
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// Szene: Himmel, nasse Fahrbahn, Markierungen, Regenschleier in der Luft.
// Wird in halber Auflösung als HDR gerendert; Lichter kommen additiv obendrauf.
// ---------------------------------------------------------------------------
const FS_ENV = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uT, uAspect, uHorizon, uCamX, uOdo, uRain, uVis, uSceneGain, uHeadCone;
uniform vec3 uGlow;
uniform vec4 uLights[6];   // xy = Screen-Pos, z = Intensität, w = Radius (für Regenschleier)
${GLSL_COMMON}
void main(){
    vec2 uv = vUv;
    float yH = uHorizon;
    vec3 col;

    // Himmel: fast schwarz, warmer Stadt-/Lichtschein am Horizont, träge Wolken
    float above = uv.y - yH;
    float clouds = fbm(vec2(uv.x * 3.0 + uT * 0.006, uv.y * 5.0)) * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.014, 0.018, 0.030), vec3(0.004, 0.005, 0.010),
                   clamp(above * 2.5, 0.0, 1.0));
    sky *= 0.75 + 0.5 * clouds;
    sky += uGlow * exp(-max(above, 0.0) * 8.0) * (0.5 + 0.2 * clouds);

    if (uv.y < yH){
        // Straßenebene rückprojizieren (Kamera 1.25 m über der Fahrbahn)
        float tt = max(yH - uv.y, 1e-4);
        float z  = 1.25 * 0.85 / tt;
        float wx = (uv.x - 0.5) * uAspect * z / 0.85 + uCamX;
        float zz = z + uOdo;

        // Asphalt mit nassen Längsschlieren
        float streaks = fbm(vec2(wx * 0.55, zz * 0.055));
        float alb = 0.020 + 0.016 * streaks;
        // eigener Scheinwerferkegel: leuchtet erst ab ein paar Metern vor der Haube
        float pool = exp(-z / 26.0) * exp(-wx * wx * 0.012) * smoothstep(1.5, 7.0, z);
        vec3 lit = vec3(alb) * (pool * vec3(3.0, 2.8, 2.4) + vec3(0.028, 0.034, 0.058));

        // Markierungen (retroreflektierend im eigenen Licht, vom Wasser gedämpft)
        float lw = 0.07;
        float dash  = smoothstep(0.52, 0.44, fract(zz / 12.0));
        float dash3 = smoothstep(0.52, 0.44, fract(zz / 12.0 + 0.37));
        float mark = smoothstep(lw, lw * 0.35, abs(wx + 1.85)) * dash
                   + smoothstep(lw * 1.5, lw * 0.55, abs(wx - 1.95)) * 0.8
                   + smoothstep(lw, lw * 0.35, abs(wx + 5.55)) * dash3;
        lit += vec3(0.80, 0.83, 0.72) * mark * (pool * 0.55 + 0.012);

        // Gischt/Nebel frisst die Ferne, nasser Glanz unterm Horizont
        float fogF = 1.0 - exp(-z / uVis);
        col = mix(lit, uGlow * 0.30 + vec3(0.003, 0.0035, 0.006), fogF);
        col += uGlow * exp(-tt * 13.0) * 0.6;
    } else {
        col = sky;
    }

    // Regen in der Luft: nur sichtbar, wo Licht ihn anstrahlt
    float lf = uHeadCone * exp(-pow(abs(uv.x - 0.5) * 2.1, 2.0))
                         * exp(-pow((uv.y - 0.12) * 2.4, 2.0));
    for (int i = 0; i < 6; i++){
        float li = uLights[i].z;
        if (li > 0.0){
            vec2 dd = (uv - uLights[i].xy) * vec2(uAspect, 1.0);
            lf += li * exp(-dot(dd, dd) / (uLights[i].w * uLights[i].w));
        }
    }
    float n1 = vnoise(vec2(uv.x * 120.0 + uv.y * 16.0, uv.y * 7.0 + uT * 2.8));
    float n2 = vnoise(vec2(uv.x * 210.0 - uv.y * 10.0 + 33.0, uv.y * 11.0 + uT * 4.3));
    float st = smoothstep(0.80, 0.97, n1) * 0.9 + smoothstep(0.82, 0.97, n2) * 0.6;
    col += vec3(0.55, 0.60, 0.70) * st * lf * uRain * 0.16;

    outColor = vec4(col * uSceneGain, 1.0);
}`;

// ---------------------------------------------------------------------------
// Licht-Sprites (instanziert, additiv): Punktlichter, Spiegelstreifen auf
// nasser Fahrbahn, Schilder, Gischtwolken.
// ---------------------------------------------------------------------------
const VS_SPRITE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPosSize;   // Clip-x/y, Halbgröße w/h in Clip
layout(location = 2) in vec4 aColor;     // rgb * Intensität, a = Typ
layout(location = 3) in vec4 aMisc;      // x = Flare, y = Seed, z/w frei
uniform float uT;
out vec2 vQ;
flat out vec4 vColor;
flat out vec4 vMisc;
void main(){
    vec2 pos = aPosSize.xy + aCorner * aPosSize.zw;
    if (aColor.a > 0.5 && aColor.a < 1.5)      // Spiegelung wabert seitlich
        pos.x += sin(uT * 2.1 + aMisc.y * 29.7) * aPosSize.z * 0.30;
    vQ = aCorner;
    vColor = aColor;
    vMisc = aMisc;
    gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vQ;
flat in vec4 vColor;
flat in vec4 vMisc;
uniform float uT;
out vec4 o;
${GLSL_COMMON}
void main(){
    float kind = vColor.a;
    vec2 q = vQ;
    float r2 = dot(q, q);
    vec3 col = vec3(0.0);
    float edgeFade = smoothstep(1.0, 0.72, max(abs(q.x), abs(q.y)));
    if (kind < 0.5){                       // Punktlicht: Kern + Halo + horizontaler Flare
        float core = exp(-r2 * 8.0);
        float halo = exp(-sqrt(r2) * 3.4) * 0.26;
        float fl = exp(-abs(q.y) * 26.0) * exp(-abs(q.x) * 3.2) * vMisc.x;
        col = vColor.rgb * (core + halo + fl) * edgeFade;
    } else if (kind < 1.5){                // Spiegelstreifen auf nasser Fahrbahn
        float shim = vnoise(vec2(q.x * 3.0, q.y * 7.0 - uT * (1.5 + fract(vMisc.y * 5.0) * 2.0))
                            + vMisc.y * 61.0);
        float w = exp(-q.x * q.x * 7.0);
        float lenFade = smoothstep(1.0, 0.45, abs(q.y)) * mix(0.35, 1.0, q.y * 0.5 + 0.5);
        col = vColor.rgb * w * lenFade * (0.5 + 0.8 * shim);
    } else if (kind < 2.5){                // Autobahn-Schild (Fläche, heller Rand, Schrift-Andeutung)
        vec2 b = abs(q) - vec2(0.80, 0.70);
        float dOut = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
        float face = smoothstep(0.02, -0.08, dOut);
        float border = (1.0 - smoothstep(0.0, 0.06, abs(dOut + 0.06))) * step(dOut, 0.02);
        float txt = smoothstep(0.55, 0.9, vnoise(vec2(q.x * 5.0, q.y * 8.0) + vMisc.y * 13.0));
        col = vColor.rgb * (face * (0.45 + 0.55 * txt)) + vColor.rgb * border * 1.7;
    } else {                               // Gischtwolke
        float n = fbm(q * 2.2 + vec2(vMisc.y * 7.0, uT * 1.4));
        col = vColor.rgb * exp(-r2 * 2.6) * (0.4 + 0.6 * n) * edgeFade;
    }
    o = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// Dual-Kawase-Blur (Down- und Up-Pass)
// ---------------------------------------------------------------------------
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main(){
    vec4 s = texture(uTex, vUv) * 4.0;
    s += texture(uTex, vUv + uTexel * vec2( 1,  1));
    s += texture(uTex, vUv + uTexel * vec2(-1,  1));
    s += texture(uTex, vUv + uTexel * vec2( 1, -1));
    s += texture(uTex, vUv + uTexel * vec2(-1, -1));
    o = s / 8.0;
}`;

const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;    // tieferes (kleineres) Level
uniform sampler2D uBase;   // Down-Textur dieses Levels
uniform vec2 uTexel;       // Texelgröße der Quelle
uniform float uMix;
void main(){
    vec2 t = uTexel;
    vec4 s = texture(uTex, vUv + vec2(-2,  0) * t) + texture(uTex, vUv + vec2(2, 0) * t)
           + texture(uTex, vUv + vec2( 0, -2) * t) + texture(uTex, vUv + vec2(0, 2) * t)
           + (texture(uTex, vUv + vec2(-1,  1) * t) + texture(uTex, vUv + vec2(1,  1) * t)
           +  texture(uTex, vUv + vec2(-1, -1) * t) + texture(uTex, vUv + vec2(1, -1) * t)) * 2.0;
    o = mix(texture(uBase, vUv), s / 12.0, uMix);
}`;

// ---------------------------------------------------------------------------
// Große Tropfen: instanzierte Sprites -> Normalmap (RG = Normale, B = Dicke, A = Maske)
// ---------------------------------------------------------------------------
const VS_DROPS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;    // x, y (Glasraum), rx, ry
layout(location = 2) in vec4 aData;   // cos/sin der Gleitrichtung, Fade, frei
uniform float uAspect;
out vec2 vQ;
flat out vec4 vData;
void main(){
    vec2 c = aCorner * 1.12;
    mat2 R = mat2(aData.x, aData.y, -aData.y, aData.x);
    vec2 p = aPos.xy + R * (c * aPos.zw);
    vQ = c;
    vData = aData;
    gl_Position = vec4(p.x / uAspect * 2.0 - 1.0, p.y * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_DROPS = `#version 300 es
precision highp float;
in vec2 vQ;
flat in vec4 vData;
out vec4 o;
void main(){
    // Leicht birnenförmig: gegen die Gleitrichtung (lokal -x) dicker
    vec2 q = vQ;
    q.x += 0.10 * (1.0 - q.x * q.x);
    float d2 = dot(q, q);
    if (d2 > 1.0){ o = vec4(0.0); return; }
    float h = sqrt(1.001 - d2);
    float mask = smoothstep(1.0, 0.80, d2) * vData.z;
    vec2 n = q * mix(0.35, 1.55, d2);
    n = mat2(vData.x, vData.y, -vData.y, vData.x) * n;   // zurück in den Glasraum
    o = vec4(n * 0.5 + 0.5, h, mask);
}`;

// ---------------------------------------------------------------------------
// Composite: Wischer (analytische letzte Wischzeit), Mikrotröpfchen,
// Wasserfilm, Refraktion, Cockpit, Grading.
// ---------------------------------------------------------------------------
const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene, uBlurMid, uBlurHeavy, uDrops;
uniform float uT, uAspect, uRain, uSceneDecode, uM, uWFreq, uWiperOn, uDebug, uExposure;
uniform vec4 uArmP[2];    // Pivot xy, r0, r1
uniform vec4 uArmA[2];    // a0, a1, Phasenversatz, frei
${GLSL_COMMON}

// Wasserfilm: zäh nach unten laufende Verzerrung, nur wo die Scheibe nass ist
vec2 filmFlow(vec2 p, float t){
    float n1 = vnoise(p * vec2(9.0, 2.5) + vec2(0.0, -t * 0.30));
    float n2 = vnoise(p * vec2(13.0, 4.0) + vec2(3.7, -t * 0.50));
    return vec2(n1, n2) - 0.5;
}

// Mikrotröpfchen-Lage: pro Hash-Zelle ein Tropfen mit zyklischem Respawn.
// Sichtbar nur, wenn er NACH dem letzten Wischerdurchgang entstanden ist (age < tw).
vec4 dropletLayer(vec2 p, float cells, float period, float density, float seed,
                  float t, float tw){
    vec2 g = p * cells;
    vec2 cell = floor(g);
    vec4 rnd = hash4(cell + seed);
    if (rnd.x > density) return vec4(0.0);
    float ph = rnd.y * period;
    float age = t - (floor((t - ph) / period) * period + ph);
    if (age > tw) return vec4(0.0);
    vec2 c = 0.32 + 0.36 * rnd.zw;
    float rad = (0.13 + 0.13 * fract((rnd.z + rnd.w) * 9.17))
              * smoothstep(0.0, 0.22, age)
              * (1.0 + 0.05 * sin(t * 15.0 + rnd.y * 31.0) * step(age, 0.5));
    vec2 q = (g - cell - c) / max(rad, 1e-4);
    float d2 = dot(q, q);
    if (d2 > 1.0) return vec4(0.0);
    float mask = smoothstep(1.0, 0.58, d2);
    vec2 n = q * mix(0.4, 1.5, d2) * mask;
    return vec4(n, sqrt(1.0 - d2) * mask, mask);
}

// Frische Einschläge: sehr kurzlebige Mini-Tropfen, glitzern kurz auf
float splashLayer(vec2 p, float t, float tw, float rain){
    vec2 g = p * 64.0;
    vec2 cell = floor(g);
    vec4 rnd = hash4(cell + 91.7);
    if (rnd.x > rain * 0.5) return 0.0;
    float period = 0.9 + rnd.y;
    float ph = rnd.z * period;
    float age = t - (floor((t - ph) / period) * period + ph);
    if (age > 0.18 || age > tw) return 0.0;
    vec2 q = (g - cell - (0.3 + 0.4 * rnd.zw)) / 0.30;
    float d2 = dot(q, q);
    if (d2 > 1.0) return 0.0;
    return smoothstep(1.0, 0.3, d2) * (1.0 - age / 0.18);
}

void main(){
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float t = uT;

    // ---- Wischer: letzte Wischzeit pro Pixel, geschlossen berechnet --------
    float twMin = 1e3;       // Sekunden seit dem letzten Wischen
    float dirW = 0.0;        // Strichrichtung des letzten Wischens
    vec2 tangW = vec2(0.0);
    float rW = 0.0;
    float bladeDark = 0.0, ridgeGlint = 0.0, reachMax = 0.0;
    vec2 nRidge = vec2(0.0);

    for (int i = 0; i < 2; i++){
        vec2 d = p - uArmP[i].xy;
        float r = length(d);
        float al = atan(d.y, d.x);
        float a0 = uArmA[i].x, a1 = uArmA[i].y;
        float r0 = uArmP[i].z, r1 = uArmP[i].w;
        float reach = smoothstep(r0 - 0.03, r0, r) * (1.0 - smoothstep(r1 - 0.05, r1 + 0.05, r))
                    * smoothstep(a0 - 0.03, a0 + 0.02, al) * (1.0 - smoothstep(a1 - 0.02, a1 + 0.03, al));
        reachMax = max(reachMax, reach);
        if (reach < 0.02) continue;

        float m = uM - uArmA[i].z;                     // Tandem: Arme leicht versetzt
        float A = a0 + (a1 - a0) * 0.5 * (1.0 - cos(m));
        float lat = (al - A) * r;                      // Bogenabstand zum Blatt
        vec2 tang = normalize(vec2(-d.y, d.x));
        float spd = abs(sin(m));
        float sgn = sign(sin(m));                      // aktuelle Bewegungsrichtung

        if (uWiperOn > 0.5){
            // Letzten Zeitpunkt finden, an dem das Blatt diesen Winkel passierte
            float x = clamp(1.0 - 2.0 * (al - a0) / (a1 - a0), -1.0, 1.0);
            float base = acos(x);
            float c1 = floor((m + base) / TAU) * TAU - base;
            float c2 = floor((m - base) / TAU) * TAU + base;
            float tw = (m - max(c1, c2)) / uWFreq;
            if (tw < twMin){
                twMin = tw;
                dirW = (c2 >= c1) ? 1.0 : -1.0;
                tangW = tang;
                rW = r;
            }

            // Blatt-Silhouette + Wasserwulst an der Vorderkante
            float aLat = abs(lat);
            float inSpan = smoothstep(r0, r0 + 0.02, r) * (1.0 - smoothstep(r1 - 0.02, r1, r));
            bladeDark += inSpan * smoothstep(0.0075, 0.0035, aLat);
            float ll = lat * sgn;
            float prof = smoothstep(0.005, 0.010, ll) * (1.0 - smoothstep(0.012, 0.022, ll));
            nRidge += tang * sgn * prof * spd * inSpan * 1.3;
            ridgeGlint += prof * spd * inSpan;
        }
    }
    bladeDark = clamp(bladeDark, 0.0, 1.0);

    // ---- Wasserfilm / Beschlag ---------------------------------------------
    float hazeRate = 0.22 + uRain * 0.55;
    float residual = 0.08 + uRain * 0.10;
    float hazeWiped = residual + 0.85 * (1.0 - exp(-twMin * hazeRate));
    float haze = mix(0.90, min(hazeWiped, 0.90), reachMax);
    haze = clamp(haze, 0.06, 0.90);

    // ---- Mikrotröpfchen (statisch, respawnen nach dem Wischen) -------------
    float pFac = 1.0 / (0.3 + uRain * 1.4);           // stärkerer Regen -> schnellerer Respawn
    vec4 m1 = dropletLayer(p, 15.0, 9.0 * pFac, uRain * 0.72, 11.0, t, twMin);
    vec4 m2 = dropletLayer(p, 27.0, 6.5 * pFac, uRain * 0.62, 47.0, t, twMin);
    vec4 m3 = dropletLayer(p, 45.0, 4.5 * pFac, uRain * 0.52, 83.0, t, twMin);
    vec2 nMicro = m1.xy * 1.0 + m2.xy * 0.8 + m3.xy * 0.6;
    float clarMicro = max(max(m1.w, m2.w * 0.9), m3.w * 0.8);
    float spark = splashLayer(p, t, twMin, uRain);

    // ---- Große Tropfen -------------------------------------------------------
    vec4 dsp = texture(uDrops, uv);
    vec2 nBig = (dsp.rg * 2.0 - 1.0) * dsp.a;
    float mBig = dsp.a;

    // ---- Refraktion & Welt-Sampling -----------------------------------------
    vec2 asp = vec2(1.0 / uAspect, 1.0);
    vec2 nFilm = filmFlow(p, t) * 0.05 * haze;
    vec2 uvFilm = uv + (nMicro * 0.016 + nRidge * 0.035 + nFilm) * asp;
    vec2 nL = nBig * 1.0 + nMicro * 0.5;
    float lensK = 0.15;

    vec3 hazyA = texture(uBlurMid, uvFilm).rgb;
    vec3 hazyB = texture(uBlurHeavy, uvFilm).rgb;
    vec3 hz = mix(hazyA, hazyB, haze * 0.7) * (1.0 + haze * 0.3);
    // Auch durch frisch gewischtes Glas blüht das Licht in nasser Nachtluft
    vec3 clearC = texture(uScene, uvFilm).rgb + hazyA * 0.55 + hazyB * 0.25;
    vec3 base = mix(clearC, hz, haze) + hazyB * haze * 0.40;

    // In den Tropfen: invertiertes, scharfes Bild der Welt mit Farbsäumen.
    // Nie ganz schwarz werden lassen: ein Rest des Umgebungslichts bleibt sichtbar.
    vec3 lens;
    lens.r = texture(uScene, uv - nL * lensK * 1.06 * asp).r;
    lens.g = texture(uScene, uv - nL * lensK * asp).g;
    lens.b = texture(uScene, uv - nL * lensK * 0.94 * asp).b;
    lens = lens * 1.2 + texture(uBlurMid, uv - nL * lensK * asp).rgb * 0.35
         + hazyA * 0.32 + hazyB * 0.25;
    float rim = smoothstep(0.28, 0.80, length(nL));
    lens += hazyB * rim * 1.7;

    float clarity = clamp(max(clarMicro * 0.8, mBig), 0.0, 1.0);
    vec3 col = mix(base, lens, clarity);

    // ---- Frisch gewischter Bogen: Richtungs-Schmier + feine Streifen --------
    float smearT = 0.30;
    if (twMin < smearT){
        float s = (1.0 - twMin / smearT) * (0.3 + 0.7 * uRain);
        vec2 sv = tangW * dirW * 0.018 * s * asp;
        vec3 sm = texture(uBlurMid, uv + sv).rgb * 0.65 + texture(uScene, uv + sv * 1.6).rgb * 0.35;
        col = mix(col, sm, s * 0.30);
        float str = smoothstep(0.78, 0.97, vnoise(vec2(rW * 620.0, dirW * 7.0)));
        col += hazyB * str * s * 0.10;
    }

    // Wasserwulst glänzt im Licht, Blatt/Arm verschatten
    col += hazyB * ridgeGlint * 0.5 + vec3(0.006) * ridgeGlint;
    col *= 1.0 - bladeDark * 0.85;
    col += vec3(0.010, 0.011, 0.013) * bladeDark;
    col += spark * hazyB * 0.9;

    col *= uSceneDecode;

    // ---- Cockpit: Armaturenbrett, A-Säulen, Dachhimmel ----------------------
    float cx = abs(uv.x - 0.5) * 2.0;
    float dashLine = 0.115 + 0.03 * sin(uv.x * 4.2 + 0.7) - 0.05 * cx * cx;
    float dashM = smoothstep(dashLine + 0.012, dashLine - 0.015, uv.y);
    vec3 inCol = vec3(0.006, 0.007, 0.009) + hazyB * uSceneDecode * 0.06;
    // schwacher warmer Instrumenten-Widerschein in der Scheibe
    vec2 g1 = (uv - vec2(0.24, 0.16)) * vec2(uAspect, 1.0);
    vec2 g2 = (uv - vec2(0.38, 0.14)) * vec2(uAspect, 1.0);
    col += vec3(0.045, 0.022, 0.004) * exp(-dot(g1, g1) * 170.0) * (1.0 - dashM);
    col += vec3(0.010, 0.026, 0.020) * exp(-dot(g2, g2) * 240.0) * (1.0 - dashM);
    col = mix(col, inCol, dashM);

    float pillarL = smoothstep(0.060 + 0.075 * (1.0 - uv.y), 0.022 + 0.04 * (1.0 - uv.y), uv.x);
    float pillarR = smoothstep(0.940 - 0.075 * (1.0 - uv.y), 0.978 - 0.04 * (1.0 - uv.y), uv.x);
    float roof = smoothstep(0.955 - 0.035 * cx * cx, 0.985 - 0.035 * cx * cx, uv.y);
    float frame = clamp(pillarL + pillarR + roof, 0.0, 1.0);
    col = mix(col, vec3(0.004, 0.004, 0.006), frame);

    // ---- Grading -------------------------------------------------------------
    col = aces(col * uExposure);
    col = mix(col, col * vec3(0.88, 0.97, 1.14), 0.22);          // kühle Nacht
    col += vec3(0.010, 0.013, 0.022) * (1.0 - frame);            // blauer Lift
    vec2 vd = (uv - vec2(0.5, 0.45)) * vec2(1.12, 1.30);
    col *= mix(0.42, 1.0, smoothstep(1.40, 0.42, length(vd)));
    col += (hash1(uv * vec2(1920.0, 1080.0) + fract(t) * 17.0) - 0.5) * 0.030;

    if (uDebug > 0.5){
        // Wischer-Diagnose: Zeit seit letztem Wischen als Heatmap + Blatt
        vec3 dbg = mix(vec3(0.1, 0.9, 0.2), vec3(0.9, 0.15, 0.1),
                       clamp(twMin / 3.0, 0.0, 1.0)) * reachMax;
        dbg += vec3(1.0) * bladeDark;
        col = mix(col, dbg, 0.55);
    }
    o = vec4(col, 1.0);
}`;
