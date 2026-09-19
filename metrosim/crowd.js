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
      const shade = cloth ? 235 + 8 * Math.sin(x * 1.4) * Math.sin(y * 1.7) - 9 * Math.sin(y * .11 + Math.sin(x * .09) * 3) ** 10 : x > 192 ? 230 + 20 * Math.sin(x * 2.1 + Math.sin(y * .035)) : 255;
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
      uvs.push(cloth === 'hair' ? .8 + u * .19 : cloth ? .03 + (u % 1) * .43 : .62, v);
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
    const ellipsoid = (x, y, z, rx, ry, rz, b, color) => {
      const start = positions.length / 3, rows = 8, cols = 12;
      for (let j = 0; j <= rows; j++) for (let k = 0; k <= cols; k++) {
        const lat = j / rows * Math.PI, lon = k / cols * Math.PI * 2;
        const ny = Math.cos(lat), nx = Math.sin(lat) * Math.cos(lon), nz = Math.sin(lat) * Math.sin(lon);
        const vx = nx * rx, vy = ny * ry, vz = nz * rz;
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
    loft([[longCoat ? .73 : .96, .195, .113, 0], [1.02, female ? .177 : .17, .108, 0], [1.12, female ? .143 : .161, .108, 0], [1.29, .187, .127, 0], [1.355, .21, .108, 0], [1.40, .162, .09, 0], [1.435, .102, .064, 0], [1.445, .058, .049, 0]], chest, coat, true, 20, hips);
    loft([[.88, .145, .09, 0], [.94, .17, .105, 0], [1.01, .163, .11, 0]], hips, pants, true);
    loft([[1.42, .06, .052, 0], [1.49, .046, .046, 0], [1.535, .058, .046, 0]], neck, skin);
    // Chin, angular jaw, cheekbones, flatter facial plane and elongated skull.
    // The hair follows this surface instead of putting a sphere on the face.
    const headWidth = .94 + rng() * .1, jawWidth = female ? .92 : 1.05;
    const faceRings = [
      [1.516, .022, .05, -.028], [1.535, .05 * jawWidth, .075, -.041],
      [1.555, .072 * jawWidth, .079, -.056], [1.583, .081, .077, -.072],
      [1.61, .086, .084, -.085], [1.633, .087, .081, -.091],
      [1.653, .085, .079, -.094], [1.674, .083, .078, -.095],
      [1.699, .081, .075, -.093], [1.721, .078, .068, -.087],
      [1.743, .063, .052, -.07], [1.761, .039, .029, -.044],
      [1.774, .006, -.002, -.013],
    ];
    const facePoint = (y, angle, hairSurface = false) => {
      let k = 0; while (k < faceRings.length - 2 && faceRings[k + 1][0] < y) k++;
      const a = faceRings[k], b = faceRings[k + 1], t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
      const w = T.MathUtils.lerp(a[1], b[1], t) * headWidth, front = T.MathUtils.lerp(a[2], b[2], t), back = T.MathUtils.lerp(a[3], b[3], t);
      const cos = Math.cos(angle), x = Math.sin(angle) * (w + (hairSurface ? .004 : 0));
      let z = cos >= 0 ? front * cos ** .22 : back * (-cos) ** .7;
      if (cos > 0 && !hairSurface) {
        const nose = .03 * Math.exp(-((x / .013) ** 2) - ((y - 1.634) / .027) ** 2);
        const socket = .008 * Math.exp(-(((Math.abs(x) - .032) / .018) ** 2) - ((y - 1.663) / .013) ** 2);
        const lip = .004 * Math.exp(-((x / .025) ** 2) - ((y - 1.578) / .009) ** 2);
        z += nose - socket + lip;
      }
      return [x, y, z + (hairSurface ? cos * .004 : 0)];
    };
    const headSurface = hairSurface => {
      const start = positions.length / 3, rows = hairSurface ? 10 : faceRings.length - 1, cols = 40;
      for (let j = 0; j <= rows; j++) for (let k = 0; k <= cols; k++) {
        const angle = k / cols * Math.PI * 2, front = Math.cos(angle);
        const hairline = front > .1 ? 1.709 + .006 * Math.sin(angle * 3) : 1.594 + .05 * Math.abs(Math.sin(angle));
        const y = hairSurface ? T.MathUtils.lerp(hairline, 1.774, j / rows) : faceRings[j][0];
        const p = facePoint(y, angle, hairSurface);
        const shade = !hairSurface && front > .5 && y < 1.555 ? skin.clone().multiplyScalar(.94) : hairSurface ? hair : skin;
        vertex(...p, head, shade, k / cols, j / rows, hairSurface ? 'hair' : false);
      }
      for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
        const a = start + j * (cols + 1) + k, b = a + cols + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    };
    headSurface(false); headSurface(true);
    if (female && rng() > .35) loft([[1.4, .06, .032, 0, -.071], [1.52, .094, .046, 0, -.06], [1.65, .085, .043, 0, -.053]], head, hair, 'hair');
    for (const side of [-1, 1]) {
      ellipsoid(side * .086 * headWidth, 1.631, -.002, .008, .02, .012, head, skin);
      ellipsoid(side * .032, 1.664, .073, .012, .0035, .003, head, skin.clone().lerp(new T.Color('#f1e9dd'), .18));
      ellipsoid(side * .032, 1.664, .076, .0034, .0031, .002, head, eye);
      block(side * .032, 1.678, .077, .026, .003, .004, head, hair);
    }
    ellipsoid(0, 1.579, .081, .023, .002, .002, head, skin.clone().multiplyScalar(.75));
    // Jacket seams, collars, pockets and restrained fabric creases.
    const seam = coat.clone().multiplyScalar(.58);
    block(0, 1.215, .127, .009, .39, .006, chest, seam);
    for (const side of [-1, 1]) { block(side * .095, 1.083, .115, .064, .012, .01, chest, seam); block(side * .04, 1.407, .067, .047, .053, .021, chest, coat.clone().multiplyScalar(.81)); }
    const shirt = new T.Color(['#adaba0', '#65767b', '#aaa29b', '#47595e'][Math.floor(rng() * 4)]);
    const lapel = coat.clone().multiplyScalar(.86);
    const clothPatch = (points, color) => {
      const start = positions.length / 3;
      points.forEach(([x, y, z], i) => vertex(x, y, z, chest, color, i / points.length, y, true));
      for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
    };
    clothPatch([[-.052, 1.422, .075], [-.061, 1.332, .124], [0, 1.236, .134], [.061, 1.332, .124], [.052, 1.422, .075]], shirt);
    for (const side of [-1, 1]) {
      const points = [[side * .052, 1.422, .079], [side * .102, 1.376, .106], [side * .079, 1.323, .13], [0, 1.236, .139]];
      clothPatch(side < 0 ? points : points.reverse(), lapel);
    }
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const x = side * .092;
      const thigh = bone(hips, x, 0, 0), knee = bone(thigh, 0, -.43, 0), ankle = bone(knee, 0, -.43, 0);
      loft([[.49, .061, .067, x], [.58, .071, .076, x], [.76, .09, .092, x], [.94, .096, .102, x]], thigh, pants, true, 14, hips);
      loft([[.105, .05, .057, x], [.22, .057, .062, x], [.365, .071, .073, x, -.009], [.51, .062, .067, x]], knee, pants, true, 14, thigh);
      loft([[.01, .062, .126, x, .035], [.035, .066, .13, x, .037], [.071, .062, .117, x, .028], [.105, .042, .062, x, -.004]], ankle, shoe, false);
      block(x, .034, .043, .121, .012, .219, ankle, new T.Color('#3b3d39'));
      const shoulder = bone(chest, side * .207, .13, 0), elbow = bone(shoulder, side * .027, -.3, 0), wrist = bone(elbow, side * .01, -.267, 0);
      loft([[1.069, .051, .055, side * .234], [1.18, .058, .067, side * .224], [1.31, .069, .072, side * .214], [1.367, .057, .057, side * .205], [1.395, .026, .032, side * .196], [1.4, .008, .009, side * .19]], shoulder, coat, true, 14, chest);
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
