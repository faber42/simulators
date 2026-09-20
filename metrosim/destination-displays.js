import * as T from '../pinsim/three.module.min.js';
import { displayTransition, flapMotion, flapPage } from './destination-display.mjs';

const WIDTH = 1024, HEIGHT = 240;
const LEAF_COLOR = '#e4dec9', INK_COLOR = '#101313';
export function drawDestinationDisplay(c, display) {
  // Black ink on gently aged ivory paint, with shallow pressed edge lips.
  c.fillStyle = LEAF_COLOR; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = '#eee5ce'; c.fillRect(0, 2, WIDTH, 2); c.fillRect(0, 122, WIDTH, 2);
  c.fillStyle = '#aaa28e'; c.fillRect(0, 117, WIDTH, 3); c.fillRect(0, 237, WIDTH, 3);
  c.fillStyle = INK_COLOR; c.textBaseline = 'middle'; c.textAlign = 'left';
  if (display.mode === 'departures') {
    display.rows.forEach((row, index) => {
      const y = 60 + index * 120;
      c.font = 'bold 73px Arial'; c.fillText(row.line, 28, y);
      c.font = 'bold 70px Arial'; c.fillText(row.destination, 187, y, 595);
      c.textAlign = 'right'; c.font = '65px Arial'; c.fillText(`${row.minutes} Min`, 991, y); c.textAlign = 'left';
    });
  } else {
    c.font = 'bold 87px Arial'; c.fillText(display.service.line, 27, 63);
    c.font = 'bold 83px Arial'; c.fillText(display.service.destination, 210, 63, 785);
    // Five coupled cars, drawn at their real length/stop position on a 120 m
    // platform. Section letters make the stopping position readable at a glance.
    const platformX = 210, platformWidth = 778, front = platformX + platformWidth * 111 / 120;
    const trainWidth = platformWidth * display.length / 120, gap = 7, carWidth = (trainWidth - gap * (display.cars - 1)) / display.cars;
    c.fillRect(platformX, 204, platformWidth, 4);
    for (let car = 0; car < display.cars; car++) {
      const x = front - trainWidth + car * (carWidth + gap), cab = car === display.cars - 1;
      c.beginPath(); c.moveTo(x + 3, 149); c.lineTo(x + carWidth - (cab ? 16 : 3), 149);
      c.lineTo(x + carWidth, 167); c.lineTo(x + carWidth, 189); c.lineTo(x, 189); c.lineTo(x, 155); c.closePath(); c.fill();
      c.fillStyle = LEAF_COLOR;
      for (let window = 0; window < 4; window++) c.fillRect(x + 9 + window * (carWidth - 23) / 4, 158, (carWidth - 36) / 4, 13);
      c.fillStyle = INK_COLOR;
      for (const wheel of [x + 18, x + carWidth - 18]) { c.beginPath(); c.arc(wheel, 191, 5, 0, Math.PI * 2); c.fill(); }
      if (car < display.cars - 1) c.fillRect(x + carWidth, 180, gap, 4);
    }
    c.font = '22px Arial'; c.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      c.fillText('ABCDE'[i], platformX + (i + .5) * platformWidth / 5, 225);
      c.fillRect(platformX + i * platformWidth / 5, 201, 2, 10);
    }
    c.fillRect(platformX + platformWidth - 2, 201, 2, 10);
  }
}

function displayTexture(display) {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  drawDestinationDisplay(canvas.getContext('2d'), display);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter; texture.anisotropy = 8;
  return texture;
}

