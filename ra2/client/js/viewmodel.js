'use strict';
/* ============================== VIEWMODEL ===============================
   First-person weapon presentation: hip / ADS / sprint poses, mouse inertia, sway, bob, kick, reload and switch
   animation driven by GUN's state machine, muzzle flash + light, shell ejection, scope camera sway. */
const VM = { g: new THREE.Group(), model: null, flash: null, light: null, kickZ: 0, kickZV: 0, kickRot: 0, kickRotV: 0, lagX: 0, lagY: 0, lagVX: 0, lagVY: 0,
  sprintT: 0, adsPos: new THREE.Vector3(), tmp: new THREE.Vector3(), q: new THREE.Quaternion(), magHome: null, boltHome: null, scopeSwayX: 0, scopeSwayY: 0, breath: 0 };
camera.add(VM.g);
const HIP = new THREE.Vector3(0.24, -0.2, -0.42), SPRINT_POS = new THREE.Vector3(0.3, -0.3, -0.36);
VM.light = new THREE.PointLight(0xffc070, 0, 7, 2); scene.add(VM.light);
function VMBuild() {
  while (VM.g.children.length) VM.g.remove(VM.g.children[0]);
  const w = W(); VM.model = buildGunMesh(w); VM.g.add(VM.model.g);
  VM.magHome = VM.model.parts.mag ? VM.model.parts.mag.position.clone() : null; VM.boltHome = VM.model.parts.bolt ? VM.model.parts.bolt.position.clone() : null;
  if (!w.melee) { const fsz = w.pellets ? 0.26 : 0.12 + w.vm.len * 0.08; VM.flash = new THREE.Mesh(new THREE.PlaneGeometry(fsz, fsz), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })); VM.flash.position.copy(VM.model.muzzle); VM.flash.visible = false; VM.g.add(VM.flash); } else VM.flash = null;
  VM.g.position.copy(HIP); VM.g.rotation.set(0, 0.04, 0.02);
}
function VMKick(w) {
  VM.kickZV += w.kick * 3.2; VM.kickRotV += w.kick * 5;
  if (VM.flash) { VM.flash.visible = true; VM.flash.rotation.z = Math.random() * 6; VM.flash.scale.setScalar(0.8 + Math.random() * 0.5); setTimeout(() => VM.flash && (VM.flash.visible = false), 40); }
  VM.light.intensity = 2.5 + w.kick * 10; VMMuzzleWorld(VM.light.position);
  if (!w.melee) FX.muzzleSmoke(VMMuzzleWorld(VM.tmp));
}
function VMMuzzleWorld(out) { return VM.g.localToWorld(out.copy(VM.model.muzzle)); }
function VMEject() { if (!VM.model.eject) return; const right = VM.tmp.set(1, 0, 0).applyQuaternion(camera.quaternion); FX.shell(VM.g.localToWorld(new THREE.Vector3().copy(VM.model.eject)), right); }
function VMUpdate(dt) {
  const w = W(), P = PLAYER, t = P.time, weight = w.weight;
  VM.light.intensity = Math.max(0, VM.light.intensity - dt * 60);
  // springs: kick (recoil push-back) and mouse inertia (weapon lags the camera, settles)
  VM.kickZV += (-VM.kickZ * 220 - VM.kickZV * 20) * dt; VM.kickZ += VM.kickZV * dt;
  VM.kickRotV += (-VM.kickRot * 260 - VM.kickRotV * 22) * dt; VM.kickRot += VM.kickRotV * dt;
  const inertia = 0.0022 * weight * lerp(1, 0.25, GUN.adsT) * lerp(1, 1.5, P.sprintT);
  VM.lagVX += (-P.lastMdx * inertia * 40 - VM.lagX * 140 - VM.lagVX * 16) * dt; VM.lagX += VM.lagVX * dt;
  VM.lagVY += (-P.lastMdy * inertia * 40 - VM.lagY * 140 - VM.lagVY * 16) * dt; VM.lagY += VM.lagVY * dt;
  VM.sprintT = lerp(VM.sprintT, P.sprinting ? 1 : 0, 1 - Math.exp(-dt * 9));
  // pose blend: hip -> sprint -> ads
  VM.adsPos.set(0, -(w.vm.h / 2 + 0.025), -0.52);
  VM.g.position.lerpVectors(HIP, SPRINT_POS, VM.sprintT); VM.g.position.lerp(VM.adsPos, GUN.adsT);
  let rx = 0.04 * VM.sprintT * 0 + 0.35 * VM.sprintT, ry = 0.04 * (1 - GUN.adsT) + 0.55 * VM.sprintT, rz = 0.02 * (1 - GUN.adsT) - 0.12 * VM.sprintT;
  // bob (weapon bobs more than the head), idle sway / breathing
  const bobAmp = lerp(CFG.bobWalk, CFG.bobSprint, P.sprintT) * P.moveT * 1.6 * (1 - GUN.adsT * 0.9);
  VM.g.position.x += Math.sin(P.bobPhase) * bobAmp * 0.7 + VM.lagX * 0.7 + Math.sin(t * 0.9) * 0.0015 * weight * (1 - GUN.adsT * 0.6);
  VM.g.position.y += Math.abs(Math.cos(P.bobPhase)) * bobAmp - VM.kickZ * 0.15 + VM.lagY * 0.5 + Math.sin(t * 1.3) * 0.0012 * weight * (1 - GUN.adsT * 0.6);
  VM.g.position.z += VM.kickZ;
  rx += VM.kickRot * (w.melee ? -3 : 1) + VM.lagY * 1.2; ry += VM.lagX * 1.4; rz += -P.bobX * 2 * P.sprintT;
  // reload animation by phase
  const mag = VM.model.parts.mag, bolt = VM.model.parts.bolt, pump = VM.model.parts.pump;
  if (mag && VM.magHome) mag.position.copy(VM.magHome), mag.visible = true;
  if (bolt && VM.boltHome) bolt.position.copy(VM.boltHome);
  if (GUN.state === 'reload') {
    const pr = GUN.reloadProgress, ph = GUN.reloadPhases ? GUN.reloadPhases[GUN.reloadPhase][0] : (GUN.reloadPhase === 99 ? 'pump' : 'shell');
    if (ph === 'lower') { rx += 0.5 * pr; ry -= 0.15 * pr; VM.g.position.y -= 0.08 * pr; }
    else if (ph === 'magOut') { rx += 0.5; ry -= 0.15; VM.g.position.y -= 0.08; if (mag) { mag.position.y -= pr * 0.3; mag.visible = pr < 0.85; } }
    else if (ph === 'magIn') { rx += 0.5; ry -= 0.15; VM.g.position.y -= 0.08; if (mag) { mag.position.y -= (1 - pr) * 0.3; mag.visible = pr > 0.2; } }
    else if (ph === 'chamber') { rx += 0.5 - 0.2 * pr; ry -= 0.15 - 0.3 * Math.sin(pr * Math.PI); VM.g.position.y -= 0.08; VM.g.position.z += 0.05 * Math.sin(pr * Math.PI); if (bolt) bolt.position.z += 0.06 * Math.sin(pr * Math.PI); }
    else if (ph === 'raise') { rx += 0.3 * (1 - pr); ry -= 0.15 * (1 - pr); VM.g.position.y -= 0.08 * (1 - pr); }
    else if (ph === 'shell') { rx += 0.35; ry -= 0.25; rz += 0.3; VM.g.position.y -= 0.06 + 0.03 * Math.sin(pr * Math.PI); VM.g.position.x += 0.04; }
  }
  if (GUN.state === 'bolt' && bolt) { const pr = 1 - GUN.boltT / GUN.boltDur, k = Math.sin(pr * Math.PI); bolt.position.z += 0.07 * k; rz += 0.25 * k; rx += 0.08 * k; VM.g.position.x += 0.03 * k; }
  if (pump) pump.position.z = VM.model.pumpZ + Math.sin(GUN.pumpT * Math.PI) * 0.09;
  if (GUN.state === 'switch') { const k = GUN.switchPhase === 'lower' ? GUN.switchProgress : 1 - GUN.switchProgress; VM.g.position.y -= 0.32 * k; rx += 0.7 * k; ry -= 0.2 * k; }
  VM.g.rotation.set(rx, ry, rz);
  // scoped: hide the model, breathe the camera; unscoped ADS gets a faint settle instead
  const scoped = w.scoped && GUN.adsT > 0.85;
  const sway = (w.scopeSway || 0) * (scoped ? 1 : 0) * (P.crouch ? 0.55 : 1) * (movingNow ? 2.2 : 1) * 0.0022;
  VM.scopeSwayX = Math.sin(t * 1.7) * sway + Math.sin(t * 2.9) * sway * 0.4; VM.scopeSwayY = Math.cos(t * 1.1) * sway * 0.8;
  camera.rotation.x += VM.scopeSwayX; camera.rotation.y += VM.scopeSwayY;
  VM.g.visible = !scoped;
  const sc = $('scope'); sc.classList.toggle('hidden', !scoped); if (scoped) { sc.dataset.reticle = w.reticle || 'mil'; sc.style.transform = `translate(${VM.scopeSwayY * -900}px, ${VM.scopeSwayX * 900}px)`; }
  $('xhair').style.opacity = w.melee ? 0.4 : (GUN.adsT > 0.3 ? 0.35 : 1);
  const st = GUN.state === 'switch' ? 'SWITCHING' : GUN.state === 'bolt' ? '' : GUN.state === 'reload' ? 'RELOADING' : GUN.state === 'empty' && GUN.reserve <= 0 ? 'NO AMMO' : '';
  if ($('reload').textContent !== st) { $('reload').textContent = st; } $('reload').classList.toggle('hidden', !st);
}
