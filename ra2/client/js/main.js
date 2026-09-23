'use strict';
/* ============================== MAIN LOOP =============================== */
let last = now(), movingNow = false;
let errShown = false;
function frame() {
  requestAnimationFrame(frame);
  try { frameBody(); } catch (e) { if (!errShown) { errShown = true; console.error(e); const el = document.createElement('div'); el.id = 'fatal'; el.textContent = 'Game error (still running): ' + (e && e.message || e); document.body.appendChild(el); } }
}
function frameBody() {
  const t = now(), dt = Math.min(0.05, t - last); last = t;
  const inMatch = ['playing', 'countdown', 'over'].includes(GAME.phase);
  if (inMatch) {
    movingNow = updatePlayer(dt);
    REMOTE.update(dt);
    weaponUpdate(dt);
    if (INPUT.fireHeld && W().auto && !GUN.wantFire) tryFire();
    camera.fov = lerp(lerp(CFG.fov, CFG.fov + CFG.sprintFov, PLAYER.sprintT), W().adsFov, GUN.adsT); camera.updateProjectionMatrix();
    VMUpdate(dt);
    sendState(dt);
  } else {
    camera.fov = CFG.fov; camera.updateProjectionMatrix();
    camera.position.set(Math.sin(t * 0.08) * 30, 14, Math.cos(t * 0.08) * 30); camera.lookAt(0, 4, 0); VM.g.visible = false; VM.light.intensity = 0;
    if (REMOTE.av) REMOTE.av.g.visible = false;
    $('scope').classList.add('hidden');
  }
  FX.update(dt);
  renderer.render(scene, camera);
}
REMOTE.init(1); setWeapon(0); showScreen('main'); frame();
