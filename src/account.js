import { CharacterPreview, loadAllCharacterModels } from './character.js';
import { SPECIAL_GEAR } from '../shared/gear.js';
import { DROP_BOOSTS, EVENT_DURATIONS, EVENT_MAX_PLAYERS, EVENT_PRESETS, EVENT_POINTS, SCHEDULE_MINUTES, halloweenEnd, PIECE_COUNT, PIECE_SETS, ADMIN_CHARS, PAID_CHARS, ownsPaidChar, anyPieces, charUnlocked, piecesOf, totalPieces } from '../shared/events.js';
import { AVATARS, CROSSHAIRS, DEFAULT_PROFILE, FINISHES, NAME_COLORS, PET_COLORS, PET_MASTERIES, PET_MAX_LEVEL, PET_SPOTS, TITLES, CHARACTERS_LIVE, LOOK_MODELS, MODEL_COLORS, LOOK_CLOTH, LOOK_HAIR_COLORS, LOOK_SKIN, CANDY_SHOP, ASTRONAUT_PRESETS, FIXED_LOOK, DEALS, DEAL_COINS, DEAL_PRICE, EVENT_LEVEL, RETICLES, COSMETIC_LISTS, crosshairPaint, isDeal, cleanProfile, levelFromXp, ownsWolf, petLevel, petXpNeeded, xpForLevel, xpForRun } from '../shared/cosmetics.js';
import { DEAL_ITEMS, SHOP, coinsForRun, cosmeticItemId, cosmeticPrice, priceOf, shopDef } from '../shared/shop.js';
import { DEFAULT_QUICK, QUICK_LEN, QUICK_MAX, cleanQuick, refundOldEmotes } from '../shared/modes.js';
import { addProgress, claimQuest as claimQuestState, questView } from '../shared/quests.js';
import { MASTERY_GUNS, MASTERY_TIERS, addMasteryKills, chooseSkin, cleanMastery, tierFor } from '../shared/mastery.js';
import { GUNS, HALLOWEEN_GUNS } from './guns.js';
import { gunIcon } from './gunIcons.js';
import { ACHIEVEMENTS } from '../shared/achievements.js';
import { priceTag, termsHtml } from '../shared/terms.js';
import { isHalloween } from './halloween.js';

// what an admin's real-money shop item can give: [value for the form, label]. value is give or give:what
const PAID_OPTIONS = [
  ['nametag', '🏷️ A new name tag (type it below)'], ['namecolor', '🎨 A new name colour (pick it below)'],
  ['coins', '🪙 Coins (how many below)'], ['candy', '🍬 Candy (how many below)'], ['wolf', '🐺 The wolf companion'],
  ...SHOP.filter((d) => d.kind === 'gun').map((d) => [`gun:${d.id}`, `🔫 Gun: ${d.name}`]),
  ...SPECIAL_GEAR.map((g) => [`gear:${g.id}`, `${g.icon} Special gear: ${g.name}`]),
  // every cosmetic there is (the level ones, then the Halloween ones)
  ...Object.entries({ color: ['🎨 Name colour', NAME_COLORS], title: ['🏷️ Name tag', TITLES], avatar: ['🙂 Avatar', AVATARS], crosshair: ['➕ Crosshair colour', CROSSHAIRS], reticle: ['🎯 Crosshair shape', RETICLES], finish: ['🔫 Gun skin', FINISHES] }).flatMap(([kind, [name, list]]) =>
    list.map(([id, need, label]) => [`cosmetic:cos_${kind}_${id}`, `${isDeal(kind, id) ? '💵 ' : need >= EVENT_LEVEL ? '🎃 ' : ''}${name}: ${kind === 'avatar' || kind === 'title' ? id : label}`]),
  ),
  ['none', '✨ Something else (you sort it out)'],
];
// how a cosmetic shows in the shops: its picture (or colour swatch, or crosshair shape) and name
const KIND_NAMES = { avatar: 'Avatar', color: 'Name colour', title: 'Name tag', crosshair: 'Crosshair colour', finish: 'Gun skin', reticle: 'Crosshair shape' };
const xhDemo = (shape, colour = '#ffffff') => {
  const paint = crosshairPaint(colour);
  return `<span class="xh-demo" style="--xh:${paint.fill};--xh-solid:${paint.solid}"><b class="xh-${esc(shape)}"><i></i><i></i><i></i><i></i></b></span>`;
};
function cosShow(kind, id, label, color, glow, myColour) {
  if (kind === 'avatar') return `<span class="big">${id}</span>`;
  if (kind === 'title') return `<b>${esc(id)}</b>`;
  if (kind === 'reticle') return `${xhDemo(id, myColour)}${esc(label)}`;
  if (kind === 'crosshair') return `<span class="swatch" style="background:${crosshairPaint(id).fill}"></span>${esc(label)}`;
  if (kind === 'color') return `<span class="swatch" style="background:${id}"></span>${esc(label)}`;
  return `<span class="swatch${glow ? ' glow' : ''}" style="background:${color};${glow ? `--glow:${glow}` : ''}"></span>${esc(label)}${glow ? ' <span class="glow-tag">✨ GLOWS</span>' : ''}`;
}
const SECTION_NAMES = { halloween: '🎃 Halloween shop', paid: '💵 Specials (your items)', characters: '🧍 Characters ($10)', deals: '💵 50c Deals', upgrades: 'Upgrades', guns: 'Starting gun', items: 'Items', pets: '🐺 Pets', cosmetics: 'Cosmetics' };
function paidGives(i) {
  if (i.give === 'coins' || i.give === 'candy') return `${i.amount} ${i.give === 'coins' ? '🪙 coins' : '🍬 candy'}`;
  if (i.give === 'nametag') return `🏷️ Name tag: ${i.what}`;
  if (i.give === 'namecolor') return '🎨 A new name colour';
  return (PAID_OPTIONS.find(([v]) => v === (i.what ? `${i.give}:${i.what}` : i.give))?.[1] || '').replace(/ \(.*\)$/, '');
}

const TOKEN_KEY = 'deadplains.token';
const GUEST_KEY = 'deadplains.guest';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

function emptyGuest() {
  return { xp: 0, coins: 0, items: {}, profile: { ...DEFAULT_PROFILE }, stats: { bestWave: 0, bestScore: 0, kills: 0, headshots: 0, games: 0, pvpKills: 0, pvpWins: 0 } };
}

// Logged-in account (saved on the server) or a guest (saved in this browser).
export class Account {
  constructor() {
    this.token = store.get(TOKEN_KEY);
    this.user = null;
    this.online = true;
    this.listeners = [];
    this.unread = {}; // friend chat: username -> unread messages
    this.quests = [];
    this.party = null; // { id, room, leader, members }
    this.partyInvites = [];
    this.partyListeners = [];
    this.unreadListeners = [];
    this.requests = []; // friend requests waiting for you (usernames)
    this.requestListeners = [];
    this.timeoutMins = 0; // an admin timed you out
    this.onNotice = null; // (message) the game shows it (e.g. you got banned)
    try {
      this.guest = { ...emptyGuest(), ...JSON.parse(store.get(GUEST_KEY) || '{}') };
      // emotes left the shop: give guests their coins back too
      const refund = refundOldEmotes(this.guest.items);
      if (refund) {
        this.guest.coins = (this.guest.coins || 0) + refund;
        store.set(GUEST_KEY, JSON.stringify(this.guest));
      }
    } catch {
      this.guest = emptyGuest();
    }
  }

  onChange(fn) {
    this.listeners.push(fn);
  }
  _changed() {
    for (const fn of this.listeners) fn(this);
  }
  onParty(fn) {
    this.partyListeners.push(fn);
  }
  get partyLeader() {
    return !!this.party && this.party.leader === this.user?.username;
  }
  _setParty(r) {
    const before = JSON.stringify([this.party, this.partyInvites]);
    this.party = r?.party || null;
    this.partyInvites = r?.invites || [];
    if (JSON.stringify([this.party, this.partyInvites]) !== before) for (const fn of this.partyListeners) fn();
  }
  async loadParty() {
    if (!this.user) return this._setParty(null);
    try {
      this._setParty(await this._api('/party'));
    } catch {
      /* offline */
    }
  }
  async partyAction(action, body = {}) {
    this._setParty(await this._api(`/party/${action}`, { method: 'POST', body }));
  }
  // the leader's room, so the party can follow
  setPartyRoom(code) {
    if (!this.partyLeader || this.party.room === code) return;
    this.partyAction('room', { code }).catch(() => {});
  }

  onUnread(fn) {
    this.unreadListeners.push(fn);
  }

  get loggedIn() {
    return !!this.user;
  }
  get name() {
    return this.user ? this.user.username : 'Guest';
  }
  get xp() {
    return this.user ? this.user.xp : this.guest.xp;
  }
  get level() {
    return levelFromXp(this.xp);
  }
  get admin() {
    return !!this.user?.admin;
  }
  // level used for unlocks: admins have everything
  get unlockLevel() {
    return this.admin ? 99999 : this.level; // (over the Halloween items too)
  }
  get coins() {
    return this.user ? this.user.coins || 0 : this.guest.coins || 0;
  }
  get items() {
    return (this.user ? this.user.items : this.guest.items) || {};
  }
  get profile() {
    return cleanProfile(this.user ? this.user.profile : this.guest.profile, this.unlockLevel, this.items);
  }
  get stats() {
    return this.user ? this.user.stats : this.guest.stats;
  }
  // guests check in now and then (a random id, their level and stats) so admins can see them
  // this browser's random guest id (made the first time)
  get guestId() {
    let id = store.get('deadplains.guestId');
    if (!id || !/^[a-f0-9]{24}$/.test(id)) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
      store.set('deadplains.guestId', id);
    }
    return id;
  }
  pingGuest() {
    if (this.user) return;
    const id = this.guestId;
    const s = this.guest.stats;
    fetch('/api/guest/ping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, xp: this.guest.xp, bestWave: s.bestWave, games: s.games }) }).catch(() => {});
  }
  adminAccounts(q = '', page = 0) {
    return this._api(`/admin/accounts?q=${encodeURIComponent(q)}&page=${page}`);
  }

  async _api(path, { method = 'GET', body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Can't reach the server");
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* not JSON (e.g. the dev server has no backend) */
      if (!res.ok) throw new Error('Online features need the Cloudflare backend');
    }
    if (!res.ok) {
      if (res.status === 401 && path !== '/login') {
        const was = !!this.user;
        this._dropSession();
        // paid access: maybe their time ran out; ask again so the right screen shows
        if (was && this.paywall) {
          this.wasPlaying = true;
          this.supaSync().catch(() => {});
        }
      }
      if (res.status === 403 && data.banned && path !== '/login') {
        this._dropSession();
        this.onNotice?.(data.error);
      }
      throw new Error(data.error || `Error ${res.status}`);
    }
    return data;
  }

  _dropSession() {
    this.token = null;
    this.user = null;
    store.set(TOKEN_KEY, null);
    this._changed();
    this.loadQuests();
    this._setParty(null);
  }

  // ---- paid access (Supabase): sign up with an email, then the owner marks you as paid
  async _loadConfig() {
    try {
      this.cfg = await (await fetch('/api/config')).json();
    } catch {
      this.cfg = {};
    }
    this.paywall = !!this.cfg?.supabase;
    if (!this.paywall) return;
    const { createClient } = await import('@supabase/supabase-js');
    this.sb = createClient(this.cfg.supabase.url, this.cfg.supabase.anonKey);
  }
  // asks the game server: is this email paid up, and which player is it? (every time the site opens)
  async supaSync(extra = {}) {
    const { data } = await this.sb.auth.getSession();
    const session = data?.session;
    if (!session) {
      this.gate = null;
      this._dropSession();
      return;
    }
    let res;
    let r = {};
    try {
      res = await fetch('/api/auth/supabase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: session.access_token, ...extra }) });
      r = await res.json();
    } catch {
      throw new Error("Can't reach the server");
    }
    if (res.status === 402) {
      const was = !!this.user || this.wasPlaying;
      this.wasPlaying = false;
      this.gate = { kind: 'unpaid', email: r.email, expired: r.expired, paidUntil: r.paidUntil };
      this._dropSession();
      if (was) this.onAccessEnded?.();
    } else if (r.needName) {
      this.gate = { kind: 'name', email: r.email };
    } else if (r.token) {
      this.gate = null;
      this.email = r.user.email;
      this._setSession(r.token, r.user);
      return;
    } else {
      if (res.status === 401 || r.banned) await this.sb.auth.signOut();
      throw new Error(r.error || `Error ${res.status}`);
    }
    this._changed();
  }
  async supaSignUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.session) {
      // email confirmation is on in Supabase: they confirm, then log in
      this.gate = { kind: 'confirm', email };
      this._changed();
      return;
    }
    await this.supaSync();
  }
  async supaSignIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
    await this.supaSync();
  }

  async init() {
    await this._loadConfig();
    if (this.paywall) {
      try {
        await this.supaSync();
      } catch {
        /* offline */
      }
    } else if (this.token) {
      try {
        const { user } = await this._api('/me');
        this.user = user;
      } catch {
        /* offline or expired */
      }
    }
    this.ready = true;
    this._changed();
    this.loadQuests();
    // keeps "online" status fresh for friends, and picks up what the admin changed (a wolf given or taken, coins…)
    setInterval(() => {
      if (!this.user || document.visibilityState !== 'visible') return;
      this._api('/me')
        .then(({ user }) => {
          const changed = JSON.stringify([user.items, user.profile, user.coins]) !== JSON.stringify([this.user?.items, this.user?.profile, this.user?.coins]);
          this.user = user;
          if (changed) this._changed();
        })
        .catch(() => {});
    }, 20000);
    // party: every few seconds while you're in one, otherwise now and then for invites
    this.loadParty();
    let partyTick = 0;
    setInterval(() => {
      partyTick++;
      if (this.user && document.visibilityState === 'visible' && (this.party || partyTick % 3 === 0)) this.loadParty();
    }, 4000);
    // new messages from friends
    this.pollUnread();
    setInterval(() => {
      if (document.visibilityState === 'visible') this.pollUnread();
    }, 15000);
  }

  async register(username, password) {
    const { token, user } = await this._api('/register', { method: 'POST', body: { username, password } });
    this._setSession(token, user);
  }
  async login(username, password) {
    const { token, user } = await this._api('/login', { method: 'POST', body: { username, password } });
    this._setSession(token, user);
  }
  _setSession(token, user) {
    this.token = token;
    this.user = user;
    store.set(TOKEN_KEY, token);
    this._changed();
    this.loadQuests();
    this.loadParty();
    this.pollUnread();
  }
  async logout() {
    try {
      await this._api('/logout', { method: 'POST' });
    } catch {
      /* already gone */
    }
    if (this.sb) await this.sb.auth.signOut().catch(() => {});
    this.gate = null;
    this._dropSession();
  }

  // Saved solo games on the server (logged-in players only).
  async listSaves() {
    if (!this.user) return [];
    const { saves } = await this._api('/saves');
    return saves || [];
  }
  async putSave(save) {
    if (!this.user) return;
    await this._api('/saves', { method: 'PUT', body: { save } });
  }
  async deleteSave(id) {
    if (!this.user) return;
    await this._api('/saves/delete', { method: 'POST', body: { id } });
  }

  // ---- gun mastery
  get mastery() {
    return cleanMastery(this.user ? this.user.mastery : this.guest.mastery);
  }
  async addMastery(kills) {
    if (!kills || !Object.keys(kills).length) return;
    if (this.user) {
      const { mastery } = await this._api('/mastery', { method: 'POST', body: { kills } });
      this.user.mastery = mastery;
    } else {
      this.guest.mastery = addMasteryKills(this.guest.mastery, kills);
      store.set(GUEST_KEY, JSON.stringify(this.guest));
    }
    this._changed();
  }
  async setGunSkin(gun, tier) {
    if (this.user) {
      const { mastery } = await this._api('/mastery/skin', { method: 'POST', body: { gun, tier } });
      this.user.mastery = mastery;
    } else {
      const m = chooseSkin(this.guest.mastery, gun, tier);
      if (!m) throw new Error("You haven't unlocked that yet");
      this.guest.mastery = m;
      store.set(GUEST_KEY, JSON.stringify(this.guest));
    }
    this._changed();
  }

  // ---- daily quests (guests keep theirs in this browser)
  async loadQuests() {
    this.questsLoaded = true;
    if (this.user) {
      try {
        const { quests } = await this._api('/quests');
        this.quests = quests;
      } catch {
        /* offline */
      }
    } else this.quests = questView(this.guest.quests);
    this._changed();
    return this.quests;
  }
  async questProgress(delta) {
    if (!delta || !Object.keys(delta).length) return;
    if (this.user) {
      const { quests } = await this._api('/quests/progress', { method: 'POST', body: { delta } });
      this.quests = quests;
    } else {
      this.guest.quests = addProgress(this.guest.quests, delta);
      this.quests = questView(this.guest.quests);
      store.set(GUEST_KEY, JSON.stringify(this.guest));
    }
    this._changed();
  }
  async claimQuest(id) {
    if (this.user) {
      const { quests, user, reward } = await this._api('/quests/claim', { method: 'POST', body: { id } });
      this.quests = quests;
      this.user = user;
      this._changed();
      return reward;
    }
    const r = claimQuestState(this.guest.quests, id);
    if (r.error) throw new Error(r.error);
    this.guest.quests = r.state;
    this.guest.coins = (this.guest.coins || 0) + r.reward;
    this.quests = questView(this.guest.quests);
    this._saveGuest();
    return r.reward;
  }
  get questsReady() {
    return (this.quests || []).filter((q) => q.done && !q.claimed).length;
  }

  // ---- chat with friends
  messages(name, after = 0) {
    return this._api(`/messages?with=${encodeURIComponent(name)}&after=${after}`);
  }
  sendMessage(to, text, after = 0) {
    return this._api('/messages', { method: 'POST', body: { to, text, after } });
  }
  get unreadTotal() {
    return Object.values(this.unread).reduce((a, b) => a + b, 0) + (this.groupUnread || 0);
  }
  // group chats (admins make them; members read and reply)
  groups() {
    return this._api('/groups');
  }
  groupMessages(id, after = 0) {
    return this._api(`/groups/${id}/messages?after=${after}`);
  }
  sendGroup(id, text, after = 0) {
    return this._api(`/groups/${id}/messages`, { method: 'POST', body: { text, after } });
  }
  adminGroups(body) {
    return this._api('/admin/groups', { method: 'POST', body });
  }
  _setUnread(unread) {
    const before = this.unread;
    this.unread = unread;
    if (JSON.stringify(before) !== JSON.stringify(unread)) for (const fn of this.unreadListeners) fn(unread, before);
  }
  onRequests(fn) {
    this.requestListeners.push(fn);
  }
  _setRequests(list) {
    const before = this.requests;
    this.requests = list;
    if (JSON.stringify(before) !== JSON.stringify(list)) for (const fn of this.requestListeners) fn(list, before);
  }
  async pollUnread() {
    if (!this.user) {
      this._setRequests([]);
      return this._setUnread({});
    }
    try {
      const { unread, requests, timeoutMins, groupUnread, announce, event, season, hwEvent, paidItems, features } = await this._api('/messages/unread');
      this._setEvent(event || null);
      if (this.cfg) {
        if (features) this.cfg.features = features; // a feature an admin just deployed
        if (paidItems) this.cfg.paidItems = paidItems;
        if (JSON.stringify(hwEvent || null) !== JSON.stringify(this.cfg.hwEvent || null)) {
          this.cfg.hwEvent = hwEvent || null;
          this._changed();
        }
        if (JSON.stringify(season || null) !== JSON.stringify(this.cfg.season || null)) {
          this.cfg.season = season || null;
          this._changed();
        }
      }
      this.timeoutMins = timeoutMins || 0;
      this._setAnnounce(announce || null);
      this.groupUnread = groupUnread || 0;
      this._setRequests(requests || []);
      this._setUnread(unread || {});
    } catch {
      /* offline */
    }
  }
  // the admin's announcement: stays on screen until you press OK (remembered per account in this browser)
  _setAnnounce(a) {
    this.announce = a;
    const key = `deadplains.announceSeen.${this.user?.username || ''}`;
    if (!a || Number(store.get(key) || 0) >= a.id) return;
    this.onAnnounce?.(a, () => store.set(key, String(a.id)));
  }
  adminAnnounce(body) {
    return this._api('/admin/announce', { method: 'POST', body });
  }
  markRead(name) {
    if (!this.unread[name]) return;
    const next = { ...this.unread };
    delete next[name];
    this._setUnread(next);
  }

  // ---- shop
  _saveGuest() {
    store.set(GUEST_KEY, JSON.stringify(this.guest));
    this._changed();
  }
  // Halloween candy (items.candy): collected from kills while the event's on, spent in the Halloween shop
  get candy() {
    return this.items.candy || 0;
  }
  async claimCandy(n) {
    if (!this.user) return 0;
    const r = await this._api('/event/candy', { method: 'POST', body: { n } });
    this.user = r.user;
    this._changed();
    return r.got;
  }
  async adminCandy(n) {
    const r = await this._api('/admin/candy', { method: 'POST', body: { n } });
    this.user = r.user;
    this._changed();
    return r.note;
  }
  async buyWithCandy(itemId) {
    if (!this.user) throw new Error('Log in to keep candy and spend it');
    const { user } = await this._api('/shop/candy', { method: 'POST', body: { item: itemId } });
    this.user = user;
    this._changed();
  }
  async buy(itemId) {
    if (this.user) {
      const { user } = await this._api('/shop/buy', { method: 'POST', body: { item: itemId } });
      this.user = user;
      this._changed();
      return;
    }
    const g = this.guest;
    g.items = g.items || {};
    const price = priceOf(itemId, g.items, this.shopEdits);
    if (price === null) throw new Error("That can't be bought");
    if ((g.coins || 0) < price) throw new Error('Not enough coins');
    g.coins -= price;
    g.items[itemId] = (g.items[itemId] || 0) + 1;
    this._saveGuest();
  }
  async useItem(itemId) {
    if (this.user) {
      const { user } = await this._api('/shop/use', { method: 'POST', body: { item: itemId } });
      this.user = user;
      this._changed();
      return;
    }
    const g = this.guest;
    if (!(g.items?.[itemId] > 0)) throw new Error("You don't have that");
    g.items[itemId]--;
    this._saveGuest();
  }
  async setLoadout(gun) {
    if (this.user) {
      const { user } = await this._api('/shop/loadout', { method: 'POST', body: { gun } });
      this.user = user;
      this._changed();
      return;
    }
    const g = this.guest;
    if (gun === null) delete g.items.loadout;
    else if (g.items?.[`gun_${gun}`]) g.items.loadout = gun;
    this._saveGuest();
  }
  // equip (or not) one of your items: every game starts with the equipped ones
  async setItemEquip(item, on) {
    if (this.user) {
      const { user } = await this._api('/shop/loadout', { method: 'POST', body: { item, on: !!on } });
      this.user = user;
      this._changed();
      return;
    }
    const g = this.guest;
    if (!g.items?.[item]) return;
    const list = new Set(g.items.equip || []);
    if (on) list.add(item);
    else list.delete(item);
    g.items.equip = [...list];
    this._saveGuest();
  }
  // your quick chat wheel (8 phrases)
  // the event the admin is hosting (or null): from the server config, then kept fresh with the unread check
  get event() {
    const e = this.liveEvent !== undefined ? this.liveEvent : this.cfg?.event || null;
    return e && (!e.endsAt || e.endsAt > Date.now()) ? e : null;
  }
  // the Halloween match, open all through the Halloween season (its own JOIN button), or null
  get hwEvent() {
    const e = this.cfg?.hwEvent;
    return e && e.endsAt > Date.now() ? e : null;
  }
  // the event a match room belongs to: the Halloween one, or the main one
  eventFor(code) {
    return code && this.hwEvent?.rooms?.includes(code) ? this.hwEvent : this.event;
  }
  // the season the admin started (Halloween until a week after), or null
  get season() {
    const s = this.cfg?.season;
    return s && s.endsAt > Date.now() ? s : null;
  }
  async adminSeason(body) {
    const r = await this._api('/admin/season', { method: 'POST', body });
    if (this.cfg) this.cfg.season = r.season;
    this._changed();
    return r;
  }
  // the admin's real-money shop items: [{ id, name, icon, price, desc, give, amount, what }]
  get paidItems() {
    return this.cfg?.paidItems || [];
  }
  // the order of the Shop's sections (an admin can change it)
  get shopOrder() {
    const all = ['halloween', 'paid', 'characters', 'deals', 'upgrades', 'guns', 'items', 'pets', 'cosmetics'];
    const out = [...new Set((this.cfg?.shopOrder || []).filter((x) => all.includes(x)))];
    // a section newer than the saved order goes in after the one it follows by default
    all.forEach((id, n) => {
      if (out.includes(id)) return;
      const after = n ? out.indexOf(all[n - 1]) : -1;
      out.splice(after + 1, 0, id);
    });
    return out;
  }
  // the admin's changes to the Shop's own items: { id: { name, icon, desc, price, hidden } }
  get shopEdits() {
    return this.cfg?.shopEdits || {};
  }
  async adminShopItem(body) {
    const r = await this._api('/admin/shop-item', { method: 'POST', body });
    if (this.cfg) this.cfg.shopEdits = r.shopEdits;
    this._changed();
    return r;
  }
  async adminShopOrder(sections) {
    const r = await this._api('/admin/shop-order', { method: 'POST', body: { sections } });
    if (this.cfg) this.cfg.shopOrder = r.shopOrder;
    this._changed();
    return r;
  }
  // a coin item from the admin's specials
  async buyCustom(id) {
    if (!this.user) throw new Error('Log in to buy it: it goes on your account');
    const { user } = await this._api('/shop/custom', { method: 'POST', body: { id } });
    this.user = user;
    this._changed();
    return this.paidItems.find((i) => i.id === id) || {};
  }
  async adminPaidItems(body) {
    const r = await this._api('/admin/paid-items', { method: 'POST', body });
    if (this.cfg) this.cfg.paidItems = r.paidItems;
    this._changed();
    return r;
  }
  _setEvent(e) {
    if (JSON.stringify(e) === JSON.stringify(this.liveEvent)) return;
    this.liveEvent = e;
    this._changed();
  }
  // a puzzle piece picked up in an event: the server says which one it was
  async claimPiece() {
    const r = await this._api('/event/piece', { method: 'POST', body: {} });
    this.user = r.user;
    this._changed();
    return r;
  }
  // which event room to join (the server fills one before opening the next)
  eventRoom(full = [], which = null) {
    return this._api('/event/room', { method: 'POST', body: { full, which } });
  }
  async adminEvent(body) {
    const r = await this._api('/admin/event', { method: 'POST', body });
    if ('event' in r && body.action !== 'status') this._setEvent(r.event);
    return r;
  }

  async setQuickChat(list) {
    if (this.user) {
      const { user } = await this._api('/shop/loadout', { method: 'POST', body: { quick: list } });
      this.user = user;
      this._changed();
      return;
    }
    this.guest.items = { ...this.guest.items, quick: cleanQuick(list) };
    this._saveGuest();
  }
  async adminMastery(mode) {
    const { user } = await this._api('/admin/mastery', { method: 'POST', body: { mode } });
    this.user = user;
    this._changed();
  }
  async adminGuns(mode) {
    const { user } = await this._api('/admin/guns', { method: 'POST', body: { mode } });
    this.user = user;
    this._changed();
  }
  async adminQuests(mode) {
    const { quests } = await this._api('/admin/quests', { method: 'POST', body: { mode } });
    this.quests = quests;
    this._changed();
  }
  // admin: players on every server
  adminPlayers(q = '') {
    return this._api(`/admin/players?q=${encodeURIComponent(q)}`);
  }
  async adminPlayer(username, action, extra = {}) {
    const r = await this._api('/admin/player', { method: 'POST', body: { username, action, ...extra } });
    if (r.user) {
      this.user = r.user;
      this._changed();
    }
    return r;
  }
  async adminWolfPrice(price, kind = 'wolf') {
    const r = await this._api('/admin/wolf-price', { method: 'POST', body: { price, kind } });
    if (this.cfg) this.cfg[kind === 'level' ? 'wolfLevelPrice' : 'wolfPrice'] = r.price;
    return r;
  }
  // features held back for a big update: live once an admin deploys them; admins always have them (a preview)
  feature(id) {
    return !!this.cfg?.features?.[id] || this.admin;
  }
  featureLive(id) {
    return !!this.cfg?.features?.[id];
  }
  async adminFeature(id, on) {
    const r = await this._api('/admin/feature', { method: 'POST', body: { id, on } });
    if (this.cfg) this.cfg.features = r.features;
    this._changed();
    return r;
  }
  adminUpdates(body) {
    return this._api('/admin/updates', { method: 'POST', body });
  }
  adminManage(username) {
    return this._api(`/admin/manage?u=${encodeURIComponent(username)}`);
  }
  async adminManageSave(username, set) {
    const r = await this._api('/admin/manage', { method: 'POST', body: { username, set } });
    if (r.user) {
      this.user = r.user;
      this._changed();
    }
    return r;
  }
  adminGuest(guest, action, extra = {}) {
    return this._api('/admin/player', { method: 'POST', body: { guest, action, ...extra } });
  }

  adminWords() {
    return this._api('/admin/words');
  }
  adminSetWords(words) {
    return this._api('/admin/words', { method: 'POST', body: { words } });
  }
  async adminSetCoins(coins) {
    const { user } = await this._api('/admin/coins', { method: 'POST', body: { coins } });
    this.user = user;
    this._changed();
  }

  async claimAdmin(code) {
    const { user } = await this._api('/admin/claim', { method: 'POST', body: { code } });
    this.user = user;
    this._changed();
  }
  async adminSetXp(xp) {
    const { user } = await this._api('/admin/xp', { method: 'POST', body: { xp } });
    this.user = user;
    this._changed();
  }

  get ownsWolf() {
    return ownsWolf(this.unlockLevel, this.items);
  }
  get wolfPrice() {
    return this.cfg?.wolfPrice || '$1';
  }
  get wolfLevelPrice() {
    return this.cfg?.wolfLevelPrice || '50c';
  }

  async saveProfile(profile) {
    const clean = cleanProfile(profile, this.unlockLevel, this.items);
    if (this.user) {
      const { user } = await this._api('/profile', { method: 'PUT', body: { profile: clean } });
      this.user = user;
    } else {
      this.guest.profile = clean;
      store.set(GUEST_KEY, JSON.stringify(this.guest));
    }
    this._changed();
  }

  // Saves a finished game. Returns { gained, levelBefore, levelAfter }.
  async recordRun(run) {
    const levelBefore = this.level;
    if (this.user) {
      try {
        const { user, gained, coins } = await this._api('/progress', { method: 'POST', body: run });
        this.user = user;
        this._changed();
        return { gained, coins, levelBefore, levelAfter: this.level };
      } catch (e) {
        return { gained: 0, coins: 0, levelBefore, levelAfter: levelBefore, error: e.message };
      }
    }
    const coins = coinsForRun(run);
    const pvp = run.mode === 'pvp';
    const gained = xpForRun({ wave: pvp ? 0 : run.wave, score: pvp ? run.kills * 100 + (run.won ? 500 : 0) : run.score, kills: run.kills });
    const g = this.guest;
    g.xp += gained;
    g.coins = (g.coins || 0) + coins;
    g.stats.games++;
    g.stats.headshots += run.headshots || 0;
    if (pvp) {
      g.stats.pvpKills += run.kills;
      if (run.won) g.stats.pvpWins++;
    } else {
      g.stats.kills += run.kills;
      g.stats.bestWave = Math.max(g.stats.bestWave, run.wave);
      g.stats.bestScore = Math.max(g.stats.bestScore, run.score);
    }
    store.set(GUEST_KEY, JSON.stringify(g));
    this._changed();
    return { gained, coins, levelBefore, levelAfter: this.level };
  }

  friends() {
    return this._api('/friends');
  }
  friendAction(action, username) {
    return this._api(`/friends/${action}`, { method: 'POST', body: { username } });
  }
  leaderboard() {
    return this._api('/leaderboard');
  }
  // ---- achievements (badges) and the weekly challenge
  get badges() {
    return (this.user ? this.user.badges : this.guest.badges) || [];
  }
  // returns true the first time
  unlock(id) {
    if (this.badges.includes(id)) return false;
    if (this.user) {
      this.user.badges = [...this.badges, id];
      this._api('/achievements', { method: 'POST', body: { ids: [id] } })
        .then(({ user }) => {
          this.user = user;
          this._changed();
        })
        .catch(() => {});
    } else {
      this.guest.badges = [...this.badges, id];
      store.set(GUEST_KEY, JSON.stringify(this.guest));
    }
    this._changed();
    return true;
  }
  weekly() {
    return this._api('/weekly');
  }
  submitWeekly(wave, score) {
    if (this.user) this._api('/weekly', { method: 'POST', body: { wave, score } }).catch(() => {});
  }
  // tells the live leaderboard which wave you're on (logged-in players only)
  // (resolves with the server's answer: dropin is an admin asking to join this solo game)
  live(wave, score) {
    return this.user ? this._api('/live', { method: 'POST', body: { wave, score } }).catch(() => ({})) : Promise.resolve({});
  }
  adminDropin(username) {
    return this._api('/admin/dropin', { method: 'POST', body: { username } });
  }
  adminDropinStatus(username) {
    return this._api(`/admin/dropin?u=${encodeURIComponent(username)}`);
  }
  liveEnd() {
    if (this.user) this._api('/live', { method: 'POST', body: { end: true } }).catch(() => {});
  }
}

