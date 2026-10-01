import * as THREE from '../pinsim/three.module.min.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Each destination owns its resources. Replacing a number removes the old
// vignette entirely; the upper floor never contains thousands of hidden phones.
export function makeSubscriber(parent, profile, position, { labels = true } = {}) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), cache = new Map();
  const root = new THREE.Group(); root.userData.dynamic = true;
  const keep = g => { geometry.add(g); return g; };
  function material(colour, metalness = .1, roughness = .45, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color: colour, metalness, roughness, ...extra }); materials.add(m); return m;
  }
  const paint = material(profile.colour.hex, .12, .28), black = material('#1e2524', .05, .36);
  const metal = material('#b9c3bb', .78, .27), brass = material('#c1a268', .74, .3);
  const wood = material(profile.finish.wood, .02, .73), trim = material(profile.finish.trim, .08, .57);
  const fabric = material(profile.finish.fabric, 0, .9), cream = material('#e8dfbf', 0, .65);
  const floor = material('#414c45', .02, .86), wall = material('#b9b7a5', 0, .95);
  const glass = material('#a6d4c6', .1, .12, { transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
  const red = material('#b0553c', .15, .45);
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1)), unitBall = keep(new THREE.SphereGeometry(1, 20, 12));
  function mesh(p, g, m, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o;
  }
  function box(p, w, h, d, m, x = 0, y = 0, z = 0) { const o = mesh(p, unitBox, m, x, y, z); o.scale.set(w, h, d); return o; }
  function ball(p, w, h, d, m, x = 0, y = 0, z = 0) { const o = mesh(p, unitBall, m, x, y, z); o.scale.set(w, h, d); return o; }
  function cyl(p, r, h, m, x = 0, y = 0, z = 0, r2 = r, sides = 32) {
    const key = `c:${r}:${r2}:${h}:${sides}`;
    if (!cache.has(key)) cache.set(key, keep(new THREE.CylinderGeometry(r, r2, h, sides)));
    return mesh(p, cache.get(key), m, x, y, z);
  }
  function rounded(p, w, h, d, radius, m, x = 0, y = 0, z = 0) {
    const key = `r:${w}:${h}:${d}:${radius}`;
    if (!cache.has(key)) {
      const r = Math.min(radius, w / 2, h / 2), s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r);
      s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r);
      s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -d / 2); cache.set(key, keep(g));
    }
    return mesh(p, cache.get(key), m, x, y, z);
  }
  function tube(p, points, radius, m) {
    const g = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(16, points.length * 2), radius, 7, false));
    return mesh(p, g, m);
  }
  function plate(p, text, x, y, z, w = 1.5, h = .24, fg = '#e8dfbf', bg = '#263c32') {
    let m = cream;
    if (labels) {
      const c = document.createElement('canvas'); c.width = 512; c.height = Math.max(64, Math.min(512, Math.round(512 * h / w)));
      const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = fg; ctx.font = `bold ${Math.round(c.height * .65)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, c.height * .53, 486);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; textures.add(t);
      m = new THREE.MeshBasicMaterial({ map: t }); materials.add(m);
    }
    return mesh(p, keep(new THREE.PlaneGeometry(w, h)), m, x, y, z);
  }
  function wedge(p, w, h, d, m, x = 0, y = 0, z = 0) {
    const a = w / 2, b = d / 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-a,0,-b,a,0,-b,a,0,b,-a,0,b,-a,h,-b,a,h,-b,a,h*.3,b,-a,h*.3,b], 3));
    g.setIndex([0,1,2,0,2,3,4,6,5,4,7,6,0,5,1,0,4,5,3,6,7,3,2,6,0,7,4,0,3,7,1,6,2,1,5,6]);
    const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals(); return mesh(p, keep(flat), m, x, y, z);
  }
  function dial(p, x, y, z, tilt = .25, scale = 1) {
    const d = new THREE.Group(); d.position.set(x, y, z); d.rotation.x = tilt; d.scale.setScalar(scale); p.add(d);
    cyl(d, .63, .07, metal); cyl(d, .59, .02, cream, 0, .045);
    const s = new THREE.Shape(); s.absarc(0, 0, .55, 0, TAU, false);
    for (let n = 1; n <= 10; n++) {
      const angle = .21 + (n - 1) * Math.PI / 6, px = Math.cos(angle) * .42, pz = -Math.sin(angle) * .42;
      const hole = new THREE.Path(); hole.absarc(px, -pz, .078, 0, TAU, true); s.holes.push(hole);
      const number = plate(d, String(n % 10), px, .064, pz, .13, .13, '#27342b', '#e8dfbf'); number.rotation.x = -Math.PI / 2;
    }
    const g = keep(new THREE.ExtrudeGeometry(s, { depth: .027, bevelEnabled: false, curveSegments: 28 }));
    g.rotateX(-Math.PI / 2); mesh(d, g, metal, 0, .082);
    cyl(d, .24, .024, black, 0, .1); plate(d, profile.number, 0, .116, 0, .34, .1).rotation.x = -Math.PI / 2;
    box(d, .19, .07, .055, brass, .38, .14, .39).rotation.y = -.8;
    return d;
  }
  function keys(p, x, y, z, tilt = .3, scale = 1) {
    const k = new THREE.Group(); k.position.set(x, y, z); k.rotation.x = tilt; k.scale.setScalar(scale); p.add(k);
    box(k, .97, .05, 1.27, black);
    for (let i = 0; i < 12; i++) {
      const px = (i % 3 - 1) * .29, pz = (Math.floor(i / 3) - 1.5) * .29;
      rounded(k, .24, .07, .22, .035, cream, px, .07, pz);
      plate(k, '123456789*0#'[i], px, .165, pz, .15, .15, '#27342b', '#e8dfbf').rotation.x = -Math.PI / 2;
    }
  }
  function bells(p, x, y, z, spacing = .48) {
    for (const dx of [-spacing, spacing]) { ball(p, .35, .2, .35, metal, x + dx, y, z); cyl(p, .055, .16, brass, x + dx, y + .13, z); }
    cyl(p, .035, .28, brass, x, y - .12, z);
  }
  function receiver(p, x, y, z, { rotation = 0, yaw = 0, scale = 1, style = 'cups' } = {}) {
    const h = new THREE.Group(); h.userData.dynamic = true; h.position.set(x, y, z); h.rotation.set(0, yaw, rotation); h.scale.setScalar(scale); p.add(h);
    if (style === 'ear') {
      cyl(h, .11, .75, paint, 0, -.1); cyl(h, .19, .12, brass, 0, .3);
      ball(h, .34, .25, .3, paint, 0, -.51, .04);
      cyl(h, .26, .055, black, 0, -.52, .29).rotation.x = Math.PI / 2;
    } else if (style === 'flat') {
      rounded(h, 2.05, .20, .39, .10, paint, 0, .05);
      for (const px of [-.83, .83]) rounded(h, .48, .24, .55, .1, paint, px, -.08);
    } else {
      tube(h, [V(-.9,0,0), V(-.6,.19,0), V(0,.25,0), V(.6,.19,0), V(.9,0,0)], .13, paint);
      for (const px of [-.9, .9]) { cyl(h, .21, .26, paint, px, -.1, 0, .3); cyl(h, .3, .07, paint, px, -.25); cyl(h, .24, .014, black, px, -.3); }
    }
    return h;
  }
  function coiled(p, x, y, z, length = 1.2) {
    const points = [];
    for (let i = 0; i <= 110; i++) { const t = i / 110; points.push(V(x - Math.sin(t * Math.PI) * .2 + .06 * Math.cos(t * 32 * Math.PI), y - t * length, z + .06 * Math.sin(t * 32 * Math.PI))); }
    tube(p, points, .026, black);
  }

  // Compatible surroundings: a wall instrument never floats above a desk.
  const setting = profile.setting.id, isDesk = profile.model.mount === 'desk', isPublic = profile.model.mount === 'public';
  const tabletop = setting === 'bar' ? 5.7 : setting === 'reception' ? 5.1 : setting === 'night' ? 3.3 : setting === 'pedestal' ? 4.8 : 4.2;
  let phoneHeight = isDesk ? tabletop + .15 : 3.8;
  box(root, isPublic ? 6.8 : 8.2, .12, isPublic ? 6.3 : 6.2, floor, 0, .06, isPublic ? 1.5 : 0);
  if (isDesk) {
    const width = ['bar', 'reception', 'workbench'].includes(setting) ? 8 : setting === 'pedestal' ? 3.4 : 6.1;
    if (setting === 'cafe') {
      cyl(root, 2.8, .18, cream, 0, tabletop); cyl(root, .17, tabletop, metal, 0, tabletop / 2); cyl(root, 1.4, .13, black, 0, .2);
    } else {
      rounded(root, width, .21, 3.6, .09, setting === 'console' ? cream : wood, 0, tabletop);
      if (['night', 'cabinet', 'reception', 'bar'].includes(setting)) {
        box(root, width - .4, tabletop - .35, 3.15, wood, 0, tabletop / 2);
        for (const px of [-width / 4, width / 4]) {
          box(root, width / 2 - .4, tabletop - .75, .06, trim, px, tabletop / 2, 1.62);
          box(root, width / 2 - .57, tabletop - .92, .08, wood, px, tabletop / 2, 1.68);
          cyl(root, .07, .32, brass, px, tabletop / 2 + .2, 1.78).rotation.x = Math.PI / 2;
        }
      } else for (const px of [-width / 2 + .35, width / 2 - .35]) for (const pz of [-1.4, 1.4]) box(root, .2, tabletop, .2, setting === 'workbench' ? metal : trim, px, tabletop / 2, pz);
      if (['writing', 'night'].includes(setting)) {
        box(root, width - .6, .72, 2.9, wood, 0, tabletop - .5);
        box(root, width - .8, .05, .04, trim, 0, tabletop - .16, 1.57);
        box(root, .65, .07, .12, brass, 0, tabletop - .49, 1.61);
      }
    }
    if (setting === 'bar') {
      cyl(root, .085, 7.5, brass, 0, .75, 2.1).rotation.z = Math.PI / 2;
      cyl(root, .9, .20, fabric, 2.8, 3.6, 3.25); for (const dx of [-.55, .55]) box(root, .12, 3.5, .12, trim, 2.8 + dx, 1.75, 3.25);
      for (let i = 0; i < 3; i++) { cyl(root, .15, .7 + i * .1, fabric, -2.7 + i * .45, tabletop + .48, -1); cyl(root, .07, .25, metal, -2.7 + i * .45, tabletop + .93, -1); }
    } else if (setting === 'reception') plate(root, 'EMPFANG', 2.4, tabletop + .36, .8, 1.3, .38);
    else if (setting === 'workbench') {
      box(root, .8, .35, .9, metal, 2.7, tabletop + .25, .4); box(root, .15, .7, .75, black, 2.95, tabletop + .4, .4);
      cyl(root, .06, 1.1, metal, 2.7, tabletop + .38, 1.1).rotation.z = Math.PI / 2;
    } else if (setting !== 'pedestal') {
      if (profile.accessory === 0) {
        cyl(root, .5, .11, brass, 2, tabletop + .1, -.45); cyl(root, .06, 1.45, brass, 2, tabletop + .85, -.45);
        cyl(root, .4, .8, fabric, 2, tabletop + 1.55, -.45, .82);
      } else if (profile.accessory === 1) for (let i = 0; i < 3; i++) box(root, .95, .14, 1.35, i % 2 ? red : fabric, -2.1, tabletop + .18 + i * .15, -.2);
      else { cyl(root, .24, .52, cream, 2.1, tabletop + .36, .4); cyl(root, .19, .018, black, 2.1, tabletop + .63, .4); }
    }
  } else {
    const wallMat = setting === 'panel' ? wood : setting === 'brick' ? red : wall;
    box(root, 6.2, isPublic ? 9.3 : 8.3, .16, wallMat, 0, isPublic ? 4.65 : 4.15, -1.03);
    if (setting === 'panel') for (let x = -3; x <= 3; x += .5) box(root, .035, 8.2, .07, trim, x, 4.15, -.90);
    if (setting === 'tiles' || setting === 'brick') {
      const step = setting === 'tiles' ? .8 : .45;
      for (let y = step; y < 8.2; y += step) {
        box(root, 6.1, .025, .02, cream, 0, y, -.93);
        for (let x = -3 + (Math.round(y / step) % 2) * .55; x < 3; x += 1.1) box(root, .025, step, .02, cream, x, y - step / 2, -.93);
      }
    }
    if (isPublic) {
      const frameMat = setting === 'booth' ? paint : metal;
      if (setting === 'booth' || setting === 'kiosk') {
        for (const x of [-3.1, 3.1]) {
          for (const z of [-1.1, 4.1]) box(root, .17, 9.6, .17, frameMat, x, 4.8, z);
          box(root, .06, 7.5, 5, glass, x, 4.8, 1.5);
          for (const y of [1.1, 4.8, 8.7]) box(root, .15, .12, 5.3, frameMat, x, y, 1.5);
        }
        box(root, 6.55, .3, 5.6, frameMat, 0, 9.55, 1.5);
        box(root, 6.3, .9, .18, frameMat, 0, 8.95, 4.1); plate(root, 'TELEFON', 0, 8.97, 4.2, 4.7, .55);
        if (setting === 'booth') {
          // Open door at the side leaves the handset completely accessible.
          const door = new THREE.Group(); door.position.set(3.05, 0, 4.1); door.rotation.y = -Math.PI / 3; root.add(door);
          for (const x of [-2.95, 0]) box(door, .12, 8.4, .12, frameMat, x, 4.3, 0);
          for (const y of [.15, 4.3, 8.5]) box(door, 3.0, .12, .12, frameMat, -1.5, y, 0);
          box(door, 2.8, 8.1, .04, glass, -1.5, 4.3, 0); box(door, .1, .5, .17, metal, -2.7, 4.2, .15);
        }
      } else if (setting === 'hood') {
        for (const x of [-2.2, 2.2]) box(root, .16, 4.7, 2.7, paint, x, 5.5, .25);
        box(root, 4.6, .2, 2.8, paint, 0, 7.85, .25); plate(root, 'TELEFON', 0, 7.4, -.8, 3.5, .5);
      } else { for (const x of [-2.7, 2.7]) box(root, .25, 8.5, 1.7, trim, x, 4.25, -.2); plate(root, 'FERNSPRECHER', 0, 8.2, -.85, 3.8, .4); }
      box(root, 3.7, .14, 1.5, wood, 0, 3.1, .2);
    }
  }

  const phone = new THREE.Group(); phone.position.set(0, phoneHeight, isDesk ? 0 : -.48); root.add(phone);
  const id = profile.model.id; let handset;
  const wallIds = ['woodwall', 'walloval', 'wallflat', 'wallwedge', 'twinbell', 'industrial', 'coin', 'payphone'];
  if (wallIds.includes(id)) {
    if (id === 'woodwall') {
      rounded(phone, 2.05, 3.1, .85, .08, wood, 0, 1.2); box(phone, 1.8, 2.8, .1, trim, 0, 1.2, .49);
      box(phone, 1.65, 2.63, .08, wood, 0, 1.2, .56); bells(phone, 0, 2.48, .64);
      dial(phone, .22, .7, .69, Math.PI / 2, .83); handset = receiver(phone, -1.25, 1.8, .6, { style: 'ear' });
      plate(phone, 'TELEPHON', .1, 1.76, .62, 1.2, .21);
    } else if (id === 'walloval') {
      ball(phone, 1, 1.5, .36, paint, 0, 1.1); dial(phone, .2, .62, .38, Math.PI / 2, .88);
      handset = receiver(phone, -.76, 1.6, .49, { rotation: Math.PI / 2, scale: .9 });
    } else if (id === 'wallflat') {
      rounded(phone, 2.1, 2.65, .40, .20, paint, 0, 1.05); dial(phone, 0, .55, .27, Math.PI / 2, .92);
      handset = receiver(phone, 0, 2.05, .62, { style: 'flat' });
    } else if (id === 'wallwedge') {
      rounded(phone, 2.35, 2.4, .46, .08, paint, 0, 1.0);
      wedge(phone, 2.2, .8, 1.2, paint, 0, .08, .48); dial(phone, 0, .76, .6, .98, .91);
      handset = receiver(phone, 0, 2.0, .53);
    } else if (id === 'twinbell') {
      rounded(phone, 1.85, 2.35, .62, .16, paint, 0, .95); bells(phone, 0, 2.35, .27, .58);
      dial(phone, .2, .63, .4, Math.PI / 2, .84); handset = receiver(phone, -1.0, 1.35, .49, { rotation: Math.PI / 2, scale: .92 });
    } else if (id === 'industrial') {
      rounded(phone, 2.8, 3.15, .9, .09, paint, 0, 1.1); box(phone, 2.35, 2.7, .05, metal, 0, 1.1, .51);
      for (const x of [-1.18, 1.18]) for (const y of [-.13, 2.33]) cyl(phone, .09, .08, black, x, y, .58, .09, 6).rotation.x = Math.PI / 2;
      dial(phone, 0, .57, .61, Math.PI / 2, .93); handset = receiver(phone, 0, 1.75, .74, { style: 'flat' });
      const door = new THREE.Group(); door.position.set(-1.4, 1.1, .48); door.rotation.y = 1.15; phone.add(door);
      rounded(door, 2.8, 3.1, .12, .08, paint, -1.4); plate(door, 'FERNSPRECHER', -1.4, 0, .1, 2, .28);
    } else {
      const large = id === 'coin', w = large ? 2.2 : 1.8, h = large ? 3.5 : 2.8;
      rounded(phone, w, h, .85, large ? .08 : .26, paint, 0, 1.1); box(phone, w - .25, h - .25, .05, metal, 0, 1.1, .49);
      if (large) {
        for (const x of [-.62, 0, .62]) { box(phone, .4, .30, .08, paint, x, 2.35, .57); box(phone, .21, .045, .03, black, x, 2.35, .63); }
        dial(phone, .1, 1.03, .6, Math.PI / 2, .88);
      } else { box(phone, .46, .07, .10, black, .35, 2.18, .58); keys(phone, .1, .96, .58, Math.PI / 2, .92); }
      box(phone, .73, .29, .16, black, .2, -.03, .58); plate(phone, 'MÜNZRÜCKGABE', .15, .27, .61, 1.3, .15);
      handset = receiver(phone, -w / 2 - .23, 1.44, .61, { rotation: Math.PI / 2, style: 'flat', scale: .9 });
    }
    coiled(phone, id === 'industrial' ? -1.1 : -1.25, .9, .64, 1.5);
  } else if (id === 'candlestick' || id === 'swan' || id === 'skeleton') {
    cyl(phone, 1.12, .19, paint, 0, .10, 0, 1.22); cyl(phone, 1.04, .12, brass, 0, .23);
    if (id === 'candlestick') {
      cyl(phone, .17, 1.75, brass, 0, 1.14, -.31); cyl(phone, .26, .17, paint, 0, .45, -.31);
      cyl(phone, .39, .31, paint, 0, 2.06, -.13, .22).rotation.x = Math.PI / 2;
      cyl(phone, .31, .045, black, 0, 2.06, .05).rotation.x = Math.PI / 2;
      handset = receiver(phone, -.69, 1.8, -.1, { style: 'ear' }); dial(phone, .13, .35, .32, .33, .82);
    } else if (id === 'swan') {
      tube(phone, [V(.65,.26,-.35),V(.7,1.2,-.35),V(.28,1.95,-.35),V(-.3,2.01,-.35)], .14, brass);
      handset = receiver(phone, -.28, 2.03, -.24, { scale: .85 }); dial(phone, -.08, .39, .28, .32, .88);
    } else {
      for (const x of [-.85, .85]) tube(phone, [V(x,.25,-.34),V(x*.8,1.1,-.5),V(x*.64,1.76,-.34)], .06, brass);
      box(phone, 1.65, .11, .48, metal, 0, 1.74, -.34); bells(phone, 0, .47, .14);
      dial(phone, 0, 1.0, .1, .93, .86); handset = receiver(phone, 0, 2.02, -.29);
    }
    coiled(phone, -.96, 1.5, -.02, 1.2);
  } else if (id === 'monobloc') {
    handset = new THREE.Group(); handset.userData.dynamic = true; phone.add(handset);
    cyl(handset, .84, .20, paint, 0, .12, 0, .96);
    tube(handset, [V(0,.2,0),V(0,.8,-.2),V(0,1.46,-.32)], .32, paint);
    ball(handset, .52, .30, .56, paint, 0, 1.59, -.18);
    cyl(handset, .33, .04, black, 0, 1.55, .36).rotation.x = Math.PI / 2;
    dial(handset, 0, .36, .22, .39, .72); coiled(phone, -.7, .32, 0, .4);
  } else if (id === 'slim') {
    rounded(phone, 1.05, .28, 2.5, .14, paint, 0, .20);
    handset = receiver(phone, 0, .51, -.04, { yaw: Math.PI / 2, style: 'flat', scale: 1.08 });
    keys(handset, 0, .20, 0, 0, .65); coiled(phone, -.7, .35, -.85, .6);
  } else {
    let ry = 1.1, rz = -.56, rx = 0, yaw = 0, size = 1, dialX = 0, dialY = .58, dialZ = .27, tilt = .28, dialSize = 1;
    if (id === 'bell') { const b = cyl(phone, .86, .52, paint, 0, .33, 0, 1.16); b.scale.x = 1.2; cyl(phone, 1.13, .10, black, 0, .07).scale.x = 1.2; dialY = .65; dialZ = .1; tilt = .08; }
    if (id === 'box') { rounded(phone, 2.7, .68, 1.75, .13, paint, 0, .39); ry = 1.22; dialY = .80; tilt = 0; }
    if (id === 'compact') { wedge(phone, 2.05, .63, 1.6, paint); ry = .96; size = .86; dialSize = .81; dialY = .47; dialZ = .25; }
    if (id === 'streamline') { ball(phone, 1.5, .36, .99, paint, 0, .38); wedge(phone, 2.4, .46, 1.5, paint, 0, .12, -.18); dialY = .69; ry = 1.18; }
    if (id === 'oval') { ball(phone, 1.56, .31, 1.13, paint, 0, .35); cyl(phone, 1.05, .12, brass, 0, .08).scale.x = 1.4; dialY = .65; ry = .96; }
    if (id === 'disc') { cyl(phone, 1.4, .25, paint, 0, .19); cyl(phone, 1.35, .09, metal, 0, .045); dialY = .35; tilt = 0; ry = .8; rz = -.72; }
    if (id === 'pyramid') { cyl(phone, .72, .82, paint, 0, .48, 0, 1.6, 4).rotation.y = Math.PI / 4; dialY = .64; dialZ = .75; dialSize = .84; tilt = .92; ry = 1.36; }
    if (id === 'deco') { for (let n = 0; n < 3; n++) rounded(phone, 2.9 - n * .3, .19, 1.95 - n * .2, .07, n === 1 ? brass : paint, 0, .12 + n * .19); dialY = .67; tilt = 0; ry = 1.19; }
    if (id === 'tower') { wedge(phone, 1.75, 1.92, 1.25, paint); dialY = 1.04; dialZ = .51; tilt = 1.07; ry = 2.18; rz = -.44; size = .88; }
    if (id === 'hotel') { wedge(phone, 3.25, .77, 2.12, paint); dialX = -.55; dialY = .58; dialSize = .88; ry = 1.12; rz = -.73; for (let i = 0; i < 4; i++) rounded(phone, .32, .07, .26, .03, cream, 1.01, .59 - i * .11, -.45 + i * .38); }
    if (id === 'multiline') { wedge(phone, 3.65, .82, 2.2, paint); dialX = -.52; dialY = .62; dialSize = .87; ry = 1.3; rz = -.8; for (let i = 0; i < 5; i++) { box(phone, .27, .10, .32, i === 0 ? red : cream, -1.3 + i * .34, .35, .81); ball(phone, .06, .045, .06, cream, 1.17, .7 - i * .1, -.6 + i * .35); } }
    if (id === 'keypad') { wedge(phone, 2.3, .70, 1.98, paint); ry = 1.02; rz = -.66; keys(phone, 0, .52, .17, .31); }
    if (id === 'office') {
      wedge(phone, 3.55, .63, 2.3, paint); rx = -1.19; ry = .89; rz = 0; yaw = Math.PI / 2; size = .94;
      keys(phone, .18, .49, .16, .24, .89);
      for (let i = 0; i < 6; i++) box(phone, .3, .06, .23, cream, 1.15 + (i % 2) * .38, .59 - Math.floor(i / 2) * .07, -.4 + Math.floor(i / 2) * .38);
      plate(phone, 'FERNSPRECHER', .4, .64, -.72, 1.1, .18).rotation.x = -Math.PI / 2;
    }
    if (!['keypad', 'office'].includes(id)) dial(phone, dialX, dialY, dialZ, tilt, dialSize);
    handset = receiver(phone, rx, ry, rz, { scale: size, yaw, style: ['hotel', 'keypad', 'office'].includes(id) ? 'flat' : 'cups' });
    for (const side of [-.73, .73]) {
      const px = yaw ? rx : side * size, pz = yaw ? side * size : rz;
      box(phone, .10, .35, .15, metal, px, ry - .37, pz);
    }
    coiled(phone, -1.22, Math.min(ry, 1.2) - .1, -.30, .95);
  }
  plate(phone, profile.number, 0, isDesk ? .06 : -.52, isDesk ? 1.06 : .66, 1.25, .16);
  const connection = V(-1.2, phoneHeight + .1, phone.position.z + .1);
  tube(root, [connection, V(-1.8, phoneHeight * .55, -.5), V(-1.7, .22, -1.0)], .032, black);
  box(root, .3, .13, .3, cream, -1.7, .19, -1.0);

  // The picking surface moves with every form of receiver, including the whole
  // one-piece stand telephone. It remains unbatched and on the upper-floor layer.
  handset.updateMatrixWorld(true);
  const receiverBounds = new THREE.Box3().setFromObject(handset);
  const inverse = handset.matrixWorld.clone().invert(); receiverBounds.applyMatrix4(inverse);
  const size = receiverBounds.getSize(V(0,0,0)), center = receiverBounds.getCenter(V(0,0,0));
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false }); materials.add(hitMaterial);
  const handsetHit = box(handset, Math.max(size.x, .7), Math.max(size.y, .6), Math.max(size.z, .65), hitMaterial, ...center.toArray());
  handsetHit.userData.dynamic = true; handsetHit.userData.action = 'handset';
  const rest = handset.position.clone(), restRotation = handset.rotation.clone();

  function batch(group) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), bins = new Map(), remove = [];
    function walk(o) {
      if (o !== group && o.userData.dynamic) return;
      if (o.isMesh) {
        const key = `${o.geometry.uuid}:${o.material.uuid}`;
        if (!bins.has(key)) bins.set(key, { geometry: o.geometry, material: o.material, matrices: [] });
        bins.get(key).matrices.push(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld)); remove.push(o);
      }
      o.children.forEach(walk);
    }
    walk(group); remove.forEach(o => o.removeFromParent());
    for (const bin of bins.values()) {
      const instance = new THREE.InstancedMesh(bin.geometry, bin.material, bin.matrices.length);
      bin.matrices.forEach((m, i) => instance.setMatrixAt(i, m)); instance.instanceMatrix.needsUpdate = true; instance.computeBoundingSphere(); group.add(instance);
    }
  }
  batch(handset); batch(root);
  root.position.fromArray(position); root.rotation.y = profile.yaw; root.traverse(o => o.layers.set(1)); parent.add(root); root.updateMatrixWorld(true);
  let disposed = false;
  return {
    root, handset, handsetHit, dialHits: [], profile, pickup: 0,
    get endpoint() { return root.localToWorld(connection.clone()); },
    view(aspect = 1.3) {
      const booth = ['booth', 'kiosk'].includes(setting);
      const look = V(0, isDesk ? phoneHeight + .75 : 5.35, booth ? 1.0 : 0);
      const broadDesk = ['bar', 'reception', 'workbench'].includes(setting);
      const offset = booth ? V(4.3, 2.3, 15) : isDesk ? broadDesk ? V(3.2, 4.1, 9.4) : V(2.4, 3.9, 7.6) : V(2.7, 1.35, 8.2);
      // A narrow follow viewport needs extra room for the same physical model.
      offset.multiplyScalar(Math.max(1, 1.1 / aspect));
      return { target: root.localToWorld(look.clone()), position: root.localToWorld(look.add(offset)) };
    },
    update(up, ringing, time, dt) {
      this.pickup += ((up ? 1 : 0) - this.pickup) * (1 - Math.exp(-dt * 16));
      handset.position.copy(rest).add(V(-.2 * this.pickup, .65 * this.pickup, .38 * this.pickup));
      handset.rotation.copy(restRotation); handset.rotation.z += this.pickup * .20 + (ringing && time % 3 < 1 ? Math.sin(time * 48) * .025 : 0);
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
