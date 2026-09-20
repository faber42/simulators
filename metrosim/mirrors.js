import * as T from '../pinsim/three.module.min.js';
import { point, trackX, station, FIRST_STATION, BLOCK } from './route.mjs';

// Platform dispatch monitor showing a horizontally reversed rearward camera.
// Keep the historical module/class name for the existing inspection hooks.
export class PlatformMirror {
  constructor(scene, materials) {
    this.scene = scene; this.rig = new T.Group(); scene.add(this.rig);
    // More source pixels than the monitor occupies at the stopping position,
    // without spending a full large render pass on a distant postage stamp.
    this.target = new T.WebGLRenderTarget(576, 384, { type: T.HalfFloatType, samples: 4,
      generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
    this.target.texture.anisotropy = 4;
    this.camera = new T.PerspectiveCamera(28, 1.5, .1, 130); this.camera.layers.enable(1);
    this.material = new T.ShaderMaterial({ uniforms: { image: { value: this.target.texture }, sourceSize: { value: new T.Vector2(this.target.width, this.target.height) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D image;
        uniform vec2 sourceSize;
        varying vec2 vUv;
        void main() {
          vec2 uv = vec2(1. - vUv.x, vUv.y);
          // Projected pixel footprint, including viewing angle and device DPI.
          // Mipmaps average all covered source texels instead of picking a
          // different bright rail/window/light on successive approach frames.
          float footprint = max(length(dFdx(uv) * sourceSize), length(dFdy(uv) * sourceSize));
          float bias = mix(.15, .65, smoothstep(2., 32., footprint));
          vec3 c = texture2D(image, uv, bias).rgb;
          gl_FragColor = vec4(c * .9 + vec3(.014, .018, .018), 1.);
        }` });
    const box = (w, h, d, y, z, material) => { const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material); mesh.position.set(0, y, z); this.rig.add(mesh); return mesh; };
    box(.1, 2.7, .12, 2.0, -.24, materials.steel);
    box(.38, .08, .38, .986, -.24, materials.steel);
    // An actual open bezel, not two full plates a few millimetres behind the
    // picture. Those plates quantized to the same distant depth as the screen
    // and intermittently covered large triangular portions of its image.
    box(2.07, 1.43, .04, 2.94, -.16, materials.dark);
    const rim = (width, height, inset, depth, z, material) => {
      for (const side of [-1, 1]) {
        box(width, inset, depth, 2.94 + side * (height - inset) / 2, z, material);
        box(inset, height - inset * 2, depth, 2.94, z, material).position.x = side * (width - inset) / 2;
      }
    };
    rim(2.07, 1.43, .04, .22, -.03, materials.dark);
    rim(1.99, 1.35, .04, .025, .08, materials.steel);
    this.surface = new T.Mesh(new T.PlaneGeometry(1.91, 1.27), this.material); this.surface.position.set(0, 2.94, .08); this.rig.add(this.surface);
    const label = new T.Mesh(new T.PlaneGeometry(1.77, .18), materials.sign('ZUGABFERTIGUNG', 'vehicle'));
    label.position.set(0, 3.79, .04); this.rig.add(label);
    this.rig.visible = false; this.active = false;
  }
  update(train) {
    let st = station(Math.max(0, Math.floor((train.s - FIRST_STATION) / BLOCK)));
    if (train.s > st.end + 14) st = station(st.index + 1);
    this.station = st;
    this.rig.visible = st.stop - train.s < 210 && train.s < st.end + 14;
    // Keep every visible feed live, including its filtered mip levels. A frozen
    // distant frame switching to live at 68 m looked like a lighting/LOD jump.
    this.active = this.rig.visible;
    const mirrorS = st.stop + 7.5, p = point(mirrorS, st.side * 2.5), driver = point(st.stop);
    this.rig.position.set(p[0] - trackX(train.s), 0, p[2] + train.s);
    this.rig.rotation.y = Math.atan2(driver[0] - p[0], driver[2] - p[2]);
    const eyeOffset = st.side * st.curve < 0 ? 2.5 : 3.15;
    const eye = point(st.stop + 3.5, st.side * eyeOffset, 3.65), target = point(st.stop - 12, st.side * 1.5, 1);
    this.camera.position.set(eye[0] - trackX(train.s), eye[1], eye[2] + train.s);
    this.camera.lookAt(target[0] - trackX(train.s), target[1], target[2] + train.s);
  }
  render(renderer) {
    if (!this.active) return;
    const target = renderer.getRenderTarget(), fogDensity = this.scene.fog.density;
    this.rig.visible = false; this.scene.fog.density = .003;
    renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera);
    this.scene.fog.density = fogDensity; this.rig.visible = true; renderer.setRenderTarget(target);
  }
}
