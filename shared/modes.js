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
export const MP_MAPS = ['frost', 'forest'];

// Maps. Every map keeps the spawns, flags and capture point above clear, so all modes work everywhere.
export const MAPS = {
  plains: { name: 'Dead Plains', weathers: ['clear', 'clear', 'overcast', 'dust', 'rain', 'storm'] },
  frost: { name: 'Frostbite Outpost', weathers: ['frostclear', 'snow', 'snow', 'blizzard', 'frostfog'] },
  forest: { name: 'Blackwood Hollow', weathers: ['dusk', 'dusk', 'mist', 'rain', 'storm'] },
};

// Quick callouts (Z): shown above your head and in the chat.
export const EMOTES = ['👋 Hi!', '👍 Nice!', '🆘 Help!', '📍 Over here!', '🔄 Reloading!', '😂 LOL', '🧟 Zombies!', '🤝 GG'];
// More emotes from the shop: [text, price in coins]
export const SHOP_EMOTES = [
  ['🔥 On fire!', 150], ['💀 Too easy', 150], ['🏃 RUN!', 150], ['🎯 Headshot!', 200], ['🫡 Salute', 200], ['💤 Boring...', 200],
  ['🧠 Big brain', 250], ['🤡 Clown', 250], ['🧟 Braaains...', 250], ['👑 Bow down', 300], ['🍗 Winner winner', 300], ['🚀 To the moon', 400],
];
export const ALL_EMOTES = [...EMOTES, ...SHOP_EMOTES.map((e) => e[0])];
export const emoteItemId = (i) => `emote_${i}`; // i: index in ALL_EMOTES
export const canUseEmote = (i, items, admin = false) =>
  Number.isInteger(i) && i >= 0 && (i < EMOTES.length || (i < ALL_EMOTES.length && (admin || !!items?.[emoteItemId(i)])));
// The 8 emotes in your Z menu (you can swap bought ones in).
export function emoteSlots(items, admin = false) {
  const s = items?.emotes;
  if (Array.isArray(s) && s.length === EMOTES.length && s.every((i) => canUseEmote(i, items, admin))) return [...s];
  return EMOTES.map((_, i) => i);
}
