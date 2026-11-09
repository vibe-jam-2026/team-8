// Själva museihallen: golv, väggar, ljus, utställningar och knappen.
import * as THREE from 'three';
import { buildDraken, buildGripen, buildViggen } from './aircraft.js';
import {
  makeBannerTexture, makeFloorTextures, makeHazardTexture, makePlaqueTexture, makeTimelineTexture,
} from './textures.js';

export const HALL = { W: 40, D: 60, H: 11 };

const hdr = (r, g, b) => new THREE.Color().setRGB(r, g, b);

function signMaterial(tex, glow = 0.3) {
  return new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.6,
  });
}

export function buildMuseum(scene) {
  const { W, D, H } = HALL;
  const colliders = []; // { x, z, r } — cirklar man inte kan gå igenom
  const flyers = []; // saker som flyger iväg när museet kraschar
  const aircraft = [];

  // ---------- Golv ----------
  const floorTex = makeFloorTextures(W / 4, D / 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      map: floorTex.map, roughnessMap: floorTex.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 0.9,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- Väggar, tak, pelare ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.92 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.55, metalness: 0.2 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  box(W + 1, H, 0.5, wallMat, 0, H / 2, -D / 2 - 0.25);
  box(W + 1, H, 0.5, wallMat, 0, H / 2, D / 2 + 0.25);
  box(0.5, H, D, wallMat, -W / 2 - 0.25, H / 2, 0);
  box(0.5, H, D, wallMat, W / 2 + 0.25, H / 2, 0);
  // Mörk sockel längs väggarna
  box(W, 1.1, 0.1, darkMat, 0, 0.55, -D / 2 + 0.05);
  box(W, 1.1, 0.1, darkMat, 0, 0.55, D / 2 - 0.05);
  box(0.1, 1.1, D, darkMat, -W / 2 + 0.05, 0.55, 0);
  box(0.1, 1.1, D, darkMat, W / 2 - 0.05, 0.55, 0);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.85 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  const beamMat = new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.6, metalness: 0.4 });
  for (let z = -D / 2 + 5; z < D / 2; z += 7) box(W, 0.6, 0.35, beamMat, 0, H - 0.3, z);

  // Lysrör i taket (glöder tack vare bloom)
  const stripMat = new THREE.MeshBasicMaterial({ color: hdr(2.6, 2.55, 2.4) });
  for (const x of [-13, -4.5, 4.5, 13]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, D - 6), stripMat);
    s.position.set(x, H - 0.7, 0);
    scene.add(s);
  }

  for (let z = -D / 2 + 5; z < D / 2; z += 10) {
    for (const s of [-1, 1]) {
      const c = box(1.0, H, 1.0, wallMat, s * (W / 2 - 0.5), H / 2, z);
      c.castShadow = true;
    }
  }

  // ---------- Grundbelysning ----------
  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x2e2924, 0.28));
  const fill = new THREE.DirectionalLight(0xffffff, 0.18);
  fill.position.set(5, 20, 15);
  scene.add(fill);

  // ---------- Skyltar ----------
  function addPlaque(tex, x, z, faceAngle) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 12), darkMat);
    post.position.y = 0.5;
    g.add(post);
    const panel = new THREE.Group();
    panel.position.y = 1.15;
    panel.rotation.x = -0.4;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.08, 0.05), darkMat);
    back.position.z = -0.03;
    panel.add(back);
    panel.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), signMaterial(tex, 0.45)));
    g.add(panel);
    g.position.set(x, 0, z);
    g.rotation.y = faceAngle;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    flyers.push(g);
    colliders.push({ x, z, r: 0.5 });
    return g;
  }

  // ---------- Utställningar ----------
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.3, metalness: 0.3 });
  const rimMat = new THREE.MeshBasicMaterial({ color: hdr(0.5, 1.4, 3.2) });
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 1, roughness: 0.25 });

  function addExhibit(plane, { x, z, rot, radius, plaque, plaqueAngle, flying }) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.15, 0.35, 96), pedestalMat);
    ped.position.set(x, 0.175, z);
    ped.receiveShadow = true;
    scene.add(ped);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.06, 0.035, 8, 180), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.33, z);
    scene.add(rim);

    plane.position.set(x, 0.35, z);
    plane.rotation.order = 'YXZ';
    plane.rotation.y = rot;
    scene.add(plane);
    if (flying) {
      // Upphängd på en pylon i bankad flygställning, landningsstället infällt
      plane.userData.gear.forEach((m) => (m.visible = false));
      plane.position.y += flying.height;
      plane.rotation.z = flying.bank;
      plane.rotation.x = flying.pitch;
      plane.updateMatrixWorld(true);
      const c = plane.userData.body.getWorldPosition(new THREE.Vector3());
      const len = c.y - 0.35 - 0.5;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, len, 24), pylonMat);
      pylon.position.set(c.x, 0.35 + len / 2, c.z);
      pylon.castShadow = pylon.receiveShadow = true;
      scene.add(pylon);
    }
    aircraft.push(plane);
    colliders.push({ x, z, r: radius + 0.35 });

    const spot = new THREE.SpotLight(0xfff0dc, 700, 0, 0.55, 0.65, 2);
    spot.position.set(x + 1.5, H - 0.8, z + 3);
    spot.target.position.set(x, 1.2, z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.03;
    spot.shadow.camera.near = 3;
    spot.shadow.camera.far = 22;
    scene.add(spot, spot.target);

    const px = x + Math.sin(plaqueAngle) * (radius + 1.3);
    const pz = z + Math.cos(plaqueAngle) * (radius + 1.3);
    addPlaque(makePlaqueTexture(plaque), px, pz, plaqueAngle);
  }

  addExhibit(buildDraken(), {
    x: -10, z: 8, rot: 0.55, radius: 8.2, plaqueAngle: 1.25,
    plaque: {
      title: 'J 35 Draken', subtitle: 'Första flygning 1955',
      body: 'Den karakteristiska dubbeldeltavingen gav både fart och manöverförmåga. Draken var ett av de första europeiska jaktplanen som klarade Mach 2.',
    },
  });
  addExhibit(buildViggen(), {
    x: 10, z: -5, rot: -0.7, radius: 8.8, plaqueAngle: -1.2,
    plaque: {
      title: 'AJ 37 Viggen', subtitle: 'Första flygning 1967',
      body: 'Canardvingarna gav korta start- och landningssträckor, så Viggen kunde operera från vanliga landsvägar som krigsbaser.',
    },
  });
  addExhibit(buildGripen(), {
    x: 0, z: -20.5, rot: 0.25, radius: 7.8, plaqueAngle: 0.35, flying: { height: 2.6, bank: 0.42, pitch: -0.1 },
    plaque: {
      title: 'JAS 39 Gripen', subtitle: 'Första flygning 1988',
      body: 'Jakt, Attack och Spaning i ett och samma plan — därav namnet JAS. Lätt, smidig och byggd för att flyga från korta baser.',
    },
  });

  // ---------- Väggbanderoller och tidslinje ----------
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 5.5),
    signMaterial(makeBannerTexture({ title: 'SAAB-MUSEET', subtitle: 'Svenskt flyg sedan 1937' }), 0.35),
  );
  banner.position.set(0, 7.0, -D / 2 + 0.03);
  scene.add(banner);

  const welcome = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.5),
    signMaterial(makeBannerTexture({ title: 'VÄLKOMMEN', subtitle: 'Rör inte flygplanen. Eller knappen.' }), 0.35),
  );
  welcome.position.set(0, 7.2, D / 2 - 0.03);
  welcome.rotation.y = Math.PI;
  scene.add(welcome);

  const timeline = [
    ['1937', 'Svenska Aeroplan AB grundas i Trollhättan.'],
    ['1955', 'J 35 Draken flyger för första gången.'],
    ['1967', 'AJ 37 Viggen gör sin första flygning.'],
    ['1988', 'JAS 39 Gripen lyfter för första gången.'],
  ];
  timeline.forEach(([year, text], i) => {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), signMaterial(makeTimelineTexture(year, text), 0.2));
    plate.position.set(-W / 2 + 0.03, 4.0, 22 - i * 13);
    plate.rotation.y = Math.PI / 2;
    scene.add(plate);
  });

  // Nödutgångsskylt (kommer att behövas)
  const exitCanvas = document.createElement('canvas');
  exitCanvas.width = 512; exitCanvas.height = 192;
  const eg = exitCanvas.getContext('2d');
  eg.fillStyle = '#0b8a3e'; eg.fillRect(0, 0, 512, 192);
  eg.fillStyle = '#fff'; eg.font = '800 84px system-ui, sans-serif'; eg.textAlign = 'center';
  eg.fillText('NÖDUTGÅNG', 256, 128);
  const exitTex = new THREE.CanvasTexture(exitCanvas);
  exitTex.colorSpace = THREE.SRGBColorSpace;
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: exitTex, color: hdr(1.6, 1.6, 1.6) }));
  exitSign.position.set(-W / 2 + 0.04, 3.6, -D / 2 + 6);
  exitSign.rotation.y = Math.PI / 2;
  scene.add(exitSign);

  // ---------- Bänkar ----------
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.55 });
  for (const [x, z, r] of [[0, 14, 0], [-2, -8, 0.3], [-12, -12, 0.6]]) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), woodMat);
    seat.position.y = 0.46;
    b.add(seat);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.5), darkMat);
      leg.position.set(s * 1.0, 0.21, 0);
      b.add(leg);
    }
    b.position.set(x, 0, z);
    b.rotation.y = r;
    b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(b);
    flyers.push(b);
    colliders.push({ x, z, r: 1.3 });
  }

  // ---------- KNAPPEN ----------
  const station = new THREE.Group();
  station.position.set(13, 0, 21);
  station.rotation.y = -Math.PI / 2; // framsidan vänd mot mittgången
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.8, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.9), steel);
  base.position.y = 0.5;
  station.add(base);
  const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.92), new THREE.MeshStandardMaterial({ map: makeHazardTexture(), roughness: 0.6 }));
  hazard.position.y = 0.88;
  station.add(hazard);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.4 }));
  housing.position.y = 1.05;
  station.add(housing);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xcc0d0d, emissive: 0xff1a1a, emissiveIntensity: 1.5, roughness: 0.22 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.scale.y = 0.65;
  dome.position.y = 1.1;
  station.add(dome);
  station.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const glow = new THREE.PointLight(0xff2020, 3, 5, 2);
  glow.position.set(0, 1.5, 0.3);
  station.add(glow);
  scene.add(station);

  const warnSign = addPlaque(makePlaqueTexture({
    title: 'TRYCK INTE', subtitle: 'Gäller alla besökare',
    body: 'Knappen är inte kopplad till någonting. Tryck inte på den ändå. Vi menar det. Seriöst.',
    accent: '#ff3b3b', danger: true,
  }), 13, 19.2, -Math.PI / 2 + 0.35);
  warnSign.scale.setScalar(0.85);
  colliders.push({ x: 13, z: 21, r: 0.8 });

  const buttonSpot = new THREE.SpotLight(0xffe2d0, 120, 0, 0.32, 0.5, 2);
  buttonSpot.position.set(12, H - 1, 23);
  buttonSpot.target.position.set(13, 1, 21);
  scene.add(buttonSpot, buttonSpot.target);

  const button = {
    worldPos: new THREE.Vector3(13, 1.1, 21),
    pressed: false,
    update(t) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      domeMat.emissiveIntensity = this.pressed ? 6 : 1.2 + pulse * 2.2;
      glow.intensity = this.pressed ? 12 : 1.5 + pulse * 3;
      dome.position.y = this.pressed ? 1.07 : 1.1;
    },
  };

  // ---------- Larmlampor (släckta tills vidare) ----------
  const alarmLights = [];
  const beaconMat = new THREE.MeshBasicMaterial({ color: hdr(0.2, 0.02, 0.02) });
  for (const [x, z] of [[-12, 16], [12, 16], [-12, -16], [12, -16]]) {
    const l = new THREE.PointLight(0xff1010, 0, 0, 2);
    l.position.set(x, H - 1.6, z);
    scene.add(l);
    alarmLights.push(l);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), beaconMat);
    beacon.position.copy(l.position);
    scene.add(beacon);
  }

  return {
    bounds: { minX: -W / 2 + 0.7, maxX: W / 2 - 0.7, minZ: -D / 2 + 0.7, maxZ: D / 2 - 0.7 },
    colliders, flyers, aircraft, button,
    alarm: { lights: alarmLights, beaconMat },
    spawn: new THREE.Vector3(0, 1.7, 27),
  };
}
