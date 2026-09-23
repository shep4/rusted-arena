'use strict';
/* ============================== UI ====================================== */
const SCREENS = ['main', 'host', 'join', 'settings', 'controls', 'lobby', 'pause', 'over'];
function showScreen(name) { $('menu').classList.toggle('hidden', !name); SCREENS.forEach(s => $('scr-' + s).classList.toggle('hidden', s !== name)); }
let bannerT = null, subT = null;
function banner(text, ms = 800, sub = false) { const el = sub ? $('sub') : $('banner'); el.textContent = text; el.style.opacity = 1; clearTimeout(sub ? subT : bannerT); const h = setTimeout(() => (el.style.opacity = 0), ms); if (sub) subT = h; else bannerT = h; }
function showHit(zone) { const h = $('hitmark'); h.classList.toggle('hs', zone === 'head'); h.style.opacity = 1; zone === 'head' ? AUDIO.headshot() : zone === 'torso' ? AUDIO.hit() : AUDIO.hitLimb(); clearTimeout(h._t); h._t = setTimeout(() => (h.style.opacity = 0), 120); }
function killFeed(k, v, w, zone) {
  const el = document.createElement('div'); el.className = 'kf' + (k === GAME.me ? ' me' : '');
  el.innerHTML = `<b>P${k + 1}</b> <span>[${(WEAPONS[w] || WEAPONS[0]).name}${zone === 'head' ? ' · HEADSHOT' : ''}]</span> <b>P${v + 1}</b>`;
  $('killfeed').appendChild(el); setTimeout(() => el.classList.add('fade'), 3500); setTimeout(() => el.remove(), 4300);
}
function updateHUDWeapon() { const w = W(); $('wname').textContent = w.name.toUpperCase(); $('mag').textContent = w.melee ? '—' : GUN.mag; $('res').textContent = w.melee ? '' : '/ ' + GUN.reserve; }
function updateHUDHealth() { $('hpfill').style.width = clamp(myHP, 0, 100) + '%'; $('hpnum').textContent = Math.max(0, myHP); $('lowhp').style.opacity = myHP <= 35 ? 1 : 0; }
function updateHUDLevels() { const n = WEAPONS.length; for (let i = 0; i < 2; i++) { const el = $('lv' + (i + 1)); el.textContent = `P${i + 1}  ${Math.min(GAME.levels[i] + 1, n)}/${n}`; el.classList.toggle('me', i === GAME.me); } }
const copy = async (text, btn) => { try { await navigator.clipboard.writeText(text); } catch (e) {} const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1200); };

function loadSettingsUI() { $('setServer').value = SETTINGS.server; $('setSens').value = SETTINGS.sens; $('setFov').value = SETTINGS.fov; $('setDmg').checked = SETTINGS.dmgNumbers; $('sensVal').textContent = SETTINGS.sens.toFixed(2); $('fovVal').textContent = SETTINGS.fov; $('serverHint').textContent = 'Currently using: ' + NET.serverURL(); }
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', async () => {
  AUDIO.resume(); AUDIO.click(); const go = b.dataset.go;
  if (go === 'host') {
    GAME.isHost = true; GAME.me = 0; GAME.solo = false; REMOTE.init(1); showScreen('host');
    $('roomCode').textContent = '····'; const st = $('hostStatus'); st.className = 'status'; st.textContent = 'Contacting server…';
    try { const code = await NET.host(); $('roomCode').textContent = code; st.className = 'status ok'; st.textContent = 'Room open. Tell Player 2 the code. The match starts the moment they join.'; }
    catch (e) { st.className = 'status bad'; st.textContent = 'Could not open a room: ' + (e && e.message || e); }
  } else if (go === 'join') {
    GAME.isHost = false; GAME.me = 1; GAME.solo = false; REMOTE.init(0); showScreen('join'); $('joinCode').value = ''; const st = $('joinStatus'); st.className = 'status'; st.textContent = ''; setTimeout(() => $('joinCode').focus(), 50);
  } else if (go === 'solo') {
    GAME.isHost = true; GAME.me = 0; GAME.solo = true; REMOTE.init(1); startMatch(); const s = SPAWNS[7]; REMOTE.teleport(s.x, s.y, s.z, s.yaw);
  } else if (go === 'settings') { loadSettingsUI(); showScreen('settings'); }
  else showScreen(go);
}));
NET.on('status', s => { const el = GAME.isHost ? $('hostStatus') : $('joinStatus'); if (el) el.textContent = s; });
$('joinGo').addEventListener('click', async () => {
  AUDIO.click(); const st = $('joinStatus'); st.className = 'status'; const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { st.className = 'status bad'; st.textContent = 'Room codes are 4 letters.'; return; }
  try { st.textContent = 'Contacting server…'; await NET.join(code); } catch (e) { st.className = 'status bad'; st.textContent = 'Could not join: ' + (e && e.message || e); }
});
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinGo').click(); });
$('copyCode').addEventListener('click', e => copy($('roomCode').textContent, e.target));
$('setSens').addEventListener('input', e => $('sensVal').textContent = (+e.target.value).toFixed(2));
$('setFov').addEventListener('input', e => $('fovVal').textContent = e.target.value);
$('saveSettings').addEventListener('click', () => { AUDIO.click(); SETTINGS.server = $('setServer').value.trim(); SETTINGS.sens = +$('setSens').value; SETTINGS.fov = +$('setFov').value; SETTINGS.dmgNumbers = $('setDmg').checked; SETTINGS.save(); $('serverHint').textContent = 'Saved. Using: ' + NET.serverURL(); });
$('lobbyBack').addEventListener('click', leaveToMenu); $('pauseMenu').addEventListener('click', leaveToMenu); $('overMenu').addEventListener('click', leaveToMenu);
$('resume').addEventListener('click', () => { AUDIO.click(); showScreen(null); requestLock(); });
$('rematch').addEventListener('click', () => { AUDIO.click(); if (GAME.solo) { startMatch(); const s = SPAWNS[7]; REMOTE.teleport(s.x, s.y, s.z, s.yaw); } else { NET.send({ t: 'start' }); startMatch(); } });

