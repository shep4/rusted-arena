'use strict';
/* ============================== FX ======================================
   Tracers, shell casings, impact dust, bullet decals, floating damage numbers. All pooled. */
const FX = (() => {
  const radial = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const puffTex = radial('rgba(215,195,150,0.85)', 'rgba(215,195,150,0)'), decalTex = radial('rgba(20,15,10,0.9)', 'rgba(20,15,10,0)');
  const tracers = [], puffs = [], decals = [], shells = [];
  for (let i = 0; i < 8; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9 })); l.visible = false; scene.add(l); tracers.push({ l, t: 0 }); }
  for (let i = 0; i < 24; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); puffs.push({ s, t: 0, vel: new THREE.Vector3() }); }
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: decalTex, transparent: true, depthWrite: false })); s.visible = false; s.scale.set(0.12, 0.12, 1); scene.add(s); decals.push({ s, t: 0 }); }
  const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6), shellMat = new THREE.MeshLambertMaterial({ color: 0xc9a33a });
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; scene.add(m); shells.push({ m, t: 0, vel: new THREE.Vector3(), spin: 0 }); }
  const oldest = arr => arr.reduce((p, c) => (c.t < p.t ? c : p));
  let dmgId = 0;
  return {
    tracer(a, b) { const tr = oldest(tracers); const p = tr.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; tr.l.visible = true; tr.l.material.opacity = 0.9; tr.t = 0.09; },
    impact(p, size = 1) { const pf = oldest(puffs); pf.s.position.copy(p); pf.s.scale.set(0.2 * size, 0.2 * size, 1); pf.s.material.opacity = 0.8; pf.vel.set((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6); pf.s.visible = true; pf.t = 0.5;
      const d = oldest(decals); d.s.position.copy(p); d.s.material.opacity = 0.85; d.s.visible = true; d.t = 20; AUDIO.impact(0.15); },
    shell(pos, right) { const sh = oldest(shells); sh.m.position.copy(pos); sh.vel.copy(right).multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0)); sh.spin = Math.random() * 20; sh.m.visible = true; sh.t = 1.4; },
    dmgNumber(n, zone) {
      if (!SETTINGS.dmgNumbers) return;
      const el = document.createElement('div'); el.className = 'dmg' + (zone === 'head' ? ' head' : ''); el.textContent = Math.round(n);
      el.style.left = (50 + (Math.random() - 0.5) * 8) + '%'; el.style.top = (44 + (Math.random() - 0.5) * 6) + '%'; el.dataset.id = dmgId++;
      $('dmgnums').appendChild(el); setTimeout(() => el.remove(), 750);
    },
    update(dt) {
      for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.09); if (tr.t <= 0) tr.l.visible = false; }
      for (const pf of puffs) if (pf.t > 0) { pf.t -= dt; pf.s.position.addScaledVector(pf.vel, dt); pf.s.scale.multiplyScalar(1 + dt * 3); pf.s.material.opacity = Math.max(0, pf.t / 0.5) * 0.8; if (pf.t <= 0) pf.s.visible = false; }
      for (const d of decals) if (d.t > 0) { d.t -= dt; if (d.t < 2) d.s.material.opacity = d.t / 2 * 0.85; if (d.t <= 0) d.s.visible = false; }
      for (const sh of shells) if (sh.t > 0) { sh.t -= dt; sh.vel.y -= 12 * dt; sh.m.position.addScaledVector(sh.vel, dt); sh.m.rotation.x += sh.spin * dt; sh.m.rotation.z += sh.spin * 0.7 * dt; if (sh.m.position.y < 0.02) { sh.m.position.y = 0.02; sh.vel.y *= -0.3; sh.vel.x *= 0.6; sh.vel.z *= 0.6; if (Math.abs(sh.vel.y) > 0.5) AUDIO.shell(); } if (sh.t <= 0) sh.m.visible = false; }
    },
  };
})();
