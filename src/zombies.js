import * as THREE from 'three';
import { ARENA_RADIUS, heightAt } from './terrain.js';

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
  constructor(typeId, wave, mutated) {
    const T = ZOMBIE_TYPES[typeId];
    this.typeId = typeId;
    this.type = T;
    this.mutated = mutated;
    const waveHp = 1 + 0.14 * (wave - 1) + (typeId === 'boss' ? 0.25 * Math.floor(wave / 5 - 1) : 0);
    this.maxHp = this.hp = T.hp * waveHp * (mutated ? 1.7 : 1);
    this.speed = T.speed * Math.min(1.4, 1 + 0.03 * (wave - 1)) * rand(0.88, 1.12) * (mutated ? 1.15 : 1);
    this.damage = T.damage * (1 + 0.05 * (wave - 1)) * (mutated ? 1.3 : 1);
    this.scale = T.scale * (mutated ? 1.1 : 1);
    this.radius = T.radius * (mutated ? 1.1 : 1);
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
    const eyeMat = new THREE.MeshBasicMaterial({ color: mutated ? 0x6dff2a : T.eyes });
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
    if (typeId === 'boss') {
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), goreMat);
        spike.position.set(0, 0.2 + i * 0.15, -0.2);
        spike.rotation.x = -1.1;
        upper.add(spike);
      }
    }
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

  spawn(typeId, wave, playerPos, mutated = false) {
    const z = new Zombie(typeId, wave, mutated);
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
    this.scene.add(head);
    const v = new THREE.Vector3(rand(-1, 1), rand(3, 5), rand(-1, 1));
    if (dir) v.addScaledVector(dir, 4);
    this.heads.push({ mesh: head, vel: v, spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), t: 0, owner: z });
    // stump
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), z.goreMat);
    neck.position.set(0, 0.76, 0);
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
    const mesh = new THREE.Mesh(GEO.glob, globMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vel, g, dmg: z.damage, life: 4 });
    this.audio.spit?.(from);
  }

  // hooks: hitPlayer(z, dmg), explode(z), dotKill(z)
  update(dt, player, hooks) {
    const pp = player.pos;
    this.groanBudget = Math.max(0, this.groanBudget - dt);
    let removed = false;
    let partsDirty = false;
    // refresh the route map towards the player a few times a second
    this.navT -= dt;
    if (this.nav && this.navT <= 0) {
      this.navT = 0.25;
      this.nav.update(pp.x, pp.z);
    }

    for (const z of this.list) {
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
        if (Math.random() < dt * 14) this.effects.dust(new THREE.Vector3(rp.x + rand(-0.5, 0.5), ground + 0.1, rp.z + rand(-0.5, 0.5)));
        if (k >= 1) z.state = 'alive';
        continue;
      }

      if (z.state === 'dead') {
        z.deadT += dt;
        const k = Math.min(1, z.deadT / 0.45);
        z.body.rotation.x = -k * k * (Math.PI / 2) * 0.95 * (T.crawl ? 0.2 : 1);
        z.body.rotation.z = z.fallDir * k * 0.2;
        rp.y = z.deathY - Math.max(0, z.deadT - 1.6) * 0.5;
        if (z.neckSpray > 0) {
          z.neckSpray -= dt;
          const neck = new THREE.Vector3();
          z.upper.localToWorld(neck.set(0, 0.8, 0));
          this.effects.burst(neck, { count: 2, color: [0x9b1010, 0x6a0505], speed: 2.2, size: 0.07, life: 0.6, up: 2.5, spread: 0.4 });
        }
        if (z.deadT > 3.5) {
          z.remove = true;
          removed = true;
        }
        continue;
      }

      // ---- alive
      const colliders = this.world.colliders;
      const speedMul = frosted ? 1 - z.slowAmt : 1;

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

      if (ladder && dist < 0.8 && Math.abs(rp.y - ladder.bottom) < 1) {
        z.climb = {
          ladder: true, t: 0, dur: (ladder.top - rp.y) / (1.5 * speedMul + 0.01),
          fx: ladder.x + ladder.nx * 0.45, fy: rp.y, fz: ladder.z + ladder.nz * 0.45,
          tx: ladder.x - ladder.nx * 0.7, ty: ladder.top, tz: ladder.z - ladder.nz * 0.7,
        };
        z.root.rotation.y = Math.atan2(-ladder.nx, -ladder.nz);
        continue;
      }

      // turn towards where we're going
      const want = Math.atan2(ladder ? dx : pdx, ladder ? dz : pdz);
      let diff = want - z.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.root.rotation.y += diff * Math.min(1, dt * 6);

      // spitters keep their distance and lob acid
      const keepAway = T.ranged && !ladder && pdist < 11 && pdist > 3;
      let moving = false;
      const wantMove = ladder ? dist > 0.3 : T.ranged ? pdist > 16 || keepAway : dist > T.range * 0.8;
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
          } else if (pdist < T.range + 0.5 && dy < reach * z.scale && dy > -1.8) {
            hooks.hitPlayer(z, z.damage);
          }
          z.attackCd = T.cooldown;
        }
      } else if (pdist < T.range && z.attackCd <= 0 && above < reach * z.scale && !z.climb) {
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

    this._updateGlobs(dt, player, hooks);
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

  _updateGlobs(dt, player, hooks) {
    const pp = player.pos;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.life -= dt;
      g.vel.y -= g.g * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (Math.random() < 0.5) this.effects.burst(p, { count: 1, color: [0x8dff4a, 0x5ac020], speed: 0.3, size: 0.08, life: 0.4, grav: 2 });
      const dPlayer = Math.hypot(p.x - pp.x, p.y - (pp.y + 1), p.z - pp.z);
      const groundY = heightAt(p.x, p.z);
      if (dPlayer < 0.9 || p.y <= groundY || g.life <= 0) {
        if (dPlayer < 0.9) hooks.hitPlayer(null, g.dmg, 'acid');
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
      if (pd.tick <= 0 && Math.hypot(pp.x - pd.mesh.position.x, pp.z - pd.mesh.position.z) < 1.6 && Math.abs(pp.y - pd.mesh.position.y) < 0.6) {
        pd.tick = 0.5;
        hooks.hitPlayer(null, 4, 'acid');
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
}
