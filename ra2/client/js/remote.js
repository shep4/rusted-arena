'use strict';
/* ============================== REMOTE ==================================
   The opponent. Uses the rigged Mixamo "Soldier" (assets/soldier.glb, idle/walk/run clips)
   when it loads; falls back to a primitive mannequin if the file is missing.
   Hit zones: head sphere (× hs), torso, arms (×0.8), legs (×0.75). */
const MODELS = { soldier: null, clips: null, loading: false, failed: false };
function loadModels(cb) {
  if (MODELS.soldier || MODELS.loading || MODELS.failed || !THREE.GLTFLoader) return;
  MODELS.loading = true;
  new THREE.GLTFLoader().load('assets/soldier.glb', gltf => { MODELS.soldier = gltf.scene; MODELS.clips = gltf.animations; MODELS.loading = false; cb && cb(); },
    undefined, err => { console.warn('soldier.glb failed to load; using primitive avatar', err); MODELS.loading = false; MODELS.failed = true; });
}
function makeSoldier(tint, accent) {
  const root = new THREE.Group(), out = { g: root, model: null, mixer: null, acts: {}, deathT: 0 };
  const accM = new THREE.MeshLambertMaterial({ color: accent });
  if (MODELS.soldier) {
    const model = THREE.SkeletonUtils.clone(MODELS.soldier);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); } });
    root.add(model); out.model = model;
    out.mixer = new THREE.AnimationMixer(model);
    for (const n of ['Idle', 'Walk', 'Run']) { const c = THREE.AnimationClip.findByName(MODELS.clips, n); if (c) { const a = out.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); out.acts[n] = a; } }
    // team helmet band so the two players read differently at a glance
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 16), accM); band.rotation.x = Math.PI / 2; band.position.y = 1.72; root.add(band);
  } else {
    const model = new THREE.Group(); const bodyM = new THREE.MeshLambertMaterial({ color: tint }), skin = new THREE.MeshLambertMaterial({ color: 0xc9a27a });
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
  out.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, side: THREE.DoubleSide })); out.flash.visible = false; out.aim.add(out.flash);
  return out;
}
const REMOTE = {
  pos: new THREE.Vector3(0, 0, -20), target: new THREE.Vector3(0, 0, -20), yaw: 0, pitch: 0, tYaw: 0, tPitch: 0,
  crouch: false, weapon: -1, moving: 0, grounded: true, ads: false, dead: false, stepT: 0, av: null, lastMsg: 0, idx: 1, crouchT: 0, gunModel: null,
  init(idx) { this.idx = idx; if (this.av) scene.remove(this.av.g); this.av = idx === 0 ? makeSoldier(0x9a8f6a, 0xd2601e) : makeSoldier(0x6f7f8c, 0x2e7fc0); scene.add(this.av.g); this.weapon = -1; this.setGun(0); loadModels(() => { if (!this.av.mixer) { const d = this.dead, p = this.pos.clone(); this.init(this.idx); this.pos.copy(p); this.dead = d; } }); },
  setGun(i) { if (i === this.weapon) return; this.weapon = i; const h = this.av.gunHolder; while (h.children.length) h.remove(h.children[0]); const gm = buildGunMesh(WEAPONS[i]); gm.g.position.set(0, -0.05, -0.15); h.add(gm.g); this.gunModel = gm; this.av.flash.position.copy(gm.muzzle).add(new THREE.Vector3(0, -0.05, -0.15)); },
  set(p, yaw, pitch, crouch, weapon, moving, grounded, ads, dead) { this.target.set(p[0], p[1], p[2]); this.tYaw = yaw; this.tPitch = pitch; this.crouch = crouch; this.setGun(weapon); this.moving = moving; this.grounded = grounded; this.ads = ads; if (dead && !this.dead) this.av.deathT = 0.001; if (!dead) this.av.deathT = 0; this.dead = dead; this.lastMsg = now(); },
  teleport(x, y, z, yaw) { this.pos.set(x, y, z); this.target.set(x, y, z); this.yaw = this.tYaw = yaw; if (this.av) this.av.deathT = 0; },
  update(dt) {
    const k = 1 - Math.exp(-dt * 16), a = this.av;
    this.pos.lerp(this.target, k); this.yaw = lerpAngle(this.yaw, this.tYaw, k); this.pitch = lerp(this.pitch, this.tPitch, k);
    a.g.position.copy(this.pos); a.g.rotation.y = this.yaw; a.aim.rotation.x = this.pitch;
    this.crouchT = lerp(this.crouchT, this.crouch ? 1 : 0, k);
    // death: topple, then hide until the respawn snapshot arrives
    if (a.deathT > 0) { a.deathT = Math.min(a.deathT + dt, 3); const f = Math.min(1, a.deathT / 0.5); a.model.rotation.x = f * Math.PI / 2 * 0.95; a.model.position.y = -f * 0.1; a.aim.visible = false; a.g.visible = a.deathT < 1.6; }
    else { a.g.visible = true; a.aim.visible = true; a.model.rotation.x = -0.25 * this.crouchT; a.model.position.y = -0.36 * this.crouchT; }
    if (a.mixer) {
      const want = this.dead ? 'Idle' : (this.moving === 2 ? 'Run' : this.moving === 1 ? 'Walk' : 'Idle');
      for (const n in a.acts) a.acts[n].setEffectiveWeight(lerp(a.acts[n].getEffectiveWeight(), n === want ? 1 : 0, 1 - Math.exp(-dt * 10)));
      a.mixer.timeScale = this.grounded ? (this.moving === 1 ? 1.6 : 1) : 0.15; a.mixer.update(dt);
    } else if (a.model) { a.model.scale.y = lerp(a.model.scale.y, this.crouch ? 0.7 : 1, k); }
    if (this.moving && !this.dead && this.grounded) { this.stepT -= dt; if (this.stepT <= 0) { const d = this.pos.distanceTo(PLAYER.pos); AUDIO.step(clamp(1.4 - d / 22, 0, 1)); this.stepT = this.moving === 2 ? 0.3 : 0.45; } }
  },
  hitboxes() {
    const p = this.pos, h = lerp(1, 0.72, this.crouchT), yaw = this.yaw;
    const box = (cx, cz, hw, hd, y0, y1) => ({ min: { x: p.x + cx - hw, y: p.y + y0, z: p.z + cz - hd }, max: { x: p.x + cx + hw, y: p.y + y1, z: p.z + cz + hd } });
    // arms sit left/right of the torso in the soldier's facing frame; approximate with yaw-rotated offsets
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
