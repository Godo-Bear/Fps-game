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

// How high you can walk up without jumping (curbs, rubble, low steps).
export const STEP_HEIGHT = 0.4;

// Oriented boxes with a vertical span. Used for player / zombie collision, standing on things and climbing.
export class Colliders {
  constructor() {
    this.list = [];
  }

  add(x, z, hx, hz, rot = 0, top = Infinity, bottom = -Infinity) {
    const c = {
      x, z, hx, hz, top, bottom,
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
    // Overhead pieces (lintels, the wall above a window) can be walked under.
    const bottom = mesh.userData.overhead ? p.y - (h * s.y) / 2 : -Infinity;
    return this.add(p.x, p.z, (w * s.x) / 2 + pad, (d * s.z) / 2 + pad, e.y, top, bottom);
  }

  // Squared distance from a point to a collider's footprint (0 when inside).
  _dist2(c, x, z) {
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = c.cos * dx - c.sin * dz;
    const lz = c.sin * dx + c.cos * dz;
    const ox = Math.max(Math.abs(lx) - c.hx, 0);
    const oz = Math.max(Math.abs(lz) - c.hz, 0);
    return ox * ox + oz * oz;
  }

  // Pushes a body (circle of `radius`, standing at feetY, `height` tall) out of everything it overlaps.
  // Things lower than a step are ignored (you walk onto them), as are things above your head.
  resolve(pos, radius, feetY, height = 1.8, step = STEP_HEIGHT) {
    if (feetY === undefined) feetY = heightAt(pos.x, pos.z);
    let hit = false;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.top <= feetY + step || c.bottom >= feetY + height) continue;
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

  // Highest surface under a body that it can stand on (or step up onto). -Infinity when there is none.
  floorAt(x, z, radius, feetY, step = STEP_HEIGHT) {
    let best = -Infinity;
    const r2 = radius * radius;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.top > feetY + step || c.top <= best || c.top === Infinity) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const reach = c.r + radius;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      if (this._dist2(c, x, z) <= r2) best = c.top;
    }
    return best;
  }

  // A ledge to climb onto at (x, z): the top of something between minUp and maxUp above feetY,
  // with room to stand on it. Returns the ledge height or null.
  ledgeAt(x, z, feetY, minUp, maxUp, headroom = 1.7) {
    let best = null;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.top === Infinity || c.top <= feetY + minUp || c.top > feetY + maxUp) continue;
      if (this._dist2(c, x, z) > 0.01) continue;
      if (best === null || c.top > best) best = c.top;
    }
    if (best === null) return null;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.top <= best + 0.05 || c.bottom >= best + headroom) continue;
      if (this._dist2(c, x, z) < 0.09) return null;
    }
    return best;
  }

  blocked(x, z, radius) {
    const p = { x, z };
    return this.resolve(p, radius);
  }
}
