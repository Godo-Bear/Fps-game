import * as THREE from 'three';
import { STRUCTURES } from '../shared/structures.js';
import { heightAt } from './terrain.js';

// Barricades and turrets in the world: their models, collision boxes, health bars and the
// see-through preview while you're placing one. Who may build, the turret shooting and
// the networking live in main.js.

const sandMat = new THREE.MeshStandardMaterial({ color: 0xa8956a, roughness: 0.95 });
const sandDark = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.95 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6, metalness: 0.4 });
const bagGeo = new THREE.BoxGeometry(0.78, 0.3, 0.55);
const ALLY = 0x4fc3ff;
const ENEMY = 0xff3b30;

function bar() {
  const g = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, opacity: 0.6, transparent: true, depthTest: false }));
  bg.scale.set(1.2, 0.1, 1);
  bg.center.set(0, 0.5);
  bg.position.x = -0.6;
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5dff6a, depthTest: false }));
  fill.scale.set(1.16, 0.06, 1);
  fill.center.set(0, 0.5);
  fill.position.x = -0.58;
  bg.renderOrder = 7;
  fill.renderOrder = 8;
  g.add(bg, fill);
  g.visible = false;
  return { group: g, fill };
}

function buildBarricade() {
  const g = new THREE.Group();
  // three rows of sandbags, staggered, with a couple of posts
  const rows = [
    [-1.2, -0.4, 0.4, 1.2],
    [-0.8, 0, 0.8],
    [-1.2, -0.4, 0.4, 1.2],
    [-0.8, 0, 0.8],
  ];
  rows.forEach((xs, r) => {
    for (const x of xs) {
      const b = new THREE.Mesh(bagGeo, (r + Math.round(x * 2)) % 3 ? sandMat : sandDark);
      b.position.set(x + (Math.random() - 0.5) * 0.06, 0.15 + r * 0.29, (Math.random() - 0.5) * 0.06);
      b.rotation.y = (Math.random() - 0.5) * 0.12;
      b.scale.y = 1 - r * 0.04;
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
  });
  for (const x of [-1.55, 1.55]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), woodMat);
    post.position.set(x, 0.7, 0.18);
    post.castShadow = true;
    g.add(post);
  }
  return { group: g, head: null };
}

function buildTurret(color) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), steelMat);
    leg.position.set(Math.cos(a) * 0.28, 0.4, Math.sin(a) * 0.28);
    leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    leg.castShadow = true;
    g.add(leg);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10), darkMat);
  base.position.y = 0.8;
  g.add(base);
  const head = new THREE.Group();
  head.position.y = 0.95;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.5), steelMat);
  body.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.5);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a5530, roughness: 0.8 }));
  box.position.set(0.24, -0.04, 0.05);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color }));
  lamp.position.set(0, 0.14, 0.1);
  head.add(body, barrel, box, lamp);
  g.add(head);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.82);
  head.add(muzzle);
  return { group: g, head, muzzle };
}

