(() => {
'use strict';

const { Engine, Bodies, Body, Composite } = Matter;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ---- Geometrie -------------------------------------------------------------
const MX = 210, MY = 50, MW = 520, MH = 650;     // Gehäuse
const CX = 430, CY = 420;                        // Trommelzentrum
const TUB_R = 188;                               // Laugenbehälter (Zeichnung)
const WALL_R = 183;                              // Physik-Wandsegmente
const INNER = 174;                               // nutzbarer Innenradius
const DX = 240, DY = 72, DW = 130, DH = 46;      // Einspülkammer
const PUMP = { x: 450, y: 645, w: 60, h: 40, cx: 480, cy: 665 };
const COND = { x: 645, y: 320, w: 55, h: 170 };  // Kondensator
const FAN = { x: 672, y: 545, r: 20 };
const HEAT_DUCT = { x1: 590, x2: 642, y: 543 };  // Trocknerheizung im Kanal
const AIR_OUT = { x: 547, y: 268 };              // feuchte Luft raus
const AIR_IN = { x: 575, y: 542 };               // warme Luft rein
const WASH_HEATER = { x1: 354, x2: 506, y: 576 };// Heizstab im Sumpf
const SPAWN = { x: 418, y: 262 };                // Wassereinlauf in der Trommel

const WATER_TARGET = 165;
const POWDER_COUNT = 16;
const FOAM_MAX = 70;

// Luftkanal-Polyline für Trocknungs-Pfeile
const AIR_PATH = [
    [AIR_OUT.x, AIR_OUT.y], [600, 236], [660, 248], [672, 272],
    [672, COND.y], [672, COND.y + COND.h], [FAN.x, FAN.y], [AIR_IN.x, AIR_IN.y],
];

// ---- Programm --------------------------------------------------------------
const PHASES = [
    { id: 'fill1',  name: 'Wasser einlassen',  dur: 9,
      desc: 'Das Einlassventil öffnet: Wasser strömt durch die Einspülkammer und spült das Waschmittel mit in die Trommel.' },
    { id: 'wash',   name: 'Hauptwäsche',       dur: 26,
      desc: 'Der Heizstab unten im Laugenbehälter erhitzt das Wasser. Die Trommel dreht langsam hin und her – die Mitnehmer heben Wäsche und Lauge an, Waschmittel und Bewegung lösen den Schmutz.' },
    { id: 'drain1', name: 'Abpumpen',          dur: 7,
      desc: 'Die Laugenpumpe pumpt das schmutzige Waschwasser über den Ablaufschlauch ab.' },
    { id: 'fill2',  name: 'Spülwasser einlassen', dur: 7,
      desc: 'Frisches Wasser strömt für den Spülgang ein.' },
    { id: 'rinse',  name: 'Spülen',            dur: 14,
      desc: 'Die Trommel bewegt die Wäsche im klaren Wasser, damit Waschmittelreste und Schaum ausgespült werden.' },
    { id: 'drain2', name: 'Abpumpen',          dur: 7,
      desc: 'Auch das Spülwasser wird abgepumpt.' },
    { id: 'spin',   name: 'Schleudern',        dur: 16,
      desc: 'Die Trommel dreht sehr schnell. Die Fliehkraft drückt Wäsche und Wasser nach außen – das Wasser entweicht durch die Trommellöcher und wird abgepumpt.' },
    { id: 'dry',    name: 'Trocknen',          dur: 26,
      desc: 'Das Gebläse wälzt Luft um: Die Heizung erwärmt sie, die warme Luft nimmt in der Trommel Feuchtigkeit auf. Am kalten Kondensator schlägt sich der Wasserdampf nieder, das Kondenswasser wird abgepumpt.' },
];
const IDLE_DESC = 'Waschmittel einfüllen und Programm starten.';
const DONE_DESC = 'Fertig! Die Wäsche ist gewaschen und getrocknet. Mit Reset kann ein neuer Durchlauf gestartet werden.';

// ---- Zustand ---------------------------------------------------------------
let engine, world;
let paddles = [];
let laundry = [];
let particles = [];   // { body, kind: 'water'|'powder'|'foam', r, dissolved }
let fx = [];          // rein visuelle Effekte
let state;

const LAUNDRY_DEF = [
    { r: 30, color: '#d4574f' },
    { r: 26, color: '#dfa83a' },
    { r: 29, color: '#4e9c63' },
    { r: 24, color: '#7a6fd0' },
];

function resetState() {
    state = {
        phaseIdx: -1,          // -1 = bereit, PHASES.length = fertig
        t: 0,
        running: false,
        powderLoaded: false,
        powderVisual: 0,       // Häufchen in der Einspülkammer
        powderDissolved: 0,
        sudsLevel: 0,
        drumAngle: 0,
        drumOmega: 0,
        temp: 20,
        wetness: 0,
        airT: 0,               // Animationszeit Luftpfeile
        fanAngle: 0,
        pumpAngle: 0,
        fillAcc: 0,            // Ratenakkumulatoren (Partikel pro Sekunde)
        drainAcc: 0,
        extractAcc: 0,
        lastPhaseIdx: -2,      // für UI-Updates
    };
    window.__wash = state;     // Debug-Zugriff
}

function buildWorld() {
    engine = Engine.create();
    world = engine.world;
    engine.gravity.y = 1;

    // Laugenbehälter als Ring aus statischen Segmenten
    const SEGS = 44;
    for (let i = 0; i < SEGS; i++) {
        const a = (i / SEGS) * Math.PI * 2;
        const seg = Bodies.rectangle(
            CX + Math.cos(a) * WALL_R, CY + Math.sin(a) * WALL_R,
            (2 * Math.PI * WALL_R) / SEGS + 8, 18,
            { isStatic: true, angle: a + Math.PI / 2, friction: 0.15 }
        );
        Composite.add(world, seg);
    }

    // Drei Mitnehmer (Paddles), werden jeden Schritt mit der Trommel mitgedreht
    paddles = [];
    for (let k = 0; k < 3; k++) {
        const p = Bodies.rectangle(CX, CY, 70, 20, { isStatic: true, friction: 0.8 });
        p.plugin = { k };
        paddles.push(p);
        Composite.add(world, p);
    }
    positionPaddles();

    // Wäschestücke
    laundry = LAUNDRY_DEF.map((d, i) => {
        const body = Bodies.circle(CX - 60 + i * 40, CY + 60 + (i % 2) * 30, d.r, {
            friction: 0.7, frictionAir: 0.012, restitution: 0.05, density: 0.0008,
        });
        Composite.add(world, body);
        return { body, ...d };
    });

    particles = [];
    fx = [];
}

function positionPaddles() {
    for (const p of paddles) {
        const a = state.drumAngle + p.plugin.k * (Math.PI * 2 / 3);
        Body.setPosition(p, { x: CX + Math.cos(a) * 139, y: CY + Math.sin(a) * 139 });
        Body.setAngle(p, a);
    }
}

function setPaddlesSolid(solid) {
    for (const p of paddles) p.collisionFilter.mask = solid ? -1 : 0;
}

// ---- Partikel --------------------------------------------------------------
function addParticle(kind, x, y, vx, vy) {
    const r = kind === 'foam' ? 5 + Math.random() * 2 : kind === 'powder' ? 4 : 6;
    const opts = kind === 'foam'
        ? { friction: 0.05, frictionAir: 0.06, restitution: 0, density: 0.0002 }
        : { friction: 0.02, frictionAir: 0.008, restitution: 0.05, density: 0.0008 };
    const body = Bodies.circle(x, y, r, opts);
    Body.setVelocity(body, { x: vx || 0, y: vy || 0 });
    Composite.add(world, body);
    particles.push({ body, kind, r });
}

function removeParticleAt(i) {
    Composite.remove(world, particles[i].body);
    particles.splice(i, 1);
}

function countKind(kind) {
    let n = 0;
    for (const p of particles) if (p.kind === kind) n++;
    return n;
}

// Entfernt bis zu n Partikel in der Nähe des Ablaufs (unten in der Trommel)
function drainParticles(n, anywhere) {
    let removed = 0;
    for (let i = particles.length - 1; i >= 0 && removed < n; i--) {
        const p = particles[i];
        if (p.kind === 'foam') continue;
        const b = p.body;
        if (anywhere || (b.position.y > CY + 110 && Math.abs(b.position.x - CX) < 90)) {
            removeParticleAt(i);
            removed++;
        }
    }
    return removed;
}

// ---- Phasenlogik -----------------------------------------------------------
function currentPhase() {
    return state.phaseIdx >= 0 && state.phaseIdx < PHASES.length ? PHASES[state.phaseIdx] : null;
}

function step(dt) {
    const ph = currentPhase();
    const id = ph ? ph.id : (state.phaseIdx >= PHASES.length ? 'done' : 'idle');
    state.airT += dt;

    // Phasenwechsel
    if (ph && state.t >= ph.dur) {
        state.t = 0;
        state.phaseIdx++;
        const next = currentPhase();
        setPaddlesSolid(!next || next.id !== 'spin');
        if (!next) state.running = false;
        return;
    }
    if (state.running) state.t += dt;

    // Solltemperatur
    const tempTarget = { idle: 20, fill1: 22, wash: 60, drain1: 42, fill2: 28, rinse: 25, drain2: 24, spin: 24, dry: 70, done: 30 }[id];
    state.temp += Math.max(-dt * 9, Math.min(dt * 4, tempTarget - state.temp));
    const heatOnWash = id === 'wash' && state.temp < tempTarget - 1.5;
    const dryActive = id === 'dry';

    // Trommelbewegung
    let omegaTarget = 0;
    if (id === 'wash' || id === 'rinse' || id === 'dry') {
        // Hin- und Herbewegung: 5 s drehen, 2 s Pause, Richtungswechsel
        const seg = 7, cycle = state.t % (2 * seg);
        const dir = cycle < seg ? 1 : -1;
        omegaTarget = (cycle % seg) < 5 ? dir * 1.3 : 0;
    } else if (id === 'spin') {
        if (state.t < 5) omegaTarget = 16 * (state.t / 5);
        else if (state.t < ph.dur - 3) omegaTarget = 16;
        else omegaTarget = Math.max(0, 16 * ((ph.dur - state.t) / 3));
    }
    state.drumOmega += (omegaTarget - state.drumOmega) * Math.min(1, dt * 3);
    state.drumAngle += state.drumOmega * dt;
    positionPaddles();

    // Wasserzulauf
    if (id === 'fill1' || id === 'fill2') {
        state.fillAcc += 26 * dt;
        while (state.fillAcc >= 1) {
            state.fillAcc--;
            if (countKind('water') + countKind('powder') < WATER_TARGET) {
                addParticle('water', SPAWN.x + (Math.random() - 0.5) * 30, SPAWN.y + Math.random() * 10, (Math.random() - 0.5) * 1.5, 2.5);
            }
        }
        if (id === 'fill1' && state.powderLoaded) {
            state.powderVisual = Math.max(0, 1 - state.t / 4);
            if (state.t < 4 && countKind('powder') + state.powderDissolved < POWDER_COUNT && Math.random() < 4 * dt) {
                addParticle('powder', SPAWN.x + (Math.random() - 0.5) * 24, SPAWN.y, 0, 2.5);
            }
        }
    }

    // Hauptwäsche: Pulver löst sich, Schaum entsteht, Heizstab blubbert
    if (id === 'wash') {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            if (p.kind === 'powder' && Math.random() < 0.005) {
                p.kind = 'water';
                state.powderDissolved++;
            }
        }
        if (state.powderLoaded) state.sudsLevel = state.powderDissolved / POWDER_COUNT;
        if (state.sudsLevel > 0.25 && countKind('foam') < FOAM_MAX && Math.random() < 0.3) {
            const waters = particles.filter(p => p.kind === 'water' && p.body.speed > 1.2);
            if (waters.length) {
                const w = waters[(Math.random() * waters.length) | 0].body;
                addParticle('foam', w.position.x, w.position.y - 8, (Math.random() - 0.5) * 2, -1.5);
            }
        }
        if (heatOnWash && Math.random() < 0.25) {
            fx.push({ type: 'bubble', x: WASH_HEATER.x1 + Math.random() * (WASH_HEATER.x2 - WASH_HEATER.x1), y: WASH_HEATER.y - 4, age: 0, max: 0.9 });
        }
    }

    // Spülen: Schaum und Seifenreste verschwinden
    if (id === 'rinse' || id === 'drain2') {
        state.sudsLevel = Math.max(0, state.sudsLevel - 0.1 * dt);
        if (Math.random() < 0.12) {
            for (let i = particles.length - 1; i >= 0; i--) {
                if (particles[i].kind === 'foam') { removeParticleAt(i); break; }
            }
        }
    }

    // Abpumpen
    const pumping = id === 'drain1' || id === 'drain2' || (id === 'spin' && state.t > 2) || dryActive;
    if (id === 'drain1' || id === 'drain2') {
        state.drainAcc += 34 * dt;
        const n = Math.floor(state.drainAcc);
        state.drainAcc -= n;
        drainParticles(n, state.t > ph.dur - 2);
        if (Math.random() < 0.08) {
            for (let i = particles.length - 1; i >= 0; i--) {
                if (particles[i].kind === 'foam') { removeParticleAt(i); break; }
            }
        }
    }

    // Schleudern: Fliehkraft drückt alles an die Wand, Wasser wird aus der
    // Wäsche gepresst und entweicht durch die Trommellöcher
    if (id === 'spin') {
        const w = Math.abs(state.drumOmega);
        if (w > 3) {
            const s = w / 16, sign = Math.sign(state.drumOmega);
            const push = (body, fOut, fTan) => {
                const dx = body.position.x - CX, dy = body.position.y - CY;
                const d = Math.hypot(dx, dy) || 1;
                const nx = dx / d, ny = dy / d;
                Body.applyForce(body, body.position, {
                    x: (nx * fOut + -ny * sign * fTan) * body.mass * s,
                    y: (ny * fOut + nx * sign * fTan) * body.mass * s,
                });
            };
            for (const p of particles) push(p.body, 0.002, 0.0007);
            for (const l of laundry) push(l.body, 0.0045, 0.0012);
        }
        if (state.t > 1.5 && state.t < ph.dur - 5 && state.wetness > 0.3) {
            state.extractAcc += 9 * dt * (w / 16);
            while (state.extractAcc >= 1) {
                state.extractAcc--;
                const l = laundry[(Math.random() * laundry.length) | 0].body;
                addParticle('water', l.position.x, l.position.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
            }
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            const d = Math.hypot(p.body.position.x - CX, p.body.position.y - CY);
            if (p.kind === 'foam' && Math.random() < 0.1) { removeParticleAt(i); continue; }
            if (state.t > 2 && d > 152 && Math.random() < 0.05) removeParticleAt(i);
        }
        if (state.t > ph.dur - 3) drainParticles(2, true);
    }

    // Trocknen: Restwasser verdampft, Kondensat tropft
    if (dryActive) {
        state.fanAngle += dt * 18;
        for (let i = particles.length - 1; i >= 0; i--) {
            if (Math.random() < 0.02) {
                const p = particles[i];
                fx.push({ type: 'steam', x: p.body.position.x, y: p.body.position.y, age: 0, max: 2 });
                removeParticleAt(i);
            }
        }
        if (Math.random() < 0.12 && state.wetness > 0.05) {
            const l = laundry[(Math.random() * laundry.length) | 0].body;
            fx.push({ type: 'steam', x: l.position.x, y: l.position.y - 10, age: 0, max: 2.5 });
        }
        if (Math.random() < 0.1 && state.wetness > 0.03) {
            fx.push({ type: 'drip', x: COND.x + 8 + Math.random() * (COND.w - 16), y: COND.y + 8, age: 0, max: 3 });
        }
    }
    if (pumping) state.pumpAngle += dt * 14;

    // Feuchtigkeit der Wäsche
    const wetTarget = { idle: state.wetness, fill1: 1, wash: 1, drain1: 0.95, fill2: 1, rinse: 1, drain2: 0.9, spin: 0.5, dry: 0, done: state.wetness }[id];
    const wetRate = id === 'dry' ? 0.05 : id === 'spin' ? 0.06 : 0.5;
    state.wetness += Math.max(-dt * wetRate, Math.min(dt * wetRate, wetTarget - state.wetness));

    // Effekte animieren
    for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.age += dt;
        if (f.type === 'bubble') f.y -= 35 * dt;
        if (f.type === 'steam') { f.y -= 22 * dt; f.x += (AIR_OUT.x - f.x) * dt * 0.5; }
        if (f.type === 'drip') f.y += 70 * dt;
        if (f.age > f.max || (f.type === 'drip' && f.y > COND.y + COND.h - 8)) fx.splice(i, 1);
    }

    Engine.update(engine, dt * 1000);

    // Sicherheit: Partikel in der Trommel halten, Geschwindigkeiten begrenzen
    const contain = (body, r) => {
        const dx = body.position.x - CX, dy = body.position.y - CY;
        const d = Math.hypot(dx, dy);
        const maxD = INNER - r;
        if (d > maxD) {
            Body.setPosition(body, { x: CX + (dx / d) * maxD, y: CY + (dy / d) * maxD });
            Body.setVelocity(body, { x: body.velocity.x * 0.3, y: body.velocity.y * 0.3 });
        }
        if (body.speed > 18) {
            const f = 18 / body.speed;
            Body.setVelocity(body, { x: body.velocity.x * f, y: body.velocity.y * f });
        }
    };
    for (const p of particles) contain(p.body, p.r);
    for (const l of laundry) contain(l.body, l.r);
}

// ---- Zeichnen ----------------------------------------------------------
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function lerpColor(c1, c2, t) {
    const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = p(c1), b = p(c2);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function draw() {
    const ph = currentPhase();
    const id = ph ? ph.id : (state.phaseIdx >= PHASES.length ? 'done' : 'idle');
    const filling = id === 'fill1' || id === 'fill2';
    const pumping = id === 'drain1' || id === 'drain2' || (id === 'spin' && state.t > 2) || id === 'dry';
    const drying = id === 'dry';
    const heatOnWash = id === 'wash' && state.temp < 58;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Gehäuse
    const g = ctx.createLinearGradient(MX, MY, MX + MW, MY);
    g.addColorStop(0, '#d6dce3'); g.addColorStop(1, '#bfc8d1');
    roundRect(MX, MY, MW, MH, 18);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#8d97a2'; ctx.lineWidth = 2; ctx.stroke();

    // Bedienleiste
    roundRect(MX + 12, 62, MW - 24, 64, 10);
    ctx.fillStyle = '#aab5c0'; ctx.fill();

    // Zulauf + Einlassventil
    ctx.strokeStyle = '#4a5560'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(300, 18); ctx.lineTo(300, DY + 4); ctx.stroke();
    if (filling) {
        ctx.strokeStyle = '#4aa3e8'; ctx.lineWidth = 4;
        ctx.setLineDash([6, 8]); ctx.lineDashOffset = -state.airT * 60;
        ctx.beginPath(); ctx.moveTo(300, 18); ctx.lineTo(300, DY + 4); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.fillStyle = filling ? '#3f88c9' : '#5d6873';
    roundRect(288, 34, 24, 18, 4); ctx.fill();
    ctx.strokeStyle = '#39424c'; ctx.lineWidth = 1.5; ctx.stroke();

    // Einspülkammer
    roundRect(DX, DY, DW, DH, 6);
    ctx.fillStyle = '#e3e8ee'; ctx.fill();
    ctx.strokeStyle = '#7e8893'; ctx.lineWidth = 2; ctx.stroke();
    roundRect(DX + 8, DY + 8, DW - 16, DH - 16, 4);
    ctx.fillStyle = '#c8d1da'; ctx.fill();
    if (state.powderVisual > 0) {
        ctx.globalAlpha = state.powderVisual;
        ctx.fillStyle = '#fdfdfd';
        ctx.beginPath();
        ctx.ellipse(DX + DW / 2, DY + DH - 13, 34, 9, 0, Math.PI, 0);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    if (filling) {
        ctx.fillStyle = 'rgba(74,163,232,0.45)';
        roundRect(DX + 8, DY + DH - 22, DW - 16, 14, 4); ctx.fill();
    }

    // Kanal Einspülkammer -> Trommel
    ctx.strokeStyle = '#9aa5b0'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(DX + DW - 10, DY + DH - 6);
    ctx.quadraticCurveTo(400, 170, SPAWN.x, 246);
    ctx.stroke();
    if (filling) {
        ctx.strokeStyle = '#4aa3e8'; ctx.lineWidth = 5;
        ctx.setLineDash([7, 9]); ctx.lineDashOffset = -state.airT * 80;
        ctx.beginPath();
        ctx.moveTo(DX + DW - 10, DY + DH - 6);
        ctx.quadraticCurveTo(400, 170, SPAWN.x, 246);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.lineCap = 'butt';

    // LCD-Anzeige
    roundRect(475, 70, 240, 48, 6);
    ctx.fillStyle = '#16211a'; ctx.fill();
    ctx.strokeStyle = '#5d6873'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7be087';
    ctx.font = 'bold 14px monospace';
    const lcdName = id === 'idle' ? 'BEREIT' : id === 'done' ? 'FERTIG  ✓' : ph.name.toUpperCase();
    ctx.fillText(lcdName, 487, 90);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#5fae69';
    ctx.fillText(`${Math.round(state.temp)}°C   ${displayRpm()} U/min`, 487, 108);
    if (ph) {
        ctx.fillStyle = '#2c4632';
        ctx.fillRect(610, 80, 95, 8);
        ctx.fillStyle = '#7be087';
        ctx.fillRect(610, 80, 95 * Math.min(1, state.t / ph.dur), 8);
    }
    ctx.fillStyle = '#6b7682';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('WaschSim 3000', 612, 112);

    drawAirCircuit(drying);

    // Laugenbehälter
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R + 10, 0, Math.PI * 2);
    ctx.fillStyle = '#76818c'; ctx.fill();
    const tg = ctx.createRadialGradient(CX, CY - 40, 60, CX, CY, TUB_R);
    tg.addColorStop(0, '#262b32'); tg.addColorStop(1, '#14171c');
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R, 0, Math.PI * 2);
    ctx.fillStyle = tg; ctx.fill();

    // Trommellöcher (drehen sich mit)
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    const rings = [[60, 10], [100, 16], [140, 22]];
    for (const [r, n] of rings) {
        for (let i = 0; i < n; i++) {
            const a = state.drumAngle + (i / n) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Heizstab (Sumpf)
    drawWashHeater(heatOnWash);

    // Mitnehmer
    for (let k = 0; k < 3; k++) {
        const a = state.drumAngle + k * (Math.PI * 2 / 3);
        ctx.save();
        ctx.translate(CX, CY); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(104, -8); ctx.lineTo(174, -13); ctx.lineTo(174, 13); ctx.lineTo(104, 8);
        ctx.closePath();
        ctx.fillStyle = '#93a3b2'; ctx.fill();
        ctx.strokeStyle = '#67747f'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
    }

    // Partikel
    const waterColor = lerpColor('#3f8fe0', '#8fc0ee', Math.min(1, state.sudsLevel));
    for (const p of particles) {
        const b = p.body;
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, p.r, 0, Math.PI * 2);
        if (p.kind === 'water') {
            ctx.fillStyle = waterColor; ctx.globalAlpha = 0.92;
        } else if (p.kind === 'powder') {
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = '#f3f6f9'; ctx.globalAlpha = 0.95;
        }
        ctx.fill();
        if (p.kind === 'foam') {
            ctx.strokeStyle = 'rgba(150,165,180,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // Wäsche
    for (const l of laundry) {
        const b = l.body;
        const col = lerpColor(l.color, '#2b3d52', state.wetness * 0.45);
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        ctx.beginPath(); ctx.arc(0, 0, l.r, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(-l.r * 0.15, l.r * 0.1, l.r * 0.55, 0.4, 2.2);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
    }

    // Effekte (Bläschen, Dampf, Tropfen)
    for (const f of fx) {
        const k = 1 - f.age / f.max;
        if (f.type === 'bubble') {
            ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220,240,255,${0.6 * k})`; ctx.fill();
        } else if (f.type === 'steam') {
            ctx.beginPath(); ctx.arc(f.x, f.y, 6 + f.age * 5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(230,238,245,${0.25 * k})`; ctx.fill();
        } else if (f.type === 'drip') {
            ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(110,180,235,0.9)'; ctx.fill();
        }
    }

    // Glutschein des Heizstabs scheint durch das Wasser
    if (heatOnWash) {
        const hg = ctx.createRadialGradient(CX, WASH_HEATER.y, 8, CX, WASH_HEATER.y, 95);
        hg.addColorStop(0, 'rgba(255,95,55,0.30)');
        hg.addColorStop(1, 'rgba(255,95,55,0)');
        ctx.save();
        ctx.beginPath(); ctx.arc(CX, CY, TUB_R - 2, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = hg;
        ctx.fillRect(CX - 100, WASH_HEATER.y - 60, 200, 70);
        ctx.restore();
    }

    // Glas-Vignette + Glanz
    const vg = ctx.createRadialGradient(CX, CY, TUB_R * 0.55, CX, CY, TUB_R);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R, 0, Math.PI * 2);
    ctx.fillStyle = vg; ctx.fill();
    ctx.beginPath(); ctx.arc(CX - 55, CY - 70, 105, -2.4, -0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 22; ctx.stroke();

    // Bullaugen-Ring
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#e1e7ed'; ctx.lineWidth = 13; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R + 11, 0, Math.PI * 2);
    ctx.strokeStyle = '#909aa5'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R - 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#aab4be'; ctx.lineWidth = 2; ctx.stroke();
    // Türgriff
    roundRect(CX - TUB_R - 24, CY - 26, 12, 52, 5);
    ctx.fillStyle = '#dde3e9'; ctx.fill();
    ctx.strokeStyle = '#909aa5'; ctx.lineWidth = 1.5; ctx.stroke();

    drawDrainAndPump(pumping, drying);
    drawLabels(drying);
}

function displayRpm() {
    const id = currentPhase() ? currentPhase().id : 'idle';
    const w = Math.abs(state.drumOmega);
    if (id === 'spin') return Math.round(1200 * (w / 16));
    return Math.round(50 * Math.min(1, w / 1.3));
}

function drawWashHeater(on) {
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, TUB_R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = on ? '#ff5a3c' : '#5d6873';
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (on) { ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 12; }
    ctx.beginPath();
    const n = 7, w = (WASH_HEATER.x2 - WASH_HEATER.x1) / n;
    ctx.moveTo(WASH_HEATER.x1, WASH_HEATER.y);
    for (let i = 0; i < n; i++) {
        const x = WASH_HEATER.x1 + w * (i + 0.5);
        ctx.lineTo(x, WASH_HEATER.y + (i % 2 ? -7 : 7));
    }
    ctx.lineTo(WASH_HEATER.x2, WASH_HEATER.y);
    ctx.stroke();
    ctx.restore();
}

function drawAirCircuit(active) {
    // Luftkanal
    ctx.strokeStyle = '#454d57'; ctx.lineWidth = 14; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(AIR_PATH[0][0], AIR_PATH[0][1]);
    for (let i = 1; i < AIR_PATH.length; i++) ctx.lineTo(AIR_PATH[i][0], AIR_PATH[i][1]);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Kondensator
    roundRect(COND.x, COND.y, COND.w, COND.h, 6);
    ctx.fillStyle = active ? '#39556e' : '#525c66'; ctx.fill();
    ctx.strokeStyle = active ? '#6db1e8' : '#39424c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = active ? 'rgba(140,200,245,0.8)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let y = COND.y + 14; y < COND.y + COND.h - 8; y += 14) {
        ctx.beginPath(); ctx.moveTo(COND.x + 7, y); ctx.lineTo(COND.x + COND.w - 7, y); ctx.stroke();
    }

    // Trocknungsheizung im Kanal
    ctx.strokeStyle = active ? '#ff5a3c' : '#6b7682';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    if (active) { ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 10; }
    ctx.beginPath();
    const n = 5, w = (HEAT_DUCT.x2 - HEAT_DUCT.x1) / n;
    ctx.moveTo(HEAT_DUCT.x2, HEAT_DUCT.y);
    for (let i = 0; i < n; i++) {
        const x = HEAT_DUCT.x2 - w * (i + 0.5);
        ctx.lineTo(x, HEAT_DUCT.y + (i % 2 ? -5 : 5));
    }
    ctx.lineTo(HEAT_DUCT.x1, HEAT_DUCT.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    // Gebläse
    ctx.beginPath(); ctx.arc(FAN.x, FAN.y, FAN.r, 0, Math.PI * 2);
    ctx.fillStyle = '#5d6873'; ctx.fill();
    ctx.strokeStyle = '#39424c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.translate(FAN.x, FAN.y);
    ctx.rotate(active ? state.fanAngle : 0);
    ctx.strokeStyle = '#d6dce3'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(FAN.r - 6, 0); ctx.stroke();
    }
    ctx.restore();

    // Luftströmungs-Pfeile
    if (active) {
        const lens = [0];
        for (let i = 1; i < AIR_PATH.length; i++) {
            lens.push(lens[i - 1] + Math.hypot(AIR_PATH[i][0] - AIR_PATH[i - 1][0], AIR_PATH[i][1] - AIR_PATH[i - 1][1]));
        }
        const total = lens[lens.length - 1];
        for (let k = 0; k < 11; k++) {
            const s = ((state.airT * 70 + k * (total / 11)) % total);
            let i = 1;
            while (lens[i] < s) i++;
            const f = (s - lens[i - 1]) / (lens[i] - lens[i - 1]);
            const x = AIR_PATH[i - 1][0] + (AIR_PATH[i][0] - AIR_PATH[i - 1][0]) * f;
            const y = AIR_PATH[i - 1][1] + (AIR_PATH[i][1] - AIR_PATH[i - 1][1]) * f;
            const ang = Math.atan2(AIR_PATH[i][1] - AIR_PATH[i - 1][1], AIR_PATH[i][0] - AIR_PATH[i - 1][0]);
            // feuchte Luft (vor Kondensator) blaugrau, nach Heizung orange
            ctx.fillStyle = i <= 4 ? '#a8c6d8' : i === 7 && x < HEAT_DUCT.x2 ? '#ff8a5c' : '#c2cbd3';
            ctx.save();
            ctx.translate(x, y); ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(4, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }
        ctx.font = 'italic 10px sans-serif';
        ctx.fillStyle = '#a8c6d8';
        ctx.fillText('feuchte Luft', 565, 226);
        ctx.fillStyle = '#ff8a5c';
        ctx.fillText('warme Luft', 583, 525);
    }

    // Kondensat-Leitung zum Sumpf
    ctx.strokeStyle = '#454d57'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(COND.x + COND.w - 8, COND.y + COND.h - 4);
    ctx.lineTo(714, 515); ctx.lineTo(714, 650); ctx.lineTo(PUMP.x + PUMP.w, 655);
    ctx.stroke();
    if (active) {
        ctx.strokeStyle = 'rgba(110,180,235,0.8)'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 10]); ctx.lineDashOffset = -state.airT * 50;
        ctx.beginPath();
        ctx.moveTo(COND.x + COND.w - 8, COND.y + COND.h - 4);
        ctx.lineTo(714, 515); ctx.lineTo(714, 650); ctx.lineTo(PUMP.x + PUMP.w, 655);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawDrainAndPump(pumping, drying) {
    // Ablauf von der Trommel zur Pumpe
    ctx.strokeStyle = '#454d57'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CX, CY + TUB_R + 6); ctx.lineTo(CX, 632); ctx.lineTo(PUMP.x + 14, PUMP.y + 8);
    ctx.stroke();
    // Ablaufschlauch nach draußen
    ctx.beginPath();
    ctx.moveTo(PUMP.x + PUMP.w - 4, PUMP.cy + 8); ctx.lineTo(MX + MW, PUMP.cy + 8);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (pumping) {
        ctx.strokeStyle = '#4aa3e8'; ctx.lineWidth = drying ? 2 : 5;
        ctx.setLineDash([6, 8]); ctx.lineDashOffset = -state.airT * 70;
        ctx.beginPath();
        ctx.moveTo(CX, CY + TUB_R + 6); ctx.lineTo(CX, 632); ctx.lineTo(PUMP.x + 14, PUMP.y + 8);
        ctx.moveTo(PUMP.x + PUMP.w - 4, PUMP.cy + 8); ctx.lineTo(MX + MW, PUMP.cy + 8);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Laugenpumpe
    roundRect(PUMP.x, PUMP.y, PUMP.w, PUMP.h, 6);
    ctx.fillStyle = pumping ? '#7c93ad' : '#8e99a4'; ctx.fill();
    ctx.strokeStyle = pumping ? '#4aa3e8' : '#5d6873'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.translate(PUMP.cx, PUMP.cy);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#39424c'; ctx.fill();
    ctx.rotate(state.pumpAngle);
    ctx.strokeStyle = '#9fc6e8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke();
    }
    ctx.restore();
}

function drawLabels(drying) {
    ctx.font = '11px sans-serif';
    ctx.strokeStyle = '#5a626c'; ctx.lineWidth = 1;
    const label = (text, tx, ty, lx1, ly1, lx2, ly2, align) => {
        ctx.beginPath(); ctx.moveTo(lx1, ly1); ctx.lineTo(lx2, ly2); ctx.stroke();
        ctx.fillStyle = '#9aa3ad';
        ctx.textAlign = align || 'left';
        ctx.fillText(text, tx, ty);
        ctx.textAlign = 'left';
    };
    label('Einlassventil', 318, 46, 314, 43, 302, 43);
    label('Einspülkammer', DX + 2, 138, DX + 40, 134, DX + 40, DY + DH + 2);
    label('Heizstab', 250, 654, 290, 648, 360, 586);
    label('Laugenpumpe', PUMP.cx - 36, 716, PUMP.cx, 706, PUMP.cx, PUMP.y + PUMP.h + 2);
    label('Kondensator', 740, 398, 738, 394, COND.x + COND.w + 2, 400);
    label('Gebläse', 740, 552, 738, 548, FAN.x + FAN.r + 2, 546);
    label('Heizung', 545, 612, 568, 604, 600, 556);
    ctx.fillStyle = drying ? '#c2cbd3' : '#737d88';
    ctx.fillText('Luftkanal', 700, 232);
}

// ---- UI ----------------------------------------------------------------
const powderBtn = document.getElementById('powderBtn');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');
const phaseList = document.getElementById('phaseList');
const phaseDesc = document.getElementById('phaseDesc');

function buildPhaseList() {
    phaseList.innerHTML = '';
    for (const p of PHASES) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.name}</span><span class="dur">${p.dur} min</span>`;
        phaseList.appendChild(li);
    }
}

function updateUI() {
    const ph = currentPhase();
    const done = state.phaseIdx >= PHASES.length;

    if (state.phaseIdx !== state.lastPhaseIdx) {
        state.lastPhaseIdx = state.phaseIdx;
        [...phaseList.children].forEach((li, i) => {
            li.className = i < state.phaseIdx ? 'done' : i === state.phaseIdx ? 'active' : '';
        });
        phaseDesc.textContent = done ? DONE_DESC : ph ? ph.desc : IDLE_DESC;
    }

    document.getElementById('statPhase').textContent = done ? 'Fertig ✓' : ph ? ph.name : 'Bereit';
    let remaining = '–';
    if (ph) {
        let rem = ph.dur - state.t;
        for (let i = state.phaseIdx + 1; i < PHASES.length; i++) rem += PHASES[i].dur;
        remaining = Math.ceil(rem) + ' min';
    } else if (done) remaining = '0 min';
    document.getElementById('statTime').textContent = remaining;
    document.getElementById('statRpm').textContent = displayRpm() + ' U/min';
    const dryPhase = ph && ph.id === 'dry';
    document.getElementById('statTemp').textContent = Math.round(state.temp) + ' °C' + (dryPhase ? ' (Luft)' : '');
    const liters = (countKind('water') + countKind('powder')) * 0.045;
    document.getElementById('statWater').textContent = liters.toFixed(1).replace('.', ',') + ' l';
    document.getElementById('statLaundry').textContent =
        state.wetness > 0.7 ? 'nass' : state.wetness > 0.2 ? 'feucht' : 'trocken';
}

powderBtn.addEventListener('click', () => {
    state.powderLoaded = true;
    state.powderVisual = 1;
    powderBtn.disabled = true;
});

startBtn.addEventListener('click', () => {
    if (state.running || state.phaseIdx >= 0) return;
    state.running = true;
    state.phaseIdx = 0;
    state.t = 0;
    startBtn.disabled = true;
    powderBtn.disabled = true;
});

resetBtn.addEventListener('click', () => {
    resetState();
    buildWorld();
    powderBtn.disabled = false;
    startBtn.disabled = false;
});

speedSlider.addEventListener('input', () => {
    speedVal.textContent = speedSlider.value + 'x';
});

// ---- Hauptschleife -----------------------------------------------------
// Feste Physikschritte (60 Hz Simulationszeit), getaktet über die real
// verstrichene Zeit – unabhängig von der Bildwiederholrate des Displays.
const STEP = 1 / 60;
let lastTime = 0;
let stepAcc = 0;

function loop(now) {
    const speed = parseInt(speedSlider.value, 10);
    if (lastTime) stepAcc += Math.min((now - lastTime) / 1000, 0.1) * speed;
    lastTime = now;
    let n = 0;
    while (stepAcc >= STEP && n < 12) {
        stepAcc -= STEP;
        step(STEP);
        n++;
    }
    draw();
    updateUI();
    requestAnimationFrame(loop);
}

// Debug: direkt in eine Phase springen (z.B. __washJump(6, {wetness: 0.9}))
window.__washJump = (idx, opts = {}) => {
    state.phaseIdx = idx;
    state.t = 0;
    state.running = true;
    const p = currentPhase();
    setPaddlesSolid(!p || p.id !== 'spin');
    if (opts.wetness !== undefined) state.wetness = opts.wetness;
};

resetState();
buildWorld();
buildPhaseList();
requestAnimationFrame(loop);
})();
