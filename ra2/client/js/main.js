'use strict';
/* ============================== MAIN LOOP =============================== */
let last = now(), movingNow = false;
const ADS_POS = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const t = now(), dt = Math.min(0.05, t - last); last = t;
  const inMatch = ['playing', 'countdown', 'over'].includes(GAME.phase);
  if (inMatch) {
    movingNow = updatePlayer(dt);
    REMOTE.update(dt);
    const w = W();
    if (INPUT.fireHeld && (w.auto || GUN.wantFire)) shoot();
    // recoil settles back when you stop firing
    if (GUN.recoilPitch > 0 && t - GUN.lastShot > 0.08) { const r = Math.min(GUN.recoilPitch, w.recover * dt); PLAYER.pitch -= r; GUN.recoilPitch -= r; }
    // aim down sights
    const adsTarget = INPUT.locked && INPUT.rightHeld && alive && !GUN.reloading && !PLAYER.sprinting && GAME.phase === 'playing' ? 1 : 0;
    GUN.adsT = clamp(GUN.adsT + (adsTarget ? 1 : -1.6) * dt / w.adsTime, 0, 1);
    camera.fov = lerp(CFG.fov, w.adsFov, GUN.adsT); camera.updateProjectionMatrix();
    // view model: hip <-> ads position, bob, sway, kick, reload dip, pump slide
    VM.kick = Math.max(0, VM.kick - dt * 9); VM.bob += dt * (movingNow ? (PLAYER.sprinting ? 13 : 10) : 3);
    GUN.reloadT = lerp(GUN.reloadT, GUN.reloading ? 1 : 0, 1 - Math.exp(-dt * 12)); GUN.pumpT = Math.max(0, GUN.pumpT - dt * 3);
    GUN.swayX = lerp(GUN.swayX, -PLAYER.lastMdx * 0.0008, 1 - Math.exp(-dt * 10)); GUN.swayY = lerp(GUN.swayY, -PLAYER.lastMdy * 0.0008, 1 - Math.exp(-dt * 10));
    const bobAmt = (movingNow ? 0.012 : 0.003) * (1 - GUN.adsT * 0.85);
    ADS_POS.set(0, -(w.vm.h / 2 + 0.025), -0.52);
    VM.g.position.lerpVectors(HIP, ADS_POS, GUN.adsT);
    VM.g.position.x += Math.sin(VM.bob) * bobAmt * 0.5 + GUN.swayX * 0.6; VM.g.position.y += Math.abs(Math.cos(VM.bob)) * bobAmt - VM.kick * 0.01 - GUN.reloadT * 0.12 + Math.sin(t * 1.3) * 0.002 + GUN.swayY * 0.4; VM.g.position.z += VM.kick * 0.07;
    VM.g.rotation.set(VM.kick * (w.melee ? -0.9 : 0.18) + GUN.reloadT * 0.55 + GUN.swayY * 0.6, 0.04 * (1 - GUN.adsT) + GUN.swayX * 0.8, 0.02 * (1 - GUN.adsT));
    const pump = VM.model && VM.model.g.getObjectByName('pump'); if (pump) pump.position.z = -w.vm.len * 0.42 * 0 - Math.max(0.16, w.vm.len * 0.42) - 0.15 + Math.sin(GUN.pumpT * Math.PI) * 0.09;
    const scoped = w.scoped && GUN.adsT > 0.85;
    VM.g.visible = !scoped; $('scope').classList.toggle('hidden', !scoped); $('xhair').style.opacity = w.melee ? 0.4 : (GUN.adsT > 0.3 ? 0.35 : 1);
    sendState(dt);
  } else {
    camera.fov = CFG.fov; camera.updateProjectionMatrix();
    camera.position.set(Math.sin(t * 0.08) * 30, 14, Math.cos(t * 0.08) * 30); camera.lookAt(0, 4, 0); VM.g.visible = false;
    if (REMOTE.av) REMOTE.av.g.visible = false;
  }
  FX.update(dt);
  renderer.render(scene, camera);
}
REMOTE.init(1); setWeapon(0); showScreen('main'); frame();
