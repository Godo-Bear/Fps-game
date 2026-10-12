import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Pooled particles (blood, dust, sparks), bullet tracers and explosion flashes.
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
      this.particles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, grav: 9 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    scene.add(this.mesh);
    this.next = 0;

    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    tracerGeo.translate(0, 0, -0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ m, life: 0 });
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

  tracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const len = from.distanceTo(to);
    t.m.position.copy(from);
    t.m.lookAt(to);
    t.m.scale.set(0.025, 0.025, len);
    t.m.visible = true;
    t.m.material.opacity = 0.8;
    t.life = 0.06;
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
        this.dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 2));
      }
      this.dummy.position.copy(p.pos);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.m.material.opacity = Math.max(0, t.life / 0.06) * 0.8;
      if (t.life <= 0) t.m.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, (this.flashLife / 0.12) * 40);
    }
  }
}
