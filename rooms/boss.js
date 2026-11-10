// Slutbossen — Valvgorillan Bruno.
// När alla stjärnor är hittade och vakten kliver in i Skattkammaren hoppar en
// gorilla ner från taket. Fighten är ett quick time event: en ring krymper mot
// en tangent (W, A, S eller D) och man ska trycka exakt när ringen når målet.
// Träffar man tillräckligt många gånger slås gorillan knockout och man vinner.
//
// Filen är ett vanligt skript (ingen modul) så att båda versionerna kan använda den:
// skräckversionen laddar den med <script src> (fungerar även från disk), lagets
// version med import './rooms/boss.js'. Den lägger window.MuseumBoss.buildBoss,
// och spelet skickar in sin egen THREE, vakten, kameran och ljuden.
(function () {
'use strict';
let THREE;

const HITS_NEEDED = 8;      // så många träffar krävs för knockout
const LIVES = 3;            // så många missar tål vakten
const WINDOW = 110;         // ms före/efter målet som räknas som träff
const PERFECT = 45;         // ms för "PERFEKT!"
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const ease = k => 1 - Math.pow(1 - k, 3);
// FINAL FIGHT: när Bruno slagits knockout reser han sig och ställer fyra frågor om Haga slott
// utanför Enköping. Rätt svar = vakten slår, fel svar = Bruno slår. Sista frågan är när slottet byggdes.
const QUIZ = [
  {q: 'Vid vilken sjö ligger Haga slott utanför Enköping?', a: ['Vättern', 'Mälaren', 'Hjälmaren', 'Siljan'], ok: 1},
  {q: 'Vilken adelsman lät bygga det nuvarande slottet?', a: ['Axel Oxenstierna', 'Per Brahe', 'Gustaf Persson Natt och Dag', 'Carl Gustaf Wrangel'], ok: 2},
  {q: 'Vilken arkitekt ritade slottet?', a: ['Nicodemus Tessin d.ä.', 'Carl Hårleman', 'Fredrik Blom', 'Jean Eric Rehn'], ok: 0},
  {q: 'Sista frågan: vilket år stod Haga slott färdigbyggt?', a: ['1523', '1754', '1812', '1670'], ok: 3},
];
const QKEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

const CSS = `
#boss-hud{position:fixed;left:50%;top:76px;transform:translateX(-50%);width:min(520px,calc(100% - 32px));z-index:7;pointer-events:none;text-align:center;font-family:system-ui,sans-serif}
#boss-hud[hidden]{display:none}
#boss-hud .bname{font:600 20px/1.2 Georgia,serif;color:#f3ecdf;text-shadow:0 2px 8px rgba(0,0,0,.8)}
#boss-hud .bname small{display:block;font:600 11px/1.8 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#ff5a5f}
#boss-hud .bar{height:14px;border-radius:999px;background:rgba(0,0,0,.6);border:1px solid #3a3545;overflow:hidden;margin:6px 0}
#boss-hud .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#c1121f,#ff5a5f);transition:width .25s}
#boss-hud .lives{font-size:20px;letter-spacing:4px;color:#ff5a5f;text-shadow:0 1px 4px rgba(0,0,0,.8)}
#qte{position:fixed;left:50%;top:70%;width:0;height:0;z-index:7;pointer-events:none}
#qte[hidden]{display:none}
#qte .target,#qte .ring{position:absolute;left:-46px;top:-46px;width:92px;height:92px;border-radius:50%}
#qte .target{background:rgba(26,23,34,.88);border:4px solid #f2c14e;display:flex;align-items:center;justify-content:center;font:800 44px/1 system-ui,sans-serif;color:#f2c14e;box-shadow:0 0 30px rgba(242,193,78,.35)}
#qte .ring{border:5px solid #fff;box-shadow:0 0 12px rgba(255,255,255,.6)}
#qte-msg{position:fixed;left:50%;top:calc(70% + 66px);transform:translateX(-50%);z-index:7;font:800 30px/1.2 Georgia,serif;text-shadow:0 3px 14px rgba(0,0,0,.9);pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}
#qte-msg.show{opacity:1}
#qte-msg.good{color:#7dff9a}#qte-msg.bad{color:#ff5a5f}#qte-msg.perfect{color:#f2c14e}
#quiz{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:min(600px,calc(100% - 32px));z-index:8;background:rgba(20,16,28,.86);border:1px solid #f2c14e;border-radius:14px;padding:16px 18px;text-align:center;font-family:system-ui,sans-serif;color:#f3ecdf;box-shadow:0 20px 60px rgba(0,0,0,.6);backdrop-filter:blur(3px)}
#quiz[hidden]{display:none}
#quiz .qk{font:600 11px/1.6 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#ff5a5f}
#quiz .qq{font:600 20px/1.3 Georgia,serif;margin:4px 0 12px}
#quiz .qa{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#quiz .qa button{font:500 15px/1.3 system-ui,sans-serif;text-align:left;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid #4a4458;color:#f3ecdf;cursor:pointer}
#quiz .qa button:hover,#quiz .qa button:focus-visible{border-color:#f2c14e;outline:none}
#quiz .qa button b{display:inline-block;min-width:22px;color:#f2c14e}
#quiz .qa button.right{background:rgba(60,180,90,.35);border-color:#7dff9a}
#quiz .qa button.wrong{background:rgba(200,30,40,.35);border-color:#ff5a5f}
@media (max-width:520px){#quiz .qa{grid-template-columns:1fr}#quiz .qq{font-size:17px}}
#qte-pad{display:none}
@media (pointer:coarse){
  #qte-pad{position:fixed;right:20px;bottom:30px;z-index:8;display:grid;grid-template-columns:repeat(3,64px);grid-template-rows:repeat(2,64px);gap:8px}
  #qte-pad[hidden]{display:none}
  #qte-pad button{border-radius:12px;font:800 24px/1 system-ui,sans-serif;background:rgba(242,193,78,.85);color:#2a2112;border:none;padding:0;touch-action:manipulation}
  #qte-pad button[data-k=KeyW]{grid-column:2}
}
`;

// Äldre three.js (r149, skräckversionen) tolkar färgkoder som linjära; då omvandlar vi själva.
function col(hex) { const c = new THREE.Color(hex); if (THREE.ColorManagement && THREE.ColorManagement.legacyMode) c.convertSRGBToLinear(); return c; }
function buildGorilla() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const fur = new THREE.MeshStandardMaterial({color: col('#25211e'), roughness: 1});
  const skin = new THREE.MeshStandardMaterial({color: col('#4a3d37'), roughness: .8});
  const chestM = new THREE.MeshStandardMaterial({color: col('#3b332e'), roughness: .9});
  const silver = new THREE.MeshStandardMaterial({color: col('#6e6a66'), roughness: 1});
  const limb = (len, r, mat, x, y, z = 0) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat); m.position.y = -len / 2; piv.add(m);
    body.add(piv); return piv;
  };
  // ben
  const legL = limb(.55, .2, fur, -.32, .82), legR = limb(.55, .2, fur, .32, .82);
  for (const l of [legL, legR]) { const f = new THREE.Mesh(new THREE.BoxGeometry(.32, .14, .46), skin); f.position.set(0, -.8, .1); l.add(f); }
  // bål
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.6, .55, 8, 16), fur);
  torso.scale.set(1.1, 1, .8); torso.position.y = 1.45; torso.rotation.x = .15; body.add(torso);
  const back = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), silver); back.scale.set(1.1, .9, .5); back.position.set(0, 1.55, -.32); body.add(back);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.45, 20, 14), chestM); chest.scale.set(1.15, .9, .45); chest.position.set(0, 1.62, .38); body.add(chest);
  // armar, långa och grova
  const armL = limb(1.0, .2, fur, -.78, 2.0, .05), armR = limb(1.0, .2, fur, .78, 2.0, .05);
  armL.rotation.z = -.18; armR.rotation.z = .18;
  for (const a of [armL, armR]) { const f = new THREE.Mesh(new THREE.SphereGeometry(.24, 14, 10), skin); f.position.y = -1.22; a.add(f); }
  // huvud
  const head = new THREE.Group(); head.position.set(0, 2.32, .22); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.34, 20, 16), fur); skull.scale.set(1, 1.1, .95); head.add(skull);
  const crest = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), fur); crest.position.set(0, .26, -.06); crest.scale.set(1, 1, 1.2); head.add(crest);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.27, 20, 14), skin); face.scale.set(1.05, .95, .6); face.position.set(0, -.02, .2); head.add(face);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(.48, .09, .14), skin); brow.position.set(0, .1, .33); brow.rotation.x = -.25; head.add(brow);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), skin); muzzle.scale.set(1.2, .8, .8); muzzle.position.set(0, -.15, .34); head.add(muzzle);
  const eyeM = new THREE.MeshStandardMaterial({color: col('#ffdd88'), emissive: col('#ff3a00'), emissiveIntensity: .9});
  for (const sx of [-.1, .1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), eyeM); e.position.set(sx, .03, .41); head.add(e);
    const n = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshStandardMaterial({color: col('#111')})); n.position.set(sx * .5, -.1, .5); head.add(n);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(.22, .035, .04), new THREE.MeshStandardMaterial({color: col('#140c0a')})); mouth.position.set(0, -.25, .46); head.add(mouth);
  // skugga
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.9, 24), new THREE.MeshBasicMaterial({color: col('#000'), transparent: true, opacity: .4, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .016; g.add(shadow);
  // snurrande stjärnor vid knockout
  const dizzy = new THREE.Group(); dizzy.position.set(0, 2.9, 0); dizzy.visible = false; body.add(dizzy);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(.09), new THREE.MeshBasicMaterial({color: col('#ffd34d')}));
    const a = i / 4 * Math.PI * 2; s.position.set(Math.cos(a) * .4, 0, Math.sin(a) * .4); dizzy.add(s);
  }
  return {g, body, legL, legR, armL, armR, head, mouth, shadow, dizzy};
}

