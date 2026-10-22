import * as THREE from 'three';
import { CHARACTERS_LIVE, FINISHES, crosshairPaint, levelFromXp, petHas, petLevel, CANDY_DROPS } from '../shared/cosmetics.js';
import { EVAC_HOLD, INFECTED, JUGG_HP, MAPS, MODES, SOLO_MAP, SURVIVORS, quickWheel } from '../shared/modes.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../shared/achievements.js';
import { termsHtml } from '../shared/terms.js';
import { MAX_SAVES, SAVE_NAME_MAX, cleanSaveName } from '../shared/saves.js';
import { SHOP, coinsForRun } from '../shared/shop.js';
import { MASTERY_TIERS, tierFor } from '../shared/mastery.js';
import { Account, AccountUI } from './account.js';
import { candyPiece, isHalloween, jackOLantern, setHalloween } from './halloween.js';
import { CharacterPreview } from './character.js';
import { priceTag } from '../shared/terms.js';
import { GameAudio } from './audio.js';
import { Controls } from './controls.js';
import { CHANGELOG, LATEST_VERSION, UPCOMING } from './changelog.js';
import { BUILD, BUILT_AT, liveBuild, watchVersion, restartToNew } from './version.js';
import { DefendPoints } from './defend.js';
import { Structures } from './structures.js';
import { BUILD_REACH, SCRAP_PER_PVP_KILL, START_SCRAP, STRUCTURES } from '../shared/structures.js';
import { Effects } from './effects.js';
import { GUNS, MUTATIONS, TIER_CSS, loadGunModels, setArmLook, randomMutation, rollGun } from './guns.js';
import { Minimap } from './minimap.js';
import { Avatar, FLAG_BITS, Multiplayer } from './multiplayer.js';
import { DROP_CHANCE, EVENT_MAX_PLAYERS, PIECE_COUNT, totalPieces } from '../shared/events.js';
import { TANK_ARMOUR, ownsGear } from '../shared/gear.js';
import { buildTank, loadTankModel, tankModelReady } from './tank.js';
import { showPiece } from './puzzle.js';
import { NavGrid } from './navgrid.js';
import { GunPickups } from './pickups.js';
import { SupplyDrops } from './supply.js';
import { Player } from './player.js';
import { POWERUPS, RARITY_ODDS, RARITY_RANK, baseStats, rollOffer } from './powerups.js';
import { heightAt } from './terrain.js';
import { Weapon } from './weapon.js';
import { WEATHER, Weather } from './weather.js';
import { buildWorld } from './world.js';
import { Bots } from './bots.js';
import { loadZombieModel, setZombieModels } from './zombieModel.js';
import { Wolf, loadWolfModel } from './pet.js';
import { BOSSES, BOSS_IDS, ZOMBIE_TYPES, ZombieManager, bossForWave } from './zombies.js';

// ---------------------------------------------------------------- setup
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
const effects = new Effects(scene);
const bots = new Bots();
const player = new Player(camera);
const weapon = new Weapon(camera, audio);
weapon.resize(camera.aspect);
const account = new Account();
const accountUI = new AccountUI(account);
const structures = new Structures(scene); // barricades and turrets

let world = null;
let zombies = null;
let pickups = null;
let supply = null; // supply drops
let minimap = null;
let weather = null;

let stats = baseStats();
weapon.reset(stats);
weapon.onDrop = (def) => subBanner(`${def.name} is out of ammo`, 1.8);
const projectiles = [];
const owned = new Map();
const medkits = [];

const game = {
  mode: 'solo', // solo | mp
  state: 'menu', // menu | mpmenu | lobby | newgame | saves | playing | paused | choosing | gameover | mpend
  phase: 'countdown', // prep (waiting for READY) | countdown | active | cleared | picking
  map: SOLO_MAP, // solo is always Dead Plains; the other maps are multiplayer-only
  wave: 0,
  kills: 0,
  headshots: 0,
  score: 0,
  runId: '',
  runName: '',
  scrap: 0, // for barricades and turrets
  night: false, // night waves are harder
  grenades: 2,
  timer: 0,
  toSpawn: 0,
  bossToSpawn: 0,
  spawnT: 0,
  cfg: null,
  offer: [],
  best: Number(loadPref('deadplains.best', 0)),
};
const inMenu = () => ['menu', 'mpmenu', 'lobby', 'newgame', 'saves'].includes(game.state);

let trigger = false;
let pressed = false; // a fresh left click this frame (semi-auto guns)
let aim = false; // right mouse held
let time = 0;
let hitT = 0;
let vignette = 0;
let explosionSoundT = 0;
let hazardT = 0;
let headStreak = 0;
let headStreakT = 0;

function loadPref(k, d) {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
}
function savePref(k, v) {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------- maps
// map props state (red barrels, ammo crates), reset with every map load
const barrelQueue = []; // { b, t, mine }
const barrelsGone = []; // { b, t }
const ammoCd = new Map(); // crate -> seconds left
function loadMap(id) {
  if (world && world.mapId === id && world.halloween === wantHalloween()) return resetMapProps();
  if (world) world.dispose();
  if (weather) weather.dispose();
  syncHalloween();
  world = buildWorld(scene, id, { ads: !account.cfg?.features?.adsOff, halloween: isHalloween() }); // the JINtelligence ads, unless an admin turned them off
  world.setEffects(effects);
  resetMapProps();
  if (!zombies) {
    zombies = new ZombieManager(scene, world, effects, audio);
    // co-op host: show the acid to everyone else too
    zombies.onGlob = (f, v, hex) => {
      if (isCoop() && mp.isHost()) mp.relay('all', { k: 'glob', f: [f.x, f.y, f.z], v: [v.x, v.y, v.z], h: hex ? 1 : 0 });
    };
  }
  zombies.world = world;
  zombies.structures = structures;
  zombies.speedFor = weatherZombieSpeed;
  structures.setColliders(world.colliders);
  zombies.nav = new NavGrid(world.colliders);
  zombies.navT = 0;
  zombies.clear();
  if (!pickups) pickups = new GunPickups(scene, world);
  pickups.clear();
  pickups.world = world;
  if (!supply) {
    supply = new SupplyDrops(scene, world);
    supply.onLand = (d) => {
      effects.dust(new THREE.Vector3(d.x, d.floor + 0.2, d.z));
      audio.explosion(new THREE.Vector3(d.x, d.floor, d.z));
    };
  }
  supply.clear();
  supply.world = world;
  minimap = new Minimap($('minimap'), world);
  weather = new Weather(scene, world.atmosphere, audio);
  weather.onBolt = () => lightningStrike();
  weather.set(world.theme.weather, true);
  clearMedkits();
  clearProjectiles();
}

// ---------------------------------------------------------------- waves (solo)
// A wave never has more than WAVE_CAP zombies (bosses on top), and only a few are up at once (lots of zombies
// lag). Later waves get harder by swapping walkers for tougher types and making each zombie tougher instead of
// piling on more bodies.
const WAVE_CAP = 28;
let adminWaveCap = WAVE_CAP;
const rawWaveSize = (n) => 6 + n * 4 + Math.floor(n * n * 0.15);
const smallWaveSize = (n) => 5 + n * 2 + Math.floor(n * n * 0.05);
function waveConfig(n) {
  const raw = rawWaveSize(n);
  const total = Math.min(smallWaveSize(n), adminWaveCap);
  return {
    total,
    // how much bigger the wave "wanted" to be: turned into nastier types
    pressure: raw / total,
    // and into tougher zombies (more health, a bit more damage)
    tough: n <= 2 ? 1 : Math.min(3, 1 + (raw / total - 1) * 0.45),
    maxAlive: Math.min(8 + n, 16),
    interval: Math.max(0.3, 1.3 - n * 0.07),
    // at most 2 bosses at once (lots of them lag): the ones a late wave "wanted" go into their health instead
    boss: n % 5 === 0 ? Math.min(2, 1 + Math.floor(n / 10)) : 0,
    bossTough: n % 5 === 0 ? (1 + Math.floor(n / 10)) / Math.min(2, 1 + Math.floor(n / 10)) : 1,
  };
}

// How likely each special zombie is on wave n (walkers fill the rest). `pressure` > 1 once the
// wave hits the cap, and shifts the mix towards brutes, bloaters, spitters and runners.
function typeOdds(n, pressure = 1) {
  const k = Math.min(3, pressure);
  const odds = [
    ['brute', n >= 4 ? Math.min(0.12, 0.04 + (n - 4) * 0.015) * k : 0],
    ['runner', n >= 2 ? Math.min(0.3, 0.12 + (n - 2) * 0.025) * Math.min(1.5, k) : 0],
    ['crawler', n >= 3 ? Math.min(0.14, 0.06 + (n - 3) * 0.015) * Math.min(1.5, k) : 0],
    ['bloater', n >= 4 ? Math.min(0.1, 0.04 + (n - 4) * 0.01) * k : 0],
    ['spitter', n >= 5 ? Math.min(0.12, 0.05 + (n - 5) * 0.012) * k : 0],
  ];
  // walkers always make up at least a fifth of the wave
  const sum = odds.reduce((a, [, p]) => a + p, 0);
  if (sum > 0.8) for (const o of odds) o[1] *= 0.8 / sum;
  return odds;
}
// Which zombie to spawn next (random, used when a wave's list has run out). Mutations show up as the waves go on.
function pickType(n) {
  let r = Math.random();
  for (const [type, p] of typeOdds(n)) {
    if (r < p) return type;
    r -= p;
  }
  return 'walker';
}
// The whole wave's line-up, shuffled: every type that's unlocked shows up at least once.
function waveDeck(n, total, pressure) {
  const odds = typeOdds(n, pressure).filter(([, p]) => p > 0);
  const deck = [];
  for (const [type, p] of odds) {
    const count = Math.max(1, Math.round(total * p));
    for (let i = 0; i < count && deck.length < total; i++) deck.push(type);
  }
  while (deck.length < total) deck.push('walker');
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const nextType = (n) => (game.deck?.length ? game.deck.pop() : pickType(n));

// Halloween: some zombies are Halloween specials instead (more of them as the waves go on). [type, first wave]
const HW_SPECIALS = [['pumpkin', 2], ['phantom', 3], ['witch', 4], ['reaper', 5]];
const HW_INTRO = {
  pumpkin: '🎃 Pumpkin Bomber: it runs at you and blows up in fire. Shoot it from far away!',
  phantom: '👻 Phantom: it vanishes and appears right next to you',
  witch: '🧙 Witch: she throws hexes and heals the zombies near her. Kill her first!',
  reaper: '💀 Reaper: it dashes at you and swings its scythe',
};
const hwSeen = new Set();
function hwType(type, n) {
  if (!isHalloween() || type === 'boss') return type;
  const open = HW_SPECIALS.filter(([, first]) => n >= first);
  if (!open.length || Math.random() > Math.min(0.35, 0.12 + n * 0.015)) return type;
  return open[Math.floor(Math.random() * open.length)][0];
}
// the first time you meet each one, say what it does
function hwIntro(z) {
  if (!HW_INTRO[z.typeId] || hwSeen.has(z.typeId)) return;
  hwSeen.add(z.typeId);
  subBanner(HW_INTRO[z.typeId], 3.2);
}
const mutatedChance = (n) => (n >= 6 ? Math.min(0.25, 0.08 + (n - 6) * 0.012) : n >= 3 ? 0.03 : 0);

// ---------------------------------------------------------------- night waves
// Every 4th wave starts at night: dark sky, a flashlight, and tougher zombies worth more.
const NIGHT = { hp: 1.4, speed: 1.15, damage: 1.25, mutated: 0.15, score: 1.5 };
let adminNight = 'auto'; // admin: auto | night | day
const isNightWave = (w) => (adminNight === 'night' ? true : adminNight === 'day' ? false : w > 0 && w % 4 === 0);
// night zombies: more fast and nasty types
function nightType(n) {
  if (Math.random() < 0.35) return n >= 5 ? ['runner', 'spitter', 'crawler', 'brute'][Math.floor(Math.random() * 4)] : 'runner';
  return nextType(n);
}
// fewer zombies per wave, so each one is tougher
function toughen(z, k = 1) {
  if (k <= 1) return;
  z.maxHp *= k;
  z.hp = z.maxHp;
  z.damage *= 1 + (k - 1) * 0.3;
}
function nightBuff(z) {
  z.maxHp *= NIGHT.hp;
  z.hp = z.maxHp;
  z.speed *= NIGHT.speed;
  z.damage *= NIGHT.damage;
  z.night = true;
}
// the sky follows the wave that's coming (or going on)
function setNight(on, announce = false) {
  if (game.night === on) return;
  game.night = on;
  if (announce) subBanner(on ? '🌙 Night is falling… the next wave will be harder' : '☀️ Dawn breaks', 2.6);
}

// a flashlight on your gun at night
const flashlight = new THREE.SpotLight(0xfff2d8, 0, 48, 0.42, 0.55, 1.4);
scene.add(flashlight, flashlight.target);
const _fl = new THREE.Vector3();
function updateFlashlight() {
  const k = weather && settings.flashlight ? weather.nightK : 0;
  flashlight.intensity = k * 60;
  flashlight.visible = k > 0.02 && !player.dead && !inMenu();
  if (!flashlight.visible) return;
  camera.getWorldDirection(_fl);
  flashlight.position.copy(camera.position).addScaledVector(_fl, 0.3);
  flashlight.position.y -= 0.15;
  flashlight.target.position.copy(camera.position).addScaledVector(_fl, 10);
}

function beginWave() {
  game.wave++;
  game.cfg = waveConfig(game.wave);
  game.toSpawn = game.cfg.total;
  game.mod = game.nextMod || null;
  game.special = game.nextSpecial || null;
  game.nextMod = game.nextSpecial = null;
  game.bountyLeft = game.special === 'bounty' ? 1 : 0;
  game.hordeA = Math.random() * Math.PI * 2;
  applyWaveTwist();
  if (game.mod === 'rush') {
    game.toSpawn = Math.ceil(game.cfg.total * 0.7);
    game.deck = Array.from({ length: game.toSpawn }, () => (Math.random() < 0.6 ? 'runner' : 'crawler'));
  } else game.deck = waveDeck(game.wave, game.cfg.total, game.cfg.pressure);
  game.bossToSpawn = game.cfg.boss;
  game.spawnT = 0.5;
  game.phase = 'active';
  game.bossVariant = game.cfg.boss ? bossForWave(game.wave) : null;
  setNight(isNightWave(game.wave));
  let sub = game.cfg.boss ? `The ${BOSSES[game.bossVariant].name} approaches…` : 'Survive';
  if (game.night) sub = `🌙 Night: the dead are stronger · ${sub}`;
  if (game.wave > 1 && Math.random() < 0.35) {
    const next = weather.random(weather.id);
    if (world.theme.weathers.includes(next)) {
      weather.set(next);
      sub += ` · ${WEATHER[next].name}`;
    }
  }
  if (game.wave === 3) sub += ' · Mutations detected';
  if (game.special) sub = `${SPECIALS[game.special].name}: ${SPECIALS[game.special].desc}`;
  if (game.mod) sub += ` · ${MODIFIERS[game.mod].name}`;
  const wn = weatherNote(weather.id);
  if (wn) sub += ` · ${wn}`;
  banner(`WAVE ${game.wave}`, sub, game.cfg.boss ? 'red' : '', 2.6);
  audio.waveStart();
  if (isCoop()) {
    // squad mates who went down come back for the new wave
    mp.send({ t: 'coopwave', wave: game.wave });
    mp.relay('all', { k: 'wave', wave: game.wave, sub, boss: game.cfg.boss ? 1 : 0, weather: weather.id, night: game.night ? 1 : 0, mod: game.mod, sp: game.special });
    if (player.dead) coopRevive();
  }
}

// co-op rooms: the host's zombie health setting
function roomZombieHp(z) {
  const mul = isCoop() ? (mp.settings.zhp || 100) / 100 : 1;
  if (mul === 1) return;
  z.maxHp *= mul;
  z.hp = z.maxHp;
}

// Zombies spawn around a random living player.
function spawnAnchor() {
  // horde rush: everything comes from one side of the map
  if (game.special === 'horde' && game.phase === 'active') return new THREE.Vector3(Math.cos(game.hordeA) * 70, 0, Math.sin(game.hordeA) * 70);
  const t = zombieTargets();
  return t.length ? t[Math.floor(Math.random() * t.length)].pos : player.pos;
}

function updateWave(dt) {
  if (game.phase === 'tutorial') return updateTutorial(dt);
  if (game.phase === 'prep') {
    // the wave waits until everyone still standing is ready (in co-op a slow squad gets 2 minutes)
    const need = prepNeeded();
    if (isCoop()) prep.t -= dt;
    if ((need.length && need.every((id) => prep.ready.has(id))) || (isCoop() && prep.t <= 0)) {
      game.phase = 'countdown';
      game.timer = 3;
      if (isCoop()) mp.relay('all', { k: 'wavego', wave: game.wave + 1 });
      banner('GET READY', `Wave ${game.wave + 1} in 3 seconds`, '', 1.4);
    }
    return;
  }
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
      const z = zombies.spawn(hwType(game.night ? nightType(game.wave) : nextType(game.wave), game.wave), game.wave, spawnAnchor(), Math.random() < mutatedChance(game.wave) + (game.night ? NIGHT.mutated : 0));
      hwIntro(z);
      if (game.night) nightBuff(z);
      toughen(z, cfg.tough);
      roomZombieHp(z);
      waveSpawnExtras(z);
      game.toSpawn--;
      game.spawnT = cfg.interval * (0.5 + Math.random());
    }
    if (game.bossToSpawn > 0 && cfg.total - game.toSpawn >= cfg.total * 0.3) {
      // a second boss in the same wave is a different one
      const variant = game.bossToSpawn < game.cfg.boss ? BOSS_IDS[Math.floor(Math.random() * BOSS_IDS.length)] : game.bossVariant || 'abomination';
      const b = zombies.spawn('boss', game.wave, spawnAnchor(), game.wave >= 10, variant);
      if (game.night) nightBuff(b);
      toughen(b, cfg.bossTough);
      roomZombieHp(b);
      game.bossToSpawn--;
      bossBanner(variant);
    }
    if (game.toSpawn === 0 && game.bossToSpawn === 0 && zombies.aliveCount === 0) {
      game.phase = 'cleared';
      game.timer = 2.4;
      const bonus = 50 * game.wave + pointsBonus();
      game.score += bonus;
      giveGrenades(2);
      game.scrap = Math.min(999, game.scrap + 10);
      questAdd('waves');
      waveAchievements(game.wave);
      game.mod = null;
      game.special = null;
      applyWaveTwist();
      if (isCoop()) questAdd('coopWaves');
      if (game.night) questAdd('nightWaves');
      flushQuests();
      setNight(isNightWave(game.wave + 1), true);
      player.heal(20, overhealCap());
      if (isCoop()) {
        mp.relay('all', { k: 'cleared', wave: game.wave });
        coop.ready = new Set();
        coop.pickT = 25;
      }
      const before = pickups.items.length;
      pickups.topUp(Math.min(9, 4 + Math.floor(game.wave / 2)), player.pos, 0.08 + game.wave * 0.01);
      const dropped = pickups.items.length > before ? ' · new guns dropped' : '';
      const held = isDefend() ? ` · ${defend.heldCount}/3 points held` : '';
      banner(`WAVE ${game.wave} CLEARED`, `+${bonus} score · +20 HP${held}${dropped}`, 'gold', 2.3);
      audio.waveCleared();
    }
    return;
  }
  if (game.phase === 'evac') return updateEvac(dt);
  if (game.phase === 'cleared') {
    game.timer -= dt;
    if (game.timer <= 0 && isExtract() && game.wave >= (mp.settings.evac || 5)) return startEvac();
    if (game.timer <= 0) {
      if (isCoop()) game.phase = 'picking';
      if (!player.dead) openChoice();
      else if (isCoop()) coop.ready.add('me');
    }
    return;
  }
  // co-op: wait (up to 25s) for everyone to pick a power-up
  if (game.phase === 'picking') {
    coop.pickT -= dt;
    const alive = [...mp.avatars.values()].filter((a) => a.alive && !isBotId(a.id)).length + (player.dead ? 0 : 1);
    if (coop.ready.size >= alive || coop.pickT <= 0) toPrep(5);
  }
}

// ---------------------------------------------------------------- wave modifiers and special waves
// Every 3rd wave (every wave in the weekly challenge) gets a twist, shown while you get ready.
const MODIFIERS = {
  headshots: { name: '🎯 Headshots Only', desc: 'Body shots barely scratch them' },
  boom: { name: '💥 Volatile', desc: 'Zombies blow up when they die. Keep your distance' },
  lowgrav: { name: '🌙 Low Gravity', desc: 'Jump higher and fall slower' },
  double: { name: '💰 Double Score', desc: 'Every kill is worth twice as much' },
  rush: { name: '🏃 Sprinters', desc: 'Only runners and crawlers, but fewer of them' },
  tanky: { name: '🛡️ Thick Skin', desc: 'Zombies have 50% more health and drop more medkits' },
  vampire: { name: '🧛 Bloodthirst', desc: 'Every kill heals you a little' },
};
const MOD_IDS = Object.keys(MODIFIERS);
const SPECIALS = {
  horde: { name: '🌊 HORDE RUSH', desc: 'The whole wave comes from one direction' },
  bounty: { name: '🎯 BOUNTY WAVE', desc: 'A golden zombie is out there. Kill it for a fortune' },
};
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// weeks since Monday 5 Jan 2026 (same as the server)
const weekNumber = () => Math.floor((Date.now() - Date.UTC(2026, 0, 5)) / (7 * 86400000));
function planWave(n) {
  const r = game.weekly ? seeded(weekNumber() * 1000 + n) : Math.random;
  const mod = n >= 2 && (game.weekly || n % 3 === 0) ? MOD_IDS[Math.floor(r() * MOD_IDS.length)] : null;
  const special = n >= 6 && n % 5 !== 0 && n % 4 === 2 ? (r() < 0.5 ? 'horde' : 'bounty') : null;
  return { mod, special };
}
function applyWaveTwist() {
  player.gravityMul = game.mod === 'lowgrav' ? 0.45 : 1;
}
function makeBounty(z) {
  z.bounty = true;
  z.maxHp *= 6;
  z.hp = z.maxHp;
  z.speed *= 1.25;
  z.baseEmissive = 0x6a4a00;
  z.shirtMat.color.setHex(0xffc81e);
  z.skinMat.color.setHex(0xd8b040);
  game.bountyLeft = 0;
  subBanner('🎯 The BOUNTY zombie is here: the golden one!', 2.6);
}
// extras on every zombie the host spawns during a wave
function waveSpawnExtras(z) {
  if (game.mod === 'tanky') {
    z.maxHp *= 1.5;
    z.hp = z.maxHp;
  }
  if (game.bountyLeft && z.typeId !== 'boss' && game.cfg.total - game.toSpawn >= game.cfg.total * 0.35) makeBounty(z);
}
const pendingBooms = []; // volatile zombies go off a moment after dying
let barrelStreak = { n: 0, t: 0 };

// ---------------------------------------------------------------- perk machines and wall buys
// Spend points (your score; spending doesn't lower your score on the leaderboard) at the machines on the map.
const PERKS = {
  tough: { name: 'Tough Nut', icon: '🧃', price: 1500, desc: '+50 max health', apply: () => { stats.maxHealth += 50; player.heal(50, overhealCap()); } },
  quick: { name: 'Quick Hands', icon: '🥤', price: 1200, desc: 'Reload 40% faster', apply: () => { stats.reloadSpeed *= 1.4; } },
  double: { name: 'Double Tap', icon: '🍺', price: 2000, desc: 'Shoot 30% faster', apply: () => { stats.fireRateMul *= 1.3; } },
  fleet: { name: 'Fleet Foot', icon: '👟', price: 1000, desc: 'Move 12% faster', apply: () => { stats.speedMul *= 1.12; } },
};
const WALL_PRICES = { smg: 500, shotgun: 700, dmr: 900, lmg: 1200, sniper: 1000, launcher: 1500 };
const points = () => Math.max(0, Math.floor(game.score - (game.spent || 0)));
function shopPrice(sh) {
  if (sh.kind === 'perk') return PERKS[sh.id].price;
  const have = weapon.slots.some((sl) => sl.def.id === sh.id);
  return have ? Math.round(WALL_PRICES[sh.id] / 2) : WALL_PRICES[sh.id];
}
function shopLabel(sh) {
  if (sh.kind === 'perk') {
    const pk = PERKS[sh.id];
    if (game.perks?.has(sh.id)) return `${pk.icon} <b>${pk.name}</b> · you have it`;
    return `Press <b>E</b>: ${pk.icon} <b>${pk.name}</b> (${pk.desc}) · 💵 ${pk.price}`;
  }
  const have = weapon.slots.some((sl) => sl.def.id === sh.id);
  return `Press <b>E</b>: ${have ? 'ammo for the' : 'buy the'} <b>${GUNS[sh.id].name}</b> · 💵 ${shopPrice(sh)}`;
}
function buyShop(sh) {
  if (sh.kind === 'perk' && game.perks.has(sh.id)) return;
  const price = shopPrice(sh);
  if (points() < price) {
    subBanner(`Not enough points (you have ${points()})`, 1.4);
    audio.empty();
    return;
  }
  if (sh.kind !== 'perk' && backpackFull(sh.id)) {
    // a full backpack: pay once they've picked what it replaces
    return openInventory({ id: sh.id, mut: null, done: () => {
      game.spent = (game.spent || 0) + price;
      const slot = weapon.slots.find((sl) => sl.def.id === sh.id);
      if (slot && slot.reserve !== Infinity) slot.reserve = Math.max(slot.reserve, weapon.magSize(stats, slot.def) * 6);
      achieve('wallbuy');
    } });
  }
  game.spent = (game.spent || 0) + price;
  if (sh.kind === 'perk') {
    PERKS[sh.id].apply();
    game.perks.add(sh.id);
    banner(`${PERKS[sh.id].icon} ${PERKS[sh.id].name.toUpperCase()}`, PERKS[sh.id].desc, 'gold', 1.8);
    achieve('perk');
    if (game.perks.size >= Object.keys(PERKS).length) achieve('allperks');
  } else {
    weapon.give(sh.id, stats);
    const slot = weapon.slots.find((sl) => sl.def.id === sh.id);
    if (slot && slot.reserve !== Infinity) slot.reserve = Math.max(slot.reserve, weapon.magSize(stats, slot.def) * 6);
    if (slot) slot.ammo = weapon.magSize(stats, slot.def);
    subBanner(`🔫 ${GUNS[sh.id].name} bought`, 1.4);
    achieve('wallbuy');
  }
  audio.powerup?.('rare');
}

// ---------------------------------------------------------------- finishers
// Stab a badly hurt zombie (30% health or less, not a boss) to finish it: ammo and a bit of health back.
function finisher(point) {
  effects.blood(point, _dir, 3);
  weapon.refillMags(stats);
  player.heal(15, overhealCap());
  player.shake = Math.min(1, player.shake + 0.5);
  subBanner('🔪 FINISHER · mags full · +15 HP', 1.3);
  achieve('finisher');
}

// ---------------------------------------------------------------- achievements
function achieve(id) {
  if (!ACHIEVEMENT_BY_ID[id] || !account.unlock(id)) return;
  const a = ACHIEVEMENT_BY_ID[id];
  accountUI.toast(`🏅 <b>${a.icon} ${esc(a.name)}</b> · ${esc(a.desc)}`, [], 5000);
  audio.powerup?.('legendary');
}

// ---------------------------------------------------------------- weather that changes the fight
// Fog: zombies far away lose you and slow down. Heavy snow: everyone's slower. Storms: lightning
// strikes the dead.
const weatherDef = () => WEATHER[weather?.id] || {};
const weatherMove = () => ((weatherDef().snow || 0) >= 0.6 ? 0.92 : 1);
function weatherZombieSpeed(z) {
  const w = weatherDef();
  let m = (w.snow || 0) >= 0.6 ? 0.9 : 1;
  if ((w.fogFar ?? 300) < 140) {
    const d = Math.hypot(z.root.position.x - player.pos.x, z.root.position.z - player.pos.z);
    if (d > w.fogFar * 0.45) m *= 0.6;
  }
  return m;
}
function weatherNote(id) {
  const w = WEATHER[id] || {};
  if (w.lightning) return '⚡ Lightning strikes the dead';
  if ((w.snow || 0) >= 0.6) return '❄️ Deep snow: everyone moves slower';
  if ((w.fogFar ?? 300) < 140) return "🌫️ Fog: zombies can't see far";
  return '';
}
function lightningStrike() {
  if (!zombieGame() || !simHost() || game.phase !== 'active') return;
  const near = zombies.list.filter((z) => z.alive && z.typeId !== 'boss' && Math.hypot(z.root.position.x - player.pos.x, z.root.position.z - player.pos.z) < 60);
  if (!near.length) return;
  const z = near[Math.floor(Math.random() * near.length)];
  const p = new THREE.Vector3(z.root.position.x, z.centerY, z.root.position.z);
  effects.burst(p, { count: 40, color: [0xffffff, 0xbfe0ff, 0x8ab8ff], speed: 10, size: 0.18, life: 0.6, grav: 2, up: 3 });
  explodeAt(p, 3.5, 400, { src: 'bolt' });
  subBanner('⚡ Lightning strike!', 1.2);
}

// ---------------------------------------------------------------- extraction (co-op mode)
// After the chosen wave a helicopter lands somewhere on the map. The whole squad still standing has to
// hold the landing zone for EVAC_HOLD seconds while the dead keep coming.
const EVAC_R = 8;
const evac = { on: false, x: 0, z: 0, hold: 0, spawnT: 0, group: null };
const isExtract = () => isCoop() && !!MODES[mp.mode]?.extract;
function evacVisual(x, z) {
  clearEvac();
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(EVAC_R - 0.4, EVAC_R, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  const heli = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3e4a32, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 5), bodyMat);
  heli.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), bodyMat);
  tail.position.set(0, 0.4, -4.4);
  heli.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  rotor.position.y = 1.15;
  heli.add(rotor);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, EVAC_R * 0.6, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.08, depthWrite: false }));
  beam.position.y = 30;
  g.add(beam);
  g.add(heli);
  g.position.set(x, heightAt(x, z), z);
  scene.add(g);
  Object.assign(evac, { on: true, x, z, group: g, heli, rotor });
}
function clearEvac() {
  if (evac.group) scene.remove(evac.group);
  Object.assign(evac, { on: false, hold: 0, group: null });
}
function startEvac() {
  const spots = world.lootSpots.filter((sp) => Math.hypot(sp.x, sp.z) > 20 && Math.hypot(sp.x, sp.z) < 60 && !sp.high && !sp.roof);
  const sp = spots[Math.floor(Math.random() * spots.length)] || { x: 30, z: 0 };
  const x = sp.x + 4;
  const z = sp.z + 4;
  evacVisual(x, z);
  game.phase = 'evac';
  evac.hold = 0;
  evac.spawnT = 2;
  banner('🚁 THE HELICOPTER IS HERE', `Get the whole squad into the landing zone and hold it for ${EVAC_HOLD}s`, 'gold', 3.2);
  mp.relay('all', { k: 'evac', x, z });
}
function updateEvac(dt) {
  evac.spawnT -= dt;
  if (evac.spawnT <= 0 && zombies.aliveCount < 24) {
    evac.spawnT = 0.9;
    const z = zombies.spawn(hwType(pickType(game.wave + 2), game.wave + 2), game.wave + 2, spawnAnchor(), Math.random() < 0.25);
    roomZombieHp(z);
  }
  const squad = [];
  if (!player.dead) squad.push(player.pos);
  for (const a of mp.avatars.values()) if (a.alive && !isBotId(a.id)) squad.push(a.pos); // bots don't have to get in
  const inside = squad.length && squad.every((q) => Math.hypot(q.x - evac.x, q.z - evac.z) < EVAC_R);
  evac.hold = inside ? evac.hold + dt : Math.max(0, evac.hold - dt * 0.5);
  if (evac.hold >= EVAC_HOLD) {
    game.phase = 'done';
    mp.send({ t: 'extracted' });
  }
}
function animateEvac(dt) {
  if (!evac.on || !evac.heli) return;
  evac.rotor.rotation.y += dt * 25;
  const k = Math.min(1, evac.hold / EVAC_HOLD);
  evac.heli.position.y += (26 - k * 22 - evac.heli.position.y) * Math.min(1, dt * 2);
}

