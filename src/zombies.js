import * as THREE from 'three';
import { ARENA_RADIUS, heightAt } from './terrain.js';
import { animateZombieModel, attachZombieModel, decapitateZombieModel, hasDeathClip } from './zombieModel.js';

// Boss waves (every 5th) bring one of these. Each has its own trick.
export const BOSSES = {
  abomination: { name: 'Abomination', hpMul: 1, speedMul: 1, skin: 0x5b5e48, eyes: 0xc86bff, desc: 'Aim for the head' },
  screamer: { name: 'Screamer', hpMul: 0.75, speedMul: 1.1, skin: 0x8a6f86, eyes: 0xff4af0, desc: 'It calls the horde and drives it into a frenzy. Kill it fast' },
  juggernaut: { name: 'Juggernaut', hpMul: 1.4, speedMul: 0.85, skin: 0x5e4c3e, eyes: 0xff6a1a, desc: 'Armoured and angry. Dodge when it charges' },
  broodmother: { name: 'Broodmother', hpMul: 1.1, speedMul: 0.9, skin: 0x6a8a3a, eyes: 0x8dff4a, desc: 'It hatches crawlers, and bursts into more when it dies' },
};
export const BOSS_IDS = Object.keys(BOSSES);
// wave 5 Abomination, 10 Screamer, 15 Juggernaut, 20 Broodmother, then any of them
export function bossForWave(wave) {
  const n = Math.max(0, Math.floor(wave / 5) - 1);
  return n < BOSS_IDS.length ? BOSS_IDS[n] : BOSS_IDS[Math.floor(Math.random() * BOSS_IDS.length)];
}

export const ZOMBIE_TYPES = {
  walker: {
    name: 'Walker', hp: 60, speed: 2.2, damage: 10, scale: 1, radius: 0.4, range: 1.5, cooldown: 1.1, score: 10,
    skin: [0x7d8c5f, 0x8a9468, 0x6f7f58], shirt: [0x4b4f5a, 0x5a4636, 0x3f5546, 0x6b5b4a, 0x7a6e5a], pants: [0x2f3340, 0x3d3a30, 0x2b2b2b], eyes: 0xffd34d,
  },
  runner: {
    name: 'Runner', hp: 38, speed: 4.9, damage: 7, scale: 0.92, radius: 0.36, range: 1.4, cooldown: 0.8, score: 15,
    skin: [0x9aa27a, 0x8e9a70], shirt: [0x6b2f2a, 0x2f4b6b, 0x555555], pants: [0x22252b, 0x3b3226], eyes: 0xff3b2e,
  },
  brute: {
    name: 'Brute', hp: 280, speed: 1.75, damage: 24, scale: 1.5, radius: 0.6, range: 2.1, cooldown: 1.5, score: 40,
    skin: [0x6a7550, 0x5e6a48], shirt: [0x3a3128, 0x2e3a2e], pants: [0x2a2622], eyes: 0xff8a1c,
  },
  boss: {
    name: 'Abomination', hp: 1700, speed: 2.5, damage: 35, scale: 2.5, radius: 1.0, range: 3.2, cooldown: 1.6, score: 300,
    skin: [0x5b5e48], shirt: [0x3b2420], pants: [0x231a17], eyes: 0xc86bff,
  },
  // ---- mutations
  crawler: {
    name: 'Crawler', hp: 45, speed: 3.3, damage: 8, scale: 0.95, radius: 0.4, range: 1.4, cooldown: 0.9, score: 20,
    skin: [0x8c8f6a, 0x7a8560], shirt: [0x3d3530, 0x4a4038], pants: [0x2a2622], eyes: 0xff5a2a, crawl: true,
  },
  spitter: {
    name: 'Spitter', hp: 70, speed: 2.1, damage: 12, scale: 1.05, radius: 0.42, range: 1.5, cooldown: 1.2, score: 30,
    skin: [0x7fa05a, 0x6f9a4f], shirt: [0x3a4a2a, 0x4f5a33], pants: [0x2c3324], eyes: 0x8dff4a, ranged: true,
  },
  bloater: {
    name: 'Bloater', hp: 160, speed: 1.5, damage: 30, scale: 1.25, radius: 0.65, range: 1.9, cooldown: 1, score: 35,
    skin: [0x8f9b5a, 0x9aa060], shirt: [0x5a5a3a], pants: [0x33331f], eyes: 0xc8ff3a, bloated: true,
  },
};

const TYPE_IDS = Object.keys(ZOMBIE_TYPES);

// Damage-over-time effects from mutated guns.
const DOT_TINT = { toxic: 0x2a6a10, fire: 0x8a3a00 };

const GEO = (() => {
  const leg = new THREE.BoxGeometry(0.22, 0.9, 0.24);
  leg.translate(0, -0.45, 0);
  const torso = new THREE.BoxGeometry(0.56, 0.72, 0.32);
  torso.translate(0, 0.36, 0);
  const arm = new THREE.BoxGeometry(0.16, 0.74, 0.18);
  arm.translate(0, -0.37, 0);
  return {
    leg,
    torso,
    arm,
    head: new THREE.BoxGeometry(0.38, 0.4, 0.38),
    eye: new THREE.BoxGeometry(0.08, 0.05, 0.02),
    jaw: new THREE.BoxGeometry(0.3, 0.08, 0.06),
    patch: new THREE.BoxGeometry(0.2, 0.2, 0.02),
    pustule: new THREE.SphereGeometry(0.1, 8, 6),
    sac: new THREE.SphereGeometry(0.17, 10, 8),
    glob: new THREE.SphereGeometry(0.18, 10, 8),
  };
})();
const globMat = new THREE.MeshBasicMaterial({ color: 0x8dff4a });
const puddleGeo = new THREE.CircleGeometry(1.6, 20);
puddleGeo.rotateX(-Math.PI / 2);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

