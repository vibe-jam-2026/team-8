// Flyghallen — Måns sal i Museum Aurora.
// Tre flygplansmodeller och en knapp för provtändning. Den som trycker får se
// efterbrännkammaren tändas, och ur motorn skjuts en guldstjärna ut.
import * as THREE from '../vendor/three.module.min.js';
import { buildCanardJet, buildDeltaFighter, buildDoubleDeltaJet } from './flygplan.js';

const SCALE = 0.4; // modellerna är utställningsmodeller, inte fullskaliga plan
const HANG_SCALE = 0.34;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

const hazardTex = () => {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#f2c14e'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1b1b1b';
    for (let i = -256; i < 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - 256, 256); g.lineTo(i - 256, 256); g.closePath(); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 0.5);
  return t;
};

/** Liten skylt på ett ben, i samma stil som museets andra etiketter. */
function signTex(title, sub, accent = '#f2c14e') {
  return canvasTexture(512, 300, (g, w, h) => {
    g.fillStyle = '#1d1a24'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, 12, h);
    g.fillStyle = '#f2e8d4'; g.font = '600 50px Georgia, serif'; g.textBaseline = 'middle';
    g.fillText(title, 40, 110);
    g.fillStyle = accent; g.font = '500 30px system-ui, sans-serif';
    g.fillText(sub, 40, 190);
  });
}

