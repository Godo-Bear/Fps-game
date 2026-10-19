// Multiplayer game modes and their map layout. Shared by the client and the room server.

export const MODES = {
  coop: { id: 'coop', name: 'Co-op Survival', short: 'CO-OP', teams: false, coop: true, desc: "Everyone on one team against the zombie waves. If the whole squad goes down, it's over." },
  defend: { id: 'defend', name: 'Defend the Points', short: 'DEF', teams: false, coop: true, desc: 'Your squad holds points A, B and C while zombie waves try to take them. Stand on a point to defend it; lose all three and it\'s over.' },
  ffa: { id: 'ffa', name: 'Free-for-all', short: 'FFA', teams: false, desc: 'Everyone for themselves. First to 20 kills wins.', killLimit: 20 },
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teams: true, desc: 'Red vs Blue. First team to 30 kills wins.', killLimit: 30 },
  koth: { id: 'koth', name: 'Capture Point', short: 'CP', teams: true, desc: 'Hold the point in the middle of the map. First to 150 points wins.', scoreLimit: 150 },
  ctf: { id: 'ctf', name: 'Capture the Flag', short: 'CTF', teams: true, desc: "Steal the enemy flag and bring it to yours. First to 3 captures wins.", scoreLimit: 3 },
  gungame: { id: 'gungame', name: 'Gun Game', short: 'GG', teams: false, gungame: true, desc: 'Every kill gives you the next gun. Get a kill with the last one, the knife, to win. Knife someone to send them back a gun.' },
  oitc: { id: 'oitc', name: 'One in the Chamber', short: '1IC', teams: false, oitc: true, killLimit: 10, desc: 'One bullet in your revolver and a knife. Every bullet kills; every kill gives you another bullet. First to 10 kills.' },
  jugg: { id: 'jugg', name: 'Juggernaut', short: 'JUG', teams: false, jugg: true, scoreLimit: 20, desc: 'One player is the Juggernaut: triple health and a machine gun. Kill the Juggernaut to become it. Points for kills as the Juggernaut and for taking it down.' },
  extract: { id: 'extract', name: 'Extraction', short: 'EVAC', teams: false, coop: true, extract: true, desc: 'Co-op vs the zombies with a way out: survive until the helicopter comes, then the whole squad has to hold the landing zone until it can take off.' },
  // only while the admin is hosting an event (admin panel → Events); not in the normal list of modes
  event: { id: 'event', name: 'Event', short: 'EVENT', teams: true, event: true, hidden: true, scoreLimit: 400, desc: 'Red vs Blue vs the zombies, seen from behind your character. Points for every zombie and every enemy you take down, and kills can drop puzzle pieces of new characters.' },
  infect: { id: 'infect', name: 'Infection', short: 'INF', teams: true, infection: true, autoTeams: true, desc: "After 10 seconds someone turns into a zombie. Anyone a zombie kills joins them. Survivors win if anyone is still standing when time runs out." },
};

// Gun Game: the guns you go through, one per kill. The last one is always the knife.
export const GUN_LADDERS = {
  short: ['rifle', 'shotgun', 'revolver', 'sniper', 'knife'],
  normal: ['rifle', 'smg', 'shotgun', 'revolver', 'lmg', 'dmr', 'sniper', 'launcher', 'knife'],
};
// Infection: survivors are blue, the infected are red (shown as zombies)
export const SURVIVORS = 'blue';
export const INFECTED = 'red';
export const INFECT_DELAY = 10; // seconds before the first zombie is picked

