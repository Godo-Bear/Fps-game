import * as THREE from 'three';
import { ARENA_RADIUS, heightAt } from './terrain.js';

const EYE = 1.7;
const HEIGHT = 1.8;
const WALK = 6;
const SPRINT = 9.5;
const GRAVITY = 20;
const JUMP = 6.5;
const CLIMB_REACH = 2.3; // highest ledge you can pull yourself onto
const CLIMB_TIME = 0.42;

const smooth = (t) => t * t * (3 - 2 * t);

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
    this.climb = null;
    this.jumpHeld = false;
  }

  get climbing() {
    return !!this.climb;
  }

  heal(amount, max) {
    this.health = Math.min(max ?? Infinity, this.health + amount);
  }

  look(dx, dy, scale = 1) {
    this.yaw -= dx * this.sensitivity * scale;
    this.pitch -= dy * this.sensitivity * scale;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  addRecoil(amount) {
    this.recoil += amount;
    this.yaw += (Math.random() - 0.5) * amount * 0.4;
  }

  // Looks for a ledge just in front of the player.
  _findLedge(colliders, minUp) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const d of [0.55, 0.75, 0.95, 1.15]) {
      const x = this.pos.x + fx * d;
      const z = this.pos.z + fz * d;
      const top = colliders.ledgeAt(x, z, this.pos.y, minUp, CLIMB_REACH);
      if (top !== null) return { x: x + fx * 0.15, z: z + fz * 0.15, y: top };
    }
    return null;
  }

  update(dt, colliders, stats, firing, audio, moveMul = 1) {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const jump = k.has('Space');
    const jumpPressed = jump && !this.jumpHeld;
    this.jumpHeld = jump;
    this.moving = fwd !== 0 || strafe !== 0;

    // ---- climbing onto a ledge
    if (this.climb) {
      const c = this.climb;
      c.t += dt;
      const t = Math.min(1, c.t / CLIMB_TIME);
      const up = smooth(Math.min(1, t / 0.7));
      const over = smooth(Math.max(0, (t - 0.35) / 0.65));
      this.pos.set(c.from.x + (c.to.x - c.from.x) * over, c.from.y + (c.to.y - c.from.y) * up, c.from.z + (c.to.z - c.from.z) * over);
      if (t >= 1) {
        this.climb = null;
        this.vel.set(0, 0, 0);
        this.onGround = true;
        audio.step();
      }
      this._updateCamera(dt, 0, Math.sin(t * Math.PI) * 0.12);
      return 0;
    }

    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && fwd > 0 && !firing;
    const speed = (this.sprinting ? SPRINT : WALK) * stats.speedMul * moveMul;
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

    // Space while facing something climbable pulls you up; mid-air, holding forward grabs nearby ledges.
    if (fwd > 0 && (jumpPressed || (!this.onGround && jump))) {
      const ledge = this._findLedge(colliders, this.onGround ? 0.45 : 0.15);
      if (ledge && (this.onGround || ledge.y - this.pos.y < 1.4)) {
        this.climb = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(ledge.x, ledge.y, ledge.z) };
        this.vel.set(0, 0, 0);
        audio.step();
        this._updateCamera(dt, 0, 0);
        return 0;
      }
    }

    if (jumpPressed && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    colliders.resolve(this.pos, this.radius, this.pos.y, HEIGHT);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) {
      this.pos.x *= ARENA_RADIUS / r;
      this.pos.z *= ARENA_RADIUS / r;
    }
    const floor = Math.max(heightAt(this.pos.x, this.pos.z), colliders.floorAt(this.pos.x, this.pos.z, this.radius * 0.6, this.pos.y));
    if (this.pos.y <= floor || (this.onGround && this.vel.y <= 0 && this.pos.y - floor < 0.35)) {
      if (!this.onGround && this.vel.y < -4) audio.step();
      this.pos.y = floor;
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

    this._updateCamera(dt, hSpeed, 0);
    return hSpeed;
  }

  _updateCamera(dt, hSpeed, dip) {
    this.recoil *= Math.exp(-dt * 10);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const bobY = this.onGround ? Math.abs(Math.sin(this.bob)) * 0.05 * Math.min(1, hSpeed / 6) : 0;
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY - dip, this.pos.z);
    const sh = this.shake * this.shake;
    this.camera.rotation.set(
      this.pitch + this.recoil - dip * 0.8 + (Math.random() - 0.5) * sh * 0.06,
      this.yaw + (Math.random() - 0.5) * sh * 0.06,
      Math.sin(this.bob * 0.5) * 0.004 * Math.min(1, hSpeed / 6)
    );
  }
}