/**
 * opts: THREE, scene, center {x, z} (Skattkammarens mitt), guard {body, legL, legR, armL, armR},
 * pos (vaktens position, en Vector3 som ändras), getHeading(), setHeading(h), setCine(pos, look), clearCine(),
 * tween, wait, beep(freqs, dur, type, vol), burst(pos, colors, n, speed), shake(v),
 * onStart(), onWin(), arenaIntensity (ljuset över fighten, olika per renderer)
 */
function buildBoss({THREE: T3, scene, center, guard, pos, getHeading, setHeading, setCine, clearCine, tween, wait, beep: tone, burst, shake,
  onStart = () => {}, onWin, arenaIntensity = 30}) {
  THREE = T3;
  // --- DOM
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return document.body.appendChild(d.firstChild); };
  const hud = el(`<div id="boss-hud" hidden><div class="bname"><small>Slutboss</small>Valvgorillan Bruno</div><div class="bar"><i></i></div><div class="lives"></div></div>`);
  const qte = el(`<div id="qte" hidden><div class="target"></div><div class="ring"></div></div>`);
  const msg = el(`<div id="qte-msg"></div>`);
  const pad = el(`<div id="qte-pad" hidden>${KEYS.map(k => `<button type="button" data-k="${k}">${k.slice(3)}</button>`).join('')}</div>`);
  const ko = el(`<div class="overlay" id="bossKo" hidden><div class="card danger"><div class="kicker">Knockout</div><h1>Bruno vann ronden</h1><p>Gorillan slog dig till golvet. Kronan ligger kvar på sin pall, och Bruno ser nöjd ut. Res dig och försök igen!</p><button class="primary" type="button">Ny rond</button></div></div>`);
  const quizEl = el(`<div id="quiz" hidden><div class="qk"></div><div class="qq"></div><div class="qa"></div></div>`);
  quizEl.querySelector('.qa').addEventListener('click', e => { const b = e.target.closest('button'); if (b) answer(+b.dataset.i); });
  const bar = hud.querySelector('.bar i'), lives = hud.querySelector('.lives'), bname = hud.querySelector('.bname');
  const target = qte.querySelector('.target'), ring = qte.querySelector('.ring');
  pad.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); key(b.dataset.k); } });
  ko.querySelector('button').addEventListener('click', () => { ko.hidden = true; B.stage === 'quiz' ? quiz() : fight(); });

  // --- 3D
  const gor = buildGorilla(); gor.g.visible = false; scene.add(gor.g);
  const {x: cx, z: cz} = center;
  const GUARD_SPOT = new THREE.Vector3(cx, 0, cz + 3.0), GOR_SPOT = new THREE.Vector3(cx, 0, cz + 1.2);
  const arenaLight = new THREE.PointLight('#ffe2b0', 0, 12, 2); arenaLight.position.set(cx, 3.6, cz + 2.4); scene.add(arenaLight);

  const B = {phase: 'idle', stage: 'box', beaten: false, hits: 0, lives: LIVES, beat: null, anim: null, msgTimer: 0, token: 0, qi: 0, locked: false};

  function flash(text, cls, ms = 650) {
    msg.textContent = text; msg.className = 'show ' + cls;
    clearTimeout(B.msgTimer); B.msgTimer = setTimeout(() => msg.classList.remove('show'), ms);
  }
  function drawHud() {
    bar.style.width = (100 * (1 - (B.stage === 'quiz' ? B.qi / QUIZ.length : B.hits / HITS_NEEDED))) + '%';
    bname.innerHTML = B.stage === 'quiz' ? '<small>FINAL FIGHT · Haga slott-quizet</small>Valvgorillan Bruno' : '<small>Slutboss</small>Valvgorillan Bruno';
    lives.textContent = '♥'.repeat(Math.max(0, B.lives)) + '♡'.repeat(Math.max(0, LIVES - B.lives));
  }
  function setGuardPose() {
    guard.body.rotation.set(0, 0, 0); guard.body.position.set(0, 0, 0);
    guard.legL.rotation.x = .25; guard.legR.rotation.x = -.25;
    guard.armL.rotation.x = -1.1; guard.armR.rotation.x = -1.1;
  }
  function setGorillaPose() {
    gor.body.rotation.set(0, 0, 0); gor.body.position.set(0, 0, 0);
    gor.armL.rotation.set(-.2, 0, -.18); gor.armR.rotation.set(-.2, 0, .18);
    gor.legL.rotation.x = 0; gor.legR.rotation.x = 0; gor.dizzy.visible = false;
  }

  async function start() {
    if (B.phase !== 'idle' || B.beaten) return;
    B.phase = 'intro'; onStart();
    const tok = ++B.token;
    // kameran från sidan
    const mid = new THREE.Vector3(cx, 1.4, (GUARD_SPOT.z + GOR_SPOT.z) / 2);
    setCine(new THREE.Vector3(cx + 5.6, 2.5, mid.z + 1.2), mid);
    arenaLight.intensity = 0; tween(800, k => { arenaLight.intensity = arenaIntensity * k; });
    // vakten går fram till sin plats
    const p0 = pos.clone(), h0 = getHeading();
    let dh = ((Math.PI - h0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    await tween(900, k => {
      pos.lerpVectors(p0, GUARD_SPOT, ease(k)); setHeading(h0 + dh * ease(k));
      const sw = Math.sin(k * 14) * .6; guard.legL.rotation.x = sw; guard.legR.rotation.x = -sw;
    });
    if (tok !== B.token) return;
    // gorillan hoppar ner från taket
    setGorillaPose(); gor.g.visible = true; gor.g.position.set(GOR_SPOT.x, 6, GOR_SPOT.z); gor.g.rotation.y = 0;
    await tween(450, k => { gor.g.position.y = 6 * (1 - k * k); gor.shadow.material.opacity = .4 * k; });
    if (tok !== B.token) return;
    shake(.6); tone([60, 45], .18, 'square', .14); burst(new THREE.Vector3(cx, .2, GOR_SPOT.z), ['#6b5a4a', '#9a8a78'], 26, 3);
    // bröstslag och vrål
    tone([80, 70, 62, 55], .2, 'sawtooth', .1);
    await tween(1400, k => {
      const s = Math.sin(k * Math.PI * 10);
      gor.armL.rotation.x = -1.4 + Math.max(0, s) * .5; gor.armR.rotation.x = -1.4 + Math.max(0, -s) * .5;
      gor.armL.rotation.z = .5; gor.armR.rotation.z = -.5;
      gor.head.rotation.x = -.3 * Math.sin(k * Math.PI);
    });
    if (tok !== B.token) return;
    gor.head.rotation.x = 0; setGorillaPose(); setGuardPose();
    fight();
  }

  function fight() {
    B.hits = 0; B.lives = LIVES; B.phase = 'fight'; B.stage = 'box';
    setGuardPose(); setGorillaPose(); gor.g.visible = true; gor.g.position.copy(GOR_SPOT);
    pos.copy(GUARD_SPOT); setHeading(Math.PI);
    hud.hidden = false; drawHud();
    flash('Slå med W A S D i rätt takt!', 'perfect');
    next(1300);
  }

  function next(delay) {
    B.beat = null; qte.hidden = true; pad.hidden = true;
    const tok = B.token;
    setTimeout(() => {
      if (tok !== B.token || B.phase !== 'fight') return;
      const dur = Math.max(650, 1300 - B.hits * 85);
      B.beat = {key: KEYS[Math.floor(Math.random() * 4)], t0: performance.now(), dur};
      target.textContent = B.beat.key.slice(3); qte.hidden = false; pad.hidden = false;
    }, delay);
  }

  function key(code) {
    if (B.phase === 'quiz') { const i = QKEYS.indexOf(code); if (i >= 0) answer(i); return; }
    if (B.phase !== 'fight' || !B.beat || !KEYS.includes(code)) return;
    const dt = performance.now() - B.beat.t0 - B.beat.dur;
    if (code !== B.beat.key) return miss('Fel tangent!');
    if (dt < -WINDOW) return miss('För tidigt!');
    if (Math.abs(dt) <= PERFECT) return hit('PERFEKT!', 'perfect');
    if (Math.abs(dt) <= WINDOW) return hit('Träff!', 'good');
    miss('För sent!');
  }

  async function hit(text, cls) {
    B.beat = null; qte.hidden = true; pad.hidden = true; B.hits++; drawHud(); flash(text, cls);
    const tok = B.token;
    if (!await guardPunch(B.hits, tok)) return;
    if (B.hits >= HITS_NEEDED) return knockout();
    next(350 + Math.random() * 500);
  }

  async function miss(text) {
    B.beat = null; qte.hidden = true; pad.hidden = true; B.lives--; drawHud(); flash(text, 'bad');
    const tok = B.token;
    if (!await gorillaPunch(tok)) return;
    if (B.lives <= 0) return knockedDown();
    next(450 + Math.random() * 500);
  }

  // vakten slår, gorillan vacklar; false om fighten avbröts under tiden
  async function guardPunch(n, tok) {
    const arm = n % 2 ? guard.armR : guard.armL;
    tone([220, 330], .05, 'square', .1);
    await tween(110, k => { arm.rotation.x = -1.1 - .55 * k; guard.body.rotation.x = .15 * k; pos.z = GUARD_SPOT.z - .35 * k; });
    if (tok !== B.token) return false;
    shake(.25); burst(new THREE.Vector3(cx, 2.3, GOR_SPOT.z + .5), ['#fff', '#ffd34d'], 10, 2);
    tone([70], .08, 'sawtooth', .12);
    await tween(260, k => { arm.rotation.x = -1.65 + .55 * k; guard.body.rotation.x = .15 * (1 - k); pos.z = GUARD_SPOT.z - .35 * (1 - k);
      gor.body.rotation.x = -.35 * Math.sin(k * Math.PI); gor.head.rotation.z = .4 * Math.sin(k * Math.PI) * (n % 2 ? 1 : -1); });
    if (tok !== B.token) return false;
    gor.head.rotation.z = 0; return true;
  }
  // gorillan slår tillbaka
  async function gorillaPunch(tok) {
    const arm = Math.random() < .5 ? gor.armL : gor.armR;
    tone([110, 90], .08, 'sawtooth', .1);
    await tween(160, k => { arm.rotation.x = -.2 - 1.35 * ease(k); gor.body.rotation.x = .25 * k; gor.g.position.z = GOR_SPOT.z + .7 * k; });
    if (tok !== B.token) return false;
    shake(.45); tone([150, 60], .07, 'square', .14); burst(new THREE.Vector3(cx, 1.7, GUARD_SPOT.z - .3), ['#ff5a5f', '#fff'], 12, 2);
    await tween(350, k => { arm.rotation.x = -1.55 + 1.35 * k; gor.body.rotation.x = .25 * (1 - k); gor.g.position.z = GOR_SPOT.z + .7 * (1 - k);
      guard.body.rotation.x = -.35 * Math.sin(k * Math.PI); pos.z = GUARD_SPOT.z + .4 * Math.sin(k * Math.PI); });
    if (tok !== B.token) return false;
    pos.z = GUARD_SPOT.z; return true;
  }
  async function fallDown(tok) { // Bruno faller baklänges
    tone([60, 50, 40], .25, 'sawtooth', .12);
    await tween(900, k => { gor.body.rotation.x = -Math.PI / 2 * .95 * ease(k); gor.body.position.y = .3 * Math.sin(k * Math.PI);
      gor.armL.rotation.x = -.2 - 2.4 * k; gor.armR.rotation.x = -.2 - 2.4 * k; });
    if (tok !== B.token) return false;
    shake(.7); burst(new THREE.Vector3(cx, .3, GOR_SPOT.z - 1), ['#6b5a4a', '#9a8a78'], 30, 3);
    gor.dizzy.visible = true; return true;
  }

  async function knockout() {
    B.phase = 'ko'; hud.hidden = true; const tok = B.token;
    flash('KNOCKOUT!', 'perfect');
    if (!await fallDown(tok)) return;
    // vakten jublar
    await tween(700, k => { guard.armL.rotation.x = -1.1 - 1.9 * ease(k); guard.armR.rotation.x = -1.1 - 1.9 * ease(k); guard.armL.rotation.z = -.3 * k; guard.armR.rotation.z = .3 * k; });
    if (tok !== B.token) return;
    await wait(700);
    if (tok !== B.token) return;
    guard.armL.rotation.z = 0; guard.armR.rotation.z = 0; setGuardPose();
    // ... men Bruno reser sig igen: FINAL FIGHT
    gor.dizzy.visible = false; tone([70, 90, 110], .2, 'sawtooth', .1);
    const r0 = gor.body.rotation.x;
    await tween(1100, k => { const e = ease(k); gor.body.rotation.x = r0 * (1 - e); gor.armL.rotation.x = -2.6 + 2.4 * e; gor.armR.rotation.x = -2.6 + 2.4 * e; });
    if (tok !== B.token) return;
    setGorillaPose(); shake(.4);
    flash('FINAL FIGHT!', 'bad', 1800);
    await wait(1600);
    if (tok !== B.token) return;
    quiz();
  }

  // ---------- FINAL FIGHT: quizet om Haga slott ----------
  function quiz() {
    B.stage = 'quiz'; B.phase = 'quiz'; B.qi = 0; B.lives = LIVES; B.locked = false;
    setGuardPose(); setGorillaPose(); gor.g.visible = true; gor.g.position.copy(GOR_SPOT); pos.copy(GUARD_SPOT); setHeading(Math.PI);
    hud.hidden = false; drawHud(); showQuestion();
  }
  function showQuestion() {
    const Q = QUIZ[B.qi];
    quizEl.querySelector('.qk').textContent = `Bruno frågar · fråga ${B.qi + 1} av ${QUIZ.length}`;
    quizEl.querySelector('.qq').textContent = Q.q;
    quizEl.querySelector('.qa').innerHTML = Q.a.map((a, i) => `<button type="button" data-i="${i}"><b>${i + 1}</b> ${a}</button>`).join('');
    quizEl.hidden = false; B.locked = false;
  }
  async function answer(i) {
    if (B.phase !== 'quiz' || B.locked) return;
    B.locked = true; const Q = QUIZ[B.qi], tok = B.token, btns = quizEl.querySelectorAll('.qa button');
    btns[i].classList.add(i === Q.ok ? 'right' : 'wrong');
    await wait(700);
    if (tok !== B.token) return;
    quizEl.hidden = true;
    if (i === Q.ok) {
      B.qi++; drawHud(); flash(B.qi >= QUIZ.length ? 'RÄTT! KNOCKOUT!' : 'Rätt!', 'good', 900);
      if (!await guardPunch(B.qi, tok)) return;
      if (B.qi >= QUIZ.length) return finalKo();
    } else {
      // fel svar: Bruno slår, och samma fråga kommer igen
      B.lives--; drawHud(); flash('Fel svar!', 'bad', 1000);
      if (!await gorillaPunch(tok)) return;
      if (B.lives <= 0) return knockedDown();
    }
    await wait(500);
    if (tok !== B.token || B.phase !== 'quiz') return;
    showQuestion();
  }
  async function finalKo() {
    B.phase = 'ko'; hud.hidden = true; const tok = B.token;
    if (!await fallDown(tok)) return;
    await wait(900);
    if (tok !== B.token) return;
    B.beaten = true; B.phase = 'done';
    clearCine(); arenaLight.intensity = arenaIntensity * .4;
    onWin();
  }

  async function knockedDown() {
    B.phase = 'down'; hud.hidden = true; const tok = B.token;
    tone([392, 330, 262, 196], .22, 'triangle', .08);
    await tween(800, k => { guard.body.rotation.x = -Math.PI / 2 * .98 * ease(k); guard.body.position.y = .12 * Math.sin(k * Math.PI); });
    if (tok !== B.token) return;
    // gorillan bankar sig på bröstet
    await tween(1000, k => { const s = Math.sin(k * Math.PI * 8); gor.armL.rotation.x = -1.4 + Math.max(0, s) * .5; gor.armR.rotation.x = -1.4 + Math.max(0, -s) * .5; gor.armL.rotation.z = .5; gor.armR.rotation.z = -.5; });
    if (tok !== B.token) return;
    setGorillaPose();
    document.exitPointerLock?.();
    ko.hidden = false;
  }

  function update(dt, t) {
    if (!gor.g.visible) return;
    if (B.phase === 'fight' || B.phase === 'quiz') {
      // andning och vaggande
      gor.body.position.y = Math.sin(t * 3) * .03; gor.g.rotation.y = Math.sin(t * 1.3) * .08;
      if (B.beat) {
        const k = Math.min(1.25, (performance.now() - B.beat.t0) / B.beat.dur);
        const s = 1 + 2.2 * (1 - k);
        ring.style.transform = `scale(${Math.max(.6, s)})`;
        ring.style.opacity = k > 1 ? String(Math.max(0, 1 - (k - 1) * 5)) : '1';
        if (performance.now() - B.beat.t0 > B.beat.dur + WINDOW) miss('För sent!');
      }
    }
    if (gor.dizzy.visible) gor.dizzy.rotation.y = t * 4;
  }

  function reset() {
    B.token++; B.phase = 'idle'; B.beaten = false; B.beat = null;
    gor.g.visible = false; setGorillaPose(); gor.head.rotation.set(0, 0, 0);
    hud.hidden = true; qte.hidden = true; pad.hidden = true; ko.hidden = true; quizEl.hidden = true; msg.classList.remove('show'); B.stage = 'box';
    arenaLight.intensity = 0; guard.armL.rotation.z = 0; guard.armR.rotation.z = 0;
  }

  return {start, key, update, reset, answer, get active() { return B.phase === 'fight' || B.phase === 'quiz'; }, get phase() { return B.phase; }, get beaten() { return B.beaten; }, get beat() { return B.beat; }, B};
}

window.MuseumBoss = {buildBoss};
})();
