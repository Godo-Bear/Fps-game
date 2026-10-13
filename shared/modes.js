// Multiplayer game modes and their map layout. Shared by the client and the room server.

export const MODES = {
  coop: { id: 'coop', name: 'Co-op Survival', short: 'CO-OP', teams: false, coop: true, desc: "Everyone on one team against the zombie waves. If the whole squad goes down, it's over." },
  defend: { id: 'defend', name: 'Defend the Points', short: 'DEF', teams: false, coop: true, desc: 'Your squad holds points A, B and C while zombie waves try to take them. Stand on a point to defend it; lose all three and it\'s over.' },
  ffa: { id: 'ffa', name: 'Free-for-all', short: 'FFA', teams: false, desc: 'Everyone for themselves. First to 20 kills wins.', killLimit: 20 },
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teams: true, desc: 'Red vs Blue. First team to 30 kills wins.', killLimit: 30 },
  koth: { id: 'koth', name: 'Capture Point', short: 'CP', teams: true, desc: 'Hold the point in the middle of the map. First to 150 points wins.', scoreLimit: 150 },
  ctf: { id: 'ctf', name: 'Capture the Flag', short: 'CTF', teams: true, desc: "Steal the enemy flag and bring it to yours. First to 3 captures wins.", scoreLimit: 3 },
};

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
