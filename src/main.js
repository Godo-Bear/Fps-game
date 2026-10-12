import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { Effects } from './effects.js';
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

let stats = baseStats();
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
      banner(`WAVE ${game.wave} CLEARED`, `+${bonus} score · +20 HP`, 'gold', 2.3);
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
  audio.shot(stats.explosive > 0);
  player.addRecoil(0.011);
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  camera.getWorldPosition(_origin);
  weapon.muzzleWorld(_muzzle);
  const baseSpread = 0.006 + (moving ? 0.006 + speed * 0.0012 : 0) + (player.onGround ? 0 : 0.02);
  for (let i = 0; i < stats.multishot; i++) {
    const spread = baseSpread + (i > 0 ? 0.02 : 0);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    const d = _dir.clone().addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    traceBullet(_origin, d);
  }
}

function traceBullet(origin, dir) {
  const far = 220;
  raycaster.set(origin, dir);
  raycaster.far = far;
  const hits = raycaster.intersectObjects(zombies.parts.concat(world.solids), false);
  const groundT = terrainHit(origin, dir, far);
  let pierceLeft = stats.pierce;
  const struck = new Set();
  let end = null;
  let impact = false;
  for (const h of hits) {
    if (h.distance > groundT) break;
    const z = h.object.userData.zombie;
    if (z) {
      if (struck.has(z) || !z.alive) continue;
      struck.add(z);
      hitZombie(z, h.object.userData.kind === 'head', h.point, dir);
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
  if (stats.explosive > 0 && impact) explode(end);
  effects.tracer(_muzzle, end);
}

function hitZombie(z, head, point, dir) {
  let dmg = weapon.damage(stats);
  const crit = Math.random() < stats.critChance;
  if (head) dmg *= stats.headshotMul;
  if (crit) dmg *= 2.5;
  effects.blood(point, dir, head ? 1.8 : 1);
  const killed = zombies.damage(z, dmg, { slow: stats.slow });
  if (!killed && z.typeId !== 'boss') zombies.knockback(z, player.pos, z.typeId === 'brute' ? 0.02 : 0.06);
  audio.hit(head || crit);
  showHit(killed ? 'kill' : head || crit ? 'head' : '');
  if (killed) onKill(z, head);
}

function explode(point) {
  const radius = 2.6 + (stats.explosive - 1) * 0.9;
  const dmg = weapon.damage(stats) * 0.6;
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
  }
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
  const prevMag = weapon.magSize(stats);
  o.def.apply(stats, o.value, { player });
  if (weapon.magSize(stats) !== prevMag) weapon.ammo = weapon.magSize(stats);
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
  setText('ammo-mag', String(weapon.ammo));
  setText('ammo-max', String(weapon.magSize(stats)));
  $('ammo').classList.toggle('low', weapon.ammo <= weapon.magSize(stats) * 0.2);
  $('reload-hint').classList.toggle('show', weapon.reloading > 0 || weapon.ammo === 0);
  setText('reload-hint', weapon.reloading > 0 ? 'RELOADING' : 'PRESS R');

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
  Object.assign(game, { wave: 0, kills: 0, headshots: 0, score: 0, phase: 'countdown', timer: 5, toSpawn: 0, bossToSpawn: 0 });
  $('banner').className = '';
  $('subbanner').className = '';
  pauseFor('READY?', 'Click to start · the first wave comes in 5 seconds');
  lock();
}

function gameOver() {
  game.state = 'gameover';
  trigger = false;
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
  player.look(e.movementX, e.movementY);
  weapon.sway(e.movementX, e.movementY);
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && game.state === 'playing') trigger = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) trigger = false;
});
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
});
document.addEventListener('keyup', (e) => player.keys.delete(e.code));
window.addEventListener('blur', () => {
  player.keys.clear();
  trigger = false;
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
  const hSpeed = player.update(dt, world.colliders, stats, trigger, audio);
  const shots = weapon.update(dt, { trigger, sprinting: player.sprinting, moving: hSpeed > 0.5, speed: hSpeed }, stats);
  for (let i = 0; i < shots; i++) fireShot(hSpeed > 0.5, hSpeed);
  if (weapon.ammo === 0 && weapon.reloading <= 0 && !trigger) weapon.startReload(stats);
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
  window.__game = { game, player, zombies, stats: () => stats, startGame, beginWave, openChoice, choose, POWERUPS, scene, camera, renderer };
}
