'use strict';
/* ============================== AUDIO ===================================
   Procedural WebAudio. Gunshots are three layers (crack transient, body tone, filtered tail) with distance attenuation
   and low-pass; footsteps vary by surface and pace; reload/bolt/pump/shell mechanics; hit sounds by zone. No samples. */
const AUDIO = (() => {
  let ctx = null, master = null;
  function init() { if (ctx) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination); }
  function resume() { try { init(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function noise(dur, vol, hp, lp, delay = 0, decayPow = 1) {
    if (!ctx || vol <= 0.001) return;
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decayPow);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(h); h.connect(l); l.connect(g); g.connect(master); src.start(ctx.currentTime + delay);
  }
  function tone(freq, dur, vol, type = 'square', slide = 0, delay = 0) {
    if (!ctx || vol <= 0.001) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; const t0 = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur);
  }
  return {
    resume,
    // dist 0 = own weapon. Far shots lose volume and high end; near shots keep the transient and bass.
    shot(w, dist = 0) {
      const p = w.snd || { body: 120, crack: 0.9, tail: 0.2 }; const att = clamp(1.25 - dist / 55, 0.06, 1), lp = clamp(9000 - dist * 140, 900, 9000);
      noise(0.03 + p.tail * 0.1, 0.8 * p.crack * att, 900, lp);                          // crack
      tone(p.body, 0.09 + p.tail * 0.3, 0.55 * att, 'triangle', -p.body * 0.55);          // body
      noise(0.18 + p.tail * 0.9, 0.35 * att * (0.6 + p.tail), 80, Math.min(lp, 2500), 0.01, 2.2); // tail
      if (dist > 20) noise(0.25, 0.12 * att, 60, 500, 0.03, 1.5);                         // distant rumble
    },
    melee(vol = 1) { noise(0.12, 0.4 * vol, 1500, 9000); tone(320, 0.08, 0.2 * vol, 'sine', -220); },
    dryFire() { tone(1400, 0.03, 0.12, 'square', -400); },
    reloadStart(w) { tone(700, 0.04, 0.12, 'square'); },
    magOut() { tone(520, 0.05, 0.16, 'square', -200); noise(0.05, 0.12, 400, 2500); },
    magIn() { tone(380, 0.06, 0.2, 'square', 150); noise(0.06, 0.16, 300, 2000, 0.02); },
    chamber() { tone(900, 0.04, 0.14, 'square', -300); tone(600, 0.05, 0.14, 'square', -100, 0.08); },
    bolt() { tone(1100, 0.04, 0.14, 'square', -500); noise(0.05, 0.1, 800, 4000); tone(700, 0.05, 0.14, 'square', -200, 0.16); },
    pump() { noise(0.06, 0.22, 500, 3000); tone(300, 0.06, 0.16, 'square', -120); noise(0.05, 0.18, 500, 2800, 0.16); },
    shellIn() { tone(1500, 0.03, 0.1, 'square', -600); noise(0.03, 0.08, 1500, 5000); },
    raise() { noise(0.04, 0.08, 400, 2500); },
    hit() { tone(1800, 0.05, 0.25, 'square', -400); },
    headshot() { tone(2400, 0.08, 0.3, 'square', -900); tone(3200, 0.05, 0.12, 'square', -1200, 0.02); },
    hitLimb() { tone(900, 0.06, 0.22, 'square', -300); },
    killConfirm() { tone(1200, 0.08, 0.22, 'square', -300); tone(1800, 0.14, 0.22, 'square', -200, 0.07); },
    death() { tone(220, 0.55, 0.4, 'sawtooth', -180); noise(0.4, 0.3, 100, 2000); },
    advance() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.22, 'triangle'), i * 90)); },
    step(vol = 1, surface = 'sand', heavy = false) {
      if (surface === 'metal') { noise(0.05, 0.1 * vol, 600, 3500); tone(rnd(160, 220), 0.07, 0.08 * vol, 'triangle', -60); }
      else noise(0.06 + (heavy ? 0.03 : 0), (0.11 + (heavy ? 0.05 : 0)) * vol, rnd(250, 350), rnd(1800, 2600));
    },
    ladder() { noise(0.04, 0.14, 700, 3500); tone(rnd(400, 480), 0.05, 0.05, 'triangle', -100); },
    jump() { noise(0.1, 0.15, 300, 3000); },
    land(vol = 1) { noise(0.1 + 0.08 * vol, 0.18 + 0.3 * vol, 100, 1500 - 600 * vol); },
    click() { tone(1000, 0.04, 0.15); },
    count() { tone(880, 0.12, 0.25); },
    go() { tone(1320, 0.35, 0.3); },
    hurt() { tone(160, 0.12, 0.3, 'sawtooth', -60); },
    shell() { tone(2600 + Math.random() * 800, 0.05, 0.05, 'triangle', -900); },
    ads() { tone(700, 0.03, 0.06, 'square'); },
    impact(kind = 'metal', dist = 5) {
      const att = clamp(1.1 - dist / 40, 0.05, 0.6);
      if (kind === 'metal') { tone(rnd(1800, 2600), 0.06, 0.25 * att, 'square', -900); noise(0.04, 0.2 * att, 1500, 7000); }
      else if (kind === 'concrete') noise(0.07, 0.3 * att, 400, 4000);
      else if (kind === 'wood') { noise(0.06, 0.25 * att, 300, 2500); tone(rnd(300, 420), 0.05, 0.12 * att, 'triangle', -100); }
      else noise(0.08, 0.2 * att, 150, 1500);
    },
  };
})();
