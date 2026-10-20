import * as THREE from 'three';
import { GUNS, MUTATIONS, buildGun, buildHands } from './guns.js';
import { muzzleTexture } from './textures.js';

const SCALE = 0.78;
const REST = new THREE.Vector3(0.2, -0.21, -0.5);
const SWITCH_TIME = 0.45;
const SWING = 0.34; // knife swing
const QUICK = 0.5; // quick melee: knife out, stab, back to the gun
// Height of each gun's sights above its origin (gun units), used to line them up when aiming.
const SIGHT_Y = { rifle: 0.1, smg: 0.075, shotgun: 0.066, revolver: 0.07, lmg: 0.145, dmr: 0.095, sniper: 0.1, launcher: 0.14, crossbow: 0.07, flamer: 0.1, bazooka: 0.16 };

const ease = (t) => t * t * (3 - 2 * t);
// Piecewise keyframes: [[time, value], ...] with smooth interpolation.
function kf(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0 || 1));
    }
  }
  return frames[frames.length - 1][1];
}

// The player's guns: inventory, ammo, firing rhythm, aiming and all first-person animation.
export class Weapon {
  constructor(camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.scene.add(this.cam);
    this.scene.add(new THREE.HemisphereLight(0xe6e9ec, 0x7a6650, 2.2));
    const key = new THREE.DirectionalLight(0xffd3a1, 2.4);
    key.position.set(-1, 2, 1.5);
    this.scene.add(key);

    this.holder = new THREE.Group();
    // where the gun sits on screen when not aiming (Settings → Gun position)
    this.offset = { x: 0, y: 0, z: 0 };
    this.cam.add(this.holder);
    this.models = {};

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: muzzleTexture(), color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.visible = false;
    this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.muzzle = new THREE.Object3D();
    this.muzzle.add(this.flash, this.light);

    this.slots = [];
    this.cur = 0;
    this.last = 0;
    this.onDrop = null;
    this.ads = 0;
    this.kick = 0;
    this.flashT = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobT = 0;
    this.sprintBlend = 0;
    this.reloading = 0;
    this.reloadDur = 1;
    this.cooldown = 0;
    this.queued = 0;
    this.boltT = 0;
    this.switchT = 0;
    this.pending = -1;
    this.finish = null;
    this.swingT = 0;
    this.swingSide = 1;
    this.quickT = 0;
  }

  // Gun finish from the player's profile (hex colour or null for standard).
  setFinish(color) {
    if (this.finish === color) return;
    this.finish = color;
    for (const m of Object.values(this.models)) m.group.removeFromParent();
    this.models = {};
    if (this.slots.length) this._show(this.cur);
  }

  // Mastery skins: { gunId: hex colour } on top of the profile finish.
  setGunFinishes(map) {
    const key = JSON.stringify(map);
    if (key === this._gunFinishKey) return;
    this._gunFinishKey = key;
    this.gunFinish = map;
    this.refreshModels();
  }

  // Rebuilds the gun models (e.g. after mutations change).
  refreshModels() {
    for (const m of Object.values(this.models)) m.group.removeFromParent();
    this.models = {};
    if (this.slots.length) this._show(this.cur);
  }

  displayName(slot = this.slot) {
    return slot.mut ? `${MUTATIONS[slot.mut].name} ${slot.def.name}` : slot.def.name;
  }

  // ---------------------------------------------------------------- inventory
  get slot() {
    return this.slots[this.cur];
  }
  get def() {
    return this.slot.def;
  }
  get ammo() {
    return this.slot.ammo;
  }
  get scoped() {
    return !!this.def.scope && this.ads > 0.85;
  }
  get mutation() {
    return this.slot.mut || null;
  }

  magSize(stats, def = this.def) {
    return Math.max(1, Math.round(def.mag * (1 + stats.magBonus / 30)));
  }

  damage(stats) {
    return this.def.damage * stats.damageMul * (this.slot.mut ? 1.2 : 1);
  }