// ---------------------------------------------------------------- ready up between waves
// Between waves the next one waits until you press E (controller X, the ✚ button on phones), so you
// can build, restock and get into position. In co-op every squadmate still standing has to be ready.
// "Start waves by themselves" in Settings (solo) or the room setting (co-op) brings back the timer.
const prep = { ready: new Set(), me: false, keyWas: false, t: 0, rd: 0, nd: 0 };
const PREP_COOP_MAX = 120;
function autoWaves() {
  return isCoop() ? mp.settings.start === 'auto' : !!settings.autoWaves;
}
// the solo player / co-op host moves the run into the break before the next wave
function toPrep(autoSeconds = 5) {
  const plan = planWave(game.wave + 1);
  game.nextMod = game.forceMod || plan.mod;
  game.nextSpecial = plan.special;
  game.forceMod = null;
  prep.ready = new Set();
  prep.me = false;
  prep.t = PREP_COOP_MAX;
  if (autoWaves()) {
    game.phase = 'countdown';
    game.timer = autoSeconds;
  } else {
    game.phase = 'prep';
  }
}
// bots in the zombie modes: they don't ready up or pick power-ups, so nobody waits for them
const isBotId = (id) => !!mp.lobby?.players.find((p) => p.id === id)?.bot;
function prepNeeded() {
  const ids = player.dead ? [] : ['me'];
  if (isCoop()) for (const a of mp.avatars.values()) if (a.alive && !isBotId(a.id)) ids.push(a.id);
  if (!ids.length && isCoop()) for (const a of mp.avatars.values()) if (!isBotId(a.id)) ids.push(a.id);
  return ids;
}
function setReady() {
  if (prep.me) return;
  prep.me = true;
  audio.click?.(1.2, 0.4);
  if (simHost()) prep.ready.add('me');
  else mp.relay('host', { k: 'waveready' });
}
let nearAmmo = false;
function updateReadyUp() {
  if (zombieGame() && game.phase === 'evac' && evac.on && game.state === 'playing') {
    const el = $('wave-ready');
    el.classList.remove('hidden');
    document.body.classList.remove('can-ready');
    const left = Math.max(0, Math.ceil(EVAC_HOLD - evac.hold));
    const html = `<div class="wr-title">🚁 GET TO THE CHOPPER</div><div>Everyone still standing must be in the yellow circle · ${left}s to go</div><div class="i-bar"><i style="width:${Math.round((evac.hold / EVAC_HOLD) * 100)}%"></i></div>`;
    if (last.waveReady !== html) {
      last.waveReady = html;
      el.innerHTML = html;
    }
    return;
  }
  const on = zombieGame() && game.phase === 'prep' && game.state === 'playing';
  const key = player.keys.has('KeyE') || player.keys.has('KeyN');
  if (on && key && !prep.keyWas && !nearAmmo && !document.body.classList.contains('can-revive')) setReady();
  prep.keyWas = key;
  document.body.classList.toggle('can-ready', on && !prep.me);
  const el = $('wave-ready');
  el.classList.toggle('hidden', !on);
  if (!on) return;
  const how = controls.mode === 'touch' ? 'Tap <b>✚</b>' : controls.mode === 'pad' ? 'Press <b>X</b>' : 'Press <b>E</b>';
  let squad = '';
  if (isCoop()) {
    const rd = simHost() ? prep.ready.size : prep.rd;
    const nd = simHost() ? prepNeeded().length : prep.nd;
    const left = Math.max(0, Math.ceil(simHost() ? prep.t : prep.left || 0));
    squad = `<div class="wr-squad">${rd}/${nd} ready${left ? ` · starts anyway in ${left}s` : ''}</div>`;
  }
  const nm = isCoop() && !simHost() ? prep.nextMod : game.nextMod;
  const ns = isCoop() && !simHost() ? prep.nextSpecial : game.nextSpecial;
  const twist = `${nm && MODIFIERS[nm] ? `<div class="wr-mod">Next wave: <b>${MODIFIERS[nm].name}</b> · ${MODIFIERS[nm].desc}</div>` : ''}${ns && SPECIALS[ns] ? `<div class="wr-mod">⚠️ <b>${SPECIALS[ns].name}</b> · ${SPECIALS[ns].desc}</div>` : ''}`;
  let html = prep.me
    ? `<div class="wr-title ok">✔ READY</div><div>${isCoop() ? 'Waiting for your squad…' : 'Here they come…'}</div>${squad}`
    : `<div class="wr-title">WAVE ${game.wave + 1} IS WAITING</div><div>Build, restock, buy perks and get in position. ${how} when you're ready</div>${squad}`;
  html += twist + (zombieGame() ? `<div class="wr-squad">💵 ${points()} points to spend</div>` : '');
  if (last.waveReady !== html) {
    last.waveReady = html;
    el.innerHTML = html;
  }
}

function waveAchievements(w) {
  if (w >= 10) achieve('wave10');
  if (w >= 20) achieve('wave20');
  if (w >= 30) achieve('wave30');
  if (game.mod) achieve('modifier');
}

function coopRevive() {
  player.dead = false;
  player.health = stats.maxHealth;
  $('respawn').classList.add('hidden');
}

const overhealCap = () => stats.maxHealth + stats.overheal;

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

// Co-op: everyone vs the zombies. The host's game runs the zombies and waves; the others mirror them.
const isCoop = () => game.mode === 'mp' && mp.inMatch && !!MODES[mp.mode]?.coop;
// Defend the Points: a co-op run where the squad also has to hold points A, B and C
const isDefend = () => isCoop() && mp.mode === 'defend';
const zombieGame = () => game.mode === 'solo' || isCoop();
// an event match: Red vs Blue vs the zombies (the host's game runs the zombies, the server keeps everyone's health)
const isEvent = () => game.mode === 'mp' && mp.inMatch && !!MODES[mp.mode]?.event;
const zombiesOn = () => zombieGame() || isEvent();
const simHost = () => game.mode === 'solo' || ((isCoop() || isEvent()) && mp.isHost());
const coop = { remaining: 0, ready: new Set(), pickT: 0, snapT: 0, scoreT: 0 };
const defend = new DefendPoints(scene);

const targets = () => (zombieGame() ? zombies.parts : isEvent() ? zombies.parts.concat(mp.parts) : mp.parts).concat(world.solids, structures.meshes);

function fireShot(moving, speed) {
  const def = weapon.def;
  if (def.melee) return meleeAttack();
  audio.shot(def.sound, stats.explosive > 0);
  player.addRecoil(def.recoil * (1 - weapon.ads * 0.4) * (player.crouching ? 0.7 : 1));
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  camera.getWorldPosition(_origin);
  weapon.muzzleWorld(_muzzle);
  if (ev.tp.dist) {
    // third person: shots start level with you (not behind you at the camera) and come out of your character's gun
    _origin.addScaledVector(_dir, ev.tp.dist);
    if (ev.myAvatar) ev.myAvatar.gunHolder.getWorldPosition(_muzzle).addScaledVector(_dir, 0.7);
  }
  const aimed = weapon.ads;
  const gunSpread = def.hipSpread !== undefined ? def.hipSpread + (def.spread - def.hipSpread) * aimed : def.spread * (def.pellets > 1 ? 1 : 1 - aimed * 0.6);
  const moveSpread = (moving ? 0.006 + speed * 0.0012 : 0) * (1 - aimed * 0.5) + (player.onGround ? 0 : 0.02);
  const pellets = def.pellets * stats.multishot;
  for (let i = 0; i < pellets; i++) {
    const spread = (gunSpread + moveSpread + (def.pellets === 1 && i > 0 ? 0.02 : 0)) * (player.crouching && def.pellets === 1 ? 0.7 : 1);
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
  const far = def.range || 260; // the flamethrower only reaches so far
  raycaster.set(origin, dir);
  raycaster.far = far;
  const hits = raycaster.intersectObjects(targets(), false);
  const groundT = terrainHit(origin, dir, far);
  let pierceLeft = stats.pierce + (def.pierce || 0);
  const struck = new Set();
  let end = null;
  let impact = false;
  for (const h of hits) {
    if (h.distance > groundT) break;
    const ud = h.object.userData;
    const target = ud.zombie || ud.player;
    if (target !== undefined) {
      if (struck.has(target)) continue;
      if (ud.zombie && !ud.zombie.alive) continue;
      if (ud.player !== undefined && (!mp.isAlive(ud.player) || !mp.isEnemy(ud.player))) continue;
      struck.add(target);
      if (ud.zombie) hitZombie(ud.zombie, ud.kind === 'head', h.point, dir, h.distance);
      else hitPlayer(ud.player, ud.kind === 'head', h.point, dir, h.distance);
      impact = true;
      if (pierceLeft-- <= 0) {
        end = h.point.clone();
        break;
      }
    } else {
      if (ud.barrel) {
        if (!ud.barrel.alive) continue;
        detonateBarrel(ud.barrel, true);
      }
      end = h.point.clone();
      impact = true;
      effects.dust(end);
      effects.sparks(end);
      // shooting the other side's barricades and turrets (PvP)
      if (ud.structure && primary && !ud.structure.ally) structureDamage(ud.structure, baseHitDamage(h.distance));
      break;
    }
  }
  if (!end && groundT < far) {
    end = origin.clone().addScaledVector(dir, groundT);
    impact = true;
    effects.dust(end);
  }
  if (!end) end = origin.clone().addScaledVector(dir, def.burn ? far : 120); // fire only reaches so far
  // explosive rounds: one blast per trigger pull, so shotguns don't nuke everything
  if (stats.explosive > 0 && impact && primary) explodeAt(end, 2.6 + (stats.explosive - 1) * 0.9, weapon.damage(stats) * 0.6 * Math.max(1, def.pellets / 3));
  const mut = weapon.mutation;
  if (def.burn) {
    // a jet of fire instead of a tracer, out to where it hits (once per trigger pull, not per pellet)
    if (primary) effects.flames(_muzzle, end);
  } else if (!weapon.scoped) effects.tracer(_muzzle, end, mut ? MUTATIONS[mut].color : 0xffd27a);
  if (game.mode === 'mp' && primary) mp.reportShot(_muzzle, end);
}

function baseHitDamage(distance) {
  const def = weapon.def;
  let dmg = weapon.damage(stats);
  if (def.falloff) {
    const [near, far] = def.falloff;
    dmg *= Math.max(0.25, 1 - Math.max(0, distance - near) / (far - near));
  }
  return dmg;
}

function hitPlayer(id, head, point, dir, distance) {
  let dmg = baseHitDamage(distance);
  if (head) dmg *= 2;
  effects.blood(point, dir, head ? 1.5 : 0.7);
  mp.reportHit(id, dmg, head);
  if (!hitSoundPlayed) {
    audio.hit(head);
    hitSoundPlayed = true;
  }
  showHit(head ? 'head' : '');
  damageNumber(point, dmg, head ? 'head' : '');
}

function hitZombie(z, head, point, dir, distance = 0) {
  const def = weapon.def;
  const mut = weapon.mutation;
  let dmg = baseHitDamage(distance);
  if (cheats.onehit && cheatsOn()) dmg = Math.max(dmg, z.hp + 1);
  const crit = Math.random() < stats.critChance;
  if (head) dmg *= stats.headshotMul;
  else if (game.mod === 'headshots') dmg *= 0.15;
  if (crit) dmg *= 2.5;
  if (mut === 'vampire') player.heal(Math.min(8, dmg * 0.06), overhealCap());
  if (!simHost()) {
    // co-op guest: show the hit, let the host apply it
    effects.blood(point, dir, head ? 1.8 : def.pellets > 1 ? 0.5 : 1);
    z.flashT = 0.08;
    mp.relay('host', { k: 'zhit', id: z.id, dmg: Math.round(dmg), head, mut, slow: stats.slow, src: def.burn ? 'flamer' : null });
    if (!hitSoundPlayed) {
      audio.hit(head || crit);
      hitSoundPlayed = true;
    }
    showHit(head || crit ? 'head' : '');
    damageNumber(point, dmg, head ? 'head' : crit ? 'crit' : '');
    return;
  }
  applyZombieHit(z, dmg, { head, crit, mut, dir, point, slow: stats.slow, shooter: 'me', pellets: def.pellets, src: def.burn ? 'flamer' : null });
}

// Damage a zombie on the machine that runs them (solo, or the co-op host), with mutated-gun powers.
function applyZombieHit(z, dmg, { head = false, crit = false, mut = null, dir = null, point = null, slow = 0, shooter = 'me', pellets = 1, src = null }) {
  if (!z.alive) return;
  if (mut === 'frost' && z.slowT > 0) dmg *= 1.4;
  if (src === 'flamer') zombies.addDot(z, 'fire', 14, 2.5); // the flamethrower sets them alight
  if (!point) point = new THREE.Vector3(z.root.position.x, z.centerY, z.root.position.z);
  if (shooter !== 'me') effects.blood(point, dir, head ? 1.8 : 1);
  else effects.blood(point, dir, head ? 1.8 : pellets > 1 ? 0.5 : 1);
  z.lastHit = shooter;

  // mutated gun powers
  let voided = false;
  if (mut === 'void' && z.typeId !== 'boss' && Math.random() < (head ? 0.08 : 0.035)) {
    voided = true;
    dmg = z.hp + 1;
    effects.burst(point, { count: 30, color: [0xb04dff, 0x6a1fa8, 0xffffff], speed: 4, size: 0.12, life: 0.6, grav: 0, up: 1 });
    subBanner('VOIDED', 0.8);
  }
  if (mut === 'toxic') zombies.addDot(z, 'toxic', (dmg * 0.4) / 3, 3);
  if (mut === 'inferno') {
    zombies.addDot(z, 'fire', 9, 3);
    if (Math.random() < 0.3) audio.ignite();
  }

  const killed = zombies.damage(z, dmg, { slow: mut === 'frost' ? 0.6 : slow, headshot: head, dir });
  if (mut === 'shock') chainLightning(z, point, dmg * 0.5);
  if (!killed && z.typeId !== 'boss' && shooter === 'me') zombies.knockback(z, player.pos, (z.typeId === 'brute' ? 0.02 : 0.06) * (pellets > 1 ? 0.5 : 1));
  if (shooter === 'me') {
    if (!hitSoundPlayed) {
      audio.hit(head || crit);
      hitSoundPlayed = true;
    }
    showHit(killed ? 'kill' : head || crit ? 'head' : '');
    damageNumber(point, dmg, voided ? 'void' : head ? 'head' : crit ? 'crit' : '');
  }
  if (killed) killedBy(z, head, shooter, mut, src);
}

// a squadmate bot's bullet (zombie modes; the host's game runs the bots and the zombies)
const botHitZombie = (z, dmg, point) => applyZombieHit(z, dmg, { point, shooter: 'bot' });
// Who gets the kill: us, or (co-op) a guest whose bullet it was.
// src: what did it ('melee', 'grenade', 'turret' or null for guns), for quests.
function killedBy(z, head, shooter, mut, src = null) {
  worldKill(z, mut);
  if (shooter === 'me' || shooter === undefined) onKill(z, head, src);
  else if (shooter !== 'bot') // a bot's kill (zombie modes) counts for the wave, but nobody's score
    mp.relay(shooter, {
      k: 'kill', type: z.typeId, mut: z.mutated ? 1 : 0, head: !!head, src, bounty: z.bounty ? 1 : 0,
      x: Math.round(z.root.position.x * 10) / 10, y: Math.round(z.root.position.y * 10) / 10, z: Math.round(z.root.position.z * 10) / 10,
    });
}

function chainLightning(from, point, dmg) {
  const near = zombies.list
    .filter((o) => o !== from && o.alive)
    .map((o) => ({ o, d: o.root.position.distanceTo(from.root.position) }))
    .filter((x) => x.d < 6)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  for (const { o } of near) {
    const to = new THREE.Vector3(o.root.position.x, o.centerY, o.root.position.z);
    effects.tracer(point, to, 0x5ff2ff, 0.05, false);
    effects.sparks(to);
    o.lastHit = from.lastHit;
    if (zombies.damage(o, dmg, { slow: 0.3 })) killedBy(o, false, from.lastHit, null);
  }
  if (near.length) audio.zap();
}

function explodeAt(point, radius, dmg, { color = null, hurtsPlayer = false, src = null } = {}) {
  effects.explosion(point, radius / 2.6);
  chainBarrels(point, radius, dmg > 0);
  if (color) effects.burst(point, { count: 30, color, speed: radius * 1.5, size: 0.16, life: 0.7, grav: 4, up: 1.2 });
  if (explosionSoundT <= 0) {
    audio.explosion(point);
    explosionSoundT = 0.09;
  }
  if (hurtsPlayer && zombiesOn()) {
    const d = point.distanceTo(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z));
    if (d < radius) onPlayerHit(null, 30 * (1 - (d / radius) * 0.6), 'blast');
    if ((isCoop() || isEvent()) && simHost()) mp.relay('all', { k: 'boom', x: point.x, y: point.y, z: point.z, r: radius });
  }
  if (!zombiesOn() || dmg <= 0) return;
  if (hurtsPlayer && simHost()) {
    for (const st of [...structures.list]) {
      const d = st.pos.distanceTo(point);
      if (d < radius + 1) structureDamage(st, 150 * (1 - (d / (radius + 1)) * 0.5));
    }
  }
  for (const z of zombies.list) {
    if (!z.alive) continue;
    const p = z.root.position;
    const d = Math.hypot(p.x - point.x, z.centerY - point.y, p.z - point.z);
    if (d > radius + z.radius) continue;
    const fall = 1 - Math.min(1, d / (radius + z.radius)) * 0.5;
    if (!simHost()) {
      mp.relay('host', { k: 'zhit', id: z.id, dmg: Math.round(dmg * fall), head: false, mut: null, slow: stats.slow, src });
      showHit('');
      continue;
    }
    z.lastHit = 'me';
    if (zombies.damage(z, dmg * fall, { slow: stats.slow })) killedBy(z, false, 'me', null, src);
    else showHit('');
  }
}

// ---------------------------------------------------------------- red barrels and ammo crates on the maps
// Shoot a red barrel (or blow something up next to it) and it goes off a moment later, setting off
// its neighbours. Whoever set it off does the damage; everyone else just sees it. They come back after a minute.
const BARREL_R = 5.5;
const BARREL_DMG = 220;
const BARREL_BACK = 60;
function detonateBarrel(b, mine) {
  if (!b.alive) return;
  world.setBarrel(b.id, false);
  barrelsGone.push({ b, t: BARREL_BACK });
  if (mine && game.mode === 'mp') mp.send({ t: 'fx', k: 'barrel', id: b.id });
  const p = new THREE.Vector3(b.x, b.y + 0.6, b.z);
  effects.explosion(p, 1.6);
  effects.burst(p, { count: 26, color: [0xff7a1a, 0xffc04a, 0x3a3632], speed: 9, size: 0.2, life: 0.9, grav: 6, up: 2 });
  explodeAt(p, BARREL_R, mine ? BARREL_DMG * (zombieGame() ? 1 : 0.6) : 0, { src: 'barrel' });
  // it hurts you too if you're standing next to it (PvP damage goes through the server)
  const me = new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z);
  const d = p.distanceTo(me);
  if (zombieGame() && !player.dead && d < BARREL_R) onPlayerHit(null, 45 * (1 - (d / BARREL_R) * 0.7), 'blast');
  if (mine && game.mode === 'mp' && !isCoop()) {
    for (const a of mp.avatars.values()) {
      if (!a.alive || !mp.isEnemy(a.id)) continue;
      const ad = Math.hypot(a.pos.x - p.x, a.pos.y + 1 - p.y, a.pos.z - p.z);
      if (ad < BARREL_R) mp.reportHit(a.id, Math.round(110 * (1 - (ad / BARREL_R) * 0.6)), false);
    }
  }
}
function chainBarrels(point, radius, mine) {
  for (const b of world.explosives || []) {
    if (!b.alive || barrelQueue.some((q) => q.b === b)) continue;
    if (Math.hypot(b.x - point.x, b.y + 0.5 - point.y, b.z - point.z) < radius + 0.5) barrelQueue.push({ b, t: 0.18 + Math.random() * 0.12, mine });
  }
}
// Ammo crates: press E (controller X) next to one. Each crate refills you once every 45 seconds.
const AMMO_CD = 45;
let ammoKeyWas = false;
function updateMapProps(dt) {
  for (let i = pendingBooms.length - 1; i >= 0; i--) {
    const b = pendingBooms[i];
    if ((b.t -= dt) > 0) continue;
    pendingBooms.splice(i, 1);
    explodeAt(b.p, 3, 45, { color: [0xff7a1a, 0xffc04a, 0x5a2a10], hurtsPlayer: true });
  }
  animateEvac(dt);
  for (let i = barrelQueue.length - 1; i >= 0; i--) {
    const q = barrelQueue[i];
    if ((q.t -= dt) > 0) continue;
    barrelQueue.splice(i, 1);
    detonateBarrel(q.b, q.mine);
  }
  for (let i = barrelsGone.length - 1; i >= 0; i--) {
    const g = barrelsGone[i];
    if ((g.t -= dt) > 0) continue;
    // wait until nobody's standing on the spot
    if (Math.hypot(g.b.x - player.pos.x, g.b.z - player.pos.z) < 1.2) continue;
    barrelsGone.splice(i, 1);
    world.setBarrel(g.b.id, true);
  }
  let near = null;
  for (const c of world.ammoCrates || []) {
    const left = ammoCd.get(c) || 0;
    if (left > 0) {
      ammoCd.set(c, left - dt);
      if (left - dt <= 0) c.lamp.material.color.setHex(0x5aff6a);
    }
    if (!player.dead && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 2 && Math.abs(c.y - player.pos.y) < 1.6) near = c;
  }
  const reviving = document.body.classList.contains('can-revive');
  // perk machines and wall buys (zombie games)
  let shop = null;
  if (!near && zombieGame() && !player.dead) {
    let best = 2.4;
    for (const sh of world.shops || []) {
      const d = Math.hypot(sh.x - player.pos.x, sh.z - player.pos.z);
      if (d < best && Math.abs(sh.y - player.pos.y) < 1.6) {
        best = d;
        shop = sh;
      }
    }
  }
  const key = player.keys.has('KeyE');
  if (shop && !reviving) {
    nearAmmo = true;
    if (key && !ammoKeyWas) buyShop(shop);
    ammoKeyWas = key;
    document.body.classList.add('can-use');
    const el = $('interact');
    el.classList.remove('hidden');
    const html = `${shopLabel(shop)}<div class="muted small">You have 💵 ${points()}</div>`;
    if (last.interact !== html) {
      last.interact = html;
      el.innerHTML = html;
    }
    return;
  }
  const usable = near && !reviving && !(mp.infection && mp.infected);
  nearAmmo = !!usable;
  if (usable && key && !ammoKeyWas && !((ammoCd.get(near) || 0) > 0)) {
    for (const sl of weapon.slots) if (sl.reserve !== Infinity && !sl.def.melee) sl.reserve = Math.max(sl.reserve, weapon.magSize(stats, sl.def) * 5);
    weapon.refillMags(stats);
    giveGrenades(1);
    ammoCd.set(near, AMMO_CD);
    near.lamp.material.color.setHex(0xff3a2a);
    audio.pickup();
    subBanner('🔫 Ammo refilled · +1 grenade', 1.6);
  }
  ammoKeyWas = key;
  document.body.classList.toggle('can-use', !!usable);
  if (reviving) return;
  const el = $('interact');
  el.classList.toggle('hidden', !usable);
  if (usable) {
    const left = Math.ceil(ammoCd.get(near) || 0);
    const html = left > 0 ? `Ammo crate empty · back in <b>${left}s</b>` : 'Press <b>E</b> for ammo';
    if (last.interact !== html) {
      last.interact = html;
      el.innerHTML = html;
    }
  }
}
// a new map: every barrel and crate starts fresh
function resetMapProps() {
  barrelQueue.length = 0;
  barrelsGone.length = 0;
  ammoCd.clear();
  for (const b of world.explosives || []) if (!b.alive) world.setBarrel(b.id, true);
  for (const c of world.ammoCrates || []) c.lamp.material.color.setHex(0x5aff6a);
}

// Bloaters burst in a cloud of toxic gunk, whether they die or reach you.
function bloaterBurst(z) {
  const p = new THREE.Vector3(z.root.position.x, z.centerY, z.root.position.z);
  // the Pumpkin Bomber goes up in a bigger ball of fire
  if (z.typeId === 'pumpkin') explodeAt(p, 5.5, 80, { color: [0xff8a1a, 0xffd23a, 0xff4a10, 0x3a1a08], hurtsPlayer: true });
  else explodeAt(p, 4.5, 70, { color: [0x8dff4a, 0x5ac020, 0xc8ff6a], hurtsPlayer: true });
}

// ---------------------------------------------------------------- grenades
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
grenadeGeo.scale(1, 1, 1.6);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4a5530, roughness: 0.6, emissive: 0x2a1500 });
const _step = new THREE.Vector3();
function launchGrenade(dir) {
  const def = weapon.def;
  const mesh = def.projectile.pumpkin ? jackOLantern(0.42) : new THREE.Mesh(grenadeGeo, grenadeMat); // the Pumpkin Launcher fires jack-o'-lanterns
  mesh.position.copy(_muzzle);
  scene.add(mesh);
  const vel = dir.clone().multiplyScalar(def.projectile.speed);
  vel.y += 1.5;
  projectiles.push({
    mesh, vel, life: 6,
    radius: def.projectile.radius, gravity: def.projectile.gravity,
    damage: weapon.damage(stats),
    pumpkin: !!def.projectile.pumpkin,
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
    const hit = raycaster.intersectObjects(targets(), false)[0];
    let at = hit ? hit.point : null;
    if (!at) {
      const nx = pos.x + _step.x;
      const nz = pos.z + _step.z;
      if (pos.y + _step.y < heightAt(nx, nz)) at = new THREE.Vector3(nx, heightAt(nx, nz) + 0.1, nz);
    }
    if (at || p.life <= 0) {
      const c = at || pos;
      explodeAt(c, p.radius, p.damage, p.pumpkin ? { color: [0xff8a1a, 0xffd23a, 0xe8761a] } : undefined);
      if (game.mode === 'mp') {
        mp.send({ t: 'fx', k: 'boom', p: [c.x, c.y, c.z].map((v) => Math.round(v * 10) / 10) }); // everyone sees it go off
        // splash damage against other players
        for (const a of mp.avatars.values()) {
          if (!a.alive || !mp.isEnemy(a.id)) continue;
          const d = a.pos.distanceTo(c);
          if (d < p.radius + 0.5) mp.reportHit(a.id, p.damage * (1 - (d / (p.radius + 0.5)) * 0.6), false);
        }
      }
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    pos.add(_step);
    p.mesh.lookAt(pos.x + p.vel.x, pos.y + p.vel.y, pos.z + p.vel.z);
    if (Math.random() < 0.6) effects.burst(pos, { count: 1, color: p.pumpkin ? [0xff8a1a, 0xffd23a] : [0x8a8070, 0x6a645a], speed: 0.4, size: 0.12, life: 0.5, grav: -1, up: 0.5 });
  }
}

function clearProjectiles() {
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const g of thrown) scene.remove(g.mesh);
  thrown.length = 0;
}

// Scrap for building barricades and turrets: what each zombie gives.
const SCRAP_FOR = { walker: 1, runner: 1, crawler: 1, spitter: 2, bloater: 2, brute: 4, boss: 15 };

// Gun mastery: kills per gun, sent along with quest progress.
const masteryDelta = {};
function masteryKill(gun) {
  if (!gun) return;
  masteryDelta[gun] = (masteryDelta[gun] || 0) + 1;
  // a new tier right now? (counting kills not sent yet)
  const before = (account.mastery.k[gun] || 0) + masteryDelta[gun] - 1;
  const t = tierFor(before + 1);
  if (t > tierFor(before) && GUNS[gun]) banner(`${MASTERY_TIERS[t - 1].name.toUpperCase()} ${GUNS[gun].name.toUpperCase()}`, 'Gun mastery: new skin unlocked in 🏅 Mastery', 'gold', 2.6);
}

// Quest progress made since it was last sent (see the quests section).
const questDelta = {};
function questAdd(key, n = 1) {
  questDelta[key] = (questDelta[key] || 0) + n;
}
// Sends quest progress (after waves, matches, quitting and once a minute while playing).
let questFlushT = 60;
function flushQuests() {
  const kills = { ...masteryDelta };
  if (Object.keys(kills).length) {
    for (const k of Object.keys(masteryDelta)) delete masteryDelta[k];
    account.addMastery(kills).catch(() => {
      for (const [g, n] of Object.entries(kills)) masteryDelta[g] = (masteryDelta[g] || 0) + n;
    });
  }
  const delta = { ...questDelta };
  if (!Object.keys(delta).length) return;
  for (const k of Object.keys(questDelta)) delete questDelta[k];
  questFlushT = 60;
  account.questProgress(delta).catch(() => {
    for (const [k, n] of Object.entries(delta)) questAdd(k, n); // try again next time
  });
}

// ---------------------------------------------------------------- building (B): barricades and turrets
// Paid for with scrap (kills, cleared waves). Solo builds right away; online the room server
// keeps the list so everyone sees the same things, and the owner's game runs their turrets.
const build = { on: false, kind: 'barricade', rot: 0, x: 0, z: 0, yaw: 0, valid: false, why: '' };
let localStructureId = 1;
const myOwner = () => (game.mode === 'mp' ? mp.myId : 'me');
const freeBuild = () => (cheatsOn() && cheats.build) || tut.on;

function setBuild(on) {
  build.on = on && !player.dead && !mp.infected && !mp.hns; // no building in hide and seek either
  if (!build.on) structures.hideGhost();
  trigger = false;
  aim = false;
  $('build-hud').classList.toggle('hidden', !build.on);
  if (build.on) audio.click(0.8, 0.2);
}

const _foot = { x: 0, z: 0, hx: 0, hz: 0, cos: 1, sin: 0 };
function updateBuildGhost() {
  const def = STRUCTURES[build.kind];
  const dist = build.kind === 'turret' ? 2.6 : 3.2;
  build.x = player.pos.x - Math.sin(player.yaw) * dist;
  build.z = player.pos.z - Math.cos(player.yaw) * dist;
  build.yaw = player.yaw + build.rot;
  build.why = '';
  const cos = Math.cos(build.yaw);
  const sin = Math.sin(build.yaw);
  // try a few points across the footprint: ground has to be open and fairly flat
  const g0 = heightAt(build.x, build.z);
  let ok = Math.hypot(build.x, build.z) < 108;
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    for (const u of [-1, 1]) {
      const lx = t * def.hx;
      const lz = u * def.hz;
      const x = build.x + cos * lx + sin * lz;
      const z = build.z - sin * lx + cos * lz;
      const gy = heightAt(x, z);
      if (Math.abs(gy - g0) > 0.8 || world.colliders.resolve({ x, z }, 0.08, gy, 1.8)) ok = false;
    }
  }
  Object.assign(_foot, { x: build.x, z: build.z, hx: def.hx, hz: def.hz, cos, sin });
  if (world.colliders._dist2(_foot, player.pos.x, player.pos.z) < 0.5 * 0.5) ok = false;
  if (!ok) build.why = "Can't build there";
  else if (game.scrap < def.cost && !freeBuild()) build.why = `Need ${def.cost} scrap`;
  build.valid = !build.why;
  structures.showGhost(build.kind, build.x, build.z, build.yaw, build.valid);
  const opt = (k) => {
    const d = STRUCTURES[k];
    return `<span class="${build.kind === k ? 'on' : ''}"><b>${d.key}</b> ${d.icon} ${d.name} · 🔩${d.cost} <small>(${structures.count(k, myOwner())} built)</small></span>`;
  };
  const html = `<div class="b-title">BUILD MODE · 🔩 ${game.scrap} scrap</div><div class="b-opts">${opt('barricade')}${opt('turret')}</div>
    <div class="b-help">${build.why ? `<b class="bad">${build.why}</b>` : 'Click to place'} · R turn · B or right-click to stop</div>`;
  if (last.buildHtml !== html) {
    last.buildHtml = html;
    $('build-hud').innerHTML = html;
  }
}

function placeStructure() {
  if (!build.valid) {
    subBanner(build.why || "Can't build there", 1.2);
    audio.empty();
    return;
  }
  const def = STRUCTURES[build.kind];
  if (!freeBuild()) game.scrap -= def.cost;
  questAdd('built');
  audio.click(0.5, 0.5);
  const rot = Math.round(build.yaw * 100) / 100;
  if (game.mode === 'mp') mp.send({ t: 'build', kind: build.kind, x: build.x, z: build.z, rot });
  else structures.add({ id: localStructureId++, kind: build.kind, x: build.x, z: build.z, rot, owner: 'me', ally: true });
  if (structures.list.filter((st) => st.owner === myOwner()).length + (game.mode === 'mp' ? 1 : 0) >= 10) achieve('builder');
}

// Damage a barricade or turret. Online the server keeps score (co-op: the host's zombies; PvP: enemies).
function structureDamage(st, dmg) {
  if (!st || st.hp <= 0) return;
  if (game.mode === 'mp') {
    mp.send({ t: 'sdmg', id: st.id, dmg: Math.round(dmg) });
    return;
  }
  structures.setHp(st.id, st.hp - dmg);
  if (st.hp <= 0) {
    structures.remove(st.id, effects);
    audio.explosion(st.pos);
    subBanner(`${st.def.name} destroyed`, 1.4);
  }
}

// online: what the room server says
const allyOf = (owner, team) => owner === mp.myId || isCoop() || (mp.teams && team === mp.myTeam);
function addServerStructure(st) {
  structures.add({ ...st, ally: allyOf(st.owner, st.team) });
}

