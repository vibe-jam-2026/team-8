// Museum Aurora 3D: a third-person night-guard game.
// Find six gold stars, open the vault, take the crown. Do NOT press the button in Naturhistoria.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// window.__auroraSlow slows the cutscene down (used by automated screenshots)
const slow = () => window.__auroraSlow || 1;
const wait = ms => new Promise(r => setTimeout(r, ms * slow()));
function tween(ms, fn) { ms *= slow(); return new Promise(res => { const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }); }
const ease = k => 1 - Math.pow(1 - k, 3);
const back = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

// ---------- world layout ----------
const W = 20, D = 16, H = 5, DOOR = 3.2, DOOR_H = 3.4, T = 0.3;
const ROOMS = {
  entre:   { name: 'Entréhallen',     sub: 'Bottenvåningen',        grid: [1, 2], wall: 0x8c7d62, floor: 'tile',     light: 0xffd9a0, li: 0.42 },
  konst:   { name: 'Konstgalleriet',  sub: 'Sal 2 · Måleri',        grid: [2, 2], wall: 0x5a1f28, floor: 'wood',     light: 0xffc890, li: 0.4 },
  modern:  { name: 'Moderna salen',   sub: 'Sal 3 · Samtidskonst',  grid: [3, 2], wall: 0xb8b4ac, floor: 'concrete', light: 0xdde8ff, li: 0.38, flicker: true },
  natur:   { name: 'Naturhistoria',   sub: 'Sal 4 · Paleontologi',  grid: [0, 2], wall: 0x2c4234, floor: 'wood',     light: 0xbfe0c0, li: 0.4,  flicker: true },
  mineral: { name: 'Mineralrummet',   sub: 'Sal 5 · Geologi',       grid: [0, 1], wall: 0x1a1c36, floor: 'stone',    light: 0x7080ff, li: 0.12 },
  egypt:   { name: 'Egyptiska salen', sub: 'Sal 6 · Antiken',       grid: [1, 1], wall: 0x9a7f48, floor: 'sand',     light: 0xffa850, li: 0.45 },
  skatt:   { name: 'Skattkammaren',   sub: 'Valvet',                grid: [1, 0], wall: 0x2c1d3e, floor: 'carpet',   light: 0xd090ff, li: 0.4 },
};
const LINKS = [['entre', 'natur'], ['entre', 'konst'], ['entre', 'egypt'], ['konst', 'modern'], ['natur', 'mineral'], ['egypt', 'skatt']];
const byGrid = {}; for (const k in ROOMS) byGrid[ROOMS[k].grid.join(',')] = k;
const center = k => ({ x: ROOMS[k].grid[0] * W, z: ROOMS[k].grid[1] * D });
const roomAt = (x, z) => byGrid[Math.round(x / W) + ',' + Math.round(z / D)];
const isLinked = (a, b) => LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
function neighbor(k, side) { const [c, r] = ROOMS[k].grid; const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side]; return byGrid[(c + d[0]) + ',' + (r + d[1])]; }

// ---------- state ----------
const S = { started: false, busy: false, dead: false, won: false, sound: true, t0: 0, stars: new Set(), room: 'entre',
  yaw: 0, pitch: 0.3, keys: {}, plaque: false, cine: false, shake: 0, alarm: false, bleed: null, drip: 0, pool: 0, unlocked: false };
const STAR_TOTAL = 6;

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040306);
scene.fog = new THREE.FogExp2(0x040306, 0.03);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 120);
scene.add(new THREE.HemisphereLight(0x5a6890, 0x120d0a, 0.04));
// a dim environment for reflections on floors, varnish, glass and blood
{ const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.background = new THREE.Color(0x07070b);
  const box = (c, x, y, z, s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); es.add(m); };
  box(0x1a1612, 0, 6, 0, 4); box(0x0a0e18, 6, 1, 0, 3); box(0x120e0a, -6, 1, 2, 3);
  scene.environment = pm.fromScene(es, .04).texture; }
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

// ---------- helpers ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData = { canvas: c, g }; return t;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, o));
const M = {
  gold: mat(0xc9a24a, { metalness: 0.8, roughness: 0.35 }), wood: mat(0x5a3a22), darkWood: mat(0x34200f),
  white: mat(0xe8e4dc), bone: mat(0xd9ccb0, { roughness: 0.75 }), black: mat(0x141218), steel: mat(0x8a8f99, { metalness: 0.7, roughness: 0.35 }),
  red: mat(0xc1121f, { roughness: 0.4, emissive: 0x400000 }), glass: mat(0xbfd8ff, { transparent: true, opacity: 0.15, roughness: 0.05 }),
};
const wallMeshes = [], colliders = [], interacts = [], anims = [];
function addMesh(parent, geo, m, x, y, z) { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; }
function group(k, x, z, rotY = 0) { const g = new THREE.Group(); const c = center(k); g.position.set(c.x + x, 0, c.z + z); g.rotation.y = rotY; scene.add(g); return g; }
function collide(k, x, z, hw, hd) { const c = center(k); const col = { x: c.x + x, z: c.z + z, hw, hd }; colliders.push(col); return col; }
function info(k, x, z, inf, r = 1.9) { const c = center(k); interacts.push({ room: k, x: c.x + x, z: c.z + z, r, label: 'Läs skylten: ' + inf[0], use: () => showPlaque(inf[0], inf[1], inf[2]) }); }
function textTex(text, w, h, bg, fg, font) {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
}
// A point just in front of a wall, facing into the room
function wallFrame(k, side, along, y, off = 0.02) {
  const { x: cx, z: cz } = center(k), i = T + off;
  switch (side) {
    case 'n': return { pos: V3(cx + along, y, cz - D / 2 + i), rotY: 0, n: [0, 1] };
    case 's': return { pos: V3(cx - along, y, cz + D / 2 - i), rotY: Math.PI, n: [0, -1] };
    case 'w': return { pos: V3(cx - W / 2 + i, y, cz - along), rotY: Math.PI / 2, n: [1, 0] };
    default:  return { pos: V3(cx + W / 2 - i, y, cz + along), rotY: -Math.PI / 2, n: [-1, 0] };
  }
}
function onWall(obj, k, side, along, y, inf, off) {
  const f = wallFrame(k, side, along, y, off); obj.position.copy(f.pos); obj.rotation.y = f.rotY; scene.add(obj);
  if (inf) { const c = center(k); info(k, f.pos.x + f.n[0] * 1.3 - c.x, f.pos.z + f.n[1] * 1.3 - c.z, inf); }
  return f;
}

// ---------- floors, walls, lights ----------
function floorTex(style) {
  return canvasTex(512, 512, (g, w, h) => {
    const R = rng(style.length * 7 + 3);
    if (style === 'tile') {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#8f846f' : '#c9bea8'; g.fillRect(x * 256, y * 256, 256, 256); }
      for (let i = 0; i < 9000; i++) { const v = R() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},.05)`; g.fillRect(R() * w, R() * h, 2, 2); }
      g.strokeStyle = '#4a4236'; g.lineWidth = 5; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
      for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(30,25,20,.5)'; g.lineWidth = 1; g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (R() - .5) * 60; y += (R() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
    } else if (style === 'wood') {
      for (let i = 0; i < 8; i++) {
        const l = 18 + R() * 12; g.fillStyle = `hsl(24,40%,${l}%)`; g.fillRect(0, i * 64, 512, 64);
        for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(0,0,0,${.05 + R() * .12})`; g.lineWidth = 1 + R() * 2; const y = i * 64 + R() * 64; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(170, y + (R() - .5) * 10, 340, y + (R() - .5) * 10, 512, y + (R() - .5) * 6); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, i * 64, 512, 3); g.fillRect(R() * 512, i * 64, 3, 64);
      }
    } else if (style === 'concrete') {
      g.fillStyle = '#6e6e6a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i++) { const v = R() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},.07)`; g.fillRect(R() * w, R() * h, 2, 2); }
      for (let i = 0; i < 8; i++) { const x = R() * w, y = R() * h, r = 30 + R() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    } else if (style === 'carpet') {
      g.fillStyle = '#34114a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 12000; i++) { g.fillStyle = `rgba(${R() < .5 ? 0 : 120},0,${R() < .5 ? 40 : 120},.08)`; g.fillRect(R() * w, R() * h, 2, 2); }
      g.strokeStyle = '#b8892f'; g.lineWidth = 8; g.beginPath(); g.moveTo(256, 20); g.lineTo(492, 256); g.lineTo(256, 492); g.lineTo(20, 256); g.closePath(); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(256, 70); g.lineTo(442, 256); g.lineTo(256, 442); g.lineTo(70, 256); g.closePath(); g.stroke();
    } else {
      const hue = style === 'sand' ? 36 : 235, sat = style === 'sand' ? 30 : 12, base = style === 'sand' ? 34 : 9;
      g.fillStyle = '#050505'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) {
        const ox = (y % 2) * 84, bx = x * 170 + ox + 4, by = y * 128 + 4; g.fillStyle = `hsl(${hue},${sat}%,${base + R() * 8}%)`; g.fillRect(bx, by, 162, 120);
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${R() * .12})`; g.fillRect(bx + R() * 162, by + R() * 120, 3, 3); }
      }
    }
  }, [4, 3]);
}
function wallTex(hex, seed) {
  const c = new THREE.Color(hex), R = rng(seed);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) { g.fillStyle = R() < .5 ? `rgba(0,0,0,${.03 + R() * .06})` : `rgba(255,255,255,${.02 + R() * .03})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = x * 256 + 128, cy = y * 256 + 128; g.beginPath(); g.ellipse(cx, cy, 46, 80, 0, 0, 7); g.moveTo(cx, cy - 80); g.bezierCurveTo(cx + 60, cy - 30, cx - 60, cy + 30, cx, cy + 80);
      g.moveTo(cx - 46, cy); g.quadraticCurveTo(cx, cy - 34, cx + 46, cy); g.moveTo(cx + 6, cy - 120); g.lineTo(cx, cy - 104); g.lineTo(cx - 6, cy - 120); g.stroke(); g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.stroke();
    }
    for (let i = 0; i < 12; i++) { const x = R() * w, y = R() * h, r = 40 + R() * 130, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,10,0,.22)'); gr.addColorStop(1, 'rgba(20,10,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 30; i++) { const x = R() * w, l = 40 + R() * 220, y = R() * h * .6, gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + R() * 3, l); }
  });
}
function panelTex(hex) {
  const c = new THREE.Color(hex).multiplyScalar(.6);
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = i * 128 + 12, y = 14, pw = 104, ph = 100;
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, pw, 4); g.fillRect(x, y, 4, ph); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + ph - 4, pw, 4); g.fillRect(x + pw - 4, y, 4, ph); }
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, w, 6); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 6, w, 3);
  });
}
const ceilTex = canvasTex(512, 512, (g, w, h) => { const R = rng(5); g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#0b0907'; g.fillRect(i * 128, 0, 22, h); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(i * 128 + 22, 0, 3, h); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(200,200,200,.06)'; g.beginPath(); const x = R() * w, y = R() * h; g.moveTo(x, y); g.lineTo(x + (R() - .5) * 80, y + (R() - .5) * 80); g.stroke(); } }, [4, 3]);
function repeatTex(t, rx, ry) { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); return c; }
const doorSignMat = {};
function buildRoom(k) {
  const r = ROOMS[k], { x: cx, z: cz } = center(k);
  const ft = floorTex(r.floor);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xffffff, { map: ft, bumpMap: ft, bumpScale: .02, roughness: r.floor === 'carpet' ? .95 : r.floor === 'wood' ? .45 : .55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xffffff, { map: ceilTex, roughness: .9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H, cz); scene.add(ceil);
  const wt = wallTex(r.wall, k.length * 17 + r.grid[0] * 5 + r.grid[1]), pt = panelTex(r.wall);
  const wallMat = L => { const t = repeatTex(wt, Math.max(1, L / 4), H / 4); return mat(0xffffff, { map: t, bumpMap: t, bumpScale: .012, roughness: .92 }); };
  const panelMat = L => mat(0xffffff, { map: repeatTex(pt, Math.max(1, L / 4), 1), roughness: .55 });
  const crown = mat(new THREE.Color(r.wall).multiplyScalar(.4), { roughness: .6 });
  for (const side of ['n', 's', 'w', 'e']) {
    const nb = neighbor(k, side), linked = nb && isLinked(k, nb), horiz = side === 'n' || side === 's';
    const len = horiz ? W : D;
    const fixed = side === 'n' ? cz - D / 2 + T / 2 : side === 's' ? cz + D / 2 - T / 2 : side === 'w' ? cx - W / 2 + T / 2 : cx + W / 2 - T / 2;
    const mid = horiz ? cx : cz;
    const segs = linked ? [[mid - len / 2, mid - DOOR / 2], [mid + DOOR / 2, mid + len / 2]] : [[mid - len / 2, mid + len / 2]];
    for (const [a, b] of segs) {
      const L = b - a, c = (a + b) / 2;
      const m = horiz ? addMesh(scene, new THREE.BoxGeometry(L, H, T), wallMat(L), c, H / 2, fixed) : addMesh(scene, new THREE.BoxGeometry(T, H, L), wallMat(L), fixed, H / 2, c);
      wallMeshes.push(m);
      colliders.push(horiz ? { x: c, z: fixed, hw: L / 2, hd: T / 2 } : { x: fixed, z: c, hw: T / 2, hd: L / 2 });
      // wood panelling below, a moulding along the top
      if (horiz) { addMesh(scene, new THREE.BoxGeometry(L, 1.1, T + .08), panelMat(L), c, .55, fixed); addMesh(scene, new THREE.BoxGeometry(L, .22, T + .16), crown, c, H - .11, fixed); addMesh(scene, new THREE.BoxGeometry(L, .06, T + .14), crown, c, 1.13, fixed); }
      else { addMesh(scene, new THREE.BoxGeometry(T + .08, 1.1, L), panelMat(L), fixed, .55, c); addMesh(scene, new THREE.BoxGeometry(T + .16, .22, L), crown, fixed, H - .11, c); addMesh(scene, new THREE.BoxGeometry(T + .14, .06, L), crown, fixed, 1.13, c); }
    }
    if (linked) {
      const hh = H - DOOR_H;
      const m = horiz ? addMesh(scene, new THREE.BoxGeometry(DOOR, hh, T), wallMat(DOOR), mid, DOOR_H + hh / 2, fixed) : addMesh(scene, new THREE.BoxGeometry(T, hh, DOOR), wallMat(DOOR), fixed, DOOR_H + hh / 2, mid);
      wallMeshes.push(m);
      // door frame
      const fr = mat(0x24170e, { roughness: .5 });
      for (const s of [-1, 1]) { if (horiz) addMesh(scene, new THREE.BoxGeometry(.16, DOOR_H, T + .2), fr, mid + s * (DOOR / 2 + .08), DOOR_H / 2, fixed); else addMesh(scene, new THREE.BoxGeometry(T + .2, DOOR_H, .16), fr, fixed, DOOR_H / 2, mid + s * (DOOR / 2 + .08)); }
      if (horiz) addMesh(scene, new THREE.BoxGeometry(DOOR + .32, .16, T + .2), fr, mid, DOOR_H + .08, fixed); else addMesh(scene, new THREE.BoxGeometry(T + .2, .16, DOOR + .32), fr, fixed, DOOR_H + .08, mid);
      if (!doorSignMat[nb]) doorSignMat[nb] = mat(0xffffff, { map: textTex(ROOMS[nb].name, 512, 96, '#15110d', '#e9c45e', 'bold 46px Georgia'), roughness: .5 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), doorSignMat[nb]);
      onWall(sign, k, side, 0, DOOR_H + 0.55, null, 0.01);
      if (!r.exit) { r.exit = true; onWall(new THREE.Mesh(new THREE.PlaneGeometry(.9, .3), exitMat), k, side, 2.5, DOOR_H + .25, null, .01); }
    }
  }
  // the ceiling lamp is off; only a cold night glow remains
  r.lampMat = mat(0x111111, { emissive: 0xffd9a0, emissiveIntensity: 0, roughness: .4 });
  addMesh(scene, new THREE.CylinderGeometry(0.5, 0.7, 0.25, 24), r.lampMat, cx, H - 0.15, cz);
  r.li = k === 'mineral' ? .05 : .08;
  const L = new THREE.PointLight(0x6070a0, r.li, 20, 1.6); L.position.set(cx, H - 0.6, cz); scene.add(L);
  r.lamp = L; r.flickerT = 0;
}
const exitMat = new THREE.MeshBasicMaterial({ map: textTex('NÖDUTGÅNG', 256, 86, '#0a7a32', '#e8fff0', 'bold 38px system-ui'), toneMapped: false });
for (const k in ROOMS) buildRoom(k);

// ---------- art ----------
function drawArt(kind, g, w, h, seed) {
  const R = rng(seed);
  if (kind === 'landscape') {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a65a'); gr.addColorStop(1, '#f8e2ad'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(w * .68, h * .38, h * .1, 0, 7); g.fill();
    [['#7d9a62', .6], ['#5b8fa8', .74], ['#46663f', .86]].forEach(([c, y]) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h * y); g.quadraticCurveTo(w * .4, h * (y - .12), w, h * (y - .02)); g.lineTo(w, h); g.lineTo(0, h); g.fill(); });
    g.fillStyle = '#2f3b25'; g.beginPath(); g.arc(w * .2, h * .64, w * .08, 0, 7); g.fill(); g.fillRect(w * .195, h * .64, 5, h * .2);
  } else if (kind === 'portrait') {
    g.fillStyle = '#25302b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6a2c35'; g.beginPath(); g.ellipse(w * .5, h, w * .4, h * .35, 0, 0, 7); g.fill();
    g.fillStyle = '#e2b892'; g.fillRect(w * .42, h * .6, w * .16, h * .12);
    g.fillStyle = '#efc9a2'; g.beginPath(); g.ellipse(w * .5, h * .45, w * .17, h * .17, 0, 0, 7); g.fill();
    g.fillStyle = '#3a2418'; g.beginPath(); g.ellipse(w * .5, h * .33, w * .2, h * .1, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(w * .44, h * .45, 3.5, 0, 7); g.arc(w * .56, h * .45, 3.5, 0, 7); g.fill();
    g.strokeStyle = '#a5604f'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * .45, h * .54); g.quadraticCurveTo(w * .5, h * .56, w * .55, h * .54); g.stroke();
    g.fillStyle = '#f2d27a'; g.beginPath(); g.arc(w * .5, h * .7, w * .03, 0, 7); g.fill();
  } else if (kind === 'sea') {
    g.fillStyle = '#9bb7c9'; g.fillRect(0, 0, w, h * .55); g.fillStyle = '#2f5b78'; g.fillRect(0, h * .55, w, h * .45);
    g.strokeStyle = 'rgba(232,241,245,.5)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = h * .58 + i * h * .07; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 14 + i) * 4); g.stroke(); }
    g.fillStyle = '#5a3a26'; g.fillRect(w * .38, h * .6, w * .3, h * .05); g.fillStyle = '#f4efe3'; g.beginPath(); g.moveTo(w * .52, h * .6); g.lineTo(w * .52, h * .3); g.lineTo(w * .68, h * .56); g.fill();
  } else if (kind === 'abstract') {
    g.fillStyle = '#efe6d4'; g.fillRect(0, 0, w, h); const pal = ['#e4572e', '#f3a712', '#29335c', '#a8c686', '#db2b39', '#3c91e6'];
    for (let i = 0; i < 9; i++) { g.fillStyle = pal[Math.floor(R() * pal.length)]; if (R() < .5) g.fillRect(R() * w * .8, R() * h * .8, w * (.15 + R() * .4), h * (.08 + R() * .3)); else { g.beginPath(); g.arc(R() * w, R() * h, w * (.06 + R() * .18), 0, 7); g.fill(); } }
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, h * .7); g.lineTo(w, h * .3); g.moveTo(w * .3, 0); g.lineTo(w * .3, h); g.stroke();
  } else { g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, w, h); }
}
function painting(k, side, along, y, w, h, kind, seed, inf, frame = true) {
  const g = new THREE.Group();
  const tex = canvasTex(256, Math.round(256 * h / w), (c, cw, ch) => drawArt(kind, c, cw, ch, seed));
  addMesh(g, new THREE.PlaneGeometry(w, h), mat(0xffffff, { map: tex, roughness: 0.6 }), 0, 0, 0.05);
  if (frame) addMesh(g, new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.08), M.gold, 0, 0, 0);
  onWall(g, k, side, along, y, inf);
}
function glyphTex(cols, rows, seed) {
  return canvasTex(256, 256 * rows / cols, (g, w, h) => {
    const R = rng(seed); g.fillStyle = '#c9a964'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5a3d1a'; g.fillStyle = '#5a3d1a'; g.lineWidth = 3;
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw / 2, y = r * ch + ch / 2, s = Math.min(cw, ch) * .3, t = Math.floor(R() * 5); g.beginPath();
      if (t === 0) { g.ellipse(x, y, s, s * .5, 0, 0, 7); g.moveTo(x + s * .25, y); g.arc(x, y, s * .25, 0, 7); }
      else if (t === 1) { g.moveTo(x - s, y + s); g.lineTo(x, y - s); g.lineTo(x + s, y + s); }
      else if (t === 2) { g.moveTo(x - s, y); g.quadraticCurveTo(x, y - s * 1.5, x + s, y); g.moveTo(x, y - s * .7); g.lineTo(x, y + s); }
      else if (t === 3) { g.arc(x, y, s * .7, 0, 7); }
      else { g.moveTo(x - s, y - s); g.lineTo(x + s, y - s); g.moveTo(x, y - s); g.lineTo(x, y + s); g.moveTo(x - s * .6, y + s); g.lineTo(x + s * .6, y + s); }
      g.stroke();
    }
  });
}