// ---------------------------------------------------------------- UI
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function nameTag(user) {
  const p = user.profile;
  return `<span class="tag-avatar">${esc(p.avatar)}</span><span class="tag-name" style="color:${esc(p.color)}">${esc(user.username)}</span>`;
}

// Account card in the menu plus the profile / friends / leaderboard window.
export class AccountUI {
  constructor(account) {
    this.account = account;
    this.card = document.getElementById('account-card');
    this.modal = document.getElementById('account-modal');
    // typing in any box here never triggers game keys (T for chat, numbers for guns, WASD...)
    for (const type of ['keydown', 'keyup', 'keypress']) {
      this.modal.addEventListener(type, (e) => {
        if (e.target.closest('input, textarea, select') && e.key !== 'Escape') e.stopPropagation();
      });
    }
    this.body = document.getElementById('account-body');
    this.tab = 'profile';
    this.adminActions = null; // set by the game: { god, ammo, toggle(name), run(action, value), inSolo }
    // friend chat; the game sets roomCode() (your room, for invites) and joinRoom(code)
    this.chatWith = null;
    this.dm = { list: [], last: 0, timer: 0 };
    this.roomCode = () => null;
    this.joinRoom = null;
    // On the home screen the window is a page under the top bar (a tab), not a pop-up.
    // The game sets dock() (true while the lobby is showing) and onShow(tab) / onHide().
    this.dock = () => false;
    this.onShow = null;
    this.onHide = null;
    account.onParty(() => {
      this.renderCard();
      if (!this.modal.classList.contains('hidden') && this.tab === 'friends' && !this.chatWith) this._loadFriends();
    });
    // a pop-up when someone sends you a friend request
    this.toasts = document.createElement('div');
    this.toasts.id = 'toasts';
    document.body.appendChild(this.toasts);
    this.shownRequests = new Set();
    account.onRequests((list) => {
      this.renderCard();
      for (const name of list) {
        if (this.shownRequests.has(name)) continue;
        this.shownRequests.add(name);
        this._friendToast(name);
      }
      for (const el of this.toasts.querySelectorAll('[data-req]')) if (!list.includes(el.dataset.req)) el.remove();
      if (!this.modal.classList.contains('hidden') && this.tab === 'friends' && !this.chatWith) this._loadFriends();
    });
    account.onNotice = (msg) => this.toast(`<b>⛔ ${esc(msg)}</b>`, [], 12000);
    account.onUnread(() => {
      this.renderCard();
      if (!this.modal.classList.contains('hidden')) this._renderTabs();
      if (!this.modal.classList.contains('hidden') && this.tab === 'friends' && !this.chatWith) this._loadFriends();
    });
    account.onChange(() => {
      if (!account.loggedIn) this.chatWith = null;
      this.renderCard();
      if (!this.modal.classList.contains('hidden')) this.render();
    });
    this.modal.addEventListener('click', (e) => {
      if ((e.target === this.modal && !this.docked) || e.target.closest('[data-close]')) this.close();
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.tab = t.dataset.tab;
        this.chatWith = null;
        this.render();
      }
    });
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) this.open(b.dataset.open);
    });
    this.renderCard();
  }

  // a small card in the corner; buttons: [label, class, onClick]
  toast(html, buttons = [], ms = 20000, key = null) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (key) el.dataset.req = key;
    el.innerHTML = `<button class="toast-x" title="Close">✕</button><div class="toast-body">${html}</div><div class="toast-btns"></div>`;
    const row = el.querySelector('.toast-btns');
    for (const [label, cls, fn] of buttons) {
      const b = document.createElement('button');
      b.className = `btn small ${cls || ''}`;
      b.textContent = label;
      b.onclick = async () => {
        row.querySelectorAll('button').forEach((x) => (x.disabled = true));
        const after = await fn();
        if (after) el.querySelector('.toast-body').innerHTML = after;
        row.remove();
        setTimeout(() => el.remove(), after ? 2500 : 0);
      };
      row.appendChild(b);
    }
    el.querySelector('.toast-x').onclick = () => el.remove();
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.remove(), ms);
    return el;
  }

  _friendToast(name) {
    const a = this.account;
    const done = async (action) => {
      try {
        await a.friendAction(action, name);
        a._setRequests(a.requests.filter((n) => n !== name));
        return action === 'accept' ? `🎉 You and <b>${esc(name)}</b> are now friends!` : `Request from <b>${esc(name)}</b> declined.`;
      } catch (e) {
        return esc(e.message);
      }
    };
    this.toast(`👋 <b>${esc(name)}</b> wants to be your friend`, [
      ['ACCEPT', 'hot', () => done('accept')],
      ['DECLINE', 'ghost', () => done('remove')],
    ], 30000, name);
  }

  open(tab = 'profile', keepChat = false) {
    // no guests: logged out, the only thing you can open is the sign up / log in screen
    if (!this.account.loggedIn) {
      tab = 'login';
      this.mustLogin = true;
    }
    this.tab = tab;
    if (!keepChat) {
      this.chatWith = null;
      this.groupChat = null;
    }
    this.modal.classList.toggle('docked', this.account.loggedIn && !!this.dock());
    this.modal.classList.remove('hidden');
    this.render();
    if (this.docked && this.onShow) this.onShow(tab);
  }
  close() {
    // can't close the sign up / log in screen until you have an account
    if (!this.account.loggedIn && this.account.ready) return;
    const was = this.docked && !this.modal.classList.contains('hidden');
    this.modal.classList.add('hidden');
    this.modal.classList.remove('docked');
    this._stopDm();
    if (was && this.onHide) this.onHide();
  }
  get docked() {
    return this.modal.classList.contains('docked');
  }
  // straight into a chat with one friend
  openChat(name) {
    this.chatWith = name;
    this.open('friends', true);
  }

  renderCard() {
    const a = this.account;
    // red counters on the home screen tiles
    const badge = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.dataset.badge = n ? String(n) : '';
    };
    badge('quests-btn', a.questsReady);
    badge('friends-btn', a.unreadTotal + a.partyInvites.length + a.requests.length);
    if (this.onCard) this.onCard();
    const p = a.profile;
    const lvl = a.level;
    const into = a.xp - xpForLevel(lvl);
    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    // top right of the lobby: coins, level badge with XP, and your name (or log in)
    this.card.innerHTML = `
      <button class="fn-coins" data-open="shop" title="Coins: spend them in the Shop">🪙 ${a.coins}</button>
      <button class="fn-level" data-open="profile" title="${into}/${need} XP to level ${lvl + 1}">
        <b>${lvl}</b><span><i style="width:${Math.min(100, (into / need) * 100)}%"></i></span>
      </button>
      ${a.loggedIn ? `<button class="fn-me" data-open="account" style="color:${esc(p.color)}">${esc(a.name)}</button>` : '<button class="fn-me hot" data-open="login">LOG IN</button>'}`;
  }

  render() {
    if (!this.account.loggedIn) this.tab = 'login';
    this.modal.classList.toggle('locked', !this.account.loggedIn);
    this._renderTabs();
    const fn = { shop: this._shop, quests: this._quests, mastery: this._mastery, profile: this._profile, friends: this._friends, leaderboard: this._leaderboard, login: this._login, account: this._accountTab, admin: this._admin }[this.tab] || this._profile;
    fn.call(this);
  }

  _renderTabs() {
    const tabs = [['shop', '🪙 Shop'], ['quests', `📜 Quests${this.account.questsReady ? ` (${this.account.questsReady})` : ''}`], ['profile', 'Customise'], ['mastery', '🏅 Mastery'], ['friends', `Friends${this.account.unreadTotal ? ` (${this.account.unreadTotal})` : ''}`], ['leaderboard', 'Leaderboard'], [this.account.loggedIn ? 'account' : 'login', this.account.loggedIn ? 'Account' : 'Log in']];
    if (this.account.loggedIn) tabs.push(['admin', this.account.admin ? '⭐ Admin' : 'Admin code']);
    else tabs.splice(0, tabs.length, ['login', 'Log in']);
    // as a lobby tab the top bar does the switching; only show the pages that share this tab
    let shown = tabs;
    if (this.docked) {
      const group = [['profile', 'mastery'], ['account', 'login', 'admin']].find((g) => g.includes(this.tab)) || [];
      shown = tabs.filter(([id]) => group.includes(id));
      if (shown.length < 2) shown = [];
    }
    document.getElementById('account-tabs').innerHTML = shown
      .map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('');
  }

  // the paid-access screens: email sign up / log in, pick a player name, and "Almost there"
  _paywall() {
    const a = this.account;
    const c = a.cfg || {};
    const g = a.gate;
    const price = esc(c.price || '$2');
    const months = c.months === undefined ? 6 : Number(c.months) || 0;
    // what you pay: every few months (or once and forever, if the owner sets PAY_MONTHS to 0)
    const deal = months ? `${price} for every ${months} months` : `a one-time ${price}, yours forever`;
    const terms = `<details class="pay-terms"><summary>Terms &amp; Conditions (no refunds)</summary>${termsHtml(price, esc(c.payNote || 'paid cash in hand to the site owner'), months)}<p class="muted small">You can read these any time in Settings.</p></details>`;
    const done = () => {
      if (this.mustLogin && a.loggedIn) {
        this.mustLogin = false;
        this.close();
        this.onLoggedIn?.();
      } else this.render();
    };
    const wire = (id, fn) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = this.body.querySelector('.pay-msg');
        msg.textContent = '…';
        try {
          await fn(new FormData(f), e.submitter?.value);
          done();
        } catch (err) {
          msg.textContent = err.message;
        }
      });
    };
    if (g?.kind === 'unpaid') {
      this.body.innerHTML = `<div class="paygate">
        <h2>${g.expired ? 'Access ended' : 'Almost there'}</h2>
        ${priceTag(price, months)}
        <p>Your account (<b>${esc(g.email)}</b>) ${g.expired ? `ran out${g.paidUntil ? ` on ${esc(g.paidUntil)}` : ''}` : "isn't active yet"}. Access is <b>${deal}, ${esc(c.payNote || 'paid cash in hand to the site owner')}</b>. The owner unlocks accounts by hand, so it may take a while after you've paid. Once it's unlocked, check again.</p>
        ${terms}
        <form id="pay-check"><button class="btn pay-main">I've paid — check again</button></form>
        <button class="btn ghost" id="pay-out">Log out</button>
        <div class="msg pay-msg"></div></div>`;
      wire('pay-check', () => a.supaSync());
      document.getElementById('pay-out').onclick = () => a.logout().then(() => this.render());
      return;
    }
    if (g?.kind === 'name') {
      this.body.innerHTML = `<div class="paygate">
        <h2>You're in! 🎉</h2>
        <p>Pick the name other players will see.</p>
        <form id="pay-name" class="auth"><input name="username" placeholder="Player name (3-40 letters, numbers or _)" maxlength="40" required /><button class="btn pay-main">START PLAYING</button></form>
        <details class="pay-terms"><summary>I already have a War Grounds account</summary>
          <p class="muted small">Log in with your old player name and password once to keep your level, coins and unlocks.</p>
          <form id="pay-link" class="auth"><input name="username" placeholder="Old player name" maxlength="40" required /><input name="password" type="password" placeholder="Old password" required /><button class="btn small">LINK MY OLD ACCOUNT</button></form>
        </details>
        <div class="msg pay-msg"></div></div>`;
      wire('pay-name', (f) => a.supaSync({ username: String(f.get('username')).trim() }));
      wire('pay-link', (f) => a.supaSync({ link: { username: String(f.get('username')).trim(), password: String(f.get('password')) } }));
      return;
    }
    this.body.innerHTML = `<div class="paygate">
      ${g?.kind === 'confirm' ? `<p class="must-login">📧 We sent a link to <b>${esc(g.email)}</b>. Click it to confirm your email, then log in here.</p>` : ''}
      ${this.mustLogin ? '<p class="must-login">🔒 <b>Make an account (or log in) to start playing.</b></p>' : ''}
      <h2>Get War Grounds</h2>
      ${priceTag(price, months)}
      <p class="muted">${months ? `${price} for every ${months} months` : `One payment of ${price}, yours forever`}, ${esc(c.payNote || 'paid cash in hand to the site owner')}. No refunds. Make your account first, then pay the owner to have it switched on.</p>
      <form id="pay-auth" class="auth">
        <input name="email" type="email" placeholder="Email" autocomplete="email" required />
        <input name="password" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" minlength="6" required />
        <div class="row"><button class="btn" value="in">LOG IN</button><button class="btn ghost" value="up">SIGN UP</button></div>
      </form>
      ${terms}
      <div class="msg pay-msg"></div></div>`;
    wire('pay-auth', (f, which) => (which === 'up' ? a.supaSignUp(String(f.get('email')).trim(), String(f.get('password'))) : a.supaSignIn(String(f.get('email')).trim(), String(f.get('password')))));
  }

  _login() {
    if (this.account.paywall) return this._paywall();
    this.body.innerHTML = `
      ${this.mustLogin ? '<p class="must-login">🔒 <b>Make a free account (or log in) to start playing.</b> It only takes a username and a password.</p>' : ''}
      <p class="muted">An account saves your level, unlocks and stats on the server, and lets you add friends.</p>
      <form id="auth-form" class="auth">
        <input name="username" placeholder="Username" autocomplete="username" maxlength="40" required />
        <input name="password" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" maxlength="128" required />
        <div class="row">
          <button type="submit" data-action="login" class="btn small">LOG IN</button>
          <button type="submit" data-action="register" class="btn small ghost">CREATE ACCOUNT</button>
        </div>
        <div id="auth-msg" class="msg"></div>
      </form>
`;
    const form = document.getElementById('auth-form');
    let action = 'login';
    form.querySelectorAll('button[data-action]').forEach((b) => b.addEventListener('click', () => (action = b.dataset.action)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = document.getElementById('auth-msg');
      msg.textContent = '…';
      try {
        if (action === 'register') await this.account.register(fd.get('username'), fd.get('password'));
        else await this.account.login(fd.get('username'), fd.get('password'));
        // came here from PLAY: straight back to the lobby, ready to play
        if (this.mustLogin) {
          this.mustLogin = false;
          this.close();
          this.onLoggedIn?.();
          return;
        }
        this.tab = 'profile';
        this.render();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  }

  _accountTab() {
    const s = this.account.stats;
    this.body.innerHTML = `
      <div class="stats-grid">
        <div><b>${s.bestWave}</b>Best wave</div><div><b>${s.bestScore}</b>Best score</div>
        <div><b>${s.kills}</b>Zombie kills</div><div><b>${s.headshots}</b>Headshots</div>
        <div><b>${s.pvpKills}</b>PvP kills</div><div><b>${s.pvpWins}</b>PvP wins</div>
        <div><b>${s.games}</b>Games</div><div><b>${this.account.xp}</b>Total XP</div>
      </div>
      ${this.account.paywall ? `<p class="muted small">Logged in as <b>${esc(this.account.email || '')}</b>${this.account.user?.paidUntil ? ` · access until <b>${esc(this.account.user.paidUntil)}</b>` : ''}</p>` : ''}
      <button id="logout-btn" class="btn small ghost">LOG OUT</button>
      ${this.account.admin ? '<div id="all-accounts"></div>' : ''}`;
    document.getElementById('logout-btn').onclick = () => this.account.logout().then(() => this.close());
    if (this.account.admin) this._allAccounts('', 0);
  }

  // admin: every account on the site and every guest browser
  async _allAccounts(q, page) {
    const el = document.getElementById('all-accounts');
    if (!el) return;
    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.innerHTML = `<h3>⭐ Every account</h3>
        <form id="acc-find" class="auth inline admin-row"><input name="q" placeholder="Search by name" maxlength="40" /><button class="btn small">SEARCH</button></form>
        <div id="acc-list" class="admin-players acc-list">Loading…</div>`;
      document.getElementById('acc-find').onsubmit = (e) => {
        e.preventDefault();
        this._allAccounts(String(new FormData(e.target).get('q') || ''), 0);
      };
    }
    const list = document.getElementById('acc-list');
    let r;
    try {
      r = await this.account.adminAccounts(q, page);
    } catch (err) {
      list.textContent = err.message;
      return;
    }
    const date = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : '?');
    const ago = (t) => {
      const m = Math.round((Date.now() - t) / 60000);
      return m < 2 ? 'now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
    };
    const status = (u) => (u.banned ? '<b class="bad">BANNED</b>' : u.timeoutMins ? '<b class="bad">timed out</b>' : u.room ? `in <b>${esc(u.room)}</b>` : '');
    const acc = r.accounts
      .map((u) => `<div class="friend admin-player"><span class="dot ${u.online ? 'on' : ''}"></span><b>${esc(u.username)}</b>${u.admin ? ' ⭐' : ''}
        <span class="muted">Lv ${u.level} · 🪙 ${u.coins} · ${u.email ? `📧 ${esc(u.email)} · ` : ''}best wave ${u.bestWave} · ${u.games} games · joined ${date(u.created)} · seen ${ago(u.lastSeen)} ${status(u)}</span>
        <span class="actions"><button data-manage="${esc(u.username)}">MANAGE</button></span></div>`)
      .join('');
    const guests = r.guests
      .map((g) => `<div class="friend admin-player"><span class="dot ${g.online ? 'on' : ''}"></span><b class="muted">Guest #${esc(g.id)}</b>
        <span class="muted">Lv ${g.level} · best wave ${g.bestWave} · ${g.games} games · first seen ${date(g.created)} · seen ${ago(g.lastSeen)}</span>
        <span class="actions"><button data-manage="${esc(g.id)}">MANAGE</button></span></div>`)
      .join('');
    const pages = Math.max(Math.ceil(r.total / 50), 1);
    list.innerHTML = `<p class="muted small">${q ? `${r.total} account${r.total === 1 ? '' : 's'} starting with "${esc(q)}"` : `${r.total} accounts`} · page ${page + 1}/${pages}
        ${page > 0 ? '<a href="#" data-pg="-1">◀ newer</a>' : ''} ${page + 1 < pages ? '<a href="#" data-pg="1">older ▶</a>' : ''}</p>
      <h5>Accounts</h5>${acc || '<p class="muted small">None.</p>'}
`;
    list.querySelectorAll('[data-pg]').forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      this._allAccounts(q, page + Number(a.dataset.pg));
    }));
    // manage: the admin tab's player tools, searched for that name
    list.querySelectorAll('[data-manage]').forEach((b) => (b.onclick = () => {
      this.open('admin');
      setTimeout(() => {
        const f = document.getElementById('admin-find');
        if (f) f.q.value = b.dataset.manage;
        this._adminPlayers(b.dataset.manage);
      }, 50);
    }));
  }

  _profile() {
    const a = this.account;
    const p = { ...a.profile };
    const lvl = a.unlockLevel;
    const section = (kind, title, list, render) => `
      <h4>${title}</h4>
      <div class="pick-row" data-kind="${kind}">
        ${list
          .map(([id, need, label, extra, glow]) => {
            const locked = need > lvl && !a.items[cosmeticItemId(kind, id)];
            // Halloween ones: only for candy, and only shown while it's on (or once you have them)
            const candy = need >= EVENT_LEVEL ? CANDY_SHOP.find(([k, i]) => k === kind && i === id)?.[3] : null;
            if (candy && locked && !isHalloween()) return '';
            const deal = isDeal(kind, id); // a 50c deal: real money only
            const price = locked && !candy && !deal ? cosmeticPrice(kind, id) : null;
            const tip = locked ? (candy ? 'Halloween: buy it with candy in the Shop' : deal ? `In the Shop's ${DEAL_PRICE} Deals: ${DEAL_COINS} coins or ${DEAL_PRICE}` : `Unlocks at level ${need}, or buy it in the shop`) : esc(label || id);
            return `<button class="pick ${p[kind] === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-id="${esc(id)}" ${locked ? 'disabled' : ''} title="${tip}">${render(id, label, extra, glow)}${locked ? `<i>${candy ? `🎃 🍬${candy}` : deal ? `🪙${DEAL_COINS} · 💵${DEAL_PRICE}` : `Lv ${need} · 🪙${price}`}</i>` : ''}</button>`;
          })
          .join('')}
      </div>`;
    this.body.innerHTML = `
      <div class="preview">${nameTag({ username: a.name, profile: p })} <span class="ac-title">${esc(p.title)}</span></div>
      ${this._lookPicker(p)}
      ${section('avatar', 'Avatar', AVATARS, (id) => `<span class="big">${id}</span>`)}
      ${section('color', 'Name colour', [...NAME_COLORS, ...(Array.isArray(a.items.ccolors) ? a.items.ccolors : []).map((c) => [c, 0, 'Special'])], (id, label) => `<span class="swatch" style="background:${id}"></span>${label}`)}
      ${section('title', 'Title (name tag)', [...TITLES, ...(Array.isArray(a.items.ctitles) ? a.items.ctitles : []).map((t) => [t, 0])], (id) => esc(id))}
      ${section('crosshair', 'Crosshair colour', CROSSHAIRS, (id, label) => `<span class="swatch" style="background:${crosshairPaint(id).fill}"></span>${label}`)}
      ${section('reticle', 'Crosshair shape', RETICLES, (id, label) => `${xhDemo(id, p.crosshair)}${label}`)}
      ${section('finish', 'Gun finish', FINISHES, (id, label, color, glow) => `<span class="swatch${glow ? ' glow' : ''}" style="background:${color};${glow ? `--glow:${glow}` : ''}"></span>${label}`)}
      ${this._petPicker(p)}
      <h4>Quick chat wheel <span class="muted small">(press Z in game · up to ${QUICK_LEN} letters each · leave one empty for the default)</span></h4>
      <form id="quick-form" class="quick-chat">
        ${cleanQuick(a.items.quick)
          .map((t, i) => `<label><b>${i + 1}</b><input name="q${i}" maxlength="${QUICK_LEN}" placeholder="${esc(DEFAULT_QUICK[i])}" value="${esc(t)}" autocomplete="off" /></label>`)
          .join('')}
        <button class="btn small">SAVE QUICK CHAT</button>
      </form>
      <div id="profile-msg" class="msg">${a.loggedIn ? 'Saved to your account.' : 'Guest: saved in this browser.'} Level up to unlock more.</div>`;
    document.getElementById('quick-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const list = Array.from({ length: QUICK_MAX }, (_, i) => f.get(`q${i}`) || '');
      a.setQuickChat(list).then(
        () => (document.getElementById('profile-msg').textContent = 'Quick chat saved: press Z in game.'),
        (err) => (document.getElementById('profile-msg').textContent = err.message),
      );
    });
    this._petEvents(p, (t) => (document.getElementById('profile-msg').textContent = t));
    this._lookEvents(p, (t) => (document.getElementById('profile-msg').textContent = t));
    // achievements as badges
    const have = new Set(a.badges);
    this.body.insertAdjacentHTML(
      'beforeend',
      `<h3>🏅 Achievements <span class="muted small">${have.size}/${ACHIEVEMENTS.length}</span></h3>
      <div class="badges">${ACHIEVEMENTS.map((b) => `<div class="badge ${have.has(b.id) ? 'got' : ''}" title="${esc(b.desc)}"><b>${b.icon}</b><span>${esc(b.name)}</span><small>${esc(b.desc)}</small></div>`).join('')}</div>`,
    );
    this.body.querySelectorAll('.pick-row[data-kind]').forEach((row) => {
      row.addEventListener('click', async (e) => {
        const b = e.target.closest('.pick');
        if (!b || b.disabled) return;
        p[row.dataset.kind] = b.dataset.id;
        try {
          await a.saveProfile(p);
        } catch (err) {
          document.getElementById('profile-msg').textContent = err.message;
        }
      });
    });
  }

  // Your character: skin, hair, facial hair, headwear, top and trousers, with a spinning preview.
  _lookPicker(p) {
    // picks still being saved win over the last saved copy (quick clicks don't undo each other)
    // before the big launch: admins, and anyone who's found a piece in an event
    if (!CHARACTERS_LIVE && !this.account.admin && !anyPieces(this.account.items) && !ownsPaidChar(this.account.items)) return '';
    if (this.lookDraft) p.look = this.lookDraft;
    const L = p.look;
    const swatches = (key, list) =>
      `<div class="pick-row look-sw">${list.map((c) => `<button class="pick sw ${L[key] === c ? 'on' : ''}" data-look="${key}" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        <label class="pick pet-custom" title="Any colour"><input type="color" value="${esc(L[key])}" data-lookc="${key}" /> Custom</label></div>`;
    // what each character's gear is, and whether it can come off
    const gearName = { man: 'Socks', footballer: 'Socks', cricketer: 'Socks', adventurer: 'Backpack', swat: 'Kit', king: 'Armour and crown', astronaut: 'Light panels' }[L.model] || 'Gear';
    const space = L.model === 'astronaut';
    // the Astronaut's ready-made colours
    const presets = space
      ? `<h5>Colours</h5><div class="pick-row">${ASTRONAUT_PRESETS.map(([n, c], i) => `<button class="pick" data-lookpreset="${i}"><span class="swatch" style="background:${c.topColor}"></span>${n}</button>`).join('')}</div>`
      : '';
    const gearToggle = L.model === 'adventurer' || L.model === 'king' ? `<div class="pick-row"><button class="pick ${L.hat !== 'none' ? 'on' : ''}" data-look="hat" data-v="helmet">${L.model === 'king' ? 'Crown on' : 'Wearing it'}</button><button class="pick ${L.hat === 'none' ? 'on' : ''}" data-look="hat" data-v="none">${L.model === 'king' ? 'No crown' : 'Off'}</button></div>` : '';
    const note = CHARACTERS_LIVE || !this.account.admin ? 'other players see it online, and your arms match it · 🧩 unlock more in events' : 'ADMIN PREVIEW: players only see it once they find a piece in an event';
    // the colour pickers (not for the players with a fixed look)
    const colours = () => `          ${presets}
          <h5>${space ? 'Visor' : 'Skin'}</h5>${swatches('skin', space ? LOOK_CLOTH : LOOK_SKIN)}
          ${L.model === 'swat' ? '' : `<h5>${space ? 'Stripes' : 'Hair'}</h5>${swatches('hairColor', space ? LOOK_CLOTH : LOOK_HAIR_COLORS)}`}
          <h5>${space ? 'Suit' : 'Top'}</h5>${swatches('topColor', LOOK_CLOTH)}
          <h5>${space ? 'Suit (dark parts)' : 'Trousers'}</h5>${swatches('pants', LOOK_CLOTH)}
          <h5>${gearName}</h5>${gearToggle}${L.hat === 'none' && gearToggle ? '' : swatches('hatColor', LOOK_CLOTH)}
          <p class="muted small">Back to its own colours: pick the character again.</p>`;
    return `<h4>🧍 Character <span class="muted small">(${note})</span></h4>
      <div class="look-box">
        <div class="look-wrap"><canvas id="look-preview" class="look-preview"></canvas><div id="look-loading" class="look-loading hidden">Loading…</div><div class="look-hint">↔ drag to turn</div></div>
        <div class="look-opts">
          <h5>Character</h5><div class="pick-row">${LOOK_MODELS.filter(([id]) => this.account.admin || !ADMIN_CHARS.includes(id)).map(([id, n]) => {
            // locked ones: how many of their 4 puzzle pieces you have (they come from events)
            const open = charUnlocked(this.account.items, id, this.account.admin);
            const set = PIECE_SETS.find((s) => s.char === id);
            if (!open && PAID_CHARS[id]) return `<button class="pick locked" disabled title="In the Shop's Characters">🔒 ${n} <i>💵 ${PAID_CHARS[id].price} in the Shop</i></button>`;
            return open
              ? `<button class="pick ${L.model === id ? 'on' : ''}" data-look="model" data-v="${id}">${n}</button>`
              : `<button class="pick locked" disabled title="Collect all 4 puzzle pieces in an event to unlock">🔒 ${n} <i>🧩 ${piecesOf(this.account.items, id).length}/4${set ? ` · ${set.rarity}` : ''}</i></button>`;
          }).join('')}</div>
          ${FIXED_LOOK.includes(L.model) ? '<p class="muted small">This player\'s skin, hair and kit are fixed: they always look like this.</p>' : colours()}
        </div>
      </div>`;
  }
  _lookEvents(p, msg) {
    const canvas = document.getElementById('look-preview');
    if (canvas) {
      try {
        // one preview for good: its canvas moves into each new copy of the page (no new 3D view per click)
        if (this.lookPreview?.alive) canvas.replaceWith(this.lookPreview.canvas);
        else this.lookPreview = new CharacterPreview(canvas);
        const loadingEl = document.getElementById('look-loading');
        this.lookPreview.onLoading = (on) => {
          if (!loadingEl.isConnected) return;
          loadingEl.classList.toggle('hidden', !on);
          loadingEl.textContent = on === 'fail' ? "Couldn't load: check your connection" : 'Loading…';
        };
        this.lookPreview.show(p.look);
        loadAllCharacterModels();
      } catch {
        canvas.remove(); // no WebGL for a second canvas: the pickers still work
      }
    }
    const save = async (key, v, colors = null) => {
      let look = { ...(this.lookDraft || p.look), [key]: v };
      // picking a 3D character starts from its own colours (or a preset's)
      if (key === 'model' && MODEL_COLORS[v]) look = { ...look, ...MODEL_COLORS[v], hat: 'helmet', ...colors };
      this.lookDraft = look;
      p.look = look;
      this.lookPreview?.show(look);
      try {
        await this.account.saveProfile({ ...this.account.profile, look });
      } catch (err) {
        msg(err.message);
      }
      if (this.lookDraft === look) this.lookDraft = null;
    };
    this.body.querySelectorAll('[data-look]').forEach((b) => (b.onclick = (e) => (e.stopPropagation(), save(b.dataset.look, b.dataset.v))));
    this.body.querySelectorAll('[data-lookpreset]').forEach((b) => (b.onclick = (e) => (e.stopPropagation(), save('model', 'astronaut', ASTRONAUT_PRESETS[+b.dataset.lookpreset][1]))));
    this.body.querySelectorAll('[data-lookc]').forEach((inp) => {
      inp.onclick = (e) => e.stopPropagation();
      inp.oninput = () => this.lookPreview?.show({ ...p.look, [inp.dataset.lookc]: inp.value });
      inp.onchange = () => save(inp.dataset.lookc, inp.value);
    });
  }

  // The wolf companion: how to buy it (real money, paid to the owner), or turning it on and picking its colour.
  _petPicker(p, shop = false) {
    const a = this.account;
    const note = esc(a.cfg?.payNote || 'paid cash in hand to the site owner');
    if (!a.ownsWolf) {
      return `<div class="pet-card">
        <div class="pet-art">🐺</div>
        <div class="pet-info"><b>Wolf companion</b> <span class="pet-price">${esc(a.wolfPrice)}</span>
          <p class="muted small">A wolf that runs by your side in every mode and bites zombies near you. You pick its colour and where it walks, and it levels up and unlocks masteries as it kills. Real money, ${note}.</p>
          <p class="small">${a.loggedIn ? `To buy it: pay the owner and tell them your player name, <b>${esc(a.name)}</b>. They switch your wolf on, then it shows up here.` : 'Log in first: the wolf goes on your account.'}</p></div>
      </div>`;
    }
    const color = p.petColor || '#8a8f96';
    const lvl = petLevel(a.items);
    const xp = a.items.pet_xp || 0;
    const need = petXpNeeded(lvl);
    const max = lvl >= PET_MAX_LEVEL;
    const next = PET_MASTERIES.find((m) => m.lvl > lvl);
    return `<div class="pet-card owned">
        <div class="pet-art" style="color:${esc(color)}">🐺<span class="pet-lvl">Lv ${lvl}</span></div>
        <div class="pet-info"><b>Your wolf</b> <span class="muted small">${shop ? '(owned · change it in Profile too)' : '(owned)'}</span>
          <div class="pet-xp"><i style="width:${max ? 100 : Math.round((xp / need) * 100)}%"></i></div>
          <p class="muted small">${max ? `Level ${PET_MAX_LEVEL}: as strong as it gets.` : `${xp}/${need} XP to level ${lvl + 1} (1 XP for every zombie it kills)${next ? ` · next mastery at level ${next.lvl}: ${next.icon} ${esc(next.name)}` : ''}.`}
            Bites +${(lvl - 1) * 8}% harder.</p>
          ${max ? '' : `<p class="small">⏫ Skip ahead: <b>${esc(a.wolfLevelPrice)} a level</b>, ${note}. Tell the owner your player name, <b>${esc(a.name)}</b>, and how many levels.</p>`}
          <div class="pick-row pet-on">
            <button class="pick ${p.pet === 'wolf' ? 'on' : ''}" data-pet="wolf">🐺 Out with me</button>
            <button class="pick ${p.pet !== 'wolf' ? 'on' : ''}" data-pet="none">Stay home</button>
          </div>
          <div class="pick-row pet-spots">${PET_SPOTS.map(([id, n]) => `<button class="pick ${(p.petSpot || 'right') === id ? 'on' : ''}" data-petspot="${id}">${n}</button>`).join('')}</div>
          <div class="pick-row pet-colors">${PET_COLORS.map(([c, n]) => `<button class="pick ${color === c ? 'on' : ''}" data-petcolor="${c}" title="${n}"><span class="swatch" style="background:${c}"></span>${n}</button>`).join('')}
            <label class="pick pet-custom" title="Any colour you like"><input type="color" value="${esc(color)}" data-petcustom /> Custom</label>
          </div>
          <h5 class="pet-mh">Masteries</h5>
          <div class="pet-masteries">${PET_MASTERIES.map((m) => `<div class="pet-m ${lvl >= m.lvl ? 'got' : ''}" title="${esc(m.desc)}"><b>${m.icon}</b><span>${esc(m.name)}</span><small>${lvl >= m.lvl ? esc(m.desc) : `Level ${m.lvl}`}</small></div>`).join('')}</div>
        </div>
      </div>`;
  }
  _petEvents(p, msg) {
    const a = this.account;
    const save = async (change) => {
      Object.assign(p, change);
      try {
        await a.saveProfile(p);
      } catch (err) {
        msg(err.message);
      }
    };
    this.body.querySelectorAll('[data-pet]').forEach((b) => (b.onclick = (e) => (e.stopPropagation(), save({ pet: b.dataset.pet }))));
    this.body.querySelectorAll('[data-petspot]').forEach((b) => (b.onclick = (e) => (e.stopPropagation(), save({ petSpot: b.dataset.petspot }))));
    this.body.querySelectorAll('[data-petcolor]').forEach((b) => (b.onclick = (e) => (e.stopPropagation(), save({ petColor: b.dataset.petcolor, pet: 'wolf' }))));
    const custom = this.body.querySelector('[data-petcustom]');
    if (custom) {
      custom.onclick = (e) => e.stopPropagation();
      custom.onchange = () => save({ petColor: custom.value, pet: 'wolf' });
    }
  }

  // the Halloween shop: cosmetics for candy, while the event's on
  _candyShop() {
    const a = this.account;
    const cards = CANDY_SHOP.map(([kind, id, label, price, color, glow]) => {
      const owned = !!a.items[cosmeticItemId(kind, id)] || a.unlockLevel >= EVENT_LEVEL;
      const show = cosShow(kind, id, label, color, glow, a.profile.crosshair);
      return `<div class="cos-item candy"><span class="muted small">${glow ? 'Halloween gun skin' : KIND_NAMES[kind]}</span> ${show} ${owned ? '<span class="maxed">OWNED</span>' : `<button class="btn small" data-candy="${cosmeticItemId(kind, id)}" ${a.candy < price ? 'disabled' : ''}>🍬 ${price}</button>`}</div>`;
    }).join('');
    return `<div class="candy-shop"><div class="shop-head"><span class="coins big">🍬 ${a.candy}</span>
        <span><b>🎃 HALLOWEEN SHOP</b> <span class="muted">· only while Halloween is on${a.season ? ` (until the end of ${esc(new Date(a.season.endsAt - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' }))})` : ''} · zombies drop candy (bosses a big pile) · yours for good · Halloween guns hide around the maps</span></span></div>
      <div class="hw-guns">${HALLOWEEN_GUNS.map((g) => {
        const pic = gunIcon(g);
        return `<div class="hw-gun">${pic ? `<img src="${pic}" alt="" />` : `<span>${GUNS[g].icon}</span>`}<b>${esc(GUNS[g].name)}</b></div>`;
      }).join('')}</div>
      ${a.loggedIn ? '' : '<p class="muted small">Log in to collect candy and spend it.</p>'}
      <div class="cos-list">${cards}</div></div>`;
  }
  // the admin's real-money items: paid to the owner in person, who hands them out
  // the admin's shop items: coin ones (buy them here) and real-money ones (paid to the owner, who hands them out)
  _paidShop(edit, editForm, tools) {
    const a = this.account;
    if (!a.paidItems.length) return edit ? '<h4>💵 Specials</h4><p class="muted small">Nothing yet: add items in Admin → 💵 Shop.</p>' : '';
    const note = esc(a.cfg?.payNote || 'paid cash in hand to the site owner');
    const list = a.paidItems;
    const card = (i) => {
      if (edit && this.shopEditing === `paid:${i.id}`) return editForm(`paid:${i.id}`, { icon: i.icon, name: i.name, desc: i.desc, price: i.currency === 'coins' ? i.coins : i.price, money: i.currency !== 'coins', priceLabel: i.currency === 'coins' ? 'Price (coins)' : 'Price (real money, e.g. $2)' });
      const n = list.indexOf(i);
      const have = a.items[`paid_${i.id}`] || 0;
      const once = i.give !== 'coins' && i.give !== 'candy' && i.give !== 'none';
      const swatch = i.give === 'namecolor' ? `<span class="swatch" style="background:${esc(i.what)}"></span>` : '';
      const buy = i.currency === 'coins'
        ? have && once ? '<span class="maxed">OWNED</span>' : `<button class="btn small" data-custom="${esc(i.id)}" ${a.coins < i.coins ? 'disabled' : ''}>🪙 ${i.coins}</button>`
        : `<span class="pet-price">💵 ${esc(i.price)}</span>`;
      const move = edit ? `<div class="shop-move"><button class="chipbtn" data-pmove="${n}" data-d="-1" ${n ? '' : 'disabled'} title="Move left">◀</button><button class="chipbtn" data-pmove="${n}" data-d="1" ${n < list.length - 1 ? '' : 'disabled'} title="Move right">▶</button></div>` : '';
      return `<div class="shop-card">${tools(`paid:${i.id}`)}${move}<div class="si">${esc(i.icon)}</div><div class="sn">${swatch}${esc(i.name)}</div><div class="sd">${esc(i.desc || paidGives(i))}</div>${have && i.currency !== 'coins' ? `<div class="owned-count">Bought${have > 1 ? ` ×${have}` : ''} ✓</div>` : ''}${buy}</div>`;
    };
    const money = list.some((i) => i.currency !== 'coins');
    return `<h4>💵 Specials ${money ? `<span class="muted small">(💵 ones: real money, ${note})</span>` : ''}</h4>
      ${money ? `<p class="small">${a.loggedIn ? `To buy a 💵 one: pay the owner and tell them your player name, <b>${esc(a.name)}</b>, and what you're buying. They give it to you, then it shows up on your account.` : 'Log in first: it goes on your account.'}</p>` : ''}
      <div class="shop-grid">${list.map(card).join('')}</div>`;
  }
  // the characters bought with real money (PAID_CHARS): paid to the owner, who gives them out
  _charShop() {
    const a = this.account;
    const note = esc(a.cfg?.payNote || 'paid cash in hand to the site owner');
    const cards = Object.entries(PAID_CHARS).map(([id, c]) => {
      const have = a.items[`skin_${id}`] || a.admin;
      return `<div class="shop-card char-card"><canvas class="char-prev" data-charprev="${id}" width="180" height="230"></canvas>
        <div class="sn">${c.icon} ${esc(c.name)}</div><div class="sd">${esc(c.desc)}</div>
        ${have ? '<div class="owned-count">Yours ✓ · wear it in Locker → Character</div>' : `<span class="pet-price">💵 ${esc(c.price)}</span>`}</div>`;
    });
    return `<h4>🧍 Characters <span class="muted small">(real money, ${note})</span></h4>
      <p class="small">${a.loggedIn ? `To buy one: pay the owner and tell them your player name, <b>${esc(a.name)}</b>, and which character. They give it to you, then you wear it from Locker → Character.` : 'Log in first: it goes on your account.'}</p>
      <div class="shop-grid">${cards.join('')}</div>`;
  }
  // 50c Deals: the run items (also with coins next to the Revive Token) and cosmetics you can't unlock, each for
  // 50c of real money (paid to the owner, who gives it out) or for coins
  _deals() {
    const a = this.account;
    const note = esc(a.cfg?.payNote || 'paid cash in hand to the site owner');
    const items = DEAL_ITEMS.map((id) => shopDef(SHOP.find((d) => d.id === id), a.shopEdits))
      .filter((d) => !d.hidden)
      .map((d) => {
        const price = priceOf(d.id, a.items, a.shopEdits);
        return `<div class="cos-item deal"><span class="big">${esc(d.icon)}</span> <b>${esc(d.name)}</b> <span class="muted small">(you have ${a.items[d.id] || 0})</span> ${price === null ? '<span class="maxed">MAX</span>' : `<button class="btn small" data-buy="${d.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`} <span class="pet-price">💵 ${DEAL_PRICE}</span></div>`;
      })
      .join('');
    const cards = DEALS.map(([kind, id, label, color, glow]) => {
      const owned = !!a.items[cosmeticItemId(kind, id)];
      const show = kind === 'avatar' ? `<span class="big">${id}</span> ${esc(label)}` : cosShow(kind, id, label, color, glow, a.profile.crosshair);
      return `<div class="cos-item deal"><span class="muted small">${KIND_NAMES[kind]}</span> ${show} ${owned ? '<span class="maxed">OWNED</span>' : `<button class="btn small" data-buy="${cosmeticItemId(kind, id)}" ${a.coins < DEAL_COINS ? 'disabled' : ''}>🪙 ${DEAL_COINS}</button> <span class="pet-price">💵 ${DEAL_PRICE}</span>`}</div>`;
    }).join('');
    return `<h4>💵 ${DEAL_PRICE} Deals <span class="muted small">(each one ${DEAL_PRICE} of real money, ${note}, or buy it with coins)</span></h4>
      <p class="small">${a.loggedIn ? `For ${DEAL_PRICE}: pay the owner and tell them your player name, <b>${esc(a.name)}</b>, and which one. They give it to you. Or press the 🪙 button to buy it with coins.` : 'Log in first: it goes on your account.'}</p>
      <h5>Run items <span class="muted small">(used at the start of your next run)</span></h5>
      <div class="cos-list">${items}</div>
      <h5>Cosmetics <span class="muted small">(yours for good: wear them from the Locker)</span></h5>
      <div class="cos-list">${cards}</div>`;
  }
  _shop() {
    const a = this.account;
    const items = a.items;
    const edit = a.admin && this.shopEdit;
    // an edit form in place of a card (admin: ✏️), for one of the Shop's items or a special
    const editForm = (key, f) => `<form class="shop-card shop-form" data-editform="${esc(key)}">
        <input name="icon" maxlength="8" value="${esc(f.icon)}" placeholder="Icon" />
        <input name="name" maxlength="40" value="${esc(f.name)}" placeholder="Name" required />
        <textarea name="desc" maxlength="200" rows="2" placeholder="Description">${esc(f.desc || '')}</textarea>
        <label class="small">${esc(f.priceLabel)} <input name="price" ${f.money ? 'maxlength="20"' : 'type="number" min="1"'} value="${esc(f.price)}" /></label>
        <div><button class="btn small">💾 SAVE</button> <button type="button" class="btn small ghost" data-editcancel>CANCEL</button></div></form>`;
    const tools = (key, hidden) => (edit ? `<div class="shop-tools">${hidden ? `<button class="chipbtn" data-restore="${esc(key)}" title="Put it back in the Shop">↺ PUT BACK</button>` : `<button class="chipbtn" data-edit="${esc(key)}" title="Edit">✏️</button><button class="chipbtn" data-del="${esc(key)}" title="Delete">🗑️</button>`}</div>` : '');
    const card = (raw) => {
      const def = shopDef(raw, a.shopEdits);
      if (def.hidden && !edit) return '';
      if (edit && this.shopEditing === `shop:${def.id}`) return editForm(`shop:${def.id}`, { icon: def.icon, name: def.name, desc: def.desc, price: def.kind === 'upgrade' ? def.base : def.price, priceLabel: def.kind === 'upgrade' ? 'Price of level 1 (each level costs more)' : 'Price (coins)' });
      const have = items[def.id] || 0;
      const price = priceOf(def.id, items, a.shopEdits);
      let status = '';
      let button = '';
      if (def.kind === 'upgrade') {
        status = `<div class="pips">${Array.from({ length: def.max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</div>`;
        button = price === null ? '<span class="maxed">MAX</span>' : `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
      } else if (def.kind === 'item') {
        // buy once; equip as many as you like
        const on = Array.isArray(items.equip) && items.equip.includes(def.id);
        if (!have) button = `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
        else button = `<button class="btn small ${on ? '' : 'ghost'}" data-itemequip="${def.id}" data-on="${on ? 0 : 1}">${on ? 'EQUIPPED ✓' : 'EQUIP'}</button>`;
      } else if (def.kind === 'gun') {
        if (!have) button = `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
        else if (items.loadout === def.gun) button = '<button class="btn small ghost" data-unequip="1">EQUIPPED ✓</button>';
        else button = `<button class="btn small ghost" data-equip="${def.gun}">EQUIP</button>`;
      } else {
        status = `<div class="owned-count">You have ${have}</div>`;
        button = price === null ? '<span class="maxed">MAX</span>' : `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
      }
      if (def.hidden) button = '<span class="maxed">TAKEN OUT</span>';
      // guns: a picture of the gun itself
      const pic = (def.kind === 'gun' || def.gear) && gunIcon(def.gun || def.gear);
      return `<div class="shop-card ${def.hidden ? 'gone' : ''}">${tools(`shop:${def.id}`, def.hidden)}<div class="si">${pic ? `<img class="shop-gunpic" src="${pic}" alt="" />` : esc(def.icon)}</div><div class="sn">${esc(def.name)}</div><div class="sd">${esc(def.desc)}</div>${status}${button}</div>`;
    };
    const lists = COSMETIC_LISTS;
    const names = KIND_NAMES;
    const cosmetics = Object.entries(lists)
      .flatMap(([kind, list]) =>
        list
          .filter(([id, need]) => need > a.unlockLevel && need < EVENT_LEVEL && !items[cosmeticItemId(kind, id)])
          .map(([id, need, label, color]) => {
            const price = cosmeticPrice(kind, id);
            const show = cosShow(kind, id, label, color, null, a.profile.crosshair);
            return `<div class="cos-item"><span class="muted small">${names[kind]}</span> ${show} <button class="btn small" data-buy="${cosmeticItemId(kind, id)}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button></div>`;
          })
      )
      .join('');
    // the sections, in the order an admin set (✏️ EDIT)
    const sections = {
      halloween: () => (isHalloween() ? this._candyShop() : ''),
      paid: () => this._paidShop(edit, editForm, tools),
      characters: () => this._charShop(),
      deals: () => this._deals(),
      upgrades: () => `<h4>Upgrades <span class="muted small">(solo runs; the flashlight in every mode)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'upgrade').map(card).join('')}</div>`,
      guns: () => `<h4>Starting gun <span class="muted small">(Own it, equip it: you spawn holding it in every mode, with unlimited ammo)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'gun').map(card).join('')}</div>`,
      items: () => `<h4>Items <span class="muted small">(🪝 buy once, then equip as many as you like: every game starts with them · press T to use one)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'item').map(card).join('')}</div>
      <h4>Run items <span class="muted small">(used up at the start of your next solo run)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'consumable').map(card).join('')}</div>`,
      pets: () => `<h4>🐺 Pets <span class="muted small">(real money)</span></h4>
      ${this._petPicker({ ...a.profile }, true)}`,
      cosmetics: () => `<h4>Cosmetics: name colours, name tags (titles), avatars, crosshair colours and shapes, gun finishes <span class="muted small">(skip the level requirement)</span></h4>
      <div class="cos-list">${cosmetics || `<p class="muted">You own every cosmetic!${a.admin ? ' (Admins have them all: players see the ones they haven\'t unlocked here.)' : ''}</p>`}</div>`,
    };
    const order = a.shopOrder;
    this.body.innerHTML = `
      <div class="shop-head"><span class="coins big">🪙 ${a.coins}</span>
        <span class="muted">Earn coins from kills, headshots and waves in solo, and from kills and wins online.</span>
        ${a.admin ? `<button class="btn small ${edit ? '' : 'ghost'} shop-edit" id="shop-edit">${edit ? '✓ DONE' : '✏️ EDIT'}</button>` : ''}</div>
      <div id="shop-msg" class="msg"></div>
      ${edit ? '<p class="muted small">⭐ Changes are for everyone straight away: ▲ ▼ move a section, ◀ ▶ move a special, ✏️ edits an item, 🗑️ deletes it (Shop items you delete can be put back).</p>' : ''}
      ${order.map((id, n) => {
        const html = sections[id]?.() || '';
        if (!html && !edit) return '';
        const bar = edit ? `<div class="shop-sec-bar"><b>${SECTION_NAMES[id]}</b><button class="chipbtn" data-smove="${n}" data-d="-1" ${n ? '' : 'disabled'}>▲</button><button class="chipbtn" data-smove="${n}" data-d="1" ${n < order.length - 1 ? '' : 'disabled'}>▼</button></div>` : '';
        return `<div class="shop-sec ${edit ? 'editing' : ''}">${bar}${html || '<p class="muted small">(empty right now)</p>'}</div>`;
      }).join('')}
      ${a.loggedIn ? '' : '<p class="muted small">Guest: coins and purchases are saved in this browser. Log in to keep them on your account.</p>'}`;
    const msg = (t) => (document.getElementById('shop-msg').textContent = t);
    const editBtn = document.getElementById('shop-edit');
    if (editBtn) editBtn.onclick = () => {
      this.shopEdit = !this.shopEdit;
      this.render();
    };
    const moved = (list, n, d) => {
      const out = [...list];
      [out[n], out[n + d]] = [out[n + d], out[n]];
      return out;
    };
    this.body.querySelectorAll('[data-smove]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await a.adminShopOrder(moved(order, Number(b.dataset.smove), Number(b.dataset.d)));
          this.render();
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    this.body.querySelectorAll('[data-pmove]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await a.adminPaidItems({ action: 'order', ids: moved(a.paidItems.map((i) => i.id), Number(b.dataset.pmove), Number(b.dataset.d)) });
          this.render();
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    // admin: edit / delete / put back (shop:<id> is one of the Shop's own items, paid:<id> a special)
    const run = async (fn) => {
      try {
        msg((await fn())?.note || '');
        this.render();
      } catch (err) {
        msg(err.message);
      }
    };
    const special = (key) => a.paidItems.find((i) => `paid:${i.id}` === key);
    this.body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => ((this.shopEditing = b.dataset.edit), this.render())));
    this.body.querySelectorAll('[data-editcancel]').forEach((b) => (b.onclick = () => ((this.shopEditing = null), this.render())));
    this.body.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.del;
        const sp = special(key);
        if (!confirm(`Delete ${sp ? sp.name : shopDef(SHOP.find((d) => `shop:${d.id}` === key), a.shopEdits).name} from the Shop? (Anyone who bought it keeps it.)`)) return;
        run(() => (sp ? a.adminPaidItems({ action: 'remove', id: sp.id }) : a.adminShopItem({ id: key.slice(5), hidden: true })));
      }),
    );
    this.body.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = () => run(() => a.adminShopItem({ id: b.dataset.restore.slice(5), hidden: false }))));
    this.body.querySelectorAll('[data-editform]').forEach((form) =>
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = form.dataset.editform;
        const f = new FormData(form);
        const set = { name: String(f.get('name')).trim(), icon: String(f.get('icon')).trim(), desc: String(f.get('desc')).trim() };
        const sp = special(key);
        this.shopEditing = null;
        run(() =>
          sp
            ? a.adminPaidItems({ action: 'add', ...sp, ...set, price: sp.currency === 'coins' ? sp.price : String(f.get('price')), coins: sp.currency === 'coins' ? Number(f.get('price')) : sp.coins })
            : a.adminShopItem({ id: key.slice(5), ...set, price: Number(f.get('price')) }),
        );
      }),
    );
    // the characters for sale: spinning so you see the number on the back
    this.body.querySelectorAll('[data-charprev]').forEach((cv) => {
      try {
        new CharacterPreview(cv).show({ model: cv.dataset.charprev, ...MODEL_COLORS[cv.dataset.charprev], hat: 'helmet' });
      } catch {
        cv.remove(); // (no WebGL for it)
      }
    });
    this.body.querySelectorAll('[data-custom]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const def = await a.buyCustom(b.dataset.custom);
          msg(def.give === 'nametag' || def.give === 'namecolor' || def.give === 'cosmetic' ? '✨ Yours! Wear it from the Locker.' : 'Bought!');
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    this.body.querySelectorAll('[data-candy]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await a.buyWithCandy(b.dataset.candy);
          msg('🎃 Yours! Wear it from the Locker.');
        } catch (err) {
          msg(err.message);
        }
      })
    );
    this.body.querySelectorAll('[data-buy]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await a.buy(b.dataset.buy);
          msg('Bought!');
        } catch (err) {
          msg(err.message);
        }
      })
    );
    this._petEvents({ ...a.profile }, msg);
    this.body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => a.setLoadout(b.dataset.equip).catch((e) => msg(e.message))));
    this.body.querySelectorAll('[data-unequip]').forEach((b) => b.addEventListener('click', () => a.setLoadout(null).catch((e) => msg(e.message))));
    this.body.querySelectorAll('[data-itemequip]').forEach((b) => b.addEventListener('click', () => a.setItemEquip(b.dataset.itemequip, b.dataset.on === '1').catch((e) => msg(e.message))));
  }

  _admin() {
    const a = this.account;
    if (!a.loggedIn) {
      this.body.innerHTML = '<p class="muted">Log in first.</p>';
      return;
    }
    if (!a.admin) {
      this.body.innerHTML = `
        <p class="muted">Enter the admin code to turn this account into an admin account.</p>
        <form id="admin-form" class="auth inline">
          <input name="code" type="password" placeholder="Admin code" maxlength="200" autocomplete="off" required />
          <button class="btn small">UNLOCK</button>
        </form>
        <div id="admin-msg" class="msg"></div>`;
      document.getElementById('admin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('admin-msg');
        msg.textContent = '…';
        try {
          await a.claimAdmin(new FormData(e.target).get('code'));
          this.render();
        } catch (err) {
          msg.textContent = err.message;
        }
      });
      return;
    }
    const act = this.adminActions;
    const solo = act && act.inSolo();
    const mp = act && act.inMP();
    const sec = this.adminSec || 'players';
    const tabs = [['players', '👥 Players'], ['game', '🎮 Game'], ['mp', '🌐 Multiplayer'], ['events', '🎉 Events'], ['shop', '💵 Shop'], ['me', '🛠️ Account & server']];
    this.body.innerHTML = `
      <div class="asubtabs">${tabs.map(([id, n]) => `<button class="chipbtn ${id === sec ? 'on' : ''}" data-asec="${id}">${n}</button>`).join('')}</div>
      <div id="admin-msg" class="msg admin-msg"></div>
    <section class="asec" data-sec="players">
      <div class="acard"><h4>📢 Announce to every player <span class="muted small">(any room or the menu; it stays on their screen until they press OK)</span></h4>
      <form class="auth inline admin-row" id="admin-announce"><input name="v" maxlength="300" placeholder="Message for every player" /><button class="btn small">📢 ANNOUNCE</button></form>
      <div class="admin-grid"><button class="btn small ghost" id="admin-announce-clear">TAKE DOWN THE ANNOUNCEMENT</button></div>
      </div>
      <div class="acard"><h4>👥 Every player <span class="muted small">(online first)</span></h4>
      <form class="auth inline admin-row" id="admin-find"><input name="q" maxlength="80" placeholder="Search by name or email (empty: everyone)" /><button class="btn small">FIND</button></form>
      <div id="admin-players" class="admin-players muted">Loading…</div>
      <form class="auth inline admin-row" id="admin-give"><input name="u" maxlength="40" placeholder="Player name" required /><input name="c" type="number" placeholder="Coins (minus takes away)" required /><button class="btn small">🪙 GIVE COINS</button></form>
      </div>
      <div class="acard"><h4>🔑 Set a password <span class="muted small">(a player forgot theirs: give them a new one, then tell them it)</span></h4>
      <form class="auth inline admin-row" id="admin-setpw"><input name="who" maxlength="120" placeholder="Player name or email" required autocomplete="off" /><input name="pw" maxlength="72" placeholder="New password (6+ characters)" required autocomplete="off" /><button class="btn small">🔑 SET PASSWORD</button></form>
      <p class="muted small">Works even with a made-up email. It also tells you the email they log in with.</p>
      </div>
    </section>
    <section class="asec" data-sec="game">
      ${solo || mp ? '' : '<p class="muted small">Most of these need a game running (solo, or a co-op room you host): start one, then press F2.</p>'}
      <div class="acard"><h4>🧟 Zombie look <span class="muted small">(yours; new zombies change)</span></h4>
        <div class="admin-grid"><button class="btn small ghost" data-run="lineup" ${solo || mp ? '' : 'disabled'}>👀 SPAWN ONE OF EVERY KIND</button></div>
        <div class="admin-grid"><button class="btn small ghost" id="admin-zmodel">${act?.zombieModels?.() ? '3D MODEL ON · SWITCH TO BLOCKS' : 'BLOCKS ON · SWITCH TO 3D MODEL'}</button></div></div>
      <div class="acard"><h4>🤖 Bots <span class="muted small">(in the room you host: every mode except events)</span></h4>
        <div class="admin-grid">${[0, 3, 5, 7].map((n) => `<button class="btn small ghost" data-addbots="${n}">${n ? `🤖 ${n} BOTS` : 'NO BOTS'}</button>`).join('')}</div></div>
      <div class="acard"><h4>📢 Ads in the maps <span class="muted small">(JINtelligence billboards, posters and warehouse signs: ${a.featureLive('adsOff') ? '<b>OFF</b>' : '<b>ON</b>'} for everyone, from the next map that loads)</span></h4>
        <div class="admin-grid">${a.featureLive('adsOff') ? '<button class="btn small" id="admin-ads" data-on="0">📢 TURN ADS ON</button>' : '<button class="btn small ghost" id="admin-ads" data-on="1">TURN ADS OFF</button>'}</div></div>
      <div class="acard"><h4>🎥 First / third person switch <span class="muted small">(saved for the big update: ${a.featureLive('view') ? '<b>DEPLOYED</b>, everyone has it' : '<b>HIDDEN</b>, only admins have it (a preview)'})</span></h4>
        <p class="muted small">P, the pause menu button and Settings → Camera. Events are third person either way.</p>
        <div class="admin-grid"><button class="btn small ghost" id="admin-view">${act?.viewName ? `MY VIEW: ${act.viewName()} · SWITCH` : 'SWITCH MY VIEW'}</button>
        ${a.featureLive('view') ? '<button class="btn small ghost" id="admin-deploy-view" data-on="0">HIDE IT AGAIN</button>' : '<button class="btn small" id="admin-deploy-view" data-on="1">🚀 DEPLOY TO EVERYONE</button>'}</div></div>
      <div class="acard"><h4>🛡️ Special gear <span class="muted small">(admins only: nobody else has it unless you give it to them, with MANAGE in the Players tab)</span></h4>
        <div class="admin-grid">${SPECIAL_GEAR.map((g) => (a.items[g.item] ? `<button class="btn small ghost" data-mygear="${g.id}" data-on="0">${g.icon} ${g.name.toUpperCase()} ✓ (REMOVE)</button>` : `<button class="btn small" data-mygear="${g.id}" data-on="1">${g.icon} GET THE ${g.name.toUpperCase()}</button>`)).join('')}</div>
        <p class="muted small">The flamethrower and bazooka come into every game you start (unlimited ammo). Press <b>H</b> in a game to get in or out of the tank: WASD to drive, click to fire the cannon; you take a quarter of the damage inside.</p></div>
      <div class="acard"><h4>🧑‍🚀 Astronaut skin <span class="muted small">(admins only: nobody else can wear it; other players see you in it online)</span></h4>
        <div class="admin-grid">${a.profile.look?.model === 'astronaut' ? '<button class="btn small ghost" id="admin-astro-off">TAKE IT OFF</button>' : '<button class="btn small" data-astro="0">🧑‍🚀 WEAR IT</button>'}
        ${ASTRONAUT_PRESETS.map(([n, c], i) => `<button class="btn small ghost" data-astro="${i}"><span class="swatch" style="background:${c.topColor}"></span>${n.toUpperCase()}</button>`).join('')}</div>
        <p class="muted small">Pick any colour for the visor, stripes, suit and panels in <b>Locker → Character</b>.</p></div>
      <div class="acard"><h4>🔄 Game version <span class="muted small">(players on an old version are restarted onto the new one automatically)</span></h4>
        <p class="muted small">This copy: <b>${esc(act?.build?.().build || '?')}</b>${act?.build?.().at && act.build().build !== 'dev' ? ` · built ${esc(new Date(act.build().at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}` : ''}</p>
        <div class="admin-grid"><button class="btn small ghost" id="admin-version">CHECK FOR A NEW VERSION</button></div></div>
      <div class="acard"><h4>🔫 Gun position <span class="muted small">(yours; everyone can change theirs in Settings)</span></h4>
        <div class="auth inline admin-row"><select id="admin-gunpos"><option value="">Pick a spot…</option>${(act?.gunPresets?.() || []).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select></div></div>
      <div class="acard"><h4>🎛️ Cheats ${mp ? '<span class="muted small">(in multiplayer they only affect you, except freeze and slow motion as co-op host)</span>' : ''}</h4>
      <div class="admin-grid">
        ${[
          ['god', 'God mode'], ['ammo', 'Infinite ammo (all guns)'], ['onehit', 'One-hit kills'], ['fly', 'Fly / noclip (Space up, C down, Shift fast)'],
          ['speed', '2× move speed'], ['freeze', 'Freeze zombies'], ['slowmo', 'Slow motion'], ['nohud', 'Hide HUD (screenshots)'],
          ['grenades', 'Infinite grenades'], ['build', 'Free building (no scrap)'], ['turrets', 'Super turrets (5× damage)'], ['shield', 'Force field never runs out'],
        ]
          .map(([id, label]) => `<label><input type="checkbox" data-toggle="${id}" ${act?.cheats[id] ? 'checked' : ''} /> ${label}${mp && ['freeze', 'slowmo'].includes(id) ? ' <span class="muted small">(co-op host only)</span>' : ''}</label>`)
          .join('')}
      </div>
      </div>
      <div class="acard"><h4>⚡ Actions</h4>
      <div class="admin-grid">
        <button class="btn small" data-run="guns" ${solo || mp ? '' : 'disabled'}>GIVE ALL GUNS</button>
        <button class="btn small" data-run="items" ${solo || mp ? '' : 'disabled'}>🪝 GIVE EVERY ITEM</button>
        <button class="btn small" data-run="mutate" ${solo || mp ? '' : 'disabled'}>MUTATE ALL MY GUNS</button>
        <button class="btn small" data-run="powerups" ${solo || mp ? '' : 'disabled'}>MAX ALL POWER-UPS</button>
        <button class="btn small" data-run="heal" ${solo || mp ? '' : 'disabled'}>FULL HEAL + OVERHEAL</button>
        <button class="btn small" data-run="boss" ${solo || mp ? '' : 'disabled'}>SPAWN BOSS</button>
        <button class="btn small" data-run="killall" ${solo || mp ? '' : 'disabled'}>KILL ALL ZOMBIES</button>
        <button class="btn small" data-run="startwave" ${solo || mp ? '' : 'disabled'}>▶ START NEXT WAVE NOW</button>
        <button class="btn small" data-run="repairbuilds" ${solo || mp ? '' : 'disabled'}>🔧 REPAIR ALL MY BUILDS</button>
        <button class="btn small" data-run="nextmod" ${solo || mp ? '' : 'disabled'}>🎲 NEXT WAVE: RANDOM TWIST</button>
        <button class="btn small" data-run="bountynow" ${solo || mp ? '' : 'disabled'}>🎯 SPAWN A BOUNTY ZOMBIE</button>
        <button class="btn small" data-run="points" ${solo || mp ? '' : 'disabled'}>💵 +5000 POINTS</button>
        <button class="btn small" data-run="allbadges">🏅 UNLOCK ALL ACHIEVEMENTS</button>
        <button class="btn small" data-run="scrap" ${solo || mp ? '' : 'disabled'}>🔩 MAX SCRAP</button>
        <button class="btn small" data-run="nades" ${solo || mp ? '' : 'disabled'}>💣 REFILL GRENADES</button>
        <button class="btn small" data-run="infinitereserve" ${solo || mp ? '' : 'disabled'}>♾️ UNLIMITED RESERVE (ALL MY GUNS)</button>
        <button class="btn small" data-run="skiptut" ${solo || mp ? '' : 'disabled'}>SKIP TUTORIAL</button>
      </div>
      <div class="auth inline admin-row">
        <span>🌙 Night waves:</span>
        <select id="admin-night">${[['auto', 'Every 4th wave (normal)'], ['night', 'Always night'], ['day', 'Never night']].map(([id, n]) => `<option value="${id}" ${act?.nightMode === id ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="auth inline admin-row">
        <select id="admin-boss" ${solo || mp ? '' : 'disabled'}>${(act?.bosses() || []).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select>
        <button class="btn small" id="admin-boss-btn" ${solo || mp ? '' : 'disabled'}>SPAWN THIS BOSS</button>
      </div>
      <div class="auth inline admin-row">
        <select id="admin-zombie" ${solo || mp ? '' : 'disabled'}>${(act?.zombieTypes() || []).map((t) => `<option>${t}</option>`).join('')}</select>
        <button class="btn small" id="admin-spawn" ${solo || mp ? '' : 'disabled'}>SPAWN 5</button>
        <select id="admin-weather" ${solo || mp ? '' : 'disabled'}>${solo ? act.weathers().map(([id, n]) => `<option value="${id}">${n}</option>`).join('') : ''}</select>
        <button class="btn small" id="admin-weather-btn" ${solo || mp ? '' : 'disabled'}>SET WEATHER</button>
      </div>
      </div>
      <div class="acard"><h4>🔢 Numbers <span class="muted small">(score, scrap, grenades, wave size and wave)</span></h4>
      <form class="auth inline admin-row" data-act="score"><input name="v" type="number" min="0" placeholder="Set score" ${solo || mp ? '' : 'disabled'} /><button class="btn small" ${solo || mp ? '' : 'disabled'}>SET SCORE</button></form>
      <form class="auth inline admin-row" data-act="setscrap"><input name="v" type="number" min="0" max="999" placeholder="Set scrap" ${solo || mp ? '' : 'disabled'} /><button class="btn small" ${solo || mp ? '' : 'disabled'}>SET SCRAP</button></form>
      <form class="auth inline admin-row" data-act="setnades"><input name="v" type="number" min="0" max="20" placeholder="Set grenades" ${solo || mp ? '' : 'disabled'} /><button class="btn small" ${solo || mp ? '' : 'disabled'}>SET GRENADES</button></form>
      <form class="auth inline admin-row" data-act="wavecap"><input name="v" type="number" min="5" max="300" placeholder="Max zombies per wave (50)" ${solo || mp ? '' : 'disabled'} /><button class="btn small" ${solo || mp ? '' : 'disabled'}>SET WAVE SIZE</button></form>
      <form class="auth inline admin-row" data-act="wave"><input name="v" type="number" min="1" max="200" placeholder="Jump to wave" ${solo || mp ? '' : 'disabled'} /><button class="btn small" ${solo || mp ? '' : 'disabled'}>SET WAVE</button></form>
      </div>
      <div class="acard"><h4>🛢️ Map props</h4>
      <div class="admin-grid">
        <button class="btn small" data-barrels="place">🛢️ RED BARREL IN FRONT OF ME</button>
        <button class="btn small bad" data-barrels="boom">💥 BLOW UP EVERY BARREL</button>
        <button class="btn small" data-barrels="back">↩ BRING BACK ALL BARRELS</button>
        <button class="btn small" data-barrels="ammo">🔫 REFILL ALL AMMO CRATES</button>
      </div>
      </div>
      <div class="acard"><h4>↩️ Undo</h4>
      <div class="admin-grid">
        <button class="btn small ghost" data-run="removeguns" ${solo || mp ? '' : 'disabled'}>REMOVE ALL GUNS</button>
        <button class="btn small ghost" data-run="unmutate" ${solo || mp ? '' : 'disabled'}>UNMUTATE GUNS</button>
        <button class="btn small ghost" data-run="resetpowerups" ${solo || mp ? '' : 'disabled'}>RESET POWER-UPS</button>
        <button class="btn small ghost" data-run="clearbuilds" ${solo || mp ? '' : 'disabled'}>REMOVE ALL BUILDS</button>
        <button class="btn small ghost" data-run="noscrap" ${solo || mp ? '' : 'disabled'}>ZERO SCRAP & GRENADES</button>
        <button class="btn small ghost" data-run="cheatsoff">TURN OFF ALL CHEATS</button>
      </div>
      </div>
    </section>
    <section class="asec" data-sec="mp">
      ${mp ? '' : '<p class="muted small">Join or create a room to use these.</p>'}
      <div class="acard"><h4>📦 Supply drop</h4>
      <div class="admin-grid"><button class="btn small" id="admin-drop">📦 SUPPLY DROP ON ME (solo or any mode)</button></div>
      </div>
      <div class="acard"><h4>🗂️ Every room <span class="muted small">(private ones too: players only see the public ones)</span> <a href="#" id="admin-rooms-refresh" class="small">refresh</a></h4>
      <div id="admin-rooms" class="admin-players muted small">Loading…</div>
      </div>
      <div class="acard"><h4>🤖 AI bots in this room <span class="muted small">(PvP modes; the host picks this in Match settings too)</span></h4>
      <div class="auth inline admin-row"><select id="admin-bots" ${mp ? '' : 'disabled'}><option value="">How many bots…</option>${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n ? `${n} bot${n > 1 ? 's' : ''}` : 'No bots'}</option>`).join('')}</select></div>
      </div>
      <div class="acard"><h4>👥 Teams in this room</h4>
      <div id="admin-teams" class="admin-players"></div>
      </div>
    </section>
    <section class="asec" data-sec="events">
      <div class="acard"><h4>🎉 Event <span class="muted small">(every server: players join it from the home screen)</span></h4>
        <div id="admin-event-status" class="muted">Checking…</div>
      </div>
      <div class="acard"><h4>▶ Host an event</h4>
        <form class="auth inline admin-row" id="admin-event-start">
          <select name="preset" id="admin-event-preset" title="Which event">${EVENT_PRESETS.map((p, i) => `<option value="${i}">${p.theme === 'halloween' ? '🎃' : '🎉'} ${esc(p.name)}</option>`).join('')}</select>
          <input name="name" maxlength="40" placeholder="Event name" class="hidden" id="admin-event-name" />
          <select name="minutes">${EVENT_DURATIONS.map(([v, n]) => `<option value="${v}" ${v === EVENT_PRESETS[0].minutes ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select name="boost">${DROP_BOOSTS.map(([v, n]) => `<option value="${v}" ${v === EVENT_PRESETS[0].boost ? 'selected' : ''}>${n} drops</option>`).join('')}</select>
          <label class="small"><input type="checkbox" name="announce" checked /> Announce it to everyone</label>
          <button class="btn small">🎉 START EVENT</button>
        </form>
        <p class="muted small" id="admin-event-desc">${esc(EVENT_PRESETS[0].desc)}</p>
        <div class="admin-grid"><button class="btn small ghost" id="admin-event-stop">⏹ END THE EVENT NOW</button></div>
      </div>
      <div class="acard"><h4>⏰ Every hour <span class="muted small">(the third-person piece hunt by itself: on the hour to half past, then a break, every hour, never stopping until you turn it off)</span></h4>
        <div id="admin-sched-status" class="muted small"></div>
        <form class="auth inline admin-row" id="admin-sched">
          <select name="preset" title="Which event">${EVENT_PRESETS.map((p, i) => `<option value="${i}">${p.theme === 'halloween' ? '🎃' : '🧩'} ${esc(p.name)}</option>`).join('')}</select>
          <label class="small"><input type="checkbox" name="announce" checked /> Announce each one</label>
          <button class="btn small" data-on="1">⏰ TURN ON</button><button class="btn small ghost" data-on="0">TURN OFF</button>
        </form>
        <div class="admin-grid"><button class="btn small" id="admin-sched-now">▶ START IT NOW (UNTIL HALF PAST)</button></div>
        <p class="muted small">It starts on the hour (5:00, 6:00…) and ends at half past (5:30, 6:30…). Late, or want it early? START IT NOW runs it straight away until the next half past. END THE EVENT NOW (above) stops this hour's one; it comes back next hour. An event you start by hand always wins.</p>
      </div>
      <div class="acard"><h4>🎃 Halloween season <span class="muted small">(on for everyone until the end of 7 November; END stops it, START brings it back)</span></h4>
        <div id="admin-season-status" class="muted small">${a.season ? `<b class="hot">🟢 ON</b> until the end of ${esc(new Date(a.season.endsAt - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' }))}` : 'Off.'}</div>
        <form class="auth inline admin-row" id="admin-season"><label class="small">until the end of <input name="until" type="date" value="${new Date(halloweenEnd() - 1).toISOString().slice(0, 10)}" /></label>
          <label class="small"><input type="checkbox" name="announce" checked /> Announce it</label>
          <button class="btn small">🎃 START HALLOWEEN</button></form>
        <div class="admin-grid"><button class="btn small ghost" id="admin-season-stop">END HALLOWEEN NOW</button></div>
        <p class="muted small">The whole game goes Halloween for everyone until that day (a week after Halloween to start with), then it ends by itself. The Halloween Night event above does the same just while it's on, and it also stops by itself a week after Halloween. Halloween guns (${HALLOWEEN_GUNS.map((id) => `${GUNS[id].icon} ${GUNS[id].name}`).join(', ')}) turn up around the maps, and the shop sells glowing Halloween gun skins for candy.</p>
        <p class="muted small">While it's on, every map (solo and online) turns into a foggy purple night with jack-o'-lanterns, little graveyards, bubbling cauldrons, pumpkin-head scarecrows, string lights, ghosts and bats, and the zombies wear pumpkin heads. Maps already loaded change when the next one loads.</p>
        <p class="muted small">Candy: zombies drop sweets while it's on (bosses a big pile), spent in the 🎃 Halloween shop at the top of the Shop on cosmetics nobody else can get (gun finishes, avatars, titles, name colours, crosshairs).</p>
        <div class="admin-grid"><button class="btn small ghost" id="admin-candy">🍬 GIVE ME 200 CANDY (TEST)</button></div>
        <div class="admin-grid"><button class="btn small ghost" id="admin-halloween-preview">${act?.halloweenPreview?.() ? '👻 PREVIEW ON (ONLY YOU) · TURN OFF' : '👻 PREVIEW IT (ONLY YOU)'}</button></div></div>
      <div class="acard"><h4>🎁 Give Halloween stuff <span class="muted small">(to anyone: candy, gun skins and the rest of the Halloween shop)</span></h4>
        <form class="auth inline admin-row" id="admin-give-candy"><input name="u" maxlength="40" placeholder="Player name" required /><input name="n" type="number" placeholder="Candy (minus takes away)" required /><button class="btn small">🍬 GIVE CANDY</button></form>
        <form class="auth inline admin-row" id="admin-give-cos"><input name="u" maxlength="40" placeholder="Player name" required />
          <select name="item">${CANDY_SHOP.map(([kind, id, label, , , glow]) => `<option value="${cosmeticItemId(kind, id)}">${kind === 'finish' ? `🔫 Gun skin: ${esc(label)}${glow ? ' (glows)' : ''}` : `${KIND_NAMES[kind]}: ${esc(kind === 'avatar' ? `${id} ${label}` : label)}`}</option>`).join('')}</select>
          <button class="btn small" data-on="1">🎁 GIVE</button><button class="btn small ghost" data-on="0">TAKE</button></form>
      </div>
      <div class="acard"><h4>ℹ️ How it works</h4>
        <p class="muted small">While it's on, the <b>JOIN EVENT</b> button in Multiplayer (under the room code) lights up. Everyone plays in <b>one match</b> (${EVENT_MAX_PLAYERS} players a room: when one fills up, a new one opens; no host): <b>Red vs Blue vs the zombies</b>, seen from behind their character, starting as the <b>Survivor</b>.
        Teams score ${EVENT_POINTS.player} points for an enemy, ${EVENT_POINTS.zombie} for a zombie, ${EVENT_POINTS.special} for a big or mutated one and ${EVENT_POINTS.boss} for a boss (one comes every 3 minutes). A new match starts by itself after each one.
        Kills can drop a glowing 🧩 <b>puzzle piece</b> (only the killer sees it); walking over it reveals which piece it is. 4 pieces unlock a character: ${PIECE_SETS.map((s) => `${s.name} (${s.rarity})`).join(', ')}. ${PIECE_COUNT} pieces in all; after that, pieces turn into coins.</p>
      </div>
      <div class="acard"><h4>🧪 Testing</h4>
        <div class="admin-grid">
          <button class="btn small" data-mypieces="all">🧩 GIVE ME EVERY PIECE</button>
          <button class="btn small ghost" data-mypieces="none">RESET MY PIECES</button>
        </div>
        <p class="muted small">You have ${totalPieces(a.items)}/${PIECE_COUNT} pieces. For a player: MANAGE in the Players tab.</p>
      </div>
    </section>
    <section class="asec" data-sec="shop">
      <div class="acard"><h4>💵 Sell something <span class="muted small">(for real money or coins: it shows in everyone's Shop)</span></h4>
        <form class="auth inline admin-row" id="admin-paid-add">
          <input name="icon" maxlength="8" placeholder="Icon (emoji)" value="💵" style="width:5.5em" />
          <input name="name" maxlength="40" placeholder="Name, e.g. Gold Name Tag" required />
          <select name="currency" title="Paid with"><option value="money">💵 Real money</option><option value="coins">🪙 Coins (they buy it themselves)</option></select>
          <input name="price" maxlength="20" placeholder="Price, e.g. $1" style="width:7em" />
          <input name="coins" type="number" min="1" placeholder="Coins" style="width:7em" class="hidden" />
          <select name="give" title="What they get">${PAID_OPTIONS.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select>
          <input name="tag" maxlength="24" placeholder="The name tag, e.g. Zombie King" />
          <label class="small hidden" data-colorpick>colour <input name="color" type="color" value="#ff5df2" /></label>
          <input name="amount" type="number" min="0" placeholder="How many" style="width:8em" class="hidden" />
          <input name="desc" maxlength="200" placeholder="What it is (shown in the Shop)" />
          <button class="btn small">➕ ADD TO SHOP</button>
        </form>
        <p class="muted small">🪙 Coins: players buy it themselves from the Shop. 💵 Real money: they pay you, then you give it to them below. Name tags and name colours are new ones nobody else has; they wear them from the Locker. "Something else" gives nothing by itself. Same name again replaces that item. Change the Shop's order with ✏️ EDIT in the corner of the Shop.</p>
      </div>
      <div class="acard"><h4>🎁 Someone paid you <span class="muted small">(real money: give them what they bought · the wolf, wolf levels, your specials and the ${DEAL_PRICE} Deals, all here)</span></h4>
        <form class="auth inline admin-row" id="admin-give-paid"><input name="u" maxlength="40" placeholder="Player name" required />
          <select name="what">
            <optgroup label="🐺 Wolf companion (${esc(a.wolfPrice)}, a level ${esc(a.wolfLevelPrice)})"><option value="wolf">🐺 The wolf</option><option value="wolflvl">⏫ 1 wolf level</option></optgroup>
            <optgroup label="💵 Specials (your items)" id="admin-give-specials"></optgroup>
            <optgroup label="🧍 Characters">${Object.entries(PAID_CHARS).map(([id, c]) => `<option value="skin:${id}">${c.icon} ${esc(c.name)} (${esc(c.price)})</option>`).join('')}</optgroup>
            <optgroup label="💵 ${DEAL_PRICE} Deals">${DEAL_ITEMS.map((id) => SHOP.find((d) => d.id === id)).map((d) => `<option value="item:${d.id}">${d.icon} Run item: ${esc(d.name)} (+1)</option>`).join('')}${DEALS.map(([kind, id, label]) => `<option value="${cosmeticItemId(kind, id)}">${KIND_NAMES[kind]}: ${esc(kind === 'avatar' ? `${id} ${label}` : label)}</option>`).join('')}</optgroup>
          </select>
          <button class="btn small" data-on="1">🎁 GIVE</button><button class="btn small ghost" data-on="0">TAKE BACK</button></form>
        <p class="muted small">You can also give or take any of these with MANAGE on a player.</p>
      </div>
      <div class="acard"><h4>🛒 In the shop now <span class="muted small">(your specials)</span></h4><div id="admin-paid-list" class="admin-players"></div></div>
      <div class="acard"><h4>🐺 Wolf prices <span class="muted small">(shown in the Shop and Profile, ${esc(a.cfg?.payNote || 'paid cash in hand to the site owner')})</span></h4>
      <form class="auth inline admin-row" id="admin-wolf-price"><input name="p" maxlength="20" placeholder="Wolf price (now ${esc(a.wolfPrice)})" required /><button class="btn small">SET WOLF PRICE</button></form>
      <form class="auth inline admin-row" id="admin-wolf-lvlprice"><input name="p" maxlength="20" placeholder="Price of one level (now ${esc(a.wolfLevelPrice)})" required /><button class="btn small">SET LEVEL PRICE</button></form>
      </div>
    </section>
    <section class="asec" data-sec="me">
      <div class="acard"><h4>👤 My account <span class="muted small">(level, coins, mastery, quests, guns, solo map)</span></h4>
      <form class="auth inline admin-row" data-act="level"><input name="v" type="number" min="1" max="200" placeholder="Set level (1-200)" /><button class="btn small">SET LEVEL</button></form>
      <form class="auth inline admin-row" data-act="coins"><input name="v" type="number" min="0" placeholder="Set coins" /><button class="btn small">SET COINS</button></form>
      <div class="admin-grid">
        <button class="btn small" data-acc="mastery-max">🏅 MAX ALL GUN MASTERY</button>
        <button class="btn small ghost" data-acc="mastery-reset">RESET GUN MASTERY</button>
        <button class="btn small" data-acc="quests-complete">📜 FINISH TODAY'S QUESTS</button>
        <button class="btn small ghost" data-acc="quests-reset">RESET TODAY'S QUESTS</button>
        <button class="btn small ghost" data-run="tutorial">REPLAY THE TUTORIAL</button>
        <button class="btn small ghost" id="admin-quick-reset">RESET MY QUICK CHAT</button>
        <button class="btn small" data-acc="guns-all">🔫 OWN EVERY SHOP GUN</button>
        <button class="btn small ghost" data-acc="guns-none">REMOVE MY SHOP GUNS</button>
      </div>
      <div class="auth inline admin-row">
        <span>🔫 Spawn with:</span>
        <select id="admin-loadout"><option value="">Nothing (rifle)</option>${SHOP.filter((d) => d.kind === 'gun' && a.items[d.id])
          .map((d) => `<option value="${d.gun}" ${a.items.loadout === d.gun ? 'selected' : ''}>${esc(d.name)}</option>`)
          .join('')}</select>
        <span class="muted small">(every mode, unlimited ammo)</span>
      </div>
      <div class="auth inline admin-row">
        <span>🗺️ Solo map:</span>
        <select id="admin-map">${(act?.maps() || []).map(([id, n]) => `<option value="${id}" ${act.soloMap === id ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <span class="muted small">(for your next new solo game)</span>
      </div>
      </div>
      <div class="acard"><h4>🚫 Blocked words <span class="muted small">(only these exact words: hidden as *** in every chat on every server, and not allowed in names)</span></h4>
      <textarea id="admin-words" rows="3" maxlength="7000" placeholder="One word or phrase per line (or split them with commas)"></textarea>
      <div class="auth inline admin-row"><button class="btn small" id="admin-words-save">SAVE BLOCKED WORDS</button><span id="admin-words-n" class="muted small"></span></div>
      </div>
    </section>
      <p class="muted small">Press F2 in-game to open this panel. In multiplayer you get an ADMIN badge, and as host you can kick players.</p>`;
    const showSec = (id) => {
      this.adminSec = id;
      for (const b of this.body.querySelectorAll('[data-asec]')) b.classList.toggle('on', b.dataset.asec === id);
      for (const el of this.body.querySelectorAll('.asec')) el.classList.toggle('hidden', el.dataset.sec !== id);
    };
    for (const b of this.body.querySelectorAll('[data-asec]')) b.onclick = () => showSec(b.dataset.asec);
    this._foldCards();
    showSec(sec);
    const msg = (t) => (document.getElementById('admin-msg').textContent = t);
    document.getElementById('admin-drop').onclick = () => msg(act.supplyDrop());
    this._adminTeams(msg);
    // every room, with a join button
    const roomsEl = document.getElementById('admin-rooms');
    const loadRooms = async () => {
      try {
        const { rooms } = await a._api('/admin/rooms', { method: 'POST', body: {} });
        roomsEl.innerHTML = rooms.length
          ? rooms
              .map(
                (r) => `<div class="friend admin-player"><b>${r.open ? '🌍' : '🔒'} ${esc(r.host || '?')}</b>
                <span class="muted">${esc(r.code)} · ${esc(r.mode)} · ${r.players} player(s) · ${r.playing ? 'playing' : 'lobby'}</span>
                <span class="actions"><button data-joinroom="${esc(r.code)}">JOIN</button></span></div>`,
              )
              .join('')
          : 'No rooms right now.';
        roomsEl.querySelectorAll('[data-joinroom]').forEach((b) => (b.onclick = async () => msg(await act.joinRoom(b.dataset.joinroom))));
      } catch (err) {
        roomsEl.textContent = err.message;
      }
    };
    loadRooms();
    document.getElementById('admin-rooms-refresh').onclick = (e) => {
      e.preventDefault();
      loadRooms();
    };
    for (const btn of this.body.querySelectorAll('[data-barrels]')) btn.onclick = () => msg(act.barrels(btn.dataset.barrels));
    this._adminPlayers('');
    document.getElementById('admin-find').addEventListener('submit', (e) => {
      e.preventDefault();
      this._adminPlayers(new FormData(e.target).get('q'));
    });
    document.getElementById('admin-give').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await a.adminPlayer(String(f.get('u')).trim(), 'give', { coins: Number(f.get('c')) });
        msg(r.note);
        e.target.reset();
        this._adminPlayers(this.adminQuery || '');
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-wolf-lvlprice').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        msg((await a.adminWolfPrice(String(new FormData(e.target).get('p')).trim(), 'level')).note);
        e.target.reset();
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-wolf-price').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        msg((await a.adminWolfPrice(String(new FormData(e.target).get('p')).trim())).note);
        e.target.reset();
      } catch (err) {
        msg(err.message);
      }
    });
    // events
    const evStatus = async () => {
      const el = document.getElementById('admin-event-status');
      if (!el) return;
      try {
        const r = await a.adminEvent({ action: 'status' });
        const e = r.event;
        el.innerHTML = e
          ? `<b class="hot">🟢 LIVE: ${esc(e.name)}</b> · started by ${esc(e.by)} · ${e.endsAt ? `ends ${esc(new Date(e.endsAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}` : 'until you end it'} · ${e.boost}× drops<br/>${r.rooms} event match(es) · <b>${r.players}</b> player(s) in them · ${e.pieces || 0} piece(s) found`
          : 'No event is on. Start one below.';
        showSched(r.schedule);
      } catch (err) {
        el.textContent = err.message;
      }
    };
    // the hourly event
    const sched = document.getElementById('admin-sched');
    const showSched = (s) => {
      const el = document.getElementById('admin-sched-status');
      if (!el || !s) return;
      sched.preset.value = String(s.preset);
      sched.announce.checked = s.announce;
      const p = EVENT_PRESETS[s.preset] || EVENT_PRESETS[0];
      // the next one (or this one, while it's on), in your time
      const now = Date.now();
      let t = Math.floor((now - s.at * 60000) / 3600000) * 3600000 + s.at * 60000;
      if (now - t >= SCHEDULE_MINUTES * 60000) t += 3600000;
      const at = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      el.innerHTML = s.on ? `<b class="hot">🟢 ON</b>: ${esc(p.name)}, ${SCHEDULE_MINUTES} minutes every hour · ${t <= now ? `on now until ${at(t + SCHEDULE_MINUTES * 60000)}` : `next at ${at(t)}`}` : 'Off: nothing starts by itself.';
    };
    let schedOn = true;
    sched.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => (schedOn = b.dataset.on === '1')));
    sched.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await a.adminEvent({ action: 'schedule', on: schedOn, preset: Number(sched.preset.value), announce: sched.announce.checked });
        msg(r.note);
        showSched(r.schedule);
        evStatus();
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-sched-now').onclick = async () => {
      const p = EVENT_PRESETS[Number(sched.preset.value)] || EVENT_PRESETS[0];
      if (a.event && !confirm(`${a.event.name} is already on. Replace it with ${p.name} for ${SCHEDULE_MINUTES} minutes?`)) return;
      try {
        msg((await a.adminEvent({ action: 'start', name: p.name, theme: p.theme || null, minutes: SCHEDULE_MINUTES, halfPast: true, boost: p.boost, announce: sched.announce.checked })).note);
        evStatus();
      } catch (err) {
        msg(err.message);
      }
    };
    // the Halloween season
    const seasonForm = document.getElementById('admin-season');
    const seasonStatus = () => {
      const el = document.getElementById('admin-season-status');
      if (el) el.innerHTML = a.season ? `<b class="hot">🟢 ON</b> until the end of ${esc(new Date(a.season.endsAt - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' }))}` : 'Off.';
    };
    seasonForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!a.season && !confirm('Start Halloween for everyone now?')) return;
      try {
        msg((await a.adminSeason({ action: 'start', until: seasonForm.until.value, announce: seasonForm.announce.checked })).note);
        seasonStatus();
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-season-stop').onclick = async () => {
      if (!a.season || !confirm('End Halloween for everyone now?')) return;
      try {
        msg((await a.adminSeason({ action: 'stop' })).note);
        seasonStatus();
      } catch (err) {
        msg(err.message);
      }
    };
    // Halloween stuff for anyone
    document.getElementById('admin-give-candy').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        msg((await a.adminPlayer(String(f.get('u')).trim(), 'candy', { n: Number(f.get('n')) })).note);
      } catch (err) {
        msg(err.message);
      }
    });
    const cosForm = document.getElementById('admin-give-cos');
    let cosOn = true;
    cosForm.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => (cosOn = b.dataset.on === '1')));
    cosForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(cosForm);
      try {
        msg((await a.adminPlayer(String(f.get('u')).trim(), 'cosmetic', { item: f.get('item'), on: cosOn })).note);
      } catch (err) {
        msg(err.message);
      }
    });
    evStatus();
    // the real-money shop items
    const paidList = () => {
      const list = a.paidItems;
      document.getElementById('admin-paid-list').innerHTML = list.length
        ? list.map((i) => `<div class="admin-player"><span>${esc(i.icon)} <b>${esc(i.name)}</b> · ${esc(i.price)} · <span class="muted small">${esc(paidGives(i))}</span></span><span><button class="btn small" data-paidedit="${esc(i.id)}">✏️ EDIT</button> <button class="btn small ghost" data-paidrm="${esc(i.id)}">🗑️ DELETE</button></span></div>`).join('')
        : '<p class="muted small">Nothing yet: add something above.</p>';
      document.getElementById('admin-give-specials').innerHTML = list.map((i) => `<option value="paid:${esc(i.id)}">${esc(i.icon)} ${esc(i.name)} (${esc(i.price)})</option>`).join('');
      // edit it right in the Shop (edit mode, its form open)
      this.body.querySelectorAll('[data-paidedit]').forEach((b) =>
        b.addEventListener('click', () => {
          this.shopEdit = true;
          this.shopEditing = `paid:${b.dataset.paidedit}`;
          this.open('shop');
        }),
      );
      this.body.querySelectorAll('[data-paidrm]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!confirm('Delete it from the Shop? (Anyone who bought it keeps it.)')) return;
          try {
            msg((await a.adminPaidItems({ action: 'remove', id: b.dataset.paidrm })).note);
            paidList();
          } catch (err) {
            msg(err.message);
          }
        }),
      );
    };
    paidList();
    const paidForm = document.getElementById('admin-paid-add');
    // only the boxes that fit what it gives and how it's paid for
    const paidFields = () => {
      const give = paidForm.give.value;
      const coins = paidForm.currency.value === 'coins';
      paidForm.price.classList.toggle('hidden', coins);
      paidForm.coins.classList.toggle('hidden', !coins);
      paidForm.tag.classList.toggle('hidden', give !== 'nametag');
      paidForm.querySelector('[data-colorpick]').classList.toggle('hidden', give !== 'namecolor');
      paidForm.amount.classList.toggle('hidden', give !== 'coins' && give !== 'candy');
    };
    paidForm.give.onchange = paidFields;
    paidForm.currency.onchange = () => {
      if (['💵', '🪙'].includes(paidForm.icon.value)) paidForm.icon.value = paidForm.currency.value === 'coins' ? '🪙' : '💵';
      paidFields();
    };
    paidFields();
    paidForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      let [give, what = ''] = String(f.get('give')).split(':');
      if (give === 'nametag') what = String(f.get('tag') || '').trim();
      if (give === 'namecolor') what = String(f.get('color'));
      const name = String(f.get('name')).trim();
      const same = a.paidItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
      try {
        msg((await a.adminPaidItems({ action: 'add', id: same?.id, name, icon: f.get('icon'), currency: f.get('currency'), coins: Number(f.get('coins')) || 0, price: f.get('price'), desc: f.get('desc'), give, what, amount: Number(f.get('amount')) || 0 })).note);
        e.target.reset();
        paidFields();
        paidList();
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-setpw').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const who = String(f.get('who')).trim();
      if (!confirm(`Give ${who} a new password?`)) return;
      try {
        msg((await a._api('/admin/set-password', { method: 'POST', body: { who, password: String(f.get('pw')) } })).note);
        e.target.reset();
      } catch (err) {
        msg(err.message);
      }
    });
    // one form for everything bought with real money
    const giveForm = document.getElementById('admin-give-paid');
    let giveOn = true;
    giveForm.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => (giveOn = b.dataset.on === '1')));
    giveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(giveForm);
      const u = String(f.get('u')).trim();
      const what = String(f.get('what') || '');
      try {
        const r =
          what === 'wolf' ? await a.adminPlayer(u, 'wolf', { on: giveOn })
          : what === 'wolflvl' ? await a.adminPlayer(u, 'wolflevel', { levels: giveOn ? 1 : -1 })
          : what.startsWith('paid:') ? await a.adminPlayer(u, 'paid', { id: what.slice(5), on: giveOn })
          : what.startsWith('skin:') ? await a.adminPlayer(u, 'skin', { id: what.slice(5), on: giveOn })
          : what.startsWith('item:') ? await a.adminPlayer(u, 'consumable', { item: what.slice(5), n: giveOn ? 1 : -1 })
          : await a.adminPlayer(u, 'cosmetic', { item: what, on: giveOn });
        msg(r.note);
      } catch (err) {
        msg(err.message);
      }
    });
    // picking an event fills in its length and drop rate (you can still change them)
    const ac = document.getElementById('admin-candy');
    if (ac) ac.onclick = () => a.adminCandy(200).then(msg, (e) => msg(e.message));
    const hp = document.getElementById('admin-halloween-preview');
    if (hp) hp.onclick = () => {
      msg(act.toggleHalloweenPreview());
      hp.textContent = act.halloweenPreview() ? '👻 PREVIEW ON (ONLY YOU) · TURN OFF' : '👻 PREVIEW IT (ONLY YOU)';
    };
    const evForm = document.getElementById('admin-event-start');
    document.getElementById('admin-event-preset').addEventListener('change', (e) => {
      const p = EVENT_PRESETS[e.target.value];
      document.getElementById('admin-event-name').classList.toggle('hidden', !!p);
      document.getElementById('admin-event-desc').textContent = p ? p.desc : 'Type a name; it plays like the others (Red vs Blue vs the zombies, pieces to collect). Pick its length and drop rate.';
      if (p) {
        evForm.minutes.value = String(p.minutes);
        evForm.boost.value = String(p.boost);
      }
    });
    evForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const preset = EVENT_PRESETS[f.get('preset')];
      const name = preset ? preset.name : String(f.get('name') || '').trim();
      if (!name) return msg('Type a name for your event first.');
      if (a.event && !confirm(`${a.event.name} is already on. Replace it with a new event?`)) return;
      try {
        msg((await a.adminEvent({ action: 'start', name, theme: preset?.theme || null, minutes: Number(f.get('minutes')), boost: Number(f.get('boost')), announce: f.get('announce') === 'on' })).note);
        evStatus();
      } catch (err) {
        msg(err.message);
      }
    });
    document.getElementById('admin-event-stop').onclick = async () => {
      if (!a.event || !confirm(`End ${a.event.name} for everyone now?`)) return;
      try {
        msg((await a.adminEvent({ action: 'stop' })).note);
        evStatus();
      } catch (err) {
        msg(err.message);
      }
    };
    const wearLook = async (look, note) => {
      try {
        await a.saveProfile({ ...a.profile, look });
        msg(note);
        this.render();
      } catch (err) {
        msg(err.message);
      }
    };
    this.body.querySelectorAll('[data-astro]').forEach((b) =>
      b.addEventListener('click', () => wearLook({ ...a.profile.look, model: 'astronaut', hat: 'helmet', ...ASTRONAUT_PRESETS[+b.dataset.astro][1] }, 'You are the Astronaut 🧑‍🚀')),
    );
    document.getElementById('admin-astro-off')?.addEventListener('click', () => wearLook({ ...a.profile.look, model: 'man', ...MODEL_COLORS.man }, 'Back to the Survivor'));
    this.body.querySelectorAll('[data-mygear]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          msg((await a.adminPlayer(a.name, 'gear', { id: b.dataset.mygear, on: b.dataset.on === '1' })).note);
          this.render();
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    this.body.querySelectorAll('[data-mypieces]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          msg((await a.adminPlayer(a.name, 'pieces', { mode: b.dataset.mypieces })).note);
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    const words = document.getElementById('admin-words');
    a.adminWords().then(
      (r) => {
        words.value = r.words.join('\n');
        document.getElementById('admin-words-n').textContent = `${r.words.length} blocked`;
      },
      () => {},
    );
    document.getElementById('admin-words-save').onclick = async () => {
      try {
        const r = await a.adminSetWords(words.value);
        words.value = r.words.join('\n');
        document.getElementById('admin-words-n').textContent = `${r.words.length} blocked`;
        msg(`Saved: ${r.words.length} blocked word(s). Every room picks them up within a minute.`);
      } catch (err) {
        msg(err.message);
      }
    };
    const spawn = document.getElementById('admin-spawn');
    if (spawn) spawn.onclick = () => msg(act.run('spawn', document.getElementById('admin-zombie').value));
    document.getElementById('admin-announce').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      if (!input.value.trim()) return msg('Type a message first.');
      a.adminAnnounce({ text: input.value }).then((r) => {
        msg(r.note);
        input.value = '';
        a._setAnnounce(r.announce);
      }, (err) => msg(err.message));
    });
    document.getElementById('admin-announce-clear').onclick = () => a.adminAnnounce({ action: 'clear' }).then((r) => msg(r.note), (err) => msg(err.message));
    const zm = document.getElementById('admin-zmodel');
    if (zm) zm.onclick = () => {
      msg(act.toggleZombieModels());
      zm.textContent = act.zombieModels() ? '3D MODEL ON · SWITCH TO BLOCKS' : 'BLOCKS ON · SWITCH TO 3D MODEL';
    };
    const vw = document.getElementById('admin-view');
    if (vw) vw.onclick = () => {
      msg(act.toggleView());
      vw.textContent = `VIEW: ${act.viewName()} · SWITCH`;
    };
    for (const b of document.querySelectorAll('[data-addbots]')) b.onclick = () => msg(act.addBots(Number(b.dataset.addbots)));
    const adb = document.getElementById('admin-ads');
    if (adb) adb.onclick = () => a.adminFeature('adsOff', adb.dataset.on === '1').then((r) => {
      msg(adb.dataset.on === '1' ? 'Ads turned off: maps load without them from now on.' : 'Ads back on: maps load with them from now on.');
      this.render?.();
    }, (err) => msg(err.message));
    const dv = document.getElementById('admin-deploy-view');
    if (dv) dv.onclick = () => {
      const on = dv.dataset.on === '1';
      if (on && !confirm('Deploy the first / third person switch to everyone?')) return;
      a.adminFeature('view', on).then((r) => {
        msg(r.note);
        this.render?.();
      }, (err) => msg(err.message));
    };
    const vb = document.getElementById('admin-version');
    if (vb) vb.onclick = async () => msg(await act.checkVersion());
    const botsSel = document.getElementById('admin-bots');
    botsSel.onchange = () => botsSel.value !== '' && msg(act.setBots(Number(botsSel.value)));
    const gunSel = document.getElementById('admin-gunpos');
    gunSel.onchange = () => gunSel.value && msg(act.gunPreset(gunSel.value));
    document.getElementById('admin-night').onchange = (e) => msg(act.setNightMode(e.target.value));
    document.getElementById('admin-map').onchange = (e) => msg(act.setSoloMap(e.target.value));
    document.getElementById('admin-loadout').onchange = (e) =>
      a.setLoadout(e.target.value || null).then(() => msg(e.target.value ? 'Equipped: you spawn with it next time.' : 'Unequipped.'), (err) => msg(err.message));
    document.getElementById('admin-quick-reset').onclick = () => a.setQuickChat([]).then(() => msg('Quick chat back to the defaults.'), (e) => msg(e.message));
    const bbtn = document.getElementById('admin-boss-btn');
    if (bbtn) bbtn.onclick = () => msg(act.run('boss', document.getElementById('admin-boss').value));
    this.body.querySelectorAll('[data-acc]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [what, mode] = b.dataset.acc.split('-');
        try {
          if (what === 'mastery') await a.adminMastery(mode);
          else if (what === 'guns') await a.adminGuns(mode);
          else await a.adminQuests(mode);
          msg(
            {
              'mastery-max': 'Every gun is Diamond: all skins unlocked (🏅 Mastery).',
              'mastery-reset': 'Gun mastery reset.',
              'quests-complete': "Today's quests are done: claim them in 📜 Quests.",
              'quests-reset': "Today's quests reset.",
              'guns-all': 'You own every Shop gun. Pick one under Spawn with.',
              'guns-none': 'Shop guns removed.',
            }[b.dataset.acc],
          );
        } catch (err) {
          msg(err.message);
        }
      }),
    );
    const wbtn = document.getElementById('admin-weather-btn');
    if (wbtn) wbtn.onclick = () => msg(act.run('weather', document.getElementById('admin-weather').value));
    this.body.querySelectorAll('[data-toggle]').forEach((cb) =>
      cb.addEventListener('change', () => msg(act.toggle(cb.dataset.toggle, cb.checked)))
    );
    this.body.querySelectorAll('[data-run]').forEach((b) =>
      b.addEventListener('click', () => {
        const text = act.run(b.dataset.run);
        if (b.dataset.run === 'cheatsoff') this.render();
        document.getElementById('admin-msg').textContent = text;
      })
    );
    this.body.querySelectorAll('form[data-act]').forEach((f) =>
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Number(new FormData(f).get('v'));
        if (!Number.isFinite(v)) return;
        if (f.dataset.act === 'level' || f.dataset.act === 'coins') {
          try {
            if (f.dataset.act === 'level') await a.adminSetXp(xpForLevel(Math.max(1, Math.min(200, Math.floor(v)))));
            else await a.adminSetCoins(v);
            msg(f.dataset.act === 'level' ? `You're now level ${a.level}.` : `Coins set to ${a.coins}.`);
          } catch (err) {
            msg(err.message);
          }
        } else msg(act.run(f.dataset.act, v));
      })
    );
  }

  // Admin panel cards fold away (click the heading): a clear title with its note underneath, and the
  // first card in each tab open. Which ones you've opened or closed is remembered in this browser.
  _foldCards() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('deadplains.adminFold') || '{}') || {};
    } catch {
      /* private window */
    }
    for (const sec of this.body.querySelectorAll('.asec')) {
      sec.querySelectorAll(':scope > .acard').forEach((card, i) => {
        const h = card.querySelector(':scope > h4');
        if (!h || h.dataset.folded) return;
        h.dataset.folded = '1';
        // the bit in brackets becomes a note under the title
        const note = h.querySelector(':scope > span.muted');
        const extra = [...h.querySelectorAll(':scope > a')];
        const title = h.cloneNode(true);
        title.querySelectorAll('span.muted, a').forEach((x) => x.remove());
        const key = title.textContent.trim();
        h.innerHTML = `<span class="af-title">${esc(key)}</span>${note ? `<span class="af-note">${esc(note.textContent.replace(/^\(|\)$/g, ''))}</span>` : ''}<span class="af-chev">▾</span>`;
        for (const a of extra) h.querySelector('.af-title').after(a);
        const open = key in saved ? saved[key] : i === 0;
        card.classList.toggle('closed', !open);
        h.addEventListener('click', (e) => {
          if (e.target.closest('a')) return; // links in the heading (refresh) still work
          const now = card.classList.toggle('closed');
          saved[key] = !now;
          try {
            localStorage.setItem('deadplains.adminFold', JSON.stringify(saved));
          } catch {
            /* private window */
          }
        });
      });
    }
  }

  // admin: move players between teams in the room you're in (lobby or mid-match)
  _adminTeams(msg) {
    const el = document.getElementById('admin-teams');
    if (!el) return;
    const act = this.adminActions;
    const r = act.roomTeams?.();
    if (!r) {
      el.innerHTML = '<p class="muted small">Join a room to move players between teams.</p>';
      return;
    }
    if (!r.teams) {
      el.innerHTML = '<p class="muted small">This mode has no teams. Pick Team Deathmatch, Capture Point, Capture the Flag or Infection.</p>';
      return;
    }
    const col = { red: '#ff5d4d', blue: '#5ea2ff' };
    el.innerHTML = `${r.players
      .map((p) => `<div class="apl"><b style="color:${col[p.team] || '#ddd'}">${esc(p.name)}${p.me ? ' (you)' : ''}</b><span class="muted small">${String(p.team || '').toUpperCase()}</span>
        <button class="btn small ${p.team === 'red' ? 'on' : 'ghost'}" data-tm="red" data-id="${p.id}">RED</button><button class="btn small ${p.team === 'blue' ? 'on' : 'ghost'}" data-tm="blue" data-id="${p.id}">BLUE</button></div>`)
      .join('')}
      <div class="admin-grid"><button class="btn small" data-top="shuffle">🔀 SHUFFLE TEAMS</button><button class="btn small" data-top="balance">⚖️ BALANCE</button><button class="btn small" data-top="swap">⇄ SWAP SIDES</button></div>`;
    el.querySelectorAll('[data-tm]').forEach((b) => (b.onclick = () => {
      msg(act.setTeam(Number(b.dataset.id), b.dataset.tm));
      setTimeout(() => this._adminTeams(msg), 600);
    }));
    el.querySelectorAll('[data-top]').forEach((b) => (b.onclick = () => {
      msg(act.teamOp(b.dataset.top));
      setTimeout(() => this._adminTeams(msg), 600);
    }));
  }

  // admin: one player's editor (level, coins, name, stats) under their row
  async _manageBox(box, name, reload) {
    box.innerHTML = '<p class="muted small">Loading…</p>';
    let p;
    try {
      ({ player: p } = await this.account.adminManage(name));
    } catch (err) {
      box.textContent = err.message;
      return;
    }
    const fields = [
      ['username', 'Player name', p.username, 'text'],
      ['level', 'Level', p.level],
      ['coins', 'Coins', p.coins],
      ['bestWave', 'Best wave', p.bestWave],
      ['bestScore', 'Best score', p.bestScore],
      ['kills', 'Zombie kills', p.kills],
      ['headshots', 'Headshots', p.headshots],
      ['pvpKills', 'PvP kills', p.pvpKills],
      ['pvpWins', 'PvP wins', p.pvpWins],
      ['games', 'Games played', p.games],
    ];
    const joined = p.created ? new Date(p.created).toLocaleDateString() : '?';
    const me = p.username === this.account.name;
    const mins = [[5, '5 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']];
    const mod = `<div class="manage-mod">
        <button type="button" data-mod="give100">+100 🪙</button>
        ${SPECIAL_GEAR.map((g) => ((p.gear || []).includes(g.id) ? `<button type="button" data-mod="gear-off-${g.id}" title="Take it away">TAKE ${g.icon}</button>` : `<button type="button" data-mod="gear-on-${g.id}" class="hot" title="Give them the ${g.name}">GIVE ${g.icon} ${g.name.toUpperCase()}</button>`)).join('')}
        <button type="button" data-mod="pieces-all" title="Every character piece: they can wear any character">🧩 ALL PIECES (${p.pieces || 0})</button>${p.pieces ? '<button type="button" data-mod="pieces-none">TAKE PIECES</button>' : ''}
        ${CHARACTERS_LIVE ? '<button type="button" data-mod="resetlook" title="Their character back to the default look">RESET LOOK</button>' : ''}
        ${p.wolf ? `<button type="button" data-mod="wolf-up" class="hot" title="They paid you for a wolf level">+1 🐺 LEVEL (now ${p.wolfLevel})</button><button type="button" data-mod="wolf-off" title="Take their wolf companion away">TAKE 🐺 WOLF</button>` : '<button type="button" data-mod="wolf-on" class="hot" title="They paid you for the wolf companion">GIVE 🐺 WOLF</button>'}
        ${me || p.admin
          ? `<span class="muted small">${me ? "That's you" : 'Admins'}: no kick, timeout or ban</span>`
          : `<button type="button" data-mod="kick" ${p.room ? '' : 'disabled'} title="${p.room ? 'Throw them out of their room' : "They aren't in a room"}">KICK</button>
             <select data-mod-mins>${mins.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
             ${p.timeoutMins ? '<button type="button" data-mod="untimeout">END TIMEOUT</button>' : '<button type="button" data-mod="timeout">TIMEOUT</button>'}
             ${p.banned ? '<button type="button" data-mod="unban" class="hot">UNBAN</button>' : '<button type="button" data-mod="ban" class="bad">BAN</button>'}`}
      </div>`;
    box.innerHTML = `
      <p class="muted small">Joined ${esc(joined)} · ${p.xp} XP · ${p.badges} achievements · ${p.items} shop items${p.admin ? ' · ⭐ admin' : ''}</p>
      ${mod}
      <form class="manage-grid">${fields
        .map(([k, label, v, type]) => `<label><span>${label}</span><input name="${k}" type="${type || 'number'}" ${type ? 'maxlength="40"' : 'min="0"'} value="${esc(v)}" /></label>`)
        .join('')}
        <div class="manage-actions"><button class="btn small">SAVE CHANGES</button><button type="button" class="btn small ghost" data-reset>RESET PROGRESS</button><span class="manage-msg muted small"></span></div>
      </form>`;
    const form = box.querySelector('form');
    const msg = box.querySelector('.manage-msg');
    const save = async (set) => {
      msg.textContent = 'Saving…';
      try {
        const r = await this.account.adminManageSave(name, set);
        const m = document.getElementById('admin-msg');
        if (m) m.textContent = r.note;
        reload();
      } catch (err) {
        msg.textContent = err.message;
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const set = {};
      for (const [k, , v] of fields) {
        const now = String(f.get(k) ?? '').trim();
        if (now !== String(v)) set[k] = k === 'username' ? now : Number(now);
      }
      if (!Object.keys(set).length) return (msg.textContent = 'Nothing changed.');
      save(set);
    });
    box.querySelectorAll('[data-mod]').forEach((b) =>
      b.addEventListener('click', async () => {
        let action = b.dataset.mod;
        const extra = {};
        if (action === 'give100') {
          action = 'give';
          extra.coins = 100;
        }
        const gearMod = /^gear-(on|off)-(\w+)$/.exec(action);
        if (gearMod) {
          extra.on = gearMod[1] === 'on';
          extra.id = gearMod[2];
          action = 'gear';
        }
        if (action === 'pieces-all' || action === 'pieces-none') {
          extra.mode = action === 'pieces-all' ? 'all' : 'none';
          action = 'pieces';
        }
        if (action === 'wolf-up') {
          action = 'wolflevel';
          extra.levels = 1;
        }
        if (action === 'wolf-on' || action === 'wolf-off') {
          extra.on = action === 'wolf-on';
          action = 'wolf';
        }
        if (action === 'timeout') extra.minutes = Number(box.querySelector('[data-mod-mins]').value);
        if (action === 'ban' && !confirm(`Ban ${name}? They can't log in or play online until you unban them.`)) return;
        msg.textContent = '…';
        try {
          const r = await this.account.adminPlayer(name, action, extra);
          const m = document.getElementById('admin-msg');
          if (m) m.textContent = r.note;
          reload();
        } catch (err) {
          msg.textContent = err.message;
        }
      }),
    );
    box.querySelector('[data-reset]').onclick = () => {
      if (confirm(`Reset ${name} to a fresh start? Level, coins, stats, shop items, mastery and achievements go back to zero.`)) save({ reset: true });
    };
  }

  // admin: the players list with kick / timeout / ban / coins
  async _adminPlayers(q) {
    this.adminQuery = q;
    const el = document.getElementById('admin-players');
    if (!el) return;
    const a = this.account;
    let r;
    try {
      r = await a.adminPlayers(q);
    } catch (err) {
      el.textContent = err.message;
      return;
    }
    const row = (u) => {
      const mins = Math.round((Date.now() - (u.lastSeen || 0)) / 60000);
      const seen = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
      const status = u.banned ? '<b class="bad">BANNED</b>' : u.timeoutMins ? `<b class="bad">timed out ${u.timeoutMins}m</b>` : u.room ? `in room <b>${esc(u.room)}</b>` : u.online ? 'online (menus)' : `offline · seen ${seen} ago`;
      const me = !u.guest && u.username === a.name;
      const btns = me || u.admin
        ? `<span class="muted small">${me ? 'you' : 'admin'}</span>`
        : `<button data-pa="kick" ${u.room ? '' : 'disabled'} title="Throw them out of their room">KICK</button>
           <select data-pa-mins>${[[5, '5 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']].map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
           ${u.timeoutMins ? '<button data-pa="untimeout">END TIMEOUT</button>' : '<button data-pa="timeout" title="No online games or chat until it runs out">TIMEOUT</button>'}
           ${u.banned ? '<button data-pa="unban" class="hot">UNBAN</button>' : '<button data-pa="ban" class="bad">BAN</button>'}`;
      if (u.guest)
        return `<div class="friend admin-player guest-row" data-u="${esc(u.username)}" data-g="${esc(u.guest)}"><span class="dot ${u.online ? 'on' : ''}"></span><b>${esc(u.username)}</b> <i class="gtag">guest</i>
        <span class="muted">Lv ${u.level} · ${status}</span>
        <span class="actions">${btns}</span></div>`;
      return `<div class="friend admin-player" data-u="${esc(u.username)}"><span class="dot ${u.online ? 'on' : ''}"></span><b>${esc(u.username)}</b>${u.admin ? ' ⭐' : ''}
        <span class="muted">Lv ${u.level} · 🪙 ${u.coins} · ${u.email ? `📧 ${esc(u.email)} · ` : ''}${u.solo ? `playing solo, wave ${u.solo}` : status}</span>
        <span class="actions">${u.solo && !me ? '<button data-dropin title="Join their solo game: it becomes a private co-op game at the same wave">🎮 JOIN</button>' : ''}<button data-mng title="Coins, kick, timeout, ban, level, name and stats">MANAGE</button></span></div>
        <div class="manage-box hidden" data-box="${esc(u.username)}"></div>`;
    };
    const list = r.players.length ? r.players.map(row).join('') : `<p class="muted small">${q ? 'Nobody with that name.' : 'No players yet.'}</p>`;
    const banned = r.banned.filter((u) => !r.players.some((p) => p.username === u.username));
    const guests = r.guests || [];
    const online = r.players.filter((u) => u.online).length;
    el.innerHTML = `<p class="muted small">${q ? `Players matching "${esc(q)}"` : `${r.players.length} accounts · <b>${online} online</b>`} · <a href="#" data-pa-refresh>refresh</a></p>
      <h5>Accounts</h5>${list}
      ${banned.length ? `<h5>Banned / timed out</h5>${banned.map(row).join('')}` : ''}`;
    el.querySelector('[data-pa-refresh]').onclick = (e) => {
      e.preventDefault();
      this._adminPlayers(q);
    };
    // join someone's solo game: ask, then wait for their game to open a room
    el.querySelectorAll('[data-dropin]').forEach((b) =>
      b.addEventListener('click', async () => {
        const name = b.closest('[data-u]').dataset.u;
        const say = (t) => (document.getElementById('admin-msg').textContent = t);
        b.disabled = true;
        try {
          say((await a.adminDropin(name)).note);
          for (let i = 0; i < 45; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const r = await a.adminDropinStatus(name);
            if (r.code) {
              say(`Joining ${name}'s game…`);
              this.close();
              say(await this.adminActions.joinRoom(r.code));
              return;
            }
            if (r.gone) break;
          }
          say(`${name}'s game didn't answer (they may have stopped playing). Try again.`);
        } catch (err) {
          say(err.message);
        }
        b.disabled = false;
      }),
    );
    el.querySelectorAll('[data-mng]').forEach((b) =>
      b.addEventListener('click', () => {
        const name = b.closest('[data-u]').dataset.u;
        const box = [...el.querySelectorAll('[data-box]')].find((x) => x.dataset.box === name);
        if (!box) return;
        if (!box.classList.contains('hidden')) return box.classList.add('hidden');
        box.classList.remove('hidden');
        this._manageBox(box, name, () => this._adminPlayers(q));
      }),
    );
    el.querySelectorAll('[data-pa]').forEach((b) =>
      b.addEventListener('click', async () => {
        const rowEl = b.closest('[data-u]');
        const name = rowEl.dataset.u;
        let action = b.dataset.pa;
        const extra = {};
        if (action === 'give100') {
          action = 'give';
          extra.coins = 100;
        }
        if (action === 'timeout') extra.minutes = Number(rowEl.querySelector('[data-pa-mins]').value);
        if (action === 'ban' && !confirm(`Ban ${name}? They can't log in or play online until you unban them.`)) return;
        const m = document.getElementById('admin-msg');
        try {
          const res = rowEl.dataset.g ? await a.adminGuest(rowEl.dataset.g, action, extra) : await a.adminPlayer(name, action, extra);
          if (m) m.textContent = res.note;
          this._adminPlayers(q);
        } catch (err) {
          if (m) m.textContent = err.message;
        }
      }),
    );
  }

  async _friends() {
    const a = this.account;
    if (!a.loggedIn) {
      this.body.innerHTML = `<p class="muted">Log in to add friends, chat with them and see when they're online.</p><button class="btn small" data-tab="login">LOG IN</button>`;
      return;
    }
    if (this.chatWith) return this._chatView();
    if (this.groupChat) return this._groupView();
    this._stopDm();
    this.body.innerHTML = `
      <form id="friend-form" class="auth inline">
        <input name="username" placeholder="Friend's username" maxlength="40" required />
        <button class="btn small">ADD FRIEND</button>
      </form>
      <div id="friend-msg" class="msg"></div>
      <div id="group-list"></div>
      <div id="friend-list" class="muted">Loading…</div>`;
    this._loadGroups();
    document.getElementById('friend-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('username');
      const msg = document.getElementById('friend-msg');
      try {
        const r = await a.friendAction('request', name);
        msg.textContent = r.status === 'accepted' ? `You and ${name} are now friends!` : `Friend request sent to ${name}.`;
        e.target.reset();
        this._loadFriends();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
    this._loadFriends();
  }

  async _loadFriends() {
    const el = document.getElementById('friend-list');
    if (!el) return;
    try {
      const { friends, incoming, outgoing } = await this.account.friends();
      const row = (u, buttons) => `
        <div class="friend">
          <span class="dot ${u.online ? 'on' : ''}"></span>${nameTag(u)}
          <span class="muted">Lv ${u.level} · best wave ${u.stats.bestWave} · ${u.stats.pvpKills} PvP kills</span>
          <span class="actions">${buttons}</span>
        </div>`;
      const a = this.account;
      const party = a.party;
      const partyHtml = `
        <div class="party">
          <h4>🎉 Party${party ? ` (${party.members.length}/8)` : ''}</h4>
          ${a.partyInvites.map((i) => `<div class="friend"><b>${esc(i.from)}</b> invited you to their party<span class="actions"><button data-p="accept" data-party="${i.party}" class="hot">Join</button><button data-p="decline" data-party="${i.party}">No thanks</button></span></div>`).join('')}
          ${
            party
              ? `${party.members.map((u) => `<div class="friend"><span class="dot ${u.online ? 'on' : ''}"></span>${u.leader ? '👑 ' : ''}${nameTag(u)}<span class="actions">${a.partyLeader && !u.leader ? `<button data-p="kick" data-u="${esc(u.username)}">Kick</button>` : ''}</span></div>`).join('')}
                <p class="muted small">${a.partyLeader ? "You're the leader: when you create or join a room, your party follows you in." : `When ${esc(party.leader)} goes into a room, you follow them in.`}${party.room ? ` Room: <b>${esc(party.room)}</b>` : ''}</p>
                <button class="btn small ghost" data-p="leave">LEAVE PARTY</button>`
              : '<p class="muted small">Invite friends to a party to stick together: when the leader goes into a room, everyone follows.</p>'
          }
        </div>`;
      el.innerHTML = `${partyHtml}
        ${incoming.length ? `<h4>Requests</h4>${incoming.map((u) => row(u, `<button data-f="accept" data-u="${esc(u.username)}">Accept</button><button data-f="remove" data-u="${esc(u.username)}">Decline</button>`)).join('')}` : ''}
        <h4>Friends (${friends.length})${this.account.admin ? ' <span class="muted small">(admins are friends with everyone)</span>' : ''}</h4>
        ${
          friends.length
            ? friends
                .map((u) => {
                  const n = this.account.unread[u.username] || 0;
                  const inParty = party && party.members.some((m) => m.username === u.username);
                  return row(u, `<button data-chat="${esc(u.username)}" class="${n ? 'hot' : ''}">💬 Chat${n ? ` (${n})` : ''}</button>${inParty ? '' : `<button data-p="invite" data-u="${esc(u.username)}">🎉 Invite</button>`}<button data-f="remove" data-u="${esc(u.username)}">Remove</button>`);
                })
                .join('')
            : '<p class="muted">No friends yet. Add someone by their username.</p>'
        }
        ${outgoing.length ? `<h4>Sent</h4>${outgoing.map((u) => row(u, `<button data-f="remove" data-u="${esc(u.username)}">Cancel</button>`)).join('')}` : ''}
        <p class="muted small">To play together: Multiplayer → Create room, then send your friends the room code.</p>`;
      el.querySelectorAll('button[data-chat]').forEach((b) => b.addEventListener('click', () => this.openChat(b.dataset.chat)));
      el.querySelectorAll('button[data-p]').forEach((b) =>
        b.addEventListener('click', async () => {
          const msg = document.getElementById('friend-msg');
          try {
            await this.account.partyAction(b.dataset.p, { username: b.dataset.u, party: Number(b.dataset.party) });
            if (msg) msg.textContent = b.dataset.p === 'invite' ? `Party invite sent to ${b.dataset.u}.` : '';
          } catch (err) {
            if (msg) msg.textContent = err.message;
          }
          this._loadFriends();
        }),
      );
      el.querySelectorAll('button[data-f]').forEach((b) =>
        b.addEventListener('click', async () => {
          await this.account.friendAction(b.dataset.f, b.dataset.u).catch(() => {});
          this._loadFriends();
        })
      );
    } catch (err) {
      el.textContent = err.message;
    }
  }

  // ---- gun mastery
  _mastery() {
    const m = this.account.mastery;
    this.body.innerHTML = `
      <p class="muted">Kills with a gun unlock skins for it: ${MASTERY_TIERS.map((t) => `<b style="color:${t.css}">${t.name}</b> ${t.kills}`).join(' · ')}. Pick the skin each gun wears.</p>
      <div class="mastery">${MASTERY_GUNS.map((g) => {
        const def = GUNS[g];
        const kills = m.k[g] || 0;
        const tier = tierFor(kills);
        const next = MASTERY_TIERS[tier];
        const prev = tier ? MASTERY_TIERS[tier - 1].kills : 0;
        const pct = next ? Math.round(((kills - prev) / (next.kills - prev)) * 100) : 100;
        const chosen = m.s[g] || 0;
        const skins = [`<button class="skin ${chosen === 0 ? 'on' : ''}" data-gun="${g}" data-tier="0">Normal</button>`]
          .concat(MASTERY_TIERS.map((t, i) => `<button class="skin ${chosen === i + 1 ? 'on' : ''}" data-gun="${g}" data-tier="${i + 1}" ${i < tier ? '' : 'disabled'} style="--c:${t.css}">${i < tier ? '' : '🔒 '}${t.name}</button>`))
          .join('');
        return `<div class="m-gun">
          <div class="m-head"><b>${def.icon} ${esc(def.name)}</b><span class="muted small">${kills} kills${next ? ` · ${next.kills - kills} to ${next.name}` : ' · mastered!'}</span></div>
          <div class="q-bar"><i style="width:${pct}%;background:${next ? next.css : MASTERY_TIERS[3].css}"></i></div>
          <div class="m-skins">${skins}</div>
        </div>`;
      }).join('')}</div>
      <div id="mastery-msg" class="msg"></div>`;
    this.body.querySelectorAll('button[data-gun]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await this.account.setGunSkin(b.dataset.gun, Number(b.dataset.tier));
        } catch (err) {
          const msg = document.getElementById('mastery-msg');
          if (msg) msg.textContent = err.message;
        }
      }),
    );
  }

  // ---- daily quests
  _quests() {
    const a = this.account;
    const quests = a.quests || [];
    const left = 86400000 - (Date.now() % 86400000);
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    this.body.innerHTML = `
      <p class="muted">Three new quests every day. Finish one, then claim its coins here. New quests in <b>${h}h ${m}m</b>.</p>
      <div class="quests">${
        quests.length
          ? quests
              .map(
                (q) => `<div class="quest ${q.claimed ? 'claimed' : q.done ? 'done' : ''}">
          <div class="q-main">
            <div class="q-text">${esc(q.text)}</div>
            <div class="q-bar"><i style="width:${Math.round((q.progress / q.goal) * 100)}%"></i></div>
            <div class="muted small">${q.progress}/${q.goal}</div>
          </div>
          <div class="q-reward">🪙 ${q.reward}</div>
          ${q.claimed ? '<span class="q-tag">CLAIMED ✓</span>' : `<button class="btn small" data-claim="${esc(q.id)}" ${q.done ? '' : 'disabled'}>CLAIM</button>`}
        </div>`,
              )
              .join('')
          : '<p class="muted">Loading…</p>'
      }</div>
      <div id="quest-msg" class="msg"></div>
      ${a.loggedIn ? '' : '<p class="muted small">Playing as a guest: quest progress and coins are kept in this browser.</p>'}`;
    this.body.querySelectorAll('button[data-claim]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const reward = await a.claimQuest(b.dataset.claim);
          const msg = document.getElementById('quest-msg');
          if (msg) msg.textContent = `+${reward} 🪙`;
        } catch (err) {
          const msg = document.getElementById('quest-msg');
          if (msg) msg.textContent = err.message;
          b.disabled = false;
        }
      }),
    );
    if (!a.questsLoaded) a.loadQuests();
  }

  // ---- chat with one friend (works from the menu, no game needed)
  // ---- group chats
  async _loadGroups() {
    const el = document.getElementById('group-list');
    if (!el) return;
    const a = this.account;
    let groups = [];
    try {
      ({ groups } = await a.groups());
    } catch {
      /* offline */
    }
    if (!el.isConnected) return;
    if (!groups.length && !a.admin) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<h4>💬 Group chats</h4>
      ${groups
        .map((g) => `<div class="friend group-row" data-group="${g.id}"><b>${esc(g.name)}</b>${g.unread ? `<span class="badge-n">${g.unread}</span>` : ''}<span class="muted small">${g.members.length} people: ${esc(g.members.slice(0, 6).join(', '))}${g.members.length > 6 ? '…' : ''}</span><span class="actions"><button>OPEN</button></span></div>`)
        .join('') || '<p class="muted small">No group chats yet.</p>'}
      ${a.admin ? `<form id="group-new" class="auth inline group-new"><input name="name" maxlength="40" placeholder="New group name" required /><input name="members" placeholder="Player names (comma between)" /><button class="btn small">⭐ MAKE GROUP</button></form><div id="group-msg" class="msg"></div>` : ''}`;
    el.querySelectorAll('[data-group]').forEach((r) =>
      r.addEventListener('click', () => {
        this.groupChat = Number(r.dataset.group);
        this.render();
      }),
    );
    document.getElementById('group-new')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await a.adminGroups({ action: 'create', name: f.get('name'), members: String(f.get('members') || '') });
        this.groupChat = r.id;
        this.render();
      } catch (err) {
        document.getElementById('group-msg').textContent = err.message;
      }
    });
  }

  async _groupView() {
    const id = this.groupChat;
    const a = this.account;
    this._stopDm();
    if (this.gc?.id !== id) this.gc = { id, list: [], last: 0 };
    let info = null;
    try {
      info = (await a.groups()).groups.find((g) => g.id === id);
    } catch {
      /* offline */
    }
    if (!info) {
      this.groupChat = null;
      return this.render();
    }
    this.body.innerHTML = `
      <div class="dm-head">
        <button class="btn small ghost" id="gc-back">← FRIENDS</button>
        <b>💬 ${esc(info.name)}</b><span class="muted small">${info.members.length} people</span>
      </div>
      <p class="muted small gc-members">${info.members.map((n) => `<span>${esc(n)}${a.admin && n !== a.name ? ` <button data-gc-remove="${esc(n)}" title="Take them out">✕</button>` : ''}</span>`).join(' ')}</p>
      ${a.admin ? `<details class="gc-admin"><summary>⭐ Manage this group</summary>
        <form class="auth inline" id="gc-add"><input name="members" placeholder="Add players (comma between)" required /><button class="btn small">ADD</button></form>
        <form class="auth inline" id="gc-rename"><input name="name" maxlength="40" value="${esc(info.name)}" /><button class="btn small">RENAME</button></form>
        <button class="btn small ghost bad" id="gc-delete">DELETE GROUP</button></details>` : ''}
      <div id="dm-log" class="dm-log"></div>
      <form id="dm-form" class="auth inline dm-form">
        <input id="dm-input" maxlength="300" autocomplete="off" placeholder="Message ${esc(info.name)}…" />
        <button class="btn small">SEND</button>
      </form>
      <div id="dm-msg" class="msg"></div>`;
    const input = document.getElementById('dm-input');
    input.focus();
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const msg = (t) => (document.getElementById('dm-msg').textContent = t);
    document.getElementById('gc-back').onclick = () => {
      this.groupChat = null;
      this.render();
    };
    const admin = async (body) => {
      try {
        const r = await a.adminGroups({ id, ...body });
        msg(r.note);
        if (body.action === 'delete') this.groupChat = null;
        this.render();
      } catch (err) {
        msg(err.message);
      }
    };
    this.body.querySelectorAll('[data-gc-remove]').forEach((b) => (b.onclick = () => admin({ action: 'remove', username: b.dataset.gcRemove })));
    document.getElementById('gc-add')?.addEventListener('submit', (e) => {
      e.preventDefault();
      admin({ action: 'add', members: String(new FormData(e.target).get('members') || '') });
    });
    document.getElementById('gc-rename')?.addEventListener('submit', (e) => {
      e.preventDefault();
      admin({ action: 'rename', name: new FormData(e.target).get('name') });
    });
    document.getElementById('gc-delete')?.addEventListener('click', () => {
      if (confirm(`Delete "${info.name}" and all its messages?`)) admin({ action: 'delete' });
    });
    const render = () => {
      const log = document.getElementById('dm-log');
      if (!log) return;
      const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      log.innerHTML = this.gc.list.length
        ? this.gc.list.map((m) => `<div class="dm ${m.mine ? 'mine' : ''}">${m.mine ? '' : `<b class="gc-from">${esc(m.from)}${m.admin ? ' ⭐' : ''}</b>`}<span>${esc(m.text)}</span><time>${time(m.t)}</time></div>`).join('')
        : '<p class="muted">No messages yet. Say hi!</p>';
      log.scrollTop = log.scrollHeight;
    };
    const add = (list) => {
      for (const m of list) if (m.id > this.gc.last) {
        this.gc.list.push(m);
        this.gc.last = m.id;
      }
      render();
    };
    const load = async () => {
      if (this.groupChat !== id || this.modal.classList.contains('hidden') || this.tab !== 'friends') return this._stopDm();
      try {
        add((await a.groupMessages(id, this.gc.last)).messages);
      } catch (err) {
        msg(err.message);
      }
    };
    document.getElementById('dm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        add((await a.sendGroup(id, text, this.gc.last)).messages);
        msg('');
      } catch (err) {
        msg(err.message);
      }
    });
    render();
    load();
    this.dm.timer = setInterval(load, 3000);
  }

  _stopDm() {
    clearInterval(this.dm.timer);
    this.dm.timer = 0;
  }

  _chatView() {
    const name = this.chatWith;
    const draft = document.getElementById('dm-input')?.value || '';
    const fresh = this.dm.with !== name;
    if (fresh) this.dm = { with: name, list: [], last: 0, timer: 0 };
    this._stopDm();
    const room = this.roomCode();
    this.body.innerHTML = `
      <div class="dm-head">
        <button class="btn small ghost" id="dm-back">← FRIENDS</button>
        <b>${esc(name)}</b><span id="dm-status" class="muted small"></span>
      </div>
      <div id="dm-log" class="dm-log"></div>
      <form id="dm-form" class="auth inline dm-form">
        <input id="dm-input" maxlength="300" autocomplete="off" placeholder="Message ${esc(name)}…" />
        <button class="btn small">SEND</button>
      </form>
      ${room ? `<button class="btn small ghost" id="dm-invite">INVITE TO MY ROOM (${esc(room)})</button>` : ''}
      <div id="dm-msg" class="msg"></div>`;
    const input = document.getElementById('dm-input');
    input.value = draft;
    input.focus();
    input.addEventListener('keydown', (e) => e.stopPropagation());
    document.getElementById('dm-back').addEventListener('click', () => {
      this.chatWith = null;
      this.render();
    });
    const send = async (text) => {
      const msg = document.getElementById('dm-msg');
      try {
        const r = await this.account.sendMessage(name, text, this.dm.last);
        if (msg) msg.textContent = '';
        this._dmAdd(r.messages, r.online);
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
    };
    document.getElementById('dm-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      send(text);
    });
    document.getElementById('dm-invite')?.addEventListener('click', () => send(`🎮 Join my room: ${room}`));
    document.getElementById('dm-log').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-join]');
      if (!b) return;
      if (!this.joinRoom) return;
      const why = this.joinRoom(b.dataset.join);
      if (why) document.getElementById('dm-msg').textContent = why;
    });
    this._dmRender();
    this._dmLoad();
    this.dm.timer = setInterval(() => this._dmLoad(), 3000);
  }

  async _dmLoad() {
    const name = this.chatWith;
    if (!name || this.modal.classList.contains('hidden') || this.tab !== 'friends') return this._stopDm();
    try {
      const r = await this.account.messages(name, this.dm.last);
      if (this.chatWith === name) this._dmAdd(r.messages, r.online);
    } catch (err) {
      const msg = document.getElementById('dm-msg');
      if (msg) msg.textContent = err.message;
    }
  }

  _dmAdd(messages, online) {
    const status = document.getElementById('dm-status');
    if (status) status.textContent = online ? ' · online' : ' · offline (they will see it next time)';
    const fresh = (messages || []).filter((m) => m.id > this.dm.last);
    if (fresh.length) {
      this.dm.list = this.dm.list.concat(fresh).slice(-200);
      this.dm.last = fresh[fresh.length - 1].id;
      this._dmRender();
    }
    this.account.markRead(this.chatWith);
  }

  _dmRender() {
    const log = document.getElementById('dm-log');
    if (!log) return;
    const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    log.innerHTML = this.dm.list.length
      ? this.dm.list
          .map((m) => {
            const code = !m.mine && /Join my room: ([A-Z0-9]{5})/.exec(m.text);
            return `<div class="dm ${m.mine ? 'mine' : ''}"><span>${esc(m.text)}</span>${code ? `<button class="btn small" data-join="${code[1]}">JOIN</button>` : ''}<time>${time(m.t)}</time></div>`;
          })
          .join('')
      : `<p class="muted">No messages yet. Say hi to ${esc(this.chatWith)}!</p>`;
    log.scrollTop = log.scrollHeight;
  }

  async _weeklyBoard() {
    const el = document.getElementById('weekly-board');
    if (!el) return;
    try {
      const { week, players } = await this.account.weekly();
      if (!el.isConnected) return;
      el.innerHTML = `
        <h3>📅 Weekly challenge #${week} <button class="btn small hot" id="weekly-play">PLAY IT</button></h3>
        <p class="muted small">Same map and the same twist every wave for everyone this week. Resets on Monday.${this.account.loggedIn ? '' : ' Log in to get on this board.'}</p>
        ${players.length
          ? `<table class="board"><tr><th>#</th><th>Player</th><th>Wave</th><th>Score</th></tr>${players.map((u, i) => `<tr class="${u.username === this.account.name ? 'me' : ''}"><td>${i + 1}</td><td>${nameTag(u)}</td><td>${u.weekly.wave}</td><td>${u.weekly.score}</td></tr>`).join('')}</table>`
          : '<p class="muted">Nobody has played it yet this week.</p>'}`;
      document.getElementById('weekly-play').onclick = () => this.onWeekly?.();
    } catch {
      el.innerHTML = '';
    }
  }

  async _leaderboard() {
    if (!this.body.querySelector('.board')) this.body.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const { players, live = [] } = await this.account.leaderboard();
      if (this.tab !== 'leaderboard') return;
      const me = (u) => (u.username === this.account.name ? 'me' : '');
      this.body.innerHTML = `
        <h3 class="live-head"><span class="live-dot"></span> Playing right now</h3>
        ${live.length
          ? `<table class="board live-board">
              <tr><th>Player</th><th>Lv</th><th>Wave now</th><th>Score now</th></tr>
              ${live.map((u) => `<tr class="${me(u)}"><td>${nameTag(u)}</td><td>${u.level}</td><td><b>${u.live.wave}</b></td><td>${u.live.score}</td></tr>`).join('')}
            </table>`
          : '<p class="muted">Nobody is in a zombie run right now.</p>'}
        <div id="weekly-board"></div>
        <h3>All time</h3>
        <table class="board">
          <tr><th>#</th><th>Player</th><th>Lv</th><th>Best wave</th><th>Best score</th><th>PvP kills</th></tr>
          ${players.map((u, i) => `<tr class="${me(u)}"><td>${i + 1}</td><td>${nameTag(u)}${u.live ? ' <span class="live-tag">LIVE</span>' : ''}</td><td>${u.level}</td><td>${u.stats.bestWave}</td><td>${u.stats.bestScore}</td><td>${u.stats.pvpKills}</td></tr>`).join('')}
        </table>
        ${players.length ? '' : '<p class="muted">Nobody yet. Be the first!</p>'}
        <p class="muted small">Updates by itself every few seconds.</p>`;
    } catch (err) {
      this.body.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
    this._weeklyBoard();
    // keep it live while the tab is open
    clearTimeout(this.boardTimer);
    const again = () => {
      if (this.tab !== 'leaderboard' || this.modal.classList.contains('hidden')) return;
      if (document.visibilityState === 'visible') this._leaderboard();
      else this.boardTimer = setTimeout(again, 5000);
    };
    this.boardTimer = setTimeout(again, 5000);
  }

}
