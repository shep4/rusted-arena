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
const MAT_TAG = new Map(); // three material -> surface tag for impact FX
[[MAT.sand, 'sand'], [MAT.rust, 'metal'], [MAT.corr, 'metal'], [MAT.concrete, 'concrete'], [MAT.dark, 'metal'], [MAT.pipe, 'metal'], [MAT.rail, 'metal'], [MAT.barrel, 'metal']].forEach(([m, t]) => MAT_TAG.set(m, t));
MAT.cont.forEach(m => MAT_TAG.set(m, 'metal'));
MAT.wood = new THREE.MeshLambertMaterial({ color: 0x7a5a36 }); MAT_TAG.set(MAT.wood, 'wood');
function solid(x, y, z, w, h, d, mat = 'metal') { SOLIDS.push({ min: { x: x - w / 2, y, z: z - d / 2 }, max: { x: x + w / 2, y: y + h, z: z + d / 2 }, mat }); }
// block(): y is the BASE of the box. Adds a mesh and (by default) a collision solid.
function block(x, y, z, w, h, d, mat, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (collide) solid(x, y, z, w, h, d, MAT_TAG.get(mat) || 'metal');
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
  // zone: rails are 0.8 apart along `along`; the player stands 0.35 m off the wall on the perpendicular axis
  LADDERS.push({ cx, cz, along, y0, y1, nx: 0, nz: 0,
    min: { x: cx - (along === 'x' ? 0.55 : 0.5), y: y0, z: cz - (along === 'x' ? 0.5 : 0.55) },
    max: { x: cx + (along === 'x' ? 0.55 : 0.5), y: y1 + 1.0, z: cz + (along === 'x' ? 0.5 : 0.55) } });
  void w; void d;
}
function pipe(x, y, z, len, axis, r = 0.32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), MAT.pipe);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  solid(x, y - r, z, axis === 'x' ? len : r * 2, r * 2, axis === 'x' ? r * 2 : len);
}
function barrel(x, z, y = 0) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), MAT.barrel); m.position.set(x, y + 0.55, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); solid(x, y, z, 0.84, 1.1, 0.84); }
function tower(x, z) { // corner sniper tower, top 6.3; reached from the catwalk stairs and a ground ladder on the inward corner
  block(x, 6, z, 4.2, 0.3, 4.2, MAT.rust);
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) block(x + dx, 0, z + dz, 0.4, 6, 0.4, MAT.dark);
  const sx = -Math.sign(x), sz = -Math.sign(z); // inward directions
  block(x + sx * 2.0, 6.3, z + sz * 0.5, 0.2, 1.0, 1.6, MAT.corr); block(x + sx * 0.5, 6.3, z + sz * 2.0, 1.6, 1.0, 0.2, MAT.corr); // inward half walls, kept clear of the ladder exit
  ladder(x + sx * 2.45, z - sz * 0.8, 0, 6.3, 'z');
}
function sp(x, y, z) { return { x, y, z, yaw: Math.atan2(x, z) }; } // yaw faces arena center

/* ARENA v3 — Rust-style layout for 1v1:
   center: three-level tower (L1 top 3.6, L2 top 7.2, L3 nest top 10.2) with FOUR ways onto L1 (north/south ramps, east ladder, west crate chain),
   west: long open lane for rifles with hard cover every ~6 m,  east: container yard for shotgun/SMG with two climbable stacks,
   perimeter catwalk loop at 4.8 with two jump gaps and stairs onto the corner towers,  pit: ground under L1 with a crouch-only beam.
   Every platform reachable at least two ways; spawns never see the center directly.                                                     */
