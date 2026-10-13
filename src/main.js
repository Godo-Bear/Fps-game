import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { Effects } from './effects.js';
import { GUNS, TIER_CSS } from './guns.js';
import { GunPickups } from './pickups.js';
import { Player } from './player.js';
import { POWERUPS, RARITY_ODDS, RARITY_RANK, baseStats, rollOffer } from './powerups.js';
import { heightAt } from './terrain.js';
import { Weapon } from './weapon.js';
import { buildWorld } from './world.js';
import { ZombieManager } from './zombies.js';

// ---------------------------------------------------------------- setup
const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1500);
scene.add(camera);

const audio = new GameAudio();
const world = buildWorld(scene);
const effects = new Effects(scene);
const zombies = new ZombieManager(scene, world, effects, audio);
const player = new Player(camera);
const weapon = new Weapon(camera, audio);
weapon.resize(camera.aspect);
const pickups = new GunPickups(scene, world);

let stats = baseStats();
weapon.reset(stats);
weapon.onDrop = (def) => subBanner(`${def.name} is out of ammo`, 1.8);
const projectiles = [];
const owned = new Map();
const medkits = [];

const game = {
  state: 'menu', // menu | playing | paused | choosing | gameover
  phase: 'countdown', // countdown | active | cleared
  wave: 0,
  kills: 0,
  headshots: 0,
  score: 0,
  timer: 0,
  toSpawn: 0,
  bossToSpawn: 0,
  spawnT: 0,
  cfg: null,
  offer: [],
  best: loadBest(),
};

let trigger = false;
let pressed = false; // a fresh left click this frame (semi-auto guns)
let aim = false; // right mouse held
let time = 0;
let hitT = 0;
let vignette = 0;
let explosionSoundT = 0;

