/* Rusted Arena relay server.
   - Serves the game (../client) over HTTP so both players just open the URL.
   - Hosts a WebSocket relay: 4-letter room codes, exactly two players per room,
     every game message is forwarded verbatim to the other player. No database, no accounts.
   Run:  npm install && npm start      (PORT env var respected; defaults to 8080)            */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const CLIENT = path.resolve(__dirname, '..', 'client');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  const f = path.normalize(path.join(CLIENT, p));
  if (!f.startsWith(CLIENT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host, guest, created }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0
function newCode() { let c; do { c = ''; for (let i = 0; i < 4; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; } while (rooms.has(c)); return c; }
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function leave(ws) {
  const r = rooms.get(ws.room); if (!r) return;
  const other = ws === r.host ? r.guest : r.host;
  rooms.delete(ws.room); ws.room = null; if (other) { other.room = null; send(other, { t: 'peer_left' }); }
}
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'create') { leave(ws); const code = newCode(); rooms.set(code, { host: ws, guest: null, created: Date.now() }); ws.room = code; send(ws, { t: 'room', code }); console.log('room', code, 'opened'); }
    else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase(), r = rooms.get(code);
      if (!r) return send(ws, { t: 'err', msg: 'No open room with code ' + code });
      if (r.guest) return send(ws, { t: 'err', msg: 'Room ' + code + ' already has two players' });
      leave(ws); r.guest = ws; ws.room = code; send(r.host, { t: 'peer' }); send(ws, { t: 'peer' }); console.log('room', code, 'full');
    } else { const r = rooms.get(ws.room); if (!r) return; const other = ws === r.host ? r.guest : r.host; if (other && other.readyState === 1) other.send(data.toString()); }
  });
  ws.on('close', () => leave(ws));
});
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  for (const [c, r] of rooms) if (!r.guest && Date.now() - r.created > 30 * 60e3) { rooms.delete(c); if (r.host) r.host.room = null; }
}, 30000);
server.listen(PORT, () => console.log('Rusted Arena server listening on port ' + PORT));
