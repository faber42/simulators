// A fixed diffuse light field attached to the infrastructure, evaluated per
// fragment. Unlike the nearby specular/character lights it never follows the
// camera or changes when a lamp enters the dynamic light pool.
export function infrastructureLighting(material, { lampX = 3.4, lampY = 4.3 } = {}) {
  material.userData.infrastructure = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.stationLampPosition = { value: [lampX, lampY] };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 lightCoord;
      attribute vec2 lightSpan;
      varying vec4 vLightCoord;
      varying vec2 vLightSpan;
      varying vec3 vInfrastructureNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vLightCoord = lightCoord;
      vLightSpan = lightSpan;
      vInfrastructureNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec2 stationLampPosition;
      varying vec4 vLightCoord;
      varying vec2 vLightSpan;
      varying vec3 vInfrastructureNormal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float isStation = step(0.5, abs(vLightCoord.w));
      float spacing = mix(12.0, 6.0, isStation);
      float nearestLamp = floor((vLightCoord.z - 1.5) / spacing + 0.5) * spacing + 1.5;
      vec3 fixedLight = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        float lampS = nearestLamp + float(i) * spacing;
        float side = mod(floor(lampS / 12.0), 2.0) * 2.0 - 1.0;
        float lampX = side * 2.35 + (side > 0.0 ? vLightSpan.y : -vLightSpan.x);
        lampX = mix(lampX, vLightCoord.w * stationLampPosition.x, isStation);
        vec3 delta = vec3(lampX, mix(2.9, stationLampPosition.y, isStation), lampS) - vLightCoord.xyz;
        float distanceSquared = dot(delta, delta);
        vec3 toLight = normalize(vec3(delta.xy, -delta.z));
        float facing = 0.14 + 0.86 * max(0.0, dot(normalize(vInfrastructureNormal), toLight));
        fixedLight += mix(vec3(1.0, 0.88, 0.69), vec3(0.87, 0.96, 0.9), isStation)
          * mix(2.3, 3.6, isStation) * facing / (1.0 + distanceSquared * 0.38);
      }
      totalEmissiveRadiance += diffuseColor.rgb * fixedLight;`);
  };
  material.customProgramCacheKey = () => 'infrastructure-light-v2';
  return material;
}
