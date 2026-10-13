import { AVATARS, CROSSHAIRS, DEFAULT_PROFILE, FINISHES, NAME_COLORS, TITLES, cleanProfile, levelFromXp, xpForLevel, xpForRun } from '../shared/cosmetics.js';

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
  return { xp: 0, profile: { ...DEFAULT_PROFILE }, stats: { bestWave: 0, bestScore: 0, kills: 0, headshots: 0, games: 0, pvpKills: 0, pvpWins: 0 } };
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
  get profile() {
    return cleanProfile(this.user ? this.user.profile : this.guest.profile, this.level);
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

  async saveProfile(profile) {
    const clean = cleanProfile(profile, this.level);
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
        const { user, gained } = await this._api('/progress', { method: 'POST', body: run });
        this.user = user;
        this._changed();
        return { gained, levelBefore, levelAfter: this.level };
      } catch (e) {
        return { gained: 0, levelBefore, levelAfter: levelBefore, error: e.message };
      }
    }
    const pvp = run.mode === 'pvp';
    const gained = xpForRun({ wave: pvp ? 0 : run.wave, score: pvp ? run.kills * 100 + (run.won ? 500 : 0) : run.score, kills: run.kills });
    const g = this.guest;
    g.xp += gained;
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
    return { gained, levelBefore, levelAfter: this.level };
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
        <div class="ac-level">Level ${lvl}<div class="xpbar"><div style="width:${Math.min(100, (into / need) * 100)}%"></div></div><span>${into}/${need} XP</span></div>
        <div class="ac-buttons">
          <button data-open="profile">Customise</button>
          <button data-open="friends">Friends</button>
          <button data-open="leaderboard">Leaderboard</button>
          ${a.loggedIn ? '' : '<button data-open="login" class="hot">Log in / Sign up</button>'}
        </div>
      </div>`;
  }

  render() {
    const tabs = [['profile', 'Customise'], ['friends', 'Friends'], ['leaderboard', 'Leaderboard'], [this.account.loggedIn ? 'account' : 'login', this.account.loggedIn ? 'Account' : 'Log in']];
    document.getElementById('account-tabs').innerHTML = tabs
      .map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('');
    const fn = { profile: this._profile, friends: this._friends, leaderboard: this._leaderboard, login: this._login, account: this._accountTab }[this.tab];
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
    const lvl = a.level;
    const section = (kind, title, list, render) => `
      <h4>${title}</h4>
      <div class="pick-row" data-kind="${kind}">
        ${list
          .map(([id, need, label, extra]) => {
            const locked = need > lvl;
            return `<button class="pick ${p[kind] === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-id="${esc(id)}" ${locked ? 'disabled' : ''} title="${locked ? `Unlocks at level ${need}` : esc(label || id)}">${render(id, label, extra)}${locked ? `<i>Lv ${need}</i>` : ''}</button>`;
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
