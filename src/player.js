import * as THREE from 'three';
import { ARENA_RADIUS, heightAt } from './terrain.js';

const EYE = 1.7;
const HEIGHT = 1.8;
const CROUCH_EYE = 1.1;
const CROUCH_HEIGHT = 1.2;
const SLIDE_EYE = 0.95;
const SLIDE_HEIGHT = 1.0;
const SLIDE_TIME = 0.85;
const LADDER_SPEED = 3.2;
const WALK = 7;
const SPRINT = 11;
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
    this.stick = { x: 0, y: 0 }; // touch joystick / gamepad: x strafe, y forward (-1..1)
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
    this.slideT = 0;
    this.slideHeld = false;
    this.crouching = false;
    this.eye = EYE;
    this.ladder = null;
    this.dead = false;
  }

  get sliding() {
    return this.slideT > 0;
  }

  get bodyHeight() {
    return this.sliding ? SLIDE_HEIGHT : this.crouching ? CROUCH_HEIGHT : HEIGHT;
  }

  get climbing() {
    return !!this.climb || !!this.ladder;
  }

  // Heals up to `cap`. Healing never lowers health that is already above the cap (overheal).
  heal(amount, cap) {
    if (cap === undefined) cap = Infinity;
    if (this.health >= cap) return;
    this.health = Math.min(cap, this.health + amount);
  }

  look(dx, dy, scale = 1) {
    this.yaw -= dx * this.sensitivity * scale;
    this.pitch -= dy * this.sensitivity * scale * (this.invertY ? -1 : 1);
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

  _ladderNear(ladders) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const l of ladders) {
      const lx = l.x + l.nx * 0.45;
      const lz = l.z + l.nz * 0.45;
      if (Math.hypot(this.pos.x - lx, this.pos.z - lz) > 0.8) continue;
      if (this.pos.y < l.bottom - 0.3 || this.pos.y > l.top - 0.2) continue;
      if (fx * -l.nx + fz * -l.nz < 0.2) continue; // must face the ladder
      return l;
    }
    return null;
  }

  // Standing on top next to a ladder and backing onto it.
  _ladderBelow(ladders) {
    for (const l of ladders) {
      if (Math.abs(this.pos.y - l.top) > 0.3) continue;
      if (Math.hypot(this.pos.x - (l.x - l.nx * 0.5), this.pos.z - (l.z - l.nz * 0.5)) > 0.9) continue;
      return l;
    }
    return null;
  }

  update(dt, colliders, stats, firing, audio, moveMul = 1, ladders = []) {
    const k = this.keys;
    if (this.dead) {
      this._updateCamera(dt, 0, 0);
      return 0;
    }
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    // analog stick: how far you push it is how fast you go; all the way forward sprints
    let mag = 1;
    const stickSprint = !fwd && !strafe && this.stick.y > 0.92;
    if (!fwd && !strafe && Math.hypot(this.stick.x, this.stick.y) > 0.12) {
      fwd = this.stick.y;
      strafe = this.stick.x;
      mag = Math.min(1, Math.hypot(fwd, strafe));
    }
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

    // ---- ladders
    if (this.ladder) {
      const l = this.ladder;
      this.pos.x = l.x + l.nx * 0.45;
      this.pos.z = l.z + l.nz * 0.45;
      this.vel.set(0, 0, 0);
      const dir = (k.has('KeyW') || k.has('ArrowUp') || this.stick.y > 0.3 ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') || this.stick.y < -0.3 ? 1 : 0);
      this.pos.y += dir * LADDER_SPEED * dt;
      if (dir !== 0) {
        this.bob += dt * 6;
        this.stepT += dt * LADDER_SPEED;
        if (this.stepT > 1.1) {
          this.stepT = 0;
          audio.click(0.5, 0.12);
        }
      }
      if (jumpPressed) {
        // let go and push off
        this.ladder = null;
        this.vel.set(l.nx * 4, 3, l.nz * 4);
        this.onGround = false;
      } else if (this.pos.y >= l.top - 0.05) {
        this.ladder = null;
        this.climb = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(l.x - l.nx * 0.7, l.top, l.z - l.nz * 0.7) };
      } else if (this.pos.y <= l.bottom) {
        this.pos.y = l.bottom;
        if (dir < 0) this.ladder = null;
      }
      this.sprinting = false;
      this._updateCamera(dt, 0, 0);
      return 0;
    }
    if (fwd > 0 && this.onGround) {
      const l = this._ladderNear(ladders);
      if (l) {
        this.ladder = l;
        this.slideT = 0;
        return 0;
      }
    }
    if (fwd < 0 && this.onGround) {
      const l = this._ladderBelow(ladders);
      if (l) {
        this.ladder = l;
        this.pos.y = l.top - 0.25;
        return 0;
      }
    }

    // ---- slide / crouch (C)
    const crouchKey = k.has('KeyC');
    const crouchPressed = crouchKey && !this.slideHeld;
    this.slideHeld = crouchKey;
    const wasSprinting = this.sprinting;
    if (crouchPressed && this.onGround && wasSprinting && this.slideT <= 0) {
      this.slideT = SLIDE_TIME;
      const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), 9) * 1.35;
      const len = Math.hypot(this.vel.x, this.vel.z) || 1;
      this.vel.x = (this.vel.x / len) * sp;
      this.vel.z = (this.vel.z / len) * sp;
      audio.slide?.();
    }
    if (this.slideT > 0) {
      this.slideT -= dt;
      if (!this.onGround) this.slideT = 0;
    }
    // can't stand up under something low
    const ceiling = colliders.ceilingAt(this.pos.x, this.pos.z, this.radius, this.pos.y);
    const blockedAbove = ceiling < this.pos.y + HEIGHT;
    this.crouching = this.slideT <= 0 && (crouchKey || blockedAbove);

    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight') || stickSprint) && fwd > 0 && !firing && !this.crouching && this.slideT <= 0;
    const speed = (this.sprinting ? SPRINT : WALK) * stats.speedMul * moveMul * (this.crouching ? 0.5 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx = (wx / wl) * speed * mag;
      wz = (wz / wl) * speed * mag;
    }
    if (this.slideT > 0) {
      // sliding: momentum carries you, a little steering
      const f = Math.exp(-1.4 * dt);
      this.vel.x = this.vel.x * f + wx * 0.02;
      this.vel.z = this.vel.z * f + wz * 0.02;
    } else {
      const accel = this.onGround ? 14 : 3;
      const a = 1 - Math.exp(-accel * dt);
      this.vel.x += (wx - this.vel.x) * a;
      this.vel.z += (wz - this.vel.z) * a;
    }

    // Space while facing something climbable pulls you up; mid-air, holding forward grabs nearby ledges.
    if (fwd > 0 && (jumpPressed || (!this.onGround && jump))) {
      const ledge = this._findLedge(colliders, this.onGround ? 0.45 : 0.15);
      if (ledge && (this.onGround || ledge.y - this.pos.y < 1.4)) {
        this.climb = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(ledge.x, ledge.y, ledge.z) };
        this.vel.set(0, 0, 0);
        this.slideT = 0;
        audio.step();
        this._updateCamera(dt, 0, 0);
        return 0;
      }
    }

    if (jumpPressed && this.onGround && !blockedAbove) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.slideT = 0;
    }
    this.vel.y -= GRAVITY * (this.gravityMul || 1) * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    colliders.resolve(this.pos, this.radius, this.pos.y, this.bodyHeight);
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

    // regeneration (never overheals) and overheal slowly draining back to max
    if (stats.regen > 0) this.heal(stats.regen * dt, stats.maxHealth);
    if (this.health > stats.maxHealth) this.health = Math.max(stats.maxHealth, this.health - 1.5 * dt);

    this._updateCamera(dt, hSpeed, 0);
    return hSpeed;
  }

  _updateCamera(dt, hSpeed, dip) {
    this.recoil *= Math.exp(-dt * 10);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const targetEye = this.dead ? 0.4 : this.sliding ? SLIDE_EYE : this.crouching ? CROUCH_EYE : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);
    const bobK = this.bobMul ?? 1; // settings: view bob on/off
    const bobY = this.onGround && !this.sliding ? Math.abs(Math.sin(this.bob)) * 0.05 * Math.min(1, hSpeed / 6) * bobK : 0;
    this.camera.position.set(this.pos.x, this.pos.y + this.eye + bobY - dip, this.pos.z);
    const sh = this.shake * this.shake * (this.shakeMul ?? 1); // settings: screen shake
    this.camera.rotation.set(
      this.pitch + this.recoil - dip * 0.8 + (Math.random() - 0.5) * sh * 0.06,
      this.yaw + (Math.random() - 0.5) * sh * 0.06,
      Math.sin(this.bob * 0.5) * 0.004 * Math.min(1, hSpeed / 6) * bobK + (this.sliding ? 0.06 : 0) + (this.dead ? 0.5 : 0)
    );
  }
}
