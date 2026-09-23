'use strict';
/* ============================== GAME ====================================
   Host-authoritative rules. The host owns hp[], levels[], alive[], spawn choice and the win.
   Clients raycast their own shots (shooter-favored) and send {t:'hit'} claims; the host clamps and applies. */
const GAME = {
  phase: 'menu', me: 0, isHost: true, solo: false,
  levels: [0, 0], hp: [100, 100], alive: [true, true], deathPos: [null, null], lastSpawn: [-1, -1],
  reset() { this.levels = [0, 0]; this.hp = [100, 100]; this.alive = [true, true]; this.deathPos = [null, null]; this.lastSpawn = [0, 1]; },
  posOf(i) { return i === this.me ? PLAYER.pos : REMOTE.target; },
  damage(v, dmg, zone, k) {
    if (!this.isHost || this.phase !== 'playing' || !this.alive[v]) return;
    this.hp[v] = Math.max(0, Math.round(this.hp[v] - dmg));
    if (v === this.me) onMyHP(this.hp[v]); else NET.send({ t: 'dmg', hp: this.hp[v] });
    if (this.hp[v] <= 0) this.kill(k, v, zone);
  },
  kill(k, v, zone) {
    this.alive[v] = false; this.levels[k]++;
    const win = this.levels[k] >= WEAPONS.length;
    this.deathPos[v] = this.posOf(v).clone();
    const si = this.pickSpawn(v); this.lastSpawn[v] = si; const s = SPAWNS[si];
    const msg = { t: 'kill', k, v, lv: this.levels.slice(), sp: [s.x, s.y, s.z, s.yaw], win, w: k === this.me ? GUN.idx : REMOTE.weapon, z: zone };
    NET.send(msg); onKill(msg);
    setTimeout(() => { if (this.phase !== 'playing') return; this.hp[v] = CFG.maxHP; this.alive[v] = true; }, CFG.respawnDelay * 1000);
  },
  pickSpawn(v) {
    const enemy = this.posOf(1 - v), dp = this.deathPos[v]; let best = 0, bs = -1e9;
    SPAWNS.forEach((s, i) => {
      let score = Math.hypot(s.x - enemy.x, s.z - enemy.z);
      if (hasLOS({ x: s.x, y: s.y + 1.6, z: s.z }, { x: enemy.x, y: enemy.y + 1.6, z: enemy.z })) score -= 28;
      if (dp) score += Math.min(Math.hypot(s.x - dp.x, s.z - dp.z), 16) * 0.5;
      if (Math.abs(s.y - enemy.y) > 2) score += 5;
      if (i === this.lastSpawn[v]) score -= 10;
      score += Math.random() * 4;
      if (score > bs) { bs = score; best = i; }
    });
    return best;
  },
};

