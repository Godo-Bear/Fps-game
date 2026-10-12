import * as THREE from 'three';
import { muzzleTexture } from './textures.js';

const BASE = {
  damage: 26,
  fireRate: 9, // rounds per second
  mag: 30,
  reloadTime: 1.9,
};

// First-person rifle: handles ammo, fire timing, reload and the view model animation.
export class Weapon {
  constructor(camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.ammo = BASE.mag;
    this.cooldown = 0;
    this.reloading = 0;
    this.reloadDur = BASE.reloadTime;
    this.kick = 0;
    this.flashT = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobT = 0;
    this.sprintBlend = 0;
    this._buildModel();
  }

  damage(stats) {
    return BASE.damage * stats.damageMul;
  }

  magSize(stats) {
    return BASE.mag + stats.magBonus;
  }

  reset(stats) {
    this.ammo = this.magSize(stats);
    this.reloading = 0;
    this.cooldown = 0;
  }

  _buildModel() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.5, metalness: 0.25 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.7 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x4a423a, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6450, roughness: 1 });
    const g = (this.model = new THREE.Group());
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.075, 0.1, 0.46), metal, 0, 0, 0);
    add(new THREE.BoxGeometry(0.07, 0.07, 0.3), wood, 0, -0.01, -0.36);
    const barrel = add(new THREE.CylinderGeometry(0.017, 0.017, 0.42, 10), metal, 0, 0.02, -0.66, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.08, 10), metal, 0, 0.02, -0.86, Math.PI / 2);
    add(new THREE.BoxGeometry(0.02, 0.05, 0.02), metal, 0, 0.065, -0.8);
    add(new THREE.BoxGeometry(0.05, 0.035, 0.08), metal, 0, 0.065, 0.06);
    add(new THREE.BoxGeometry(0.065, 0.11, 0.28), wood, 0, -0.04, 0.34, 0.12);
    add(new THREE.BoxGeometry(0.05, 0.13, 0.06), wood, 0, -0.1, 0.1, -0.35);
    this.mag = add(new THREE.BoxGeometry(0.05, 0.2, 0.09), metal, 0, -0.14, -0.08, 0.3);
    this.magRest = this.mag.position.clone();
    add(new THREE.BoxGeometry(0.09, 0.09, 0.09), glove, 0.005, -0.1, 0.11, -0.3);
    add(new THREE.BoxGeometry(0.1, 0.1, 0.3), sleeve, 0.05, -0.16, 0.28, 0.4, 0.2);
    add(new THREE.BoxGeometry(0.09, 0.08, 0.11), glove, -0.02, -0.06, -0.38);
    add(new THREE.BoxGeometry(0.1, 0.1, 0.34), sleeve, -0.12, -0.12, -0.2, 0.3, -0.6);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.92);
    g.add(this.muzzle);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: muzzleTexture(), color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.scale.setScalar(0.32);
    this.flash.visible = false;
    this.muzzle.add(this.flash);
    this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.muzzle.add(this.light);

    this.rest = new THREE.Vector3(0.2, -0.21, -0.5);
    g.position.copy(this.rest);
    g.scale.setScalar(0.78);
    void barrel;

    // The rifle lives in its own scene, drawn after the world with a cleared depth buffer,
    // so it never clips into walls or zombies.
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.cam.add(g);
    this.scene.add(this.cam);
    this.scene.add(new THREE.HemisphereLight(0xe6e9ec, 0x7a6650, 2.2));
    const key = new THREE.DirectionalLight(0xffd3a1, 2.4);
    key.position.set(-1, 2, 1.5);
    this.scene.add(key);
  }

  resize(aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
  }

  // Muzzle position in world space (the view model scene shares the main camera's view).
  muzzleWorld(target) {
    this.muzzle.updateWorldMatrix(true, false);
    target.setFromMatrixPosition(this.muzzle.matrixWorld);
    return target.applyMatrix4(this.camera.matrixWorld);
  }

  startReload(stats) {
    if (this.reloading > 0 || this.ammo >= this.magSize(stats)) return;
    this.reloadDur = BASE.reloadTime / stats.reloadSpeed;
    this.reloading = this.reloadDur;
    this.audio.reload(this.reloadDur);
  }

  // Returns how many trigger pulls happen this frame.
  update(dt, { trigger, sprinting, moving, speed }, stats) {
    this.cooldown = Math.max(this.cooldown - dt, -dt);
    let shots = 0;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = this.magSize(stats);
    } else if (trigger && !sprinting) {
      if (this.ammo <= 0) {
        if (this.cooldown <= 0) {
          this.audio.empty();
          this.cooldown = 0.25;
          this.startReload(stats);
        }
      } else {
        const interval = 1 / (BASE.fireRate * stats.fireRateMul);
        while (this.cooldown <= 0 && this.ammo > 0) {
          this.cooldown += interval;
          this.ammo--;
          shots++;
        }
      }
    }
    if (shots > 0) {
      this.kick = Math.min(1, this.kick + 0.55 * shots);
      this.flashT = 0.045;
      this.flash.material.rotation = Math.random() * Math.PI;
      this.flash.scale.setScalar(0.25 + Math.random() * 0.15);
    }

    // ---- view model animation
    this.kick = Math.max(0, this.kick - dt * 9);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.light.intensity = this.flashT > 0 ? 6 : 0;

    this.sprintBlend += ((sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 8);
    if (moving) this.bobT += dt * speed * 1.4;
    const bobAmt = moving ? 1 : 0;
    const bx = Math.sin(this.bobT) * 0.012 * bobAmt;
    const by = Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;

    const m = this.model;
    m.position.set(
      this.rest.x + bx + this.swayX - this.sprintBlend * 0.08,
      this.rest.y - by + this.swayY - this.sprintBlend * 0.06,
      this.rest.z + this.kick * 0.06
    );
    m.rotation.set(this.kick * 0.09 - this.sprintBlend * 0.35, this.sprintBlend * 0.7 + 0.03, this.sprintBlend * 0.2);
    this.swayX *= Math.exp(-dt * 8);
    this.swayY *= Math.exp(-dt * 8);

    if (this.reloading > 0) {
      const k = 1 - this.reloading / this.reloadDur;
      const dip = Math.sin(k * Math.PI);
      m.rotation.x -= dip * 0.35;
      m.rotation.z += dip * 0.6;
      m.position.y -= dip * 0.08;
      const magDrop = k < 0.5 ? Math.min(1, k * 4) : Math.max(0, 1 - (k - 0.5) * 3);
      this.mag.position.set(this.magRest.x, this.magRest.y - magDrop * 0.35, this.magRest.z);
      this.mag.visible = !(k > 0.3 && k < 0.55);
    } else {
      this.mag.position.copy(this.magRest);
      this.mag.visible = true;
    }
    return shots;
  }

  sway(dx, dy) {
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX - dx * 0.00012));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY + dy * 0.00012));
  }
}