class Zombie {
  constructor(typeId, wave, mutated, variant = null) {
    const T = ZOMBIE_TYPES[typeId];
    this.variant = typeId === 'boss' ? (BOSSES[variant] ? variant : 'abomination') : null;
    const BV = this.variant ? BOSSES[this.variant] : null;
    this.typeId = typeId;
    this.type = T;
    this.mutated = mutated;
    const waveHp = 1 + 0.14 * (wave - 1) + (typeId === 'boss' ? 0.25 * Math.floor(wave / 5 - 1) : 0);
    this.maxHp = this.hp = T.hp * waveHp * (mutated ? 1.7 : 1);
    this.speed = T.speed * Math.min(1.4, 1 + 0.03 * (wave - 1)) * rand(0.88, 1.12) * (mutated ? 1.15 : 1);
    this.damage = T.damage * (1 + 0.05 * (wave - 1)) * (mutated ? 1.3 : 1);
    this.scale = T.scale * (mutated ? 1.1 : 1);
    this.radius = T.radius * (mutated ? 1.1 : 1);
    if (BV) {
      this.maxHp = this.hp = this.hp * BV.hpMul;
      this.speed *= BV.speedMul;
      this.abilityT = rand(4, 6);
    }
    this.hasteT = 0;
    this.castT = 0;
    this.chargeT = 0;
    this.state = 'rising';
    this.riseT = 0;
    this.deadT = 0;
    this.attackCd = rand(0.2, 0.8);
    this.spitCd = rand(1.5, 3);
    this.windup = 0;
    this.phase = Math.random() * 10;
    this.flashT = 0;
    this.slowT = 0;
    this.slowAmt = 0;
    this.stuckT = 0;
    this.vy = 0;
    this.climb = null;
    this.sideT = 0;
    this.side = 1;
    this.groanT = rand(1, 6);
    this.dots = [];
    this.fxT = 0;

    this.skinMat = new THREE.MeshStandardMaterial({ color: pick(T.skin), roughness: 0.9, flatShading: true });
    this.shirtMat = new THREE.MeshStandardMaterial({ color: pick(T.shirt), roughness: 1, flatShading: true });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: pick(T.pants), roughness: 1, flatShading: true });
    this.baseEmissive = mutated ? 0x1c4a06 : 0x000000;
    this.mats = [this.skinMat, this.shirtMat, this.pantsMat];
    const eyeMat = new THREE.MeshBasicMaterial({ color: mutated && !BV ? 0x6dff2a : BV ? BV.eyes : T.eyes });
    if (BV) this.skinMat.color.setHex(BV.skin);
    const goreMat = new THREE.MeshStandardMaterial({ color: 0x4a0d0a, roughness: 0.6 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x9dff4a, emissive: 0x4a9a10, roughness: 0.4 });
    this.mats.push(eyeMat, goreMat, glowMat);
    this.goreMat = goreMat;

    const root = (this.root = new THREE.Group());
    const body = (this.body = new THREE.Group());
    body.scale.setScalar(this.scale);
    root.add(body);
    this.parts = [];
    const part = (geo, m, kind) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      mesh.userData.zombie = this;
      mesh.userData.kind = kind;
      this.parts.push(mesh);
      return mesh;
    };

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.14, 0.9, 0);
    this.legR.position.set(0.14, 0.9, 0);
    if (!T.crawl) {
      this.legL.add(part(GEO.leg, this.pantsMat, 'body'));
      this.legR.add(part(GEO.leg, this.pantsMat, 'body'));
    } else {
      // stumps dragging behind
      const stump = part(GEO.leg, this.pantsMat, 'body');
      stump.scale.y = 0.35;
      this.legL.add(stump);
    }
    body.add(this.legL, this.legR);

    const upper = (this.upper = new THREE.Group());
    upper.position.y = T.crawl ? 0.3 : 0.88;
    upper.rotation.x = T.crawl ? 1.35 : typeId === 'runner' ? 0.45 : typeId === 'spitter' ? 0.55 : 0.2;
    if (T.crawl) this.legL.position.set(0, 0.3, -0.55);
    body.add(upper);
    const torso = part(GEO.torso, this.shirtMat, 'body');
    if (T.bloated) torso.scale.set(1.7, 1.15, 2.1);
    upper.add(torso);
    const patch = new THREE.Mesh(GEO.patch, goreMat);
    patch.position.set(rand(-0.15, 0.15), rand(0.2, 0.55), T.bloated ? 0.35 : 0.17);
    upper.add(patch);

    const head = (this.head = part(GEO.head, this.skinMat, 'head'));
    head.position.set(0, 0.94, 0.03);
    head.rotation.z = rand(-0.25, 0.25);
    upper.add(head);
    for (const ex of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(GEO.eye, eyeMat);
      eye.position.set(ex, 0.04, 0.195);
      head.add(eye);
    }
    const jaw = new THREE.Mesh(GEO.jaw, goreMat);
    jaw.position.set(0, -0.12, 0.19);
    head.add(jaw);
    this.jaw = jaw;

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(T.bloated ? -0.55 : -0.37, 0.64, 0);
    this.armR.position.set(T.bloated ? 0.55 : 0.37, 0.64, 0);
    this.armL.add(part(GEO.arm, this.skinMat, 'body'));
    if (Math.random() > 0.12 || typeId === 'boss' || T.crawl) this.armR.add(part(GEO.arm, this.skinMat, 'body'));
    upper.add(this.armL, this.armR);
    this.armDroop = !T.crawl && Math.random() < 0.25 ? 1 : 0;

    if (T.bloated || mutated) {
      // glowing pustules
      const n = T.bloated ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const pu = new THREE.Mesh(GEO.pustule, glowMat);
        const a = rand(0, Math.PI * 2);
        const w = T.bloated ? 0.48 : 0.29;
        pu.position.set(Math.cos(a) * w, rand(0.1, 0.65), Math.sin(a) * (T.bloated ? 0.34 : 0.17));
        pu.scale.setScalar(rand(0.6, T.bloated ? 1.6 : 1));
        upper.add(pu);
      }
    }
    if (T.ranged) {
      const sac = new THREE.Mesh(GEO.sac, glowMat);
      sac.position.set(0, -0.2, 0.18);
      head.add(sac);
    }
    if (this.variant === 'juggernaut') {
      // armour plates on the shoulders and chest
      const plate = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.5, metalness: 0.6 });
      this.mats.push(plate);
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.34), plate);
        p.position.set(sx * 0.32, 0.72, 0);
        p.rotation.z = sx * -0.3;
        upper.add(p);
      }
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.06), plate);
      chest.position.set(0, 0.4, 0.18);
      upper.add(chest);
    }
    if (this.variant === 'broodmother') {
      // egg sacs on the back
      for (let i = 0; i < 5; i++) {
        const sac = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 8, 6), glowMat);
        sac.position.set((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.5, -0.2);
        upper.add(sac);
      }
    }
    if (this.variant === 'screamer') {
      // a gaping jaw
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), goreMat);
      jaw.position.set(0, -0.14, 0.15);
      head.add(jaw);
    }
    if (typeId === 'boss') {
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), goreMat);
        spike.position.set(0, 0.2 + i * 0.15, -0.2);
        spike.rotation.x = -1.1;
        upper.add(spike);
      }
    }
    // the 3D zombie model (if it's loaded and switched on); the blocks above become invisible hitboxes
    attachZombieModel(this);
  }

  get alive() {
    return this.state === 'alive' || this.state === 'rising';
  }

  get centerY() {
    return this.root.position.y + (this.type.crawl ? 0.4 : 1.1) * this.scale;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
  }
}

