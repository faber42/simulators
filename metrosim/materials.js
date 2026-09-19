import * as T from '../pinsim/three.module.min.js';
import { infrastructureLighting } from './lighting.js';
import { tunnelFinish } from './scenery.mjs';
import { distantLightMaterial, filteredLampMaterial } from './distant-lights.js';

export function random(seed) { let n = seed | 0; return () => { n = Math.imul(n ^ n >>> 15, 1 | n); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
function canvasTexture(draw, w = 512, h = 512) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8; return tex;
}
function surface(kind) {
  return canvasTexture((c, w, h) => {
    const rng = random(372 + kind.length);
    const base = { concrete: [112, 113, 106], floor: [142, 145, 136], tiles: [180, 184, 169], ballast: [65, 61, 54], metal: [107, 111, 107],
      soot: [78, 82, 81], limestone: [173, 171, 153], brick: [112, 83, 66], chalk: [192, 198, 187] }[kind];
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const coarse = Math.sin(x * .032 + Math.sin(y * .017) * 3) * Math.sin(y * .026) * 8;
      const grain = (rng() - .5) * (kind === 'ballast' ? 65 : 25) + coarse;
      for (let k = 0; k < 3; k++) img.data[p + k] = base[k] + grain;
      img.data[p + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    if (kind === 'tiles' || kind === 'floor') {
      const step = kind === 'tiles' ? 64 : 128;
      c.strokeStyle = '#434d474d'; c.lineWidth = 2;
      for (let y = 0; y <= h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (let x = 0; x <= w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      c.strokeStyle = '#ffffff26'; c.lineWidth = 1;
      for (let x = 2; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    } else if (['concrete', 'soot', 'limestone', 'chalk'].includes(kind)) {
      for (let i = 0; i < 70; i++) {
        const x = rng() * w, y = rng() * h, width = 1 + rng() * 22;
        const g = c.createLinearGradient(0, y, 0, y + 100 + rng() * 180);
        g.addColorStop(0, '#24241b28'); g.addColorStop(1, '#262b2000');
        c.fillStyle = g; c.fillRect(x, y, width, 240);
      }
      c.fillStyle = '#34372e70'; c.fillRect(0, 0, w, 3);
      for (const x of [16, 496]) for (const y of [18, 494]) { c.beginPath(); c.ellipse(x, y, 3, 3, 0, 0, 7); c.fill(); }
      if (kind === 'limestone' || kind === 'chalk') {
        c.fillStyle = '#323a343d'; c.fillRect(w / 2, 0, 2, h);
        c.fillRect(0, h / 2, w, 2);
      }
    } else if (kind === 'brick') {
      // Staggered masonry joints and individual fired-brick colour variation.
      for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
        const x = col * 128 + (row % 2) * 64, y = row * 64;
        c.fillStyle = rng() > .5 ? '#efc79a15' : '#201a191c'; c.fillRect(x + 3, y + 3, 122, 58);
        c.strokeStyle = '#292724a0'; c.lineWidth = 3; c.strokeRect(x, y, 128, 64);
        c.fillStyle = '#c8b3913a'; c.fillRect(x + 3, y + 3, 122, 2);
      }
    }
  });
}

function stationSurface(st) {
  return canvasTexture((c, w, h) => {
    const rng = random(618 + st.wallStyle.length);
    c.fillStyle = st.wallStyle === 'solid' ? st.color : '#dedfd6';
    if (st.wallStyle === 'white') c.fillStyle = st.color;
    c.fillRect(0, 0, w, h);
    c.fillStyle = st.color; c.strokeStyle = st.color;
    if (st.wallStyle === 'diagonal') {
      // Periodic broad diagonals meet at the edges of each three-metre panel.
      for (let x = -w * 2; x <= w * 3; x += w) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w * .42, 0);
        c.lineTo(x + w * .42 - h * .55, h); c.lineTo(x - h * .55, h); c.closePath(); c.fill();
      }
    } else if (st.wallStyle === 'circles') {
      c.lineWidth = 21; c.beginPath(); c.arc(w / 2, h * .52, 117, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = .5; c.beginPath(); c.arc(w / 2, h * .52, 76, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
    // Fine ceramic joints continue through the coloured glaze/mural.
    const tileW = st.wallStyle === 'solid' ? 32 : 48, tileH = st.wallStyle === 'solid' ? 80 : 64;
    for (let y = 0; y < h; y += tileH) for (let x = 0; x < w; x += tileW) {
      c.fillStyle = rng() > .5 ? '#ffffff08' : '#101b1b07'; c.fillRect(x, y, tileW, tileH);
      c.strokeStyle = '#24342b38'; c.lineWidth = 1.2; c.strokeRect(x, y, tileW, tileH);
      c.fillStyle = '#ffffff19'; c.fillRect(x + 2, y + 2, tileW - 3, 1);
    }
    const dirt = c.createLinearGradient(0, h * .75, 0, h);
    dirt.addColorStop(0, '#25291f00'); dirt.addColorStop(1, '#25291f28');
    c.fillStyle = dirt; c.fillRect(0, 0, w, h);
  }, 384, 640);
}
export function createMaterials() {
  const m = {};
  const textured = (name, kind, opts = {}) => {
    const map = surface(kind); map.wrapS = map.wrapT = T.RepeatWrapping;
    // Keep high-frequency colour grain out of the normal perturbation: it
    // shimmered under moving point lights and changed with texture mip levels.
    const bumpMap = canvasTexture((c, w, h) => { c.filter = 'blur(10px)'; c.drawImage(map.image, 0, 0, w, h); });
    bumpMap.colorSpace = T.NoColorSpace; bumpMap.wrapS = bumpMap.wrapT = T.RepeatWrapping;
    m[name] = infrastructureLighting(new T.MeshStandardMaterial({ map, bumpMap, bumpScale: .012, roughness: .9, ...opts }));
  };
  textured('concrete', 'concrete', { color: '#a0a498' });
  textured('floor', 'floor', { color: '#a5a69a', roughness: .66, bumpScale: .012 });
  textured('tiles', 'tiles', { color: '#c0beb0', roughness: .57, bumpScale: .006 });
  textured('ballast', 'ballast', { roughness: 1, bumpScale: .08 });
  textured('sleeper', 'concrete', { color: '#88867e' });
  textured('ceiling', 'concrete', { color: '#737871' });
  // The upper access rooms have their own fixed ceiling fixtures, rather than
  // borrowing the much lower platform lights or adding moving light slots.
  m.accessWall = infrastructureLighting(new T.MeshStandardMaterial({ map: m.tiles.map, color: '#e5e4da', roughness: .63 }), { lampX: 5.75, lampY: 7.4 });
  m.accessCeiling = infrastructureLighting(new T.MeshStandardMaterial({ map: m.concrete.map, color: '#b6b8ad', roughness: .86 }), { lampX: 5.75, lampY: 7.4 });
  // Light painted doors and opaque frosted panes remain legible from below.
  // The lift's dark reflective glass looked like an unbuilt hole up here.
  m.accessDoor = infrastructureLighting(new T.MeshStandardMaterial({ color: '#b8c4bb', roughness: .55, metalness: .1 }), { lampX: 5.75, lampY: 7.4 });
  m.accessGlazing = infrastructureLighting(new T.MeshStandardMaterial({ color: '#d2e1db', roughness: .48, emissive: '#a2bab1', emissiveIntensity: .12 }), { lampX: 5.75, lampY: 7.4 });
  for (const finish of ['soot', 'limestone', 'brick', 'chalk']) textured(finish, finish, { roughness: finish === 'chalk' ? .72 : .95 });
  m.tunnel = s => m[tunnelFinish(s)];
  const walls = new Map();
  m.stationWall = st => {
    const key = st.wallStyle + st.color;
    if (!walls.has(key)) {
      const map = stationSurface(st); map.wrapS = map.wrapT = T.RepeatWrapping;
      walls.set(key, infrastructureLighting(new T.MeshStandardMaterial({ map, roughness: st.wallStyle === 'solid' ? .43 : .6 })));
    }
    return walls.get(key);
  };
  const standard = (name, color, opts = {}) => m[name] = new T.MeshStandardMaterial({ color, roughness: .72, ...opts });
  standard('dark', '#171d1e'); standard('rubber', '#232724');
  standard('railSide', '#756955', { metalness: .72, roughness: .63 });
  standard('railTop', '#a0a6a4', { metalness: .8, roughness: .37 });
  standard('railCover', '#6a6c61', { metalness: .35, roughness: .65 });
  standard('steel', '#9ca4a3', { metalness: .75, roughness: .32 });
  // Oxidised rail fasteners should not catch the bright, sharp highlights of
  // clean station steel and turn into a dotted line of lights in the distance.
  standard('railFastener', '#49463c', { metalness: .18, roughness: .94 });
  standard('seat', '#8d9d92', { metalness: .2, roughness: .48 });
  m.escalatorSteps = new T.MeshStandardMaterial({ vertexColors: true, metalness: .55, roughness: .48 });
  standard('yellow', '#c9b568', { roughness: .84 });
  standard('white', '#dfded0'); standard('bench', '#7d8982', { metalness: .65, roughness: .38 });
  standard('lamp', '#fff7da', { emissive: '#fff3d2', emissiveIntensity: 4 });
  m.tunnelLamp = filteredLampMaterial(); m.distantLamp = distantLightMaterial();
  standard('coolLamp', '#e2f1ea', { emissive: '#d9eee5', emissiveIntensity: 2.5 });
  standard('green', '#90ffc0', { emissive: '#36ff80', emissiveIntensity: 3 });
  standard('red', '#ff7765', { emissive: '#ff2109', emissiveIntensity: 4 });
  standard('glass', '#314347', { metalness: .65, roughness: .17 });
  m.palettes = new Map();
  m.palette = color => {
    if (!m.palettes.has(color)) m.palettes.set(color, infrastructureLighting(new T.MeshStandardMaterial({ color, map: m.tiles.map, roughness: .4, metalness: .08 })));
    return m.palettes.get(color);
  };
  m.signs = new Map();
  m.sign = (text, type = 'station') => {
    const key = text + type;
    if (m.signs.has(key)) return m.signs.get(key);
    const map = canvasTexture((c, w, h) => {
      c.fillStyle = type === 'led' ? '#080f11' : type === 'exit' ? '#215849' : '#1b2c30'; c.fillRect(0, 0, w, h);
      if (type === 'led') {
        c.fillStyle = '#a1b4af'; c.font = '18px monospace'; c.fillText('U8   METROPOLITAN TRANSIT', 28, 33);
        c.fillStyle = '#f5ca7c'; c.font = 'bold 43px monospace'; c.fillText('Zug fährt ein', 27, 94);
        c.fillStyle = '#687678'; c.fillRect(27, 117, 713, 1);
        c.font = '18px monospace'; c.fillStyle = '#ced5c7'; c.fillText('Bitte zurücktreten', 28, 149);
        c.fillStyle = '#040b0d4d'; for (let x = 0; x < w; x += 4) c.fillRect(x, 0, 1, h);
      } else {
        c.fillStyle = '#eef1e5'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `500 ${type === 'exit' ? 58 : 64}px Arial`;
        c.fillText(text, w / 2, h / 2, w - 50);
      }
    }, 768, 180);
    const mat = new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: type === 'led' ? .75 : .3, roughness: .6 });
    m.signs.set(key, mat); return mat;
  };
  m.posters = Array.from({ length: 6 }, (_, index) => {
    const map = canvasTexture((c, w, h) => {
      const colors = [['#ede0c4', '#a94930', '#25494c'], ['#334b59', '#f2b964', '#f0e6d2'], ['#d5d1c3', '#436357', '#e29869'], ['#b9ced0', '#234c60', '#f7ead2'], ['#d3a97e', '#6c3240', '#ebe1cc'], ['#4c5754', '#d3d998', '#ece9d8']][index];
      c.fillStyle = colors[0]; c.fillRect(0, 0, w, h);
      c.fillStyle = colors[1]; c.beginPath(); c.arc(w * .5, h * .42, w * .36, 0, 7); c.fill();
      c.fillStyle = colors[2]; c.beginPath(); c.moveTo(w * .1, h * .68); c.lineTo(w * .58, h * .22); c.lineTo(w * .92, h * .68); c.fill();
      c.fillStyle = colors[2]; c.font = 'bold 35px Arial'; c.fillText(['NACHTKLANG', 'MORGEN.', 'STADT / NATUR', 'NEUE WEGE', 'MUSEUM 08', 'RAUM FÜR DICH'][index], 24, h - 95, w - 48);
      c.font = '13px Arial'; c.fillText('KULTUR IN BEWEGUNG  /  METROPOLITAN', 26, h - 59, w - 52);
      c.fillRect(26, h - 37, w - 52, 2);
    }, 384, 576);
    return new T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .28, roughness: .45 });
  });
  m.glow = canvasTexture((c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.1, '#ffffffb0'); g.addColorStop(.3, '#ffffff20'); g.addColorStop(1, '#ffffff00'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 128, 128);
  m.shadow = canvasTexture((c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, '#0000009f'); g.addColorStop(.45, '#00000055'); g.addColorStop(1, '#00000000'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 64, 64);
  return m;
}
