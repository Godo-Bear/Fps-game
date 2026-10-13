import { ARENA_RADIUS, STEP_HEIGHT, heightAt } from './terrain.js';

const UNREACHED = 0xffff;
// 8 neighbours: dx, dz
const NB = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Walkability grid over the arena plus a "flow field" towards the player.
// Every cell stores how many steps it is from the player, so a zombie anywhere
// on the map just walks downhill and finds its way round walls and through doors.
export class NavGrid {
  constructor(colliders, { cell = 0.5, radius = 0.32 } = {}) {
    this.cell = cell;
    this.half = ARENA_RADIUS + 4;
    this.n = Math.ceil((this.half * 2) / cell);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    this.dist = new Uint16Array(n * n).fill(UNREACHED);
    this.queue = new Int32Array(n * n);
    this.target = -1;
    this._rasterize(colliders, radius);
  }

  // Marks every cell a zombie can't stand in.
  _rasterize(colliders, r) {
    const { n, cell, half } = this;
    const ground = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) ground[iz * n + ix] = heightAt(ix * cell - half + cell / 2, iz * cell - half + cell / 2);
    }
    // outside the arena is off limits
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = ix * cell - half + cell / 2;
        const z = iz * cell - half + cell / 2;
        if (x * x + z * z > ARENA_RADIUS * ARENA_RADIUS) this.blocked[iz * n + ix] = 1;
      }
    }
    for (const c of colliders.list) {
      const reach = c.r + r;
      const x0 = Math.max(0, Math.floor((c.x - reach + half) / cell));
      const x1 = Math.min(n - 1, Math.floor((c.x + reach + half) / cell));
      const z0 = Math.max(0, Math.floor((c.z - reach + half) / cell));
      const z1 = Math.min(n - 1, Math.floor((c.z + reach + half) / cell));
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const i = iz * n + ix;
          if (this.blocked[i]) continue;
          const g = ground[i];
          // things you can step over or walk under don't block
          if (c.top <= g + STEP_HEIGHT || c.bottom >= g + 1.8) continue;
          const x = ix * cell - half + cell / 2;
          const z = iz * cell - half + cell / 2;
          if (colliders._dist2(c, x, z) < r * r) this.blocked[i] = 1;
        }
      }
    }
  }

  index(x, z) {
    const ix = Math.floor((x + this.half) / this.cell);
    const iz = Math.floor((z + this.half) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  reachable(x, z) {
    const i = this.index(x, z);
    return i >= 0 && this.dist[i] !== UNREACHED;
  }

  // Breadth-first flood out over the walkable cells from one or more targets (co-op: every player),
  // so each zombie heads for whoever is closest by path.
  update(points) {
    const starts = [...new Set(points.map((p) => this.index(p.x, p.z)).filter((i) => i >= 0))].sort((a, b) => a - b);
    if (!starts.length) return;
    const key = starts.join(',');
    if (key === this.target) return;
    this.target = key;
    const { n, blocked, dist, queue } = this;
    dist.fill(UNREACHED);
    // A target may be on top of something (a car roof): start from it anyway
    // so zombies gather right next to it and climb up.
    let head = 0;
    let tail = 0;
    for (const s of starts) {
      dist[s] = 0;
      queue[tail++] = s;
    }
    while (head < tail) {
      const i = queue[head++];
      const d = dist[i] + 1;
      const ix = i % n;
      const iz = (i - ix) / n;
      for (let k = 0; k < 8; k++) {
        const nx = ix + NB[k][0];
        const nz = iz + NB[k][1];
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        if (blocked[j] || dist[j] !== UNREACHED) continue;
        // no cutting corners past walls
        if (k >= 4 && (blocked[iz * n + nx] || blocked[nz * n + ix])) continue;
        dist[j] = d;
        queue[tail++] = j;
      }
    }
  }

  _best(i) {
    const { n, dist, blocked } = this;
    const ix = i % n;
    const iz = (i - ix) / n;
    let best = -1;
    let bd = dist[i];
    for (let k = 0; k < 8; k++) {
      const nx = ix + NB[k][0];
      const nz = iz + NB[k][1];
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (k >= 4 && (blocked[iz * n + nx] || blocked[nz * n + ix])) continue;
      // straight steps are checked first, so they win ties and paths don't zig-zag
      if (dist[j] < bd) {
        bd = dist[j];
        best = j;
      }
    }
    return best;
  }

  // Direction to walk from (x, z), or null when there's no route (or we're there).
  direction(x, z, out) {
    let i = this.index(x, z);
    if (i < 0) return null;
    if (this.dist[i] === UNREACHED) {
      // standing in a blocked cell (pressed against a wall): use the best neighbour
      const b = this._best(i);
      if (b < 0 || this.dist[b] === UNREACHED) return null;
      i = b;
    }
    // look two cells ahead for a smoother line
    let a = this._best(i);
    if (a < 0) return null;
    const b = this._best(a);
    if (b >= 0) a = b;
    const n = this.n;
    const ax = (a % n) * this.cell - this.half + this.cell / 2;
    const az = Math.floor(a / n) * this.cell - this.half + this.cell / 2;
    const dx = ax - x;
    const dz = az - z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return null;
    out.x = dx / len;
    out.z = dz / len;
    return out;
  }
}