function loadBest() {
  try {
    return Number(localStorage.getItem('deadplains.best') || 0);
  } catch {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem('deadplains.best', String(v));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------- waves
function waveConfig(n) {
  return {
    total: 6 + n * 4 + Math.floor(n * n * 0.15),
    maxAlive: Math.min(10 + n * 2, 42),
    interval: Math.max(0.3, 1.3 - n * 0.07),
    boss: n % 5 === 0 ? 1 + Math.floor(n / 10) : 0,
  };
}

function pickType(n) {
  const brute = n >= 4 ? Math.min(0.14, 0.04 + (n - 4) * 0.015) : 0;
  const runner = n >= 2 ? Math.min(0.38, 0.12 + (n - 2) * 0.03) : 0;
  const r = Math.random();
  if (r < brute) return 'brute';
  if (r < brute + runner) return 'runner';
  return 'walker';
}

function beginWave() {
  game.wave++;
  game.cfg = waveConfig(game.wave);
  game.toSpawn = game.cfg.total;
  game.bossToSpawn = game.cfg.boss;
  game.spawnT = 0.5;
  game.phase = 'active';
  banner(`WAVE ${game.wave}`, game.cfg.boss ? 'An Abomination approaches…' : 'Survive', game.cfg.boss ? 'red' : '', 2.6);
  audio.waveStart();
}

function updateWave(dt) {
  if (game.phase === 'countdown') {
    const before = Math.ceil(game.timer);
    game.timer -= dt;
    const after = Math.ceil(game.timer);
    if (after !== before && after > 0 && game.wave > 0) subBanner(`Next wave in ${after}`, 1.1);
    if (game.timer <= 0) beginWave();
    return;
  }
  if (game.phase === 'active') {
    const cfg = game.cfg;
    game.spawnT -= dt;
    const alive = zombies.aliveCount;
    if (game.spawnT <= 0 && game.toSpawn > 0 && alive < cfg.maxAlive) {
      zombies.spawn(pickType(game.wave), game.wave, player.pos);
      game.toSpawn--;
      game.spawnT = cfg.interval * (0.5 + Math.random());
    }
    if (game.bossToSpawn > 0 && cfg.total - game.toSpawn >= cfg.total * 0.3) {
      zombies.spawn('boss', game.wave, player.pos);
      game.bossToSpawn--;
      banner('ABOMINATION', 'Aim for the head', 'red', 2.2);
    }
    if (game.toSpawn === 0 && game.bossToSpawn === 0 && zombies.aliveCount === 0) {
      game.phase = 'cleared';
      game.timer = 2.4;
      const bonus = 50 * game.wave;
      game.score += bonus;
      player.heal(20, stats.maxHealth);
      const before = pickups.items.length;
      pickups.topUp(Math.min(9, 4 + Math.floor(game.wave / 2)), player.pos);
      const dropped = pickups.items.length > before ? ' · new guns dropped' : '';
      banner(`WAVE ${game.wave} CLEARED`, `+${bonus} score · +20 HP${dropped}`, 'gold', 2.3);
      audio.waveCleared();
    }
    return;
  }
  if (game.phase === 'cleared') {
    game.timer -= dt;
    if (game.timer <= 0) openChoice();
  }
}

// ---------------------------------------------------------------- shooting
const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function terrainHit(origin, dir, far) {
  if (dir.y >= 0) return Infinity;
  let prevT = 0;
  for (let t = 0.5; t <= far; t += 0.5) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    if (y < heightAt(x, z)) return (prevT + t) / 2;
    prevT = t;
  }
  return Infinity;
}

function fireShot(moving, speed) {
  const def = weapon.def;
  audio.shot(def.sound, stats.explosive > 0);
  player.addRecoil(def.recoil * (1 - weapon.ads * 0.4));
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  camera.getWorldPosition(_origin);
  weapon.muzzleWorld(_muzzle);
  const aimed = weapon.ads;
  const gunSpread = def.hipSpread !== undefined ? def.hipSpread + (def.spread - def.hipSpread) * aimed : def.spread * (def.pellets > 1 ? 1 : 1 - aimed * 0.6);
  const moveSpread = (moving ? 0.006 + speed * 0.0012 : 0) * (1 - aimed * 0.5) + (player.onGround ? 0 : 0.02);
  const pellets = def.pellets * stats.multishot;
  for (let i = 0; i < pellets; i++) {
    const spread = gunSpread + moveSpread + (def.pellets === 1 && i > 0 ? 0.02 : 0);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    const d = _dir.clone().addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    if (def.projectile) launchGrenade(d);
    else traceBullet(_origin, d, i === 0);
  }
}

let hitSoundPlayed = false;
function traceBullet(origin, dir, primary) {
  const def = weapon.def;
  const far = 260;
  raycaster.set(origin, dir);
  raycaster.far = far;
  const hits = raycaster.intersectObjects(zombies.parts.concat(world.solids), false);
  const groundT = terrainHit(origin, dir, far);
  let pierceLeft = stats.pierce + (def.pierce || 0);
  const struck = new Set();
  let end = null;
  let impact = false;
  for (const h of hits) {
    if (h.distance > groundT) break;
    const z = h.object.userData.zombie;
    if (z) {
      if (struck.has(z) || !z.alive) continue;
      struck.add(z);
      hitZombie(z, h.object.userData.kind === 'head', h.point, dir, h.distance);
      impact = true;
      if (pierceLeft-- <= 0) {
        end = h.point.clone();
        break;
      }
    } else {
      end = h.point.clone();
      impact = true;
      effects.dust(end);
      effects.sparks(end);
      break;
    }
  }
  if (!end && groundT < far) {
    end = origin.clone().addScaledVector(dir, groundT);
    impact = true;
    effects.dust(end);
  }
  if (!end) end = origin.clone().addScaledVector(dir, 120);
  // explosive rounds: one blast per trigger pull, so shotguns don't nuke everything
  if (stats.explosive > 0 && impact && primary) explodeAt(end, 2.6 + (stats.explosive - 1) * 0.9, weapon.damage(stats) * 0.6 * Math.max(1, def.pellets / 3));
  if (!weapon.scoped) effects.tracer(_muzzle, end);
}

function hitZombie(z, head, point, dir, distance = 0) {
  const def = weapon.def;
  let dmg = weapon.damage(stats);
  if (def.falloff) {
    const [near, far] = def.falloff;
    dmg *= Math.max(0.25, 1 - Math.max(0, distance - near) / (far - near));
  }
  const crit = Math.random() < stats.critChance;
  if (head) dmg *= stats.headshotMul;
  if (crit) dmg *= 2.5;
  effects.blood(point, dir, head ? 1.8 : def.pellets > 1 ? 0.5 : 1);
  const killed = zombies.damage(z, dmg, { slow: stats.slow });
  if (!killed && z.typeId !== 'boss') zombies.knockback(z, player.pos, (z.typeId === 'brute' ? 0.02 : 0.06) * (def.pellets > 1 ? 0.5 : 1));
  if (!hitSoundPlayed) {
    audio.hit(head || crit);
    hitSoundPlayed = true;
  }
  showHit(killed ? 'kill' : head || crit ? 'head' : '');
  if (killed) onKill(z, head);
}

function explodeAt(point, radius, dmg) {
  effects.explosion(point, radius / 2.6);
  if (explosionSoundT <= 0) {
    audio.explosion(point);
    explosionSoundT = 0.09;
  }
  for (const z of zombies.list) {
    if (!z.alive) continue;
    const p = z.root.position;
    const d = Math.hypot(p.x - point.x, p.y + z.type.scale - point.y, p.z - point.z);
    if (d > radius + z.radius) continue;
    const fall = 1 - Math.min(1, d / (radius + z.radius)) * 0.5;
    if (zombies.damage(z, dmg * fall, { slow: stats.slow })) onKill(z, false);
    else showHit('');
  }
}

// ---------------------------------------------------------------- grenades
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
grenadeGeo.scale(1, 1, 1.6);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4a5530, roughness: 0.6, emissive: 0x2a1500 });
const _step = new THREE.Vector3();
function launchGrenade(dir) {
  const def = weapon.def;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(_muzzle);
  scene.add(mesh);
  const vel = dir.clone().multiplyScalar(def.projectile.speed);
  vel.y += 1.5;
  projectiles.push({
    mesh, vel, life: 6,
    radius: def.projectile.radius, gravity: def.projectile.gravity,
    damage: def.damage * stats.damageMul,
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.vel.y -= p.gravity * dt;
    _step.copy(p.vel).multiplyScalar(dt);
    const len = _step.length();
    const pos = p.mesh.position;
    raycaster.set(pos, _step.clone().normalize());
    raycaster.far = len;
    const hit = raycaster.intersectObjects(zombies.parts.concat(world.solids), false)[0];
    let at = hit ? hit.point : null;
    if (!at) {
      const nx = pos.x + _step.x;
      const nz = pos.z + _step.z;
      if (pos.y + _step.y < heightAt(nx, nz)) at = new THREE.Vector3(nx, heightAt(nx, nz) + 0.1, nz);
    }
    if (at || p.life <= 0) {
      explodeAt(at || pos, p.radius, p.damage);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    pos.add(_step);
    p.mesh.lookAt(pos.x + p.vel.x, pos.y + p.vel.y, pos.z + p.vel.z);
    if (Math.random() < 0.6) effects.burst(pos, { count: 1, color: [0x8a8070, 0x6a645a], speed: 0.4, size: 0.12, life: 0.5, grav: -1, up: 0.5 });
  }
}

function clearProjectiles() {
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
}

function onPickGun(id) {
  const def = GUNS[id];
  const result = weapon.give(id, stats);
  audio.pickup();
  subBanner(result === 'new' ? `Picked up ${def.name}` : `+ammo for ${def.name}`, 1.8);
  return true;
}

function onKill(z, head) {
  game.kills++;
  if (head) game.headshots++;
  game.score += Math.round(z.type.score * (head ? 1.5 : 1) * (1 + game.wave * 0.1));
  if (stats.healOnKill) player.heal(stats.healOnKill, stats.maxHealth);
  audio.kill();
  const center = z.root.position.clone();
  center.y += z.type.scale * 1.2;
  effects.blood(center, null, 2.5);
  const chance = { walker: 0.05, runner: 0.05, brute: 0.35, boss: 1 }[z.typeId];
  if (Math.random() < chance) dropMedkit(z.root.position);
}

function onPlayerHit(z, dmg) {
  if (game.state !== 'playing') return;
  player.health -= dmg * (1 - stats.armor);
  vignette = Math.min(1, vignette + 0.6);
  player.shake = Math.min(1, player.shake + 0.45);
  audio.hurt();
  if (player.health > 0) return;
  if (stats.secondWind > 0) {
    stats.secondWind--;
    removeOwned('secondwind');
    player.health = stats.maxHealth;
    effects.explosion(player.pos.clone().setY(player.pos.y + 1), 3);
    for (const o of zombies.list) {
      if (!o.alive) continue;
      const d = o.root.position.distanceTo(player.pos);
      if (d < 12) {
        zombies.knockback(o, player.pos, 6);
        if (zombies.damage(o, 400)) onKill(o, false);
      }
    }
    audio.revive();
    banner('SECOND WIND', 'You cheated death', 'gold', 2);
    return;
  }
  gameOver();
}

// ---------------------------------------------------------------- medkits
const medGeo = new THREE.BoxGeometry(0.55, 0.32, 0.4);
const medMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6, emissive: 0x222222 });
const crossMat = new THREE.MeshBasicMaterial({ color: 0xd42a1f });
function dropMedkit(pos) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(medGeo, medMat));
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.33, 0.09), crossMat);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.33, 0.3), crossMat);
  g.add(c1, c2);
  g.position.set(pos.x, heightAt(pos.x, pos.z) + 0.5, pos.z);
  scene.add(g);
  medkits.push({ g, t: 0 });
}
function updateMedkits(dt) {
  for (let i = medkits.length - 1; i >= 0; i--) {
    const m = medkits[i];
    m.t += dt;
    m.g.rotation.y += dt * 2;
    m.g.position.y = heightAt(m.g.position.x, m.g.position.z) + 0.5 + Math.sin(m.t * 3) * 0.1;
    m.g.visible = m.t < 20 || Math.sin(m.t * 20) > 0;
    const d = Math.hypot(m.g.position.x - player.pos.x, m.g.position.z - player.pos.z);
    const take = d < 1.6 && player.health < stats.maxHealth;
    if (take || m.t > 25) {
      if (take) {
        player.heal(30, stats.maxHealth);
        audio.pickup();
        subBanner('+30 HP', 1);
      }
      scene.remove(m.g);
      medkits.splice(i, 1);
    }
  }
}
function clearMedkits() {
  for (const m of medkits) scene.remove(m.g);
  medkits.length = 0;
}

