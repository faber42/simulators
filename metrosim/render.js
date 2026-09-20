import * as T from '../pinsim/three.module.min.js';

const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const fragmentHeader = 'precision highp float; varying vec2 vUv;';
export class CameraRenderer {
  constructor(canvas) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.NoToneMapping;
    this.sceneTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
    this.bloomA = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
    this.bloomB = this.bloomA.clone();
    this.scene = new T.Scene(); this.camera = new T.Camera();
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), null); this.scene.add(this.quad);
    this.extract = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: this.sceneTarget.texture }, texel: { value: new T.Vector2() } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source;uniform vec2 texel;
      void main(){
        // Prefilter BEFORE applying the soft threshold. Thin fluorescent tubes
        // no longer jump across a sparse quarter-resolution sampling grid.
        vec3 c=texture2D(source,vUv).rgb*.25;
        c+=(texture2D(source,vUv+texel*vec2(-1.,-1.)).rgb+texture2D(source,vUv+texel*vec2(1.,-1.)).rgb+texture2D(source,vUv+texel*vec2(-1.,1.)).rgb+texture2D(source,vUv+texel*vec2(1.,1.)).rgb)*.1875;
        float l=max(max(c.r,c.g),c.b);float knee=clamp(l-.65,0.,.7);knee=knee*knee/2.8;
        gl_FragColor=vec4(c*max(knee,l-1.)/max(l,.0001),1.);
      }` });
    this.blur = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: null }, direction: { value: new T.Vector2() } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source;uniform vec2 direction;
      void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=texture2D(source,vUv+direction*1.384615).rgb*.316216;c+=texture2D(source,vUv-direction*1.384615).rgb*.316216;c+=texture2D(source,vUv+direction*3.230769).rgb*.070270;c+=texture2D(source,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}` });
    this.final = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: this.sceneTarget.texture }, bloom: { value: this.bloomA.texture }, exposure: { value: 1 } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source,bloom;uniform float exposure;
      float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
      void main(){
        vec2 p=vUv-.5;vec2 uv=.5+p*(1.+.015*dot(p,p));
        vec3 c=texture2D(source,uv).rgb;
        // Contact shadows are in world space. Derivatives of resolved MSAA
        // depth created unstable triangular patches around bright fixtures.
        c+=texture2D(bloom,uv).rgb*.13;
        c*=1.-.38*pow(length(p)*1.38,2.);
        c=aces(c*exposure);
        c=pow(c,vec3(1./2.2));
        c+=(noise(gl_FragCoord.xy)-.5)*.003;
        gl_FragColor=vec4(c,1.);
      }` });
  }
  resize(w, h) {
    // Fixed pixel budget keeps high-DPI panes responsive without changing FOV.
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (w * h)));
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(w, h, false);
    this.width = Math.max(1, Math.floor(w * ratio)); this.height = Math.max(1, Math.floor(h * ratio));
    this.sceneTarget.setSize(this.width, this.height);
    this.bloomA.setSize(Math.ceil(this.width / 2), Math.ceil(this.height / 2)); this.bloomB.setSize(Math.ceil(this.width / 2), Math.ceil(this.height / 2));
    this.extract.uniforms.texel.value.set(1 / this.width, 1 / this.height);
  }
  pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.camera); }
  render(scene, camera, time, exposure, mirror) {
    const start = performance.now();
    this.renderer.info.autoReset = false; this.renderer.info.reset();
    mirror?.render(this.renderer);
    this.renderer.setRenderTarget(this.sceneTarget); this.renderer.render(scene, camera);
    this.sceneDrawCalls = this.renderer.info.render.calls; this.triangles = this.renderer.info.render.triangles;
    this.pass(this.extract, this.bloomA);
    // Unit texel spacing keeps the Gaussian continuous even for a one-pixel
    // distant light; sparse wide taps produce a visible grid of halo copies.
    this.blur.uniforms.source.value = this.bloomA.texture; this.blur.uniforms.direction.value.set(1 / this.bloomA.width, 0); this.pass(this.blur, this.bloomB);
    this.blur.uniforms.source.value = this.bloomB.texture; this.blur.uniforms.direction.value.set(0, 1 / this.bloomA.height); this.pass(this.blur, this.bloomA);
    this.final.uniforms.exposure.value = exposure; this.pass(this.final, null);
    this.renderMs = performance.now() - start;
  }
}
