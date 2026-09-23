'use strict';
/* ============================== REMOTE ==================================
   The opponent. Snapshot buffer (100 ms interpolation delay, up to 150 ms extrapolation) so movement is smooth at 20 Hz.
   Rigged Mixamo "Soldier" (assets/soldier.glb, idle/walk/run clips) with poses for crouch, airborne, ladder, ADS, reload and death;
   primitive mannequin fallback if the file is missing. Hit zones: head sphere (× hs), torso, arms (×0.8), legs (×0.75). */
const MODELS = { soldier: null, clips: null, loading: false, failed: false };
function loadModels(cb) {
  if (MODELS.soldier || MODELS.loading || MODELS.failed || !THREE.GLTFLoader) return;
  MODELS.loading = true;
  new THREE.GLTFLoader().load('assets/soldier.glb', gltf => { MODELS.soldier = gltf.scene; MODELS.clips = gltf.animations; MODELS.loading = false; cb && cb(); },
    undefined, err => { console.warn('soldier.glb failed to load; using primitive avatar', err); MODELS.loading = false; MODELS.failed = true; });
}
function makeSoldier(tint, accent) {
  const root = new THREE.Group(), out = { g: root, model: null, mixer: null, acts: {}, deathT: 0, mats: [] };
  const accM = new THREE.MeshLambertMaterial({ color: accent });
  if (MODELS.soldier) {
    const model = THREE.SkeletonUtils.clone(MODELS.soldier);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); out.mats.push(o.material); } });
    root.add(model); out.model = model;
    out.mixer = new THREE.AnimationMixer(model);
    for (const n of ['Idle', 'Walk', 'Run']) { const c = THREE.AnimationClip.findByName(MODELS.clips, n); if (c) { const a = out.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); out.acts[n] = a; } }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 16), accM); band.rotation.x = Math.PI / 2; band.position.y = 1.72; root.add(band);
  } else {
    const model = new THREE.Group(); const bodyM = new THREE.MeshLambertMaterial({ color: tint }), skin = new THREE.MeshLambertMaterial({ color: 0xc9a27a }); out.mats.push(bodyM, accM);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), bodyM); torso.position.y = 1.15; model.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.34), accM); vest.position.y = 1.2; model.add(vest);
    for (const sx of [-0.14, 0.14]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.82, 0.24), bodyM); leg.position.set(sx, 0.41, 0); model.add(leg); }
    for (const sx of [-0.33, 0.33]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), bodyM); arm.position.set(sx, 1.15, 0); model.add(arm); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin); head.position.y = 1.62; model.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), accM); helmet.position.y = 1.64; model.add(helmet);
    model.traverse(o => { if (o.isMesh) o.castShadow = true; }); root.add(model); out.model = model;
  }
  out.aim = new THREE.Group(); out.aim.position.set(0.16, 1.32, -0.1); root.add(out.aim);
  out.gunHolder = new THREE.Group(); out.aim.add(out.gunHolder);
  out.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })); out.flash.visible = false; out.aim.add(out.flash);
  return out;
}
const REMOTE = {
  pos: new THREE.Vector3(0, 0, -20), target: new THREE.Vector3(0, 0, -20), yaw: 0, pitch: 0, tYaw: 0, tPitch: 0,
  crouch: false, weapon: -1, moving: 0, grounded: true, ads: false, ladder: false, reloading: false, dead: false, stepT: 0, av: null, idx: 1,
  crouchT: 0, adsT: 0, airT: 0, reloadT: 0, flinch: 0, flinchDir: 0, hitFlash: 0, deadGuard: 0, gunModel: null,
  buf: [], lastRecv: 0, _a: new THREE.Vector3(), _b: new THREE.Vector3(),
  init(idx) { this.idx = idx; if (this.av) scene.remove(this.av.g); this.av = idx === 0 ? makeSoldier(0x9a8f6a, 0xd2601e) : makeSoldier(0x6f7f8c, 0x2e7fc0); scene.add(this.av.g); this.weapon = -1; this.setGun(0); loadModels(() => { if (!this.av.mixer) { const d = this.dead, p = this.pos.clone(); this.init(this.idx); this.pos.copy(p); this.dead = d; } }); },
  setGun(i) { if (i === this.weapon) return; this.weapon = i; const h = this.av.gunHolder; while (h.children.length) h.remove(h.children[0]); const gm = buildGunMesh(WEAPONS[i]); gm.g.position.set(0, -0.05, -0.15); h.add(gm.g); this.gunModel = gm; this.av.flash.position.copy(gm.muzzle).add(new THREE.Vector3(0, -0.05, -0.15)); },
  // snapshot in: buffered with local receive time; the renderer runs ~100 ms behind the newest one
  set(p, yaw, pitch, crouch, weapon, moving, grounded, ads, dead, ladder, reloading) {
    const t = now(); this.buf.push({ t, x: p[0], y: p[1], z: p[2], yaw, pitch }); if (this.buf.length > 12) this.buf.shift(); this.lastRecv = t;
    this.target.set(p[0], p[1], p[2]); this.tYaw = yaw; this.tPitch = pitch; this.crouch = crouch; this.setGun(weapon); this.moving = moving; this.grounded = grounded; this.ads = ads; this.ladder = ladder; this.reloading = reloading;
    if (dead) { if (!this.dead) this.av.deathT = 0.001; this.dead = true; }
    else if (now() > this.deadGuard) { if (this.dead) { this.av.deathT = 0; this.buf.length = 0; this.pos.copy(this.target); } this.dead = false; }
  },
  kill() { this.dead = true; this.av.deathT = 0.001; this.deadGuard = now() + 0.6; }, // ignore stale alive snapshots for a moment
  teleport(x, y, z, yaw) { this.pos.set(x, y, z); this.target.set(x, y, z); this.yaw = this.tYaw = yaw; this.buf.length = 0; if (this.av) this.av.deathT = 0; },
  onHit(zone) { this.hitFlash = 1; this.flinch = zone === 'head' ? 1 : zone === 'torso' ? 0.7 : zone === 'leg' ? 0.5 : 0.35; this.flinchDir = zone === 'leg' ? -1 : 1; },
  onShot(w) { const a = this.av; a.flash.visible = true; a.flash.scale.setScalar(w.pellets ? 1.6 : 0.8 + w.vm.len * 0.4); setTimeout(() => (a.flash.visible = false), 45); this.recoilT = 1; },
  muzzleWorld(out) { return this.av.flash.getWorldPosition(out); },
  sample(dt) {
    const b = this.buf; if (b.length === 0) return;
    const tr = now() - 0.1; // render time
    if (b.length === 1 || tr <= b[0].t) { const s = b[0]; this.pos.set(s.x, s.y, s.z); this.yaw = s.yaw; this.pitch = s.pitch; return; }
    let i = b.length - 1; while (i > 0 && b[i - 1].t > tr) i--;
    if (i === b.length - 1 && tr > b[i].t) { // beyond newest: extrapolate briefly along the last velocity, then hold
      const s = b[i], q = b[i - 1], dtp = Math.max(0.01, s.t - q.t), ex = Math.min(0.15, tr - s.t);
      this.pos.set(s.x + (s.x - q.x) / dtp * ex, s.y + (s.y - q.y) / dtp * ex, s.z + (s.z - q.z) / dtp * ex); this.yaw = s.yaw; this.pitch = s.pitch; return;
    }
    const a = b[i - 1], c = b[i], f = clamp((tr - a.t) / Math.max(0.001, c.t - a.t), 0, 1);
    this.pos.set(lerp(a.x, c.x, f), lerp(a.y, c.y, f), lerp(a.z, c.z, f)); this.yaw = lerpAngle(a.yaw, c.yaw, f); this.pitch = lerp(a.pitch, c.pitch, f);
  },
  update(dt) {
    const a = this.av, k = 1 - Math.exp(-dt * 12);
    if (this.buf.length) this.sample(dt); else { this.pos.lerp(this.target, k); this.yaw = lerpAngle(this.yaw, this.tYaw, k); this.pitch = lerp(this.pitch, this.tPitch, k); }
    a.g.position.copy(this.pos); a.g.rotation.y = this.yaw;
    this.crouchT = lerp(this.crouchT, this.crouch ? 1 : 0, k); this.adsT = lerp(this.adsT, this.ads ? 1 : 0, k); this.airT = lerp(this.airT, this.grounded || this.ladder ? 0 : 1, k); this.reloadT = lerp(this.reloadT, this.reloading ? 1 : 0, k);
    this.flinch = Math.max(0, this.flinch - dt * 5); this.hitFlash = Math.max(0, this.hitFlash - dt * 6); this.recoilT = Math.max(0, (this.recoilT || 0) - dt * 8);
    for (const m of a.mats) if (m.emissive) m.emissive.setRGB(this.hitFlash * 0.6, this.hitFlash * 0.12, this.hitFlash * 0.05);
    // aim: gun raised in ADS, dipped while reloading, kicks on shots
    a.aim.rotation.x = this.pitch - this.reloadT * 0.5 + this.recoilT * 0.08; a.aim.position.y = 1.32 + this.adsT * 0.1 - this.crouchT * 0.35 - this.reloadT * 0.08; a.aim.position.x = 0.16 - this.adsT * 0.1; a.aim.position.z = -0.1 - this.recoilT * 0.06;
    // death: topple, then hide until the respawn snapshot arrives
    if (a.deathT > 0) { a.deathT = Math.min(a.deathT + dt, 3); const f = Math.min(1, a.deathT / 0.5); a.model.rotation.x = f * Math.PI / 2 * 0.95; a.model.position.y = -f * 0.1; a.aim.visible = false; a.g.visible = a.deathT < 1.6; }
    else {
      a.g.visible = true; a.aim.visible = true;
      // poses: crouch lean, airborne tuck, ladder (hands up, body flat to the wall), flinch on hits
      a.model.rotation.x = -0.25 * this.crouchT + 0.12 * this.airT - this.flinch * 0.12 * this.flinchDir + (this.ladder ? -0.12 : 0);
      a.model.rotation.z = this.flinch * 0.05;
      a.model.position.y = -0.36 * this.crouchT - 0.05 * this.airT;
    }
    if (a.mixer) {
      const want = this.dead ? 'Idle' : (this.ladder ? 'Walk' : this.moving === 2 ? 'Run' : this.moving === 1 ? 'Walk' : 'Idle');
      for (const n in a.acts) a.acts[n].setEffectiveWeight(lerp(a.acts[n].getEffectiveWeight(), n === want ? 1 : 0, 1 - Math.exp(-dt * 10)));
      a.mixer.timeScale = this.ladder ? 0.7 : this.grounded ? (this.moving === 1 ? 1.6 : 1) : 0.12; a.mixer.update(dt);
    } else if (a.model) { a.model.scale.y = lerp(a.model.scale.y, this.crouch ? 0.7 : 1, k); }
    if (this.moving && !this.dead && this.grounded) { this.stepT -= dt; if (this.stepT <= 0) { const d = this.pos.distanceTo(PLAYER.pos); AUDIO.step(clamp(1.4 - d / 22, 0, 1), this.pos.y > 0.05 ? 'metal' : 'sand', this.moving === 2); this.stepT = this.moving === 2 ? 0.31 : 0.44; } }
    if (this.ladder && !this.dead) { this.stepT -= dt; if (this.stepT <= 0) { const d = this.pos.distanceTo(PLAYER.pos); if (d < 25) AUDIO.ladder(); this.stepT = 0.34; } }
  },
  hitboxes() {
    const p = this.pos, h = lerp(1, 0.72, this.crouchT), yaw = this.yaw;
    const box = (cx, cz, hw, hd, y0, y1) => ({ min: { x: p.x + cx - hw, y: p.y + y0, z: p.z + cz - hd }, max: { x: p.x + cx + hw, y: p.y + y1, z: p.z + cz + hd } });
    const rx = Math.cos(yaw) * 0.36, rz = -Math.sin(yaw) * 0.36;
    return {
      head: { x: p.x, y: p.y + 1.62 * h + (1 - h) * 0.15, z: p.z, r: 0.24 },
      zones: [
        { zone: 'torso', box: box(0, 0, 0.27, 0.22, 0.95 * h, 1.47 * h) },
        { zone: 'arm', box: box(rx, rz, 0.13, 0.16, 0.95 * h, 1.42 * h) }, { zone: 'arm', box: box(-rx, -rz, 0.13, 0.16, 0.95 * h, 1.42 * h) },
        { zone: 'leg', box: box(0, 0, 0.27, 0.22, 0, 0.95 * h) },
      ],
    };
  },
};
