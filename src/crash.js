// Vad som händer när någon trycker på knappen.
// Faser: larm → tändning → alla flygplan lyfter genom taket → glitch → WebGL-kontexten dör på riktigt.
import * as THREE from 'three';

const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

class CrashAudio {
  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    // Siren: fyrkantsvåg som sveper upp och ner
    const siren = ctx.createOscillator();
    siren.type = 'square';
    siren.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(siren.frequency);
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.06;
    siren.connect(sirenGain).connect(this.master);
    siren.start(); lfo.start();

    // Jetmuller: brus genom lågpassfilter som öppnas när motorerna tänds
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 120;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    noise.connect(this.filter).connect(this.rumble).connect(this.master);
    noise.start();
  }

  update(t) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.rumble.gain.setTargetAtTime(smooth(1.2, 4, t) * 1.1, now, 0.1);
    this.filter.frequency.setTargetAtTime(120 + smooth(1.2, 6, t) * 2400, now, 0.1);
  }

  /** Allt ljud dör tvärt, följt av ett sorgset felpip. */
  die() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0, ctx.currentTime);
    const out = ctx.createGain();
    out.gain.value = 0.25;
    out.connect(ctx.destination);
    [[523, 0.0], [392, 0.18], [262, 0.36]].forEach(([f, dt]) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + 0.35 + dt;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 0.55);
    });
    setTimeout(() => ctx.close(), 2000);
  }
}

export class CrashSequence {
  constructor({ renderer, camera, museum, bloomPass, hud, onDead }) {
    Object.assign(this, { renderer, camera, museum, bloomPass, hud, onDead });
    this.active = false;
    this.dead = false;
    this.t = 0;
    this.shake = new THREE.Vector3();
    this.audio = new CrashAudio();
    this.baseFov = camera.fov;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.museum.button.pressed = true;
    try { this.audio.start(); } catch (e) { console.warn('Inget ljud:', e); }

    this.museum.aircraft.forEach((a, i) => {
      a.rotation.order = 'YXZ'; // så att nosen tippar upp i planets egen riktning
      a.userData.vy = 0;
      a.userData.delay = 2.0 + i * 0.35;
      a.userData.spin = (Math.random() - 0.5) * 1.5;
    });
    this.museum.flyers.forEach((f) => {
      f.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      f.userData.rot = new THREE.Vector3(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
      f.userData.delay = 3.0 + Math.random() * 1.5;
    });
  }

  /** Visa varningstexter i HUD:en. */
  message(t) {
    if (t < 1.2) return '⚠ OBEHÖRIG KNAPPTRYCKNING REGISTRERAD';
    if (t < 2.4) return '⚠ EFTERBRÄNNKAMMARE TÄND I UTSTÄLLNINGSHALLEN';
    if (t < 4.2) return '⚠ SAMTLIGA FLYGPLAN LÄMNAR MUSEET';
    if (t < 5.4) return '⚠ TAKET ÄR INTE LÄNGRE ETT PROBLEM';
    return '⚠ MUSEET.EXE SVARAR INTE';
  }

  update(dt) {
    if (!this.active || this.dead) return;
    const t = (this.t += dt);
    const { aircraft, flyers, alarm } = this.museum;

    // Larm
    const on = Math.sin(t * 11) > 0;
    alarm.lights.forEach((l) => (l.intensity = on ? 90 : 0));
    alarm.beaconMat.color.setRGB(on ? 6 : 0.2, on ? 0.3 : 0.02, on ? 0.3 : 0.02);
    this.hud.setAlert(this.message(t), on);

    // Motorer tänds, planen vibrerar och lyfter
    for (const a of aircraft) {
      const { flames, body } = a.userData;
      const ign = t > 1.2;
      flames.forEach((f, i) => {
        f.visible = ign;
        const flicker = 0.85 + Math.random() * 0.3;
        const grow = smooth(1.2, 2.2, t);
        f.scale.set(flicker, flicker, grow * flicker * (i ? 1 : 1.3));
      });
      if (ign) body.position.x = (Math.random() - 0.5) * 0.04 * smooth(1.2, 2, t);
      if (t > a.userData.delay) {
        a.userData.vy += dt * 6;
        a.position.y += a.userData.vy * dt;
        a.rotation.x = Math.max(-1.1, a.rotation.x - dt * 0.45); // nosen upp
        a.rotation.z += a.userData.spin * dt;
      }
    }

    // Lösa föremål sugs med i luftströmmen
    for (const f of flyers) {
      if (t < f.userData.delay) continue;
      const v = f.userData.vel;
      v.y += dt * 9;
      f.position.addScaledVector(v, dt);
      f.rotation.x += f.userData.rot.x * dt;
      f.rotation.y += f.userData.rot.y * dt;
      f.rotation.z += f.userData.rot.z * dt;
    }

    // Kameraskak, FOV-warp, bloom och överexponering
    const amp = smooth(1.0, 6.0, t) * 0.18;
    this.shake.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    this.camera.fov = this.baseFov + smooth(3.5, 6.6, t) * 50;
    this.camera.updateProjectionMatrix();
    this.bloomPass.strength = 0.35 + smooth(1.5, 4, t) * 0.5 + smooth(5, 6.7, t) * 2.2;
    this.renderer.toneMappingExposure = 1 + smooth(5.3, 6.8, t) * 3.5;
    this.audio.update(t);

    // Glitcheffekt på själva <canvas>
    const canvas = this.renderer.domElement;
    if (t > 5.2) {
      const k = smooth(5.2, 6.6, t);
      canvas.style.filter = `hue-rotate(${Math.floor(Math.random() * 360 * k)}deg) saturate(${1 + k * 4}) contrast(${1 + k})`;
      canvas.style.transform = `translate(${(Math.random() - 0.5) * 40 * k}px, ${(Math.random() - 0.5) * 20 * k}px) skewX(${(Math.random() - 0.5) * 12 * k}deg)`;
    }

    if (t > 6.8) this.die();
  }

  die() {
    this.dead = true;
    this.audio.die();
    const canvas = this.renderer.domElement;
    canvas.style.filter = '';
    canvas.style.transform = '';
    this.renderer.setAnimationLoop(null);

    // Den riktiga kraschen: vi ber grafikkortet att glömma hela museet.
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    this.renderer.dispose();

    this.onDead?.();
    setTimeout(() => {
      throw new Error('SAAB-museet kraschade: FÖR_MYCKET_DRAGKRAFT (0xJAS39). Någon tryckte på knappen.');
    }, 0);
  }
}