export class ZombieManager {
  constructor(scene, world, effects, audio) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.list = [];
    this.parts = [];
    this.globs = [];
    this.puddles = [];
    this.heads = [];
    this.groanBudget = 0;
    this.nav = null; // NavGrid for the current map
    this.structures = null; // barricades and turrets they tear down when they're in the way
    this.nextId = 0;
    this.navT = 0;
    this._dir = { x: 0, z: 0 };
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.list) if (z.alive) n++;
    return n;
  }

  get boss() {
    return this.list.find((z) => z.typeId === 'boss' && z.alive);
  }

  clear() {
    for (const z of this.list) {
      this.scene.remove(z.root);
      z.dispose();
    }
    for (const g of this.globs) this.scene.remove(g.mesh);
    for (const p of this.puddles) this.scene.remove(p.mesh);
    for (const h of this.heads) this.scene.remove(h.mesh);
    this.list = [];
    this.parts = [];
    this.globs = [];
    this.puddles = [];
    this.heads = [];
  }

  _rebuildParts() {
    this.parts = [];
    for (const z of this.list) if (z.alive) for (const p of z.parts) this.parts.push(p);
  }

  spawn(typeId, wave, playerPos, mutated = false, variant = null) {
    const z = new Zombie(typeId, wave, mutated, variant);
    let x = 0;
    let zz = 0;
    for (let tries = 0; tries < 25; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(40, 75);
      x = playerPos.x + Math.cos(a) * d;
      zz = playerPos.z + Math.sin(a) * d;
      const r = Math.hypot(x, zz);
      if (r > ARENA_RADIUS - 3) {
        x *= (ARENA_RADIUS - 3) / r;
        zz *= (ARENA_RADIUS - 3) / r;
      }
      if (Math.hypot(x - playerPos.x, zz - playerPos.z) < 25) continue;
      if (this.nav && !this.nav.reachable(x, zz)) continue; // never inside a closed-off spot
      if (!this.world.colliders.blocked(x, zz, z.radius * 2)) break;
    }
    z.root.position.set(x, heightAt(x, zz) - 2 * z.scale, zz);
    z.root.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - zz);
    z.id = ++this.nextId;
    this.scene.add(z.root);
    this.list.push(z);
    this._rebuildParts();
    if (typeId === 'boss') this.audio.groan(z.root.position, 0.8, true);
    return z;
  }

  // Returns true when the hit kills the zombie.
  damage(z, amount, { slow = 0, headshot = false, dir = null } = {}) {
    if (!z.alive) return false;
    z.hp -= amount;
    z.flashT = 0.08;
    if (slow > 0) {
      z.slowT = 2;
      z.slowAmt = Math.max(z.slowAmt * (z.slowT > 0 ? 1 : 0), slow);
    }
    if (z.hp <= 0) {
      z.state = 'dead';
      z.deadT = 0;
      z.climb = null;
      z.dots = [];
      z.deathY = z.root.position.y;
      z.fallDir = Math.random() < 0.5 ? -1 : 1;
      if (headshot && z.head.parent) this._decapitate(z, dir);
      this._rebuildParts();
      return true;
    }
    return false;
  }

  // Poison / fire from mutated guns. The DoT can kill; onDotKill is called from update.
  addDot(z, kind, dps, seconds) {
    if (!z.alive) return;
    const cur = z.dots.find((d) => d.kind === kind);
    if (cur) {
      cur.dps = Math.max(cur.dps, dps);
      cur.t = Math.max(cur.t, seconds);
    } else z.dots.push({ kind, dps, t: seconds });
  }

  // Headshot kill: the head comes off and goes flying.
  _decapitate(z, dir) {
    const head = z.head;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    head.getWorldPosition(pos);
    head.getWorldQuaternion(quat);
    head.removeFromParent();
    head.position.copy(pos);
    head.quaternion.copy(quat);
    head.scale.setScalar(z.scale);
    if (z.model) {
      // the model loses its head; the flying head is the block one, shown again
      head.traverse((o) => (o.visible = true));
      decapitateZombieModel(z);
    }
    this.scene.add(head);
    const v = new THREE.Vector3(rand(-1, 1), rand(3, 5), rand(-1, 1));
    if (dir) v.addScaledVector(dir, 4);
    this.heads.push({ mesh: head, vel: v, spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), t: 0, owner: z });
    // stump
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), z.goreMat);
    neck.position.set(0, 0.76, 0);
    neck.visible = !z.model;
    z.upper.add(neck);
    z.neckSpray = 0.7;
    this.audio.splat?.();
  }

  knockback(z, from, force) {
    const dx = z.root.position.x - from.x;
    const dz = z.root.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    z.root.position.x += (dx / d) * force;
    z.root.position.z += (dz / d) * force;
  }

  // Looks for something to climb in the given direction and starts climbing it.
  _tryClimb(z, dirX, dirZ) {
    const rp = z.root.position;
    const reach = 2.3 * Math.min(1.4, z.scale);
    for (const d of [z.radius + 0.2, z.radius + 0.45, z.radius + 0.7, z.radius + 0.95]) {
      const x = rp.x + dirX * d;
      const zz = rp.z + dirZ * d;
      const top = this.world.colliders.ledgeAt(x, zz, rp.y, 0.35, reach, 1.6 * z.scale);
      if (top !== null) {
        z.climb = { t: 0, dur: z.typeId === 'runner' ? 0.7 : 1.1 * z.scale, fx: rp.x, fy: rp.y, fz: rp.z, tx: x + dirX * 0.2, ty: top, tz: zz + dirZ * 0.2 };
        z.windup = 0;
        return true;
      }
    }
    return false;
  }

  // The ladder that leads up to where the player is standing, if any.
  _ladderToward(pp) {
    let best = null;
    let bestD = 12;
    for (const l of this.world.ladders) {
      if (Math.abs(pp.y - l.top) > 1.2) continue;
      const d = Math.hypot(pp.x - l.x, pp.z - l.z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  _spit(z, pp) {
    const from = new THREE.Vector3(z.root.position.x, z.centerY + 0.5, z.root.position.z);
    const to = new THREE.Vector3(pp.x, pp.y + 1.0, pp.z);
    const flat = Math.hypot(to.x - from.x, to.z - from.z);
    const time = Math.max(0.6, flat / 16);
    const g = 14;
    const vel = new THREE.Vector3((to.x - from.x) / time, (to.y - from.y) / time + 0.5 * g * time, (to.z - from.z) / time);
    this.addGlob(from, vel, z.damage);
    if (this.onGlob) this.onGlob(from, vel);
  }

  // dmg 0 = just for show (co-op clients see the host's acid)
  addGlob(from, vel, dmg = 0) {
    const mesh = new THREE.Mesh(GEO.glob, globMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vel: vel.clone(), g: 14, dmg, life: 4 });
    this.audio.spit?.(from);
  }

  // targets: the local Player, or (co-op host) [{ id, pos }] for every living player.
  // hooks: hitPlayer(z, dmg, kind, target), explode(z), dotKill(z)
  update(dt, targets, hooks) {
    const tg = (Array.isArray(targets) ? targets : [{ id: 'me', pos: targets.pos }]).filter((t) => t && t.pos);
    let pp = tg[0]?.pos;
    this.groanBudget = Math.max(0, this.groanBudget - dt);
    let removed = false;
    let partsDirty = false;
    // refresh the route map towards the players a few times a second
    this.navT -= dt;
    if (this.nav && this.navT <= 0 && tg.length) {
      this.navT = 0.25;
      this.nav.update(tg.map((t) => t.pos));
    }

    for (const z of this.list) {
      // chase whoever is nearest
      let best = Infinity;
      for (const t of tg) {
        const d = (t.pos.x - z.root.position.x) ** 2 + (t.pos.z - z.root.position.z) ** 2;
        if (d < best) {
          best = d;
          pp = t.pos;
          z.target = t;
        }
      }
      if (!pp) break;
      const T = z.type;
      const rp = z.root.position;
      const ground = heightAt(rp.x, rp.z);

      // status effects
      z.flashT -= dt;
      z.slowT -= dt;
      const frosted = z.slowT > 0;
      let tint = z.baseEmissive;
      if (frosted) tint = 0x1a4a7a;
      for (const d of z.dots) if (DOT_TINT[d.kind]) tint = DOT_TINT[d.kind];
      if (z.windup > 0 && T.bloated) tint = Math.sin(z.windup * 40) > 0 ? 0x6aff20 : 0x203a00;
      const flash = z.flashT > 0;
      z.skinMat.emissive.setHex(flash ? 0x992222 : tint);
      z.shirtMat.emissive.setHex(flash ? 0x551111 : tint === z.baseEmissive ? 0 : tint);

      if (z.alive && z.dots.length) {
        for (const d of z.dots) {
          d.t -= dt;
          z.hp -= d.dps * dt;
        }
        z.dots = z.dots.filter((d) => d.t > 0);
        z.fxT -= dt;
        if (z.fxT <= 0) {
          z.fxT = 0.08;
          const kind = z.dots[0]?.kind;
          const p = new THREE.Vector3(rp.x + rand(-0.3, 0.3), z.centerY + rand(-0.4, 0.4), rp.z + rand(-0.3, 0.3));
          if (kind === 'fire') this.effects.burst(p, { count: 2, color: [0xff9a2a, 0xffd04a, 0xff4a10], speed: 0.6, size: 0.12, life: 0.45, grav: -4, up: 1 });
          if (kind === 'toxic') this.effects.burst(p, { count: 1, color: [0x8dff4a, 0x4aa020], speed: 0.4, size: 0.1, life: 0.6, grav: -2, up: 1 });
        }
        if (z.hp <= 0 && this.damage(z, 0.001)) {
          hooks.dotKill(z);
          partsDirty = true;
        }
      }
      if (z.mutated && z.alive && Math.random() < dt * 3) {
        this.effects.burst(new THREE.Vector3(rp.x, z.centerY, rp.z), { count: 1, color: [0x8dff4a], speed: 0.5, size: 0.06, life: 0.8, grav: -1.5, up: 0.5 });
      }

      if (z.state === 'rising') {
        z.riseT += dt;
        const k = Math.min(1, z.riseT / 1.1);
        rp.y = ground - (1 - k) * 2 * z.scale;
        z.body.rotation.x = (1 - k) * 0.5;
        animateZombieModel(z, dt);
        if (Math.random() < dt * 14) this.effects.dust(new THREE.Vector3(rp.x + rand(-0.5, 0.5), ground + 0.1, rp.z + rand(-0.5, 0.5)));
        if (k >= 1) z.state = 'alive';
        continue;
      }

      if (z.state === 'dead') {
        z.deadT += dt;
        const k = Math.min(1, z.deadT / 0.45);
        if (hasDeathClip(z)) animateZombieModel(z, dt); // the model plays its own death
        else {
          z.body.rotation.x = -k * k * (Math.PI / 2) * 0.95 * (T.crawl ? 0.2 : 1);
          z.body.rotation.z = z.fallDir * k * 0.2;
        }
        rp.y = z.deathY - Math.max(0, z.deadT - (z.model ? 2.1 : 1.6)) * 0.5;
        if (z.neckSpray > 0) {
          z.neckSpray -= dt;
          const neck = new THREE.Vector3();
          z.upper.localToWorld(neck.set(0, 0.8, 0));
          this.effects.burst(neck, { count: 2, color: [0x9b1010, 0x6a0505], speed: 2.2, size: 0.07, life: 0.6, up: 2.5, spread: 0.4 });
        }
        if (z.deadT > (z.model ? 4 : 3.5)) {
          z.remove = true;
          removed = true;
        }
        continue;
      }

      // ---- alive
      const colliders = this.world.colliders;
      if (z.hasteT > 0) z.hasteT -= dt;
      const speedMul = (frosted ? 1 - z.slowAmt : 1) * (z.hasteT > 0 ? 1.5 : 1) * (this.speedFor ? this.speedFor(z) : 1);

      // pulling itself up onto a car, wall, wreck or ladder
      if (z.climb) {
        const c = z.climb;
        c.t += dt * speedMul;
        const t = Math.min(1, c.t / c.dur);
        const up = Math.min(1, t / (c.ladder ? 0.92 : 0.7));
        const over = Math.max(0, (t - (c.ladder ? 0.9 : 0.4)) / (c.ladder ? 0.1 : 0.6));
        const e = c.ladder ? up : up * up * (3 - 2 * up);
        rp.set(c.fx + (c.tx - c.fx) * over, c.fy + (c.ty - c.fy) * e, c.fz + (c.tz - c.fz) * over);
        const climbSwing = c.ladder ? Math.sin(c.t * 8) : 0;
        z.armL.rotation.x = c.ladder ? -2.6 + climbSwing * 0.4 : -2.6 + t * 1.2;
        z.armR.rotation.x = c.ladder ? -2.6 - climbSwing * 0.4 : -2.6 + t * 1.2;
        z.legL.rotation.x = c.ladder ? -0.6 - climbSwing * 0.4 : -0.9 * Math.sin(t * Math.PI);
        z.legR.rotation.x = c.ladder ? -0.6 + climbSwing * 0.4 : -0.4 * Math.sin(t * Math.PI);
        if (t >= 1) {
          z.climb = null;
          z.vy = 0;
        }
        continue;
      }

      // where to go: the player, or the bottom of the ladder the player went up
      let tx = pp.x;
      let tz = pp.z;
      let ladder = null;
      if (pp.y - rp.y > 2.5) {
        ladder = this._ladderToward(pp);
        if (ladder) {
          tx = ladder.x + ladder.nx * 0.6;
          tz = ladder.z + ladder.nz * 0.6;
        }
      }
      const dx = tx - rp.x;
      const dz = tz - rp.z;
      const dist = Math.hypot(dx, dz);
      const pdx = pp.x - rp.x;
      const pdz = pp.z - rp.z;
      const pdist = Math.hypot(pdx, pdz);
      const above = pp.y - rp.y;

      // boss tricks (screaming, charging, hatching) can take over the whole frame
      if (z.variant && z.variant !== 'abomination' && !ladder && this._bossUpdate(z, dt, pp, pdx, pdz, pdist, hooks)) continue;

      if (ladder && dist < 0.8 && Math.abs(rp.y - ladder.bottom) < 1) {
        z.climb = {
          ladder: true, t: 0, dur: (ladder.top - rp.y) / (1.5 * speedMul + 0.01),
          fx: ladder.x + ladder.nx * 0.45, fy: rp.y, fz: ladder.z + ladder.nz * 0.45,
          tx: ladder.x - ladder.nx * 0.7, ty: ladder.top, tz: ladder.z - ladder.nz * 0.7,
        };
        z.root.rotation.y = Math.atan2(-ladder.nx, -ladder.nz);
        continue;
      }

      // a barricade or turret in the way: stop and tear it down
      z.wall = !ladder && !T.ranged && this.structures ? this.structures.blocking(rp.x, rp.z, z.radius + 0.45, pdx, pdz, pdist) : null;

      // turn towards where we're going
      const want = z.wall ? Math.atan2(z.wall.x - rp.x, z.wall.z - rp.z) : Math.atan2(ladder ? dx : pdx, ladder ? dz : pdz);
      let diff = want - z.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.root.rotation.y += diff * Math.min(1, dt * 6);

      // spitters keep their distance and lob acid
      const keepAway = T.ranged && !ladder && pdist < 11 && pdist > 3;
      let moving = false;
      const wantMove = z.wall ? false : ladder ? dist > 0.3 : T.ranged ? pdist > 16 || keepAway : dist > T.range * 0.8;
      if (wantMove && z.windup <= 0) {
        let mx = dx / (dist || 1);
        let mz = dz / (dist || 1);
        // follow the route map around walls and through doorways
        if (this.nav && !keepAway && (ladder ? dist > 6 : pdist > 2.5)) {
          const d = this.nav.direction(rp.x, rp.z, this._dir);
          if (d) {
            mx = d.x;
            mz = d.z;
          }
        }
        if (keepAway) {
          mx = -mx;
          mz = -mz;
        }
        if (z.sideT > 0) {
          z.sideT -= dt;
          const px = mz * z.side;
          const pz = -mx * z.side;
          mx = mx * 0.25 + px;
          mz = mz * 0.25 + pz;
        }
        for (const o of this.list) {
          if (o === z || !o.alive) continue;
          const ox = rp.x - o.root.position.x;
          const oz = rp.z - o.root.position.z;
          const minD = (z.radius + o.radius) * 1.3;
          const d2 = ox * ox + oz * oz;
          if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (minD - d) / minD;
            mx += (ox / d) * push * 1.5;
            mz += (oz / d) * push * 1.5;
          }
        }
        const ml = Math.hypot(mx, mz) || 1;
        const step = z.speed * speedMul * dt * (keepAway ? 0.7 : 1);
        const bx = rp.x;
        const bz = rp.z;
        rp.x += (mx / ml) * step;
        rp.z += (mz / ml) * step;
        colliders.resolve(rp, z.radius, rp.y, (T.crawl ? 0.8 : 1.8) * z.scale);
        const r = Math.hypot(rp.x, rp.z);
        if (r > ARENA_RADIUS) {
          rp.x *= ARENA_RADIUS / r;
          rp.z *= ARENA_RADIUS / r;
        }
        const moved = Math.hypot(rp.x - bx, rp.z - bz);
        if (moved < step * 0.35) z.stuckT += dt;
        else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
        if (z.stuckT > 0.35 && above > 0.6 && pdist < 8 && this._tryClimb(z, pdx / pdist, pdz / pdist)) {
          z.stuckT = 0;
        } else if (z.stuckT > 0.35) {
          z.stuckT = 0;
          z.sideT = rand(0.9, 1.8);
          z.side = Math.random() < 0.5 ? -1 : 1;
        }
        moving = true;
      }
      if (!moving && !ladder && !T.ranged && above > 0.6 && above > 1.6 * z.scale - 0.3 && pdist < T.range + 1 && z.windup <= 0) {
        this._tryClimb(z, pdx / (pdist || 1), pdz / (pdist || 1));
      }
      if (!z.climb) {
        const floor = Math.max(heightAt(rp.x, rp.z), colliders.floorAt(rp.x, rp.z, z.radius * 0.6, rp.y));
        if (rp.y > floor + 0.05) {
          z.vy -= 20 * dt;
          rp.y = Math.max(floor, rp.y + z.vy * dt);
          if (rp.y === floor) z.vy = 0;
        } else {
          rp.y = floor;
          z.vy = 0;
        }
      }

      // ranged attack
      if (T.ranged) {
        z.spitCd -= dt;
        if (z.spitCd <= 0 && pdist < 26 && pdist > 3) {
          z.spitCd = rand(2.2, 3.4);
          z.spitT = 0.4;
          this._spit(z, pp);
        }
      }

      // melee attack (bloaters blow themselves up instead)
      z.attackCd -= dt;
      const reach = T.crawl ? 1.0 : 1.6;
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0) {
          const dy = pp.y - rp.y;
          if (T.bloated) {
            hooks.explode(z);
          } else if (z.wall) {
            if (hooks.hitStructure && z.wall.hp > 0) hooks.hitStructure(z, z.wall, z.damage * (z.typeId === 'brute' || z.typeId === 'boss' ? 2 : 1));
          } else if (pdist < T.range + 0.5 && dy < reach * z.scale && dy > -1.8) {
            hooks.hitPlayer(z, z.damage, 'melee', z.target);
          }
          z.attackCd = T.cooldown;
        }
      } else if (((pdist < T.range && above < reach * z.scale) || z.wall) && z.attackCd <= 0 && !z.climb) {
        z.windup = T.bloated ? 0.7 : 0.38;
        this.audio.zombieAttack(rp);
      }
      if (!z.alive) continue;

      // animation
      const animSpeed = (z.speed * speedMul * (z.typeId === 'runner' ? 2.1 : 2.6)) / z.scale;
      if (moving) z.phase += dt * animSpeed;
      const sw = moving ? Math.sin(z.phase) : 0;
      if (T.crawl) {
        // dragging itself along with the arms
        z.armL.rotation.x = -1.6 + sw * 0.7;
        z.armR.rotation.x = -1.6 - sw * 0.7;
        z.upper.rotation.z = sw * 0.1;
        z.legL.rotation.x = 1.4;
      } else {
        z.legL.rotation.x = sw * 0.6;
        z.legR.rotation.x = -sw * 0.6;
        z.upper.rotation.z = Math.sin(z.phase * 0.5) * 0.08;
        let armX = -1.35 + Math.sin(z.phase * 0.5 + 1) * 0.12;
        if (z.windup > 0 && !T.bloated) armX = -1.35 - Math.sin((1 - z.windup / 0.38) * Math.PI) * 0.9;
        if (T.bloated) armX = -0.5 + sw * 0.2;
        if (T.ranged && z.spitT > 0) {
          z.spitT -= dt;
          z.upper.rotation.x = 0.55 - Math.sin((1 - z.spitT / 0.4) * Math.PI) * 0.5;
        }
        z.armL.rotation.x = armX;
        z.armR.rotation.x = z.armDroop ? -0.2 + sw * 0.2 : armX + 0.1;
      }
      if (T.bloated) {
        const s = 1 + Math.sin(z.phase * 2) * 0.03 + (z.windup > 0 ? (0.7 - z.windup) * 0.4 : 0);
        z.body.scale.set(z.scale * s, z.scale, z.scale * s);
      }
      if (z.jaw.parent) z.jaw.position.y = -0.12 - Math.abs(Math.sin(z.phase * 1.7)) * 0.04;
      animateZombieModel(z, dt, { moving, speed: z.speed * speedMul, attacking: z.windup > 0 && !T.bloated });

      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = rand(3, 9);
        if (this.groanBudget <= 0 && pdist < 50) {
          this.groanBudget = 0.6;
          const big = z.typeId === 'brute' || z.typeId === 'boss' || T.bloated;
          this.audio.groan(rp, (z.typeId === 'runner' || T.crawl ? 1.35 : T.ranged ? 1.15 : 1) * rand(0.85, 1.15) * (z.mutated ? 0.85 : 1), big);
        }
      }
    }
    if (partsDirty) this._rebuildParts();

    this._updateGlobs(dt, tg, hooks);
    this._updateHeads(dt);

    if (removed) {
      this.list = this.list.filter((z) => {
        if (z.remove) {
          this.scene.remove(z.root);
          for (const h of this.heads) if (h.owner === z) h.t = 99;
          z.dispose();
          return false;
        }
        return true;
      });
    }
  }

  _updateGlobs(dt, targets, hooks) {
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.life -= dt;
      g.vel.y -= g.g * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (Math.random() < 0.5) this.effects.burst(p, { count: 1, color: [0x8dff4a, 0x5ac020], speed: 0.3, size: 0.08, life: 0.4, grav: 2 });
      let hit = null;
      for (const t of targets) if (Math.hypot(p.x - t.pos.x, p.y - (t.pos.y + 1), p.z - t.pos.z) < 0.9) hit = t;
      const groundY = heightAt(p.x, p.z);
      if (hit || p.y <= groundY || g.life <= 0) {
        if (hit && g.dmg > 0) hooks.hitPlayer(null, g.dmg, 'acid', hit);
        this.effects.burst(new THREE.Vector3(p.x, Math.max(p.y, groundY + 0.1), p.z), { count: 14, color: [0x8dff4a, 0x5ac020, 0xc8ff6a], speed: 2.5, size: 0.1, life: 0.5, up: 1.5 });
        const puddle = new THREE.Mesh(
          puddleGeo,
          new THREE.MeshBasicMaterial({ color: 0x7adf3a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
        );
        puddle.position.set(p.x, groundY + 0.05, p.z);
        this.scene.add(puddle);
        this.puddles.push({ mesh: puddle, t: 4, tick: 0 });
        this.scene.remove(g.mesh);
        this.globs.splice(i, 1);
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const pd = this.puddles[i];
      pd.t -= dt;
      pd.tick -= dt;
      pd.mesh.material.opacity = Math.min(0.55, pd.t * 0.3);
      if (pd.tick <= 0) {
        for (const t of targets) {
          if (Math.hypot(t.pos.x - pd.mesh.position.x, t.pos.z - pd.mesh.position.z) < 1.6 && Math.abs(t.pos.y - pd.mesh.position.y) < 0.6) {
            pd.tick = 0.5;
            hooks.hitPlayer(null, 4, 'acid', t);
          }
        }
      }
      if (pd.t <= 0) {
        this.scene.remove(pd.mesh);
        pd.mesh.material.dispose();
        this.puddles.splice(i, 1);
      }
    }
  }

  _updateHeads(dt) {
    for (let i = this.heads.length - 1; i >= 0; i--) {
      const h = this.heads[i];
      h.t += dt;
      const m = h.mesh;
      const ground = heightAt(m.position.x, m.position.z) + 0.15;
      if (m.position.y > ground || h.vel.y > 0) {
        h.vel.y -= 18 * dt;
        m.position.addScaledVector(h.vel, dt);
        m.rotation.x += h.spin.x * dt;
        m.rotation.y += h.spin.y * dt;
        m.rotation.z += h.spin.z * dt;
        if (m.position.y < ground) {
          m.position.y = ground;
          h.vel.multiplyScalar(0.35);
          h.vel.y = Math.abs(h.vel.y) > 1.5 ? -h.vel.y * 0.4 : 0;
          h.spin.multiplyScalar(0.4);
          this.effects.blood(m.position, null, 0.6);
        }
      }
      if (h.t > 5) {
        this.scene.remove(m);
        this.heads.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- co-op: the host sends, everyone else mirrors
  // One row per zombie: [id, type, mutated, x, y, z, yaw, state(0 rising,1 alive,2 dead), headless, hp 0..1, moving]
  // Returns true when the boss is busy (winding up or charging) and shouldn't do anything else this frame.
  _bossUpdate(z, dt, pp, pdx, pdz, pdist, hooks) {
    const rp = z.root.position;
    const settle = () => {
      rp.y = Math.max(heightAt(rp.x, rp.z), this.world.colliders.floorAt(rp.x, rp.z, z.radius * 0.6, rp.y));
    };
    // charging: a straight line, fast; hits whatever is in the way
    if (z.chargeT > 0) {
      z.chargeT -= dt;
      const step = z.speed * 4.2 * dt;
      rp.x += z.chargeDir.x * step;
      rp.z += z.chargeDir.z * step;
      const bumped = this.world.colliders.resolve(rp, z.radius, rp.y, 1.8 * z.scale);
      settle();
      z.root.rotation.y = Math.atan2(z.chargeDir.x, z.chargeDir.z);
      z.phase += dt * 14;
      z.legL.rotation.x = Math.sin(z.phase) * 0.9;
      z.legR.rotation.x = -Math.sin(z.phase) * 0.9;
      z.armL.rotation.x = z.armR.rotation.x = -1.2;
      if (Math.random() < dt * 20) this.effects.dust(new THREE.Vector3(rp.x, rp.y + 0.1, rp.z));
      if (!z.chargeHit && pdist < z.type.range + 1 && Math.abs(pp.y - rp.y) < 2.5) {
        z.chargeHit = true;
        hooks.hitPlayer(z, z.damage * 1.6, 'blast', z.target);
      }
      if (bumped && this.structures) {
        const st = this.structures.blocking(rp.x, rp.z, z.radius + 1.2, z.chargeDir.x, z.chargeDir.z, 99);
        if (st && hooks.hitStructure) hooks.hitStructure(z, st, 300);
      }
      if (bumped || z.chargeT <= 0) {
        z.chargeT = 0;
        z.attackCd = 1.2;
        if (bumped) this.audio.explosion(rp);
      }
      return true;
    }
    // winding up a scream or a charge: stand still, arms up
    if (z.castT > 0) {
      z.castT -= dt;
      settle();
      z.armL.rotation.x = z.armR.rotation.x = -2.6 + Math.sin(z.castT * 30) * 0.15;
      z.root.rotation.y = Math.atan2(pdx, pdz);
      if (z.castT <= 0) {
        if (z.cast === 'scream') {
          this.effects.burst(new THREE.Vector3(rp.x, z.centerY + 1, rp.z), { count: 40, color: [0xff4af0, 0xffffff], speed: 9, size: 0.14, life: 0.6, grav: 0, up: 0.3 });
          if (hooks.summon) hooks.summon(z, 'runner', 3);
          for (const o of this.list) if (o.alive && o !== z && o.root.position.distanceTo(rp) < 18) o.hasteT = 7;
          if (hooks.bossEvent) hooks.bossEvent(z, 'scream');
        } else if (z.cast === 'charge') {
          const l = Math.hypot(pdx, pdz) || 1;
          z.chargeDir = { x: pdx / l, z: pdz / l };
          z.chargeT = Math.min(2, pdist / (z.speed * 4.2) + 0.4);
          z.chargeHit = false;
        }
      }
      return true;
    }
    z.abilityT -= dt;
    if (z.abilityT > 0 || z.state !== 'alive') return false;
    if (z.variant === 'screamer' && pdist < 45) {
      z.cast = 'scream';
      z.castT = 1.1;
      z.abilityT = rand(9, 12);
      this.audio.groan(rp, 1.6, true);
      return true;
    }
    if (z.variant === 'juggernaut' && pdist > 6 && pdist < 32) {
      z.cast = 'charge';
      z.castT = 0.9;
      z.abilityT = rand(6, 8);
      this.audio.groan(rp, 0.5, true);
      if (hooks.bossEvent) hooks.bossEvent(z, 'charge');
      return true;
    }
    if (z.variant === 'broodmother') {
      z.abilityT = rand(6, 8);
      if (hooks.summon) hooks.summon(z, 'crawler', 2);
      if (hooks.bossEvent) hooks.bossEvent(z, 'hatch');
    }
    return false;
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return this.list.map((z) => [
      z.id, TYPE_IDS.indexOf(z.typeId), z.mutated ? 1 : 0,
      r(z.root.position.x), r(z.root.position.y), r(z.root.position.z), r(z.root.rotation.y),
      z.state === 'rising' ? 0 : z.state === 'alive' ? 1 : 2, z.head.parent ? 0 : 1,
      Math.round(Math.max(0, z.hp / z.maxHp) * 100) / 100, z.climb ? 1 : 0,
      z.variant ? BOSS_IDS.indexOf(z.variant) : -1,
    ]);
  }

  applySnapshot(rows) {
    const seen = new Set();
    let dirty = false;
    const byId = new Map(this.list.map((z) => [z.id, z]));
    for (const row of rows) {
      const [id, ti, mut, x, y, zz, yaw, state, headless, hp] = row;
      const typeId = TYPE_IDS[ti];
      if (!typeId) continue;
      seen.add(id);
      let z = byId.get(id);
      if (!z) {
        if (state === 2) continue; // died before we ever saw it
        z = new Zombie(typeId, 1, !!mut, BOSS_IDS[row[11]] || null);
        z.id = id;
        z.puppet = true;
        z.state = 'alive';
        z.root.position.set(x, y, zz);
        z.root.rotation.y = yaw;
        z.net = new THREE.Vector3(x, y, zz);
        this.scene.add(z.root);
        this.list.push(z);
        dirty = true;
      }
      z.net.set(x, y, zz);
      z.netYaw = yaw;
      z.hp = hp * z.maxHp;
      z.netClimb = row[10];
      if (state === 2 && z.alive) {
        this.damage(z, 1e9, { headshot: !!headless });
        dirty = true;
      }
    }
    for (const z of this.list) {
      if (!seen.has(z.id) && z.alive) {
        z.remove = true; // gone on the host
        dirty = true;
      }
    }
    if (dirty) {
      this.list = this.list.filter((z) => {
        if (z.remove) {
          this.scene.remove(z.root);
          z.dispose();
          return false;
        }
        return true;
      });
      this._rebuildParts();
    }
  }

  // Animates the mirrored zombies between snapshots.
  updatePuppets(dt) {
    let removed = false;
    for (const z of this.list) {
      z.flashT -= dt;
      z.skinMat.emissive.setHex(z.flashT > 0 ? 0x992222 : z.baseEmissive);
      if (z.state === 'dead') {
        z.deadT += dt;
        const k = Math.min(1, z.deadT / 0.45);
        if (hasDeathClip(z)) animateZombieModel(z, dt);
        else z.body.rotation.x = -k * k * (Math.PI / 2) * 0.95 * (z.type.crawl ? 0.2 : 1);
        z.root.position.y = z.deathY - Math.max(0, z.deadT - (z.model ? 2.1 : 1.6)) * 0.5;
        if (z.neckSpray > 0) {
          z.neckSpray -= dt;
          const neck = new THREE.Vector3();
          z.upper.localToWorld(neck.set(0, 0.8, 0));
          this.effects.burst(neck, { count: 2, color: [0x9b1010, 0x6a0505], speed: 2.2, size: 0.07, life: 0.6, up: 2.5, spread: 0.4 });
        }
        if (z.deadT > (z.model ? 4 : 3.5)) {
          z.remove = true;
          removed = true;
        }
        continue;
      }
      const rp = z.root.position;
      const bx = rp.x;
      const bz = rp.z;
      rp.lerp(z.net, Math.min(1, dt * 10));
      let d = (z.netYaw ?? z.root.rotation.y) - z.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      z.root.rotation.y += d * Math.min(1, dt * 10);
      const speed = Math.hypot(rp.x - bx, rp.z - bz) / Math.max(dt, 1e-3);
      if (speed > 0.3) z.phase += dt * speed * 2.6 / z.scale;
      const sw = speed > 0.3 ? Math.sin(z.phase) : 0;
      animateZombieModel(z, dt, { moving: speed > 0.3, speed });
      if (z.type.crawl) {
        z.armL.rotation.x = -1.6 + sw * 0.7;
        z.armR.rotation.x = -1.6 - sw * 0.7;
      } else if (z.netClimb) {
        z.armL.rotation.x = z.armR.rotation.x = -2.6 + Math.sin(z.phase * 3) * 0.3;
      } else {
        z.legL.rotation.x = sw * 0.6;
        z.legR.rotation.x = -sw * 0.6;
        z.armL.rotation.x = -1.35 + Math.sin(z.phase * 0.5 + 1) * 0.12;
        z.armR.rotation.x = z.armDroop ? -0.2 + sw * 0.2 : z.armL.rotation.x + 0.1;
      }
    }
    this._updateGlobs(dt, [], {});
    this._updateHeads(dt);
    if (removed) {
      this.list = this.list.filter((z) => {
        if (z.remove) {
          this.scene.remove(z.root);
          z.dispose();
          return false;
        }
        return true;
      });
    }
  }
}