// Turrets: each player's game aims and fires their own turrets; everyone else's just show the shots.
const _tm = new THREE.Vector3();
const _tt = new THREE.Vector3();
function updateTurrets(dt) {
  for (const st of structures.list) {
    if (st.kind !== 'turret') continue;
    const def = st.def;
    st.cd -= dt;
    st.scan = (st.scan || 0) - dt;
    if (st.scan <= 0) {
      // look for something to shoot a few times a second
      st.scan = 0.2;
      st.target = null;
      let best = def.range * def.range;
      const consider = (pos, y, t) => {
        const d2 = (pos.x - st.x) ** 2 + (pos.z - st.z) ** 2;
        if (d2 >= best) return;
        _tt.set(pos.x, y, pos.z);
        raycaster.set(st.pos, _tt.clone().sub(st.pos).normalize());
        raycaster.far = Math.sqrt(d2);
        if (raycaster.intersectObjects(world.solids, false).length) return;
        best = d2;
        st.target = t;
      };
      if (zombieGame()) {
        for (const z of zombies.list) if (z.alive && z.state !== 'rising') consider(z.root.position, z.centerY, { z });
      } else if (game.mode === 'mp') {
        // PvP: enemies of whoever owns it
        const enemyOf = (id, team) => (mp.teams ? team !== st.team : id !== st.owner);
        for (const a of mp.avatars.values()) if (a.alive && a.id !== st.owner && enemyOf(a.id, mp._team(a.id))) consider(a.pos, a.pos.y + 1.1, { p: a.id });
        if (!player.dead && mp.myId !== st.owner && enemyOf(mp.myId, mp.myTeam)) consider(player.pos, player.pos.y + 1.1, { me: true });
      }
    }
    const t = st.target;
    if (!t) continue;
    const tp = t.z ? t.z.root.position : t.p !== undefined ? mp.avatars.get(t.p)?.pos : player.pos;
    if (!tp || (t.z && !t.z.alive)) {
      st.target = null;
      continue;
    }
    const ty = t.z ? t.z.centerY : tp.y + 1.1;
    st.aim = Math.atan2(-(tp.x - st.x), -(tp.z - st.z));
    if (st.cd > 0) continue;
    st.cd = 1 / def.rate;
    st.model.muzzle.getWorldPosition(_tm);
    _tt.set(tp.x + (Math.random() - 0.5) * 0.3, ty + (Math.random() - 0.5) * 0.3, tp.z + (Math.random() - 0.5) * 0.3);
    effects.tracer(_tm, _tt, 0xffd27a);
    audio.shot('smg', false, st.pos);
    if (st.owner !== myOwner()) continue; // someone else's: just the show
    if (t.z) {
      if (!simHost()) {
        mp.relay('host', { k: 'zhit', id: t.z.id, dmg: def.damage, head: false, mut: null, slow: 0, src: 'turret' });
      } else {
        hitSoundPlayed = true; // no hit sound spam from turrets
        applyZombieHit(t.z, def.damage * (cheatsOn() && cheats.turrets ? 5 : 1), { point: _tt.clone(), shooter: 'me', src: 'turret' });
      }
    } else if (t.p !== undefined) {
      mp.reportHit(t.p, def.pvpDamage, false);
    }
  }
}

// ---------------------------------------------------------------- knife
// Slot 2 (or V for a quick stab whatever you're holding). Hits whatever is right in front of you;
// headshots and stabbing a zombie in the back hit much harder.
const _flat = new THREE.Vector3();
// hide and seek: the seekers' blindfold while they count, and the hint lights they get now and then
function updateBlindfold(dt) {
  const el = $('blindfold');
  const n = mp.seeker && !player.dead ? Math.ceil(mp.countdown) : 0;
  el.classList.toggle('hidden', !n);
  if (n) el.querySelector('b').textContent = n;
  for (const h of hintMarks) {
    h.t -= dt;
    h.g.children[0].material.opacity = Math.min(0.55, h.t / 2) * (0.75 + 0.25 * Math.sin(performance.now() / 120));
    if (h.t <= 0) {
      scene.remove(h.g);
      for (const m of h.g.children) m.geometry.dispose(), m.material.dispose();
    }
  }
  for (let i = hintMarks.length - 1; i >= 0; i--) if (hintMarks[i].t <= 0) hintMarks.splice(i, 1);
}
const hintMarks = [];
// a tall red light (and a ring on the ground) where someone is hiding, give or take a few metres
function addHintMark(x, z) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(beam, ring);
  g.position.set(x, heightAt(x, z), z);
  scene.add(g);
  hintMarks.push({ g, t: 10 });
}
// ---- Halloween candy: zombies drop sweets; walk over them (they drift to you when you're close). The server
// keeps the count (a few at a time, so it can check you're not collecting too fast).
const candy = { list: [], pending: 0, flushT: 0, said: false };
function dropCandy(kind, x, y, z) {
  const [chance, n] = CANDY_DROPS[kind] || CANDY_DROPS.zombie;
  if (Math.random() > chance) return;
  // a boss drops a pile, a few pieces each worth more
  const pieces = Math.min(n, 5);
  for (let i = 0; i < pieces; i++) {
    const g = candyPiece();
    g.position.set(x + (Math.random() - 0.5) * 1.6, Math.max(y, heightAt(x, z)) + 0.4, z + (Math.random() - 0.5) * 1.6);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    candy.list.push({ g, worth: Math.ceil(n / pieces), t: 45, vy: 3 + Math.random() * 2 });
  }
}
function updateCandy(dt) {
  const show = isHalloween() && ['playing', 'paused', 'choosing'].includes(game.state);
  const hud = $('candy-hud');
  hud.classList.toggle('hidden', !show);
  if (show) hud.textContent = `🍬 ${account.candy + candy.pending}`;
  for (let i = candy.list.length - 1; i >= 0; i--) {
    const c = candy.list[i];
    c.t -= dt;
    const p = c.g.position;
    const floor = heightAt(p.x, p.z) + 0.3;
    // pops out, falls, then bobs and spins
    c.vy -= 14 * dt;
    p.y = Math.max(floor + Math.sin(c.t * 3) * 0.06, p.y + c.vy * dt);
    c.g.rotation.y += dt * 2.5;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < 4 && !player.dead) {
      // drifts to you
      p.x += ((player.pos.x - p.x) / (d || 1)) * Math.min(d, dt * 9);
      p.z += ((player.pos.z - p.z) / (d || 1)) * Math.min(d, dt * 9);
    }
    if ((d < 1.2 && !player.dead) || c.t <= 0 || !show) {
      if (d < 1.2 && show) {
        candy.pending += c.worth;
        audio.pickup();
        if (!account.loggedIn && !candy.said) {
          candy.said = true;
          subBanner('🍬 Log in to keep your candy and spend it', 2.5);
        }
      }
      scene.remove(c.g);
      candy.list.splice(i, 1);
    }
  }
  candy.flushT -= dt;
  if (candy.pending > 0 && candy.flushT <= 0 && account.loggedIn) {
    candy.flushT = 4;
    const n = candy.pending;
    account.claimCandy(n).then((got) => (candy.pending = Math.max(0, candy.pending - got)), () => {});
  }
}
// hide and seek: hiders can't fight back, and seekers can't tag anyone while they're still counting
function hnsNoAttack() {
  if (!mp.hns || account.admin) return false; // admins can fight in any mode
  if (!mp.seeker) subBanner("Hiders can't attack: stay hidden!", 0.9);
  else if (mp.countdown > 0) subBanner('Still counting…', 0.9);
  else return false;
  return true;
}
function meleeAttack() {
  if (hnsNoAttack()) return;
  const def = GUNS.knife;
  audio.swing();
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  camera.getWorldPosition(_origin);
  raycaster.set(_origin, _dir);
  raycaster.far = def.range;
  let target = null;
  let head = false;
  let point = null;
  for (const h of raycaster.intersectObjects(targets(), false)) {
    const ud = h.object.userData;
    if (ud.zombie) {
      if (!ud.zombie.alive) continue;
      target = { z: ud.zombie };
    } else if (ud.player !== undefined) {
      if (!mp.isAlive(ud.player) || !mp.isEnemy(ud.player)) continue;
      target = { p: ud.player };
    } else {
      effects.sparks(h.point);
      audio.click(1.6, 0.3);
      return;
    }
    head = ud.kind === 'head';
    point = h.point.clone();
    break;
  }
  // a forgiving cone so you don't have to be pixel perfect up close
  if (!target) {
    _flat.set(_dir.x, 0, _dir.z).normalize();
    let best = def.range + 0.6;
    const consider = (pos, r, t) => {
      const dx = pos.x - player.pos.x;
      const dz = pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) - r;
      if (d > best || Math.abs(pos.y - player.pos.y) > 2) return;
      if ((dx * _flat.x + dz * _flat.z) / (Math.hypot(dx, dz) || 1) < 0.7) return;
      best = d;
      target = t;
    };
    if (zombieGame()) for (const z of zombies.list) if (z.alive) consider(z.root.position, z.radius, { z });
    if (game.mode === 'mp' && !isCoop()) for (const a of mp.avatars.values()) if (a.alive && mp.isEnemy(a.id)) consider(a.pos, 0.4, { p: a.id });
    if (!target) return;
    const tp = target.z ? target.z.root.position : mp.avatars.get(target.p).pos;
    point = new THREE.Vector3(tp.x, target.z ? target.z.centerY : tp.y + 1.2, tp.z);
  }
  let dmg = def.damage * stats.damageMul;
  if (target.p !== undefined) {
    if (head) dmg *= 1.5;
    effects.blood(point, _dir, 1.2);
    mp.reportHit(target.p, dmg, head, true);
    audio.hit(head);
    showHit(head ? 'head' : '');
    damageNumber(point, dmg, head ? 'head' : '');
    return;
  }
  const z = target.z;
  // in the back: the zombie faces the same way we're looking
  const back = Math.sin(z.root.rotation.y) * _dir.x + Math.cos(z.root.rotation.y) * _dir.z > 0.5;
  if (head) dmg *= stats.headshotMul;
  if (back) {
    dmg *= 2;
    subBanner('BACKSTAB', 0.7);
  }
  if (cheats.onehit && cheatsOn()) dmg = Math.max(dmg, z.hp + 1);
  if (z.typeId !== 'boss' && z.hp > 0 && z.hp <= z.maxHp * 0.3) {
    dmg = Math.max(dmg, z.hp + 5);
    finisher(point);
  }
  if (!simHost()) {
    effects.blood(point, _dir, 1.4);
    z.flashT = 0.08;
    mp.relay('host', { k: 'zhit', id: z.id, dmg: Math.round(dmg), head, mut: null, slow: 0, src: 'melee' });
    audio.hit(head);
    showHit(head ? 'head' : '');
    damageNumber(point, dmg, head ? 'head' : '');
    return;
  }
  hitSoundPlayed = false;
  applyZombieHit(z, dmg, { head, dir: _dir.clone(), point, shooter: 'me', src: 'melee' });
  if (z.alive) zombies.knockback(z, player.pos, 0.12);
}

// ---------------------------------------------------------------- hand grenades (G)
// Thrown in an arc, bounce, and go off after a short fuse. You carry up to MAX_GRENADES
// (+ the Grenadier upgrade); you get more for clearing a wave and when you respawn.
const MAX_GRENADES = 4;
const thrown = [];
const fragGeo = new THREE.SphereGeometry(0.075, 10, 8);
const fragMat = new THREE.MeshStandardMaterial({ color: 0x3e4a2a, roughness: 0.7 });
const fragPin = new THREE.MeshStandardMaterial({ color: 0xbfae7a, metalness: 0.6, roughness: 0.4 });
let throwCd = 0;
const maxGrenades = () => MAX_GRENADES + (zombieGame() ? account.items.grenadier || 0 : 0);
function giveGrenades(n) {
  game.grenades = Math.min(maxGrenades(), game.grenades + n);
}

function throwGrenade() {
  if (player.dead || throwCd > 0) return;
  if (mp.infected) return subBanner(mp.hns ? 'Seekers only tag (knife)' : 'Zombies only have claws', 0.8);
  if (mp.hns) return subBanner('No grenades in hide and seek', 0.8);
  const free = cheatsOn() && cheats.grenades;
  if (game.grenades <= 0 && !free) {
    subBanner('No grenades', 0.8);
    audio.empty();
    return;
  }
  if (!free) game.grenades--;
  throwCd = 0.7;
  audio.swing(0.7);
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  camera.getWorldPosition(_origin);
  const mesh = new THREE.Mesh(fragGeo, fragMat);
  const pin = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10), fragPin);
  pin.position.y = 0.08;
  mesh.add(pin);
  mesh.position.copy(_origin).addScaledVector(_dir, 0.6);
  mesh.position.y -= 0.15;
  scene.add(mesh);
  const vel = _dir.clone().multiplyScalar(16);
  vel.y += 3.5;
  vel.x += player.vel.x * 0.5;
  vel.z += player.vel.z * 0.5;
  thrown.push({ mesh, vel, fuse: 2.1, bounced: 0 });
  tut.threw = true;
  questAdd('grenades');
}

const _next = new THREE.Vector3();
function updateThrown(dt) {
  throwCd = Math.max(0, throwCd - dt);
  for (let i = thrown.length - 1; i >= 0; i--) {
    const g = thrown[i];
    g.fuse -= dt;
    const pos = g.mesh.position;
    g.vel.y -= 20 * dt;
    _next.copy(pos).addScaledVector(g.vel, dt);
    // walls, cars and wrecks: bounce off
    const bx = _next.x;
    const bz = _next.z;
    world.colliders.resolve(_next, 0.1, _next.y - 0.05, 0.15, 0);
    if (Math.abs(_next.x - bx) > 1e-4 || Math.abs(_next.z - bz) > 1e-4) {
      g.vel.x *= -0.4;
      g.vel.z *= -0.4;
    }
    const floor = Math.max(heightAt(_next.x, _next.z), world.colliders.floorAt(_next.x, _next.z, 0.05, pos.y + 0.3));
    if (_next.y < floor + 0.075) {
      _next.y = floor + 0.075;
      if (g.vel.y < -2.5 && g.bounced < 4) audio.click(1.5 - g.bounced * 0.2, 0.25);
      g.vel.y = Math.abs(g.vel.y) * 0.32;
      g.vel.x *= 0.5;
      g.vel.z *= 0.5;
      g.bounced++;
    }
    pos.copy(_next);
    g.mesh.rotation.x += dt * Math.hypot(g.vel.x, g.vel.z) * 3;
    if (g.fuse <= 0) {
      scene.remove(g.mesh);
      thrown.splice(i, 1);
      grenadeBlast(pos.clone().setY(pos.y + 0.2));
    }
  }
}

function grenadeBlast(at) {
  const radius = 6.5;
  explodeAt(at, radius, 240 * stats.damageMul, { src: 'grenade' });
  if (game.mode === 'mp') {
    mp.send({ t: 'fx', k: 'boom', p: [at.x, at.y, at.z].map((v) => Math.round(v * 10) / 10) });
    if (!isCoop()) {
      for (const a of mp.avatars.values()) {
        if (!a.alive || !mp.isEnemy(a.id)) continue;
        const d = Math.hypot(a.pos.x - at.x, a.pos.y + 1 - at.y, a.pos.z - at.z);
        if (d < radius) mp.reportHit(a.id, 150 * (1 - (d / radius) * 0.7), false);
      }
      for (const st of [...structures.list]) if (!st.ally && st.pos.distanceTo(at) < radius) structureDamage(st, 120);
    }
  }
}

// ---------------------------------------------------------------- supply drops
// Gun Game and Infection give you your guns: nothing to pick up there.
const fixedGuns = () => game.mode === 'mp' && mp.inMatch && !account.admin && (!!MODES[mp.mode]?.gungame || mp.infected || mp.oitc || mp.isJugg); // admins pick up guns anywhere
let soloDropT = 50;
let soloDropId = 1;
function soloSupplyDrop(near = null) {
  let spot = near;
  if (!spot) {
    const far = world.lootSpots.filter((s) => Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 18 && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 70);
    const list = far.length ? far : world.lootSpots;
    const s = list[Math.floor(Math.random() * list.length)];
    spot = { x: s.x + 1.5, z: s.z - 1.5 };
  }
  const guns = ['smg', 'shotgun', 'revolver', 'lmg', 'dmr', 'dmr', 'lmg', 'sniper', 'launcher'];
  announceDrop();
  supply.add({ id: soloDropId++, x: spot.x, z: spot.z, gun: guns[Math.floor(Math.random() * guns.length)], land: near ? 4 : undefined });
}
function announceDrop() {
  subBanner('📦 SUPPLY DROP INCOMING · look for the red smoke', 2.6);
  audio.waveStart?.();
}
// what you get from a crate: full health and a gun with lots of ammo
function openSupply(gun) {
  const coop = game.mode === 'solo' || isCoop();
  if (coop) player.health = Math.max(player.health, stats.maxHealth);
  let what = 'full health';
  if (gun && GUNS[gun] && !fixedGuns() && backpackFull(gun)) {
    openInventory({ id: gun, mut: null, done: () => {
      const slot = weapon.slots.find((s) => s.def.id === gun);
      if (slot && slot.reserve !== Infinity) slot.reserve = Math.max(slot.reserve, weapon.magSize(stats, GUNS[gun]) * 6);
    } });
    what = `${GUNS[gun].icon} ${GUNS[gun].name} (your backpack is full) + full health`;
  } else if (gun && GUNS[gun] && !fixedGuns()) {
    weapon.give(gun, stats);
    const slot = weapon.slots.find((s) => s.def.id === gun);
    if (slot && slot.reserve !== Infinity) slot.reserve = Math.max(slot.reserve, weapon.magSize(stats, GUNS[gun]) * 6);
    what = `${GUNS[gun].icon} ${GUNS[gun].name} + full health`;
  }
  if (!mp.infected) {
    giveGrenades(1);
    what += ' + a grenade';
  }
  audio.pickup();
  banner('📦 SUPPLY DROP', what, 'gold', 2.2);
  questAdd('medkits');
}
// Live leaderboard: logged-in players send the wave they're on while a zombie run is going.
const live = { t: 0, wave: 0, on: false };
function updateLive(dt) {
  if (game.mode === 'solo' || !account.loggedIn || !zombieGame() || usingCheats() || game.wave < 1) return; // (solo: the timer below)
  live.t -= dt;
  if (live.wave === game.wave && live.t > 0) return;
  live.t = 15;
  live.wave = game.wave;
  live.on = true;
  account.live(game.wave, game.score);
}
// solo: every few seconds, even while paused, so an admin can drop in quickly
setInterval(() => {
  if (game.mode !== 'solo' || !['playing', 'paused', 'choosing'].includes(game.state)) return;
  if (!account.loggedIn || usingCheats() || game.wave < 1 || game.phase === 'tutorial') return;
  live.wave = game.wave;
  live.on = true;
  account.live(game.wave, game.score).then((r) => r?.dropin && adminDropin(r.dropin));
}, 6000);
// An admin wants to join this solo game: it's saved, then carries on as a private co-op game at the same wave
let droppingIn = false;
async function adminDropin(admin) {
  if (droppingIn || game.mode !== 'solo' || game.weekly || tut.on || mp.lobby) return;
  droppingIn = true;
  persistRun(); // the solo game stays in Saved Games
  endLive();
  banner(`⭐ ${admin} IS JOINING`, 'Your game turns into co-op at the same wave', 'gold', 2.6);
  mp.dropinMap = game.map;
  const err = await mp.create();
  mp.dropinMap = null;
  droppingIn = false;
  if (err) subBanner(`Couldn't open your game to ${admin}: ${err}`, 3);
}
function endLive() {
  if (live.on) account.liveEnd();
  live.on = false;
  live.wave = 0;
  live.t = 0;
}

function updateSupply(dt) {
  if (!supply) return;
  supply.update(dt, player.pos, !player.dead, (d) => {
    if (game.mode === 'mp') mp.send({ t: 'loot', id: d.id });
    else {
      supply.remove(d.id);
      openSupply(d.gun);
    }
  });
  // solo: a crate every minute or so while the waves are on
  if (game.mode === 'solo' && !tut.on && game.wave >= 1) {
    soloDropT -= dt;
    if (soloDropT <= 0) {
      soloDropT = 70 + Math.random() * 35;
      if (supply.items.size < 2) soloSupplyDrop();
    }
  }
}