export function buildFlyghallen(api) {
  const { scene, room, WH, add, solid, interact, makeStar, stars, tone, shake, burst, showPlaque, tween, wait } = api;
  const { x: cx, z: cz } = room.c;
  const flames = [];
  const darkMat = new THREE.MeshStandardMaterial({ color: '#262b33', roughness: 0.55, metalness: 0.2 });

  // ---------- podier med blå glödkant ----------
  const pedMat = new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 0.35, metalness: 0.25 });
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.55, 1.3, 2.6) });
  function podium(x, z, r) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.08, 0.25, 64), pedMat), x, 0.125, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.025, 8, 128), rimMat);
    rim.rotation.x = Math.PI / 2;
    add(rim, x, 0.24, z);
    solid(x, z, r * 1.5, r * 1.5); // fyrkantig kollision inuti cirkeln, så gångarna förblir fria
  }

  function stand(x, z, rotY, tex) {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 10), darkMat), 0, 0.45, 0));
    const panel = new THREE.Group();
    panel.position.y = 1.0;
    panel.rotation.x = -0.45;
    panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.52, 0.03), darkMat));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.47), new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.7,
    }));
    face.position.z = 0.017;
    panel.add(face);
    g.add(panel);
    g.rotation.y = rotY;
    add(g, x, 0, z);
    solid(x, z, 0.3, 0.3);
  }

  function place(plane, x, z, rotY) {
    plane.scale.setScalar(SCALE);
    plane.rotation.y = rotY;
    add(plane, x, 0.25, z);
    flames.push(...plane.userData.flames);
  }

  // ---------- dubbeldeltajakten (nordväst) ----------
  const dd = { x: cx - 3.6, z: cz - 3.6 };
  podium(dd.x, dd.z, 3.2);
  place(buildDoubleDeltaJet(), dd.x, dd.z, 0.8);
  stand(cx - 1.0, cz - 1.0, Math.PI / 4, signTex('Dubbeldeltajakten', 'Modell 1:2,5'));
  interact({ x: cx - 0.6, z: cz - 0.6, r: 1.4, info: ['Dubbeldeltajakten', 'Jaktflygplan · modell i skala 1:2,5',
    'Vingen har två olika pilvinklar, en brant inre och en flackare yttre. Det gav hög toppfart utan att planet blev svårflugit i låg fart.'] });

  // ---------- canardplanet (sydost) ----------
  const cj = { x: cx + 3.5, z: cz + 3.4 };
  podium(cj.x, cj.z, 3.3);
  place(buildCanardJet(), cj.x, cj.z, -2.4);
  stand(cx + 1.0, cz + 0.9, -Math.PI * 0.75, signTex('Canardplanet', 'Modell 1:2,5'));
  interact({ x: cx + 0.6, z: cz + 0.5, r: 1.4, info: ['Canardplanet', 'Attackflygplan · modell i skala 1:2,5',
    'De stora nosvingarna gav så korta start- och landningssträckor att planet kunde använda en vanlig landsväg som bana. Kamouflaget kallas splittermönster.'] });

  // ---------- den lätta deltajakten hänger i taket ----------
  const hang = buildDeltaFighter();
  hang.userData.gear.forEach((m) => (m.visible = false));
  hang.scale.setScalar(HANG_SCALE);
  hang.rotation.order = 'YXZ';
  hang.rotation.set(-0.08, -2.35, 0.32);
  const bodyY = 3.35;
  add(hang, cx - 3.0, bodyY - 1.55 * HANG_SCALE, cz + 3.2); // över det lediga hörnet, inte över gångarna
  flames.push(...hang.userData.flames);
  hang.updateMatrixWorld(true);
  const wireMat = new THREE.MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.6, roughness: 0.3 });
  for (const along of [-3.2, 3.0]) {
    const a = hang.userData.body.localToWorld(new THREE.Vector3(0, 0.5, along));
    const len = WH - a.y;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), wireMat), a.x, a.y + len / 2, a.z);
  }
  stand(cx - 1.1, cz + 2.4, Math.atan2(1.1, -2.4), signTex('Den lätta deltajakten', 'Titta upp!'));
  interact({ x: cx - 0.9, z: cz + 1.8, r: 1.3, info: ['Den lätta deltajakten', 'Hänger i taket · flyger ingenstans',
    'Ett plan för tre uppdrag: jakt, attack och spaning. Museet har lovat att motorn aldrig ska startas inomhus. Knappen i hörnet är bara till för provtändning.'] });

  // ---------- knappen för provtändning (nordost) ----------
  const bx = cx + 4.7, bz = cz - 5.0;
  const toCenter = Math.atan2(cx - bx, cz - bz);
  const station = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.6, roughness: 0.4 });
  station.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8), steel), 0, 0.5, 0));
  station.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.13, 0.82), new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 })), 0, 0.88, 0));
  station.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.09, 40), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 })), 0, 1.04, 0));
  const domeMat = new THREE.MeshStandardMaterial({ color: '#cc2a10', emissive: '#ff5a1a', emissiveIntensity: 0.9, roughness: 0.25 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.scale.y = 0.65;
  dome.position.y = 1.08;
  station.add(dome);
  station.rotation.y = toCenter;
  add(station, bx, 0, bz);
  solid(bx, bz, 0.85, 0.85);
  const glow = new THREE.PointLight('#ff7a2a', 2.5, 4, 2);
  add(glow, bx + Math.sin(toCenter) * 0.4, 1.5, bz + Math.cos(toCenter) * 0.4);
  stand(bx - 1.05, bz + 0.25, toCenter, signTex('PROVTÄNDNING', 'Tryck för att testa motorn', '#ff7a2a'));

  const button = interact({ x: bx + Math.sin(toCenter) * 0.85, z: bz + Math.cos(toCenter) * 0.85, r: 1.5, label: 'Provtänd motorn', use: () => fire() });

  // ---------- stjärnan, som bara syns efter provtändningen ----------
  const land = new THREE.Vector3(cx + 2.4, 1.0, cz - 3.4);
  makeStar('flyg', land.x, land.y, land.z);
  const star = stars[stars.length - 1];

  star.hidden = true; // syns först när motorn har provtänts
  star.g.visible = false;
  let used = false, burning = false, generation = 0;

  function setFlames(on) {
    burning = on;
    flames.forEach((f) => (f.visible = on));
  }

  async function fire() {
    if (used) return;
    used = true;
    button.r = 0; // inte längre något att interagera med
    const gen = ++generation;
    dome.position.y = 1.05;
    domeMat.emissiveIntensity = 3;
    tone([90], 0.08, 'square', 0.06);
    showPlaque('Provtändning!', 'Efterbrännkammaren tänds', 'Alla tre motorerna mullrar till liv. Golvet vibrerar. Något lossnar inne i den hängande motorn…');
    setFlames(true);
    shake(0.9);
    tone([55, 62, 70, 82, 98], 0.18, 'sawtooth', 0.07);
    await wait(1200);
    if (gen !== generation) return;

    // Stjärnan skjuts ut ur den hängande deltajettens munstycke
    const from = hang.userData.flames[0].getWorldPosition(new THREE.Vector3());
    star.flying = true;
    star.g.visible = true;
    star.g.position.copy(from);
    shake(0.4);
    tone([1568, 1319, 1175], 0.07, 'triangle', 0.07);
    await tween(1100, (k) => {
      if (gen !== generation) return;
      star.g.position.lerpVectors(from, land, k);
      star.g.position.y += Math.sin(Math.PI * k) * 1.4;
      star.g.rotation.y = k * 18;
    });
    if (gen !== generation) return;
    star.flying = false;
    star.hidden = false;
    burst(land.clone(), ['#ffd34d', '#fff3c4', '#ff9a3a'], 22, 2.2);
    showPlaque('En guldstjärna!', 'Ur efterbrännkammaren', 'Motorn hostade upp en guldstjärna. Den landade bredvid knappen — plocka upp den!');
    await wait(900);
    if (gen !== generation) return;
    setFlames(false);
  }

  return {
    update(dt, t) {
      if (burning) {
        for (const f of flames) {
          const k = 0.8 + Math.random() * 0.35;
          f.scale.set(k, k, k * (1 + Math.random() * 0.4));
        }
      }
      if (!used) domeMat.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3));
    },
    reset() {
      generation++;
      used = false;
      button.r = 1.5;
      setFlames(false);
      dome.position.y = 1.08;
      star.hidden = true;
      star.flying = false;
      star.g.visible = false;
      star.g.position.copy(land);
    },
  };
}
