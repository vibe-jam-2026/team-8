// Flyghallen i skräckversionen (game.js) — Måns sal, Sal 7.
// Vanligt skript som laddas före game.js. game.js anropar window.buildFlyghallenSkrack(api)
// när museet möbleras. Flygplanen kommer från rooms/flygplan.js (samma modeller som i lagets tidigare version).
window.buildFlyghallenSkrack = function buildFlyghallenSkrack(api) {
  'use strict';
  const { THREE, K, center, group, addMesh, collide, info, interacts, addStar, stars, mat, M, hazardTex,
    guard, S, sfx, subtitle, showPlaque, hidePlaque, setPrompt, tween, wait, anims } = api;
  const { buildCanardJet, buildDeltaFighter, buildDoubleDeltaJet } = window.makeAircraft(THREE);
  const c = center(K);
  const SCALE = 0.42, HANG_SCALE = 0.36;
  const flames = [];

  function signTex(title, sub, accent) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300;
    const g = cv.getContext('2d');
    g.fillStyle = '#141118'; g.fillRect(0, 0, 512, 300);
    g.fillStyle = accent; g.fillRect(0, 0, 12, 300);
    g.fillStyle = '#e9dcc4'; g.font = '600 48px Georgia, serif'; g.textBaseline = 'middle'; g.fillText(title, 40, 110);
    g.fillStyle = accent; g.font = '500 30px system-ui, sans-serif'; g.fillText(sub, 40, 190);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  }
  function stand(x, z, rotY, title, sub, accent = '#e9c45e') {
    const g = group(K, x, z, rotY);
    addMesh(g, new THREE.CylinderGeometry(.03, .04, .9, 10), M.black, 0, .45, 0);
    const panel = new THREE.Group(); panel.position.y = 1.0; panel.rotation.x = -.45; g.add(panel);
    addMesh(panel, new THREE.BoxGeometry(.86, .52, .03), M.black, 0, 0, 0);
    const face = addMesh(panel, new THREE.PlaneGeometry(.8, .47), mat(0xffffff, { map: signTex(title, sub, accent), roughness: .7 }), 0, 0, .017);
    face.castShadow = false;
    collide(K, x, z, .3, .3);
  }
  const pedMat = mat(0x1d2026, { roughness: .35, metalness: .3 });
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x2a5a9a });
  function podium(x, z, r) {
    const g = group(K, x, z);
    addMesh(g, new THREE.CylinderGeometry(r, r + .08, .25, 56), pedMat, 0, .125, 0);
    const rim = addMesh(g, new THREE.TorusGeometry(r + .03, .025, 6, 96), rimMat, 0, .24, 0);
    rim.rotation.x = Math.PI / 2; rim.castShadow = false;
    collide(K, x, z, r * .75, r * .75);
  }
  function place(plane, x, z, rotY, y = .25, scale = SCALE) {
    plane.scale.setScalar(scale); plane.rotation.order = 'YXZ'; plane.rotation.y = rotY;
    plane.position.set(c.x + x, y, c.z + z);
    api.scene.add(plane);
    flames.push(...plane.userData.flames);
    return plane;
  }

  // ---------- dubbeldeltajakten (nordväst) ----------
  podium(-5, -3.9, 3.4);
  place(buildDoubleDeltaJet(), -5, -3.9, .8);
  stand(-1.2, -1.4, Math.PI / 4 + .2, 'Dubbeldeltajakten', 'Modell 1:2,4');
  info(K, -1.2, -1.4, ['Dubbeldeltajakten', 'Jaktflygplan · modell i skala 1:2,4',
    'Vingen har två olika pilvinklar, en brant inre och en flackare yttre. Det gav hög toppfart utan att planet blev svårflugit i låg fart. Vakterna säger att den har bytt plats under natten. Två gånger.'], 1.5);

  // ---------- canardplanet (sydost) ----------
  podium(4.8, 3.9, 3.6);
  place(buildCanardJet(), 4.8, 3.9, -2.4);
  stand(1.0, 1.2, -Math.PI * .75, 'Canardplanet', 'Modell 1:2,4');
  info(K, 1.0, 1.2, ['Canardplanet', 'Attackflygplan · modell i skala 1:2,4',
    'De stora nosvingarna gav så korta start- och landningssträckor att planet kunde använda en vanlig landsväg som bana. Ingen vet varför cockpiten är immig på insidan.'], 1.5);

  // ---------- den lätta deltajakten hänger i taket (sydväst) ----------
  const hang = buildDeltaFighter();
  hang.userData.gear.forEach(m => (m.visible = false));
  place(hang, -5.2, 4.2, -2.35, 3.75 - 1.55 * HANG_SCALE, HANG_SCALE);
  hang.rotation.x = -.08; hang.rotation.z = .32;
  hang.updateMatrixWorld(true);
  for (const along of [-3.2, 3.0]) {
    const a = hang.userData.body.localToWorld(new THREE.Vector3(0, .5, along)), len = api.H - a.y;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, len, 6), M.steel);
    wire.position.set(a.x, a.y + len / 2, a.z); api.scene.add(wire);
  }
  // ett kallt nödljus som bara når den hängande jeten
  const spot = new THREE.SpotLight(0x9fb4ff, .9, 11, .45, .8, 1.2);
  spot.position.set(c.x - 2.5, api.H - .2, c.z + 1.5); spot.target.position.set(c.x - 5.2, 3.2, c.z + 4.2);
  api.scene.add(spot, spot.target);
  stand(-1.6, 3.0, Math.atan2(1.6, -3.0) + Math.PI, 'Den lätta deltajakten', 'Titta upp');
  info(K, -1.6, 3.0, ['Den lätta deltajakten', 'Hänger i taket · flyger ingenstans',
    'Ett plan för tre uppdrag: jakt, attack och spaning. Museet har lovat att motorn aldrig ska startas inomhus. Knappen i hörnet är bara till för provtändning. Den är inte farlig. Den här gången.'], 1.5);

  // ---------- knappen för provtändning (nordost) ----------
  const bx = 7.6, bz = -5.6, toCenter = Math.atan2(-bx, -bz);
  const st = group(K, bx, bz, toCenter);
  addMesh(st, new THREE.BoxGeometry(.7, 1, .7), mat(0x2b2f36, { metalness: .6, roughness: .4 }), 0, .5, 0);
  addMesh(st, new THREE.BoxGeometry(.72, .12, .72), mat(0xffffff, { map: hazardTex() }), 0, .88, 0);
  addMesh(st, new THREE.CylinderGeometry(.24, .27, .08, 20), M.black, 0, 1.04, 0);
  const capMat = mat(0xcc4a10, { emissive: 0xff6a1a, emissiveIntensity: .8, roughness: .3 });
  const cap = addMesh(st, new THREE.CylinderGeometry(.19, .21, .13, 20), capMat, 0, 1.12, 0);
  collide(K, bx, bz, .4, .4);
  stand(bx - 1.15, bz + .35, toCenter, 'PROVTÄNDNING', 'Tryck för att testa motorn', '#ff7a2a');
  const btnWorld = st.position.clone();
  const ux = c.x + bx + Math.sin(toCenter) * .9, uz = c.z + bz + Math.cos(toCenter) * .9;
  const button = { room: K, x: ux, z: uz, r: 1.5, label: 'Provtänd motorn', use: fire };
  interacts.push(button);

  // ---------- stjärnan, gömd i motorn tills någon provtänder ----------
  const land = new THREE.Vector3(c.x + 5.6, .45, c.z - 4.3);
  addStar(K, land.x - c.x, land.y, land.z - c.z);
  const star = stars[stars.length - 1];
  star.visible = false;

  let burning = false;
  anims.push((dt, t) => {
    if (burning) for (const f of flames) { const k = .8 + Math.random() * .35; f.scale.set(k, k, k * (1 + Math.random() * .4)); }
    if (button.label) capMat.emissiveIntensity = .5 + .5 * (.5 + .5 * Math.sin(t * 3));
  });

  async function fire() {
    if (!button.label || S.busy) return;
    button.label = null; S.busy = true; hidePlaque(); setPrompt(null); S.keys = {};
    const p = guard.p.position;
    guard.p.rotation.y = Math.atan2(btnWorld.x - p.x, btnWorld.z - p.z);
    guard.armR.rotation.x = -1.3;
    await tween(140, k => { cap.position.y = 1.12 - .05 * k; }); sfx.click();
    await wait(220); guard.armR.rotation.x = 0; capMat.emissiveIntensity = 2.5;
    S.busy = false;
    subtitle('Motorerna mullrar till liv…', 2000);
    burning = true; flames.forEach(f => (f.visible = true)); S.shake = .8; sfx.jet();
    await wait(1200);
    // stjärnan skjuts ut ur den hängande jetens munstycke
    const from = hang.userData.flames[0].getWorldPosition(new THREE.Vector3());
    star.userData.flying = true; star.visible = true; star.position.copy(from); S.shake = Math.max(S.shake, .4);
    await tween(1100, k => {
      star.position.lerpVectors(from, land, k);
      star.position.y += Math.sin(Math.PI * k) * 1.4;
      star.rotation.y = k * 18;
    });
    star.userData.flying = false;
    showPlaque('En guldstjärna!', 'Ur efterbrännkammaren', 'Motorn hostade upp en guldstjärna. Den landade bredvid knappen. Plocka upp den innan något annat gör det.');
    await wait(900);
    burning = false; flames.forEach(f => (f.visible = false));
  }
};
