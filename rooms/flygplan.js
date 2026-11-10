// Flygplansmodeller byggda av enkla former (Måns Flyghall i Museum Aurora).
// Fabrik som tar emot three.js, så att samma modeller fungerar i båda versionerna av spelet:
//   (lagets tidigare modulversion använde samma fabrik med three r170)
//   game.js (vanligt skript, three r149):    <script src="rooms/flygplan.js"> före game.js
// Koordinater: nosen pekar mot +Z, Y uppåt, gruppens origo = marken under planet.
window.makeAircraft = function makeAircraft(THREE) {
  'use strict';
  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function toTexture(canvas, { srgb = true, repeat = [1, 1], wrap = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) { if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; } // works on old and new three.js
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    return t;
  }

  /** Splinter camouflage pattern. */
  function makeCamoTexture(repeat = 1) {
    const S = 512;
    const [c, g] = makeCanvas(S, S);
    const r = rng(39);
    const colors = ['#5d6b45', '#3f4a2e', '#7c6b4a', '#2a2c25', '#8a8f72'];
    g.fillStyle = colors[0];
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 70; k++) {
      g.fillStyle = colors[1 + Math.floor(r() * (colors.length - 1))];
      const cx = r() * S, cy = r() * S, n = 4 + Math.floor(r() * 3), rad = 30 + r() * 90;
      const p = new Path2D();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.8;
        const rr = rad * (0.5 + r() * 0.7);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        i ? p.lineTo(px, py) : p.moveTo(px, py);
      }
      p.closePath();
      // Rita varje fläck på alla sidor så att mönstret går att upprepa sömlöst
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.save(); g.translate(dx, dy); g.fill(p); g.restore();
      }
    }
    return toTexture(c, { repeat: [repeat, repeat] });
  }

  /** Fictional wing insignia: concentric rings. */
  function makeRoundelTexture() {
    const S = 256;
    const [c, g] = makeCanvas(S, S);
    [[S / 2 - 2, '#f2f2f2'], [S / 2 - 18, '#20324f'], [S / 2 - 52, '#f2f2f2'], [S / 2 - 70, '#c8a23a']].forEach(([r, col]) => {
      g.fillStyle = col;
      g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill();
    });
    return toTexture(c, { wrap: false });
  }


  let roundelTex = null;

  /** Halv vingkontur [[x, z], ...] från rot-framkant → spets → rot-bakkant, speglas till hel vinge. */
  function mirroredShape(half) {
    const right = half.map(([x, z]) => new THREE.Vector2(x, z));
    const left = half.slice().reverse().map(([x, z]) => new THREE.Vector2(-x, z));
    return new THREE.Shape([...right, ...left]);
  }

  /** Tunn horisontell platta (vinge/canard). Formens y-axel blir +Z (framåt). */
  function flatPlate(shape, thickness, material) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.35,
      bevelSize: 0.025,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geo.translate(0, 0, -thickness / 2);
    geo.rotateX(Math.PI / 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  /** Tunn vertikal platta (fena). Konturen ges som [[z, y], ...]. */
  function finPlate(side, thickness, material) {
    const shape = new THREE.Shape(side.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.35,
      bevelSize: 0.025,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geo.translate(0, 0, -thickness / 2);
    geo.rotateY(-Math.PI / 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  function landingGear(group, { x, z, topY, wheelR, metal, tire }) {
    const len = topY - wheelR;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, len, 10), metal);
    strut.position.set(x, wheelR + len / 2, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.2, 24), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, wheelR, z);
    group.add(strut, wheel);
    return [strut, wheel];
  }

  /**
   * Bygger ett jetplan utifrån en specifikation.
   * spec: { name, length, radius, wing, canard?, canardY?, fin, material, intakes?, gearZ:[nose, main], mainGearX }
   */
  function buildJet(spec) {
    const g = new THREE.Group();
    g.name = spec.name;
    const L = spec.length, R = spec.radius, H = spec.height ?? 2.0;
    const skin = spec.material;
    const wingMat = spec.wingMaterial ?? skin;

    const body = new THREE.Group();
    body.position.y = H;
    g.add(body);

    // Flygkropp (rotationskropp)
    const profile = [
      [0.001, -L / 2], [R * 0.62, -L / 2], [R * 0.93, -L / 2 + 0.7], [R, -L * 0.08],
      [R * 0.96, L * 0.16], [R * 0.74, L * 0.3], [R * 0.42, L * 0.41], [R * 0.16, L * 0.48], [0.001, L / 2],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const fuseGeo = new THREE.LatheGeometry(profile, 48);
    fuseGeo.rotateX(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuseGeo, skin);
    fuselage.scale.set(1, 0.92, 1);
    body.add(fuselage);

    // Ryggås
    const spineGeo = new THREE.CapsuleGeometry(R * 0.35, L * 0.42, 6, 16);
    spineGeo.rotateX(Math.PI / 2);
    const spine = new THREE.Mesh(spineGeo, skin);
    spine.position.set(0, R * 0.62, -L * 0.08);
    body.add(spine);

    // Cockpitkupol
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x1a2a3a, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02,
      transparent: true, opacity: 0.72, envMapIntensity: 1.6,
    });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(1, 0.95, 3.0);
    canopy.position.set(0, R * 0.58, L * 0.25);
    body.add(canopy);

    // Luftintag
    if (spec.intakes) {
      for (const s of [-1, 1]) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(R * 0.55, R * 1.05, L * 0.2), skin);
        intake.position.set(s * R * 0.92, -R * 0.05, L * 0.1);
        body.add(intake);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.45, R * 0.9), new THREE.MeshBasicMaterial({ color: 0x050505 }));
        hole.position.set(s * R * 0.92, -R * 0.05, L * 0.2 + 0.01);
        body.add(hole);
      }
    }

    // Vinge
    const wing = flatPlate(mirroredShape(spec.wing), 0.14, wingMat);
    wing.position.y = -R * 0.25;
    body.add(wing);

    // Canardvingar
    if (spec.canard) {
      const canard = flatPlate(mirroredShape(spec.canard), 0.1, wingMat);
      canard.position.y = spec.canardY ?? R * 0.15;
      body.add(canard);
    }

    // Fena
    const fin = finPlate(spec.fin, 0.12, wingMat);
    fin.position.y = R * 0.55;
    body.add(fin);

    // Generic (fictional) insignia on the wings
    roundelTex ??= makeRoundelTexture();
    const roundelMat = new THREE.MeshStandardMaterial({
      map: roundelTex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const s of [-1, 1]) {
      const [rx, rz] = spec.roundel;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), roundelMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(s * rx, -R * 0.25 + 0.075, rz);
      body.add(m);
    }

    // Motormunstycke
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.5, roughness: 0.4 });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.52, 0.9, 32, 1, true), metal);
    nozzle.material.side = THREE.DoubleSide;
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -L / 2 - 0.3;
    body.add(nozzle);

    // Efterbrännkammarflamma (dold tills någon trycker på knappen…)
    const flames = [];
    const flameOuter = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(4, 1.6, 0.5), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const flameInner = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(1.5, 2.2, 6), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [mat, r, len] of [[flameOuter, R * 0.5, 5], [flameInner, R * 0.32, 2.6]]) {
      const geo = new THREE.ConeGeometry(r, len, 24, 1, true);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -len / 2);
      const f = new THREE.Mesh(geo, mat);
      f.position.z = -L / 2 - 0.7;
      f.visible = false;
      f.userData.baseLen = len;
      body.add(f);
      flames.push(f);
    }

    // Landningsställ
    const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const gear = landingGear(g, { x: 0, z: spec.gearZ[0], topY: H - R * 0.7, wheelR: 0.28, metal, tire });
    for (const s of [-1, 1]) {
      gear.push(...landingGear(g, { x: s * spec.mainGearX, z: spec.gearZ[1], topY: H - R * 0.4, wheelR: 0.36, metal, tire }));
    }
    g.userData.gear = gear;

    g.traverse((o) => {
      if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.userData.flames = flames;
    g.userData.body = body;
    return g;
  }

  function paint(color, metalness, roughness, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: 1.2, ...extra });
  }

  /** Delta-wing fighter with canards. */
  function buildDeltaFighter() {
    const grey = paint(0x8b929b, 0.35, 0.42);
    return buildJet({
      name: 'Multirole Delta Fighter', length: 14.1, radius: 0.72, height: 1.55, material: grey, intakes: true,
      wing: [[0.5, 0.2], [4.2, -3.9], [4.2, -4.6], [0.5, -6.6]],
      canard: [[0.55, 3.7], [2.6, 2.35], [2.6, 1.85], [0.55, 1.75]],
      canardY: 0.12,
      fin: [[-3.2, 0], [-6.4, 3.1], [-7.2, 3.1], [-7.0, 0]],
      roundel: [3.0, -3.9],
      gearZ: [4.3, -2.6], mainGearX: 1.2,
    });
  }

  /** Double-delta interceptor in bare metal. */
  function buildDoubleDeltaJet() {
    const alu = paint(0xc3c8ce, 0.45, 0.3);
    return buildJet({
      name: 'Double-Delta Interceptor', length: 15.2, radius: 0.8, height: 1.12, material: alu, intakes: false,
      wing: [[0.5, 3.4], [1.7, -1.0], [4.7, -5.0], [4.7, -5.8], [0.5, -6.9]],
      fin: [[-3.4, 0], [-6.8, 3.3], [-7.6, 3.3], [-7.5, 0]],
      roundel: [3.3, -4.6],
      gearZ: [3.8, -2.4], mainGearX: 1.6,
    });
  }

  /** Attack jet with large canards and splinter camouflage. */
  function buildCanardJet() {
    const camo = makeCamoTexture(1);
    const camoWing = makeCamoTexture(0.18);
    const body = paint(0xffffff, 0.15, 0.6, { map: camo });
    const wing = paint(0xffffff, 0.15, 0.6, { map: camoWing });
    return buildJet({
      name: 'Canard Attack Jet', length: 16.3, radius: 0.85, height: 1.18, material: body, wingMaterial: wing, intakes: true,
      wing: [[0.6, -1.2], [3.1, -4.0], [5.3, -5.4], [5.3, -6.2], [0.6, -7.4]],
      canard: [[0.75, 3.6], [3.4, 1.2], [3.4, 0.5], [0.75, 0.4]],
      canardY: 0.45,
      fin: [[-2.8, 0], [-6.9, 3.8], [-7.9, 3.8], [-7.7, 0]],
      roundel: [3.6, -5.3],
      gearZ: [5.0, -3.6], mainGearX: 1.8,
    });
  }

  return { buildJet, buildDeltaFighter, buildDoubleDeltaJet, buildCanardJet };
};
