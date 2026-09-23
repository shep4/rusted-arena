# Rusted Arena v2.2 — 1v1 Gun Game (browser FPS)

Two players, one relay server, no accounts. Original assets and names; nothing from Call of Duty.

## Folder layout
```
server/server.js   HTTP static host for /client + WebSocket relay (rooms with 4-letter codes)
client/index.html  the game (open via the server URL, or directly as a file with a server address set in Settings)
client/js/         config, audio, weapons (EDIT THE STATS TABLE HERE), render, map, player, fx, remote, net, game, ui, main
client/lib/        three.js r128, GLTFLoader, SkeletonUtils (vendored, works offline)
client/assets/     soldier.glb — rigged/animated human (Mixamo "Soldier" as shipped in the three.js examples)
Dockerfile, render.yaml, package.json
```

## Deploy for free on Render (recommended)
1. Put this folder in a GitHub repo (github.com → New repository → upload files, or `git init && git add . && git commit -m v2 && git push`).
2. Go to https://render.com, sign up (no card), **New → Web Service**, connect the repo.
3. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**. (render.yaml already says all this if you use "Blueprint".)
4. Deploy. You get an address like `https://rusted-arena.onrender.com`.
5. Both players open that address. Host clicks **Host game** → gets a 4-letter code. Player 2 clicks **Join game**, types it. Match starts automatically.

Free tier facts: the service sleeps after 15 min idle; the first person to open it waits 30–60 s for it to wake. It stays awake while a match is running.

## Run it on your own machine + Cloudflare Tunnel (also free, laptop must stay on)
```
npm install
npm start                      # http://localhost:8080 — open it, play solo, or host on LAN
```
To let your colleague reach it from the internet:
```
# install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:8080
```
It prints a `https://something.trycloudflare.com` address. Send that to your colleague; you both open it. (Quick tunnels change every run.)

## Docker
```
docker build -t rusted-arena . && docker run -p 8080:8080 rusted-arena
```

## Opening the client as a plain file
Double-click `client/index.html` works for solo practice. For multiplayer from a file, open **Settings & server** and enter your server address (e.g. `wss://rusted-arena.onrender.com`). Opening via the server URL is simpler.

## What changed in v2.2
Arena rebuilt for 1v1 flow: three-level center tower (four ways onto level 1: two ramps, a ladder, a crate chain; steep stairs + ladder to level 2; ladder to the crow's nest), long open west lane with hard cover every 6 m, east container yard with two climbable stacks, a perimeter catwalk loop with two jump gaps and stairs onto the corner towers, and a crouch-only beam under the center deck. Fixed the freeze on reaching the knife (weapon switch crashed on the knife model). The render loop now survives errors and shows them in a red corner banner instead of freezing.

## What changed in v2.1 (gameplay overhaul)
Movement: swept collision (no tunneling at low FPS), mantle onto ledges up to 0.95 m at the jump apex, coyote time + jump buffer, landing camera dip scaled by fall height, sprint FOV, head bob, surface footsteps.
Ladders: explicit state machine (walk into the rails to attach, back onto them from the top with S, W/S climb, A/D slide off, Space jumps off, clean top exit).
Weapons: state machine (ready / empty / reload / bolt / switch / sprint), phased reloads with magazine animation, tactical vs empty reload, shotgun shell-by-shell (interrupt by firing), bolt cycle on the precision rifle, lower→raise weapon switching, sprint-to-fire delay, recoil patterns with first-shot multiplier and mouse compensation, weapon inertia/sway/kick, ADS per weapon, scope reticles with sway, hit flinch and kill confirmation, surface impact FX (sparks / dust / splinters), layered gun audio with distance.
Map: crouch-height cover on every lane, two wooden crate chains up to the single containers (west and east), deck-1 cover. Spawns reject point-blank and exposed points.
Tuning: everything lives in client/js/weapons.js (per-weapon table) and client/js/config.js (movement).

## Controls
WASD move · mouse look (click to lock) · LMB fire · RMB aim down sights · R reload · Space jump · Shift sprint (short delay before firing) · Ctrl/C crouch (tighter spread) · W/S climb ladders · Esc menu

## Gun game
Sidearm → Pump Shotgun → Compact SMG → Assault Rifle → Tactical Rifle → Precision Rifle → Marksman Rifle → Combat Knife. Each kill advances the killer only; first knife kill wins. Hit zones: head × weapon headshot multiplier, torso ×1.0, arms ×0.8, legs ×0.75. All numbers live in `client/js/weapons.js`.

## Networking
Both browsers open an outbound WebSocket to the server; the server forwards messages between the two players in a room. Because every connection is outbound, home/office routers never block it. The host's browser is authoritative for health, kills, weapon levels, spawn choice and the win; each player moves locally and streams 20 snapshots/s; shots are raycast by the shooter and sent as clamped hit claims.

## Troubleshooting
- "No answer from server within 20 s": a free Render service is waking up. Wait a minute and retry. Check the address in Settings has no typo (wss:// for https sites).
- "No open room with code": codes expire when the host leaves; codes never contain I or O.
- Mouse won't lock: click the game canvas; if it still fails, hold right mouse to look.
- Opponent frozen/teleporting: connection dropped — the game returns to the menu with CONNECTION LOST. Re-host.
- Low FPS: lower Field of view in Settings, close other tabs; shadows are the main cost (edit render.js: `renderer.shadowMap.enabled = false`).
