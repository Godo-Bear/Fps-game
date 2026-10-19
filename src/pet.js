import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { heightAt } from './terrain.js';

// The wolf companion: the owner's Quaternius wolf (public/models), or a block wolf if it can't load.
// Either way its fur is tinted the colour the player picked.
const WOLF_URL = '/models/Wolf by Quaternius - P1gU3Qkr9r.glb';
const HEIGHT = 0.85; // metres tall, ears included
let template = null;
let loading = null;

export function loadWolfModel() {
  if (!loading)
    loading = new Promise((resolve) => {
      new GLTFLoader().load(
        encodeURI(WOLF_URL),
        (gltf) => {
          const scene = gltf.scene;
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene, true);
          const size = box.getSize(new THREE.Vector3());
          const scale = HEIGHT / (size.y || 1);
          const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).multiplyScalar(scale);
          scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.frustumCulled = false;
              for (const m of [].concat(o.material)) {
                m.metalness = 0;
                m.roughness = 0.9;
              }
            }
          });
          const find = (name) => gltf.animations.find((c) => c.name === name) || gltf.animations.find((c) => c.name.endsWith(`|${name}`));
          template = { scene, scale, offset, walk: find('Walk'), run: find('Gallop'), idle: find('Idle'), bite: find('Attack') };
          resolve(true);
        },
        undefined,
        () => resolve(false), // not uploaded yet: the block wolf
      );
    });
  return loading;
}

// the block wolf: head towards +z
function blockWolf(color) {
  const root = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb020, emissiveIntensity: 0.8 });
  eye.userData.eye = true;
  const box = (w, h, d, mat, parent, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  box(0.36, 0.34, 0.86, fur, root, 0, 0.58, 0);
  box(0.3, 0.12, 0.7, light, root, 0, 0.42, 0.02); // belly
  box(0.4, 0.38, 0.3, fur, root, 0, 0.66, 0.36); // ruff
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.52);
  root.add(head);
  box(0.3, 0.28, 0.28, fur, head, 0, 0, 0);
  box(0.18, 0.14, 0.24, light, head, 0, -0.05, 0.22); // snout
  box(0.07, 0.06, 0.05, dark, head, 0, -0.01, 0.35); // nose
  box(0.05, 0.05, 0.02, eye, head, -0.08, 0.05, 0.14);
  box(0.05, 0.05, 0.02, eye, head, 0.08, 0.05, 0.14);
  for (const s of [-1, 1]) {
    const ear = box(0.08, 0.14, 0.05, fur, head, s * 0.09, 0.2, -0.04);
    ear.rotation.z = s * -0.2;
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.68, -0.43);
  root.add(tail);
  const t = box(0.1, 0.1, 0.42, fur, tail, 0, 0, -0.2);
  t.rotation.x = 0.5;
  const legs = [];
  for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.3], [0.11, -0.3]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.45, z);
    root.add(leg);
    const geo = new THREE.BoxGeometry(0.09, 0.45, 0.1);
    geo.translate(0, -0.225, 0);
    const m = new THREE.Mesh(geo, fur);
    m.castShadow = true;
    leg.add(m);
    legs.push(leg);
  }
  return { root, legs, head, tail, mats: [fur, light, dark, eye], tint: (c) => (fur.color.set(c), light.color.set(c).lerp(new THREE.Color(0xffffff), 0.45)) };
}

function modelWolf(color) {
  const root = new THREE.Group();
  const model = cloneSkinned(template.scene);
  model.scale.setScalar(template.scale);
  model.position.copy(template.offset);
  root.add(model);
  // every copy gets its own materials so each wolf can be its own colour: the fur takes the colour,
  // the lighter fur (chest, muzzle) a paler shade, eyes and nose stay as they are
  const mats = [];
  const fur = [];
  const pale = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) {
      mats.push(m);
      if (m.name === 'Main') fur.push(m);
      else if (m.name === 'Main_Light') pale.push(m);
    }
  });
  const tint = (c) => {
    for (const m of fur) m.color.set(c);
    for (const m of pale) m.color.set(c).lerp(new THREE.Color(0xffffff), 0.4);
  };
  tint(color);
  const mixer = new THREE.AnimationMixer(model);
  const action = (clip) => (clip ? mixer.clipAction(clip) : null);
  return { root, mixer, mats, tint, walk: action(template.walk), run: action(template.run), idle: action(template.idle), bite: action(template.bite) };
}

// The wolf lives forever: nothing can hurt it, so it has no health (and no health bar).
export class Wolf {
  constructor(scene, color = '#8a8f96') {
    this.scene = scene;
    this.color = color;
    this.speed = 0;
    this.phase = 0;
    this.biteT = 0;
    this.biteAnim = 0;
    this.placed = false;
    this.level = 1;
    this.build();
  }