// ---------------------------------------------------------------- power-ups
const RARITY_LABEL = Object.fromEntries(RARITY_ODDS.map((r) => [r.id, r.label]));

function openChoice() {
  game.state = 'choosing';
  trigger = false;
  aim = false;
  player.keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  game.offer = rollOffer(stats);
  $('choose-title').textContent = `WAVE ${game.wave} SURVIVED`;
  $('cards').innerHTML = game.offer
    .map((o, i) => {
      const have = owned.get(o.def.id)?.count || 0;
      return `<div class="card ${o.rarity}" data-i="${i}">
        <div class="key">${i + 1}</div>
        <div class="rarity">${RARITY_LABEL[o.rarity].toUpperCase()}</div>
        <div class="icon">${o.def.icon}</div>
        <div class="name">${o.def.name}</div>
        <div class="desc">${o.def.desc(o.value)}</div>
        ${have ? `<div class="owned">Owned ×${have}</div>` : ''}
      </div>`;
    })
    .join('');
  $('odds').innerHTML =
    'Odds per card: ' +
    [...RARITY_ODDS]
      .reverse()
      .map((r) => `<span class="r-${r.id}">${r.label} ${Math.round(r.chance * 100)}%</span>`)
      .join(' · ');
  showOnly('choose');
}

