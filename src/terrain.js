import * as THREE from 'three';

// Players and zombies are kept inside this radius (metres from the map centre).
export const ARENA_RADIUS = 112;

// Small deterministic RNG so the map is the same every time.
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gentle rolling plains.
export function heightAt(x, z) {
  return (
    Math.sin(x * 0.021) * 1.6 +
    Math.cos(z * 0.018) * 1.4 +
    Math.sin((x + z) * 0.047) * 0.55 +
    Math.sin(x * 0.13 + z * 0.09) * 0.18
  );
}

// Oriented boxes on the ground plane (XZ). Used for player / zombie collision.
export class Colliders {
  constructor() {
    this.list = [];
  }

  add(x, z, hx, hz, rot = 0, top = Infinity) {
    const c = {
      x, z, hx, hz, top,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      r: Math.hypot(hx, hz),
    };
    this.list.push(c);
    return c;
  }

  // Registers a box-shaped mesh (BoxGeometry) using its world transform. Only yaw is honoured.
  addFromMesh(mesh) {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(p, q, s);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const prm = mesh.geometry.parameters;
    const round = prm.radiusBottom !== undefined ? Math.max(prm.radiusTop, prm.radiusBottom) * 2 : 1;
    const w = prm.width ?? round;
    const d = prm.depth ?? round;
    const h = prm.height ?? 1;
    const pad = mesh.userData.colPad ?? 0;
    const top = mesh.userData.colTop ?? p.y + (h * s.y) / 2;
    return this.add(p.x, p.z, (w * s.x) / 2 + pad, (d * s.z) / 2 + pad, e.y, top);
  }

  // Pushes a circle (pos.x, pos.z, radius) out of every collider. feetY lets jumpers clear low walls.
  resolve(pos, radius, feetY = -Infinity) {
    let hit = false;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (feetY > c.top - 0.05) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const reach = c.r + radius;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      let lx = c.cos * dx - c.sin * dz;
      let lz = c.sin * dx + c.cos * dz;
      const cx = Math.max(-c.hx, Math.min(c.hx, lx));
      const cz = Math.max(-c.hz, Math.min(c.hz, lz));
      const ox = lx - cx;
      const oz = lz - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        lx += (ox / d) * push;
        lz += (oz / d) * push;
      } else {
        // Centre is inside the box: leave by the shallowest side.
        const px = c.hx - Math.abs(lx) + radius;
        const pz = c.hz - Math.abs(lz) + radius;
        if (px < pz) lx += Math.sign(lx || 1) * px;
        else lz += Math.sign(lz || 1) * pz;
      }
      pos.x = c.x + c.cos * lx + c.sin * lz;
      pos.z = c.z - c.sin * lx + c.cos * lz;
      hit = true;
    }
    return hit;
  }

  blocked(x, z, radius) {
    const p = { x, z };
    return this.resolve(p, radius);
  }
}
