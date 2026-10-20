import { DurableObject } from 'cloudflare:workers';
import { PET_ITEM, PET_MAX_LEVEL, addPetXp, CHARACTERS_LIVE, cleanProfile, petLevel, randomLook, levelFromXp, xpForLevel, xpForRun } from '../shared/cosmetics.js';
import { SHOP, coinsForRun, priceOf } from '../shared/shop.js';
import { SPECIAL_GEAR, TANK_ARMOUR, TANK_FLAG } from '../shared/gear.js';
import { DEFAULT_EVENT_NAME, DROP_BOOSTS, EVENT_THEMES, EVENT_MAX_PLAYERS, DUPLICATE_COINS, EVENT_POINTS, PIECE_COOLDOWN, PIECE_MAX, PIECE_SETS, pieceId, rollPiece, totalPieces } from '../shared/events.js';
import { MAX_SAVES, cleanSaveName } from '../shared/saves.js';
import { addProgress, claimQuest, dailyQuests, dayNumber, questView } from '../shared/quests.js';
import { BUILD_REACH, MAX_STRUCTURES, STRUCTURES } from '../shared/structures.js';
import { ACHIEVEMENT_IDS } from '../shared/achievements.js';
import { MASTERY_GUNS, MASTERY_TIERS, addMasteryKills, chooseSkin, cleanMastery } from '../shared/mastery.js';
import {
  cleanQuick, cleanQuickText, cleanSettings, limitFor, makeRoomCode, refundOldEmotes, DEFEND_POINTS, FFA_SPAWNS, FLAG_BASES, GUN_LADDERS, INFECT_DELAY, INFECTED, JUGG_HP, MAPS, MODE_SETTINGS, MP_MAPS,
  MATCH_SECONDS, MAX_HP, MAX_PLAYERS, MODES, POINT, RESPAWN_SECONDS, SUPPLY_EVERY, SUPPLY_FALL, SUPPLY_FIRST, SUPPLY_GUNS, SUPPLY_LAST, SUPPLY_MAX, SUPPLY_REACH, SURVIVORS, TEAM_SPAWNS,
} from '../shared/modes.js';
import { cleanWords, filterText, makeFilter, nameBlocked } from '../shared/filter.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (msg, status = 400) => json({ error: msg }, status);

