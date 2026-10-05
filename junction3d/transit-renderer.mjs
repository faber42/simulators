/** Procedural articulated light rail vehicles and their fixed white-bar signals. */
export function createTransitRenderer(THREE, scene, config) {
  const root = new THREE.Group(); root.name = 'Rail transit'; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = value => (geometries.add(value), value);
  const mat = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: .58, ...options });
    materials.add(value); return value;
  };
  const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const wheelGeo = geometry(new THREE.CylinderGeometry(.36, .36, .16, 16)); wheelGeo.rotateZ(Math.PI / 2);
  const shell = mat('#eeeae0', { metalness: .26, roughness: .38 });
  const red = mat('#a82130', { metalness: .3, roughness: .38 });
  const dark = mat('#242d2e', { roughness: .81 });
  const rubber = mat('#343b3a', { roughness: .94 });
  const glazing = mat('#344e5d', { metalness: .53, roughness: .17, emissive: '#7898a7', emissiveIntensity: 0 });
  const passengerGlazing = mat('#344e5d', { metalness: .53, roughness: .17, emissive: '#edd4a1', emissiveIntensity: 0 });
  const metal = mat('#8b9290', { metalness: .72, roughness: .32 });
  const roof = mat('#92958e', { metalness: .35, roughness: .65 });
  const whiteLamp = mat('#fff4da', { emissive: '#fff2c3', emissiveIntensity: 1.8, roughness: .22 });
  const tailLamp = mat('#c9362e', { emissive: '#f82514', emissiveIntensity: 1.2, roughness: .24 });
  const unlitLamp = mat('#303937', { roughness: .3 });
  whiteLamp.name = 'Tram headlights'; tailLamp.name = 'Tram tail lights'; unlitLamp.name = 'Tram coupled cab lights off';
  const signalOn = new THREE.MeshBasicMaterial({ color: '#fffce8', toneMapped: false }); materials.add(signalOn);
  const signalOff = mat('#3d4544');
  const templates = new Map(), vehicles = new Map(), signals = [];
  const destinationMaterials = new Set();
  const displays = new Map();
  let nightStrength = 0;
  const unitLength = 28;
  const unitCount = spec => spec.units === 2 ? 2 : 1;
  const templateKey = spec => JSON.stringify([spec.line || 'U', spec.destination || spec.label || 'Stadtbahn', unitCount(spec)]);

  function box(parent, material, x, y, z, w, h, d, shadow = true) {
    const mesh = new THREE.Mesh(unitBox, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function bar(parent, a, b, radius, material) {
    const start = new THREE.Vector3(...a), finish = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(cylinderGeo, material);
    mesh.position.copy(start).add(finish).multiplyScalar(.5);
    mesh.scale.set(radius, start.distanceTo(finish), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), finish.sub(start).normalize());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function display(parent, label, x, y, z, width, height, rotation = 0) {
    let material = displays.get(label);
    if (!material) {
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#152021'; ctx.fillRect(0, 0, 768, 128);
      ctx.fillStyle = '#efd28a'; ctx.font = '600 64px Arial, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(label, 384, 66, 724);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
      material = mat('#ffffff', { map: texture, emissive: '#e9c977', emissiveMap: texture,
        emissiveIntensity: .3 + nightStrength * 1.4, roughness: .55 });
      destinationMaterials.add(material); displays.set(label, material);
    }
    const mesh = new THREE.Mesh(geometry(new THREE.PlaneGeometry(width, height)), material);
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; parent.add(mesh);
  }
  function polygon(parent, points, material) {
    const geo = geometry(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; parent.add(mesh); return mesh;
  }

  // Each template remains a dozen draw calls despite doors, glazing, bogies and
  // roof equipment. All resulting geometry is shared by live vehicle clones.
  function batchTemplate(group) {
    group.updateMatrixWorld(true);
    const batches = new Map();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const key = `${mesh.material.uuid}:${mesh.castShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    });
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        const copy = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        copy.applyMatrix4(mesh.matrixWorld); return copy;
      });
      const count = parts.reduce((sum, part) => sum + part.attributes.position.count, 0);
      const merged = geometry(new THREE.BufferGeometry());
      for (const attribute of ['position', 'normal', 'uv']) {
        const stride = attribute === 'uv' ? 2 : 3, values = new Float32Array(count * stride);
        let offset = 0;
        for (const part of parts) {
          if (part.attributes[attribute]) values.set(part.attributes[attribute].array, offset);
          offset += part.attributes.position.count * stride;
        }
        merged.setAttribute(attribute, new THREE.BufferAttribute(values, stride));
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, meshes[0].material); mesh.castShadow = meshes[0].castShadow; mesh.receiveShadow = true;
      meshes.forEach(original => original.removeFromParent()); group.add(mesh); parts.forEach(part => part.dispose());
    }
  }

  function makeUnit(spec, index, units) {
    const label = spec.destination || spec.label || 'Stadtbahn';
    const line = spec.line || 'U';
    const group = new THREE.Group(); group.name = `Tram unit ${index + 1}`;
    const front = index === 0, rear = index === units - 1;
    group.userData = { unitIndex: index, nominalLength: unitLength, frontLights: front, rearLights: rear, pantographRaised: front };
    // Two body sections meet at a full-height, ribbed articulation bellows.
    for (const direction of [-1, 1]) {
      const center = direction * 6.48;
      box(group, dark, 0, .72, center, 2.34, .57, 12.5);
      box(group, red, 0, 1.14, center, 2.6, .68, 12.54);
      box(group, shell, 0, 2.32, center, 2.57, 1.77, 12.54);
      box(group, shell, 0, 3.27, center, 2.59, .15, 12.55);
      box(group, red, 0, 1.51, center, 2.605, .12, 12.54);
      for (const side of [-1, 1]) {
        const sx = side * 1.296;
        for (const location of [1.7, 4.2, 6.65, 9.2, 11.15]) {
          const z = direction * location;
          const isDoor = location === 4.2 || location === 9.2;
          if (isDoor) {
            box(group, dark, sx, 1.89, z, .035, 2.13, 1.6);
            box(group, shell, sx + side * .026, 1.89, z, .029, 2.04, 1.48);
            for (const leaf of [-1, 1]) {
              box(group, passengerGlazing, sx + side * .046, 2.22, z + leaf * .375, .025, 1.1, .58);
              box(group, red, sx + side * .044, 1.24, z + leaf * .375, .03, .63, .68);
              box(group, dark, sx + side * .056, 1.84, z + leaf * .085, .032, .38, .033);
            }
            box(group, dark, sx + side * .05, 1.89, z, .035, 2.02, .023);
            box(group, metal, sx + side * .026, .83, z, .08, .075, 1.65);
          } else {
            box(group, dark, sx, 2.31, z, .04, 1.39, 1.84);
            box(group, passengerGlazing, sx + side * .026, 2.31, z, .025, 1.27, 1.7);
            box(group, metal, sx + side * .039, 2.6, z, .015, .025, 1.68);
          }
        }
      }
      box(group, roof, 0, 3.49, direction * 6, 1.72, .28, 2.8);
      for (let fin = -1; fin <= 1; fin += .2) box(group, dark, fin * .64, 3.65, direction * 6, .055, .055, 2.57);
      box(group, metal, 0, 3.48, direction * 10.4, 1.2, .26, 1.4);
      for (const side of [-1, 1]) bar(group, [side * 1.13, 3.4, direction * .7], [side * 1.13, 3.4, direction * 12.2], .025, metal);
    }
    box(group, rubber, 0, 1.95, 0, 2.34, 2.58, .54);
    for (let z = -.42; z <= .42; z += .095) {
      box(group, dark, 0, 3.2, z, 2.48, .1, .037);
      for (const side of [-1, 1]) box(group, dark, side * 1.21, 1.94, z, .085, 2.48, .038);
    }
    // Three visible rail bogies, including one beneath the articulated joint.
    for (const z of [-9.85, 0, 9.85]) {
      box(group, dark, 0, .52, z, 1.98, .43, 2.45);
      for (const axle of [-.74, .74]) {
        bar(group, [-.98, .38, z + axle], [.98, .38, z + axle], .085, metal);
        for (const side of [-1, 1]) {
          const wheel = new THREE.Mesh(wheelGeo, dark); wheel.position.set(side * .79, .38, z + axle); wheel.castShadow = true; group.add(wheel);
          const rim = new THREE.Mesh(wheelGeo, metal); rim.position.set(side * .9, .38, z + axle); rim.scale.set(.4, .58, .58); group.add(rim);
        }
      }
    }
    // Sloped cab windscreens and clipped nose corners distinguish light rail
    // from the rectangular road buses, even in a distant overview.
    for (const direction of [-1, 1]) {
      const cab = new THREE.Group(); cab.rotation.y = direction === 1 ? 0 : Math.PI; group.add(cab);
      const exterior = direction === 1 ? front : rear;
      cab.name = `Cab ${direction === 1 ? 'front' : 'rear'}`;
      cab.userData = { coupled: !exterior, lampState: exterior ? (direction === 1 ? 'white' : 'red') : 'off' };
      box(cab, shell, 0, 2.04, 12.98, 2.4, 2.22, .72);
      box(cab, red, 0, 1.19, 13.53, 2.24, .7, .46);
      polygon(cab, [[-1.18, 1.55, 13.72], [1.18, 1.55, 13.72], [1.07, 3.15, 13.24], [-1.07, 3.15, 13.24]], shell);
      polygon(cab, [[-1.3, 1.55, 12.74], [-1.18, 1.55, 13.72], [-1.07, 3.15, 13.24], [-1.3, 3.15, 12.74]], shell);
      polygon(cab, [[1.18, 1.55, 13.72], [1.3, 1.55, 12.74], [1.3, 3.15, 12.74], [1.07, 3.15, 13.24]], shell);
      polygon(cab, [[-1.04, 1.94, 13.63], [1.04, 1.94, 13.63], [.98, 2.93, 13.335], [-.98, 2.93, 13.335]], glazing);
      bar(cab, [-.12, 1.98, 13.64], [.54, 2.43, 13.51], .018, dark);
      box(cab, dark, 0, .83, 13.56, 1.95, .19, .37);
      box(cab, metal, 0, .59, 13.75, .46, .23, .48);
      for (const side of [-1, 1]) {
        box(cab, dark, side * .79, 1.29, 13.783, .36, .29, .035);
        box(cab, exterior ? (direction === 1 ? whiteLamp : tailLamp) : unlitLamp, side * .79, 1.29, 13.809, .25, .16, .025, false);
        box(cab, metal, side * 1.25, 2.6, 12.98, .18, .28, .12);
      }
      display(cab, `${line}  ${label}`, 0, 3.04, 13.303, 1.77, .24);
    }
    // Only the leading unit collects current. The other retains its complete
    // folded linkage above the roof instead of deleting its pantograph.
    const pantograph = new THREE.Group(); pantograph.position.z = -3.1;
    pantograph.name = `Pantograph ${front ? 'raised' : 'folded'}`;
    pantograph.userData = { raised: front }; group.add(pantograph);
    const pz = 0, knee = front ? 4.86 : 3.73, contact = front ? 6.02 : 3.82;
    box(pantograph, dark, 0, 3.54, pz, 1.05, .2, 1.5);
    for (const side of [-1, 1]) {
      const x = side * .36;
      bar(pantograph, [x, 3.65, pz - .55], [x, knee, pz + 1], .045, metal);
      bar(pantograph, [x, knee, pz + 1], [x, contact, pz - .38], .041, metal);
      bar(pantograph, [x, 3.65, pz + .55], [x, knee, pz - 1], .028, dark);
      bar(pantograph, [x, knee, pz - 1], [x, contact, pz + .38], .028, dark);
    }
    box(pantograph, dark, 0, contact + .015, pz, 1.7, .05, .31);
    bar(pantograph, [-1.05, contact - .11, pz], [-.78, contact + .02, pz], .025, metal);
    bar(pantograph, [.78, contact + .02, pz], [1.05, contact - .11, pz], .025, metal);
    return group;
  }

  function makeTram(spec = {}) {
    const key = templateKey(spec);
    if (templates.has(key)) return templates.get(key);
    const units = unitCount(spec), group = new THREE.Group();
    group.name = `Articulated tram ${spec.line || 'U'} · ${units} unit${units === 1 ? '' : 's'}`;
    group.userData = { nominalLength: units * unitLength, unitCount: units, templateKey: key };
    for (let index = 0; index < units; index++) {
      const unit = makeUnit(spec, index, units);
      // Couplers reach +/-13.99 m: adjacent cabs meet at the existing couplers,
      // while all bodies, bogies, doors and articulated joints stay unscaled.
      unit.position.z = ((units - 1) / 2 - index) * unitLength; group.add(unit);
    }
    batchTemplate(group);
    group.userData.nominalWidth = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).x;
    templates.set(key, group); return group;
  }

  const transitRoutes = config.transit?.routes || config.trams?.routes || [];
  for (const route of transitRoutes) {
    if (!route.stopLine) continue;
    const point = Array.isArray(route.stopLine) ? route.stopLine : route.stopLine.point;
    if (!point) continue;
    const start = route.points?.[0], end = route.points?.at(-1);
    const heading = route.heading ?? (start && end ? Math.atan2(end[0] - start[0], end[1] - start[1]) : (route.direction || 1) * Math.PI / 2);
    const position = route.signalPosition || [point[0], point[1] + (Math.sin(heading) > 0 ? -1.8 : 1.8)];
    const group = new THREE.Group(); group.position.set(position[0], 0, position[1]); group.rotation.y = heading + Math.PI; root.add(group);
    box(group, metal, 0, 1.68, 0, .09, 3.36, .09);
    box(group, dark, 0, 3.33, 0, .59, .7, .24);
    box(group, shell, 0, 3.76, -.03, .71, .08, .38);
    const halt = box(group, signalOn, 0, 3.33, .13, .37, .055, .025, false);
    const proceed = box(group, signalOff, 0, 3.33, .135, .055, .37, .025, false);
    proceed.visible = false;
    signals.push({ routeId: route.id, halt, proceed, object: group });
  }

  function update(simulation) {
    const live = new Set();
    for (const tram of simulation.trams || []) {
      live.add(tram.id);
      const spec = tram.route || transitRoutes.find(route => route.id === tram.routeId) || {};
      let model = vehicles.get(tram.id);
      if (model && (model.userData.simulationBody !== tram || model.userData.templateKey !== templateKey(spec))) {
        model.removeFromParent(); model = null;
      }
      if (!model) {
        model = makeTram(spec).clone(true); model.userData.simulationBody = tram;
        vehicles.set(tram.id, model); root.add(model);
      }
      const pose = simulation.getRenderPose?.(tram) || tram;
      model.position.set(pose.x, .12, pose.z); model.rotation.y = pose.heading;
      model.scale.x = (tram.width || config.transit?.width || 2.5) / model.userData.nominalWidth;
      model.scale.z = (tram.length || model.userData.nominalLength) / model.userData.nominalLength;
    }
    for (const [id, model] of vehicles) if (!live.has(id)) { model.removeFromParent(); vehicles.delete(id); }
    for (const signal of signals) {
      const go = simulation.getTransitSignal?.(signal.routeId) === 'green';
      signal.halt.material = go ? signalOff : signalOn;
      signal.proceed.material = go ? signalOn : signalOff;
      signal.halt.visible = !go;
      signal.proceed.visible = go;
    }
  }
  function setLighting(profile = {}) {
    const daylight = THREE.MathUtils.clamp(Number.isFinite(profile.daylight) ? profile.daylight : 1, 0, 1);
    nightStrength = 1 - daylight;
    whiteLamp.emissiveIntensity = 1.8 + nightStrength * 2.6;
    tailLamp.emissiveIntensity = 1.2 + nightStrength * .7;
    passengerGlazing.emissiveIntensity = nightStrength * .72;
    glazing.emissiveIntensity = nightStrength * .075;
    destinationMaterials.forEach(material => { material.emissiveIntensity = .3 + nightStrength * 1.4; });
  }
  return {
    group: root, vehicles, signals, update, setLighting,
    setEvening(enabled) {
      setLighting({ daylight: enabled ? .4 : 1 });
      whiteLamp.emissiveIntensity = enabled ? 3.4 : 1.8;
    },
    dispose() {
      root.removeFromParent(); geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
      vehicles.clear(); templates.clear(); displays.clear(); destinationMaterials.clear();
    },
  };
}