export class DestinationDisplays {
  constructor(makeTexture = displayTexture) { this.makeTexture = makeTexture; this.textures = new Map(); this.entries = new Map(); }
  warmupMaterial(station) {
    // Keep one compiled instance alive across the long gaps between stations.
    if (!this.programAnchor) {
      this.programAnchor = this.material(station);
      this.leafAnchor = this.entries.get(station.index).leafMaterial;
    }
    return this.programAnchor;
  }
  texture(display) {
    const key = JSON.stringify(display);
    if (!this.textures.has(key)) this.textures.set(key, this.makeTexture(display));
    return this.textures.get(key);
  }
  material(station) {
    if (this.entries.has(station.index)) return this.entries.get(station.index).material;
    const state = displayTransition(station, { s: 0 });
    for (const page of [state.to, flapPage(state, 1), flapPage(state, 2)]) this.texture(page);
    const uniforms = {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      oldImage: { value: this.texture(state.from) }, newImage: { value: this.texture(flapPage(state, 1)) }, angle: { value: 0 },
    };
    const shader = { fog: true, uniforms, vertexShader: `
      varying vec2 vUv;
      uniform float angle;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec3 p = position;
        #ifdef FALLING_LEAF
          // Real geometry swings out of the housing around the horizontal
          // spindle. The reverse face carries the NEXT page's lower half.
          p.yz = vec2(position.y * cos(angle), position.y * sin(angle));
        #endif
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`, fragmentShader: `
      uniform sampler2D oldImage, newImage;
      uniform float angle;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      vec3 paint(vec3 color, vec2 uv) {
        // Broad, low-contrast patina follows the printed leaf. No animated
        // noise or tiny speckles that would shimmer on the distant boards.
        float mottling = .985 + .018 * sin(uv.x * 17. + uv.y * 4.) * cos(uv.y * 15. - uv.x * 3.);
        float rim = exp(-min(uv.x, 1. - uv.x) * 60.);
        float lip = exp(-min(uv.y, 1. - uv.y) * 85.) + exp(-abs(uv.y - .5) * 110.);
        return color * mottling * mix(vec3(1.), vec3(.84, .81, .72), .28 * rim + .19 * lip);
      }
      vec3 lamp(vec3 p, vec3 n, float x, float strength) {
        vec3 toLight = vec3(x, -.34, .23) - p;
        float d2 = dot(toLight, toLight);
        return vec3(1., .94, .83) * strength * max(0., dot(n, normalize(toLight))) / (d2 + .055);
      }
      vec3 illumination(vec3 p, vec3 n) {
        // Three concealed warm lamps in the lower casing cast overlapping
        // pools; the sides and hinge sit in softer shade. Light stays attached
        // to the housing while the moving leaf changes position and normal.
        vec3 light = vec3(.30, .315, .31) + vec3(.10, .10, .09) * max(0., dot(n, normalize(vec3(-.3, .8, 1.2))));
        light += lamp(p, n, -.82, .061) + lamp(p, n, .02, .069) + lamp(p, n, .83, .056);
        float edge = min(p.x + 1.225, 1.225 - p.x);
        float housing = .79 + .21 * smoothstep(0., .15, edge);
        float hinge = 1. - .15 * exp(-abs(p.y) / .014) * exp(-abs(p.z) / .045);
        return light * housing * hinge;
      }
      void main() {
        vec3 color, light; float shade = 1.;
        #ifdef FALLING_LEAF
          vec2 face = vec2(vUv.x, gl_FrontFacing ? .5 + .5 * vUv.y : .5 - .5 * vUv.y);
          color = gl_FrontFacing ? texture2D(oldImage, face).rgb : texture2D(newImage, face).rgb;
          color = paint(color, face);
          vec3 n = vec3(0., -sin(angle), cos(angle)) * (gl_FrontFacing ? 1. : -1.);
          vec3 p = vec3((vUv.x - .5) * 2.45, vUv.y * .284 * cos(angle), .013 + vUv.y * .284 * sin(angle));
          light = illumination(p, n);
          // Thin painted edge of the moving sheet, filtered at a distance.
          float edge = smoothstep(0., max(fwidth(vUv.y), .006), vUv.y) * smoothstep(0., max(fwidth(vUv.y), .006), 1. - vUv.y);
          shade *= .82 + .18 * edge;
        #else
          color = vUv.y > .5 ? texture2D(newImage, vUv).rgb : texture2D(oldImage, vUv).rgb;
          color = paint(color, vUv);
          light = illumination(vec3((vUv.x - .5) * 2.45, (vUv.y - .5) * .57, 0.), vec3(0., 0., 1.));
          // Soft shadow under the sheet reinforces its depth without another
          // render target or transparent plane fighting the printed surface.
          shade *= 1. - .48 * sin(angle) * exp(-abs(vUv.y - .5) / .22);
        #endif
        gl_FragColor = vec4(color * light * shade, 1.);
        #include <fog_fragment>
      }` };
    const material = new T.ShaderMaterial(shader);
    const leafMaterial = new T.ShaderMaterial({ ...shader, uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog), oldImage: uniforms.oldImage, newImage: uniforms.newImage, angle: uniforms.angle,
    }, defines: { FALLING_LEAF: 1 }, side: T.DoubleSide });
    this.entries.set(station.index, { station, material, leafMaterial, state, turn: 0 }); return material;
  }
  createFlap(station) {
    this.material(station);
    // The geometry origin is the hinge, rather than the centre of the leaf.
    const geometry = new T.PlaneGeometry(2.45, .284).translate(0, .142, 0);
    geometry.boundingSphere = new T.Sphere(new T.Vector3(), 1.27);
    return new T.Mesh(geometry, this.entries.get(station.index).leafMaterial);
  }
  update(train, from, to) {
    for (const [index, entry] of this.entries) {
      if (entry.station.end < from || entry.station.start > to) {
        if (entry.material !== this.programAnchor) { entry.material.dispose(); entry.leafMaterial.dispose(); }
        this.entries.delete(index); continue;
      }
      entry.state = displayTransition(entry.station, train);
      const motion = flapMotion(entry.state.progress);
      entry.material.uniforms.angle.value = motion.angle;
      if (entry.turn !== motion.turn) {
        entry.turn = motion.turn;
        entry.material.uniforms.oldImage.value = this.texture(flapPage(entry.state, motion.turn));
        entry.material.uniforms.newImage.value = this.texture(flapPage(entry.state, motion.turn + 1));
      }
    }
  }
  stats() {
    return { destinationDisplays: [...this.entries.values()].map(({ station, state, turn, material }) => ({ station: station.index,
      from: state.from, to: state.to, progress: state.progress, startsAt: state.start, finishesAt: state.finish,
      flapTurn: turn, flapAngle: material.uniforms.angle.value })) };
  }
}
