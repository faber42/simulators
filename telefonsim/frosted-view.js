import * as THREE from '../pinsim/three.module.min.js';

// Only camera 3 uses these passes. The same world and cameras still supply the
// geometry; blurring the lower pass cannot soften the upper devices or labels.
export class FrostedView {
  constructor() {
    this.lower = new THREE.WebGLRenderTarget(1, 1);
    this.upper = new THREE.WebGLRenderTarget(1, 1);
    this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { lowerImage: { value: this.lower.texture }, upperImage: { value: this.upper.texture },
        texel: { value: new THREE.Vector2(1, 1) }, amount: { value: 0 }, milk: { value: new THREE.Color('#8b9b96') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `
        uniform sampler2D lowerImage, upperImage;
        uniform vec2 texel;
        uniform float amount;
        uniform vec3 milk;
        varying vec2 vUv;
        void main(){
          vec3 sharp=texture2D(lowerImage,vUv).rgb;
          vec3 blurred=vec3(0.0);
          for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++) {
            blurred+=texture2D(lowerImage,vUv+vec2(float(x),float(y))*texel*2.2).rgb/25.0;
          }
          float grey=dot(blurred,vec3(.2126,.7152,.0722));
          vec3 frosted=mix(mix(blurred,vec3(grey),.55),milk,.38);
          vec3 color=mix(sharp,frosted,amount);
          vec4 upper=texture2D(upperImage,vUv);
          gl_FragColor=vec4(color*(1.0-upper.a*amount)+upper.rgb*amount,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }
  render(renderer, scene, camera, viewport, reveal) {
    const [x, y, width, height] = viewport, ratio = renderer.getPixelRatio();
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (this.lower.width !== w || this.lower.height !== h) {
      this.lower.setSize(w, h); this.upper.setSize(w, h);
      this.material.uniforms.texel.value.set(1 / w, 1 / h);
    }
    const background = scene.background, autoClear = renderer.autoClear, mask = camera.layers.mask;
    const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    renderer.autoClear = true; renderer.setScissorTest(false);
    camera.layers.set(0); renderer.setRenderTarget(this.lower); renderer.render(scene, camera);
    scene.background = null; renderer.setClearColor(0, 0);
    camera.layers.set(1); renderer.setRenderTarget(this.upper); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.setViewport(x, y, width, height); renderer.setScissor(x, y, width, height); renderer.setScissorTest(true);
    renderer.autoClear = false; renderer.clearDepth();
    this.material.uniforms.amount.value = reveal; renderer.render(this.scene, this.camera);
    camera.layers.set(2); renderer.render(scene, camera);
    camera.layers.mask = mask; scene.background = background;
    renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha);
  }
}
