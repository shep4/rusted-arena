'use strict';
/* ============================== PLAYER ================================== */
const INPUT = { keys: new Set(), mdx: 0, mdy: 0, fireHeld: false, rightHeld: false, locked: false, fallback: false };
const PLAYER = { pos: new THREE.Vector3(0, 0, 20), vel: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: false, grounded: true, onLadder: false, height: CFG.height, eye: CFG.eye, stepT: 0, frozen: true, sprinting: false, sprintEnd: -9, lastMdx: 0, lastMdy: 0 };
let alive = true, myHP = CFG.maxHP;

function canStand() { const b = playerBox(PLAYER.pos, CFG.height); return !SOLIDS.some(S => overlap(b, S)); }
function resolveAxis(P, axis) {
  let b = playerBox(P.pos, P.height);
  for (const S of SOLIDS) {
    if (!overlap(b, S)) continue;
    if ((P.grounded || P.onLadder) && S.max.y > P.pos.y && S.max.y - P.pos.y <= CFG.stepUp) { // step up onto low obstacles (stairs)
      const oldY = P.pos.y; P.pos.y = S.max.y + 0.001; const b2 = playerBox(P.pos, P.height);
      if (!SOLIDS.some(T => overlap(b2, T))) { b = b2; continue; }
      P.pos.y = oldY;
    }
    if (P.vel[axis] > 0) P.pos[axis] = S.min[axis] - CFG.radius - 0.001; else P.pos[axis] = S.max[axis] + CFG.radius + 0.001;
    P.vel[axis] = 0; b = playerBox(P.pos, P.height);
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
  const wasGrounded = P.grounded, vyBefore = P.vel.y;
  P.pos.x += P.vel.x * dt; resolveAxis(P, 'x');
  P.pos.z += P.vel.z * dt; resolveAxis(P, 'z');
  P.pos.y += P.vel.y * dt; P.grounded = false;
  if (P.pos.y <= 0) { P.pos.y = 0; if (P.vel.y < 0) P.vel.y = 0; P.grounded = true; }
  const b = playerBox(P.pos, P.height);
  for (const S of SOLIDS) { if (!overlap(b, S)) continue; if (P.vel.y <= 0) { P.pos.y = S.max.y; P.grounded = true; } else P.pos.y = S.min.y - P.height - 0.001; P.vel.y = 0; break; }
  if (!wasGrounded && P.grounded && vyBefore < -4) AUDIO.land();
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.grounded && hs > 1.5) { P.stepT -= dt; if (P.stepT <= 0) { AUDIO.step(); P.stepT = sprint ? 0.3 : 0.45; } } else P.stepT = 0.15;
  P.eye = lerp(P.eye, P.crouch ? CFG.crouchEye : CFG.eye, 1 - Math.exp(-dt * 14));
  camera.position.set(P.pos.x, P.pos.y + P.eye, P.pos.z);
  camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = P.yaw; camera.rotation.x = P.pitch;
  return hs > 1.5;
}

