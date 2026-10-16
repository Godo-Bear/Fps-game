import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { NavGrid } from './navgrid.js';
import { MODES } from '../shared/modes.js';

// AI bots in PvP matches (normal difficulty). The server adds them as players; the host's game
// moves them (with the same walls and paths the zombies use) and tells the server where they are,
// what they shoot at and what they hit. If the host leaves, the next host's game takes over.
const SPEED = 4.3; // a little slower than a walking player (6)
const RADIUS = 0.4;
const EYE = 1.5;
const SIGHT = 60; // metres they can spot you from
const REACT = 0.55; // seconds after spotting you before they shoot
const KEEP_AWAY = 9; // stop walking in and strafe when this close
const DMG = 15;

const ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _step = { x: 0, z: 0 };

export class Bots {
  constructor() {
    this.state = new Map(); // bot id -> its brain
    this.nav = null;
    this.navMap = null;
    this.sendT = 0;
  }

  reset() {
    this.state.clear();
  }

  // line of sight between two eye points (no walls in the way)
  _see(world, a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len > SIGHT) return false;
    ray.set(a, _dir.normalize());
    ray.far = len;
    return ray.intersectObjects(world.solids, false).length === 0;
  }

  update(dt, { mp, world, player, effects, audio }) {
    if (!mp.inMatch || !mp.isHost() || !mp.lobby) {
      if (this.state.size) this.reset();
      return;
    }
    const mode = MODES[mp.mode];
    if (!mode || mode.coop || mode.infection) return;
    const bots = mp.lobby.players.filter((p) => p.bot);
    if (!bots.length) {
      this.state.clear();
      return;
    }
    // a walking grid for this map (bigger cells than the zombies': cheap to flood per bot)
    if (this.navMap !== world) {
      this.nav = new NavGrid(world.colliders, { cell: 1, radius: RADIUS });
      this.navMap = world;
      this.state.clear();
    }
    const teamOf = (id) => mp.lobby.players.find((p) => p.id === id)?.team;
    // everyone a bot could shoot: me, other people and other bots
    const people = [];
    if (!(mp.myHp <= 0)) people.push({ id: mp.myId, pos: player.pos, team: mp.myTeam, moving: player.vel ? Math.hypot(player.vel.x, player.vel.z) > 1 : false });
    for (const [id, a] of mp.avatars) {
      if (!a.alive) continue;
      const own = this.state.get(id);
      people.push({ id, pos: own?.alive ? own.pos : a.target, team: teamOf(id), moving: true });
    }
    const now = performance.now() / 1000;
    const rows = [];
    for (const info of bots) {
      const av = mp.avatars.get(info.id);
      let b = this.state.get(info.id);
      if (!b) {
        b = { pos: new THREE.Vector3(), yaw: 0, alive: false, target: null, seenFor: 0, nextShot: 0, burst: 0, strafe: 1, strafeT: 0, pathT: 0, dist: null, lastTarget: -1 };
        this.state.set(info.id, b);
      }
      if (!av || !av.alive) {
        b.alive = false;
        continue;
      }
      if (!b.alive) {
        // (re)spawned: start where the server put them
        b.alive = true;
        b.pos.copy(av.target);
        b.target = null;
        b.seenFor = 0;
      }
      // who to go for: the closest enemy we can see, or else the closest one at all
      const enemies = people.filter((o) => o.id !== info.id && (!mp.teams || o.team !== info.team));
      _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
      let best = null;
      let bestScore = Infinity;
      for (const o of enemies) {
        const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
        _to.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
        const seen = d < SIGHT && this._see(world, _from, _to);
        const score = d - (seen ? 1000 : 0) - (o.id === b.lastTarget ? 8 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { ...o, d, seen };
        }
      }
      const t = best;
      if (t && t.id !== b.lastTarget) b.seenFor = 0;
      b.lastTarget = t ? t.id : -1;
      if (t?.seen) b.seenFor += dt;
      else b.seenFor = Math.max(0, b.seenFor - dt * 2);

      // gun game's last gun is the knife; everyone else shoots
      const knifeOnly = mode.gungame && av.level >= mp.ladder.length - 1;
      const gun = mode.gungame ? mp.ladder[Math.min(av.level || 0, mp.ladder.length - 1)] : mode.oitc ? 'revolver' : mode.jugg && mp.jugg === info.id ? 'lmg' : 'rifle';

      // ---- moving
      let mx = 0;
      let mz = 0;
      if (t) {
        const close = t.seen && t.d < (knifeOnly ? 1.6 : KEEP_AWAY);
        if (close && !knifeOnly) {
          // strafe side to side while shooting
          b.strafeT -= dt;
          if (b.strafeT <= 0) {
            b.strafe = Math.random() < 0.5 ? -1 : 1;
            b.strafeT = 0.8 + Math.random() * 1.4;
          }
          const dx = (t.pos.x - b.pos.x) / (t.d || 1);
          const dz = (t.pos.z - b.pos.z) / (t.d || 1);
          mx = -dz * b.strafe - (t.d < 5 ? dx * 0.6 : 0);
          mz = dx * b.strafe - (t.d < 5 ? dz * 0.6 : 0);
        } else if (t.seen && t.d < 25) {
          // straight at them
          mx = (t.pos.x - b.pos.x) / (t.d || 1);
          mz = (t.pos.z - b.pos.z) / (t.d || 1);
        } else {
          // round the walls: our own flood from where they are, refreshed now and then
          b.pathT -= dt;
          if (!b.dist || b.pathT <= 0) {
            b.dist = b.dist || new Uint16Array(this.nav.dist.length);
            this.nav.dist = b.dist;
            this.nav.target = -1;
            this.nav.update([t.pos]);
            b.pathT = 0.8 + Math.random() * 0.4;
          }
          this.nav.dist = b.dist;
          if (this.nav.direction(b.pos.x, b.pos.z, _step)) {
            mx = _step.x;
            mz = _step.z;
          }
        }
      }
      const len = Math.hypot(mx, mz);
      const speed = SPEED * (mode.jugg && mp.jugg === info.id ? 0.8 : 1);
      if (len > 0.01) {
        b.pos.x += (mx / len) * speed * dt;
        b.pos.z += (mz / len) * speed * dt;
      }
      world.colliders.resolve(b.pos, RADIUS, b.pos.y);
      const floor = world.colliders.floorAt(b.pos.x, b.pos.z, RADIUS, b.pos.y);
      b.pos.y = Math.max(heightAt(b.pos.x, b.pos.z), floor);

      // ---- facing and shooting
      let pitch = 0;
      if (t) {
        const want = Math.atan2(b.pos.x - t.pos.x, b.pos.z - t.pos.z);
        let diff = want - b.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        b.yaw += diff * Math.min(1, dt * 8);
        pitch = Math.atan2(t.pos.y - b.pos.y, t.d || 1);
      } else if (len > 0.01) b.yaw = Math.atan2(-mx, -mz);
      if (t?.seen && b.seenFor > REACT && now >= b.nextShot) {
        if (knifeOnly) {
          if (t.d < 2.2) {
            mp.send({ t: 'bhit', b: info.id, id: t.id, dmg: 55, melee: true });
            b.nextShot = now + 0.8;
          }
        } else {
          // bursts of 3-5 shots, then a short pause; hit chance drops with distance
          const chance = Math.max(0.12, (mode.oitc ? 0.32 : 0.46) - t.d * 0.007 - (t.moving ? 0.06 : 0));
          const hit = Math.random() < chance;
          _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
          _to.set(t.pos.x + (hit ? 0 : (Math.random() - 0.5) * 2.5), t.pos.y + 1.1 + (hit ? 0 : (Math.random() - 0.3) * 1.5), t.pos.z + (hit ? 0 : (Math.random() - 0.5) * 2.5));
          const r = (v) => Math.round(v * 100) / 100;
          mp.send({ t: 'bshot', b: info.id, o: [r(_from.x), r(_from.y), r(_from.z)], e: [r(_to.x), r(_to.y), r(_to.z)] });
          // the host sees its own bots' tracers (the server sends them to everyone else)
          effects.tracer(_from.clone(), _to.clone());
          audio.shot(gun === 'revolver' ? 'revolver' : 'rifle', false, _from.clone());
          if (hit) {
            const head = Math.random() < 0.12;
            mp.send({ t: 'bhit', b: info.id, id: t.id, dmg: head ? DMG * 1.6 : DMG, head });
          }
          if (mode.oitc) b.nextShot = now + 1.4 + Math.random();
          else if (--b.burst > 0) b.nextShot = now + 0.13;
          else {
            b.burst = 3 + Math.floor(Math.random() * 3);
            b.nextShot = now + 0.45 + Math.random() * 0.5;
          }
        }
      }
      rows.push([info.id, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(3), +pitch.toFixed(3), knifeOnly ? 'knife' : gun, 0]);
    }
    this.sendT -= dt;
    if (rows.length && this.sendT <= 0) {
      this.sendT = 0.1;
      mp.send({ t: 'bs', b: rows });
    }
  }
}