  build() {
    if (this.look) {
      this.scene.remove(this.look.root);
      for (const m of this.look.mats) m.dispose?.();
    }
    this.look = template ? modelWolf(this.color) : blockWolf(this.color);
    this.model = !!template;
    this.playing = null;
    if (this.pos) this.look.root.position.copy(this.pos);
    this.pos = this.look.root.position;
    this.scene.add(this.look.root);
    this._levelLook();
  }

  // Alpha (level 10): glowing eyes and bigger. Dire Wolf (20): huge, with a golden glow.
  setLevel(lvl) {
    if (lvl === this.level) return;
    this.level = lvl;
    this._levelLook();
  }
  _levelLook() {
    const L = this.look;
    const alpha = this.level >= 10;
    const dire = this.level >= 20;
    L.root.scale.setScalar(dire ? 1.4 : alpha ? 1.15 : 1);
    for (const m of L.mats) {
      if (!m.emissive) continue;
      const eye = /eye/i.test(m.name) || m.userData.eye;
      if (eye) {
        m.emissive.setHex(alpha ? 0xffc030 : m.userData.eye ? 0xffb020 : 0x000000);
        m.emissiveIntensity = alpha ? 2 : 0.8;
      } else {
        m.emissive.setHex(dire ? 0x6a4a10 : 0x000000);
        m.emissiveIntensity = dire ? 0.6 : 1;
      }
    }
  }

  setColor(c) {
    if (c === this.color) return;
    this.color = c;
    this.look.tint(c);
  }

  // the uploaded model arrived after this wolf was made
  refresh() {
    if (!!template !== this.model) this.build();
  }

  dispose() {
    this.scene.remove(this.look.root);
    for (const m of this.look.mats) m.dispose?.();
  }

  // Follows `owner` (feet position), keeping to its spot (right, left, front or behind) by the way they
  // face (`yaw`, like the camera's). `prey`: a zombie position to run at instead. `fast`: Swift Paws.
  update(dt, owner, { prey = null, yaw = 0, spot = 'right', fast = false } = {}) {
    const p = this.pos;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const [ox, oz] = spot === 'front' ? [fx * 2.2, fz * 2.2] : spot === 'behind' ? [-fx * 2, -fz * 2] : spot === 'left' ? [fz * 1.6, -fx * 1.6] : [-fz * 1.6, fx * 1.6];
    if (!this.placed || Math.hypot(p.x - owner.x, p.z - owner.z) > 30) {
      // start (or catch up) at its spot
      p.set(owner.x + ox, 0, owner.z + oz);
      this.placed = true;
    }
    const tx = prey ? prey.x : owner.x + ox;
    const tz = prey ? prey.z : owner.z + oz;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const stop = prey ? 1.1 : 0.25;
    const top = fast ? 11 : 9;
    let want = 0;
    if (d > stop) want = prey ? (fast ? 9.5 : 7.5) : Math.min(top, 1 + (d - stop) * 3);
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    let face = null;
    if (this.speed > 0.4 && d > 0.05) {
      const step = Math.min(this.speed * dt, Math.max(0, d - stop));
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      face = Math.atan2(dx, dz);
    } else if (!prey) face = Math.atan2(fx, fz); // standing at its spot: looks the way you do
    else if (d > 0.01) face = Math.atan2(dx, dz);
    if (face !== null) {
      let r = face - this.look.root.rotation.y;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      this.look.root.rotation.y += r * Math.min(1, dt * 8);
    }
    p.y = heightAt(p.x, p.z);
    this.biteAnim = Math.max(0, this.biteAnim - dt);
    this._animate(dt);
    return prey ? d : Infinity;
  }

  bite() {
    this.biteAnim = 0.35;
    if (this.look.bite) {
      this.look.bite.reset().setLoop(THREE.LoopOnce, 1).play();
    }
  }

  _animate(dt) {
    const L = this.look;
    if (L.mixer) {
      // idle, walk or gallop, faded between
      const want = this.speed > 4.5 && L.run ? L.run : this.speed > 0.4 ? L.walk : L.idle;
      if (want && want !== this.playing) {
        want.reset().play();
        if (this.playing) this.playing.crossFadeTo(want, 0.25, false);
        this.playing = want;
      }
      if (L.walk) L.walk.timeScale = Math.max(0.6, this.speed / 1.8);
      if (L.run) L.run.timeScale = Math.max(0.7, this.speed / 7);
      L.mixer.update(dt);
      return;
    }
    this.phase += dt * (2 + this.speed * 2.2);
    const swing = Math.min(0.7, this.speed * 0.12);
    L.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * swing));
    L.tail.rotation.y = Math.sin(this.phase * 1.5) * 0.35;
    L.head.rotation.x = this.biteAnim > 0 ? 0.35 : Math.sin(this.phase * 0.5) * 0.04;
  }
}
