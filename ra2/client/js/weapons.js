'use strict';
/*
   M5-M9 fields: firstShot (recoil × on the first shot of a burst), jitter (0-1 pattern randomness), weight (inertia/sway; heavier = lazier),
   kick (view-model kick per shot), switchTime (lower+raise seconds), reloadType 'mag' | 'shell' | 'none', shellTime/shellStart/pumpTime (shotgun),
   boltTime (cycle after each shot), scopeSway, reticle 'mil' | 'chevron', snd {body Hz, crack, tail} ============================== WEAPONS =================================
   EDITABLE STATS TABLE. Every number here is safe to change.
   dmg        body damage per bullet (torso ×1.0, arms ×0.8, legs ×0.75, head × hs)
   hs         headshot multiplier
   rpm        rounds per minute            auto   hold to fire
   mag/reserve                              reload seconds
   spread     hip-fire cone (radians)       adsSpread  multiplier while aimed (0 = laser)
   recoil     radians per shot              pattern  per-shot [yaw, pitch] multipliers, loops on the last entry
   recover    radians/sec the view settles back after firing stops
   falloff    [startMeters, endMeters, minMultiplier]  damage ramps down between start and end
   move       movement speed multiplier    adsTime  seconds to fully aim    adsFov  degrees when aimed
   sprintDelay seconds after sprinting before the weapon can fire
   pellets    shotgun only (pellets do nothing past falloff end)
   vm         first-person model recipe (see buildGunMesh)
*/
const WEAPONS = [
  { name: 'Sidearm', dmg: 27, hs: 2.0, rpm: 420, mag: 12, reserve: 60, reload: 1.2, auto: false,
    spread: 0.012, adsSpread: 0.15, recoil: 0.022, pattern: [[0, 1], [0.2, 1], [-0.3, 1.1]], recover: 0.25,
    falloff: [20, 60, 0.6], move: 1.05, adsTime: 0.12, adsFov: 62, sprintDelay: 0.12,
    firstShot: 1.15, jitter: 0.35, weight: 0.55, kick: 0.05, switchTime: 0.45, reloadType: 'mag', snd: { body: 170, crack: 0.9, tail: 0.12 },
    vm: { len: 0.24, h: 0.13, w: 0.045, col: 0x2d2b28, stock: 0, handguard: 0, mag: 0.14, sights: true } },
  { name: 'Pump Shotgun', dmg: 14, hs: 1.4, rpm: 68, mag: 6, reserve: 30, reload: 2.6, auto: false, pellets: 8,
    spread: 0.075, adsSpread: 0.7, recoil: 0.07, pattern: [[0, 1]], recover: 0.35,
    falloff: [8, 18, 0], move: 0.95, adsTime: 0.22, adsFov: 68, sprintDelay: 0.3,
    firstShot: 1.0, jitter: 0.2, weight: 1.15, kick: 0.13, switchTime: 0.7, reloadType: 'shell', shellTime: 0.5, shellStart: 0.35, pumpTime: 0.45, snd: { body: 70, crack: 1.0, tail: 0.35 },
    vm: { len: 0.8, h: 0.11, w: 0.06, col: 0x4a3626, stock: 0.26, handguard: 0.3, mag: 0, pump: true, sights: true } },
  { name: 'Compact SMG', dmg: 22, hs: 1.5, rpm: 840, mag: 30, reserve: 120, reload: 1.6, auto: true,
    spread: 0.024, adsSpread: 0.25, recoil: 0.012, pattern: [[0, 1], [0.4, 1], [0.7, 0.9], [0.2, 1], [-0.5, 1], [-0.8, 0.9], [-0.3, 1]], recover: 0.6,
    falloff: [15, 45, 0.55], move: 1.0, adsTime: 0.15, adsFov: 64, sprintDelay: 0.15,
    firstShot: 1.1, jitter: 0.45, weight: 0.7, kick: 0.045, switchTime: 0.5, reloadType: 'mag', snd: { body: 150, crack: 0.75, tail: 0.14 },
    vm: { len: 0.46, h: 0.13, w: 0.06, col: 0x33312e, stock: 0.16, handguard: 0.14, mag: 0.2, sights: true } },
  { name: 'Assault Rifle', dmg: 31, hs: 1.6, rpm: 660, mag: 30, reserve: 120, reload: 1.9, auto: true,
    spread: 0.014, adsSpread: 0.12, recoil: 0.018, pattern: [[0, 1], [0.1, 1.1], [0.3, 1], [0.5, 0.9], [0.3, 0.8], [-0.2, 0.8], [-0.6, 0.8], [-0.4, 0.7]], recover: 0.8,
    falloff: [30, 80, 0.65], move: 0.95, adsTime: 0.2, adsFov: 58, sprintDelay: 0.2,
    firstShot: 1.25, jitter: 0.3, weight: 0.95, kick: 0.06, switchTime: 0.6, reloadType: 'mag', snd: { body: 120, crack: 0.95, tail: 0.22 },
    vm: { len: 0.7, h: 0.12, w: 0.06, col: 0x3d3a2f, stock: 0.28, handguard: 0.28, mag: 0.22, sights: true } },
  { name: 'Tactical Rifle', dmg: 47, hs: 1.8, rpm: 380, mag: 20, reserve: 80, reload: 2.0, auto: false,
    spread: 0.009, adsSpread: 0.08, recoil: 0.032, pattern: [[0, 1], [0.3, 1], [-0.3, 1.1]], recover: 0.7,
    falloff: [45, 110, 0.7], move: 0.92, adsTime: 0.22, adsFov: 50, sprintDelay: 0.25,
    firstShot: 1.3, jitter: 0.25, weight: 1.05, kick: 0.075, switchTime: 0.65, reloadType: 'mag', snd: { body: 105, crack: 1.0, tail: 0.26 },
    vm: { len: 0.78, h: 0.12, w: 0.06, col: 0x4b4a3e, stock: 0.3, handguard: 0.3, mag: 0.2, scope: 0.4, sights: false } },
  { name: 'Precision Rifle', dmg: 96, hs: 2.5, rpm: 42, mag: 5, reserve: 25, reload: 2.9, auto: false,
    spread: 0.03, adsSpread: 0.0, recoil: 0.09, pattern: [[0, 1]], recover: 0.5,
    falloff: [120, 250, 0.9], move: 0.85, adsTime: 0.35, adsFov: 24, sprintDelay: 0.4, scoped: true,
    firstShot: 1.0, jitter: 0.15, weight: 1.4, kick: 0.16, switchTime: 0.85, reloadType: 'mag', boltTime: 0.95, scopeSway: 1.0, reticle: 'mil', snd: { body: 55, crack: 1.2, tail: 0.5 },
    vm: { len: 1.05, h: 0.1, w: 0.06, col: 0x2a2e33, stock: 0.34, handguard: 0.4, mag: 0.12, scope: 0.9, sights: false, bolt: true } },
  { name: 'Marksman Rifle', dmg: 63, hs: 2.0, rpm: 210, mag: 10, reserve: 40, reload: 2.2, auto: false,
    spread: 0.012, adsSpread: 0.03, recoil: 0.045, pattern: [[0, 1], [0.2, 1], [-0.2, 1]], recover: 0.6,
    falloff: [60, 160, 0.8], move: 0.9, adsTime: 0.28, adsFov: 40, sprintDelay: 0.3, scoped: true,
    firstShot: 1.15, jitter: 0.2, weight: 1.15, kick: 0.1, switchTime: 0.7, reloadType: 'mag', scopeSway: 0.55, reticle: 'chevron', snd: { body: 85, crack: 1.05, tail: 0.32 },
    vm: { len: 0.92, h: 0.11, w: 0.06, col: 0x5a4a36, stock: 0.32, handguard: 0.34, mag: 0.2, scope: 0.6, sights: false } },
  { name: 'Combat Knife', dmg: 100, hs: 1.0, rpm: 110, mag: Infinity, reserve: Infinity, reload: 0, auto: false, melee: true, range: 2.6,
    spread: 0, adsSpread: 1, recoil: 0, pattern: [[0, 0]], recover: 1, falloff: [2.6, 2.6, 1], move: 1.12, adsTime: 0.1, adsFov: 82, sprintDelay: 0,
    firstShot: 1, jitter: 0, weight: 0.4, kick: 0.02, switchTime: 0.35, reloadType: 'none', snd: { body: 0, crack: 0, tail: 0 },
    vm: { len: 0.3, h: 0.04, w: 0.014, col: 0xb8b8b0, knife: true } },
];
const ZONE_MULT = { head: null, torso: 1.0, arm: 0.8, leg: 0.75 }; // head uses the weapon's hs