// ---- gun game and infection: the mode decides your guns (admins keep theirs as well, in every mode)
function modeLoadout() {
  const fixed = modeLoadoutBase();
  if (fixed && account.admin) adminGuns();
  return fixed;
}
// an admin's own guns on top of what the mode gives: the rifle, their starting gun and special gear (unlimited ammo)
function adminGuns() {
  const add = (id) => {
    if (!GUNS[id] || weapon.slots.some((s) => s.def.id === id)) return;
    weapon.slots.push({ def: GUNS[id], ammo: weapon.magSize(stats, GUNS[id]), reserve: Infinity, mut: null });
  };
  add('rifle');
  const own = account.items.loadout;
  if (own && account.items[`gun_${own}`]) add(own);
  for (const gid of ['flamer', 'bazooka']) if (ownsGear(account.items, gid)) add(gid);
}
function modeLoadoutBase() {
  if (game.mode !== 'mp' || !mp.inMatch) return false;
  const mode = MODES[mp.mode];
  document.body.classList.toggle('infected', mp.infected && !mp.hns);
  document.body.classList.toggle('seeker', mp.seeker);
  if (mode.hns) {
    // everyone has just the knife: seekers tag with it (a bit faster on their feet), hiders can't use it
    stats.speedMul = mp.seeker ? 1.1 : 1;
    weapon.setOnly(['knife'], stats);
    game.grenades = 0;
    setBuild(false);
    return true;
  }
  if (mode.gungame) {
    const ladder = mp.ladder;
    const id = ladder[Math.min(mp.myLevel || 0, ladder.length - 1)];
    weapon.setOnly(id === 'knife' ? ['knife'] : [id, 'knife'], stats);
    return true;
  }
  if (mode.oitc) {
    weapon.setOnly(['revolver', 'knife'], stats);
    const slot = weapon.slots[0];
    slot.reserve = 0;
    slot.ammo = 1;
    game.grenades = 0;
    return true;
  }
  if (mode.jugg) {
    stats.speedMul = mp.isJugg ? 0.85 : 1;
    if (mp.isJugg) {
      weapon.setOnly(['lmg', 'knife'], stats);
      return true;
    }
  }
  if (mode.infection) {
    stats.speedMul = mp.infected ? 1.2 : 1;
    if (mp.infected) {
      weapon.setOnly(['knife'], stats);
      game.grenades = 0;
      setBuild(false);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the backpack
// At most MAX_GUNS guns (the knife doesn't count). A new one when it's full: pick a gun to swap out (it drops on the
// ground), or leave it. The player sets the order (I): the number keys follow it.
const MAX_GUNS = 10;
const inv = { swap: null, pick: -1, skip: null };
const gunCount = () => weapon.slots.filter((s) => !s.def.melee).length;
const backpackFull = (id) => gunCount() >= MAX_GUNS && !GUNS[id]?.melee && !weapon.slots.some((s) => s.def.id === id);
const invOpen = () => !$('inventory').classList.contains('hidden');
// swap: { id, mut, done(slot) } a gun that wants in (from the ground, a wall buy or a supply drop)
function openInventory(swap = null) {
  if (fixedGuns() || player.dead || !['playing', 'paused'].includes(game.state)) return;
  inv.swap = swap;
  inv.pick = -1;
  trigger = false;
  aim = false;
  player.keys.clear();
  game.state = 'paused'; // (before the mouse is let go, so it doesn't show the pause screen)
  showOnly('inventory');
  renderInventory();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInventory() {
  if (inv.swap) inv.skip = { x: player.pos.x, z: player.pos.z }; // left it: don't ask again until they walk away
  inv.swap = null;
  pauseFor('PAUSED', game.mode === 'mp' ? 'The match keeps going! Click to continue' : 'Click to continue');
  lock();
}
function renderInventory() {
  const s = inv.swap;
  const def = s && GUNS[s.id];
  $('inv-title').textContent = s ? `🎒 BACKPACK FULL (${MAX_GUNS} GUNS)` : '🎒 YOUR GUNS';
  $('inv-new').classList.toggle('hidden', !s);
  if (s) $('inv-new').innerHTML = `<div class="inv-slot new" style="--c: ${s.mut ? MUTATIONS[s.mut].css : TIER_CSS[def.tier]}"><span class="inv-ic">${def.icon || '🔫'}</span><span class="inv-n">${esc(s.mut ? `${MUTATIONS[s.mut].name} ${def.name}` : def.name)}</span><span class="inv-a">NEW</span></div>`;
  $('inv-sub').innerHTML = s
    ? 'Pick a gun to swap out for it (it drops on the ground), or cancel to leave it.'
    : `Up to ${MAX_GUNS} guns (the knife doesn't count). Drag a gun onto another, or tap one then another, to swap their places: the number keys follow this order. Tap one and press DROP to leave it on the ground (or X while playing).`;
  $('inv-grid').innerHTML = weapon.slots
    .map((x, i) => {
      const key = i < 9 ? i + 1 : i === 9 ? 0 : '';
      const ammo = x.def.melee ? '' : x.reserve === Infinity ? `${x.ammo} / ∞` : `${x.ammo} / ${x.reserve}`;
      const off = s && x.def.melee; // the knife always stays
      return `<div class="inv-slot ${inv.pick === i ? 'picked' : ''} ${i === weapon.cur ? 'held' : ''} ${off ? 'off' : ''}" draggable="${!s}" data-i="${i}" style="--c: ${x.mut ? MUTATIONS[x.mut].css : TIER_CSS[x.def.tier]}">
        <b class="inv-k">${key}</b><span class="inv-ic">${x.def.icon || '🔫'}</span><span class="inv-n">${esc(weapon.displayName(x))}</span><span class="inv-a">${ammo}</span></div>`;
    })
    .join('');
  $('inv-cancel').classList.toggle('hidden', !s);
  // a gun picked (not the knife): it can be dropped
  $('inv-drop').classList.toggle('hidden', !!s || inv.pick < 0 || !!weapon.slots[inv.pick]?.def.melee);
  $('inv-done').classList.toggle('hidden', !!s);
}
function swapInto(i) {
  const s = inv.swap;
  const old = weapon.slots[i];
  if (!s || !old || old.def.melee) return;
  if (s.fromGround) pickups.take(s.id, s.mut, player.pos);
  pickups.drop(old.def.id, old.mut, player.pos);
  weapon.replace(i, s.id, stats, s.mut);
  s.done?.(i);
  subBanner(`Swapped the ${old.def.name} for the ${GUNS[s.id].name}`, 1.8);
  audio.pickup();
  inv.swap = null;
  inv.skip = { x: player.pos.x, z: player.pos.z }; // (the old gun is at your feet now)
  closeInventory();
}
$('inv-grid').addEventListener('click', (e) => {
  const el = e.target.closest('.inv-slot');
  if (!el) return;
  const i = Number(el.dataset.i);
  if (inv.swap) return swapInto(i);
  if (inv.pick < 0) inv.pick = i;
  else {
    weapon.swap(inv.pick, i);
    inv.pick = -1;
  }
  renderInventory();
});
$('inv-grid').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.inv-slot');
  if (el) e.dataTransfer.setData('text/plain', el.dataset.i);
});
$('inv-grid').addEventListener('dragover', (e) => e.preventDefault());
$('inv-grid').addEventListener('drop', (e) => {
  e.preventDefault();
  const el = e.target.closest('.inv-slot');
  const from = Number(e.dataTransfer.getData('text/plain'));
  if (!el || inv.swap || !Number.isInteger(from)) return;
  weapon.swap(from, Number(el.dataset.i));
  inv.pick = -1;
  renderInventory();
});
// drops a gun on the ground (X while playing: the one you're holding)
function dropGun(i = weapon.cur) {
  if (fixedGuns() || player.dead) return;
  const s = weapon.removeAt(i);
  if (!s) return subBanner("You can't drop the knife", 1.4);
  pickups.drop(s.def.id, s.mut, player.pos);
  inv.skip = { x: player.pos.x, z: player.pos.z }; // (not straight back into your hands)
  subBanner(`Dropped the ${weapon.displayName(s)}`, 1.4);
  audio.click?.(0.6, 0.15);
}
$('inv-drop').addEventListener('click', () => {
  if (inv.pick < 0) return;
  dropGun(inv.pick);
  inv.pick = -1;
  renderInventory();
});
$('inv-done').addEventListener('click', closeInventory);
$('inv-cancel').addEventListener('click', closeInventory);
$('pause-guns').addEventListener('click', (e) => {
  e.stopPropagation();
  openInventory();
});

function onPickGun(id, mut) {
  if (fixedGuns()) return false; // gun game and zombie players keep what the mode gives them
  if (inv.skip) return false; // they just dropped or left the guns here: wait until they walk away
  if (backpackFull(id)) {
    openInventory({ id, mut: mut || null, fromGround: true, done: () => questAdd('gunsPicked') });
    return false;
  }
  const def = GUNS[id];
  const result = weapon.give(id, stats, mut);
  if (result === 'new') questAdd('gunsPicked');
  audio.pickup();
  const name = mut ? `${MUTATIONS[mut].name} ${def.name}` : def.name;
  if (result === 'ammo') subBanner(`+ammo for ${def.name}`, 1.8);
  else if (mut) banner(name.toUpperCase(), MUTATIONS[mut].desc, 'gold', 2.4);
  else subBanner(`Picked up ${name}`, 1.8);
  return true;
}

// What a kill does to the world (runs where the zombies are simulated).
function worldKill(z, mut) {
  const center = new THREE.Vector3(z.root.position.x, z.centerY, z.root.position.z);
  if (game.mod === 'boom' && simHost() && z.typeId !== 'boss') pendingBooms.push({ p: center.clone(), t: 0.35 });
  effects.blood(center, null, 2.5);
  if (z.variant === 'broodmother' && simHost()) {
    summonAround(z, 'crawler', 5);
    bossEvent('hatch');
  }
  if (z.type.bloated) bloaterBurst(z);
  if (mut === 'inferno') {
    // burning spreads to whoever is close
    for (const o of zombies.list) if (o.alive && o.root.position.distanceTo(z.root.position) < 3.5) zombies.addDot(o, 'fire', 9, 3);
  }
}

// Your reward for a kill: score, healing, drops. In co-op the host tells you about your kills.
function onKill(z, head, src = null) {
  rewardKill({ type: z.typeId, mut: z.mutated, head, src, x: z.root.position.x, y: z.root.position.y, z: z.root.position.z, bounty: z.bounty });
}
// kills worth more points and candy (the Halloween specials too)
const SPECIAL_KILLS = ['brute', 'bloater', 'spitter', 'pumpkin', 'phantom', 'witch', 'reaper'];
function rewardKill({ type, mut, head, src = null, x, y, z, bounty = false }) {
  const T = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.walker;
  if (isEvent()) {
    // points for you and your team, and maybe a puzzle piece
    const kind = type === 'boss' ? 'boss' : mut || SPECIAL_KILLS.includes(type) ? 'special' : 'zombie';
    mp.send({ t: 'zkill', kind });
    eventDropChance(kind, x, z);
  }
  if (isHalloween()) dropCandy(type === 'boss' ? 'boss' : mut || SPECIAL_KILLS.includes(type) ? 'special' : 'zombie', x, y, z);
  game.kills++;
  if (src === 'wolf') game.petKills = (game.petKills || 0) + 1;
  achieve('first_kill');
  if (type === 'boss') achieve('boss');
  if (src === 'barrel') {
    if (time - barrelStreak.t > 1.2) barrelStreak.n = 0;
    barrelStreak.t = time;
    if (++barrelStreak.n >= 5) achieve('barrel5');
  }
  if (bounty) {
    const prize = Math.round(1500 * (1 + game.wave * 0.1));
    game.score += prize;
    giveGrenades(2);
    weapon.refillMags(stats);
    banner('🎯 BOUNTY CLAIMED', `+${prize} score · grenades and full mags`, 'gold', 2.4);
    achieve('bounty');
    if (game.mode === 'solo') soloSupplyDrop({ x, z });
  }
  if (game.mod === 'vampire') player.heal(4, overhealCap());
  questAdd('zkills');
  if (head) questAdd('headshots');
  if (mut) questAdd('mutated');
  if (type === 'boss') questAdd('bosses');
  if (src === 'melee' || src === 'grenade' || src === 'turret') questAdd(`${src}Kills`);
  // mastery: the knife for stabs, otherwise the gun in your hands
  if (src === 'melee') masteryKill('knife');
  else if (!src && !weapon.def.melee) masteryKill(weapon.def.id);
  game.scrap = Math.min(999, game.scrap + (SCRAP_FOR[type] ?? 1));
  if (head) {
    game.headshots++;
    headshotPop();
  }
  game.score += Math.round(T.score * (head ? 1.5 : 1) * (mut ? 2 : 1) * (1 + game.wave * 0.1) * (game.night ? NIGHT.score : 1) * (game.mod === 'double' ? 2 : 1));
  if (stats.healOnKill) player.heal(stats.healOnKill, overhealCap());
  audio.kill();
  showHit('kill');
  const pos = { x, y, z };
  const medChance = ({ walker: 0.05, runner: 0.05, crawler: 0.05, spitter: 0.1, bloater: 0.15, brute: 0.35, boss: 1 }[type] ?? 0.05) * (1 + 0.35 * scavengerLevel()) * (game.mod === 'tanky' ? 2 : 1);
  if (Math.random() < medChance) dropMedkit(pos);
  // mutated zombies sometimes drop a mutated gun; bosses always do
  if ((mut && Math.random() < 0.15) || type === 'boss') {
    pickups.spawn(rollGun(), { x, z }, randomMutation());
    subBanner('A mutated gun dropped!', 2);
  }
}

// ---------------------------------------------------------------- force field
// F (controller D-pad left, 🛡️ on phones): a bubble for 8 seconds that zombies can't get into and
// bullets can't get through. Recharges for 45 seconds. Other players see yours.
const SHIELD_TIME = 8;
const SHIELD_CD = 45;
const SHIELD_R = 3.2;
const shield = { cd: 0 };
const shields = new Map(); // 'me' or a player id -> { until, mesh }
const shieldGeo = new THREE.SphereGeometry(SHIELD_R, 24, 16);
function raiseShield(id, secs = SHIELD_TIME) {
  let s = shields.get(id);
  if (!s) {
    const mesh = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(mesh);
    s = { mesh, until: 0 };
    shields.set(id, s);
  }
  s.until = secs > 0 ? time + secs : 0;
}
const shieldUp = () => {
  const s = shields.get('me');
  return !!s && s.until > time;
};
function useShield() {
  if (player.dead || game.state !== 'playing' || (mp.infection && mp.infected) || mp.hns) return;
  const free = cheats.shield && cheatsOn();
  if (shield.cd > 0 && !free) {
    subBanner(`Force field recharging · ${Math.ceil(shield.cd)}s`, 1);
    audio.empty();
    return;
  }
  shield.cd = free ? 0 : SHIELD_CD;
  raiseShield('me');
  if (game.mode === 'mp') mp.send({ t: 'shield' });
  audio.zap?.();
  subBanner('🛡️ FORCE FIELD UP', 1.2);
}
function updateShields(dt) {
  shield.cd = Math.max(0, shield.cd - dt);
  for (const [id, s] of shields) {
    const a = id === 'me' ? null : mp.avatars.get(id);
    const pos = id === 'me' ? player.pos : a?.pos;
    const on = s.until > time && pos && (id === 'me' ? !player.dead : a?.alive);
    s.mesh.visible = !!on;
    if (!on) continue;
    s.mesh.position.set(pos.x, pos.y + 1, pos.z);
    const left = s.until - time;
    s.mesh.material.opacity = (0.14 + Math.sin(time * 6) * 0.04) * (left < 2 && Math.sin(time * 20) < 0 ? 0.3 : 1);
    // zombies get pushed out of the bubble
    if (zombieGame() && simHost()) {
      for (const z of zombies.list) {
        if (!z.alive) continue;
        const zp = z.root.position;
        const dx = zp.x - pos.x;
        const dz = zp.z - pos.z;
        const d = Math.hypot(dx, dz);
        const r = SHIELD_R + z.radius;
        if (d < r && d > 0.01) {
          zp.x = pos.x + (dx / d) * r;
          zp.z = pos.z + (dz / d) * r;
        }
      }
    }
  }
  const el = $('shield-hud');
  const html = shieldUp() ? `🛡️ ON ${Math.ceil(shields.get('me').until - time)}s` : shield.cd > 0 ? `🛡️ ${Math.ceil(shield.cd)}s` : `🛡️ <b>${controls.mode === 'pad' ? '◀' : controls.mode === 'touch' ? '' : 'F'}</b> ready`;
  if (last.shieldHud !== html) {
    last.shieldHud = html;
    el.innerHTML = html;
    el.classList.toggle('ready', shield.cd <= 0 && !shieldUp());
  }
}
function clearShields() {
  for (const s of shields.values()) scene.remove(s.mesh);
  shields.clear();
  shield.cd = 0;
}

function onPlayerHit(z, dmg, kind) {
  if (isEvent()) {
    // events: the server keeps your health (it sends the hurt back)
    if (player.dead || dmg <= 0) return;
    wolfGuard(z);
    mp.send({ t: 'zhurt', dmg: Math.min(80, Math.round(dmg)) });
    return;
  }
  if (!zombieGame() || player.dead) return;
  wolfGuard(z);
  if (tank.on) dmg *= TANK_ARMOUR; // armour
  if (shieldUp()) return; // the force field takes it
  if (game.state !== 'playing' && !isCoop()) return;
  if (cheats.god && cheatsOn()) return;
  player.health -= dmg * (1 - stats.armor);
  vignette = Math.min(1, vignette + (kind === 'acid' ? 0.3 : 0.6));
  if (kind === 'acid') $('vignette').classList.add('acid');
  else $('vignette').classList.remove('acid');
  player.shake = Math.min(1, player.shake + (kind === 'blast' ? 0.9 : 0.45));
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
  if (isCoop()) coopDown();
  else gameOver();
}

// Co-op: you're down until the next wave (or the run ends if everyone is).
function coopDown() {
  setBuild(false);
  player.dead = true;
  player.health = 0;
  trigger = false;
  aim = false;
  mp.send({ t: 'down' });
  const el = $('respawn');
  el.classList.remove('hidden');
  el.innerHTML = "You're <b>down</b>!<br/><span>You'll be back when the next wave starts. Your squad has to survive.</span>";
}

function bossBanner(variant) {
  const B = BOSSES[variant] || BOSSES.abomination;
  banner(B.name.toUpperCase(), B.desc, 'red', 2.4);
  if (isCoop() && mp.isHost()) mp.relay('all', { k: 'bossfx', what: 'arrive', v: variant });
}

// Bosses calling in help: summoned zombies crawl out of the ground around them.
function summonAround(z, type, n) {
  if (zombies.aliveCount > 24) return; // (more would lag)
  for (let i = 0; i < n; i++) {
    const s = zombies.spawn(type, game.wave, z.root.position, false);
    const a = Math.random() * Math.PI * 2;
    const d = 2 + Math.random() * 3;
    const x = z.root.position.x + Math.cos(a) * d;
    const zz = z.root.position.z + Math.sin(a) * d;
    s.root.position.set(x, heightAt(x, zz) - 2 * s.scale, zz);
  }
}

const BOSS_EVENTS = { scream: ['The Screamer calls the horde!', 2], charge: ['The Juggernaut is charging!', 1.4], hatch: ['Crawlers are hatching!', 1.4] };
function bossEvent(kind) {
  const e = BOSS_EVENTS[kind];
  if (e) subBanner(e[0], e[1]);
}

const zombieHooks = {
  summon: (z, type, n) => summonAround(z, type, n),
  bossEvent: (z, kind) => {
    bossEvent(kind);
    if (isCoop() && mp.isHost()) mp.relay('all', { k: 'bossfx', what: kind });
  },
  hitPlayer: (z, dmg, kind, target) => {
    if (target?.point) defend.hit(target.point, dmg);
    else if (!target || target.id === 'me') onPlayerHit(z, dmg, kind);
    else if (isBotId(target.id)) bots.hurt(target.id, dmg, mp); // a squadmate bot (this game runs them)
    else mp.relay(target.id, { k: 'ouch', dmg: Math.round(dmg), kind: kind || 'melee' });
  },
  explode: (z) => {
    zombies.damage(z, 1e9);
    bloaterBurst(z);
  },
  dotKill: (z) => killedBy(z, false, z.lastHit, null),
  hitStructure: (z, st, dmg) => structureDamage(st, dmg),
};

// Everyone the zombies can go after (co-op host: every living player).
function zombieTargets() {
  const list = player.dead ? [] : [{ id: 'me', pos: player.pos }];
  if (isCoop() || isEvent()) for (const a of mp.avatars.values()) if (a.alive) list.push({ id: a.id, pos: a.pos });
  if (isDefend()) list.push(...defend.targets()); // and the points they're trying to take
  return list;
}

// ---------------------------------------------------------------- medkits
const medGeo = new THREE.BoxGeometry(0.55, 0.32, 0.4);
const medMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6, emissive: 0x222222 });
const crossMat = new THREE.MeshBasicMaterial({ color: 0xd42a1f });
// pack = a health pack that sits on the map and respawns (multiplayer)
function dropMedkit(pos, pack = false) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(medGeo, medMat));
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.33, 0.09), crossMat);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.33, 0.3), crossMat);
  g.add(c1, c2);
  const floor = Math.max(heightAt(pos.x, pos.z), world.colliders.floorAt(pos.x, pos.z, 0.2, pos.y + 0.5));
  g.position.set(pos.x, floor + 0.5, pos.z);
  g.userData.base = floor;
  scene.add(g);
  medkits.push({ g, t: 0, pack, away: 0 });
}
function spawnHealthPacks() {
  const spots = [...world.lootSpots].sort(() => Math.random() - 0.5).slice(0, 8);
  for (const s of spots) dropMedkit({ x: s.x + 1.8, y: heightAt(s.x, s.z) + 2, z: s.z + 1.2 }, true);
}
let healCooldown = 0;
function updateMedkits(dt) {
  healCooldown -= dt;
  for (let i = medkits.length - 1; i >= 0; i--) {
    const m = medkits[i];
    m.t += dt;
    m.g.rotation.y += dt * 2;
    m.g.position.y = m.g.userData.base + 0.5 + Math.sin(m.t * 3) * 0.1;
    const d = Math.hypot(m.g.position.x - player.pos.x, m.g.position.z - player.pos.z);
    if (m.pack) {
      // map health pack: heal, then come back 30 seconds later
      if (m.away > 0) {
        m.away -= dt;
        m.g.visible = m.away <= 0;
        continue;
      }
      const near = d < 1.6 && Math.abs(m.g.userData.base - player.pos.y) < 1.5 && !player.dead;
      const pvp = game.mode === 'mp' && !isCoop();
      if (near && healCooldown <= 0 && player.health < (pvp ? stats.maxHealth : overhealCap())) {
        if (pvp) mp.send({ t: 'heal', amount: 40 });
        else player.heal(40, overhealCap());
        healCooldown = 8;
        questAdd('medkits');
        audio.pickup();
        subBanner('+40 HP', 1);
        m.away = 30;
        m.g.visible = false;
      }
      continue;
    }
    m.g.visible = m.t < 20 || Math.sin(m.t * 20) > 0;
    // medkits can overheal you past max health, up to the overheal cap
    const take = d < 1.6 && Math.abs(m.g.userData.base - player.pos.y) < 1.5 && player.health < overhealCap();
    if (take || m.t > 25) {
      if (take) {
        const before = player.health;
        player.heal(30, overhealCap());
        questAdd('medkits');
        audio.pickup();
        subBanner(`+${Math.round(player.health - before)} HP${player.health > stats.maxHealth ? ' (overheal)' : ''}`, 1);
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
  const counts = new Map([...owned].map(([id, o]) => [id, o.count]));
  game.offer = rollOffer(stats, counts);
  // every power-up maxed (nothing left to offer): a bonus card instead, so there's always something to pick
  if (!game.offer.length) game.offer = [{ maxed: true, rarity: 'legendary' }];
  $('choose-title').textContent = `WAVE ${game.wave} SURVIVED`;
  $('cards').innerHTML = game.offer
    .map((o, i) => {
      if (o.maxed)
        return `<div class="card legendary" data-i="${i}">
        <div class="key">${i + 1}</div>
        <div class="rarity">ALL MAXED</div>
        <div class="icon">⭐</div>
        <div class="name">Every power-up maxed</div>
        <div class="desc">Full health, full ammo and +500 score instead</div>
      </div>`;
      const have = owned.get(o.def.id)?.count || 0;
      return `<div class="card ${o.rarity}" data-i="${i}">
        <div class="key">${i + 1}</div>
        <div class="rarity">${RARITY_LABEL[o.rarity].toUpperCase()}</div>
        <div class="icon">${o.def.icon}</div>
        <div class="name">${o.def.name}</div>
        <div class="desc">${o.def.desc(o.value)}</div>
        <div class="owned">Stacks ${have}/${o.def.max}</div>
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
  if (o.maxed) {
    player.health = Math.max(player.health, stats.maxHealth);
    weapon.refillMags(stats);
    game.score += 500;
    audio.powerup('legendary');
    return afterChoice();
  }
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
  afterChoice();
}

// back into the game after picking: ready up (co-op) or the break before the next wave
function afterChoice() {
  if (isCoop()) {
    if (mp.isHost()) coop.ready.add('me');
    else mp.relay('host', { k: 'ready' });
    pauseFor('READY?', 'Click to drop back in · waiting for your squad to pick');
    lock();
    return;
  }
  toPrep(6);
  persistRun();
  pauseFor('READY?', autoWaves() ? 'Click to drop back in · progress saved' : `Click to drop back in · progress saved · wave ${game.wave + 1} starts when you press E`);
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
    .map((o) => `<div class="chip" style="--c: var(--${o.rarity})" title="${o.def.name} ${o.count}/${o.def.max}">${o.def.icon}<span class="n">${o.count > 1 ? '×' + o.count : ''}</span></div>`)
    .join('');
}

$('cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) choose(Number(card.dataset.i));
});

// ---------------------------------------------------------------- UI helpers
let bannerTimer = 0;
let subTimer = 0;
// ---------------------------------------------------------------- chat (top left)
const chatLines = [];
function addChat(name, text, color = '#ffd38a', admin = false) {
  const div = document.createElement('div');
  if (name) {
    const b = document.createElement('b');
    b.style.color = color;
    b.textContent = `${admin ? '⭐' : ''}${name}:`;
    div.append(b, document.createTextNode(text));
  } else {
    div.className = 'sys';
    div.textContent = text;
  }
  $('chat-log').appendChild(div);
  chatLines.push({ div, t: performance.now() });
  while (chatLines.length > 8) chatLines.shift().div.remove();
}
function chatOpen() {
  return !$('chat-input').classList.contains('hidden');
}
function openChat() {
  if (game.mode !== 'mp' || !mp.lobby) return;
  player.keys.clear();
  trigger = false;
  aim = false;
  $('chat').classList.add('open');
  $('chat-input').classList.remove('hidden');
  $('chat-input').focus();
}
function closeChat() {
  $('chat').classList.remove('open');
  $('chat-input').classList.add('hidden');
  $('chat-input').value = '';
  $('chat-input').blur();
}
$('chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) mp.send({ t: 'chat', text });
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});
function updateChat() {
  const now = performance.now();
  for (const l of chatLines) l.div.classList.toggle('old', now - l.t > 9000);
  const show = (game.mode === 'mp' && !!mp.lobby) || (game.mode === 'solo' && !inMenu());
  $('chat').classList.toggle('hidden', !show);
  $('chat-hint').textContent = game.mode === 'mp' && !chatOpen() ? 'T or Enter to chat' : '';
}

function banner(text, sub, cls = '', dur = 2) {
  if (text) addChat(null, sub ? `${text} · ${sub}` : text);
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
  if (!settings.hitmarkers) return;
  $('hitmarker').className = 'show ' + kind;
  hitT = 0.12;
}

function headshotPop() {
  headStreak = headStreakT > 0 ? headStreak + 1 : 1;
  headStreakT = 4;
  const el = $('headshot-pop');
  el.textContent = headStreak > 1 ? `HEADSHOT ×${headStreak}` : 'HEADSHOT';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// floating damage numbers
const dmgNums = [];
function damageNumber(point, dmg, kind) {
  if (!settings.dmgNumbers) return;
  let el = dmgNums.find((d) => d.t <= 0);
  if (!el) {
    if (dmgNums.length > 30) return;
    const node = document.createElement('div');
    $('dmg-numbers').appendChild(node);
    el = { node, t: 0, pos: new THREE.Vector3() };
    dmgNums.push(el);
  }
  el.t = 0.7;
  el.pos.copy(point);
  el.pos.x += (Math.random() - 0.5) * 0.4;
  el.node.textContent = kind === 'void' ? 'VOID' : Math.round(dmg);
  el.node.className = `dn ${kind}`;
}
const _proj = new THREE.Vector3();
function updateDamageNumbers(dt) {
  for (const d of dmgNums) {
    if (d.t <= 0) continue;
    d.t -= dt;
    d.pos.y += dt * 1.2;
    _proj.copy(d.pos).project(camera);
    if (d.t <= 0 || _proj.z > 1) {
      d.node.style.opacity = '0';
      continue;
    }
    d.node.style.opacity = String(Math.min(1, d.t * 3));
    d.node.style.transform = `translate(${((_proj.x + 1) / 2) * innerWidth}px, ${((1 - _proj.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
  }
}

// small markers above every living zombie, plus edge arrows for the last few
const markerTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(16, 30);
  g.lineTo(4, 10);
  g.lineTo(28, 10);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
})();
const markers = [];
function updateZombieMarkers() {
  const list = zombieGame() && zombies ? zombies.list.filter((z) => z.alive) : [];
  while (markers.length < list.length) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 6;
    scene.add(s);
    markers.push(s);
  }
  markers.forEach((m, i) => {
    const z = list[i];
    m.visible = !!z && !inMenu();
    if (!m.visible) return;
    const color = z.typeId === 'boss' ? 0xc86bff : z.mutated ? 0x6dff2a : z.type.ranged ? 0xb6ff4a : 0xff4a3a;
    m.material.color.setHex(color);
    const s = z.typeId === 'boss' ? 0.028 : 0.016;
    m.scale.set(s, s, 1);
    const head = (z.type.crawl ? 0.9 : 2.25) * z.scale;
    m.position.set(z.root.position.x, z.root.position.y + head, z.root.position.z);
  });
  // arrows at the screen edge for the last 5 zombies
  const arrows = $('edge-arrows');
  const remaining = zombieGame() && game.phase === 'active' ? (simHost() ? game.toSpawn + game.bossToSpawn : Math.max(0, coop.remaining - list.length)) : 99;
  let html = '';
  if (remaining === 0 && list.length <= 5 && game.state === 'playing') {
    for (const z of list) {
      _proj.set(z.root.position.x, z.root.position.y + 1, z.root.position.z).project(camera);
      const behind = _proj.z > 1;
      let x = behind ? -_proj.x : _proj.x;
      let y = behind ? -_proj.y : _proj.y;
      if (!behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9) continue;
      const a = Math.atan2(y, x);
      const k = 1 / Math.max(Math.abs(Math.cos(a)) / 0.92, Math.abs(Math.sin(a)) / 0.85);
      x = Math.cos(a) * k;
      y = Math.sin(a) * k;
      html += `<i style="left:${((x + 1) / 2) * 100}%;top:${((1 - y) / 2) * 100}%;transform:translate(-50%,-50%) rotate(${-a}rad)"></i>`;
    }
  }
  if (arrows.innerHTML !== html) arrows.innerHTML = html;
}

const OVERLAYS = ['menu', 'pause', 'inventory', 'choose', 'gameover', 'mp-menu', 'lobby', 'mp-end', 'newgame', 'saves-menu'];
function showOnly(id) {
  // leaving the lobby closes whichever lobby tab was open
  if (id !== 'menu') closeLobbyPages();
  for (const o of OVERLAYS) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', ['menu', 'mp-menu', 'lobby', 'newgame', 'saves-menu'].includes(id));
  $('crosshair').classList.toggle('hidden', id !== null);
  $('solo-hud').classList.toggle('hidden', !zombieGame());
  if (game.mode !== 'mp') $('mp-hud').classList.add('hidden');
}

function pauseFor(title, text) {
  game.state = 'paused';
  trigger = false;
  aim = false;
  $('pause-title').textContent = title;
  $('pause').querySelector('p').textContent = text;
  $('quit-btn').textContent = game.mode === 'mp' ? 'EXIT MATCH' : 'EXIT TO MENU';
  $('resume-btn').textContent = title === 'PAUSED' ? 'RESUME' : 'PLAY';
  renderViewBtn();
  showOnly('pause');
}

const last = {};
function setText(id, v) {
  if (last[id] === v) return;
  last[id] = v;
  $(id).textContent = v;
}

function updateHud(dt) {
  if (zombieGame()) {
    setText('wave-label', game.wave > 0 ? `WAVE ${game.wave}${game.night ? ' 🌙' : ''}` : 'GET READY');
    const remaining = game.phase !== 'active' ? 0 : simHost() ? game.toSpawn + game.bossToSpawn + zombies.aliveCount : coop.remaining;
    setText('zombies-left', game.phase === 'tutorial' ? 'Tutorial' : game.phase === 'active' ? `${remaining} zombie${remaining === 1 ? '' : 's'} left` : game.phase === 'countdown' ? `Wave ${game.wave + 1} in ${Math.max(0, Math.ceil(game.timer))}` : game.phase === 'prep' ? `Wave ${game.wave + 1} · get ready` : game.phase === 'evac' ? '🚁 Hold the landing zone' : 'Wave cleared');
    setText('score', String(game.score));
    setText('kills', `${game.kills} kills`);
    setText('run-coins', `🪙 +${coinsForRun({ mode: 'solo', wave: game.wave, kills: game.kills, headshots: game.headshots })}`);
  }
  setText('weather-label', weather ? weather.name : '');
  const hp = Math.max(0, Math.ceil(player.health));
  setText('health-text', `${hp}`);
  const max = zombieGame() ? stats.maxHealth : 100;
  $('health-fill').style.width = `${Math.max(0, Math.min(1, player.health / max) * 100)}%`;
  const over = Math.max(0, player.health - max);
  $('over-fill').style.width = `${Math.min(100, (over / Math.max(1, stats.overheal)) * 100)}%`;
  $('health-row').classList.toggle('overheal', over > 0);
  const slot = weapon.slot;
  $('ammo').classList.toggle('hidden', !!slot.def.melee);
  setText('ammo-mag', String(slot.ammo));
  setText('ammo-max', slot.reserve === Infinity ? '∞' : String(slot.reserve));
  setText('grenade-count', `💣 ${game.grenades} · 🔩 ${game.scrap}`);
  setText('weapon-name', weapon.displayName().toUpperCase());
  $('weapon-name').style.color = slot.mut ? MUTATIONS[slot.mut].css : TIER_CSS[slot.def.tier];
  $('ammo').classList.toggle('low', slot.ammo <= weapon.magSize(stats) * 0.2);
  $('reload-hint').classList.toggle('show', !slot.def.melee && (weapon.reloading > 0 || slot.ammo === 0));
  setText('reload-hint', weapon.reloading > 0 ? 'RELOADING' : slot.reserve > 0 ? 'PRESS R' : 'NO AMMO');
  const slotsKey = weapon.slots.map((x) => x.def.id + (x.mut || '')).join() + weapon.cur;
  if (last.slots !== slotsKey) {
    last.slots = slotsKey;
    $('slots').innerHTML = weapon.slots
      .map((x, i) => `<div class="slot ${i === weapon.cur ? 'active' : ''}" style="--c: ${x.mut ? MUTATIONS[x.mut].css : TIER_CSS[x.def.tier]}"><b>${i < 9 ? i + 1 : i === 9 ? 0 : '·'}</b>${esc(weapon.displayName(x))}</div>`)
      .join('');
  }
  // sights and scopes
  const def = weapon.def;
  $('scope').classList.toggle('hidden', !weapon.scoped);
  $('scope').className = weapon.scoped ? `scope-${def.scope}` : 'hidden';
  const sight = !weapon.scoped && weapon.ads > 0.85 && def.sight ? def.sight : '';
  $('reticle').className = sight ? `show ${sight}` : '';
  $('crosshair').style.opacity = String(Math.max(0, 1 - weapon.ads * 1.6));

  const boss = zombieGame() ? zombies.boss : null;
  $('boss-bar').classList.toggle('hidden', !boss);
  if (boss) {
    $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    setText('boss-name', (BOSSES[boss.variant] || BOSSES.abomination).name.toUpperCase());
  }

  hitT -= dt;
  if (hitT <= 0) $('hitmarker').className = '';
  bannerTimer -= dt;
  if (bannerTimer <= 0) $('banner').classList.remove('show');
  subTimer -= dt;
  if (subTimer <= 0) $('subbanner').classList.remove('show');
  headStreakT -= dt;

  vignette = Math.max(0, vignette - dt * 1.5);
  const low = player.health / max < 0.3 && !player.dead ? 0.35 + Math.sin(time * 5) * 0.15 : 0;
  $('vignette').style.opacity = String(Math.max(vignette, low));
  const spread = player.moving ? (player.sprinting ? 14 : 7) : 0;
  $('crosshair').style.setProperty('--spread', `${(spread + (player.onGround ? 0 : 8) + weapon.kick * 6) * (player.crouching ? 0.6 : 1)}px`);

  // minimap
  const marks = [];
  if (game.mode === 'mp') marks.push(...mp.minimapMarkers());
  if (supply) marks.push(...supply.minimapMarkers());
  if (evac.on) marks.push({ x: evac.x, z: evac.z, color: '#ffd34d', r: 5 });
  if (zombieGame()) for (const sh of world.shops || []) marks.push({ x: sh.x, z: sh.z, color: sh.kind === 'perk' ? '#ff6ad5' : '#e8c27a', r: 2.4, shape: 'diamond' });
  for (const c of world.ammoCrates || []) marks.push({ x: c.x, z: c.z, color: (ammoCd.get(c) || 0) > 0 ? '#6a6a5a' : '#a8d65a', r: 2.2, shape: 'diamond' });
  if (zombiesOn()) {
    for (const z of zombies.list) {
      if (!z.alive) continue;
      marks.push({ x: z.root.position.x, z: z.root.position.z, color: z.typeId === 'boss' ? '#c86bff' : z.mutated ? '#6dff2a' : '#ff4a3a', r: z.typeId === 'boss' ? 4 : 2.2 });
    }
  }
  for (const m of medkits) if (m.g.visible || m.pack) marks.push({ x: m.g.position.x, z: m.g.position.z, color: '#ffffff', r: 2.2 });
  for (const d of ev.drops) marks.push({ x: d.g.position.x, z: d.g.position.z, color: '#ffd34d', r: 4.5, shape: 'diamond' }); // puzzle pieces
  for (const i of pickups.items) marks.push({ x: i.root.position.x, z: i.root.position.z, color: i.mut ? MUTATIONS[i.mut].css : { rare: '#3d8bff', epic: '#b04dff', legendary: '#ffb020' }[GUNS[i.id].tier], r: 3, shape: 'diamond' });
  minimap.draw(player, marks);
}

// ---------------------------------------------------------------- state
function lock() {
  // touch / controller: no mouse to capture, just carry on playing
  if (controls.pointerFree) {
    if (game.state === 'paused') {
      game.state = 'playing';
      showOnly(null);
    }
    return;
  }
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* the pause screen lets the player click again */
  }
}

function applyProfile() {
  const p = account.profile;
  if (CHARACTERS_LIVE || account.admin) setArmLook(p.look);
  const paint = crosshairPaint(p.crosshair); // a colour, or a gradient (and one colour of it for outlines)
  document.documentElement.style.setProperty('--xh', paint.fill);
  document.documentElement.style.setProperty('--xh-solid', paint.solid);
  $('crosshair').className = `xh-${p.reticle || 'classic'}${$('crosshair').classList.contains('hidden') ? ' hidden' : ''}`; // its shape
  const fin = FINISHES.find((f) => f[0] === p.finish);
  weapon.setFinish(fin && fin[0] !== 'standard' ? fin[3] : null, fin?.[4] || null); // [4]: a Halloween skin's glow
  // gun mastery skins
  const m = account.mastery;
  const skins = {};
  for (const [g, t] of Object.entries(m.s)) if (MASTERY_TIERS[t - 1]) skins[g] = MASTERY_TIERS[t - 1].color;
  weapon.setGunFinishes(skins);
}
account.onChange(applyProfile);

// ---------------------------------------------------------------- your wolf companion
// Bought with real money (the owner switches it on). It walks at its spot by you (right, left, in front
// or behind) and, in zombie modes, bites the zombies closest to you. It levels up from its kills (or levels
// the owner adds), getting stronger and unlocking masteries (shared/cosmetics.js PET_MASTERIES).
let myWolf = null;
const wolfHunt = { prey: null, findT: 0, biteT: 0, howlT: 20, pounce: false };
function updatePets(dt) {
  const p = account.profile;
  const show = p.pet === 'wolf' && ['playing', 'paused', 'choosing'].includes(game.state) && !mp.hns; // a wolf would give away your hiding place
  if (!show) {
    if (myWolf) {
      myWolf.look.root.visible = false;
      myWolf.placed = false; // back at your side next game
    }
    return;
  }
  const lvl = petLevel(account.items);
  const has = (id) => petHas(lvl, id);
  if (!myWolf) myWolf = new Wolf(scene, p.petColor);
  myWolf.look.root.visible = true;
  myWolf.setColor(p.petColor);
  myWolf.setLevel(lvl);
  // hunting: the nearest zombie near you (further with Swift Paws), or whoever just hit you (Guardian)
  const hunting = zombieGame() && !player.dead && game.state === 'playing';
  const reach = has('swift') ? 13 : 9;
  wolfHunt.findT -= dt;
  if (hunting && wolfHunt.findT <= 0 && !(wolfHunt.pounce && wolfHunt.prey?.alive)) {
    wolfHunt.findT = 0.3;
    let best = null;
    let bestD = reach;
    for (const z of zombies.list) {
      if (!z.alive || z.state === 'rising') continue;
      const d = Math.hypot(z.root.position.x - player.pos.x, z.root.position.z - player.pos.z);
      if (d < bestD) (best = z), (bestD = d);
    }
    wolfHunt.prey = best;
    wolfHunt.pounce = false;
  }
  const z = hunting && wolfHunt.prey?.alive ? wolfHunt.prey : null;
  const d = myWolf.update(dt, player.pos, { prey: z ? z.root.position : null, yaw: player.yaw, spot: p.petSpot, fast: has('swift') });
  wolfHunt.biteT -= dt;
  if (z && d < 1.3 + z.radius && wolfHunt.biteT <= 0) {
    wolfHunt.biteT = has('frenzy') ? 0.55 : 1.1;
    myWolf.bite();
    // +8% a level, double with Dire Wolf, and double again for a Guardian pounce
    let dmg = (15 + game.wave * 2) * (1 + (lvl - 1) * 0.08) * (has('dire') ? 2 : 1) * (wolfHunt.pounce ? 2 : 1);
    dmg = Math.round(dmg * (z.typeId === 'boss' ? 0.5 : 1));
    wolfHunt.pounce = false;
    wolfBite(z, dmg);
    if (has('bleed') && simHost()) zombies.addDot(z, 'bleed', 4 + lvl * 0.5, 3);
  }
  // Howl: slows every zombie within 10 m of you
  if (hunting && has('howl')) {
    wolfHunt.howlT -= dt;
    if (wolfHunt.howlT <= 0) {
      const near = zombies.list.filter((o) => o.alive && Math.hypot(o.root.position.x - player.pos.x, o.root.position.z - player.pos.z) < 10);
      if (near.length) {
        wolfHunt.howlT = 20;
        for (const o of near) wolfBite(o, 1, 0.5);
        banner('🌕 HOWL', 'Your wolf slowed the zombies near you', 'gold', 1.2);
      }
    }
  }
}
function wolfBite(z, dmg, slow = 0) {
  if (!simHost()) mp.relay('host', { k: 'zhit', id: z.id, dmg, head: false, mut: null, slow, src: 'wolf' });
  else {
    hitSoundPlayed = true;
    applyZombieHit(z, dmg, { shooter: 'me', src: 'wolf', slow });
  }
}
// Guardian: the wolf goes for whatever just hurt you
function wolfGuard(z) {
  if (!z || !myWolf || account.profile.pet !== 'wolf' || !petHas(petLevel(account.items), 'guardian')) return;
  wolfHunt.prey = z;
  wolfHunt.pounce = true;
}
// ---------------------------------------------------------------- events (admin panel → Events)
// Red vs Blue vs the zombies, seen from behind your character. The host's game keeps zombies coming; kills
// can drop a puzzle piece (only you see your drops) and picking one up asks the server which piece it is.
const ev = { t: 0, spawnT: 0, bossT: 150, drops: [], myAvatar: null, avatarKey: '', tp: { on: false, dist: 0 } };
function eventDirector(dt) {
  ev.t += dt;
  ev.spawnT -= dt;
  const level = Math.min(15, 1 + Math.floor(ev.t / 60)); // gets tougher every minute
  const people = 1 + mp.avatars.size;
  const want = Math.min(32, 6 + people * 3);
  if (ev.spawnT <= 0 && zombies.aliveCount < want) {
    ev.spawnT = 1.2;
    hwIntro(zombies.spawn(hwType(pickType(level), level), level, spawnAnchor(), Math.random() < mutatedChance(level)));
  }
  // a boss every few minutes
  ev.bossT -= dt;
  if (ev.bossT <= 0 && !zombies.list.some((z) => z.alive && z.typeId === 'boss')) {
    ev.bossT = 180;
    zombies.spawn('boss', level, spawnAnchor(), level >= 8);
    banner('👹 A BOSS IS COMING', 'Worth 15 points, and it always drops a piece', 'red', 2.2);
  }
}

const PIECE_SHAPE = (() => {
  // a jigsaw piece: a square with a knob on top and right, a dent on the left
  const s = new THREE.Shape();
  const h = 0.22;
  s.moveTo(-h, -h);
  s.lineTo(h, -h);
  s.lineTo(h, -0.06);
  s.absarc(h + 0.05, 0, 0.07, Math.PI, -Math.PI, true);
  s.lineTo(h, h);
  s.lineTo(0.06, h);
  s.absarc(0, h + 0.05, 0.07, 0, Math.PI, false);
  s.lineTo(-h, h);
  s.lineTo(-h, 0.06);
  s.absarc(-h + 0.05, 0, 0.07, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(-h, -h);
  return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
})();
const pieceMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa000, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffa000, transparent: true, opacity: 0.6, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff9000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
// a glowing 🧩 marker that shows through walls and stays the same size on screen, so a drop is easy to find
const pieceMarkMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,220,90,0.95)');
  grad.addColorStop(0.45, 'rgba(255,170,0,0.45)');
  grad.addColorStop(1, 'rgba(255,170,0,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  // a jigsaw piece: a square with a knob on top and on the right, outlined dark so it shows on snow and sky
  x.beginPath();
  x.moveTo(40, 46);
  x.lineTo(56, 46);
  x.arc(64, 40, 10, Math.PI * 0.8, Math.PI * 0.2, false);
  x.lineTo(88, 46);
  x.lineTo(88, 62);
  x.arc(94, 70, 10, Math.PI * 1.3, Math.PI * 0.7, false);
  x.lineTo(88, 94);
  x.lineTo(40, 94);
  x.closePath();
  x.fillStyle = '#ffd34d';
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = '#3a2200';
  x.stroke();
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false });
})();
// a kill might drop a piece (rarer for plain zombies, always for a boss), boosted by the admin's drop rate
function eventDropChance(kind, x, z) {
  // pieces only come from the piece-hunt event (the Halloween match drops candy instead)
  if (account.eventFor(mp.lobby?.code) === account.hwEvent) return;
  const boost = account.event?.boost || 1;
  if (Math.random() > Math.min(1, (DROP_CHANCE[kind] || 0) * boost)) return;
  if (ev.drops.length >= 4) return;
  const g = new THREE.Group();
  const piece = new THREE.Mesh(PIECE_SHAPE, pieceMat);
  piece.position.z = -0.05;
  piece.scale.setScalar(1.6);
  g.add(piece);
  // easy to spot: a tall bright beam, a pulsing ring on the ground and a marker you see through walls
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.45, 40, 12, 1, true), beamMat);
  beam.position.y = 20;
  g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.85;
  g.add(ring);
  const mark = new THREE.Sprite(pieceMarkMat);
  mark.scale.setScalar(0.11);
  mark.position.y = 1.4;
  mark.renderOrder = 999;
  g.add(mark);
  const y = Math.max(heightAt(x, z), world.colliders.floorAt(x, z, 0.2, 50)) + 0.9;
  g.position.set(x, y, z);
  scene.add(g);
  ev.drops.push({ g, piece, ring, y, t: 45 });
  subBanner('🧩 A puzzle piece dropped! Grab it', 1.6);
  audio.pickup?.();
}
let claiming = false;
function updateEventDrops(dt) {
  for (let i = ev.drops.length - 1; i >= 0; i--) {
    const d = ev.drops[i];
    d.t -= dt;
    d.piece.rotation.y += dt * 2;
    d.ring.scale.setScalar(1 + ((time * 1.5) % 1) * 0.8);
    d.g.position.y = d.y + Math.sin(time * 3) * 0.12;
    const near = isEvent() && !player.dead && Math.hypot(player.pos.x - d.g.position.x, player.pos.z - d.g.position.z) < 1.8 && Math.abs(player.pos.y + 0.9 - d.g.position.y) < 2.5;
    if (d.t > 0 && !near && isEvent()) continue;
    scene.remove(d.g);
    ev.drops.splice(i, 1);
    if (near && !claiming) claimPiece();
  }
}
async function claimPiece() {
  claiming = true;
  try {
    const r = await account.claimPiece();
    showPiece(r, account.items);
  } catch (e) {
    subBanner(e.message, 2);
  }
  claiming = false;
}

