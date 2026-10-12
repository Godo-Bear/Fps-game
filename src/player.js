import * as THREE from 'three';
import { ARENA_RADIUS, heightAt } from './terrain.js';

const EYE = 1.7;
const WALK = 6;
const SPRINT = 9.5;
const GRAVITY = 20;
const JUMP = 6.5;

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.radius = 0.45;
    this.sensitivity = 0.0022;
    this.reset(100);
  }

  reset(maxHealth) {
    this.pos.set(0, heightAt(0, 0), 0);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.health = maxHealth;
    this.onGround = true;
    this.shake = 0;
    this.stepT = 0;
    this.bob = 0;
    this.sprinting = false;
    this.moving = false;
  }

  heal(amount, max) {
    this.health = Math.min(max ?? Infinity, this.health + amount);
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  addRecoil(amount) {
    this.recoil += amount;
    this.yaw += (Math.random() - 0.5) * amount * 0.4;
  }

  update(dt, colliders, stats, firing, audio) {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.moving = fwd !== 0 || strafe !== 0;
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && fwd > 0 && !firing;

    const speed = (this.sprinting ? SPRINT : WALK) * stats.speedMul;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx = (wx / wl) * speed;
      wz = (wz / wl) * speed;
    }
    const accel = this.onGround ? 14 : 3;
    const a = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.z += (wz - this.vel.z) * a;

    if (k.has('Space') && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    colliders.resolve(this.pos, this.radius, this.pos.y);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) {
      this.pos.x *= ARENA_RADIUS / r;
      this.pos.z *= ARENA_RADIUS / r;
    }
    const g2 = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g2 || (this.onGround && this.vel.y <= 0 && this.pos.y - g2 < 0.35)) {
      if (!this.onGround && this.vel.y < -4) audio.step();
      this.pos.y = g2;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // head bob + footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed > 0.5) {
      this.bob += dt * hSpeed * 1.5;
      this.stepT += dt * hSpeed;
      if (this.stepT > 2.4) {
        this.stepT = 0;
        audio.step();
      }
    }

    // regeneration
    if (stats.regen > 0) this.heal(stats.regen * dt, stats.maxHealth);

    this.recoil *= Math.exp(-dt * 10);
    this.shake = Math.max(0, this.shake - dt * 2.5);

    const bobY = this.onGround ? Math.abs(Math.sin(this.bob)) * 0.05 * Math.min(1, hSpeed / 6) : 0;
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    const sh = this.shake * this.shake;
    this.camera.rotation.set(
      this.pitch + this.recoil + (Math.random() - 0.5) * sh * 0.06,
      this.yaw + (Math.random() - 0.5) * sh * 0.06,
      Math.sin(this.bob * 0.5) * 0.004 * Math.min(1, hSpeed / 6)
    );
    return hSpeed;
  }
}
