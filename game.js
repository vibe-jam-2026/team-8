// Museum Aurora 3D: a third-person night-guard game.
import * as THREE from './vendor/three.module.min.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const ease = k => 1 - Math.pow(1 - k, 3);
const backOut = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
let TS = 1; // time scale for cutscenes (tests can slow it down)
const wait = ms => new Promise(r => setTimeout(r, ms * TS));
function tween(ms, fn){ ms *= TS; return new Promise(res => { const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }); }

// ---------------------------------------------------------------- world layout
const CELL = 14, H = 7, WH = 4.6, DW = 2.4, DH = 3.1;
const ROOMS = {
  entre:  {name:'Entréhallen',     sub:'Bottenvåningen',        col:1,row:2, wall:'#e8dcc4', wains:'#d3c4a6', trim:'#8f7e60', floor:['tile','#ddd5c7','#a59b8d'], light:'#fff0d8', li:70},
  konst:  {name:'Konstgalleriet',  sub:'Sal 2 · Måleri',        col:2,row:2, wall:'#7a2e38', wains:'#5f222b', trim:'#3f161c', floor:['wood','#8a5a36'],           light:'#ffe2c0', li:75},
  modern: {name:'Moderna salen',   sub:'Sal 3 · Samtidskonst',  col:3,row:2, wall:'#f2f0ec', wains:null,      trim:'#c9c4ba', floor:['concrete','#9a9a96'],       light:'#ffffff', li:60},
  natur:  {name:'Naturhistoria',   sub:'Sal 4 · Paleontologi',  col:0,row:2, wall:'#405b4b', wains:'#33493c', trim:'#22332a', floor:['wood','#7a5b3e'],           light:'#fff0d0', li:80},
  mineral:{name:'Mineralrummet',   sub:'Sal 5 · Geologi',       col:0,row:1, wall:'#20233f', wains:null,      trim:'#121428', floor:['stone','#2a2c44'],          light:'#8090ff', li:20},
  egypt:  {name:'Egyptiska salen', sub:'Sal 6 · Antiken',       col:1,row:1, wall:'#d6b674', wains:'#c4a25e', trim:'#8f6f32', floor:['stone','#b59a6e'],          light:'#ffdca0', li:70},
  skatt:  {name:'Skattkammaren',   sub:'Valvet',                col:1,row:0, wall:'#2c1d3e', wains:'#24182f', trim:'#1a1026', floor:['carpet','#3a2448'],         light:'#ffd27a', li:28},
};
for (const [k, r] of Object.entries(ROOMS)) { r.key = k; r.c = {x: r.col * CELL, z: r.row * CELL}; }
const OPP = {n:'s', s:'n', w:'e', e:'w'};
const LINKS = [['entre','w','natur'],['entre','e','konst'],['entre','n','egypt'],['konst','e','modern'],['natur','n','mineral'],['egypt','n','skatt',true]];
const DOORS = {};
LINKS.forEach(([a, s, b, v]) => { DOORS[a+':'+s] = {to:b, vault:!!v}; DOORS[b+':'+OPP[s]] = {to:a, vault:!!v}; });
const roomAt = (x, z) => { const col = Math.round(x / CELL), row = Math.round(z / CELL); return Object.values(ROOMS).find(r => r.col === col && r.row === row); };
const ROT = {n:0, s:Math.PI, w:Math.PI/2, e:-Math.PI/2};

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#07060b');
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 120);
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight('#fff6e8', '#2a2430', 0.45));

// ---------------------------------------------------------------- helpers
const matCache = {};
function M(color, o = {}){ const k = color + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({color, roughness:.85, metalness:0, ...o})); }
const GOLD = new THREE.MeshStandardMaterial({color:'#e8b73c', metalness:.85, roughness:.3, emissive:'#3a2600', emissiveIntensity:.4});
const BONE = new THREE.MeshStandardMaterial({color:'#efe5cf', roughness:.7});
function box(w, h, d, mat){ return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function add(o, x, y, z, parent = scene){ o.position.set(x, y, z); parent.add(o); return o; }
function cyl(rt, rb, h, mat, seg = 20){ return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); }
function sph(r, mat, ws = 20, hs = 14){ return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); }
const UP = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, mat){ // cylinder between two points
  const d = new THREE.Vector3().subVectors(b, a), m = cyl(r, r, 1, mat, 10);
  m.scale.y = d.length(); m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m;
}
const solids = [];
function solid(x, z, w, d){ const s = {minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2}; solids.push(s); return s; }
const camBlockers = [];
const interactables = [];
function interact(o){ interactables.push(Object.assign({r:2.2}, o)); }

// textures
let pending = 0, loaded = 0;
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function svgTex(inner, w, h){
  const img = new Image(), t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; pending++;
  img.onload = () => { t.needsUpdate = true; loaded++; progress(); };
  img.onerror = () => { loaded++; progress(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="vig"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient></defs>${inner}</svg>`);
  return t;
}
function textTex(text, {w = 512, h = 112, bg = '#1d1a24', fg = '#f2e8d4', font = '600 52px system-ui, sans-serif', border = null} = {}){
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border){ g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  });
}
function plane(w, h, map, basic = false){
  const mat = basic ? new THREE.MeshBasicMaterial({map}) : new THREE.MeshStandardMaterial({map, roughness:.8});
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
function onWall(obj, r, side, along, y, inset = .02){
  const d = H - .2 - inset, {x, z} = r.c;
  if (side === 'n') obj.position.set(x + along, y, z - d);
  if (side === 's') obj.position.set(x + along, y, z + d);
  if (side === 'w') obj.position.set(x - d, y, z + along);
  if (side === 'e') obj.position.set(x + d, y, z + along);
  obj.rotation.y = ROT[side]; scene.add(obj); return obj;
}
function inFront(r, side, along, dist){
  const {x, z} = r.c, d = H - .2 - dist;
  return side === 'n' ? {x:x+along, z:z-d} : side === 's' ? {x:x+along, z:z+d} : side === 'w' ? {x:x-d, z:z+along} : {x:x+d, z:z+along};
}

// ---------------------------------------------------------------- 2D art (svg)
function art(kind, w, h, seed){
  const R = rng(seed);
  switch (kind){
    case 'landscape': return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a65a"/><stop offset="1" stop-color="#f8e2ad"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#sky)"/><circle cx="${w*.68}" cy="${h*.38}" r="${h*.11}" fill="#fff4d6"/>
      <path d="M0 ${h*.64} Q ${w*.3} ${h*.44} ${w*.55} ${h*.6} T ${w} ${h*.55} V ${h} H 0Z" fill="#7d9a62"/>
      <path d="M0 ${h*.74} Q ${w*.5} ${h*.66} ${w} ${h*.76} V ${h} H 0Z" fill="#5b8fa8"/>
      <path d="M0 ${h*.86} Q ${w*.4} ${h*.78} ${w} ${h*.9} V ${h} H 0Z" fill="#46663f"/>
      <path d="M${w*.2} ${h*.86} v-${h*.2}" stroke="#2f3b25" stroke-width="6"/><circle cx="${w*.2}" cy="${h*.64}" r="${w*.08}" fill="#3e5a34"/>`;
    case 'portrait': return `<rect width="${w}" height="${h}" fill="#2f3d36"/><rect width="${w}" height="${h}" fill="url(#vig)" opacity=".6"/>
      <path d="M${w*.12} ${h} Q ${w*.5} ${h*.58} ${w*.88} ${h}Z" fill="#6a2c35"/><path d="M${w*.42} ${h*.62} h${w*.16} v${h*.1} h-${w*.16}Z" fill="#e2b892"/>
      <ellipse cx="${w*.5}" cy="${h*.45}" rx="${w*.17}" ry="${h*.17}" fill="#efc9a2"/>
      <path d="M${w*.32} ${h*.45} Q ${w*.3} ${h*.2} ${w*.5} ${h*.22} Q ${w*.72} ${h*.2} ${w*.68} ${h*.46} Q ${w*.66} ${h*.3} ${w*.5} ${h*.31} Q ${w*.36} ${h*.3} ${w*.32} ${h*.45}Z" fill="#3a2418"/>
      <circle cx="${w*.44}" cy="${h*.45}" r="4" fill="#2a1d14"/><circle cx="${w*.56}" cy="${h*.45}" r="4" fill="#2a1d14"/>
      <path d="M${w*.45} ${h*.54} Q ${w*.5} ${h*.565} ${w*.55} ${h*.54}" stroke="#a5604f" stroke-width="3" fill="none"/><circle cx="${w*.5}" cy="${h*.7}" r="${w*.03}" fill="#f2d27a"/>`;
    case 'sea': { let waves = '';
      for (let i = 0; i < 6; i++){ const y = h*.55 + i*h*.08; waves += `<path d="M0 ${y} q ${w/8} -10 ${w/4} 0 t ${w/4} 0 t ${w/4} 0 t ${w/4} 0" stroke="#e8f1f5" stroke-opacity="${.25+i*.08}" stroke-width="3" fill="none"/>`; }
      return `<rect width="${w}" height="${h*.55}" fill="#9bb7c9"/><rect y="${h*.55}" width="${w}" height="${h*.45}" fill="#2f5b78"/>
      <path d="M0 ${h*.3} q ${w*.25} -${h*.12} ${w*.5} 0 t ${w*.5} 0" fill="#c9d8e2" opacity=".7"/>${waves}
      <path d="M${w*.38} ${h*.6} h${w*.3} l-${w*.05} ${h*.06} h-${w*.2}Z" fill="#5a3a26"/>
      <path d="M${w*.52} ${h*.6} V ${h*.3} L ${w*.68} ${h*.56}Z" fill="#f4efe3"/><path d="M${w*.5} ${h*.58} V ${h*.36} L ${w*.4} ${h*.56}Z" fill="#e6dccb"/>`; }
    case 'abstract': { const pal = ['#e4572e','#f3a712','#29335c','#a8c686','#efe9df','#db2b39','#3c91e6'];
      let s = `<rect width="${w}" height="${h}" fill="#efe6d4"/>`;
      for (let i = 0; i < 9; i++){ const c = pal[Math.floor(R()*pal.length)];
        if (R() < .5) s += `<rect x="${R()*w*.8}" y="${R()*h*.8}" width="${w*(.15+R()*.4)}" height="${h*(.08+R()*.3)}" fill="${c}" opacity=".9"/>`;
        else s += `<circle cx="${R()*w}" cy="${R()*h}" r="${w*(.06+R()*.18)}" fill="${c}" opacity=".85"/>`; }
      return s + `<path d="M0 ${h*.7} L ${w} ${h*.3}" stroke="#1b1b1b" stroke-width="8"/><path d="M${w*.3} 0 V ${h}" stroke="#1b1b1b" stroke-width="6"/>`; }
    case 'blank': return `<rect width="${w}" height="${h}" fill="#fbfaf6"/>`;
  }
  return '';
}
function glyphSvg(cols, rows, seed){
  const g = [
    (a,b)=>`<ellipse cx="${a+12}" cy="${b+10}" rx="11" ry="6" fill="none" stroke="#5a3d16" stroke-width="2.5"/><circle cx="${a+12}" cy="${b+10}" r="3" fill="#5a3d16"/><path d="M${a+8} ${b+16} l-2 8 l6 -4" stroke="#5a3d16" stroke-width="2" fill="none"/>`,
    (a,b)=>`<path d="M${a+4} ${b+22} q 2 -14 10 -14 q 2 -8 8 -6 l -4 4 q 6 6 0 16 l 4 0" stroke="#5a3d16" stroke-width="2.5" fill="none"/>`,
    (a,b)=>`<ellipse cx="${a+12}" cy="${b+6}" rx="5" ry="6" fill="none" stroke="#5a3d16" stroke-width="2.5"/><path d="M${a+12} ${b+12} v14 M${a+4} ${b+15} h16" stroke="#5a3d16" stroke-width="2.5"/>`,
    (a,b)=>`<path d="M${a+2} ${b+20} q 10 -18 20 0" stroke="#5a3d16" stroke-width="2.5" fill="none"/><circle cx="${a+12}" cy="${b+6}" r="4" fill="#5a3d16"/>`,
    (a,b)=>`<path d="M${a+2} ${b+4} l 4 0 l 4 18 l 4 -18 l 4 0 l 4 18" stroke="#5a3d16" stroke-width="2.5" fill="none"/>`,
    (a,b)=>`<path d="M${a+4} ${b+24} h16 v-6 h-16 Z M${a+8} ${b+18} v-14 h8 v14" stroke="#5a3d16" stroke-width="2.5" fill="none"/>`];
  const R = rng(seed); const W = cols*30+18, Hh = rows*34+20; let s = `<rect width="${W}" height="${Hh}" fill="#e3c88d"/><rect x="2" y="2" width="${W-4}" height="${Hh-4}" fill="none" stroke="#b08b4a" stroke-width="4"/>`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += g[Math.floor(R()*g.length)](12+c*30, 14+r*34);
  return {svg:s, w:W, h:Hh};
}

// ---------------------------------------------------------------- floors
function floorTex([style, a, b]){
  const R = rng(style.length * 7 + 3);
  if (style === 'tile') return canvasTex(256, 256, (g) => { g.fillStyle = a; g.fillRect(0,0,256,256); g.fillStyle = b; g.fillRect(0,0,128,128); g.fillRect(128,128,128,128); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(0,0,128,128); g.strokeRect(128,128,128,128); g.strokeRect(128,0,128,128); g.strokeRect(0,128,128,128); }, [7, 7]);
  if (style === 'wood') return canvasTex(512, 512, (g) => {
    g.fillStyle = a; g.fillRect(0,0,512,512);
    for (let y = 0; y < 512; y += 32){ let x = -R()*200; while (x < 512){ const len = 120 + R()*200; g.fillStyle = `rgba(${R()<.5?'0,0,0':'255,230,200'},${.04+R()*.08})`; g.fillRect(x, y, len, 32); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y, 2, 32); x += len; } g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, y, 512, 2); }
  }, [3.5, 3.5]);
  if (style === 'stone') return canvasTex(512, 512, (g) => {
    g.fillStyle = a; g.fillRect(0,0,512,512);
    for (let y = 0; y < 512; y += 128) for (let x = (y/128)%2 ? -128 : 0; x < 512; x += 256){ g.fillStyle = `rgba(${R()<.5?'0,0,0':'255,255,255'},${R()*.08})`; g.fillRect(x+3, y+3, 250, 122); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; for (let y = 0; y <= 512; y += 128){ g.beginPath(); g.moveTo(0,y); g.lineTo(512,y); g.stroke(); for (let x = (y/128)%2 ? 128 : 0; x <= 512; x += 256){ g.beginPath(); g.moveTo(x,y); g.lineTo(x,y+128); g.stroke(); } }
  }, [3.5, 3.5]);
  if (style === 'concrete') return canvasTex(256, 256, (g) => { g.fillStyle = a; g.fillRect(0,0,256,256); for (let i = 0; i < 3000; i++){ g.fillStyle = `rgba(${R()<.5?'0,0,0':'255,255,255'},${R()*.08})`; g.fillRect(R()*256, R()*256, 2, 2); } g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0,0,256,2); g.fillRect(0,0,2,256); }, [3, 3]);
  if (style === 'carpet') return canvasTex(256, 256, (g) => { g.fillStyle = a; g.fillRect(0,0,256,256); g.strokeStyle = 'rgba(242,193,78,.18)'; g.lineWidth = 3; for (let i = -256; i < 512; i += 64){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+256,256); g.stroke(); g.beginPath(); g.moveTo(i+256,0); g.lineTo(i,256); g.stroke(); } }, [5, 5]);
}