// third person in events: your own character in front of the camera, which sits over your right shoulder
const _tpDir = new THREE.Vector3();
const _tpRight = new THREE.Vector3();
const _tpWant = new THREE.Vector3();
const tpRay = new THREE.Raycaster();
// The camera: third person in events, first person elsewhere, unless you switch it (P, the pause menu or Settings).
// Aiming always goes to first person through your sights, like Fortnite; the tank is always third person.
// The switch is saved for the big update: only admins have it until one deploys it (admin panel).
const canSwitchView = () => account.feature('view');
// Hide and seek hiders play in third person too, so they can peek round corners.
const wantThird = () => (canSwitchView() && settings.view !== 'auto' ? settings.view === 'third' : isEvent() || (mp.hns && !mp.seeker));
const thirdPerson = () => !player.dead && !spectate.on && (tank.on || (wantThird() && !(weapon.ads > 0.4 && !weapon.def.melee)));
function toggleView() {
  if (!canSwitchView()) return;
  settings.view = wantThird() ? 'first' : 'third';
  applySettings();
  renderViewBtn();
  banner(settings.view === 'third' ? '👁 THIRD PERSON' : '👁 FIRST PERSON', 'P to switch · aiming looks down your sights', 'gold', 1.2);
}
function renderViewBtn() {
  $('pause-view').classList.toggle('hidden', !canSwitchView());
  $('pause-view').textContent = `👁 VIEW: ${wantThird() ? 'THIRD' : 'FIRST'} PERSON (P)`;
}
function tpCamera() {
  ev.tp.dist = 0;
  if (!thirdPerson()) return;
  camera.updateMatrixWorld();
  camera.getWorldDirection(_tpDir);
  _tpRight.setFromMatrixColumn(camera.matrixWorld, 0);
  const eye = camera.position;
  // behind your shoulder, or well back and above the tank
  let back = tank.on ? 8 : 3.1;
  _tpWant.copy(eye).addScaledVector(_tpRight, tank.on ? 0 : 0.6).add(new THREE.Vector3(0, tank.on ? 2.4 : 0.3, 0));
  // don't go through walls behind you
  const away = _tpWant.clone().addScaledVector(_tpDir, -back).sub(eye);
  const len = away.length();
  tpRay.set(eye, away.normalize());
  tpRay.far = len;
  const hit = tpRay.intersectObjects(world.solids, false)[0];
  if (hit) back = Math.max(0.6, back * (hit.distance / len) - 0.25);
  _tpWant.addScaledVector(_tpDir, -back);
  _tpWant.y = Math.max(_tpWant.y, heightAt(_tpWant.x, _tpWant.z) + 0.35);
  ev.tp.dist = _tpWant.distanceTo(eye);
  camera.position.copy(_tpWant);
}
// your own character (the same one other players see), shown in third person
function updateMyAvatar(dt) {
  const show = (isEvent() || wantThird()) && ['playing', 'paused', 'choosing'].includes(game.state);
  // the 3D characters: in events, or once they're out (admins see the preview); otherwise the block one
  const look = isEvent() || CHARACTERS_LIVE || account.admin ? account.profile.look : null;
  const team = game.mode === 'mp' && mp.inMatch ? mp.myTeam : null;
  const key = show ? `${team}|${JSON.stringify(look)}` : '';
  if (ev.myAvatar && ev.avatarKey !== key) {
    scene.remove(ev.myAvatar.root);
    ev.myAvatar.dispose();
    ev.myAvatar = null;
  }
  ev.avatarKey = key;
  if (!show) return;
  if (!ev.myAvatar) {
    ev.myAvatar = new Avatar({ id: -1, name: account.name, look }, team === 'blue' ? 0x2f6fd0 : 0xc0392b, !!team);
    ev.myAvatar.fresh = true;
    scene.add(ev.myAvatar.root);
  }
  const a = ev.myAvatar;
  a.target.copy(player.pos);
  a.targetYaw = player.yaw;
  a.pitch = player.pitch;
  a.alive = !player.dead;
  a.setGun(weapon.def.id);
  const F = FLAG_BITS;
  a.update(dt, (player.sliding ? F.slide : player.crouching ? F.crouch : 0) | (weapon.ads > 0.5 ? F.aim : 0));
  a.label.visible = false;
  // hidden while you look through your sights (first person) and inside the tank
  a.root.visible = (thirdPerson() || (player.dead && !!a.model && isEvent())) && !tank.on;
}

// the Join Event buttons (Multiplayer, under the room code): the main event (the hourly Outfit Hunt, third person),
// lit up while it's on, and the Halloween match, shown all through Halloween
const fmtLeft = (endsAt) => {
  const left = Math.max(0, endsAt - Date.now());
  const h = Math.floor(left / 3600000);
  const m = Math.ceil((left % 3600000) / 60000);
  if (h >= 48) return `Ends in ${Math.floor(h / 24)} days ${h % 24}h`;
  return `Ends in ${h ? `${h}h ` : ''}${m}m`;
};
function renderEventCard() {
  const btn = $('mp-event');
  const info = $('mp-event-info');
  const e = account.event;
  btn.disabled = !e;
  btn.classList.toggle('live', !!e);
  const pieces = `Your pieces: <b>${totalPieces(account.items)}/${PIECE_COUNT}</b>`;
  if (!e) {
    btn.textContent = '🧩 JOIN EVENT (THIRD PERSON)';
    // the hourly one: back on the hour
    const next = new Date(Math.ceil(Date.now() / 3600000) * 3600000);
    info.innerHTML = `Not on right now: the third-person Outfit Hunt is on every hour from :00 to :30 (next at <b>${next.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b>).`;
  } else {
    btn.textContent = `🧩 JOIN EVENT: ${e.name} (third person)`;
    info.innerHTML = `Red vs Blue vs the zombies, up to ${EVENT_MAX_PLAYERS} a match, seen from behind your character · 🧩 pieces unlock new characters${e.boost > 1 ? ` · <b>${e.boost}× drops!</b>` : ''}<br/>${e.endsAt ? `${fmtLeft(e.endsAt)} · ` : ''}${pieces}`;
  }
  const hw = account.hwEvent;
  $('mp-event-hw').classList.toggle('hidden', !hw);
  $('mp-event-hw-info').classList.toggle('hidden', !hw);
  if (hw) {
    $('mp-event-hw').classList.add('live');
    $('mp-event-hw-info').innerHTML = `🎃 Halloween Night: Red vs Blue vs the pumpkin-head zombies, third person, 🍬 candy and Halloween guns (🧩 pieces are only in the piece-hunt event) · open all through Halloween · ${fmtLeft(hw.endsAt)}`;
  }
}
async function joinEvent(which = null) {
  if (!(which === 'halloween' ? account.hwEvent : account.event)) return;
  if (!account.loggedIn) return accountUI.open('login');
  $('mp-error').textContent = 'Joining the event…';
  // the server picks a room with space (or opens a new one); if it filled up meanwhile, ask for another
  const full = [];
  let err = null;
  for (let i = 0; i < 4; i++) {
    let code;
    try {
      code = (await account.eventRoom(full, which)).code;
    } catch (e) {
      err = e.message;
      break;
    }
    err = await mp.joinEvent(code);
    if (!err || !/full/i.test(err)) break;
    full.push(code);
  }
  $('mp-error').textContent = err || '';
}
$('mp-event-hw').addEventListener('click', () => joinEvent('halloween'));
$('mp-event').addEventListener('click', () => joinEvent());

// the server list (Multiplayer): every public room, by its host. Private rooms only show to people with the code.
async function renderServers() {
  const el = $('mp-servers');
  let r;
  try {
    r = await (await fetch('/api/rooms')).json();
  } catch {
    el.innerHTML = '<p class="muted small">Can\'t reach the server list right now.</p>';
    return;
  }
  if (!r.rooms?.length) {
    el.innerHTML = '<p class="muted small">No public servers right now. Make a room and set it to 🌍 Public, or press Quick play.</p>';
    return;
  }
  el.innerHTML = r.rooms
    .map(
      (s) => `<div class="mp-server ${s.players >= r.max ? 'full' : ''}">
        <button class="mp-host" data-code="${esc(s.code)}" ${s.players >= r.max ? 'disabled' : ''} title="Join ${esc(s.host)}'s server">👑 ${esc(s.host || 'Someone')}</button>
        <span>${esc(MODES[s.mode]?.name || s.mode)} · ${esc(MAPS[s.map]?.name || '')}</span>
        <span class="muted small">${s.playing ? 'playing' : 'in the lobby'}</span>
        <b>${s.players}/${r.max}</b></div>`,
    )
    .join('');
  el.querySelectorAll('[data-code]').forEach(
    (b) =>
      (b.onclick = async () => {
        $('mp-error').textContent = 'Joining…';
        const err = await mp.join(b.dataset.code);
        $('mp-error').textContent = err || '';
        if (err) renderServers();
      }),
  );
}
$('mp-servers-refresh').addEventListener('click', (e) => {
  e.preventDefault();
  renderServers();
});
// fresh while the Multiplayer menu is open
let serversOpen = false;
let serversTick = 0;
setInterval(() => {
  const open = !$('mp-menu').classList.contains('hidden');
  if (open && (!serversOpen || ++serversTick % 3 === 0)) renderServers(); // straight away, then every 6 seconds
  serversOpen = open;
}, 2000);
account.onChange(renderEventCard);
renderEventCard();
// Halloween: on while the admin's Halloween event is on (or an admin is previewing it). The map behind the
// menu changes straight away; in a game, the next map that loads does.
let halloweenPreview = false;
try {
  halloweenPreview = localStorage.getItem('deadplains.halloweenPreview') === '1';
} catch {
  /* private window */
}
const wantHalloween = () => account.event?.theme === 'halloween' || account.season?.theme === 'halloween' || (account.admin && halloweenPreview);
function syncHalloween() {
  setHalloween(wantHalloween());
}
account.onChange(() => {
  if (wantHalloween() === isHalloween()) return;
  syncHalloween();
  if (inMenu() && game.mode !== 'mp') loadMap(game.map);
});
setInterval(renderEventCard, 30000);

// ---------------------------------------------------------------- the tank (special gear: H to get in and out)
// Only admins, or whoever an admin gives it to. You drive it with WASD (no sprinting, jumping or crouching),
// it faces where you look, and clicking fires the cannon. Inside, you take a quarter of the damage.
const tank = { on: false, g: null, reload: 0, yaw: 0 };
const shellGeo = new THREE.SphereGeometry(0.22, 10, 8);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
function toggleTank() {
  if (tank.on) return leaveTank();
  if (!ownsGear(account.items, 'tank')) return;
  if (player.dead || game.state !== 'playing' || game.phase === 'tutorial' || mp.infected) return;
  tank.on = true;
  tank.g = buildTank();
  tank.yaw = player.yaw + Math.PI;
  scene.add(tank.g);
  setBuild(false);
  banner('🛡️ TANK', 'Click to fire the cannon · H to get out', 'gold', 1.8);
}
function leaveTank() {
  if (!tank.on) return;
  tank.on = false;
  scene.remove(tank.g);
  tank.g = null;
}
function updateTank(dt) {
  if (!tank.on) return;
  if (player.dead || !['playing', 'paused', 'choosing'].includes(game.state)) return leaveTank();
  // the model may have loaded since you got in
  if (!tank.g.userData.model && tankModelReady()) {
    scene.remove(tank.g);
    tank.g = buildTank();
    scene.add(tank.g);
  }
  tank.reload -= dt;
  let d = player.yaw + Math.PI - tank.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  tank.yaw += d * Math.min(1, dt * 7); // a heavy tank: it turns after your aim
  tank.g.position.copy(player.pos);
  tank.g.rotation.y = tank.yaw;
}
const _shellDir = new THREE.Vector3();
const _shellAim = new THREE.Vector3();
// what's under the crosshair: the first zombie, enemy, wall or bit of ground along your view, or far away
function crosshairPoint(out, far = 300) {
  camera.updateMatrixWorld();
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  raycaster.set(_origin, _dir);
  raycaster.far = far;
  let t = terrainHit(_origin, _dir, far);
  for (const h of raycaster.intersectObjects(targets(), false)) {
    if (h.distance > t) break;
    const ud = h.object.userData;
    if (ud.zombie && !ud.zombie.alive) continue;
    if (ud.player !== undefined && (!mp.isAlive(ud.player) || !mp.isEnemy(ud.player))) continue;
    t = h.distance;
    break;
  }
  return out.copy(_origin).addScaledVector(_dir, Math.min(t, far));
}
function fireTank() {
  if (tank.reload > 0) return;
  tank.reload = 1.6;
  const mesh = new THREE.Mesh(shellGeo, shellMat);
  tank.g.updateMatrixWorld(true);
  tank.g.userData.muzzle.getWorldPosition(mesh.position);
  // straight from the barrel to whatever is under the crosshair
  crosshairPoint(_shellAim);
  _shellDir.subVectors(_shellAim, mesh.position);
  if (_shellDir.lengthSq() < 4) camera.getWorldDirection(_shellDir); // right up against something: just fire ahead
  _shellDir.normalize();
  scene.add(mesh);
  projectiles.push({ mesh, vel: _shellDir.clone().multiplyScalar(95), life: 4, radius: 7, gravity: 0, damage: 450 });
  effects.burst(mesh.position.clone(), { count: 18, color: [0xffd27a, 0xff7a1a, 0x555555], speed: 6, size: 0.3, life: 0.5, grav: 1, up: 1 });
  audio.shot('launcher', true);
  player.shake = Math.min(1, player.shake + 0.6);
}

// ---------------------------------------------------------------- saved games (solo)
// You name a game when you start it. It's saved when it starts and after every wave (once you
// pick a power-up); continuing starts the next wave. Saves are kept in this browser and, when
// logged in, on your account. Up to MAX_SAVES games; dying ends (and deletes) that game.
const SAVES_KEY = 'deadplains.saves';
const OLD_SAVE_KEY = 'deadplains.save'; // the single unnamed save from before games had names
let savedGames = []; // newest first

const validSave = (s) => s && s.v === 1 && typeof s.id === 'string' && Number.isFinite(s.wave) && Array.isArray(s.guns);
const trimSaves = (list) => list.filter(validSave).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, MAX_SAVES);
// guests share one list; each account gets its own copy in this browser
const saveKey = () => (account.loggedIn ? `${SAVES_KEY}.${account.user.username.toLowerCase()}` : SAVES_KEY);
function readSaves(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list.filter(validSave) : [];
  } catch {
    return [];
  }
}
const writeSaves = (key, list) => savePref(key, JSON.stringify(trimSaves(list)));

function runSnapshot() {
  return {
    v: 1,
    id: game.runId,
    name: game.runName,
    t: Date.now(),
    wave: game.wave,
    score: game.score,
    kills: game.kills,
    headshots: game.headshots,
    stats: { ...stats },
    owned: [...owned].map(([id, o]) => [id, o.count, o.rarity]),
    guns: weapon.slots.map((s) => [s.def.id, s.ammo, s.reserve === Infinity ? -1 : s.reserve, s.mut || null]),
    health: Math.round(player.health),
    weather: weather.id,
    grenades: game.grenades,
    scrap: game.scrap,
    built: structures.list.map((st) => [st.kind, Math.round(st.x * 10) / 10, Math.round(st.z * 10) / 10, Math.round(st.rot * 100) / 100, Math.round(st.hp)]),
  };
}

function storeSave(save) {
  const key = saveKey();
  writeSaves(key, [...readSaves(key).filter((s) => s.id !== save.id), save]);
  if (account.loggedIn) account.putSave(save).catch(() => {});
  savedGames = trimSaves([...savedGames.filter((s) => s.id !== save.id), save]);
  renderSaves();
}

function deleteSave(id) {
  const key = saveKey();
  writeSaves(key, readSaves(key).filter((s) => s.id !== id));
  if (account.loggedIn) account.deleteSave(id).catch(() => {});
  savedGames = savedGames.filter((s) => s.id !== id);
  renderSaves();
}

function persistRun() {
  if (game.mode !== 'solo' || game.weekly) return; // weekly runs are one go
  storeSave(runSnapshot());
}

// the run that just ended
const clearRun = () => deleteSave(game.runId);

async function refreshSave() {
  // the old single save becomes a named one
  try {
    const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');
    localStorage.removeItem(OLD_SAVE_KEY);
    if (validSave(old)) writeSaves(SAVES_KEY, [...readSaves(SAVES_KEY).filter((s) => s.id !== old.id), { ...old, name: cleanSaveName(old.name) }]);
  } catch {
    /* storage blocked */
  }
  if (account.loggedIn) {
    // games you played as a guest move into your account
    const guest = readSaves(SAVES_KEY);
    if (guest.length) {
      writeSaves(SAVES_KEY, []);
      await Promise.all(guest.map((g) => account.putSave(g).catch(() => {})));
    }
    const remote = await account.listSaves().catch(() => null);
    const key = saveKey();
    let list = readSaves(key);
    if (remote) {
      // the server is the record (a game deleted on another device stays deleted),
      // but a newer copy here (a save that didn't reach it) wins and is sent again
      const byId = new Map(remote.filter(validSave).map((r) => [r.id, r]));
      for (const s of list) {
        const r = byId.get(s.id);
        if (r && (s.t || 0) > (r.t || 0)) {
          byId.set(s.id, s);
          account.putSave(s).catch(() => {});
        }
      }
      list = [...byId.values()];
      writeSaves(key, list);
    }
    savedGames = trimSaves(list);
  } else {
    savedGames = trimSaves(readSaves(SAVES_KEY));
  }
  renderSaves();
}

const saveName = (s) => cleanSaveName(s.name);
function timeAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function renderSaves() {
  const latest = savedGames[0];
  $('continue-btn').classList.toggle('hidden', !latest);
  renderModeCard();
  if (!$('saves-menu').classList.contains('hidden')) renderSavesList();
}

function renderSavesList() {
  $('saves-count').textContent = `${savedGames.length}/${MAX_SAVES} slots used${account.loggedIn ? ' · saved on your account' : ' · saved in this browser (log in to keep them on any device)'}`;
  $('saves-list').innerHTML = savedGames.length
    ? savedGames
        .map(
          (s) => `<div class="save-row" data-id="${esc(s.id)}">
        <div class="save-info">
          <div class="save-name">${esc(saveName(s))}</div>
          <div class="muted small">Next: wave ${s.wave + 1} · ${s.score | 0} pts · ${s.kills | 0} kills · ${s.guns.length} gun${s.guns.length === 1 ? '' : 's'} · ${timeAgo(s.t || 0)}</div>
        </div>
        <div class="save-actions">
          <button class="btn small" data-act="play">PLAY</button>
          <button class="btn small ghost" data-act="rename">RENAME</button>
          <button class="btn small ghost danger" data-act="delete">DELETE</button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="muted">No saved games yet. Press <b>New Game</b> to start one; it saves after every wave.</p>';
}

function nextGameName() {
  const used = new Set(savedGames.map((s) => saveName(s).toLowerCase()));
  let n = 1;
  while (used.has(`game ${n}`)) n++;
  return `Game ${n}`;
}

function openNewGame() {
  audio.init();
  game.state = 'newgame';
  const input = $('newgame-name');
  input.value = '';
  input.placeholder = nextGameName();
  const oldest = savedGames.length >= MAX_SAVES ? savedGames[savedGames.length - 1] : null;
  $('newgame-warn').textContent = oldest ? `You already have ${MAX_SAVES} saved games, so this one replaces the oldest: “${saveName(oldest)}”.` : '';
  showOnly('newgame');
  input.focus();
}

function openSaves() {
  game.state = 'saves';
  showOnly('saves-menu');
  renderSavesList();
  refreshSave();
}

function backToMenu() {
  game.state = 'menu';
  showOnly('menu');
}

function restoreRun(save) {
  stats = { ...baseStats(), ...save.stats };
  owned.clear();
  for (const [id, count, rarity] of save.owned || []) {
    const def = POWERUPS.find((p) => p.id === id);
    if (def) owned.set(id, { def, count, rarity });
  }
  renderOwned();
  const slots = (save.guns || [])
    .filter(([id]) => GUNS[id])
    .map(([id, ammo, reserve, mut]) => ({ def: GUNS[id], ammo: Math.max(0, ammo | 0), reserve: reserve < 0 ? Infinity : reserve, mut: MUTATIONS[mut] ? mut : null }));
  if (!slots.length || slots[0].def.id !== 'rifle') slots.unshift({ def: GUNS.rifle, ammo: weapon.magSize(stats, GUNS.rifle), reserve: Infinity, mut: null });
  weapon.slots = slots;
  weapon.cur = 0;
  weapon.last = 0;
  weapon.ensureKnife();
  giveLoadout();
  weapon.refreshModels();
  game.grenades = Math.max(0, Math.min(maxGrenades(), save.grenades ?? 2));
  game.scrap = Math.max(0, Math.min(999, save.scrap | 0));
  for (const [kind, x, z, rot, hp] of Array.isArray(save.built) ? save.built.slice(0, 20) : []) {
    if (STRUCTURES[kind] && [x, z, rot, hp].every(Number.isFinite)) structures.add({ id: localStructureId++, kind, x, z, rot, hp: Math.min(hp, STRUCTURES[kind].hp), owner: 'me', ally: true });
  }
  player.health = Math.max(1, Math.min(save.health || stats.maxHealth, stats.maxHealth + stats.overheal));
  if (WEATHER[save.weather] && world.theme.weathers.includes(save.weather)) weather.set(save.weather, true);
  Object.assign(game, { wave: save.wave, score: save.score | 0, kills: save.kills | 0, headshots: save.headshots | 0, runId: save.id, runName: saveName(save) });
}

// The gun you equipped in the Shop: you spawn holding it (every mode, every respawn)
// and it never runs out of reserve ammo (you still reload).
function giveLoadout() {
  // special gear the admin gave you (admin panel): the flamethrower and bazooka come into every game, unlimited ammo
  for (const gid of ['flamer', 'bazooka']) {
    if (!ownsGear(account.items, gid) || weapon.slots.some((s) => s.def.id === gid)) continue;
    weapon.slots.push({ def: GUNS[gid], ammo: weapon.magSize(stats, GUNS[gid]), reserve: Infinity, mut: null });
  }
  const id = account.items.loadout;
  if (!id || !account.items[`gun_${id}`] || !GUNS[id]) return;
  let i = weapon.slots.findIndex((s) => s.def.id === id);
  if (i < 0) {
    weapon.slots.push({ def: GUNS[id], ammo: weapon.magSize(stats, GUNS[id]), reserve: Infinity, mut: null });
    i = weapon.slots.length - 1;
  }
  weapon.slots[i].reserve = Infinity;
  weapon.holdNow(i);
}

// Permanent shop upgrades, starting gun and revive tokens (new solo runs only).
function applyShop() {
  const it = account.items;
  const tough = it.toughness || 0;
  stats.maxHealth += 10 * tough;
  stats.damageMul += 0.05 * (it.firepower || 0);
  stats.reloadSpeed += 0.1 * (it.quickhands || 0);
  player.health = stats.maxHealth;
  if (it.grenadier) giveGrenades(it.grenadier);
  if (it.scavenger) pickups.topUp(5 + 2 * it.scavenger, player.pos, 0.06);
  giveLoadout();
  useRunItems();
  if (it.revive > 0) {
    const runId = game.runId;
    account
      .useItem('revive')
      .then(() => {
        stats.secondWind += 1;
        owned.set('secondwind', { def: POWERUPS.find((p) => p.id === 'secondwind'), count: 1, rarity: 'legendary' });
        renderOwned();
        subBanner('Revive token used: Second Wind ready', 2.5);
        if (game.runId === runId) persistRun();
      })
      .catch(() => {});
  }
}
// the other run items from the Shop: one of each you own is used up and gives its perk (at its best) or grenades
function useRunItems() {
  const runId = game.runId;
  for (const def of SHOP) {
    if (def.kind !== 'consumable' || def.id === 'revive' || !(account.items[def.id] > 0)) continue;
    account
      .useItem(def.id)
      .then(() => {
        if (game.runId !== runId) return;
        if (def.grenades) giveGrenades(99);
        const pu = def.powerup && POWERUPS.find((p) => p.id === def.powerup);
        if (pu) {
          const rarity = pu.tiers.legendary !== undefined ? 'legendary' : 'epic';
          pu.apply(stats, pu.tiers[rarity]);
          const have = owned.get(pu.id);
          owned.set(pu.id, { def: pu, count: (have?.count || 0) + 1, rarity });
          renderOwned();
        }
        subBanner(`${def.icon} ${def.name} used`, 2.5);
        persistRun();
      })
      .catch(() => {});
  }
}
const scavengerLevel = () => (game.mode === 'solo' ? account.items.scavenger || 0 : 0);

function startGame(save = null, name = null, { weekly = false } = {}) {
  if (needAccount()) return;
  leaveTank();
  audio.init();
  // the weekly challenge: this week's map and twists, the same for everyone
  game.weekly = weekly && !save;
  const mapIds = Object.keys(MAPS);
  // admins can try any map in solo; everyone else plays Dead Plains
  game.map = game.weekly ? mapIds[weekNumber() % mapIds.length] : account.admin && MAPS[adminSoloMap] ? adminSoloMap : SOLO_MAP;
  if (game.weekly) {
    name = `Weekly #${weekNumber()}`;
    achieve('weekly');
  }
  game.mode = 'solo';
  $('chat-log').innerHTML = '';
  chatLines.length = 0;
  loadMap(game.map);
  zombies.clear();
  clearMedkits();
  stats = baseStats();
  owned.clear();
  renderOwned();
  player.reset(stats.maxHealth);
  player.update(0, world.colliders, stats, false, audio);
  weapon.reset(stats);
  applyProfile();
  clearProjectiles();
  pickups.clear();
  pickups.topUp(5, player.pos, 0.06);
  supply.clear();
  soloDropT = 50;
  weather.set(world.theme.weather, true);
  structures.clear();
  setBuild(false);
  Object.assign(game, { wave: 0, kills: 0, petKills: 0, headshots: 0, score: 0, scrap: START_SCRAP, grenades: 2, phase: 'countdown', timer: 5, toSpawn: 0, bossToSpawn: 0, runId: Math.random().toString(36).slice(2), spent: 0, perks: new Set(), mod: null, special: null, forceMod: null });
  clearEvac();
  clearShields();
  applyWaveTwist();
  game.runName = cleanSaveName(name || nextGameName());
  game.night = false;
  if (save) {
    restoreRun(save);
    game.night = isNightWave(game.wave + 1); // continuing into a night wave
  } else {
    applyShop();
    persistRun(); // it shows up in Saved Games straight away
  }
  toPrep(5);
  tut.on = false;
  $('tutorial').classList.add('hidden');
  if (!save && !game.weekly && tutorialWanted()) startTutorial();
  $('run-name').textContent = game.runName;
  $('banner').className = '';
  $('subbanner').className = '';
  const when = autoWaves() ? 'in 5 seconds' : 'when you press E';
  pauseFor(game.runName.toUpperCase(), save ? `Continuing · wave ${game.wave + 1} starts ${when}` : tut.on ? `${world.theme.name} · a quick tutorial first (you can skip it)` : `${world.theme.name} · the first wave comes ${when}`);
  lock();
}

async function gameOver() {
  game.state = 'gameover';
  if (game.weekly && !usingCheats()) account.submitWeekly(game.wave, game.score);
  setBuild(false);
  flushQuests();
  clearRun();
  trigger = false;
  aim = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const newBest = game.wave > game.best;
  if (newBest) {
    game.best = game.wave;
    savePref('deadplains.best', game.best);
  }
  $('final-stats').innerHTML = `
    <b>${esc(game.runName)}</b> is over. You survived until <b>wave ${game.wave}</b> on ${esc(world.theme.name)}${newBest ? ' — new best!' : ''}<br/>
    Score <b>${game.score}</b> · Kills <b>${game.kills}</b> · Headshots <b>${game.headshots}</b><br/>
    Power-ups collected <b>${[...owned.values()].reduce((a, o) => a + o.count, 0)}</b>
    <div id="xp-line" class="muted">Saving progress…</div>`;
  showOnly('gameover');
  renderBest();
  live.on = false; // saving the run takes you off the live board
  live.wave = 0;
  const r = await account.recordRun({ mode: 'solo', wave: game.wave, score: game.score, kills: game.kills, headshots: game.headshots, petKills: game.petKills || 0 });
  showXp(r);
}

function showXp(r) {
  const el = $('xp-line');
  if (!el) return;
  el.innerHTML = r.error
    ? `Couldn't save: ${esc(r.error)}`
    : `+${r.gained} XP · <b class="coin">+${r.coins || 0} 🪙</b>${r.levelAfter > r.levelBefore ? ` · <b class="lvlup">LEVEL UP! You're level ${r.levelAfter}</b> — new unlocks in Customise` : ''}${account.loggedIn ? '' : ' (guest, saved in this browser)'}`;
}

