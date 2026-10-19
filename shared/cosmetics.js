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

// Your character: free to change. Colours are any hex; the rest pick from these lists. [id, label]
export const LOOK_SKIN = ['#f3d6c2', '#e8c4a8', '#d8a882', '#c89a78', '#a8754f', '#8d5a3b', '#6a4128', '#4a2c1a'];
export const LOOK_HAIR_COLORS = ['#141210', '#3a2616', '#6a4224', '#a0603a', '#d8b46a', '#e8e0d0', '#8a8a8a', '#b02a2a', '#2a6ad0', '#3ab04a'];
export const LOOK_CLOTH = ['#3d4234', '#55603e', '#6a5a3a', '#2a3450', '#1c2a4a', '#3a4a7a', '#222222', '#555555', '#e8e8e8', '#8a2a24', '#c86a20', '#e8c020', '#3a9a8a', '#6a3a8a'];
export const LOOK_HAIR = [['short', 'Short'], ['buzz', 'Buzz cut'], ['mohawk', 'Mohawk'], ['long', 'Long'], ['spiky', 'Spiky'], ['bald', 'Bald']];
export const LOOK_FACE = [['none', 'Clean'], ['stubble', 'Stubble'], ['beard', 'Beard'], ['moustache', 'Moustache']];
export const LOOK_HAT = [['helmet', 'Helmet'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['bandana', 'Bandana'], ['beret', 'Beret'], ['none', 'Nothing']];
export const LOOK_TOP = [['jacket', 'Jacket'], ['tshirt', 'T-shirt'], ['tank', 'Tank top'], ['hoodie', 'Hoodie']];
export const DEFAULT_LOOK = { skin: '#c89a78', hair: 'short', hairColor: '#3a2616', face: 'none', hat: 'helmet', hatColor: '#4a5236', top: 'jacket', topColor: '#3d4234', pants: '#3d4234' };
const HEX = /^#[0-9a-f]{6}$/i;
// a random look (AI bots)
export function randomLook() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return cleanLook({ skin: r(LOOK_SKIN), hair: r(LOOK_HAIR)[0], hairColor: r(LOOK_HAIR_COLORS.slice(0, 7)), face: r(LOOK_FACE)[0], hat: r(LOOK_HAT)[0], hatColor: r(LOOK_CLOTH), top: r(LOOK_TOP)[0], topColor: r(LOOK_CLOTH), pants: r(LOOK_CLOTH) });
}
export function cleanLook(input) {
  const out = { ...DEFAULT_LOOK };
  if (!input || typeof input !== 'object') return out;
  for (const k of ['skin', 'hairColor', 'hatColor', 'topColor', 'pants']) if (typeof input[k] === 'string' && HEX.test(input[k])) out[k] = input[k].toLowerCase();
  const pick = (k, list) => {
    if (list.some(([id]) => id === input[k])) out[k] = input[k];
  };
  pick('hair', LOOK_HAIR);
  pick('face', LOOK_FACE);
  pick('hat', LOOK_HAT);
  pick('top', LOOK_TOP);
  return out;
}

export const DEFAULT_PROFILE = { avatar: '🧟', color: '#e9d9b8', title: 'Survivor', crosshair: '#ffffff', finish: 'standard', pet: 'none', petColor: '#8a8f96', petSpot: 'right', look: DEFAULT_LOOK };

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
    out.look = cleanLook(input.look);
  }
  return out;
}

// XP earned for a finished game.
export function xpForRun({ wave = 0, score = 0, kills = 0 }) {
  return Math.round(Math.min(score, 200000) * 0.5 + wave * 60 + kills * 5);
}
