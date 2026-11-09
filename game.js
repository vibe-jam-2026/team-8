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
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040306);
scene.fog = new THREE.FogExp2(0x040306, 0.065);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 120);
scene.add(new THREE.HemisphereLight(0x7880a8, 0x140f0c, 0.09));
for (const k in ROOMS) ROOMS[k].li *= .8;

// ---------- helpers ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
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
  return canvasTex(256, 256, (g, w, h) => {
    const R = rng(style.length * 7 + 3);
    if (style === 'tile') {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#a99d87' : '#cfc4ae'; g.fillRect(x * 128, y * 128, 128, 128); }
      g.strokeStyle = '#7f745f'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    } else if (style === 'wood') {
      for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(26,38%,${22 + R() * 12}%)`; g.fillRect(0, i * 32, 256, 32); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, i * 32, 256, 2); g.fillRect(R() * 256, i * 32, 2, 32); }
    } else if (style === 'concrete') {
      g.fillStyle = '#7a7a76'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { const v = R() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},.08)`; g.fillRect(R() * w, R() * h, 2, 2); }
    } else if (style === 'carpet') {
      g.fillStyle = '#3d1550'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b8892f'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(128, 10); g.lineTo(246, 128); g.lineTo(128, 246); g.lineTo(10, 128); g.closePath(); g.stroke();
    } else {
      const hue = style === 'sand' ? 38 : 235, sat = style === 'sand' ? 35 : 15, base = style === 'sand' ? 38 : 10;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) { const ox = (y % 2) * 42; g.fillStyle = `hsl(${hue},${sat}%,${base + R() * 8}%)`; g.fillRect(x * 85 + ox + 2, y * 64 + 2, 81, 60); }
    }
  }, [5, 4]);
}
const doorSignMat = {};
function buildRoom(k) {
  const r = ROOMS[k], { x: cx, z: cz } = center(k);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xffffff, { map: floorTex(r.floor), roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0x0d0b10));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H, cz); scene.add(ceil);
  const wm = mat(r.wall, { roughness: 0.9 }), trim = mat(new THREE.Color(r.wall).multiplyScalar(0.55));
  for (const side of ['n', 's', 'w', 'e']) {
    const nb = neighbor(k, side), linked = nb && isLinked(k, nb), horiz = side === 'n' || side === 's';
    const len = horiz ? W : D;
    const fixed = side === 'n' ? cz - D / 2 + T / 2 : side === 's' ? cz + D / 2 - T / 2 : side === 'w' ? cx - W / 2 + T / 2 : cx + W / 2 - T / 2;
    const mid = horiz ? cx : cz;
    const segs = linked ? [[mid - len / 2, mid - DOOR / 2], [mid + DOOR / 2, mid + len / 2]] : [[mid - len / 2, mid + len / 2]];
    for (const [a, b] of segs) {
      const L = b - a, c = (a + b) / 2;
      const m = horiz ? addMesh(scene, new THREE.BoxGeometry(L, H, T), wm, c, H / 2, fixed) : addMesh(scene, new THREE.BoxGeometry(T, H, L), wm, fixed, H / 2, c);
      wallMeshes.push(m);
      colliders.push(horiz ? { x: c, z: fixed, hw: L / 2, hd: T / 2 } : { x: fixed, z: c, hw: T / 2, hd: L / 2 });
      // dark skirting board
      if (horiz) addMesh(scene, new THREE.BoxGeometry(L, 0.9, T + 0.06), trim, c, 0.45, fixed); else addMesh(scene, new THREE.BoxGeometry(T + 0.06, 0.9, L), trim, fixed, 0.45, c);
    }
    if (linked) {
      const hh = H - DOOR_H;
      const m = horiz ? addMesh(scene, new THREE.BoxGeometry(DOOR, hh, T), wm, mid, DOOR_H + hh / 2, fixed) : addMesh(scene, new THREE.BoxGeometry(T, hh, DOOR), wm, fixed, DOOR_H + hh / 2, mid);
      wallMeshes.push(m);
      if (!doorSignMat[nb]) doorSignMat[nb] = new THREE.MeshBasicMaterial({ map: textTex(ROOMS[nb].name, 512, 96, '#15110d', '#e9c45e', 'bold 46px Georgia'), toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), doorSignMat[nb]);
      onWall(sign, k, side, 0, DOOR_H + 0.45, null, 0.01);
    }
  }
  // ceiling lamp + light
  addMesh(scene, new THREE.CylinderGeometry(0.5, 0.7, 0.25, 16), mat(0x111111, { emissive: r.light, emissiveIntensity: 0.6 }), cx, H - 0.15, cz);
  const L = new THREE.PointLight(r.light, r.li, 22, 1.6); L.position.set(cx, H - 0.6, cz); scene.add(L);
  r.lamp = L; r.flickerT = 0;
}
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