/* ---------- pointer lock + input ---------- */
let lockPending = false;
function requestLock() {
  if (INPUT.fallback || !canvas.requestPointerLock) { INPUT.fallback = true; $('hint').textContent = 'Hold right mouse to look'; $('hint').classList.remove('hidden'); return; }
  lockPending = true; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => onLockError()); } catch (e) { onLockError(); }
  setTimeout(() => { if (lockPending && !INPUT.locked) onLockError(); }, 1500);
}
function onLockError() { lockPending = false; INPUT.fallback = true; $('hint').textContent = 'Mouse lock unavailable — hold right mouse to look'; $('hint').classList.remove('hidden'); }
document.addEventListener('pointerlockchange', () => { INPUT.locked = document.pointerLockElement === canvas; lockPending = false; if (INPUT.locked) { $('hint').classList.add('hidden'); INPUT.fallback = false; } else if (['playing', 'countdown'].includes(GAME.phase) && !INPUT.fallback) showScreen('pause'); });
document.addEventListener('pointerlockerror', onLockError);
canvas.addEventListener('click', () => { if (['playing', 'countdown'].includes(GAME.phase) && !INPUT.locked && !INPUT.fallback) requestLock(); });
document.addEventListener('mousemove', e => { if (INPUT.locked || (INPUT.fallback && INPUT.rightHeld)) { INPUT.mdx += e.movementX; INPUT.mdy += e.movementY; } });
document.addEventListener('mousedown', e => {
  if (!['playing', 'countdown'].includes(GAME.phase) || !$('menu').classList.contains('hidden')) return;
  AUDIO.resume();
  if (e.button === 0 && (INPUT.locked || INPUT.fallback)) { INPUT.fireHeld = true; shoot(); }
  if (e.button === 2) { INPUT.rightHeld = true; if (INPUT.locked) AUDIO.ads(); }
});
document.addEventListener('mouseup', e => { if (e.button === 0) { INPUT.fireHeld = false; GUN.wantFire = false; } if (e.button === 2) INPUT.rightHeld = false; });
document.addEventListener('contextmenu', e => { if ($('menu').classList.contains('hidden')) e.preventDefault(); });
document.addEventListener('keydown', e => {
  if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) return;
  INPUT.keys.add(e.code);
  if (['Space', 'ShiftLeft', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') reload();
  if (e.code === 'Escape' && INPUT.fallback && ['playing', 'countdown'].includes(GAME.phase)) showScreen($('menu').classList.contains('hidden') ? 'pause' : null);
});
document.addEventListener('keyup', e => INPUT.keys.delete(e.code));
addEventListener('blur', () => INPUT.keys.clear());