function buildMap() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), MAT.sand); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const W = 29, H = 7;
  block(0, 0, -W, 2 * W + 1, H, 1, MAT.corr); block(0, 0, W, 2 * W + 1, H, 1, MAT.corr);
  block(-W, 0, 0, 1, H, 2 * W + 1, MAT.corr); block(W, 0, 0, 1, H, 2 * W + 1, MAT.corr);
  pipe(0, 1.0, -28.1, 56, 'x'); pipe(0, 2.1, 28.1, 56, 'x'); pipe(-28.1, 1.5, 0, 56, 'z'); pipe(28.1, 2.6, 0, 56, 'z');

  // ---- CENTER TOWER
  block(0, 3.2, 0, 14, 0.4, 14, MAT.rust);                                                      // L1 deck (top 3.6)
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5], [0, -6.5], [0, 6.5], [-6.5, 0], [6.5, 0]]) block(x, 0, z, 0.6, 3.2, 0.6, MAT.dark);
  block(0, 1.35, 0, 13, 0.4, 1.0, MAT.dark);                                                     // pit crouch beam (bottom 1.35): crouch to cross north-south under L1
  barrel(-4, -3.5); barrel(4.5, 3.2); barrel(3.8, 4.1);                                          // pit clutter
  block(0, 6.8, 0, 8, 0.4, 8, MAT.rust);                                                        // L2 deck (top 7.2)
  for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) block(x, 3.6, z, 0.5, 3.2, 0.5, MAT.dark);
  block(0, 9.8, 0, 4, 0.4, 4, MAT.rust);                                                        // L3 crow's nest (top 10.2)
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) block(x, 7.2, z, 0.4, 2.6, 0.4, MAT.dark);
  block(-2, 10.2, 0, 0.15, 0.9, 4, MAT.corr); block(2, 10.2, 0, 0.15, 0.9, 4, MAT.corr);           // nest half walls east/west
  for (const sgn of [-1, 1]) { block(-4.5, 3.6, sgn * 6.9, 5, 0.9, 0.15, MAT.corr); block(4.5, 3.6, sgn * 6.9, 5, 0.9, 0.15, MAT.corr); } // L1 north/south edge cover, center gap for the ramps
  block(-5.5, 3.6, 4.5, 1.2, 0.9, 1.2, MAT.wood); block(5.5, 3.6, -4.8, 1.2, 0.9, 1.2, MAT.wood); // L1 crates
  block(0, 7.2, -3.9, 4, 0.9, 0.15, MAT.corr); block(0, 7.2, 3.9, 4, 0.9, 0.15, MAT.corr);       // L2 cover
  // ways up: north & south ramps (9 steps x 0.4), east ladder, west crate chain (0.9 -> 1.8 -> 2.7 -> L1)
  for (const sgn of [-1, 1]) for (let i = 0; i < 9; i++) block(0, 0, sgn * (14.5 - 0.4 - i * 0.8), 3, (i + 1) * 0.4, 0.8, MAT.concrete);
  ladder(7.35, 3.0, 0, 3.6, 'z');
  block(-10.2, 0, -2, 1.6, 0.9, 1.6, MAT.wood); block(-8.7, 0, -2, 1.4, 1.8, 1.6, MAT.wood); block(-7.5, 0, -2, 1.0, 2.7, 1.6, MAT.wood);
  // L1 -> L2: west stairs (8 x 0.45, steep) and a north ladder;  L2 -> L3: south ladder
  for (let i = 0; i < 8; i++) block(-7.2 + 0.2 + i * 0.4, 3.6, 2.5, 0.4, (i + 1) * 0.45, 2.4, MAT.concrete);
  ladder(0, -4.35, 3.6, 7.2, 'x');
  ladder(0, 2.35, 7.2, 10.2, 'x');

  // ---- WEST LANE: long and open, hard cover every ~6 m, alternating sides
  for (const [x, z] of [[-16, -18], [-13, -6], [-17, 6], [-14, 18]]) block(x, 0, z, 3.2, 0.9, 0.5, MAT.concrete);
  barrel(-21, -12); barrel(-21.9, -11.3); barrel(-20.5, 14);
  pipe(-20, 0.32, 0, 6, 'x'); pipe(-20, 0.96, 0, 6, 'x');

  // ---- EAST YARD: containers, two climbable stacks (top 5.2), one single container reachable by crate chain
  container(16, -16, true, 0, 0); container(16, -16, true, 1, 1); ladder(14.45, -16, 0, 5.2, 'z');
  container(18, 12, false, 0, 2); container(18, 12, false, 1, 3); ladder(18, 13.55, 0, 5.2, 'x');
  container(19, -6, false, 0, 3); block(13.7, 0, -6, 1.6, 0.9, 1.6, MAT.wood); block(15.3, 0, -6, 1.4, 1.8, 1.6, MAT.wood); // chain onto the 2.6 top from the west
  container(15, 3, true, 0, 1); container(13, 20, false, 0, 0);
  barrel(22, 0); barrel(22.9, 0.7); barrel(11, -22);

  // ---- NORTH / SOUTH STRIPS: panels break the cross-lane sightline, leaving the ramp corridor and the lane ends open
  for (const sgn of [-1, 1]) { block(-8, 0, sgn * 14, 5, 3, 0.25, MAT.corr); block(8, 0, sgn * 14, 5, 3, 0.25, MAT.corr); block(sgn * -19, 0, sgn * 21, 0.25, 3, 4, MAT.corr); }

  // ---- PERIMETER CATWALK (top 4.8): loop with jump gaps on east (z -4.1..-1.9) and west (z 1.9..4.1), stairs onto the corner towers
  const C = 25.5, cw = 1.8;
  block(2.75, 4.5, -C, 47.3, 0.3, cw, MAT.rust);                 // north: x -20.9 .. 26.4
  block(-2.75, 4.5, C, 47.3, 0.3, cw, MAT.rust);                 // south: x -26.4 .. 20.9
  block(C, 4.5, -15.25, cw, 0.3, 22.3, MAT.rust); block(C, 4.5, 9.5, cw, 0.3, 22.8, MAT.rust);   // east: z -26.4..-4.1 and -1.9..20.9
  block(-C, 4.5, -9.5, cw, 0.3, 22.8, MAT.rust); block(-C, 4.5, 15.25, cw, 0.3, 22.3, MAT.rust); // west: z -20.9..1.9 and 4.1..26.4
  for (const x of [-15, -5, 5, 15]) { block(x, 0, -C, 0.4, 4.5, 0.4, MAT.dark); block(x, 0, C, 0.4, 4.5, 0.4, MAT.dark); }
  for (const z of [-15, 12]) { block(C, 0, z, 0.4, 4.5, 0.4, MAT.dark); block(-C, 0, -z, 0.4, 4.5, 0.4, MAT.dark); }
  for (const zc of [-C, C]) block(0, 4.8, zc - Math.sign(zc) * 0.85, 47, 0.9, 0.06, MAT.rail, false); // inner railings (decorative, not solid)
  for (const xc of [-C, C]) block(xc - Math.sign(xc) * 0.85, 4.8, 0, 0.06, 0.9, 47, MAT.rail, false);
  ladder(0, -24.25, 0, 4.8, 'x'); ladder(0, 24.25, 0, 4.8, 'x'); ladder(-24.25, 12, 0, 4.8, 'z'); ladder(24.25, -12, 0, 4.8, 'z');
  tower(-23, -23); tower(23, 23);
  for (let i = 0; i < 3; i++) { block(-18.9 - i * 0.6, 4.8, -C, 0.6, (i + 1) * 0.5, cw, MAT.concrete); block(18.9 + i * 0.6, 4.8, C, 0.6, (i + 1) * 0.5, cw, MAT.concrete); } // catwalk -> tower stairs

  // ---- SPAWNS: corners behind cover, tower tops, catwalk mids, stack tops, lane mids. None sees the center deck directly.
  SPAWNS.push(sp(-23, 0, 22), sp(23, 0, -22), sp(-21, 0, -10), sp(21, 0, 10),
              sp(-23, 6.3, -23), sp(23, 6.3, 23), sp(-8, 4.8, -25.5), sp(8, 4.8, 25.5),
              sp(16, 5.2, -16), sp(18, 5.2, 12));
}
buildMap();
// Each ladder's wall normal (pointing from the wall toward the climber): probe just under the top surface on both perpendicular sides.
for (const L of LADDERS) {
  const px = L.along === 'x' ? 0 : 1, pz = L.along === 'x' ? 1 : 0; // perpendicular axis
  const inside = (x, z) => SOLIDS.some(S => x > S.min.x && x < S.max.x && z > S.min.z && z < S.max.z && L.y1 - 0.2 > S.min.y && L.y1 - 0.2 < S.max.y);
  const plus = inside(L.cx + px * 0.6, L.cz + pz * 0.6), minus = inside(L.cx - px * 0.6, L.cz - pz * 0.6);
  let sign = plus && !minus ? -1 : minus && !plus ? 1 : (L.cx * px + L.cz * pz) > 0 ? 1 : -1; // fallback: wall is toward the arena center
  L.nx = px * sign; L.nz = pz * sign; // normal points away from the platform, toward where the player stands
}

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
function worldRayHit(o, d, maxD) { // like worldRay but reports what was hit and the face normal
  let best = maxD, S = null, n = null;
  if (d.y < 0) { const t = -o.y / d.y; if (t < best) { best = t; S = { mat: 'sand' }; n = [0, 1, 0]; } }
  for (const B of SOLIDS) { const t = rayBox(o, d, B); if (t >= 0 && t < best) { best = t; S = B; } }
  if (S && S.min) { const px = o.x + d.x * best, py = o.y + d.y * best, pz = o.z + d.z * best; const e = 0.003;
    n = Math.abs(px - S.min.x) < e ? [-1, 0, 0] : Math.abs(px - S.max.x) < e ? [1, 0, 0] : Math.abs(py - S.min.y) < e ? [0, -1, 0] : Math.abs(py - S.max.y) < e ? [0, 1, 0] : Math.abs(pz - S.min.z) < e ? [0, 0, -1] : [0, 0, 1]; }
  return { t: best, solid: S, normal: n, mat: S ? S.mat : null };
}
function hasLOS(a, b) { const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const L = Math.hypot(d.x, d.y, d.z); d.x /= L; d.y /= L; d.z /= L; return worldRay(a, d, L) >= L - 0.01; }