function choose(i) {
  if (game.state !== 'choosing') return;
  const o = game.offer[i];
  if (!o) return;
  const prevMag = weapon.magSize(stats, GUNS.rifle);
  o.def.apply(stats, o.value, { player });
  if (weapon.magSize(stats, GUNS.rifle) !== prevMag) weapon.refillMags(stats);
  const cur = owned.get(o.def.id);
  if (cur) {
    cur.count++;
    if (RARITY_RANK[o.rarity] > RARITY_RANK[cur.rarity]) cur.rarity = o.rarity;
  } else {
    owned.set(o.def.id, { def: o.def, count: 1, rarity: o.rarity });
  }
  renderOwned();
  audio.powerup(o.rarity);
  game.phase = 'countdown';
  game.timer = 6;
  pauseFor('READY?', 'Click to drop back in');
  lock();
}

function removeOwned(id) {
  const cur = owned.get(id);
  if (!cur) return;
  cur.count--;
  if (cur.count <= 0) owned.delete(id);
  renderOwned();
}

function renderOwned() {
  $('powerup-list').innerHTML = [...owned.values()]
    .map((o) => `<div class="chip" style="--c: var(--${o.rarity})" title="${o.def.name}">${o.def.icon}<span class="n">${o.count > 1 ? '×' + o.count : ''}</span></div>`)
    .join('');
}

