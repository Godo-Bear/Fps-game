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
};

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
  };
})();

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

class Zombie {
  constructor(typeId, wave) {
    const T = ZOMBIE_TYPES[typeId];
    this.typeId = typeId;
    this.type = T;
    const waveHp = 1 + 0.14 * (wave - 1) + (typeId === 'boss' ? 0.25 * Math.floor(wave / 5 - 1) : 0);
    this.maxHp = this.hp = T.hp * waveHp;
    this.speed = T.speed * Math.min(1.4, 1 + 0.03 * (wave - 1)) * rand(0.88, 1.12);
    this.damage = T.damage * (1 + 0.05 * (wave - 1));
    this.radius = T.radius;
    this.state = 'rising';
    this.riseT = 0;
    this.deadT = 0;
    this.attackCd = rand(0.2, 0.8);
    this.windup = 0;
    this.phase = Math.random() * 10;
    this.flashT = 0;
    this.slowT = 0;
    this.slowAmt = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.side = 1;
    this.groanT = rand(1, 6);

    this.skinMat = new THREE.MeshStandardMaterial({ color: pick(T.skin), roughness: 0.9, flatShading: true });
    this.shirtMat = new THREE.MeshStandardMaterial({ color: pick(T.shirt), roughness: 1, flatShading: true });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: pick(T.pants), roughness: 1, flatShading: true });
    this.mats = [this.skinMat, this.shirtMat, this.pantsMat];
    const eyeMat = new THREE.MeshBasicMaterial({ color: T.eyes });
    const goreMat = new THREE.MeshStandardMaterial({ color: 0x4a0d0a, roughness: 0.6 });
    this.mats.push(eyeMat, goreMat);

    const root = (this.root = new THREE.Group());
    const body = (this.body = new THREE.Group());
    body.scale.setScalar(T.scale);
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
    this.legL.add(part(GEO.leg, this.pantsMat, 'body'));
    this.legR.add(part(GEO.leg, this.pantsMat, 'body'));
    body.add(this.legL, this.legR);

    const upper = (this.upper = new THREE.Group());
    upper.position.y = 0.88;
    upper.rotation.x = typeId === 'runner' ? 0.45 : 0.2;
    body.add(upper);
    upper.add(part(GEO.torso, this.shirtMat, 'body'));
    const patch = new THREE.Mesh(GEO.patch, goreMat);
    patch.position.set(rand(-0.15, 0.15), rand(0.2, 0.55), 0.17);
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
    this.armL.position.set(-0.37, 0.64, 0);
    this.armR.position.set(0.37, 0.64, 0);
    this.armL.add(part(GEO.arm, this.skinMat, 'body'));
    if (Math.random() > 0.12 || typeId === 'boss') this.armR.add(part(GEO.arm, this.skinMat, 'body'));
    upper.add(this.armL, this.armR);
    this.armDroop = Math.random() < 0.25 ? 1 : 0;

    if (typeId === 'boss') {
      // bony spikes along the back
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
    this.groanBudget = 0;
    this._v = new THREE.Vector3();
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
    this.list = [];
    this.parts = [];
  }

  _rebuildParts() {
    this.parts = [];
    for (const z of this.list) if (z.alive) for (const p of z.parts) this.parts.push(p);
  }

  spawn(typeId, wave, playerPos) {
    const z = new Zombie(typeId, wave);
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
      if (!this.world.colliders.blocked(x, zz, z.radius * 2)) break;
    }
    z.root.position.set(x, heightAt(x, zz) - 2 * z.type.scale, zz);
    z.root.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - zz);
    this.scene.add(z.root);
    this.list.push(z);
    this._rebuildParts();
    if (typeId === 'boss') this.audio.groan(z.root.position, 0.8, true);
    return z;
  }

  // Returns true when the hit kills the zombie.
  damage(z, amount, { slow = 0 } = {}) {
    if (!z.alive) return false;
    z.hp -= amount;
    z.flashT = 0.08;
    if (slow > 0) {
      z.slowT = 2;
      z.slowAmt = slow;
    }
    if (z.hp <= 0) {
      z.state = 'dead';
      z.deadT = 0;
      z.fallDir = Math.random() < 0.5 ? -1 : 1;
      this._rebuildParts();
      return true;
    }
    return false;
  }

  knockback(z, from, force) {
    const dx = z.root.position.x - from.x;
    const dz = z.root.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    z.root.position.x += (dx / d) * force;
    z.root.position.z += (dz / d) * force;
  }

  update(dt, player, onPlayerHit) {
    const pp = player.pos;
    this.groanBudget = Math.max(0, this.groanBudget - dt);
    let removed = false;

    for (const z of this.list) {
      const T = z.type;
      const rp = z.root.position;
      const ground = heightAt(rp.x, rp.z);

      // hit flash and frost tint
      const flash = z.flashT > 0;
      z.flashT -= dt;
      z.slowT -= dt;
      const frosted = z.slowT > 0;
      z.skinMat.emissive.setHex(flash ? 0x992222 : frosted ? 0x1a4a7a : 0x000000);
      z.shirtMat.emissive.setHex(flash ? 0x551111 : frosted ? 0x0f2f55 : 0x000000);

      if (z.state === 'rising') {
        z.riseT += dt;
        const k = Math.min(1, z.riseT / 1.1);
        rp.y = ground - (1 - k) * 2 * T.scale;
        z.body.rotation.x = (1 - k) * 0.5;
        if (Math.random() < dt * 14) this.effects.dust(new THREE.Vector3(rp.x + rand(-0.5, 0.5), ground + 0.1, rp.z + rand(-0.5, 0.5)));
        if (k >= 1) z.state = 'alive';
        continue;
      }

      if (z.state === 'dead') {
        z.deadT += dt;
        const k = Math.min(1, z.deadT / 0.45);
        z.body.rotation.x = -k * k * (Math.PI / 2) * 0.95;
        z.body.rotation.z = z.fallDir * k * 0.2;
        rp.y = ground - Math.max(0, z.deadT - 1.6) * 0.5;
        if (z.deadT > 3.5) {
          z.remove = true;
          removed = true;
        }
        continue;
      }

      // ---- alive
      const dx = pp.x - rp.x;
      const dz = pp.z - rp.z;
      const dist = Math.hypot(dx, dz);
      const speedMul = frosted ? 1 - z.slowAmt : 1;

      // turn towards the player
      const want = Math.atan2(dx, dz);
      let diff = want - z.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.root.rotation.y += diff * Math.min(1, dt * 6);

      let moving = false;
      if (dist > T.range * 0.8 && z.windup <= 0) {
        let mx = dx / (dist || 1);
        let mz = dz / (dist || 1);
        if (z.sideT > 0) {
          z.sideT -= dt;
          const px = mz * z.side;
          const pz = -mx * z.side;
          mx = mx * 0.25 + px;
          mz = mz * 0.25 + pz;
        }
        // separation from other zombies
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
        const step = z.speed * speedMul * dt;
        const bx = rp.x;
        const bz = rp.z;
        rp.x += (mx / ml) * step;
        rp.z += (mz / ml) * step;
        this.world.colliders.resolve(rp, z.radius);
        const r = Math.hypot(rp.x, rp.z);
        if (r > ARENA_RADIUS) {
          rp.x *= ARENA_RADIUS / r;
          rp.z *= ARENA_RADIUS / r;
        }
        const moved = Math.hypot(rp.x - bx, rp.z - bz);
        if (moved < step * 0.35) z.stuckT += dt;
        else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
        if (z.stuckT > 0.35) {
          z.stuckT = 0;
          z.sideT = rand(0.9, 1.8);
          z.side = Math.random() < 0.5 ? -1 : 1;
        }
        moving = true;
      }
      rp.y = heightAt(rp.x, rp.z);

      // attacking
      z.attackCd -= dt;
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0) {
          if (dist < T.range + 0.5 && Math.abs(pp.y - rp.y) < 2.5 * T.scale) onPlayerHit(z, z.damage);
          z.attackCd = T.cooldown;
        }
      } else if (dist < T.range && z.attackCd <= 0) {
        z.windup = 0.38;
        this.audio.zombieAttack(rp);
      }

      // animation
      const animSpeed = z.speed * speedMul * (z.typeId === 'runner' ? 2.1 : 2.6) / T.scale;
      if (moving) z.phase += dt * animSpeed;
      const sw = moving ? Math.sin(z.phase) : 0;
      z.legL.rotation.x = sw * 0.6;
      z.legR.rotation.x = -sw * 0.6;
      z.upper.rotation.z = Math.sin(z.phase * 0.5) * 0.08;
      let armX = -1.35 + Math.sin(z.phase * 0.5 + 1) * 0.12;
      if (z.windup > 0) armX = -1.35 - Math.sin((1 - z.windup / 0.38) * Math.PI) * 0.9;
      z.armL.rotation.x = armX;
      z.armR.rotation.x = z.armDroop ? -0.2 + sw * 0.2 : armX + 0.1;
      z.jaw.position.y = -0.12 - Math.abs(Math.sin(z.phase * 1.7)) * 0.04;

      // groans
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = rand(3, 9);
        if (this.groanBudget <= 0 && dist < 50) {
          this.groanBudget = 0.6;
          this.audio.groan(rp, (z.typeId === 'runner' ? 1.35 : 1) * rand(0.85, 1.15), z.typeId === 'brute' || z.typeId === 'boss');
        }
      }
    }

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
