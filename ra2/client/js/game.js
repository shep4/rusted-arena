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
      const dEnemy = Math.hypot(s.x - enemy.x, s.z - enemy.z); let score = dEnemy;
      if (dEnemy < 7) score -= 60;                                                            // occupied / point-blank
      if (hasLOS({ x: s.x, y: s.y + 1.6, z: s.z }, { x: enemy.x, y: enemy.y + 1.6, z: enemy.z })) score -= 28;
      // exposure: how many of the enemy's likely next positions can see this spawn
      let exposed = 0; for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (hasLOS({ x: s.x, y: s.y + 1.6, z: s.z }, { x: enemy.x + ox, y: enemy.y + 1.6, z: enemy.z + oz })) exposed++;
      score -= exposed * 5;
      if (dp) score += Math.min(Math.hypot(s.x - dp.x, s.z - dp.z), 16) * 0.5;
      if (Math.abs(s.y - enemy.y) > 2) score += 5;
      if (i === this.lastSpawn[v]) score -= 10;
      score += Math.random() * 4;
      if (score > bs) { bs = score; best = i; }
    });
    return best;
  },
};

/* ---------- local weapon state machine ----------
   states: ready | empty | reload | bolt | switch | sprint   (firing = time since last shot < cycle; ADS = adsT; melee = weapon.melee)
   Impossible states are prevented here: no firing while switching/bolting/sprinting, no reload with a full mag or no reserve,
   reload cancelled by sprint or switch (shotgun keeps the shells already loaded), ADS cancelled by sprint/reload/switch. */
const GUN = { idx: 0, mag: 12, reserve: 60, state: 'ready', stateT: 0, adsT: 0, shotIdx: 0, lastShot: -9, nextFire: 0,
  recoilPitch: 0, recoilYaw: 0, wantFire: false, reloadPhase: -1, reloadT: 0, reloadPhases: null, reloadProgress: 0, boltT: 0, boltDur: 1,
  switchTo: -1, switchT: 0, switchPhase: 'lower', switchProgress: 0, pumpT: 0, shellT: 0, fireT: 0, get reloading() { return this.state === 'reload'; } };