// ---------- props ----------
function plant(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.CylinderGeometry(0.35, 0.28, 0.6, 14), mat(0x8a4b2a), 0, 0.3, 0);
  const leaf = mat(0x234d2a);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const m = addMesh(g, new THREE.SphereGeometry(0.35, 8, 6), leaf, Math.cos(a) * .35, 1 + (i % 3) * .3, Math.sin(a) * .35); m.scale.set(1, .25, .6); m.rotation.set(Math.random(), a, .6); }
  collide(k, x, z, .4, .4); info(k, x, z, inf, 1.6);
}
function desk(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(3, 1.1, 1), M.wood, 0, .55, 0);
  addMesh(g, new THREE.BoxGeometry(3.1, .06, 1.1), M.gold, 0, 1.13, 0);
  addMesh(g, new THREE.SphereGeometry(.09, 12, 8, 0, 7, 0, 1.6), M.gold, .9, 1.16, 0);
  addMesh(g, new THREE.PlaneGeometry(.3, .2), M.white, -.4, 1.17, .1).rotation.x = -Math.PI / 2;
  collide(k, x, z, 1.5, .5); info(k, x, z + 1, inf);
}
function bench(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(3, .12, .6), M.darkWood, 0, .48, 0);
  for (const s of [-1.3, 1.3]) addMesh(g, new THREE.BoxGeometry(.1, .45, .5), M.black, s, .22, 0);
  collide(k, x, z, 1.5, .3); info(k, x, z, inf, 1.6);
}
function pedestal(g, h = 1.1, w = .9, m = M.white) { addMesh(g, new THREE.BoxGeometry(w, h, w), m, 0, h / 2, 0); }
function sculpture(k, x, z, inf) {
  const g = group(k, x, z); pedestal(g);
  const c = addMesh(g, new THREE.BoxGeometry(.5, .5, .5), mat(0xc0392b, { metalness: .6, roughness: .25 }), 0, 1.1 + .43, 0);
  c.rotation.set(Math.atan(1 / Math.SQRT2), 0, Math.PI / 4);
  collide(k, x, z, .45, .45); info(k, x, z, inf, 1.6);
}
function mobile(k, x, z, inf) {
  const g = group(k, x, z); g.position.y = 4.2;
  const wire = mat(0x222222), cols = [0xe4572e, 0x29335c, 0xf3a712, 0x111111];
  addMesh(g, new THREE.CylinderGeometry(.01, .01, .8), wire, 0, .4, 0);
  const arm = new THREE.Group(); g.add(arm);
  addMesh(arm, new THREE.CylinderGeometry(.012, .012, 2), wire, 0, 0, 0).rotation.z = Math.PI / 2;
  [-1, 1].forEach((s, i) => {
    addMesh(arm, new THREE.CylinderGeometry(.006, .006, .6), wire, s, -.3, 0);
    addMesh(arm, new THREE.CylinderGeometry(.25, .25, .02, 20), mat(cols[i]), s, -.65, 0).rotation.x = Math.PI / 2;
  });
  const arm2 = new THREE.Group(); arm2.position.set(.5, -.9, 0); arm.add(arm2);
  addMesh(arm2, new THREE.CylinderGeometry(.01, .01, 1.2), wire, 0, 0, 0).rotation.z = Math.PI / 2;
  [-.6, .6].forEach((s, i) => addMesh(arm2, new THREE.CylinderGeometry(.16, .16, .02, 20), mat(cols[i + 2]), s, -.3, 0).rotation.x = Math.PI / 2);
  anims.push((dt, t) => { arm.rotation.y += dt * .25; arm2.rotation.y = Math.sin(t * .7) * 1.2; });
  info(k, x, z, inf, 2);
}
let tvTex = null;
function tv(k, x, z, inf) {
  const g = group(k, x, z, -Math.PI / 2);
  addMesh(g, new THREE.BoxGeometry(.6, .8, .6), M.black, 0, .4, 0);
  addMesh(g, new THREE.BoxGeometry(1.2, .9, .8), mat(0x2a2a2a), 0, 1.25, 0);
  tvTex = canvasTex(64, 48, () => {});
  addMesh(g, new THREE.PlaneGeometry(.95, .7), new THREE.MeshBasicMaterial({ map: tvTex }), 0, 1.25, .41);
  collide(k, x, z, .5, .6); info(k, x - 1, z, inf, 1.6);
}
function updateTv(t) {
  if (!tvTex) return;
  const { canvas: c, g } = tvTex.userData, img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 200 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (t % 11 < .25) { g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.arc(24, 20, 4, 0, 7); g.arc(40, 20, 4, 0, 7); g.fill(); g.fillRect(26, 32, 12, 3); }
  tvTex.needsUpdate = true;
}
function butterflyCase(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(2.4, .9, 1), M.wood, 0, .45, 0);
  const glass = addMesh(g, new THREE.BoxGeometry(2.3, .5, .9), M.glass, 0, 1.15, 0); glass.castShadow = false;
  const cols = ['#2b6cff', '#ff8c42', '#f2d24a', '#e84a8a', '#43c08a', '#9b5de5'];
  cols.forEach((c, i) => {
    const t = canvasTex(64, 64, (gg) => { gg.fillStyle = c; gg.beginPath(); gg.ellipse(18, 26, 16, 20, -.4, 0, 7); gg.ellipse(46, 26, 16, 20, .4, 0, 7); gg.ellipse(22, 48, 10, 12, 0, 0, 7); gg.ellipse(42, 48, 10, 12, 0, 0, 7); gg.fill(); gg.fillStyle = '#111'; gg.fillRect(30, 14, 4, 40); });
    const m = addMesh(g, new THREE.PlaneGeometry(.3, .3), mat(0xffffff, { map: t, transparent: true }), -.8 + (i % 3) * .8, .92, -.2 + Math.floor(i / 3) * .4); m.rotation.x = -Math.PI / 2;
  });
  collide(k, x, z, 1.2, .5); info(k, x, z + 1, inf);
}
function crystal(k, x, z, color, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.DodecahedronGeometry(.5), mat(0x2a2a33, { flatShading: true }), 0, .3, 0).scale.y = .6;
  const cm = mat(color, { emissive: color, emissiveIntensity: .9, roughness: .2, transparent: true, opacity: .9 });
  for (let i = 0; i < 6; i++) { const m = addMesh(g, new THREE.OctahedronGeometry(.18 + Math.random() * .12), cm, (Math.random() - .5) * .5, .7 + Math.random() * .3, (Math.random() - .5) * .5); m.scale.y = 2.4; m.rotation.set((Math.random() - .5) * .8, Math.random() * 3, (Math.random() - .5) * .8); m.castShadow = false; }
  anims.push((dt, t) => { cm.emissiveIntensity = .7 + Math.sin(t * 1.3 + x) * .3; });
  collide(k, x, z, .5, .5); info(k, x, z, inf, 1.6);
}
function meteor(k, x, z, inf) {
  const g = group(k, x, z); pedestal(g, .8, 1, mat(0x24252e));
  addMesh(g, new THREE.DodecahedronGeometry(.55, 1), mat(0x3a332e, { metalness: .7, roughness: .5, flatShading: true }), 0, 1.3, 0);
  collide(k, x, z, .5, .5); info(k, x, z, inf, 1.7);
}
function sarcophagus(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(1.2, .9, 2.6), mat(0x9a7230, { metalness: .3 }), 0, .45, 0);
  addMesh(g, new THREE.BoxGeometry(1.1, .2, 2.5), mat(0x2d5a8a), 0, 1, 0);
  const face = canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#d9a640'; c.fillRect(0, 0, w, h); c.fillStyle = '#2d5a8a'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 20, 22, 10), c.fillRect(w - 22, i * 20, 22, 10); c.fillStyle = '#000'; c.beginPath(); c.ellipse(46, 62, 10, 6, 0, 0, 7); c.ellipse(82, 62, 10, 6, 0, 0, 7); c.fill(); c.fillRect(54, 110, 20, 6); });
  addMesh(g, new THREE.BoxGeometry(.8, .25, .7), mat(0xffffff, { map: face }), 0, 1.2, -.85);
  collide(k, x, z, .6, 1.3); info(k, x + 1.2, z, inf);
}
function urn(k, x, z, s, color, inf) {
  const g = group(k, x, z);
  const pts = [[0, 0], [.18, 0], [.26, .15], [.3, .38], [.24, .62], [.13, .74], [.16, .8], [0, .82]].map(([a, b]) => new THREE.Vector2(a * s * 1.4, b * s * 1.4));
  addMesh(g, new THREE.LatheGeometry(pts, 22), mat(color, { roughness: .5 }), 0, 0, 0);
  addMesh(g, new THREE.SphereGeometry(.12 * s * 1.4, 12, 8), mat(color), 0, 1.15 * s * 1.4 * .82 / 1.15 + .05, 0);
  collide(k, x, z, .35 * s, .35 * s); info(k, x, z, inf, 1.5);
}
function chest(k, x, z, inf) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(1.4, .7, .9), M.wood, 0, .35, 0);
  const lid = addMesh(g, new THREE.CylinderGeometry(.45, .45, 1.4, 16, 1, false, 0, Math.PI), M.wood, 0, .7, 0); lid.rotation.z = Math.PI / 2;
  for (const s of [-.5, .5]) addMesh(g, new THREE.BoxGeometry(.08, .75, .94), M.gold, s, .38, 0);
  for (let i = 0; i < 8; i++) addMesh(g, new THREE.CylinderGeometry(.06, .06, .02, 12), M.gold, (Math.random() - .5) * .9, .02, .6 + Math.random() * .3);
  collide(k, x, z, .7, .45); info(k, x, z + 1, inf);
}
let crownObj = null;
function crown(k, x, z) {
  const g = group(k, x, z); pedestal(g, 1.1, 1, mat(0x1d1424));
  addMesh(g, new THREE.BoxGeometry(1.05, .06, 1.05), M.gold, 0, 1.1, 0);
  const c = new THREE.Group(); c.position.y = 1.5; g.add(c);
  const gm = mat(0xffcf4a, { metalness: .9, roughness: .25, emissive: 0x6a4a00, emissiveIntensity: .8 });
  addMesh(c, new THREE.TorusGeometry(.3, .06, 10, 28), gm, 0, 0, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; addMesh(c, new THREE.ConeGeometry(.06, .25, 8), gm, Math.cos(a) * .3, .13, Math.sin(a) * .3); addMesh(c, new THREE.SphereGeometry(.04, 8, 6), mat(0xd0103a, { emissive: 0x600010 }), Math.cos(a + .4) * .34, 0, Math.sin(a + .4) * .34); }
  anims.push((dt, t) => { c.rotation.y += dt * .6; c.position.y = 1.5 + Math.sin(t * 1.8) * .05; });
  crownObj = c;
  collide(k, x, z, .5, .5);
  const ce = center(k);
  interacts.push({ room: k, x: ce.x + x, z: ce.z + z, r: 1.9, label: 'Ta Aurorakronan', use: win });
}
function hazardTex() {
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2c94c'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 24, 0); g.lineTo(i * 24 + 12, 0); g.lineTo(i * 24 + 12 + h, h); g.lineTo(i * 24 + h, h); g.fill(); } });
}
let btnCap = null, btnWorld = null;
function dangerButton(k, x, z) {
  const g = group(k, x, z);
  addMesh(g, new THREE.BoxGeometry(.7, 1, .7), mat(0xffffff, { map: hazardTex() }), 0, .5, 0);
  addMesh(g, new THREE.CylinderGeometry(.28, .3, .08, 20), M.black, 0, 1.04, 0);
  btnCap = addMesh(g, new THREE.CylinderGeometry(.2, .22, .14, 20), M.red, 0, 1.12, 0);
  addMesh(g, new THREE.CylinderGeometry(.03, .03, .8), M.steel, -.25, 1.4, -.25);
  const sign = addMesh(g, new THREE.PlaneGeometry(1.28, .5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 200, (c, w, h) => { c.fillStyle = '#f2c94c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#111'; c.lineWidth = 16; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#c1121f'; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs = 96; do { c.font = `900 ${fs}px system-ui, sans-serif`; fs -= 4; } while (c.measureText('KLICKA INTE!').width > w - 60); c.fillText('KLICKA INTE!', w / 2, h / 2 + 4); }), side: THREE.DoubleSide }), -.25, 2.05, -.25);
  sign.rotation.y = Math.PI / 4;
  collide(k, x, z, .35, .35);
  btnWorld = g.position.clone();
  const ce = center(k);
  interacts.push({ room: k, x: ce.x + x, z: ce.z + z, r: 1.5, label: '⚠ Tryck på knappen', danger: true, use: doom });
}

// ---------- the dinosaur ----------
function boneBetween(parent, a, b, r, m) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * .8, r, 1, 8), m); mesh.castShadow = true; parent.add(mesh); setBetween(mesh, a, b); return mesh;
}
function setBetween(mesh, a, b) { mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(1, a.distanceTo(b), 1); mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); }