// ---------- the face: a T-rex head made from the photo ----------
// Regions in the 360x350 photo: [x, y, width, height]
const FACE = {
  eyeR: [106, 124, 76, 54],   // left in the photo, goes on the dinosaur's right side
  eyeL: [178, 126, 76, 54],
  nose: [138, 150, 70, 60],
  lip: [122, 194, 116, 32],
  beard: [108, 216, 144, 76],
  hair: [96, 6, 168, 60],
  skin: [116, 180, 18, 18],
};
const photoImg = new Image(), faceTex = {};
function photoCrop(name, [sx, sy, sw, sh], soft = .38, repeat) {
  const ow = 256, oh = Math.round(ow * sh / sw);
  const t = canvasTex(ow, oh, () => {}, repeat);
  t.userData.draw = () => {
    const g = t.userData.g; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, ow, oh);
    g.filter = 'contrast(1.4) saturate(1.15)'; g.drawImage(photoImg, sx, sy, sw, sh, 0, 0, ow, oh); g.filter = 'none';
    if (soft) { // fade the edges so the patch melts into the skin
      g.globalCompositeOperation = 'destination-in'; g.save(); g.translate(ow / 2, oh / 2); g.scale(1, oh / ow);
      const gr = g.createRadialGradient(0, 0, ow / 2 * (1 - soft), 0, 0, ow / 2); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(-ow / 2, -ow / 2, ow, ow); g.restore(); g.globalCompositeOperation = 'source-over';
    }
    t.needsUpdate = true;
  };
  faceTex[name] = t; return t;
}
photoCrop('eyeR', FACE.eyeR); photoCrop('eyeL', FACE.eyeL); photoCrop('nose', FACE.nose, .42);
photoCrop('lip', FACE.lip, .3); photoCrop('beard', FACE.beard, .32); photoCrop('hair', FACE.hair, 0, [3, 1]);
// Each head part is a sphere; its texture is an equirectangular skin map with the photo features painted in
// at the right longitude (phi) and latitude (theta), so they are lit exactly like the skin around them.
const PARTS = {
  cran: [{ f: 'eyeR', phi: Math.PI / 2 + .55, th: 1.3, pw: 1.3, tw: .95 }, { f: 'eyeL', phi: 3 * Math.PI / 2 - .55, th: 1.3, pw: 1.3, tw: .95 }],
  snout: [{ f: 'nose', phi: Math.PI, th: .85, pw: 1.25, tw: .95 }, { f: 'lip', phi: Math.PI, th: 1.95, pw: 1.9, tw: .62 }],
  jaw: [{ f: 'beard', phi: Math.PI, th: 1.7, pw: 1.9, tw: 1.1 }],
};
const partTex = {};
for (const k in PARTS) partTex[k] = canvasTex(1024, 512, (g, w, h) => { g.fillStyle = '#c49a86'; g.fillRect(0, 0, w, h); });
function paintHead() {
  const c = document.createElement('canvas'); c.width = c.height = 8; const cg = c.getContext('2d');
  const [sx, sy, sw, sh] = FACE.skin; cg.drawImage(photoImg, sx, sy, sw, sh, 0, 0, 8, 8);
  const d = cg.getImageData(0, 0, 8, 8).data; let r = 0, gr = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; r = r / n | 0; gr = gr / n | 0; b = b / n | 0;
  for (const k in PARTS) {
    const { g, canvas } = partTex[k].userData, w = canvas.width, h = canvas.height, R = rng(k.length * 31);
    g.fillStyle = `rgb(${r},${gr},${b})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < .5 ? '120,40,40' : '60,40,30'},${.03 + R() * .06})`; g.beginPath(); g.arc(R() * w, R() * h, 3 + R() * 22, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(70,40,90,.3)'; g.lineWidth = 2;
    for (let i = 0; i < 30; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let s = 0; s < 7; s++) { x += (R() - .5) * 90; y += (R() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
    if (k === 'cran') { // his hair: low at the back, receding toward the front
      g.save(); g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= w; x += 8) { const phi = x / w * Math.PI * 2, lim = .45 + 1.0 * (1 + Math.cos(phi)) / 2 + Math.sin(x * .09) * .04; g.lineTo(x, lim / Math.PI * h); }
      g.lineTo(w, 0); g.closePath(); g.clip();
      g.fillStyle = g.createPattern(faceTex.hair.userData.canvas, 'repeat'); g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(30,18,8,.5)'; g.lineWidth = 2; for (let i = 0; i < 160; i++) { const x = R() * w; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (R() - .5) * 30, h * .2, x + (R() - .5) * 20, h * (.2 + R() * .3)); g.stroke(); }
      g.restore();
    }
    for (const ft of PARTS[k]) { const src = faceTex[ft.f].userData.canvas, x = (ft.phi - ft.pw / 2) / (Math.PI * 2) * w, y = (ft.th - ft.tw / 2) / Math.PI * h; g.drawImage(src, x, y, ft.pw / (Math.PI * 2) * w, ft.tw / Math.PI * h); }
    partTex[k].needsUpdate = true;
  }
}
photoImg.onload = () => { for (const k in faceTex) faceTex[k].userData.draw(); paintHead(); };
photoImg.src = window.DINO_PHOTO || 'assets/dino-head.jpg';
function buildFaceHead(flesh, toothM) {
  const skinOf = k => mat(0xffffff, { map: partTex[k], roughness: .42, emissiveMap: partTex[k], emissive: 0xffffff, emissiveIntensity: .08 });
  const gum = mat(0x4a0610, { roughness: .3 });
  dino.skinMat = mat(0xffffff, { map: partTex.snout, roughness: .42 });
  const ball = (parent, k, x, y, z, sx, sy, sz) => { const b = new THREE.Group(); b.position.set(x, y, z); b.scale.set(sx, sy, sz); parent.add(b); addMesh(b, new THREE.SphereGeometry(.5, 48, 32), skinOf(k), 0, 0, 0); return b; };
  // skull with his eyes on the sides and his hair on top
  ball(flesh, 'cran', .3, .28, 0, 1.05, .9, .92);
  const strand = mat(0x3a2616, { roughness: .9 });
  for (let i = 0; i < 16; i++) { const zz = (i / 15 - .5) * .8, len = .35 + Math.random() * .5; const s = addMesh(flesh, new THREE.CylinderGeometry(.018, .008, len, 5), strand, -.12 + Math.random() * .12, .3 - len / 2, zz); s.rotation.z = -.15 + Math.random() * .3; s.rotation.x = zz * .6; }
  for (const s of [-1, 1]) addMesh(flesh, new THREE.SphereGeometry(.12, 12, 8), skinOf('cran'), .62, .52, .2 * s).scale.set(1.4, .5, .8); // brow ridges
  // snout with his nose on top and his mustache along the upper lip
  ball(flesh, 'snout', 1.02, .1, 0, 1.05, .52, .66);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const a = i / 8; addMesh(flesh, new THREE.ConeGeometry(.035 + .015 * (1 - a), .2, 6), toothM, .58 + a * .88, -.16, s * (.3 - a * .14)).rotation.x = Math.PI; }
  addMesh(flesh, new THREE.BoxGeometry(1.0, .06, .48), gum, 1.0, -.1, 0);
  // lower jaw with his beard
  const fjaw = new THREE.Group(); fjaw.position.set(.2, -.12, 0); flesh.add(fjaw); dino.fjaw = fjaw;
  ball(fjaw, 'jaw', .78, -.1, 0, 1.0, .3, .6);
  addMesh(fjaw, new THREE.BoxGeometry(.95, .05, .46), gum, .78, -.01, 0);
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { const a = i / 7; addMesh(fjaw, new THREE.ConeGeometry(.03 + .012 * (1 - a), .17, 6), toothM, .38 + a * .8, .06, s * (.27 - a * .11)); }
  dino.mouth = new THREE.Object3D(); dino.mouth.position.set(1.05, -.22, 0); flesh.add(dino.mouth);
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

// ---------- museum contents ----------
(function furnish() {
  // Entréhallen
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, .72), new THREE.MeshBasicMaterial({ map: textTex('MUSEUM AURORA', 1024, 132, '#1b1410', '#e9c45e', 'bold 84px Georgia') }));
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
  const uni = mat(0x1f2a44), pants = mat(0x161a24), skin = mat(0xe0b08a), shoe = mat(0x0d0d0f);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(.13 * s, .95, 0); body.add(leg);
    addMesh(leg, new THREE.BoxGeometry(.2, .88, .22), pants, 0, -.44, 0); addMesh(leg, new THREE.BoxGeometry(.22, .12, .34), shoe, 0, -.89, .05);
    guard[s < 0 ? 'legL' : 'legR'] = leg;
    const arm = new THREE.Group(); arm.position.set(.37 * s, 1.58, 0); body.add(arm);
    addMesh(arm, new THREE.BoxGeometry(.16, .62, .18), uni, 0, -.3, 0); addMesh(arm, new THREE.SphereGeometry(.08, 8, 6), skin, 0, -.66, 0);
    guard[s < 0 ? 'armL' : 'armR'] = arm;
  }
  addMesh(body, new THREE.BoxGeometry(.56, .7, .32), uni, 0, 1.3, 0);
  addMesh(body, new THREE.BoxGeometry(.58, .08, .34), M.black, 0, .97, 0);
  addMesh(body, new THREE.BoxGeometry(.1, .1, .02), M.gold, -.14, 1.5, .17);
  addMesh(guard.armR, new THREE.CylinderGeometry(.045, .055, .3, 10), M.black, 0, -.68, .12).rotation.x = Math.PI / 2;
  guard.stump = addMesh(body, new THREE.CylinderGeometry(.085, .1, .07, 12), mat(0x6a0000, { roughness: .3 }), 0, 1.69, 0); guard.stump.visible = false;
  const head = new THREE.Group(); head.position.y = 1.66; body.add(head); guard.head = head;
  addMesh(head, new THREE.CylinderGeometry(.08, .09, .12, 10), skin, 0, .06, 0);
  guard.headStump = addMesh(head, new THREE.CylinderGeometry(.09, .09, .02, 12), mat(0x6a0000, { roughness: .3 }), 0, -.005, 0); guard.headStump.visible = false;
  addMesh(head, new THREE.SphereGeometry(.19, 16, 12), skin, 0, .27, 0);
  addMesh(head, new THREE.CylinderGeometry(.2, .2, .1, 16), uni, 0, .44, 0);
  addMesh(head, new THREE.BoxGeometry(.3, .03, .16), uni, 0, .4, .15);
  for (const s of [-1, 1]) addMesh(head, new THREE.SphereGeometry(.025, 6, 4), M.black, .07 * s, .3, .17);
  guard.neck = new THREE.Object3D(); guard.neck.position.y = 1.7; body.add(guard.neck);
  // flashlight
  const spot = new THREE.SpotLight(0xfff2d0, 2.2, 22, .43, .5, 1.2);
  spot.position.set(.37, 1.05, .25); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.002; spot.shadow.camera.near = .2;
  spot.target.position.set(.3, .3, 6); body.add(spot, spot.target); guard.spot = spot;
  const c = center('entre'); p.position.set(c.x, 0, c.z + 5);
})();