const W = () => WEAPONS[GUN.idx];
function gunSetState(st) { GUN.state = st; GUN.stateT = 0; }
function setWeapon(i, refill = true) { // instant (match start / respawn). In-match progression uses startSwitch().
  GUN.idx = clamp(i, 0, WEAPONS.length - 1); GUN.reloadPhase = -1; GUN.boltT = 0; GUN.shotIdx = 0; GUN.switchTo = -1; GUN.nextFire = 0; GUN.wantFire = false; GUN.pumpT = 0; GUN.recoilPitch = 0; GUN.recoilYaw = 0; $('reload').classList.add('hidden');
  if (refill) { GUN.mag = W().mag; GUN.reserve = W().reserve; }
  gunSetState('ready'); VMBuild(); updateHUDWeapon();
}
function startSwitch(i) { if (i === GUN.idx || GUN.state === 'switch') return; GUN.switchTo = i; GUN.switchT = 0; GUN.switchPhase = 'lower'; gunSetState('switch'); AUDIO.click(); }
function buildReloadPhases(w, tactical) { // [name, duration] scaled to the weapon's reload time; tactical (round still chambered) skips the chamber phase
  const base = tactical ? [['lower', 0.18], ['magOut', 0.3], ['magIn', 0.42], ['raise', 0.15]] : [['lower', 0.18], ['magOut', 0.3], ['magIn', 0.4], ['chamber', 0.22], ['raise', 0.12]];
  const total = base.reduce((a, b) => a + b[1], 0), target = w.reload * (tactical ? 0.85 : 1);
  return base.map(([n, d]) => [n, d / total * target]);
}
function reload() {
  const w = W(); if (w.melee || GUN.state === 'reload' || GUN.state === 'switch' || GUN.mag >= w.mag || GUN.reserve <= 0 || !alive || GAME.phase !== 'playing') return;
  if (w.reloadType === 'shell') { GUN.reloadPhases = null; GUN.reloadPhase = 0; GUN.reloadT = 0; GUN.shellT = -w.shellStart; }
  else { GUN.reloadPhases = buildReloadPhases(w, GUN.mag > 0); GUN.reloadPhase = 0; GUN.reloadT = 0; }
  gunSetState('reload'); $('reload').classList.remove('hidden'); AUDIO.reloadStart(w);
}
function cancelReload() { GUN.reloadPhase = -1; $('reload').classList.add('hidden'); if (GUN.state === 'reload') gunSetState(GUN.mag > 0 ? 'ready' : 'empty'); }
function weaponUpdate(dt) {
  const w = W(), P = PLAYER; GUN.stateT += dt; GUN.fireT = P.time - GUN.lastShot;
  // --- sprint enters/exits its own state and cancels reloads
  if (P.sprinting && ['ready', 'empty', 'reload'].includes(GUN.state)) { if (GUN.state === 'reload') cancelReload(); gunSetState('sprint'); }
  if (!P.sprinting && GUN.state === 'sprint') gunSetState(GUN.mag > 0 || w.melee ? 'ready' : 'empty');
  // --- switching: lower current, swap, raise new
  if (GUN.state === 'switch') {
    const half = WEAPONS[GUN.switchPhase === 'lower' ? GUN.idx : GUN.switchTo].switchTime / 2; GUN.switchT += dt; GUN.switchProgress = clamp(GUN.switchT / half, 0, 1);
    if (GUN.switchPhase === 'lower' && GUN.switchT >= half) { GUN.idx = GUN.switchTo; GUN.mag = W().mag; GUN.reserve = W().reserve; GUN.boltT = 0; GUN.shotIdx = 0; VMBuild(); updateHUDWeapon(); GUN.switchPhase = 'raise'; GUN.switchT = 0; AUDIO.raise(); }
    else if (GUN.switchPhase === 'raise' && GUN.switchT >= half) { GUN.switchTo = -1; gunSetState(GUN.mag > 0 || W().melee ? 'ready' : 'empty'); }
  }
  // --- bolt cycle after each precision shot
  if (GUN.state === 'bolt') { GUN.boltT -= dt; if (GUN.boltT <= 0) gunSetState(GUN.mag > 0 ? 'ready' : 'empty'); }
  // --- reloads
  if (GUN.state === 'reload') {
    if (w.reloadType === 'shell') {
      GUN.shellT += dt;
      if (GUN.shellT >= w.shellTime) { GUN.shellT = 0; GUN.mag++; GUN.reserve--; AUDIO.shellIn(); updateHUDWeapon(); if (GUN.mag >= w.mag || GUN.reserve <= 0) { GUN.reloadPhase = 99; GUN.pumpT = 1; AUDIO.pump(); } }
      GUN.reloadProgress = clamp(GUN.shellT / w.shellTime, 0, 1);
      if (GUN.reloadPhase === 99) { GUN.pumpT -= dt / w.pumpTime; if (GUN.pumpT <= 0) { GUN.pumpT = 0; cancelReload(); } }
    } else {
      const ph = GUN.reloadPhases[GUN.reloadPhase]; GUN.reloadT += dt; GUN.reloadProgress = clamp(GUN.reloadT / ph[1], 0, 1);
      if (GUN.reloadT >= ph[1]) {
        if (ph[0] === 'magOut') AUDIO.magOut(); if (ph[0] === 'magIn') { const take = Math.min(w.mag - GUN.mag, GUN.reserve); GUN.mag += take; GUN.reserve -= take; AUDIO.magIn(); updateHUDWeapon(); } if (ph[0] === 'chamber') AUDIO.chamber();
        GUN.reloadPhase++; GUN.reloadT = 0; if (GUN.reloadPhase >= GUN.reloadPhases.length) cancelReload();
      }
    }
  }
  // --- empty: auto-reload shortly after the last round
  if (GUN.state === 'empty' && GUN.stateT > 0.35 && GUN.reserve > 0 && !P.sprinting) reload();
  // --- ADS: cancelled by sprint/reload/switch/bolt/melee; per-weapon aim time, faster to leave than to enter
  const adsAllowed = INPUT.locked && INPUT.rightHeld && alive && GAME.phase === 'playing' && ['ready', 'empty'].includes(GUN.state) && !w.melee && !P.sprinting && !P.ladder;
  GUN.adsT = clamp(GUN.adsT + (adsAllowed ? 1 : -1.7) * dt / w.adsTime, 0, 1);
  // --- recoil: mouse pulled down cancels accumulated recoil (compensation); the rest recovers gradually once firing stops
  const comp = Math.max(0, P.lastMdy) * CFG.sens * SETTINGS.sens; if (comp > 0) GUN.recoilPitch = Math.max(0, GUN.recoilPitch - comp);
  if (GUN.fireT > 0.09) {
    const rp = Math.min(GUN.recoilPitch, w.recover * dt * (1 + GUN.adsT * 0.35)); P.pitch -= rp; GUN.recoilPitch -= rp;
    const ry = Math.sign(GUN.recoilYaw) * Math.min(Math.abs(GUN.recoilYaw), w.recover * 0.6 * dt); P.yaw -= ry; GUN.recoilYaw -= ry;
  }
  if (GUN.fireT > 0.45) GUN.shotIdx = 0;
  // --- shotgun pump after each shot (visual + fire gate handled via nextFire)
  if (w.vm.pump && GUN.state !== 'reload') GUN.pumpT = Math.max(0, GUN.pumpT - dt / w.pumpTime);
  // --- queued shot after sprint-to-fire delay
  if (GUN.wantFire && INPUT.fireHeld) tryFire();
}
function falloff(w, d) { const [s, e, m] = w.falloff; if (w.pellets && d >= e) return 0; if (d <= s) return 1; if (d >= e) return m; return lerp(1, m, (d - s) / (e - s)); }
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3();
function tryFire() {
  const w = W(), P = PLAYER, t = P.time;
  if (GAME.phase !== 'playing' || !alive || P.frozen) return;
  if (GUN.state === 'reload' && w.reloadType === 'shell' && GUN.mag > 0 && GUN.reloadPhase !== 99) { GUN.reloadPhase = 99; GUN.pumpT = 1; AUDIO.pump(); return; } // interrupt shell loading: pump, then fire on the next press
  if (!['ready', 'empty'].includes(GUN.state)) { GUN.wantFire = false; return; }
  if (P.sprinting || t < P.sprintEnd + w.sprintDelay) { GUN.wantFire = true; return; }
  GUN.wantFire = false;
  if (GUN.state === 'empty' || (!w.melee && GUN.mag <= 0)) { if (GUN.reserve > 0) reload(); else AUDIO.dryFire(); return; }
  if (t < GUN.nextFire || GUN.pumpT > 0.15) return;
  shoot();
}
function shoot() {
  const w = W(), P = PLAYER, t = P.time;
  GUN.nextFire = t + 60 / w.rpm; if (!w.melee) GUN.mag--; GUN.lastShot = t;
  // recoil model: pattern + jitter, first-shot multiplier, stability from stance; camera gets the recoil, the view model gets a separate kick
  const pat = w.pattern[Math.min(GUN.shotIdx, w.pattern.length - 1)]; const first = GUN.shotIdx === 0; GUN.shotIdx++;
  const stability = (P.crouch ? 0.85 : 1) * (movingNow ? 1.25 : 1) * (P.grounded ? 1 : 1.8) * lerp(1, 0.78, GUN.adsT);
  const jit = w.jitter || 0;
  const kickP = w.recoil * pat[1] * (first ? w.firstShot : 1) * stability * (1 + (Math.random() - 0.5) * jit);
  const kickY = w.recoil * (pat[0] + (Math.random() - 0.5) * jit * 1.2) * stability;
  P.pitch = clamp(P.pitch + kickP, -1.5, 1.5); P.yaw += kickY; GUN.recoilPitch += kickP; GUN.recoilYaw += kickY;
  VMKick(w); if (w.vm.pump) GUN.pumpT = 1;
  w.melee ? AUDIO.melee() : AUDIO.shot(w, 0);
  camera.getWorldPosition(_o); camera.getWorldDirection(_f);
  const spread = w.spread * lerp(1, w.adsSpread, GUN.adsT) * (movingNow ? 1.4 : 1) * (P.crouch ? 0.8 : 1) * (P.grounded ? 1 : 2);
  let total = 0, bestZone = null, hitAny = false; const n = w.pellets || 1, maxD = w.melee ? w.range : 300;
  const hb = REMOTE.dead ? null : REMOTE.hitboxes();
  for (let i = 0; i < n; i++) {
    _d.copy(_f); if (spread) { _d.x += (Math.random() - 0.5) * spread * 2; _d.y += (Math.random() - 0.5) * spread * 2; _d.z += (Math.random() - 0.5) * spread * 2; _d.normalize(); }
    const hit = worldRayHit(_o, _d, maxD); let te = Infinity, zone = null;
    if (hb) { const th = raySphere(_o, _d, hb.head); if (th >= 0) { te = th; zone = 'head'; } for (const z of hb.zones) { const tb = rayBox(_o, _d, z.box); if (tb >= 0 && tb < te) { te = tb; zone = z.zone; } } }
    const hitEnemy = te < hit.t && te <= maxD;
    _e.copy(_o).addScaledVector(_d, hitEnemy ? te : Math.min(hit.t, maxD));
    if (i === 0) _m.copy(_e);
    if (hitEnemy) { total += w.dmg * falloff(w, te) * (zone === 'head' ? w.hs : ZONE_MULT[zone]); hitAny = true; if (zone === 'head' || !bestZone) bestZone = zone; if (!w.melee) FX.bodyHit(_e); }
    else if (hit.t < maxD) FX.impact(_e, hit.normal, hit.mat, w.pellets ? 0.6 : 1);
    if (!w.melee && (i === 0 || n > 1)) FX.tracer(VMMuzzleWorld(_r), _e, w.pellets ? 0.35 : 0.9);
  }
  if (!w.melee) VMEject();
  NET.send({ t: 'shot', w: GUN.idx, e: [+_m.x.toFixed(2), +_m.y.toFixed(2), +_m.z.toFixed(2)] });
  if (hitAny) { showHit(bestZone); FX.dmgNumber(total, bestZone); REMOTE.onHit(bestZone); if (GAME.isHost) GAME.damage(1 - GAME.me, total, bestZone, GAME.me); else NET.send({ t: 'hit', d: Math.round(total), z: bestZone }); }
  updateHUDWeapon();
  if (w.boltTime && GUN.mag > 0) { GUN.boltT = w.boltTime; GUN.boltDur = w.boltTime; gunSetState('bolt'); setTimeout(() => AUDIO.bolt(), 250); }
  else if (!w.melee && GUN.mag <= 0) gunSetState('empty');
}
function onRemoteShot(m) {
  const w = WEAPONS[m.w] || WEAPONS[0]; const d = REMOTE.pos.distanceTo(PLAYER.pos);
  w.melee ? AUDIO.melee(clamp(1.3 - d / 45, 0.08, 1)) : AUDIO.shot(w, d);
  REMOTE.onShot(w);
  if (!w.melee && m.e) { _e.set(m.e[0], m.e[1], m.e[2]); FX.tracer(REMOTE.muzzleWorld(_r), _e, w.pellets ? 0.35 : 0.9); if (_e.distanceTo(camera.position) > 1.2) { const hit = worldRayHit(_r, _d.copy(_e).sub(_r).normalize(), 300); FX.impact(_e, hit.normal, hit.mat, 0.8); } }
}