// ---- custom match settings: the host picks these in the room lobby, per mode
const opt = (vals, fmt = String) => vals.map((v) => [v, fmt(v)]);
const mins = (v) => `${v} min`;
const TIME = (def = 8, vals = [3, 5, 8, 10, 15]) => ({ key: 'time', label: '⏱️ Time limit', options: opt(vals, mins), def });
const HP = { key: 'hp', label: '❤️ Player health', options: opt([50, 100, 150, 200], (v) => `${v} HP`), def: 100 };
const RESPAWN = { key: 'respawn', label: '🔁 Respawn time', options: opt([2, 4, 8], (v) => `${v} s`), def: 4 };
const DROPS = { key: 'drops', label: '📦 Supply drops', options: [['off', 'Off'], ['normal', 'Normal'], ['often', 'Often']], def: 'normal' };
const PICKUPS = { key: 'pickups', label: '🔫 Guns on the map', options: [['on', 'On'], ['off', 'Off']], def: 'on' };
const LIMIT = (label, vals, def) => ({ key: 'limit', label, options: opt(vals), def });
export const MODE_SETTINGS = {
  coop: [
    { key: 'wave', label: '🌊 Starting wave', options: opt([1, 5, 10, 15, 20], (v) => `Wave ${v}`), def: 1 },
    { key: 'zhp', label: '🧟 Zombie health', options: opt([50, 75, 100, 150, 200], (v) => `${v}%`), def: 100 },
    { key: 'start', label: '▶ Next wave starts', options: [['ready', 'When everyone is ready'], ['auto', 'By itself (timer)']], def: 'ready' },
    DROPS,
  ],
  defend: [],
  ffa: [LIMIT('🎯 Kills to win', [10, 20, 30, 50], 20), TIME(), HP, RESPAWN, DROPS, PICKUPS],
  tdm: [LIMIT('🎯 Team kills to win', [20, 30, 50, 75], 30), TIME(), HP, RESPAWN, DROPS, PICKUPS],
  koth: [LIMIT('🏁 Points to win', [100, 150, 250, 400], 150), TIME(), HP, RESPAWN, DROPS, PICKUPS],
  ctf: [LIMIT('🚩 Captures to win', [1, 3, 5, 7], 3), TIME(), HP, RESPAWN, DROPS, PICKUPS],
  gungame: [
    { key: 'ladder', label: '🔫 Guns to get through', options: [['short', 'Short (5 guns)'], ['normal', 'Full (9 guns)']], def: 'normal' },
    { key: 'demote', label: '🔪 Knife kills send them back', options: [['on', 'On'], ['off', 'Off']], def: 'on' },
    TIME(10, [5, 8, 10, 15]), HP, RESPAWN, DROPS,
  ],
  oitc: [LIMIT('🎯 Kills to win', [5, 10, 15, 20], 10), TIME(8, [3, 5, 8, 10]), RESPAWN],
  jugg: [LIMIT('🏆 Points to win', [10, 20, 30], 20), TIME(10, [5, 8, 10, 15]), HP, RESPAWN, DROPS],
  extract: [],
  infect: [
    TIME(4, [2, 3, 4, 5, 8]),
    { key: 'starters', label: '🧟 First zombies', options: opt([1, 2, 3]), def: 1 },
    { key: 'zhp', label: '🧟 Zombie player health', options: opt([100, 150, 200, 300], (v) => `${v} HP`), def: 150 },
    HP, DROPS,
  ],
};
MODE_SETTINGS.event = [LIMIT('🏆 Points to win', [200, 400, 600, 1000], 400), TIME(10, [5, 8, 10, 15]), HP, RESPAWN, DROPS, PICKUPS];
MODE_SETTINGS.defend = MODE_SETTINGS.coop;
MODE_SETTINGS.extract = [{ key: 'evac', label: '🚁 Helicopter comes after wave', options: opt([3, 5, 8, 10, 15], (v) => `Wave ${v}`), def: 5 }, ...MODE_SETTINGS.coop];
export const EVAC_HOLD = 30; // seconds the squad must hold the landing zone
export const JUGG_HP = 3; // the Juggernaut's health is this many times normal
// every setting for a mode, with anything missing or not allowed set to its default
export function cleanSettings(mode, raw) {
  const out = {};
  for (const s of MODE_SETTINGS[mode] || []) {
    const v = raw?.[s.key];
    out[s.key] = s.options.some(([o]) => o === v) ? v : s.def;
  }
  return out;
}
// the kill / score limit a match is played to
export const limitFor = (mode, settings) => settings?.limit ?? MODES[mode]?.killLimit ?? MODES[mode]?.scoreLimit;

// ---- supply drops: crates that parachute in with health and a good gun
export const SUPPLY_GUNS = ['smg', 'shotgun', 'revolver', 'lmg', 'dmr', 'dmr', 'lmg', 'sniper', 'launcher'];
export const SUPPLY_FALL = 7; // seconds from the sky to the ground
export const SUPPLY_EVERY = { normal: 60, often: 30 }; // seconds between drops
export const SUPPLY_FIRST = 35; // the first one comes this long into a match
export const SUPPLY_LAST = 90; // a crate nobody opens goes away after this long on the ground
export const SUPPLY_MAX = 3; // crates on the map at once
export const SUPPLY_REACH = 3.2;