/* ---------- local weapon state ---------- */
const GUN = { idx: 0, mag: 12, reserve: 60, reloading: false, reloadTimer: null, nextFire: 0, adsT: 0, shotIdx: 0, lastShot: 0, recoilPitch: 0, wantFire: false, swayX: 0, swayY: 0, reloadT: 0, pumpT: 0 };
const W = () => WEAPONS[GUN.idx];
const VM = { g: new THREE.Group(), model: null, kick: 0, bob: 0, flash: null };
camera.add(VM.g);
const HIP = new THREE.Vector3(0.24, -0.2, -0.42);
function buildViewModel() {
  while (VM.g.children.length) VM.g.remove(VM.g.children[0]);
  const w = W(); VM.model = buildGunMesh(w); VM.g.add(VM.model.g);
  if (!w.melee) { VM.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, side: THREE.DoubleSide })); VM.flash.position.copy(VM.model.muzzle); VM.flash.visible = false; VM.g.add(VM.flash); } else VM.flash = null;
  VM.g.position.copy(HIP); VM.g.rotation.set(0, 0.04, 0.02);
}
function setWeapon(i, refill = true) {
  GUN.idx = clamp(i, 0, WEAPONS.length - 1); clearTimeout(GUN.reloadTimer); GUN.reloading = false; GUN.shotIdx = 0; $('reload').classList.add('hidden');
  if (refill) { GUN.mag = W().mag; GUN.reserve = W().reserve; }
  buildViewModel(); updateHUDWeapon();
}
function reload() {
  const w = W(); if (w.melee || GUN.reloading || GUN.mag >= w.mag || GUN.reserve <= 0 || !alive || GAME.phase !== 'playing') return;
  GUN.reloading = true; $('reload').classList.remove('hidden'); AUDIO.reload();
  GUN.reloadTimer = setTimeout(() => { const take = Math.min(w.mag - GUN.mag, GUN.reserve); GUN.mag += take; GUN.reserve -= take; GUN.reloading = false; $('reload').classList.add('hidden'); updateHUDWeapon(); }, w.reload * 1000);
}
function falloff(w, d) { const [s, e, m] = w.falloff; if (w.pellets && d >= e) return 0; if (d <= s) return 1; if (d >= e) return m; return lerp(1, m, (d - s) / (e - s)); }
function shoot() {
  const w = W(), t = now();
  if (GAME.phase !== 'playing' || !alive || PLAYER.frozen || GUN.reloading || t < GUN.nextFire) return;
  if (PLAYER.sprinting || t < PLAYER.sprintEnd + w.sprintDelay) { GUN.wantFire = true; return; } // sprint-to-fire delay
  GUN.wantFire = false;
  if (!w.melee && GUN.mag <= 0) { reload(); return; }
  GUN.nextFire = t + 60 / w.rpm; if (!w.melee) GUN.mag--;
  if (t - GUN.lastShot > 0.45) GUN.shotIdx = 0; GUN.lastShot = t;
  const pat = w.pattern[Math.min(GUN.shotIdx, w.pattern.length - 1)]; GUN.shotIdx++;
  const adsF = lerp(1, 0.6, GUN.adsT), kickP = w.recoil * pat[1] * adsF * (0.9 + Math.random() * 0.2), kickY = w.recoil * pat[0] * adsF + (Math.random() - 0.5) * w.recoil * 0.15;
  PLAYER.pitch = clamp(PLAYER.pitch + kickP, -1.5, 1.5); PLAYER.yaw += kickY; GUN.recoilPitch += kickP;
  VM.kick = 1; if (w.vm.pump) GUN.pumpT = 1;
  if (VM.flash) { VM.flash.visible = true; VM.flash.rotation.z = Math.random() * 6; setTimeout(() => VM.flash && (VM.flash.visible = false), 45); }
  w.melee ? AUDIO.melee() : AUDIO.shot(w);
  const origin = camera.getWorldPosition(new THREE.Vector3()), fwd = camera.getWorldDirection(new THREE.Vector3());
  const spread = w.spread * lerp(1, w.adsSpread, GUN.adsT) * (movingNow ? 1.4 : 1) * (PLAYER.crouch ? 0.8 : 1) * (PLAYER.grounded ? 1 : 2);
  let total = 0, bestZone = null, endPt = null, hitAny = false; const n = w.pellets || 1, maxD = w.melee ? w.range : 300;
  const hb = REMOTE.dead ? null : REMOTE.hitboxes();
  for (let i = 0; i < n; i++) {
    const d = fwd.clone(); if (spread) { d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
    const tw = worldRay(origin, d, maxD); let te = Infinity, zone = null;
    if (hb) { const th = raySphere(origin, d, hb.head); if (th >= 0) { te = th; zone = 'head'; } for (const z of hb.zones) { const tb = rayBox(origin, d, z.box); if (tb >= 0 && tb < te) { te = tb; zone = z.zone; } } }
    const hitEnemy = te < tw && te <= maxD;
    if (i === 0) endPt = origin.clone().addScaledVector(d, hitEnemy ? te : Math.min(tw, maxD));
    if (hitEnemy) { const dmg = w.dmg * falloff(w, te) * (zone === 'head' ? w.hs : ZONE_MULT[zone]); total += dmg; hitAny = true; if (zone === 'head' || !bestZone) bestZone = zone; }
    else if (tw < maxD && (i === 0 || n > 1)) FX.impact(origin.clone().addScaledVector(d, tw - 0.02), w.pellets ? 0.6 : 1);
  }
  if (!w.melee) { FX.tracer(VM.g.localToWorld(VM.model.muzzle.clone()), endPt); if (VM.model.eject) { const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); FX.shell(VM.g.localToWorld(VM.model.eject.clone()), right); } }
  NET.send({ t: 'shot', w: GUN.idx, e: [+endPt.x.toFixed(2), +endPt.y.toFixed(2), +endPt.z.toFixed(2)] });
  if (hitAny) { showHit(bestZone); FX.dmgNumber(total, bestZone); if (GAME.isHost) GAME.damage(1 - GAME.me, total, bestZone, GAME.me); else NET.send({ t: 'hit', d: Math.round(total), z: bestZone }); }
  updateHUDWeapon();
  if (GUN.mag === 0 && !w.melee && GUN.reserve > 0) setTimeout(reload, 300);
}
function onRemoteShot(m) {
  const w = WEAPONS[m.w] || WEAPONS[0]; const d = REMOTE.pos.distanceTo(PLAYER.pos); const vol = clamp(1.3 - d / 45, 0.08, 1);
  w.melee ? AUDIO.melee(vol) : AUDIO.shot(w, vol);
  const a = REMOTE.av; a.flash.visible = true; setTimeout(() => (a.flash.visible = false), 45);
  if (!w.melee && m.e) { const end = new THREE.Vector3(m.e[0], m.e[1], m.e[2]); FX.tracer(a.flash.getWorldPosition(new THREE.Vector3()), end); if (end.distanceTo(camera.position) > 1.2) FX.impact(end, 0.8); }
}

