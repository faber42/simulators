import * as T from '../pinsim/three.module.min.js';
import { displayTransition } from './destination-display.mjs';

const WIDTH = 1024, HEIGHT = 240;
export function drawDestinationDisplay(c, display) {
  c.fillStyle = '#080e10'; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = '#e8b760'; c.textBaseline = 'middle'; c.textAlign = 'left';
  if (display.mode === 'departures') {
    display.rows.forEach((row, index) => {
      const y = 40 + index * 80;
      c.font = 'bold 57px Arial'; c.fillText(row.line, 28, y);
      c.font = '55px Arial'; c.fillText(row.destination, 187, y, 615);
      c.textAlign = 'right'; c.font = '49px Arial'; c.fillText(`${row.minutes} Min`, 991, y); c.textAlign = 'left';
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
      c.fillStyle = '#080e10';
      for (let window = 0; window < 4; window++) c.fillRect(x + 9 + window * (carWidth - 23) / 4, 158, (carWidth - 36) / 4, 13);
      c.fillStyle = '#e8b760';
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
    this.programAnchor ??= this.material(station); return this.programAnchor;
  }
  texture(display) {
    const key = JSON.stringify(display);
    if (!this.textures.has(key)) this.textures.set(key, this.makeTexture(display));
    return this.textures.get(key);
  }
  material(station) {
    if (this.entries.has(station.index)) return this.entries.get(station.index).material;
    const state = displayTransition(station, { s: 0 });
    const material = new T.ShaderMaterial({ fog: true, uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      oldImage: { value: this.texture(state.from) }, newImage: { value: this.texture(state.to) }, progress: { value: 0 },
    }, vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`, fragmentShader: `
      uniform sampler2D oldImage, newImage;
      uniform float progress;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      vec3 page(float nextPage, vec2 uv) {
        return mix(texture2D(oldImage, uv).rgb, texture2D(newImage, uv).rgb, nextPage);
      }
      void main() {
        // Independent split-flap modules with a horizontal hinge. Each makes
        // three turns; the final turn replaces the old face with the new one.
        vec2 grid = vec2(24., 3.);
        vec2 cell = floor(vec2(vUv.x, 1. - vUv.y) * grid);
        vec2 local = fract(vec2(vUv.x, 1. - vUv.y) * grid);
        float seed = fract(sin(dot(cell, vec2(13.13, 71.7))) * 43758.5);
        float delay = .7 * cell.x / 23. + .12 * cell.y / 2. + .025 * seed;
        float turn = clamp((progress - delay) / .155, 0., 1.);
        vec3 color;
        if (progress <= 0. || turn <= 0.) color = page(0., vUv);
        else if (progress >= 1. || turn >= 1.) color = page(1., vUv);
        else {
          float cycle = turn * 3.; float flip = fract(cycle);
          float nextPage = step(2., cycle);
          color = page(local.y < .5 ? nextPage : 0., vUv);
          float fold = cos(flip * 3.14159265), reach = max(abs(fold), .001);
          bool upper = flip < .5 && local.y <= .5 && local.y >= .5 - .5 * reach;
          bool lower = flip >= .5 && local.y >= .5 && local.y <= .5 + .5 * reach;
          if (upper || lower) {
            vec2 face = vec2(local.x, .5 + (local.y - .5) / reach);
            vec2 uv = (cell + face) / grid; uv.y = 1. - uv.y;
            color = page(upper ? 0. : nextPage, uv) * (.58 + .42 * reach);
          }
        }
        // Resolve tiny hinges into their average instead of shimmering lines.
        float aa = max(fwidth(local.y), .001);
        float hinge = (1. - smoothstep(.012, .012 + aa, abs(local.y - .5))) * (1. - smoothstep(.02, .08, aa));
        color *= 1. - .42 * hinge;
        gl_FragColor = vec4(color * 1.05, 1.);
        #include <fog_fragment>
      }` });
    this.entries.set(station.index, { station, material, state }); return material;
  }
  update(train, from, to) {
    for (const [index, entry] of this.entries) {
      if (entry.station.end < from || entry.station.start > to) {
        if (entry.material !== this.programAnchor) entry.material.dispose();
        this.entries.delete(index); continue;
      }
      entry.state = displayTransition(entry.station, train);
      entry.material.uniforms.progress.value = entry.state.progress;
    }
  }
  stats() {
    return { destinationDisplays: [...this.entries.values()].map(({ station, state }) => ({ station: station.index,
      from: state.from, to: state.to, progress: state.progress, startsAt: state.start, finishesAt: state.finish })) };
  }
}
