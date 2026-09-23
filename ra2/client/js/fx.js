'use strict';
/* ============================== FX ======================================
   Pooled: tracers, shell casings, surface impacts (sparks / dust / splinters + decal), body hits, muzzle smoke, damage numbers. */
const FX = (() => {
  const radial = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const puffTex = radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), decalTex = radial('rgba(20,15,10,0.9)', 'rgba(20,15,10,0)'), sparkTex = radial('rgba(255,235,180,1)', 'rgba(255,160,60,0)');
  const SURF = { sand: { col: 0xd7c396, size: 1.0, sparks: 0, dust: 1, snd: 'sand' }, concrete: { col: 0xb8b2a4, size: 0.9, sparks: 2, dust: 1, snd: 'concrete' }, metal: { col: 0x9a948c, size: 0.5, sparks: 9, dust: 0.3, snd: 'metal' }, wood: { col: 0x9c7a4e, size: 0.7, sparks: 0, dust: 0.6, splinters: 5, snd: 'wood' } };
  const tracers = [], puffs = [], decals = [], shells = [], sparks = [], chips = [];
  for (let i = 0; i < 10; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9 })); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0, a: 0.9 }); }
  for (let i = 0; i < 28; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xffffff })); s.visible = false; scene.add(s); puffs.push({ s, t: 0, life: 0.5, vel: new THREE.Vector3(), grow: 3 }); }
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: decalTex, transparent: true, depthWrite: false })); s.visible = false; s.scale.set(0.12, 0.12, 1); scene.add(s); decals.push({ s, t: 0 }); }
  for (let i = 0; i < 60; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; scene.add(s); sparks.push({ s, t: 0, vel: new THREE.Vector3() }); }
  const chipGeo = new THREE.BoxGeometry(0.03, 0.012, 0.05), chipMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(chipGeo, chipMat); m.visible = false; scene.add(m); chips.push({ m, t: 0, vel: new THREE.Vector3(), spin: 0 }); }
  const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6), shellMat = new THREE.MeshLambertMaterial({ color: 0xc9a33a });
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; scene.add(m); shells.push({ m, t: 0, vel: new THREE.Vector3(), spin: 0 }); }
  const oldest = arr => arr.reduce((p, c) => (c.t < p.t ? c : p));
  const _n = new THREE.Vector3();
  function puff(p, col, size, life, vel, grow) { const pf = oldest(puffs); pf.s.position.copy(p); pf.s.scale.set(size, size, 1); pf.s.material.color.setHex(col); pf.s.material.opacity = 0.75; pf.vel.copy(vel); pf.s.visible = true; pf.t = life; pf.life = life; pf.grow = grow; }
  return {
    tracer(a, b, alpha = 0.9) { const tr = oldest(tracers); const p = tr.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; tr.l.visible = true; tr.a = alpha; tr.l.material.opacity = alpha; tr.t = 0.08; },
    impact(p, normal, mat, size = 1) {
      const S = SURF[mat] || SURF.metal; _n.set(normal ? normal[0] : 0, normal ? normal[1] : 1, normal ? normal[2] : 0);
      if (S.dust) puff(p, S.col, 0.22 * size * S.size, 0.45, _n.clone().multiplyScalar(0.9).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5)), 3);
      for (let i = 0; i < S.sparks * size; i++) { const sp = oldest(sparks); sp.s.position.copy(p); sp.s.scale.set(0.05, 0.05, 1); sp.vel.copy(_n).multiplyScalar(2 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4 + 1, (Math.random() - 0.5) * 4)); sp.s.material.opacity = 1; sp.s.visible = true; sp.t = 0.25 + Math.random() * 0.25; }
      for (let i = 0; i < (S.splinters || 0); i++) { const c = oldest(chips); c.m.position.copy(p); c.vel.copy(_n).multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2)); c.spin = 10 + Math.random() * 20; c.m.visible = true; c.t = 1.2; }
      const d = oldest(decals); d.s.position.copy(p).addScaledVector(_n, 0.01); d.s.material.opacity = mat === 'sand' ? 0.35 : 0.85; d.s.scale.setScalar(mat === 'metal' ? 0.08 : 0.14); d.s.visible = true; d.t = 20;
      AUDIO.impact(S.snd, p.distanceTo(camera.position));
    },
    bodyHit(p) { puff(p, 0x8a3a2a, 0.18, 0.35, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6), 2.2); },
    muzzleSmoke(p) { puff(p, 0xbdb6aa, 0.08, 0.55, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.45 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3), 4); },
    shell(pos, right) { const sh = oldest(shells); sh.m.position.copy(pos); sh.vel.copy(right).multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0)); sh.spin = Math.random() * 20; sh.m.visible = true; sh.t = 1.4; },
    dmgNumber(n, zone) {
      if (!SETTINGS.dmgNumbers) return;
      const el = document.createElement('div'); el.className = 'dmg' + (zone === 'head' ? ' head' : ''); el.textContent = Math.round(n);
      el.style.left = (50 + (Math.random() - 0.5) * 8) + '%'; el.style.top = (44 + (Math.random() - 0.5) * 6) + '%';
      $('dmgnums').appendChild(el); setTimeout(() => el.remove(), 750);
    },
    update(dt) {
      for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.08) * tr.a; if (tr.t <= 0) tr.l.visible = false; }
      for (const pf of puffs) if (pf.t > 0) { pf.t -= dt; pf.s.position.addScaledVector(pf.vel, dt); pf.vel.multiplyScalar(1 - dt * 2); pf.s.scale.multiplyScalar(1 + dt * pf.grow); pf.s.material.opacity = Math.max(0, pf.t / pf.life) * 0.75; if (pf.t <= 0) pf.s.visible = false; }
      for (const sp of sparks) if (sp.t > 0) { sp.t -= dt; sp.vel.y -= 14 * dt; sp.s.position.addScaledVector(sp.vel, dt); sp.s.material.opacity = Math.min(1, sp.t * 4); if (sp.s.position.y < 0) { sp.s.position.y = 0; sp.vel.y *= -0.4; } if (sp.t <= 0) sp.s.visible = false; }
      for (const c of chips) if (c.t > 0) { c.t -= dt; c.vel.y -= 12 * dt; c.m.position.addScaledVector(c.vel, dt); c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.6 * dt; if (c.m.position.y < 0.01) { c.m.position.y = 0.01; c.vel.set(0, 0, 0); c.spin = 0; } if (c.t <= 0) c.m.visible = false; }
      for (const d of decals) if (d.t > 0) { d.t -= dt; if (d.t < 2) d.s.material.opacity = d.t / 2 * 0.85; if (d.t <= 0) d.s.visible = false; }
      for (const sh of shells) if (sh.t > 0) { sh.t -= dt; sh.vel.y -= 12 * dt; sh.m.position.addScaledVector(sh.vel, dt); sh.m.rotation.x += sh.spin * dt; sh.m.rotation.z += sh.spin * 0.7 * dt; if (sh.m.position.y < 0.02) { sh.m.position.y = 0.02; sh.vel.y *= -0.3; sh.vel.x *= 0.6; sh.vel.z *= 0.6; if (Math.abs(sh.vel.y) > 0.5) AUDIO.shell(); } if (sh.t <= 0) sh.m.visible = false; }
    },
  };
})();