export const MATCH_SECONDS = 8 * 60;
export const RESPAWN_SECONDS = 4;
export const MAX_PLAYERS = 8;
export const MAX_HP = 100;

export const TEAM_SPAWNS = {
  red: [[-72, -4], [-68, 4], [-76, 8], [-66, -9], [-80, 0], [-71, 12]],
  blue: [[70, -6], [66, -12], [74, -14], [62, -2], [77, -4], [68, -18]],
};
export const FFA_SPAWNS = [
  [-72, -4], [70, -6], [0, -40], [0, 60], [-40, 20], [40, 20], [-30, -70], [30, -75], [-90, 50], [90, 45], [10, 90], [-10, 5],
];

export const POINT = { x: 0, z: 0, radius: 9 };
export const FLAG_BASES = { red: [-74, 0], blue: [72, -2] };

// Defend the Points: three points the squad holds against the zombies (in the cleared spots every map keeps).
export const DEFEND_POINTS = [
  { id: 'A', x: FLAG_BASES.red[0], z: FLAG_BASES.red[1], radius: 6 },
  { id: 'B', x: POINT.x, z: POINT.z, radius: 6 },
  { id: 'C', x: FLAG_BASES.blue[0], z: FLAG_BASES.blue[1], radius: 6 },
];

export function makeRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

// Solo play always uses this map; the others are for multiplayer.
export const SOLO_MAP = 'plains';
export const MP_MAPS = ['frost', 'forest', 'docks', 'ember'];

// Maps. Every map keeps the spawns, flags and capture point above clear, so all modes work everywhere.
export const MAPS = {
  plains: { name: 'Dead Plains', weathers: ['clear', 'clear', 'overcast', 'dust', 'rain', 'storm'] },
  frost: { name: 'Frostbite Outpost', weathers: ['frostclear', 'snow', 'snow', 'blizzard', 'frostfog'] },
  forest: { name: 'Blackwood Hollow', weathers: ['dusk', 'dusk', 'mist', 'rain', 'storm'] },
  docks: { name: 'Rustwater Docks', weathers: ['harbour', 'harbour', 'seafog', 'rain', 'storm'] },
  ember: { name: 'Ember Canyon', weathers: ['emberdusk', 'emberdusk', 'ashfall', 'smoke'] },
};

// Quick chat wheel (Z): 8 short phrases you can rewrite (Customise). Shown above your head and in chat.
export const QUICK_MAX = 8;
export const QUICK_LEN = 32;
export const DEFAULT_QUICK = ['Hi!', 'Nice!', 'Help!', 'Over here!', 'Reloading!', 'Zombies!', 'Thanks!', 'GG'];
export const cleanQuickText = (t) =>
  String(t ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUICK_LEN);
// always QUICK_MAX entries ('' = use the default for that slot)
export const cleanQuick = (list) => Array.from({ length: QUICK_MAX }, (_, i) => cleanQuickText(Array.isArray(list) ? list[i] : ''));
// what's on the wheel: your phrase, or the default one for that slot
export const quickWheel = (items) => cleanQuick(items?.quick).map((t, i) => t || DEFAULT_QUICK[i]);

// Emotes used to be sold in the shop; anyone who bought one gets the coins back.
export const OLD_EMOTE_PRICES = { emote_8: 150, emote_9: 150, emote_10: 150, emote_11: 200, emote_12: 200, emote_13: 200, emote_14: 250, emote_15: 250, emote_16: 250, emote_17: 300, emote_18: 300, emote_19: 400 };
// Takes the old emote purchases out of an items object; returns the coins to give back.
export function refundOldEmotes(items) {
  let coins = 0;
  for (const k of Object.keys(items || {})) {
    if (k in OLD_EMOTE_PRICES) coins += items[k] ? OLD_EMOTE_PRICES[k] : 0;
    if (k in OLD_EMOTE_PRICES || k === 'emotes') delete items[k];
  }
  return coins;
}