$('cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) choose(Number(card.dataset.i));
});

// ---------------------------------------------------------------- UI helpers
let bannerTimer = 0;
let subTimer = 0;
function banner(text, sub, cls = '', dur = 2) {
  const b = $('banner');
  b.textContent = text;
  b.className = 'show ' + cls;
  bannerTimer = dur;
  if (sub) subBanner(sub, dur);
}
function subBanner(text, dur = 1.5) {
  const s = $('subbanner');
  s.textContent = text;
  s.className = 'show';
  subTimer = dur;
}
function showHit(kind) {
  $('hitmarker').className = 'show ' + kind;
  hitT = 0.12;
}

function showOnly(id) {
  for (const o of ['menu', 'pause', 'choose', 'gameover']) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', id === 'menu');
  $('crosshair').classList.toggle('hidden', id !== null);
}

function pauseFor(title, text) {
  game.state = 'paused';
  trigger = false;
  aim = false;
  $('pause-title').textContent = title;
  $('pause').querySelector('p').textContent = text;
  showOnly('pause');
}

const last = {};
function setText(id, v) {
  if (last[id] === v) return;
  last[id] = v;
  $(id).textContent = v;
}

function updateHud(dt) {
  setText('wave-label', game.wave > 0 ? `WAVE ${game.wave}` : 'GET READY');
  const remaining = game.phase === 'active' ? game.toSpawn + game.bossToSpawn + zombies.aliveCount : 0;
  setText('zombies-left', game.phase === 'active' ? `${remaining} zombie${remaining === 1 ? '' : 's'} left` : game.phase === 'countdown' ? `Wave ${game.wave + 1} in ${Math.max(0, Math.ceil(game.timer))}` : 'Wave cleared');
  setText('score', String(game.score));
  setText('kills', `${game.kills} kills`);
  const hp = Math.max(0, Math.ceil(player.health));
  setText('health-text', `${hp}`);
  $('health-fill').style.width = `${Math.max(0, (player.health / stats.maxHealth) * 100)}%`;
  const slot = weapon.slot;
  setText('ammo-mag', String(slot.ammo));
  setText('ammo-max', slot.reserve === Infinity ? '∞' : String(slot.reserve));
  setText('weapon-name', slot.def.name.toUpperCase());
  $('weapon-name').style.color = TIER_CSS[slot.def.tier];
  $('ammo').classList.toggle('low', slot.ammo <= weapon.magSize(stats) * 0.2);
  $('reload-hint').classList.toggle('show', weapon.reloading > 0 || slot.ammo === 0);
  setText('reload-hint', weapon.reloading > 0 ? 'RELOADING' : slot.reserve > 0 ? 'PRESS R' : 'NO AMMO');
  const slotsKey = weapon.slots.map((x) => x.def.id).join() + weapon.cur;
  if (last.slots !== slotsKey) {
    last.slots = slotsKey;
    $('slots').innerHTML = weapon.slots
      .map((x, i) => `<div class="slot ${i === weapon.cur ? 'active' : ''}" style="--c: ${TIER_CSS[x.def.tier]}"><b>${i + 1}</b>${x.def.name}</div>`)
      .join('');
  }
  $('scope').classList.toggle('hidden', !weapon.scoped);
  $('crosshair').style.opacity = String(Math.max(0, 1 - weapon.ads * 1.6));

  const boss = zombies.boss;
  $('boss-bar').classList.toggle('hidden', !boss);
  if (boss) $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;

  hitT -= dt;
  if (hitT <= 0) $('hitmarker').className = '';
  bannerTimer -= dt;
  if (bannerTimer <= 0) $('banner').classList.remove('show');
  subTimer -= dt;
  if (subTimer <= 0) $('subbanner').classList.remove('show');

  vignette = Math.max(0, vignette - dt * 1.5);
  const low = player.health / stats.maxHealth < 0.3 ? 0.35 + Math.sin(time * 5) * 0.15 : 0;
  $('vignette').style.opacity = String(Math.max(vignette, low));
  const spread = player.moving ? (player.sprinting ? 14 : 7) : 0;
  $('crosshair').style.setProperty('--spread', `${spread + (player.onGround ? 0 : 8) + weapon.kick * 6}px`);
}

