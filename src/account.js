import { AVATARS, CROSSHAIRS, DEFAULT_PROFILE, FINISHES, NAME_COLORS, TITLES, cleanProfile, levelFromXp, xpForLevel, xpForRun } from '../shared/cosmetics.js';
import { SHOP, coinsForRun, cosmeticItemId, cosmeticPrice, priceOf } from '../shared/shop.js';

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
    try {
      this.guest = { ...emptyGuest(), ...JSON.parse(store.get(GUEST_KEY) || '{}') };
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
    // keeps "online" status fresh for friends
    setInterval(() => {
      if (this.user && document.visibilityState === 'visible') this._api('/me').then(({ user }) => (this.user = user)).catch(() => {});
    }, 60000);
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
  }
  async logout() {
    try {
      await this._api('/logout', { method: 'POST' });
    } catch {
      /* already gone */
    }
    this._dropSession();
  }

  // Saved solo run on the server (logged-in players only).
  async getSave() {
    if (!this.user) return null;
    const { save } = await this._api('/save');
    return save;
  }
  async putSave(save) {
    if (!this.user) return;
    await this._api('/save', { method: 'PUT', body: { save } });
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
    account.onChange(() => {
      this.renderCard();
      if (!this.modal.classList.contains('hidden')) this.render();
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || e.target.closest('[data-close]')) this.close();
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.tab = t.dataset.tab;
        this.render();
      }
    });
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) this.open(b.dataset.open);
    });
    this.renderCard();
  }

  open(tab = 'profile') {
    this.tab = tab;
    this.modal.classList.remove('hidden');
    this.render();
  }
  close() {
    this.modal.classList.add('hidden');
  }

  renderCard() {
    const a = this.account;
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
          <button data-open="shop" class="hot">🪙 Shop</button>
          <button data-open="profile">Customise</button>
          <button data-open="friends">Friends</button>
          <button data-open="leaderboard">Leaderboard</button>
          ${a.loggedIn ? '' : '<button data-open="login" class="hot">Log in / Sign up</button>'}
        </div>
      </div>`;
  }

  render() {
    const tabs = [['shop', '🪙 Shop'], ['profile', 'Customise'], ['friends', 'Friends'], ['leaderboard', 'Leaderboard'], [this.account.loggedIn ? 'account' : 'login', this.account.loggedIn ? 'Account' : 'Log in']];
    if (this.account.loggedIn) tabs.push(['admin', this.account.admin ? '⭐ Admin' : 'Admin code']);
    document.getElementById('account-tabs').innerHTML = tabs
      .map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('');
    const fn = { shop: this._shop, profile: this._profile, friends: this._friends, leaderboard: this._leaderboard, login: this._login, account: this._accountTab, admin: this._admin }[this.tab] || this._profile;
    fn.call(this);
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
      <div id="profile-msg" class="msg">${a.loggedIn ? 'Saved to your account.' : 'Guest: saved in this browser.'} Level up to unlock more.</div>`;
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
    this.body.innerHTML = `
      <p class="muted">Admin account: every customisation is unlocked. Cheats work in solo games only (multiplayer stays fair).</p>
      <h4>Account</h4>
      <form class="auth inline admin-row" data-act="xp"><input name="v" type="number" min="0" placeholder="Set XP (level 10 = 20250)" /><button class="btn small">SET XP</button></form>
      <form class="auth inline admin-row" data-act="coins"><input name="v" type="number" min="0" placeholder="Set coins" /><button class="btn small">SET COINS</button></form>
      <h4>Solo game ${solo ? '' : '<span class="muted">(start a solo game to use these)</span>'}</h4>
      <div class="admin-grid">
        ${[
          ['god', 'God mode'], ['ammo', 'Infinite ammo (all guns)'], ['onehit', 'One-hit kills'], ['fly', 'Fly / noclip (Space up, C down, Shift fast)'],
          ['speed', '2× move speed'], ['freeze', 'Freeze zombies'], ['slowmo', 'Slow motion'], ['nohud', 'Hide HUD (screenshots)'],
        ]
          .map(([id, label]) => `<label><input type="checkbox" data-toggle="${id}" ${act?.cheats[id] ? 'checked' : ''} ${solo ? '' : 'disabled'} /> ${label}</label>`)
          .join('')}
        <button class="btn small" data-run="guns" ${solo ? '' : 'disabled'}>GIVE ALL GUNS</button>
        <button class="btn small" data-run="mutate" ${solo ? '' : 'disabled'}>MUTATE ALL MY GUNS</button>
        <button class="btn small" data-run="powerups" ${solo ? '' : 'disabled'}>MAX ALL POWER-UPS</button>
        <button class="btn small" data-run="heal" ${solo ? '' : 'disabled'}>FULL HEAL + OVERHEAL</button>
        <button class="btn small" data-run="boss" ${solo ? '' : 'disabled'}>SPAWN BOSS</button>
        <button class="btn small" data-run="killall" ${solo ? '' : 'disabled'}>KILL ALL ZOMBIES</button>
      </div>
      <div class="auth inline admin-row">
        <select id="admin-zombie" ${solo ? '' : 'disabled'}>${(act?.zombieTypes() || []).map((t) => `<option>${t}</option>`).join('')}</select>
        <button class="btn small" id="admin-spawn" ${solo ? '' : 'disabled'}>SPAWN 5</button>
        <select id="admin-weather" ${solo ? '' : 'disabled'}>${solo ? act.weathers().map(([id, n]) => `<option value="${id}">${n}</option>`).join('') : ''}</select>
        <button class="btn small" id="admin-weather-btn" ${solo ? '' : 'disabled'}>SET WEATHER</button>
      </div>
      <form class="auth inline admin-row" data-act="score"><input name="v" type="number" min="0" placeholder="Set score" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET SCORE</button></form>
      <form class="auth inline admin-row" data-act="wave"><input name="v" type="number" min="1" max="200" placeholder="Jump to wave" ${solo ? '' : 'disabled'} /><button class="btn small" ${solo ? '' : 'disabled'}>SET WAVE</button></form>
      <div id="admin-msg" class="msg"></div>
      <p class="muted small">Press F2 in-game to open this panel. In multiplayer you get an ADMIN badge, and as host you can kick players.</p>`;
    const msg = (t) => (document.getElementById('admin-msg').textContent = t);
    const spawn = document.getElementById('admin-spawn');
    if (spawn) spawn.onclick = () => msg(act.run('spawn', document.getElementById('admin-zombie').value));
    const wbtn = document.getElementById('admin-weather-btn');
    if (wbtn) wbtn.onclick = () => msg(act.run('weather', document.getElementById('admin-weather').value));
    this.body.querySelectorAll('[data-toggle]').forEach((cb) =>
      cb.addEventListener('change', () => msg(act.toggle(cb.dataset.toggle, cb.checked)))
    );
    this.body.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => msg(act.run(b.dataset.run))));
    this.body.querySelectorAll('form[data-act]').forEach((f) =>
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Number(new FormData(f).get('v'));
        if (!Number.isFinite(v)) return;
        if (f.dataset.act === 'xp' || f.dataset.act === 'coins') {
          try {
            if (f.dataset.act === 'xp') await a.adminSetXp(v);
            else await a.adminSetCoins(v);
            msg(f.dataset.act === 'xp' ? `XP set. You're level ${a.level}.` : `Coins set to ${a.coins}.`);
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
      this.body.innerHTML = `<p class="muted">Log in to add friends and see when they're online.</p><button class="btn small" data-tab="login">LOG IN</button>`;
      return;
    }
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
      el.innerHTML = `
        ${incoming.length ? `<h4>Requests</h4>${incoming.map((u) => row(u, `<button data-f="accept" data-u="${esc(u.username)}">Accept</button><button data-f="remove" data-u="${esc(u.username)}">Decline</button>`)).join('')}` : ''}
        <h4>Friends (${friends.length})</h4>
        ${friends.length ? friends.map((u) => row(u, `<button data-f="remove" data-u="${esc(u.username)}">Remove</button>`)).join('') : '<p class="muted">No friends yet. Add someone by their username.</p>'}
        ${outgoing.length ? `<h4>Sent</h4>${outgoing.map((u) => row(u, `<button data-f="remove" data-u="${esc(u.username)}">Cancel</button>`)).join('')}` : ''}
        <p class="muted small">To play together: Multiplayer → Create room, then send your friends the room code.</p>`;
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
