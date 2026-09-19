import * as T from '../pinsim/three.module.min.js';
import { point } from './route.mjs';

export const LIGHT_FILTER_PIXELS = 5;
export const LIGHT_DIAMETER = .22;
export const LIGHT_FADE_START = 35;
export const LIGHT_FADE_END = 65;

export function distantLightMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending,
    fog: true, toneMapped: false,
    uniforms: { ...T.UniformsUtils.clone(T.UniformsLib.fog), viewportHeight: { value: 900 }, color: { value: new T.Color('#fff3d2').multiplyScalar(4) } },
    vertexShader: `
      uniform float viewportHeight;
      varying vec2 lightUv;
      varying float lightEnergy;
      varying float lightDepth;
      void main() {
        vec4 centre = modelViewMatrix * vec4(position, 1.0);
        float depth = max(0.1, -centre.z);
        float pixelsPerMetre = projectionMatrix[1][1] * viewportHeight * 0.5 / depth;
        float projected = ${LIGHT_DIAMETER.toFixed(2)} * pixelsPerMetre;
        float footprint = max(${LIGHT_FILTER_PIXELS.toFixed(1)}, projected);
        // Keep the apparent luminous area, not a constant-brightness five-pixel
        // dot. The Gaussian footprint stays sampled even below one pixel.
        lightEnergy = pow(projected / footprint, 2.0) * smoothstep(${LIGHT_FADE_START.toFixed(1)}, ${LIGHT_FADE_END.toFixed(1)}, depth);
        centre.xy += (uv - 0.5) * footprint / pixelsPerMetre;
        lightUv = uv; lightDepth = depth;
        gl_Position = projectionMatrix * centre;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float fogDensity;
      varying vec2 lightUv;
      varying float lightEnergy;
      varying float lightDepth;
      void main() {
        vec2 q = (lightUv - 0.5) * 2.0;
        float coverage = max(0.0, exp(-4.0 * dot(q,q)) - exp(-4.0));
        float transmission = exp(-fogDensity * fogDensity * lightDepth * lightDepth);
        gl_FragColor = vec4(color * lightEnergy * coverage * transmission, 1.0);
      }`,
  });
}

export function filteredLampMaterial() {
  const material = new T.MeshStandardMaterial({ color: '#fff7da', emissive: '#fff3d2', emissiveIntensity: 4, roughness: .72 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float resolvedLamp = 1.0 - smoothstep(${LIGHT_FADE_START.toFixed(1)}, ${LIGHT_FADE_END.toFixed(1)}, vViewPosition.z);
      totalEmissiveRadiance *= resolvedLamp;
      diffuseColor.rgb *= resolvedLamp;`);
  };
  material.customProgramCacheKey = () => 'filtered-tunnel-lamp-v1';
  return material;
}

export class DistantLights {
  constructor(base, material) { this.origin = point(base); this.material = material; this.positions = []; this.uv = []; this.indices = []; }
  add(s, x, y) {
    // Just in front of the fixture's own housing, with ordinary scene-depth
    // testing: a tunnel bend or wall still hides lights behind it.
    const p = point(s - .6, x, y), first = this.positions.length / 3;
    for (const uv of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      this.positions.push(p[0] - this.origin[0], y, p[2] - this.origin[2]); this.uv.push(...uv);
    }
    this.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  finish(group) {
    if (!this.positions.length) return;
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2)); geometry.setIndex(this.indices);
    geometry.computeBoundingSphere(); geometry.boundingSphere.radius += 3;
    const mesh = new T.Mesh(geometry, this.material); group.add(mesh);
  }
}
