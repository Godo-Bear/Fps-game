import * as THREE from 'three';
import { SUPPLY_FALL, SUPPLY_REACH } from '../shared/modes.js';
import { heightAt } from './terrain.js';

const DROP_FROM = 70; // metres above the ground a crate starts falling from
const crateGeo = new THREE.BoxGeometry(1.3, 0.95, 1.3);
const bandGeo = new THREE.BoxGeometry(1.34, 0.18, 1.34);
const canopyGeo = new THREE.SphereGeometry(2.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const beamGeo = new THREE.CylinderGeometry(0.25, 0.45, 40, 12, 1, true);
beamGeo.translate(0, 20, 0);
const ringGeo = new THREE.RingGeometry(1.2, 1.55, 32);
ringGeo.rotateX(-Math.PI / 2);
const crateMat = new THREE.MeshStandardMaterial({ color: 0x55602e, roughness: 0.85 });
const bandMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, emissive: 0x4a3600 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd8442e, roughness: 0.9, side: THREE.DoubleSide });
const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd });

// Supply crates that parachute in: walk up to one for health and (usually) a good gun.
export class SupplyDrops {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = new Map(); // id -> drop
    this.onLand = null; // (drop) for dust and a thud
  }

  _floor(x, z) {
    return Math.max(heightAt(x, z), this.world.colliders.floorAt(x, z, 0.2, Infinity));
  }

  // d: { id, x, z, gun, land } (land = seconds until it touches down)
  add(d) {
    if (this.items.has(d.id)) return;
    const root = new THREE.Group();
    const floor = this._floor(d.x, d.z);
    root.position.set(d.x, floor, d.z);
    const crate = new THREE.Group();
    const box = new THREE.Mesh(crateGeo, crateMat);
    box.castShadow = true;
    const b1 = new THREE.Mesh(bandGeo, bandMat);
    b1.position.y = 0.2;
    const b2 = new THREE.Mesh(bandGeo, bandMat);
    b2.position.y = -0.2;
    crate.add(box, b1, b2);
    crate.position.y = 0.48;
    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 4.2;
    canopy.scale.y = 0.6;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5), new THREE.Vector3(Math.cos(a) * 2.3, 4.2, Math.sin(a) * 2.3));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    chute.add(canopy, lines);
    crate.add(chute);
    // a red smoke column so you can find it from anywhere
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.07;
    root.add(crate, beam, ring);
    this.scene.add(root);
    this.items.set(d.id, { ...d, root, crate, chute, beam, ring, floor, fall: Math.max(0, d.land ?? SUPPLY_FALL), t: 0, landed: (d.land ?? SUPPLY_FALL) <= 0, asked: 0 });
  }

  remove(id) {
    const d = this.items.get(id);
    if (!d) return null;
    this.scene.remove(d.root);
    d.beam.material.dispose();
    d.ring.material.dispose();
    d.chute.children[1].geometry.dispose();
    this.items.delete(id);
    return d;
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  // onTouch(drop) when you're next to a crate that has landed
  update(dt, playerPos, canTouch, onTouch) {
    for (const d of this.items.values()) {
      d.t += dt;
      if (!d.landed) {
        d.fall -= dt;
        const h = Math.max(0, d.fall) * (DROP_FROM / SUPPLY_FALL);
        d.crate.position.y = 0.48 + h;
        d.crate.rotation.z = Math.sin(d.t * 1.7) * 0.12;
        d.crate.rotation.x = Math.cos(d.t * 1.3) * 0.08;
        if (d.fall <= 0) {
          d.landed = true;
          d.crate.rotation.set(0, d.crate.rotation.y, 0);
          d.landT = 0;
          if (this.onLand) this.onLand(d);
        }
      } else if (d.chute.visible) {
        // the parachute folds down onto the crate
        d.landT += dt;
        const k = Math.max(0, 1 - d.landT / 0.8);
        d.chute.scale.set(1 + (1 - k) * 0.4, k, 1 + (1 - k) * 0.4);
        if (k <= 0) d.chute.visible = false;
      }
      d.beam.material.opacity = 0.16 + Math.sin(d.t * 3) * 0.06;
      d.ring.scale.setScalar(1 + Math.sin(d.t * 2.4) * 0.1);
      if (!d.landed || !canTouch) continue;
      const dx = playerPos.x - d.x;
      const dz = playerPos.z - d.z;
      if (dx * dx + dz * dz < SUPPLY_REACH * SUPPLY_REACH && Math.abs(playerPos.y - d.floor) < 2.5 && performance.now() - d.asked > 600) {
        d.asked = performance.now();
        onTouch(d);
      }
    }
  }

  minimapMarkers() {
    return [...this.items.values()].map((d) => ({ x: d.x, z: d.z, color: '#ffc040', r: 4, shape: 'diamond' }));
  }
}
