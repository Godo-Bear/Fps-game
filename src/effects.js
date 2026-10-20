import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Pooled particles (blood, dust, sparks, fire), bullet tracers and explosion flashes.
const TRACER_SPEED = 240; // metres a second: fast, but you can see it fly
const TRACER_LEN = 3.5; // the streak's length
const _fdir = new THREE.Vector3();
const _fside = new THREE.Vector3();
const _fup = new THREE.Vector3();
const _fend = new THREE.Vector3();
const _fstart = new THREE.Vector3();
const NEAR = 1.4; // the flames start this far out from the nozzle
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.max = 600;
    this.particles = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      this.max
    );
    this.mesh.frustumCulled = false;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    for (let i = 0; i < this.max; i++) {
      this.particles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, grav: 9, grow: 0, near: 0, run: 0 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    scene.add(this.mesh);
    this.next = 0;

    this.tracers = [];
    // runs from its position forwards (+z, the way lookAt points it), towards the target
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ m, life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, age: 0, travel: true });
    }

    this.flash = new THREE.PointLight(0xff9a40, 0, 14, 2);
    scene.add(this.flash);
    this.flashLife = 0;
  }

  burst(pos, { count = 10, color = 0x8a0a0a, speed = 4, size = 0.08, life = 0.6, grav = 12, up = 1.5, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.next];
      this.mesh.setColorAt(this.next, this.color.setHex(Array.isArray(color) ? color[i % color.length] : color));
      this.next = (this.next + 1) % this.max;
      p.alive = true;
      p.pos.copy(pos);
      p.vel.set((Math.random() - 0.5) * 2 * spread, Math.random() * up, (Math.random() - 0.5) * 2 * spread).multiplyScalar(speed);
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.grav = grav;
      p.grow = 0;
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  blood(pos, dir, amount = 1) {
    this.burst(pos, { count: Math.round(8 * amount), color: [0x7a0606, 0x4f0303, 0x9b1010], speed: 3.5, size: 0.07, life: 0.7, up: 1.2 });
  }

  dust(pos) {
    this.burst(pos, { count: 7, color: [0x9c8a6a, 0x7d6e55, 0xc0ae8c], speed: 2, size: 0.09, life: 0.6, grav: 4, up: 1.6 });
  }

  sparks(pos) {
    this.burst(pos, { count: 6, color: [0xffd27a, 0xffa040], speed: 5, size: 0.04, life: 0.25, grav: 15 });
  }

  explosion(pos, radius) {
    this.burst(pos, { count: 26, color: [0xffb347, 0xff6a00, 0xffe08a, 0x3a3027], speed: 3.5 * radius, size: 0.16, life: 0.5, grav: 6, up: 1.2 });
    this.flash.position.copy(pos);
    this.flash.position.y += 0.8;
    this.flash.intensity = 40;
    this.flashLife = 0.12;
  }

  // A bullet: a bright streak that flies from the gun to where it hit. travel = false: the whole line at once
  // and fading (lightning).
  tracer(from, to, color = 0xffd27a, width = 0.025, travel = true) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    t.m.material.color.setHex(color);
    t.len = from.distanceTo(to);
    t.from.copy(from);
    t.dir.subVectors(to, from).normalize();
    t.m.position.copy(from);
    t.m.lookAt(to);
    t.width = width;
    t.travel = travel && t.len > 0.5;
    t.age = 0;
    t.m.visible = true;
    t.m.material.opacity = 0.9;
    t.life = t.travel ? (t.len + TRACER_LEN) / TRACER_SPEED : 0.06;
    this._placeTracer(t);
  }
  _placeTracer(t) {
    if (!t.travel) {
      t.m.scale.set(t.width, t.width, t.len);
      return;
    }
    // the streak's front is where the bullet is; its back trails TRACER_LEN behind (never behind the gun)
    const head = Math.min(t.len, (t.age + 0.004) * TRACER_SPEED);
    const tail = Math.max(0, head - TRACER_LEN);
    t.m.position.copy(t.from).addScaledVector(t.dir, tail);
    t.m.scale.set(t.width * 1.4, t.width * 1.4, Math.max(0.05, head - tail));
  }

  // The flamethrower: a jet of fire that blasts out of the nozzle and billows as it goes, out to `to`
  flames(from, to) {
    const dir = _fdir.subVectors(to, from);
    const dist = Math.max(2, dir.length());
    dir.normalize();
    const side = _fside.set(-dir.z, 0, dir.x).normalize();
    const N = 18;
    for (let i = 0; i < N; i++) {
      const p = this.particles[this.next];
      const k = i / N;
      // white-hot at the core, then yellow, orange, red; a little smoke at the end
      const col = i === N - 1 ? 0x3a302a : k < 0.2 ? 0xfff0b0 : k < 0.45 ? 0xffc04a : k < 0.75 ? 0xff7a1a : 0xff3d10;
      this.mesh.setColorAt(this.next, this.color.setHex(col));
      this.next = (this.next + 1) % this.max;
      p.alive = true;
      // spread along the way, so the jet is one stream all the way out; it starts a little out from the nozzle
      // so it never fills your screen
      const start = Math.min(dist * 0.85, NEAR + (dist - NEAR) * Math.random() * Math.random() * 1.2);
      p.pos.copy(from).addScaledVector(dir, start);
      const life = 0.3 + Math.random() * 0.2;
      const speed = ((dist - start) / life) * (0.85 + Math.random() * 0.25);
      const wob = 0.12 * speed;
      p.vel.copy(dir).multiplyScalar(speed).addScaledVector(side, (Math.random() - 0.5) * wob).add(_fup.set(0, (Math.random() - 0.3) * wob, 0));
      p.life = p.max = life;
      p.size = (0.1 + Math.random() * 0.12) * (1 + (start / dist) * 3);
      p.grav = -2.5; // fire rises
      p.grow = 2.6; // and billows out as it goes
      // but never big close to you, so it doesn't cover your screen: how big it can be depends on how far out it is
      p.near = start;
      p.run = dist - start;
    }
    this.mesh.instanceColor.needsUpdate = true;
    // the white-hot core blasting out of the nozzle
    _fstart.copy(from).addScaledVector(dir, Math.min(NEAR, dist * 0.5));
    this.tracer(_fstart, _fend.copy(from).addScaledVector(dir, Math.min(dist, 6)), 0xffc060, 0.1, false);
    this.flash.position.copy(from);
    this.flash.intensity = Math.max(this.flash.intensity, 10);
    this.flashLife = Math.max(this.flashLife, 0.05);
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      dirty = true;
      p.life -= dt;
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      const ground = heightAt(p.pos.x, p.pos.z) + 0.02;
      if (p.pos.y < ground) {
        p.pos.y = ground;
        p.vel.set(0, 0, 0);
      }
      if (p.life <= 0) {
        p.alive = false;
        this.dummy.scale.setScalar(0);
      } else {
        const age = 1 - p.life / p.max;
        const cap = p.grow ? 0.05 + 0.045 * (p.near + p.run * age) : 99;
        this.dummy.scale.setScalar(Math.min(cap, p.size * (1 + p.grow * age)) * Math.min(1, (p.life / p.max) * (p.grow ? 4 : 2)));
      }
      this.dummy.position.copy(p.pos);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.age += dt;
      if (t.travel) this._placeTracer(t);
      else t.m.material.opacity = Math.max(0, t.life / 0.06) * 0.8;
      if (t.life <= 0) t.m.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, (this.flashLife / 0.12) * 40);
    }
  }
}