// ---------------------------------------------------------------- rooms + walls
let lockSign = null, vault = null;
function buildRoom(r){
  const {x: cx, z: cz} = r.c;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshStandardMaterial({map: floorTex(r.floor), roughness:.7}));
  fl.rotation.x = -Math.PI/2; add(fl, cx, 0, cz);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), M(new THREE.Color(r.trim).multiplyScalar(.6).getStyle()));
  ce.rotation.x = Math.PI/2; add(ce, cx, WH, cz);
  for (const side of ['n','s','w','e']) buildWall(r, side, DOORS[r.key+':'+side]);
  r.lamp = add(new THREE.PointLight(r.light, r.li, 0, 2), cx, WH - .7, cz);
  r.lampColor = new THREE.Color(r.light);
  const fx = cyl(.4, .5, .14, new THREE.MeshStandardMaterial({color:'#222', emissive:r.light, emissiveIntensity:1.2}), 24);
  add(fx, cx, WH - .07, cz);
}
function buildWall(r, side, door){
  const {x: cx, z: cz} = r.c, alongX = side === 'n' || side === 's', sign = (side === 'n' || side === 'w') ? -1 : 1;
  const wallMat = M(r.wall), trimMat = M(r.trim), wainsMat = r.wains && M(r.wains);
  const place = (a, b, y0, y1, dist, thick, mat) => {
    const len = b - a, mid = (a + b) / 2, m = box(alongX ? len : thick, y1 - y0, alongX ? thick : len, mat);
    if (alongX) m.position.set(cx + mid, (y0 + y1) / 2, cz + sign * dist); else m.position.set(cx + sign * dist, (y0 + y1) / 2, cz + mid);
    scene.add(m); return m;
  };
  const segs = door ? [[-H, -DW/2], [DW/2, H]] : [[-H, H]];
  for (const [a, b] of segs){
    camBlockers.push(place(a, b, 0, WH, H - .1, .2, wallMat));
    if (alongX) solid(cx + (a + b) / 2, cz + sign * (H - .1), b - a, .2); else solid(cx + sign * (H - .1), cz + (a + b) / 2, .2, b - a);
    if (wainsMat){ place(a, b, 0, 1.15, H - .21, .02, wainsMat); place(a, b, 1.12, 1.2, H - .23, .06, trimMat); }
    place(a, b, 0, .2, H - .22, .05, trimMat);
    place(a, b, WH - .18, WH, H - .22, .06, trimMat);
  }
  if (!door) return;
  camBlockers.push(place(-DW/2, DW/2, DH, WH, H - .1, .2, wallMat));
  place(-DW/2 - .16, -DW/2, 0, DH + .16, H - .26, .12, trimMat);
  place(DW/2, DW/2 + .16, 0, DH + .16, H - .26, .12, trimMat);
  place(-DW/2 - .16, DW/2 + .16, DH, DH + .16, H - .26, .12, trimMat);
  const to = ROOMS[door.to];
  if (door.vault && r.key === 'egypt'){
    lockSign = {canvas: document.createElement('canvas')}; lockSign.canvas.width = 512; lockSign.canvas.height = 112;
    lockSign.tex = new THREE.CanvasTexture(lockSign.canvas); lockSign.tex.colorSpace = THREE.SRGBColorSpace;
    onWall(plane(1.9, .42, lockSign.tex, true), r, side, 0, DH + .5, .03);
    buildVault(r);
  } else {
    onWall(plane(1.9, .42, textTex(to.name)), r, side, 0, DH + .5, .03);
  }
}
function drawLockSign(n){
  if (!lockSign) return; const g = lockSign.canvas.getContext('2d');
  g.fillStyle = '#1d1a24'; g.fillRect(0, 0, 512, 112); g.font = '600 50px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = n >= STAR_TOTAL ? '#f2e8d4' : '#f2c14e'; g.fillText(n >= STAR_TOTAL ? 'Skattkammaren' : `LÅST  ★ ${n}/${STAR_TOTAL}`, 256, 58);
  lockSign.tex.needsUpdate = true;
}
function buildVault(r){
  const {x, z} = r.c, g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({color:'#8a8592', metalness:.8, roughness:.35});
  const slab = box(DW, DH, .3, steel); g.add(slab); camBlockers.push(slab);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.42, .05, 10, 32), new THREE.MeshStandardMaterial({color:'#c9c3d0', metalness:.9, roughness:.25}));
  wheel.position.set(0, .1, .2); g.add(wheel);
  for (let i = 0; i < 4; i++){ const s = box(.84, .05, .05, wheel.material); s.rotation.z = i * Math.PI / 4; s.position.set(0, .1, .2); g.add(s); }
  const hub = cyl(.09, .09, .1, GOLD); hub.rotation.x = Math.PI/2; hub.position.set(0, .1, .22); g.add(hub);
  for (let i = 0; i < 6; i++){ const bolt = sph(.04, steel); bolt.position.set(-DW/2 + .18, -DH/2 + .3 + i * .5, .16); g.add(bolt); const b2 = bolt.clone(); b2.position.x *= -1; g.add(b2); }
  add(g, x, DH/2, z - H);
  vault = {mesh: g, slab, solid: solid(x, z - H, DW, .4), open: false, wheel};
}
function openVault(){
  if (!vault || vault.open) return; vault.open = true;
  const i = solids.indexOf(vault.solid); if (i >= 0) solids.splice(i, 1);
  const j = camBlockers.indexOf(vault.slab); if (j >= 0) camBlockers.splice(j, 1);
  const y0 = vault.mesh.position.y;
  tween(1800, k => { vault.mesh.position.y = y0 + ease(k) * (DH - .05); vault.wheel.rotation.z = k * 6; });
  sfx.vault();
}
function closeVault(){
  if (!vault) return; vault.open = false; vault.mesh.position.y = DH/2;
  if (!solids.includes(vault.solid)) solids.push(vault.solid);
  if (!camBlockers.includes(vault.slab)) camBlockers.push(vault.slab);
}

