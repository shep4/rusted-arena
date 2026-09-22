'use strict';
/* ============================== CONFIG ================================== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
const now = () => performance.now() / 1000;
const CFG = {
  walk: 5.6, sprint: 8.6, crouch: 2.8, jump: 7.6, gravity: 23, ladderSpeed: 3.6,
  radius: 0.35, height: 1.8, crouchHeight: 1.2, eye: 1.62, crouchEye: 1.0, stepUp: 0.62,
  maxHP: 100, respawnDelay: 2.2, netRate: 20, fov: 82, sens: 0.0021,
};
// Persistent user settings (localStorage). Server address lives here too.
const SETTINGS = {
  sens: 1, fov: 82, dmgNumbers: true, server: '',
  load() { try { Object.assign(this, JSON.parse(localStorage.getItem('ra_settings') || '{}')); } catch (e) {} CFG.fov = this.fov; },
  save() { try { localStorage.setItem('ra_settings', JSON.stringify({ sens: this.sens, fov: this.fov, dmgNumbers: this.dmgNumbers, server: this.server })); } catch (e) {} CFG.fov = this.fov; },
};
SETTINGS.load();
