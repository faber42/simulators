import * as T from '../pinsim/three.module.min.js';

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
    const base = { concrete: [112, 113, 106], floor: [142, 145, 136], tiles: [180, 184, 169], ballast: [65, 61, 54], metal: [107, 111, 107] }[kind];
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
    } else if (kind === 'concrete') {
      for (let i = 0; i < 70; i++) {
        const x = rng() * w, y = rng() * h, width = 1 + rng() * 22;
        const g = c.createLinearGradient(0, y, 0, y + 100 + rng() * 180);
        g.addColorStop(0, '#24241b28'); g.addColorStop(1, '#262b2000');
        c.fillStyle = g; c.fillRect(x, y, width, 240);
      }
      c.fillStyle = '#34372e70'; c.fillRect(0, 0, w, 3);
      for (const x of [16, 496]) for (const y of [18, 494]) { c.beginPath(); c.ellipse(x, y, 3, 3, 0, 0, 7); c.fill(); }
    }
  });
}
export function createMaterials() {
  const m = {};
  const textured = (name, kind, opts = {}) => {
    const map = surface(kind); map.wrapS = map.wrapT = T.RepeatWrapping;
    // Keep high-frequency colour grain out of the normal perturbation: it
    // shimmered under moving point lights and changed with texture mip levels.
    const bumpMap = canvasTexture((c, w, h) => { c.filter = 'blur(10px)'; c.drawImage(map.image, 0, 0, w, h); });
    bumpMap.colorSpace = T.NoColorSpace; bumpMap.wrapS = bumpMap.wrapT = T.RepeatWrapping;
    m[name] = new T.MeshStandardMaterial({ map, bumpMap, bumpScale: .012, roughness: .9, ...opts });
  };
  textured('concrete', 'concrete', { color: '#a0a498' });
  textured('floor', 'floor', { color: '#a5a69a', roughness: .66, bumpScale: .012 });
  textured('tiles', 'tiles', { color: '#c0beb0', roughness: .57, bumpScale: .006 });
  textured('ballast', 'ballast', { roughness: 1, bumpScale: .08 });
  textured('sleeper', 'concrete', { color: '#88867e' });
  textured('ceiling', 'concrete', { color: '#737871' });
  const standard = (name, color, opts = {}) => m[name] = new T.MeshStandardMaterial({ color, roughness: .72, ...opts });
  standard('dark', '#171d1e'); standard('rubber', '#232724');
  standard('railSide', '#756955', { metalness: .72, roughness: .63 });
  standard('railTop', '#a0a6a4', { metalness: .8, roughness: .37 });
  standard('railCover', '#6a6c61', { metalness: .35, roughness: .65 });
  standard('steel', '#9ca4a3', { metalness: .75, roughness: .32 });
  standard('yellow', '#c9b568', { roughness: .84 });
  standard('white', '#dfded0'); standard('bench', '#7d8982', { metalness: .65, roughness: .38 });
  standard('lamp', '#fff7da', { emissive: '#fff3d2', emissiveIntensity: 4 });
  standard('coolLamp', '#e2f1ea', { emissive: '#d9eee5', emissiveIntensity: 2.5 });
  standard('green', '#90ffc0', { emissive: '#36ff80', emissiveIntensity: 3 });
  standard('red', '#ff7765', { emissive: '#ff2109', emissiveIntensity: 4 });
  standard('glass', '#314347', { metalness: .65, roughness: .17 });
  m.palettes = new Map();
  m.palette = color => {
    if (!m.palettes.has(color)) m.palettes.set(color, new T.MeshStandardMaterial({ color, map: m.tiles.map, roughness: .4, metalness: .08 }));
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
