import * as THREE from 'three';
import { DEFEND_POINTS } from '../shared/modes.js';
import { heightAt } from './terrain.js';

// Defend the Points: the squad holds points A, B and C while the zombie waves try to take them.
// Zombies standing on a point (with nobody there to stop them) drain its bar; at zero the zombies
// have it. Players standing on a point with no zombies on it fill the bar back up, and a lost point
// is retaken once its bar is full again. Players and zombies both on it = contested, nothing moves.
// The host runs this (tick); everyone else mirrors the host's numbers (apply).

const HELD = 0x4fc3ff;
const LOST = 0xff3b30;
const CONTESTED = 0xffd34d;
const ATTACKED = 0xff8a2a;
const CSS = { held: '#4fc3ff', lost: '#ff3b30', contested: '#ffd34d', attacked: '#ff8a2a' };

const DRAIN_PER_ZOMBIE = 3.5; // bar per second for each zombie on the point
const DRAIN_MAX = 14;
const REFILL = 8; // per second while only players are on it
const WEIGHT = { brute: 2, boss: 4 };

function letterSprite(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 92px "Black Ops One", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(letter, 64, 68);
  g.fillStyle = '#ffffff';
  g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.2, 2.2, 1);
  s.renderOrder = 6;
  return s;
}

export class DefendPoints {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.points = [];
    this.active = false;
    this.overrun = false;
    this.onChange = null; // (point, held) when a point is lost or retaken
  }

  start() {
    this.stop();
    this.active = true;
    this.overrun = false;
    this.scene.add(this.group);
    for (const def of DEFEND_POINTS) {
      const y = heightAt(def.x, def.z);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(def.radius - 0.35, def.radius, 56),
        new THREE.MeshBasicMaterial({ color: HELD, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(def.x, y + 0.25, def.z);
      // the filled part of the ring shows how much of the bar is left
      const fill = new THREE.Mesh(
        new THREE.RingGeometry(def.radius - 1.1, def.radius - 0.45, 56, 1, 0, Math.PI * 2),
        new THREE.MeshBasicMaterial({ color: HELD, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(def.x, y + 0.24, def.z);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.55, 30, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: HELD, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
      );
      beam.position.set(def.x, y + 15, def.z);
      const label = letterSprite(def.id);
      label.position.set(def.x, y + 6, def.z);
      this.group.add(ring, fill, beam, label);
      this.points.push({ ...def, y, bar: 100, held: true, contested: false, attacked: false, players: 0, zombies: 0, ring, fill, beam, label, shownBar: -1 });
    }
  }

  stop() {
    this.active = false;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    this.group.clear();
    this.points = [];
  }

  _inside(p, pos) {
    return Math.hypot(pos.x - p.x, pos.z - p.z) < p.radius && pos.y - p.y < 4;
  }

  _setHeld(p, held) {
    if (p.held === held) return;
    p.held = held;
    if (this.onChange) this.onChange(p, held);
  }

  // Host: players = positions of living players, zombies = the zombie list.
  tick(dt, players, zombies) {
    if (!this.active) return;
    for (const p of this.points) {
      p.players = players.filter((pos) => this._inside(p, pos)).length;
      let weight = 0;
      for (const z of zombies) if (z.alive && this._inside(p, z.root.position)) weight += WEIGHT[z.typeId] || 1;
      p.zombies = weight;
      p.contested = p.players > 0 && weight > 0;
      p.attacked = p.players === 0 && weight > 0;
      if (p.attacked) {
        p.bar = Math.max(0, p.bar - Math.min(DRAIN_MAX, DRAIN_PER_ZOMBIE * weight) * dt);
        if (p.bar <= 0) this._setHeld(p, false);
      } else if (p.players > 0 && weight === 0) {
        p.bar = Math.min(100, p.bar + REFILL * dt);
        if (p.bar >= 100) this._setHeld(p, true);
      }
    }
  }

  // Host: a zombie clawing at the point itself takes a bite out of the bar.
  hit(id, dmg) {
    const p = this.points.find((o) => o.id === id);
    if (!p || !p.held) return;
    p.bar = Math.max(0, p.bar - dmg * 0.2);
    if (p.bar <= 0) this._setHeld(p, false);
  }

  get heldCount() {
    return this.points.filter((p) => p.held).length;
  }
  get allLost() {
    return this.active && this.points.length > 0 && this.heldCount === 0;
  }

  // What the zombies go for: every held point, and lost ones the squad is trying to take back.
  targets() {
    if (!this.active) return [];
    return this.points.filter((p) => p.held || p.bar > 0).map((p) => ({ id: `pt:${p.id}`, point: p.id, pos: { x: p.x, y: p.y, z: p.z } }));
  }

  rows() {
    return this.points.map((p) => [Math.round(p.bar), p.held ? 1 : 0, p.contested ? 1 : 0, p.attacked ? 1 : 0]);
  }

  apply(rows) {
    if (!this.active || !Array.isArray(rows)) return;
    rows.forEach((r, i) => {
      const p = this.points[i];
      if (!p || !Array.isArray(r)) return;
      p.bar = Math.max(0, Math.min(100, Number(r[0]) || 0));
      p.contested = !!r[2];
      p.attacked = !!r[3];
      this._setHeld(p, !!r[1]);
    });
  }

  state(p) {
    if (p.contested) return 'contested';
    if (!p.held) return 'lost';
    return p.attacked ? 'attacked' : 'held';
  }

  // per frame: colours, the bar ring, a little pulse when under attack
  update(dt, t) {
    if (!this.active) return;
    for (const p of this.points) {
      const st = this.state(p);
      const col = st === 'contested' ? CONTESTED : st === 'attacked' ? ATTACKED : st === 'held' ? HELD : LOST;
      const flash = st === 'attacked' || st === 'contested' ? 0.5 + 0.5 * Math.sin(t * 10) : 1;
      p.ring.material.color.setHex(col);
      p.ring.material.opacity = 0.5 + 0.35 * flash;
      p.beam.material.color.setHex(col);
      p.fill.material.color.setHex(p.held ? HELD : LOST);
      p.label.material.color.setHex(col);
      p.ring.rotation.z += dt * 0.25;
      const shown = Math.round(p.bar);
      if (shown !== p.shownBar) {
        p.shownBar = shown;
        p.fill.geometry.dispose();
        p.fill.geometry = new THREE.RingGeometry(p.radius - 1.1, p.radius - 0.45, 56, 1, Math.PI / 2, Math.max(0.001, (shown / 100) * Math.PI * 2));
      }
    }
  }

  hudHtml() {
    if (!this.active) return '';
    return `<div class="def-points">${this.points
      .map((p) => {
        const st = this.state(p);
        const word = { held: 'HELD', lost: 'LOST', contested: 'CONTESTED', attacked: 'UNDER ATTACK' }[st];
        return `<div class="def-pt ${st}"><b style="color:${CSS[st]}">${p.id}</b><div class="def-bar"><i style="width:${Math.round(p.bar)}%;background:${p.held ? CSS.held : CSS.lost}"></i></div><span>${word}</span></div>`;
      })
      .join('')}</div>`;
  }

  minimapMarkers() {
    if (!this.active) return [];
    return this.points.map((p) => ({ x: p.x, z: p.z, color: CSS[this.state(p)], r: p.radius, shape: 'ring' }));
  }
}