// ---------- the face: a T-rex head with the original photo for a face ----------
// Regions in the 360x350 photo: [x, y, width, height]
const FACE = { full: [40, 0, 280, 300], hair: [96, 6, 168, 60], skin: [116, 180, 18, 18] };
const photoImg = new Image(), faceTex = {};
function photoCrop(name, [sx, sy, sw, sh], soft = .38, repeat) {
  const ow = 512, oh = Math.round(ow * sh / sw);
  const t = canvasTex(ow, oh, () => {}, repeat);
  t.userData.draw = () => {
    const g = t.userData.g; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, ow, oh);
    g.filter = 'contrast(1.12) saturate(1.05)'; g.drawImage(photoImg, sx, sy, sw, sh, 0, 0, ow, oh); g.filter = 'none';
    if (soft) { // fade the edges so the face melts into the skin
      g.globalCompositeOperation = 'destination-in'; g.save(); g.translate(ow / 2, oh / 2); g.scale(1, oh / ow);
      const gr = g.createRadialGradient(0, 0, ow / 2 * (1 - soft), 0, 0, ow / 2 * 1.08); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(-ow / 2, -ow / 2, ow, ow); g.restore(); g.globalCompositeOperation = 'source-over';
    }
    t.needsUpdate = true;
  };
  faceTex[name] = t; return t;
}
photoCrop('full', FACE.full, .2); photoCrop('hair', FACE.hair, 0, [3, 1]);
// Each head part is a sphere with an equirectangular skin map; the photo is painted on the front of the skull,
// so it is lit exactly like the skin around it. phi = PI is the front.
const PARTS = { cran: [{ f: 'full', phi: Math.PI, th: 1.2, pw: 2.0, tw: 1.9 }], snout: [], jaw: [] };
const partTex = {};
for (const k in PARTS) partTex[k] = canvasTex(2048, 1024, (g, w, h) => { g.fillStyle = '#c49a86'; g.fillRect(0, 0, w, h); });
function paintHead() {
  const c = document.createElement('canvas'); c.width = c.height = 8; const cg = c.getContext('2d');
  const [sx, sy, sw, sh] = FACE.skin; cg.drawImage(photoImg, sx, sy, sw, sh, 0, 0, 8, 8);
  const d = cg.getImageData(0, 0, 8, 8).data; let r = 0, gr = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; r = r / n | 0; gr = gr / n | 0; b = b / n | 0;
  for (const k in PARTS) {
    const { g, canvas } = partTex[k].userData, w = canvas.width, h = canvas.height, R = rng(k.length * 31);
    g.fillStyle = `rgb(${r},${gr},${b})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < .5 ? '120,40,40' : '60,40,30'},${.03 + R() * .06})`; g.beginPath(); g.arc(R() * w, R() * h, 4 + R() * 36, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(70,40,90,.3)'; g.lineWidth = 3;
    for (let i = 0; i < 50; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let s = 0; s < 7; s++) { x += (R() - .5) * 180; y += (R() - .5) * 120; g.lineTo(x, y); } g.stroke(); }
    if (k === 'cran') { // his hair over the back of the skull
      g.save(); g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= w; x += 8) { const phi = x / w * Math.PI * 2, lim = .5 + 1.0 * (1 + Math.cos(phi)) / 2 + Math.sin(x * .05) * .05; g.lineTo(x, lim / Math.PI * h); }
      g.lineTo(w, 0); g.closePath(); g.clip();
      g.fillStyle = g.createPattern(faceTex.hair.userData.canvas, 'repeat'); g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(30,18,8,.5)'; g.lineWidth = 3; for (let i = 0; i < 300; i++) { const x = R() * w; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (R() - .5) * 60, h * .2, x + (R() - .5) * 40, h * (.2 + R() * .3)); g.stroke(); }
      g.restore();
    }
    for (const ft of PARTS[k]) { const src = faceTex[ft.f].userData.canvas, x = (ft.phi - ft.pw / 2) / (Math.PI * 2) * w, y = (ft.th - ft.tw / 2) / Math.PI * h; g.drawImage(src, x, y, ft.pw / (Math.PI * 2) * w, ft.tw / Math.PI * h); }
    partTex[k].needsUpdate = true;
  }
}
photoImg.onload = () => { for (const k in faceTex) faceTex[k].userData.draw(); paintHead(); };
photoImg.src = window.DINO_PHOTO || 'assets/dino-head.jpg';
function buildFaceHead(flesh, toothM) {
  const skinOf = k => mat(0xffffff, { map: partTex[k], roughness: .45, emissiveMap: partTex[k], emissive: 0xffffff, emissiveIntensity: .1 });
  const gum = mat(0x4a0610, { roughness: .25 });
  dino.skinMat = mat(0xffffff, { map: partTex.snout, roughness: .45 });
  const ball = (parent, k, x, y, z, sx, sy, sz) => { const b = new THREE.Group(); b.position.set(x, y, z); b.scale.set(sx, sy, sz); parent.add(b); addMesh(b, new THREE.SphereGeometry(.5, 64, 48), skinOf(k), 0, 0, 0); return b; };
  // the skull: his whole face on the front, his hair over the back
  ball(flesh, 'cran', .42, .4, 0, 1.1, 1.15, 1.0);
  const strand = mat(0x3a2616, { roughness: .8 });
  for (let i = 0; i < 22; i++) { const zz = (i / 21 - .5) * .85, len = .4 + Math.random() * .6; const s = addMesh(flesh, new THREE.CylinderGeometry(.02, .006, len, 5), strand, -.02 + Math.random() * .1, .45 - len / 2, zz); s.rotation.z = -.2 + Math.random() * .3; s.rotation.x = zz * .6; }
  // the T-rex snout and jaws jut out under his chin
  ball(flesh, 'snout', 1.08, -.12, 0, .95, .42, .6);
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) { const a = i / 9; addMesh(flesh, new THREE.ConeGeometry(.035 + .015 * (1 - a), .22, 6), toothM, .66 + a * .86, -.31, s * (.27 - a * .13)).rotation.x = Math.PI; }
  addMesh(flesh, new THREE.BoxGeometry(.95, .06, .44), gum, 1.08, -.28, 0);
  const fjaw = new THREE.Group(); fjaw.position.set(.3, -.32, 0); fjaw.rotation.z = -.12; flesh.add(fjaw); dino.fjaw = fjaw;
  ball(fjaw, 'jaw', .78, -.06, 0, .95, .26, .56);
  addMesh(fjaw, new THREE.BoxGeometry(.9, .05, .42), gum, .78, .04, 0);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const a = i / 8; addMesh(fjaw, new THREE.ConeGeometry(.03 + .012 * (1 - a), .18, 6), toothM, .38 + a * .82, .12, s * (.25 - a * .1)); }
  dino.mouth = new THREE.Object3D(); dino.mouth.position.set(1.1, -.42, 0); flesh.add(dino.mouth);
}
const dino = {};
function buildDino(k, x, z) {
  const g = group(k, x, z); dino.g = g;
  addMesh(g, new THREE.BoxGeometry(8.2, .3, 2.8), mat(0x241a12), -1, .15, 0); collide(k, x - 1, z, 4.1, 1.4);
  const spine = new THREE.CatmullRomCurve3([V3(-5.6, .9, 0), V3(-4, 1.5, 0), V3(-2, 2.1, 0), V3(-.3, 2.45, 0), V3(1.2, 2.6, 0), V3(2.2, 2.95, 0)]);
  const N = 30;
  for (let i = 0; i < N; i++) { const k2 = i / (N - 1), p = spine.getPoint(k2); addMesh(g, new THREE.SphereGeometry(.05 + .12 * Math.min(1, k2 * 1.6), 8, 6), M.bone, p.x, p.y, p.z); if (i % 2 === 0) addMesh(g, new THREE.ConeGeometry(.04 + .05 * k2, .25 * k2 + .08, 6), M.bone, p.x, p.y + .15 + .1 * k2, 0); }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(spine, 50, .045, 6, false), M.bone));
  for (let i = 0; i < 8; i++) { const xx = -.6 + i * .27, y = 2.4 + i * .025, r = .62 - Math.abs(i - 3.5) * .06; const rib = addMesh(g, new THREE.TorusGeometry(r, .035, 6, 18, Math.PI), M.bone, xx, y, 0); rib.rotation.set(0, Math.PI / 2, Math.PI); }
  addMesh(g, new THREE.BoxGeometry(.9, .45, .7), M.bone, 0, 2.15, 0);
  for (const s of [-1, 1]) {
    const hip = V3(0, 2.1, .42 * s), knee = V3(.6, 1.25, .5 * s), ankle = V3(-.05, .45, .5 * s), toe = V3(.55, .32, .55 * s);
    boneBetween(g, hip, knee, .13, M.bone); boneBetween(g, knee, ankle, .1, M.bone); boneBetween(g, ankle, toe, .07, M.bone);
    addMesh(g, new THREE.SphereGeometry(.15, 8, 6), M.bone, knee.x, knee.y, knee.z);
    for (const t of [-.12, 0, .12]) boneBetween(g, toe, V3(.85, .3, .55 * s + t), .03, M.bone);
    const sh = V3(1.4, 2.3, .32 * s), el = V3(1.75, 1.9, .38 * s); boneBetween(g, sh, el, .05, M.bone); boneBetween(g, el, V3(1.95, 2, .4 * s), .035, M.bone);
  }
  // support rods
  for (const px of [-3, 0, 1.6]) boneBetween(g, V3(px, .3, 0), V3(px, spine.getPoint((px + 5.6) / 7.8).y, 0), .03, M.steel);
  // head
  dino.neckBase = V3(2.2, 2.95, 0);
  const hp = new THREE.Group(); hp.position.set(2.5, 3.15, 0); hp.rotation.z = -.15; g.add(hp); dino.headPivot = hp; dino.rest = hp.position.clone();
  dino.neck = boneBetween(g, dino.neckBase, hp.position, .14, M.bone);
  const skull = new THREE.Group(); hp.add(skull); dino.skull = skull;
  addMesh(skull, new THREE.BoxGeometry(1.1, .55, .58), M.bone, .5, .08, 0);
  addMesh(skull, new THREE.BoxGeometry(.6, .38, .42), M.bone, 1.25, 0, 0);
  addMesh(skull, new THREE.BoxGeometry(.5, .12, .66), M.bone, .35, .36, 0);
  const sock = mat(0x0a0606);
  for (const s of [-1, 1]) { addMesh(skull, new THREE.SphereGeometry(.12, 10, 8), sock, .42, .18, .26 * s); }
  dino.eyeMat = mat(0x200000, { emissive: 0xff1010, emissiveIntensity: .25 });
  for (const s of [-1, 1]) addMesh(skull, new THREE.SphereGeometry(.045, 8, 6), dino.eyeMat, .47, .18, .3 * s);
  const toothM = mat(0xf0ead8);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) addMesh(skull, new THREE.ConeGeometry(.035, .14, 6), toothM, .65 + i * .12, -.24, .16 * s).rotation.x = Math.PI;
  const jaw = new THREE.Group(); jaw.position.set(.15, -.18, 0); skull.add(jaw); dino.jaw = jaw;
  addMesh(jaw, new THREE.BoxGeometry(1.35, .13, .44), M.bone, .7, -.06, 0);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) addMesh(jaw, new THREE.ConeGeometry(.03, .12, 6), toothM, .55 + i * .12, .06, .15 * s);
  // the flesh head: a T-rex head made from the photo (hidden until the button is pressed)
  const flesh = new THREE.Group(); flesh.visible = false; flesh.scale.setScalar(.01); hp.add(flesh); dino.flesh = flesh;
  buildFaceHead(flesh, toothM);
  const ce = center(k);
  info(k, x + 3.2, z - 1.6, ['Aurorasaurus borealis', 'Sen krita, ca 70 miljoner år', 'Hittades 1931 i en grusgrop utanför Kiruna (det är inte sant, men vi tycker om historien). Skelettet består av 64 % äkta ben och 36 % gips.'], 1.6);
  void ce;
}
function updateNeck() { setBetween(dino.neck, dino.neckBase, dino.headPivot.position); }

// ---------- stars and the vault door ----------
function starShape(R, r) { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; const x = Math.cos(a) * rad, y = -Math.sin(a) * rad; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
const starGeo = new THREE.ExtrudeGeometry(starShape(.28, .12), { depth: .07, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 1 }); starGeo.center();
const stars = [];
function addStar(k, x, y, z, dim) {
  const m = new THREE.Mesh(starGeo, mat(0xffcf4a, { metalness: .8, roughness: .3, emissive: 0xffb020, emissiveIntensity: dim ? .35 : .9 }));
  const c = center(k); m.position.set(c.x + x, y, c.z + z); m.userData = { room: k, y }; scene.add(m); stars.push(m);
}
let lockDoor = null, lockCol = null, lockTex = null;
function buildVaultDoor() {
  const c = center('egypt'), zb = c.z - D / 2;
  lockTex = canvasTex(256, 272, () => {}); drawLock();
  lockDoor = new THREE.Group(); lockDoor.position.set(c.x, 0, zb); scene.add(lockDoor);
  addMesh(lockDoor, new THREE.BoxGeometry(DOOR, DOOR_H, .25), [M.steel, M.steel, M.steel, M.steel, mat(0xffffff, { map: lockTex, metalness: .5, roughness: .4 }), M.steel], 0, DOOR_H / 2, 0);
  lockCol = { x: c.x, z: zb, hw: DOOR / 2, hd: .4 }; colliders.push(lockCol);
  interacts.push({ room: 'egypt', x: c.x, z: zb + 1.3, r: 1.8, get label() { return S.unlocked ? null : `Valvdörren (låst, ${S.stars.size}/${STAR_TOTAL})`; },
    use: () => { sfx.locked(); showPlaque('Valvdörren är låst', 'Ståldörr med tidslås', `Ett mekaniskt lås med sex stjärnformade skåror. Du har hittat ${S.stars.size} av ${STAR_TOTAL} guldstjärnor.`); } });
}
function drawLock() {
  const { canvas: cv, g } = lockTex.userData, w = cv.width, h = cv.height;
  g.fillStyle = '#5d636e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b2f36'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(w / 2, h / 2, 70, 0, 7); g.fill();
  for (let i = 0; i < STAR_TOTAL; i++) { const a = -Math.PI / 2 + i / STAR_TOTAL * Math.PI * 2; g.fillStyle = i < S.stars.size ? '#ffcf4a' : '#15171b'; g.font = '34px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', w / 2 + Math.cos(a) * 46, h / 2 + Math.sin(a) * 46); }
  lockTex.needsUpdate = true;
}

function bloodWriting(k, side, along, y, text, w = 4) {
  const t = canvasTex(1024, 300, (g, cw, ch) => {
    const R = rng(text.length * 13); g.clearRect(0, 0, cw, ch); g.fillStyle = '#5e0006'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 150; do { g.font = `italic 900 ${fs}px Georgia, serif`; fs -= 6; } while (g.measureText(text).width > cw - 60);
    g.fillText(text, cw / 2, ch * .4); const tw = g.measureText(text).width;
    for (let i = 0; i < 22; i++) { const x = cw / 2 - tw / 2 + R() * tw, len = 20 + R() * 120, wd = 3 + R() * 6; g.fillRect(x, ch * .45, wd, len); g.beginPath(); g.arc(x + wd / 2, ch * .45 + len, wd * .9, 0, 7); g.fill(); }
  });
  onWall(new THREE.Mesh(new THREE.PlaneGeometry(w, w * 300 / 1024), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .25 })), k, side, along, y, null, .012);
}