  reset(stats) {
    this.slots = [
      { def: GUNS.rifle, ammo: this.magSize(stats, GUNS.rifle), reserve: Infinity },
      { def: GUNS.knife, ammo: 1, reserve: Infinity },
    ];
    this.cur = 0;
    this.last = 0;
    this.reloading = 0;
    this.cooldown = 0;
    this.switchT = 0;
    this.pending = -1;
    this.ads = 0;
    this._show(0);
  }

  // Picks up a gun. Returns 'new', 'mutated' (an owned gun became mutated) or 'ammo'.
  give(id, stats, mut = null) {
    const def = GUNS[id];
    const have = this.slots.findIndex((s) => s.def.id === id);
    if (have >= 0) {
      const slot = this.slots[have];
      if (slot.reserve !== Infinity) slot.reserve += this.magSize(stats, def) * 2;
      if (mut && slot.mut !== mut) {
        slot.mut = mut;
        if (have === this.cur) this._show(this.cur);
        else this.equip(have);
        return 'mutated';
      }
      return 'ammo';
    }
    this.slots.push({ def, ammo: this.magSize(stats, def), reserve: def.reserve, mut });
    this.equip(this.slots.length - 1);
    return 'new';
  }

  refillMags(stats) {
    for (const s of this.slots) s.ammo = Math.max(s.ammo, this.magSize(stats, s.def));
  }

  // Older saves and loadouts may not have the knife yet.
  ensureKnife() {
    if (this.slots.some((s) => s.def.melee)) return;
    this.slots.splice(Math.min(1, this.slots.length), 0, { def: GUNS.knife, ammo: 1, reserve: Infinity });
    if (this.cur >= 1) this.cur++;
  }

  // V: a quick stab with the knife whatever you're holding. Returns true if a swing starts.
  quickMelee() {
    if (this.quickT > 0 || this.switchT > 0) return false;
    if (this.def.melee) {
      if (this.cooldown > 0) return false;
      this.cooldown = 1 / this.def.fireRate;
      this.swingT = SWING;
      this.swingSide = -this.swingSide;
      return true;
    }
    this.reloading = 0;
    this.quickT = QUICK;
    this.swingT = SWING;
    this.swingSide = 1;
    for (const m of Object.values(this.models)) m.group.visible = false;
    const k = this._model('knife');
    k.group.visible = true;
    return true;
  }

  // Straight into a slot with no swap animation (spawning).
  holdNow(i) {
    if (i < 0 || i >= this.slots.length) return;
    if (i !== this.cur) this.last = this.cur;
    this.cur = i;
    this.pending = -1;
    this.switchT = 0;
    this.reloading = 0;
    this._show(i);
  }

  // Only these guns, with endless ammo (Gun Game, Infection zombies).
  setOnly(ids, stats) {
    this.slots = ids.map((id) => ({ def: GUNS[id], ammo: GUNS[id].melee ? 1 : this.magSize(stats, GUNS[id]), reserve: Infinity, mut: null }));
    this.cur = 0;
    this.last = 0;
    this.ads = 0;
    this.holdNow(0);
  }

  equip(i) {
    if (i < 0 || i >= this.slots.length || i === (this.pending >= 0 ? this.pending : this.cur)) return;
    this.pending = i;
    this.switchT = SWITCH_TIME;
    this.reloading = 0;
    this.audio.click(0.7, 0.18);
  }

  cycle(dir) {
    const n = this.slots.length;
    if (n < 2) return;
    const from = this.pending >= 0 ? this.pending : this.cur;
    this.equip((from + dir + n) % n);
  }

  equipLast() {
    this.equip(this.last);
  }

  _model(id, mut = null) {
    const key = `${id}|${mut || ''}`;
    if (!this.models[key]) {
      const gun = buildGun(id, { finish: this.gunFinish?.[id] ?? this.finish, mutation: mut });
      const hands = buildHands(GUNS[id]);
      gun.group.add(hands.left, hands.right);
      gun.group.scale.setScalar(SCALE);
      gun.hands = hands;
      gun.magRest = gun.mag ? gun.mag.position.clone() : null;
      gun.extraRest = gun.extra ? { p: gun.extra.position.clone(), r: gun.extra.rotation.clone() } : null;
      gun.group.visible = false;
      this.holder.add(gun.group);
      this.models[key] = gun;
    }
    return this.models[key];
  }