// ---------------------------------------------------------------- state
function lock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* the pause screen lets the player click again */
  }
}

function startGame() {
  audio.init();
  zombies.clear();
  clearMedkits();
  stats = baseStats();
  owned.clear();
  renderOwned();
  player.reset(stats.maxHealth);
  player.update(0, world.colliders, stats, false, audio);
  weapon.reset(stats);
  clearProjectiles();
  pickups.clear();
  pickups.topUp(5, player.pos);
  Object.assign(game, { wave: 0, kills: 0, headshots: 0, score: 0, phase: 'countdown', timer: 5, toSpawn: 0, bossToSpawn: 0 });
  $('banner').className = '';
  $('subbanner').className = '';
  pauseFor('READY?', 'Click to start · the first wave comes in 5 seconds');
  lock();
}

function gameOver() {
  game.state = 'gameover';
  trigger = false;
  aim = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const newBest = game.wave > game.best;
  if (newBest) {
    game.best = game.wave;
    saveBest(game.best);
  }
  $('final-stats').innerHTML = `
    You survived until <b>wave ${game.wave}</b>${newBest ? ' — new best!' : ''}<br/>
    Score <b>${game.score}</b> · Kills <b>${game.kills}</b> · Headshots <b>${game.headshots}</b><br/>
    Power-ups collected <b>${[...owned.values()].reduce((a, o) => a + o.count, 0)}</b>`;
  showOnly('gameover');
  renderBest();
}

function toMenu() {
  game.state = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  zombies.clear();
  clearMedkits();
  clearProjectiles();
  renderBest();
  showOnly('menu');
}

function renderBest() {
  $('best').textContent = game.best > 0 ? `Best: wave ${game.best}` : '';
}

$('play-btn').addEventListener('click', startGame);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', toMenu);
$('quit-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  toMenu();
});
$('pause').addEventListener('click', () => {
  audio.init();
  lock();
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && game.state === 'paused') {
    game.state = 'playing';
    showOnly(null);
  } else if (!locked && game.state === 'playing') {
    pauseFor('PAUSED', 'Click to continue');
  }
});