export class Structures {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.meshes = []; // for bullets
    this.colliders = null;
    this.ghost = null;
    this.ghostKind = null;
    this.ghostMats = [];
  }

  setColliders(colliders) {
    this.clear();
    this.colliders = colliders;
  }

  get(id) {
    return this.list.find((s) => s.id === id);
  }

  count(kind, owner) {
    return this.list.filter((s) => s.kind === kind && s.owner === owner).length;
  }

  // s: { id, kind, x, z, rot, hp?, owner, ally }
  add(s) {
    const def = STRUCTURES[s.kind];
    if (!def || this.get(s.id) || !this.colliders) return null;
    const y = Math.max(heightAt(s.x, s.z), this.colliders.floorAt(s.x, s.z, 0.3, heightAt(s.x, s.z) + 0.5));
    const model = s.kind === 'turret' ? buildTurret(s.ally === false ? ENEMY : ALLY) : buildBarricade();
    model.group.position.set(s.x, y, s.z);
    model.group.rotation.y = s.rot;
    const hpBar = bar();
    hpBar.group.position.set(0, def.h + 0.45, 0);
    model.group.add(hpBar.group);
    this.scene.add(model.group);
    const col = this.colliders.add(s.x, s.z, def.hx, def.hz, s.rot, y + def.h, -Infinity);
    const st = {
      ...s, def, y, hp: s.hp ?? def.hp, maxHp: def.hp, col, model, hpBar,
      pos: new THREE.Vector3(s.x, y + def.h * 0.6, s.z), aim: s.rot, cd: 0, flashT: 0,
    };
    model.group.traverse((o) => {
      if (o.isMesh) {
        o.userData.structure = st;
        this.meshes.push(o);
      }
    });
    this.list.push(st);
    this._bar(st);
    return st;
  }

  remove(id, effects) {
    const s = this.get(id);
    if (!s) return;
    if (effects) {
      effects.explosion(s.pos, s.kind === 'turret' ? 0.8 : 0.5);
      effects.burst(s.pos, { count: 26, color: s.kind === 'turret' ? [0x4a4f55, 0x222428] : [0xa8956a, 0x8a7a55], speed: 4, size: 0.14, life: 0.8, grav: 9, up: 2 });
    }
    this.scene.remove(s.model.group);
    const i = this.colliders ? this.colliders.list.indexOf(s.col) : -1;
    if (i >= 0) this.colliders.list.splice(i, 1);
    this.meshes = this.meshes.filter((m) => m.userData.structure !== s);
    this.list = this.list.filter((o) => o !== s);
  }

  clear() {
    for (const s of [...this.list]) this.remove(s.id);
    this.hideGhost();
  }

  setHp(id, hp) {
    const s = this.get(id);
    if (!s) return null;
    if (hp < s.hp) s.flashT = 0.15;
    s.hp = Math.max(0, hp);
    this._bar(s);
    return s;
  }

  _bar(s) {
    const k = s.hp / s.maxHp;
    s.hpBar.group.visible = k < 0.999;
    s.hpBar.fill.scale.x = 1.16 * Math.max(0.01, k);
    s.hpBar.fill.material.color.setHex(k > 0.5 ? 0x5dff6a : k > 0.25 ? 0xffd34d : 0xff3b30);
  }

  // The barricade or turret a zombie at (x, z) bumps into on its way to its target (dx, dz away).
  blocking(x, z, reach, dx, dz, dist) {
    if (!this.list.length || !this.colliders) return null;
    let best = null;
    let bestD = reach * reach;
    for (const s of this.list) {
      const d2 = this.colliders._dist2(s.col, x, z);
      if (d2 >= bestD) continue;
      const sx = s.x - x;
      const sz = s.z - z;
      const sl = Math.hypot(sx, sz) || 1;
      // only if it's roughly between the zombie and where it's going
      if (d2 > 0.04 && (sx * dx + sz * dz) / (sl * (dist || 1)) < 0.1) continue;
      if (dist < sl - 0.3) continue;
      best = s;
      bestD = d2;
    }
    return best;
  }

  // ---- placement preview
  showGhost(kind, x, z, rot, valid) {
    if (this.ghostKind !== kind) {
      this.hideGhost();
      const model = kind === 'turret' ? buildTurret(ALLY) : buildBarricade();
      this.ghostMats = [];
      model.group.traverse((o) => {
        if (!o.isMesh) return;
        o.material = new THREE.MeshBasicMaterial({ color: 0x5dff6a, transparent: true, opacity: 0.4, depthWrite: false });
        o.castShadow = false;
        this.ghostMats.push(o.material);
      });
      this.ghost = model.group;
      this.ghostKind = kind;
      this.scene.add(this.ghost);
    }
    const y = Math.max(heightAt(x, z), this.colliders ? this.colliders.floorAt(x, z, 0.3, heightAt(x, z) + 0.5) : -Infinity);
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = rot;
    for (const m of this.ghostMats) m.color.setHex(valid ? 0x5dff6a : 0xff3b30);
  }

  hideGhost() {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostKind = null;
  }

  // per frame: turret heads turn to where they aim, hit flashes, smoke when nearly broken
  update(dt, effects) {
    for (const s of this.list) {
      if (s.model.head) {
        let diff = s.aim - s.model.head.rotation.y - s.rot;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.model.head.rotation.y += diff * Math.min(1, dt * 10);
      }
      if (s.flashT > 0) {
        s.flashT -= dt;
        s.model.group.position.x = s.x + (s.flashT > 0 ? (Math.random() - 0.5) * 0.04 : 0);
      }
      if (s.hp / s.maxHp < 0.3 && Math.random() < dt * 4) {
        effects.burst(s.pos, { count: 1, color: [0x3a3a3a, 0x555555], speed: 0.4, size: 0.25, life: 1.4, grav: -2, up: 1 });
      }
    }
  }
}