/* ---------- match flow (both sides) ---------- */
function onMyHP(hp) { if (hp < myHP) { $('vignette').style.opacity = 1; setTimeout(() => ($('vignette').style.opacity = 0), 60); AUDIO.hurt(); } myHP = hp; updateHUDHealth(); }
function onKill(m) {
  GAME.levels = m.lv; updateHUDLevels();
  killFeed(m.k, m.v, m.w, m.z);
  if (m.v === GAME.me) { alive = false; AUDIO.death(); $('deathscreen').classList.remove('hidden'); setTimeout(() => { if (GAME.phase !== 'playing') return; respawnAt(m.sp); }, CFG.respawnDelay * 1000); }
  else { REMOTE.dead = true; REMOTE.av.deathT = 0.001; if (GAME.solo) setTimeout(() => { if (GAME.phase !== 'playing') return; REMOTE.teleport(m.sp[0], m.sp[1], m.sp[2], m.sp[3]); REMOTE.dead = false; REMOTE.setGun(GAME.levels[1]); }, CFG.respawnDelay * 1000); }
  if (m.k === GAME.me) { banner('KILL'); AUDIO.advance(); setTimeout(() => { if (m.win) return; setWeapon(m.lv[GAME.me]); banner(m.lv[GAME.me] === WEAPONS.length - 1 ? 'GAME POINT' : 'WEAPON ADVANCED', 900, true); }, 650); }
  else if (!m.win && m.lv[m.k] === WEAPONS.length - 1) banner('ENEMY ON GAME POINT', 1100, true);
  if (m.win) setTimeout(() => endMatch(m.k), 1500);
}
function respawnAt(sp) { PLAYER.pos.set(sp[0], sp[1] + 0.01, sp[2]); PLAYER.vel.set(0, 0, 0); PLAYER.yaw = sp[3]; PLAYER.pitch = 0; alive = true; myHP = CFG.maxHP; setWeapon(GUN.idx, true); $('deathscreen').classList.add('hidden'); updateHUDHealth(); }
function startMatch() {
  GAME.reset(); alive = true; myHP = CFG.maxHP; REMOTE.dead = false; REMOTE.setGun(0); REMOTE.av.deathT = 0;
  const mine = SPAWNS[GAME.me], theirs = SPAWNS[1 - GAME.me];
  PLAYER.pos.set(mine.x, mine.y + 0.01, mine.z); PLAYER.vel.set(0, 0, 0); PLAYER.yaw = mine.yaw; PLAYER.pitch = 0; PLAYER.frozen = true;
  REMOTE.teleport(theirs.x, theirs.y, theirs.z, theirs.yaw);
  setWeapon(0); updateHUDLevels(); updateHUDHealth(); $('deathscreen').classList.add('hidden'); $('killfeed').innerHTML = '';
  showScreen(null); $('hud').classList.remove('hidden'); GAME.phase = 'countdown';
  const cd = $('countdown'); cd.classList.remove('hidden'); let n = 3;
  const tick = () => { if (GAME.phase !== 'countdown') { cd.classList.add('hidden'); return; } if (n > 0) { cd.textContent = n; AUDIO.count(); n--; setTimeout(tick, 900); } else { cd.textContent = 'GO!'; AUDIO.go(); PLAYER.frozen = false; GAME.phase = 'playing'; setTimeout(() => cd.classList.add('hidden'), 600); } };
  tick(); requestLock();
}
function endMatch(winner) {
  GAME.phase = 'over'; PLAYER.frozen = true; $('countdown').classList.add('hidden');
  $('winner').textContent = `PLAYER ${winner + 1} WINS`;
  $('overStatus').textContent = winner === GAME.me ? 'You completed the gun cycle.' : 'They finished the cycle first.' + (GAME.isHost ? '' : ' Waiting for the host to start a rematch…');
  $('rematch').classList.toggle('hidden', !GAME.isHost);
  showScreen('over'); document.exitPointerLock && document.exitPointerLock();
}
function leaveToMenu() {
  NET.close(); GAME.phase = 'menu'; GAME.solo = false; PLAYER.frozen = true; alive = true; REMOTE.dead = false;
  $('hud').classList.add('hidden'); $('countdown').classList.add('hidden'); $('deathscreen').classList.add('hidden'); $('scope').classList.add('hidden');
  showScreen('main'); document.exitPointerLock && document.exitPointerLock();
}