// ---------- portraits of the man in the photo, all over the museum ----------
const portraitImg = new Image();
const PEYES = [[75, 93], [117, 92]], PMOUTH = [97, 125]; // positions in the 200x200 photo
const PVARIANTS = ['normal', 'bleeding', 'hollow', 'red', 'scratched', 'smile', 'upside', 'burnt'];
const portraitTex = {};
for (const v of PVARIANTS) portraitTex[v] = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#2a2420'; g.fillRect(0, 0, w, h); });
function drawPortrait(v) {
  const { g } = portraitTex[v].userData, w = 512, s = w / 200, R = rng(v.length * 91);
  g.save(); g.clearRect(0, 0, w, w);
  if (v === 'upside') { g.translate(w, w); g.rotate(Math.PI); }
  g.filter = v === 'red' ? 'sepia(1) saturate(7) hue-rotate(-45deg) brightness(.75) contrast(1.3)' : 'sepia(.45) contrast(1.15) brightness(.95)';
  g.drawImage(portraitImg, 0, 0, 200, 200, 0, 0, w, w); g.filter = 'none';
  const vg = g.createRadialGradient(w / 2, w * .45, w * .25, w / 2, w / 2, w * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,5,0,.85)'); g.fillStyle = vg; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (let i = 0; i < 90; i++) { g.beginPath(); let x = R() * w, y = R() * w; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - .5) * 40; y += (R() - .5) * 40; g.lineTo(x, y); } g.stroke(); }
  const tears = (n, wide) => { for (const [ex, ey] of PEYES) for (let k = 0; k < n; k++) { const x = ex * s + (R() - .5) * 26, len = 120 + R() * 280, wd = (wide ? 6 : 3) + R() * 5; const gr = g.createLinearGradient(0, ey * s, 0, ey * s + len); gr.addColorStop(0, '#7a0008'); gr.addColorStop(1, '#3a0004'); g.fillStyle = gr; g.fillRect(x, ey * s + 6, wd, len); g.beginPath(); g.arc(x + wd / 2, ey * s + 6 + len, wd * .9, 0, 7); g.fill(); } };
  if (v === 'bleeding') { tears(3, true); for (const [ex, ey] of PEYES) { g.fillStyle = 'rgba(120,0,0,.55)'; g.beginPath(); g.ellipse(ex * s, ey * s, 26, 14, 0, 0, 7); g.fill(); } }
  if (v === 'hollow' || v === 'burnt') { for (const [ex, ey] of PEYES) { const gr = g.createRadialGradient(ex * s, ey * s, 4, ex * s, ey * s, 34); gr.addColorStop(0, '#000'); gr.addColorStop(.7, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(ex * s, ey * s, 34, 26, 0, 0, 7); g.fill(); g.fillStyle = '#ff2a1a'; g.beginPath(); g.arc(ex * s, ey * s, 3.5, 0, 7); g.fill(); } tears(1, false); }
  if (v === 'smile') { const [mx, my] = PMOUTH; g.fillStyle = '#120000'; g.beginPath(); g.moveTo(mx * s - 120, my * s - 60); g.quadraticCurveTo(mx * s, my * s + 90, mx * s + 120, my * s - 60); g.quadraticCurveTo(mx * s, my * s + 30, mx * s - 120, my * s - 60); g.fill();
    g.fillStyle = '#e8dcc0'; for (let k = 0; k < 14; k++) { const x = mx * s - 90 + k * 13, y = my * s - 10 + Math.sin(k / 13 * Math.PI) * 30; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 16); g.lineTo(x + 12, y); g.fill(); } tears(1, false); }
  if (v === 'scratched') { for (let k = 0; k < 60; k++) { g.strokeStyle = R() < .5 ? 'rgba(240,230,210,.7)' : 'rgba(0,0,0,.6)'; g.lineWidth = 1 + R() * 3; g.beginPath(); const x = 120 + R() * 270, y = 120 + R() * 260; g.moveTo(x, y); g.lineTo(x + (R() - .5) * 160, y + (R() - .5) * 160); g.stroke(); } }
  if (v === 'burnt') { const gr = g.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w * .72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.75, 'rgba(255,90,0,.35)'); gr.addColorStop(.85, 'rgba(20,5,0,.95)'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }
  g.restore(); portraitTex[v].needsUpdate = true;
}
portraitImg.onload = () => PVARIANTS.forEach(drawPortrait);
portraitImg.src = window.PORTRAIT_PHOTO || 'assets/portrait.jpg';
const PORTRAIT_TEXTS = [
  'Han har hängt här sedan museet öppnade. Ingen minns vem som målade honom.',
  'Vakterna säger att ögonen följer en genom rummet. Vakterna har slutat jobba här.',
  'Tavlan har tagits ner fyra gånger. Varje morgon hänger den på plats igen.',
  'Färgen har aldrig torkat. Den är fortfarande blöt när man rör vid den.',
  'Under duken har konservatorerna hittat en annan duk. Med samma ansikte.',
  'Det sägs att han var nattvakt här en gång.',
];
const portraits = [];
function portrait(k, side, along, y, v) {
  const gp = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.62, .1), M.gold); gp.add(outer);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.42, .11), mat(0x1a120a, { roughness: .6 })); gp.add(inner);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat(0xffffff, { map: portraitTex[v], roughness: .5 })); pic.position.z = .062; gp.add(pic);
  const R = Math.random;
  const f = onWall(gp, k, side, along, y, ['Porträtt av en okänd man', 'Olja på duk, år okänt', PORTRAIT_TEXTS[Math.floor(R() * PORTRAIT_TEXTS.length)]], .03);
  portraits.push({ pic, room: k, pos: f.pos, v });
  if (v === 'bleeding' || v === 'hollow') for (let i = 0; i < 3; i++) addDrip(k, side, along + (R() - .5) * .9, y - .82, .9 + R() * 1.1, .05 + R() * .07, .09); // blood running out of the frame
}
function hangPortraits() {
  const spots = {
    entre: [['n', 6.5], ['e', -5], ['e', 5], ['w', -5], ['w', 5], ['s', 5]],
    konst: [['s', -5], ['s', 0], ['w', -5], ['w', 5], ['e', -5], ['e', 5]],
    modern: [['n', 5], ['n', -6], ['s', -3], ['e', -5], ['w', -5], ['w', 5]],
    natur: [['n', -6], ['s', 0], ['s', -6], ['s', 6], ['w', -4], ['w', 4], ['e', -5], ['e', 5]],
    mineral: [['n', -6], ['n', 6], ['e', -4], ['e', 4], ['w', 0], ['s', -5], ['s', 5]],
    egypt: [['n', -5], ['n', 5], ['s', -5], ['s', 5], ['w', -5], ['e', 5], ['e', -5]],
    skatt: [['n', 0], ['n', -6], ['n', 6], ['e', 0], ['w', 0]],
  };
  let i = 0;
  for (const k in spots) for (const [side, along] of spots[k]) portrait(k, side, along, 2.25, i++ % 3 === 0 ? 'normal' : PVARIANTS[1 + Math.floor(Math.random() * (PVARIANTS.length - 1))]);
}
// While you are not looking, the portraits in your room change.
let portraitT = 4;
function updatePortraits(dt) {
  portraitT -= dt; if (portraitT > 0 || !S.started) return; portraitT = 3 + Math.random() * 4;
  const here = portraits.filter(p => p.room === S.room && !litByFlash(p.pos)); if (!here.length) return;
  const p = here[Math.floor(Math.random() * here.length)]; p.v = Math.random() < .25 ? 'normal' : PVARIANTS[1 + Math.floor(Math.random() * (PVARIANTS.length - 1))]; p.pic.material.map = portraitTex[p.v];
}
// ---------- blood running down the walls ----------
const dripTexs = [0, 1, 2].map(seed => canvasTex(64, 512, (g, w, h) => {
  const R = rng(seed * 7 + 1); g.clearRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0003'); gr.addColorStop(.85, '#6a0008'); gr.addColorStop(1, '#8a000c'); g.fillStyle = gr;
  g.beginPath(); g.moveTo(w * .25, 0); let x = w * .3;
  for (let y = 0; y <= h - 24; y += 16) { x = Math.max(w * .18, Math.min(w * .4, x + (R() - .5) * 6)); g.lineTo(x, y); }
  g.arc(w / 2, h - 24, w * .26, Math.PI, 0, true); let x2 = w * .7;
  for (let y = h - 24; y >= 0; y -= 16) { x2 = Math.max(w * .6, Math.min(w * .82, x2 + (R() - .5) * 6)); g.lineTo(x2, y); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,160,160,.25)'; g.fillRect(w * .42, 0, 3, h - 30); // a wet highlight
}));
const drips = [];
function addDrip(k, side, along, top, len, wd, off = .016) {
  const geo = new THREE.PlaneGeometry(wd, len); geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: dripTexs[Math.floor(Math.random() * 3)], transparent: true, roughness: .12, metalness: .15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  onWall(m, k, side, along, top, null, off); m.scale.y = Math.random();
  drips.push({ m, v: .04 + Math.random() * .12, wait: 0 });
}
function handprint(k, side, along, y) {
  const t = canvasTex(256, 256, (g, w, h) => { const R = rng(along * 13 + y); g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(90,0,6,.9)'; g.save(); g.translate(128, 150); g.rotate((R() - .5) * .8);
    g.beginPath(); g.ellipse(0, 0, 42, 52, 0, 0, 7); g.fill();
    [[-46, -30, -.6, 36], [-24, -78, -.15, 48], [0, -88, 0, 52], [22, -80, .15, 48], [42, -58, .35, 38]].forEach(([x, yy, r, l]) => { g.save(); g.translate(x, yy); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 10, l / 2, 0, 0, 7); g.fill(); g.restore(); });
    g.fillRect(-36, 40, 72, 60 + R() * 60); g.restore(); });
  onWall(new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })), k, side, along, y, null, .015);
}
function bleedWalls() {
  for (const k in ROOMS) for (const side of ['n', 's', 'w', 'e']) {
    const len = side === 'n' || side === 's' ? W : D, linked = isLinked(k, neighbor(k, side) || '');
    for (let i = 0; i < 4; i++) {
      let along; do { along = (Math.random() - .5) * (len - 1.2); } while (linked && Math.abs(along) < 2.3);
      addDrip(k, side, along, H - .25, 1.5 + Math.random() * 3.2, .08 + Math.random() * .16);
    }
    if (Math.random() < .5) { let along; do { along = (Math.random() - .5) * (len - 2); } while (linked && Math.abs(along) < 2.3); handprint(k, side, along, .9 + Math.random() * 1.2); }
  }
}
function updateDrips(dt) {
  for (const d of drips) {
    if (d.m.scale.y < 1) d.m.scale.y = Math.min(1, d.m.scale.y + d.v * dt);
    else { d.wait += dt; if (d.wait > 8 + Math.random() * 30) { d.wait = 0; d.m.scale.y = .001; d.v = .04 + Math.random() * .12; } }
  }
}

// ---------- museum contents ----------
(function furnish() {
  // Entréhallen
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, .72), new THREE.MeshStandardMaterial({ roughness: .5, map: textTex('MUSEUM AURORA', 1024, 132, '#1b1410', '#e9c45e', 'bold 84px Georgia') }));
  onWall(banner, 'entre', 'n', 0, 4.5, null, .01);
  const mapTex = canvasTex(320, 240, (g, w, h) => {
    g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2620'; g.font = 'bold 18px Georgia'; g.textAlign = 'center'; g.fillText('Planritning', w / 2, 24);
    for (const k in ROOMS) { const [c, r] = ROOMS[k].grid; g.fillStyle = k === 'entre' ? '#f2c14e' : '#d8ccb0'; g.fillRect(14 + c * 74, 38 + r * 64, 68, 56); g.fillStyle = '#2b2620'; g.font = '11px system-ui'; g.fillText(ROOMS[k].name.replace('salen', '-salen').split(' ')[0], 48 + c * 74, 70 + r * 64); }
  });
  const board = new THREE.Group(); addMesh(board, new THREE.PlaneGeometry(2.4, 1.8), mat(0xffffff, { map: mapTex }), 0, 0, .04); addMesh(board, new THREE.BoxGeometry(2.6, 2, .06), M.darkWood, 0, 0, 0);
  onWall(board, 'entre', 'n', -6, 2, ['Planritning', 'Informationstavla', 'Entrén ligger mitt på bottenvåningen. Till vänster: Naturhistoria. Till höger: Konstgalleriet. Rakt fram: Egyptiska salen. Längst in sägs det finnas ett valv som ingen nattvakt sett öppet.']);
  plant('entre', -8, 5.5, ['Monstera deliciosa', 'Krukväxt, ej till salu', 'Museets mest fotograferade föremål, enligt besöksstatistiken. Vattnas varje tisdag av vaktmästare Berit.']);
  desk('entre', 5, -4, ['Biljettdisken', 'Ek och mässing, 1912', 'Här köper besökarna biljett på dagtid. Ringklockan har ringts uppskattningsvis 1,4 miljoner gånger. På disken ligger en lapp: ”Sex stjärnor. Sex salar. Kronan väntar.”']);
  const doors = new THREE.Group(); for (const s of [-.8, .8]) { addMesh(doors, new THREE.BoxGeometry(1.55, 3.4, .1), M.darkWood, s, 1.7, 0); addMesh(doors, new THREE.SphereGeometry(.07, 8, 6), M.gold, s * .2, 1.5, .08); }
  onWall(doors, 'entre', 's', 0, 0, ['Ytterdörrarna', 'Ek, 1912', 'Låsta för natten. Nyckeln sitter hos vaktchefen, som gick hem klockan fem. Du kommer inte ut härifrån förrän i morgon bitti.'], .05);
  addStar('entre', 5.6, .5, -6.3);
  // Konstgalleriet
  painting('konst', 'n', -6, 2.4, 2.2, 2.8, 'portrait', 11, ['Damen med bärnstensbrosch', 'Okänd mästare, ca 1790. Olja på duk', 'Ingen vet vem hon är, men alla som stannat framför tavlan säger att hon ser ut som någon de känner.']);
  painting('konst', 'n', 0, 2.4, 3, 2.4, 'landscape', 12, ['Kvällsljus över Vättern', 'Ingrid Solmark, 1884. Olja på duk', 'Solmark målade samma vy 41 gånger. Detta är den enda versionen där hon tog med det lilla trädet.']);
  painting('konst', 'n', 6, 2.4, 2.2, 2.8, 'sea', 13, ['Storm vid Skagen', 'Henrik Alvbo, 1902. Olja på duk', 'Alvbo påstod att han målade tavlan ombord på en fiskebåt. Konservatorerna har hittat sand i färgen, så han talade kanske sanning.']);
  bench('konst', 0, 1.5, ['Bänk', 'Funktionell möbel', 'Placerad exakt 3,2 meter från tavlorna. Ett perfekt avstånd för att se, och för att vila fötterna.']);
  addStar('konst', 0, .22, 1.5);
  // Moderna salen
  sculpture('modern', -6, -3, ['Tyngdpunkt', 'Alva Brink, 2019. Lackerad aluminium', 'En kub som balanserar på ett hörn. Den är fastskruvad, men det vet ingen besökare.']);
  painting('modern', 'n', -1.5, 2.3, 1.6, 2.1, 'blank', 21, ['Utan titel #7', 'Johan Vit, 1999. Vit duk', 'Konstnären hävdar att tavlan föreställer tystnad. Kritikerna var oense, men ingen kunde säga emot.'], false);
  mobile('modern', 2, 1, ['Balans i rörelse', 'Kinetisk installation, 1968', 'Mobilen rör sig av luftströmmarna i salen. Vakterna svär på att den rör sig mest när ingen tittar.']);
  tv('modern', 7.5, -5, ['Kanal 0', 'Videoinstallation, 1987', 'En loop på 14 timmar med brus. Vissa påstår att det finns ett ansikte i minut 512.']);
  painting('modern', 's', 5, 2.3, 1.4, 1, 'abstract', 24, ['Komposition i rött', 'Liten studie, 1961', 'Konstnären skissade den på en servett och lät sedan måla den i större format. Detta är servetten, inramad.']);
  addStar('modern', 8.8, .4, -6.8);
  // Naturhistoria
  buildDino('natur', -3.5, 0);
  dangerButton('natur', 1.4, 2.6);
  butterflyCase('natur', 6, -6.6, ['Fjärilssamlingen', 'Insamlad 1890–1920', 'Sex arter från sex kontinenter. Den blå fjärilen är så sällsynt att arten bara har setts tre gånger sedan dess.']);
  addStar('natur', 8.9, .4, 6.8);
  // Mineralrummet
  crystal('mineral', -6, -4, 0x7ad7ff, ['Isblå kvarts', 'Funnen i Jämtland', 'En bergkristall så klar att man kan läsa genom den. Den är 300 miljoner år gammal och ändå helt utan repor.']);
  meteor('mineral', -1, 1, ['Meteoriten från Ystad', 'Föll 1878', 'Väger 41 kilo och består mest av järn och nickel. Bonden som hittade den använde den som dörrstopp i tolv år.']);
  crystal('mineral', 5, -4, 0xc38bff, ['Ametist', 'Funnen i Brasilien', 'Forntida greker trodde att ametist skyddade mot berusning. Museet har valt att inte testa påståendet.']);
  crystal('mineral', 6, 4, 0x7dff9e, ['Fluorit', 'Lyser under UV-ljus', 'Kristallen lyser grönt i mörker. Därför har vi släckt i salen, inte för att spara el.']);
  addStar('mineral', -8.8, .4, 6.8, true);
  // Egyptiska salen
  sarcophagus('egypt', -6, -1, ['Sarkofag åt Neferet', 'Nya riket, ca 1300 f.Kr.', 'Neferet var skrivare vid templet. Inskriptionen ber besökaren att säga hennes namn högt, så att hon aldrig glöms bort. Säg det gärna nu.']);
  const gl1 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4 * .8), mat(0xffffff, { map: glyphTex(4, 5, 9) }));
  onWall(gl1, 'egypt', 'w', 2, 2.2, ['Hieroglyfer', 'Kopia av tempelvägg', 'Översatt lyder texten ungefär: ”Den som söker sex stjärnor ska finna en krona.” Konstigt sammanträffande.']);
  const gl2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), mat(0xffffff, { map: glyphTex(5, 3, 17) }));
  onWall(gl2, 'egypt', 'e', 0, 2.2, ['Offerlista', 'Kalksten', 'En lista över gåvor till gudarna: bröd, öl, gäss och tre korgar fikon. Gudarna verkar ha varit hungriga.']);
  urn('egypt', 6, -5, 1, 0xa8552f, ['Kanopisk kruka', 'Lera, ca 1100 f.Kr.', 'Användes vid balsamering. Den här är tom, sägs det.']);
  urn('egypt', 7.6, -4, .8, 0x3f6f7d, ['Kruka med lock', 'Fajans', 'Den blåa glasyren har behållit färgen i 3000 år, bättre än de flesta köksmöbler.']);
  addStar('egypt', 8.9, .4, -6.8);
  buildVaultDoor();
  bloodWriting('entre', 's', -6, 2.5, 'DE SER DIG');
  bloodWriting('modern', 'e', 2, 2.6, 'HON STÅR BAKOM DIG', 5);
  bloodWriting('mineral', 'n', 0, 2.6, 'GÅ HEM');
  bloodWriting('konst', 's', 5, 2.4, 'RÄKNA NUNNORNA');
  hangPortraits();
  bleedWalls();
  // Skattkammaren
  chest('skatt', -5, -4, ['Kistan', 'Sjörövarbyte, 1600-tal', 'Fylld med mynt från ett dussin länder. Den beslagtogs från en kapten som inte kunde förklara var han fått dem ifrån.']);
  chest('skatt', 5, -4, ['Kistan', 'Okänd ägare', 'Lappen på locket säger: ”Rör ej. Gäller även nattvakter.”']);
  crown('skatt', 0, -3);
})();