function toMenu() {
  flushQuests();
  endLive();
  if (mp.lobby) mp.leave(true);
  game.state = 'menu';
  game.mode = 'solo';
  if (document.pointerLockElement) document.exitPointerLock();
  loadMap(game.map); // back to the solo map behind the menu
  $('chat-log').innerHTML = '';
  chatLines.length = 0;
  zombies.clear();
  clearMedkits();
  clearProjectiles();
  pickups.clear();
  supply.clear();
  document.body.classList.remove('infected');
  defend.stop();
  structures.clear();
  setBuild(false);
  tut.on = false;
  $('tutorial').classList.add('hidden');
  player.dead = false;
  renderBest();
  showOnly('menu');
  setTimeout(partyFollow, 0);
}

function renderBest() {
  $('best').textContent = game.best > 0 ? `Best: wave ${game.best}` : '';
}

// ---------------------------------------------------------------- multiplayer glue
defend.onChange = (p, held) => {
  if (!isDefend()) return;
  if (held) banner(`POINT ${p.id} RETAKEN`, 'Hold it!', 'gold', 2);
  else banner(`POINT ${p.id} LOST`, defend.heldCount ? `${defend.heldCount} left · stand on it to take it back` : 'The zombies have every point', 'red', 2.4);
  audio.waveStart();
};

// Host: who's standing on which point; if the zombies take all three, the run is over.
function tickDefend(dt) {
  const players = zombieTargets().filter((t) => !t.point).map((t) => t.pos);
  defend.tick(dt, players, zombies.list);
  if (defend.allLost && !defend.overrun) {
    defend.overrun = true;
    mp.send({ t: 'overrun' });
  }
}
// bonus score for every point still held when a wave is cleared
const pointsBonus = (wave = game.wave) => (isDefend() ? 25 * wave * defend.heldCount : 0);

const mp = new Multiplayer({
  scene, effects, audio, account, player, weapon, banner, subBanner, defend,
  inTank: () => tank.on,
  onMatchCleared() {
    supply?.clear();
    clearShields();
    clearEvac();
    game.mod = null;
    applyWaveTwist();
  },
  // a force field: someone pressed F, or the spawn one (ms says how long; 0 = it's gone)
  onShield(id, ms) {
    const secs = ms === undefined ? SHIELD_TIME : ms / 1000;
    if (id === mp.myId) {
      if (ms === undefined) return;
      raiseShield('me', secs);
      if (secs > 0) subBanner('🛡️ Spawn force field · shoot to drop it', 1.6);
    } else raiseShield(id, secs);
  },
  // one in the chamber: a kill gives you another bullet
  onAmmo(n) {
    const slot = weapon.slots.find((sl) => sl.def.id === 'revolver');
    if (!slot) return;
    slot.ammo += n;
    subBanner('+1 bullet', 0.8);
  },
  onJugg(id, name) {
    if (id === mp.myId) {
      banner('💪 YOU ARE THE JUGGERNAUT', 'Triple health and a machine gun. Every kill is a point', 'red', 2.6);
      achieve('jugg');
      stats.maxHealth = (mp.settings.hp || 100) * JUGG_HP;
      modeLoadout();
    } else if (id) subBanner(`💪 ${name} is the Juggernaut: take them down for 2 points`, 2.4);
  },
  onLobby() {
    game.mode = 'mp';
    if (mp.lobby) account.setPartyRoom(mp.lobby.code); // party leader: bring everyone
    if (['lobby', 'mpend', 'mp-menu', 'mpmenu'].includes(game.state) || game.state !== 'playing') {
      game.state = 'lobby';
      if (document.pointerLockElement) document.exitPointerLock();
      showOnly('lobby');
    }
  },
  onLeave(msg) {
    account.setPartyRoom(null);
    toMenu();
    if (msg) {
      showOnly('mp-menu');
      game.state = 'mpmenu';
      $('mp-error').textContent = msg;
    }
  },
  onMatchStart(map, mode, weatherId) {
    setTimeout(sendCheats, 500); // admin cheats that the server applies
    game.mode = 'mp';
    loadMap(map);
    if (weatherId && WEATHER[weatherId]) weather.set(weatherId, true);
    zombies.clear();
    zombies.nextId = 0;
    stats = baseStats();
    owned.clear();
    renderOwned();
    weapon.reset(stats);
    applyProfile();
    pickups.clear();
    supply.clear();
    // gun game and infection hand out the guns; the host can also turn map guns off
    const set = mp.settings;
    if (!MODES[mode].gungame && !MODES[mode].infection && set.pickups !== 'off') pickups.topUp(7, null, 0.08);
    clearProjectiles();
    clearMedkits();
    player.reset(100);
    Object.assign(game, { wave: 0, kills: 0, petKills: 0, headshots: 0, score: 0, scrap: START_SCRAP, grenades: 2, phase: 'countdown', timer: 8, toSpawn: 0, bossToSpawn: 0, night: false, spent: 0, perks: new Set(), mod: null, special: null, forceMod: null, weekly: false });
    clearEvac();
    applyWaveTwist();
    if (MODES[mode].coop) toPrep(8);
    structures.clear();
    setBuild(false);
    $('banner').className = '';
    $('subbanner').className = '';
    spectate.id = null;
    coop.remaining = 0;
    leaveTank();
    // events: a fresh horde, and no drops left over
    ev.t = 0;
    ev.spawnT = 4;
    ev.bossT = 150;
    for (const d of ev.drops) scene.remove(d.g);
    ev.drops.length = 0;
    if (mode === 'defend') defend.start();
    else defend.stop();
    if (MODES[mode].coop) {
      applyShop(); // shop upgrades count in co-op (it's you vs the zombies)
      player.health = stats.maxHealth;
      if (mp.isHost() && set.wave > 1) game.wave = set.wave - 1; // the host's starting wave
    } else {
      spawnHealthPacks();
    }
    if (!modeLoadout()) giveLoadout();
    player.dead = true; // until the server spawns us
    $('mp-end').classList.add('hidden');
    pauseFor(MODES[mode].name.toUpperCase(), `${MAPS[map].name} · ${MODES[mode].desc} Click to play. Hold Tab for scores.`);
    lock();
  },
  onSpawn(x, z, yaw, hp, revived = false) {
    spectate.id = null;
    player.reset(100);
    player.pos.set(x, heightAt(x, z), z);
    player.yaw = yaw;
    player.dead = false;
    if (MODES[mp.mode]?.coop) player.health = revived ? Math.ceil(stats.maxHealth * 0.5) : stats.maxHealth;
    else {
      // custom health (and zombie players' health) comes from the room
      stats.maxHealth = hp;
      player.health = hp;
    }
    if (revived) banner('REVIVED', 'Back on your feet', 'gold', 1.6);
    // deathmatch and co-op: keep the guns you found (fresh mags); objective modes start you over
    if (['ffa', 'tdm', 'coop', 'defend'].includes(mp.mode)) weapon.refillMags(stats);
    else weapon.reset(stats);
    $('respawn').classList.add('hidden');
    game.grenades = Math.max(game.grenades, 2);
    if (!modeLoadout()) giveLoadout();
    player.update(0, world.colliders, stats, false, audio, 1, world.ladders);
  },
  onHurt(dmg, hp, from) {
    player.health = hp;
    vignette = Math.min(1, vignette + 0.5);
    player.shake = Math.min(1, player.shake + 0.35);
    audio.hurt();
  },
  onDeath(killer, killerId) {
    setBuild(false);
    // kill cam: watch whoever got you until you respawn
    spectate.id = killerId !== mp.myId && mp.avatars.has(killerId) ? killerId : null;
    spectate.killcam = !!spectate.id;
    player.dead = true;
    player.health = 0;
    trigger = false;
    aim = false;
    const el = $('respawn');
    el.classList.remove('hidden');
    let n = MODES[mp.mode]?.coop ? 4 : mp.settings.respawn || 4;
    const turning = mp.infection && mp.myTeam !== INFECTED && mp.lobby?.players.some((p) => p.id === killerId && p.team === INFECTED);
    el.innerHTML = `${turning ? (mp.hns ? '🔎 Found by' : '🧟 Infected by') : 'Killed by'} <b>${esc(killer)}</b><br/><span>${mp.hns && turning ? "You're a seeker now · back in" : 'Respawning in'} ${n}</span>`;
    const iv = setInterval(() => {
      n--;
      if (n <= 0 || !player.dead) return clearInterval(iv);
      const s = el.querySelector('span');
      if (s) s.textContent = `Respawning in ${n}`;
    }, 1000);
  },
  onRelay(from, d) {
    if (d && typeof d === 'object') onCoopRelay(from, d);
  },
  onMyHp(hp) {
    if (!MODES[mp.mode]?.coop && !player.dead) player.health = hp;
  },
  onDrop(d, quiet) {
    supply.add(d);
    if (!quiet) announceDrop();
  },
  onLooted(id, by, gun) {
    const d = supply.remove(id);
    if (by === mp.myId) openSupply(gun);
    else if (d && by) effects.dust(new THREE.Vector3(d.x, d.floor + 0.4, d.z));
  },
  onLevel(level, demoted) {
    const ladder = mp.ladder;
    const id = ladder[Math.min(level, ladder.length - 1)];
    if (demoted) banner('KNIFED!', `${demoted} sent you back to the ${GUNS[id].name}`, 'red', 1.8);
    else banner(id === 'knife' ? 'KNIFE ROUND' : `GUN ${level + 1}/${ladder.length}`, id === 'knife' ? 'Get one knife kill to win!' : `${GUNS[id].icon} ${GUNS[id].name}`, 'gold', 1.4);
    if (!player.dead) modeLoadout();
  },
  onInfected(id, by, first) {
    if (id !== mp.myId) return;
    if (mp.hns) banner('🔎 YOU ARE A SEEKER', first ? `Count with your eyes shut, then find them all` : 'You were found! Now help find the rest', 'red', 2.6);
    else banner("🧟 YOU'VE BEEN INFECTED", first ? 'You start the horde: claw the survivors!' : 'Now get the rest of them', 'red', 2.6);
  },
  // hide and seek: the seekers open their eyes
  onSeekStart() {
    if (mp.seeker) banner('🔎 READY OR NOT', 'Here you come: find them all!', 'red', 2.4);
    else banner('🔎 THE SEEKERS ARE COMING', 'Stay hidden!', 'gold', 2.4);
    audio.waveStart();
  },
  // hide and seek: a seeker's hint, someone is hiding round here
  onHint(x, z) {
    addHintMark(x, z);
    subBanner('📡 Hint: someone is hiding near the red light', 2.5);
  },
  onStructures(list) {
    structures.clear();
    for (const st of list || []) addServerStructure(st);
  },
  onBuilt(st) {
    addServerStructure(st);
  },
  onStructureHp(id, hp) {
    structures.setHp(id, hp);
  },
  onStructureGone(id) {
    const st = structures.get(id);
    if (!st) return;
    audio.explosion(st.pos);
    if (st.owner === mp.myId) subBanner(`Your ${st.def.name.toLowerCase()} was destroyed`, 1.6);
    structures.remove(id, effects);
  },
  onFx(m) {
    if (m.k === 'barrel') {
      const b = world.explosives?.[m.id];
      if (b) detonateBarrel(b, false);
      return;
    }
    if (m.k === 'boom' && Array.isArray(m.p)) {
      const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
      effects.explosion(p, 2.5);
      audio.explosion(p);
    }
  },
  onChat(name, text, color, admin) {
    addChat(name, text, color, admin);
  },
  onKillConfirmed(victim, head, victimId) {
    // events: an enemy can drop a puzzle piece where they fell
    const va = mp.avatars.get(victimId);
    if (isEvent() && va) eventDropChance('player', va.pos.x, va.pos.z);
    questAdd('pvpKills');
    masteryKill(weapon.def.id);
    game.scrap = Math.min(999, game.scrap + SCRAP_PER_PVP_KILL);
    audio.kill();
    showHit('kill');
    if (head) headshotPop();
    subBanner(`Eliminated ${victim}`, 1.4);
  },
  async onEnd(result) {
    game.state = 'mpend';
    if (result.won) questAdd('pvpWins');
    if (result.extracted) achieve('evac');
    if (result.won && !result.coop) {
      achieve('pvpwin');
      if (result.mode === 'gungame') achieve('gungame');
      if (result.mode === 'oitc') achieve('oitc');
      if (result.mode === 'infect' && result.myTeam === SURVIVORS) achieve('survivor');
    }
    flushQuests();
    trigger = false;
    aim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('respawn').classList.add('hidden');
    showOnly('mp-end');
    $('mp-end-xp').textContent = 'Saving progress…';
    const run = result.coop
      ? { mode: 'solo', wave: result.wave, score: game.score, kills: game.kills, headshots: game.headshots, petKills: game.petKills || 0 }
      : { mode: 'pvp', kills: result.kills, headshots: result.headshots, won: result.won };
    live.on = false;
    live.wave = 0;
    const r = await account.recordRun(run);
    $('mp-end-xp').innerHTML = r.error ? '' : `+${r.gained} XP · +${r.coins || 0} 🪙${r.levelAfter > r.levelBefore ? ` · <b class="lvlup">LEVEL UP! Level ${r.levelAfter}</b>` : ''} · back to the lobby in a moment…`;
  },
});

// ---------------------------------------------------------------- menus

$('newgame-form').addEventListener('submit', (e) => {
  e.preventDefault();
  startGame(null, $('newgame-name').value || $('newgame-name').placeholder);
});
$('newgame-back').addEventListener('click', backToMenu);
$('saves-back').addEventListener('click', backToMenu);
$('saves-new').addEventListener('click', openNewGame);
$('saves-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  const row = e.target.closest('.save-row');
  if (!btn || !row) return;
  const save = savedGames.find((s) => s.id === row.dataset.id);
  if (!save) return;
  const act = btn.dataset.act;
  if (act === 'play') startGame(save);
  else if (act === 'delete') {
    // click twice to be sure
    if (btn.dataset.sure) deleteSave(save.id);
    else {
      btn.dataset.sure = '1';
      btn.textContent = 'SURE?';
    }
  } else if (act === 'rename') {
    const info = row.querySelector('.save-name');
    info.innerHTML = `<form class="auth inline rename-form"><input maxlength="${SAVE_NAME_MAX}" autocomplete="off" spellcheck="false" /><button class="btn small">SAVE</button></form>`;
    const input = info.querySelector('input');
    input.value = saveName(save);
    input.focus();
    input.select();
    info.querySelector('form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      storeSave({ ...save, name: cleanSaveName(input.value), t: save.t });
    });
    input.addEventListener('keydown', (ev) => ev.key === 'Escape' && renderSavesList());
  }
});
$('shop-btn').addEventListener('click', () => accountUI.open('shop'));
$('quests-btn').addEventListener('click', () => accountUI.open('quests'));
$('friends-btn').addEventListener('click', () => accountUI.open('friends'));
$('help-btn').addEventListener('click', () => showPage('help'));
// 📰 Updates: everything that's changed, newest first; NEW until you've looked
const SEEN_KEY = 'deadplains.seenVersion';
function renderUpdatesBadge() {
  $('updates-btn').dataset.badge = loadPref(SEEN_KEY, '') === latestUpdate() ? '' : 'NEW';
}
// The Updates tab: the built-in list plus whatever admins changed (edited, removed or added) on the server.
let updatesExtra = { edits: {}, hidden: [], added: [] };
let showRemovedUpdates = false;
let editingUpdate = null; // version being edited, or 'new'
let updatesTab = 'new'; // 'new' = what's changed, 'soon' = what's coming (no dates)
function mergedUpdates(tab = 'new') {
  const soon = tab === 'soon';
  const built = (soon ? UPCOMING : CHANGELOG).map((u) => ({ ...u, ...(updatesExtra.edits[u.v] || {}), builtIn: true }));
  const added = updatesExtra.added.filter((u) => (u.list === 'soon') === soon).map((u) => ({ ...u, added: true }));
  return [...added, ...built].map((u) => ({ ...u, soon, hidden: updatesExtra.hidden.includes(u.v) }));
}
const latestUpdate = () => mergedUpdates().find((u) => !u.hidden)?.v || LATEST_VERSION;
async function loadUpdates() {
  try {
    const r = await fetch('/api/updates');
    if (r.ok) updatesExtra = await r.json();
  } catch {
    /* offline: the built-in list */
  }
}
function updateForm(u) {
  return `<form class="u-edit" data-uform="${esc(u?.v || 'new')}">
    <input name="title" maxlength="120" placeholder="Title" value="${esc(u?.title || '')}" required />
    ${updatesTab === 'soon' ? '' : `<input name="date" maxlength="40" placeholder="Date (e.g. 16 Oct 2026)" value="${esc(u?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}" />`}
    <textarea name="items" rows="5" placeholder="One change per line">${esc((u?.items || []).join('\n'))}</textarea>
    <div class="u-actions"><button class="btn small">SAVE</button><button type="button" class="btn small ghost" data-ucancel>CANCEL</button></div>
  </form>`;
}
function renderUpdates() {
  const admin = account.admin;
  const soon = updatesTab === 'soon';
  for (const b of document.querySelectorAll('#updates-tabs [data-utab]')) b.classList.toggle('active', b.dataset.utab === updatesTab);
  const list = mergedUpdates(updatesTab).filter((u) => !u.hidden || (admin && showRemovedUpdates));
  const firstShown = soon ? null : list.find((u) => !u.hidden);
  const removed = mergedUpdates(updatesTab).filter((u) => u.hidden).length;
  const tools = (u) =>
    admin
      ? `<span class="u-tools">${u.hidden ? `<button data-uact="restore" data-v="${esc(u.v)}">BRING BACK</button>` : `<button data-uact="edit" data-v="${esc(u.v)}">EDIT</button>${u.added ? `<button data-uact="delete" data-v="${esc(u.v)}" class="bad">DELETE</button>` : `<button data-uact="remove" data-v="${esc(u.v)}" class="bad">REMOVE</button>`}`}</span>`
      : '';
  $('updates-list').innerHTML = `${admin ? `<div class="u-admin">⭐ <button class="btn small" data-uact="add">${soon ? '+ ADD COMING SOON' : '+ ADD UPDATE'}</button><label class="muted small"><input type="checkbox" id="u-show-removed" ${showRemovedUpdates ? 'checked' : ''} /> Show removed (${removed})</label></div>${editingUpdate === 'new' ? updateForm(null) : ''}` : ''}
    ${soon ? '<p class="muted small soon-note">What we\'re working on next. No release dates yet: they\'ll show up under What\'s new when they\'re ready.</p>' : ''}
    ${list
      .map((u) =>
        editingUpdate === u.v
          ? updateForm(u)
          : `<div class="update ${u === firstShown ? 'latest' : ''} ${u.soon ? 'soon' : ''} ${u.hidden ? 'u-hidden' : ''}">
        <div class="u-head"><b>${esc(u.title)}</b><span class="muted small">${u.soon ? '' : `${u.added ? '' : `v${esc(u.v)} · `}${esc(u.date || '')}`}${u.hidden ? ' · removed' : ''}</span>${tools(u)}</div>
        <ul>${(u.items || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>`,
      )
      .join('')}`;
}
$('updates-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-uact], [data-ucancel]');
  if (!b) return;
  if (b.dataset.ucancel !== undefined) {
    editingUpdate = null;
    return renderUpdates();
  }
  const act = b.dataset.uact;
  if (act === 'add' || act === 'edit') {
    editingUpdate = act === 'add' ? 'new' : b.dataset.v;
    return renderUpdates();
  }
  if (act === 'delete' && !confirm('Delete this update for good?')) return;
  try {
    updatesExtra = await account.adminUpdates({ action: act, v: b.dataset.v });
  } catch (err) {
    subBanner(err.message, 2);
  }
  renderUpdates();
});
$('updates-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-utab]');
  if (!b) return;
  updatesTab = b.dataset.utab;
  editingUpdate = null;
  renderUpdates();
});
$('updates-list').addEventListener('change', (e) => {
  if (e.target.id !== 'u-show-removed') return;
  showRemovedUpdates = e.target.checked;
  renderUpdates();
});
$('updates-list').addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-uform]');
  if (!f) return;
  e.preventDefault();
  const d = new FormData(f);
  const entry = { title: d.get('title'), date: d.get('date'), items: String(d.get('items') || '').split('\n') };
  const v = f.dataset.uform;
  try {
    updatesExtra = await account.adminUpdates(v === 'new' ? { action: 'add', entry, list: updatesTab } : { action: 'edit', v, entry });
    editingUpdate = null;
  } catch (err) {
    subBanner(err.message, 2);
  }
  renderUpdates();
});
$('updates-btn').addEventListener('click', async () => {
  renderUpdates();
  showPage('updates');
  await loadUpdates();
  renderUpdates();
  savePref(SEEN_KEY, latestUpdate());
  renderUpdatesBadge();
});
loadUpdates().then(renderUpdatesBadge);
$('updates').addEventListener('click', (e) => {
  if ((e.target === $('updates') && !$('updates').classList.contains('docked')) || e.target.closest('[data-close-updates]')) hidePage('updates');
});
renderUpdatesBadge();
$('help').addEventListener('click', (e) => {
  if ((e.target === $('help') && !$('help').classList.contains('docked')) || e.target.closest('[data-close-help]')) hidePage('help');
});
$('again-btn').addEventListener('click', () => startGame(null, game.runName));
account.onChange(() => refreshSave());
$('menu-btn').addEventListener('click', toMenu);
function openMultiplayer() {
  if (needAccount()) return;
  audio.init();
  game.state = 'mpmenu';
  $('mp-error').textContent = '';
  showOnly('mp-menu');
}

// ---------------------------------------------------------------- lobby (home screen)
// Pick a mode (Continue / Solo / Multiplayer) and hit PLAY. Your party stands in the middle.
let homeMode = null; // null = not picked yet: continue if there's a save, else solo
const currentMode = () => (homeMode === 'continue' && !savedGames[0] ? 'solo' : homeMode || (savedGames[0] ? 'continue' : 'solo'));
function renderModeCard() {
  const mode = currentMode();
  for (const b of document.querySelectorAll('[data-mode-pick]')) b.classList.toggle('on', b.dataset.modePick === mode);
  const latest = savedGames[0];
  const card = {
    continue: latest ? ['CONTINUE', `${esc(saveName(latest))} · wave ${latest.wave + 1}`, 'Dead Plains'] : null,
    solo: ['SOLO SURVIVAL', savedGames.length ? `New game or ${savedGames.length} saved game${savedGames.length === 1 ? '' : 's'}` : 'Start a new game', 'Dead Plains'],
    mp: ['MULTIPLAYER', 'Co-op, Defend, FFA, TDM, Capture Point, CTF, Gun Game, Infection', 'Room codes · 4 maps · custom settings'],
  }[mode];
  $('mode-card').innerHTML = card ? `<b>${card[0]}</b><span>${card[1]}</span><small>${card[2]}</small>` : '';
}
document.querySelectorAll('[data-mode-pick]').forEach((b) =>
  b.addEventListener('click', () => {
    homeMode = b.dataset.modePick;
    renderModeCard();
  }),
);
// You need an account to play: PLAY (and every other way into a game) asks you to sign up or log in first.
function needAccount() {
  if (account.loggedIn) return false;
  accountUI.mustLogin = true;
  accountUI.open('login');
  return true;
}
function renderPlayButton() {
  $('play-big').textContent = account.loggedIn ? 'PLAY' : 'SIGN UP TO PLAY';
}
account.onChange(renderPlayButton);
renderPlayButton();
accountUI.onLoggedIn = () => lobbyHome();
// paid access ran out while playing: back to the lobby, onto the "Access ended" screen
account.onAccessEnded = () => {
  if (game.mode === 'mp' && (mp.lobby || mp.inMatch)) mp.leave(true);
  else if (!inMenu()) toMenu();
  needAccount();
};
$('play-big').addEventListener('click', () => {
  if (needAccount()) return;
  const mode = currentMode();
  if (mode === 'continue' && savedGames[0]) startGame(savedGames[0]);
  else if (mode === 'mp') openMultiplayer();
  else openSaves();
});
$('nav-locker').addEventListener('click', () => accountUI.open('profile'));
$('nav-leaderboard').addEventListener('click', () => accountUI.open('leaderboard'));
$('nav-play').addEventListener('click', lobbyHome);

// ---- lobby tabs: Locker, Quests, Shop, Friends, Updates... open as pages under the top bar, not pop-ups.
// (Opened from anywhere else, like the pause menu, they're still pop-ups.)
const NAV_FOR = { shop: 'shop-btn', quests: 'quests-btn', profile: 'nav-locker', mastery: 'nav-locker', friends: 'friends-btn', leaderboard: 'nav-leaderboard', updates: 'updates-btn', help: 'help-btn', settings: 'settings-btn' };
const PAGES = ['updates', 'help', 'settings'];
const inLobby = () => !$('menu').classList.contains('hidden');
function setLobbyNav(page) {
  for (const b of document.querySelectorAll('.fn-nav button')) b.classList.toggle('on', page ? b.id === NAV_FOR[page] : b.id === 'nav-play');
  $('settings-btn').classList.toggle('on', page === 'settings');
  $('menu').classList.toggle('page-open', !!page);
  measureTopBar();
}
// pages start just under the top bar
const measureTopBar = () => document.documentElement.style.setProperty('--fn-top-h', `${$('menu').querySelector('.fn-top').offsetHeight}px`);
window.addEventListener('resize', measureTopBar);
// Updates, How to Play and Settings: a tab in the lobby, a pop-up anywhere else
function showPage(id) {
  const docked = inLobby();
  if (docked) {
    accountUI.close();
    for (const p of PAGES) if (p !== id) hidePage(p);
  }
  $(id).classList.toggle('docked', docked);
  $(id).classList.remove('hidden');
  if (docked) setLobbyNav(id);
}
function hidePage(id) {
  const el = $(id);
  const was = el.classList.contains('docked') && !el.classList.contains('hidden');
  el.classList.add('hidden');
  el.classList.remove('docked');
  if (was) setLobbyNav(null);
}
function closeLobbyPages() {
  for (const p of PAGES) if ($(p).classList.contains('docked')) hidePage(p);
  if (accountUI.docked) accountUI.close();
}
function lobbyHome() {
  closeLobbyPages();
  setLobbyNav(null);
}
accountUI.dock = inLobby;
accountUI.onShow = (tab) => {
  for (const p of PAGES) hidePage(p);
  setLobbyNav(NAV_FOR[tab] ? tab : 'account');
};
accountUI.onHide = () => setLobbyNav(null);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && inLobby() && $('menu').classList.contains('page-open') && !e.target.closest?.('input, textarea')) lobbyHome();
});

// daily quests in the bottom left
function renderHomeQuests() {
  const qs = account.quests || [];
  $('home-quests').innerHTML = `<div class="fq-head">DAILY QUESTS${account.questsReady ? ` <span class="fq-ready">${account.questsReady} TO CLAIM</span>` : ''}</div>
    ${qs
      .map(
        (q) => `<div class="fq ${q.claimed ? 'claimed' : q.done ? 'done' : ''}"><div class="fq-text">${esc(q.text)}</div>
          <div class="fq-bar"><i style="width:${Math.round((q.progress / q.goal) * 100)}%"></i></div>
          <div class="fq-meta"><span>${q.claimed ? 'CLAIMED ✓' : `${q.progress}/${q.goal}`}</span><span>🪙 ${q.reward}</span></div></div>`,
      )
      .join('') || '<div class="fq-text muted">Loading…</div>'}`;
}
$('home-quests').addEventListener('click', () => accountUI.open('quests'));
accountUI.onCard = () => {
  renderHomeQuests();
  renderPartyBar();
};
renderModeCard();
renderHomeQuests();
$('mp-back').addEventListener('click', () => {
  game.state = 'menu';
  showOnly('menu');
});
accountUI.onWeekly = () => {
  accountUI.close();
  startGame(null, null, { weekly: true });
};
// quick play: an open room with space, or a new open one
$('mp-quick').addEventListener('click', async () => {
  $('mp-error').textContent = 'Finding a room…';
  let code = null;
  try {
    code = (await (await fetch('/api/quickplay')).json()).code;
  } catch {
    /* offline */
  }
  let err = code ? await mp.join(code) : 'none';
  if (err) {
    // nobody to join: a new public room with AI bots, straight into a match (people who quick join later take a bot's place)
    err = await mp.create();
    if (!err) {
      mp.send({ t: 'open', on: true });
      mp.send({ t: 'bots', n: 5 });
      mp.send({ t: 'start' });
    }
  }
  $('mp-error').textContent = err || '';
});
$('mp-create').addEventListener('click', async () => {
  $('mp-error').textContent = 'Creating room…';
  const err = await mp.create();
  $('mp-error').textContent = err || '';
});
$('mp-join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('mp-error').textContent = 'Joining…';
  const err = await mp.join($('mp-code').value);
  $('mp-error').textContent = err || '';
});
$('mp-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
$('quit-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.mode === 'mp') mp.leave();
  else toMenu();
});
$('mpend-exit').addEventListener('click', () => mp.leave());
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
    pauseFor('PAUSED', game.mode === 'mp' ? 'The match keeps going! Click to continue' : 'Click to continue');
  }
});

