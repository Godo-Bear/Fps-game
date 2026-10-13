import * as THREE from 'three';
import { GUNS, MUTATIONS, TIER_COLOR, buildGun, randomMutation, rollGun } from './guns.js';
import { heightAt } from './terrain.js';

const beamGeo = new THREE.CylinderGeometry(0.18, 0.35, 14, 12, 1, true);
beamGeo.translate(0, 7, 0);
const ringGeo = new THREE.RingGeometry(0.55, 0.75, 28);
ringGeo.rotateX(-Math.PI / 2);

// Guns lying around the map, marked by a coloured light beam. Walk over one to pick it up.
export class GunPickups {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
  }

  _floor(spot) {
    const terrain = heightAt(spot.x, spot.z);
    const top = this.world.colliders.floorAt(spot.x, spot.z, 0.2, Infinity);
    return Math.max(terrain, top);
  }

  spawn(id, spot, mut = null) {
    const def = GUNS[id];
    const color = mut ? MUTATIONS[mut].color : TIER_COLOR[def.tier];
    const root = new THREE.Group();
    const y = this._floor(spot);
    root.position.set(spot.x, y, spot.z);

    const spin = new THREE.Group();
    spin.position.y = 0.75;
    const gun = buildGun(id, { mutation: mut }).group;
    gun.scale.setScalar(1.6);
    gun.rotation.y = Math.PI / 2;
    gun.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    spin.add(gun);
    root.add(spin);

    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    root.add(beam);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.position.y = 0.06;
    root.add(ring);

    this.scene.add(root);
    this.items.push({ id, mut, spot, root, spin, beam, ring, t: Math.random() * 10 });
  }

  // Fills empty loot spots until `count` guns are on the map. Some come out mutated.
  topUp(count, avoid, mutatedChance = 0.1) {
    const free = this.world.lootSpots.filter(
      (s) => !this.items.some((i) => i.spot === s) && (!avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 6)
    );
    while (this.items.length < count && free.length) {
      const spot = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      this.spawn(rollGun(), spot, Math.random() < mutatedChance ? randomMutation() : null);
    }
  }

  clear() {
    for (const i of this.items) this._remove(i);
    this.items = [];
  }

  _remove(i) {
    this.scene.remove(i.root);
    i.beam.material.dispose();
    i.ring.material.dispose();
  }

  // Calls onPick(id) when the player touches a gun; the gun is removed if onPick returns true.
  update(dt, playerPos, onPick) {
    for (let n = this.items.length - 1; n >= 0; n--) {
      const i = this.items[n];
      i.t += dt;
      i.spin.rotation.y += dt * 1.6;
      i.spin.position.y = 0.75 + Math.sin(i.t * 2.2) * 0.08;
      i.beam.material.opacity = i.mut ? 0.2 + Math.sin(i.t * 9) * 0.1 : 0.16 + Math.sin(i.t * 3) * 0.05;
      i.ring.scale.setScalar(1 + Math.sin(i.t * 2) * 0.08);
      const dx = playerPos.x - i.root.position.x;
      const dz = playerPos.z - i.root.position.z;
      const dy = playerPos.y - i.root.position.y;
      if (dx * dx + dz * dz < 1.5 * 1.5 && dy > -1 && dy < 1.6 && onPick(i.id, i.mut)) {
        this._remove(i);
        this.items.splice(n, 1);
      }
    }
  }
}