// ---------- the guard (you) ----------
const guard = {};
(function buildGuard() {
  const p = new THREE.Group(); scene.add(p); guard.p = p;
  const body = new THREE.Group(); p.add(body); guard.body = body;
  const uni = mat(0x1d2a48, { roughness: .7 }), pants = mat(0x14171f, { roughness: .75 }), skin = mat(0xe0b08a, { roughness: .55 }), shoe = mat(0x0b0b0d, { roughness: .3 }), leather = mat(0x24170e, { roughness: .45 });
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(.12 * s, .95, 0); body.add(leg);
    addMesh(leg, cap(.1, .6), pants, 0, -.42, 0); addMesh(leg, cap(.085, .16), shoe, 0, -.88, .07).rotation.x = Math.PI / 2;
    guard[s < 0 ? 'legL' : 'legR'] = leg;
    const arm = new THREE.Group(); arm.position.set(.33 * s, 1.56, 0); body.add(arm);
    addMesh(arm, cap(.075, .42), uni, 0, -.29, 0); addMesh(arm, new THREE.SphereGeometry(.072, 14, 10), skin, 0, -.62, 0);
    guard[s < 0 ? 'armL' : 'armR'] = arm;
  }
  addMesh(body, cap(.24, .4), uni, 0, 1.3, 0).scale.set(1, 1, .68);
  addMesh(body, new THREE.CylinderGeometry(.25, .25, .08, 24), leather, 0, .99, 0).scale.set(1, 1, .72);
  addMesh(body, new THREE.BoxGeometry(.08, .06, .02), M.gold, 0, .99, .18);
  addMesh(body, new THREE.CylinderGeometry(.045, .045, .01, 12), M.gold, -.12, 1.48, .165).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) addMesh(body, new THREE.BoxGeometry(.14, .03, .2), uni, .2 * s, 1.64, 0);
  const torch = addMesh(guard.armR, new THREE.CylinderGeometry(.04, .055, .3, 14), mat(0x1a1a1a, { metalness: .6, roughness: .3 }), 0, -.68, .12); torch.rotation.x = Math.PI / 2;
  guard.lens = addMesh(guard.armR, new THREE.CircleGeometry(.05, 16), new THREE.MeshBasicMaterial({ color: 0x222222 }), 0, -.68, .275);
  guard.stump = addMesh(body, new THREE.CylinderGeometry(.085, .1, .07, 12), mat(0x6a0000, { roughness: .3 }), 0, 1.69, 0); guard.stump.visible = false;
  const head = new THREE.Group(); head.position.y = 1.66; body.add(head); guard.head = head;
  addMesh(head, new THREE.CylinderGeometry(.075, .085, .12, 12), skin, 0, .06, 0);
  guard.headStump = addMesh(head, new THREE.CylinderGeometry(.085, .085, .02, 12), mat(0x6a0000, { roughness: .3 }), 0, -.005, 0); guard.headStump.visible = false;
  addMesh(head, new THREE.SphereGeometry(.17, 24, 18), skin, 0, .27, 0).scale.set(1, 1.1, 1.02);
  for (const s of [-1, 1]) { addMesh(head, new THREE.SphereGeometry(.035, 10, 8), skin, .17 * s, .27, 0).scale.set(.5, 1, .8); addMesh(head, new THREE.SphereGeometry(.022, 8, 6), M.black, .06 * s, .3, .155); addMesh(head, new THREE.BoxGeometry(.06, .012, .02), mat(0x3a2414), .06 * s, .345, .158); }
  addMesh(head, new THREE.SphereGeometry(.03, 8, 6), skin, 0, .25, .17);
  addMesh(head, new THREE.CylinderGeometry(.18, .175, .12, 24), uni, 0, .43, 0);
  addMesh(head, new THREE.CylinderGeometry(.181, .181, .03, 24), M.gold, 0, .39, 0);
  addMesh(head, new THREE.CylinderGeometry(.16, .16, .02, 24, 1, false, -Math.PI / 2, Math.PI), M.black, 0, .38, .06);
  guard.neck = new THREE.Object3D(); guard.neck.position.y = 1.7; body.add(guard.neck);
  // flashlight: off until you press F
  const spot = new THREE.SpotLight(0xfff0d8, 0, 30, .55, .45, 1.1);
  spot.position.set(.33, 1.1, .3); spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -.0015; spot.shadow.camera.near = .2;
  spot.target.position.set(.2, .75, 8); body.add(spot, spot.target); guard.spot = spot;
  guard.fill = new THREE.PointLight(0xffe8c8, 0, 6, 1.5); guard.fill.position.set(0, 1.7, 1.3); body.add(guard.fill);
  // a soft visible cone of light in the dusty air
  const beamTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, '#777'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const cone = new THREE.ConeGeometry(2.8, 9, 40, 1, true); cone.translate(0, -4.5, 0); cone.rotateX(-Math.PI / 2);
  guard.beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xffe6b8, alphaMap: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  guard.beam.position.copy(spot.position); guard.beam.visible = false; body.add(guard.beam);
  const c = center('entre'); p.position.set(c.x, 0, c.z + 5);
})();
// dust floating in the flashlight beam
const dust = (() => {
  const n = 500, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - .5) * 8;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff0d0, size: .016, map: canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }), transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.visible = false; scene.add(pts); return pts;
})();
function updateDust(dt, t) {
  if (!dust.visible) return;
  const a = dust.geometry.attributes.position, gp = guard.p.position;
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i) + Math.sin(t * .3 + i) * dt * .05, y = a.getY(i) + Math.cos(t * .2 + i * 1.7) * dt * .04, z = a.getZ(i);
    if (x - gp.x > 4) x -= 8; if (x - gp.x < -4) x += 8; if (z - gp.z > 4) z -= 8; if (z - gp.z < -4) z += 8; if (y < .1) y += 4; if (y > 4.2) y -= 4;
    a.setXYZ(i, x, y, z);
  }
  a.needsUpdate = true;
}
function toggleFlash(on = !S.flash) {
  if (S.dead) return; S.flash = on; sfx.flashClick(); guard.beam.visible = on; dust.visible = on;
  guard.lens.material.color.setHex(on ? 0xfff6d8 : 0x222222); $('flashBtn').classList.toggle('on', on);
}

// alarm light in Naturhistoria, and an exhibit spotlight that switches on when Aurora wakes up
const alarmLight = new THREE.PointLight(0xff1010, 0, 24, 1.4); { const c = center('natur'); alarmLight.position.set(c.x, H - .4, c.z); scene.add(alarmLight); }
const exhibit = new THREE.SpotLight(0xfff0dc, 0, 16, .5, .5, 1); scene.add(exhibit, exhibit.target);
const scareLight = new THREE.PointLight(0xd8e4ff, 0, 3, 2); scene.add(scareLight);

// ---------- blood ----------
const BLOOD = 1400;
const blood = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), mat(0x7a0006, { roughness: .2, metalness: .05 }), BLOOD);
blood.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blood.frustumCulled = false; scene.add(blood);
const bp = []; for (let i = 0; i < BLOOD; i++) bp.push({ alive: false, p: V3(), v: V3(), s: 0, stuck: false });
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < BLOOD; i++) blood.setMatrixAt(i, ZERO);
let bIdx = 0;
function emitBlood(pos, dir, n, speed, spread) {
  for (let k = 0; k < n; k++) {
    const b = bp[bIdx]; bIdx = (bIdx + 1) % BLOOD;
    b.alive = true; b.stuck = false; b.p.copy(pos);
    b.v.copy(dir).multiplyScalar(speed * (.55 + Math.random() * .7)).add(V3((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread));
    b.s = .02 + Math.random() * .045;
  }
}
const DECALS = 500;
const decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), mat(0x4a0003, { roughness: .12, metalness: .1, polygonOffset: true, polygonOffsetFactor: -2 }), DECALS);
decals.count = 0; decals.frustumCulled = false; scene.add(decals);
const flatQ = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -Math.PI / 2);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = V3();
function addDecal(x, z, r) { if (decals.count >= DECALS) return; tmpM.compose(V3(x, .011 + decals.count * .00002, z), flatQ, V3(r, r, r)); decals.setMatrixAt(decals.count++, tmpM); decals.instanceMatrix.needsUpdate = true; }
const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat(0x3d0002, { roughness: .08, metalness: .2, polygonOffset: true, polygonOffsetFactor: -4 }));
pool.rotation.x = -Math.PI / 2; pool.scale.setScalar(.01); pool.visible = false; scene.add(pool);
function updateBlood(dt) {
  let any = false;
  for (let i = 0; i < BLOOD; i++) {
    const b = bp[i]; if (!b.alive) continue; any = true;
    if (!b.stuck) {
      b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt);
      if (b.p.y <= .015) { b.p.y = .015; b.stuck = true; if (Math.random() < .3) addDecal(b.p.x, b.p.z, b.s * 2.5 + Math.random() * .12); }
      const sp = b.v.length(); tmpS.set(b.s, b.s * (1 + Math.min(2.5, sp * .25)), b.s); tmpQ.setFromUnitVectors(UP, b.v.clone().normalize());
    } else { tmpS.set(b.s * 1.7, b.s * .2, b.s * 1.7); tmpQ.identity(); }
    tmpM.compose(b.p, tmpQ, tmpS); blood.setMatrixAt(i, tmpM);
  }
  if (any) blood.instanceMatrix.needsUpdate = true;
}

