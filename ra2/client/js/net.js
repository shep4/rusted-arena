'use strict';
/* ============================== NET =====================================
   Client-server relay. Both browsers open an outbound WebSocket to server/server.js, so no NAT
   traversal is ever needed. Protocol (JSON):
     client -> server : {t:'create'} | {t:'join', code}
     server -> client : {t:'room', code} | {t:'peer'} (both players present) | {t:'peer_left'} | {t:'err', msg}
     anything else is forwarded verbatim to the other player in the room.
   The game keeps the HOST (room creator, Player 1) authoritative for HP/kills/levels/spawns. */
const NET = (() => {
  let ws = null, open = false, inRoom = false, pendingRoom = null, pendingErr = null;
  const handlers = { msg: [], connected: [], disconnected: [], status: [] };
  const on = (ev, fn) => handlers[ev].push(fn), emit = (ev, a) => handlers[ev].forEach(f => f(a));
  function serverURL() {
    let u = (SETTINGS.server || '').trim();
    if (!u) u = location.protocol.startsWith('http') ? location.origin : 'ws://localhost:8080';
    u = u.replace(/\/+$/, '').replace(/^http/, 'ws'); if (!/^wss?:\/\//.test(u)) u = 'wss://' + u; return u;
  }
  function connect() {
    return new Promise((res, rej) => {
      closeSock(); const url = serverURL(); emit('status', 'Connecting to ' + url + '…');
      let w; try { w = new WebSocket(url); } catch (e) { return rej(new Error('Bad server address: ' + url)); }
      const t = setTimeout(() => { try { w.close(); } catch (e) {} rej(new Error('No answer from ' + url + ' within 20 s. A free Render server takes up to 60 s to wake: wait, then try again. Also check the address in Settings.')); }, 20000);
      w.onopen = () => { clearTimeout(t); ws = w; open = true; res(); };
      w.onerror = () => {};
      w.onclose = () => { if (ws === w) { ws = null; const was = inRoom; open = false; inRoom = false; if (was) emit('disconnected'); } };
      w.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'room') { pendingRoom && pendingRoom(m.code); pendingRoom = null; }
        else if (m.t === 'peer') { inRoom = true; emit('connected'); }
        else if (m.t === 'peer_left') { inRoom = false; emit('disconnected'); }
        else if (m.t === 'err') { const f = pendingErr; pendingErr = null; f ? f(new Error(m.msg)) : emit('status', m.msg); }
        else emit('msg', m);
      };
    });
  }
  function closeSock() { if (ws) { const w = ws; ws = null; inRoom = false; open = false; try { w.close(); } catch (e) {} } }
  return {
    on, serverURL, get connected() { return inRoom; },
    async host() { await connect(); return new Promise((res, rej) => { pendingRoom = res; pendingErr = rej; ws.send(JSON.stringify({ t: 'create' })); }); },
    async join(code) {
      await connect();
      return new Promise((res, rej) => { pendingErr = rej; const once = () => { handlers.connected.splice(handlers.connected.indexOf(once), 1); res(); }; handlers.connected.push(once); ws.send(JSON.stringify({ t: 'join', code: code.trim().toUpperCase() })); });
    },
    send(obj) { if (ws && open) ws.send(JSON.stringify(obj)); },
    close() { closeSock(); },
  };
})();