// alarm light in Naturhistoria
const alarmLight = new THREE.PointLight(0xff1010, 0, 24, 1.4); { const c = center('natur'); alarmLight.position.set(c.x, H - .4, c.z); scene.add(alarmLight); }

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
let ac = null, master = null, nbuf = null, alarmNodes = null, screamNodes = null;
function A() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = S.sound ? 1 : 0; const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume(); return ac;
}
function noiseBuffer() { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
function envGain(t, a, peak, d) { const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); return g; }
function tone(type, f0, f1, t, a, peak, d, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d); const g = envGain(t, a, peak, d); o.connect(g).connect(dest || master); o.start(t); o.stop(t + a + d + .05); return o; }
function hiss(t, a, peak, d, type, f0, f1, Q, dest) { const s = ac.createBufferSource(); s.buffer = noiseBuffer(); s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d); f.Q.value = Q || 1; const g = envGain(t, a, peak, d); s.connect(f).connect(g).connect(dest || master); s.start(t, Math.random() * 1.5); s.stop(t + a + d + .05); return s; }
function shaper(k) { const ws = ac.createWaveShaper(), n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } ws.curve = c; return ws; }
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
  nunScream() { if (!A()) return; const t = ac.currentTime, ws = shaper(90), hp = ac.createBiquadFilter(), g = envGain(t, .012, 1.2, 1.35);
    hp.type = 'highpass'; hp.frequency.value = 450; ws.connect(hp).connect(g).connect(master);
    for (const f of [1150, 1390, 1720, 2210, 2870]) { const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * .75, t); o.frequency.exponentialRampToValueAtTime(f * 1.2, t + .22); o.frequency.exponentialRampToValueAtTime(f * .85, t + 1.4);
      l.frequency.value = 15 + Math.random() * 12; lg.gain.value = f * .07; l.connect(lg).connect(o.frequency); o.connect(ws); o.start(t); l.start(t); o.stop(t + 1.5); l.stop(t + 1.5); }
    hiss(t, .008, .7, 1.25, 'bandpass', 3200, 1800, 1.4, ws); tone('sine', 80, 32, t, .005, 1, .7); },
  distantScream() { if (!A()) return; const t = ac.currentTime, lp = ac.createBiquadFilter(), g = envGain(t, .2, .12, 1.6); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g).connect(master);
    for (const f of [700, 930]) tone('sawtooth', f, f * 1.25, t, .2, .5, 1.5, lp); },
  whisper(v) { if (!A()) return; const t = ac.currentTime; for (let i = 0; i < 7; i++) hiss(t + i * .11 + Math.random() * .05, .02, .07 * v, .09, 'bandpass', 1700 + Math.random() * 2800, 0, 7); },
  heartbeat(v) { if (!A()) return; const t = ac.currentTime; tone('sine', 55, 38, t, .01, .55 * v, .14); tone('sine', 50, 36, t + .2, .01, .4 * v, .14); },
  lightsOut() { if (!A()) return; const t = ac.currentTime; tone('square', 90, 60, t, .002, .25, .06); tone('sawtooth', 120, 50, t, .01, .1, .8); hiss(t, .005, .2, .3, 'lowpass', 300, 0, 1); },
  sting() { if (!A()) return; const t = ac.currentTime, ws = shaper(20), g = envGain(t, .01, .45, 1.6); ws.connect(g).connect(master);
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
$('soundBtn').onclick = () => { S.sound = !S.sound; $('soundBtn').textContent = S.sound ? 'Ljud på' : 'Ljud av'; $('soundBtn').setAttribute('aria-pressed', S.sound); if (master) master.gain.value = S.sound ? 1 : 0; };
function setRoomHud(k) { $('roomName').textContent = ROOMS[k].name; $('roomSub').textContent = ROOMS[k].sub; }
function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function start() {
  $('intro').hidden = true; S.started = true; S.t0 = performance.now(); A(); sfx.drone();
  subtitle('Nattskiftet börjar. Hitta sex guldstjärnor.', 3000);
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
const camTarget = V3(), ray = new THREE.Raycaster(), cineLook = V3(), cinePos = V3(), lookNow = V3();
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
  S.phase = 'alarm'; S.alarm = true; sfx.alarmStart(); setCine('wide'); subtitle('Det stod KLICKA INTE.', 1800);
  await wait(1300);
  // the skull becomes a face
  await tween(250, k => dino.skull.scale.setScalar(Math.max(.01, 1 - k)));
  S.phase = 'face'; dino.skull.visible = false; dino.flesh.visible = true; dino.neck.material = dino.skinMat; sfx.roar(); dino.eyeMat.emissiveIntensity = 2;
  await tween(450, k => dino.flesh.scale.setScalar(Math.max(.01, back(k))));
  await tween(400, k => { dino.fjaw.rotation.z = -.35 * Math.sin(k * Math.PI); });
  await wait(500);
  // lunge
  const headW = guard.head.localToWorld(V3(0, .27, 0)), target = dino.g.worldToLocal(headW.clone()), start = dino.headPivot.position.clone();
  const dx = target.x - start.x, dy = target.y - start.y, dz = target.z - start.z, hd = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx), pitch = Math.atan2(dy, hd);
  const aim = target.clone().sub(V3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw)).multiplyScalar(1.02)); aim.y += .22;
  const r0 = dino.headPivot.rotation.clone();
  S.phase = 'lunge'; setCine('close'); sfx.scream();
  await tween(330, k => {
    const e = ease(k); dino.headPivot.position.lerpVectors(start, aim, e);
    dino.headPivot.rotation.set(0, r0.y + (yaw - r0.y) * e, r0.z + (pitch - r0.z) * e); dino.fjaw.rotation.z = -1 * Math.min(1, k * 2); updateNeck();
  });
  // CHOMP
  S.phase = 'bite'; dino.fjaw.rotation.z = -.08; sfx.screamCut(); sfx.crunch(1.2);
  dino.headPivot.attach(guard.head); guard.stump.visible = true; guard.headStump.visible = true;
  // the head hangs out of the front of the jaws
  guard.head.position.set(1.2, -.62, .05); guard.head.rotation.set(.4, -1.2, 2.3); dino.fjaw.rotation.z = -.32;
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
const nunBlack = mat(0x0a090c, { roughness: .95 }), nunWhite = mat(0xd8d4c8, { roughness: .9 }), nunSkin = mat(0xa9a596, { roughness: .7 }), voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
function buildNun() {
  const g = new THREE.Group(); scene.add(g);
  const body = new THREE.Group(); g.add(body);
  addMesh(body, new THREE.CylinderGeometry(.13, .33, .8, 14), nunBlack, 0, .4, 0);
  addMesh(body, new THREE.SphereGeometry(.17, 12, 8), nunBlack, 0, .8, 0).scale.set(1.25, .6, 1);
  addMesh(body, new THREE.CylinderGeometry(.16, .2, .06, 14), nunWhite, 0, .86, 0);
  const hands = addMesh(body, new THREE.BoxGeometry(.07, .15, .05), nunSkin, 0, .64, .19); hands.rotation.x = -.3;
  for (const s of [-1, 1]) { const f = addMesh(body, new THREE.CylinderGeometry(.006, .004, .12, 4), nunSkin, .025 * s, .76, .2); f.rotation.x = -.3; }
  const head = new THREE.Group(); head.position.y = .9; body.add(head);
  addMesh(head, new THREE.SphereGeometry(.16, 14, 10), nunBlack, 0, .14, -.03).scale.set(1.05, 1.15, 1.1);
  addMesh(head, new THREE.ConeGeometry(.18, .5, 12), nunBlack, 0, -.08, -.1).rotation.x = .25;
  addMesh(head, new THREE.TorusGeometry(.105, .03, 8, 20), nunWhite, 0, .12, .07);
  addMesh(head, new THREE.SphereGeometry(.1, 14, 10), nunSkin, 0, .12, .07).scale.set(.9, 1.15, .7);
  for (const s of [-1, 1]) addMesh(head, new THREE.SphereGeometry(.026, 8, 6), voidMat, .036 * s, .15, .13).scale.set(1, 1.3, .6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x801010 });
  for (const s of [-1, 1]) addMesh(head, new THREE.SphereGeometry(.007, 6, 4), eyeMat, .036 * s, .15, .148);
  const mouth = addMesh(head, new THREE.SphereGeometry(.028, 8, 6), voidMat, 0, .065, .13); mouth.scale.set(.8, 1.7, .5);
  return { g, body, head, mouth, eyeMat };
}
function randomPoint(k) { const c = center(k); for (let i = 0; i < 30; i++) { const x = c.x + (Math.random() - .5) * 15, z = c.z + (Math.random() - .5) * 11; if (!blocked(x, z, .4)) return V3(x, 0, z); } return V3(c.x, 0, c.z); }
function doorPoint(k, nb) { const c = center(k); for (const side of ['n', 's', 'w', 'e']) if (neighbor(k, side) === nb) { const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side]; return V3(c.x + d[0] * (W / 2 - 1.3), 0, c.z + d[1] * (D / 2 - 1.3)); } return randomPoint(k); }
['entre', 'entre', 'konst', 'konst', 'modern', 'natur', 'mineral', 'mineral', 'egypt'].forEach(k => {
  const n = buildNun(); let p;
  do { p = randomPoint(k); } while (k === 'entre' && p.distanceTo(guard.p.position) < 7);
  n.g.position.copy(p); n.g.rotation.y = Math.random() * 6; n.room = k;
  Object.assign(n, { path: [], wait: Math.random() * 3, speed: .45 + Math.random() * .3, phase: Math.random() * 10, twitch: 0, tilt: 0, cd: 0, scream: 0, pause: 0, whisperT: 0 });
  nuns.push(n);
});
function faceTo(n, target, k) { const want = Math.atan2(target.x - n.g.position.x, target.z - n.g.position.z); n.g.rotation.y += wrap(want - n.g.rotation.y) * Math.min(1, k); }
function updateNuns(dt, t) {
  const pp = guard.p.position; let nearest = 99;
  for (const n of nuns) {
    const p = n.g.position, d = Math.hypot(p.x - pp.x, p.z - pp.z);
    n.room = roomAt(p.x, p.z) || n.room; n.cd -= dt;
    if (n.room === S.room) nearest = Math.min(nearest, d);
    if (n.scream > 0) { // screaming: shaking, mouth wide open, eyes burning
      n.scream -= dt; n.head.rotation.x = Math.sin(t * 61) * .3; n.head.rotation.z = Math.sin(t * 47) * .35;
      n.mouth.scale.set(1.5, 4.2, .6); n.body.position.y = .1 + Math.sin(t * 53) * .04; n.eyeMat.color.setHex(0xff5050); faceTo(n, pp, dt * 20);
      if (n.scream <= 0) { n.mouth.scale.set(.8, 1.7, .5); n.body.position.y = 0; n.head.rotation.x = 0; }
      continue;
    }
    const sameRoom = n.room === S.room, chase = S.started && !S.busy && sameRoom && d < 6.5;
    let target = null, speed = 0;
    if (chase) {
      n.path = [];
      if (n.pause > 0) n.pause -= dt; else if (Math.random() < dt * .4) n.pause = .4 + Math.random() * 1.3; // stop and stare, then come again
      if (n.pause <= 0) { target = pp; speed = 1.1; }
    } else if (S.started && !S.dead && !S.won) {
      if (!n.path.length) {
        if (Math.random() < .35) { const opts = LINKS.filter(l => l.includes(n.room)).map(l => l[0] === n.room ? l[1] : l[0]).filter(r => r !== 'skatt'); const nb = opts[Math.floor(Math.random() * opts.length)]; n.path = [doorPoint(n.room, nb), doorPoint(nb, n.room), randomPoint(nb)]; }
        else n.path = [randomPoint(n.room)];
        n.wait = Math.random() * 3;
      }
      if (n.wait > 0) n.wait -= dt; else { target = n.path[0]; speed = n.speed; if (Math.hypot(target.x - p.x, target.z - p.z) < .3) n.path.shift(); }
    }
    if (target && speed) {
      const dx = target.x - p.x, dz = target.z - p.z, l = Math.hypot(dx, dz);
      if (l > .05) { const st = Math.min(l, speed * dt), nx = p.x + dx / l * st, nz = p.z + dz / l * st;
        if (chase) { // steer around furniture: try straight ahead, then wider and wider angles
          const stuck = blocked(p.x, p.z, .25), base = Math.atan2(dx, dz);
          for (const off of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8]) { const ang = base + off, tx = p.x + Math.sin(ang) * st, tz = p.z + Math.cos(ang) * st; if (stuck || !blocked(tx, tz, .25)) { p.x = tx; p.z = tz; break; } }
        } else { p.x = nx; p.z = nz; }
        faceTo(n, target, dt * 4); }
    }
    // gliding, swaying, twitching heads that turn toward you
    n.body.rotation.z = Math.sin(t * 1.3 + n.phase) * .05; n.g.position.y = speed ? Math.abs(Math.sin(t * 3 + n.phase)) * .03 : 0;
    n.twitch -= dt; if (n.twitch < 0) { n.twitch = 1.2 + Math.random() * 4; n.tilt = (Math.random() - .5) * 1.4; }
    const look = (sameRoom && d < 9) || S.dead ? wrap(Math.atan2(pp.x - p.x, pp.z - p.z) - n.g.rotation.y) : 0;
    n.head.rotation.y += (Math.max(-1.6, Math.min(1.6, look)) - n.head.rotation.y) * Math.min(1, dt * 5);
    n.head.rotation.z += (n.tilt - n.head.rotation.z) * Math.min(1, dt * 16);
    n.eyeMat.color.setHex(sameRoom && d < 5 ? 0xff1818 : 0x701010);
    if (sameRoom && d < 4.5 && !S.dead) { n.whisperT -= dt; if (n.whisperT < 0) { n.whisperT = 1.5 + Math.random() * 3; sfx.whisper(1 - d / 5); } }
    if (S.started && !S.busy && d < .72 && n.cd <= 0) nunScream(n);
  }
  S.nearestNun = nearest;
}
function nunScream(n) {
  n.scream = 1.3; n.cd = 3.5; sfx.nunScream(); S.shake = 1.3;
  const el = $('scare'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  const pp = guard.p.position, dx = pp.x - n.g.position.x, dz = pp.z - n.g.position.z, l = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 10; i++) { const nx = pp.x + dx / l * .14, nz = pp.z + dz / l * .14; if (!blocked(nx, pp.z)) pp.x = nx; if (!blocked(pp.x, nz)) pp.z = nz; }
}
// When the lights come back, one of them is standing right behind you
function sneakNun() {
  const pp = guard.p.position, bx = pp.x + Math.sin(S.yaw) * 2.6, bz = pp.z + Math.cos(S.yaw) * 2.6;
  if (blocked(bx, bz, .4) || roomAt(bx, bz) !== S.room) return;
  let best = null, bd = 1e9; for (const n of nuns) { const d = n.g.position.distanceTo(pp); if (n.scream <= 0 && d < bd && d > 4) { bd = d; best = n; } }
  if (!best) return; best.g.position.set(bx, 0, bz); best.path = []; best.pause = 1.2; faceTo(best, pp, 1); best.cd = 0;
}
const grain = $('grain'), grainG = grain.getContext('2d'), grainImg = grainG.createImageData(grain.width, grain.height);
function updateGrain() { const d = grainImg.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } grainG.putImageData(grainImg, 0, 0); }
let blackT = 25 + Math.random() * 15, beatT = 0, farT = 35, grainT = 0;
function updateScares(dt) {
  if (!S.started || S.dead || S.won) return;
  // the lights in your room go out for a few seconds
  blackT -= dt;
  if (blackT < 0 && !S.blackout && !S.busy) { S.blackout = { room: S.room, t: 3 + Math.random() * 2.5 }; blackT = 35 + Math.random() * 35; sfx.lightsOut(); subtitle('…', 1500); }
  if (S.blackout) { S.blackout.t -= dt; if (S.blackout.t <= 0) { S.blackout = null; sneakNun(); sfx.sting(); } }
  // the flashlight stutters when something is close, or in the dark
  const near = S.nearestNun || 99;
  guard.spot.intensity = (near < 3 || S.blackout) && Math.random() < .12 ? .15 : 2.2;
  // heartbeat speeds up as a nun gets closer
  if (near < 6) { beatT -= dt; if (beatT < 0) { beatT = .35 + (near / 6) * .75; sfx.heartbeat(1 - near / 7); } }
  farT -= dt; if (farT < 0) { farT = 40 + Math.random() * 40; sfx.distantScream(); }
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
  updateNuns(dt, t); updateScares(dt);
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
window.__aurora = { S, guard, dino, nuns, faceTex, cam(pos, look) { S.cine = true; cinePos.set(...pos); cineLook.set(...look); lookNow.set(...look); camera.position.set(...pos); }, teleport(k, x, z, yaw = 0) { const c = center(k); guard.p.position.set(c.x + x, 0, c.z + z); S.yaw = yaw; }, doom, stars, openVault };
})();