  _show(i) {
    for (const m of Object.values(this.models)) m.group.visible = false;
    const def = this.slots[i].def;
    const m = this._model(def.id, this.slots[i].mut);
    m.group.visible = true;
    m.group.add(this.muzzle);
    this.muzzle.position.set(0, m.muzzleY, m.muzzleZ);
    this.flash.scale.setScalar(def.id === 'smg' ? 0.22 : def.id === 'shotgun' || def.id === 'sniper' ? 0.45 : 0.32);
  }

  _dropEmpty() {
    const s = this.slot;
    if (s.def.reserve === Infinity || s.ammo > 0 || s.reserve > 0) return;
    const dropped = s.def;
    this.slots.splice(this.cur, 1);
    this.cur = 0;
    this.last = 0;
    this.pending = -1;
    this._show(0);
    this.switchT = SWITCH_TIME * 0.5;
    if (this.onDrop) this.onDrop(dropped);
  }

  // ---------------------------------------------------------------- firing
  startReload(stats) {
    const s = this.slot;
    if (s.def.melee) return;
    if (this.reloading > 0 || this.switchT > 0 || s.ammo >= this.magSize(stats) || s.reserve <= 0) return;
    const speed = stats.reloadSpeed;
    this.reloadDur = s.def.reload / speed;
    this.reloading = this.reloadDur;
    if (s.def.reloadStyle === 'shells') this.audio.click(0.9, 0.25);
    else this.audio.reload(this.reloadDur);
  }

  _finishReload(stats) {
    const s = this.slot;
    const mag = this.magSize(stats);
    if (s.def.reloadStyle === 'shells') {
      // one shell at a time, keeps going until full
      if (s.reserve > 0 && s.ammo < mag) {
        s.ammo++;
        s.reserve--;
        this.audio.click(1.1, 0.3);
      }
      if (s.ammo < mag && s.reserve > 0) {
        this.reloading = this.reloadDur;
        return;
      }
      this.audio.click(0.6, 0.35, 0.05);
      return;
    }
    const take = Math.min(mag - s.ammo, s.reserve);
    s.ammo += take;
    s.reserve -= take;
  }

  // Returns how many shots fire this frame.
  update(dt, { trigger, pressed, sprinting, moving, speed, aim }, stats) {
    const s = this.slot;
    const def = s.def;
    this.cooldown = Math.max(this.cooldown - dt, -dt);
    this.queued = pressed ? 0.2 : Math.max(0, this.queued - dt);
    let shots = 0;
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.quickT > 0) {
      this.quickT -= dt;
      if (this.quickT <= 0) this._show(this.cur);
      this._animate(dt, { sprinting, moving, speed, aim: false }, stats);
      return 0;
    }

    // weapon swap: lower, change model, raise
    if (this.switchT > 0) {
      const before = this.switchT;
      this.switchT -= dt;
      if (this.pending >= 0 && before > SWITCH_TIME / 2 && this.switchT <= SWITCH_TIME / 2) {
        this.last = this.cur;
        this.cur = this.pending;
        this.pending = -1;
        this._show(this.cur);
      }
    } else if (this.reloading > 0) {
      // shotguns can interrupt a shell-by-shell reload to fire
      if (def.reloadStyle === 'shells' && (pressed || this.queued > 0) && s.ammo > 0) {
        this.reloading = 0;
      } else {
        this.reloading -= dt;
        if (this.reloading <= 0) this._finishReload(stats);
      }
    }

