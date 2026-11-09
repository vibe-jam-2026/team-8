// SAAB-museet — ett förstapersonsspel i webbläsaren (Three.js / WebGL).
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildMuseum } from './museum.js';
import { CrashSequence } from './crash.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const EYE = 1.7;

// ---------- Renderare (GPU) ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1014);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);
const museum = buildMuseum(scene);
camera.position.copy(museum.spawn);
camera.lookAt(0, EYE, 0);

// Efterbehandling: MSAA + bloom så att lysrör, kanter och flammor glöder
const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.92);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Visa vilket grafikkort som renderar, om webbläsaren berättar det
try {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  if (gpu) $('#gpu').textContent = `Renderas på: ${gpu}`;
} catch { /* spelar ingen roll */ }

// ---------- HUD ----------
const hud = {
  setAlert(text, on) {
    const el = $('#alert');
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('on', on);
  },
};

// ---------- Styrning ----------
const controls = new PointerLockControls(camera, document.body);
const overlay = $('#overlay');
let crash; // skapas nedan

overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => {
  if (crash?.dead) return;
  $('#overlay-title').textContent = 'Pausat';
  $('#overlay-cta').textContent = 'Klicka för att fortsätta';
  overlay.classList.remove('hidden');
});

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryPress();
});
window.addEventListener('keyup', (e) => (keys[e.code] = false));
window.addEventListener('mousedown', () => { if (controls.isLocked) tryPress(); });

const vel = new THREE.Vector2(); // x = höger, y = framåt
let bob = 0;

function collide(p) {
  for (const c of museum.colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz), min = c.r + 0.35;
    if (d < min && d > 1e-4) {
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
    }
  }
  const b = museum.bounds;
  p.x = Math.min(b.maxX, Math.max(b.minX, p.x));
  p.z = Math.min(b.maxZ, Math.max(b.minZ, p.z));
}

function updatePlayer(dt) {
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const right = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const speed = keys.ShiftLeft || keys.ShiftRight ? 7.5 : 4.2;
  const want = new THREE.Vector2(right, fwd);
  if (want.lengthSq() > 1) want.normalize();
  want.multiplyScalar(speed);
  const k = 1 - Math.exp(-12 * dt);
  vel.x += (want.x - vel.x) * k;
  vel.y += (want.y - vel.y) * k;

  controls.moveRight(vel.x * dt);
  controls.moveForward(vel.y * dt);
  collide(camera.position);

  const sp = vel.length();
  bob += dt * sp * 2.3;
  camera.position.y = EYE + Math.sin(bob) * 0.035 * Math.min(1, sp / 4);
}

// ---------- Knappen ----------
const look = new THREE.Vector3(), toButton = new THREE.Vector3();
function canPress() {
  if (museum.button.pressed) return false;
  const bp = museum.button.worldPos;
  if (Math.hypot(camera.position.x - bp.x, camera.position.z - bp.z) > 2.6) return false;
  camera.getWorldDirection(look);
  toButton.copy(bp).sub(camera.position).normalize();
  return look.dot(toButton) > 0.75;
}

function tryPress() {
  if (canPress()) crash.start();
}

crash = new CrashSequence({
  renderer, camera, museum, bloomPass, hud,
  onDead() {
    $('#alert').hidden = true;
    $('#prompt').hidden = true;
    $('#crosshair').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('#crash').hidden = false;
  },
});
$('#restart').addEventListener('click', () => location.reload());

// ---------- Spelloopen ----------
const clock = new THREE.Clock();
let frames = 0, fpsTime = 0;
const demo = params.has('view'); // för skärmdumpar/test: ?view=x,y,z,lx,ly,lz

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (controls.isLocked) updatePlayer(dt);
  museum.button.update(t);
  $('#prompt').hidden = !canPress();
  crash.update(dt);
  if (crash.dead) return;

  camera.position.add(crash.shake);
  composer.render();
  camera.position.sub(crash.shake);

  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    $('#fps').textContent = `${Math.round(frames / fpsTime)} fps`;
    frames = 0;
    fpsTime = 0;
  }
}

if (demo) {
  const v = params.get('view').split(',').map(Number);
  camera.position.set(v[0], v[1], v[2]);
  camera.lookAt(v[3], v[4], v[5]);
  overlay.classList.add('hidden');
  if (params.has('crash')) {
    crash.start();
    const steps = Math.round(Number(params.get('crash')) * 60);
    for (let i = 0; i < steps && !crash.dead; i++) crash.update(1 / 60);
  }
}

renderer.setAnimationLoop(tick);
