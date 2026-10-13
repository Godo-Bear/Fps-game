import { DurableObject } from 'cloudflare:workers';
import { cleanProfile, levelFromXp, xpForRun } from '../shared/cosmetics.js';
import { FFA_SPAWNS, FLAG_BASES, MAPS, MATCH_SECONDS, MAX_HP, MAX_PLAYERS, MODES, POINT, RESPAWN_SECONDS, TEAM_SPAWNS } from '../shared/modes.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (msg, status = 400) => json({ error: msg }, status);

// ---------------------------------------------------------------- entry point
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = /^\/api\/room\/([A-Z0-9]{5})\/ws$/.exec(url.pathname);
    if (room) return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
    if (url.pathname.startsWith('/api/')) return env.DB.get(env.DB.idFromName('global')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------- helpers
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return hex(bits);
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const DAY = 86400000;
const ONLINE_MS = 3 * 60000;

// ---------------------------------------------------------------- accounts, friends, progress
export class GameDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created INTEGER NOT NULL,
        last_seen INTEGER NOT NULL DEFAULT 0,
        profile TEXT NOT NULL DEFAULT '{}',
        xp INTEGER NOT NULL DEFAULT 0,
        best_wave INTEGER NOT NULL DEFAULT 0,
        best_score INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        headshots INTEGER NOT NULL DEFAULT 0,
        games INTEGER NOT NULL DEFAULT 0,
        pvp_kills INTEGER NOT NULL DEFAULT 0,
        pvp_wins INTEGER NOT NULL DEFAULT 0,
        last_progress INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS friends (a INTEGER NOT NULL, b INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (a, b));
      CREATE INDEX IF NOT EXISTS friends_b ON friends (b);
    `);
    this.fails = new Map(); // username -> [count, windowStart]
    this.signups = new Map(); // ip -> [count, windowStart]
  }

  _limit(map, key, max, windowMs) {
    const now = Date.now();
    const e = map.get(key);
    if (!e || now - e[1] > windowMs) {
      map.set(key, [1, now]);
      return true;
    }
    e[0]++;
    return e[0] <= max;
  }

  _publicUser(u, self = false) {
    const level = levelFromXp(u.xp);
    const out = {
      username: u.username,
      level,
      xp: u.xp,
      profile: cleanProfile(JSON.parse(u.profile || '{}'), level),
      stats: { bestWave: u.best_wave, bestScore: u.best_score, kills: u.kills, headshots: u.headshots, games: u.games, pvpKills: u.pvp_kills, pvpWins: u.pvp_wins },
      online: Date.now() - u.last_seen < ONLINE_MS,
    };
    if (self) delete out.online;
    return out;
  }

  async _session(user) {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', await sha256(token), user.id, now + 30 * DAY);
    return token;
  }

  async _auth(request) {
    const h = request.headers.get('authorization') || '';
    const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
    if (!m) return null;
    const row = this.sql
      .exec('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', await sha256(m[1]), Date.now())
      .toArray()[0];
    if (row) this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), row.id);
    return row || null;
  }

  _byName(name) {
    return this.sql.exec('SELECT * FROM users WHERE username = ?', name).toArray()[0];
  }

  async fetch(request) {
    try {
      return await this._route(request);
    } catch (e) {
      console.error(e);
      return err('Server error', 500);
    }
  }

  async _route(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method;
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      const text = await request.text();
      if (text.length > 4096) return err('Request too large', 413);
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return err('Bad JSON');
      }
    }

    if (path === '/register' && method === 'POST') {
      const { username, password } = body;
      if (typeof username !== 'string' || !USERNAME.test(username)) return err('Username must be 3-16 letters, numbers or _');
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) return err('Password must be at least 6 characters');
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      if (!this._limit(this.signups, ip, 5, 3600000)) return err('Too many new accounts from here, try later', 429);
      if (this._byName(username)) return err('That username is taken', 409);
      const salt = randomHex(16);
      const hash = await hashPassword(password, salt);
      const now = Date.now();
      this.sql.exec('INSERT INTO users (username, pass_hash, salt, created, last_seen) VALUES (?, ?, ?, ?, ?)', username, hash, salt, now, now);
      const user = this._byName(username);
      return json({ token: await this._session(user), user: this._publicUser(user, true) });
    }

    if (path === '/login' && method === 'POST') {
      const { username, password } = body;
      if (typeof username !== 'string' || typeof password !== 'string') return err('Missing username or password');
      const key = username.toLowerCase();
      const f = this.fails.get(key);
      if (f && f[0] >= 8 && Date.now() - f[1] < 600000) return err('Too many attempts, wait a few minutes', 429);
      const user = this._byName(username);
      const ok = user && sameString(await hashPassword(password, user.salt), user.pass_hash);
      if (!ok) {
        this._limit(this.fails, key, 8, 600000);
        return err('Wrong username or password', 401);
      }
      this.fails.delete(key);
      this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), user.id);
      return json({ token: await this._session(user), user: this._publicUser(user, true) });
    }

    if (path === '/leaderboard' && method === 'GET') {
      const rows = this.sql.exec('SELECT * FROM users ORDER BY best_wave DESC, best_score DESC LIMIT 25').toArray();
      return json({ players: rows.map((u) => this._publicUser(u)) });
    }

    // Everything below needs a logged-in user.
    const me = await this._auth(request);
    if (!me) return err('Not logged in', 401);

    if (path === '/me' && method === 'GET') return json({ user: this._publicUser(me, true) });

    if (path === '/logout' && method === 'POST') {
      const m = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '');
      if (m) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(m[1]));
      return json({ ok: true });
    }

    if (path === '/profile' && method === 'PUT') {
      const profile = cleanProfile(body.profile, levelFromXp(me.xp));
      this.sql.exec('UPDATE users SET profile = ? WHERE id = ?', JSON.stringify(profile), me.id);
      return json({ user: this._publicUser({ ...me, profile: JSON.stringify(profile) }, true) });
    }

    if (path === '/progress' && method === 'POST') {
      const now = Date.now();
      if (now - me.last_progress < 15000) return err('Slow down', 429);
      const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      const wave = int(body.wave, 300);
      const score = int(body.score, 2000000);
      const kills = int(body.kills, 5000);
      const headshots = Math.min(kills, int(body.headshots, 5000));
      const pvp = body.mode === 'pvp';
      const won = pvp && body.won === true ? 1 : 0;
      const xp = xpForRun({ wave: pvp ? 0 : wave, score: pvp ? kills * 100 + won * 500 : score, kills });
      this.sql.exec(
        `UPDATE users SET xp = xp + ?, games = games + 1, kills = kills + ?, headshots = headshots + ?,
          best_wave = MAX(best_wave, ?), best_score = MAX(best_score, ?), pvp_kills = pvp_kills + ?, pvp_wins = pvp_wins + ?, last_progress = ?
         WHERE id = ?`,
        xp, pvp ? 0 : kills, headshots, pvp ? 0 : wave, pvp ? 0 : score, pvp ? kills : 0, won, now, me.id
      );
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true), gained: xp, levelBefore: levelFromXp(me.xp) });
    }

    if (path === '/friends' && method === 'GET') {
      const rows = this.sql
        .exec(
          `SELECT f.a, f.b, f.status, u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
           WHERE f.a = ? OR f.b = ?`,
          me.id, me.id, me.id
        )
        .toArray();
      const friends = [];
      const incoming = [];
      const outgoing = [];
      for (const r of rows) {
        const u = this._publicUser(r);
        if (r.status === 'accepted') friends.push(u);
        else if (r.b === me.id) incoming.push(u);
        else outgoing.push(u);
      }
      friends.sort((x, y) => Number(y.online) - Number(x.online) || y.level - x.level);
      return json({ friends, incoming, outgoing });
    }

    if (path.startsWith('/friends/') && method === 'POST') {
      const action = path.slice('/friends/'.length);
      const other = typeof body.username === 'string' ? this._byName(body.username) : null;
      if (!other) return err('No player with that name', 404);
      if (other.id === me.id) return err("You can't friend yourself");
      const mine = this.sql.exec('SELECT * FROM friends WHERE a = ? AND b = ?', me.id, other.id).toArray()[0];
      const theirs = this.sql.exec('SELECT * FROM friends WHERE a = ? AND b = ?', other.id, me.id).toArray()[0];
      if (action === 'request') {
        if (mine?.status === 'accepted' || theirs?.status === 'accepted') return err('Already friends');
        if (theirs) {
          this.sql.exec("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?", other.id, me.id);
          return json({ ok: true, status: 'accepted' });
        }
        if (mine) return err('Request already sent');
        const count = this.sql.exec('SELECT COUNT(*) AS n FROM friends WHERE a = ? OR b = ?', me.id, me.id).one().n;
        if (count >= 200) return err('Friend list is full');
        this.sql.exec("INSERT INTO friends (a, b, status, created) VALUES (?, ?, 'pending', ?)", me.id, other.id, Date.now());
        return json({ ok: true, status: 'pending' });
      }
      if (action === 'accept') {
        if (!theirs) return err('No request from that player');
        this.sql.exec("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?", other.id, me.id);
        return json({ ok: true });
      }
      if (action === 'remove') {
        this.sql.exec('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, other.id, other.id, me.id);
        return json({ ok: true });
      }
    }

    return err('Not found', 404);
  }
}

// ---------------------------------------------------------------- multiplayer rooms
const TEAMS = ['red', 'blue'];
const MAX_HIT = 520; // biggest single hit (sniper headshot) with a little slack
const NAME = /^[A-Za-z0-9_ ]{1,16}$/;

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.nextId = 1;
    this.hostId = 0;
    this.mode = 'tdm';
    this.map = 'plains';
    this.phase = 'lobby'; // lobby | playing | ended
    this.match = null;
    this.interval = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a websocket', { status: 426 });
    const url = new URL(request.url);
    this.code = url.pathname.split('/')[3];
    const create = url.searchParams.get('create') === '1';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const fail = (msg) => {
      server.send(JSON.stringify({ t: 'error', msg }));
      server.close(1000, msg);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (create && this.players.size > 0) return fail('taken');
    if (!create && this.players.size === 0) return fail('Room not found. Check the code.');
    if (this.players.size >= MAX_PLAYERS) return fail('Room is full');

    const p = {
      id: this.nextId++, ws: server, joined: false, name: 'Player', avatar: '🧟', color: '#e9d9b8', account: false,
      team: 'red', alive: false, hp: MAX_HP, pos: [0, 0, 0], rot: [0, 0], gun: 'rifle', flags: 0,
      kills: 0, deaths: 0, score: 0, respawnAt: 0, protectUntil: 0, hits: [0, 0], msgs: [0, 0],
    };
    this.players.set(p.id, p);
    server.addEventListener('message', (e) => this._onMessage(p, e.data));
    server.addEventListener('close', () => this._onClose(p));
    server.addEventListener('error', () => this._onClose(p));
    return new Response(null, { status: 101, webSocket: client });
  }

  _send(p, msg) {
    try {
      p.ws.send(JSON.stringify(msg));
    } catch {
      /* socket already closed */
    }
  }
  _broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p === except || !p.joined) continue;
      try {
        p.ws.send(text);
      } catch {
        /* ignore */
      }
    }
  }

  _lobby() {
    return {
      t: 'lobby', code: this.code, mode: this.mode, map: this.map, phase: this.phase, host: this.hostId,
      players: [...this.players.values()].filter((p) => p.joined).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, team: p.team, account: p.account })),
    };
  }

  _teamCounts() {
    const c = { red: 0, blue: 0 };
    for (const p of this.players.values()) if (p.joined) c[p.team]++;
    return c;
  }

  async _onMessage(p, data) {
    if (typeof data !== 'string' || data.length > 2048) return;
    // basic flood protection
    const now = Date.now();
    if (now - p.msgs[1] > 1000) p.msgs = [0, now];
    if (++p.msgs[0] > 80) return;
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (!p.joined && m.t !== 'join') return;

    switch (m.t) {
      case 'join': {
        if (p.joined) return;
        let name = typeof m.name === 'string' && NAME.test(m.name.trim()) ? m.name.trim() : `Guest${p.id}`;
        if (typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token)) {
          try {
            const res = await this.env.DB.get(this.env.DB.idFromName('global')).fetch('https://db/api/me', { headers: { authorization: `Bearer ${m.token}` } });
            if (res.ok) {
              const { user } = await res.json();
              name = user.username;
              p.account = true;
              p.avatar = user.profile.avatar;
              p.color = user.profile.color;
            }
          } catch {
            /* fall back to guest */
          }
        }
        if (!p.account) {
          if (typeof m.avatar === 'string' && m.avatar.length <= 8) p.avatar = m.avatar;
          if (typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color)) p.color = m.color;
        }
        const taken = new Set([...this.players.values()].filter((o) => o.joined).map((o) => o.name.toLowerCase()));
        let unique = name;
        for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name}${i}`;
        p.name = unique.slice(0, 18);
        const counts = this._teamCounts();
        p.team = counts.red <= counts.blue ? 'red' : 'blue';
        p.joined = true;
        if (!this.hostId || !this.players.get(this.hostId)?.joined) this.hostId = p.id;
        this._send(p, { t: 'welcome', id: p.id });
        this._broadcast(this._lobby());
        if (this.phase === 'playing') {
          this._send(p, this._matchStart());
          this._spawn(p);
        }
        this._broadcast({ t: 'msg', text: `${p.name} joined` }, p);
        break;
      }
      case 'mode':
        if (p.id === this.hostId && this.phase === 'lobby' && MODES[m.mode]) {
          this.mode = m.mode;
          this._broadcast(this._lobby());
        }
        break;
      case 'map':
        if (p.id === this.hostId && this.phase === 'lobby' && MAPS[m.map]) {
          this.map = m.map;
          this._broadcast(this._lobby());
        }
        break;
      case 'team':
        if (this.phase === 'lobby' && TEAMS.includes(m.team)) {
          p.team = m.team;
          this._broadcast(this._lobby());
        }
        break;
      case 'start':
        if (p.id === this.hostId && this.phase === 'lobby') this._startMatch();
        break;
      case 's': // player state
        if (this.phase !== 'playing' || !p.alive) return;
        if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) p.pos = m.p.map((v) => Math.max(-500, Math.min(500, v)));
        if (Array.isArray(m.r) && m.r.length === 2 && m.r.every(Number.isFinite)) p.rot = m.r;
        if (typeof m.g === 'string' && m.g.length < 12) p.gun = m.g;
        if (Number.isInteger(m.f)) p.flags = m.f & 0xff;
        break;
      case 'shot': // tracer for everyone else to see
        if (this.phase === 'playing' && p.alive) {
          const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map((n) => Math.max(-600, Math.min(600, n))) : null);
          const o = vec(m.o);
          const e = vec(m.e);
          if (o && e) this._broadcast({ t: 'shot', id: p.id, o, e, g: p.gun }, p);
        }
        break;
      case 'hit':
        this._hit(p, m);
        break;
      case 'ping':
        this._send(p, { t: 'pong', at: m.at });
        break;
    }
  }

  _onClose(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    if (!p.joined) return;
    this._dropFlag(p);
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find((o) => o.joined);
      this.hostId = next ? next.id : 0;
    }
    if (this.players.size === 0) {
      this._stopTimer();
      this.phase = 'lobby';
      this.match = null;
      return;
    }
    this._broadcast({ t: 'left', id: p.id });
    this._broadcast({ t: 'msg', text: `${p.name} left` });
    this._broadcast(this._lobby());
  }

  _stopTimer() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  // ---------------------------------------------------------------- match flow
  _matchStart() {
    return { t: 'start', mode: this.mode, map: this.map, weather: this.match.weather, endsAt: this.match.endsAt, now: Date.now() };
  }

  _startMatch() {
    const weathers = MAPS[this.map].weathers;
    this.phase = 'playing';
    this.match = {
      endsAt: Date.now() + MATCH_SECONDS * 1000,
      weather: weathers[Math.floor(Math.random() * weathers.length)],
      scores: { red: 0, blue: 0 },
      point: { owner: null, progress: 0, acc: 0 },
      flags: {
        red: { state: 'home', pos: [...FLAG_BASES.red], carrier: 0, droppedAt: 0 },
        blue: { state: 'home', pos: [...FLAG_BASES.blue], carrier: 0, droppedAt: 0 },
      },
      last: Date.now(),
    };
    for (const p of this.players.values()) {
      p.kills = p.deaths = p.score = 0;
    }
    this._broadcast(this._lobby());
    this._broadcast(this._matchStart());
    for (const p of this.players.values()) if (p.joined) this._spawn(p);
    this._stopTimer();
    this.interval = setInterval(() => this._tick(), 66);
  }

  _spawn(p) {
    const mode = MODES[this.mode];
    let list = mode.teams ? TEAM_SPAWNS[p.team] : FFA_SPAWNS;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (!mode.teams) {
      // furthest spawn from everyone else
      let best = -1;
      for (const s of list) {
        let nearest = Infinity;
        for (const o of this.players.values()) if (o !== p && o.alive) nearest = Math.min(nearest, Math.hypot(o.pos[0] - s[0], o.pos[2] - s[1]));
        if (nearest > best) {
          best = nearest;
          pick = s;
        }
      }
    }
    const x = pick[0] + (Math.random() - 0.5) * 3;
    const z = pick[1] + (Math.random() - 0.5) * 3;
    p.pos = [x, 0, z];
    p.hp = MAX_HP;
    p.alive = true;
    p.protectUntil = Date.now() + 1500;
    const yaw = mode.teams ? (p.team === 'red' ? -Math.PI / 2 : Math.PI / 2) : Math.atan2(x, z);
    this._send(p, { t: 'spawn', p: [x, z], yaw, hp: MAX_HP });
  }

  _hit(p, m) {
    if (this.phase !== 'playing' || !p.alive) return;
    const target = this.players.get(m.id);
    if (!target || !target.alive || target === p) return;
    const mode = MODES[this.mode];
    if (mode.teams && target.team === p.team) return;
    const dmg = Number(m.dmg);
    if (!Number.isFinite(dmg) || dmg <= 0 || dmg > MAX_HIT) return;
    const now = Date.now();
    if (now - p.hits[1] > 1000) p.hits = [0, now];
    if (++p.hits[0] > 45) return; // faster than any gun can hit
    if (Math.hypot(p.pos[0] - target.pos[0], p.pos[2] - target.pos[2]) > 320) return;
    if (now < target.protectUntil) return;
    target.hp -= dmg;
    this._send(target, { t: 'hurt', by: p.id, dmg, from: p.pos, hp: Math.max(0, target.hp) });
    if (target.hp > 0) return;
    target.alive = false;
    target.deaths++;
    target.respawnAt = now + RESPAWN_SECONDS * 1000;
    p.kills++;
    p.score += 100;
    if (this.mode === 'tdm') this.match.scores[p.team]++;
    this._dropFlag(target);
    this._broadcast({ t: 'kill', k: p.id, v: target.id, head: !!m.head, g: p.gun });
    this._checkWin();
  }

  _dropFlag(p) {
    if (!this.match) return;
    for (const team of TEAMS) {
      const f = this.match.flags[team];
      if (f.state === 'carried' && f.carrier === p.id) {
        f.state = 'dropped';
        f.carrier = 0;
        f.pos = [p.pos[0], p.pos[2]];
        f.droppedAt = Date.now();
        this._broadcast({ t: 'msg', text: `${p.name} dropped the ${team} flag`, team });
      }
    }
  }

  _tick() {
    if (this.phase !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.5, (now - this.match.last) / 1000);
    this.match.last = now;
    for (const p of this.players.values()) if (p.joined && !p.alive && p.respawnAt && now >= p.respawnAt) this._spawn(p);

    if (this.mode === 'koth') this._tickPoint(dt);
    if (this.mode === 'ctf') this._tickFlags(now);
    this._checkWin();
    if (this.phase !== 'playing') return;

    const snap = {
      t: 'snap',
      ps: [...this.players.values()]
        .filter((p) => p.joined)
        .map((p) => [p.id, +p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.rot[0].toFixed(3), +p.rot[1].toFixed(3), p.gun, Math.max(0, Math.round(p.hp)), p.flags, p.alive ? 1 : 0, p.kills, p.deaths, p.score]),
      sc: this.match.scores,
      left: Math.max(0, Math.round((this.match.endsAt - now) / 1000)),
    };
    if (this.mode === 'koth') snap.pt = this.match.point;
    if (this.mode === 'ctf') snap.fl = this.match.flags;
    this._broadcast(snap);
  }

  _tickPoint(dt) {
    const pt = this.match.point;
    const inside = { red: 0, blue: 0 };
    const capturers = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.pos[0] - POINT.x, p.pos[2] - POINT.z) <= POINT.radius) {
        inside[p.team]++;
        capturers.push(p);
      }
    }
    const contested = inside.red > 0 && inside.blue > 0;
    if (!contested && (inside.red || inside.blue)) {
      const team = inside.red ? 'red' : 'blue';
      const dir = team === 'red' ? -1 : 1;
      const rate = 14 + Math.min(3, inside[team]) * 8;
      pt.progress = Math.max(-100, Math.min(100, pt.progress + dir * rate * dt));
      // pushing the bar past the middle neutralises the old owner
      if ((pt.owner === 'red' && pt.progress > 0) || (pt.owner === 'blue' && pt.progress < 0)) pt.owner = null;
      if (Math.abs(pt.progress) >= 100 && pt.owner !== team) {
        pt.owner = team;
        for (const p of capturers) p.score += 50;
        this._broadcast({ t: 'msg', text: `${team.toUpperCase()} captured the point`, team });
      }
    }
    pt.contested = contested;
    if (pt.owner) {
      pt.acc += dt;
      while (pt.acc >= 1) {
        pt.acc -= 1;
        this.match.scores[pt.owner]++;
      }
    }
  }

  _tickFlags(now) {
    const flags = this.match.flags;
    for (const team of TEAMS) {
      const f = flags[team];
      if (f.state === 'carried') {
        const c = this.players.get(f.carrier);
        if (!c || !c.alive) this._dropFlagState(f);
        else f.pos = [c.pos[0], c.pos[2]];
      }
      if (f.state === 'dropped' && now - f.droppedAt > 25000) {
        f.state = 'home';
        f.pos = [...FLAG_BASES[team]];
        this._broadcast({ t: 'msg', text: `The ${team} flag returned home`, team });
      }
    }
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const enemy = p.team === 'red' ? 'blue' : 'red';
      const ef = flags[enemy];
      const own = flags[p.team];
      const near = (pos, r) => Math.hypot(p.pos[0] - pos[0], p.pos[2] - pos[1]) < r;
      if ((ef.state === 'home' || ef.state === 'dropped') && near(ef.pos, 2.4)) {
        ef.state = 'carried';
        ef.carrier = p.id;
        this._broadcast({ t: 'msg', text: `${p.name} took the ${enemy} flag!`, team: p.team });
      }
      if (own.state === 'dropped' && near(own.pos, 2.4)) {
        own.state = 'home';
        own.pos = [...FLAG_BASES[p.team]];
        p.score += 25;
        this._broadcast({ t: 'msg', text: `${p.name} returned the ${p.team} flag`, team: p.team });
      }
      if (ef.state === 'carried' && ef.carrier === p.id && own.state === 'home' && near(FLAG_BASES[p.team], 3.2)) {
        ef.state = 'home';
        ef.carrier = 0;
        ef.pos = [...FLAG_BASES[enemy]];
        this.match.scores[p.team]++;
        p.score += 300;
        this._broadcast({ t: 'msg', text: `${p.name} CAPTURED the ${enemy} flag!`, team: p.team, big: true });
      }
    }
  }

  _dropFlagState(f) {
    f.state = 'dropped';
    f.carrier = 0;
    f.droppedAt = Date.now();
  }

  _checkWin() {
    if (this.phase !== 'playing') return;
    const mode = MODES[this.mode];
    const s = this.match.scores;
    let winner = null;
    if (this.mode === 'ffa') {
      const top = [...this.players.values()].sort((a, b) => b.kills - a.kills)[0];
      if (top && top.kills >= mode.killLimit) winner = top.id;
    } else {
      const limit = mode.killLimit ?? mode.scoreLimit;
      if (s.red >= limit) winner = 'red';
      else if (s.blue >= limit) winner = 'blue';
    }
    if (!winner && Date.now() >= this.match.endsAt) {
      if (this.mode === 'ffa') winner = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]?.id ?? null;
      else winner = s.red === s.blue ? 'draw' : s.red > s.blue ? 'red' : 'blue';
    }
    if (winner === null) return;
    this.phase = 'ended';
    this._stopTimer();
    const board = [...this.players.values()]
      .filter((p) => p.joined)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score }));
    this._broadcast({ t: 'end', winner, scores: s, board, mode: this.mode });
    setTimeout(() => {
      if (this.phase !== 'ended') return;
      this.phase = 'lobby';
      for (const p of this.players.values()) p.alive = false;
      this._broadcast(this._lobby());
    }, 12000);
  }
}