    if (def.melee) {
      // the knife never runs out: each "shot" is a swing (you can swing while sprinting)
      if (this.switchT <= 0 && (def.auto ? trigger : this.queued > 0) && this.cooldown <= 0) {
        this.cooldown = 1 / def.fireRate;
        this.swingT = SWING;
        this.swingSide = -this.swingSide;
        this.queued = 0;
        shots = 1;
      }
    } else if (this.switchT <= 0 && this.reloading <= 0 && !sprinting) {
      const wants = def.auto ? trigger : this.queued > 0;
      if (wants && s.ammo <= 0) {
        if (this.cooldown <= 0) {
          this.audio.empty();
          this.cooldown = 0.25;
          this.queued = 0;
          if (s.reserve > 0) this.startReload(stats);
          else this._dropEmpty();
        }
      } else if (wants) {
        const interval = 1 / (def.fireRate * stats.fireRateMul);
        while (this.cooldown <= 0 && s.ammo > 0) {
          this.cooldown += interval;
          s.ammo--;
          shots++;
          this.queued = 0;
          if (!def.auto) break;
        }
      }
    }

    if (shots > 0 && !def.melee) {
      this.kick = Math.min(1, this.kick + def.kick * shots);
      this.flashT = 0.045;
      this.flash.material.rotation = Math.random() * Math.PI;
      if (def.reloadStyle === 'bolt') this.boltT = 1 / (def.fireRate * stats.fireRateMul);
    }
    if (s.ammo === 0 && s.reserve === 0 && def.reserve !== Infinity && this.reloading <= 0 && this.switchT <= 0 && !trigger) {
      this._dropEmpty();
    }

