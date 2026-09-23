'use strict';
/* ============================== PLAYER ================================== */
const INPUT = { keys: new Set(), mdx: 0, mdy: 0, fireHeld: false, rightHeld: false, locked: false, fallback: false };
const PLAYER = { pos: new THREE.Vector3(0, 0, 20), vel: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: false, grounded: true, onLadder: false, height: CFG.height, eye: CFG.eye, stepT: 0, frozen: true, sprinting: false, sprintEnd: -9, lastMdx: 0, lastMdy: 0, fallStart: 0, lastFall: 0, lastGroundT: 0, jumpPressT: -9, jumpHeld: false, camDip: 0, camDipV: 0, mantled: false, time: 0, wishX: 0, wishZ: 0, ladder: null, ladderState: 'normal', ladderT: 0, ladderCooldown: 0, rungT: 0, sprintT: 0, crouchT: 0, moveT: 0, bobPhase: 0, bobX: 0, bobY: 0, surface: 'sand', speedFrac: 0 };
let alive = true, myHP = CFG.maxHP;

function canStand() { const b = playerBox(PLAYER.pos, CFG.height); return !SOLIDS.some(S => overlap(b, S)); }
const COLL = { maxStep: 0.12, maxSubsteps: 10, probe: 0.04, eps: 0.001 };
const _BOXA = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, _BOXB = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
function fillBox(b, pos, h) { const r = CFG.radius; b.min.x = pos.x - r; b.min.y = pos.y; b.min.z = pos.z - r; b.max.x = pos.x + r; b.max.y = pos.y + h; b.max.z = pos.z + r; return b; } // substep size keeps every move shorter than the thinnest solid
function firstOverlap(pos, h) { const b = fillBox(_BOXA, pos, h); for (const S of SOLIDS) if (overlap(b, S)) return S; return null; }
// Push the player out of every solid along one horizontal axis. Step-up onto low obstacles (stairs) when grounded.
function resolveAxis(P, axis, delta) {
  for (let i = 0; i < 6; i++) {
    const S = firstOverlap(P.pos, P.height); if (!S) return;
    const rise = S.max.y - P.pos.y;
    const canStep = (P.grounded || P.onLadder) && rise <= CFG.stepUp;
    // mantle: airborne near/after the apex, with the stick pushed toward this wall
    const wish = axis === 'x' ? P.wishX : P.wishZ, toward = (S.min[axis] + S.max[axis]) / 2 - P.pos[axis];
    const canMantle = !P.grounded && !P.onLadder && P.vel.y <= 2 && rise <= CFG.mantle && Math.abs(wish) > 0.3 && Math.sign(wish) === Math.sign(toward);
    if (rise > 0 && (canStep || canMantle)) {
      const oldY = P.pos.y; P.pos.y = S.max.y + COLL.eps;
      if (!firstOverlap(P.pos, P.height)) { if (canMantle) { P.vel.y = 0; P.mantled = true; } continue; }
      P.pos.y = oldY;
    }
    if (delta === 0) return; // no motion on this axis: leave the overlap to vertical resolution (avoids long sideways ejections)
    if (delta > 0) P.pos[axis] = S.min[axis] - CFG.radius - COLL.eps;
    else P.pos[axis] = S.max[axis] + CFG.radius + COLL.eps;
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
    const probe = fillBox(_BOXB, { x: P.pos.x, y: P.pos.y - COLL.probe, z: P.pos.z }, P.height);
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
    const nudge = !P.grounded && !P.onLadder ? 0.015 : 0;
    const mx = (P.vel.x === 0 ? 0 : sx) + P.wishX * nudge, mz = (P.vel.z === 0 ? 0 : sz) + P.wishZ * nudge, my = P.vel.y === 0 && i > 0 ? 0 : sy;
    P.pos.x += mx; resolveAxis(P, 'x', mx);   // step-up inside uses the grounded state from the previous substep/frame
    P.pos.z += mz; resolveAxis(P, 'z', mz);
    P.grounded = false;
    P.pos.y += my; resolveVertical(P, my);
  }
}