// ---------------------------------------------------------------- entry point
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // the rooms and the database talk to each other with this header; nobody outside can send it
    if (request.headers.has('x-internal')) return new Response('Forbidden', { status: 403 });
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
const USERNAME = /^[A-Za-z0-9_]{3,40}$/;
const DAY = 86400000;
const ONLINE_MS = 3 * 60000;
const LIVE_MS = 45000;
// weeks since 5 Jan 2026 (a Monday): the weekly challenge resets every Monday 00:00 UTC
// paid access: a paid_until date means "until the end of that day" (UTC); empty = no end
const accessEnded = (paidUntil) => {
  if (!paidUntil) return false;
  const s = String(paidUntil);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59Z` : s);
  return Number.isFinite(t) && t < Date.now();
};
const weekNumber = (t = Date.now()) => Math.floor((t - Date.UTC(2026, 0, 5)) / (7 * 86400000)); // how long a live leaderboard entry lasts without an update
const PARTY_MAX = 8;

// ---------------------------------------------------------------- accounts, friends, progress
export class GameDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.rooms = new Map(); // quick play: code -> { players, phase, mode, open, at } (in memory)
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
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender INTEGER NOT NULL,
        recipient INTEGER NOT NULL,
        text TEXT NOT NULL,
        created INTEGER NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS messages_pair ON messages (sender, recipient, id);
      CREATE INDEX IF NOT EXISTS messages_unseen ON messages (recipient, seen);
      CREATE TABLE IF NOT EXISTS parties (id INTEGER PRIMARY KEY AUTOINCREMENT, leader INTEGER NOT NULL, room TEXT, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS party_members (user INTEGER PRIMARY KEY, party INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS party_invites (party INTEGER NOT NULL, user INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (party, user));
    `);
    // added later: admin accounts
    try {
      this.sql.exec('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
    } catch {
      /* column already exists */
    }
    // added later: the saved solo run (so you can continue on any device), coins and shop items
    // and later still: several named saved games (JSON object of id -> save)
    // and later: bans, timeouts, which room you're in (for admins) and your last IP (for bans)
    for (const col of ['save TEXT', 'coins INTEGER NOT NULL DEFAULT 0', "items TEXT NOT NULL DEFAULT '{}'", 'saves TEXT', 'quests TEXT', 'mastery TEXT',
      'banned INTEGER NOT NULL DEFAULT 0', 'timeout_until INTEGER NOT NULL DEFAULT 0', 'room TEXT', 'last_ip TEXT',
      'achievements TEXT', 'sb_id TEXT', 'paid INTEGER NOT NULL DEFAULT 0', 'paid_until TEXT', 'live_wave INTEGER NOT NULL DEFAULT 0', 'live_score INTEGER NOT NULL DEFAULT 0', 'live_at INTEGER NOT NULL DEFAULT 0']) {
      try {
        this.sql.exec(`ALTER TABLE users ADD COLUMN ${col}`);
      } catch {
        /* column already exists */
      }
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ip_bans (ip TEXT PRIMARY KEY, user INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, level INTEGER NOT NULL, best_wave INTEGER NOT NULL, games INTEGER NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, owner INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_members (grp INTEGER NOT NULL, user INTEGER NOT NULL, last_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (grp, user));
      CREATE TABLE IF NOT EXISTS group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, grp INTEGER NOT NULL, sender INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS weekly (week INTEGER NOT NULL, user INTEGER NOT NULL, wave INTEGER NOT NULL, score INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (week, user));
    `);
    // guests: kept so admins can kick, time out and ban them too
    for (const col of ['banned INTEGER NOT NULL DEFAULT 0', 'timeout_until INTEGER NOT NULL DEFAULT 0', 'room TEXT', 'name TEXT', 'ip TEXT']) {
      try {
        this.sql.exec(`ALTER TABLE guests ADD COLUMN ${col}`);
      } catch {
        /* column already exists */
      }
    }
    this.adminTries = new Map(); // user id -> [count, windowStart]
    this.fails = new Map(); // username -> [count, windowStart]
    this.signups = new Map(); // ip -> [count, windowStart]
    this.dms = new Map(); // user id -> [count, windowStart] (friend chat)
    this.questReports = new Map(); // user id -> [count, windowStart]
    this.masteryReports = new Map();
  }

  // The player's saved games; the old single save (from before named games) moves in as the first one.
  _saves(me) {
    let saves = {};
    try {
      saves = me.saves ? JSON.parse(me.saves) : {};
    } catch {
      saves = {};
    }
    if (me.save) {
      try {
        const old = JSON.parse(me.save);
        if (old && typeof old.id === 'string' && !saves[old.id]) saves[old.id] = { ...old, name: cleanSaveName(old.name) };
      } catch {
        /* unreadable old save */
      }
      this.sql.exec('UPDATE users SET save = NULL, saves = ? WHERE id = ?', JSON.stringify(saves), me.id);
      me.save = null;
      me.saves = JSON.stringify(saves);
    }
    return saves;
  }

  _mastery(u) {
    try {
      return cleanMastery(u.mastery ? JSON.parse(u.mastery) : null);
    } catch {
      return cleanMastery(null);
    }
  }

  _quests(me) {
    try {
      return me.quests ? JSON.parse(me.quests) : null;
    } catch {
      return null;
    }
  }

  _partyOf(userId) {
    return this.sql.exec('SELECT party FROM party_members WHERE user = ?', userId).toArray()[0]?.party ?? null;
  }
  _partyMembers(party) {
    return this.sql.exec('SELECT u.* FROM party_members m JOIN users u ON u.id = m.user WHERE m.party = ? ORDER BY u.username', party).toArray();
  }
  _leaveParty(userId) {
    const party = this._partyOf(userId);
    if (!party) return;
    this.sql.exec('DELETE FROM party_members WHERE user = ?', userId);
    const left = this._partyMembers(party);
    if (left.length <= 1) {
      // a party of one is just you
      this.sql.exec('DELETE FROM party_members WHERE party = ?', party);
      this.sql.exec('DELETE FROM party_invites WHERE party = ?', party);
      this.sql.exec('DELETE FROM parties WHERE id = ?', party);
      return;
    }
    const p = this.sql.exec('SELECT leader FROM parties WHERE id = ?', party).one();
    if (p.leader === userId) this.sql.exec('UPDATE parties SET leader = ? WHERE id = ?', left[0].id, party);
  }
  _partyView(me) {
    const invites = this.sql
      .exec(
        `SELECT i.party, u.username FROM party_invites i JOIN parties p ON p.id = i.party JOIN users u ON u.id = p.leader
         WHERE i.user = ? AND i.created > ?`,
        me.id, Date.now() - DAY
      )
      .toArray()
      .map((r) => ({ party: r.party, from: r.username }));
    const id = this._partyOf(me.id);
    if (!id) return { party: null, invites };
    const p = this.sql.exec('SELECT * FROM parties WHERE id = ?', id).one();
    const members = this._partyMembers(id).map((u) => ({ ...this._publicUser(u), leader: u.id === p.leader }));
    return { party: { id, room: p.room, leader: members.find((m) => m.leader)?.username, members }, invites };
  }

  _areFriends(a, b) {
    return !!this.sql.exec("SELECT 1 FROM friends WHERE status = 'accepted' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))", a, b, b, a).toArray()[0];
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

  _items(u) {
    try {
      const items = JSON.parse(u.items || '{}');
      return items && typeof items === 'object' ? items : {};
    } catch {
      return {};
    }
  }

  // the admin's announcement for every player (until they press OK)
  _announce() {
    try {
      const a = JSON.parse(this.sql.exec("SELECT value FROM config WHERE key = 'announce'").toArray()[0]?.value || 'null');
      return a && a.id && a.text ? a : null;
    } catch {
      return null;
    }
  }

  // the event the admin is hosting (admin panel → Events), or null
  _event() {
    try {
      const e = JSON.parse(this.sql.exec("SELECT value FROM config WHERE key = 'event'").toArray()[0]?.value || 'null');
      if (!e || !e.id) return null;
      if (e.endsAt && Date.now() > e.endsAt) return null; // its time ran out
      return e;
    } catch {
      return null;
    }
  }

  _updates() {
    try {
      const u = JSON.parse(this.sql.exec("SELECT value FROM config WHERE key = 'updates'").toArray()[0]?.value || '{}');
      return { edits: u.edits || {}, hidden: Array.isArray(u.hidden) ? u.hidden : [], added: Array.isArray(u.added) ? u.added : [] };
    } catch {
      return { edits: {}, hidden: [], added: [] };
    }
  }

  // features held back for a big update until an admin deploys them (admin panel): { view: true, ... }
  _features() {
    try {
      return JSON.parse(this.sql.exec("SELECT value FROM config WHERE key = 'features'").toArray()[0]?.value || '{}');
    } catch {
      return {};
    }
  }

  // what the wolf companion costs in real money (the admin sets it)
  _wolfPrice(key = 'wolfPrice') {
    return this.sql.exec('SELECT value FROM config WHERE key = ?', key).toArray()[0]?.value || (key === 'wolfPrice' ? '$1' : '50c');
  }

  _badges(u) {
    try {
      const list = JSON.parse(u.achievements || '[]');
      return Array.isArray(list) ? list.filter((id) => ACHIEVEMENT_IDS.includes(id)) : [];
    } catch {
      return [];
    }
  }

  _publicUser(u, self = false) {
    const level = levelFromXp(u.xp);
    const items = this._items(u);
    const out = {
      username: u.username,
      level,
      xp: u.xp,
      // admins have every cosmetic unlocked
      profile: cleanProfile(JSON.parse(u.profile || '{}'), u.admin ? 999 : level, items),
      stats: { bestWave: u.best_wave, bestScore: u.best_score, kills: u.kills, headshots: u.headshots, games: u.games, pvpKills: u.pvp_kills, pvpWins: u.pvp_wins },
      online: Date.now() - u.last_seen < ONLINE_MS,
      badges: this._badges(u),
    };
    // in a zombie run right now (the game sends its wave every few seconds)
    if (Date.now() - (u.live_at || 0) < LIVE_MS) out.live = { wave: u.live_wave, score: u.live_score };
    if (self) {
      delete out.online;
      out.admin = !!u.admin;
      out.paidUntil = u.paid_until || null;
      out.coins = u.coins || 0;
      out.items = items;
      out.mastery = this._mastery(u);
    }
    return out;
  }

  async _session(user) {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', await sha256(token), user.id, now + 30 * DAY);
    return token;
  }

  // Paid access through Supabase: on when SUPABASE_URL and SUPABASE_ANON_KEY are set on the Worker.
  get paywall() {
    return !!(this.env.SUPABASE_URL && this.env.SUPABASE_ANON_KEY);
  }
  // Who a Supabase login is, and whether the owner has marked them as paid (profiles.has_paid).
  async _supabaseCheck(accessToken) {
    const base = String(this.env.SUPABASE_URL).replace(/\/+$/, '');
    const headers = { apikey: this.env.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` };
    const ur = await fetch(`${base}/auth/v1/user`, { headers });
    if (!ur.ok) return null;
    const user = await ur.json();
    if (!user?.id) return null;
    // the profiles table only lets people read their own row (row level security)
    const pr = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=has_paid,paid_until`, { headers });
    const row = pr.ok ? (await pr.json())[0] : null;
    const expired = !!(row?.has_paid && accessEnded(row.paid_until));
    return { id: user.id, email: user.email || '', paid: !!row?.has_paid && !expired, expired, paidUntil: row?.paid_until || null, profile: !!row };
  }

  async _auth(request) {
    const h = request.headers.get('authorization') || '';
    const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
    if (!m) return null;
    const row = this.sql
      .exec('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', await sha256(m[1]), Date.now())
      .toArray()[0];
    // with paid access on, a game session only counts for a Supabase login the owner has marked as paid
    if (row && this.paywall && !(row.sb_id && row.paid)) return null;
    // their paid time ran out: switched off straight away (and thrown out of any match)
    if (row && this.paywall && accessEnded(row.paid_until)) {
      this.sql.exec('UPDATE users SET paid = 0 WHERE id = ?', row.id);
      this._kickFromRoom(row, 'Your access has ended. Pay again to keep playing.').catch(() => {});
      return null;
    }
    if (row) this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), row.id);
    if (row && /"emote/.test(row.items || '')) {
      // emotes left the shop: give the coins back (once)
      const items = this._items(row);
      const refund = refundOldEmotes(items);
      row.items = JSON.stringify(items);
      row.coins = (row.coins || 0) + refund;
      this.sql.exec('UPDATE users SET items = ?, coins = ? WHERE id = ?', row.items, row.coins, row.id);
    }
    return row || null;
  }

  _byName(name) {
    return this.sql.exec('SELECT * FROM users WHERE username = ?', name).toArray()[0];
  }

  // ---- blocked words (admins pick them; every room and friend chat hides them)
  _words() {
    if (!this.wordList) {
      try {
        this.wordList = cleanWords(JSON.parse(this.sql.exec("SELECT value FROM config WHERE key = 'words'").toArray()[0]?.value || '[]'));
      } catch {
        this.wordList = [];
      }
      this.wordRe = makeFilter(this.wordList);
    }
    return this.wordList;
  }
  _filter(text) {
    this._words();
    return filterText(text, this.wordRe);
  }

  // a banned player's last IP: no guest play or new accounts from it for a week
  // (only a week, and other accounts there still work, since schools and homes share IPs)
  _ipBanned(ip) {
    return !!ip && ip !== 'local' && !!this.sql.exec('SELECT 1 FROM ip_bans WHERE ip = ? AND created > ?', ip, Date.now() - 7 * DAY).toArray()[0];
  }
  // why this account can't play online right now (or null)
  _blocked(u, ip) {
    if (u?.banned) return 'This account has been banned';
    if (u && u.timeout_until > Date.now()) return `You're timed out for ${Math.ceil((u.timeout_until - Date.now()) / 60000)} more minute(s)`;
    if (!u && this._ipBanned(ip)) return 'You have been banned from online play';
    return null;
  }

  // tell the room someone is in to throw them out
  async _kickFromRoom(u, msg) {
    if (!u?.room) return false;
    try {
      const res = await this.env.ROOMS.get(this.env.ROOMS.idFromName(u.room)).fetch('https://room/internal/kick', {
        method: 'POST', headers: { 'x-internal': '1' }, body: JSON.stringify({ username: u.username, guest: u.guest, msg }),
      });
      return res.ok && (await res.json()).kicked;
    } catch {
      return false;
    }
  }

  _guestRow(g) {
    const now = Date.now();
    const online = now - g.last_seen < ONLINE_MS;
    return {
      guest: g.id, username: `${g.name || 'Guest'} #${g.id.slice(0, 6)}`, level: g.level, coins: 0, admin: false, online,
      room: online ? g.room || null : null, banned: !!g.banned, timeoutMins: g.timeout_until > now ? Math.ceil((g.timeout_until - now) / 60000) : 0, lastSeen: g.last_seen,
    };
  }

  _manageView(u) {
    return {
      ...this._adminRow(u), xp: u.xp, created: u.created, bestWave: u.best_wave, bestScore: u.best_score, kills: u.kills, headshots: u.headshots,
      pvpKills: u.pvp_kills, pvpWins: u.pvp_wins, games: u.games, badges: this._badges(u).length, items: Object.keys(this._items(u)).length,
      wolf: !!this._items(u)[PET_ITEM],
      wolfLevel: petLevel(this._items(u)),
      pieces: totalPieces(this._items(u)),
      gear: SPECIAL_GEAR.filter((g) => this._items(u)[g.item]).map((g) => g.id),
    };
  }

  _adminRow(u) {
    const now = Date.now();
    return {
      username: u.username, level: levelFromXp(u.xp), coins: u.coins || 0, admin: !!u.admin, online: now - u.last_seen < ONLINE_MS,
      room: now - u.last_seen < ONLINE_MS ? u.room || null : null, banned: !!u.banned, lastSeen: u.last_seen, timeoutMins: u.timeout_until > now ? Math.ceil((u.timeout_until - now) / 60000) : 0,
    };
  }

  // A player joining a room: who they are, whether they're allowed in, and the blocked words.
  async _joinRoom(body) {
    const ip = typeof body.ip === 'string' ? body.ip.slice(0, 64) : '';
    let u = null;
    if (typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token)) {
      u = await this._auth({ headers: new Headers({ authorization: `Bearer ${body.token}` }) });
    }
    const blocked = this._blocked(u, ip);
    if (blocked) return json({ blocked });
    const gid = !u && typeof body.guest === 'string' && /^[a-f0-9]{24}$/.test(body.guest) ? body.guest : null;
    if (gid) {
      const g = this.sql.exec('SELECT * FROM guests WHERE id = ?', gid).toArray()[0];
      if (g?.banned) return json({ blocked: 'You have been banned from online play' });
      if (g && g.timeout_until > Date.now()) return json({ blocked: `You're timed out for ${Math.ceil((g.timeout_until - Date.now()) / 60000)} more minute(s)` });
      const room = typeof body.room === 'string' && /^[A-Z0-9]{5}$/.test(body.room) ? body.room : null;
      const name = typeof body.name === 'string' ? body.name.slice(0, 40) : null;
      const now = Date.now();
      this.sql.exec(
        `INSERT INTO guests (id, level, best_wave, games, first_seen, last_seen, room, name, ip) VALUES (?, 1, 0, 0, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen, room = excluded.room, name = excluded.name, ip = excluded.ip`,
        gid, now, now, room, name, ip
      );
    }
    if (u) {
      const room = typeof body.room === 'string' && /^[A-Z0-9]{5}$/.test(body.room) ? body.room : null;
      this.sql.exec('UPDATE users SET room = ?, last_ip = ? WHERE id = ?', room, ip && ip !== 'local' ? ip : u.last_ip, u.id);
    }
    return json({ user: u ? this._publicUser(u, true) : null, words: this._words() });
  }

  // Calls from the game rooms (never from players: the front door refuses the header).
  _internal(path, body) {
    if (path === '/internal/leave') {
      if (body.guest) this.sql.exec('UPDATE guests SET room = NULL WHERE id = ? AND room = ?', String(body.guest), String(body.room));
      else this.sql.exec('UPDATE users SET room = NULL WHERE username = ? AND room = ?', String(body.username), String(body.room));
      return json({ ok: true });
    }
    if (path === '/internal/words') return json({ words: this._words() });
    if (path === '/internal/room') {
      // rooms tell us how full they are, for quick play
      const code = String(body.code || '').slice(0, 8);
      if (!code) return err('No code');
      if (!body.players) this.rooms.delete(code);
      else this.rooms.set(code, { code, players: Number(body.players) | 0, phase: String(body.phase), mode: String(body.mode), open: !!body.open, map: String(body.map || ''), host: String(body.host || '').slice(0, 42), at: Date.now() });
      return json({ ok: true });
    }
    return err('Not found', 404);
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
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      const text = await request.text();
      if (text.length > 8192) return err('Request too large', 413);
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return err('Bad JSON');
      }
    }

    if (path.startsWith('/internal/') && request.headers.get('x-internal') === '1') {
      if (path === '/internal/join') return this._joinRoom(body, ip);
      return this._internal(path, body);
    }

    // what the game needs to know before anyone logs in
    if (path === '/config' && method === 'GET') {
      return json({
        supabase: this.paywall ? { url: this.env.SUPABASE_URL, anonKey: this.env.SUPABASE_ANON_KEY } : null,
        price: this.env.PAY_PRICE || '$2',
        months: this.env.PAY_MONTHS === undefined ? 6 : Number(this.env.PAY_MONTHS) || 0, // 0 = pay once, yours forever
        payNote: this.env.PAY_NOTE || 'paid cash in hand to the site owner',
        wolfPrice: this._wolfPrice(),
        wolfLevelPrice: this._wolfPrice('wolfLevelPrice'),
        event: this._event(),
        features: this._features(),
      });
    }

    // Supabase login -> game session. Unpaid accounts get 402 and the "Almost there" screen.
    if (path === '/auth/supabase' && method === 'POST') {
      if (!this.paywall) return err('Paid access is not set up', 404);
      if (typeof body.access_token !== 'string' || body.access_token.length > 4000) return err('Log in again', 401);
      const sb = await this._supabaseCheck(body.access_token);
      if (!sb) return err('Your login has expired, log in again', 401);
      if (!sb.paid) return json({ unpaid: true, email: sb.email, expired: sb.expired, paidUntil: sb.paidUntil, noProfile: !sb.profile }, 402);
      let user = this.sql.exec('SELECT * FROM users WHERE sb_id = ?', sb.id).toArray()[0];
      if (!user) {
        if (body.link && typeof body.link.username === 'string' && typeof body.link.password === 'string') {
          // bring an old game account (and its progress) over to this email
          const old = this._byName(body.link.username);
          const ok = old && !old.sb_id && sameString(await hashPassword(body.link.password, old.salt), old.pass_hash);
          if (!ok) return err('Wrong player name or password (or that account is already linked to an email)', 401);
          this.sql.exec('UPDATE users SET sb_id = ? WHERE id = ?', sb.id, old.id);
        } else if (typeof body.username === 'string') {
          const username = body.username;
          if (!USERNAME.test(username)) return err('Player name must be 3-40 letters, numbers or _');
          if (nameBlocked(username, this._words())) return err("That player name isn't allowed");
          if (this._byName(username)) return err('That player name is taken', 409);
          const salt = randomHex(16);
          const now = Date.now();
          this.sql.exec('INSERT INTO users (username, pass_hash, salt, created, last_seen, sb_id) VALUES (?, ?, ?, ?, ?, ?)', username, await hashPassword(randomHex(32), salt), salt, now, now, sb.id);
        } else return json({ needName: true, email: sb.email });
        user = this.sql.exec('SELECT * FROM users WHERE sb_id = ?', sb.id).toArray()[0];
      }
      if (user.banned) return json({ error: 'This account has been banned', banned: true }, 403);
      this.sql.exec('UPDATE users SET paid = 1, paid_until = ?, last_seen = ?, last_ip = ? WHERE id = ?', sb.paidUntil, Date.now(), ip, user.id);
      user = this.sql.exec('SELECT * FROM users WHERE id = ?', user.id).toArray()[0];
      return json({ token: await this._session(user), user: { ...this._publicUser(user, true), email: sb.email, paidUntil: sb.paidUntil } });
    }

    if (path === '/register' && method === 'POST') {
      if (this.paywall) return err('Sign up with your email instead', 403);
      const { username, password } = body;
      if (typeof username !== 'string' || !USERNAME.test(username)) return err('Username must be 3-40 letters, numbers or _');
      if (nameBlocked(username, this._words())) return err("That username isn't allowed");
      if (this._ipBanned(ip)) return err('You have been banned', 403);
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) return err('Password must be at least 6 characters');
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
      if (this.paywall) return err('Log in with your email instead', 403);
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
      if (user.banned) return json({ error: 'This account has been banned', banned: true }, 403);
      this.sql.exec('UPDATE users SET last_seen = ?, last_ip = ? WHERE id = ?', Date.now(), ip, user.id);
      return json({ token: await this._session(user), user: this._publicUser(user, true) });
    }

    // guests (no account) check in now and then with a random id from their browser, so admins can count them
    if (path === '/guest/ping' && method === 'POST') {
      const id = typeof body.id === 'string' && /^[a-f0-9]{16,32}$/.test(body.id) ? body.id : null;
      if (!id) return err('Bad id');
      const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      const now = Date.now();
      this.sql.exec(
        `INSERT INTO guests (id, level, best_wave, games, first_seen, last_seen, ip) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET level = excluded.level, best_wave = excluded.best_wave, games = excluded.games, last_seen = excluded.last_seen, ip = excluded.ip`,
        id, levelFromXp(int(body.xp, 1e8)), int(body.bestWave, 300), int(body.games, 1e6), now, now, ip
      );
      return json({ ok: true });
    }

    // the Updates tab: admins' edits on top of the built-in list (anyone can read them)
    if (path === '/updates' && method === 'GET') return json(this._updates());

    // quick play: an open room with space, busiest first (or none: the game makes a new open room)
    if (path === '/quickplay' && method === 'GET') {
      const now = Date.now();
      // ?mode=event: an event room; otherwise any room that isn't one
      const want = url.searchParams.get('mode') === 'event' ? 'event' : null;
      const list = [...this.rooms.values()].filter((r) => r.open && r.players < MAX_PLAYERS && now - r.at < 90000 && r.phase !== 'ended' && (want ? r.mode === want : r.mode !== 'event'));
      list.sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.players - a.players);
      return json({ code: list[0]?.code || null });
    }
    // the server list: every public room (private ones only by code), busiest first
    if (path === '/rooms' && method === 'GET') {
      const now = Date.now();
      const list = [...this.rooms.values()]
        .filter((r) => r.open && r.mode !== 'event' && r.players > 0 && r.phase !== 'ended' && now - r.at < 90000)
        .sort((a, b) => b.players - a.players)
        .slice(0, 30)
        .map((r) => ({ code: r.code, host: r.host, mode: r.mode, map: r.map, players: r.players, playing: r.phase === 'playing' }));
      return json({ rooms: list, max: MAX_PLAYERS });
    }
    // the weekly challenge board
    if (path === '/weekly' && method === 'GET') {
      const week = weekNumber();
      const rows = this.sql.exec('SELECT w.wave, w.score, u.* FROM weekly w JOIN users u ON u.id = w.user WHERE w.week = ? AND u.banned = 0 ORDER BY w.wave DESC, w.score DESC LIMIT 25', week).toArray();
      return json({ week, players: rows.map((r) => ({ ...this._publicUser(r), weekly: { wave: r.wave, score: r.score } })) });
    }

    if (path === '/leaderboard' && method === 'GET') {
      const rows = this.sql.exec('SELECT * FROM users WHERE banned = 0 ORDER BY best_wave DESC, best_score DESC LIMIT 25').toArray();
      const live = this.sql.exec('SELECT * FROM users WHERE banned = 0 AND live_at > ? ORDER BY live_wave DESC, live_score DESC LIMIT 15', Date.now() - LIVE_MS).toArray();
      return json({ players: rows.map((u) => this._publicUser(u)), live: live.map((u) => this._publicUser(u)) });
    }

    // Everything below needs a logged-in user.
    const me = await this._auth(request);
    if (!me) return err('Not logged in', 401);
    if (me.banned) {
      this.sql.exec('DELETE FROM sessions WHERE user_id = ?', me.id);
      return json({ error: 'This account has been banned', banned: true }, 403);
    }
    if (me.last_ip !== ip && ip !== 'local') this.sql.exec('UPDATE users SET last_ip = ? WHERE id = ?', ip, me.id);

    if (path === '/me' && method === 'GET') return json({ user: this._publicUser(me, true) });

    if (path === '/logout' && method === 'POST') {
      const m = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '');
      if (m) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(m[1]));
      return json({ ok: true });
    }

    if (path === '/profile' && method === 'PUT') {
      const profile = cleanProfile(body.profile, me.admin ? 999 : levelFromXp(me.xp), this._items(me));
      this.sql.exec('UPDATE users SET profile = ? WHERE id = ?', JSON.stringify(profile), me.id);
      return json({ user: this._publicUser({ ...me, profile: JSON.stringify(profile) }, true) });
    }

    if (path === '/weekly' && method === 'POST') {
      const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      const week = weekNumber();
      const wave = int(body.wave, 300);
      const score = int(body.score, 2000000);
      this.sql.exec(
        `INSERT INTO weekly (week, user, wave, score, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (week, user) DO UPDATE SET wave = MAX(wave, excluded.wave), score = CASE WHEN excluded.wave > wave OR (excluded.wave = wave AND excluded.score > score) THEN excluded.score ELSE score END, at = excluded.at`,
        week, me.id, wave, score, Date.now()
      );
      return json({ ok: true });
    }
    // achievements unlock in the game; the server keeps the list (badges on your profile)
    if (path === '/achievements' && method === 'POST') {
      const have = new Set(this._badges(me));
      for (const id of Array.isArray(body.ids) ? body.ids : []) if (ACHIEVEMENT_IDS.includes(id)) have.add(id);
      this.sql.exec('UPDATE users SET achievements = ? WHERE id = ?', JSON.stringify([...have]), me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true) });
    }

    // Live leaderboard: the wave you're on, sent while you play. Raises your best wave and score
    // straight away (XP and coins still come at the end of the run).
    if (path === '/live' && method === 'POST') {
      const now = Date.now();
      if (now - (me.live_at || 0) < 4000) return err('Slow down', 429);
      if (body.end) {
        this.sql.exec('UPDATE users SET live_at = 0 WHERE id = ?', me.id);
        return json({ ok: true });
      }
      const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      const wave = int(body.wave, 300);
      const score = int(body.score, 2000000);
      this.sql.exec(
        'UPDATE users SET live_wave = ?, live_score = ?, live_at = ?, best_wave = MAX(best_wave, ?), best_score = MAX(best_score, ?), last_seen = ? WHERE id = ?',
        wave, score, now, wave, score, now, me.id
      );
      return json({ ok: true });
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
      const coins = coinsForRun({ mode: pvp ? 'pvp' : 'solo', wave, kills, headshots, won: !!won });
      // the wolf's kills level it up
      const petKills = Math.min(kills, int(body.petKills, 300));
      const items = this._items(me);
      if (petKills && items[PET_ITEM]) {
        addPetXp(items, petKills);
        this.sql.exec('UPDATE users SET items = ? WHERE id = ?', JSON.stringify(items), me.id);
      }
      this.sql.exec(
        `UPDATE users SET live_at = 0, xp = xp + ?, coins = coins + ?, games = games + 1, kills = kills + ?, headshots = headshots + ?,
          best_wave = MAX(best_wave, ?), best_score = MAX(best_score, ?), pvp_kills = pvp_kills + ?, pvp_wins = pvp_wins + ?, last_progress = ?
         WHERE id = ?`,
        xp, coins, pvp ? 0 : kills, headshots, pvp ? 0 : wave, pvp ? 0 : score, pvp ? kills : 0, won, now, me.id
      );
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true), gained: xp, coins, levelBefore: levelFromXp(me.xp) });
    }

    // Admin code: set as the ADMIN_CODE secret on the Worker. Never stored in the game's code.
    if (path === '/admin/claim' && method === 'POST') {
      const secret = this.env.ADMIN_CODE;
      if (!secret) return err('No admin code is set up on the server yet', 503);
      if (!this._limit(this.adminTries, me.id, 5, 600000)) return err('Too many tries, wait a few minutes', 429);
      // forgiving about capitals and spaces: "i am iron man" works too
      const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
      if (typeof body.code !== 'string' || !sameString(await sha256(norm(body.code)), await sha256(norm(secret)))) return err('Wrong code', 403);
      this.sql.exec('UPDATE users SET admin = 1 WHERE id = ?', me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true) });
    }
    if (path === '/admin/xp' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const xp = Math.max(0, Math.min(10000000, Math.floor(Number(body.xp) || 0)));
      this.sql.exec('UPDATE users SET xp = ? WHERE id = ?', xp, me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true) });
    }

    // ---- shop
    const saveItems = (items, coins) => {
      this.sql.exec('UPDATE users SET items = ?, coins = ? WHERE id = ?', JSON.stringify(items), coins, me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true) });
    };
    if (path === '/shop/buy' && method === 'POST') {
      const items = this._items(me);
      const price = typeof body.item === 'string' ? priceOf(body.item, items) : null;
      if (price === null) return err("That can't be bought");
      if ((me.coins || 0) < price) return err('Not enough coins');
      items[body.item] = (items[body.item] || 0) + 1;
      return saveItems(items, me.coins - price);
    }
    if (path === '/shop/use' && method === 'POST') {
      const items = this._items(me);
      const def = SHOP.find((s) => s.id === body.item && s.kind === 'consumable');
      if (!def || !(items[def.id] > 0)) return err("You don't have that");
      items[def.id]--;
      return saveItems(items, me.coins);
    }
    if (path === '/shop/loadout' && method === 'POST') {
      const items = this._items(me);
      if (Array.isArray(body.quick)) {
        // your quick chat wheel
        items.quick = cleanQuick(body.quick);
        return saveItems(items, me.coins);
      }
      if (body.gun === null) delete items.loadout;
      else if (typeof body.gun === 'string' && items[`gun_${body.gun}`]) items.loadout = body.gun;
      else return err("You don't own that gun");
      return saveItems(items, me.coins);
    }
    // admin: gun mastery all unlocked (or wiped), today's quests finished (or reset)
    if (path === '/admin/mastery' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const m = { k: {}, s: {} };
      if (body.mode === 'max') for (const g of MASTERY_GUNS) m.k[g] = MASTERY_TIERS[MASTERY_TIERS.length - 1].kills;
      this.sql.exec('UPDATE users SET mastery = ? WHERE id = ?', JSON.stringify(cleanMastery(m)), me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ user: this._publicUser(user, true) });
    }
    if (path === '/admin/quests' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const day = dayNumber();
      const state = { day, p: {}, claimed: [] };
      if (body.mode === 'complete') for (const q of dailyQuests(day)) state.p[q.key] = q.goal;
      this.sql.exec('UPDATE users SET quests = ? WHERE id = ?', JSON.stringify(state), me.id);
      return json({ quests: questView(state) });
    }
    // admin: own every Shop gun (or none of them)
    if (path === '/admin/guns' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const items = this._items(me);
      for (const def of SHOP) if (def.kind === 'gun') {
        if (body.mode === 'all') items[def.id] = 1;
        else delete items[def.id];
      }
      if (body.mode !== 'all') delete items.loadout;
      return saveItems(items, me.coins);
    }
    if (path === '/admin/coins' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const coins = Math.max(0, Math.min(100000000, Math.floor(Number(body.coins) || 0)));
      return saveItems(this._items(me), coins);
    }
    // admin: everyone online on every server (or a name search), plus who's banned
    if (path === '/admin/players' && method === 'GET') {
      if (!me.admin) return err('Admins only', 403);
      const q = String(url.searchParams.get('q') || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
      const rows = q
        ? this.sql.exec("SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' ORDER BY last_seen DESC LIMIT 40", `${q.replace(/_/g, '\\_')}%`).toArray()
        : this.sql.exec('SELECT * FROM users ORDER BY (last_seen > ?) DESC, last_seen DESC LIMIT 300', Date.now() - ONLINE_MS).toArray();
      const banned = this.sql.exec('SELECT * FROM users WHERE banned = 1 OR timeout_until > ? ORDER BY username LIMIT 100', Date.now()).toArray();
      // guests (no account): everyone, or the ones whose room name / id matches
      const gq = q.toLowerCase();
      const guests = gq
        ? this.sql.exec("SELECT * FROM guests WHERE lower(name) LIKE ? OR id LIKE ? ORDER BY last_seen DESC LIMIT 40", `%${gq}%`, `${gq}%`).toArray()
        : this.sql.exec('SELECT * FROM guests ORDER BY (last_seen > ?) DESC, last_seen DESC LIMIT 300', Date.now() - ONLINE_MS).toArray();
      return json({ players: rows.map((u) => this._adminRow(u)), guests: guests.map((g) => this._guestRow(g)), banned: banned.map((u) => this._adminRow(u)) });
    }
    // admin: every account on the site (newest activity first), plus every guest browser
    if (path === '/admin/accounts' && method === 'GET') {
      if (!me.admin) return err('Admins only', 403);
      const q = String(url.searchParams.get('q') || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
      const page = Math.max(0, Math.min(1000, Number(url.searchParams.get('page')) | 0));
      const like = `${q.replace(/_/g, '\\_')}%`;
      const where = q ? "WHERE username LIKE ? ESCAPE '\\'" : '';
      const args = q ? [like] : [];
      const total = this.sql.exec(`SELECT COUNT(*) AS n FROM users ${where}`, ...args).one().n;
      const rows = this.sql.exec(`SELECT * FROM users ${where} ORDER BY last_seen DESC LIMIT 50 OFFSET ?`, ...args, page * 50).toArray();
      const guestTotal = this.sql.exec('SELECT COUNT(*) AS n FROM guests').one().n;
      const guests = q ? [] : this.sql.exec('SELECT * FROM guests ORDER BY last_seen DESC LIMIT 50 OFFSET ?', page * 50).toArray();
      const now = Date.now();
      return json({
        total,
        guestTotal,
        page,
        accounts: rows.map((u) => ({ ...this._adminRow(u), created: u.created, lastSeen: u.last_seen, bestWave: u.best_wave, games: u.games })),
        guests: guests.map((g) => ({ id: g.id.slice(0, 8), level: g.level, bestWave: g.best_wave, games: g.games, created: g.first_seen, lastSeen: g.last_seen, online: now - g.last_seen < ONLINE_MS })),
      });
    }
    // admin: everything about one account, and changing it (level, coins, name, stats)
    if (path === '/admin/manage' && method === 'GET') {
      if (!me.admin) return err('Admins only', 403);
      const u = this._byName(String(url.searchParams.get('u') || ''));
      if (!u) return err('No player with that name', 404);
      return json({ player: this._manageView(u) });
    }
    if (path === '/admin/manage' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const u = typeof body.username === 'string' ? this._byName(body.username) : null;
      if (!u) return err('No player with that name', 404);
      if (u.admin && u.id !== me.id) return err("You can't change another admin's account");
      const set = body.set && typeof body.set === 'object' ? body.set : {};
      const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      const cols = [];
      const vals = [];
      const put = (col, v) => {
        cols.push(`${col} = ?`);
        vals.push(v);
      };
      if (set.level !== undefined) put('xp', xpForLevel(Math.max(1, Math.min(200, int(set.level, 200)))));
      if (set.coins !== undefined) put('coins', int(set.coins, 1000000000));
      if (set.bestWave !== undefined) put('best_wave', int(set.bestWave, 300));
      if (set.bestScore !== undefined) put('best_score', int(set.bestScore, 100000000));
      if (set.kills !== undefined) put('kills', int(set.kills, 100000000));
      if (set.headshots !== undefined) put('headshots', int(set.headshots, 100000000));
      if (set.pvpKills !== undefined) put('pvp_kills', int(set.pvpKills, 100000000));
      if (set.pvpWins !== undefined) put('pvp_wins', int(set.pvpWins, 100000000));
      if (set.games !== undefined) put('games', int(set.games, 100000000));
      if (set.username !== undefined && set.username !== u.username) {
        const n = String(set.username);
        if (!USERNAME.test(n)) return err('Player names are 3-40 letters, numbers or _');
        const other = this._byName(n);
        if (other && other.id !== u.id) return err('That player name is taken');
        put('username', n);
      }
      if (set.reset) {
        // back to a fresh start (keeps the name, admin, bans and payment)
        for (const [c, v] of [['xp', 0], ['coins', 0], ['best_wave', 0], ['best_score', 0], ['kills', 0], ['headshots', 0], ['pvp_kills', 0], ['pvp_wins', 0], ['games', 0], ['items', '{}'], ['mastery', null], ['achievements', null]]) put(c, v);
      }
      if (!cols.length) return err('Nothing to change');
      this.sql.exec(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, ...vals, u.id);
      const after = this.sql.exec('SELECT * FROM users WHERE id = ?', u.id).toArray()[0];
      return json({ note: set.reset ? `${after.username} was reset to a fresh start.` : `Saved ${after.username}.`, player: this._manageView(after), user: after.id === me.id ? this._publicUser(after, true) : undefined });
    }
    if (path === '/admin/player' && method === 'POST' && typeof body.guest === 'string') {
      if (!me.admin) return err('Admins only', 403);
      const g = this.sql.exec('SELECT * FROM guests WHERE id = ?', body.guest).toArray()[0];
      if (!g) return err('No guest with that id', 404);
      const who = `${g.name || 'Guest'} #${g.id.slice(0, 6)}`;
      const target = { room: g.room, guest: g.id };
      const action = String(body.action);
      let note = '';
      if (action === 'kick') {
        note = (await this._kickFromRoom(target, `You were kicked by admin ${me.username}`)) ? `${who} was kicked from room ${g.room}.` : `${who} isn't in a room right now.`;
      } else if (action === 'timeout') {
        const minutes = Math.max(1, Math.min(10080, Math.floor(Number(body.minutes) || 5)));
        this.sql.exec('UPDATE guests SET timeout_until = ? WHERE id = ?', Date.now() + minutes * 60000, g.id);
        await this._kickFromRoom(target, `You were timed out for ${minutes} minute(s) by admin ${me.username}`);
        note = `${who} is timed out for ${minutes} minute(s): no online games.`;
      } else if (action === 'untimeout') {
        this.sql.exec('UPDATE guests SET timeout_until = 0 WHERE id = ?', g.id);
        note = `${who}'s timeout is over.`;
      } else if (action === 'ban') {
        // the guest id and their internet address: a new browser on the same connection is blocked too
        this.sql.exec('UPDATE guests SET banned = 1 WHERE id = ?', g.id);
        if (g.ip && g.ip !== 'local') this.sql.exec('INSERT OR REPLACE INTO ip_bans (ip, user, created) VALUES (?, 0, ?)', g.ip, Date.now());
        await this._kickFromRoom(target, 'You have been banned');
        note = `${who} is banned.`;
      } else if (action === 'unban') {
        this.sql.exec('UPDATE guests SET banned = 0, timeout_until = 0 WHERE id = ?', g.id);
        if (g.ip) this.sql.exec('DELETE FROM ip_bans WHERE ip = ? AND user = 0', g.ip);
        note = `${who} is unbanned.`;
      } else return err("Guests don't have coins or accounts");
      const after = this.sql.exec('SELECT * FROM guests WHERE id = ?', g.id).toArray()[0];
      return json({ note, player: this._guestRow(after) });
    }
    if (path === '/admin/player' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const u = typeof body.username === 'string' ? this._byName(body.username) : null;
      if (!u) return err('No player with that name', 404);
      const action = String(body.action);
      if (u.id === me.id && !['give', 'wolf', 'wolflevel', 'resetlook', 'pieces', 'gear'].includes(action)) return err("You can't do that to yourself");
      if (u.admin && ['kick', 'timeout', 'ban'].includes(action)) return err("Admins can't be kicked, timed out or banned");
      let note = '';
      if (action === 'kick') {
        note = (await this._kickFromRoom(u, `You were kicked by admin ${me.username}`)) ? `${u.username} was kicked from room ${u.room}.` : `${u.username} isn't in a room right now.`;
      } else if (action === 'timeout') {
        const minutes = Math.max(1, Math.min(10080, Math.floor(Number(body.minutes) || 5)));
        this.sql.exec('UPDATE users SET timeout_until = ? WHERE id = ?', Date.now() + minutes * 60000, u.id);
        await this._kickFromRoom(u, `You were timed out for ${minutes} minute(s) by admin ${me.username}`);
        note = `${u.username} is timed out for ${minutes} minute(s): no online games or chat.`;
      } else if (action === 'untimeout') {
        this.sql.exec('UPDATE users SET timeout_until = 0 WHERE id = ?', u.id);
        note = `${u.username}'s timeout is over.`;
      } else if (action === 'ban') {
        this.sql.exec('UPDATE users SET banned = 1 WHERE id = ?', u.id);
        this.sql.exec('DELETE FROM sessions WHERE user_id = ?', u.id);
        if (u.last_ip && u.last_ip !== 'local') this.sql.exec('INSERT OR REPLACE INTO ip_bans (ip, user, created) VALUES (?, ?, ?)', u.last_ip, u.id, Date.now());
        await this._kickFromRoom(u, 'You have been banned');
        note = `${u.username} is banned.`;
      } else if (action === 'unban') {
        this.sql.exec('UPDATE users SET banned = 0, timeout_until = 0 WHERE id = ?', u.id);
        this.sql.exec('DELETE FROM ip_bans WHERE user = ?', u.id);
        note = `${u.username} is unbanned.`;
      } else if (action === 'give') {
        // give (or take, with a minus number) coins
        const amount = Math.max(-100000000, Math.min(100000000, Math.floor(Number(body.coins) || 0)));
        if (!amount) return err('How many coins?');
        const coins = Math.max(0, Math.min(1000000000, (u.coins || 0) + amount));
        this.sql.exec('UPDATE users SET coins = ? WHERE id = ?', coins, u.id);
        note = amount > 0 ? `Gave ${coins - (u.coins || 0)} coins to ${u.username} (they have ${coins}).` : `Took ${(u.coins || 0) - coins} coins from ${u.username} (they have ${coins}).`;
      } else if (action === 'wolf') {
        // they paid the owner for the wolf companion (or it's taken back)
        const items = this._items(u);
        if (body.on) items[PET_ITEM] = 1;
        else delete items[PET_ITEM];
        // and it's out by their side straight away
        let profile = {};
        try {
          profile = JSON.parse(u.profile || '{}') || {};
        } catch {
          /* a broken profile starts fresh */
        }
        // out by their side straight away, or put away when it's taken
        profile.pet = body.on ? 'wolf' : 'none';
        this.sql.exec('UPDATE users SET items = ?, profile = ? WHERE id = ?', JSON.stringify(items), JSON.stringify(profile), u.id);
        note = body.on ? `${u.username} now owns the 🐺 wolf. They pick its colour in Profile.` : `Took the 🐺 wolf from ${u.username}.`;
      } else if (action === 'gear') {
        // special gear (tank, flamethrower, bazooka): only an admin can hand it out
        const g = SPECIAL_GEAR.find((x) => x.id === body.id);
        if (!g) return err('Unknown gear');
        const items = this._items(u);
        if (body.on) items[g.item] = 1;
        else delete items[g.item];
        this.sql.exec('UPDATE users SET items = ? WHERE id = ?', JSON.stringify(items), u.id);
        note = body.on ? `${u.username} has the ${g.icon} ${g.name}${g.id === 'tank' ? ' (H to drive it)' : ''}.` : `Took the ${g.icon} ${g.name} from ${u.username}.`;
      } else if (action === 'pieces') {
        // every character piece (they can wear any character), or none
        const items = this._items(u);
        for (const s of PIECE_SETS) for (let n = 0; n < 4; n++) {
          if (body.mode === 'all') items[pieceId(s.char, n)] = 1;
          else delete items[pieceId(s.char, n)];
        }
        this.sql.exec('UPDATE users SET items = ? WHERE id = ?', JSON.stringify(items), u.id);
        note = body.mode === 'all' ? `${u.username} has every character piece (${totalPieces(items)}).` : `${u.username}'s character pieces are gone.`;
      } else if (action === 'resetlook') {
        // their character back to the default look
        let profile = {};
        try {
          profile = JSON.parse(u.profile || '{}') || {};
        } catch {
          /* a broken profile starts fresh */
        }
        delete profile.look;
        this.sql.exec('UPDATE users SET profile = ? WHERE id = ?', JSON.stringify(profile), u.id);
        note = `${u.username}'s character is back to the default look.`;
      } else if (action === 'wolflevel') {
        // they paid for wolf levels (a minus number takes levels away)
        const items = this._items(u);
        if (!items[PET_ITEM]) return err(`${u.username} doesn't have the wolf yet: give it to them first`);
        const n = Math.max(-PET_MAX_LEVEL, Math.min(PET_MAX_LEVEL, Math.floor(Number(body.levels) || 0)));
        if (!n) return err('How many levels?');
        const before = petLevel(items);
        items.pet_lvl = Math.max(1, Math.min(PET_MAX_LEVEL, before + n));
        if (items.pet_lvl >= PET_MAX_LEVEL) items.pet_xp = 0;
        this.sql.exec('UPDATE users SET items = ? WHERE id = ?', JSON.stringify(items), u.id);
        note = items.pet_lvl === before ? `${u.username}'s wolf is already level ${before}.` : `${u.username}'s 🐺 wolf is now level ${items.pet_lvl}.`;
      } else return err('Unknown action');
      const after = this._byName(u.username);
      const user = after.id === me.id ? this._publicUser(after, true) : undefined;
      return json({ note, player: this._adminRow(after), user });
    }
    if (path === '/admin/wolf-price' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const price = String(body.price || '').trim().slice(0, 20);
      if (!price) return err('Type a price, like $2');
      const level = body.kind === 'level';
      this.sql.exec('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', level ? 'wolfLevelPrice' : 'wolfPrice', price);
      return json({ note: level ? `A wolf level now costs ${price}.` : `The wolf now costs ${price}.`, price });
    }
    // admin: deploy (or take back) a feature that was waiting for a big update
    if (path === '/admin/feature' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const id = String(body.id || '');
      if (!['view', 'adsOff'].includes(id)) return err('Unknown feature');
      const f = this._features();
      if (body.on) f[id] = true;
      else delete f[id];
      this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('features', ?)", JSON.stringify(f));
      return json({ features: f, note: body.on ? 'Deployed: everyone gets it within a minute (or when they reload).' : 'Hidden again: only admins have it.' });
    }
    // ---- events
    // which event room to join: the fullest one that still has space, or a brand new one when they're all full
    if (path === '/event/room' && method === 'POST') {
      const ev = this._event();
      if (!ev) return err('No event is on right now');
      const now = Date.now();
      ev.rooms = Array.isArray(ev.rooms) ? ev.rooms : ev.room ? [ev.room] : [];
      const full = new Set(Array.isArray(body.full) ? body.full.map(String) : []); // rooms that just turned this player away
      let best = null;
      let most = -1;
      for (const code of ev.rooms) {
        if (full.has(code)) continue;
        const r = this.rooms.get(code);
        // a room nobody's reported in a while is empty (the first one in opens it again)
        const players = r && now - r.at < 90000 ? r.players : 0;
        if (players < EVENT_MAX_PLAYERS && players > most) {
          best = code;
          most = players;
        }
      }
      if (!best) {
        best = makeRoomCode();
        ev.rooms.push(best);
        this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('event', ?)", JSON.stringify(ev));
      }
      return json({ code: best, rooms: ev.rooms.length });
    }
    // a puzzle piece picked up in an event match: the server picks which one
    if (path === '/event/piece' && method === 'POST') {
      const ev = this._event();
      if (!ev) return err('No event is on right now');
      const room = me.room ? this.rooms.get(me.room) : null;
      if (!room || room.mode !== 'event') return err('Pieces only come from event matches');
      const items = this._items(me);
      const now = Date.now();
      const got = items.ev_id === ev.id ? items.ev_n || 0 : 0;
      if (items.ev_id === ev.id && now - (items.ev_at || 0) < PIECE_COOLDOWN) return err('Too fast', 429);
      if (got >= PIECE_MAX) return err("You've found all the pieces you can this event");
      items.ev_id = ev.id;
      items.ev_n = got + 1;
      items.ev_at = now;
      const piece = rollPiece(items);
      let coins = me.coins || 0;
      if (piece) items[pieceId(piece.char, piece.n)] = 1;
      else coins += DUPLICATE_COINS; // every piece found already: coins instead
      this.sql.exec('UPDATE users SET items = ?, coins = ? WHERE id = ?', JSON.stringify(items), coins, me.id);
      ev.pieces = (ev.pieces || 0) + 1;
      this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('event', ?)", JSON.stringify(ev));
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ piece, coins: piece ? 0 : DUPLICATE_COINS, user: this._publicUser(user, true) });
    }
    // admin: host an event (every server: players join from the menu), or end it
    if (path === '/admin/event' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      if (body.action === 'stop') {
        const ev = this._event();
        this.sql.exec("DELETE FROM config WHERE key = 'event'");
        if (ev?.announced) this.sql.exec("DELETE FROM config WHERE key = 'announce'");
        return json({ note: ev ? `${ev.name} has ended.` : 'No event was on.', event: null });
      }
      if (body.action === 'start') {
        const name = String(body.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || DEFAULT_EVENT_NAME;
        const minutes = Math.max(0, Math.min(10080, Math.floor(Number(body.minutes) || 0)));
        const boost = DROP_BOOSTS.some(([v]) => v === Number(body.boost)) ? Number(body.boost) : 1;
        const now = Date.now();
        // one room for everyone: its code goes out with the event, and the first person in opens it
        const first = makeRoomCode();
        const theme = EVENT_THEMES.includes(body.theme) ? body.theme : null; // e.g. halloween: how every map looks while it's on
        const ev = { id: now, name, by: me.username, startedAt: now, endsAt: minutes ? now + minutes * 60000 : 0, boost, pieces: 0, announced: body.announce !== false, room: first, rooms: [first], theme };
        this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('event', ?)", JSON.stringify(ev));
        if (ev.announced) {
          // everyone gets told (until they press OK), on the menu or in a match
          const text = theme === 'halloween'
            ? `🎃 ${name} is LIVE! Every map has gone spooky. Go to Multiplayer and press JOIN EVENT: Red vs Blue vs the pumpkin-head zombies, with double puzzle-piece drops.`
            : `🎉 ${name} is LIVE! Go to Multiplayer and press JOIN EVENT: everyone's in one match, Red vs Blue vs the zombies, and kills drop puzzle pieces of new characters.`;
          const a = { id: now, text, from: me.username, at: now };
          this.sql.exec("INSERT INTO config (key, value) VALUES ('announce', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(a));
        }
        return json({ note: `${name} is live${minutes ? ` for ${minutes >= 60 ? `${minutes / 60} hour(s)` : `${minutes} minutes`}` : ' until you end it'}.`, event: ev });
      }
      // how it's going: event rooms and the players in them
      const rooms = [...this.rooms.values()].filter((r) => r.mode === 'event' && Date.now() - r.at < 90000);
      return json({ event: this._event(), rooms: rooms.length, players: rooms.reduce((n, r) => n + r.players, 0) });
    }
    // admin: every room on every server, private and event ones too
    if (path === '/admin/rooms' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const now = Date.now();
      const list = [...this.rooms.values()]
        .filter((r) => r.players > 0 && now - r.at < 90000)
        .sort((a, b) => b.players - a.players)
        .map((r) => ({ code: r.code, host: r.host, mode: r.mode, map: r.map, players: r.players, playing: r.phase === 'playing', open: r.open }));
      return json({ rooms: list });
    }
    // admin: an announcement every player sees (in any room, or on the menu) until they press OK
    if (path === '/admin/announce' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      if (body.action === 'clear') {
        this.sql.exec("DELETE FROM config WHERE key = 'announce'");
        return json({ ok: true, note: 'Announcement taken down.' });
      }
      const text = String(body.text || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, 300);
      if (!text) return err('Type a message first.');
      const prev = this._announce();
      if (prev && Date.now() - prev.at < 3000) return err('Wait a moment before announcing again.');
      const a = { id: Date.now(), text, from: me.username, at: Date.now() };
      this.sql.exec("INSERT INTO config (key, value) VALUES ('announce', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(a));
      return json({ ok: true, note: 'Announced to every player. They see it until they press OK.', announce: a });
    }
    // admin: edit, remove, bring back or add entries on the Updates tab
    if (path === '/admin/updates' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const u = this._updates();
      const v = String(body.v || '').slice(0, 40);
      const clean = (e) => ({
        title: String(e?.title || '').trim().slice(0, 120) || 'Update',
        date: String(e?.date || '').trim().slice(0, 40),
        items: (Array.isArray(e?.items) ? e.items : []).map((t) => String(t).trim().slice(0, 400)).filter(Boolean).slice(0, 30),
      });
      if (body.action === 'edit') {
        if (!v) return err('Which update?');
        const added = u.added.find((a) => a.v === v);
        if (added) Object.assign(added, clean(body.entry));
        else u.edits[v] = clean(body.entry);
      } else if (body.action === 'remove') {
        if (!u.hidden.includes(v)) u.hidden.push(v);
      } else if (body.action === 'restore') {
        u.hidden = u.hidden.filter((h) => h !== v);
        delete u.edits[v];
      } else if (body.action === 'add') {
        if (u.added.length >= 100) return err('Too many added updates');
        // list 'soon' = the Coming soon tab
        u.added.unshift({ v: `n${Date.now().toString(36)}`, ...clean(body.entry), ...(body.list === 'soon' ? { list: 'soon' } : {}) });
      } else if (body.action === 'delete') {
        // an update an admin added: gone for good
        u.added = u.added.filter((a) => a.v !== v);
      } else return err('Unknown action');
      this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('updates', ?)", JSON.stringify(u));
      return json(u);
    }
    // admin: the words nobody on any server can say
    if (path === '/admin/words' && method === 'GET') {
      if (!me.admin) return err('Admins only', 403);
      return json({ words: this._words() });
    }
    if (path === '/admin/words' && method === 'POST') {
      if (!me.admin) return err('Admins only', 403);
      const words = cleanWords(body.words);
      this.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('words', ?)", JSON.stringify(words));
      this.wordList = null;
      return json({ words: this._words() });
    }

    // Saved solo games: up to MAX_SAVES named slots, keyed by run id.
    if (path === '/saves' && method === 'GET') return json({ saves: Object.values(this._saves(me)) });
    if (path === '/saves' && method === 'PUT') {
      const save = body.save;
      if (!save || typeof save !== 'object' || Array.isArray(save)) return err('Bad save');
      if (typeof save.id !== 'string' || !/^[a-z0-9]{1,40}$/.test(save.id)) return err('Bad save id');
      save.name = cleanSaveName(save.name);
      const text = JSON.stringify(save);
      if (text.length > 6000) return err('Save too large', 413);
      const saves = this._saves(me);
      saves[save.id] = save;
      // full: the oldest one makes room
      const ids = Object.keys(saves).sort((a, b) => (saves[b].t || 0) - (saves[a].t || 0));
      for (const id of ids.slice(MAX_SAVES)) delete saves[id];
      this.sql.exec('UPDATE users SET saves = ? WHERE id = ?', JSON.stringify(saves), me.id);
      return json({ ok: true });
    }
    if (path === '/saves/delete' && method === 'POST') {
      const saves = this._saves(me);
      delete saves[String(body.id)];
      this.sql.exec('UPDATE users SET saves = ? WHERE id = ?', JSON.stringify(saves), me.id);
      return json({ ok: true });
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

    // ---- gun mastery
    if (path === '/mastery' && method === 'POST') {
      if (!this._limit(this.masteryReports, me.id, 4, 10000)) return err('Slow down a bit', 429);
      const m = addMasteryKills(this._mastery(me), body.kills);
      this.sql.exec('UPDATE users SET mastery = ? WHERE id = ?', JSON.stringify(m), me.id);
      return json({ mastery: m });
    }
    if (path === '/mastery/skin' && method === 'POST') {
      const m = chooseSkin(this._mastery(me), String(body.gun), Math.floor(Number(body.tier) || 0));
      if (!m) return err("You haven't unlocked that yet");
      this.sql.exec('UPDATE users SET mastery = ? WHERE id = ?', JSON.stringify(m), me.id);
      return json({ mastery: m });
    }

    // ---- parties: play together; when the leader goes into a room the others follow
    if (path === '/party' && method === 'GET') return json(this._partyView(me));
    if (path.startsWith('/party/') && method === 'POST') {
      const action = path.slice('/party/'.length);
      const mine = this._partyOf(me.id);
      if (action === 'invite') {
        const other = typeof body.username === 'string' ? this._byName(body.username) : null;
        if (!other || other.id === me.id) return err('No player with that name', 404);
        if (!this._areFriends(me.id, other.id)) return err('You can only invite friends');
        let party = mine;
        if (!party) {
          party = this.sql.exec('INSERT INTO parties (leader, updated) VALUES (?, ?) RETURNING id', me.id, Date.now()).one().id;
          this.sql.exec('INSERT INTO party_members (user, party) VALUES (?, ?)', me.id, party);
        }
        if (this._partyMembers(party).length >= PARTY_MAX) return err(`A party can have ${PARTY_MAX} players`);
        if (this._partyOf(other.id) === party) return err('Already in your party');
        this.sql.exec('INSERT OR REPLACE INTO party_invites (party, user, created) VALUES (?, ?, ?)', party, other.id, Date.now());
        return json(this._partyView(me));
      }
      if (action === 'accept') {
        const party = Number(body.party);
        const inv = this.sql.exec('SELECT * FROM party_invites WHERE party = ? AND user = ?', party, me.id).toArray()[0];
        if (!inv || !this.sql.exec('SELECT id FROM parties WHERE id = ?', party).toArray()[0]) return err('That invite has expired');
        if (this._partyMembers(party).length >= PARTY_MAX) return err('That party is full');
        this._leaveParty(me.id);
        this.sql.exec('DELETE FROM party_invites WHERE user = ? AND party = ?', me.id, party);
        this.sql.exec('INSERT INTO party_members (user, party) VALUES (?, ?)', me.id, party);
        return json(this._partyView(me));
      }
      if (action === 'decline') {
        this.sql.exec('DELETE FROM party_invites WHERE user = ? AND party = ?', me.id, Number(body.party));
        return json(this._partyView(me));
      }
      if (action === 'leave') {
        this._leaveParty(me.id);
        return json(this._partyView(me));
      }
      if (action === 'kick') {
        const other = typeof body.username === 'string' ? this._byName(body.username) : null;
        const leader = mine && this.sql.exec('SELECT leader FROM parties WHERE id = ?', mine).one().leader;
        if (!other || leader !== me.id || this._partyOf(other.id) !== mine) return err("You can't do that");
        this._leaveParty(other.id);
        return json(this._partyView(me));
      }
      if (action === 'room') {
        // the leader tells the party which room to be in (or none)
        const leader = mine && this.sql.exec('SELECT leader FROM parties WHERE id = ?', mine).one().leader;
        if (leader !== me.id) return json(this._partyView(me));
        const code = typeof body.code === 'string' && /^[A-Z0-9]{5}$/.test(body.code) ? body.code : null;
        this.sql.exec('UPDATE parties SET room = ?, updated = ? WHERE id = ?', code, Date.now(), mine);
        return json(this._partyView(me));
      }
    }

    // ---- daily quests
    if (path === '/quests' && method === 'GET') return json({ quests: questView(this._quests(me)), day: dayNumber() });
    if (path === '/quests/progress' && method === 'POST') {
      if (!this._limit(this.questReports, me.id, 4, 10000)) return err('Slow down a bit', 429);
      const state = addProgress(this._quests(me), body.delta);
      this.sql.exec('UPDATE users SET quests = ? WHERE id = ?', JSON.stringify(state), me.id);
      return json({ quests: questView(state), day: state.day });
    }
    if (path === '/quests/claim' && method === 'POST') {
      const r = claimQuest(this._quests(me), String(body.id));
      if (r.error) return err(r.error);
      this.sql.exec('UPDATE users SET quests = ?, coins = coins + ? WHERE id = ?', JSON.stringify(r.state), r.reward, me.id);
      const user = this.sql.exec('SELECT * FROM users WHERE id = ?', me.id).toArray()[0];
      return json({ quests: questView(r.state), day: r.state.day, reward: r.reward, user: this._publicUser(user, true) });
    }

    // ---- chat with friends (outside of games too). The game polls for new messages.
    if (path === '/messages/unread' && method === 'GET') {
      const rows = this.sql
        .exec('SELECT u.username, COUNT(*) AS n FROM messages m JOIN users u ON u.id = m.sender WHERE m.recipient = ? AND m.seen = 0 GROUP BY m.sender', me.id)
        .toArray();
      const unread = {};
      for (const r of rows) unread[r.username] = r.n;
      // friend requests waiting for you (for the pop-up)
      const requests = this.sql
        .exec("SELECT u.username FROM friends f JOIN users u ON u.id = f.a WHERE f.b = ? AND f.status = 'pending' ORDER BY f.created DESC LIMIT 20", me.id)
        .toArray()
        .map((r) => r.username);
      const t = me.timeout_until > Date.now() ? Math.ceil((me.timeout_until - Date.now()) / 60000) : 0;
      // group chats an admin put you in: new messages since you last looked
      const groupUnread = this.sql
        .exec('SELECT COUNT(*) AS n FROM group_messages g JOIN chat_members c ON c.grp = g.grp WHERE c.user = ? AND g.id > c.last_read AND g.sender != ?', me.id, me.id)
        .one().n;
      return json({ unread, requests, timeoutMins: t, groupUnread, announce: this._announce(), event: this._event(), features: this._features() });
    }
    if (path === '/messages' && (method === 'GET' || method === 'POST')) {
      const name = method === 'GET' ? url.searchParams.get('with') : body.to;
      const other = typeof name === 'string' ? this._byName(name) : null;
      if (!other) return err('No player with that name', 404);
      if (!this._areFriends(me.id, other.id)) return err('You can only chat with friends', 403);
      if (method === 'POST') {
        const timedOut = this._blocked(me, null);
        if (timedOut) return err(timedOut, 403);
        const text = typeof body.text === 'string' ? this._filter(body.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300)) : '';
        if (!text) return err('Say something');
        if (!this._limit(this.dms, me.id, 20, 30000)) return err('Slow down a bit', 429);
        this.sql.exec('INSERT INTO messages (sender, recipient, text, created) VALUES (?, ?, ?, ?)', me.id, other.id, text, Date.now());
        // keep the last 200 messages between two friends
        const cut = this.sql
          .exec(
            'SELECT id FROM messages WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) ORDER BY id DESC LIMIT 1 OFFSET 200',
            me.id, other.id, other.id, me.id
          )
          .toArray()[0];
        if (cut) this.sql.exec('DELETE FROM messages WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)) AND id <= ?', me.id, other.id, other.id, me.id, cut.id);
      }
      const after = Math.max(0, Number(url.searchParams.get('after') ?? body.after) || 0);
      const rows = this.sql
        .exec(
          `SELECT * FROM (SELECT id, sender, text, created FROM messages
             WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)) AND id > ? ORDER BY id DESC LIMIT 60) ORDER BY id`,
          me.id, other.id, other.id, me.id, after
        )
        .toArray();
      this.sql.exec('UPDATE messages SET seen = 1 WHERE sender = ? AND recipient = ? AND seen = 0', other.id, me.id);
      const messages = rows.map((r) => ({ id: r.id, from: r.sender === me.id ? me.username : other.username, mine: r.sender === me.id, text: r.text, t: r.created }));
      return json({ messages, online: Date.now() - (other.last_seen || 0) < ONLINE_MS });
    }

    // ---- group chats: admins make them and pick who's in; everyone in one can read and talk
    if (path === '/groups' && method === 'GET') {
      const groups = this.sql
        .exec(
          `SELECT g.id, g.name, g.owner, c.last_read,
             (SELECT COUNT(*) FROM group_messages m WHERE m.grp = g.id AND m.id > c.last_read AND m.sender != ?) AS unread
           FROM chat_groups g JOIN chat_members c ON c.grp = g.id WHERE c.user = ? ORDER BY g.id DESC`,
          me.id, me.id
        )
        .toArray();
      return json({
        groups: groups.map((g) => ({
          id: g.id, name: g.name, unread: g.unread,
          members: this.sql.exec('SELECT u.username FROM chat_members c JOIN users u ON u.id = c.user WHERE c.grp = ? ORDER BY u.username', g.id).toArray().map((r) => r.username),
        })),
      });
    }
    const gm = /^\/groups\/(\d+)\/messages$/.exec(path);
    if (gm && (method === 'GET' || method === 'POST')) {
      const grp = Number(gm[1]);
      if (!this.sql.exec('SELECT 1 FROM chat_members WHERE grp = ? AND user = ?', grp, me.id).toArray()[0]) return err("You're not in that group", 403);
      if (method === 'POST') {
        const timedOut = this._blocked(me, null);
        if (timedOut) return err(timedOut, 403);
        const text = typeof body.text === 'string' ? this._filter(body.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300)) : '';
        if (!text) return err('Say something');
        if (!this._limit(this.dms, me.id, 20, 30000)) return err('Slow down a bit', 429);
        this.sql.exec('INSERT INTO group_messages (grp, sender, text, created) VALUES (?, ?, ?, ?)', grp, me.id, text, Date.now());
        // keep the last 300 messages in a group
        const cut = this.sql.exec('SELECT id FROM group_messages WHERE grp = ? ORDER BY id DESC LIMIT 1 OFFSET 300', grp).toArray()[0];
        if (cut) this.sql.exec('DELETE FROM group_messages WHERE grp = ? AND id <= ?', grp, cut.id);
      }
      const after = Math.max(0, Number(url.searchParams.get('after') ?? body.after) || 0);
      const rows = this.sql
        .exec(
          'SELECT * FROM (SELECT m.id, m.sender, m.text, m.created, u.username, u.admin FROM group_messages m LEFT JOIN users u ON u.id = m.sender WHERE m.grp = ? AND m.id > ? ORDER BY m.id DESC LIMIT 80) ORDER BY id',
          grp, after
        )
        .toArray();
      const top = this.sql.exec('SELECT MAX(id) AS n FROM group_messages WHERE grp = ?', grp).one().n || 0;
      this.sql.exec('UPDATE chat_members SET last_read = ? WHERE grp = ? AND user = ?', top, grp, me.id);
      return json({ messages: rows.map((r) => ({ id: r.id, from: r.username || '(gone)', admin: !!r.admin, mine: r.sender === me.id, text: r.text, t: r.created })) });
    }
    if (path === '/admin/groups' && method === 'POST') {
      if (!me.admin) return err('Only admins can make and change group chats', 403);
      const grp = Number(body.id) || 0;
      const g = grp ? this.sql.exec('SELECT * FROM chat_groups WHERE id = ?', grp).toArray()[0] : null;
      const addNames = (names) => {
        const missing = [];
        for (const n of (Array.isArray(names) ? names : String(names || '').split(/[\s,]+/)).filter(Boolean).slice(0, 50)) {
          const u = this._byName(n);
          if (!u) missing.push(n);
          else this.sql.exec('INSERT OR IGNORE INTO chat_members (grp, user, last_read) VALUES (?, ?, 0)', g ? g.id : newId, u.id);
        }
        return missing;
      };
      let newId = 0;
      let note = '';
      if (body.action === 'create') {
        const name = String(body.name || '').trim().slice(0, 40) || 'Group chat';
        newId = this.sql.exec('INSERT INTO chat_groups (name, owner, created) VALUES (?, ?, ?) RETURNING id', name, me.id, Date.now()).one().id;
        this.sql.exec('INSERT INTO chat_members (grp, user, last_read) VALUES (?, ?, 0)', newId, me.id);
        const missing = addNames(body.members);
        note = `Made "${name}".${missing.length ? ` No player called: ${missing.join(', ')}.` : ''}`;
      } else {
        if (!g) return err('No such group', 404);
        if (body.action === 'add') {
          const missing = addNames(body.members);
          note = missing.length ? `No player called: ${missing.join(', ')}.` : 'Added.';
        } else if (body.action === 'remove') {
          const u = this._byName(String(body.username || ''));
          if (u) this.sql.exec('DELETE FROM chat_members WHERE grp = ? AND user = ?', g.id, u.id);
          note = 'Removed.';
        } else if (body.action === 'rename') {
          this.sql.exec('UPDATE chat_groups SET name = ? WHERE id = ?', String(body.name || '').trim().slice(0, 40) || g.name, g.id);
          note = 'Renamed.';
        } else if (body.action === 'delete') {
          this.sql.exec('DELETE FROM group_messages WHERE grp = ?', g.id);
          this.sql.exec('DELETE FROM chat_members WHERE grp = ?', g.id);
          this.sql.exec('DELETE FROM chat_groups WHERE id = ?', g.id);
          note = 'Group deleted.';
        } else return err('Unknown action');
      }
      return json({ ok: true, note, id: newId || grp });
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
        this.sql.exec('DELETE FROM messages WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)', me.id, other.id, other.id, me.id);
        return json({ ok: true });
      }
    }

    return err('Not found', 404);
  }
}

