import { AVATARS, CROSSHAIRS, DEFAULT_PROFILE, FINISHES, NAME_COLORS, TITLES, cleanProfile, levelFromXp, xpForLevel, xpForRun } from '../shared/cosmetics.js';
import { SHOP, coinsForRun, cosmeticItemId, cosmeticPrice, priceOf } from '../shared/shop.js';
import { DEFAULT_QUICK, QUICK_LEN, QUICK_MAX, cleanQuick, refundOldEmotes } from '../shared/modes.js';
import { addProgress, claimQuest as claimQuestState, questView } from '../shared/quests.js';
import { MASTERY_GUNS, MASTERY_TIERS, addMasteryKills, chooseSkin, cleanMastery, tierFor } from '../shared/mastery.js';
import { GUNS } from './guns.js';

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
    return this.admin ? 999 : this.level;
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
      if (res.status === 401 && path !== '/login') this._dropSession();
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

  async init() {
    if (this.token) {
      try {
        const { user } = await this._api('/me');
        this.user = user;
      } catch {
        /* offline or expired */
      }
    }
    this._changed();
    this.loadQuests();
    // keeps "online" status fresh for friends
    setInterval(() => {
      if (this.user && document.visibilityState === 'visible') this._api('/me').then(({ user }) => (this.user = user)).catch(() => {});
    }, 60000);
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
  }
  async logout() {
    try {
      await this._api('/logout', { method: 'POST' });
    } catch {
      /* already gone */
    }
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
    return Object.values(this.unread).reduce((a, b) => a + b, 0);
  }
  _setUnread(unread) {
    const before = this.unread;
    this.unread = unread;
    if (JSON.stringify(before) !== JSON.stringify(unread)) for (const fn of this.unreadListeners) fn(unread, before);
  }
  async pollUnread() {
    if (!this.user) return this._setUnread({});
    try {
      const { unread } = await this._api('/messages/unread');
      this._setUnread(unread || {});
    } catch {
      /* offline */
    }
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
  async buy(itemId) {
    if (this.user) {
      const { user } = await this._api('/shop/buy', { method: 'POST', body: { item: itemId } });
      this.user = user;
      this._changed();
      return;
    }
    const g = this.guest;
    g.items = g.items || {};
    const price = priceOf(itemId, g.items);
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
  // your quick chat wheel (8 phrases)
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
  async adminQuests(mode) {
    const { quests } = await this._api('/admin/quests', { method: 'POST', body: { mode } });
    this.quests = quests;
    this._changed();
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
    this.body = document.getElementById('account-body');
    this.tab = 'profile';
    this.adminActions = null; // set by the game: { god, ammo, toggle(name), run(action, value), inSolo }
    // friend chat; the game sets roomCode() (your room, for invites) and joinRoom(code)
    this.chatWith = null;
    this.dm = { list: [], last: 0, timer: 0 };
    this.roomCode = () => null;
    this.joinRoom = null;
    account.onParty(() => {
      this.renderCard();
      if (!this.modal.classList.contains('hidden') && this.tab === 'friends' && !this.chatWith) this._loadFriends();
    });
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
      if (e.target === this.modal || e.target.closest('[data-close]')) this.close();
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

  open(tab = 'profile', keepChat = false) {
    this.tab = tab;
    if (!keepChat) this.chatWith = null;
    this.modal.classList.remove('hidden');
    this.render();
  }
  close() {
    this.modal.classList.add('hidden');
    this._stopDm();
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
    badge('friends-btn', a.unreadTotal + a.partyInvites.length);
    const p = a.profile;
    const lvl = a.level;
    const into = a.xp - xpForLevel(lvl);
    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    this.card.innerHTML = `
      <div class="ac-avatar">${esc(p.avatar)}</div>
      <div class="ac-main">
        <div class="ac-name" style="color:${esc(p.color)}">${esc(a.name)} <span class="ac-title">${esc(p.title)}</span></div>
        <div class="ac-level"><span class="coins">🪙 ${a.coins}</span> Level ${lvl}<div class="xpbar"><div style="width:${Math.min(100, (into / need) * 100)}%"></div></div><span>${into}/${need} XP</span></div>
        <div class="ac-buttons">
          <button data-open="profile">Customise</button>
          <button data-open="leaderboard">Leaderboard</button>
          ${a.loggedIn ? '' : '<button data-open="login" class="hot">Log in / Sign up</button>'}
        </div>
      </div>`;
  }

  render() {
    this._renderTabs();
    const fn = { shop: this._shop, quests: this._quests, mastery: this._mastery, profile: this._profile, friends: this._friends, leaderboard: this._leaderboard, login: this._login, account: this._accountTab, admin: this._admin }[this.tab] || this._profile;
    fn.call(this);
  }

  _renderTabs() {
    const tabs = [['shop', '🪙 Shop'], ['quests', `📜 Quests${this.account.questsReady ? ` (${this.account.questsReady})` : ''}`], ['profile', 'Customise'], ['mastery', '🏅 Mastery'], ['friends', `Friends${this.account.unreadTotal ? ` (${this.account.unreadTotal})` : ''}`], ['leaderboard', 'Leaderboard'], [this.account.loggedIn ? 'account' : 'login', this.account.loggedIn ? 'Account' : 'Log in']];
    if (this.account.loggedIn) tabs.push(['admin', this.account.admin ? '⭐ Admin' : 'Admin code']);
    document.getElementById('account-tabs').innerHTML = tabs
      .map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('');
  }

  _login() {
    this.body.innerHTML = `
      <p class="muted">An account saves your level, unlocks and stats on the server, and lets you add friends.</p>
      <form id="auth-form" class="auth">
        <input name="username" placeholder="Username" autocomplete="username" maxlength="16" required />
        <input name="password" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" maxlength="128" required />
        <div class="row">
          <button type="submit" data-action="login" class="btn small">LOG IN</button>
          <button type="submit" data-action="register" class="btn small ghost">CREATE ACCOUNT</button>
        </div>
        <div id="auth-msg" class="msg"></div>
      </form>
      <p class="muted small">Playing as a guest keeps your progress in this browser only. It isn't merged into a new account.</p>`;
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
      <button id="logout-btn" class="btn small ghost">LOG OUT</button>`;
    document.getElementById('logout-btn').onclick = () => this.account.logout().then(() => this.close());
  }

  _profile() {
    const a = this.account;
    const p = { ...a.profile };
    const lvl = a.unlockLevel;
    const section = (kind, title, list, render) => `
      <h4>${title}</h4>
      <div class="pick-row" data-kind="${kind}">
        ${list
          .map(([id, need, label, extra]) => {
            const locked = need > lvl && !a.items[cosmeticItemId(kind, id)];
            const price = locked ? cosmeticPrice(kind, id) : null;
            return `<button class="pick ${p[kind] === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-id="${esc(id)}" ${locked ? 'disabled' : ''} title="${locked ? `Unlocks at level ${need}, or buy it in the shop` : esc(label || id)}">${render(id, label, extra)}${locked ? `<i>Lv ${need} · 🪙${price}</i>` : ''}</button>`;
          })
          .join('')}
      </div>`;
    this.body.innerHTML = `
      <div class="preview">${nameTag({ username: a.name, profile: p })} <span class="ac-title">${esc(p.title)}</span></div>
      ${section('avatar', 'Avatar', AVATARS, (id) => `<span class="big">${id}</span>`)}
      ${section('color', 'Name colour', NAME_COLORS, (id, label) => `<span class="swatch" style="background:${id}"></span>${label}`)}
      ${section('title', 'Title', TITLES, (id) => esc(id))}
      ${section('crosshair', 'Crosshair', CROSSHAIRS, (id, label) => `<span class="swatch" style="background:${id}"></span>${label}`)}
      ${section('finish', 'Gun finish', FINISHES, (id, label, color) => `<span class="swatch" style="background:${color}"></span>${label}`)}
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
    this.body.querySelectorAll('.pick-row').forEach((row) => {
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

  _shop() {
    const a = this.account;
    const items = a.items;
    const card = (def) => {
      const have = items[def.id] || 0;
      const price = priceOf(def.id, items);
      let status = '';
      let button = '';
      if (def.kind === 'upgrade') {
        status = `<div class="pips">${Array.from({ length: def.max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</div>`;
        button = price === null ? '<span class="maxed">MAX</span>' : `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
      } else if (def.kind === 'gun') {
        if (!have) button = `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
        else if (items.loadout === def.gun) button = '<button class="btn small ghost" data-unequip="1">EQUIPPED ✓</button>';
        else button = `<button class="btn small ghost" data-equip="${def.gun}">EQUIP</button>`;
      } else {
        status = `<div class="owned-count">You have ${have}</div>`;
        button = price === null ? '<span class="maxed">MAX</span>' : `<button class="btn small" data-buy="${def.id}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`;
      }
      return `<div class="shop-card"><div class="si">${def.icon}</div><div class="sn">${esc(def.name)}</div><div class="sd">${esc(def.desc)}</div>${status}${button}</div>`;
    };
    const lists = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES };
    const names = { avatar: 'Avatar', color: 'Name colour', title: 'Title', crosshair: 'Crosshair', finish: 'Gun finish' };
    const cosmetics = Object.entries(lists)
      .flatMap(([kind, list]) =>
        list
          .filter(([id, need]) => need > a.unlockLevel && !items[cosmeticItemId(kind, id)])
          .map(([id, need, label, color]) => {
            const price = cosmeticPrice(kind, id);
            const show = kind === 'avatar' ? `<span class="big">${id}</span>` : kind === 'color' || kind === 'crosshair' ? `<span class="swatch" style="background:${id}"></span>${esc(label)}` : kind === 'finish' ? `<span class="swatch" style="background:${color}"></span>${esc(label)}` : esc(id);
            return `<div class="cos-item"><span class="muted small">${names[kind]}</span> ${show} <button class="btn small" data-buy="${cosmeticItemId(kind, id)}" ${a.coins < price ? 'disabled' : ''}>🪙 ${price}</button></div>`;
          })
      )
      .join('');
    this.body.innerHTML = `
      <div class="shop-head"><span class="coins big">🪙 ${a.coins}</span>
        <span class="muted">Earn coins from kills, headshots and waves in solo, and from kills and wins online.</span></div>
      <div id="shop-msg" class="msg"></div>
      <h4>Upgrades <span class="muted small">(solo runs)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'upgrade').map(card).join('')}</div>
      <h4>Starting gun <span class="muted small">(own it, equip it, start every solo run with it)</span></h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'gun').map(card).join('')}</div>
      <h4>Items</h4>
      <div class="shop-grid">${SHOP.filter((s) => s.kind === 'consumable').map(card).join('')}</div>
      <h4>Cosmetics <span class="muted small">(skip the level requirement)</span></h4>
      <div class="cos-list">${cosmetics || '<p class="muted">You own every cosmetic!</p>'}</div>
      ${a.loggedIn ? '' : '<p class="muted small">Guest: coins and purchases are saved in this browser. Log in to keep them on your account.</p>'}`;
    const msg = (t) => (document.getElementById('shop-msg').textContent = t);
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
    this.body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => a.setLoadout(b.dataset.equip).catch((e) => msg(e.message))));
    this.body.querySelectorAll('[data-unequip]').forEach((b) => b.addEventListener('click', () => a.setLoadout(null).catch((e) => msg(e.message))));
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
    this.body.innerHTML = `
      <p class="muted">Admin account: every customisation is unlocked. Cheats work in solo games only (multiplayer stays fair).</p>
      <h4>Account</h4>
      <form class="auth inline admin-row" data-act="level"><input name="v" type="number" min="1" max="200" placeholder="Set level (1-200)" /><button class="btn small">SET LEVEL</button></form>
      <form class="auth inline admin-row" data-act="coins"><input name="v" type="number" min="0" placeholder="Set coins" /><button class="btn small">SET COINS</button></form>
      <div class="admin-grid">
        <button class="btn small" data-acc="mastery-max">🏅 MAX ALL GUN MASTERY</button>
        <button class="btn small ghost" data-acc="mastery-reset">RESET GUN MASTERY</button>
        <button class="btn small" data-acc="quests-complete">📜 FINISH TODAY'S QUESTS</button>
        <button class="btn small ghost" data-acc="quests-reset">RESET TODAY'S QUESTS</button>
        <button class="btn small ghost" data-run="tutorial">REPLAY THE TUTORIAL</button>
        <button class="btn small ghost" id="admin-quick-reset">RESET MY QUICK CHAT</button>
      </div>
      <h4>Solo cheats ${mp ? '<span class="muted">(off in multiplayer)</span>' : ''}</h4>
      <div class="admin-grid">
        ${[
          ['god', 'God mode'], ['ammo', 'Infinite ammo (all guns)'], ['onehit', 'One-hit kills'], ['fly', 'Fly / noclip (Space up, C down, Shift fast)'],
          ['speed', '2× move speed'], ['freeze', 'Freeze zombies'], ['slowmo', 'Slow motion'], ['nohud', 'Hide HUD (screenshots)'],
          ['grenades', 'Infinite grenades'], ['build', 'Free building (no scrap)'], ['turrets', 'Super turrets (5× damage)'], ['instabuild', 'Unlimited builds (no max)'],
        ]
          .map(([id, label]) => `<label><input type="checkbox" data-toggle="${id}" ${act?.cheats[id] ? 'checked' : ''} ${mp ? 'disabled' : ''} /> ${label}</label>`)
          .join('')}
      </div>
      ${solo ? '' : '<p class="muted small">The buttons below need a solo game running: start one, then press F2.</p>'}
      <div class="admin-grid">
        <button class="btn small" data-run="guns" ${solo ? '' : 'disabled'}>GIVE ALL GUNS</button>
        <button class="btn small" data-run="mutate" ${solo ? '' : 'disabled'}>MUTATE ALL MY GUNS</button>
        <button class="btn small" data-run="powerups" ${solo ? '' : 'disabled'}>MAX ALL POWER-UPS</button>
        <button class="btn small" data-run="heal" ${solo ? '' : 'disabled'}>FULL HEAL + OVERHEAL</button>
        <button class="btn small" data-run="boss" ${solo ? '' : 'disabled'}>SPAWN BOSS</button>
        <button class="btn small" data-run="killall" ${solo ? '' : 'disabled'}>KILL ALL ZOMBIES</button>
        <button class="btn small" data-run="scrap" ${solo ? '' : 'disabled'}>🔩 MAX SCRAP</button>
        <button class="btn small" data-run="nades" ${solo ? '' : 'disabled'}>💣 REFILL GRENADES</button>
        <button class="btn small" data-run="skiptut" ${solo ? '' : 'disabled'}>SKIP TUTORIAL</button>
      </div>
      <div class="auth inline admin-row">
        <select id="admin-boss" ${solo ? '' : 'disabled'}>${(act?.bosses() || []).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select>
        <button class="btn small" id="admin-boss-btn" ${solo ? '' : 'disabled'}>SPAWN THIS BOSS</button>
      </div>
      <h4>Undo</h4>
      <div class="admin-grid">
        <button class="btn small ghost" data-run="removeguns" ${solo ? '' : 'disabled'}>REMOVE ALL GUNS</button>
        <button class="btn small ghost" data-run="unmutate" ${solo ? '' : 'disabled'}>UNMUTATE GUNS</button>
        <button class="btn small ghost" data-run="resetpowerups" ${solo ? '' : 'disabled'}>RESET POWER-UPS</button>
        <button class="btn small ghost" data-run="clearbuilds" ${solo ? '' : 'disabled'}>REMOVE ALL BUILDS</button>
        <button class="btn small ghost" data-run="noscrap" ${solo ? '' : 'disabled'}>ZERO SCRAP & GRENADES</button>
        <button class="btn small ghost" data-run="cheatsoff">TURN OFF ALL CHEATS</button>
      </div>
      <div class="auth inline admin-row">
        <select id="admin-zombie" ${solo ? '' : 'disabled'}>${(act?.zombieTypes() || []).map((t) => `<option>${t}</option>`).join('')}</select>
        <button class="btn small" id="admin-spawn" ${solo ? '' : 'disabled'}>SPAWN 5</button>
        <select id="admin-weather" ${solo ? '' : 'disabled'}>${solo ? act.weathers().map(([id, n]) => `<option value="${id}">${n}</option>`).join('') : ''}</select>
        <button class="btn small" id="admin-weather-btn" ${solo ? '' : 'disabled'}>SET WEATHER</button>
      </div>
      <h4>Multiplayer</h4>
      <form class="auth inline admin-row" id="admin-announce"><input name="v" maxlength="80" placeholder="Announce to everyone in your room" ${mp ? '' : 'disabled'} /><button class="btn small" ${mp ? '' : 'disabled'}>📢 ANNOUNCE</button></form>
      ${mp ? '' : '<p class="muted small">Join or create a room to send announcements.</p>'}
      <h4>Solo game</h4>
      <form class="auth inline admin-row" data-act="score"><input name="v" type="number" min="0" placeholder="Set score" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET SCORE</button></form>
      <form class="auth inline admin-row" data-act="setscrap"><input name="v" type="number" min="0" max="999" placeholder="Set scrap" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET SCRAP</button></form>
      <form class="auth inline admin-row" data-act="setnades"><input name="v" type="number" min="0" max="20" placeholder="Set grenades" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET GRENADES</button></form>
      <form class="auth inline admin-row" data-act="wave"><input name="v" type="number" min="1" max="200" placeholder="Jump to wave" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET WAVE</button></form>
      <div id="admin-msg" class="msg"></div>
      <p class="muted small">Press F2 in-game to open this panel. In multiplayer you get an ADMIN badge, and as host you can kick players.</p>`;
    const msg = (t) => (document.getElementById('admin-msg').textContent = t);
    const spawn = document.getElementById('admin-spawn');
    if (spawn) spawn.onclick = () => msg(act.run('spawn', document.getElementById('admin-zombie').value));
    document.getElementById('admin-announce').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      msg(act.announce(input.value));
      input.value = '';
    });
    document.getElementById('admin-quick-reset').onclick = () => a.setQuickChat([]).then(() => msg('Quick chat back to the defaults.'), (e) => msg(e.message));
    const bbtn = document.getElementById('admin-boss-btn');
    if (bbtn) bbtn.onclick = () => msg(act.run('boss', document.getElementById('admin-boss').value));
    this.body.querySelectorAll('[data-acc]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [what, mode] = b.dataset.acc.split('-');
        try {
          if (what === 'mastery') await a.adminMastery(mode);
          else await a.adminQuests(mode);
          msg(
            {
              'mastery-max': 'Every gun is Diamond: all skins unlocked (🏅 Mastery).',
              'mastery-reset': 'Gun mastery reset.',
              'quests-complete': "Today's quests are done: claim them in 📜 Quests.",
              'quests-reset': "Today's quests reset.",
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

  async _friends() {
    const a = this.account;
    if (!a.loggedIn) {
      this.body.innerHTML = `<p class="muted">Log in to add friends, chat with them and see when they're online.</p><button class="btn small" data-tab="login">LOG IN</button>`;
      return;
    }
    if (this.chatWith) return this._chatView();
    this._stopDm();
    this.body.innerHTML = `
      <form id="friend-form" class="auth inline">
        <input name="username" placeholder="Friend's username" maxlength="16" required />
        <button class="btn small">ADD FRIEND</button>
      </form>
      <div id="friend-msg" class="msg"></div>
      <div id="friend-list" class="muted">Loading…</div>`;
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
        <h4>Friends (${friends.length})</h4>
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

  async _leaderboard() {
    this.body.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const { players } = await this.account.leaderboard();
      this.body.innerHTML = `
        <table class="board">
          <tr><th>#</th><th>Player</th><th>Lv</th><th>Best wave</th><th>Best score</th><th>PvP kills</th></tr>
          ${players.map((u, i) => `<tr class="${u.username === this.account.name ? 'me' : ''}"><td>${i + 1}</td><td>${nameTag(u)}</td><td>${u.level}</td><td>${u.stats.bestWave}</td><td>${u.stats.bestScore}</td><td>${u.stats.pvpKills}</td></tr>`).join('')}
        </table>
        ${players.length ? '' : '<p class="muted">Nobody yet. Be the first!</p>'}`;
    } catch (err) {
      this.body.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  }
}
