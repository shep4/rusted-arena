'use strict';
/* ============================== PLAYER ================================== */
const INPUT = { keys: new Set(), mdx: 0, mdy: 0, fireHeld: false, rightHeld: false, locked: false, fallback: false };
const PLAYER = { pos: new THREE.Vector3(0, 0, 20), vel: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: false, grounded: true, onLadder: false, height: CFG.height, eye: CFG.eye, stepT: 0, frozen: true, sprinting: false, sprintEnd: -9, lastMdx: 0, lastMdy: 0, fallStart: 0, lastFall: 0 };
let alive = true, myHP = CFG.maxHP;

function canStand() { const b = playerBox(PLAYER.pos, CFG.height); return !SOLIDS.some(S => overlap(b, S)); }
const COLL = { maxStep: 0.12, maxSubsteps: 10, probe: 0.04, eps: 0.001 }; // substep size keeps every move shorter than the thinnest solid
function firstOverlap(pos, h) { const b = playerBox(pos, h); for (const S of SOLIDS) if (overlap(b, S)) return S; return null; }
// Push the player out of every solid along one horizontal axis. Step-up onto low obstacles (stairs) when grounded.
function resolveAxis(P, axis, delta) {
  for (let i = 0; i < 6; i++) {
    const S = firstOverlap(P.pos, P.height); if (!S) return;
    if ((P.grounded || P.onLadder) && S.max.y > P.pos.y && S.max.y - P.pos.y <= CFG.stepUp) {
      const oldY = P.pos.y; P.pos.y = S.max.y + COLL.eps;
      if (!firstOverlap(P.pos, P.height)) continue;
      P.pos.y = oldY;
    }
    if (delta > 0) P.pos[axis] = S.min[axis] - CFG.radius - COLL.eps;
    else if (delta < 0) P.pos[axis] = S.max[axis] + CFG.radius + COLL.eps;
    else { const a = (S.max[axis] + CFG.radius + COLL.eps) - P.pos[axis], b = P.pos[axis] - (S.min[axis] - CFG.radius - COLL.eps); P.pos[axis] += a < b ? a : -b; }
    P.vel[axis] = 0;
  }
}
// Vertical: land on the highest top below us / stop under the lowest ceiling above us, checking every solid.
function resolveVertical(P, dy) {
  for (let i = 0; i < 6; i++) {
    const S = firstOverlap(P.pos, P.height); if (!S) break;
    if (dy <= 0) { P.pos.y = S.max.y; P.grounded = true; } else { P.pos.y = S.min.y - P.height - COLL.eps; }
    P.vel.y = 0;
  }
  if (P.pos.y <= 0) { P.pos.y = 0; if (P.vel.y < 0) P.vel.y = 0; P.grounded = true; }
  if (!P.grounded && P.vel.y <= 0) { // ground probe: a few cm below the feet still counts as standing (stairs, seams)
    const probe = playerBox({ x: P.pos.x, y: P.pos.y - COLL.probe, z: P.pos.z }, P.height);
    for (const S of SOLIDS) if (overlap(probe, S) && S.max.y <= P.pos.y + COLL.eps) { P.pos.y = S.max.y; P.grounded = true; P.vel.y = 0; break; }
    if (!P.grounded && P.pos.y <= COLL.probe) { P.pos.y = 0; P.grounded = true; P.vel.y = 0; }
  }
}
// Swept move: split the frame's displacement into substeps so no single step exceeds COLL.maxStep.
function moveAndCollide(P, dt) {
  const dx = P.vel.x * dt, dy = P.vel.y * dt, dz = P.vel.z * dt;
  const n = Math.min(COLL.maxSubsteps, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / COLL.maxStep)));
  const sx = dx / n, sy = dy / n, sz = dz / n;
  for (let i = 0; i < n; i++) {
    // horizontal velocity may have been zeroed by a wall mid-sweep; recompute the remaining per-step move
    const mx = P.vel.x === 0 ? 0 : sx, mz = P.vel.z === 0 ? 0 : sz, my = P.vel.y === 0 && i > 0 ? 0 : sy;
    P.pos.x += mx; resolveAxis(P, 'x', mx);   // step-up inside uses the grounded state from the previous substep/frame
    P.pos.z += mz; resolveAxis(P, 'z', mz);
    P.grounded = false;
    P.pos.y += my; resolveVertical(P, my);
  }
}
function updatePlayer(dt) {
  const P = PLAYER, k = INPUT.keys;
  const sens = CFG.sens * SETTINGS.sens * (GUN.adsT > 0.5 ? 0.6 : 1);
  if (INPUT.locked || INPUT.fallback) { P.yaw -= INPUT.mdx * sens; P.pitch = clamp(P.pitch - INPUT.mdy * sens, -1.5, 1.5); }
  P.lastMdx = INPUT.mdx; P.lastMdy = INPUT.mdy;
  INPUT.mdx = INPUT.mdy = 0;
  const wantCrouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
  if (wantCrouch) P.crouch = true; else if (P.crouch && canStand()) P.crouch = false;
  P.height = P.crouch ? CFG.crouchHeight : CFG.height;
  let f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  if (P.frozen || !alive) { f = 0; s = 0; }
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let dx = -sin * f + cos * s, dz = -cos * f - sin * s; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; }
  const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && f > 0 && !P.crouch && !INPUT.fireHeld && GUN.adsT < 0.3 && !GUN.reloading;
  if (P.sprinting && !sprint) P.sprintEnd = now(); P.sprinting = sprint;
  let speed = (P.crouch ? CFG.crouch : (sprint ? CFG.sprint : CFG.walk)) * W().move * (GUN.adsT > 0.5 ? 0.6 : 1);
  const pb = playerBox(P.pos, P.height);
  P.onLadder = !P.frozen && alive && LADDERS.some(L => overlap(pb, L));
  if (P.onLadder) { P.vel.y = f > 0 ? CFG.ladderSpeed : (f < 0 ? -CFG.ladderSpeed : 0); speed *= 0.4; }
  else P.vel.y -= CFG.gravity * dt;
  const kk = (P.grounded || P.onLadder) ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 2.5);
  P.vel.x = lerp(P.vel.x, dx * speed, kk); P.vel.z = lerp(P.vel.z, dz * speed, kk);
  if (k.has('Space') && P.grounded && !P.frozen && alive) { P.vel.y = CFG.jump; P.grounded = false; AUDIO.jump(); }
  const wasGrounded = P.grounded;
  if (wasGrounded) P.fallStart = P.pos.y; else if (P.pos.y > P.fallStart) P.fallStart = P.pos.y; // apex while airborne
  moveAndCollide(P, dt);
  P.lastFall = 0; // set for exactly one frame on landing; Milestone 2 uses it for landing feedback
  if (!wasGrounded && P.grounded) { P.lastFall = Math.max(0, P.fallStart - P.pos.y); if (P.lastFall > 1.2) AUDIO.land(); }
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.grounded && hs > 1.5) { P.stepT -= dt; if (P.stepT <= 0) { AUDIO.step(); P.stepT = sprint ? 0.3 : 0.45; } } else P.stepT = 0.15;
  P.eye = lerp(P.eye, P.crouch ? CFG.crouchEye : CFG.eye, 1 - Math.exp(-dt * 14));
  camera.position.set(P.pos.x, P.pos.y + P.eye, P.pos.z);
  camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = P.yaw; camera.rotation.x = P.pitch;
  return hs > 1.5;
}

