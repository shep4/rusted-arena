'use strict';
/* ============================== AUDIO =================================== */
const AUDIO = (() => {
  let ctx = null, master = null;
  function init() { if (ctx) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination); }
  function resume() { try { init(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} }
  function noise(dur, vol, hp, lp) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(h); h.connect(l); l.connect(g); g.connect(master); src.start();
  }
  function tone(freq, dur, vol, type, slide) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
  }
  return {
    resume,
    shot(w, vol = 1) { const heavy = clamp(w.dmg / 100, 0.1, 1); noise(0.07 + heavy * 0.22, 0.75 * vol, 220 - heavy * 160, 6500); tone(130 - heavy * 70, 0.1 + heavy * 0.18, 0.5 * vol, 'triangle', -70); },
    melee(vol = 1) { noise(0.12, 0.4 * vol, 1500, 9000); tone(320, 0.08, 0.2 * vol, 'sine', -220); },
    reload() { tone(900, 0.05, 0.15); setTimeout(() => tone(600, 0.06, 0.15), 130); setTimeout(() => tone(1200, 0.04, 0.12), 320); },
    hit() { tone(1800, 0.05, 0.25, 'square', -400); },
    headshot() { tone(2400, 0.08, 0.3, 'square', -900); },
    death() { tone(220, 0.55, 0.4, 'sawtooth', -180); noise(0.4, 0.3, 100, 2000); },
    advance() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.22, 'triangle'), i * 90)); },
    step(vol = 1) { noise(0.05, 0.12 * vol, 300, 2500); },
    jump() { noise(0.1, 0.15, 300, 3000); },
    land() { noise(0.12, 0.25, 100, 1500); },
    click() { tone(1000, 0.04, 0.15); },
    count() { tone(880, 0.12, 0.25); },
    go() { tone(1320, 0.35, 0.3); },
    hurt() { tone(160, 0.12, 0.3, 'sawtooth', -60); },
    hitLimb() { tone(900, 0.06, 0.22, 'square', -300); },
    shell() { tone(2600 + Math.random() * 800, 0.05, 0.05, 'triangle', -900); },
    ads() { tone(700, 0.03, 0.06, 'square'); },
    impact(vol = 0.3) { noise(0.06, vol, 500, 4000); },
  };
})();