/* ---------- match flow (both sides) ---------- */
function onMyHP(hp) { if (hp < myHP) { $('vignette').style.opacity = 1; setTimeout(() => ($('vignette').style.opacity = 0), 60); AUDIO.hurt(); } myHP = hp; updateHUDHealth(); }
function onKill(m) {
  GAME.levels = m.lv; updateHUDLevels();
  killFeed(m.k, m.v, m.w, m.z);
  if (m.v === GAME.me) { alive = false; AUDIO.death(); $('deathscreen').classList.remove('hidden'); setTimeout(() => { if (GAME.phase !== 'playing') return; respawnAt(m.sp); }, CFG.respawnDelay * 1000); }
  else { REMOTE.kill(); if (GAME.solo) setTimeout(() => { if (GAME.phase !== 'playing') return; REMOTE.teleport(m.sp[0], m.sp[1], m.sp[2], m.sp[3]); REMOTE.dead = false; REMOTE.setGun(GAME.levels[1]); }, CFG.respawnDelay * 1000); }
  if (m.k === GAME.me) { banner('KILL'); showKill(); AUDIO.killConfirm(); setTimeout(() => { if (m.win) return; startSwitch(m.lv[GAME.me]); AUDIO.advance(); banner(m.lv[GAME.me] === WEAPONS.length - 1 ? 'GAME POINT' : 'WEAPON ADVANCED', 900, true); }, 650); }
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
      REMOTE.set(m.p, m.y, m.pi, !!m.c, m.w | 0, m.m | 0, !!m.g, !!m.a, !!m.d, !!m.l, !!m.r);
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
  const p = PLAYER.pos, m = { t: 's', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +PLAYER.yaw.toFixed(3), pi: +PLAYER.pitch.toFixed(3), c: PLAYER.crouch ? 1 : 0, w: GUN.idx, m: movingNow ? (PLAYER.sprinting ? 2 : 1) : 0, g: PLAYER.grounded ? 1 : 0, a: GUN.adsT > 0.5 ? 1 : 0, l: PLAYER.ladder ? 1 : 0, r: GUN.state === 'reload' ? 1 : 0, d: alive ? 0 : 1 };
  if (GAME.isHost) { m.hp = GAME.hp[1]; m.lv = GAME.levels; }
  NET.send(m);
}