// ---------- audio ----------
let ac = null, master = null, rev = null, nbuf = null, alarmNodes = null, screamNodes = null;
function A() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = S.sound ? 1 : 0; const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination);
    // a big, dark hall reverb
    const ir = ac.createBuffer(2, ac.sampleRate * 3.4, ac.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    rev = ac.createConvolver(); rev.buffer = ir; const rg = ac.createGain(); rg.gain.value = .55; rev.connect(rg).connect(master);
  } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume(); return ac;
}
function noiseBuffer() { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
function envGain(t, a, peak, d) { const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); return g; }
function tone(type, f0, f1, t, a, peak, d, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d); const g = envGain(t, a, peak, d); o.connect(g).connect(dest || master); o.start(t); o.stop(t + a + d + .05); return o; }
function hiss(t, a, peak, d, type, f0, f1, Q, dest) { const s = ac.createBufferSource(); s.buffer = noiseBuffer(); s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d); f.Q.value = Q || 1; const g = envGain(t, a, peak, d); s.connect(f).connect(g).connect(dest || master); s.start(t, Math.random() * 1.5); s.stop(t + a + d + .05); return s; }
function wet(amount) { const g = ac.createGain(); g.gain.value = 1; const s = ac.createGain(); s.gain.value = amount; g.connect(master); g.connect(s).connect(rev); return g; }
function shaper(k) { const ws = ac.createWaveShaper(), n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } ws.curve = c; return ws; }
// ---------- background music: a slowly evolving horror score ----------
const music = {
  on: false,
  start() {
    if (!A() || this.on) return; this.on = true; const t = ac.currentTime;
    const mg = ac.createGain(); mg.gain.setValueAtTime(.0001, t); mg.gain.exponentialRampToValueAtTime(.9, t + 6); mg.connect(master);
    const send = ac.createGain(); send.gain.value = .9; mg.connect(send).connect(rev); this.g = mg;
    // a low, dissonant drone that breathes
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 5;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .045; lg.gain.value = 110; lfo.connect(lg).connect(lp.frequency); lfo.start();
    const dg = ac.createGain(); dg.gain.value = .06; lp.connect(dg).connect(mg);
    for (const f of [55, 58.27, 82.41, 87.31]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 14; o.connect(lp); o.start(); }
    this.next = { pad: t + 3, box: t + 9, screech: t + 16, boom: t + 7 }; this.boxPitch = 1;
    this.timer = setInterval(() => this.tick(), 200);
  },
  stop(fade = 2) { if (!this.on) return; this.on = false; clearInterval(this.timer); const t = ac.currentTime; this.g.gain.cancelScheduledValues(t); this.g.gain.setValueAtTime(Math.max(.0001, this.g.gain.value), t); this.g.gain.exponentialRampToValueAtTime(.0001, t + fade); },
  tick() {
    const t = ac.currentTime, n = this.next;
    if (t > n.pad) { n.pad = t + 8 + Math.random() * 7; this.pad(t); }
    if (t > n.box) { n.box = t + 24 + Math.random() * 14; this.box(t); }
    if (t > n.screech) { n.screech = t + 13 + Math.random() * 16; this.screech(t); }
    if (t > n.boom) { n.boom = t + 15 + Math.random() * 18; this.boom(t); }
  },
  pad(t) { // slow clusters of detuned strings
    const set = [220, 233.08, 261.63, 277.18, 311.13, 329.63, 369.99, 415.3], lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(this.g);
    for (let i = 0; i < 3; i++) { const f = set[Math.floor(Math.random() * set.length)] / (Math.random() < .5 ? 2 : 1), o = ac.createOscillator(), v = ac.createOscillator(), vg = ac.createGain(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; v.frequency.value = 4 + Math.random() * 2; vg.gain.value = f * .006; v.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.022, t + 3.5); g.gain.setValueAtTime(.022, t + 5); g.gain.exponentialRampToValueAtTime(.0001, t + 10);
      o.connect(g).connect(lp); o.start(t); v.start(t); o.stop(t + 10.2); v.stop(t + 10.2); }
  },
  box(t) { // a music box lullaby that is running down, out of tune
    const mel = [659.3, 880, 1046.5, 987.8, 880, 659.3, 698.5, 659.3, 622.3, 659.3, 0, 880, 830.6, 880, 1046.5, 987.8, 739.99, 659.3];
    const dur = [.5, .5, .5, .5, 1, .5, .5, .5, .5, 1.5, .5, .5, .5, .5, .5, .5, .5, 2];
    let at = t; this.boxPitch *= .985;
    mel.forEach((f, i) => { const d = dur[i] * (1 + i * .035) * .9; if (f) { const ff = f * this.boxPitch * (1 - i * .002);
      for (const [mult, vol, type] of [[1, .05, 'sine'], [2.76, .015, 'sine'], [.5, .02, 'triangle']]) tone(type, ff * mult, ff * mult, at, .004, vol, 1.3, this.g); }
      at += d; });
  },
  screech(t) { const o = ac.createOscillator(), v = ac.createOscillator(), vg = ac.createGain(), bp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(1400 + Math.random() * 400, t); o.frequency.exponentialRampToValueAtTime(2300 + Math.random() * 500, t + 2.2);
    v.frequency.value = 7; vg.gain.value = 28; v.connect(vg).connect(o.frequency); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 3;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.02, t + 1); g.gain.exponentialRampToValueAtTime(.0001, t + 2.4);
    o.connect(bp).connect(g).connect(this.g); o.start(t); v.start(t); o.stop(t + 2.5); v.stop(t + 2.5); },
  boom(t) { tone('sine', 44, 26, t, .01, .4, 2.8, this.g); hiss(t, .01, .25, 1.2, 'lowpass', 140, 60, 1, this.g); },
};
const sfx = {
  drone() { if (!A() || sfx._drone) return; sfx._drone = true; const t = ac.currentTime, lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; const g = ac.createGain(); g.gain.value = .05; lp.connect(g).connect(master);
    for (const f of [41, 41.7, 61.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); }
    const hi = ac.createOscillator(), hg = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(); hi.frequency.value = 932; hg.gain.value = 0; lfo.frequency.value = .07; lg.gain.value = .006; lfo.connect(lg).connect(hg.gain); hi.connect(hg).connect(master); hi.start(t); lfo.start(t); },
  step() { if (!A()) return; const t = ac.currentTime; hiss(t, .004, .1, .07, 'lowpass', 420, 0, 1); hiss(t, .002, .025, .03, 'highpass', 3500, 0, 1); },
  star() { if (!A()) return; const t = ac.currentTime; [880, 1175, 1568, 2093].forEach((f, i) => tone('triangle', f, f, t + i * .08, .01, .12, .3)); },
  creak() { if (!A()) return; const t = ac.currentTime; hiss(t, .4, .05, 1, 'bandpass', 240 + Math.random() * 100, 600 + Math.random() * 300, 16); if (Math.random() < .4) tone('sine', 60, 38, t + .6, .01, .12, .6); },
  unlock() { if (!A()) return; const t = ac.currentTime; hiss(t, .1, .35, 2, 'lowpass', 160, 90, 1); [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + .4 + i * .12, .01, .1, .4)); },
  locked() { if (!A()) return; const t = ac.currentTime; tone('square', 140, 120, t, .005, .05, .14); tone('square', 120, 100, t + .12, .005, .05, .14); },
  click() { if (!A()) return; const t = ac.currentTime; tone('square', 1200, 600, t, .002, .08, .04); tone('sine', 120, 60, t, .005, .2, .1); },
  alarmStart() { if (!A()) return; const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 760; lfo.frequency.value = 1.5; lg.gain.value = 260; lfo.connect(lg).connect(o.frequency); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + .05);
    o.connect(g).connect(master); o.start(t); lfo.start(t); alarmNodes = { o, lfo, g }; },
  alarmStop() { if (!alarmNodes) return; const t = ac.currentTime; alarmNodes.g.gain.setTargetAtTime(.0001, t, .2); alarmNodes.o.stop(t + 1.2); alarmNodes.lfo.stop(t + 1.2); alarmNodes = null; },
  roar() { if (!A()) return; const t = ac.currentTime, d = shaper(40), lp = ac.createBiquadFilter(), g = envGain(t, .08, .6, 1.7); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.8); d.connect(lp).connect(g).connect(master);
    tone('sawtooth', 130, 50, t, .05, .5, 1.6, d); tone('sawtooth', 196, 74, t, .05, .4, 1.6, d); tone('square', 64, 34, t, .05, .4, 1.6, d); hiss(t, .05, .7, 1.6, 'lowpass', 900, 200, 1, d); },
  scream() { if (!A()) return; const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), b1 = ac.createBiquadFilter(), b2 = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(980, t + .35); lfo.frequency.value = 9; lg.gain.value = 50; lfo.connect(lg).connect(o.frequency);
    b1.type = 'bandpass'; b1.frequency.value = 1100; b1.Q.value = 4; b2.type = 'bandpass'; b2.frequency.value = 2600; b2.Q.value = 5;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55, t + .06);
    o.connect(b1).connect(g); o.connect(b2).connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
    screamNodes = { g, o }; },
  screamCut() { if (!screamNodes) return; screamNodes.g.gain.cancelScheduledValues(ac.currentTime); screamNodes.g.gain.setValueAtTime(.0001, ac.currentTime + .01); screamNodes = null; },
  crunch(p = 1) { if (!A()) return; const t = ac.currentTime;
    for (let i = 0; i < 10; i++) hiss(t + i * .028 + Math.random() * .02, .001, (.45 + Math.random() * .4) * p, .025 + Math.random() * .03, 'highpass', 1500 + Math.random() * 3000, 0, 1);
    tone('sine', 95, 32, t, .004, .9 * p, .4); hiss(t, .01, .7 * p, .4, 'lowpass', 1000, 220, 1); hiss(t + .05, .02, .4 * p, .45, 'bandpass', 500, 1900, 3); },
  spurt(p) { if (!A()) return; const t = ac.currentTime; hiss(t, .01, .3 * p, .25, 'lowpass', 650, 260, 2); hiss(t + .02, .02, .12 * p, .2, 'bandpass', 300, 900, 7); },
  thud(p) { if (!A()) return; const t = ac.currentTime; tone('sine', 75, 34, t, .005, .8 * p, .45); hiss(t, .005, .5 * p, .2, 'lowpass', 260, 0, 1); },
  chew() { if (!A()) return; for (let i = 0; i < 3; i++) setTimeout(() => sfx.crunch(.45), i * 280); },
  nunScream() { if (!A()) return; const t = ac.currentTime, out = wet(.7), t0 = t + .16;
    hiss(t, .16, .45, .04, 'bandpass', 600, 6000, 2, out); // the inhale before
    const ws = shaper(140), ring = ac.createGain(), rmod = ac.createOscillator(), env = ac.createGain();
    ring.gain.value = 0; rmod.frequency.value = 63; rmod.connect(ring.gain); rmod.start(t0); rmod.stop(t0 + 1.8);
    env.gain.setValueAtTime(.0001, t0); env.gain.exponentialRampToValueAtTime(1.3, t0 + .02); env.gain.setValueAtTime(1.3, t0 + .5); env.gain.exponentialRampToValueAtTime(.0001, t0 + 1.7);
    const mix = ac.createGain(); mix.gain.value = .5; mix.connect(ring); mix.connect(ws); ring.connect(ws); ws.connect(env).connect(out);
    for (const [fc, q] of [[820, 5], [1180, 6], [2900, 8], [3600, 9]]) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q; bp.connect(mix);
      for (const f of [523, 587, 659, 740, 932]) { const o = ac.createOscillator(), j = ac.createOscillator(), jg = ac.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * .7, t0); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + .28); o.frequency.exponentialRampToValueAtTime(f * .78, t0 + 1.7);
        j.frequency.value = 11 + Math.random() * 14; jg.gain.value = f * .1; j.connect(jg).connect(o.frequency); o.connect(bp); o.start(t0); j.start(t0); o.stop(t0 + 1.8); j.stop(t0 + 1.8); }
    }
    tone('sine', 4200, 2400, t0, .01, .08, 1.2, out); tone('sine', 70, 28, t0, .005, 1.1, .9, out); hiss(t0, .005, .5, .25, 'lowpass', 400, 0, 1, out);
    // LOUD: a second path that skips the compressor and is driven into hard clipping
    const loud = ac.createGain(), clip = shaper(400), lg = ac.createGain(); loud.gain.value = 3; lg.gain.setValueAtTime(.0001, t0); lg.gain.exponentialRampToValueAtTime(.95, t0 + .01); lg.gain.setValueAtTime(.95, t0 + .9); lg.gain.exponentialRampToValueAtTime(.0001, t0 + 2);
    if (S.sound) env.connect(loud).connect(clip).connect(lg).connect(ac.destination);
    hiss(t0, .002, 1, .12, 'highpass', 1000, 0, 1, loud); // the crack at the start
    for (const f of [92, 97]) tone('sawtooth', f, f * .6, t0, .01, .7, 1.6, loud); // a demonic growl underneath
    for (const f of [2600, 3150]) { const o = tone('square', f, f * 1.3, t0 + .05, .02, .25, 1.4, loud); } // a child's shriek on top
    if (music.g) { music.g.gain.cancelScheduledValues(t); music.g.gain.setValueAtTime(.12, t); music.g.gain.linearRampToValueAtTime(.9, t + 4); } },
  breath() { if (!A()) return; const t = ac.currentTime, out = wet(.5); hiss(t, .5, .08, .5, 'bandpass', 700, 500, 2.5, out); hiss(t + .9, .1, .06, .7, 'bandpass', 500, 300, 2, out); tone('sawtooth', 70, 60, t + .9, .1, .015, .6, out); },
  bones() { if (!A()) return; const t = ac.currentTime; for (let i = 0; i < 3; i++) hiss(t + i * .025 + Math.random() * .02, .001, .12, .02, 'highpass', 2500 + Math.random() * 2500, 0, 1); },
  flashClick() { if (!A()) return; const t = ac.currentTime; tone('square', 2400, 1800, t, .001, .05, .02); hiss(t, .001, .08, .03, 'highpass', 3000, 0, 1); },
  clunk() { if (!A()) return; const t = ac.currentTime, out = wet(.6); tone('square', 110, 60, t, .002, .25, .15, out); hiss(t, .002, .4, .2, 'lowpass', 900, 200, 1, out); tone('sawtooth', 50, 50, t + .05, .3, .03, 2, out); },
  distantScream() { if (!A()) return; const t = ac.currentTime, lp = ac.createBiquadFilter(), g = envGain(t, .2, .12, 1.6); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g).connect(master);
    for (const f of [700, 930]) tone('sawtooth', f, f * 1.25, t, .2, .5, 1.5, lp); },
  whisper(v) { if (!A()) return; const t = ac.currentTime, out = wet(.8); for (let i = 0; i < 9; i++) hiss(t + i * .1 + Math.random() * .05, .02, .09 * v, .09, 'bandpass', 1700 + Math.random() * 2800, 0, 7, out); },
  heartbeat(v) { if (!A()) return; const t = ac.currentTime; tone('sine', 55, 38, t, .01, .55 * v, .14); tone('sine', 50, 36, t + .2, .01, .4 * v, .14); },
  lightsOut() { if (!A()) return; const t = ac.currentTime; tone('square', 90, 60, t, .002, .25, .06); tone('sawtooth', 120, 50, t, .01, .1, .8); hiss(t, .005, .2, .3, 'lowpass', 300, 0, 1); },
  sting() { if (!A()) return; const t = ac.currentTime, ws = shaper(20), g = envGain(t, .01, .5, 1.8); ws.connect(g).connect(wet(.8));
    for (const f of [311, 329.6, 466, 622]) tone('sawtooth', f, f * .97, t, .005, .25, 1.5, ws); hiss(t, .005, .4, .9, 'highpass', 2500, 0, 1, ws); },
  gameOver() { if (!A()) return; const t = ac.currentTime, lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(master); tone('sawtooth', 55, 52, t, .3, .25, 3, lp); tone('sawtooth', 58.3, 54, t, .3, .25, 3, lp); tone('sine', 110, 98, t, .3, .15, 3, lp); },
  win() { if (!A()) return; const t = ac.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, t + i * .12, .01, .12, .5)); },
};

// ---------- UI ----------
function showPlaque(title, meta, text) { $('pTitle').textContent = title; $('pMeta').textContent = meta; $('pText').textContent = text; $('plaque').hidden = false; S.plaque = true; S.plaqueAt = guard.p.position.clone(); }
function hidePlaque() { $('plaque').hidden = true; S.plaque = false; }
$('plaqueClose').onclick = hidePlaque;
function subtitle(text, ms = 2200) { const el = $('sub'); el.textContent = text; el.classList.add('on'); clearTimeout(subtitle.t); subtitle.t = setTimeout(() => el.classList.remove('on'), ms); }
let current = null;
function setPrompt(it) {
  current = it; const el = $('prompt'), lab = it && it.label;
  if (!lab || S.busy) { el.hidden = true; $('useBtn').hidden = true; return; }
  el.innerHTML = '<kbd>E</kbd> ' + lab.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); el.classList.toggle('danger', !!it.danger); el.hidden = false;
  $('useBtn').hidden = !S.touch;
}
function use() { if (current && current.label && !S.busy && S.started) { if (S.plaque && !current.danger) { hidePlaque(); return; } current.use(); } }
$('prompt').onclick = use; $('useBtn').onclick = use;
$('flashBtn').onclick = () => { A(); if (S.started) toggleFlash(); };
$('soundBtn').onclick = () => { S.sound = !S.sound; $('soundBtn').textContent = S.sound ? 'Ljud på' : 'Ljud av'; $('soundBtn').setAttribute('aria-pressed', S.sound); if (master) master.gain.value = S.sound ? 1 : 0; };
function setRoomHud(k) { $('roomName').textContent = ROOMS[k].name; $('roomSub').textContent = ROOMS[k].sub; }
function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function start() {
  $('intro').hidden = true; S.started = true; S.t0 = performance.now(); A(); music.start();
  subtitle('Det är becksvart. Tryck F för att tända ficklampan.', 4500);
}
$('startBtn').onclick = start;
const reload = () => { try { sessionStorage.setItem('aurora-skip-intro', '1'); } catch (e) {} location.reload(); };
$('retryBtn').onclick = reload; $('againBtn').onclick = reload;
try { if (sessionStorage.getItem('aurora-skip-intro')) { sessionStorage.removeItem('aurora-skip-intro'); start(); } } catch (e) {}

function win() {
  if (S.busy) return; S.busy = true; S.won = true; hidePlaque(); setPrompt(null); sfx.win();
  if (crownObj) crownObj.visible = false;
  const secs = (performance.now() - S.t0) / 1000;
  $('winText').textContent = `Du hittade alla sex stjärnor, öppnade valvet och räddade Aurorakronan på ${fmt(secs)}. Och du lät bli knappen. Klokt.`;
  setTimeout(() => { $('win').hidden = false; }, 600);
}

// ---------- input ----------
addEventListener('keydown', e => {
  A(); if (!S.started) return;
  S.keys[e.code] = true;
  if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); use(); }
  if (e.code === 'Escape') hidePlaque();
  if (e.code === 'KeyF' && !e.repeat) toggleFlash();
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { S.keys[e.code] = false; });
addEventListener('blur', () => { S.keys = {}; });
let drag = null, joy = null;
canvas.addEventListener('pointerdown', e => {
  A(); if (!S.started) return;
  if (e.pointerType === 'touch') { S.touch = true; if (e.clientX < innerWidth / 2 && !joy) { joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; const j = $('joy'); j.hidden = false; j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; $('knob').style.transform = 'translate(-50%,-50%)'; return; } }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (joy && e.pointerId === joy.id) { let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } joy.dx = dx / m; joy.dy = dy / m; $('knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; return; }
  if (drag && e.pointerId === drag.id) { S.yaw -= (e.clientX - drag.x) * .006; S.pitch = Math.min(.95, Math.max(.05, S.pitch + (e.clientY - drag.y) * .004)); drag.x = e.clientX; drag.y = e.clientY; }
});
const endPtr = e => { if (joy && e.pointerId === joy.id) { joy = null; $('joy').hidden = true; } if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);

// ---------- movement ----------
function blocked(x, z, r = .3) { for (const c of colliders) if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true; return false; }
let stepT = 0, walkPhase = 0;
function updatePlayer(dt) {
  const k = S.keys;
  let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  let turn = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
  if (joy) { fwd = -joy.dy; turn = -joy.dx * .8; if (Math.abs(fwd) < .15) fwd = 0; }
  const run = k.ShiftLeft || k.ShiftRight;
  S.yaw += turn * dt * 2.2;
  const p = guard.p.position, speed = (run ? 5.2 : 3) * fwd;
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  let moving = false;
  if (fwd) {
    const nx = p.x + fx * speed * dt, nz = p.z + fz * speed * dt;
    if (!blocked(nx, p.z)) { p.x = nx; moving = true; }
    if (!blocked(p.x, nz)) { p.z = nz; moving = true; }
  }
  // face where the camera looks
  const want = S.yaw + Math.PI; let d = want - guard.p.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); guard.p.rotation.y += d * Math.min(1, dt * 10);
  if (moving) {
    walkPhase += dt * (run ? 12 : 8) * Math.sign(fwd); const s = Math.sin(walkPhase) * .6;
    guard.legL.rotation.x = s; guard.legR.rotation.x = -s; guard.armL.rotation.x = -s * .7; guard.armR.rotation.x = s * .3 - .3;
    stepT -= dt; if (stepT <= 0) { stepT = run ? .28 : .42; sfx.step(); }
  } else { for (const l of ['legL', 'legR', 'armL']) guard[l].rotation.x *= .8; guard.armR.rotation.x = guard.armR.rotation.x * .8 - .06; }
  if (S.plaque && S.plaqueAt && S.plaqueAt.distanceTo(p) > 2.5) hidePlaque();
}

// ---------- camera ----------
const tmpV = V3(), camTarget = V3(), ray = new THREE.Raycaster(), cineLook = V3(), cinePos = V3(), lookNow = V3();
function setCine(mode) {
  S.cine = true;
  // Film from the side (south) so the dinosaur and the guard stand side by side in the frame
  const nc = center('natur');
  const hp = dino.headPivot.getWorldPosition(V3()), gp = guard.p.position.clone(); gp.y = 1.6;
  const mid = hp.clone().add(gp).multiplyScalar(.5);
  if (mode === 'wide') { cinePos.set(mid.x + .8, 2.6, nc.z + 7.3); cineLook.copy(mid); }
  else if (mode === 'close') { cinePos.set(mid.x + .4, 2.1, Math.min(nc.z + 7.3, gp.z + 3.4)); cineLook.copy(mid).lerp(gp, .35); }
  else if (mode === 'body') { const b = guard.neck.getWorldPosition(V3()); cinePos.set(b.x + 1.4, 2.5, Math.min(nc.z + 7.3, b.z + 2.6)); cineLook.copy(b); cineLook.y = .25; }
  if (!S.cineInit) { lookNow.copy(camTarget); S.cineInit = true; }
}
function updateCamera(dt) {
  camTarget.set(guard.p.position.x, 1.6, guard.p.position.z);
  if (S.cine) {
    const k = 1 - Math.exp(-dt * 3); camera.position.lerp(cinePos, k); lookNow.lerp(cineLook, k); camera.lookAt(lookNow);
  } else {
    const dist = 4.2, dir = V3(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch));
    ray.set(camTarget, dir); ray.far = dist; const hit = ray.intersectObjects(wallMeshes, false)[0];
    const d = hit ? Math.max(.5, hit.distance - .3) : dist;
    camera.position.copy(camTarget).addScaledVector(dir, d); camera.position.y = Math.min(camera.position.y, H - .25);
    camera.lookAt(camTarget.x, camTarget.y + .15, camTarget.z);
  }
  if (S.jump) { // jumpscare: the camera snaps to her face
    const n = S.jump.n, hw = n.head.localToWorld(V3(0, .12, .07)), ry = n.g.rotation.y;
    camera.position.set(hw.x + Math.sin(ry) * .4, hw.y + .01, hw.z + Math.cos(ry) * .4); camera.lookAt(hw);
    scareLight.position.set(hw.x + Math.sin(ry) * .3, hw.y - .15, hw.z + Math.cos(ry) * .3); scareLight.intensity = 2.2 * (.6 + Math.random() * .4);
  } else scareLight.intensity = 0;
  if (S.shake > 0) { camera.position.x += (Math.random() - .5) * S.shake * .25; camera.position.y += (Math.random() - .5) * S.shake * .25; S.shake = Math.max(0, S.shake - dt * 1.4); }
}

