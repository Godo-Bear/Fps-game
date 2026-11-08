// StudySmartly multiplayer (https://studysmartly.jn-studios.workers.dev/mp.js, loaded in index.html).
// StudySmartly shows the room bar (create room / join code / invite link) above the game. Inside one of its rooms
// the game plays online exactly as it does on our own servers: the StudySmartly host's game runs the room itself
// (the same code as worker/index.js: zombies, waves, health, scores, who's in charge), and every message goes
// through StudySmartly instead of our websocket. Outside StudySmartly ("offline") nothing changes.
//
// Messages are bundled: the host sends one message per tick to everyone (what each player needs), and each player
// sends one per tick to the host, so a room stays under StudySmartly's ~30 messages a second and 16 KB each.

const FLUSH_MS = 66; // ~15 bundles a second
const MAX_BYTES = 14000; // (StudySmartly's limit is 16 KB)

export function startStudySmartly({ mp, onRoom, onLeft, notify }) {
  if (typeof window.StudySmartlyMultiplayer !== 'function') return null;
  const ss = window.StudySmartlyMultiplayer({ maxPlayers: 4 });
  const state = { inRoom: false, code: null, room: null, roomReady: null, guests: new Map(), toHost: [], fromHost: [], socket: null, timer: null };

  // ---------------------------------------------------------------- the host: the room runs here
  async function openRoom() {
    closeRoom();
    const ready = import('../worker/index.js').then(({ Room }) => {
      // the parts of the server the room asks for (who someone is, blocked words, the server list): answered here
      const db = {
        fetch: async (url, init = {}) => {
          const path = new URL(url).pathname;
          const body = init.body ? JSON.parse(init.body) : {};
          const out = path === '/api/internal/join' ? { user: { username: body.name || 'Player', admin: false, profile: { avatar: '🧟', color: '#e9d9b8', look: null, pet: 'none' }, items: {} }, words: [] } : { words: [] };
          return { json: async () => out };
        },
      };
      const room = new Room({}, { DB: { idFromName: () => 'global', get: () => db } });
      room.code = String(state.code || 'STUDY').toUpperCase().slice(0, 12);
      room.mode = 'coop'; // co-op to start with: the host can pick any mode in the lobby
      state.room = room;
      return room;
    });
    state.roomReady = ready;
    return ready;
  }
  function closeRoom() {
    const room = state.room;
    state.room = null;
    state.roomReady = null;
    if (!room) return;
    room._stopTimer?.();
    clearInterval(room.interval);
    state.guests.clear();
  }
  // a player in the room: their messages come in through `deliver`
  function roomPlayer(room, deliver) {
    const p = {
      id: room.nextId++, ws: { send: deliver, close: () => {} }, joined: false, name: 'Player', avatar: '🧟', color: '#e9d9b8', account: false,
      team: 'red', alive: false, hp: 100, pos: [0, 0, 0], rot: [0, 0], gun: 'rifle', flags: 0,
      kills: 0, deaths: 0, score: 0, respawnAt: 0, protectUntil: 0, hits: [0, 0], msgs: [0, 0], level: 0, ip: 'studysmartly', username: null,
    };
    room.players.set(p.id, p);
    return p;
  }
  // someone else's game: their messages, sent on in bundles
  async function guestFor(ssId) {
    const room = await state.roomReady;
    if (!room) return null;
    let g = state.guests.get(ssId);
    if (!g) {
      g = { p: null, out: [] };
      g.p = roomPlayer(room, (text) => g.out.push(text));
      state.guests.set(ssId, g);
    }
    return g;
  }
  function dropGuest(ssId) {
    const g = state.guests.get(ssId);
    if (!g || !state.room) return;
    state.guests.delete(ssId);
    state.room._onClose(g.p);
  }

  // ---------------------------------------------------------------- the game's connection to the room
  // A stand-in for the websocket multiplayer.js uses (send / onopen / onmessage / onclose).
  function makeSocket() {
    const sock = { readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null };
    const receive = (text) => sock.readyState === 1 && sock.onmessage?.({ data: text });
    if (ss.isHost()) {
      // our own game, talking to the room in this page
      let p = null;
      sock.send = (text) => p && state.room?._onMessage(p, text);
      state.roomReady?.then((room) => {
        if (!room || sock.readyState !== 1) return;
        p = roomPlayer(room, (text) => queueMicrotask(() => receive(text)));
        sock.onopen?.();
      });
      sock.close = () => {
        if (sock.readyState !== 1) return;
        sock.readyState = 3;
        if (p && state.room) state.room._onClose(p);
        sock.onclose?.();
      };
    } else {
      // the room is in the host's game: through StudySmartly
      sock.send = (text) => state.toHost.push(text);
      sock.close = () => {
        if (sock.readyState !== 1) return;
        sock.readyState = 3;
        const host = hostId();
        if (host) ss.sendTo(host, { wg: 'bye' });
        sock.onclose?.();
      };
      queueMicrotask(() => sock.onopen?.());
    }
    sock.receive = receive;
    state.socket = sock;
    return sock;
  }
  let currentHost = null; // StudySmartly's host: where the room runs
  const hostId = () => currentHost;

  // ---------------------------------------------------------------- the bundles, ~15 a second
  function flush() {
    if (!state.inRoom) return;
    if (ss.isHost()) {
      // what every guest gets (sent once), and what only one of them gets
      const per = [...state.guests.entries()].filter(([, g]) => g.out.length);
      if (!per.length) return;
      const counts = new Map();
      for (const [, g] of per) for (const t of g.out) counts.set(t, (counts.get(t) || 0) + 1);
      const everyone = state.guests.size;
      const all = [...counts.entries()].filter(([, n]) => n === everyone && per.length === everyone).map(([t]) => t);
      const allSet = new Set(all);
      const to = {};
      for (const [id, g] of per) {
        const own = g.out.filter((t) => !allSet.has(t));
        if (own.length) to[id] = own;
        g.out = [];
      }
      sendBundles({ all, to });
    } else if (state.toHost.length && currentHost) {
      // only the newest position matters
      let lastState = -1;
      state.toHost.forEach((t, i) => t.startsWith('{"t":"s"') && (lastState = i));
      const msgs = state.toHost.filter((t, i) => !t.startsWith('{"t":"s"') || i === lastState);
      state.toHost = [];
      let part = [];
      let size = 0;
      for (const t of msgs) {
        if (size + t.length > MAX_BYTES && part.length) {
          ss.sendTo(currentHost, { wg: 'c', m: part });
          part = [];
          size = 0;
        }
        part.push(t);
        size += t.length;
      }
      if (part.length) ss.sendTo(currentHost, { wg: 'c', m: part });
    }
  }
  // the host's bundle, split if it would be too big for one message
  function sendBundles({ all, to }) {
    let cur = { wg: 'h', all: [], to: {} };
    let size = 0;
    const push = (t, id) => {
      if (size + t.length > MAX_BYTES && size > 0) {
        ss.send(cur);
        cur = { wg: 'h', all: [], to: {} };
        size = 0;
      }
      if (id === undefined) cur.all.push(t);
      else (cur.to[id] ||= []).push(t);
      size += t.length + 8;
    };
    for (const t of all) push(t);
    for (const [id, list] of Object.entries(to)) for (const t of list) push(t, id);
    if (size > 0) ss.send(cur);
  }

  // ---------------------------------------------------------------- messages through StudySmartly
  ss.on('message', async (data, from) => {
    if (!data || typeof data !== 'object') return;
    if (ss.isHost()) {
      if (data.wg === 'c') {
        const g = await guestFor(from.id);
        if (g) for (const t of data.m || []) if (typeof t === 'string') state.room?._onMessage(g.p, t);
      } else if (data.wg === 'bye') dropGuest(from.id);
    } else if (data.wg === 'h' && state.socket) {
      const me = ss.me()?.id;
      for (const t of data.all || []) state.socket.receive(t);
      for (const t of data.to?.[me] || []) state.socket.receive(t);
    }
  });

  // ---------------------------------------------------------------- the room bar
  async function enter() {
    currentHost = ss.isHost() ? ss.me()?.id : currentHost;
    if (ss.isHost()) await openRoom();
    mp.useSocket(makeSocket, ss.me()?.name);
    const err = await mp.join(String(state.code || 'STUDY').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(5, 'X').slice(0, 5));
    if (err) notify?.(err);
    else onRoom?.();
  }
  function leaveGame(msg) {
    mp.useSocket(null);
    if (state.socket) {
      const s = state.socket;
      state.socket = null;
      s.readyState = 3;
      s.onclose?.();
    }
    closeRoom();
    if (msg) notify?.(msg);
  }
  ss.on('room', ({ code, hostId: h }) => {
    state.inRoom = true;
    state.code = code;
    currentHost = h;
    clearInterval(state.timer);
    state.timer = setInterval(flush, FLUSH_MS);
    enter();
  });
  ss.on('leave', (player) => {
    if (ss.isHost()) dropGuest(player.id);
  });
  ss.on('host', (h) => {
    // the host left: whoever StudySmartly picked runs a new room, and everyone joins it
    currentHost = h;
    leaveGame('The host left: starting a new room…');
    setTimeout(() => state.inRoom && enter(), ss.isHost() ? 0 : 600);
  });
  ss.on('left', () => {
    state.inRoom = false;
    clearInterval(state.timer);
    leaveGame();
    onLeft?.();
  });
  ss.on('offline', () => {
    /* not inside StudySmartly: the normal game (single player, and our own online rooms) */
  });

  return {
    inRoom: () => state.inRoom,
    isHost: () => ss.isHost(),
    rejoin: () => state.inRoom && enter(),
    code: () => state.code,
  };
}