// ---------------------------------------------------------------- input
document.addEventListener('mousemove', (e) => {
  // (with a free cursor the wheel just uses whichever slot the mouse is over)
  if (emoteMenu.open && !document.pointerLockElement) return;
  if (game.state !== 'playing' || document.pointerLockElement !== canvas || player.dead) return;
  // the emote wheel takes the mouse while it's open
  if (emoteMenu.open) return aimWheel(emoteMenu.x + e.movementX, emoteMenu.y + e.movementY);
  player.look(e.movementX, e.movementY, camera.fov / 75);
  weapon.sway(e.movementX * (1 - weapon.ads * 0.8), e.movementY * (1 - weapon.ads * 0.8));
});
document.addEventListener('mousedown', (e) => {
  if (game.state === 'playing' && player.dead && spectate.on && e.button === 0) return nextSpectate();
  if (game.state !== 'playing' || player.dead) return;
  if (emoteMenu.open) {
    // click sends the slot you're pointing at; right click closes
    if (e.button === 0 && emoteMenu.hi >= 0 && document.pointerLockElement) sendEmote(emoteMenu.hi);
    else if (e.button === 2) setEmotes(false);
    return;
  }
  if (build.on) {
    if (e.button === 0) placeStructure();
    if (e.button === 2) setBuild(false);
    return;
  }
  if (e.button === 0) {
    trigger = true;
    pressed = true;
  }
  if (e.button === 2) aim = settings.toggleAim ? !aim : true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) trigger = false;
  if (e.button === 2 && !settings.toggleAim) aim = false;
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
  if (e.target.closest?.('input, textarea, select')) return;
  if ((e.code === 'KeyT' || e.code === 'Enter') && game.mode === 'mp' && ['playing', 'lobby', 'paused', 'mpend'].includes(game.state) && !chatOpen()) {
    e.preventDefault();
    openChat();
    return;
  }
  if (game.state === 'choosing' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    choose(Number(e.code.slice(-1)) - 1);
    return;
  }
  if (invOpen() && (e.code === 'KeyI' || e.code === 'Escape')) {
    e.preventDefault();
    return closeInventory();
  }
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'Tab' && game.mode === 'mp' && mp.inMatch) {
    e.preventDefault();
    $('scoreboard').classList.remove('hidden');
    mp.renderScoreboard();
  }
  if (game.state !== 'playing') return;
  if (e.code === 'Space' || e.code === 'KeyC') e.preventDefault();
  if (e.code === 'Space' && player.dead && spectate.on) nextSpectate();
  if (tut.on && (e.code === 'KeyK' || e.code === 'Tab')) {
    e.preventDefault();
    return endTutorial(true);
  }
  if (e.code === 'KeyZ') return setEmotes(!emoteMenu.open);
  if (emoteMenu.open) {
    const n = /^Digit([1-8])$/.exec(e.code);
    if (n) return sendEmote(Number(n[1]) - 1);
    if (e.code === 'Escape') return setEmotes(false);
  }
  player.keys.add(e.code);
  if (e.code === 'KeyB') return setBuild(!build.on);
  if (build.on) {
    // build mode: 1 / 2 pick what to build, R turns it
    if (e.code === 'Digit1' || e.code === 'Digit2') build.kind = e.code === 'Digit1' ? 'barricade' : 'turret';
    if (e.code === 'KeyR') build.rot += Math.PI / 2;
    if (e.code === 'KeyR' || /^Digit/.test(e.code)) return;
  }
  if (e.code === 'KeyR') weapon.startReload(stats);
  if (e.code === 'KeyQ') weapon.equipLast();
  if (e.code === 'KeyV' && !player.dead && weapon.quickMelee()) meleeAttack();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyF') useShield();
  if (e.code === 'KeyH') toggleTank();
  if (e.code === 'KeyP') toggleView();
  if (e.code === 'KeyI') return openInventory();
  if (e.code === 'KeyX') return dropGun();
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit) weapon.equip(digit[1] === '0' ? 9 : Number(digit[1]) - 1);
});
document.addEventListener('keyup', (e) => {
  player.keys.delete(e.code);
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
});
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
// ---------------------------------------------------------------- admin (solo only; the account must be verified by the server)
let adminBossN = 0;
let adminSoloMap = SOLO_MAP;
const cheats = { god: false, ammo: false, fly: false, speed: false, onehit: false, freeze: false, slowmo: false, nohud: false, grenades: false, build: false, turrets: false, shield: false };
// admin cheats: in solo, and in multiplayer too, but only for the admin (nothing that changes the
// game for everyone else: freezing or slowing the zombies stays solo-only)
const cheatsOn = () => account.admin && (game.mode === 'solo' || game.mode === 'mp');
const SOLO_ONLY_CHEATS = ['freeze', 'slowmo'];
const MP_ADMIN_ACTIONS = ['guns', 'mutate', 'powerups', 'heal', 'repairbuilds', 'points', 'allbadges', 'scrap', 'nades', 'infinitereserve', 'removeguns', 'unmutate', 'resetpowerups', 'noscrap'];
// the server applies god mode and one-hit kills in PvP, so it has to know
function sendCheats() {
  if (game.mode === 'mp' && account.admin) mp.send({ t: 'cheat', god: !!cheats.god, onehit: !!cheats.onehit });
}
// a cheat that changes the game is on (keeps you off the live leaderboard)
const usingCheats = () => cheatsOn() && Object.entries(cheats).some(([k, v]) => v && k !== 'nohud');
function flyUpdate(dt) {
  // noclip flight: look direction + Space up / C down
  const k = player.keys;
  const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const up = (k.has('Space') ? 1 : 0) - (k.has('KeyC') ? 1 : 0);
  const sp = (k.has('ShiftLeft') ? 30 : 12) * dt;
  const cy = Math.cos(player.pitch);
  player.pos.x += (-Math.sin(player.yaw) * cy * fwd + Math.cos(player.yaw) * strafe) * sp;
  player.pos.z += (-Math.cos(player.yaw) * cy * fwd - Math.sin(player.yaw) * strafe) * sp;
  player.pos.y = Math.max(heightAt(player.pos.x, player.pos.z), player.pos.y + (Math.sin(player.pitch) * fwd + up) * sp);
  player.vel.set(0, 0, 0);
  player.onGround = false;
  player.ladder = null;
  player.climb = null;
  player._updateCamera(dt, 0, 0);
  return 0;
}
// ---------------------------------------------------------------- parties
// When the party leader goes into a room, everyone else follows (from the menus; mid-game they get told).
let followedRoom = null;
let toldRoom = null;
function partyFollow() {
  const p = account.party;
  renderPartyBar();
  if (!p || !p.room || account.partyLeader) {
    followedRoom = null;
    return;
  }
  if (mp.lobby?.code === p.room) {
    followedRoom = p.room;
    return;
  }
  if (followedRoom === p.room || mp.lobby) return;
  if (['menu', 'mpmenu', 'newgame', 'saves'].includes(game.state)) {
    followedRoom = p.room;
    accountUI.joinRoom(p.room);
  } else if (toldRoom !== p.room) {
    toldRoom = p.room;
    addChat('🎉', `Your party went into room ${p.room}. Open Multiplayer to join them.`, '#ffd34d');
  }
}
// The lobby line-up: you in the middle, your party either side, empty spots to invite friends.
// Anyone wearing a character skin (SWAT, Adventurer, King: unlocked with event pieces) stands there as it, like
// Fortnite; everyone else is just their name.
const skinOf = (m) => {
  const look = m.profile?.look;
  return look?.model && look.model !== 'man' ? look : null;
};
const lineupSkins = new Map(); // key -> { canvas, preview }, kept while they're in the line-up
function placeSkins(el) {
  const used = new Set();
  for (const spot of el.querySelectorAll('[data-skin]')) {
    const key = spot.dataset.skin;
    used.add(key);
    let s = lineupSkins.get(key);
    if (!s) {
      const canvas = document.createElement('canvas');
      canvas.className = 'fn-skin-canvas';
      canvas.width = 240;
      canvas.height = 360;
      spot.appendChild(canvas);
      const preview = new CharacterPreview(canvas);
      preview.spinSpeed = 0;
      preview.spin = 0; // facing you
      preview.show(JSON.parse(spot.dataset.look));
      s = { canvas, preview };
      lineupSkins.set(key, s);
    } else spot.appendChild(s.canvas);
  }
  for (const [key, s] of lineupSkins) if (!used.has(key)) {
    s.preview.dispose();
    lineupSkins.delete(key);
  }
}
function renderPartyBar() {
  const p = account.party;
  const me = { username: account.name, profile: account.profile, level: account.level, me: true, leader: !!p && account.partyLeader, online: true };
  const others = p ? p.members.filter((m) => m.username !== account.name) : [];
  const slots = [...others.slice(0, 2).reverse(), me, ...others.slice(2, 4)];
  const max = 4;
  while (slots.length < max) slots[slots.length % 2 ? 'unshift' : 'push']({ empty: true });
  const html = slots
    .map((m) => {
      if (m.empty) {
        return `<button class="fn-slot empty" data-invite="1"><div class="fn-plus">+</div><div class="fn-name">${account.loggedIn ? 'INVITE' : 'LOG IN'}</div><div class="fn-pad"></div></button>`;
      }
      const skin = skinOf(m);
      return `<div class="fn-slot ${m.me ? 'me' : ''} ${skin ? 'skinned' : ''}">
        ${m.leader ? '<div class="fn-crown">👑</div>' : ''}
        ${skin ? `<div class="fn-skin" data-skin="${esc(`${m.username}|${JSON.stringify(skin)}`)}" data-look="${esc(JSON.stringify(skin))}"></div>` : ''}
        <div class="fn-plate" style="--c:${esc(m.profile?.color || '#ffffff')}">
          <div class="fn-name">${esc(m.username)}</div>
          <div class="fn-title">${esc(m.profile?.title || '')}</div>
          <div class="fn-lvl">LV ${m.level ?? 1}${m.me ? '' : ` · <i class="dot ${m.online ? 'on' : ''}"></i>`}</div>
        </div>
        <div class="fn-pad"></div>
      </div>`;
    })
    .join('');
  const el = $('party-bar');
  if (last.lineup !== html) {
    last.lineup = html;
    // in a party: where it's playing, and a way out
    el.innerHTML = html + (p ? `<div class="fn-room">${p.room ? `Party room <b>${esc(p.room)}</b>` : ''}<button class="btn small ghost fn-leave" data-leave-party>🚪 LEAVE PARTY</button></div>` : '');
    placeSkins(el);
  }
}
$('party-bar').addEventListener('click', async (e) => {
  const leave = e.target.closest('[data-leave-party]');
  if (leave) {
    leave.disabled = true;
    try {
      await account.partyAction('leave');
      accountUI.toast('🚪 You left the party', [], 3000);
    } catch (err) {
      accountUI.toast(esc(err.message), [], 4000);
      leave.disabled = false;
    }
    return;
  }
  if (!e.target.closest('[data-invite]')) return;
  accountUI.open(account.loggedIn ? 'friends' : 'login');
});
account.onParty(partyFollow);

// ---------------------------------------------------------------- quests
// A quest finished while you play gets a message in the game chat; claim the coins in the menu.
let questsDone = null;
account.onChange(() => {
  const done = new Set((account.quests || []).filter((q) => q.done).map((q) => q.id));
  if (questsDone) {
    for (const q of account.quests) if (q.done && !q.claimed && !questsDone.has(q.id)) {
      addChat('📜', `Quest complete: ${q.text}! Claim ${q.reward} coins in Quests.`, '#ffd34d');
      if (!inMenu()) subBanner(`QUEST COMPLETE · ${q.text}`, 2.5);
    }
  }
  if ((account.quests || []).length) questsDone = done;
});

// ---------------------------------------------------------------- tutorial (first new game; skippable)
// A short checklist before wave 1. Each step finishes on its own when you do the thing.
const TUT_DONE_KEY = 'deadplains.tutorialDone';
const TUT_STEPS = [
  { text: ['Move around with <b>WASD</b>', 'Move with the <b>joystick</b> (left thumb)', 'Move with the <b>left stick</b>'], done: (t) => t.moved > 6 },
  { text: ['Aim with the mouse and <b>click</b> to shoot the zombie', 'Drag to aim, hold <b>🔥</b> to shoot the zombie', 'Aim with the <b>right stick</b>, <b>RT</b> to shoot the zombie'], setup: 'dummy', done: (t) => t.dummy && !t.dummy.alive },
  { text: ['Hold <b>right click</b> to aim down the sights', 'Hold <b>🎯</b> to aim down the sights', 'Hold <b>LT</b> to aim down the sights'], done: (t) => t.adsT > 0.5 },
  { text: ['Press <b>R</b> to reload', 'Tap <b>R</b> to reload', 'Press <b>X</b> to reload'], done: () => weapon.reloading > 0 },
  { text: ['Press <b>Space</b> to jump (and to climb onto things)', 'Tap <b>⤒</b> to jump (and climb onto things)', 'Press <b>A</b> to jump (and climb onto things)'], done: () => !player.onGround },
  { text: ['Hold <b>Shift</b> to sprint, then press <b>C</b> to slide', 'Push the joystick all the way to sprint, then tap <b>⤓</b> to slide', 'Push the left stick all the way (or <b>L3</b>) to sprint, then <b>B</b> to slide'], done: () => player.sliding },
  { text: ['Press <b>V</b> for a quick knife stab', 'Tap <b>🔪</b> for a quick knife stab', 'Press <b>RB</b> for a quick knife stab'], done: () => weapon.swingT > 0 },
  { text: ['Press <b>G</b> to throw a grenade', 'Tap <b>💣</b> to throw a grenade', 'Press <b>LB</b> to throw a grenade'], setup: 'grenade', done: (t) => t.threw },
  { text: ['Press <b>B</b>, then <b>click</b> to build a barricade (free this time)', 'Tap <b>🧱</b>, then <b>🔥</b> to build a barricade (free this time)', 'Press <b>D-pad up</b>, then <b>RT</b> to build a barricade (free this time)'], setup: 'build', done: () => structures.list.length > 0 },
];
const tut = { on: false, step: 0, moved: 0, adsT: 0, last: null, dummy: null, threw: false, doneT: 0 };
const tutorialWanted = () => settings.tutorial && !loadPref(TUT_DONE_KEY, '');

function startTutorial() {
  Object.assign(tut, { on: true, step: 0, moved: 0, adsT: 0, last: player.pos.clone(), dummy: null, threw: false, doneT: 0 });
  game.phase = 'tutorial';
  $('tutorial').classList.remove('hidden');
  renderTutorial();
}

function endTutorial(skipped) {
  if (!tut.on) return;
  tut.on = false;
  savePref(TUT_DONE_KEY, '1');
  $('tutorial').classList.add('hidden');
  if (tut.dummy && tut.dummy.alive) zombies.damage(tut.dummy, 1e9);
  setBuild(false);
  toPrep(5);
  banner(skipped ? 'TUTORIAL SKIPPED' : "YOU'RE READY", autoWaves() ? 'The first wave is coming' : 'Press E when you want the first wave', 'gold', 2.2);
}

function renderTutorial() {
  const s = TUT_STEPS[tut.step];
  const mode = controls.mode === 'touch' ? 1 : controls.mode === 'pad' ? 2 : 0;
  const skip = ['press <b>K</b> to skip', 'tap here to skip', 'press <b>Back</b> to skip'][mode];
  const html = `<div class="tut-step">TUTORIAL · ${tut.step + 1}/${TUT_STEPS.length}</div><div class="tut-text">${s ? s.text[mode] : ''}</div>
    <div class="tut-bar"><i style="width:${(tut.step / TUT_STEPS.length) * 100}%"></i></div><div class="tut-skip">${skip}</div>`;
  if (last.tut !== html) {
    last.tut = html;
    $('tutorial').innerHTML = html;
  }
}

function updateTutorial(dt) {
  const s = TUT_STEPS[tut.step];
  if (!s) return endTutorial(false);
  if (!tut.setupDone) {
    tut.setupDone = true;
    if (s.setup === 'dummy') {
      // a slow zombie right in front of you
      const x = player.pos.x - Math.sin(player.yaw) * 9;
      const z = player.pos.z - Math.cos(player.yaw) * 9;
      tut.dummy = zombies.spawn('walker', 1, player.pos);
      tut.dummy.root.position.set(x, heightAt(x, z) - 2, z);
      tut.dummy.speed = 0.35;
      tut.dummy.damage = 0;
    }
    if (s.setup === 'grenade') game.grenades = Math.max(game.grenades, 1);
    if (s.setup === 'build') game.scrap = Math.max(game.scrap, STRUCTURES.barricade.cost);
  }
  tut.moved += Math.hypot(player.pos.x - tut.last.x, player.pos.z - tut.last.z);
  tut.last.copy(player.pos);
  tut.adsT = weapon.ads > 0.8 ? tut.adsT + dt : 0;
  if (s.done(tut)) {
    tut.step++;
    tut.setupDone = false;
    audio.click(1.4, 0.3);
    if (tut.step >= TUT_STEPS.length) return endTutorial(false);
  }
  renderTutorial();
}
$('tutorial').addEventListener('click', () => endTutorial(true));
$('tutorial').addEventListener('touchstart', (e) => {
  e.preventDefault();
  endTutorial(true);
});

// ---------------------------------------------------------------- emote / quick chat wheel (Z)
// Point at a slot (move the mouse, the right stick, or tap it) and click to send. 1-8 still work.
const WHEEL_R = 150; // how far out the slots sit (px)
const emoteMenu = { open: false, x: 0, y: 0, hi: -1 };
function setEmotes(open) {
  emoteMenu.open = open && game.state === 'playing';
  emoteMenu.x = emoteMenu.y = 0;
  setWheelHighlight(-1);
  if (emoteMenu.open) {
    trigger = false;
    aim = false;
  }
  $('emotes').classList.toggle('hidden', !emoteMenu.open);
}
// slot: 0-7 on your quick chat wheel (the phrases are yours to change in Customise)
function sendEmote(slot) {
  setEmotes(false);
  const text = quickWheel(account.items)[slot];
  if (!text) return;
  if (game.mode === 'mp' && mp.inMatch) mp.send({ t: 'emote', text });
  else addChat(account.name, text, account.profile.color);
}
function setWheelHighlight(i) {
  if (emoteMenu.hi === i) return;
  emoteMenu.hi = i;
  $('emotes').querySelectorAll('[data-emote]').forEach((b) => b.classList.toggle('hi', Number(b.dataset.emote) === i));
  const center = $('emotes').querySelector('.w-center');
  if (center) {
    center.innerHTML = i >= 0 ? `<b>${esc(quickWheel(account.items)[i])}</b><span>click to send</span>` : '<span>💬 point at one,<br>then click</span>';
  }
}
// where the pointer is (x, y from the middle): the slot in that direction
function aimWheel(x, y) {
  const d = Math.hypot(x, y);
  if (d > WHEEL_R) {
    x *= WHEEL_R / d;
    y *= WHEEL_R / d;
  }
  emoteMenu.x = x;
  emoteMenu.y = y;
  const pointer = $('emotes').querySelector('.w-pointer');
  if (pointer) pointer.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  if (Math.hypot(x, y) < 28) return setWheelHighlight(-1);
  const a = Math.atan2(x, -y); // 0 = straight up, clockwise
  setWheelHighlight(((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
}
function renderEmoteMenu() {
  const slots = quickWheel(account.items);
  const html =
    slots
      .map((v, slot) => {
        const a = (slot / 8) * Math.PI * 2;
        const x = Math.sin(a) * WHEEL_R;
        const y = -Math.cos(a) * WHEEL_R;
        return `<button data-emote="${slot}" class="w-item quick" style="left:calc(50% + ${x.toFixed(1)}px);top:calc(50% + ${y.toFixed(1)}px)"><b>${slot + 1}</b>${esc(v)}</button>`;
      })
      .join('') + '<div class="w-center"></div><div class="w-pointer"></div>';
  if ($('emotes').innerHTML !== html) {
    $('emotes').innerHTML = html;
    emoteMenu.hi = -2;
    setWheelHighlight(-1);
  }
}
renderEmoteMenu();
account.onChange(renderEmoteMenu);
// without a locked mouse (touch, or a free cursor): hover or tap the slot itself
$('emotes').addEventListener('mouseover', (e) => {
  const b = e.target.closest('[data-emote]');
  if (b && !document.pointerLockElement) setWheelHighlight(Number(b.dataset.emote));
});
$('emotes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emote]');
  if (b && emoteMenu.open) sendEmote(Number(b.dataset.emote));
});
$('emotes').addEventListener('touchstart', (e) => {
  const b = e.target.closest('[data-emote]');
  if (!b) return;
  e.preventDefault();
  sendEmote(Number(b.dataset.emote));
});

// ---------------------------------------------------------------- co-op revives
// Stand next to a downed squadmate and hold E (controller X) for a few seconds.
const REVIVE_TIME = 3;
const revive = { id: null, t: 0 };
function updateRevive(dt) {
  let near = null;
  if (isCoop() && !player.dead) {
    let best = 2.4;
    for (const a of mp.avatars.values()) {
      if (a.alive) continue;
      const d = Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z);
      if (d < best && Math.abs(a.pos.y - player.pos.y) < 2) {
        best = d;
        near = a;
      }
    }
  }
  const holding = near && player.keys.has('KeyE');
  if (!holding || revive.id !== near.id) revive.t = 0;
  revive.id = near ? near.id : null;
  if (holding) {
    revive.t += dt;
    if (revive.t >= REVIVE_TIME) {
      mp.send({ t: 'revive', id: near.id });
      achieve('revive');
      game.score += 100;
      revive.t = 0;
      audio.revive();
    }
  }
  const el = $('interact');
  el.classList.toggle('hidden', !near);
  document.body.classList.toggle('can-revive', !!near);
  if (near) {
    const html = `${revive.t > 0 ? 'Reviving' : 'Hold <b>E</b> to revive'} <b>${esc(near.info.name)}</b><div class="i-bar"><i style="width:${Math.round((revive.t / REVIVE_TIME) * 100)}%"></i></div>`;
    if (last.interact !== html) {
      last.interact = html;
      el.innerHTML = html;
    }
  }
}

// ---------------------------------------------------------------- spectating and the kill cam
// Down in co-op: watch a squadmate (click or Space for the next one). Killed in PvP: the kill cam
// follows whoever got you until you respawn.
const spectate = { id: null, on: false, killcam: false, nextT: 0 };
const _camTo = new THREE.Vector3();
const _look = new THREE.Vector3();
function spectateCamera(dt) {
  spectate.on = false;
  const wanted = game.mode === 'mp' && mp.inMatch && player.dead;
  if (!wanted) {
    $('spectate').classList.add('hidden');
    return;
  }
  let a = spectate.id != null ? mp.avatars.get(spectate.id) : null;
  if (!a || (!a.alive && !spectate.killcam)) {
    // pick a squadmate who's still up (co-op) or anyone alive
    const alive = [...mp.avatars.values()].filter((o) => o.alive && (isCoop() || !mp.isEnemy(o.id) || spectate.killcam));
    a = alive[0] || null;
    spectate.id = a ? a.id : null;
    spectate.killcam = false;
  }
  if (!a) {
    $('spectate').classList.add('hidden');
    return;
  }
  spectate.on = true;
  // over the shoulder, a little above
  const yaw = a.yaw;
  _look.set(a.pos.x, a.pos.y + 1.5, a.pos.z);
  _camTo.set(a.pos.x + Math.sin(yaw) * 3.4 + Math.cos(yaw) * 0.6, a.pos.y + 2.3, a.pos.z + Math.cos(yaw) * 3.4 - Math.sin(yaw) * 0.6);
  // don't end up inside the ground
  _camTo.y = Math.max(_camTo.y, heightAt(_camTo.x, _camTo.z) + 0.6);
  camera.position.lerp(_camTo, Math.min(1, dt * 8));
  camera.lookAt(_look);
  const el = $('spectate');
  el.classList.remove('hidden');
  const hp = a.hp != null && !isCoop() ? ` · ${Math.max(0, Math.round(a.hp))} HP left` : '';
  const html = spectate.killcam
    ? `<b class="kc">KILL CAM</b> ${esc(a.info.name)}${hp}`
    : `Spectating <b>${esc(a.info.name)}</b> · click for the next player${isCoop() ? '<br><small>A squadmate can revive you, or you\'re back next wave</small>' : ''}`;
  if (last.spectate !== html) {
    last.spectate = html;
    el.innerHTML = html;
  }
}
function nextSpectate() {
  if (spectate.killcam) return;
  const alive = [...mp.avatars.values()].filter((o) => o.alive && (isCoop() || !mp.isEnemy(o.id)));
  if (!alive.length) return;
  const i = alive.findIndex((o) => o.id === spectate.id);
  spectate.id = alive[(i + 1) % alive.length].id;
}

// ---------------------------------------------------------------- settings (saved in this browser)
const SETTINGS_KEY = 'deadplains.settings';
const DEFAULT_SETTINGS = {
  sens: 1, padSens: 1, invertY: false, fov: 75, volume: 0.8, quality: 'high', dmgNumbers: true, fps: false, tutorial: true, autoWaves: false, music: 0.5,
  // the extra ones behind "Show all settings"
  hudScale: 1, crosshairSize: 1, minimap: true, chat: true, hitmarkers: true, shake: 1, bob: true, toggleAim: false, bubbles: true, flashlight: true,
  // where the gun sits on screen (0 = the normal spot)
  gunX: 0, gunY: 0, gunZ: 0,
  // camera: auto (third person in events), first or third
  view: 'auto',
  zombieModels: true,
};
const settings = { ...DEFAULT_SETTINGS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {
  /* defaults */
}
const QUALITY = { low: { ratio: 0.75, shadows: false }, medium: { ratio: 1, shadows: true }, high: { ratio: 1.75, shadows: true } };
function applySettings() {
  player.sensitivity = 0.0022 * settings.sens;
  player.invertY = settings.invertY;
  controls.sens = settings.padSens;
  audio.setVolume(settings.volume);
  const q = QUALITY[settings.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.ratio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
  }
  $('fps').classList.toggle('hidden', !settings.fps);
  const root = document.documentElement.style;
  root.setProperty('--hud-scale', settings.hudScale);
  root.setProperty('--xh-size', settings.crosshairSize);
  document.body.classList.toggle('no-minimap', !settings.minimap);
  document.body.classList.toggle('no-chat', !settings.chat);
  player.shakeMul = settings.shake;
  player.bobMul = settings.bob ? 1 : 0;
  mp.showBubbles = settings.bubbles;
  setZombieModels(settings.zombieModels);
  weapon.offset.x = settings.gunX;
  weapon.offset.y = settings.gunY;
  weapon.offset.z = -settings.gunZ;
  savePref(SETTINGS_KEY, JSON.stringify(settings));
}

const SETTING_ROWS = [
  // the everyday ones
  ['sens', 'Mouse sensitivity', 'range', 0.2, 3, 0.05],
  ['padSens', 'Touch / controller look speed', 'range', 0.2, 3, 0.05],
  ['invertY', 'Invert look up/down', 'check'],
  ['fov', 'Field of view', 'range', 60, 100, 1],
  ['volume', 'Volume', 'range', 0, 1, 0.05],
  ['quality', 'Graphics', 'select', ['low', 'medium', 'high']],
  ['dmgNumbers', 'Damage numbers', 'check'],
  ['fps', 'Show FPS', 'check'],
  ['tutorial', 'Tutorial wave for new games', 'check'],
  ['autoWaves', 'Start waves by themselves (no READY button)', 'check'],
  ['music', 'Music volume', 'range', 0, 1, 0.05],
];
// Gun position: move the gun on screen (aiming still lines it up in the middle)
const GUN_ROWS = [
  ['gunX', 'Left ↔ right', 'range', -0.4, 0.2, 0.01],
  ['gunY', 'Down ↕ up', 'range', -0.15, 0.12, 0.01],
  ['gunZ', 'Closer ↔ further', 'range', -0.15, 0.25, 0.01],
];
const GUN_PRESETS = { normal: ['Normal', 0, 0, 0], centre: ['Centre', -0.2, -0.02, 0], left: ['Left side', -0.4, 0, 0], low: ['Low', 0, -0.08, -0.05], far: ['Far away', 0.02, 0.02, 0.15] };
function setGunPreset(id) {
  const p = GUN_PRESETS[id];
  if (!p) return false;
  [, settings.gunX, settings.gunY, settings.gunZ] = p;
  applySettings();
  return true;
}
const fmtSetting = (k, v) => (k === 'volume' || k === 'music' ? `${Math.round(v * 100)}%` : k === 'fov' ? `${v}°` : k.startsWith('gun') ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}` : `${Number(v).toFixed(2)}x`);
// everything else, behind "Show all settings"
const MORE_SETTING_ROWS = [
  ['toggleAim', 'Right click toggles aim (instead of holding)', 'check'],
  ['hudScale', 'HUD size', 'range', 0.7, 1.3, 0.05],
  ['crosshairSize', 'Crosshair size', 'range', 0.5, 2, 0.05],
  ['minimap', 'Show the minimap', 'check'],
  ['chat', 'Show the chat', 'check'],
  ['hitmarkers', 'Hit markers', 'check'],
  ['shake', 'Screen shake', 'range', 0, 1.5, 0.05],
  ['bob', 'View bob when walking', 'check'],
  ['bubbles', "Show other players' quick chat over their heads", 'check'],
  ['flashlight', 'Flashlight at night', 'check'],
  ['zombieModels', '3D zombie models (turn off on a slow computer for the old block zombies)', 'check'],
];
const VIEW_ROW = ['view', 'Camera (P switches) · Auto: third person in events', 'select', ['auto', 'first', 'third']];
const ALL_SETTING_ROWS = [...SETTING_ROWS, VIEW_ROW, ...GUN_ROWS, ...MORE_SETTING_ROWS];
let showAllSettings = false;
const CONTROL_LIST = [
  ['WASD / arrows', 'Move'], ['Mouse', 'Look'], ['Left click', 'Shoot'], ['Right click', 'Aim / scope'], ['R', 'Reload'], ['Shift', 'Sprint'],
  ['C', 'Crouch · slide while sprinting'], ['Space', 'Jump / climb'], ['1-9, 0 / wheel', 'Switch gun'], ['I', 'My guns (change their order)'], ['X', 'Drop the gun you\'re holding'], ['Q', 'Last gun'], ['V', 'Knife stab'],
  ['G', 'Throw grenade'], ['B', 'Build (1 barricade, 2 turret, R turn)'], ['E', 'Revive a squadmate (hold)'], ['Z', 'Quick chat wheel'],
  ['T / Enter', 'Chat (online)'], ['Tab', 'Scores (online)'], ['M', 'Mute'], ['Esc', 'Pause'], ['F2', 'Admin panel (admins)'],
];
// Settings: how long your paid access has left, and what it costs
function accessBox() {
  const c = account.cfg || {};
  if (!account.paywall) return '';
  const price = esc(c.price || '$2');
  const months = c.months === undefined ? 6 : Number(c.months) || 0;
  const fee = months ? `${price} for every ${months} months` : `${price} once, yours forever`;
  let status;
  if (!account.loggedIn) status = '<b>Not active</b> · log in, or pay the owner to switch your account on';
  else if (!account.user?.paidUntil) status = '<b>Active</b> · no end date';
  else {
    const s = String(account.user.paidUntil);
    const end = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59Z` : s);
    const days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
    const date = new Date(end).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    status = `<b class="${days <= 14 ? 'acc-low' : ''}">${days} day${days === 1 ? '' : 's'} left</b> · until ${esc(date)}`;
  }
  return `<div class="access-box"><div><span class="muted small">YOUR ACCESS</span><div>${status}</div></div><div><span class="muted small">FEE</span>${priceTag(price, months)}<div class="muted small">${fee}, ${esc(c.payNote || 'paid cash in hand to the site owner')}</div></div></div>`;
}

function openSettings() {
  const fmt = fmtSetting;
  const row = ([k, label, type, a, b, step]) => {
    const v = settings[k];
    let input = '';
    if (type === 'range') input = `<input type="range" data-k="${k}" min="${a}" max="${b}" step="${step}" value="${v}" /><span class="s-val">${fmt(k, v)}</span>`;
    if (type === 'check') input = `<input type="checkbox" data-k="${k}" ${v ? 'checked' : ''} />`;
    if (type === 'select') input = `<select data-k="${k}">${a.map((o) => `<option ${o === v ? 'selected' : ''} value="${o}">${o[0].toUpperCase() + o.slice(1)}</option>`).join('')}</select>`;
    return `<label class="s-row"><span>${label}</span><span class="s-in">${input}</span></label>`;
  };
  $('settings-body').innerHTML = `${accessBox()}${SETTING_ROWS.map(row).join('')}${canSwitchView() ? row(VIEW_ROW) : ''}
    <div class="gun-pos"><h4>🔫 Gun position</h4>
      <div class="gun-presets">${Object.entries(GUN_PRESETS).map(([id, p]) => `<button class="chipbtn" data-gunpos="${id}">${p[0]}</button>`).join('')}</div>
      ${GUN_ROWS.map(row).join('')}
      <p class="muted small">Open Settings from the pause menu in a game to watch the gun move. Aiming still brings it to the middle.</p></div>
    <button id="settings-all" class="btn small ghost settings-all">${showAllSettings ? 'HIDE EXTRA SETTINGS ▴' : 'SHOW ALL SETTINGS ▾'}</button>
    <div class="settings-more ${showAllSettings ? '' : 'hidden'}">
      <h4>More settings</h4>
      ${MORE_SETTING_ROWS.map(row).join('')}
      <h4>Controls</h4>
      <div class="s-controls">${[...CONTROL_LIST, ...(canSwitchView() ? [['P', 'First / third person']] : [])].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}</div>
      <p class="muted small">Controller and touch controls are in How to Play.</p>
    </div>
    <details class="pay-terms settings-terms"><summary>Terms &amp; Conditions (no refunds)</summary>${termsHtml(account.cfg?.price || '$2', account.cfg?.payNote || 'paid cash in hand to the site owner', account.cfg?.months === undefined ? 6 : Number(account.cfg.months) || 0)}</details>`;
  $('settings-all').addEventListener('click', () => {
    showAllSettings = !showAllSettings;
    openSettings();
  });
  showPage('settings');
}
$('settings-body').addEventListener('input', (e) => {
  const el = e.target;
  const k = el.dataset.k;
  if (!k) return;
  const row = ALL_SETTING_ROWS.find((r) => r[0] === k);
  settings[k] = row[2] === 'check' ? el.checked : row[2] === 'select' ? el.value : Number(el.value);
  const val = el.parentElement.querySelector('.s-val');
  if (val) val.textContent = fmtSetting(k, settings[k]);
  applySettings();
});
$('settings-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gunpos]');
  if (b && setGunPreset(b.dataset.gunpos)) openSettings();
});
$('settings-reset').addEventListener('click', () => {
  Object.assign(settings, DEFAULT_SETTINGS);
  applySettings();
  openSettings();
});
$('settings-close').addEventListener('click', () => hidePage('settings'));
$('settings').addEventListener('click', (e) => {
  if (e.target === $('settings') && !$('settings').classList.contains('docked')) hidePage('settings');
});
$('pause-view').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleView();
});
for (const id of ['settings-btn', 'pause-settings']) {
  $(id).addEventListener('click', (e) => {
    e.stopPropagation();
    openSettings();
  });
}
// frames per second, when switched on
let fpsN = 0;
let fpsT = 0;
function updateFps(dt) {
  if (!settings.fps) return;
  fpsN++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    $('fps').textContent = `${Math.round(fpsN / fpsT)} FPS`;
    fpsN = 0;
    fpsT = 0;
  }
}

// ---------------------------------------------------------------- touch screens and controllers
const controls = new Controls({
  player,
  weapon,
  playing: () => game.state === 'playing',
  choosing: () => game.state === 'choosing',
  inMatch: () => game.mode === 'mp' && mp.inMatch,
  building: () => build.on,
  emotesOpen: () => emoteMenu.open,
  emoteAim: (x, y) => (Math.hypot(x, y) > 0.35 ? aimWheel(x * WHEEL_R, y * WHEEL_R) : null),
  emoteSend: () => (emoteMenu.hi >= 0 ? sendEmote(emoteMenu.hi) : setEmotes(false)),
  look(dx, dy) {
    if (game.state !== 'playing' || player.dead) return;
    player.look(dx, dy, camera.fov / 75);
    weapon.sway(dx * (1 - weapon.ads * 0.8), dy * (1 - weapon.ads * 0.8));
  },
  pause() {
    if (game.state !== 'playing') return;
    controls.releaseAll();
    pauseFor('PAUSED', game.mode === 'mp' ? 'The match keeps going! Tap to continue' : 'Tap or press A to continue');
  },
  resume() {
    if (game.state === 'paused') lock();
  },
});
applySettings();

// playing with a controller and then grabbing the keyboard: Esc still pauses
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.state === 'playing' && !document.pointerLockElement) controls.ctx.pause();
});

