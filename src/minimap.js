import { ARENA_RADIUS } from './terrain.js';

const WORLD = 128; // map image covers -WORLD..WORLD metres
const PX = 4; // pixels per metre in the pre-rendered map
const RANGE = 55; // metres from the player to the minimap edge

// Rotating top-down minimap. The pre-rendered map image is drawn under live markers.
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.base = this._prerender(world);
  }

  _prerender(world) {
    const c = document.createElement('canvas');
    c.width = c.height = WORLD * 2 * PX;
    const g = c.getContext('2d');
    const look = { plains: ['#8c7651', 'rgba(45,35,25,0.75)', '#3b2f24'], frost: ['#c9d3dc', 'rgba(70,80,95,0.7)', '#4a5260'], forest: ['#2f3a24', 'rgba(15,20,10,0.8)', '#0d120a'] }[world.mapId] || ['#8c7651', 'rgba(45,35,25,0.75)', '#3b2f24'];
    g.fillStyle = look[0];
    g.fillRect(0, 0, c.width, c.height);
    g.translate(WORLD * PX, WORLD * PX);
    g.scale(PX, PX);
    if (world.theme.road) {
      g.fillStyle = '#4a4540';
      g.fillRect(-WORLD, 24 - 3.5, WORLD * 2, 7);
    }
    for (const h of world.hazards) {
      g.fillStyle = 'rgba(120,230,60,0.6)';
      g.beginPath();
      g.arc(h.x, h.z, h.r, 0, Math.PI * 2);
      g.fill();
    }
    // arena edge
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    g.stroke();
    // everything you can bump into
    for (const col of world.colliders.list) {
      if (col.top === Infinity && col.hx > 50) continue;
      const tall = col.top - (col.bottom === -Infinity ? 0 : col.bottom);
      g.fillStyle = col.bottom !== -Infinity ? 'rgba(40,30,20,0.35)' : tall > 2.5 ? look[2] : look[1];
      g.save();
      g.translate(col.x, col.z);
      g.rotate(-Math.atan2(col.sin, col.cos));
      g.fillRect(-col.hx, -col.hz, col.hx * 2, col.hz * 2);
      g.restore();
    }
    // ladders
    g.fillStyle = '#ffd34d';
    for (const l of world.ladders) g.fillRect(l.x - 0.6, l.z - 0.6, 1.2, 1.2);
    return c;
  }

  // markers: [{ x, z, color, r, shape }]
  draw(player, markers) {
    const g = this.ctx;
    const S = this.size;
    const half = S / 2;
    const k = half / RANGE;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(half, half, half - 2, 0, Math.PI * 2);
    g.clip();
    g.translate(half, half);
    g.rotate(player.yaw);
    g.scale(k, k);
    g.translate(-player.pos.x, -player.pos.z);
    g.globalAlpha = 0.9;
    g.drawImage(this.base, -WORLD, -WORLD, WORLD * 2, WORLD * 2);
    g.globalAlpha = 1;
    for (const m of markers) {
      const dx = m.x - player.pos.x;
      const dz = m.z - player.pos.z;
      if (dx * dx + dz * dz > (RANGE + 5) * (RANGE + 5)) continue;
      g.fillStyle = m.color;
      const r = (m.r || 2.5) / k;
      g.beginPath();
      if (m.shape === 'diamond') {
        g.moveTo(m.x, m.z - r * 1.3);
        g.lineTo(m.x + r, m.z);
        g.lineTo(m.x, m.z + r * 1.3);
        g.lineTo(m.x - r, m.z);
      } else if (m.shape === 'ring') {
        g.lineWidth = 2 / k;
        g.strokeStyle = m.color;
        g.arc(m.x, m.z, m.r, 0, Math.PI * 2);
        g.stroke();
        continue;
      } else {
        g.arc(m.x, m.z, r, 0, Math.PI * 2);
      }
      g.fill();
    }
    g.restore();

    // player arrow, always pointing up
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(half, half - 8);
    g.lineTo(half + 6, half + 6);
    g.lineTo(half, half + 2);
    g.lineTo(half - 6, half + 6);
    g.closePath();
    g.fill();
    g.stroke();
    // rim
    g.strokeStyle = 'rgba(233,217,184,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(half, half, half - 2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(233,217,184,0.9)';
    g.font = 'bold 11px Rajdhani, sans-serif';
    g.textAlign = 'center';
    // north marker orbits the rim
    const na = Math.atan2(-Math.cos(player.yaw), Math.sin(player.yaw));
    const ny = half + Math.sin(na) * (half - 10);
    const nx = half + Math.cos(na) * (half - 10);
    g.fillText('N', nx, ny + 4);
  }
}