/* ---------- network messages ---------- */
NET.on('msg', m => {
  switch (m.t) {
    case 's':
      REMOTE.set(m.p, m.y, m.pi, !!m.c, m.w | 0, m.m | 0, !!m.g, !!m.a, !!m.d);
      if (!GAME.isHost) { if (m.hp !== undefined && m.hp !== myHP && alive) onMyHP(m.hp); if (m.lv && (m.lv[0] !== GAME.levels[0] || m.lv[1] !== GAME.levels[1])) { GAME.levels = m.lv; updateHUDLevels(); } }
      break;
    case 'shot': onRemoteShot(m); break;
    case 'hit': if (GAME.isHost) GAME.damage(0, clamp(m.d, 0, 300), m.z || 'torso', 1); break;
    case 'dmg': if (!GAME.isHost) onMyHP(m.hp); break;
    case 'kill': if (!GAME.isHost) onKill(m); break;
    case 'start': if (!GAME.isHost) startMatch(); break;
  }
});
NET.on('connected', () => { $('lobbyTitle').textContent = 'Player 2 connected'; $('lobbyStatus').textContent = 'Match starting…'; showScreen('lobby'); if (GAME.isHost) setTimeout(() => { NET.send({ t: 'start' }); startMatch(); }, 1200); });
NET.on('disconnected', () => { if (GAME.phase === 'menu') return; GAME.phase = 'over'; PLAYER.frozen = true; $('winner').textContent = 'CONNECTION LOST'; $('overStatus').textContent = 'The other player left, or the server link dropped.'; $('rematch').classList.add('hidden'); showScreen('over'); document.exitPointerLock && document.exitPointerLock(); });
let netAcc = 0;
function sendState(dt) {
  netAcc += dt; if (netAcc < 1 / CFG.netRate) return; netAcc = 0;
  if (GAME.solo || !NET.connected) return;
  const p = PLAYER.pos, m = { t: 's', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +PLAYER.yaw.toFixed(3), pi: +PLAYER.pitch.toFixed(3), c: PLAYER.crouch ? 1 : 0, w: GUN.idx, m: movingNow ? (PLAYER.sprinting ? 2 : 1) : 0, g: PLAYER.grounded ? 1 : 0, a: GUN.adsT > 0.5 ? 1 : 0, d: alive ? 0 : 1 };
  if (GAME.isHost) { m.hp = GAME.hp[1]; m.lv = GAME.levels; }
  NET.send(m);
}
