import * as T from '../pinsim/three.module.min.js';
import { displayTransition, flapMotion, flapPage } from './destination-display.mjs';

const WIDTH = 1024, HEIGHT = 240;
const LEAF_COLOR = '#f3f3ef', INK_COLOR = '#101313';
export function drawDestinationDisplay(c, display) {
  // Black ink on white-painted metal, with shallow pressed edge lips.
  c.fillStyle = LEAF_COLOR; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = '#ffffff'; c.fillRect(0, 2, WIDTH, 2); c.fillRect(0, 122, WIDTH, 2);
  c.fillStyle = '#b7bcb8'; c.fillRect(0, 117, WIDTH, 3); c.fillRect(0, 237, WIDTH, 3);
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
      void main() {
        vec3 color; float shade;
        #ifdef FALLING_LEAF
          vec2 face = vec2(vUv.x, gl_FrontFacing ? .5 + .5 * vUv.y : .5 - .5 * vUv.y);
          color = gl_FrontFacing ? texture2D(oldImage, face).rgb : texture2D(newImage, face).rgb;
          vec3 n = vec3(0., -sin(angle), cos(angle)) * (gl_FrontFacing ? 1. : -1.);
          shade = .48 + .40 * max(0., dot(n, normalize(vec3(0., .65, 1.))));
          // Thin painted edge of the moving sheet, filtered at a distance.
          float edge = smoothstep(0., max(fwidth(vUv.y), .006), vUv.y) * smoothstep(0., max(fwidth(vUv.y), .006), 1. - vUv.y);
          shade *= .82 + .18 * edge;
        #else
          color = vUv.y > .5 ? texture2D(newImage, vUv).rgb : texture2D(oldImage, vUv).rgb;
          shade = .815;
          // Soft shadow under the sheet reinforces its depth without another
          // render target or transparent plane fighting the printed surface.
          shade *= 1. - .48 * sin(angle) * exp(-abs(vUv.y - .5) / .22);
        #endif
        gl_FragColor = vec4(color * shade, 1.);
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