/* ---------- ladder state machine: normal -> enter -> climb -> (exit top | drop off | jump off) ---------- */
function ladderAt(P) {
  const b = fillBox(_BOXB, P.pos, P.height); const grow = 0.12;
  for (const L of LADDERS) if (b.min.x < L.max.x + grow && b.max.x > L.min.x - grow && b.min.y < L.max.y && b.max.y > L.min.y && b.min.z < L.max.z + grow && b.max.z > L.min.z - grow) return L;
  return null;
}
function ladderDetach(P, pushOff) {
  const L = P.ladder; P.ladder = null; P.ladderState = 'normal'; P.onLadder = false; P.ladderCooldown = CFG.ladderGrabCooldown;
  if (pushOff && L) { P.vel.x = L.nx * CFG.ladderJumpOff; P.vel.z = L.nz * CFG.ladderJumpOff; P.vel.y = CFG.ladderJumpUp; P.grounded = false; AUDIO.jump(); }
}
function updateLadder(P, f, s, dt) {
  P.ladderCooldown = Math.max(0, P.ladderCooldown - dt);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); // camera forward on the ground plane
  if (!P.ladder) {
    P.onLadder = false;
    if (P.frozen || !alive || P.ladderCooldown > 0) return;
    const L = ladderAt(P); if (!L) return;
    const alongOff = L.along === 'x' ? P.pos.x - L.cx : P.pos.z - L.cz; if (Math.abs(alongOff) > 0.45) return; // must be between the rails, not grazing the side
    const facingWall = fx * -L.nx + fz * -L.nz;           // >0 when looking at the rails
    const nearTop = P.pos.y >= L.y1 - 0.3;
    const wantUp = f > 0 && facingWall > 0.35 && !nearTop; // walk into the rails
    const wantDown = f < 0 && facingWall < -0.35 && nearTop && P.grounded; // back off the platform edge onto the ladder
    const falling = !P.grounded && P.vel.y < -1 && P.pos.y > L.y0 + 0.3 && P.pos.y < L.y1 - 0.2 && facingWall > 0; // grab while falling past
    if (!(wantUp || wantDown || falling)) return;
    P.ladder = L; P.ladderState = 'enter'; P.ladderT = 0; P.onLadder = true; P.crouch = false; P.height = CFG.height;
    P.vel.set(0, 0, 0); P.grounded = false;
    if (wantDown) { // snap straight onto the rail line so no part of the body is over the platform, then start just below the lip
      if (L.along === 'x') P.pos.z = L.cz + L.nz * 0.03; else P.pos.x = L.cx + L.nx * 0.03;
      P.pos.y = Math.min(P.pos.y, L.y1 - 0.08);
    }
    return;
  }
  const L = P.ladder; P.onLadder = true; P.grounded = false;
  // --- alignment toward the rail line (perpendicular axis) and clamp along the rails
  const perpX = L.along === 'x' ? 0 : 1, perpZ = L.along === 'x' ? 1 : 0;
  const k = 1 - Math.exp(-dt * CFG.ladderAlign);
  if (perpX) P.pos.x = lerp(P.pos.x, L.cx, k); else P.pos.z = lerp(P.pos.z, L.cz, k);
  if (P.ladderState === 'enter') { P.ladderT += dt; if (P.ladderT > 0.12) P.ladderState = 'climb'; }
  // --- inputs: W/S climb, A/D shuffle along the rails (side exit), Space jumps off
  const climb = f;
  const sideDir = L.along === 'x' ? 1 : -1; // so that "right" on screen moves right on the ladder for the common facing
  const lateral = s * CFG.ladderLateral * (fx * -L.nx + fz * -L.nz >= 0 ? 1 : -1) * sideDir;
  if (L.along === 'x') P.pos.x += lateral * dt; else P.pos.z += lateral * dt;
  P.vel.set(0, climb * CFG.ladderSpeed, 0);
  P.pos.y += P.vel.y * dt;
  if (climb !== 0) { P.rungT -= dt; if (P.rungT <= 0) { AUDIO.ladder(); P.rungT = 0.34; } } else P.rungT = 0.1;
  const space = INPUT.keys.has('Space');
  if (space && !P.jumpHeld) { P.jumpHeld = true; ladderDetach(P, true); return; }
  P.jumpHeld = space;
  // --- exits
  const alongPos = L.along === 'x' ? P.pos.x - L.cx : P.pos.z - L.cz;
  if (Math.abs(alongPos) > 0.55) { ladderDetach(P, false); return; }                       // slid off the side
  if (P.pos.y >= L.y1 - 0.02 && climb > 0) {                                                 // top exit: step onto the platform
    P.ladderState = 'exit'; P.pos.y = L.y1 + COLL.eps;
    P.pos.x += -L.nx * (CFG.radius + 0.25); P.pos.z += -L.nz * (CFG.radius + 0.25);
    if (firstOverlap(P.pos, P.height)) { P.pos.x -= -L.nx * 0.25; P.pos.z -= -L.nz * 0.25; }
    P.grounded = true; ladderDetach(P, false); P.ladderCooldown = 0.5; P.vel.set(0, 0, 0); return;
  }
  if (P.pos.y <= L.y0 + 0.02 && climb < 0) {                                                 // bottom exit
    P.pos.y = L.y0; ladderDetach(P, false); P.grounded = true; P.vel.set(0, 0, 0); return;
  }
  if (P.pos.y > L.y1 + 0.6) { P.pos.y = L.y1 + 0.6; }                                        // can't climb into thin air
  if (P.pos.y < L.y0) P.pos.y = L.y0;
}
function updatePlayer(dt) {
  const P = PLAYER, k = INPUT.keys;
  const sens = CFG.sens * SETTINGS.sens * (GUN.adsT > 0.5 ? 0.6 : 1);
  if (INPUT.locked || INPUT.fallback) { P.yaw -= INPUT.mdx * sens; P.pitch = clamp(P.pitch - INPUT.mdy * sens, -1.5, 1.5); }
  P.lastMdx = INPUT.mdx; P.lastMdy = INPUT.mdy;
  INPUT.mdx = INPUT.mdy = 0;
  const wantCrouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
  if (wantCrouch && !P.ladder) P.crouch = true; else if (P.crouch && canStand()) P.crouch = false;
  P.height = P.crouch ? CFG.crouchHeight : CFG.height;
  let f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  if (P.frozen || !alive) { f = 0; s = 0; }
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let dx = -sin * f + cos * s, dz = -cos * f - sin * s; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; }
  P.wishX = dx; P.wishZ = dz;
  const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && f > 0 && !P.crouch && !INPUT.fireHeld && GUN.adsT < 0.3 && GUN.state !== 'switch';
  if (P.sprinting && !sprint) P.sprintEnd = now(); P.sprinting = sprint;
  let speed = (P.crouch ? CFG.crouch : (sprint ? CFG.sprint : CFG.walk)) * W().move * (GUN.adsT > 0.5 ? 0.6 : 1);
  updateLadder(P, f, s, dt);
  if (P.ladder) { speed = 0; }
  else P.vel.y -= CFG.gravity * dt;
  const accelerating = l > 0; const rate = (P.grounded || P.onLadder) ? (accelerating ? CFG.accelGround : CFG.decelGround) : CFG.airAccel;
  const kk = 1 - Math.exp(-dt * rate);
  P.vel.x = lerp(P.vel.x, dx * speed, kk); P.vel.z = lerp(P.vel.z, dz * speed, kk);
  // jump: edge-triggered press, buffered for a moment, allowed for a moment after leaving the ground (coyote time)
  const t = (P.time += dt), space = k.has('Space'); // simulation clock, not wall-clock, so timing windows are frame-consistent
  if (space && !P.jumpHeld) P.jumpPressT = t; P.jumpHeld = space;
  if (P.grounded) P.lastGroundT = t;
  const canJump = !P.frozen && alive && !P.onLadder && P.vel.y <= 0.5 && (P.grounded || t - P.lastGroundT <= CFG.coyote);
  if (canJump && t - P.jumpPressT <= CFG.jumpBuffer) { P.jumpPressT = -9; P.lastGroundT = -9; P.fallStart = P.pos.y; P.vel.y = CFG.jump; P.grounded = false; AUDIO.jump(); }
  const wasGrounded = P.grounded;
  if (wasGrounded) P.fallStart = P.pos.y; else if (P.pos.y > P.fallStart) P.fallStart = P.pos.y; // apex while airborne
  if (P.ladder) { P.vel.set(0, 0, 0); P.grounded = false; for (let i = 0; i < 4 && firstOverlap(P.pos, P.height); i++) { P.pos.x += P.ladder.nx * 0.04; P.pos.z += P.ladder.nz * 0.04; } P.fallStart = P.pos.y; }
  else moveAndCollide(P, dt);
  P.lastFall = 0; P.mantled = false;
  if (!wasGrounded && P.grounded) {
    P.lastFall = Math.max(0, P.fallStart - P.pos.y);
    const f = clamp(P.lastFall / 6, 0, 1);            // 0 at a hop, 1 at a 6 m drop
    if (P.lastFall > 0.4) { P.camDipV -= (1.6 + 4.4 * f); AUDIO.land(0.2 + 0.8 * f); }
  }
  // landing camera dip: critically damped spring on the eye height
  P.camDipV += (-P.camDip * 160 - P.camDipV * 18) * dt; P.camDip = clamp(P.camDip + P.camDipV * dt, -CFG.landDipMax, 0.04);
  const hs = Math.hypot(P.vel.x, P.vel.z);
  P.speedFrac = clamp(hs / CFG.sprint, 0, 1);
  P.sprintT = lerp(P.sprintT, P.sprinting ? 1 : 0, 1 - Math.exp(-dt * 8));
  P.crouchT = lerp(P.crouchT, P.crouch ? 1 : 0, 1 - Math.exp(-dt * CFG.crouchRate));
  P.moveT = lerp(P.moveT, P.grounded && hs > 1.2 ? 1 : 0, 1 - Math.exp(-dt * 10));
  P.surface = P.grounded ? (P.pos.y > 0.05 ? 'metal' : 'sand') : P.surface;
  // footsteps: cadence by state, none airborne or on ladders
  if (P.grounded && !P.ladder && hs > 1.5) { P.stepT -= dt; if (P.stepT <= 0) { AUDIO.step(P.crouch ? 0.45 : (P.sprinting ? 1.1 : 0.8), P.surface, P.sprinting); P.stepT = P.crouch ? 0.58 : (P.sprinting ? 0.31 : 0.44); } } else P.stepT = 0.12;
  // head bob: subtle, competitive; sprint adds amplitude, ADS almost removes it
  const bobAmp = lerp(CFG.bobWalk, CFG.bobSprint, P.sprintT) * P.moveT * (1 - GUN.adsT * 0.85);
  P.bobPhase += dt * CFG.bobRate * (0.6 + P.speedFrac) * P.moveT;
  P.bobX = lerp(P.bobX, Math.sin(P.bobPhase) * bobAmp * 0.6, 1 - Math.exp(-dt * 12));
  P.bobY = lerp(P.bobY, Math.abs(Math.cos(P.bobPhase)) * bobAmp, 1 - Math.exp(-dt * 12));
  P.eye = lerp(P.eye, P.crouch ? CFG.crouchEye : CFG.eye, 1 - Math.exp(-dt * CFG.crouchRate));
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw); // camera right vector on the ground plane
  camera.position.set(P.pos.x + rx * P.bobX, P.pos.y + P.eye + P.camDip + P.bobY, P.pos.z + rz * P.bobX);
  camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = P.yaw; camera.rotation.x = P.pitch; camera.rotation.z = -P.bobX * 0.6 * P.sprintT;
  return hs > 1.5;
}