// ---------------------------------------------------------------- props
function painting(r, side, along, y, w, h, kind, seed, info, frame = true){
  const g = new THREE.Group();
  if (frame){ g.add(box(w + .22, h + .22, .08, GOLD)); }
  else { const back = box(w, h, .05, M('#e9e6df')); g.add(back); }
  const px = 100, tex = svgTex(art(kind, Math.round(w*px), Math.round(h*px), seed), Math.round(w*px), Math.round(h*px));
  const canvasMesh = plane(w, h, tex); canvasMesh.position.z = .045; g.add(canvasMesh);
  const label = box(.32, .12, .02, M('#efe7d6')); label.position.set(0, -h/2 - .3, 0); g.add(label);
  onWall(g, r, side, along, y, .05);
  if (info){ const p = inFront(r, side, along, 1.1); interact({x:p.x, z:p.z, r:2.0, info}); }
  return g;
}
function bench(x, z, info, rotY = 0){
  const g = new THREE.Group(), wood = M('#6b4a2f'), dark = M('#3d2a1a');
  add(box(2.6, .1, .6, wood), 0, .45, 0, g);
  for (const sx of [-1.1, 1.1]) for (const sz of [-.2, .2]) add(box(.08, .42, .08, dark), sx, .21, sz, g);
  g.rotation.y = rotY; add(g, x, 0, z); solid(x, z, 2.7, .7);
  if (info) interact({x, z: z + .9, info});
}
function plant(x, z, info){
  const g = new THREE.Group();
  const pot = cyl(.32, .22, .6, M('#a4553a'), 24); pot.position.y = .3; g.add(pot);
  add(cyl(.34, .34, .07, M('#bd6646'), 24), 0, .6, 0, g);
  add(cyl(.3, .3, .02, M('#3a2a1c'), 24), 0, .62, 0, g);
  const R = rng(4), greens = ['#3f7a4a', '#4f8f58', '#5fa266', '#356b40'];
  for (let i = 0; i < 11; i++){
    const piv = new THREE.Group(); piv.position.y = .6; piv.rotation.order = 'YXZ';
    piv.rotation.y = i / 11 * TAU + R() * .4; piv.rotation.x = .35 + R() * .6;
    const leaf = sph(.5, M(greens[i % 4], {side: THREE.DoubleSide}), 12, 8); leaf.scale.set(.32, 1, .05); leaf.position.y = .5 + R() * .2; piv.add(leaf); g.add(piv);
  }
  g.userData.sway = true; add(g, x, 0, z); solid(x, z, .7, .7); swayers.push(g);
  if (info) interact({x, z, r:1.8, info});
}
function desk(x, z, info){
  const g = new THREE.Group(), wood = M('#6e4b2d'), top = M('#8f6743');
  add(box(2.4, 1.0, .8, wood), 0, .5, 0, g);
  add(box(2.6, .08, .95, top), 0, 1.04, 0, g);
  const front = plane(1.6, .5, textTex('BILJETTER', {bg:'#5a3b22', fg:'#e9d6b0', font:'600 64px Georgia, serif', border:'#3d2814'})); front.position.set(0, .55, .405); g.add(front);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.11, 20, 10, 0, TAU, 0, Math.PI/2), GOLD); bell.position.set(-.8, 1.08, .1); g.add(bell);
  add(cyl(.13, .13, .02, GOLD), -.8, 1.08, .1, g);
  const paper = box(.4, .01, .3, M('#f4efe3')); paper.rotation.y = .2; add(paper, .3, 1.085, .05, g);
  add(g, x, 0, z); solid(x, z, 2.6, .95);
  interact({x, z: z + 1.1, info});
}
function pedestal(x, z, h = 1.1, w = .9, mat = M('#efebe3')){
  const p = box(w, h, w, mat); add(p, x, h/2, z); add(box(w + .1, .06, w + .1, mat), x, h + .03, z); solid(x, z, w + .1, w + .1); return h + .06;
}
function tv(x, z, rotY, info){
  const g = new THREE.Group(), dark = M('#1d1d1d');
  add(cyl(.06, .06, 1.2, M('#2a2a2a')), 0, .6, 0, g);
  add(box(.9, .06, .5, M('#2a2a2a')), 0, .03, 0, g);
  add(box(1.7, 1.05, .14, dark), 0, 1.55, 0, g);
  const nc = document.createElement('canvas'); nc.width = 96; nc.height = 60;
  const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace; nt.magFilter = THREE.NearestFilter;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .88), new THREE.MeshBasicMaterial({map: nt})); scr.position.set(0, 1.55, .075); g.add(scr);
  const led = sph(.025, new THREE.MeshBasicMaterial({color:'#ff4a4a'})); led.position.set(.75, 1.08, .08); g.add(led);
  g.rotation.y = rotY; add(g, x, 0, z); solid(x, z, 1.0, .6);
  noiseScreens.push({canvas: nc, tex: nt});
  const glow = new THREE.PointLight('#aab8ff', 2.5, 5, 2); glow.position.set(0, 1.55, .6); g.add(glow);
  interact({x: x + Math.sin(rotY) * 1.4, z: z + Math.cos(rotY) * 1.4, info});
}
function mobile(x, z, info){
  const g = new THREE.Group(), wire = M('#333'), thin = .01;
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  g.add(rod(V(0, 0, 0), V(0, -1.2, 0), thin, wire));
  g.add(rod(V(-1.2, -1.2, 0), V(1.0, -1.2, 0), .02, wire));
  g.add(rod(V(-1.2, -1.2, 0), V(-1.2, -1.8, 0), thin, wire)); add(sph(.22, M('#e4572e')), -1.2, -2.0, 0, g);
  g.add(rod(V(1.0, -1.2, 0), V(1.0, -1.5, 0), thin, wire));
  g.add(rod(V(.2, -1.5, .3), V(1.8, -1.5, -.3), .02, wire));
  g.add(rod(V(.2, -1.5, .3), V(.2, -2.0, .3), thin, wire)); const disc = cyl(.3, .3, .04, M('#29335c'), 28); disc.rotation.x = Math.PI/2; add(disc, .2, -2.3, .3, g);
  g.add(rod(V(1.8, -1.5, -.3), V(1.8, -2.2, -.3), thin, wire)); const cone = new THREE.Mesh(new THREE.ConeGeometry(.2, .35, 3), M('#f3a712')); add(cone, 1.8, -2.4, -.3, g);
  g.add(rod(V(-.3, -1.2, 0), V(-.3, -2.4, 0), thin, wire)); const sq = box(.3, .3, .03, M('#111')); sq.rotation.z = .4; add(sq, -.3, -2.6, 0, g);
  add(g, x, WH, z); spinners.push({obj: g, speed: .12});
  interact({x, z: z + .8, r:2.4, info});
}
function crystal(x, z, color, info){
  const top = pedestal(x, z, 1.0, .9, M('#262a46'));
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color, emissive:color, emissiveIntensity:1.1, roughness:.15, metalness:.1, transparent:true, opacity:.92, flatShading:true});
  const R = rng(color.length + x);
  for (let i = 0; i < 5; i++){ const c = new THREE.Mesh(new THREE.OctahedronGeometry(.15, 0), mat); const s = .9 + R() * .9; c.scale.set(s * .8, s * 3.2, s * .8); c.position.set((R() - .5) * .3, .22 * s, (R() - .5) * .3); c.rotation.set((R() - .5) * .5, R() * TAU, (R() - .5) * .5); g.add(c); }
  add(g, x, top, z);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 16, 0, TAU, 0, Math.PI/2), new THREE.MeshStandardMaterial({color:'#cfe3ff', transparent:true, opacity:.14, roughness:.05, metalness:.2, depthWrite:false}));
  dome.scale.y = 1.6; add(dome, x, top, z);
  const L = new THREE.PointLight(color, 6, 7, 2); add(L, x, top + .5, z); pulsers.push({light: L, base: 6, phase: x});
  interact({x, z: z + 1.1, info});
}
function meteor(x, z, info){
  const top = pedestal(x, z, .8, 1.0, M('#262a46'));
  const geo = new THREE.DodecahedronGeometry(.45, 1), pos = geo.attributes.position, R = rng(9);
  for (let i = 0; i < pos.count; i++){ const v = new THREE.Vector3().fromBufferAttribute(pos, i); v.multiplyScalar(.8 + R() * .35); pos.setXYZ(i, v.x, v.y * .8, v.z); }
  geo.computeVertexNormals();
  add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:'#4a4048', metalness:.55, roughness:.6, flatShading:true})), x, top + .3, z);
  interact({x, z: z + 1.2, info});
}
function butterflyCase(x, z, info){
  const g = new THREE.Group(), wood = M('#5a4030');
  for (const sx of [-1.05, 1.05]) for (const sz of [-.18, .18]) add(box(.07, 1.0, .07, wood), sx, .5, sz, g);
  add(box(2.3, 1.25, .5, wood), 0, 1.62, 0, g);
  const cols = ['#3c91e6','#f3a712','#e4572e','#7bc96f','#b06ad6','#f05d8a']; let bf = `<rect width="440" height="230" fill="#f2ead8"/>`; const R = rng(3);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++){ const bx = 80 + c * 140, by = 70 + r * 95, col = cols[(r*3+c)%6], s = 1.4 + R() * .5;
    bf += `<g transform="translate(${bx} ${by}) scale(${s.toFixed(2)})"><path d="M0 0 l-22 -16 q -8 14 0 22 Z M0 0 l22 -16 q 8 14 0 22Z" fill="${col}"/><path d="M0 0 l-16 14 q 8 6 14 -3Z M0 0 l16 14 q -8 6 -14 -3Z" fill="${col}" opacity=".75"/><line x1="0" y1="-10" x2="0" y2="14" stroke="#222" stroke-width="3"/></g>`; }
  const front = plane(2.1, 1.08, svgTex(bf, 440, 230)); front.position.set(0, 1.62, .255); g.add(front);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.08), new THREE.MeshStandardMaterial({color:'#dfefff', transparent:true, opacity:.12, roughness:.05})); glass.position.set(0, 1.62, .27); g.add(glass);
  add(g, x, 0, z); solid(x, z, 2.3, .55);
  interact({x, z: z + 1.1, info});
}
function sarcophagus(x, z, rotY, info){
  const g = new THREE.Group(), blue = M('#1f4e6b');
  add(box(1.1, .2, .7, M('#6b5a3a')), 0, .1, 0, g);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42, 1.4, 8, 20), GOLD); body.scale.z = .55; add(body, 0, 1.2, 0, g);
  const head = sph(.43, blue); head.scale.set(1.05, 1.1, .62); add(head, 0, 1.95, -.02, g);
  const face = sph(.27, M('#e2b552', {metalness:.6, roughness:.35})); face.scale.set(1, 1.15, .5); add(face, 0, 1.95, .17, g);
  for (const sx of [-.09, .09]) add(box(.08, .025, .02, M('#1b1b1b')), sx, 2.0, .3, g);
  add(box(.05, .2, .03, blue), 0, 1.72, .26, g);
  for (let i = 0; i < 4; i++){ const band = new THREE.Mesh(new THREE.TorusGeometry(.42, .03, 6, 24), i % 2 ? blue : M('#2d6a8a')); band.scale.set(1, .55, 1); band.rotation.x = Math.PI/2; add(band, 0, 1.55 - i * .25, 0, g); }
  g.rotation.y = rotY; add(g, x, 0, z); solid(x, z, 1.1, .8);
  interact({x: x + Math.sin(rotY) * 1.2, z: z + Math.cos(rotY) * 1.2, info});
}
function urn(x, z, s, color, info){
  const pts = [[0,0],[.18,0],[.26,.1],[.34,.38],[.31,.62],[.2,.8],[.15,.88],[.21,.94],[.21,1.0],[0,1.0]].map(([a,b]) => new THREE.Vector2(a*s*1.4, b*s*1.4));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), M(color, {roughness:.55}));
  add(m, x, 0, z); solid(x, z, .9 * s, .9 * s);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.3 * s * 1.4, .02, 6, 32), M('#2a1a10')); band.rotation.x = Math.PI/2; add(band, x, .62 * s * 1.4, z);
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(.33 * s * 1.4, .015, 6, 32), M('#e8c27a')); band2.rotation.x = Math.PI/2; add(band2, x, .45 * s * 1.4, z);
  interact({x, z: z + 1.1, r:1.8, info});
}
function crown(x, z, info){
  const top = pedestal(x, z, 1.15, .8, M('#3b2457'));
  const g = new THREE.Group();
  add(box(.62, .08, .62, M('#7b2a3a')), 0, .04, 0, g);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.27, .24, .2, 32, 1, true), GOLD); band.material.side = THREE.DoubleSide; add(band, 0, .18, 0, g);
  const jewels = ['#d63a5a', '#3c91e6', '#3cb371'];
  for (let i = 0; i < 8; i++){ const a = i / 8 * TAU;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(.06, .2, 8), GOLD); add(sp, Math.sin(a) * .26, .37, Math.cos(a) * .26, g);
    add(sph(.03, M('#fff3c4', {emissive:'#fff3c4', emissiveIntensity:.6})), Math.sin(a) * .26, .48, Math.cos(a) * .26, g);
    add(sph(.035, M(jewels[i % 3], {emissive:jewels[i % 3], emissiveIntensity:.3, roughness:.2})), Math.sin(a) * .265, .18, Math.cos(a) * .265, g); }
  add(g, x, top, z); spinners.push({obj: g, speed: .4});
  const L = new THREE.PointLight('#ffd76a', 14, 8, 2); add(L, x, top + 1.0, z); pulsers.push({light: L, base: 14, phase: 0});
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color:'#ffd76a', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:.7}));
  halo.scale.set(2.2, 2.2, 1); add(halo, x, top + .3, z);
  interact({x, z: z + 1.2, r:2.0, info, use: () => win()});
}
function chest(x, z, rotY, info){
  const g = new THREE.Group(), wood = M('#7d4a28');
  add(box(1.2, .65, .75, wood), 0, .325, 0, g);
  for (const sx of [-.4, .4]) add(box(.08, .67, .77, GOLD), sx, .33, 0, g);
  add(box(1.22, .07, .77, GOLD), 0, .62, 0, g);
  const lidPiv = new THREE.Group(); lidPiv.position.set(0, .65, -.375); lidPiv.rotation.x = -1.1; g.add(lidPiv);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.375, .375, 1.2, 20, 1, false, 0, Math.PI), M('#6b3f22')); lid.rotation.z = Math.PI/2; lid.rotation.y = Math.PI/2; lid.position.z = .375; lidPiv.add(lid);
  const R = rng(Math.round(x * 10));
  for (let i = 0; i < 40; i++){ const c = cyl(.06, .06, .015, GOLD, 12); c.rotation.set(R() * .8, 0, R() * .8); add(c, (R() - .5) * 1.0, .64 + R() * .14, (R() - .5) * .6, g); }
  add(box(.16, .2, .04, GOLD), 0, .45, .39, g);
  g.rotation.y = rotY; add(g, x, 0, z); solid(x, z, 1.3, 1.3);
  interact({x: x + Math.sin(rotY) * 1.3, z: z + Math.cos(rotY) * 1.3, info});
}

