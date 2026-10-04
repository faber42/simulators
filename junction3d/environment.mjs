import { createStreetLighting } from './street-lighting.mjs';
import { SURFACE_HEIGHTS, surfaceMaterialOptions } from './surface-layers.mjs';

/**
 * Reusable, procedural streetscape. All positions are metres: x east, y up,
 * z south. Geographic placement lives in the intersection configuration.
 * No map imagery, external textures, network requests, or global THREE state.
 */
export function buildEnvironment(THREE, scene, config) {
  const env = config.environment || {};
  const root = new THREE.Group();
  root.name = 'Streetscape';
  scene.add(root);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const streetLighting = createStreetLighting(THREE, env);
  const streetLampMaterials = new Map();
  let lampHalos = null;
  let seed = env.seed ?? 21783;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const keepGeometry = geometry => (geometries.add(geometry), geometry);
  const material = (color, options = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: 0.83, ...options });
    materials.add(result);
    return result;
  };
  const unitBox = keepGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitCylinder = keepGeometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const crownGeometry = keepGeometry(new THREE.IcosahedronGeometry(1, 2));
  // Shared irregular silhouette: coordinate noise keeps duplicated seam vertices
  // together, while avoiding the identical, polished spheres of toy foliage.
  const crownPositions = crownGeometry.attributes.position;
  for (let i = 0; i < crownPositions.count; i++) {
    const x = crownPositions.getX(i), y = crownPositions.getY(i), z = crownPositions.getZ(i);
    const radius = 1 + Math.sin(x * 18 + y * 13) * Math.sin(z * 19 - x * 7) * 0.075
      + Math.sin(x * 31 - y * 23 + z * 17) * 0.04;
    crownPositions.setXYZ(i, x * radius, y * radius, z * radius);
  }
  crownPositions.needsUpdate = true;
  crownGeometry.computeBoundingSphere();
  const metal = material('#647276', { metalness: 0.62, roughness: 0.44 });
  const darkMetal = material('#3c4749', { metalness: 0.5, roughness: 0.5 });
  const concrete = material('#b6b4a9');
  const paleConcrete = material('#d5d1c2');
  const pavement = material('#aaa79a');
  // Surface-only materials: architectural pavement also appears on platforms
  // and steps, which must retain their ordinary, unbiased object depth.
  const groundPavement = material('#aaa79a', surfaceMaterialOptions('paving'));
  const roofMaterial = material('#657273');
  const rubber = material('#252c2b');
  const wood = material('#a58d66');
  const glass = material('#68919a', {
    metalness: 0.35, roughness: 0.24, transparent: true, opacity: 0.42,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const glassOpaque = material('#536c76', { metalness: 0.36, roughness: 0.24 });
  const warmWhite = material('#f0e5c5', { emissive: '#c1b88f', emissiveIntensity: 0.16 });
  const facadeGlass = material('#ffffff', { roughness: 0.29, metalness: 0.28 });
  const litFacadeGlass = material('#ffffff', { roughness: 0.29, metalness: 0.28,
    emissive: '#efc48b', emissiveIntensity: 0 });
  const foliageTexture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dedfd5';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7200; i++) {
      const value = 118 + Math.floor(random() * 126);
      ctx.fillStyle = `rgb(${value},${Math.min(255, value + 8)},${Math.max(0, value - 10)})`;
      ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 2);
    }
  });
  foliageTexture.wrapS = foliageTexture.wrapT = THREE.RepeatWrapping;
  foliageTexture.repeat.set(3, 2);
  const foliageMaterial = material('#ffffff', { map: foliageTexture, roughness: 1 });
  const masonryTexture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f0efe9';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8000; i++) {
      const value = 218 + Math.floor(random() * 36);
      ctx.fillStyle = `rgb(${value},${value},${value - 3})`;
      ctx.fillRect(random() * w, random() * h, 1, 1);
    }
    ctx.fillStyle = '#dadbd5';
    [0, 64, 128, 192].forEach(x => ctx.fillRect(x, 0, 0.7, h));
    [0, 64, 128, 192].forEach(y => ctx.fillRect(0, y, w, 0.7));
  });
  masonryTexture.wrapS = masonryTexture.wrapT = THREE.RepeatWrapping;
  masonryTexture.repeat.set(3, 3);

  function box(parent, size, position, mat, castShadow = true) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent, radius, height, position, mat, topRadius = radius) {
    const geometry = topRadius === radius ? unitCylinder
      : keepGeometry(new THREE.CylinderGeometry(topRadius / radius, 1, 1, 10));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.scale.set(radius, height, radius);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function segment(parent, a, b, width, height, mat, top = SURFACE_HEIGHTS.paving) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mesh = box(parent, [width, height, length],
      [(a[0] + b[0]) / 2, top - height / 2, (a[1] + b[1]) / 2], mat, false);
    mesh.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return mesh;
  }

  function pathNetwork(parent, paths, mat) {
    // Subtract previous convex strips from each new strip. Park footways thus
    // form one continuous, flat surface without duplicate faces at crossings.
    const rectangles = paths.map(({ a, b, width }) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / length * width / 2, nz = (b[0] - a[0]) / length * width / 2;
      return [[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz],
        [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]];
    });
    function split(polygon, a, b, keepInside) {
      const result = [], distance = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = distance(p), dq = distance(q);
        const inside = keepInside ? dp >= 0 : dp <= 0, nextInside = keepInside ? dq >= 0 : dq <= 0;
        if (inside) result.push(p);
        if (inside !== nextInside) {
          const t = dp / (dp - dq);
          result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
      return result;
    }
    function subtract(polygon, clip) {
      const outside = []; let remaining = polygon;
      for (let i = 0; i < clip.length && remaining.length >= 3; i++) {
        const a = clip[i], b = clip[(i + 1) % clip.length], piece = split(remaining, a, b, false);
        if (piece.length >= 3) outside.push(piece);
        remaining = split(remaining, a, b, true);
      }
      return outside;
    }
    rectangles.forEach((rectangle, index) => {
      let pieces = [rectangle];
      for (let previous = 0; previous < index; previous++) pieces = pieces.flatMap(piece => subtract(piece, rectangles[previous]));
      for (const points of pieces) {
        const shape = new THREE.Shape();
        points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
        const geometry = keepGeometry(new THREE.ShapeGeometry(shape)); geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, mat); mesh.position.y = SURFACE_HEIGHTS.paving;
        mesh.receiveShadow = true; parent.add(mesh);
      }
    });
  }

  function line3(parent, start, end, radius, mat) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const mesh = cylinder(parent, radius, a.distanceTo(b),
      a.clone().add(b).multiplyScalar(0.5).toArray(), mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return mesh;
  }

  function groupAt({ x = 0, z = 0, rotation = 0 }, name) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    group.name = name;
    root.add(group);
    return group;
  }

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.add(texture);
    return texture;
  }

  function sign(parent, text, size, position, options = {}) {
    const lines = Array.isArray(text) ? text : [text];
    const texture = canvasTexture(1024, Math.max(128, 128 * lines.length), (ctx, w, h) => {
      ctx.fillStyle = options.background || '#f0f1e8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = options.border || options.background || '#f0f1e8';
      ctx.lineWidth = 12;
      ctx.strokeRect(9, 9, w - 18, h - 18);
      ctx.fillStyle = options.color || '#324447';
      ctx.font = `600 ${Math.min(78, 780 / Math.max(...lines.map(line => line.length)) * 1.55)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, index) => ctx.fillText(line, w / 2, h * (index + 0.5) / lines.length, w - 45));
    });
    const mat = material('#ffffff', { map: texture, roughness: 0.65 });
    const back = box(parent, [size[0] + 0.08, size[1] + 0.08, 0.09], position, darkMetal);
    const face = new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(...size)), mat);
    face.position.set(position[0], position[1], position[2] + 0.051);
    parent.add(face);
    return { back, face };
  }

  function instances(parent, geometry, mat, values) {
    if (!values.length) return;
    const mesh = new THREE.InstancedMesh(geometry, mat, values.length);
    const transform = new THREE.Object3D();
    values.forEach((value, index) => {
      transform.position.set(...value.position);
      transform.scale.set(...value.scale);
      transform.rotation.set(...(value.rotation || [0, 0, 0]));
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      if (value.color) mesh.setColorAt(index, new THREE.Color(value.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
    return mesh;
  }

  function buildBuilding(spec) {
    const { width: w, depth: d, height: h, style = 'office' } = spec;
    if (!(w > 0 && d > 0 && h > 0)) return;
    const group = groupAt(spec, spec.id || spec.label || 'Building');
    const isGlass = style === 'glass';
    const isMuseum = style === 'museum';
    const isResidence = style === 'residential';
    const isShowroom = style === 'showroom';
    const isGrid = style === 'grid';
    const body = material(spec.color || (isGlass ? '#647b80' : isMuseum ? '#c2beb0' : '#d3d3c7'),
      isGlass ? {} : { map: masonryTexture });
    box(group, [w + 1.6, 0.24, d + 1.6], [0, 0.12, 0], pavement, false);
    const bow = isGlass ? Math.min(d * 0.11, 4.5) : 0;
    if (isGlass) {
      const footprint = new THREE.Shape();
      footprint.moveTo(-w / 2, d / 2);
      footprint.lineTo(w / 2, d / 2);
      footprint.lineTo(w / 2, -d / 2);
      for (let step = 19; step >= 0; step--) {
        const u = step / 20;
        footprint.lineTo(-w / 2 + w * u, -d / 2 - Math.sin(u * Math.PI) * bow);
      }
      footprint.closePath();
      [[h, 0.25, body], [0.24, h + 0.25, paleConcrete], [0.08, h + 0.49, roofMaterial]].forEach(([depth, y, mat]) => {
        const geometry = keepGeometry(new THREE.ExtrudeGeometry(footprint, { depth, bevelEnabled: false, steps: 1 }));
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.y = y;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
    } else {
      box(group, [w, h, d], [0, h / 2 + 0.25, 0], body);
      box(group, [w + 0.28, 0.24, d + 0.28], [0, h + 0.32, 0], paleConcrete);
      box(group, [w - 0.7, 0.16, d - 0.7], [0, h + 0.48, 0], roofMaterial, false);
    }
    const floors = Math.max(1, spec.floors || Math.floor(h / (isMuseum ? 4.1 : 3.25)));
    const floorHeight = h / floors;
    const windowValues = [];
    const sillValues = [];
    const facade = (length, outwardZ, rotated) => {
      const columns = Math.max(1, Math.floor((length - 2) / (isGlass || isShowroom ? 3.2 : 2.55)));
      const spacing = (length - 1.2) / columns;
      for (let floor = 0; floor < floors; floor++) {
        for (let col = 0; col < columns; col++) {
          const horizontal = -length / 2 + 0.6 + spacing * (col + 0.5);
          const y = 0.25 + floorHeight * (floor + 0.5);
          const width = spacing * (isGlass || isShowroom ? 0.91 : isGrid ? .79 : 0.6);
          const height = floorHeight * (isGlass || isShowroom ? 0.87 : isGrid ? .89 : 0.61);
          const position = rotated ? [outwardZ, y, horizontal] : [horizontal, y, outwardZ];
          const scale = rotated ? [0.1, height, width] : [width, height, 0.1];
          const shades = spec.windowColors || (isGlass ? ['#486a77', '#5a7d88', '#739099', '#4b6b76', '#6b8993']
            : ['#4b5d62', '#5c6e73', '#758180', '#46585f', '#98a39c']);
          windowValues.push({ position, scale, color: shades[Math.floor(random() * shades.length)] });
          if (!isGlass && !isGrid) {
            sillValues.push({
              position: rotated ? [outwardZ, y - height / 2 - 0.05, horizontal]
                : [horizontal, y - height / 2 - 0.05, outwardZ],
              scale: rotated ? [0.23, 0.11, width + 0.2] : [width + 0.2, 0.11, 0.23],
            });
          }
        }
      }
      if (isGlass || isGrid) {
        for (let floor = 1; floor < floors; floor++) {
          box(group, rotated ? [0.2, 0.17, length] : [length, 0.17, 0.2],
            rotated ? [outwardZ, floor * floorHeight + 0.25, 0] : [0, floor * floorHeight + 0.25, outwardZ],
            paleConcrete);
        }
        for (let col = 0; col <= columns; col++) {
          const offset = -length / 2 + 0.6 + spacing * col;
          box(group, rotated ? [0.2, h, 0.14] : [0.14, h, 0.2],
            rotated ? [outwardZ, h / 2 + 0.25, offset] : [offset, h / 2 + 0.25, outwardZ],
            paleConcrete);
        }
      }
    };
    if (isGlass) {
      const panels = Math.max(5, Math.round(w / 2.7));
      const facadePoint = u => [-w / 2 + w * u, d / 2 + Math.sin(u * Math.PI) * bow + 0.065];
      for (let panel = 0; panel < panels; panel++) {
        const a = facadePoint(panel / panels);
        const b = facadePoint((panel + 1) / panels);
        const x = (a[0] + b[0]) / 2;
        const z = (a[1] + b[1]) / 2;
        const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const rotation = [0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0];
        const mullion = box(group, [0.13, h, 0.2], [a[0], h / 2 + 0.25, a[1]], paleConcrete);
        mullion.rotation.y = rotation[1];
        for (let floor = 0; floor < floors; floor++) {
          windowValues.push({ position: [x, 0.25 + floorHeight * (floor + 0.5), z],
            scale: [width - 0.1, floorHeight * 0.89, 0.1], rotation,
            color: ['#526f7b', '#6b8790', '#567885'][Math.floor(random() * 3)] });
          const slab = box(group, [width + 0.05, 0.16, 0.24], [x, floor * floorHeight + 0.25, z], paleConcrete);
          slab.rotation.y = rotation[1];
        }
      }
    } else facade(w, d / 2 + 0.06, false);
    facade(w, -d / 2 - 0.06, false);
    facade(d, w / 2 + 0.06, true);
    facade(d, -w / 2 - 0.06, true);
    // A stable subset of occupied rooms glows after dusk. Split the existing
    // instances, preserving geometry, daytime colours and the random layout.
    const occupied = index => (index * 7 + Math.floor(index / 11)) % 9 < 3;
    instances(group, unitBox, facadeGlass, windowValues.filter((_, index) => !occupied(index)));
    instances(group, unitBox, litFacadeGlass, windowValues.filter((_, index) => occupied(index)));
    instances(group, unitBox, paleConcrete, sillValues);

    if (isResidence) {
      // Repeated projecting balconies and parapets distinguish housing from
      // the office blocks without requiring a location-specific model.
      for (let floor = 1; floor < floors; floor++) for (let x = -w / 2 + 5; x < w / 2 - 3; x += 7.8) {
        const y = .25 + floor * floorHeight;
        box(group, [3.55, .16, 1.9], [x, y + .05, d / 2 + .86], paleConcrete);
        box(group, [3.5, .83, .11], [x, y + .57, d / 2 + 1.72], concrete);
        [-1.69, 1.69].forEach(side => box(group, [.1, .83, 1.7], [x + side, y + .57, d / 2 + .86], concrete));
        line3(group, [x - 1.77, y + 1.03, d / 2 + 1.74], [x + 1.77, y + 1.03, d / 2 + 1.74], .026, metal);
      }
    }

    // A rounded stair tower and glazed entrance give the office its recognizable silhouette.
    if (isGlass) {
      const radius = Math.min(3.4, w * 0.1);
      cylinder(group, radius, h + 2.4, [w * 0.28, h / 2 + 1.2, d / 2 + bow * 0.5], paleConcrete);
      for (let k = -2; k <= 2; k++) {
        box(group, [0.07, h + 2.4, 0.12], [w * 0.28 + k * radius * 0.32, h / 2 + 1.2, d / 2 + bow * 0.5 + radius * 0.87], metal);
      }
    }
    const entranceWidth = Math.min(6.2, w * 0.23);
    box(group, [entranceWidth, 3.1, 0.15], [0, 1.7, d / 2 + bow + 0.15], glassOpaque);
    box(group, [0.1, 3.1, 0.2], [0, 1.7, d / 2 + bow + 0.25], metal);
    box(group, [entranceWidth + 1.5, 0.25, 2.3], [0, 3.5, d / 2 + bow + 0.95], isMuseum ? darkMetal : paleConcrete);
    if (spec.label) sign(group, spec.label, [Math.min(w * 0.7, 19), isMuseum ? 1.5 : 0.95],
      [0, spec.labelHeight ?? (isMuseum ? Math.min(h - 1.5, 7.2) : isShowroom ? h - .7 : 4.65), d / 2 + bow + 0.13],
      isMuseum ? { background: '#292f2e', color: '#eeeeea' } : {});

    const equipmentCount = Math.max(1, Math.floor(w * d / 440));
    for (let i = 0; i < equipmentCount; i++) {
      const x = (random() - 0.5) * w * 0.67;
      const z = (random() - 0.5) * d * 0.67;
      box(group, [3.2, 1.1, 2.2], [x, h + 1.05, z], metal);
      cylinder(group, 0.63, 0.18, [x - 0.74, h + 1.69, z], darkMetal);
      cylinder(group, 0.63, 0.18, [x + 0.74, h + 1.69, z], darkMetal);
    }
    if (h > 20) {
      cylinder(group, 0.045, 4.8, [w * 0.24, h + 2.8, -d * 0.24], metal);
      line3(group, [w * 0.24 - 0.8, h + 4.3, -d * 0.24], [w * 0.24 + 0.8, h + 4.3, -d * 0.24], 0.023, metal);
    }
  }

  function bench(parent, x, z, rotation = 0, elevation = 0) {
    const group = new THREE.Group();
    group.position.set(x, elevation, z);
    group.rotation.y = rotation;
    parent.add(group);
    for (let s = 0; s < 4; s++) box(group, [2.4, 0.07, 0.1], [0, 0.58, s * 0.14], wood);
    for (let s = 0; s < 3; s++) box(group, [2.4, 0.12, 0.08], [0, 0.87 + s * 0.16, 0.48], wood);
    [-0.85, 0.85].forEach(x => {
      box(group, [0.08, 0.58, 0.08], [x, 0.3, 0.1], darkMetal);
      box(group, [0.08, 1.15, 0.08], [x, 0.58, 0.48], darkMetal);
    });
  }

  function buildSurfacePatch(spec) {
    if (!spec.points?.length) return;
    const shape = new THREE.Shape();
    spec.points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
    const geometry = keepGeometry(new THREE.ShapeGeometry(shape)); geometry.rotateX(-Math.PI / 2);
    const layer = spec.surface === 'grass' ? 'grass' : 'paving';
    let pattern;
    if (spec.pattern === 'hex') {
      pattern = canvasTexture(384, 444, (ctx, w, h) => {
        ctx.fillStyle = '#c0bfb2'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#8e9188'; ctx.lineWidth = 3;
        const radius = 32, rise = Math.sqrt(3) * radius;
        for (let col = -1; col <= 9; col++) for (let row = -1; row <= 9; row++) {
          const x = col * radius * 1.5, y = (row + (col % 2) / 2) * rise;
          ctx.beginPath();
          for (let corner = 0; corner < 6; corner++) {
            const angle = corner * Math.PI / 3;
            const px = x + Math.cos(angle) * (radius - 2), py = y + Math.sin(angle) * (radius - 2);
            if (corner) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      });
      pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping;
      pattern.repeat.set(.08, .08);
    }
    const mat = material(spec.color || '#b5aea1', { ...surfaceMaterialOptions(layer),
      ...(layer === 'grass' ? { map: foliageTexture } : pattern ? { map: pattern } : {}) });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.y = spec.height ?? SURFACE_HEIGHTS[layer]; mesh.receiveShadow = true;
    mesh.name = spec.id || 'Surface landscaping'; root.add(mesh);
    if (spec.curb) for (let index = 0; index < spec.points.length; index++) {
      segment(root, spec.points[index], spec.points[(index + 1) % spec.points.length], .24, .13, paleConcrete,
        mesh.position.y + (SURFACE_HEIGHTS.curb - SURFACE_HEIGHTS.paving));
    }
  }

  // Distinctive architecture stays parameterised and independent of any road
  // layout. Its dimensions, materials and geographic placement live in data.
  function buildLandmark(spec) {
    const { width: w, depth: d, height: h = 24 } = spec;
    if (!(w > 0 && d > 0)) return;
    const group = groupAt(spec, spec.id || spec.type);
    const addMesh = (geometry, mat, y = 0) => {
      const mesh = new THREE.Mesh(keepGeometry(geometry), mat);
      mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const windows = [];
    const putWindows = () => {
      instances(group, unitBox, facadeGlass, windows.filter((_, i) => i % 5 !== 0));
      instances(group, unitBox, litFacadeGlass, windows.filter((_, i) => i % 5 === 0));
    };
    if (spec.type === 'shell-hall') {
      const base = 2.6, edgeHeight = 7.4;
      const roofY = (u, v) => edgeHeight + (h - edgeHeight) * (1 - u * u) * (.8 + .2 * Math.cos(v * Math.PI / 2))
        + (1 - v * v) * 2.2;
      box(group, [w + 1.2, base, d + 1.2], [0, base / 2, 0], paleConcrete);
      box(group, [w * .66, h * .55, d * .6], [0, base + h * .275, -d * .08], darkMetal);
      const copperTexture = canvasTexture(512, 512, (ctx, tw, th) => {
        ctx.fillStyle = '#b4c3a5'; ctx.fillRect(0, 0, tw, th);
        for (let x = 0; x < tw; x += 16) for (let y = 0; y < th; y += 26) {
          ctx.fillStyle = ['#b2c6aa', '#a9bea2', '#bbcaad', '#9ebba3', '#afc3a9'][Math.floor(random() * 5)];
          ctx.fillRect(x + .7, y + .7, 14.7, 24.7);
        }
      });
      copperTexture.wrapS = copperTexture.wrapT = THREE.RepeatWrapping; copperTexture.repeat.set(2, 2);
      const copper = material(spec.roofColor || '#a7bfaa', { map: copperTexture, metalness: .24, roughness: .72, side: THREE.DoubleSide });
      const geometry = new THREE.PlaneGeometry(w, d, 36, 28); geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) positions.setY(i, roofY(positions.getX(i) / (w / 2), positions.getZ(i) / (d / 2)));
      geometry.computeVertexNormals(); addMesh(geometry, copper);
      const underside = geometry.clone(); underside.translate(0, -.24, 0); addMesh(underside, paleConcrete);
      const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
      for (let edge = 0; edge < 4; edge++) {
        const a = corners[edge], b = corners[(edge + 1) % 4], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const count = Math.ceil(length / 2.3), rotation = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let panel = 0; panel < count; panel++) {
          const t = (panel + .5) / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          const top = roofY(x / (w / 2), z / (d / 2)) - .4;
          windows.push({ position: [x, (top + base) / 2, z], scale: [length / count - .15, top - base, .12],
            rotation: [0, rotation, 0], color: ['#496269', '#5c777c', '#738687'][panel % 3] });
          const post = box(group, [.12, top - base, .2], [x - Math.cos(rotation) * length / count / 2, (top + base) / 2,
            z + Math.sin(rotation) * length / count / 2], paleConcrete); post.rotation.y = rotation;
          const ta = panel / count, tb = (panel + 1) / count;
          const pa = [a[0] + (b[0] - a[0]) * ta, a[1] + (b[1] - a[1]) * ta];
          const pb = [a[0] + (b[0] - a[0]) * tb, a[1] + (b[1] - a[1]) * tb];
          line3(group, [pa[0], roofY(pa[0] / (w / 2), pa[1] / (d / 2)), pa[1]],
            [pb[0], roofY(pb[0] / (w / 2), pb[1] / (d / 2)), pb[1]], .17, paleConcrete);
        }
      }
      putWindows();
      box(group, [w * .86, .4, 3.4], [0, 3.6, d / 2 + 1.5], paleConcrete);
      for (let step = 0; step < 7; step++) box(group, [w * .68, .2 + step * .32, .7],
        [0, (.2 + step * .32) / 2, d / 2 + 6.1 - step * .7], paleConcrete);
      if (spec.label) sign(group, spec.label, [Math.min(w * .7, 25), .95], [0, 4.2, d / 2 + 1.6]);
    } else if (spec.type === 'rounded-corner') {
      const body = material(spec.color || '#dad9cc', { map: masonryTexture });
      const blue = material(spec.roofColor || '#327d9e', { metalness: .23, roughness: .5 });
      const levels = spec.roofLevels ?? 3, topFloor = 3.2, mainHeight = h - levels * topFloor;
      const footprint = (width, depth, radius) => {
        const points = [[-width / 2, -depth / 2], [width / 2 - radius, -depth / 2]];
        for (let k = 1; k <= 14; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 28;
          points.push([width / 2 - radius + Math.cos(a) * radius, -depth / 2 + radius + Math.sin(a) * radius]);
        }
        points.push([width / 2, depth / 2], [-width / 2, depth / 2]); return points;
      };
      const tier = (width, depth, radius, bottom, height, floors, mat) => {
        const points = footprint(width, depth, radius), shape = new THREE.Shape();
        points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
        const bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }); bodyGeometry.rotateX(-Math.PI / 2);
        addMesh(bodyGeometry, mat, bottom);
        const roof = new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: false }); roof.rotateX(-Math.PI / 2);
        addMesh(roof, paleConcrete, bottom + height);
        for (let edge = 0; edge < points.length; edge++) {
          const a = points[edge], b = points[(edge + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const count = Math.max(1, Math.round(length / 2.45)), rotation = -Math.atan2(b[1] - a[1], b[0] - a[0]);
          for (let panel = 0; panel < count; panel++) for (let floor = 0; floor < floors; floor++) {
            const t = (panel + .5) / count;
            windows.push({ position: [a[0] + (b[0] - a[0]) * t - Math.sin(rotation) * .065,
              bottom + (floor + .52) * height / floors, a[1] + (b[1] - a[1]) * t - Math.cos(rotation) * .065],
              scale: [length / count * (mat === blue ? .83 : .68), height / floors * .69, .13], rotation: [0, rotation, 0],
              color: ['#607a85', '#627782', '#839397', '#486675'][(panel + floor) % 4] });
          }
        }
      };
      box(group, [w + .9, .25, d + .9], [0, .125, 0], pavement, false);
      tier(w, d, spec.radius || 13, .25, mainHeight, spec.floors || 6, body);
      for (let i = 0; i < levels; i++) tier(w - (i + 1) * 3.5, d - (i + 1) * 3.5,
        Math.max(4, (spec.radius || 13) - i * 2), mainHeight + .45 + i * (topFloor + .2), topFloor, 1, blue);
      putWindows();
      const frontSign = new THREE.Group(); frontSign.rotation.y = Math.PI; group.add(frontSign);
      if (spec.label) sign(frontSign, spec.label, [Math.min(w * .55, 16), .8], [0, 3.4, d / 2 + .13], { color: '#426a91' });
      for (const x of [-w * .18, w * .16]) cylinder(group, .05, 4, [x, h + 2.7, d * .1], metal);
    } else if (spec.type === 'skate-court') {
      box(group, [w, .12, d], [0, SURFACE_HEIGHTS.paving - .06, 0], material('#bfc1b9', surfaceMaterialOptions('paving')), false);
      const rampSurface = material('#a5aaa5', { metalness: .12, roughness: .71 });
      const ramp = (x, z, rotation, width, height) => {
        const subgroup = new THREE.Group(); subgroup.position.set(x, SURFACE_HEIGHTS.paving, z); subgroup.rotation.y = rotation; group.add(subgroup);
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(3.2, 0); shape.lineTo(3.2, height);
        shape.lineTo(2.7, height); shape.quadraticCurveTo(2.5, .2, 0, .12); shape.closePath();
        const geometry = keepGeometry(new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 12 }));
        geometry.rotateY(Math.PI / 2); geometry.translate(-width / 2, 0, 1.6);
        const mesh = new THREE.Mesh(geometry, rampSurface); mesh.castShadow = mesh.receiveShadow = true; subgroup.add(mesh);
        line3(subgroup, [-width / 2, height + .035, -1.1], [width / 2, height + .035, -1.1], .045, metal);
        const trim = material('#a5645a');
        box(subgroup, [width, .2, .09], [0, height * .55, -1.65], trim);
      };
      ramp(-w * .32, 0, -Math.PI / 2, 5.5, 1.7); ramp(w * .32, 0, Math.PI / 2, 6, 1.6);
      ramp(0, -d * .28, 0, 5, 1.25);
      box(group, [5.6, .45, 1.5], [-1, .365, d * .22], rampSurface);
      line3(group, [-5, .8, 0], [4, .8, 0], .04, metal);
      for (const x of [-4.8, 0, 3.8]) cylinder(group, .037, .66, [x, .47, 0], metal);
      bench(group, -w * .2, d / 2 + 1.6, Math.PI); bench(group, w * .22, d / 2 + 1.6, Math.PI);
    }
  }

  function buildParkingLot(spec) {
    const { width: w, depth: d } = spec;
    if (!(w > 5 && d > 8)) return;
    const group = groupAt(spec, spec.id || 'Parking');
    // The parking slab is split into a recessed base and raised wearing course.
    // Paint lies above the course, never partly embedded in either volume.
    const courseThickness = .02, paintThickness = .012;
    const baseTop = SURFACE_HEIGHTS.parking - courseThickness - .01;
    box(group, [w + .55, baseTop, d + .55], [0, baseTop / 2, 0], groundPavement, false);
    box(group, [w, courseThickness, d], [0, SURFACE_HEIGHTS.parking - courseThickness / 2, 0],
      material(spec.color || '#818580', surfaceMaterialOptions('parking')), false);
    const paint = material('#dfded3', surfaceMaterialOptions('marking'));
    const rows = spec.rows === 1 ? [0] : [-1, 1], pitch = spec.spacing || 2.85;
    const stallLength = 5.3, count = Math.floor((w - 3) / pitch);
    const bodies = [], cabins = [], tires = [], lamps = [], trims = [];
    const colors = ['#eeeae0', '#38434b', '#b5b9b5', '#687a85', '#973a35', '#ddd1b4', '#d4d8d6'];
    for (const side of rows) {
      const z = rows.length === 1 ? -d / 2 + 3.2 : side * (d / 2 - 3.2);
      for (let column = 0; column <= count; column++) {
        const x = (column - count / 2) * pitch;
        box(group, [.085, paintThickness, stallLength],
          [x, SURFACE_HEIGHTS.parkingPaint - paintThickness / 2, z], paint, false);
        if (column === count || random() > (spec.occupancy ?? .76)) continue;
        const px = x + pitch / 2, pz = z + (random() - .5) * .22;
        const angle = side < 0 ? 0 : Math.PI, color = colors[Math.floor(random() * colors.length)];
        bodies.push({ position: [px, .82, pz], scale: [1.83, .6, 4.4], color });
        bodies.push({ position: [px, 1.48, pz - .24], scale: [1.43, .095, 1.78], color });
        cabins.push({ position: [px, 1.22, pz - .18], scale: [1.62, .64, 2.1] });
        for (const sign of [-1, 1]) for (const along of [-1, 1]) {
          tires.push({ position: [px + sign * .91, .51, pz + along * 1.37], scale: [.2, .63, .63] });
          trims.push({ position: [px + sign * .93, .51, pz + along * 1.37], scale: [.022, .29, .29] });
        }
        [-1, 1].forEach(sign => lamps.push({ position: [px + sign * .59, .85, pz + (angle ? -2.215 : 2.215)], scale: [.38, .16, .025] }));
      }
    }
    instances(group, unitBox, material('#ffffff', { metalness: .35, roughness: .38 }), bodies);
    instances(group, unitBox, glassOpaque, cabins);
    instances(group, unitBox, rubber, tires);
    instances(group, unitBox, metal, trims);
    instances(group, unitBox, warmWhite, lamps);
    [-1, 1].forEach(side => box(group, [.22, .17, d], [side * (w / 2 + .1), .18, 0], paleConcrete, false));
    if (spec.label) {
      cylinder(group, .06, 2.9, [-w / 2 + 1, 1.5, d / 2 - 1], metal);
      sign(group, ['P', spec.label], [1.3, 1.5], [-w / 2 + 1, 2.75, d / 2 - .95], { background: '#275880', color: '#ffffff' });
    }
  }

  function buildPavilion(spec) {
    const { width: w, depth: d, height: h = 5 } = spec;
    if (!(w > 0 && d > 0)) return;
    const group = groupAt(spec, spec.id || 'Pavilion');
    const base = material('#555c5d'), glazing = material('#344f5b', { metalness: .38, roughness: .23 });
    box(group, [w, .36, d], [0, .2, 0], base);
    box(group, [w - 1, h - .7, d - 1], [0, h / 2, 0], glazing);
    const shape = new THREE.Shape(), radius = Math.min(2.6, w / 5, d / 5), hw = w / 2 + .7, hd = d / 2 + .7;
    shape.moveTo(-hw + radius, -hd); shape.lineTo(hw - radius, -hd); shape.quadraticCurveTo(hw, -hd, hw, -hd + radius);
    shape.lineTo(hw, hd - radius); shape.quadraticCurveTo(hw, hd, hw - radius, hd);
    shape.lineTo(-hw + radius, hd); shape.quadraticCurveTo(-hw, hd, -hw, hd - radius);
    shape.lineTo(-hw, -hd + radius); shape.quadraticCurveTo(-hw, -hd, -hw + radius, -hd); shape.closePath();
    const roof = keepGeometry(new THREE.ExtrudeGeometry(shape, { depth: .34, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .1, bevelThickness: .06 })); roof.rotateX(-Math.PI / 2);
    const canopy = new THREE.Mesh(roof, paleConcrete); canopy.position.y = h; canopy.castShadow = canopy.receiveShadow = true; group.add(canopy);
    box(group, [w * .68, .13, d * .6], [0, h + .44, 0], roofMaterial, false);
    for (const side of [-1, 1]) {
      for (let x = -w / 2 + .8; x < w / 2; x += 3.3) box(group, [.13, h - .6, .14], [x, h / 2, side * (d / 2 - .42)], metal);
      for (let z = -d / 2 + 1; z < d / 2; z += 3.1) box(group, [.14, h - .6, .13], [side * (w / 2 - .42), h / 2, z], metal);
    }
    box(group, [2.3, 2.7, .1], [0, 1.65, d / 2 - .33], glass);
    if (spec.label) sign(group, spec.label, [Math.min(12, w * .65), .63], [0, h - .7, d / 2 - .27], { background: '#354348', color: '#eeeee3' });
    [-1, 1].forEach(side => bench(group, side * (w / 2 + 3), 0, side * Math.PI / 2));
  }

  function buildShrubs() {
    const values = [];
    for (const spec of env.shrubs || []) {
      const radius = spec.radius || 1.5, height = spec.height || radius * .9;
      values.push({ position: [spec.x, height * .62 + (spec.elevation || .15), spec.z],
        scale: [radius, height * .75, radius * (spec.depthScale || .9)], rotation: [0, spec.rotation || 0, 0], color: spec.color || '#6c814d' });
    }
    instances(root, crownGeometry, foliageMaterial, values);
  }

  function buildRails(rails) {
    const from = rails.from ?? -220;
    const to = rails.to ?? 220;
    const tracks = rails.tracks || [-2.4, 2.4];
    const crossing = rails.crossing || [-23, 23];
    const ballast = material('#847f6f');
    const sleeper = material('#746e5d');
    const railSteel = material('#a7a7a0', { metalness: 0.88, roughness: 0.36 });
    const sleepers = [];
    tracks.forEach(z => {
      [[from, crossing[0]], [crossing[1], to]].forEach(([a, b]) => {
        if (b <= a) return;
        box(root, [b - a, 0.065, 2.7], [(a + b) / 2, 0.035, z], ballast, false);
        for (let x = a + 0.45; x < b; x += 0.8) {
          sleepers.push({ position: [x, 0.084, z], scale: [0.19, 0.1, 2.25] });
        }
      });
      [-0.7175, 0.7175].forEach(offset => {
        box(root, [to - from, 0.06, 0.068], [(from + to) / 2, 0.14, z + offset], railSteel, false);
        line3(root, [from, 6.15, z], [to, 6.15, z], 0.016, darkMetal);
      });
    });
    instances(root, unitBox, sleeper, sleepers);
    for (let x = from + 15; x < to; x += 44) {
      if (x > crossing[0] - 9 && x < crossing[1] + 9) continue;
      const poleZ = Math.min(...tracks) - 2.7;
      cylinder(root, 0.095, 7.1, [x, 3.55, poleZ], metal);
      line3(root, [x, 6.75, poleZ], [x, 6.75, Math.max(...tracks) + 0.7], 0.052, metal);
      tracks.forEach(z => line3(root, [x, 6.75, z], [x, 6.15, z], 0.019, darkMetal));
    }
  }

  function buildStation(station) {
    const { x, length = 80, z = 0, label = 'Stadtbahn' } = station;
    const group = groupAt({ x, z }, `Station ${label}`);
    const tactile = material('#dfddd0');
    const blue = material('#174b92');
    [-1, 1].forEach(side => {
      const pz = side * (station.platformOffset ?? 5.5);
      box(group, [length, 0.28, 3.45], [0, 0.14, pz], pavement, false);
      box(group, [length, 0.045, 0.42], [0, 0.3, pz - side * 1.32], tactile, false);
      // End ramps are intentionally shallow and unobstructed.
      const rampGeometry = keepGeometry(new THREE.BoxGeometry(5, 0.16, 3.45));
      [-1, 1].forEach(end => {
        const ramp = new THREE.Mesh(rampGeometry, pavement);
        ramp.position.set(end * (length / 2 + 2.45), 0.08, pz);
        ramp.rotation.z = end * -0.028;
        ramp.receiveShadow = true;
        group.add(ramp);
      });
      for (let sx = -length / 2 + 13; sx < length / 2 - 4; sx += 22) {
        const shelterZ = pz + side * 0.22;
        const width = 9.6;
        [-width / 2 + 0.2, 0, width / 2 - 0.2].forEach(px => {
          cylinder(group, 0.065, 2.6, [sx + px, 1.62, shelterZ + side * 0.95], metal);
        });
        box(group, [width, 0.16, 2.75], [sx, 3, shelterZ], paleConcrete);
        box(group, [width - 0.2, 0.06, 2.5], [sx, 3.11, shelterZ], roofMaterial);
        for (let slat = -width / 2; slat < width / 2; slat += 0.65) {
          box(group, [0.09, 0.035, 2.7], [sx + slat, 3.19, shelterZ], metal, false);
        }
        box(group, [width - 0.5, 2.1, 0.045], [sx, 1.78, shelterZ + side * 0.98], glass, false);
        box(group, [0.045, 2.1, 1.9], [sx - width / 2 + 0.15, 1.78, shelterZ], glass, false);
        box(group, [width - 0.5, 0.055, 0.052], [sx, 1.35, shelterZ + side * 1.01], paleConcrete, false);
        bench(group, sx - 1.6, shelterZ + side * 0.2, side === 1 ? 0 : Math.PI, 0.28);
        bench(group, sx + 1.6, shelterZ + side * 0.2, side === 1 ? 0 : Math.PI, 0.28);
      }
      const nameGroup = new THREE.Group();
      nameGroup.position.set(-length / 2 + 5, 0, pz + side * 0.85);
      nameGroup.rotation.y = side === 1 ? 0 : Math.PI;
      group.add(nameGroup);
      cylinder(nameGroup, 0.055, 4.3, [0, 2.45, 0], metal);
      sign(nameGroup, 'U', [0.83, 0.9], [0, 4.0, 0], { background: '#19458a', color: '#ffffff' });
      sign(nameGroup, label, [3.15, 0.48], [0, 3.22, 0], { background: '#233f62', color: '#ffffff' });
      cylinder(group, 0.24, 0.78, [length / 2 - 9, 0.7, pz + side * 0.9], metal);
      cylinder(group, 0.25, 0.06, [length / 2 - 9, 1.12, pz + side * 0.9], darkMetal);
      const railingZ = pz + side * 1.7;
      for (let rx = -length / 2 + 1; rx < length / 2; rx += 3) {
        cylinder(group, 0.036, 1.0, [rx, 0.82, railingZ], metal);
      }
      [0.67, 1.3].forEach(y => line3(group, [-length / 2 + 1, y, railingZ],
        [length / 2 - 1, y, railingZ], 0.035, metal));
      // The blue foot of the information board is a small, legible station accent.
      box(group, [0.95, 1.65, 0.15], [length / 2 - 5, 1.18, pz], blue);
      sign(group, station.infoLines || ['U', label], [0.8, 1.1], [length / 2 - 5, 1.37, pz + 0.1]);
    });
  }

  function buildFuelStation(spec) {
    const group = groupAt(spec, 'Fuel station');
    const blue = material('#3d7ca8');
    const white = material('#dddeda');
    box(group, [44, 0.12, 33], [0, 0.06, 0], concrete, false);
    box(group, [33, 0.55, 15], [0, 5.2, 3], white);
    box(group, [33.1, 0.42, 0.13], [0, 5.08, 10.55], blue);
    box(group, [33.1, 0.42, 0.13], [0, 5.08, -4.55], blue);
    [-10, 0, 10].forEach(x => {
      box(group, [2.9, 0.2, 7.2], [x, 0.2, 3], paleConcrete);
      box(group, [0.33, 4.8, 0.33], [x, 2.5, 3], metal);
      [-2, 2].forEach(z => {
        box(group, [1.25, 1.8, 0.8], [x, 1.17, 3 + z], white);
        box(group, [1.27, 0.34, 0.83], [x, 0.47, 3 + z], blue);
        box(group, [0.76, 0.46, 0.04], [x, 1.58, 3.43 + z], rubber);
        line3(group, [x + 0.73, 1.55, 3 + z], [x + 0.91, 0.45, 3 + z], 0.046, rubber);
      });
      box(group, [3, 0.045, 0.8], [x, 4.89, 3], warmWhite, false);
    });
    box(group, [24, 4.2, 8], [0, 2.15, -10], white);
    box(group, [24.4, 0.3, 8.4], [0, 4.35, -10], roofMaterial);
    box(group, [20, 2.65, 0.1], [0, 1.85, -5.93], glassOpaque);
    for (let x = -10; x <= 10; x += 2.5) box(group, [0.11, 2.65, 0.14], [x, 1.85, -5.84], metal);
    sign(group, spec.label || 'Tankstelle', [8, 0.78], [0, 3.63, -5.83],
      { background: '#3d7ca8', color: '#ffffff' });
    box(group, [2.4, 6.8, 0.55], [19, 3.45, 10], white);
    sign(group, ['TANKEN', 'SHOP'], [2.15, 2.2], [19, 5.26, 10.31],
      { background: '#3d7ca8', color: '#ffffff' });
    [-1, 0, 1].forEach(row => box(group, [1.6, 0.25, 0.04], [19, 3.45 + row * 0.62, 10.32], rubber));
  }

  function buildPark(spec) {
    const { x, z, width: w, depth: d } = spec;
    const group = groupAt(spec, 'Park');
    box(group, [w, .03, d], [0, SURFACE_HEIGHTS.grass - .015, 0],
      material('#778665', surfaceMaterialOptions('grass')), false);
    const path = material('#d0c6ad', surfaceMaterialOptions('paving'));
    const sw = [-w / 2 + 2, d / 2 - 2];
    const ne = [w / 2 - 2, -d / 2 + 2];
    const nw = [-w / 2 + 2, -d / 2 + 2];
    const se = [w / 2 - 2, d / 2 - 2];
    pathNetwork(group, [{ a: sw, b: ne, width: 2.15 }, { a: nw, b: se, width: 2.15 },
      { a: sw, b: se, width: 2 }], path);
    bench(group, -w * 0.3, d * 0.36, Math.PI);
    bench(group, w * 0.3, -d * 0.36);
    const bark = material('#61594a');
    const crowns = [];
    const trunks = [];
    for (let i = 0; i < Math.floor(w * d / 220); i++) {
      const px = (random() - 0.5) * (w - 5);
      const pz = (random() - 0.5) * (d - 5);
      const lineA = Math.abs(pz - px * d / w) / Math.hypot(1, d / w);
      const lineB = Math.abs(pz + px * d / w) / Math.hypot(1, d / w);
      const angle = spec.rotation || 0;
      const worldX = x + px * Math.cos(angle) + pz * Math.sin(angle);
      const worldZ = z - px * Math.sin(angle) + pz * Math.cos(angle);
      if (Math.min(lineA, lineB) < 3.7 || Math.abs(pz - d / 2 + 2) < 4 || !clearForTree(worldX, worldZ)) continue;
      addTreeValues(trunks, crowns, px, pz, 6.5 + random() * 5, 2.2 + random() * 1.5);
    }
    instances(group, unitCylinder, bark, trunks);
    instances(group, crownGeometry, foliageMaterial, crowns);
  }

  function addTreeValues(trunks, crowns, x, z, height, radius) {
    const trunkHeight = height * 0.69;
    const trunkRadius = Math.max(0.12, height * 0.028);
    trunks.push({ position: [x, trunkHeight / 2, z], scale: [trunkRadius, trunkHeight, trunkRadius] });
    const colors = ['#4c6840', '#5a7249', '#62794d', '#6e8050', '#527044', '#7c8957'];
    const color = colors[Math.floor(random() * colors.length)];
    crowns.push({ position: [x, height - radius * 0.8, z],
      scale: [radius, radius * 0.95, radius], rotation: [0, random() * Math.PI, 0], color });
    for (let lobe = 0; lobe < 7; lobe++) {
      const angle = lobe * Math.PI * 2 / 7 + random() * 0.35;
      const reach = radius * (0.45 + random() * 0.15);
      const size = radius * (0.61 + random() * 0.17);
      crowns.push({
        position: [x + Math.sin(angle) * reach, height - radius * (0.78 + random() * 0.22), z + Math.cos(angle) * reach],
        scale: [size, size * (0.85 + random() * 0.15), size],
        rotation: [random(), random(), random()],
        color: colors[Math.floor(random() * colors.length)],
      });
    }
  }

  function insideBuilding(x, z) {
    return [...(env.buildings || []), ...(env.landmarks || []), ...(env.pavilions || []), ...(env.parkingLots || [])].some(spec => {
      const angle = -(spec.rotation || 0);
      const dx = x - spec.x;
      const dz = z - spec.z;
      const localX = dx * Math.cos(angle) + dz * Math.sin(angle);
      const localZ = -dx * Math.sin(angle) + dz * Math.cos(angle);
      return Math.abs(localX) < spec.width / 2 + 3 && Math.abs(localZ) < spec.depth / 2 + (spec.style === 'glass' ? 7.5 : 3);
    });
  }

  const pointSegmentDistance = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared)) : 0;
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };

  function clearForTree(x, z) {
    if (insideBuilding(x, z)) return false;
    if ((env.treeExclusions || []).some(e => Math.abs(x - e.x) < e.width / 2 && Math.abs(z - e.z) < e.depth / 2)) return false;
    if ((config.roads || []).some(road => road.points.slice(1).some((point, index) =>
      pointSegmentDistance(x, z, road.points[index], point) < road.width / 2 + 1.7))) return false;
    if (env.rails && x > env.rails.from && x < env.rails.to &&
      (env.rails.tracks || []).some(track => Math.abs(z - track) < 2.3)) return false;
    if (env.station && Math.abs(x - env.station.x) < (env.station.length || 80) / 2 + 7 &&
      Math.abs(z - (env.station.z || 0)) < 11.5) return false;
    if (env.fuelStation && Math.abs(x - env.fuelStation.x) < 25 && Math.abs(z - env.fuelStation.z) < 20) return false;
    const park = env.park;
    if (park && Math.abs(x - park.x) < park.width / 2 && Math.abs(z - park.z) < park.depth / 2) {
      const px = x - park.x, pz = z - park.z;
      const ratio = park.depth / park.width;
      if (Math.min(Math.abs(pz - px * ratio), Math.abs(pz + px * ratio)) / Math.hypot(1, ratio) < 4) return false;
      if (Math.abs(pz - park.depth / 2 + 2) < 4) return false;
    }
    return true;
  }

  function buildTrees() {
    const trunks = [];
    const crowns = [];
    (env.treeZones || []).forEach(zone => {
      for (let i = 0; i < zone.count; i++) {
        let x, z, attempts = 0;
        do {
          x = zone.x + (random() - 0.5) * zone.width;
          z = zone.z + (random() - 0.5) * zone.depth;
          attempts++;
        } while (attempts < 10 && !clearForTree(x, z));
        if (!clearForTree(x, z)) continue;
        const height = (zone.height || 12) * (0.76 + random() * 0.45);
        const radius = (zone.radius || 4.3) * (0.8 + random() * 0.35);
        addTreeValues(trunks, crowns, x, z, height, radius);
      }
    });
    instances(root, unitCylinder, material('#635a48'), trunks);
    instances(root, crownGeometry, foliageMaterial, crowns);
  }

  function buildStreetlight(spec) {
    const group = groupAt(spec, 'Streetlight');
    const height = spec.height || 10;
    const profile = streetLighting.profileFor(spec);
    if (!streetLampMaterials.has(profile.color)) streetLampMaterials.set(profile.color,
      material(profile.color, { emissive: profile.color, emissiveIntensity: .16, roughness: .4 }));
    const lampMaterial = streetLampMaterials.get(profile.color);
    cylinder(group, 0.11, height, [0, height / 2, 0], metal, 0.065);
    cylinder(group, 0.19, 0.65, [0, 0.325, 0], concrete);
    line3(group, [0, height - 0.2, 0], [0, height + 0.15, 2.1], 0.065, metal);
    box(group, [0.47, 0.16, 1.14], [0, height + 0.08, 2.25], metal);
    box(group, [0.39, 0.025, 0.98], [0, height - 0.018, 2.25], lampMaterial, false);
    if (spec.double) {
      line3(group, [0, height - 0.2, 0], [0, height + 0.15, -2.1], 0.065, metal);
      box(group, [0.47, 0.16, 1.14], [0, height + 0.08, -2.25], metal);
      box(group, [0.39, 0.025, 0.98], [0, height - 0.018, -2.25], lampMaterial, false);
    }
  }

  function buildLampHalos() {
    if (!streetLighting.emitters.length) return;
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const distance = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
      const index = (y * size + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(Math.max(0, Math.exp(-distance * distance * 6) - Math.exp(-6)) * 255);
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true; textures.add(texture);
    const geometry = keepGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(streetLighting.emitters.flatMap(lamp => [lamp.x, lamp.height - .07, lamp.z]), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(streetLighting.emitters.flatMap(lamp => lamp.color.toArray()), 3));
    const material = new THREE.PointsMaterial({ map: texture, color: '#ffffff', vertexColors: true,
      size: env.streetLights?.haloSize ?? 2.4, sizeAttenuation: true, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    materials.add(material);
    lampHalos = new THREE.Points(geometry, material); lampHalos.name = 'Street-lamp halos';
    lampHalos.visible = false; root.add(lampHalos);
  }

  function buildDirectionSign(spec) {
    const group = groupAt(spec, 'Direction sign');
    const lines = spec.lines || [];
    const width = spec.width || 4.4;
    const height = Math.max(1.4, lines.length * 0.65);
    const y = spec.height || 3.8;
    [-width * 0.32, width * 0.32].forEach(x => cylinder(group, 0.075, y + height / 2, [x, (y + height / 2) / 2, 0], metal));
    sign(group, lines, [width, height], [0, y, 0], { background: '#dfb746', color: '#253138', border: '#47442e' });
  }

  function buildLandscapeBeds() {
    if (!env.landscapeBeds?.length) return;
    const turfTexture = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#929775';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 12000; i++) {
        const value = 107 + Math.floor(random() * 69);
        ctx.fillStyle = `rgb(${value},${value + 7},${value - 21})`;
        ctx.fillRect(random() * w, random() * h, 0.7, 1 + random() * 3);
      }
    });
    turfTexture.wrapS = turfTexture.wrapT = THREE.RepeatWrapping;
    turfTexture.repeat.set(6, 3);
    const turf = material('#ffffff', { map: turfTexture, roughness: 1, ...surfaceMaterialOptions('turf') });
    const soil = material('#6b604a', surfaceMaterialOptions('turf'));
    const shrubs = [];
    env.landscapeBeds.forEach(spec => {
      const group = groupAt(spec, 'Planted bed');
      const w = spec.width, d = spec.depth;
      box(group, [w, .12, d], [0, SURFACE_HEIGHTS.bedTurf - .06, 0], turf, false);
      [-1, 1].forEach(side => {
        box(group, [w + .25, .2, .22], [0, SURFACE_HEIGHTS.curb - .1, side * d / 2], paleConcrete, false);
        box(group, [.22, .2, d], [side * w / 2, SURFACE_HEIGHTS.curb - .1, 0], paleConcrete, false);
      });
      const longX = w > d;
      const length = Math.max(w, d) - 2;
      box(group, longX ? [length, .03, 1.7] : [1.7, .03, length],
        [0, SURFACE_HEIGHTS.bedSoil - .015, 0], soil, false);
      for (let n = -length / 2; n < length / 2; n += 1.25) {
        const localX = longX ? n : (random() - 0.5) * 0.45;
        const localZ = longX ? (random() - 0.5) * 0.45 : n;
        const angle = spec.rotation || 0;
        const x = spec.x + localX * Math.cos(angle) + localZ * Math.sin(angle);
        const z = spec.z - localX * Math.sin(angle) + localZ * Math.cos(angle);
        if (!clearForTree(x, z)) continue;
        shrubs.push({ position: [x, 0.56 + random() * 0.2, z],
          scale: [0.8 + random() * 0.2, 0.56 + random() * 0.18, 0.76 + random() * 0.25],
          rotation: [0, random() * Math.PI, 0], color: ['#668051', '#708759', '#587347'][Math.floor(random() * 3)] });
      }
    });
    instances(root, crownGeometry, foliageMaterial, shrubs);
  }

  function buildBackground() {
    if (!env.backgroundZones?.length) return;
    const facadeTexture = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#e4e4dc';
      ctx.fillRect(0, 0, w, h);
      for (let floor = 0; floor < 8; floor++) {
        for (let col = 0; col < 8; col++) {
          const value = 86 + Math.floor(random() * 56);
          ctx.fillStyle = `rgb(${value},${value + 8},${value + 11})`;
          ctx.fillRect(9 + col * 32, 8 + floor * 32, 13, 17);
          ctx.fillStyle = '#cdcfc6';
          ctx.fillRect(8 + col * 32, 25 + floor * 32, 15, 2);
        }
      }
    });
    const cityMaterial = material('#ffffff', { map: facadeTexture, roughness: 0.94 });
    const blocks = [], flatRoofs = [], pitchedRoofs = [], treeValues = [];
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.5, 0);
    roofShape.lineTo(0, 1);
    roofShape.lineTo(0.5, 0);
    roofShape.closePath();
    const pitchedGeometry = keepGeometry(new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }));
    pitchedGeometry.translate(0, 0, -0.5);
    const colors = ['#c8c3b5', '#bdc2be', '#cfcdc0', '#b7beb8', '#c4bbac', '#bab7ae'];
    const districtGround = material('#969c8a', surfaceMaterialOptions('grass'));
    env.backgroundZones.forEach(zone => {
      const group = groupAt(zone, 'Background district');
      box(group, [zone.width, .035, zone.depth], [0, SURFACE_HEIGHTS.grass - .0175, 0], districtGround, false);
      const columns = Math.max(1, Math.ceil(Math.sqrt(zone.count * zone.width / zone.depth)));
      const rows = Math.max(1, Math.ceil(zone.count / columns));
      const cellW = zone.width / columns, cellD = zone.depth / rows;
      for (let i = 0; i < zone.count; i++) {
        const x = zone.x - zone.width / 2 + cellW * (i % columns + 0.5) + (random() - 0.5) * cellW * 0.2;
        const z = zone.z - zone.depth / 2 + cellD * (Math.floor(i / columns) + 0.5) + (random() - 0.5) * cellD * 0.2;
        const width = Math.min(34, cellW * (0.58 + random() * 0.23));
        const depth = Math.min(27, cellD * (0.54 + random() * 0.2));
        const height = (zone.minHeight ?? 9) + random() * ((zone.maxHeight ?? 25) - (zone.minHeight ?? 9));
        blocks.push({ position: [x, height / 2, z], scale: [width, height, depth],
          color: colors[Math.floor(random() * colors.length)] });
        if (random() > 0.42) {
          pitchedRoofs.push({ position: [x, height, z], scale: [width + 0.65, 2.5 + random() * 3, depth + 0.65],
            color: ['#757771', '#8b7970', '#737d7a'][Math.floor(random() * 3)] });
        } else {
          flatRoofs.push({ position: [x, height + 0.18, z], scale: [width + 0.65, 0.36, depth + 0.65], color: '#7c8580' });
          flatRoofs.push({ position: [x + width * 0.12, height + 0.9, z], scale: [width * 0.44, 1.8, depth * 0.34], color: '#919a94' });
        }
        treeValues.push({ position: [x - cellW * 0.42, 5.6, z + cellD * 0.3],
          scale: [3.1 + random(), 5.4 + random() * 1.3, 3.1 + random()],
          rotation: [0, random() * Math.PI, 0], color: ['#617957', '#718464', '#5c7554'][Math.floor(random() * 3)] });
      }
    });
    const backgroundRoofMaterial = material('#ffffff');
    [instances(root, unitBox, cityMaterial, blocks),
      instances(root, unitBox, backgroundRoofMaterial, flatRoofs),
      instances(root, pitchedGeometry, backgroundRoofMaterial, pitchedRoofs),
      instances(root, crownGeometry, foliageMaterial, treeValues)].filter(Boolean).forEach(mesh => { mesh.castShadow = false; });
  }

  // Static architecture shares one draw per opaque material/shadow setting.
  // Transparent shelter panels stay separate so Three can sort them correctly.
  function batchStaticMeshes() {
    root.updateMatrixWorld(true);
    const batches = new Map();
    root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material) || object.material.transparent) return;
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    });
    const inverseRoot = root.matrixWorld.clone().invert();
    batches.forEach(objects => {
      if (objects.length < 2) return;
      const pieces = objects.map(object => {
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld));
        return geometry;
      });
      const count = pieces.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
      const merged = keepGeometry(new THREE.BufferGeometry());
      ['position', 'normal', 'uv'].forEach(attribute => {
        const stride = attribute === 'uv' ? 2 : 3;
        const array = new Float32Array(count * stride);
        let offset = 0;
        pieces.forEach(piece => {
          const values = piece.attributes[attribute];
          if (values) array.set(values.array, offset);
          offset += piece.attributes.position.count * stride;
        });
        merged.setAttribute(attribute, new THREE.BufferAttribute(array, stride));
      });
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, objects[0].material);
      mesh.name = 'Static streetscape batch';
      mesh.castShadow = objects[0].castShadow;
      mesh.receiveShadow = objects[0].receiveShadow;
      root.add(mesh);
      objects.forEach(object => object.removeFromParent());
      pieces.forEach(piece => piece.dispose());
    });
  }

  (env.surfacePatches || []).forEach(buildSurfacePatch);
  (env.pavement || []).forEach(spec => {
    const group = groupAt(spec, 'Pavement');
    box(group, [spec.width, SURFACE_HEIGHTS.paving, spec.depth],
      [0, SURFACE_HEIGHTS.paving / 2, 0], groundPavement, false);
    const joints = material('#b6b4a9', surfaceMaterialOptions('marking'));
    const jointY = SURFACE_HEIGHTS.paving + SURFACE_HEIGHTS.turfGap;
    const axis = spec.width > spec.depth ? 'x' : 'z';
    const long = axis === 'x' ? spec.width : spec.depth;
    for (let offset = -long / 2 + 2.5; offset < long / 2; offset += 2.5) {
      box(group, axis === 'x' ? [0.035, 0.008, spec.depth] : [spec.width, 0.008, 0.035],
        axis === 'x' ? [offset, jointY, 0] : [0, jointY, offset], joints, false);
    }
  });
  if (env.park) buildPark(env.park);
  (env.buildings || []).forEach(buildBuilding);
  (env.landmarks || []).forEach(buildLandmark);
  (env.pavilions || []).forEach(buildPavilion);
  (env.parkingLots || []).forEach(buildParkingLot);
  buildShrubs();
  if (env.rails) buildRails(env.rails);
  if (env.station) buildStation(env.station);
  if (env.fuelStation) buildFuelStation(env.fuelStation);
  buildTrees();
  (env.lights || []).forEach(buildStreetlight);
  buildLampHalos();
  (env.directionSigns || []).forEach(buildDirectionSign);
  buildLandscapeBeds();
  buildBackground();
  batchStaticMeshes();

  return {
    group: root, streetLighting,
    setLighting(profile = {}) {
      const daylight = THREE.MathUtils.clamp(Number.isFinite(profile.daylight) ? profile.daylight : 1, 0, 1);
      const night = 1 - daylight;
      warmWhite.emissiveIntensity = .16 + night * 4.4;
      litFacadeGlass.emissiveIntensity = night * .75;
      streetLighting.setLighting({ daylight });
      const strength = streetLighting.uniforms.streetLightStrength.value;
      streetLampMaterials.forEach(material => { material.emissiveIntensity = .16 + strength * 5; });
      if (lampHalos) { lampHalos.visible = strength > .001; lampHalos.material.opacity = strength * .65; }
    },
    dispose() {
      root.removeFromParent();
      root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(mat => mat.dispose());
      textures.forEach(texture => texture.dispose());
      streetLighting.dispose();
    },
  };
}