    this._animate(dt, { sprinting, moving, speed, aim }, stats);
    return shots;
  }

  // ---------------------------------------------------------------- animation
  _animate(dt, { sprinting, moving, speed, aim }, stats) {
    const def = this.quickT > 0 ? GUNS.knife : this.def;
    const m = this.quickT > 0 ? this._model('knife') : this._model(def.id, this.slot.mut);
    if (def.melee) aim = false;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.flashT -= dt;
    this.boltT = Math.max(0, this.boltT - dt);
    this.flash.visible = this.flashT > 0;
    this.light.intensity = this.flashT > 0 ? 6 : 0;

    const canAim = aim && !sprinting && this.reloading <= 0 && this.switchT <= 0;
    this.ads += ((canAim ? 1 : 0) - this.ads) * Math.min(1, dt * (def.scope ? 9 : 12));
    this.sprintBlend += ((sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 8);
    if (moving) this.bobT += dt * speed * 1.4;
    const bobAmt = (moving ? 1 : 0) * (1 - this.ads * 0.85);
    const bx = Math.sin(this.bobT) * 0.012 * bobAmt;
    const by = Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;

    const a = this.ads;
    const sightY = -(SIGHT_Y[def.id] ?? 0.08) * SCALE;
    const h = this.holder;
    h.position.set(
      (REST.x + this.offset.x) * (1 - a) + bx + this.swayX * (1 - a * 0.7) - this.sprintBlend * 0.08,
      (REST.y + this.offset.y) * (1 - a) + sightY * a - by + this.swayY * (1 - a * 0.7) - this.sprintBlend * 0.06,
      (REST.z + this.offset.z) * (1 - a) - 0.55 * a + this.kick * (0.06 - a * 0.03)
    );
    h.rotation.set(this.kick * (0.09 - a * 0.06) - this.sprintBlend * 0.35, this.sprintBlend * 0.7 + 0.03 * (1 - a), this.sprintBlend * 0.2);
    this.swayX *= Math.exp(-dt * 8);
    this.swayY *= Math.exp(-dt * 8);

    // raise/lower when switching
    if (this.switchT > 0) {
      const t = this.switchT / SWITCH_TIME; // 1 → 0
      const down = Math.sin(t * Math.PI);
      h.position.y -= down * 0.35;
      h.rotation.x -= down * 0.6;
    }

    // hide the gun while looking through a scope
    m.group.visible = !(def.scope && a > 0.85);
    if (def.melee) {
      // knife sits lower and pointed in; a swing slashes across and stabs forward
      h.position.y -= 0.04;
      h.rotation.y += 0.25;
      if (this.quickT > 0) {
        const t = this.quickT / QUICK; // 1 → 0: comes up, stabs, goes away
        const up = Math.sin(t * Math.PI);
        h.position.y -= (1 - up) * 0.3;
      }
      if (this.swingT > 0) {
        const k = 1 - this.swingT / SWING;
        const s = this.swingSide;
        const arc = kf(k, [[0, 0], [0.25, -1], [0.55, 1], [1, 0]]);
        const thrust = kf(k, [[0, 0], [0.35, 1], [0.6, 1], [1, 0]]);
        h.position.x += arc * 0.12 * s;
        h.position.z -= thrust * 0.22;
        h.rotation.y -= arc * 0.6 * s;
        h.rotation.z += arc * 0.5 * s;
        h.rotation.x -= thrust * 0.3;
      }
    }

    this._reloadPose(m, def, stats);
  }

  // Reload animations. Everything is driven by k = 0..1 through the reload.
  _reloadPose(m, def, stats) {
    const g = m.group;
    const left = m.hands.left;
    left.position.copy(m.hands.leftRest);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    if (m.mag) {
      m.mag.position.copy(m.magRest);
      m.mag.visible = true;
    }
    if (m.extra) {
      m.extra.position.copy(m.extraRest.p);
      m.extra.rotation.copy(m.extraRest.r);
      if (def.reloadStyle === 'shells') m.extra.visible = false;
    }

    // bolt-action cycling between sniper shots
    if (def.reloadStyle === 'bolt' && this.boltT > 0 && this.reloading <= 0) {
      const k = 1 - this.boltT / (1 / (def.fireRate * stats.fireRateMul));
      const lift = kf(k, [[0.15, 0], [0.3, 1], [0.6, 1], [0.75, 0]]);
      const pull = kf(k, [[0.3, 0], [0.45, 1], [0.55, 1], [0.7, 0]]);
      m.extra.rotation.x = -lift * 1.2;
      m.extra.position.z = m.extraRest.p.z + pull * 0.09;
      g.rotation.z = lift * 0.12;
      if (k > 0.44 && k < 0.47) this.audio.click(0.8, 0.12);
    }

    if (this.reloading <= 0) return;
    const k = 1 - this.reloading / this.reloadDur;
    const sk = Math.sin(k * Math.PI);

    switch (def.reloadStyle) {
      case 'mag':
      case 'box': {
        const side = def.reloadStyle === 'box' ? -1 : 0;
        // bring the gun up and turn its side towards you so the mag swap is visible
        const pose = kf(k, [[0, 0], [0.12, 1], [0.8, 1], [0.95, 0]]);
        g.rotation.z = pose * 0.45;
        g.rotation.y = pose * 0.55;
        g.rotation.x = pose * 0.2 + kf(k, [[0.6, 0], [0.66, 0.15], [0.74, 0]]);
        g.position.x = -pose * 0.12;
        g.position.y = pose * 0.06;
        // old mag drops out, new one comes up from below and gets slapped in
        const drop = kf(k, [[0.12, 0], [0.28, 0.45]]);
        const insert = kf(k, [[0.38, 0.4], [0.62, 0]]);
        const magOff = k < 0.33 ? drop : k < 0.38 ? 0.45 : insert;
        if (m.mag) {
          m.mag.position.y = m.magRest.y - magOff;
          m.mag.position.x = m.magRest.x + side * magOff * 0.3;
          m.mag.visible = k < 0.3 || k > 0.38;
        }
        // left hand: grab old mag, reach down, bring the new one up, then rack the charging handle
        const toMag = kf(k, [[0.05, 0], [0.15, 1], [0.62, 1], [0.72, 0]]);
        const handDrop = k > 0.15 && k < 0.62 ? magOff : 0;
        const rack = kf(k, [[0.7, 0], [0.78, 1], [0.86, 1], [0.92, 0]]);
        const rackPull = kf(k, [[0.78, 0], [0.83, 0.1], [0.86, 0]]);
        if (m.mag) {
          left.position.x += (m.magRest.x - left.position.x + side * 0.03) * toMag;
          left.position.y += (m.magRest.y - 0.05 - left.position.y) * toMag - handDrop;
          left.position.z += (m.magRest.z - left.position.z) * toMag;
        }
        left.position.x += rack * 0.1;
        left.position.y += rack * 0.12;
        left.position.z += rack * (0.3 + rackPull);
        break;
      }
      case 'shells': {
        // gun tipped, one shell pushed in per cycle
        g.rotation.z = 0.5 * Math.min(1, k * 6, (1 - k) * 6 + 0.3);
        g.rotation.x = 0.1;
        const push = kf(k, [[0, 0], [0.35, 1], [0.6, 1], [0.8, 0.3], [1, 0]]);
        left.position.set(m.hands.leftRest.x, -0.2 + push * 0.12, 0.02 - push * 0.04);
        m.extra.visible = k < 0.6;
        m.extra.position.set(0, -0.15 + push * 0.12, 0.02);
        g.position.y = -0.03 * sk;
        break;
      }
      case 'cylinder': {
        // flick the cylinder out, dump the brass, speed-load, snap it shut
        g.rotation.z = kf(k, [[0, 0], [0.12, 0.9], [0.85, 0.9], [1, 0]]);
        g.rotation.x = kf(k, [[0.2, 0], [0.28, 0.7], [0.36, 0.7], [0.45, -0.1], [0.85, -0.1], [1, 0]]);
        const out = kf(k, [[0.08, 0], [0.16, 1], [0.82, 1], [0.9, 0]]);
        m.extra.position.x = m.extraRest.p.x - out * 0.06;
        m.extra.rotation.y = out * 0.5;
        m.extra.rotation.z = Math.PI / 2 + kf(k, [[0.45, 0], [0.8, Math.PI * 2]]);
        const load = kf(k, [[0.4, 0], [0.55, 1], [0.78, 1], [0.86, 0]]);
        left.position.x += -0.05 * load;
        left.position.y += 0.08 * load - 0.15 * kf(k, [[0.36, 0], [0.42, 1], [0.5, 0]]);
        left.position.z += -0.12 * load;
        break;
      }
      case 'bolt': {
        g.rotation.z = kf(k, [[0, 0], [0.1, 0.3], [0.85, 0.3], [1, 0]]);
        const lift = kf(k, [[0.08, 0], [0.16, 1], [0.8, 1], [0.88, 0]]);
        const pull = kf(k, [[0.16, 0], [0.24, 1], [0.74, 1], [0.82, 0]]);
        m.extra.rotation.x = -lift * 1.2;
        m.extra.position.z = m.extraRest.p.z + pull * 0.09;
        const magOff = kf(k, [[0.25, 0], [0.38, 0.35], [0.5, 0.35], [0.66, 0]]);
        m.mag.position.y = m.magRest.y - magOff;
        m.mag.visible = !(k > 0.38 && k < 0.48);
        const toMag = kf(k, [[0.2, 0], [0.3, 1], [0.66, 1], [0.74, 0]]);
        left.position.x += (m.magRest.x - left.position.x) * toMag;
        left.position.y += (m.magRest.y - 0.05 - left.position.y) * toMag - magOff * toMag;
        left.position.z += (m.magRest.z - left.position.z) * toMag;
        break;
      }
      case 'drum': {
        // tip the launcher, spin the drum while feeding grenades in
        g.rotation.z = kf(k, [[0, 0], [0.12, 0.7], [0.85, 0.7], [1, 0]]);
        g.rotation.x = kf(k, [[0, 0], [0.12, -0.2], [0.85, -0.2], [1, 0]]);
        m.extra.rotation.y = kf(k, [[0.15, 0], [0.85, Math.PI * 2]]);
        const feed = Math.abs(Math.sin(k * Math.PI * 4));
        left.position.x += -0.04;
        left.position.y += 0.02 - feed * 0.12;
        left.position.z += 0.3 + feed * 0.03;
        break;
      }
    }
  }

  // ---------------------------------------------------------------- rendering
  resize(aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
  }

  // Muzzle position in world space (the view model scene shares the main camera's view).
  muzzleWorld(target) {
    this.muzzle.updateWorldMatrix(true, false);
    target.setFromMatrixPosition(this.muzzle.matrixWorld);
    return target.applyMatrix4(this.camera.matrixWorld);
  }

  sway(dx, dy) {
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX - dx * 0.00012));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY + dy * 0.00012));
  }
}