// ---------------------------------------------------------------- input
document.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing' || document.pointerLockElement !== canvas) return;
  player.look(e.movementX, e.movementY, camera.fov / 75);
  weapon.sway(e.movementX * (1 - weapon.ads * 0.8), e.movementY * (1 - weapon.ads * 0.8));
});
document.addEventListener('mousedown', (e) => {
  if (game.state !== 'playing') return;
  if (e.button === 0) {
    trigger = true;
    pressed = true;
  }
  if (e.button === 2) aim = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) trigger = false;
  if (e.button === 2) aim = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener(
  'wheel',
  (e) => {
    if (game.state === 'playing' && Math.abs(e.deltaY) > 1) weapon.cycle(e.deltaY > 0 ? 1 : -1);
  },
  { passive: true }
);
document.addEventListener('keydown', (e) => {
  if (game.state === 'choosing' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    choose(Number(e.code.slice(-1)) - 1);
    return;
  }
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (game.state !== 'playing') return;
  if (e.code === 'Space') e.preventDefault();
  player.keys.add(e.code);
  if (e.code === 'KeyR') weapon.startReload(stats);
  if (e.code === 'KeyQ') weapon.equipLast();
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) weapon.equip(Number(digit[1]) - 1);
});
document.addEventListener('keyup', (e) => player.keys.delete(e.code));
window.addEventListener('blur', () => {
  player.keys.clear();
  trigger = false;
  aim = false;
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  weapon.resize(camera.aspect);
});

// ---------------------------------------------------------------- loop
const _fwd = new THREE.Vector3();
function update(dt) {
  const def = weapon.def;
  const moveMul = (def.moveMul || 1) * (1 - weapon.ads * 0.35);
  const hSpeed = player.update(dt, world.colliders, stats, trigger || aim, audio, moveMul);
  hitSoundPlayed = false;
  const shots = weapon.update(
    dt,
    { trigger, pressed, sprinting: player.sprinting || player.climbing, moving: hSpeed > 0.5, speed: hSpeed, aim },
    stats
  );
  pressed = false;
  for (let i = 0; i < shots; i++) fireShot(hSpeed > 0.5, hSpeed);
  if (weapon.ammo === 0 && weapon.slot.reserve > 0 && weapon.reloading <= 0 && !trigger) weapon.startReload(stats);
  updateProjectiles(dt);
  pickups.update(dt, player.pos, onPickGun);
  zombies.update(dt, player, onPlayerHit);
  updateMedkits(dt);
  updateWave(dt);
  explosionSoundT -= dt;
}

function menuCamera() {
  const a = time * 0.04;
  camera.position.set(Math.cos(a) * 34, heightAt(Math.cos(a) * 34, Math.sin(a) * 34) + 7, Math.sin(a) * 34);
  camera.lookAt(0, 3, 0);
}

let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  time += dt;

  if (game.state === 'playing') update(dt);
  const fov = game.state === 'menu' ? 75 : 75 + (weapon.def.zoomFov - 75) * weapon.ads;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (game.state === 'menu') menuCamera();
  if (game.state !== 'menu') updateHud(dt);
  world.update(dt, time, game.state === 'menu' ? camera.position : player.pos);
  effects.update(dt);

  camera.getWorldDirection(_fwd);
  audio.setListener(camera.position, _fwd);

  renderer.clear();
  renderer.render(scene, camera);
  if (game.state !== 'menu') weapon.render(renderer);
}

renderBest();
showOnly('menu');
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy for poking at the game from the console / automated smoke tests.
  window.__game = {
    tick: (n = 1, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) update(dt);
    },
    input: (o) => {
      if ('trigger' in o) trigger = o.trigger;
      if ('pressed' in o) pressed = o.pressed;
      if ('aim' in o) aim = o.aim;
    },
    game, player, zombies, weapon, pickups, world, stats: () => stats, startGame, beginWave, openChoice, choose, POWERUPS, scene, camera, renderer };
}
