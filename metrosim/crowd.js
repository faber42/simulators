import * as T from '../pinsim/three.module.min.js';

// One skinned draw per passenger. The body is built from shaped cross sections,
// not scaled cylinders; colour, tailoring and facial features share one mesh.
export class Crowd {
  constructor() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d'), pixels = c.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const cloth = x < 128;
      const shade = cloth ? 235 + 8 * Math.sin(x * 1.4) * Math.sin(y * 1.7) - 9 * Math.sin(y * .11 + Math.sin(x * .09) * 3) ** 10 : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade; pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4;
    this.material = new T.MeshStandardMaterial({ map, vertexColors: true, roughness: .81 });
  }
  create(rng) {
    const bones = [], positions = [], colors = [], uvs = [], indices = [], skinIndices = [], weights = [];
    const bone = (parent, x, y, z) => { const b = new T.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); bones.push(b); b.userData.index = bones.length - 1; return b; };
    const root = bone(null, 0, 0, 0), hips = bone(root, 0, .94, 0), chest = bone(hips, 0, .31, 0), neck = bone(chest, 0, .205, 0), head = bone(neck, 0, .135, 0);
    const female = rng() > .56, longCoat = rng() > .65, phone = rng() > .66;
    const coat = new T.Color(['#26323c', '#766c5f', '#aea394', '#435263', '#303e35', '#75443d', '#343034', '#6f725d'][Math.floor(rng() * 8)]);
    const pants = new T.Color(['#28303a', '#363634', '#535b61', '#343b4c'][Math.floor(rng() * 4)]);
    const skin = new T.Color(['#b8896c', '#8d644d', '#c6a184', '#654934', '#d2b49b'][Math.floor(rng() * 5)]);
    const hair = new T.Color(['#25231f', '#4f4437', '#222224', '#84817a', '#9b8564'][Math.floor(rng() * 5)]);
    const shoe = new T.Color('#222728'), eye = new T.Color('#29271f');
    const vertex = (x, y, z, b, color, u = 0, v = 0, cloth = false, secondary = b, blend = 0) => {
      positions.push(x, y, z); colors.push(color.r, color.g, color.b);
      uvs.push(cloth ? .03 + (u % 1) * .43 : .77, v);
      skinIndices.push(b.userData.index, secondary.userData.index, 0, 0); weights.push(1 - blend, blend, 0, 0);
    };
    // Rings [y, halfWidth, halfDepth, centreX, centreZ]. Caps overlap naturally
    // at joints, while adjacent bones share weights around knees and elbows.
    const loft = (rings, b, color, cloth = false, segments = 16, parent = b) => {
      const start = positions.length / 3;
      rings.forEach((r, j) => {
        for (let k = 0; k <= segments; k++) {
          const a = k / segments * Math.PI * 2;
          const wrinkle = cloth ? 1 + .012 * Math.sin(a * 5 + j * 2) : 1;
          const blend = parent !== b && j === rings.length - 1 ? .2 : 0;
          vertex(r[3] + Math.cos(a) * r[1] * wrinkle, r[0], (r[4] || 0) + Math.sin(a) * r[2], b, color, k / segments, j / rings.length, cloth, parent, blend);
        }
      });
      for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < segments; k++) {
        const a = start + j * (segments + 1) + k, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    };
    const ellipsoid = (x, y, z, rx, ry, rz, b, color, facial = false, cap = false) => {
      const start = positions.length / 3, rows = facial ? 18 : 8, cols = facial ? 24 : 12;
      for (let j = 0; j <= rows; j++) for (let k = 0; k <= cols; k++) {
        const lat = j / rows * Math.PI, lon = k / cols * Math.PI * 2;
        const ny = Math.cos(lat), nx = Math.sin(lat) * Math.cos(lon), nz = Math.sin(lat) * Math.sin(lon);
        let vx = nx * rx, vy = ny * ry, vz = nz * rz;
        if (facial) {
          vx *= ny < -.15 ? .76 + (ny + 1) * .27 : 1;
          if (nz > 0) {
            const nose = .024 * Math.exp(-((vx / .013) ** 2) - ((vy + .015) / .037) ** 2);
            const sockets = .008 * Math.exp(-(((Math.abs(vx) - .036) / .019) ** 2) - ((vy - .025) / .012) ** 2);
            vz += nose - sockets;
          }
        }
        if (cap && ny < (nz > .15 ? .32 : -.45)) vy = (nz > .15 ? .32 : -.45) * ry;
        vertex(x + vx, y + vy, z + vz, b, color, .5, .5);
      }
      for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
        const a = start + j * (cols + 1) + k, b = a + cols + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    };
    const block = (x, y, z, w, h, d, b, color) => {
      const g = new T.BoxGeometry(w, h, d), start = positions.length / 3;
      for (let i = 0; i < g.attributes.position.count; i++) vertex(x + g.attributes.position.getX(i), y + g.attributes.position.getY(i), z + g.attributes.position.getZ(i), b, color);
      for (const index of g.index.array) indices.push(start + index); g.dispose();
    };
    // Tailored jacket/coat: hips, waist, ribs, shoulders and sloping collar.
    loft([[longCoat ? .73 : .96, .195, .113, 0], [1.02, female ? .177 : .17, .108, 0], [1.12, female ? .143 : .161, .108, 0], [1.29, .187, .127, 0], [1.39, .213, .105, 0], [1.435, .124, .075, 0], [1.445, .062, .055, 0]], chest, coat, true, 20, hips);
    loft([[.88, .145, .09, 0], [.94, .17, .105, 0], [1.01, .163, .11, 0]], hips, pants, true);
    loft([[1.42, .06, .052, 0], [1.49, .046, .046, 0], [1.535, .058, .046, 0]], neck, skin);
    ellipsoid(0, 1.638, 0, .093, .128, .094, head, skin, true);
    ellipsoid(0, 1.654, -.009, .096, .123, .096, head, hair, false, true);
    if (female && rng() > .35) loft([[1.4, .074, .035, 0, -.071], [1.52, .105, .051, 0, -.055], [1.64, .093, .051, 0, -.045]], head, hair);
    for (const side of [-1, 1]) {
      ellipsoid(side * .093, 1.631, -.002, .009, .022, .015, head, skin);
      ellipsoid(side * .034, 1.665, .083, .016, .005, .005, head, skin.clone().lerp(new T.Color('#f1e9dd'), .45));
      ellipsoid(side * .034, 1.665, .088, .005, .0044, .003, head, eye);
      block(side * .034, 1.676, .083, .026, .003, .005, head, hair);
    }
    ellipsoid(0, 1.601, .087, .026, .0032, .004, head, skin.clone().multiplyScalar(.69));
    // Jacket seams, collars, pockets and restrained fabric creases.
    const seam = coat.clone().multiplyScalar(.58);
    block(0, 1.215, .127, .009, .39, .006, chest, seam);
    for (const side of [-1, 1]) { block(side * .095, 1.083, .115, .064, .012, .01, chest, seam); block(side * .04, 1.407, .067, .047, .053, .021, chest, coat.clone().multiplyScalar(.81)); }
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const x = side * .092;
      const thigh = bone(hips, x, 0, 0), knee = bone(thigh, 0, -.43, 0), ankle = bone(knee, 0, -.43, 0);
      loft([[.49, .061, .067, x], [.58, .071, .076, x], [.76, .09, .092, x], [.94, .096, .102, x]], thigh, pants, true, 14, hips);
      loft([[.105, .05, .057, x], [.22, .057, .062, x], [.365, .071, .073, x, -.009], [.51, .062, .067, x]], knee, pants, true, 14, thigh);
      loft([[.01, .062, .126, x, .035], [.035, .066, .13, x, .037], [.071, .062, .117, x, .028], [.105, .042, .062, x, -.004]], ankle, shoe, false);
      block(x, .034, .043, .121, .012, .219, ankle, new T.Color('#3b3d39'));
      const shoulder = bone(chest, side * .207, .13, 0), elbow = bone(shoulder, side * .027, -.3, 0), wrist = bone(elbow, side * .01, -.267, 0);
      loft([[1.069, .051, .055, side * .234], [1.18, .058, .067, side * .224], [1.3, .069, .074, side * .214], [1.405, .066, .065, side * .203]], shoulder, coat, true, 14, chest);
      loft([[.81, .038, .044, side * .244], [.92, .046, .052, side * .239], [1.08, .052, .057, side * .234]], elbow, coat, true, 14, shoulder);
      ellipsoid(side * .244, .772, .006, .029, .055, .017, wrist, skin);
      ellipsoid(side * .218, .782, .016, .012, .026, .012, wrist, skin);
      if (side === 1 && phone) block(.244, .748, .026, .064, .111, .008, wrist, new T.Color('#161b20'));
      legs.push({ pivot: thigh, shin: knee }); arms.push({ pivot: shoulder, forearm: elbow });
    }
    if (rng() > .4) {
      const bag = new T.Color(['#343c3c', '#615140', '#424c58'][Math.floor(rng() * 3)]);
      loft([[1.01, .115, .072, 0, -.16], [1.09, .131, .085, 0, -.17], [1.3, .119, .071, 0, -.155], [1.35, .078, .044, 0, -.142]], chest, bag, true);
      for (const side of [-1, 1]) block(side * .11, 1.253, .118, .026, .27, .015, chest, bag);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndices, 4)); geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const mesh = new T.SkinnedMesh(geometry, this.material), person = new T.Group();
    mesh.add(root); person.add(mesh); mesh.bind(new T.Skeleton(bones));
    mesh.boundingSphere = new T.Sphere(new T.Vector3(0, .9, 0), 1.35);
    if (phone) { arms[1].pivot.rotation.x = -.35; arms[1].forearm.rotation.x = -1.26; head.rotation.x = .09; }
    return { person, body: hips, hipHeight: .94, head, legs, arms, phone, height: .93 + rng() * .13 };
  }
}
