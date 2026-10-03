/**
 * Shared street-lamp irradiance field. Baked once in world coordinates and
 * sampled by ordinary scene materials, including moving/instanced vehicles.
 * This adds no per-lamp lights, shadow maps, timers or per-frame CPU work.
 */
export function createStreetLighting(THREE, environment = {}) {
  const settings = environment.streetLights || {};
  const bounded = (value, fallback, low, high) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : fallback));
  function profileFor(spec) {
    const profile = { color: '#f0f4ff', intensity: 4.5, radius: 20, forward: 6, spread: 1.15,
      ...(settings.profiles?.[spec.profile || settings.defaultProfile] || {}), ...spec.lighting };
    return { color: profile.color, intensity: bounded(profile.intensity, 4.5, 0, 30),
      radius: bounded(profile.radius, 20, 4, 100), forward: bounded(profile.forward, 6, -20, 30),
      spread: bounded(profile.spread, 1.15, .5, 4) };
  }
  const emitters = (environment.lights || []).flatMap(spec => {
    const profile = profileFor(spec), rotation = spec.rotation || 0, height = spec.height || 10;
    return (spec.double ? [1, -1] : [1]).map(side => {
      const armX = Math.sin(rotation) * side, armZ = Math.cos(rotation) * side;
      const x = spec.x + armX * 2.25, z = spec.z + armZ * 2.25;
      return { ...profile, color: new THREE.Color(profile.color), x, z, height,
        centerX: x + armX * profile.forward, centerZ: z + armZ * profile.forward,
        armX, armZ, alongX: armZ, alongZ: -armX };
    });
  });
  const uniforms = { streetLightStrength: { value: 0 } };
  const installed = new WeakSet();
  let texture = null;
  if (emitters.length) {
    const margin = emitter => emitter.radius * Math.max(1, 1 / emitter.spread) + 2;
    const minX = Math.min(...emitters.map(e => e.centerX - margin(e))), maxX = Math.max(...emitters.map(e => e.centerX + margin(e)));
    const minZ = Math.min(...emitters.map(e => e.centerZ - margin(e))), maxZ = Math.max(...emitters.map(e => e.centerZ + margin(e)));
    const resolution = Math.round(bounded(settings.resolution, 256, 64, 512));
    const field = new Float32Array(resolution * resolution * 4);
    let peak = 1;
    for (let row = 0; row < resolution; row++) for (let column = 0; column < resolution; column++) {
      const x = minX + (column + .5) / resolution * (maxX - minX), z = minZ + (row + .5) / resolution * (maxZ - minZ);
      const index = (row * resolution + column) * 4;
      let weight = 0, ceiling = 0;
      for (const lamp of emitters) {
        const dx = x - lamp.centerX, dz = z - lamp.centerZ;
        const along = (dx * lamp.alongX + dz * lamp.alongZ) / lamp.radius;
        const across = (dx * lamp.armX + dz * lamp.armZ) / (lamp.radius / lamp.spread);
        const r2 = along * along + across * across;
        if (r2 >= 1) continue;
        // Smooth broad pool with a brighter centre and no visible hard edge.
        const falloff = (1 - r2) ** 2 * lamp.intensity;
        field[index] += lamp.color.r * falloff;
        field[index + 1] += lamp.color.g * falloff;
        field[index + 2] += lamp.color.b * falloff;
        weight += falloff; ceiling += lamp.height * falloff;
      }
      field[index + 3] = weight ? ceiling / weight : 0;
      peak = Math.max(peak, field[index], field[index + 1], field[index + 2]);
    }
    const pixels = new Uint8Array(field.length);
    for (let i = 0; i < field.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) pixels[i + channel] = Math.round(field[i + channel] / peak * 255);
      pixels[i + 3] = Math.round(Math.min(1, field[i + 3] / 32) * 255);
    }
    texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
    Object.assign(uniforms, { streetLightField: { value: texture }, streetLightScale: { value: peak },
      streetLightBounds: { value: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) } });
  }

  function applyMaterial(material) {
    if (!texture || !material?.isMeshStandardMaterial || installed.has(material)) return;
    installed.add(material);
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = function(shader, renderer) {
      compile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vStreetWorldPosition;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 streetWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          streetWorldPosition = batchingMatrix * streetWorldPosition;
        #endif
        #ifdef USE_INSTANCING
          streetWorldPosition = instanceMatrix * streetWorldPosition;
        #endif
        vStreetWorldPosition = (modelMatrix * streetWorldPosition).xyz;
      `);
      shader.fragmentShader = `
        varying vec3 vStreetWorldPosition;
        uniform sampler2D streetLightField;
        uniform vec4 streetLightBounds;
        uniform float streetLightScale;
        uniform float streetLightStrength;
        ${shader.fragmentShader}
      `.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        if (streetLightStrength > 0.0001) {
          vec2 streetUv = (vStreetWorldPosition.xz - streetLightBounds.xy) * streetLightBounds.zw;
          if (all(greaterThanEqual(streetUv, vec2(0.0))) && all(lessThanEqual(streetUv, vec2(1.0)))) {
            vec4 streetPool = texture2D(streetLightField, streetUv);
            float streetCeiling = max(1.0, streetPool.a * 32.0);
            float streetHeight = 1.0 - smoothstep(streetCeiling * 0.65, streetCeiling + 1.0, vStreetWorldPosition.y);
            vec3 streetNormal = inverseTransformDirection(normal, viewMatrix);
            float streetFacing = clamp(0.45 + 0.55 * streetNormal.y, 0.0, 1.0);
            vec3 streetIrradiance = streetPool.rgb * streetLightScale * streetLightStrength * streetHeight * streetFacing;
            reflectedLight.indirectDiffuse += material.diffuseColor * streetIrradiance * RECIPROCAL_PI;
          }
        }
      `);
    };
    material.customProgramCacheKey = () => `${cacheKey()}|street-irradiance-v1`;
    material.needsUpdate = true;
  }
  function applyTo(object) {
    object.traverse(child => {
      if (!child.material) return;
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(applyMaterial);
    });
  }
  function setLighting({ daylight = 1 } = {}) {
    const t = bounded((daylight - .12) / .63, 1, 0, 1);
    uniforms.streetLightStrength.value = 1 - t * t * (3 - 2 * t);
  }
  return { profileFor, emitters, uniforms, texture, applyMaterial, applyTo, setLighting,
    dispose() { texture?.dispose(); } };
}
