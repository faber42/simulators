import * as T from '../pinsim/three.module.min.js';

const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const fragmentHeader = 'precision highp float; varying vec2 vUv;';
export class CameraRenderer {
  constructor(canvas) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.NoToneMapping;
    this.sceneTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 2 });
    this.sceneTarget.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
    this.bloomA = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
    this.bloomB = this.bloomA.clone();
    this.scene = new T.Scene(); this.camera = new T.Camera();
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), null); this.scene.add(this.quad);
    this.extract = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: this.sceneTarget.texture } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source;
      void main(){vec3 c=texture2D(source,vUv).rgb;float l=max(max(c.r,c.g),c.b);gl_FragColor=vec4(c*max(0.,l-1.1)/max(l,.0001),1.);}` });
    this.blur = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: null }, direction: { value: new T.Vector2() } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source;uniform vec2 direction;
      void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=texture2D(source,vUv+direction*1.384615).rgb*.316216;c+=texture2D(source,vUv-direction*1.384615).rgb*.316216;c+=texture2D(source,vUv+direction*3.230769).rgb*.070270;c+=texture2D(source,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}` });
    this.final = new T.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false, uniforms: { source: { value: this.sceneTarget.texture }, bloom: { value: this.bloomA.texture }, depth: { value: this.sceneTarget.depthTexture }, inverseProjection: { value: new T.Matrix4() }, time: { value: 0 }, exposure: { value: 1 }, resolution: { value: new T.Vector2() } }, fragmentShader: fragmentHeader + `
      uniform sampler2D source,bloom,depth;uniform float time,exposure;uniform vec2 resolution;uniform mat4 inverseProjection;
      float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
      vec3 viewPosition(vec2 uv){vec4 p=inverseProjection*vec4(uv*2.-1.,texture2D(depth,uv).r*2.-1.,1.);return p.xyz/p.w;}
      void main(){
        vec2 p=vUv-.5;vec2 uv=.5+p*(1.+.015*dot(p,p));
        vec3 c=texture2D(source,uv).rgb;
        vec3 pos=viewPosition(uv);vec3 normal=normalize(cross(dFdx(pos),dFdy(pos)));
        float occlusion=0.;float radius=clamp(0.55/max(-pos.z,.5),.001,.075);
        for(int i=0;i<12;i++){
          float angle=float(i)*2.39996;float ring=sqrt((float(i)+.5)/12.);
          vec2 sampleUv=uv+vec2(cos(angle)*resolution.y/resolution.x,sin(angle))*radius*ring;
          vec3 delta=viewPosition(sampleUv)-pos;float distance=length(delta);
          occlusion+=max(0.,dot(normal,delta/max(distance,.001))-.1)*(1.-smoothstep(.02,1.1,distance));
        }
        c*=1.-min(.65,occlusion*.24);
        c+=texture2D(bloom,uv).rgb*.2;
        c*=1.-.38*pow(length(p)*1.38,2.);
        c=aces(c*exposure);
        c=pow(c,vec3(1./2.2));
        c+=(noise(gl_FragCoord.xy+fract(time)*317.)-.5)*.012;
        gl_FragColor=vec4(c,1.);
      }` });
  }
  resize(w, h) {
    // Fixed pixel budget keeps high-DPI panes responsive without changing FOV.
    const ratio = Math.min(devicePixelRatio || 1, 1.6, Math.sqrt(2300000 / (w * h)));
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(w, h, false);
    this.width = Math.max(1, Math.floor(w * ratio)); this.height = Math.max(1, Math.floor(h * ratio));
    this.sceneTarget.setSize(this.width, this.height);
    this.bloomA.setSize(Math.ceil(this.width / 4), Math.ceil(this.height / 4)); this.bloomB.setSize(Math.ceil(this.width / 4), Math.ceil(this.height / 4));
    this.final.uniforms.resolution.value.set(this.width, this.height);
  }
  pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.camera); }
  render(scene, camera, time, exposure) {
    this.final.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.renderer.setRenderTarget(this.sceneTarget); this.renderer.render(scene, camera);
    this.pass(this.extract, this.bloomA);
    for (let i = 0; i < 2; i++) {
      this.blur.uniforms.source.value = this.bloomA.texture; this.blur.uniforms.direction.value.set((1 + i * 2) / this.bloomA.width, 0); this.pass(this.blur, this.bloomB);
      this.blur.uniforms.source.value = this.bloomB.texture; this.blur.uniforms.direction.value.set(0, (1 + i * 2) / this.bloomA.height); this.pass(this.blur, this.bloomA);
    }
    this.final.uniforms.time.value = time; this.final.uniforms.exposure.value = exposure; this.pass(this.final, null);
  }
}
