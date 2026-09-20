import * as T from '../pinsim/three.module.min.js';
import { point, trackX, station, FIRST_STATION, BLOCK } from './route.mjs';

// Platform dispatch monitor showing a horizontally reversed rearward camera.
// Keep the historical module/class name for the existing inspection hooks.
export class PlatformMirror {
  constructor(scene, materials) {
    this.scene = scene; this.rig = new T.Group(); scene.add(this.rig);
    this.target = new T.WebGLRenderTarget(768, 512, { type: T.HalfFloatType, samples: 4,
      generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
    this.target.texture.anisotropy = 4;
    this.camera = new T.PerspectiveCamera(28, 1.5, .1, 130); this.camera.layers.enable(1);
    this.material = new T.ShaderMaterial({ uniforms: { image: { value: this.target.texture }, sourceSize: { value: new T.Vector2(768, 512) } },
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
    box(.1, 2.7, .12, 2.0, -.06, materials.steel);
    box(.38, .08, .38, .986, -.06, materials.steel);
    box(2.07, 1.43, .16, 2.94, 0, materials.dark);
    box(1.99, 1.35, .018, 2.94, .09, materials.steel);
    this.surface = new T.Mesh(new T.PlaneGeometry(1.91, 1.27), this.material); this.surface.position.set(0, 2.94, .105); this.rig.add(this.surface);
    const label = new T.Mesh(new T.PlaneGeometry(1.77, .18), materials.sign('ZUGABFERTIGUNG', 'vehicle'));
    label.position.set(0, 3.79, .04); this.rig.add(label);
    this.rig.visible = false; this.active = false;
  }
  update(train) {
    let st = station(Math.max(0, Math.floor((train.s - FIRST_STATION) / BLOCK)));
    if (train.s > st.end + 14) st = station(st.index + 1);
    this.needsImage ||= this.station?.index !== st.index;
    this.station = st;
    this.rig.visible = st.stop - train.s < 210 && train.s < st.end + 14;
    this.active = this.rig.visible && Math.abs(st.stop - train.s) < 68;
    const mirrorS = st.stop + 7.5, p = point(mirrorS, st.side * 2.5), driver = point(st.stop);
    this.rig.position.set(p[0] - trackX(train.s), 0, p[2] + train.s);
    this.rig.rotation.y = Math.atan2(driver[0] - p[0], driver[2] - p[2]);
    const eyeOffset = st.side * st.curve < 0 ? 2.5 : 3.15;
    const eye = point(st.stop + 1.5, st.side * eyeOffset, 2.3), target = point(st.stop - 24, st.side * 1.5, 1.3);
    this.camera.position.set(eye[0] - trackX(train.s), eye[1], eye[2] + train.s);
    this.camera.lookAt(target[0] - trackX(train.s), target[1], target[2] + train.s);
  }
  render(renderer) {
    if (!this.rig.visible || !this.active && !this.needsImage) return;
    const target = renderer.getRenderTarget(), fogDensity = this.scene.fog.density;
    this.rig.visible = false; this.scene.fog.density = .003;
    renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera);
    this.scene.fog.density = fogDensity; this.rig.visible = true; renderer.setRenderTarget(target);
    this.needsImage = false;
  }
}