// ---------------------------------------------------------------- friend chat
// Chat with friends from the menu (Friends → Chat). From a room lobby you can invite them; an invite has a JOIN button.
accountUI.roomCode = () => (mp.lobby ? mp.lobby.code : null);
accountUI.joinRoom = (code) => {
  if (mp.lobby) return mp.lobby.code === code ? "You're already in that room." : 'Leave your room first.';
  if (!['menu', 'mpmenu', 'newgame', 'saves'].includes(game.state)) return 'Go back to the main menu first.';
  accountUI.close();
  audio.init();
  game.state = 'mpmenu';
  showOnly('mp-menu');
  $('mp-code').value = code;
  $('mp-error').textContent = 'Joining…';
  mp.join(code).then((err) => ($('mp-error').textContent = err || ''));
  return '';
};
$('lobby-invite').addEventListener('click', () => accountUI.open('friends'));
// a new message while you're playing shows up in the game chat
account.onUnread((now, before) => {
  const chatting = !$('account-modal').classList.contains('hidden') && accountUI.chatWith;
  for (const [name, n] of Object.entries(now)) {
    if (n > (before[name] || 0) && chatting !== name) addChat('💬', `${name} sent you a message (Friends → Chat in the menu)`, '#7fd4ff');
  }
});

accountUI.adminActions = {
  build: () => ({ build: BUILD, at: BUILT_AT }),
  async checkVersion() {
    if (BUILD === 'dev') return 'This is the test version (no version check here).';
    const live = await liveBuild();
    if (!live) return "Couldn't reach the server to check.";
    if (live === BUILD) return 'You have the newest version. Everyone else gets moved onto it within a minute of it going live.';
    versionWatch.check();
    return 'A newer version is live: restarting…';
  },
  viewName: () => (wantThird() ? 'THIRD PERSON' : 'FIRST PERSON'),
  toggleView() {
    settings.view = wantThird() ? 'first' : 'third';
    applySettings();
    return wantThird() ? 'Third person (aiming still goes through your sights).' : 'First person.';
  },
  halloweenPreview: () => halloweenPreview,
  toggleHalloweenPreview() {
    halloweenPreview = !halloweenPreview;
    savePref('deadplains.halloweenPreview', halloweenPreview ? '1' : '0');
    syncHalloween();
    const now = inMenu() && game.mode !== 'mp';
    if (now) loadMap(game.map);
    return `${halloweenPreview ? '👻 Halloween preview on (only you see it).' : 'Halloween preview off.'} ${now ? '' : 'It shows from the next game or map that loads.'}`;
  },
  zombieModels: () => settings.zombieModels,
  toggleZombieModels() {
    settings.zombieModels = !settings.zombieModels;
    applySettings();
    return settings.zombieModels ? 'New zombies use the 3D model.' : 'New zombies use the old blocks.';
  },
  // admin: bots in the room you host (any mode but events)
  addBots(n) {
    if (!mp.lobby) return 'Make or join a room first (you have to be its host).';
    if (!mp.isHost()) return 'Only the host can add bots.';
    if (MODES[mp.lobby.mode]?.event) return 'No bots in events.';
    mp.send({ t: 'bots', n });
    return n ? `${n} bots will play in this room${mp.inMatch ? '' : ' when the match starts'}.` : 'No more bots in this room.';
  },
  // admin: join any room by its code (private ones too)
  async joinRoom(code) {
    const err = await mp.join(code);
    return err || `Joined room ${code}.`;
  },
  setBots(n) {
    if (game.mode !== 'mp' || !mp.lobby) return 'Join a room first.';
    mp.send({ t: 'bots', n });
    return n ? `${n} bot${n > 1 ? 's' : ''} in this room (PvP modes; they leave to make room for people).` : 'No bots in this room.';
  },
  gunPresets: () => Object.entries(GUN_PRESETS).map(([id, p]) => [id, p[0]]),
  gunPreset: (id) => (setGunPreset(id) ? `Gun moved: ${GUN_PRESETS[id][0]}.` : 'Unknown spot.'),
  get god() {
    return cheats.god;
  },
  get ammo() {
    return cheats.ammo;
  },
  cheats,
  inSolo: () => game.mode === 'solo' && !inMenu(),
  inMP: () => game.mode === 'mp',
  toggle(name, on) {
    if (!account.admin) return 'Unlock admin first.';
    if (game.mode === 'mp' && SOLO_ONLY_CHEATS.includes(name) && on && !simHost()) return 'That one controls the zombies, so in multiplayer it only works in a co-op room you host.';
    cheats[name] = on;
    sendCheats();
    if (name === 'nohud') $('hud').style.visibility = on ? 'hidden' : '';
    if (name === 'fly' && !on) player.vel.set(0, 0, 0);
    const inGame = (game.mode === 'solo' || game.mode === 'mp') && !inMenu();
    return `${name} ${on ? 'ON' : 'OFF'}${game.mode === 'mp' ? ' (just for you)' : inGame ? '' : ' (works when you start a game)'}`;
  },
  run(action, value) {
    if (action === 'cheatsoff') {
      for (const k of Object.keys(cheats)) cheats[k] = false;
      $('hud').style.visibility = '';
      sendCheats();
      return 'All cheats turned off.';
    }
    if (action === 'tutorial') {
      localStorage.removeItem(TUT_DONE_KEY);
      settings.tutorial = true;
      applySettings();
      return 'The tutorial will play at the start of your next new game.';
    }
    if (!cheatsOn() || inMenu()) return 'Start a game first.';
    // world-changing ones (bosses, waves, weather...) work in a co-op room you host: the host runs the zombies
    if (game.mode === 'mp' && !MP_ADMIN_ACTIONS.includes(action) && !simHost()) return 'That one controls the zombies and waves, so in multiplayer it only works in a co-op room you host.';
    switch (action) {
      case 'guns':
        for (const id of Object.keys(GUNS)) if (id !== 'rifle') weapon.give(id, stats);
        return 'All guns added.';
      case 'mutate': {
        const muts = Object.keys(MUTATIONS);
        weapon.slots.forEach((s, i) => {
          s.mut = muts[i % muts.length];
        });
        weapon.refreshModels();
        return 'Every gun is mutated.';
      }
      case 'powerups': {
        for (const p of POWERUPS) {
          if (p.canOffer && !p.canOffer(stats)) continue;
          const rarity = p.tiers.legendary !== undefined ? 'legendary' : 'epic';
          const have = owned.get(p.id)?.count || 0;
          for (let i = have; i < p.max; i++) {
            if (p.canOffer && !p.canOffer(stats)) break;
            p.apply(stats, p.tiers[rarity], { player });
          }
          owned.set(p.id, { def: p, count: p.max, rarity });
        }
        weapon.refillMags(stats);
        renderOwned();
        return 'Every power-up maxed.';
      }
      case 'heal':
        player.health = overhealCap();
        return 'Healed (with full overheal).';
      case 'infinitereserve':
        for (const s of weapon.slots) s.reserve = Infinity;
        return 'Every gun you carry has unlimited reserve ammo.';
      case 'removeguns':
        weapon.reset(stats);
        return 'Guns removed: back to the rifle and knife.';
      case 'scrap':
        game.scrap = 999;
        return 'Scrap: 999. Press B to build.';
      case 'nades':
        game.grenades = Math.max(game.grenades, maxGrenades());
        return `Grenades: ${game.grenades}.`;
      case 'setscrap':
        game.scrap = Math.max(0, Math.min(999, Math.floor(value)));
        persistRun();
        return `Scrap set to ${game.scrap}.`;
      case 'setnades':
        game.grenades = Math.max(0, Math.min(20, Math.floor(value)));
        persistRun();
        return `Grenades set to ${game.grenades}.`;
      case 'noscrap':
        game.scrap = 0;
        game.grenades = 0;
        return 'Scrap and grenades set to 0.';
      case 'clearbuilds':
        structures.clear();
        setBuild(false);
        return 'Every barricade and turret removed.';
      case 'skiptut':
        if (!tut.on) return 'The tutorial is not running.';
        endTutorial(true);
        return 'Tutorial skipped.';
      case 'unmutate':
        for (const s of weapon.slots) s.mut = null;
        weapon.refreshModels();
        return 'Mutations removed from your guns.';
      case 'resetpowerups': {
        stats = baseStats();
        const it = account.items;
        stats.maxHealth += 10 * (it.toughness || 0);
        stats.damageMul += 0.05 * (it.firepower || 0);
        stats.reloadSpeed += 0.1 * (it.quickhands || 0);
        owned.clear();
        renderOwned();
        player.health = Math.min(player.health, stats.maxHealth);
        for (const s of weapon.slots) s.ammo = Math.min(s.ammo, weapon.magSize(stats, s.def));
        return 'Power-ups reset (shop upgrades kept).';
      }
      case 'cheatsoff':
        for (const k of Object.keys(cheats)) cheats[k] = false;
        $('hud').style.visibility = '';
        player.vel.set(0, 0, 0);
        return 'All cheats turned off.';
      case 'boss':
        {
          const v = BOSSES[value] ? value : BOSS_IDS[(adminBossN++) % BOSS_IDS.length];
          zombies.spawn('boss', Math.max(5, game.wave), player.pos, true, v);
          bossBanner(v);
        }
        if (game.phase !== 'active') game.phase = 'active';
        return `${(BOSSES[value] || BOSSES.abomination).name} spawned.`;
      case 'repairbuilds': {
        const mine = structures.list.filter((st) => st.owner === myOwner());
        for (const st of mine) structures.setHp(st.id, st.def.hp);
        return `Repaired ${mine.length} build${mine.length === 1 ? '' : 's'} to full health.`;
      }
      case 'wavecap':
        adminWaveCap = Math.max(5, Math.min(300, Math.floor(value)));
        return `Waves now have at most ${adminWaveCap} zombies (from the next wave).`;
      case 'nextmod': {
        const id = MOD_IDS[Math.floor(Math.random() * MOD_IDS.length)];
        if (game.phase === 'prep') game.nextMod = id;
        else game.forceMod = id;
        return `Next wave: ${MODIFIERS[id].name}`;
      }
      case 'bountynow': {
        const z = zombies.spawn('walker', Math.max(1, game.wave), player.pos, false);
        game.cfg ||= waveConfig(Math.max(1, game.wave));
        makeBounty(z);
        if (game.phase !== 'active') game.phase = 'active';
        return 'A bounty zombie is coming for you.';
      }
      case 'points':
        game.score += 5000;
        return `+5000 points (you have ${points()} to spend).`;
      case 'allbadges':
        for (const a of ACHIEVEMENTS) account.unlock(a.id);
        return `All ${ACHIEVEMENTS.length} achievements unlocked.`;
      case 'startwave':
        if (game.phase !== 'prep') return 'No wave is waiting right now.';
        game.phase = 'countdown';
        game.timer = 1;
        return `Wave ${game.wave + 1} is starting.`;
      case 'killall':
        for (const z of zombies.list) if (z.alive && zombies.damage(z, 1e9)) onKill(z, false);
        game.toSpawn = 0;
        game.bossToSpawn = 0;
        return 'All zombies killed (wave ends).';
      case 'lineup': {
        // one of every kind (and a mutated one), to see all the different looks
        for (const t of ['walker', 'runner', 'brute', 'crawler', 'spitter', 'bloater', ...(isHalloween() ? HW_SPECIALS.map(([id]) => id) : [])]) zombies.spawn(t, Math.max(1, game.wave), player.pos, false);
        zombies.spawn('walker', Math.max(1, game.wave), player.pos, true);
        if (game.phase !== 'active') game.phase = 'active';
        return 'Spawned one of every kind of zombie (and a mutated one).';
      }
      case 'spawn': {
        for (let i = 0; i < 5; i++) zombies.spawn(value, Math.max(1, game.wave), player.pos, false);
        if (game.phase !== 'active') game.phase = 'active';
        return `Spawned 5 ${value}s.`;
      }
      case 'weather':
        weather.set(value);
        return `Weather: ${WEATHER[value].name}`;
      case 'score':
        game.score = Math.max(0, Math.floor(value));
        persistRun();
        return `Score set to ${game.score}.`;
      case 'wave':
        for (const z of zombies.list) if (z.alive) zombies.damage(z, 1e9);
        game.wave = Math.max(0, Math.min(200, Math.floor(value)) - 1);
        game.toSpawn = 0;
        game.bossToSpawn = 0;
        game.phase = 'countdown';
        game.timer = 3;
        // saved straight away: continuing this game later starts at the new wave
        persistRun();
        return `Wave ${game.wave + 1} starts in 3 seconds (saved).`;
    }
    return '';
  },
  zombieTypes: () => Object.keys(ZOMBIE_TYPES),
  bosses: () => BOSS_IDS.map((id) => [id, BOSSES[id].name]),
  get nightMode() {
    return adminNight;
  },
  setNightMode(m) {
    adminNight = ['auto', 'night', 'day'].includes(m) ? m : 'auto';
    if (zombieGame() && !inMenu() && simHost()) setNight(isNightWave(game.phase === 'active' ? game.wave : game.wave + 1), true);
    return { auto: 'Night every 4th wave (normal).', night: 'Every wave is a night wave.', day: 'No more night waves.' }[adminNight];
  },
  maps: () => Object.entries(MAPS).map(([id, m]) => [id, m.name]),
  get soloMap() {
    return adminSoloMap;
  },
  setSoloMap(id) {
    if (!MAPS[id]) return '';
    adminSoloMap = id;
    return `New solo games will be on ${MAPS[id].name}.`;
  },
  supplyDrop() {
    if (game.mode === 'mp' && mp.inMatch) {
      mp.send({ t: 'admindrop' });
      return 'Supply drop on its way to you (everyone sees it).';
    }
    if (game.mode !== 'solo' || inMenu()) return 'Start a game first.';
    soloSupplyDrop({ x: player.pos.x + 3, z: player.pos.z + 1 });
    return 'Supply drop on its way to you.';
  },
  // map props: red barrels and ammo crates (solo games)
  barrels(what) {
    if (!simHost() || inMenu()) return 'Start a solo game (or host a co-op room) first.';
    const list = world.explosives || [];
    if (what === 'boom') {
      const live = list.filter((b) => b.alive);
      live.forEach((b, i) => barrelQueue.push({ b, t: 0.05 + i * 0.04, mine: true }));
      return `💥 ${live.length} barrels going off.`;
    }
    if (what === 'back') {
      resetMapProps();
      return `All ${list.length} barrels are back and every ammo crate is full.`;
    }
    if (what === 'place') {
      camera.getWorldDirection(_dir);
      const x = player.pos.x + _dir.x * 3;
      const z = player.pos.z + _dir.z * 3;
      world.addBarrel(x, z);
      return 'Red barrel placed in front of you. Shoot it!';
    }
    if (what === 'ammo') {
      ammoCd.clear();
      for (const c of world.ammoCrates || []) c.lamp.material.color.setHex(0x5aff6a);
      return `All ${(world.ammoCrates || []).length} ammo crates are full again.`;
    }
    return '';
  },
  // admin: this room's players and teams (works mid-match too)
  roomTeams() {
    if (game.mode !== 'mp' || !mp.lobby) return null;
    return { teams: !!MODES[mp.lobby.mode]?.teams, players: mp.lobby.players.map((p) => ({ id: p.id, name: p.name, team: p.team, me: p.id === mp.myId })) };
  },
  setTeam(id, team) {
    mp.send({ t: 'setteam', id, team });
    return `Moving to ${team.toUpperCase()}…`;
  },
  teamOp(op) {
    mp.send({ t: 'teamops', op });
    return 'Done.';
  },
  announce(text) {
    if (game.mode !== 'mp' || !mp.lobby) return 'Join a room first.';
    if (!String(text).trim()) return 'Type a message first.';
    mp.send({ t: 'announce', text });
    return 'Announced.';
  },
  weathers: () => world.theme.weathers.filter((w, i, a) => a.indexOf(w) === i).map((w) => [w, WEATHER[w].name]),
};
// F2 opens the admin panel
document.addEventListener('keydown', (e) => {
  if (e.code !== 'F2' || !account.loggedIn) return;
  e.preventDefault();
  if (document.pointerLockElement) document.exitPointerLock();
  accountUI.open('admin');
});

function update(dt) {
  if (cheatsOn()) {
    if (cheats.slowmo && simHost()) dt *= 0.35;
    if (cheats.ammo) for (const s of weapon.slots) s.ammo = weapon.magSize(stats, s.def);
    if (cheats.god) player.health = Math.max(player.health, stats.maxHealth);
  }
  const def = weapon.def;
  const moveMul = (def.moveMul || 1) * (1 - weapon.ads * 0.35);
  const flying = cheatsOn() && cheats.fly;
  if (tank.on) for (const k of ['ShiftLeft', 'ShiftRight', 'Space', 'KeyC', 'ControlLeft']) player.keys.delete(k); // tanks don't sprint, jump or crouch
  // hide and seek: seekers stay put (eyes shut) until they've finished counting
  const speedMul = (cheatsOn() && cheats.speed ? 2 : 1) * (mp.seeker && mp.countdown > 0 ? 0 : 1);
  if (mp.seeker && mp.countdown > 0) player.keys.delete('Space');
  updateBlindfold(dt);
  updateCandy(dt);
  const hSpeed = flying ? flyUpdate(dt) : player.update(dt, world.colliders, stats, trigger || aim, audio, moveMul * speedMul * weatherMove(), world.ladders);
  tpCamera(); // events: over the shoulder
  hitSoundPlayed = false;
  if (tank.on && !player.dead && trigger) fireTank();
  const shots = player.dead || tank.on
    ? 0
    : weapon.update(
        dt,
        { trigger, pressed, sprinting: player.sprinting || player.climbing || player.sliding, moving: hSpeed > 0.5, speed: hSpeed, aim },
        stats
      );
  pressed = false;
  for (let i = 0; i < shots; i++) fireShot(hSpeed > 0.5, hSpeed);
  if (weapon.ammo === 0 && weapon.slot.reserve > 0 && weapon.reloading <= 0 && !trigger) weapon.startReload(stats);
  updateProjectiles(dt);
  updateThrown(dt);
  if (build.on) updateBuildGhost();
  updateRevive(dt);
  updateMapProps(dt);
  updateShields(dt);
  updateReadyUp();
  questFlushT -= dt;
  if (questFlushT <= 0) flushQuests();
  if (inv.skip && Math.hypot(player.pos.x - inv.skip.x, player.pos.z - inv.skip.z) > 3) inv.skip = null;
  if (!player.dead) pickups.update(dt, player.pos, onPickGun);
  updateSupply(dt);
  updateLive(dt);
  if (!isCoop() && !isEvent()) worldTick(dt);
  else updateMedkits(dt); // co-op runs worldTick from the frame loop, even while paused
  explosionSoundT -= dt;
}

// Zombies, waves, medkits and hazards. In co-op this keeps running while you're in a menu.
function worldTick(dt) {
  if (structures.list.length) updateTurrets(dt);
  if (isEvent()) {
    // events: there's no host to see, but one player's game moves the zombies for everyone. If they leave,
    // the server picks someone else and their game carries on with the same zombies.
    if (simHost() && !ev.wasSim) {
      ev.wasSim = true;
      for (const z of zombies.list) zombies.nextId = Math.max(zombies.nextId, z.id || 0);
    }
    if (!simHost() && ev.wasSim) {
      // someone else moves the zombies now (our game was hidden): ours follow theirs from here
      ev.wasSim = false;
      for (const z of zombies.list) {
        z.net = z.root.position.clone();
        z.netYaw = z.root.rotation.y;
        z.puppet = true;
      }
    }
    if (simHost()) {
      if (!(cheatsOn() && cheats.freeze)) zombies.update(dt, zombieTargets(), zombieHooks);
      eventDirector(dt);
      coop.snapT -= dt;
      if (coop.snapT <= 0) {
        coop.snapT = 0.1;
        mp.relay('all', { k: 'zs', ev: 1, z: zombies.snapshot() });
      }
    } else zombies.updatePuppets(dt);
    updateMedkits(dt);
    return;
  }
  if (zombieGame()) {
    if (simHost()) {
      if (!(cheatsOn() && cheats.freeze && simHost())) zombies.update(dt, isCoop() ? zombieTargets() : player, zombieHooks);
      if (isDefend()) tickDefend(dt);
      updateWave(dt);
    } else {
      zombies.updatePuppets(dt);
    }
    if (game.mode === 'solo') updateMedkits(dt);
    // toxic pools
    hazardT -= dt;
    if (hazardT <= 0) {
      hazardT = 0.5;
      for (const h of world.hazards) {
        if (Math.hypot(player.pos.x - h.x, player.pos.z - h.z) < h.r && player.pos.y - heightAt(player.pos.x, player.pos.z) < 0.4) {
          onPlayerHit(null, h.dps * 0.5, h.kind === 'lava' ? 'fire' : 'acid');
        }
      }
    }
  } else if (game.mode === 'mp') {
    updateMedkits(dt); // health packs
  }
  if (isCoop()) {
    // host: share the zombies ~10x a second; everyone: share their score now and then
    coop.snapT -= dt;
    if (mp.isHost() && coop.snapT <= 0) {
      coop.snapT = 0.1;
      const remaining = game.phase === 'active' ? game.toSpawn + game.bossToSpawn + zombies.aliveCount : 0;
      mp.relay('all', { k: 'zs', w: game.wave, r: remaining, p: game.phase, t: Math.ceil(game.phase === 'prep' ? prep.t : game.timer), z: zombies.snapshot(), pt: isDefend() ? defend.rows() : undefined, n: game.night ? 1 : 0, rd: game.phase === 'prep' ? [prep.ready.size, prepNeeded().length] : undefined, nm: game.nextMod, ns: game.nextSpecial, ev: game.phase === 'evac' ? Math.round(evac.hold * 10) / 10 : undefined });
    }
    coop.scoreT -= dt;
    if (coop.scoreT <= 0) {
      coop.scoreT = 2;
      mp.send({ t: 'score', kills: game.kills, score: game.score });
    }
  }
}

// Messages from other players in a co-op run.
function onCoopRelay(from, d) {
  switch (d.k) {
    case 'zs': // zombie snapshot from the host
      if (mp.isHost()) return;
      if (d.ev) return zombies.applySnapshot(d.z || []); // events: just the zombies
      zombies.applySnapshot(d.z || []);
      setNight(!!d.n, true);
      if (isDefend()) defend.apply(d.pt);
      game.wave = d.w | 0;
      coop.remaining = d.r | 0;
      // a new break: everyone starts not ready
      if (d.p === 'prep' && game.phase !== 'prep') prep.me = false;
      game.phase = d.p === 'picking' ? 'cleared' : d.p;
      game.timer = d.p === 'prep' ? 0 : d.t || 0;
      if (Array.isArray(d.rd)) [prep.rd, prep.nd] = d.rd;
      prep.nextMod = MODIFIERS[d.nm] ? d.nm : null;
      prep.nextSpecial = SPECIALS[d.ns] ? d.ns : null;
      if (typeof d.ev === 'number') evac.hold = d.ev;
      prep.left = d.p === 'prep' ? d.t : 0;
      break;
    case 'zhit': {
      // a guest shot one of our zombies
      if (!mp.isHost()) return;
      const z = zombies.list.find((o) => o.id === d.id);
      if (!z || !z.alive) return;
      const dmg = Math.max(0, Math.min(5000, Number(d.dmg) || 0));
      const src = ['melee', 'grenade', 'turret', 'wolf', 'flamer'].includes(d.src) ? d.src : null;
      applyZombieHit(z, dmg, { head: !!d.head, mut: MUTATIONS[d.mut] ? d.mut : null, slow: Math.min(0.75, Number(d.slow) || 0), shooter: from, src });
      break;
    }
    case 'kill':
      rewardKill({ type: d.type, mut: !!d.mut, head: !!d.head, src: ['melee', 'grenade', 'turret', 'barrel', 'wolf'].includes(d.src) ? d.src : null, x: d.x, y: d.y, z: d.z, bounty: !!d.bounty });
      break;
    case 'ouch':
      onPlayerHit(null, Math.max(0, Math.min(200, Number(d.dmg) || 0)), d.kind);
      break;
    case 'boom': {
      const p = new THREE.Vector3(d.x, d.y, d.z);
      effects.explosion(p, (d.r || 4.5) / 2.6);
      effects.burst(p, { count: 30, color: [0x8dff4a, 0x5ac020, 0xc8ff6a], speed: 6, size: 0.16, life: 0.7, grav: 4, up: 1.2 });
      audio.explosion(p);
      const dist = p.distanceTo(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z));
      if (dist < (d.r || 4.5)) onPlayerHit(null, 30 * (1 - (dist / (d.r || 4.5)) * 0.6), 'blast');
      break;
    }
    case 'glob':
      if (!mp.isHost()) zombies.addGlob(new THREE.Vector3(...d.f), new THREE.Vector3(...d.v), 0, !!d.h);
      break;
    case 'wave':
      if (mp.isHost()) return;
      game.wave = d.wave;
      game.night = !!d.night;
      game.mod = MODIFIERS[d.mod] ? d.mod : null;
      game.special = SPECIALS[d.sp] ? d.sp : null;
      applyWaveTwist();
      banner(`WAVE ${d.wave}`, d.sub, d.boss ? 'red' : '', 2.6);
      audio.waveStart();
      if (d.weather && WEATHER[d.weather] && weather.id !== d.weather) weather.set(d.weather);
      break;
    case 'cleared':
      if (mp.isHost()) return;
      waveAchievements(d.wave | 0);
      game.mod = null;
      game.special = null;
      applyWaveTwist();
      player.heal(20, overhealCap());
      game.score += pointsBonus(d.wave);
      giveGrenades(2);
      game.scrap = Math.min(999, game.scrap + 10);
      questAdd('waves');
      questAdd('coopWaves');
      if (game.night) questAdd('nightWaves');
      flushQuests();
      banner(`WAVE ${d.wave} CLEARED`, `+20 HP${isDefend() ? ` · ${defend.heldCount}/3 points held` : ''} · pick a power-up`, 'gold', 2.3);
      audio.waveCleared();
      setTimeout(() => {
        if (isCoop() && !player.dead) openChoice();
      }, 2400);
      break;
    case 'ready':
      if (mp.isHost()) coop.ready.add(from);
      break;
    case 'evac':
      if (mp.isHost()) return;
      evacVisual(Number(d.x) || 0, Number(d.z) || 0);
      banner('🚁 THE HELICOPTER IS HERE', `Get the whole squad into the landing zone and hold it for ${EVAC_HOLD}s`, 'gold', 3.2);
      break;
    case 'waveready':
      if (mp.isHost() && game.phase === 'prep') prep.ready.add(from);
      break;
    case 'wavego':
      if (mp.isHost()) return;
      prep.me = false;
      banner('GET READY', `Wave ${d.wave | 0} in 3 seconds`, '', 1.4);
      break;
    case 'bossfx':
      if (mp.isHost()) return;
      if (d.what === 'arrive' && BOSSES[d.v]) banner(BOSSES[d.v].name.toUpperCase(), BOSSES[d.v].desc, 'red', 2.4);
      else bossEvent(d.what);
      break;
  }
}


function menuCamera() {
  const a = time * 0.04;
  camera.position.set(Math.cos(a) * 34, heightAt(Math.cos(a) * 34, Math.sin(a) * 34) + 7, Math.sin(a) * 34);
  camera.lookAt(0, 3, 0);
}

let prev = performance.now();
// music follows the fight: calm between waves, drums and bass as the horde grows, loudest for bosses
function updateMusic() {
  let level = 0;
  if (!inMenu() && zombies) {
    if (zombieGame()) {
      if (game.phase === 'active') level = Math.min(1, 0.35 + zombies.aliveCount / 35 + (zombies.list.some((z) => z.alive && z.typeId === 'boss') ? 0.5 : 0));
      else if (game.phase === 'evac') level = 1;
      else level = 0.05;
    } else if (game.mode === 'mp' && mp.inMatch) level = 0.55;
  }
  audio.music(level, settings.music);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  time += dt;
  controls.update(dt);
  controls.updateTouchUi(game.state === 'playing' && !player.dead);
  updateMusic();
  updateFps(dt);

  if (game.state === 'playing') update(dt);
  else if (game.mode === 'mp' && game.state === 'paused' && mp.inMatch) {
    // the match keeps running while the menu is up
    player.update(dt, world.colliders, stats, false, audio, 1, world.ladders);
    tpCamera();
  }
  if ((isCoop() || isEvent()) && ['playing', 'paused', 'choosing'].includes(game.state)) worldTick(dt);
  if (game.mode === 'mp') {
    mp.update(dt, time);
    // AI bots: the host's game moves them
    bots.update(dt, { mp, world, player, effects, audio, zombies, hitZombie: botHitZombie });
  }
  const fov = inMenu() ? 75 : settings.fov + (weapon.def.zoomFov - 75) * weapon.ads;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  const menuish = inMenu();
  if (menuish) menuCamera();
  if (!menuish) updateHud(dt);
  const viewPos = menuish ? camera.position : player.pos;
  world.update(dt, time, viewPos);
  weather.night = zombieGame() && game.night && !inMenu() ? 1 : 0;
  weather.update(dt, camera.position);
  updateFlashlight();
  effects.update(dt);
  updateDamageNumbers(dt);
  updateZombieMarkers();
  defend.update(dt, time);
  updatePets(dt);
  updateMyAvatar(dt);
  updateEventDrops(dt);
  updateTank(dt);
  structures.update(dt, effects);
  updateChat();

  if (!menuish) spectateCamera(dt);
  camera.getWorldDirection(_fwd);
  audio.setListener(camera.position, _fwd);

  renderer.clear();
  renderer.render(scene, camera);
  if (!menuish && !player.dead && !weapon.scoped && !spectate.on && !thirdPerson()) weapon.render(renderer);
}

loadMap(game.map);
renderBest();
applyProfile();
showOnly('menu');
// the admin's announcement: on every player's screen (any room, or the menu) until they press OK
account.onAnnounce = (a, seen) => {
  let el = $('announce-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'announce-pop';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="ap-card"><div class="ap-head">📢 ANNOUNCEMENT</div><div class="ap-text">${esc(a.text)}</div>
    <div class="ap-from">from admin <b>${esc(a.from)}</b> · ${new Date(a.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
    <button class="btn" id="announce-ok">OK</button></div>`;
  el.classList.remove('hidden');
  // free the mouse so they can press OK
  if (document.pointerLockElement) document.exitPointerLock();
  $('announce-ok').onclick = () => {
    seen();
    el.classList.add('hidden');
  };
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') account.pollUnread();
  // events: a hidden game can't move the zombies, so the server hands that to someone else
  if (isEvent()) mp.send({ t: 'away', on: document.hidden });
});
// a new version went live: everyone restarts onto it (straight away on the menu, after a short countdown mid-game)
function newVersionPop(build) {
  let el = $('version-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'version-pop';
    document.body.appendChild(el);
  }
  let left = inMenu() ? 3 : 15;
  el.innerHTML = `<div class="ap-card"><div class="ap-head">🔄 NEW VERSION</div><div class="ap-text">War Grounds has been updated!</div>
    <div class="ap-from">Restarting to the new version in <b id="version-left">${left}</b>…</div>
    <button class="btn" id="version-now">RESTART NOW</button></div>`;
  if (document.pointerLockElement) document.exitPointerLock();
  $('version-now').onclick = () => restartToNew(build);
  const t = setInterval(() => {
    if (--left <= 0) {
      clearInterval(t);
      restartToNew(build);
    }
    const n = $('version-left');
    if (n) n.textContent = Math.max(0, left);
  }, 1000);
}
const versionWatch = watchVersion(newVersionPop);
// the zombie model from public/models (the block zombies are used until it has loaded)
loadZombieModel();
// the owner's gun models (the MK14 is the LMG): swap them in once loaded
loadGunModels().then(() => {
  weapon.refreshModels();
  pickups.refreshModels?.();
});
// the tank model (the block tank is used until it has loaded)
loadTankModel();
// the wolf model (the block wolf is used until it has loaded)
loadWolfModel().then(() => {
  myWolf?.refresh();
  mp.refreshPets?.();
});
// no guests: straight to sign up / log in when you open the site without an account
account.init().then(() => needAccount());
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy for poking at the game from the console / automated smoke tests.
  window.__game = {
    tick: (n = 1, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) {
        update(dt);
        if (isCoop()) worldTick(dt);
      }
    },
    input: (o) => {
      if ('trigger' in o) trigger = o.trigger;
      if ('pressed' in o) pressed = o.pressed;
      if ('aim' in o) aim = o.aim;
    },
    get world() {
      return world;
    },
    get zombies() {
      return zombies;
    },
    get supply() {
      return supply;
    },
    soloSupplyDrop,
    get pickups() {
      return pickups;
    },
    get weather() {
      return weather;
    },
    get savedGames() {
      return savedGames;
    },
    bots, botTick: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) bots.update(dt, { mp, world, player, effects, audio, zombies, hitZombie: botHitZombie }); },
    get wolf() { return myWolf; }, wolfHunt, eventDropChance, effects, killedBy, candy, ev, worldTick, isEvent, tank,
    game, player, weapon, mp, account, accountUI, defend, structures, spectate, controls, get weather() { return weather; }, stats: () => stats, refreshSave, startGame, onPlayerHit, beginWave, openChoice, choose, loadMap, POWERUPS, scene, camera, renderer, levelFromXp,
  };
}