// Procedural gun model shared by the first-person view and the remote soldier's hands.
// Origin is the grip/trigger; the barrel points down -Z. Returns { g, muzzle, eject }.
function buildGunMesh(w) {
  const v = w.vm, g = new THREE.Group();
  const M = c => new THREE.MeshLambertMaterial({ color: c });
  const body = M(v.col), dark = M(0x1c1b19), steel = M(0x5b5e63), wood = M(0x5a3d23);
  const box = (mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const cyl = (mat, r, len, x, y, z, rx = Math.PI / 2) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.x = rx; m.position.set(x, y, z); g.add(m); return m; };
  if (v.knife) {
    box(steel, v.w, v.h, v.len, 0, 0, -v.len / 2 - 0.05); box(dark, 0.03, 0.05, 0.13, 0, 0, 0.02); box(steel, 0.05, 0.06, 0.01, 0, 0, -0.045);
    return { g, muzzle: new THREE.Vector3(0, 0, -v.len), eject: null, pumpZ: 0, parts: { mag: null, bolt: null, pump: null } };
  }
  const receiverLen = Math.max(0.16, v.len * 0.42);
  box(body, v.w, v.h, receiverLen, 0, 0.02, -receiverLen / 2);                       // receiver
  box(dark, v.w * 0.8, 0.12, 0.05, 0, -v.h / 2 - 0.05, 0.0);                          // pistol grip
  if (v.mag) box(dark, v.w * 0.7, v.mag, 0.055, 0, -v.h / 2 - v.mag / 2, -receiverLen * 0.6).name = 'mag'; // magazine
  if (v.stock) box(v.pump ? wood : body, v.w * 0.9, v.h * 0.8, v.stock, 0, -0.01, v.stock / 2 + 0.02); // stock
  if (v.handguard) box(v.pump ? wood : dark, v.w * 1.05, v.h * 0.85, v.handguard, 0, 0.01, -receiverLen - v.handguard / 2); // handguard
  const barrelLen = v.len - receiverLen - (v.handguard || 0) + 0.1;
  cyl(dark, 0.013, Math.max(0.08, barrelLen), 0, v.h * 0.25, -v.len + barrelLen / 2 - 0.02);  // barrel
  if (v.pump) box(wood, v.w * 1.2, v.h * 0.9, 0.14, 0, -0.02, -receiverLen - 0.15).name = 'pump';
  if (v.bolt) cyl(steel, 0.012, 0.09, v.w / 2 + 0.03, v.h * 0.3, -receiverLen * 0.5, Math.PI / 2).name = 'bolt';
  if (v.sights) { box(dark, 0.01, 0.03, 0.01, 0, v.h / 2 + 0.015, -v.len + 0.03); box(dark, 0.03, 0.025, 0.01, 0, v.h / 2 + 0.012, -0.02); }
  if (v.scope) { cyl(dark, 0.022, v.scope * 0.45, 0, v.h / 2 + 0.045, -receiverLen * 0.5); box(dark, 0.02, 0.03, 0.02, 0, v.h / 2 + 0.015, -receiverLen * 0.3); box(dark, 0.02, 0.03, 0.02, 0, v.h / 2 + 0.015, -receiverLen * 0.7);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: 0x1b3a55 })); lens.position.set(0, v.h / 2 + 0.045, -receiverLen * 0.5 - v.scope * 0.225 - 0.001); g.add(lens); }
  return { g, muzzle: new THREE.Vector3(0, v.h * 0.25, -v.len + 0.05), eject: new THREE.Vector3(v.w / 2 + 0.01, 0.03, -receiverLen * 0.4), pumpZ: -receiverLen - 0.15,
    parts: { mag: g.getObjectByName('mag'), bolt: g.getObjectByName('bolt'), pump: g.getObjectByName('pump') } };
}
