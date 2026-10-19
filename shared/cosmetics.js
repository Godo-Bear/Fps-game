// Account levels and the cosmetics they unlock. Shared by the game client and the server.

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 250)) + 1;
}
export function xpForLevel(level) {
  return 250 * (level - 1) * (level - 1);
}

// Each list entry: [id, unlock level, label?]
export const AVATARS = [
  ['🧟', 1], ['💀', 1], ['🤠', 1], ['🪖', 1], ['🦊', 2], ['🐺', 3], ['👽', 4], ['🔥', 5],
  ['⚡', 6], ['🎯', 7], ['🦅', 8], ['🐉', 10], ['👑', 12], ['☢️', 15],
];
export const NAME_COLORS = [
  ['#e9d9b8', 1, 'Sand'], ['#ffffff', 1, 'White'], ['#7ec8ff', 1, 'Sky'], ['#8ee07a', 2, 'Moss'],
  ['#ff9b5e', 3, 'Rust'], ['#ff5d73', 5, 'Blood'], ['#c08bff', 7, 'Toxic Violet'], ['#ffd34d', 10, 'Gold'],
];
export const TITLES = [
  ['Survivor', 1], ['Scavenger', 2], ['Drifter', 3], ['Headhunter', 4], ['Wastelander', 6],
  ['Zombie Slayer', 8], ['Plains Walker', 10], ['Legend of the Plains', 12], ['Undying', 15], ['Apex', 20],
];
export const CROSSHAIRS = [
  ['#ffffff', 1, 'White'], ['#7dff7a', 1, 'Green'], ['#5ff2ff', 1, 'Cyan'], ['#ffe14d', 1, 'Yellow'],
  ['#ff5df2', 2, 'Pink'], ['#ff4040', 3, 'Red'],
];
// Gun finishes tint every gun's metal parts.
export const FINISHES = [
  ['standard', 1, 'Standard', '#45484d'], ['desert', 3, 'Desert', '#a88d5f'], ['woodland', 5, 'Woodland', '#4f6340'],
  ['arctic', 7, 'Arctic', '#d7dde2'], ['crimson', 9, 'Crimson', '#8e2a24'], ['gold', 12, 'Gold', '#d4a72c'],
  ['toxic', 15, 'Toxic', '#5fd13a'],
];

// Pets: bought with real money (paid to the owner, who switches it on from the admin panel: items.pet_wolf).
// petColor is any colour; these are the quick picks.
export const PET_COLORS = [
  ['#8a8f96', 'Grey'], ['#3a3a3e', 'Black'], ['#eeeeea', 'Snow'], ['#a8743f', 'Brown'], ['#d9b26a', 'Golden'],
  ['#c4562e', 'Red fox'], ['#6f8fb8', 'Frost blue'], ['#7a4fc4', 'Shadow purple'], ['#4fbf5a', 'Toxic green'],
];
export const PET_ITEM = 'pet_wolf';
// only when it's been given (admins too: give yourself one from the admin panel), so taking it away works
export const ownsWolf = (level, items = {}) => !!items[PET_ITEM];

// Pet levels: the wolf earns XP from the zombies it kills (1 each), or the owner adds levels someone paid for.
// items.pet_lvl / items.pet_xp (XP towards the next level).
export const PET_MAX_LEVEL = 20;
export const petXpNeeded = (level) => 15 * level; // XP from this level to the next
export const petLevel = (items = {}) => Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(Number(items.pet_lvl) || 1)));
// Adds XP (levelling up as it fills). Changes items in place.
export function addPetXp(items, xp) {
  let lvl = petLevel(items);
  let have = Math.max(0, Math.floor(Number(items.pet_xp) || 0)) + Math.max(0, Math.floor(xp));
  while (lvl < PET_MAX_LEVEL && have >= petXpNeeded(lvl)) have -= petXpNeeded(lvl++);
  items.pet_lvl = lvl;
  items.pet_xp = lvl >= PET_MAX_LEVEL ? 0 : have;
  return items;
}
// Every level: +8% bite damage. Masteries unlock at these levels.
export const PET_MASTERIES = [
  { lvl: 1, id: 'bite', icon: '🦷', name: 'Bite', desc: 'Bites the zombies closest to you' },
  { lvl: 3, id: 'swift', icon: '💨', name: 'Swift Paws', desc: 'Runs faster and hunts further from you' },
  { lvl: 5, id: 'bleed', icon: '🩸', name: 'Bleeding Bite', desc: 'Bitten zombies keep bleeding' },
  { lvl: 8, id: 'howl', icon: '🌕', name: 'Howl', desc: 'Every 20 s it howls and slows the zombies around you' },
  { lvl: 10, id: 'alpha', icon: '👁️', name: 'Alpha', desc: 'Glowing eyes and a bigger wolf, for everyone to see' },
  { lvl: 12, id: 'frenzy', icon: '⚡', name: 'Frenzy', desc: 'Bites twice as fast' },
  { lvl: 15, id: 'guardian', icon: '🛡️', name: 'Guardian', desc: 'Goes straight for any zombie that hits you, with a double-damage pounce' },
  { lvl: 20, id: 'dire', icon: '👑', name: 'Dire Wolf', desc: 'A huge wolf with a golden glow that bites twice as hard' },
];
export const petHas = (level, id) => PET_MASTERIES.some((m) => m.id === id && level >= m.lvl);
// where it walks: [id, label]
export const PET_SPOTS = [['right', 'On my right'], ['left', 'On my left'], ['front', 'In front'], ['behind', 'Behind']];

export const DEFAULT_PROFILE = { avatar: '🧟', color: '#e9d9b8', title: 'Survivor', crosshair: '#ffffff', finish: 'standard', pet: 'none', petColor: '#8a8f96', petSpot: 'right' };

const LISTS = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES };

// Unlocked by level, or bought in the shop (items[`cos_kind_id`]).
export function unlocked(kind, id, level, items = {}) {
  const row = LISTS[kind]?.find((r) => r[0] === id);
  return !!row && (row[1] <= level || !!items[`cos_${kind}_${id}`]);
}

// Keeps only valid, unlocked choices.
export function cleanProfile(input, level, items = {}) {
  const out = { ...DEFAULT_PROFILE };
  if (input && typeof input === 'object') {
    for (const kind of Object.keys(LISTS)) {
      if (typeof input[kind] === 'string' && unlocked(kind, input[kind], level, items)) out[kind] = input[kind];
    }
    if (input.pet === 'wolf' && ownsWolf(level, items)) out.pet = 'wolf';
    if (typeof input.petColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.petColor)) out.petColor = input.petColor.toLowerCase();
    if (PET_SPOTS.some(([id]) => id === input.petSpot)) out.petSpot = input.petSpot;
  }
  return out;
}

// XP earned for a finished game.
export function xpForRun({ wave = 0, score = 0, kills = 0 }) {
  return Math.round(Math.min(score, 200000) * 0.5 + wave * 60 + kills * 5);
}
