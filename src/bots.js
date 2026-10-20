import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { NavGrid } from './navgrid.js';
import { INFECTED, MODES } from '../shared/modes.js';

// AI bots in every multiplayer mode but the admin's event (normal difficulty): PvP, squadmates in the zombie
// modes, zombies in infection, and hiders and seekers in hide and seek. The server adds them as players; the host's game
// moves them (with the same walls and paths the zombies use) and tells the server where they are,
// what they shoot at and what they hit. If the host leaves, the next host's game takes over.
const SPEED = 4.3; // a little slower than a walking player (6)
const RADIUS = 0.4;
const EYE = 1.5;
const SIGHT = 60; // metres they can spot you from
const REACT = 0.55; // seconds after spotting you before they shoot
const KEEP_AWAY = 9; // stop walking in and strafe when this close
const DMG = 15;
const THINK = 0.2; // seconds between a bot looking round for who to go for (line-of-sight checks are the slow part)
const MAX_LOOKS = 4; // walls checked per look: the nearest few enemies only
const PATH_EVERY = 1.5; // seconds between route refreshes, shared by every bot after the same person

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
    this.paths = new Map(); // target id -> { dist, t }: one route flood per person being chased, shared by the bots after them
  }

  reset() {
    this.state.clear();
    this.paths.clear();
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

  update(dt, ctx) {
    const { mp, world, player, effects, audio } = ctx;
    if (!mp.inMatch || !mp.isHost() || !mp.lobby) {
      if (this.state.size) this.reset();
      return;
    }
    const mode = MODES[mp.mode];
    if (!mode || mode.event) return;
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
      this.paths.clear();
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
        // thinkT starts at a random point so the bots don't all look round on the same frame
        b = { pos: new THREE.Vector3(), yaw: 0, alive: false, target: null, seenFor: 0, nextShot: 0, burst: 0, strafe: 1, strafeT: 0, thinkT: Math.random() * THINK, seen: false, lastTarget: -1 };
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
        b.spot = null;
        b.hp = 100;
      }
      // the zombie modes and hide and seek have their own brains
      const own = mode.coop ? this._squad(b, info, dt, now, ctx, people) : mode.hns ? (info.team === INFECTED ? this._seeker(b, info, dt, now, ctx, people) : this._hider(b, info, dt, now, ctx, people)) : null;
      if (own) {
        this._finish(b, info, av, own, dt, world, rows);
        continue;
      }
      // who to go for: the closest enemy we can see, or else the closest one at all.
      // Looking round is the expensive bit, so it happens a few times a second, not every frame.
      const enemies = people.filter((o) => o.id !== info.id && (!mp.teams || o.team !== info.team));
      b.thinkT -= dt;
      if (b.thinkT <= 0 || !enemies.some((o) => o.id === b.lastTarget)) {
        b.thinkT = THINK;
        _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
        const byDist = enemies.map((o) => ({ o, d: Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) })).sort((x, y) => x.d - y.d);
        let pick = null;
        let looks = 0;
        // the nearest one we can see
        for (const { o, d } of byDist) {
          if (d > SIGHT || looks >= MAX_LOOKS) break;
          looks++;
          _to.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
          if (this._see(world, _from, _to)) {
            pick = { id: o.id, d, seen: true };
            break;
          }
        }
        if (!pick && byDist.length) pick = { id: byDist[0].o.id, d: byDist[0].d, seen: false };
        b.target = pick ? pick.id : null;
        b.seen = !!pick?.seen;
      }
      const tp = b.target !== null ? enemies.find((o) => o.id === b.target) : null;
      const t = tp ? { ...tp, d: Math.hypot(tp.pos.x - b.pos.x, tp.pos.z - b.pos.z), seen: b.seen } : null;
      if (t && t.id !== b.lastTarget) b.seenFor = 0;
      b.lastTarget = t ? t.id : -1;
      if (t?.seen) b.seenFor += dt;
      else b.seenFor = Math.max(0, b.seenFor - dt * 2);

      // gun game's last gun is the knife, infection zombies only have claws; everyone else shoots
      const knifeOnly = (mode.gungame && av.level >= mp.ladder.length - 1) || (mode.infection && info.team === INFECTED);
      const gun = knifeOnly ? 'knife' : mode.gungame ? mp.ladder[Math.min(av.level || 0, mp.ladder.length - 1)] : mode.oitc ? 'revolver' : mode.jugg && mp.jugg === info.id ? 'lmg' : 'rifle';

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
          // round the walls: a flood from where they are, refreshed now and then and shared by every bot after them
          let path = this.paths.get(t.id);
          if (!path || now - path.t > PATH_EVERY) {
            path = path || { dist: new Uint16Array(this.nav.dist.length), t: 0 };
            this.nav.dist = path.dist;
            this.nav.target = -1;
            this.nav.update([t.pos]);
            path.t = now;
            this.paths.set(t.id, path);
          }
          this.nav.dist = path.dist;
          if (this.nav.direction(b.pos.x, b.pos.z, _step)) {
            mx = _step.x;
            mz = _step.z;
          }
        }
      }
      const len = Math.hypot(mx, mz);
      const speed = SPEED * (mode.jugg && mp.jugg === info.id ? 0.8 : 1) * (mode.infection && info.team === INFECTED ? 1.2 : 1);
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
            mp.send({ t: 'bhit', b: info.id, id: t.id, dmg: mode.infection ? 60 : 55, melee: true });
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
      // this game moves them, so show them right where they are (not where the server last heard they were)
      av.localBot = true;
      av.target.copy(b.pos);
      av.targetYaw = b.yaw;
      av.pitch = pitch;
      rows.push([info.id, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(3), +pitch.toFixed(3), knifeOnly ? 'knife' : gun, 0]);
    }
    this.sendT -= dt;
    if (rows.length && this.sendT <= 0) {
      this.sendT = 1 / 15; // as often as real players send theirs, so they move as smoothly for everyone else
      mp.send({ t: 'bs', b: rows });
    }
  }

  // the zombie modes: a zombie got a squadmate bot (this game runs the zombies and the bots)
  hurt(id, dmg, mp) {
    const b = this.state.get(id);
    if (!b?.alive || b.hp <= 0) return;
    b.hp -= dmg;
    if (b.hp <= 0) mp.send({ t: 'bdown', b: id });
  }

  // ---- shared bits for the mode brains
  // a route to (x, z) round the walls; key: who shares it (the same goal, the same flood)
  _route(key, x, z, now, b, out) {
    let path = this.paths.get(key);
    if (!path || now - path.t > PATH_EVERY) {
      path = path || { dist: new Uint16Array(this.nav.dist.length), t: 0 };
      this.nav.dist = path.dist;
      this.nav.target = -1;
      this.nav.update([{ x, z }]);
      path.t = now;
      this.paths.set(key, path);
    }
    this.nav.dist = path.dist;
    return this.nav.direction(b.pos.x, b.pos.z, out);
  }
  // walk towards (x, z): straight when it's close and in sight, else round the walls
  _walkTo(key, x, z, now, b, world) {
    const d = Math.hypot(x - b.pos.x, z - b.pos.z);
    if (d < 0.6) return [0, 0];
    if (d < 6) return [(x - b.pos.x) / d, (z - b.pos.z) / d];
    if (this._route(key, x, z, now, b, _step)) return [_step.x, _step.z];
    return [(x - b.pos.x) / d, (z - b.pos.z) / d];
  }
  // moves the bot, faces it, and queues what everyone else sees
  _finish(b, info, av, c, dt, world, rows) {
    const len = Math.hypot(c.mx, c.mz);
    if (len > 0.01) {
      b.pos.x += (c.mx / len) * c.speed * dt;
      b.pos.z += (c.mz / len) * c.speed * dt;
    }
    world.colliders.resolve(b.pos, RADIUS, b.pos.y);
    const floor = world.colliders.floorAt(b.pos.x, b.pos.z, RADIUS, b.pos.y);
    b.pos.y = Math.max(heightAt(b.pos.x, b.pos.z), floor);
    let pitch = 0;
    if (c.face) {
      const want = Math.atan2(b.pos.x - c.face.x, b.pos.z - c.face.z);
      let diff = want - b.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      b.yaw += diff * Math.min(1, dt * 8);
      pitch = Math.atan2((c.face.y ?? b.pos.y) - b.pos.y, Math.hypot(c.face.x - b.pos.x, c.face.z - b.pos.z) || 1);
    } else if (len > 0.01) b.yaw = Math.atan2(-c.mx, -c.mz);
    av.localBot = true;
    av.target.copy(b.pos);
    av.targetYaw = b.yaw;
    av.pitch = pitch;
    rows.push([info.id, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(3), +pitch.toFixed(3), c.gun, c.flags || 0]);
  }

  // ---- the zombie modes: a squadmate who sticks with the nearest person and shoots the zombies
  _squad(b, info, dt, now, { mp, world, zombies, hitZombie, effects, audio }, people) {
    const out = { mx: 0, mz: 0, speed: SPEED * 1.1, gun: 'rifle', face: null };
    b.thinkT -= dt;
    const list = zombies?.list || [];
    if (b.thinkT <= 0 || !b.zt?.alive) {
      b.thinkT = THINK;
      _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
      b.zt = null;
      const near = list.filter((z) => z.alive).map((z) => ({ z, d: Math.hypot(z.root.position.x - b.pos.x, z.root.position.z - b.pos.z) })).filter((o) => o.d < 40).sort((x, y) => x.d - y.d);
      let looks = 0;
      for (const { z } of near) {
        if (looks++ >= MAX_LOOKS) break;
        _to.set(z.root.position.x, z.centerY, z.root.position.z);
        if (this._see(world, _from, _to)) {
          b.zt = z;
          break;
        }
      }
    }
    const z = b.zt?.alive ? b.zt : null;
    // the nearest real person to stay with
    const humans = new Set(mp.lobby.players.filter((p) => !p.bot).map((p) => p.id));
    let lead = null;
    let ld = Infinity;
    for (const o of people) {
      if (!humans.has(o.id)) continue;
      const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
      if (d < ld) {
        ld = d;
        lead = o;
      }
    }
    if (z) {
      const zd = Math.hypot(z.root.position.x - b.pos.x, z.root.position.z - b.pos.z);
      out.face = { x: z.root.position.x, y: z.centerY - EYE, z: z.root.position.z };
      if (zd < 6) {
        // too close: back off
        out.mx = (b.pos.x - z.root.position.x) / (zd || 1);
        out.mz = (b.pos.z - z.root.position.z) / (zd || 1);
      }
      if (!b.seenZ) b.seenZ = now;
      if (now - b.seenZ > REACT && now >= b.nextShot) {
        const hit = Math.random() < Math.max(0.25, 0.6 - zd * 0.008);
        _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
        _to.set(z.root.position.x + (hit ? 0 : (Math.random() - 0.5) * 2), z.centerY + (hit ? 0 : (Math.random() - 0.3)), z.root.position.z + (hit ? 0 : (Math.random() - 0.5) * 2));
        const r = (v) => Math.round(v * 100) / 100;
        mp.send({ t: 'bshot', b: info.id, o: [r(_from.x), r(_from.y), r(_from.z)], e: [r(_to.x), r(_to.y), r(_to.z)] });
        effects.tracer(_from.clone(), _to.clone());
        audio.shot('rifle', false, _from.clone());
        if (hit) hitZombie?.(z, DMG * 1.3, _to.clone());
        if (--b.burst > 0) b.nextShot = now + 0.13;
        else {
          b.burst = 3 + Math.floor(Math.random() * 3);
          b.nextShot = now + 0.4 + Math.random() * 0.4;
        }
      }
    } else b.seenZ = 0;
    if (lead && !out.mx && !out.mz && ld > 7) [out.mx, out.mz] = this._walkTo(`p${lead.id}`, lead.pos.x, lead.pos.z, now, b, world);
    return out;
  }

  // ---- hide and seek: a hider finds a hiding place, crouches there, and runs for another if a seeker sees them
  _hider(b, info, dt, now, { mp, world }, people) {
    const out = { mx: 0, mz: 0, speed: SPEED * 1.15, gun: 'knife', face: null, flags: 0 };
    const spots = world.hideSpots || [];
    const seekers = people.filter((o) => o.team === INFECTED);
    // spotted? (a seeker close by who can see us)
    b.thinkT -= dt;
    if (b.thinkT <= 0) {
      b.thinkT = THINK * 2;
      _from.set(b.pos.x, b.pos.y + 1, b.pos.z);
      b.threat = null;
      for (const o of seekers) {
        if (Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) > 14) continue;
        _to.set(o.pos.x, o.pos.y + EYE, o.pos.z);
        if (this._see(world, _from, _to)) {
          b.threat = o;
          break;
        }
      }
    }
    const pickSpot = (awayFrom) => {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 10 && spots.length; i++) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        const far = awayFrom ? Math.hypot(s.x - awayFrom.x, s.z - awayFrom.z) : 0;
        const walk = Math.hypot(s.x - b.pos.x, s.z - b.pos.z);
        const taken = people.some((o) => o.id !== info.id && Math.hypot(o.pos.x - s.x, o.pos.z - s.z) < 2);
        const score = far - walk * 0.3 - (taken ? 50 : 0) + Math.random() * 10;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      return best;
    };
    if (b.threat && (!b.fleeing || now - b.fleeing > 4)) {
      b.spot = pickSpot(b.threat.pos);
      b.fleeing = now;
    }
    if (!b.spot) b.spot = pickSpot(seekers[0]?.pos);
    if (!b.spot) return out;
    const d = Math.hypot(b.spot.x - b.pos.x, b.spot.z - b.pos.z);
    if (d > 0.8) [out.mx, out.mz] = this._walkTo(`h${info.id}`, b.spot.x, b.spot.z, now, b, world);
    else out.flags = 1; // there: crouch down and keep still
    if (d > 0.8 && !b.threat) out.speed = SPEED;
    return out;
  }

  // ---- hide and seek: a seeker counts, then searches the hiding places and chases anyone they actually see
  _seeker(b, info, dt, now, { mp, world }, people) {
    const out = { mx: 0, mz: 0, speed: SPEED * 1.2, gun: 'knife', face: null };
    if (mp.countdown > 0) return out; // eyes shut
    const spots = world.hideSpots || [];
    const hiders = people.filter((o) => o.team !== INFECTED);
    b.thinkT -= dt;
    if (b.thinkT <= 0 || !hiders.some((o) => o.id === b.chase?.id)) {
      b.thinkT = THINK;
      _from.set(b.pos.x, b.pos.y + EYE, b.pos.z);
      b.chase = null;
      const near = hiders.map((o) => ({ o, d: Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) })).filter((x) => x.d < 26).sort((x, y) => x.d - y.d);
      let looks = 0;
      for (const { o, d } of near) {
        if (looks++ >= MAX_LOOKS) break;
        // crouched in a bush: only spotted up close
        if (d > 7 && Math.random() < 0.5) continue;
        _to.set(o.pos.x, o.pos.y + 0.8, o.pos.z);
        if (this._see(world, _from, _to)) {
          b.chase = o;
          b.lastSeen = { x: o.pos.x, z: o.pos.z, t: now };
          break;
        }
      }
    }
    const c = b.chase ? hiders.find((o) => o.id === b.chase.id) : null;
    if (c) {
      const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
      out.face = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
      [out.mx, out.mz] = d < 1.2 ? [0, 0] : this._walkTo(`p${c.id}`, c.pos.x, c.pos.z, now, b, world);
      if (d < 2.2 && now >= b.nextShot) {
        mp.send({ t: 'bhit', b: info.id, id: c.id, dmg: 50, melee: true });
        b.nextShot = now + 0.8;
      }
      return out;
    }
    // nobody in sight: check where we last saw someone, then the hiding places one by one
    if (b.lastSeen && now - b.lastSeen.t < 8) {
      b.wp = b.lastSeen;
      b.lastSeen = null;
    }
    if (!b.wp || Math.hypot(b.wp.x - b.pos.x, b.wp.z - b.pos.z) < 1.5 || now - (b.wpAt || 0) > 25) {
      b.wp = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: (Math.random() - 0.5) * 150, z: (Math.random() - 0.5) * 150 };
      b.wpAt = now;
    }
    [out.mx, out.mz] = this._walkTo(`w${info.id}`, b.wp.x, b.wp.z, now, b, world);
    out.speed = SPEED;
    return out;
  }
}
