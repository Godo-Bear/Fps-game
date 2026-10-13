import * as THREE from 'three';
import { MAPS, MODES, MP_MAPS, FLAG_BASES, POINT, makeRoomCode } from '../shared/modes.js';
import { GUNS, buildGun } from './guns.js';
import { heightAt } from './terrain.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TEAM_COLOR = { red: 0xc0392b, blue: 0x2f6fd0 };
const TEAM_CSS = { red: '#ff5d4d', blue: '#5ea2ff' };
export const FLAG_BITS = { crouch: 1, aim: 2, climb: 4, slide: 8 };

function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 28px Rajdhani, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.3, 1);
  s.renderOrder = 5;
  return s;
}

// Another player's soldier in the world.
class Avatar {
  constructor(info, teamColor) {
    this.id = info.id;
    this.info = info;
    this.root = new THREE.Group();
    this.parts = [];
    const vest = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3d4234, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.9 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7 });
    this.mats = [vest, cloth, skin, helmet];
    const part = (geo, mat, kind, parent, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.userData.player = this.id;
      m.userData.kind = kind;
      parent.add(m);
      this.parts.push(m);
      return m;
    };
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0.9, 0);
    this.legR.position.set(0.13, 0.9, 0);
    const legGeo = new THREE.BoxGeometry(0.22, 0.9, 0.24);
    legGeo.translate(0, -0.45, 0);
    part(legGeo, cloth, 'body', this.legL, 0, 0, 0);
    part(legGeo, cloth, 'body', this.legR, 0, 0, 0);
    this.body.add(this.legL, this.legR);
    this.upper = new THREE.Group();
    this.upper.position.y = 0.9;
    this.body.add(this.upper);
    part(new THREE.BoxGeometry(0.54, 0.7, 0.32), vest, 'body', this.upper, 0, 0.35, 0);
    this.head = new THREE.Group();
    this.head.position.y = 0.88;
    this.upper.add(this.head);
    part(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin, 'head', this.head, 0, 0, 0);
    part(new THREE.BoxGeometry(0.38, 0.14, 0.38), helmet, 'head', this.head, 0, 0.17, 0);
    // arms hold the gun forward
    const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
    armGeo.translate(0, -0.3, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(0.32, 0.62, 0);
    this.armR.rotation.x = -1.2;
    part(armGeo, vest, 'body', this.armR, 0, 0, 0);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.32, 0.62, 0);
    this.armL.rotation.set(-1.35, 0.5, 0);
    part(armGeo, vest, 'body', this.armL, 0, 0, 0);
    this.upper.add(this.armR, this.armL);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.12, 0.5, 0.35);
    this.gunHolder.rotation.y = Math.PI;
    this.upper.add(this.gunHolder);
    this.label = nameSprite(info.name, info.team && MODES_TEAMS() ? TEAM_CSS[info.team] : info.color || '#fff');
    this.label.position.y = 2.2;
    this.root.add(this.label);
    this.gunId = null;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = 0;
    this.phase = 0;
    this.alive = true;
    this.deadT = 0;
    this.lastShot = -99;
    this.fresh = true;
  }

  setGun(id) {
    if (this.gunId === id || !GUNS[id]) return;
    this.gunId = id;
    this.gunHolder.clear();
    const g = buildGun(id).group;
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.gunHolder.add(g);
  }

  update(dt, flags) {
    if (this.fresh) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.fresh = false;
    }
    const before = this.pos.clone();
    this.pos.lerp(this.target, Math.min(1, dt * 14));
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    this.root.position.copy(this.pos);
    // our yaw convention looks down -z; the model faces +z
    this.root.rotation.y = this.yaw + Math.PI;
    const speed = before.distanceTo(this.pos) / Math.max(dt, 1e-3);
    if (this.alive) {
      this.body.rotation.x = 0;
      this.phase += dt * speed * 2.2;
      const sw = speed > 0.5 ? Math.sin(this.phase) : 0;
      const crouch = flags & (FLAG_BITS.crouch | FLAG_BITS.slide);
      this.legL.rotation.x = sw * 0.6 + (crouch ? -0.9 : 0);
      this.legR.rotation.x = -sw * 0.6 + (crouch ? -0.3 : 0);
      this.body.position.y = crouch ? -0.4 : 0;
      this.upper.rotation.x = -this.pitch * 0.5;
      this.head.rotation.x = -this.pitch * 0.5;
      this.label.visible = true;
    } else {
      this.deadT += dt;
      this.body.rotation.x = -Math.min(1, this.deadT / 0.4) * Math.PI * 0.48;
      this.label.visible = false;
    }
    // co-op: a downed squadmate gets a marker so you can find and revive them
    if (!this.alive && this.downed) {
      if (!this.downSprite) {
        this.downSprite = nameSprite('✚ REVIVE', '#5dff6a');
        this.downSprite.position.y = 1.2;
        this.root.add(this.downSprite);
      }
      this.downSprite.visible = true;
      this.downSprite.material.opacity = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    } else if (this.downSprite) this.downSprite.visible = false;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