// ---------------------------------------------------------------- stars
const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.3,'rgba(255,255,255,.45)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,128,128); });
const starShape = (() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++){ const a = Math.PI/2 + i * Math.PI/5, rad = i % 2 ? .1 : .24; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? s.lineTo(px, py) : s.moveTo(px, py); } s.closePath(); return s; })();
const starGeo = new THREE.ExtrudeGeometry(starShape, {depth:.06, bevelEnabled:true, bevelThickness:.02, bevelSize:.02, bevelSegments:2}); starGeo.center();
const starMat = new THREE.MeshStandardMaterial({color:'#ffd34d', emissive:'#ffb000', emissiveIntensity:.9, metalness:.6, roughness:.25});
const stars = [];
function star(room, x, y, z, dim = false){
  const g = new THREE.Group(); g.add(new THREE.Mesh(starGeo, starMat));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color:'#ffd34d', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity: dim ? .45 : .8}));
  glow.scale.set(.9, .9, 1); g.add(glow);
  add(g, x, y, z); stars.push({room, g, x, y, z, taken:false});
}
const STAR_TOTAL = 6;

// ---------------------------------------------------------------- the dinosaur
const dino = {};
function buildDino(r){
  const {x: cx, z: cz} = r.c, g = new THREE.Group(); const ox = cx - .5, oz = cz + .8;
  const V = (a, b, c = 0) => new THREE.Vector3(a, b, c);
  add(box(6.6, .3, 2.2, M('#3b2f25')), .4, .15, 0, g);
  add(box(6.7, .06, 2.3, M('#5a4838')), .4, .31, 0, g);
  const plaqueM = plane(.9, .3, textTex('AURORASAURUS', {bg:'#efe7d6', fg:'#2b2620', font:'600 40px Georgia, serif'})); plaqueM.position.set(.4, .2, 1.111); g.add(plaqueM);
  const spine = new THREE.CatmullRomCurve3([V(-1.7, 2.7), V(-.6, 2.78), V(.6, 2.55), V(1.8, 2.2), V(3.0, 1.7), V(4.0, 1.3)]);
  for (let i = 0; i <= 30; i++){ const t = i / 30, p = spine.getPoint(t); add(sph(.13 - t * .08, BONE, 10, 8), p.x, p.y, 0, g); }
  const neck = new THREE.CatmullRomCurve3([V(-1.7, 2.7), V(-2.15, 3.05), V(-2.45, 3.4)]);
  for (let i = 0; i <= 8; i++){ const p = neck.getPoint(i / 8); add(sph(.11, BONE, 10, 8), p.x, p.y, 0, g); }
  for (let i = 0; i < 8; i++){ const rx = -1.25 + i * .25, sy = spine.getPoint(clamp((rx + 1.7) / 5.7, 0, 1)).y - .03, rad = .32 + .3 * Math.sin(Math.PI * (i + 1) / 9);
    const piv = new THREE.Group(); piv.position.set(rx, sy, 0); piv.rotation.y = Math.PI/2;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(rad, .035, 6, 20, Math.PI), BONE); rib.rotation.z = Math.PI; piv.add(rib); g.add(piv); }
  for (const s of [-.32, .32]){
    g.add(rod(V(.7, 2.35, s), V(1.15, 1.3, s), .11, BONE)); add(sph(.12, BONE), 1.15, 1.3, s, g);
    g.add(rod(V(1.15, 1.3, s), V(.8, .45, s), .085, BONE)); add(sph(.09, BONE), .8, .45, s, g);
    g.add(rod(V(.8, .45, s), V(.45, .36, s), .07, BONE));
    g.add(rod(V(-1.1, 2.3, s * .7), V(-1.35, 1.85, s * .8), .04, BONE)); g.add(rod(V(-1.35, 1.85, s * .8), V(-1.6, 1.8, s * .8), .03, BONE));
  }
  add(sph(.2, BONE), .75, 2.35, 0, g);
  g.add(rod(V(0, .3, 0), V(0, 2.7, 0), .02, M('#666', {metalness:.6})));
  g.add(rod(V(2.0, .3, 0), V(2.0, 2.15, 0), .02, M('#666', {metalness:.6})));
  // skull
  const skull = new THREE.Group(); skull.position.set(-2.75, 3.5, 0);
  const cran = sph(.5, BONE, 20, 14); cran.scale.set(1.25, .62, .55); cran.position.x = -.12; skull.add(cran);
  const jaw = box(.85, .09, .3, BONE); jaw.position.set(-.25, -.3, 0); jaw.rotation.z = .12; skull.add(jaw);
  for (const s of [-.22, .22]){ const eye = sph(.09, M('#2a2018')); eye.position.set(.12, .1, s); skull.add(eye); }
  const nos = sph(.05, M('#2a2018')); nos.position.set(-.7, .05, .12); skull.add(nos); const nos2 = nos.clone(); nos2.position.z = -.12; skull.add(nos2);
  for (let i = 0; i < 8; i++){ const t = new THREE.Mesh(new THREE.ConeGeometry(.025, .09, 6), M('#fffaf0')); t.position.set(-.68 + i * .09, -.2, (i % 2 ? .1 : -.1)); t.rotation.z = Math.PI; skull.add(t); }
  g.add(skull);
  // photo head, hidden until the button is pressed
  const photo = new THREE.TextureLoader().load('assets/dino-head.jpg', () => { loaded++; progress(); }, undefined, () => { loaded++; progress(); }); pending++;
  photo.colorSpace = THREE.SRGBColorSpace; photo.repeat.set(.68, .7); photo.offset.set(.16, .15);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.CircleGeometry(.75, 48), new THREE.MeshBasicMaterial({map: photo, side: THREE.DoubleSide})));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.76, .05, 8, 48), BONE); head.add(rim);
  const toothM = M('#fffaf0', {roughness:.4});
  for (let i = -5; i <= 5; i++){ const a = i * .16;
    const lo = new THREE.Mesh(new THREE.ConeGeometry(.05, .18, 6), toothM); lo.position.set(Math.sin(a) * .7, -Math.cos(a) * .7, .03); lo.rotation.z = a; head.add(lo);
    const hi = new THREE.Mesh(new THREE.ConeGeometry(.05, .18, 6), toothM); hi.position.set(Math.sin(a) * .7, Math.cos(a) * .7, .03); hi.rotation.z = Math.PI - a; head.add(hi); }
  head.visible = false; head.scale.setScalar(.001); scene.add(head);
  const neckRod = cyl(.13, .13, 1, BONE, 12); neckRod.visible = false; scene.add(neckRod);
  add(g, ox, 0, oz); solid(ox + .4, oz, 6.7, 2.3);
  g.updateMatrixWorld(true);
  Object.assign(dino, {group: g, skull, head, neckRod,
    headRest: skull.getWorldPosition(new THREE.Vector3()),
    neckBase: g.localToWorld(V(-1.7, 2.7, 0))});
  interact({x: ox + .4, z: oz + 2.1, r:2.0, info:['Aurorasaurus borealis','Sen krita, ca 70 miljoner år','Hittades 1931 i en grusgrop utanför Kiruna (det är inte sant, men vi tycker om historien). Skelettet består av 64 % äkta ben och 36 % gips. Rör inte knappen bredvid.']});
}
function dangerButton(r){
  const {x: cx, z: cz} = r.c, x = cx - 5.2, z = cz - 4.0;
  add(box(.28, 1.0, .28, M('#3a3a3a')), x, .5, z);
  add(box(.7, .18, .55, M('#2b2b2b')), x, 1.09, z);
  const btn = new THREE.Group();
  add(cyl(.2, .22, .08, M('#7d0f17')), 0, 0, 0, btn);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.19, 24, 12, 0, TAU, 0, Math.PI/2), new THREE.MeshStandardMaterial({color:'#e02424', emissive:'#ff1a1a', emissiveIntensity:.5, roughness:.25}));
  dome.scale.y = .6; dome.position.y = .03; btn.add(dome);
  add(btn, x, 1.2, z); solid(x, z, .75, .6);
  const hz = `<defs><pattern id="hz" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="#f2c14e"/><rect width="20" height="40" fill="#1b1b1b"/></pattern></defs>
    <rect width="400" height="380" fill="url(#hz)"/><rect x="30" y="30" width="340" height="320" rx="8" fill="#fff4cc"/>
    <text x="200" y="120" text-anchor="middle" font-family="Impact,'Arial Black',sans-serif" font-weight="900" font-size="76" fill="#c1121f">KLICKA</text>
    <text x="200" y="215" text-anchor="middle" font-family="Impact,'Arial Black',sans-serif" font-weight="900" font-size="96" fill="#c1121f">INTE!</text>
    <text x="200" y="268" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="34" fill="#2b2620">PÅ KNAPPEN</text>
    <path d="M200 290 v36 m-18 -16 l18 18 l18 -18" stroke="#c1121f" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  const sign = plane(1.0, .95, svgTex(hz, 400, 380)); sign.material.emissive = new THREE.Color('#ffffff'); sign.material.emissiveMap = sign.material.map; sign.material.emissiveIntensity = .35;
  add(sign, x, 2.05, z - .32);
  add(box(1.08, 1.03, .04, M('#111')), x, 2.05, z - .345);
  add(box(.06, 1.6, .06, M('#222')), x - .45, .8, z - .36); add(box(.06, 1.6, .06, M('#222')), x + .45, .8, z - .36);
  const L = new THREE.PointLight('#ff3a3a', 3, 4, 2); add(L, x, 1.6, z + .3); pulsers.push({light: L, base: 3, phase: 2, fast: true});
  dino.button = btn; dino.buttonY = 1.2;
  interact({x, z: z + .75, r:1.5, danger:true, use: () => doom()});
}

// ---------------------------------------------------------------- populate museum
const swayers = [], spinners = [], pulsers = [], noiseScreens = [];
function populate(){
  Object.values(ROOMS).forEach(buildRoom);
  const E = ROOMS.entre, K = ROOMS.konst, MO = ROOMS.modern, N = ROOMS.natur, MI = ROOMS.mineral, EG = ROOMS.egypt, S = ROOMS.skatt;
  // Entréhallen
  onWall(plane(3.6, .6, textTex('MUSEUM AURORA', {w:1024, h:170, bg:'#2b2533', fg:'#f2c14e', font:'600 104px Georgia, serif'})), E, 'n', 0, 4.12, .03);
  const map = `<rect width="260" height="280" rx="8" fill="#2f3b4a"/><text x="130" y="36" text-anchor="middle" font-size="22" letter-spacing="4" fill="#e8dfcd" font-family="system-ui,sans-serif">PLANRITNING</text>`
    + [[1,0],[0,1],[1,1],[0,2],[1,2],[2,2],[3,2]].map(([c, rw]) => `<rect x="${24 + c*55}" y="${60 + rw*58}" width="48" height="50" rx="4" fill="${c===1&&rw===2?'#f2c14e':'#cfc4ae'}"/>`).join('')
    + `<text x="80" y="270" text-anchor="middle" font-size="16" fill="#f2c14e" font-family="system-ui,sans-serif">DU ÄR HÄR</text>`;
  onWall(plane(1.3, 1.4, svgTex(map, 260, 280)), E, 'n', -4, 1.9, .03);
  { const p = inFront(E, 'n', -4, 1.1); interact({x:p.x, z:p.z, info:['Planritning','Informationstavla','Entrén ligger mitt på bottenvåningen. Till vänster: Naturhistoria. Till höger: Konstgalleriet. Rakt fram: Egyptiska salen. Längst in sägs det finnas ett valv som ingen nattvakt sett öppet.']}); }
  plant(E.c.x - 5.6, E.c.z - 5.6, ['Monstera deliciosa','Krukväxt, ej till salu','Museets mest fotograferade föremål, enligt besöksstatistiken. Vattnas varje tisdag av vaktmästare Berit.']);
  plant(E.c.x + 5.6, E.c.z + 5.6, null);
  desk(E.c.x + 4, E.c.z - 4.6, ['Biljettdisken','Ek och mässing, 1912','Här köper besökarna biljett på dagtid. På disken ligger en lapp: ”Sex stjärnor. Sex salar. Kronan väntar.”']);
  bench(E.c.x, E.c.z + 4.5, null);
  painting(E, 's', -3.5, 2.2, 1.4, 1.0, 'abstract', 41, ['Välkommen','Affisch, 2026','Museum Aurora har öppet tisdag till söndag. På natten är det bara du och utställningarna.']);
  star('entre', E.c.x + 4.7, 1.32, E.c.z - 4.5);
  // Konstgalleriet
  painting(K, 'n', -4.3, 2.3, 1.6, 2.0, 'portrait', 11, ['Damen med bärnstensbrosch','Okänd mästare, ca 1790. Olja på duk','Ingen vet vem hon är, men alla som stannat framför tavlan säger att hon ser ut som någon de känner.']);
  painting(K, 'n', 0, 2.4, 2.0, 2.4, 'landscape', 12, ['Kvällsljus över Vättern','Ingrid Solmark, 1884. Olja på duk','Solmark målade samma vy 41 gånger. Detta är den enda versionen där hon tog med det lilla trädet.']);
  painting(K, 'n', 4.3, 2.3, 1.6, 2.0, 'sea', 13, ['Storm vid Skagen','Henrik Alvbo, 1902. Olja på duk','Alvbo påstod att han målade tavlan ombord på en fiskebåt. Konservatorerna har hittat sand i färgen, så han talade kanske sanning.']);
  painting(K, 's', -3, 2.3, 2.2, 1.5, 'abstract', 31, ['Rörelse i rött och blått','Greta Lind, 1958. Olja på masonit','Lind målade med en kökskniv i stället för pensel. Kniven finns i museets magasin.']);
  painting(K, 's', 3, 2.3, 1.5, 1.9, 'landscape', 33, ['Sommarafton','Ingrid Solmark, 1886','Version 42. Hon sa att det var den sista. Det var det inte.']);
  bench(K.c.x, K.c.z, ['Bänk','Funktionell möbel','Placerad exakt 3,2 meter från tavlorna. Ett perfekt avstånd för att se, och för att vila fötterna.']);
  star('konst', K.c.x + .9, .22, K.c.z + .33);
  // Moderna salen
  { const top = pedestal(MO.c.x - 4, MO.c.z - 3.5); const cube = box(.7, .7, .7, M('#d63a3a', {roughness:.35, metalness:.2})); cube.rotation.set(Math.PI/4, .3, Math.atan(1/Math.SQRT2)); add(cube, MO.c.x - 4, top + .6, MO.c.z - 3.5);
    interact({x: MO.c.x - 4, z: MO.c.z - 2.3, info:['Tyngdpunkt','Alva Brink, 2019. Lackerad aluminium','En kub som balanserar på ett hörn. Den är fastskruvad, men det vet ingen besökare.']}); }
  { const top = pedestal(MO.c.x - 4, MO.c.z + 3); const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(.32, .09, 140, 16), new THREE.MeshStandardMaterial({color:'#c8ccd2', metalness:.9, roughness:.2})); add(knot, MO.c.x - 4, top + .5, MO.c.z + 3); spinners.push({obj: knot, speed: .3});
    interact({x: MO.c.x - 2.8, z: MO.c.z + 3, info:['Oändlig knut','Kromad stål, 1974','Skulptören hävdade att den saknar början och slut. Vaktmästaren som dammar den håller med.']}); }
  painting(MO, 'n', -.5, 2.3, 1.4, 1.8, 'blank', 21, ['Utan titel #7','Johan Vit, 1999. Vit duk','Konstnären hävdar att tavlan föreställer tystnad. Kritikerna var oense, men ingen kunde säga emot.'], false);
  painting(MO, 's', 2, 2.2, 1.0, .7, 'abstract', 24, ['Komposition i rött','Liten studie, 1961','Konstnären skissade den på en servett. Detta är servetten, inramad.']);
  mobile(MO.c.x + 2, MO.c.z - 1.5, ['Balans i rörelse','Kinetisk installation, 1968','Mobilen rör sig av luftströmmarna i salen. Vakterna svär på att den rör sig mest när ingen tittar.']);
  tv(MO.c.x + 5, MO.c.z - 4.8, -.6, ['Kanal 0','Videoinstallation, 1987','En loop på 14 timmar med brus. Vissa påstår att det finns ett ansikte i minut 512.']);
  { const string = cyl(.006, .006, 2.5, M('#333')); add(string, MO.c.x + 2.9, WH - 1.25 - .2, MO.c.z - .6); }
  star('modern', MO.c.x + 2.9, 1.75, MO.c.z - .6);
  // Naturhistoria
  buildDino(N);
  dangerButton(N);
  butterflyCase(N.c.x + 4.3, N.c.z - 5.9, ['Fjärilssamlingen','Insamlad 1890–1920','Sex arter från sex kontinenter. Den blå fjärilen är så sällsynt att arten bara har setts tre gånger sedan dess.']);
  painting(N, 's', 3.5, 2.3, 2.0, 1.3, 'landscape', 51, ['Kritatidens landskap','Rekonstruktion, 1952','Så tror forskarna att Kiruna såg ut för 70 miljoner år sedan. Forskarna har inte varit där.']);
  star('natur', N.c.x - .9, 1.9, N.c.z + 1.5);
  // Mineralrummet
  crystal(MI.c.x - 4, MI.c.z - 4.5, '#7ad7ff', ['Isblå kvarts','Funnen i Jämtland','En bergkristall så klar att man kan läsa genom den. Den är 300 miljoner år gammal och ändå helt utan repor.']);
  crystal(MI.c.x + 4, MI.c.z - 4.5, '#c38bff', ['Ametist','Funnen i Brasilien','Forntida greker trodde att ametist skyddade mot berusning. Museet har valt att inte testa påståendet.']);
  crystal(MI.c.x + 4, MI.c.z + 1, '#7dff9e', ['Fluorit','Lyser under UV-ljus','Kristallen lyser grönt i mörker. Därför har vi släckt i salen, inte för att spara el.']);
  meteor(MI.c.x - 4, MI.c.z + 1, ['Meteoriten från Ystad','Föll 1878','Väger 41 kilo och består mest av järn och nickel. Bonden som hittade den använde den som dörrstopp i tolv år.']);
  star('mineral', MI.c.x - 5.9, .35, MI.c.z + 5.9, true);
  // Egyptiska salen
  sarcophagus(EG.c.x - 5.2, EG.c.z - 5.0, .5, ['Sarkofag åt Neferet','Nya riket, ca 1300 f.Kr.','Neferet var skrivare vid templet. Inskriptionen ber besökaren att säga hennes namn högt, så att hon aldrig glöms bort. Säg det gärna nu.']);
  sarcophagus(EG.c.x - 6.0, EG.c.z + 1.0, Math.PI/2, ['Sarkofag åt Ptahmose','Nya riket, ca 1250 f.Kr.','Ptahmose var bagare. Bland gravgåvorna fanns 31 limpor, vilket säger något om hans prioriteringar.']);
  { const a = glyphSvg(4, 5, 9); const pa = plane(1.6, 1.6 * a.h / a.w, svgTex(a.svg, a.w, a.h)); onWall(pa, EG, 'n', -3.8, 2.1, .03);
    const p = inFront(EG, 'n', -3.8, 1.1); interact({x:p.x, z:p.z, info:['Hieroglyfer','Kopia av tempelvägg','Översatt lyder texten ungefär: ”Den som söker sex stjärnor ska finna en krona.” Konstigt sammanträffande.']}); }
  { const a = glyphSvg(5, 3, 17); const pa = plane(2.0, 2.0 * a.h / a.w, svgTex(a.svg, a.w, a.h)); onWall(pa, EG, 'n', 3.8, 2.3, .03);
    const p = inFront(EG, 'n', 3.8, 1.1); interact({x:p.x, z:p.z, info:['Offerlista','Kalksten','En lista över gåvor till gudarna: bröd, öl, gäss och tre korgar fikon. Gudarna verkar ha varit hungriga.']}); }
  urn(EG.c.x + 4.3, EG.c.z - 4.6, 1, '#a8552f', ['Kanopisk kruka','Lera, ca 1100 f.Kr.','Användes vid balsamering. Den här är tom, sägs det.']);
  urn(EG.c.x + 5.6, EG.c.z - 3.4, .8, '#3f6f7d', ['Kruka med lock','Fajans','Den blåa glasyren har behållit färgen i 3000 år, bättre än de flesta köksmöbler.']);
  star('egypt', EG.c.x + 3.8, 3.25, EG.c.z - 6.55);
  // Skattkammaren
  { const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), new THREE.MeshStandardMaterial({map: canvasTex(64, 256, (g) => { g.fillStyle = '#8c1f30'; g.fillRect(0,0,64,256); g.fillStyle = '#e2b552'; g.fillRect(3,0,3,256); g.fillRect(58,0,3,256); })}));
    runner.rotation.x = -Math.PI/2; add(runner, S.c.x, .01, S.c.z + 2.4); }
  crown(S.c.x, S.c.z - 2.5, ['Aurorakronan','Guld, rubin och nordsken','Museets största skatt. Du hittade den!']);
  chest(S.c.x - 4.2, S.c.z - 4.2, .5, ['Kistan','Sjörövarbyte, 1600-tal','Fylld med mynt från ett dussin länder. Den beslagtogs från en kapten som inte kunde förklara var han fått dem ifrån.']);
  chest(S.c.x + 4.2, S.c.z - 4.2, -.5, ['Kistan','Okänd ägare','Lappen på locket säger: ”Rör ej. Gäller även nattvakter.”']);
  drawLockSign(0);
}

// ---------------------------------------------------------------- the guard
function buildGuard(){
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const navy = M('#2f3f6b'), dark = M('#1d2744'), pants = M('#1f2433'), skin = M('#f0c9a0'), shoe = M('#111');
  const mkLimb = (len, w, mat, y, x) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); const m = box(w, len, w, mat); m.position.y = -len/2; piv.add(m); body.add(piv); return piv; };
  const legL = mkLimb(.82, .17, pants, .86, -.11), legR = mkLimb(.82, .17, pants, .86, .11);
  for (const l of [legL, legR]){ const s = box(.18, .08, .28, shoe); s.position.set(0, -.8, .05); l.add(s); }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .42, 6, 12), navy); torso.scale.z = .7; torso.position.y = 1.2; body.add(torso);
  add(box(.5, .07, .36, dark), 0, .97, 0, body);
  add(box(.08, .08, .02, GOLD), .1, 1.33, .17, body);
  const armL = mkLimb(.62, .13, navy, 1.47, -.32), armR = mkLimb(.62, .13, navy, 1.47, .32);
  for (const a of [armL, armR]){ const h = sph(.07, skin); h.position.y = -.65; a.add(h); }
  const torch = cyl(.045, .055, .26, M('#444', {metalness:.6})); torch.rotation.x = Math.PI/2; torch.position.set(0, -.66, .12); armR.add(torch);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.045, 16), new THREE.MeshBasicMaterial({color:'#fff6cc'})); lens.position.set(0, -.66, .251); armR.add(lens);
  const head = new THREE.Group(); head.position.y = 1.83; body.add(head);
  // photo face: projected straight on from the front so it is not stretched, on a slightly oval head
  const face = new THREE.TextureLoader().load('assets/player-head.jpg', () => { loaded++; progress(); }, undefined, () => { loaded++; progress(); }); pending++;
  face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = 8; face.repeat.set(.455, .57); face.offset.set(.274, .262);
  const HR = .23, HS = [.72, 1.05, .88];
  const faceGeo = new THREE.SphereGeometry(HR, 48, 32, 0, Math.PI), fp = faceGeo.attributes.position, fuv = faceGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, .5 + fp.getX(i) / (2 * HR), .5 + fp.getY(i) / (2 * HR));
  const faceMesh = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({map: face, emissive:'#ffffff', emissiveMap: face, emissiveIntensity:.5, roughness:.9}));
  faceMesh.scale.set(...HS); head.add(faceMesh);
  const backMesh = new THREE.Mesh(new THREE.SphereGeometry(HR, 48, 32, Math.PI, Math.PI), M('#6b4a2e')); backMesh.scale.set(...HS); head.add(backMesh);
  const cap = cyl(.155, .175, .07, dark, 24); cap.position.y = .225; head.add(cap);
  add(cyl(.18, .18, .02, M('#e2b552'), 24), 0, .195, 0, head);
  const visor = box(.26, .02, .12, dark); visor.position.set(0, .2, .17); visor.rotation.x = -.15; head.add(visor);
  const neck = cyl(.07, .08, .12, skin, 12); neck.position.y = 1.62; body.add(neck);
  const stump = cyl(.075, .075, .02, M('#c23b3b'), 12); stump.position.y = 1.69; stump.visible = false; body.add(stump);
  // flashlight
  const spot = new THREE.SpotLight('#fff3c4', 18, 16, .42, .55, 1.6); spot.position.set(.32, 1.0, .3); g.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.set(.32, .4, 5); g.add(tgt); spot.target = tgt;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshBasicMaterial({color:'#000', transparent:true, opacity:.35, depthWrite:false}));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = .015; g.add(shadow);
  scene.add(g);
  return {g, body, legL, legR, armL, armR, head, stump, spot};
}

// ---------------------------------------------------------------- state
const guard = buildGuard();
const S = {state:'loading', room:null, visited:new Set(), stars:0, t0:0, tEnd:0, sound:true, yaw:0, pitch:.32, heading:Math.PI, walk:0, alarm:false, shake:0, cine:null};
const pos = new THREE.Vector3();
function resetGame(){
  pos.set(ROOMS.entre.c.x, 0, ROOMS.entre.c.z + 3); S.heading = Math.PI; S.yaw = 0; S.pitch = .32;
  guard.body.rotation.set(0, 0, 0); guard.body.position.set(0, 0, 0); guard.head.visible = true; guard.stump.visible = false;
  stars.forEach(s => { s.taken = false; s.g.visible = true; }); S.stars = 0;
  closeVault(); drawLockSign(0);
  dino.skull.visible = true; dino.skull.scale.setScalar(1); dino.head.visible = false; dino.head.scale.setScalar(.001); dino.neckRod.visible = false;
  dino.button.position.y = dino.buttonY;
  S.alarm = false; $('redFlash').classList.remove('on'); ROOMS.natur.lamp.color.copy(ROOMS.natur.lampColor);
  S.visited = new Set(); S.room = null; S.cine = null; S.shake = 0;
  ['gameover','win','mapOverlay','intro'].forEach(id => $(id).hidden = true);
  hidePlaque(); $('starCount').textContent = 0; $('timer').textContent = '0:00';
  S.t0 = performance.now(); S.state = 'play';
  particles.forEach(p => scene.remove(p.m)); particles.length = 0;
}

// ---------------------------------------------------------------- audio
let ac = null;
function tone(freqs, dur = .12, type = 'sine', vol = .08){
  if (!S.sound) return;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime;
    freqs.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t + i*dur); g.gain.linearRampToValueAtTime(vol, t + i*dur + .01); g.gain.exponentialRampToValueAtTime(.0001, t + i*dur + dur*1.8); o.connect(g).connect(ac.destination); o.start(t + i*dur); o.stop(t + i*dur + dur*2); });
  } catch (e) {}
}
const sfx = {
  star: () => tone([880, 1175, 1568], .09, 'triangle', .09),
  vault: () => tone([110, 98, 82, 73], .25, 'sawtooth', .05),
  click: () => tone([660], .05, 'triangle', .04),
  win: () => tone([523, 659, 784, 1047, 1319], .12, 'triangle', .1),
  alarm: () => tone([660, 440, 660, 440, 660, 440, 660, 440], .22, 'sawtooth', .05),
  growl: () => tone([70, 60, 52], .22, 'sawtooth', .1),
  chomp: () => tone([200, 90, 55], .06, 'square', .14),
  sad: () => tone([392, 330, 262, 196], .22, 'triangle', .08),
};

// ---------------------------------------------------------------- UI
let plaqueFor = null;
function showPlaque(t, m, x, src = null){ $('plaqueTitle').textContent = t; $('plaqueMeta').textContent = m; $('plaqueText').textContent = x; $('plaque').classList.add('show'); plaqueFor = src; }
function hidePlaque(){ $('plaque').classList.remove('show'); plaqueFor = null; }
$('plaqueClose').addEventListener('click', hidePlaque);
let toastTimer = 0;
function toast(name, sub){ const t = $('toast'); t.innerHTML = ''; const s = document.createElement('small'); s.textContent = sub; t.append(s, name); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }
const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const MAPPOS = {skatt:[1,0], mineral:[0,1], egypt:[1,1], natur:[0,2], entre:[1,2], konst:[2,2], modern:[3,2]};
function drawMap(){
  let h = ''; const cw = 25, ch = 100 / 3;
  LINKS.forEach(([a, , b]) => { if (!S.visited.has(a) && !S.visited.has(b)) return; const [ac, ar] = MAPPOS[a], [bc, br] = MAPPOS[b];
    if (ar === br) h += `<div class="mapline" style="left:${Math.min(ac, bc)*cw + cw/2}%;top:${ar*ch + ch/2 - .5}%;width:${cw}%;height:3px"></div>`;
    else h += `<div class="mapline" style="left:calc(${ac*cw + cw/2}% - 1.5px);top:${Math.min(ar, br)*ch + ch/2}%;width:3px;height:${ch}%"></div>`; });
  for (const [k, [c, rw]] of Object.entries(MAPPOS)){
    const seen = S.visited.has(k), cls = S.room === k ? 'here' : seen ? 'seen' : '';
    const st = stars.find(s => s.room === k); const mark = st ? (st.taken ? '★' : (seen ? '☆' : '')) : '';
    h += `<div class="mapcell ${cls}" style="left:${c*cw + 1}%;top:${rw*ch + 1.5}%"><span>${seen ? ROOMS[k].name : '?'}</span>${mark ? `<span class="s">${mark}</span>` : ''}</div>`;
  }
  $('mapGrid').innerHTML = h;
}
function toggleMap(force){
  const o = $('mapOverlay'), show = force ?? o.hidden;
  if (show){ if (S.state !== 'play') return; drawMap(); o.hidden = false; document.exitPointerLock?.(); S.state = 'map'; }
  else if (S.state === 'map'){ o.hidden = true; S.state = 'play'; }
}
$('mapBtn').addEventListener('click', () => toggleMap());
$('mapClose').addEventListener('click', () => toggleMap(false));
$('mapOverlay').addEventListener('click', e => { if (e.target.id === 'mapOverlay') toggleMap(false); });
$('soundBtn').addEventListener('click', () => { S.sound = !S.sound; $('soundBtn').textContent = S.sound ? 'Ljud på' : 'Ljud av'; $('soundBtn').setAttribute('aria-pressed', S.sound); });

function progress(){
  const el = $('startBtn');
  $('loading').textContent = loaded < pending ? `Laddar texturer ${loaded}/${pending}` : '';
  if (loaded >= pending && S.state === 'loading'){ el.disabled = false; el.textContent = 'Börja ronden'; S.state = 'intro'; }
}
function lock(){ if (matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.()?.catch?.(() => {}); }
$('startBtn').addEventListener('click', () => { resetGame(); lock(); });
$('retryBtn').addEventListener('click', () => { resetGame(); lock(); });
$('againBtn').addEventListener('click', () => { resetGame(); lock(); });
canvas.addEventListener('click', () => { if (S.state === 'play' && document.pointerLockElement !== canvas) lock(); canvas.focus(); });

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', e => {
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  keys[e.code] = true;
  if (['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' || e.code === 'Enter') use();
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'Escape'){ hidePlaque(); toggleMap(false); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function look(dx, dy){ if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return; // ignore the jump some browsers report right after pointer lock
  S.yaw -= dx * .0028; S.pitch = clamp(S.pitch + dy * .0022, -.15, .72); }
document.addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) look(e.movementX, e.movementY); else if (dragging) { look(e.clientX - dragging.x, e.clientY - dragging.y); dragging = {x: e.clientX, y: e.clientY}; } });
let dragging = null;
canvas.addEventListener('mousedown', e => { if (document.pointerLockElement !== canvas) dragging = {x: e.clientX, y: e.clientY}; });
addEventListener('mouseup', () => dragging = null);
// touch: joystick + look-drag
const joy = {x:0, y:0, id:null}, lookTouch = {id:null, x:0, y:0};
const stick = $('stick'), nub = $('nub');
stick.addEventListener('touchstart', e => { const t = e.changedTouches[0]; joy.id = t.identifier; moveJoy(t); e.preventDefault(); }, {passive:false});
function moveJoy(t){ const r = stick.getBoundingClientRect(); let dx = (t.clientX - (r.left + r.width/2)) / (r.width/2), dy = (t.clientY - (r.top + r.height/2)) / (r.height/2); const l = Math.hypot(dx, dy); if (l > 1){ dx /= l; dy /= l; } joy.x = dx; joy.y = -dy; nub.style.transform = `translate(${dx*36}px,${dy*36}px)`; }
canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; lookTouch.id = t.identifier; lookTouch.x = t.clientX; lookTouch.y = t.clientY; }, {passive:true});
addEventListener('touchmove', e => { for (const t of e.changedTouches){ if (t.identifier === joy.id) moveJoy(t); else if (t.identifier === lookTouch.id){ look((t.clientX - lookTouch.x) * 1.4, (t.clientY - lookTouch.y) * 1.4); lookTouch.x = t.clientX; lookTouch.y = t.clientY; } } if (e.target === canvas || e.target.closest('#stick')) e.preventDefault(); }, {passive:false});
addEventListener('touchend', e => { for (const t of e.changedTouches){ if (t.identifier === joy.id){ joy.id = null; joy.x = joy.y = 0; nub.style.transform = ''; } if (t.identifier === lookTouch.id) lookTouch.id = null; } });
$('useBtn').addEventListener('click', () => use());

// ---------------------------------------------------------------- interaction
let near = null;
function use(){
  if (S.state !== 'play' || !near) return;
  if (near.use){ near.use(); return; }
  if (plaqueFor === near){ hidePlaque(); return; }
  sfx.click(); showPlaque(near.info[0], near.info[1], near.info[2], near);
}
function updatePrompt(){
  const p = $('prompt');
  if (S.state !== 'play' || !near){ p.classList.remove('show'); return; }
  const key = matchMedia('(pointer:coarse)').matches ? 'E' : 'E';
  let txt;
  if (near.danger) txt = 'Tryck på knappen (gör det inte!)';
  else if (near.use) txt = 'Ta kronan';
  else txt = (plaqueFor === near ? 'Stäng skylten: ' : 'Läs skylten: ') + near.info[0];
  p.innerHTML = ''; const k = document.createElement('kbd'); k.textContent = key; p.append(k, txt);
  p.classList.toggle('danger', !!near.danger); p.classList.add('show');
}

// ---------------------------------------------------------------- collisions
function collide(p, r){
  for (let it = 0; it < 2; it++) for (const s of solids){
    const qx = clamp(p.x, s.minX, s.maxX), qz = clamp(p.z, s.minZ, s.maxZ), dx = p.x - qx, dz = p.z - qz, d2 = dx*dx + dz*dz;
    if (d2 >= r*r) continue;
    if (d2 > 1e-9){ const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else { const o = [p.x - s.minX + r, s.maxX - p.x + r, p.z - s.minZ + r, s.maxZ - p.z + r], m = Math.min(...o), i = o.indexOf(m);
      if (i === 0) p.x -= m; else if (i === 1) p.x += m; else if (i === 2) p.z -= m; else p.z += m; }
  }
}

// ---------------------------------------------------------------- particles
const particles = [];
function burst(at, colors, n = 24, speed = 3){
  for (let i = 0; i < n; i++){
    const m = sph(.035 + Math.random() * .04, new THREE.MeshBasicMaterial({color: colors[i % colors.length]}), 6, 4); m.position.copy(at); scene.add(m);
    const v = new THREE.Vector3(Math.random() - .5, Math.random() * .9 + .2, Math.random() - .5).normalize().multiplyScalar(speed * (.5 + Math.random()));
    particles.push({m, v, life: 1 + Math.random() * .6});
  }
}

// ---------------------------------------------------------------- star + win
function collect(s){
  s.taken = true; s.g.visible = false; S.stars++; sfx.star(); burst(s.g.position.clone(), ['#ffd34d', '#fff3c4'], 18, 2);
  $('starCount').textContent = S.stars; drawLockSign(S.stars);
  if (S.stars === STAR_TOTAL){ openVault(); showPlaque('Alla stjärnor hittade!', 'Ett avlägset klick…', 'Du hör ett tungt lås öppnas i Egyptiska salen. Valvet till skattkammaren står öppet.'); }
  else showPlaque('Guldstjärna!', `${S.stars} av ${STAR_TOTAL}`, 'Du stoppar stjärnan i fickan. Fortsätt leta i de andra salarna.');
}
function win(){
  if (S.state !== 'play') return; S.state = 'won'; S.tEnd = performance.now(); sfx.win(); hidePlaque(); document.exitPointerLock?.();
  burst(new THREE.Vector3(ROOMS.skatt.c.x, 2.2, ROOMS.skatt.c.z - 2.5), ['#ffd34d', '#ff5a5f', '#3c91e6', '#3cb371', '#fff'], 80, 4);
  $('winText').textContent = `Du hittade alla ${STAR_TOTAL} guldstjärnor, öppnade valvet och räddade Aurorakronan på ${fmt(S.tEnd - S.t0)}.`;
  setTimeout(() => $('win').hidden = false, 1200);
}

// ---------------------------------------------------------------- doom
async function doom(){
  if (S.state !== 'play') return;
  S.state = 'doom'; hidePlaque(); near = null; updatePrompt(); document.exitPointerLock?.();
  const headRest = dino.headRest.clone();
  // look at the button, press it
  dino.button.position.y = dino.buttonY - .05; tone([90], .08, 'square', .06);
  // cinematic side camera
  const m = new THREE.Vector3((pos.x + headRest.x) / 2, 1.8, (pos.z + headRest.z) / 2);
  const dir = new THREE.Vector3(headRest.x - pos.x, 0, headRest.z - pos.z).normalize();
  let perp = new THREE.Vector3(dir.z, 0, -dir.x); const toC = new THREE.Vector3(ROOMS.natur.c.x - m.x, 0, ROOMS.natur.c.z - m.z);
  if (perp.dot(toC) < 0) perp.negate();
  m.addScaledVector(dir, .6); S.cine = {pos: m.clone().addScaledVector(perp, 7.2).add(new THREE.Vector3(0, 1.3, 0)), look: m};
  await wait(300);
  S.alarm = true; $('redFlash').classList.add('on'); sfx.alarm();
  showPlaque('Oj.', 'Du tryckte på knappen', 'Det stod faktiskt KLICKA INTE.');
  // the guard turns to face the dinosaur
  const h0 = S.heading, h1 = Math.atan2(headRest.x - pos.x, headRest.z - pos.z);
  let dh = ((h1 - h0 + Math.PI) % TAU + TAU) % TAU - Math.PI;
  await tween(500, k => { S.heading = h0 + dh * ease(k); });
  await wait(400);
  // the skull becomes the photo
  await tween(300, k => dino.skull.scale.setScalar(1 - k)); dino.skull.visible = false;
  sfx.growl(); dino.head.visible = true; dino.head.position.copy(headRest);
  await tween(550, k => dino.head.scale.setScalar(Math.max(.001, backOut(k))));
  hidePlaque();
  await wait(800);
  // lunge
  const target = new THREE.Vector3(pos.x, 1.85, pos.z);
  const setNeck = (p) => { const a = dino.neckBase, d = new THREE.Vector3().subVectors(p, a), len = d.length(); dino.neckRod.visible = true; dino.neckRod.position.copy(a).addScaledVector(d, .5); dino.neckRod.scale.set(1, len, 1); dino.neckRod.quaternion.setFromUnitVectors(UP, d.normalize()); };
  await tween(320, k => { const e = ease(k); dino.head.position.lerpVectors(headRest, target, e); dino.head.scale.setScalar(1 + .25 * e); setNeck(dino.head.position); });
  // chomp
  guard.head.visible = false; guard.stump.visible = true; sfx.chomp(); S.shake = .5;
  burst(target.clone(), ['#ffffff', '#ffd6d6', '#f2c14e', '#ff8080'], 30, 3.5);
  await wait(250);
  const back = tween(650, k => { const e = ease(k); dino.head.position.lerpVectors(target, headRest, e); dino.head.scale.setScalar(1.25 - .25 * e); setNeck(dino.head.position); });
  const fall = tween(800, k => { guard.body.rotation.x = -Math.PI/2 * ease(k) * .98; guard.body.position.y = .12 * Math.sin(k * Math.PI); });
  await Promise.all([back, fall]); dino.neckRod.visible = false;
  sfx.sad();
  await wait(1100);
  S.alarm = false; $('redFlash').classList.remove('on');
  S.state = 'dead'; $('gameover').hidden = false;
}

// ---------------------------------------------------------------- loop
const ray = new THREE.Raycaster(), camTarget = new THREE.Vector3(), camDir = new THREE.Vector3(), tmp = new THREE.Vector3();
let last = performance.now(), noiseT = 0;
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  // movement
  let mx = 0, mz = 0, moving = false, speed = 0;
  if (S.state === 'play'){
    if (keys.KeyW || keys.ArrowUp) mz += 1; if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    mx += joy.x; mz += joy.y;
    const l = Math.hypot(mx, mz);
    if (l > .1){
      if (l > 1){ mx /= l; mz /= l; }
      const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
      const vx = fx * mz + rx * mx, vz = fz * mz + rz * mx;
      speed = (keys.ShiftLeft || keys.ShiftRight ? 5.6 : 3.2) * Math.min(1, l);
      pos.x += vx * speed * dt; pos.z += vz * speed * dt; collide(pos, .35);
      const target = Math.atan2(vx, vz); let d = ((target - S.heading + Math.PI) % TAU + TAU) % TAU - Math.PI; S.heading += d * Math.min(1, dt * 12);
      moving = true;
    }
    // room
    const r = roomAt(pos.x, pos.z);
    if (r && r.key !== S.room){ S.room = r.key; S.visited.add(r.key); $('roomTitle').textContent = r.name; $('roomSub').textContent = 'Museum Aurora · ' + r.sub; toast(r.name, r.sub); }
    // stars
    for (const s of stars) if (!s.taken && Math.hypot(s.x - pos.x, s.z - pos.z) < 1.2) collect(s);
    // nearest interactable
    let best = null, bd = 1e9;
    for (const it of interactables){ const d = Math.hypot(it.x - pos.x, it.z - pos.z); if (d < it.r && d < bd){ bd = d; best = it; } }
    near = best;
    if (plaqueFor && Math.hypot(plaqueFor.x - pos.x, plaqueFor.z - pos.z) > plaqueFor.r + .8) hidePlaque();
    $('timer').textContent = fmt(now - S.t0);
  }
  updatePrompt();
  // guard animation
  guard.g.position.copy(pos); guard.g.rotation.y = S.heading;
  if (moving){ S.walk += dt * speed * 2.6; } else S.walk *= Math.pow(.001, dt);
  const sw = moving ? Math.sin(S.walk) * .65 : Math.sin(S.walk) * .65 * Math.min(1, Math.abs(S.walk));
  if (S.state !== 'dead' && S.state !== 'doom' || moving){
    guard.legL.rotation.x = sw; guard.legR.rotation.x = -sw; guard.armL.rotation.x = -sw * .8; guard.armR.rotation.x = .5 + sw * .3;
    guard.body.position.y = moving ? Math.abs(Math.cos(S.walk)) * .04 : 0;
  }
  if (S.state === 'doom' && guard.head.visible){ guard.armL.rotation.x = -.4 + Math.sin(t * 30) * .05; guard.armR.rotation.x = .9; }
  // camera
  if (S.cine){
    camera.position.lerp(S.cine.pos, 1 - Math.exp(-dt * 4)); camera.lookAt(S.cine.look);
  } else {
    camTarget.set(pos.x, 1.5, pos.z);
    camDir.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch));
    let dist = 4.2; ray.set(camTarget, camDir); ray.far = dist;
    const hits = ray.intersectObjects(camBlockers, false); if (hits.length) dist = Math.max(.6, hits[0].distance - .25);
    camera.position.copy(camTarget).addScaledVector(camDir, dist); camera.position.y = Math.min(camera.position.y, WH - .25);
    camera.lookAt(camTarget);
  }
  if (S.shake > 0){ S.shake -= dt; const a = S.shake * .35; camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a; }
  // world animation
  for (const s of stars) if (!s.taken){ s.g.rotation.y = t * 2; s.g.position.y = s.y + Math.sin(t * 2.4 + s.x) * .05; }
  for (const sp of spinners) sp.obj.rotation.y += sp.speed * dt;
  for (const p of pulsers) p.light.intensity = p.base * (p.fast ? (.6 + .4 * Math.abs(Math.sin(t * 4 + p.phase))) : (.8 + .2 * Math.sin(t * 1.5 + p.phase)));
  for (const g of swayers) g.rotation.z = Math.sin(t * .8) * .02;
  if (vault && !vault.open) vault.wheel.rotation.z = Math.sin(t * .5) * .05;
  noiseT -= dt;
  if (noiseT < 0){ noiseT = .07; for (const n of noiseScreens){ const g = n.canvas.getContext('2d'), d = g.createImageData(96, 60); for (let i = 0; i < d.data.length; i += 4){ const v = Math.random() * 200 + 30; d.data[i] = v * .9; d.data[i+1] = v * .95; d.data[i+2] = v; d.data[i+3] = 255; } g.putImageData(d, 0, 0); n.tex.needsUpdate = true; } }
  if (S.alarm){ const k = .5 + .5 * Math.sin(t * 14); ROOMS.natur.lamp.color.setRGB(1, .15 + .2 * k, .15 + .2 * k); ROOMS.natur.lamp.intensity = ROOMS.natur.li * (.6 + .6 * k); }
  else { ROOMS.natur.lamp.color.copy(ROOMS.natur.lampColor); ROOMS.natur.lamp.intensity = ROOMS.natur.li; }
  if (dino.head && dino.head.visible) dino.head.quaternion.copy(camera.quaternion);
  for (let i = particles.length - 1; i >= 0; i--){ const p = particles[i]; p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < .03){ p.m.position.y = .03; p.v.multiplyScalar(.5); p.v.y *= -.4; } if (p.life <= 0){ scene.remove(p.m); particles.splice(i, 1); } }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
populate();
$('starTotal').textContent = STAR_TOTAL;
pos.set(ROOMS.entre.c.x, 0, ROOMS.entre.c.z + 3);
progress();
requestAnimationFrame(frame);
// small hook for automated tests
window.__museum = {S, pos, stars, ROOMS, setTimeScale(v){ TS = v; }, teleport(x, z, yaw){ pos.x = x; pos.z = z; if (yaw !== undefined) S.yaw = yaw; }, use, doom, near: () => near};