// ---------------------------------------------------------------- multiplayer rooms
const TEAMS = ['red', 'blue'];
const SPAWN_SHIELD_MS = 4000; // multiplayer spawn force field
const MAX_HIT = 520; // biggest single hit (sniper headshot) with a little slack
const NAME = /^[A-Za-z0-9_ ]{1,40}$/;
// AI bots: fill empty spots in PvP matches (the host's game moves them; the server keeps score as usual)
const BOT_FILLS = [0, 1, 2, 3, 4, 5, 6, 7]; // how many bots the host can add
const BOT_NAMES = ['Viper', 'Rex', 'Ghost', 'Blaze', 'Nova', 'Tank', 'Raven', 'Spike', 'Echo', 'Fang', 'Jinx', 'Bolt', 'Shade', 'Duke'];
const BOT_LOOKS = [['🤖', '#7fd4ff'], ['👾', '#ff8a5c'], ['💀', '#d9d9d9'], ['🦾', '#c9ff5d'], ['🎯', '#ff5d8f'], ['🛰️', '#b48cff']];
// bots play every mode except the admin's event (everyone joins that one room)
const botsAllowed = (mode) => !!MODES[mode] && !MODES[mode].event;
const NOWS = { send() {}, close() {} };

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.nextId = 1;
    this.hostId = 0;
    this.mode = 'tdm';
    this.map = MP_MAPS[0];
    this.phase = 'lobby'; // lobby | playing | ended
    this.match = null;
    this.interval = null;
    this.settings = {}; // mode -> the host's custom match settings
    this.botFill = 0; // how many AI bots play in the match (they give up their spot when the room fills with people)
    this.wordRe = null; // blocked words (from the database)
    this.wordList = [];
    this.wordsAt = 0;
  }

  get _db() {
    return this.env.DB.get(this.env.DB.idFromName('global'));
  }
  _setWords(words) {
    if (!Array.isArray(words)) return;
    this.wordList = words;
    this.wordRe = makeFilter(words);
    this.wordsAt = Date.now();
  }
  // the blocked words change rarely: check for a new list once a minute
  _freshWords() {
    if (Date.now() - this.wordsAt < 60000) return;
    this.wordsAt = Date.now();
    this._db
      .fetch('https://db/api/internal/words', { method: 'POST', headers: { 'x-internal': '1' }, body: '{}' })
      .then((r) => r.json())
      .then((d) => this._setWords(d.words))
      .catch(() => {});
  }
  get _set() {
    return cleanSettings(this.mode, this.settings[this.mode]);
  }

  async fetch(request) {
    const url = new URL(request.url);
    // an admin kicked, timed out or banned someone in this room
    if (url.pathname === '/internal/kick' && request.headers.get('x-internal') === '1') {
      const { username, guest, msg } = await request.json();
      const t = [...this.players.values()].find((o) => o.joined && (guest ? o.guestId === guest : o.username && o.username.toLowerCase() === String(username).toLowerCase()));
      if (t) {
        this._send(t, { t: 'error', msg: String(msg || 'You were kicked by an admin').slice(0, 120) });
        try {
          t.ws.close(1000, 'kicked');
        } catch {
          /* already closed */
        }
        this._onClose(t);
        this._broadcast({ t: 'msg', text: `${t.name} was removed by an admin` });
      }
      return Response.json({ kicked: !!t });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a websocket', { status: 426 });
    this.code = url.pathname.split('/')[3];
    const create = url.searchParams.get('create') === '1';
    // the event room: no host, open to everyone, and bigger than a normal room
    if (create && url.searchParams.get('event') === '1' && this._humans().length === 0) {
      this.mode = 'event';
      this.open = true;
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const fail = (msg) => {
      server.send(JSON.stringify({ t: 'error', msg }));
      server.close(1000, msg);
      return new Response(null, { status: 101, webSocket: client });
    };
    const humans = this._humans().length + [...this.players.values()].filter((o) => !o.bot && !o.joined).length;
    if (create && humans > 0) return fail('taken');
    if (!create && humans === 0) return fail('Room not found. Check the code.');
    if (humans >= (this.mode === 'event' ? EVENT_MAX_PLAYERS : MAX_PLAYERS)) return fail('Room is full');

    const p = {
      id: this.nextId++, ws: server, joined: false, name: 'Player', avatar: '🧟', color: '#e9d9b8', account: false,
      team: 'red', alive: false, hp: MAX_HP, pos: [0, 0, 0], rot: [0, 0], gun: 'rifle', flags: 0,
      kills: 0, deaths: 0, score: 0, respawnAt: 0, protectUntil: 0, hits: [0, 0], msgs: [0, 0], level: 0,
      ip: request.headers.get('cf-connecting-ip') || 'local', username: null,
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
    this._report();
    return {
      t: 'lobby', code: this.code, mode: this.mode, map: this.map, phase: this.phase, host: this.hostId, settings: this._set, open: !!this.open, bots: this.botFill,
      players: [...this.players.values()].filter((p) => p.joined).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, pet: p.pet || null, petSpot: p.petSpot, look: CHARACTERS_LIVE || MODES[this.mode]?.event ? p.look || null : null, petLvl: p.petLvl, team: p.team, account: p.account, admin: !!p.admin, bot: !!p.bot })),
    };
  }

  // real people (not bots)
  _humans() {
    return [...this.players.values()].filter((p) => p.joined && !p.bot);
  }
  // adds or removes bots so the match has botFill of them (PvP modes only), as long as there's room
  _fillBots() {
    const want = this.phase === 'playing' && botsAllowed(this.mode) ? Math.max(0, Math.min(this.botFill, MAX_PLAYERS - this._humans().length)) : 0;
    const bots = [...this.players.values()].filter((p) => p.bot);
    let changed = false;
    for (const b of bots.slice(want)) {
      this.players.delete(b.id);
      this._dropFlag(b);
      this._broadcast({ t: 'left', id: b.id });
      changed = true;
    }
    for (let i = bots.length; i < want; i++) {
      const used = new Set([...this.players.values()].map((o) => o.name));
      const name = `Bot ${BOT_NAMES.find((n) => !used.has(`Bot ${n}`)) || this.nextId}`;
      const [avatar, color] = BOT_LOOKS[Math.floor(Math.random() * BOT_LOOKS.length)];
      const counts = this._teamCounts();
      const b = {
        id: this.nextId++, ws: NOWS, bot: true, joined: true, name, avatar, color, look: CHARACTERS_LIVE ? randomLook() : null, account: false, team: counts.red <= counts.blue ? 'red' : 'blue',
        alive: false, hp: MAX_HP, pos: [0, 0, 0], rot: [0, 0], gun: 'rifle', flags: 0, kills: 0, deaths: 0, score: 0, respawnAt: 0, protectUntil: 0,
        hits: [0, 0], msgs: [0, 0], level: 0, ip: 'bot', username: null,
      };
      // infection / hide and seek: a bot joining late is on the side everyone ends up on, before that a survivor
      if (MODES[this.mode].infection) b.team = this.match?.infected ? INFECTED : SURVIVORS;
      this.players.set(b.id, b);
      this._spawn(b);
      changed = true;
    }
    if (changed) this._broadcast(this._lobby());
  }
  _removeBots() {
    for (const b of [...this.players.values()].filter((p) => p.bot)) this.players.delete(b.id);
  }

  _teamCounts() {
    const c = { red: 0, blue: 0 };
    for (const p of this.players.values()) if (p.joined) c[p.team]++;
    return c;
  }

  async _onMessage(p, data) {
    // co-op hosts send zombie snapshots, so allow bigger messages (still capped)
    if (typeof data !== 'string' || data.length > 16384) return;
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
        // ask the database who this is, whether they're banned or timed out, and for the blocked words
        try {
          const res = await this._db.fetch('https://db/api/internal/join', {
            method: 'POST',
            headers: { 'x-internal': '1' },
            body: JSON.stringify({ token: typeof m.token === 'string' ? m.token : null, ip: p.ip, room: this.code, guest: typeof m.guest === 'string' ? m.guest : null, name }),
          });
          const r = await res.json();
          if (r.blocked) {
            this._send(p, { t: 'error', msg: r.blocked });
            try {
              p.ws.close(1000, 'blocked');
            } catch {
              /* already closed */
            }
            this.players.delete(p.id);
            return;
          }
          this._setWords(r.words);
          const user = r.user;
          if (!user && typeof m.guest === 'string' && /^[a-f0-9]{24}$/.test(m.guest)) p.guestId = m.guest;
          if (user) {
            name = user.username;
            p.username = user.username;
            p.account = true;
            p.admin = !!user.admin;
            p.avatar = user.profile.avatar;
            p.color = user.profile.color;
            p.pet = user.profile.pet === 'wolf' ? user.profile.petColor : null; // their wolf's colour
            p.petSpot = user.profile.petSpot;
            p.look = user.profile.look; // their character (shown once the creator launches, and in event matches)
            p.petLvl = petLevel(user.items || {});
            p.items = user.items || {};
          }
        } catch {
          /* couldn't check: treated as no account */
        }
        // no guests: you need an account to play online
        if (!p.account) {
          this._send(p, { t: 'error', msg: 'Log in (or make an account) to play.' });
          try {
            p.ws.close(1000, 'no account');
          } catch {
            /* already closed */
          }
          this.players.delete(p.id);
          return;
        }
        if (!p.account && nameBlocked(name, this.wordList)) name = `Guest${p.id}`;
        if (!p.account) {
          if (typeof m.avatar === 'string' && m.avatar.length <= 8) p.avatar = m.avatar;
          if (typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color)) p.color = m.color;
        }
        const taken = new Set([...this.players.values()].filter((o) => o.joined).map((o) => o.name.toLowerCase()));
        let unique = name;
        for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name}${i}`;
        p.name = unique.slice(0, 42);
        const counts = this._teamCounts();
        p.team = counts.red <= counts.blue ? 'red' : 'blue';
        // infection: late joiners are zombies once the infection has started
        if (MODES[this.mode].infection) p.team = this.phase === 'playing' && this.match?.infected ? INFECTED : SURVIVORS;
        p.level = 0;
        p.joined = true;
        if (!this.hostId || !this.players.get(this.hostId)?.joined) this.hostId = p.id;
        this._send(p, { t: 'welcome', id: p.id });
        this._broadcast(this._lobby());
        if (this.phase === 'playing') {
          this._send(p, this._matchStart());
          this._spawn(p);
          this._fillBots(); // a bot makes room for a real player
        } else if (this.mode === 'event' && this.phase === 'lobby') this._startMatch(); // events start as soon as someone's in
        this._broadcast({ t: 'msg', text: `${p.name} joined` }, p);
        break;
      }
      case 'mode':
        // nobody hosts the event room: it stays an event, and normal rooms can't become one
        if (this.mode === 'event' || MODES[m.mode]?.event) return;
        if (p.id === this.hostId && this.phase === 'lobby' && MODES[m.mode]) {
          this.mode = m.mode;
          if (MODES[m.mode].map) this.map = MODES[m.mode].map; // hide and seek: the map made for it (the host can still change it)
          this._broadcast(this._lobby());
        }
        break;
      case 'map':
        if (p.id === this.hostId && this.phase === 'lobby' && MP_MAPS.includes(m.map) && this.mode !== 'event') {
          this.map = m.map;
          this._broadcast(this._lobby());
        }
        break;
      case 'set': {
        // the host's custom settings for the current mode
        if (p.id !== this.hostId || this.phase !== 'lobby' || this.mode === 'event') return;
        const def = (MODE_SETTINGS[this.mode] || []).find((o) => o.key === m.key);
        if (!def || !def.options.some(([v]) => v === m.value)) return;
        this.settings[this.mode] = { ...this._set, [m.key]: m.value };
        this._broadcast(this._lobby());
        break;
      }
      case 'team':
        if (this.phase === 'lobby' && TEAMS.includes(m.team) && !MODES[this.mode].autoTeams && this.mode !== 'event') {
          p.team = m.team;
          this._broadcast(this._lobby());
        }
        break;
      case 'shield': {
        // force field: 8 seconds of no damage, every 45 seconds
        if (this.phase !== 'playing' || !p.alive || now - (p.lastShield || 0) < 44000) return;
        if ((MODES[this.mode].infection && p.team === INFECTED) || MODES[this.mode].hns) return; // no force fields in hide and seek
        p.lastShield = now;
        p.shieldUntil = now + 8000;
        const msg = JSON.stringify({ t: 'shield', id: p.id });
        for (const o of this.players.values()) if (o !== p && o.joined) o.ws.send(msg);
        break;
      }
      case 'cheat':
        // admin cheats the server has to apply: god mode and one-hit kills (only for that admin)
        if (!p.admin) return;
        p.god = !!m.god;
        p.onehit = !!m.onehit;
        break;
      case 'setteam': {
        // admins can put anyone on either team, in the lobby or mid-match
        const target = this.players.get(m.id);
        if (!p.admin || !target || !target.joined || !TEAMS.includes(m.team) || target.team === m.team) return;
        this._moveTeam(target, m.team);
        this._broadcast(this._lobby());
        this._broadcast({ t: 'msg', text: `${p.name} moved ${target.name} to ${m.team.toUpperCase()}`, team: m.team });
        break;
      }
      case 'teamops': {
        // admins: shuffle, balance or swap the teams
        if (!p.admin) return;
        const list = [...this.players.values()].filter((o) => o.joined);
        if (m.op === 'shuffle') {
          const order = list.sort(() => Math.random() - 0.5);
          order.forEach((o, i) => this._moveTeam(o, TEAMS[i % 2]));
        } else if (m.op === 'swap') {
          for (const o of list) this._moveTeam(o, o.team === 'red' ? 'blue' : 'red');
        } else if (m.op === 'balance') {
          const red = list.filter((o) => o.team === 'red');
          const blue = list.filter((o) => o.team === 'blue');
          const [big, small] = red.length > blue.length ? [red, 'blue'] : [blue, 'red'];
          for (let n = Math.floor(Math.abs(red.length - blue.length) / 2); n > 0; n--) this._moveTeam(big.pop(), small);
        } else return;
        this._broadcast(this._lobby());
        this._broadcast({ t: 'msg', text: `${p.name} ${m.op === 'shuffle' ? 'shuffled' : m.op === 'swap' ? 'swapped' : 'balanced'} the teams` });
        break;
      }
      case 'kick': {
        // the host (or an admin) can remove someone from the room
        const target = this.players.get(m.id);
        if (!target || target === p || !((p.id === this.hostId && this.mode !== 'event') || p.admin)) return;
        this._send(target, { t: 'error', msg: `You were removed from the room by ${p.name}` });
        try {
          target.ws.close(1000, 'kicked');
        } catch {
          /* already closed */
        }
        this._onClose(target);
        break;
      }
      case 'start':
        if (p.id === this.hostId && this.phase === 'lobby' && this.mode !== 'event') this._startMatch();
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
          this._dropSpawnShield(p);
          const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map((n) => Math.max(-600, Math.min(600, n))) : null);
          const o = vec(m.o);
          const e = vec(m.e);
          if (o && e) this._broadcast({ t: 'shot', id: p.id, o, e, g: p.gun }, p);
        }
        break;
      case 'hit':
        this._hit(p, m);
        break;
      case 'zhurt': {
        // event: a zombie got you (the host's game runs the zombies; your health is kept here)
        if (this.phase !== 'playing' || !MODES[this.mode].event || !p.alive) return;
        const dmg = Number(m.dmg);
        if (!Number.isFinite(dmg) || dmg <= 0 || dmg > 80) return;
        const now = Date.now();
        if (now - p.hits[1] > 1000) p.hits = [0, now];
        if (++p.hits[0] > 30) return;
        if (now < p.protectUntil || now < (p.shieldUntil || 0) || p.god) return;
        p.hp -= dmg * (p.flags & TANK_FLAG && p.items?.sp_tank ? TANK_ARMOUR : 1);
        p.lastHurt = now;
        this._send(p, { t: 'hurt', by: 0, dmg, from: p.pos, hp: Math.max(0, p.hp) });
        if (p.hp > 0) return;
        p.alive = false;
        p.deaths++;
        p.respawnAt = now + (this.match.set.respawn || RESPAWN_SECONDS) * 1000;
        this._broadcast({ t: 'kill', k: 0, v: p.id, head: false, g: 'zombie', mel: true });
        break;
      }
      case 'zkill': {
        // event: you took down a zombie: points for you and your team
        if (this.phase !== 'playing' || !MODES[this.mode].event) return;
        const now = Date.now();
        if (now - (p.zk?.[1] || 0) > 1000) p.zk = [0, now];
        if (++p.zk[0] > 12) return; // more than any gun (or explosion) can do
        const pts = EVENT_POINTS[m.kind] ? EVENT_POINTS[m.kind] : EVENT_POINTS.zombie;
        p.score += pts * 20;
        p.kills++;
        this.match.scores[p.team] = (this.match.scores[p.team] || 0) + pts;
        this._checkWin();
        break;
      }
      case 'heal': {
        // health packs on the map: at most one every 8 seconds, up to 50 HP
        if (this.phase !== 'playing' || !p.alive || this._coop) return;
        if (now - (p.lastHeal || 0) < 8000) return;
        const amount = Math.max(0, Math.min(50, Number(m.amount) || 0));
        p.lastHeal = now;
        p.hp = Math.min(this._maxHp(p), p.hp + amount);
        this._send(p, { t: 'healed', hp: p.hp });
        break;
      }
      case 'fx': {
        // effects other players should see (a grenade going off); nothing here does damage
        if (this.phase !== 'playing') return;
        // a red barrel on the map going off (chains can set off a few at once)
        if (m.k === 'barrel') {
          if (!Number.isInteger(m.id) || m.id < 0 || m.id > 999) return;
          if (now - (p.lastBarrel || 0) > 1000) p.barrels = 0;
          if (++p.barrels > 12) return;
          p.lastBarrel = now;
          const msg = JSON.stringify({ t: 'fx', k: 'barrel', id: m.id, by: p.id });
          for (const o of this.players.values()) if (o !== p && o.joined) o.ws.send(msg);
          return;
        }
        if (now - (p.lastFx || 0) < 200) return;
        if (m.k !== 'boom' || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
        p.lastFx = now;
        const msg = JSON.stringify({ t: 'fx', id: p.id, k: 'boom', p: m.p.map((v) => Math.max(-500, Math.min(500, v))) });
        for (const o of this.players.values()) if (o !== p && o.joined) o.ws.send(msg);
        break;
      }
      // ---- barricades and turrets
      case 'build': {
        if (this.phase !== 'playing' || !p.alive) return;
        const def = STRUCTURES[m.kind];
        if (!def || ![m.x, m.z, m.rot].every(Number.isFinite)) return;
        if (now - (p.lastBuild || 0) < 400) return;
        const all = this.match.structures;
        if (all.size >= MAX_STRUCTURES) return this._send(p, { t: 'msg', text: 'This room has too many things built' });
        if (Math.hypot(m.x - p.pos[0], m.z - p.pos[2]) > BUILD_REACH + 2 || Math.hypot(m.x, m.z) > 112) return;
        p.lastBuild = now;
        const st = { id: this.match.nextStructure++, kind: m.kind, owner: p.id, team: p.team, x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100, rot: m.rot % (Math.PI * 2), hp: def.hp };
        all.set(st.id, st);
        this._broadcast({ t: 'built', s: st });
        break;
      }
      case 'sdmg': {
        // co-op: the host's zombies (and blasts) wreck things; PvP: enemies shoot each other's stuff
        if (this.phase !== 'playing') return;
        const st = this.match.structures.get(m.id);
        const dmg = Number(m.dmg);
        if (!st || !Number.isFinite(dmg) || dmg <= 0 || dmg > MAX_HIT) return;
        if (this._coop) {
          if (p.id !== this.hostId) return;
        } else {
          if (st.owner === p.id || (MODES[this.mode].teams && st.team === p.team)) return;
          if (now - p.hits[1] > 1000) p.hits = [0, now];
          if (++p.hits[0] > 45) return;
        }
        st.hp -= dmg;
        if (st.hp <= 0) {
          this.match.structures.delete(st.id);
          this._broadcast({ t: 'sgone', id: st.id, by: p.id });
        } else this._broadcast({ t: 'shp', id: st.id, hp: Math.round(st.hp) });
        break;
      }
      case 'announce': {
        // admins: a big message on everyone's screen
        if (!p.admin || typeof m.text !== 'string' || now - (p.lastAnnounce || 0) < 2000) return;
        const text = m.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
        if (!text) return;
        p.lastAnnounce = now;
        this._broadcast({ t: 'announce', name: p.name, text });
        break;
      }
      // ---- supply drops
      case 'loot': {
        if (this.phase !== 'playing' || !p.alive) return;
        const d = this.match.drops.get(m.id);
        if (!d || now < d.landAt - 400) return;
        if (Math.hypot(p.pos[0] - d.x, p.pos[2] - d.z) > SUPPLY_REACH + 1.5) return;
        this.match.drops.delete(d.id);
        // zombie players get the health but can't use guns
        const gun = MODES[this.mode].infection && p.team === INFECTED ? null : d.gun;
        if (!this._coop) {
          p.hp = this._maxHp(p);
          this._send(p, { t: 'healed', hp: p.hp });
        }
        this._broadcast({ t: 'looted', id: d.id, by: p.id, gun });
        break;
      }
      case 'admindrop':
        // admins: a supply drop right next to you
        if (!p.admin || this.phase !== 'playing' || now - (p.lastDrop || 0) < 1500) return;
        p.lastDrop = now;
        this._spawnDrop([p.pos[0] + 3, p.pos[2] + 1]);
        break;
      case 'emote': {
        // quick chat wheel: cleaned like normal chat
        if (now - (p.lastEmote || 0) < 800 || typeof m.text !== 'string') return;
        this._freshWords();
        const text = filterText(cleanQuickText(m.text), this.wordRe);
        if (!text) return;
        p.lastEmote = now;
        this._broadcast({ t: 'emote', id: p.id, name: p.name, text });
        break;
      }
      case 'chat': {
        // room chat: short messages, max ~1 per 0.7s each
        if (typeof m.text !== 'string') return;
        this._freshWords();
        const text = filterText(m.text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120), this.wordRe);
        if (!text || now - (p.lastChat || 0) < 700) return;
        p.lastChat = now;
        this._broadcast({ t: 'chat', id: p.id, name: p.name, team: p.team, admin: !!p.admin, text });
        break;
      }
      // ---- co-op: the server just passes messages between the host and the others
      case 'relay': {
        if (this.phase !== 'playing' || !this._zombies || !m.d || typeof m.d !== 'object') return;
        const msg = JSON.stringify({ t: 'relay', from: p.id, d: m.d });
        if (msg.length > 16384) return;
        if (m.to === 'host') {
          const h = this.players.get(this.hostId);
          if (h && h !== p) h.ws.send(msg);
        } else if (m.to === 'all') {
          for (const o of this.players.values()) if (o !== p && o.joined) o.ws.send(msg);
        } else if (Number.isInteger(m.to)) {
          const o = this.players.get(m.to);
          if (o && o !== p) o.ws.send(msg);
        }
        break;
      }
      case 'down':
        if (this.phase !== 'playing' || !this._coop || !p.alive) return;
        p.alive = false;
        p.deaths++;
        this._broadcast({ t: 'msg', text: `${p.name} is down!` });
        if (![...this.players.values()].some((o) => o.joined && o.alive && !o.bot)) this._endCoop(); // bots don't keep a run going
        break;
      case 'revive': {
        // co-op: a squadmate held E next to you for long enough
        if (this.phase !== 'playing' || !this._coop || !p.alive) return;
        const t = this.players.get(m.id);
        if (!t || !t.joined || t.alive || t === p) return;
        if (Math.hypot(p.pos[0] - t.pos[0], p.pos[2] - t.pos[2]) > 4) return;
        if (now - (p.lastRevive || 0) < 2000) return;
        p.lastRevive = now;
        p.score += 100;
        this._spawn(t, t.pos);
        this._broadcast({ t: 'msg', text: `${p.name} revived ${t.name}` });
        break;
      }
      case 'coopwave':
        // the host started a new wave: bring everyone who went down back in
        if (this.phase !== 'playing' || !this._coop || p.id !== this.hostId) return;
        this.match.wave = Math.max(0, Math.min(999, Number(m.wave) | 0));
        for (const o of this.players.values()) if (o.joined && !o.alive) this._spawn(o);
        break;
      case 'extracted':
        // extraction: the host saw the helicopter take off with the squad
        if (this.phase !== 'playing' || !this._coop || p.id !== this.hostId || !MODES[this.mode].extract) return;
        this._broadcast({ t: 'msg', text: '🚁 The squad got out!', big: true });
        this._endCoop('extracted');
        break;
      case 'vote': {
        // map vote on the end screen; the most votes picks the next map
        if (this.phase !== 'ended' || !MP_MAPS.includes(m.map)) return;
        (this.votes ||= new Map()).set(p.id, m.map);
        const tally = {};
        for (const v of this.votes.values()) tally[v] = (tally[v] || 0) + 1;
        this._broadcast({ t: 'votes', tally });
        break;
      }
      case 'bots': {
        // the host (or an admin): how many AI bots play
        if ((p.id !== this.hostId && !p.admin) || !BOT_FILLS.includes(m.n)) return;
        this.botFill = m.n;
        if (this.phase === 'playing') this._fillBots();
        this._broadcast(this._lobby());
        break;
      }
      // the host's game moves the bots: where they are now
      case 'bs': {
        if (p.id !== this.hostId || this.phase !== 'playing' || !Array.isArray(m.b)) return;
        for (const row of m.b.slice(0, MAX_PLAYERS)) {
          if (!Array.isArray(row) || row.length < 6 || !row.slice(0, 6).every(Number.isFinite)) continue;
          const b = this.players.get(row[0]);
          if (!b?.bot || !b.alive) continue;
          b.pos = [row[1], row[2], row[3]].map((v) => Math.max(-500, Math.min(500, v)));
          b.rot = [row[4], row[5]];
          if (typeof row[6] === 'string' && row[6].length < 12) b.gun = row[6];
          b.flags = Number.isInteger(row[7]) ? row[7] & 0xff : 0;
        }
        break;
      }
      // the zombie modes: the zombies got one of the bots (the host's game runs both); it's back in 20 s
      case 'bdown': {
        const b = this.players.get(m.b);
        if (p.id !== this.hostId || !b?.bot || !b.alive || this.phase !== 'playing' || !this._coop) return;
        b.alive = false;
        b.deaths++;
        b.respawnAt = Date.now() + 20000;
        this._broadcast({ t: 'msg', text: `${b.name} is down! Back in 20 s` });
        break;
      }
      // a bot shoots (the tracer) or hits someone
      case 'bshot': {
        const b = this.players.get(m.b);
        if (p.id !== this.hostId || !b?.bot || !b.alive || this.phase !== 'playing') return;
        const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map((n) => Math.max(-600, Math.min(600, n))) : null);
        const o = vec(m.o);
        const e = vec(m.e);
        this._dropSpawnShield(b);
        if (o && e) this._broadcast({ t: 'shot', id: b.id, o, e, g: b.gun }, p);
        break;
      }
      case 'bhit': {
        const b = this.players.get(m.b);
        if (p.id !== this.hostId || !b?.bot) return;
        this._hit(b, { id: m.id, dmg: Math.min(Number(m.dmg) || 0, 60), head: !!m.head, melee: !!m.melee });
        break;
      }
      case 'open':
        // the host lets quick play drop strangers into this room (or not)
        if (p.id !== this.hostId || this.mode === 'event') return;
        this.open = !!m.on;
        this._broadcast(this._lobby());
        this._report();
        break;
      case 'overrun':
        // defend the points: the host saw the zombies take every point
        if (this.phase !== 'playing' || !this._coop || p.id !== this.hostId) return;
        this._broadcast({ t: 'msg', text: 'The zombies took every point' });
        this._endCoop('points');
        break;
      case 'score':
        if (this._coop && this.phase === 'playing') {
          p.kills = Math.max(0, Math.min(99999, Number(m.kills) | 0));
          p.score = Math.max(0, Math.min(9999999, Number(m.score) | 0));
        }
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
    if (p.username) {
      // the admin list shows which room you're in
      this._db
        .fetch('https://db/api/internal/leave', { method: 'POST', headers: { 'x-internal': '1' }, body: JSON.stringify({ username: p.username, guest: p.username ? null : p.guestId, room: this.code }) })
        .catch(() => {});
    }
    this._dropFlag(p);
    if (this.hostId === p.id) {
      const next = this._humans()[0];
      this.hostId = next ? next.id : 0;
    }
    if (![...this.players.values()].some((o) => !o.bot)) {
      this._removeBots();
      this._stopTimer();
      this.phase = 'lobby';
      this.match = null;
      this._report(); // nobody left: off the server list
      return;
    }
    this._broadcast({ t: 'left', id: p.id });
    if (this.match?.structures) {
      for (const st of [...this.match.structures.values()]) {
        if (st.owner !== p.id) continue;
        this.match.structures.delete(st.id);
        this._broadcast({ t: 'sgone', id: st.id });
      }
    }
    // co-op runs on the host's machine, so the run ends if the host leaves
    if (this._coop && this.phase === 'playing' && p.id === this.hostId) {
      this._broadcast({ t: 'msg', text: 'The host left, the run is over' });
      this._endCoop();
    } else if (this._coop && this.phase === 'playing' && ![...this.players.values()].some((o) => o.joined && o.alive && !o.bot)) {
      this._endCoop();
    }
    this._broadcast({ t: 'msg', text: `${p.name} left` });
    this._broadcast(this._lobby());
    if (this.phase === 'playing') this._fillBots(); // a bot takes the empty spot
  }

  // co-op modes (everyone vs the zombies): the host runs the zombies, the server passes messages along
  get _coop() {
    return !!MODES[this.mode]?.coop;
  }
  // modes with zombies run by the host's game: co-op, and events (zombies and PvP together)
  get _zombies() {
    return this._coop || !!MODES[this.mode]?.event;
  }

  _stopTimer() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  // ---------------------------------------------------------------- match flow
  _matchStart() {
    return {
      t: 'start', mode: this.mode, map: this.map, weather: this.match.weather, endsAt: this.match.endsAt, now: Date.now(),
      structures: [...this.match.structures.values()], settings: this.match.set, jugg: this.match.jugg, seekAt: this.match.seekAt,
      drops: [...this.match.drops.values()].map((d) => this._dropMsg(d)),
    };
  }

  // most health this player can have (custom health setting; infection zombies have their own)
  _maxHp(p) {
    const set = this.match?.set || this._set;
    if (MODES[this.mode]?.infection && p.team === INFECTED) return set.zhp || 150;
    if (MODES[this.mode]?.oitc) return MAX_HP;
    if (MODES[this.mode]?.jugg && this.match?.jugg === p.id) return (set.hp || MAX_HP) * JUGG_HP;
    return set.hp || MAX_HP;
  }

  // ---- supply drops: open spots every map keeps clear
  _spawnDrop(at = null) {
    const now = Date.now();
    let spot = at;
    if (!spot) {
      const spots = [...FFA_SPAWNS, [POINT.x + 4, POINT.z + 4], ...DEFEND_POINTS.map((d) => [d.x + 3, d.z - 3])];
      // somewhere away from the crates already down
      const far = spots.filter((s) => [...this.match.drops.values()].every((d) => Math.hypot(d.x - s[0], d.z - s[1]) > 20));
      const list = far.length ? far : spots;
      const s = list[Math.floor(Math.random() * list.length)];
      spot = [s[0] + (Math.random() - 0.5) * 4, s[1] + (Math.random() - 0.5) * 4];
    }
    const gun = MODES[this.mode].gungame ? null : SUPPLY_GUNS[Math.floor(Math.random() * SUPPLY_GUNS.length)];
    const d = { id: this.match.nextDrop++, x: Math.round(spot[0] * 100) / 100, z: Math.round(spot[1] * 100) / 100, gun, landAt: now + SUPPLY_FALL * 1000 };
    this.match.drops.set(d.id, d);
    this._broadcast({ t: 'drop', d: this._dropMsg(d) });
  }
  _dropMsg(d) {
    return { id: d.id, x: d.x, z: d.z, gun: d.gun, land: Math.max(0, (d.landAt - Date.now()) / 1000) };
  }
  _tickDrops(now) {
    const m = this.match;
    for (const d of [...m.drops.values()]) {
      if (now > d.landAt + SUPPLY_LAST * 1000) {
        m.drops.delete(d.id);
        this._broadcast({ t: 'looted', id: d.id, by: 0 });
      }
    }
    const every = SUPPLY_EVERY[m.set.drops];
    if (!every || now < m.dropAt) return;
    m.dropAt = now + every * 1000;
    if (m.drops.size < SUPPLY_MAX) this._spawnDrop();
  }

  // ---- infection: pick the first zombies once everyone's had a moment to spread out
  _tickInfection(now) {
    const m = this.match;
    const joined = [...this.players.values()].filter((p) => p.joined);
    if (!m.infected) {
      if (now < m.infectAt) return;
      if (joined.length < 2) {
        m.infectAt = now + 5000;
        if (!m.waitSaid) this._broadcast({ t: 'msg', text: 'Waiting for one more player before someone turns…' });
        m.waitSaid = true;
        return;
      }
      m.infected = true;
      if (MODES[this.mode].hns) {
        // the seekers count with their eyes shut while everyone hides
        m.seekAt = now + (m.set.hide || 30) * 1000;
        m.hintAt = m.seekAt + (m.set.hints || 0) * 1000;
        this._broadcast({ t: 'seek', at: m.seekAt, now });
      }
      this._infect(Math.min(m.set.starters || 1, joined.length - 1));
      return;
    }
    // hide and seek: now and then the seekers get told roughly where someone is
    if (MODES[this.mode].hns && m.set.hints && now >= m.hintAt && now >= m.seekAt) {
      m.hintAt = now + m.set.hints * 1000;
      const hiders = joined.filter((p) => p.team === SURVIVORS && p.alive);
      const h = hiders[Math.floor(Math.random() * hiders.length)];
      if (h) {
        const msg = { t: 'hint', x: Math.round(h.pos[0] + (Math.random() - 0.5) * 12), z: Math.round(h.pos[2] + (Math.random() - 0.5) * 12) };
        for (const p of joined) if (p.team === INFECTED) this._send(p, msg);
      }
    }
    // every zombie left: someone else turns
    if (!joined.some((p) => p.team === INFECTED) && joined.length >= 2) this._infect(1);
  }
  _infect(n) {
    const pool = [...this.players.values()].filter((p) => p.joined && p.team === SURVIVORS).sort(() => Math.random() - 0.5);
    const picked = pool.slice(0, n);
    for (const p of picked) p.team = INFECTED;
    this._broadcast(this._lobby());
    for (const p of picked) {
      this._dropFlag(p);
      this._broadcast({ t: 'infected', id: p.id, first: true });
      this._spawn(p);
    }
    if (!picked.length) return;
    if (MODES[this.mode].hns) this._broadcast({ t: 'msg', text: `🔎 ${picked.map((p) => p.name).join(', ')} ${picked.length > 1 ? 'are seeking' : 'is seeking'}! HIDE!`, big: true, team: INFECTED });
    else this._broadcast({ t: 'msg', text: `🧟 ${picked.map((p) => p.name).join(', ')} turned into ${picked.length > 1 ? 'zombies' : 'a zombie'}! RUN!`, big: true, team: INFECTED });
  }

  _startMatch() {
    const weathers = MAPS[this.map].weathers;
    const set = this._set;
    const now = Date.now();
    this.phase = 'playing';
    this.match = {
      set,
      endsAt: now + (this._coop ? 24 * 3600 : set.time ? set.time * 60 : MATCH_SECONDS) * 1000,
      drops: new Map(), // supply drops: id -> { id, x, z, gun, landAt }
      nextDrop: 1,
      dropAt: now + SUPPLY_FIRST * 1000,
      infectAt: now + (MODES[this.mode].hns ? 1500 : INFECT_DELAY * 1000), // hide and seek picks the seekers at once
      seekAt: 0, // hide and seek: when the seekers open their eyes
      infected: false,
      jugg: 0,
      juggAt: now + 5000,
      wave: 0,
      weather: weathers[Math.floor(Math.random() * weathers.length)],
      scores: { red: 0, blue: 0 },
      point: { owner: null, progress: 0, acc: 0 },
      flags: {
        red: { state: 'home', pos: [...FLAG_BASES.red], carrier: 0, droppedAt: 0 },
        blue: { state: 'home', pos: [...FLAG_BASES.blue], carrier: 0, droppedAt: 0 },
      },
      structures: new Map(), // barricades and turrets: id -> { id, kind, owner, team, x, z, rot, hp }
      nextStructure: 1,
      last: Date.now(),
    };
    for (const p of this.players.values()) {
      p.kills = p.deaths = p.score = p.level = 0;
      if (MODES[this.mode].infection) p.team = SURVIVORS;
    }
    this._broadcast(this._lobby());
    this._broadcast(this._matchStart());
    for (const p of this.players.values()) if (p.joined) this._spawn(p);
    this._fillBots();
    this._stopTimer();
    this.interval = setInterval(() => this._tick(), 66);
  }

  // at: [x, y, z] to come back where you are (a co-op revive)
  // a player changes side; mid-match they drop any flag and respawn on their new side
  _moveTeam(target, team) {
    if (!target || target.team === team) return;
    target.team = team;
    if (this.phase !== 'playing') return;
    this._dropFlag(target);
    if (target.alive && !this._coop) {
      target.hp = this._maxHp(target);
      this._spawn(target);
    }
  }

  _spawn(p, at = null) {
    const mode = MODES[this.mode];
    if (at) {
      p.pos = [...at];
      p.hp = MAX_HP;
      p.alive = true;
      p.protectUntil = Date.now() + 1500;
      this._send(p, { t: 'spawn', p: [at[0], at[2]], yaw: p.rot?.[0] ?? 0, hp: MAX_HP, revived: true });
      return;
    }
    // co-op squads start together
    // infection: survivors scatter over the whole map, zombies come from the red side
    const scatter = (!mode.teams && !mode.coop) || (mode.infection && p.team === SURVIVORS);
    let list = mode.coop ? TEAM_SPAWNS.red : mode.infection ? (scatter ? FFA_SPAWNS : TEAM_SPAWNS.red) : mode.teams ? TEAM_SPAWNS[p.team] : FFA_SPAWNS;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (scatter) {
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
    // events can have a crowd: spread them out more around each spawn
    const spread = mode.event ? 9 : 3;
    const x = pick[0] + (Math.random() - 0.5) * spread;
    const z = pick[1] + (Math.random() - 0.5) * spread;
    p.pos = [x, 0, z];
    p.hp = this._maxHp(p);
    p.alive = true;
    // spawn force field (PvP): nothing hurts you for a few seconds, until you shoot
    p.protectUntil = Date.now() + (this._coop ? 1500 : SPAWN_SHIELD_MS);
    if (!this._coop) this._broadcast({ t: 'shield', id: p.id, ms: SPAWN_SHIELD_MS });
    const yaw = mode.teams || mode.coop ? (p.team === 'red' || mode.coop ? -Math.PI / 2 : Math.PI / 2) : Math.atan2(x, z);
    this._send(p, { t: 'spawn', p: [x, z], yaw, hp: p.hp });
  }

  // shooting (or hitting someone) ends your spawn force field
  _dropSpawnShield(p) {
    if (this._coop || !(Date.now() < p.protectUntil)) return;
    p.protectUntil = 0;
    this._broadcast({ t: 'shield', id: p.id, ms: 0 });
  }

  _hit(p, m) {
    if (this.phase !== 'playing' || !p.alive || this._coop) return;
    this._dropSpawnShield(p);
    const target = this.players.get(m.id);
    if (!target || !target.alive || target === p) return;
    const mode = MODES[this.mode];
    if (mode.teams && target.team === p.team) return;
    const dmg = Number(m.dmg);
    if (!Number.isFinite(dmg) || dmg <= 0 || dmg > MAX_HIT) return;
    const now = Date.now();
    if (now - p.hits[1] > 1000) p.hits = [0, now];
    if (++p.hits[0] > 45) return; // faster than any gun can hit
    const dist = Math.hypot(p.pos[0] - target.pos[0], p.pos[2] - target.pos[2]);
    if (dist > 320) return;
    // infection zombies only have their claws (the knife): close up only
    if (mode.infection && p.team === INFECTED && (!m.melee || dist > 5)) return;
    // hide and seek: hiders can't hurt anyone, and seekers can't tag anyone until they've finished counting
    if (mode.hns && (p.team !== INFECTED || now < (this.match.seekAt || Infinity))) return;
    if (now < target.protectUntil || now < (target.shieldUntil || 0) || target.god) return;
    // one in the chamber: every bullet kills (and an admin's one-hit-kill cheat)
    // in a tank (only if they really have one): a quarter of the damage
    const armour = target.flags & TANK_FLAG && target.items?.sp_tank ? TANK_ARMOUR : 1;
    // one in the chamber: every bullet kills; hide and seek: one tag and you're found
    target.hp -= (mode.oitc && !m.melee) || mode.hns || p.onehit ? target.hp : dmg * armour;
    target.lastHurt = now;
    this._send(target, { t: 'hurt', by: p.id, dmg, from: p.pos, hp: Math.max(0, target.hp) });
    if (target.hp > 0) return;
    const set = this.match.set;
    target.alive = false;
    target.deaths++;
    target.respawnAt = now + (set.respawn || RESPAWN_SECONDS) * 1000;
    p.kills++;
    p.score += 100;
    if (this.mode === 'tdm') this.match.scores[p.team]++;
    if (mode.event) this.match.scores[p.team] = (this.match.scores[p.team] || 0) + EVENT_POINTS.player;
    this._dropFlag(target);
    this._broadcast({ t: 'kill', k: p.id, v: target.id, head: !!m.head, g: p.gun, mel: !!m.melee });
    // one in the chamber: a kill gives you another bullet
    if (mode.oitc) this._send(p, { t: 'ammo', n: 1 });
    if (mode.jugg) {
      // 1 point (100 score) for a kill as the Juggernaut, 2 for taking the Juggernaut down
      if (target.id === this.match.jugg) {
        p.score += 100;
        this._setJugg(p);
      } else if (p.id !== this.match.jugg) p.score -= 100; // plain kills don't count
    }
    if (mode.gungame) {
      // next gun; the last one (the knife) only counts with the knife
      const ladder = GUN_LADDERS[set.ladder] || GUN_LADDERS.normal;
      if (p.level < ladder.length - 1 || m.melee) p.level++;
      if (p.level < ladder.length) this._send(p, { t: 'level', level: p.level });
      if (m.melee && set.demote !== 'off' && target.level > 0) {
        target.level--;
        this._send(target, { t: 'level', level: target.level, demoted: p.name });
      }
    }
    if (mode.infection && p.team === INFECTED && target.team === SURVIVORS) {
      target.team = INFECTED;
      p.score += 50;
      this._broadcast(this._lobby());
      this._broadcast({ t: 'infected', id: target.id, by: p.id });
      const left = [...this.players.values()].filter((o) => o.joined && o.team === SURVIVORS);
      if (mode.hns) {
        this._broadcast({ t: 'msg', text: `🔎 ${p.name} found ${target.name}! ${left.length} still hiding` });
        if (left.length === 1) this._broadcast({ t: 'msg', text: `${left[0].name} is the LAST ONE HIDING!`, big: true });
      } else if (left.length === 1) this._broadcast({ t: 'msg', text: `${left[0].name} is the LAST SURVIVOR!`, big: true, team: SURVIVORS });
    }
    this._checkWin();
  }

  // Juggernaut: who it is now (their health goes up to the Juggernaut's)
  _setJugg(p) {
    this.match.jugg = p ? p.id : 0;
    if (p) {
      p.hp = this._maxHp(p);
      this._send(p, { t: 'healed', hp: p.hp });
    }
    this._broadcast({ t: 'jugg', id: this.match.jugg });
    if (p) this._broadcast({ t: 'msg', text: `💪 ${p.name} is the JUGGERNAUT!`, big: true });
  }
  _tickJugg(now) {
    const m = this.match;
    const cur = this.players.get(m.jugg);
    if (cur && cur.joined) return;
    if (now < m.juggAt) return;
    const pool = [...this.players.values()].filter((p) => p.joined && p.alive);
    if (pool.length < 2) return;
    this._setJugg(pool[Math.floor(Math.random() * pool.length)]);
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
    for (const p of this.players.values()) {
      if (p.joined && !p.alive && p.respawnAt && now >= p.respawnAt) this._spawn(p);
      // health slowly comes back after 5 seconds without getting hit
      if (!this._coop && p.alive && p.hp < this._maxHp(p) && now - (p.lastHurt || 0) > 5000) p.hp = Math.min(this._maxHp(p), p.hp + 8 * dt);
    }

    // keep quick play's list of rooms fresh during a long match
    if (now - (this.reportAt || 0) > 30000) {
      this.reportAt = now;
      this._report();
    }
    this._tickDrops(now);
    if (MODES[this.mode].infection) this._tickInfection(now);
    if (MODES[this.mode].jugg) this._tickJugg(now);
    if (this.mode === 'koth') this._tickPoint(dt);
    if (this.mode === 'ctf') this._tickFlags(now);
    this._checkWin();
    if (this.phase !== 'playing') return;

    const snap = {
      t: 'snap',
      ps: [...this.players.values()]
        .filter((p) => p.joined)
        .map((p) => [p.id, +p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2), +p.rot[0].toFixed(3), +p.rot[1].toFixed(3), p.gun, Math.max(0, Math.round(p.hp)), p.flags, p.alive ? 1 : 0, p.kills, p.deaths, p.score, p.level]),
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

  // the end screen's map vote picks the next map
  _applyVotes() {
    if (!this.votes?.size) return;
    const tally = {};
    for (const v of this.votes.values()) tally[v] = (tally[v] || 0) + 1;
    this.map = Object.entries(tally).sort((a, b) => b[1] - a[1] || Math.random() - 0.5)[0][0];
    this.votes = null;
    this._broadcast({ t: 'msg', text: `🗺️ Next map: ${MAPS[this.map].name}` });
  }
  // tells the server list (quick play) about this room, at most once a second
  _report() {
    if (this.reportT) return;
    this.reportT = setTimeout(() => {
      this.reportT = null;
      const players = this._humans().length;
      this._db
        .fetch('https://db/api/internal/room', { method: 'POST', headers: { 'x-internal': '1' }, body: JSON.stringify({ code: this.code, players, phase: this.phase, mode: this.mode, open: !!this.open, map: this.map, host: this.players.get(this.hostId)?.name || '' }) })
        .catch(() => {});
      // while anyone's here, check in every 30 s so a room waiting in its lobby stays on the list
      // (rooms that stop checking in drop off it after 90 s); an empty room stops
      if (players && !this.beatT)
        this.beatT = setTimeout(() => {
          this.beatT = null;
          this._report();
        }, 30000);
    }, 1000);
  }

  _endCoop(reason = 'down') {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';
    this._stopTimer();
    const board = [...this.players.values()]
      .filter((p) => p.joined)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score }));
    this._broadcast({ t: 'end', winner: 'coop', reason, wave: this.match.wave || 0, scores: this.match.scores, board, mode: this.mode });
    setTimeout(() => {
      if (this.phase !== 'ended') return;
      this.phase = 'lobby';
      this._applyVotes();
      this._removeBots();
      for (const p of this.players.values()) p.alive = false;
      this._broadcast(this._lobby());
    }, 12000);
  }

  _checkWin() {
    if (this.phase !== 'playing' || this._coop) return;
    const mode = MODES[this.mode];
    const s = this.match.scores;
    const set = this.match.set;
    const joined = [...this.players.values()].filter((p) => p.joined);
    const timeUp = Date.now() >= this.match.endsAt;
    let winner = null;
    if (mode.gungame) {
      const ladder = GUN_LADDERS[set.ladder] || GUN_LADDERS.normal;
      const top = [...joined].sort((a, b) => b.level - a.level || b.kills - a.kills || a.deaths - b.deaths)[0];
      if (top && (top.level >= ladder.length || timeUp)) winner = top.id;
    } else if (mode.infection) {
      // the zombies get everyone, or the survivors hold out until the time runs out
      if (this.match.infected && joined.length && !joined.some((p) => p.team === SURVIVORS)) winner = INFECTED;
      else if (timeUp) winner = SURVIVORS;
    } else if (this.mode === 'ffa' || mode.oitc) {
      const top = [...this.players.values()].sort((a, b) => b.kills - a.kills)[0];
      if (top && top.kills >= limitFor(this.mode, set)) winner = top.id;
    } else if (mode.jugg) {
      const top = [...joined].sort((a, b) => b.score - a.score)[0];
      if (top && (top.score >= limitFor(this.mode, set) * 100 || timeUp)) winner = top.id;
    } else {
      const limit = limitFor(this.mode, set);
      if (s.red >= limit) winner = 'red';
      else if (s.blue >= limit) winner = 'blue';
    }
    if (!winner && timeUp) {
      if (this.mode === 'ffa' || mode.oitc) winner = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]?.id ?? null;
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
      this._applyVotes();
      this._removeBots();
      for (const p of this.players.values()) p.alive = false;
      this._broadcast(this._lobby());
      // events keep going: the next match starts by itself
      if (MODES[this.mode]?.event)
        setTimeout(() => {
          if (this.phase === 'lobby' && MODES[this.mode]?.event && this._humans().length) this._startMatch();
        }, 4000);
    }, 12000);
  }
}