let teamsMode = true;
const MODES_TEAMS = () => teamsMode;

// Online rooms: connection, lobby screen, other players, objectives and the match HUD.
export class Multiplayer {
  constructor(ctx) {
    this.ctx = ctx; // { scene, effects, audio, account, player, weapon, onMatchStart, onSpawn, onHurt, onDeath, onEnd, onLobby, onLeave, banner, subBanner }
    this.ws = null;
    this.myId = 0;
    this.lobby = null;
    this.avatars = new Map();
    this.parts = [];
    this.snap = null;
    this.mode = 'tdm';
    this.map = 'plains';
    this.inMatch = false;
    this.sendT = 0;
    this.shotT = 0;
    this.objects = new THREE.Group();
    this.feed = [];
    this.myStats = { kills: 0, deaths: 0, headshots: 0 };
    this._bindLobbyUi();
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
  get me() {
    return this.lobby?.players.find((p) => p.id === this.myId);
  }
  get myTeam() {
    return this.me?.team;
  }
  get teams() {
    return MODES[this.mode]?.teams;
  }
  isHost() {
    return this.lobby && this.lobby.host === this.myId;
  }

  // ---------------------------------------------------------------- connection
  async create() {
    for (let i = 0; i < 4; i++) {
      const code = makeRoomCode();
      const r = await this._connect(code, true);
      if (r !== 'taken') return r;
    }
    return 'Could not create a room, try again';
  }
  join(code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return Promise.resolve('Room codes are 5 letters/numbers');
    return this._connect(code, false);
  }

  // Resolves with null on success or an error message.
  _connect(code, create) {
    this.leave(true);
    return new Promise((resolve) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try {
        ws = new WebSocket(`${proto}://${location.host}/api/room/${code}/ws${create ? '?create=1' : ''}`);
      } catch {
        resolve("Can't connect to the server");
        return;
      }
      this.ws = ws;
      let settled = false;
      const done = (v) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      const timer = setTimeout(() => done('Connection timed out'), 8000);
      ws.onopen = () => {
        const a = this.ctx.account;
        ws.send(JSON.stringify({ t: 'join', name: a.loggedIn ? a.name : this._guestName(), token: a.token, avatar: a.profile.avatar, color: a.profile.color }));
      };
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m.t === 'error') {
          clearTimeout(timer);
          this.kickMsg = m.msg;
          done(m.msg);
          return;
        }
        if (m.t === 'welcome') {
          clearTimeout(timer);
          this.myId = m.id;
          done(null);
        }
        this._onMessage(m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        done('Disconnected');
        if (this.ws === ws) {
          this.ws = null;
          const wasIn = !!this.lobby;
          this._cleanup();
          if (wasIn) this.ctx.onLeave(this.kickMsg || 'Disconnected from the room');
          this.kickMsg = null;
        }
      };
      ws.onerror = () => done("Can't connect to the server (online play needs the Cloudflare backend)");
    });
  }

  _guestName() {
    let n = null;
    try {
      n = localStorage.getItem('deadplains.guestname');
      if (!n) {
        n = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem('deadplains.guestname', n);
      }
    } catch {
      n = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    }
    return n;
  }

  send(m) {
    if (this.connected) this.ws.send(JSON.stringify(m));
  }

  // co-op: pass a message to 'host', 'all' or one player id (through the server)
  relay(to, d) {
    if (to === 'me' || to === undefined) return;
    this.send({ t: 'relay', to, d });
  }

  leave(silent = false) {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.close();
    }
    const was = !!this.lobby;
    this._cleanup();
    if (was && !silent) this.ctx.onLeave(null);
  }

  _cleanup() {
    for (const a of this.avatars.values()) {
      this.ctx.scene.remove(a.root);
      a.dispose();
    }
    this.avatars.clear();
    this.parts = [];
    this.objects.removeFromParent();
    this.objects.clear();
    this.lobby = null;
    this.inMatch = false;
    this.snap = null;
  }

  // ---------------------------------------------------------------- messages
  _onMessage(m) {
    switch (m.t) {
      case 'lobby': {
        this.lobby = m;
        this.mode = m.mode;
        this.map = m.map;
        teamsMode = !!MODES[m.mode].teams;
        this._renderLobby();
        if (m.phase === 'lobby' && this.inMatch) {
          this.inMatch = false;
          this._clearMatch();
        }
        if (m.phase === 'lobby') this.ctx.onLobby();
        break;
      }
      case 'start':
        this.mode = m.mode;
        this.map = m.map;
        teamsMode = !!MODES[m.mode].teams;
        this.inMatch = true;
        this.endsAt = Date.now() + (m.endsAt - m.now);
        this.myStats = { kills: 0, deaths: 0, headshots: 0 };
        this.feed = [];
        this._renderFeed();
        this.ctx.onMatchStart(m.map, m.mode, m.weather);
        this._buildObjectives();
        this.ctx.onStructures?.(m.structures);
        break;
      case 'built':
        this.ctx.onBuilt?.(m.s);
        break;
      case 'shp':
        this.ctx.onStructureHp?.(m.id, m.hp);
        break;
      case 'sgone':
        this.ctx.onStructureGone?.(m.id, m.by);
        break;
      case 'fx':
        if (this.ctx.onFx) this.ctx.onFx(m);
        break;
      case 'spawn':
        this.ctx.onSpawn(m.p[0], m.p[1], m.yaw, m.hp, !!m.revived);
        break;
      case 'snap':
        this.snap = m;
        this._applySnap(m);
        break;
      case 'hurt':
        this.ctx.onHurt(m.dmg, m.hp, m.from);
        break;
      case 'kill':
        this._onKill(m);
        break;
      case 'shot': {
        const a = this.avatars.get(m.id);
        if (a) a.lastShot = performance.now();
        const o = new THREE.Vector3(...m.o);
        const e = new THREE.Vector3(...m.e);
        this.ctx.effects.tracer(o, e);
        this.ctx.audio.shot(GUNS[m.g]?.sound || 'rifle', false, o);
        break;
      }
      case 'relay':
        this.ctx.onRelay(m.from, m.d);
        break;
      case 'healed':
        this.ctx.onMyHp(m.hp);
        break;
      case 'chat':
        this.ctx.onChat(m.name, m.text, this.teams ? TEAM_CSS[m.team] : '#ffd38a', m.admin);
        break;
      case 'msg':
        this.ctx.onChat(null, m.text);
        this._addFeed(`<span class="sys" style="color:${m.team ? TEAM_CSS[m.team] : '#e9d9b8'}">${esc(m.text)}</span>`);
        if (m.big) this.ctx.banner(m.text.toUpperCase().slice(0, 30), '', m.team === this.myTeam ? 'gold' : 'red', 2);
        break;
      case 'left': {
        const a = this.avatars.get(m.id);
        if (a) {
          this.ctx.scene.remove(a.root);
          a.dispose();
          this.avatars.delete(m.id);
          this._rebuildParts();
        }
        break;
      }
      case 'end':
        this._onEnd(m);
        break;
    }
  }

  _name(id) {
    const p = this.lobby?.players.find((x) => x.id === id);
    return p ? p.name : '???';
  }
  _team(id) {
    return this.lobby?.players.find((x) => x.id === id)?.team;
  }

  _onKill(m) {
    const killer = this._name(m.k);
    const victim = this._name(m.v);
    const kc = this.teams ? TEAM_CSS[this._team(m.k)] : '#ffd38a';
    const vc = this.teams ? TEAM_CSS[this._team(m.v)] : '#e9d9b8';
    const gun = GUNS[m.g];
    this._addFeed(`<b style="color:${kc}">${esc(killer)}</b> <span class="gun">${gun ? gun.icon : '🔫'}${m.head ? ' 🎯' : ''}</span> <b style="color:${vc}">${esc(victim)}</b>`);
    if (m.k === this.myId) {
      this.myStats.kills++;
      if (m.head) this.myStats.headshots++;
      this.ctx.onKillConfirmed(victim, m.head);
    }
    if (m.v === this.myId) {
      this.myStats.deaths++;
      this.ctx.onDeath(killer, m.k);
    }
    const a = this.avatars.get(m.v);
    if (a) {
      a.alive = false;
      a.deadT = 0;
    }
  }

  _addFeed(html) {
    this.feed.unshift({ html, t: performance.now() });
    this.feed = this.feed.slice(0, 6);
    this._renderFeed();
  }
  _renderFeed() {
    $('killfeed').innerHTML = this.feed.map((f) => `<div>${f.html}</div>`).join('');
  }

  _applySnap(m) {
    const seen = new Set();
    for (const row of m.ps) {
      const [id, x, y, z, yaw, pitch, gun, hp, flags, alive] = row;
      seen.add(id);
      if (id === this.myId) {
        this.myHp = hp;
        this.ctx.onMyHp(hp); // health regen and heals come from the server in PvP
        continue;
      }
      let a = this.avatars.get(id);
      const info = this.lobby?.players.find((p) => p.id === id);
      if (!a) {
        if (!info) continue;
        const color = this.teams ? TEAM_COLOR[info.team] : new THREE.Color(info.color || '#888888').getHex();
        a = new Avatar(info, color);
        this.avatars.set(id, a);
        this.ctx.scene.add(a.root);
        this._rebuildParts();
      }
      a.target.set(x, y, z);
      a.targetYaw = yaw;
      a.pitch = pitch;
      a.flags = flags;
      a.hp = hp;
      if (alive && !a.alive) {
        a.alive = true;
        a.fresh = true;
      }
      a.alive = !!alive;
      a.downed = !alive && !!MODES[this.mode]?.coop;
      a.setGun(gun);
    }
    for (const id of [...this.avatars.keys()]) {
      if (!seen.has(id)) {
        const a = this.avatars.get(id);
        this.ctx.scene.remove(a.root);
        a.dispose();
        this.avatars.delete(id);
        this._rebuildParts();
      }
    }
  }

  _rebuildParts() {
    this.parts = [];
    for (const a of this.avatars.values()) for (const p of a.parts) this.parts.push(p);
  }

  // Can I damage this player?
  isEnemy(id) {
    if (MODES[this.mode]?.coop) return false;
    if (!this.teams) return true;
    return this._team(id) !== this.myTeam;
  }
  isAlive(id) {
    return this.avatars.get(id)?.alive;
  }

  reportHit(id, dmg, head) {
    this.send({ t: 'hit', id, dmg: Math.round(dmg * 10) / 10, head });
  }

  reportShot(origin, end) {
    const now = performance.now();
    if (now - this.shotT < 60) return;
    this.shotT = now;
    const r = (v) => Math.round(v * 100) / 100;
    this.send({ t: 'shot', o: [r(origin.x), r(origin.y), r(origin.z)], e: [r(end.x), r(end.y), r(end.z)] });
  }

  // ---------------------------------------------------------------- objectives
  _buildObjectives() {
    this.objects.clear();
    this.ctx.scene.add(this.objects);
    this.pointRing = null;
    this.flagMeshes = {};
    if (this.mode === 'koth') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(POINT.radius - 0.4, POINT.radius, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(POINT.x, heightAt(POINT.x, POINT.z) + 0.25, POINT.z);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.6, 30, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.set(POINT.x, ring.position.y + 15, POINT.z);
      this.objects.add(ring, beam);
      this.pointRing = ring;
      this.pointBeam = beam;
    }
    if (this.mode === 'ctf') {
      for (const team of ['red', 'blue']) {
        const [bx, bz] = FLAG_BASES[team];
        const pad = new THREE.Mesh(
          new THREE.RingGeometry(2.4, 3.2, 32),
          new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(bx, heightAt(bx, bz) + 0.2, bz);
        this.objects.add(pad);
        const flag = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        pole.position.y = 1.5;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 0.9, 6, 1),
          new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], side: THREE.DoubleSide, emissive: TEAM_COLOR[team], emissiveIntensity: 0.3 })
        );
        cloth.position.set(0.72, 2.5, 0);
        flag.add(pole, cloth);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.3, 20, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
        );
        beam.position.y = 10;
        flag.add(beam);
        this.objects.add(flag);
        this.flagMeshes[team] = { flag, cloth };
      }
    }
  }

  _clearMatch() {
    for (const a of this.avatars.values()) {
      this.ctx.scene.remove(a.root);
      a.dispose();
    }
    this.avatars.clear();
    this.parts = [];
    this.objects.removeFromParent();
    this.objects.clear();
    $('mp-hud').classList.add('hidden');
    $('respawn').classList.add('hidden');
    $('scoreboard').classList.add('hidden');
    this.ctx.defend?.stop();
  }

  // ---------------------------------------------------------------- per frame
  update(dt, t) {
    if (!this.inMatch) return;
    for (const a of this.avatars.values()) a.update(dt, a.flags || 0);

    // send our state ~15 times a second
    this.sendT -= dt;
    const p = this.ctx.player;
    if (this.sendT <= 0 && !p.dead) {
      this.sendT = 1 / 15;
      const flags = (p.crouching ? FLAG_BITS.crouch : 0) | (this.ctx.weapon.ads > 0.5 ? FLAG_BITS.aim : 0) | (p.climbing ? FLAG_BITS.climb : 0) | (p.sliding ? FLAG_BITS.slide : 0);
      const r = (v) => Math.round(v * 100) / 100;
      this.send({ t: 's', p: [r(p.pos.x), r(p.pos.y), r(p.pos.z)], r: [r(p.yaw), r(p.pitch)], g: this.ctx.weapon.def.id, f: flags });
    }

    // objectives
    const s = this.snap;
    if (s && this.pointRing && s.pt) {
      const owner = s.pt.owner;
      const col = owner ? TEAM_COLOR[owner] : s.pt.contested ? 0xffd34d : 0xffffff;
      this.pointRing.material.color.setHex(col);
      this.pointBeam.material.color.setHex(col);
      this.pointRing.rotation.z += dt * 0.3;
    }
    if (s && s.fl && this.flagMeshes) {
      for (const team of ['red', 'blue']) {
        const f = s.fl[team];
        const fm = this.flagMeshes[team];
        if (!f || !fm) continue;
        let x = f.pos[0];
        let z = f.pos[1];
        let y = heightAt(x, z);
        if (f.state === 'carried') {
          const carrier = f.carrier === this.myId ? { pos: p.pos } : this.avatars.get(f.carrier);
          if (carrier) {
            x = carrier.pos.x;
            y = carrier.pos.y + 0.8;
            z = carrier.pos.z;
          }
        }
        fm.flag.position.set(x, y, z);
        fm.flag.visible = !(f.state === 'carried' && f.carrier === this.myId);
        const pos = fm.cloth.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i);
          pos.setZ(i, Math.sin(t * 6 + px * 4) * 0.12 * (px + 0.7));
        }
        pos.needsUpdate = true;
      }
    }
    this._renderHud();
  }

  // markers for the minimap
  minimapMarkers() {
    const out = [];
    const now = performance.now();
    for (const a of this.avatars.values()) {
      if (!a.alive) continue;
      const enemy = this.isEnemy(a.id);
      // enemies only show briefly after they shoot
      if (enemy && now - a.lastShot > 2000) continue;
      out.push({ x: a.pos.x, z: a.pos.z, color: enemy ? '#ff4040' : MODES[this.mode]?.coop ? '#5ea2ff' : TEAM_CSS[a.info.team] || '#5ea2ff', r: 3 });
    }
    if (this.ctx.defend?.active) out.push(...this.ctx.defend.minimapMarkers());
    if (this.mode === 'koth') out.push({ x: POINT.x, z: POINT.z, color: this.snap?.pt?.owner ? TEAM_CSS[this.snap.pt.owner] : '#ffffff', r: POINT.radius, shape: 'ring' });
    if (this.mode === 'ctf' && this.snap?.fl) {
      for (const team of ['red', 'blue']) {
        const f = this.snap.fl[team];
        const fm = this.flagMeshes?.[team];
        const x = fm ? fm.flag.position.x : f.pos[0];
        const z = fm ? fm.flag.position.z : f.pos[1];
        out.push({ x, z, color: TEAM_CSS[team], r: 4, shape: 'diamond' });
      }
    }
    return out;
  }

  _renderHud() {
    const s = this.snap;
    if (!s) return;
    $('mp-hud').classList.remove('hidden');
    const left = s.left ?? 0;
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    let html = '';
    if (MODES[this.mode]?.coop) {
      const up = s.ps.filter((r) => r[9]).length;
      html = `<div class="mp-obj">${MODES[this.mode].name.toUpperCase()} · ${up}/${s.ps.length} of the squad standing</div>${this.ctx.defend?.active ? this.ctx.defend.hudHtml() : ''}`;
    } else if (this.teams) {
      html = `<div class="mp-score"><span class="red">${s.sc.red}</span><span class="time">${time}</span><span class="blue">${s.sc.blue}</span></div>`;
      const mode = MODES[this.mode];
      const limit = mode.killLimit ?? mode.scoreLimit;
      let obj = `${mode.name} · first to ${limit}`;
      if (this.mode === 'koth' && s.pt) {
        const prog = s.pt.progress;
        const owner = s.pt.owner ? `<b style="color:${TEAM_CSS[s.pt.owner]}">${s.pt.owner.toUpperCase()} holds the point</b>` : 'Point is neutral';
        obj = `${owner}${s.pt.contested ? ' · <b style="color:#ffd34d">CONTESTED</b>' : ''}
          <div class="cap"><div class="cap-red" style="width:${Math.max(0, -prog) / 2}%"></div><div class="cap-blue" style="width:${Math.max(0, prog) / 2}%"></div></div>`;
      }
      if (this.mode === 'ctf' && s.fl) {
        const st = (team) => {
          const f = s.fl[team];
          return f.state === 'home' ? 'home' : f.state === 'dropped' ? 'dropped' : `taken by ${esc(this._name(f.carrier))}`;
        };
        obj = `<span style="color:${TEAM_CSS.red}">Red flag: ${st('red')}</span> · <span style="color:${TEAM_CSS.blue}">Blue flag: ${st('blue')}</span>`;
      }
      html += `<div class="mp-obj">${obj}</div><div class="mp-team">You are on <b style="color:${TEAM_CSS[this.myTeam]}">${(this.myTeam || '').toUpperCase()}</b></div>`;
    } else {
      const rows = [...s.ps].sort((a, b) => b[10] - a[10]);
      const lead = rows[0];
      const mine = rows.find((r) => r[0] === this.myId);
      html = `<div class="mp-score"><span class="time">${time}</span></div><div class="mp-obj">You: <b>${mine ? mine[10] : 0}</b> kills · Leader: <b>${lead ? esc(this._name(lead[0])) : '-'}</b> (${lead ? lead[10] : 0}) · first to ${MODES.ffa.killLimit}</div>`;
    }
    if (this._hudHtml !== html) {
      this._hudHtml = html;
      $('mp-hud').innerHTML = html;
    }
    if (!$('scoreboard').classList.contains('hidden')) this.renderScoreboard();
  }

  renderScoreboard() {
    const s = this.snap;
    if (!s) return;
    const rows = [...s.ps].sort((a, b) => b[12] - a[12] || b[10] - a[10]);
    const line = (r) => {
      const team = this._team(r[0]);
      return `<tr class="${r[0] === this.myId ? 'me' : ''}"><td style="color:${this.teams ? TEAM_CSS[team] : '#e9d9b8'}">${esc(this._name(r[0]))}</td><td>${r[10]}</td><td>${r[11]}</td><td>${r[12]}</td></tr>`;
    };
    $('scoreboard').innerHTML = `<h3>${MODES[this.mode].name} · ${MAPS[this.map].name} · Room ${this.lobby?.code}</h3>
      <table class="board"><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Score</th></tr>${rows.map(line).join('')}</table>`;
  }

  _onEnd(m) {
    this.inMatch = false;
    let title;
    let won = false;
    if (m.winner === 'coop') title = m.reason === 'points' ? `OVERRUN · WAVE ${m.wave}` : `RUN OVER · WAVE ${m.wave}`;
    else if (m.winner === 'draw') title = 'DRAW';
    else if (this.teams) {
      won = m.winner === this.myTeam;
      title = `${String(m.winner).toUpperCase()} TEAM WINS`;
    } else {
      won = m.winner === this.myId;
      title = won ? 'YOU WIN!' : `${this._name(m.winner).toUpperCase()} WINS`;
    }
    const rows = [...m.board].sort((a, b) => b.score - a.score || b.kills - a.kills);
    $('mp-end-title').textContent = title;
    $('mp-end-title').className = won ? 'win' : '';
    $('mp-end-table').innerHTML = `<table class="board"><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Score</th></tr>${rows
      .map((r) => `<tr class="${r.id === this.myId ? 'me' : ''}"><td style="color:${this.teams ? TEAM_CSS[r.team] : '#e9d9b8'}">${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.score}</td></tr>`)
      .join('')}</table>`;
    this.ctx.onEnd({ won, kills: this.myStats.kills, headshots: this.myStats.headshots, coop: m.winner === 'coop', wave: m.wave || 0 });
  }

  // ---------------------------------------------------------------- lobby screen
  _bindLobbyUi() {
    $('lobby').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) this.send({ t: 'mode', mode: b.dataset.mode });
      if (b.dataset.map) this.send({ t: 'map', map: b.dataset.map });
      if (b.dataset.team) this.send({ t: 'team', team: b.dataset.team });
      if (b.dataset.kick) this.send({ t: 'kick', id: Number(b.dataset.kick) });
      if (b.id === 'lobby-start') this.send({ t: 'start' });
      if (b.id === 'lobby-leave') this.leave();
      if (b.id === 'lobby-copy') {
        navigator.clipboard?.writeText(this.lobby.code).then(
          () => (b.textContent = 'COPIED!'),
          () => {}
        );
      }
    });
  }

  _renderLobby() {
    const l = this.lobby;
    if (!l) return;
    const host = this.isHost();
    const mode = MODES[l.mode];
    const canKick = host || this.me?.admin;
    const player = (p) =>
      `<div class="lp ${p.id === this.myId ? 'me' : ''}"><span>${esc(p.avatar)}</span><b style="color:${esc(p.color)}">${esc(p.name)}</b>${p.admin ? '<i class="admin">⭐ADMIN</i>' : ''}${p.id === l.host ? '<i>HOST</i>' : ''}${p.account ? '' : '<em>guest</em>'}${canKick && p.id !== this.myId ? `<button class="kick" data-kick="${p.id}" title="Kick">✕</button>` : ''}</div>`;
    let roster;
    if (mode.teams) {
      roster = ['red', 'blue']
        .map(
          (team) => `<div class="team ${team}"><h4>${team.toUpperCase()}</h4>${l.players.filter((p) => p.team === team).map(player).join('') || '<p class="muted">empty</p>'}
          ${this.myTeam !== team && l.phase === 'lobby' ? `<button data-team="${team}" class="btn small ghost">JOIN ${team.toUpperCase()}</button>` : ''}</div>`
        )
        .join('');
    } else {
      roster = `<div class="team ffa"><h4>${mode.coop ? 'SQUAD' : 'PLAYERS'}</h4>${l.players.map(player).join('')}</div>`;
    }
    $('lobby-code').textContent = l.code;
    $('lobby-modes').innerHTML = Object.values(MODES)
      .map((m) => `<button data-mode="${m.id}" class="chipbtn ${m.id === l.mode ? 'on' : ''}" ${host ? '' : 'disabled'} title="${esc(m.desc)}">${m.name}</button>`)
      .join('');
    $('lobby-maps').innerHTML = MP_MAPS.map((id) => [id, MAPS[id]])
      .map(([id, m]) => `<button data-map="${id}" class="chipbtn ${id === l.map ? 'on' : ''}" ${host ? '' : 'disabled'}>${m.name}</button>`)
      .join('');
    $('lobby-desc').textContent = mode.desc;
    $('lobby-roster').innerHTML = roster;
    const start = $('lobby-start');
    start.style.display = host && l.phase === 'lobby' ? '' : 'none';
    $('lobby-wait').textContent = l.phase === 'playing' ? 'Match in progress, joining…' : host ? `${l.players.length} player${l.players.length === 1 ? '' : 's'} in the room` : 'Waiting for the host to start…';
  }
}
