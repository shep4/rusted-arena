'use strict';
/* ============================== MAP ===================================== */
// Procedural canvas textures: sand, rust, corrugated steel, concrete, painted container steel.
function makeTex(w, h, fn, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; return t;
}
function grain(g, w, h, base, amt, n) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = (Math.random() - 0.5) * amt; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
}
function streaks(g, w, h, n) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${40 + Math.random() * 25},15,${0.25 + Math.random() * 0.35})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 10 + Math.random() * 70); } }
const TEX = {
  sand: makeTex(256, 256, (g, w, h) => { grain(g, w, h, '#c2a46f', 0.35, 4500); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(120,90,50,0.12)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 3 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); } }, 10),
  rust: makeTex(256, 256, (g, w, h) => { grain(g, w, h, '#6e4026', 0.5, 5000); for (let i = 0; i < 45; i++) { g.fillStyle = `rgba(${30 + Math.random() * 60},${15 + Math.random() * 20},8,${0.3 + Math.random() * 0.4})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 3 + Math.random() * 10, Math.random() * 3, 0, 7); g.fill(); } }, 2),
  corr: makeTex(256, 256, (g, w, h) => { grain(g, w, h, '#7d766a', 0.3, 2000); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, 0, 6, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 8, 0, 3, h); } streaks(g, w, h, 30); }, 1),
  concrete: makeTex(256, 256, (g, w, h) => grain(g, w, h, '#8f887a', 0.35, 5000), 2),
  dark: makeTex(128, 128, (g, w, h) => grain(g, w, h, '#3b3833', 0.3, 1500), 1),
  container: col => makeTex(256, 256, (g, w, h) => { grain(g, w, h, col, 0.3, 3000); for (let x = 0; x < w; x += 24) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 5, h); } streaks(g, w, h, 25); }, 1),
};
const MAT = {
  sand: new THREE.MeshLambertMaterial({ map: TEX.sand }),
  rust: new THREE.MeshLambertMaterial({ map: TEX.rust }),
  corr: new THREE.MeshLambertMaterial({ map: TEX.corr }),
  concrete: new THREE.MeshLambertMaterial({ map: TEX.concrete }),
  dark: new THREE.MeshLambertMaterial({ map: TEX.dark }),
  pipe: new THREE.MeshLambertMaterial({ color: 0x6b5843 }),
  rail: new THREE.MeshLambertMaterial({ color: 0x2b2622 }),
  barrel: new THREE.MeshLambertMaterial({ color: 0x7a3b2a }),
  cont: ['#8a3b2a', '#3f5a45', '#5a5f6b', '#a5702c'].map(c => new THREE.MeshLambertMaterial({ map: TEX.container(c) })),
};

const SOLIDS = [], LADDERS = [], SPAWNS = [];
function solid(x, y, z, w, h, d) { SOLIDS.push({ min: { x: x - w / 2, y, z: z - d / 2 }, max: { x: x + w / 2, y: y + h, z: z + d / 2 } }); }
// block(): y is the BASE of the box. Adds a mesh and (by default) a collision solid.
function block(x, y, z, w, h, d, mat, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (collide) solid(x, y, z, w, h, d);
  return m;
}
function container(x, z, rotated, stack, matIdx) { const w = rotated ? 2.4 : 6, d = rotated ? 6 : 2.4; block(x, stack * 2.6, z, w, 2.6, d, MAT.cont[matIdx]); }
function stairs(x0, z, dir, n, rise, depth, width) { for (let i = 0; i < n; i++) block(x0 + dir * (i * depth + depth / 2), 0, z, depth, (i + 1) * rise, width, MAT.concrete); }
// ladder(): climb zone centered at (cx,cz), rails spread along `along` ('x' or 'z'), from y0 to y1 (top surface).
function ladder(cx, cz, y0, y1, along) {
  const h = y1 - y0 + 0.2;
  const w = along === 'x' ? 0.9 : 0.12, d = along === 'x' ? 0.12 : 0.9;
  for (const s of [-0.4, 0.4]) block(along === 'x' ? cx + s : cx, y0, along === 'x' ? cz : cz + s, along === 'x' ? 0.08 : 0.08, h, 0.08, MAT.rail, false);
  for (let y = y0 + 0.35; y < y1 + 0.1; y += 0.4) block(cx, y, cz, along === 'x' ? 0.9 : 0.08, 0.06, along === 'x' ? 0.08 : 0.9, MAT.rail, false);
  LADDERS.push({ min: { x: cx - (along === 'x' ? 0.55 : 0.5), y: y0, z: cz - (along === 'x' ? 0.5 : 0.55) }, max: { x: cx + (along === 'x' ? 0.55 : 0.5), y: y1 + 1.0, z: cz + (along === 'x' ? 0.5 : 0.55) } });
  void w; void d;
}
function pipe(x, y, z, len, axis, r = 0.32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), MAT.pipe);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  solid(x, y - r, z, axis === 'x' ? len : r * 2, r * 2, axis === 'x' ? r * 2 : len);
}
function barrel(x, z, y = 0) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), MAT.barrel); m.position.set(x, y + 0.55, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); solid(x, y, z, 0.84, 1.1, 0.84); }
function tower(x, z, ladderSide) {
  block(x, 6, z, 4.2, 0.3, 4.2, MAT.rust);
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) block(x + dx, 0, z + dz, 0.4, 6, 0.4, MAT.dark);
  // half-height cover on the two inward faces
  block(x, 6.3, z - ladderSide * 2.0, 4.2, 1.0, 0.2, MAT.corr);
  block(x - Math.sign(x) * 2.0, 6.3, z, 0.2, 1.0, 4.2, MAT.corr);
  ladder(x, z + ladderSide * 2.45, 0, 6.3, 'x');
}
function sp(x, y, z) { return { x, y, z, yaw: Math.atan2(x, z) }; } // yaw faces arena center

function buildMap() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), MAT.sand); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const W = 29, H = 7;
  block(0, 0, -W, 2 * W + 1, H, 1, MAT.corr); block(0, 0, W, 2 * W + 1, H, 1, MAT.corr);
  block(-W, 0, 0, 1, H, 2 * W + 1, MAT.corr); block(W, 0, 0, 1, H, 2 * W + 1, MAT.corr);

  // ---- central industrial structure: deck 1 (top 3.7) and deck 2 (top 7.5)
  block(0, 3.2, 0, 18, 0.5, 12, MAT.rust);
  for (const [x, z] of [[-8.5, -5.5], [8.5, -5.5], [-8.5, 5.5], [8.5, 5.5], [0, -5.5], [0, 5.5]]) block(x, 0, z, 0.7, 3.2, 0.7, MAT.dark);
  block(0, 7, 0, 8, 0.5, 8, MAT.rust);
  for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) block(x, 3.7, z, 0.5, 3.3, 0.5, MAT.dark);
  block(-2.5, 7.5, -3.9, 3, 1, 0.2, MAT.corr); block(2.5, 7.5, 3.9, 3, 1, 0.2, MAT.corr); // deck 2 half walls
  block(-6.5, 3.7, 0.5, 1.6, 1.6, 1.6, MAT.concrete); block(6.5, 3.7, -2, 1.6, 1.6, 1.6, MAT.concrete); // deck 1 crates
  block(0, 3.7, -5.9, 6, 0.9, 0.15, MAT.corr); block(0, 3.7, 5.9, 6, 0.9, 0.15, MAT.corr); // deck 1 edge cover
  stairs(14.6, 0, -1, 8, 0.4, 0.7, 3); stairs(-14.6, 0, 1, 8, 0.4, 0.7, 3); // east/west stairs to deck 1
  ladder(0, -4.35, 3.7, 7.5, 'x'); ladder(0, 4.35, 3.7, 7.5, 'x'); // deck 1 -> deck 2

  // ---- containers (some stacked to make mid-level perches)
  container(-16, -17, true, 0, 0); container(-16, -17, true, 1, 1); ladder(-14.45, -17, 0, 5.2, 'z');
  container(17, 16, false, 0, 2); container(17, 16, false, 1, 3); ladder(17, 14.45, 0, 5.2, 'x');
  container(-18, 12, false, 0, 3); container(19, -12, true, 0, 1);
  container(-6, -20, false, 0, 0); container(6, 20, false, 0, 2);
  container(10, -9, true, 0, 3); container(-10, 9, true, 0, 0);

  // ---- north/south catwalks (top 4.8) with ladders at both ends
  for (const zc of [-24.5, 24.5]) {
    block(0, 4.5, zc, 26, 0.3, 1.6, MAT.rust);
    block(0, 4.8, zc + Math.sign(zc) * -0.75, 26, 0.9, 0.08, MAT.rail, false); // inner railing, decorative
    for (const x of [-12, 0, 12]) block(x, 0, zc, 0.4, 4.5, 0.4, MAT.dark);
    ladder(-13.35, zc, 0, 4.8, 'z'); ladder(13.35, zc, 0, 4.8, 'z');
  }
  // ---- sniper towers in two corners (top 6.3)
  tower(-23, -23, 1); tower(23, 23, -1);

  // ---- corrugated cover panels, pipes, barrels
  block(-4, 0, -12, 6, 3, 0.25, MAT.corr); block(4, 0, 12, 6, 3, 0.25, MAT.corr);
  block(-14, 0, -4.5, 0.25, 3, 5, MAT.corr); block(14, 0, 4.5, 0.25, 3, 5, MAT.corr);
  block(-23, 0, 4, 4, 2.5, 0.25, MAT.corr); block(23, 0, -4, 4, 2.5, 0.25, MAT.corr);
  pipe(0, 1.0, -28.1, 56, 'x'); pipe(0, 2.1, 28.1, 56, 'x'); pipe(-28.1, 1.5, 0, 56, 'z'); pipe(28.1, 2.6, 0, 56, 'z');
  pipe(-21, 0.32, -2, 8, 'x'); pipe(-21, 0.96, -2, 8, 'x'); pipe(21, 0.32, 2, 8, 'x'); pipe(21, 0.96, 2, 8, 'x');
  barrel(-11.5, -14); barrel(-12.4, -13.2); barrel(12, 14); barrel(13, 13.3); barrel(3, -25.5); barrel(-3, 25.5);

  // ---- spawn points: corners at ground, both towers, both catwalks, two mid perches
  SPAWNS.push(sp(-25, 0, 25), sp(25, 0, -25), sp(-25, 0, -12), sp(25, 0, 12),
              sp(-23, 6.3, -23), sp(23, 6.3, 23), sp(0, 4.8, -24.5), sp(0, 4.8, 24.5),
              sp(-16, 5.2, -17), sp(17, 5.2, 16));
}
buildMap();

/* ---------- geometry helpers: AABB overlap, ray tests, LOS ---------- */
function overlap(a, b) { return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z; }
function playerBox(pos, h) { const r = CFG.radius; return { min: { x: pos.x - r, y: pos.y, z: pos.z - r }, max: { x: pos.x + r, y: pos.y + h, z: pos.z + r } }; }
function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < b.min[a] || o[a] > b.max[a]) return -1; continue; }
    const inv = 1 / d[a]; let t1 = (b.min[a] - o[a]) * inv, t2 = (b.max[a] - o[a]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmax < tmin) return -1;
  }
  return tmin;
}
function raySphere(o, d, s) {
  const ox = o.x - s.x, oy = o.y - s.y, oz = o.z - s.z; const b = ox * d.x + oy * d.y + oz * d.z; const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const disc = b * b - c; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t >= 0 ? t : -1;
}
function worldRay(o, d, maxD) {
  let best = maxD;
  if (d.y < 0) { const t = -o.y / d.y; if (t < best) best = t; }
  for (const S of SOLIDS) { const t = rayBox(o, d, S); if (t >= 0 && t < best) best = t; }
  return best;
}
function hasLOS(a, b) { const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const L = Math.hypot(d.x, d.y, d.z); d.x /= L; d.y /= L; d.z /= L; return worldRay(a, d, L) >= L - 0.01; }