// ---------- the button ----------
function splatter() {
  const el = $('splat'); el.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('i'), s = 70 + Math.random() * 170, edge = i % 2 ? Math.random() * 22 - 8 : 78 + Math.random() * 22;
    b.style.cssText = `left:${i < 4 ? edge : Math.random() * 90}%;top:${i < 4 ? Math.random() * 80 : Math.random() * 12 - 8}%;width:${s}px;height:${s * (0.8 + Math.random() * .5)}px;animation-delay:${Math.random() * .4}s`;
    el.appendChild(b);
  }
  for (let i = 0; i < 12; i++) { const d = document.createElement('b'); d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 40}%;height:${40 + Math.random() * 120}px;animation-delay:${.3 + Math.random()}s`; el.appendChild(d); }
  el.classList.add('on'); $('vignette').classList.add('on');
}
async function doom() {
  if (S.busy) return; S.busy = true; S.dead = true; hidePlaque(); setPrompt(null); S.keys = {};
  const p = guard.p.position;
  guard.p.rotation.y = Math.atan2(btnWorld.x - p.x, btnWorld.z - p.z);
  guard.armR.rotation.x = -1.3;
  await tween(140, k => { btnCap.position.y = 1.12 - .06 * k; }); sfx.click();
  await wait(250); guard.armR.rotation.x = 0;
  // turn toward the dinosaur
  const hp0 = dino.headPivot.getWorldPosition(V3()); guard.p.rotation.y = Math.atan2(hp0.x - p.x, hp0.z - p.z);
  S.phase = 'alarm'; S.alarm = true; sfx.alarmStart(); music.stop(1.5); setCine('wide'); subtitle('Det stod KLICKA INTE.', 1800);
  await wait(1300);
  // the skull becomes a face
  await tween(250, k => dino.skull.scale.setScalar(Math.max(.01, 1 - k)));
  { const hw = dino.headPivot.getWorldPosition(V3()); exhibit.position.set(hw.x + 2.2, H - .3, hw.z + 2.2); exhibit.target.position.copy(hw); exhibit.intensity = 5; sfx.clunk(); }
  ROOMS.natur.li = .9; ROOMS.natur.lamp.color.setHex(0xffd0a0); ROOMS.natur.lampMat.emissiveIntensity = 1;
  S.phase = 'face'; dino.skull.visible = false; dino.flesh.visible = true; dino.neck.material = dino.skinMat; sfx.roar(); dino.eyeMat.emissiveIntensity = 2;
  await tween(450, k => dino.flesh.scale.setScalar(Math.max(.01, back(k))));
  await tween(400, k => { dino.fjaw.rotation.z = -.12 - .35 * Math.sin(k * Math.PI); });
  await wait(500);
  // lunge
  const headW = guard.head.localToWorld(V3(0, .27, 0)), target = dino.g.worldToLocal(headW.clone()), start = dino.headPivot.position.clone();
  const dx = target.x - start.x, dy = target.y - start.y, dz = target.z - start.z, hd = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx), pitch = Math.atan2(dy, hd);
  const aim = target.clone().sub(V3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw)).multiplyScalar(1.12)); aim.y += .32;
  const r0 = dino.headPivot.rotation.clone();
  S.phase = 'lunge'; setCine('close'); sfx.scream();
  await tween(330, k => {
    const e = ease(k); dino.headPivot.position.lerpVectors(start, aim, e);
    dino.headPivot.rotation.set(0, r0.y + (yaw - r0.y) * e, r0.z + (pitch - r0.z) * e); dino.fjaw.rotation.z = -.12 - 1 * Math.min(1, k * 2); updateNeck();
  });
  // CHOMP
  S.phase = 'bite'; dino.fjaw.rotation.z = -.1; sfx.screamCut(); sfx.crunch(1.2);
  dino.headPivot.attach(guard.head); guard.stump.visible = true; guard.headStump.visible = true;
  // the head hangs out of the front of the jaws
  guard.head.position.set(1.2, -.78, .05); guard.head.rotation.set(.4, -1.2, 2.3); dino.fjaw.rotation.z = -.38;
  S.shake = 1.4; splatter();
  const neckW = guard.neck.getWorldPosition(V3());
  emitBlood(headW, V3(0, 1, 0), 260, 4, 3); emitBlood(neckW, V3(0, 1, 0), 200, 5, 1.6);
  S.bleed = { t: 0, acc: 0, beat: -1 }; S.drip = 7;
  await wait(200);
  // shake the head and pull back
  const hit = dino.headPivot.position.clone(), r1 = dino.headPivot.rotation.clone();
  await tween(900, k => {
    const e = ease(k); dino.headPivot.position.lerpVectors(hit, start, e);
    dino.headPivot.rotation.set(Math.sin(k * 22) * .35 * (1 - k), r1.y + (r0.y - r1.y) * e, r1.z + (.35 - r1.z) * e); updateNeck();
  });
  S.phase = 'retracted'; sfx.chew();
  await wait(800);
  // the body sinks to its knees, then falls
  await tween(450, k => { const e = ease(k); guard.body.position.y = -.38 * e; guard.legL.rotation.x = guard.legR.rotation.x = -.5 * e; guard.armL.rotation.x = guard.armR.rotation.x = .25 * e; });
  sfx.thud(.5);
  await wait(250);
  await tween(650, k => { const e = k * k; guard.body.rotation.x = e * 1.42; guard.body.position.y = -.38 + .26 * e; });
  sfx.thud(1); S.shake = .6;
  const nw = guard.neck.getWorldPosition(V3()); pool.position.set(nw.x, .013, nw.z); pool.visible = true; S.pool = .01;
  S.phase = 'fallen'; setCine('body');
  await wait(500); sfx.chew();
  await wait(2200);
  sfx.alarmStop(); S.alarm = false; sfx.gameOver();
  S.phase = 'over'; $('gameover').hidden = false;
}


// ---------- the nuns ----------
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const nuns = [];
const nunBlack = mat(0x08070a, { roughness: .85 }), nunWhite = mat(0xcfcabd, { roughness: .9 }), nunSkin = mat(0xb4ae9e, { roughness: .6 }), voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
// her face: grey cracked skin, empty black eyes crying blood, a long torn mouth
const nunFaceTex = canvasTex(512, 256, (g, w, h) => {
  const R = rng(66); g.fillStyle = '#b5ae9c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${R() < .5 ? '60,50,40' : '120,110,100'},${R() * .12})`; g.fillRect(R() * w, R() * h, 2, 2); }
  g.strokeStyle = 'rgba(40,20,20,.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { g.beginPath(); let x = 180 + R() * 150, y = 40 + R() * 180; g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (R() - .5) * 30; y += R() * 22; g.lineTo(x, y); } g.stroke(); }
  for (const s of [-1, 1]) {
    const ex = w / 2 + s * 26, ey = h * .44;
    const gr = g.createRadialGradient(ex, ey, 2, ex, ey, 30); gr.addColorStop(0, '#000'); gr.addColorStop(.6, 'rgba(10,0,0,.95)'); gr.addColorStop(1, 'rgba(60,20,20,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(ex, ey, 30, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#5a0000'; for (let k = 0; k < 3; k++) { const x = ex - 8 + k * 7 + (R() - .5) * 4, l = 30 + R() * 50; g.fillRect(x, ey + 12, 2.5 + R() * 2, l); g.beginPath(); g.arc(x + 1.5, ey + 12 + l, 3, 0, 7); g.fill(); }
  }
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(w / 2, h * .74, 22, 34, 0, 0, 7); g.fill();
  g.strokeStyle = '#2a0000'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2 - 22, h * .74); g.quadraticCurveTo(w / 2 - 50, h * .7, w / 2 - 64, h * .6); g.moveTo(w / 2 + 22, h * .74); g.quadraticCurveTo(w / 2 + 50, h * .7, w / 2 + 64, h * .6); g.stroke();
  g.fillStyle = '#d8d0b8'; for (let k = 0; k < 7; k++) { const x = w / 2 - 18 + k * 6; g.beginPath(); g.moveTo(x, h * .74 - 30); g.lineTo(x + 3, h * .74 - 18); g.lineTo(x + 6, h * .74 - 30); g.fill(); g.beginPath(); g.moveTo(x, h * .74 + 30); g.lineTo(x + 3, h * .74 + 18); g.lineTo(x + 6, h * .74 + 30); g.fill(); }
});
const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,60,40,1)'); gr.addColorStop(.25, 'rgba(255,0,0,.6)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
function buildNun() {
  const g = new THREE.Group(); scene.add(g);
  const body = new THREE.Group(); g.add(body);
  const robe = [[0, 0], [.36, 0], [.3, .08], [.33, .14], [.26, .4], [.17, .7], [.15, .8], [0, .82]].map(([a, b]) => new THREE.Vector2(a, b));
  addMesh(body, new THREE.LatheGeometry(robe, 28), nunBlack, 0, 0, 0);
  addMesh(body, new THREE.SphereGeometry(.18, 16, 10), nunBlack, 0, .8, 0).scale.set(1.25, .6, 1);
  addMesh(body, new THREE.CylinderGeometry(.13, .19, .1, 18), nunWhite, 0, .86, 0);
  addMesh(body, new THREE.BoxGeometry(.02, .3, .01), nunWhite, 0, .62, .17).rotation.x = -.25; // cross on a cord
  addMesh(body, new THREE.BoxGeometry(.12, .02, .01), nunWhite, 0, .55, .19).rotation.x = -.25;
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(.16 * s, .78, .02); body.add(arm); arms.push(arm);
    addMesh(arm, new THREE.CapsuleGeometry(.03, .42, 4, 8), nunSkin, 0, -.26, 0);
    for (let f = 0; f < 4; f++) { const fi = addMesh(arm, new THREE.ConeGeometry(.008, .14, 5), nunSkin, (f - 1.5) * .015, -.58, .01); fi.rotation.x = Math.PI + (f - 1.5) * .1; }
  }
  const neck = addMesh(body, new THREE.CylinderGeometry(.04, .05, 1, 10), nunSkin, 0, .9, 0); neck.scale.y = .01;
  const head = new THREE.Group(); head.position.y = .9; body.add(head);
  addMesh(head, new THREE.SphereGeometry(.16, 18, 12), nunBlack, 0, .15, -.03).scale.set(1.05, 1.18, 1.12);
  addMesh(head, new THREE.ConeGeometry(.2, .55, 16, 1, true), nunBlack, 0, -.1, -.1).rotation.x = .28;
  addMesh(head, new THREE.TorusGeometry(.108, .03, 10, 24), nunWhite, 0, .12, .07);
  const face = addMesh(head, new THREE.SphereGeometry(.1, 32, 20), mat(0xffffff, { map: nunFaceTex, roughness: .55 }), 0, .12, .07); face.scale.set(.9, 1.2, .72); face.rotation.y = -Math.PI / 2;
  const mouth = addMesh(head, new THREE.SphereGeometry(.024, 10, 8), voidMat, 0, .055, .135); mouth.scale.set(.8, 1.4, .5);
  const eyeMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .7 });
  for (const s of [-1, 1]) { const e = new THREE.Sprite(eyeMat); e.position.set(.035 * s, .15, .16); e.scale.setScalar(.07); head.add(e); }
  const hair = mat(0x050405, { roughness: .9 });
  for (let i = 0; i < 9; i++) { const s = i < 5 ? -1 : 1, len = .25 + Math.random() * .25; const st = addMesh(head, new THREE.BoxGeometry(.012, len, .006), hair, s * (.05 + Math.random() * .05), .18 - len / 2, .15 + Math.random() * .02); st.rotation.z = s * (.05 + Math.random() * .15); }
  return { g, body, head, neck, mouth, eyeMat, arms };
}
function randomPoint(k) { const c = center(k); for (let i = 0; i < 30; i++) { const x = c.x + (Math.random() - .5) * 15, z = c.z + (Math.random() - .5) * 11; if (!blocked(x, z, .4)) return V3(x, 0, z); } return V3(c.x, 0, c.z); }
function doorPoint(k, nb) { const c = center(k); for (const side of ['n', 's', 'w', 'e']) if (neighbor(k, side) === nb) { const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side]; return V3(c.x + d[0] * (W / 2 - 1.3), 0, c.z + d[1] * (D / 2 - 1.3)); } return randomPoint(k); }
['entre', 'konst', 'konst', 'modern', 'natur', 'mineral', 'mineral', 'egypt', 'egypt'].forEach(k => {
  const n = buildNun(); let p;
  do { p = randomPoint(k); } while (k === 'entre' && p.distanceTo(guard.p.position) < 7);
  n.g.position.copy(p); n.g.rotation.y = Math.random() * 6; n.room = k;
  Object.assign(n, { path: [], wait: Math.random() * 3, speed: .45 + Math.random() * .3, phase: Math.random() * 10, twitch: 0, tilt: 0, cd: 0, scream: 0, jerk: 0, whisperT: 0 });
  nuns.push(n);
});
// three more hang upside down from the ceiling, and drop on you
['konst', 'natur', 'egypt'].forEach(k => {
  const n = buildNun(), p = randomPoint(k); n.g.position.set(p.x, H, p.z); n.g.rotation.z = Math.PI; n.room = k; n.ceil = true;
  Object.assign(n, { path: [], wait: Math.random() * 3, speed: .35, phase: Math.random() * 10, twitch: 0, tilt: 0, cd: 0, scream: 0, jerk: 0, whisperT: 0 });
  nuns.push(n);
});
function faceTo(n, target, k) { const want = Math.atan2(target.x - n.g.position.x, target.z - n.g.position.z); n.g.rotation.y += wrap(want - n.g.rotation.y) * Math.min(1, k); }
// Is this point inside the flashlight beam?
function litByFlash(p) {
  if (!S.flash || S.fail) return false;
  const gp = guard.p.position, dx = p.x - gp.x, dz = p.z - gp.z, d = Math.hypot(dx, dz); if (d > 16) return false;
  const ry = guard.p.rotation.y; return (dx * Math.sin(ry) + dz * Math.cos(ry)) / (d || 1) > Math.cos(.6);
}
function nunStep(n, tx, tz, st) { // steer around furniture
  const p = n.g.position, stuck = blocked(p.x, p.z, .25), base = Math.atan2(tx - p.x, tz - p.z);
  for (const off of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8]) { const a = base + off, x = p.x + Math.sin(a) * st, z = p.z + Math.cos(a) * st; if (stuck || !blocked(x, z, .25)) { p.x = x; p.z = z; return; } }
}
function updateNuns(dt, t) {
  const pp = guard.p.position; let nearest = 99, hunting = false;
  for (const n of nuns) {
    const p = n.g.position, d = Math.hypot(p.x - pp.x, p.z - pp.z);
    n.room = roomAt(p.x, p.z) || n.room; n.cd -= dt;
    if (n.room === S.room) nearest = Math.min(nearest, d);
    if (n.scream > 0) { // the scream: the neck stretches, the jaw drops, she shakes
      n.scream -= dt; const k = Math.min(1, (1.4 - n.scream) * 6);
      n.head.position.y = .9 + .42 * k; n.neck.scale.y = .01 + .42 * k; n.neck.position.y = .9 + .21 * k;
      n.head.rotation.x = Math.sin(t * 61) * .3; n.head.rotation.z = Math.sin(t * 47) * .35; n.mouth.scale.set(1.6, 5, .7);
      n.arms.forEach((a, i) => { a.rotation.x = -.9 + Math.sin(t * 40) * .15; a.rotation.z = (i ? 1 : -1) * (1.5 + Math.sin(t * 37) * .15); });
      n.body.position.y = .08 + Math.sin(t * 53) * .04; n.eyeMat.opacity = 1; faceTo(n, pp, dt * 20);
      if (n.scream <= 0) { n.arms.forEach(a => { a.rotation.z = 0; }); n.head.position.y = .9; n.neck.scale.y = .01; n.mouth.scale.set(.8, 1.4, .5); n.body.position.y = 0; n.head.rotation.x = 0; }
      continue;
    }
    if (n.drop > 0) { // falling from the ceiling
      n.drop -= dt; const k = 1 - Math.max(0, n.drop) / .35; p.y = H * (1 - k * k); n.g.rotation.z = Math.PI * (1 - k);
      if (n.drop <= 0) { p.y = 0; n.g.rotation.z = 0; n.ceil = false; sfx.thud(.8); nunScream(n); }
      continue;
    }
    if (n.ceil && S.started && !S.busy && n.room === S.room && d < 1.7 && n.cd <= 0) { n.drop = .35; faceTo(n, pp, 1); continue; }
    const sameRoom = n.room === S.room, active = S.started && !S.busy, chase = active && sameRoom && d < 9, lit = litByFlash(p) && !n.ceil;
    let moving = false;
    if (chase) {
      n.path = [];
      // Like a statue while the light is on her. In the dark she comes, in jerks.
      if (!lit) { n.jerk -= dt; if (n.jerk < 0) { n.jerk = .1 + Math.random() * .12; nunStep(n, pp.x, pp.z, (d < 3 ? 1.6 : 2.3) * .16); faceTo(n, pp, 1); moving = true; if (Math.random() < .25) sfx.bones(); } }
      if (!lit) hunting = hunting || d < 6;
    } else if (S.started && !S.dead && !S.won) {
      if (!n.path.length) {
        if (Math.random() < .35) { const opts = LINKS.filter(l => l.includes(n.room)).map(l => l[0] === n.room ? l[1] : l[0]).filter(r => r !== 'skatt'); const nb = opts[Math.floor(Math.random() * opts.length)]; n.path = [doorPoint(n.room, nb), doorPoint(nb, n.room), randomPoint(nb)]; }
        else n.path = [randomPoint(n.room)];
        if (n.ceil) n.path = [randomPoint(n.room)];
        n.wait = Math.random() * 3;
      }
      if (n.wait > 0) n.wait -= dt; else {
        const tg = n.path[0], dx = tg.x - p.x, dz = tg.z - p.z, l = Math.hypot(dx, dz);
        if (l < .3) n.path.shift(); else { const st = Math.min(l, n.speed * dt); p.x += dx / l * st; p.z += dz / l * st; faceTo(n, tg, dt * 4); moving = true; }
      }
    }
    // arms reach for you when she hunts; heads twitch; eyes burn brighter up close
    const reach = chase && d < 5 ? -1.45 : 0;
    for (const a of n.arms) a.rotation.x += (reach - a.rotation.x) * Math.min(1, dt * 4);
    n.body.rotation.z = Math.sin(t * 1.3 + n.phase) * .05; n.g.position.y = n.ceil ? H : moving ? Math.abs(Math.sin(t * 3 + n.phase)) * .025 : 0;
    n.twitch -= dt; if (n.twitch < 0) { n.twitch = .8 + Math.random() * 3; n.tilt = (Math.random() - .5) * 1.5; if (Math.random() < .12 && !lit) n.head.rotation.y += Math.PI; }
    const look = (sameRoom && d < 10) || S.dead ? wrap(Math.atan2(pp.x - p.x, pp.z - p.z) - n.g.rotation.y) : 0;
    n.head.rotation.y += (wrap(Math.max(-1.7, Math.min(1.7, look)) - n.head.rotation.y)) * Math.min(1, dt * 5);
    n.head.rotation.z += (n.tilt - n.head.rotation.z) * Math.min(1, dt * 16);
    n.eyeMat.opacity = sameRoom && d < 6 ? .95 : .55;
    if (sameRoom && d < 5 && !S.dead) { n.whisperT -= dt; if (n.whisperT < 0) { n.whisperT = 1.4 + Math.random() * 2.5; sfx.whisper(1 - d / 6); } }
    if (sameRoom && d < 6 && !S.dead) maybeSpeak();
    if (S.started && !S.busy && !n.ceil && d < .75 && n.cd <= 0) nunScream(n);
  }
  S.nearestNun = nearest; S.hunted = hunting;
}
// The nuns whisper to you, in Swedish, with the browser's own voice
const PHRASES = ['Vi ser dig', 'Stanna hos oss', 'Klicka inte', 'Du hör hemma här nu', 'Vänd dig inte om', 'Han väntar på dig', 'Spring'];
let speakT = 6;
function maybeSpeak() {
  if (speakT > 0 || !S.sound || !('speechSynthesis' in window)) return; speakT = 9 + Math.random() * 8;
  try { const u = new SpeechSynthesisUtterance(PHRASES[Math.floor(Math.random() * PHRASES.length)]); u.lang = 'sv-SE'; u.pitch = .1; u.rate = .6; u.volume = .8;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('sv')); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {}
}
// ---------- the full-screen jumpscare ----------
const jumpCanvas = $('jump'), jumpG = jumpCanvas.getContext('2d');
const screamFace = (() => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'), R = rng(13);
  g.fillStyle = '#050305'; g.beginPath(); g.ellipse(300, 430, 300, 400, 0, 0, 7); g.fill(); // veil
  g.fillStyle = '#d6d0c2'; g.beginPath(); g.ellipse(300, 420, 205, 270, 0, 0, 7); g.fill(); // coif
  const fg = g.createRadialGradient(290, 380, 40, 300, 430, 240); fg.addColorStop(0, '#cfc7b4'); fg.addColorStop(.7, '#8f887a'); fg.addColorStop(1, '#3a3530');
  g.fillStyle = fg; g.beginPath(); g.ellipse(300, 430, 170, 235, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(40,10,10,.6)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { g.beginPath(); let x = 160 + R() * 280, y = 240 + R() * 380; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - .5) * 50; y += R() * 40; g.lineTo(x, y); } g.stroke(); }
  for (const s of [-1, 1]) { const ex = 300 + s * 70, ey = 360;
    const eg = g.createRadialGradient(ex, ey, 5, ex, ey, 70); eg.addColorStop(0, '#000'); eg.addColorStop(.65, 'rgba(0,0,0,.97)'); eg.addColorStop(1, 'rgba(20,0,0,0)'); g.fillStyle = eg; g.beginPath(); g.ellipse(ex, ey, 70, 58, s * .15, 0, 7); g.fill();
    const pg = g.createRadialGradient(ex, ey, 0, ex, ey, 16); pg.addColorStop(0, '#fff2c0'); pg.addColorStop(.3, '#ff2010'); pg.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = pg; g.beginPath(); g.arc(ex, ey, 16, 0, 7); g.fill();
    g.fillStyle = '#6a0006'; for (let k = 0; k < 4; k++) { const x = ex - 30 + k * 18 + (R() - .5) * 8, l = 120 + R() * 260; g.fillRect(x, ey + 34, 5 + R() * 4, l); g.beginPath(); g.arc(x + 4, ey + 34 + l, 6, 0, 7); g.fill(); } }
  const mg = g.createLinearGradient(0, 470, 0, 760); mg.addColorStop(0, '#000'); mg.addColorStop(1, '#2a0000'); g.fillStyle = mg; g.beginPath(); g.ellipse(300, 600, 85, 165, 0, 0, 7); g.fill();
  g.strokeStyle = '#1a0000'; g.lineWidth = 6; g.beginPath(); g.moveTo(215, 590); g.quadraticCurveTo(140, 540, 120, 450); g.moveTo(385, 590); g.quadraticCurveTo(460, 540, 480, 450); g.stroke();
  g.fillStyle = '#ddd2b4'; for (let k = 0; k < 9; k++) { const x = 232 + k * 15; g.beginPath(); g.moveTo(x, 450); g.lineTo(x + 7, 490 + R() * 20); g.lineTo(x + 14, 452); g.fill(); g.beginPath(); g.moveTo(x, 755); g.lineTo(x + 7, 715 - R() * 20); g.lineTo(x + 14, 753); g.fill(); }
  g.strokeStyle = '#030203'; g.lineWidth = 4; for (let i = 0; i < 40; i++) { const s = i % 2 ? -1 : 1, x = 300 + s * (110 + R() * 90); g.beginPath(); g.moveTo(x, 200); g.bezierCurveTo(x + s * 10, 400, x - s * 20, 600, x + s * (R() * 40), 760 + R() * 40); g.stroke(); }
  const red = document.createElement('canvas'); red.width = 600; red.height = 800; const rg = red.getContext('2d'); rg.drawImage(c, 0, 0); rg.globalCompositeOperation = 'source-atop'; rg.fillStyle = 'rgba(255,0,0,.75)'; rg.fillRect(0, 0, 600, 800);
  return { c, red };
})();
function drawJump(t) {
  const W2 = jumpCanvas.width = innerWidth >> 1, H2 = jumpCanvas.height = innerHeight >> 1, g = jumpG, k = 1.15 - t;
  g.fillStyle = `rgba(0,0,0,${Math.min(.8, k * 6)})`; g.fillRect(0, 0, W2, H2);
  const sc = (H2 / 800) * (1.05 + k * .9) * (1 + (Math.random() - .5) * .06), w = 600 * sc, h = 800 * sc, sx = (Math.random() - .5) * 60, sy = (Math.random() - .5) * 60;
  g.globalAlpha = t < .25 ? t / .25 : 1;
  g.drawImage(screamFace.red, W2 / 2 - w / 2 + sx + 14, H2 / 2 - h / 2 + sy + 4, w, h);
  g.drawImage(screamFace.c, W2 / 2 - w / 2 + sx, H2 / 2 - h / 2 + sy, w, h);
  g.fillStyle = 'rgba(0,0,0,.35)'; for (let y = Math.random() * 6; y < H2; y += 6) g.fillRect(0, y, W2, 2);
  g.globalAlpha = 1;
}
function nunScream(n) {
  n.scream = 1.4; n.cd = 3.5; sfx.nunScream(); S.shake = 2; S.jump = { n, t: 1.15 }; jumpCanvas.style.display = 'block';
  const el = $('scare'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  const pp = guard.p.position, dx = pp.x - n.g.position.x, dz = pp.z - n.g.position.z, l = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 10; i++) { const nx = pp.x + dx / l * .14, nz = pp.z + dz / l * .14; if (!blocked(nx, pp.z)) pp.x = nx; if (!blocked(pp.x, nz)) pp.z = nz; }
}
// When the flashlight comes back on, one of them is standing right behind you
function sneakNun() {
  const pp = guard.p.position, bx = pp.x + Math.sin(S.yaw) * 2.4, bz = pp.z + Math.cos(S.yaw) * 2.4;
  if (blocked(bx, bz, .4) || roomAt(bx, bz) !== S.room) return;
  let best = null, bd = 1e9; for (const n of nuns) { const d = n.g.position.distanceTo(pp); if (!n.ceil && n.scream <= 0 && d < bd && d > 4) { bd = d; best = n; } }
  if (!best) return; best.g.position.set(bx, 0, bz); best.path = []; best.jerk = 1.2; faceTo(best, pp, 1); best.cd = 0;
}
const grain = $('grain'), grainG = grain.getContext('2d'), grainImg = grainG.createImageData(grain.width, grain.height);
function updateGrain() { const d = grainImg.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } grainG.putImageData(grainImg, 0, 0); }
let failT = 28 + Math.random() * 15, beatT = 0, farT = 30, grainT = 0, breathT = 0;
function updateScares(dt) {
  if (!S.started || S.dead || S.won) return;
  // the flashlight dies now and then
  failT -= dt;
  if (failT < 0 && S.flash && !S.fail && !S.busy) { S.fail = { t: 2.5 + Math.random() * 2 }; failT = 30 + Math.random() * 30; sfx.lightsOut(); }
  if (S.fail) { S.fail.t -= dt; if (S.fail.t <= 0) { S.fail = null; sneakNun(); sfx.sting(); } }
  const near = S.nearestNun || 99;
  const k = S.fail ? (Math.random() < .07 ? .6 : 0) : (near < 3 && Math.random() < .1 ? .15 : 1);
  guard.spot.intensity = S.flash ? 3.6 * k : 0; guard.fill.intensity = S.flash ? .55 * k : 0; guard.beam.material.opacity = S.flash ? .07 * k : 0;
  if (near < 7) { beatT -= dt; if (beatT < 0) { beatT = .32 + (near / 7) * .8; sfx.heartbeat(1 - near / 8); } }
  if (S.hunted) { breathT -= dt; if (breathT < 0) { breathT = 1.6 + Math.random(); sfx.breath(); } }
  farT -= dt; if (farT < 0) { farT = 35 + Math.random() * 40; sfx.distantScream(); }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let creakT = 8, tvT = 0, hudT = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if (S.started && !S.busy) updatePlayer(dt);
  // room
  const k = roomAt(guard.p.position.x, guard.p.position.z);
  if (k && k !== S.room) { S.room = k; setRoomHud(k); }
  // nearest interactable
  if (S.started && !S.busy) {
    let best = null, bd = 1e9; const p = guard.p.position;
    for (const it of interacts) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < it.r && d < bd && it.label) { bd = d; best = it; } }
    if (best !== current) setPrompt(best);
  }
  // stars
  for (const s of stars) {
    if (!s.visible) continue; s.rotation.y += dt * 2; s.position.y = s.userData.y + Math.sin(t * 2.5 + s.position.x) * .06;
    if (S.started && !S.busy && Math.hypot(s.position.x - guard.p.position.x, s.position.z - guard.p.position.z) < 1.05) {
      s.visible = false; S.stars.add(s.userData.room); sfx.star(); $('stars').textContent = S.stars.size; drawLock();
      if (S.stars.size === STAR_TOTAL) { subtitle('Alla stjärnor! Ett tungt lås öppnas i Egyptiska salen…', 3500); openVault(); }
      else subtitle(`Guldstjärna! ${S.stars.size} av ${STAR_TOTAL}`);
    }
  }
  // lights
  for (const rk in ROOMS) {
    const r = ROOMS[rk];
    if (S.blackout && S.blackout.room === rk) { r.lamp.intensity = 0; continue; }
    if (!r.flicker && r.lamp.intensity !== r.li) r.lamp.intensity = r.li;
    if (r.flicker) { r.flickerT -= dt; if (r.flickerT < 0) { r.flickerT = Math.random() < .5 ? .05 + Math.random() * .1 : 1 + Math.random() * 4; r.lamp.intensity = r.flickerT < .2 ? r.li * Math.random() * .2 : r.li; } }
  }
  alarmLight.intensity = S.alarm ? 3.5 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.5)) : 0;
  // the dinosaur watches you
  if (!S.dead && dino.g) {
    const loc = dino.g.worldToLocal(guard.p.position.clone()), y = Math.max(-.7, Math.min(.7, Math.atan2(-(loc.z), loc.x - 2.5)));
    const inNatur = S.room === 'natur';
    dino.headPivot.rotation.y += ((inNatur ? y : 0) - dino.headPivot.rotation.y) * Math.min(1, dt * .8);
    dino.eyeMat.emissiveIntensity = inNatur ? .5 + Math.sin(t * 3) * .2 : .15;
  }
  // blood
  if (S.bleed) {
    const b = S.bleed; b.t += dt; const power = Math.max(0, 1 - b.t / 8);
    const beat = Math.floor(b.t / .55); if (beat !== b.beat) { b.beat = beat; if (power > .08) { sfx.spurt(power); emitBlood(guard.neck.getWorldPosition(V3()), UP.clone().applyQuaternion(guard.body.getWorldQuaternion(tmpQ)), Math.round(60 * power), 3.5 * power + .8, .8); } }
    b.acc += 90 * power * dt; const n = Math.floor(b.acc); b.acc -= n;
    if (n) emitBlood(guard.neck.getWorldPosition(V3()), UP.clone().applyQuaternion(guard.body.getWorldQuaternion(tmpQ)), n, 1.8 * power + .4, .6);
  }
  if (S.drip > 0) { S.drip -= dt; if (Math.random() < .6) emitBlood(dino.mouth.getWorldPosition(V3()), V3(0, -1, 0), 1 + (Math.random() * 2 | 0), .4, .5); }
  if (S.pool) { S.pool = Math.min(1.6, S.pool + dt * .3); pool.scale.setScalar(S.pool); }
  updateBlood(dt);
  updateNuns(dt, t); updateScares(dt); updateDust(dt, t);
  if (S.jump) { S.jump.t -= dt; if (S.jump.t <= 0) { S.jump = null; jumpCanvas.style.display = 'none'; } else drawJump(S.jump.t); }
  speakT -= dt; updateDrips(dt); updatePortraits(dt);
  guard.beam.lookAt(guard.spot.target.getWorldPosition(tmpV));
  grainT -= dt; if (grainT < 0) { grainT = .07; updateGrain(); }
  for (const f of anims) f(dt, t);
  tvT -= dt; if (tvT < 0) { tvT = .06; updateTv(t); }
  // ambience
  if (S.started && !S.dead) { creakT -= dt; if (creakT < 0) { creakT = 7 + Math.random() * 9; sfx.creak(); } }
  hudT -= dt; if (hudT < 0 && S.started && !S.busy) { hudT = .5; $('timer').textContent = fmt((performance.now() - S.t0) / 1000); }
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
function openVault() {
  S.unlocked = true; sfx.unlock();
  const i = colliders.indexOf(lockCol); if (i >= 0) colliders.splice(i, 1);
  tween(2500, k => { lockDoor.position.y = DOOR_H * ease(k); });
}
setRoomHud('entre');
tick();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// small hooks for automated testing
window.__aurora = { S, guard, dino, nuns, faceTex, toggleFlash, cam(pos, look) { S.cine = true; cinePos.set(...pos); cineLook.set(...look); lookNow.set(...look); camera.position.set(...pos); }, teleport(k, x, z, yaw = 0) { const c = center(k); guard.p.position.set(c.x + x, 0, c.z + z); S.yaw = yaw; }, doom, stars, openVault };
})();
