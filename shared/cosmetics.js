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

// More to unlock (or buy with coins), slotted in by level: [id, level, label?, colour?]
const MORE = {
  avatar: [['🦈', 4], ['🐍', 6], ['🦂', 9], ['🧙', 11], ['🏴‍☠️', 14], ['🦖', 18]],
  color: [['#4dd0e1', 4, 'Ice'], ['#ff8fab', 6, 'Rose'], ['#a3e635', 8, 'Lime'], ['#f97316', 11, 'Ember'], ['#e5e7eb', 14, 'Platinum']],
  title: [['Sharpshooter', 5], ['Survivalist', 7], ['Horde Breaker', 9], ['Last Stand', 11], ['Night Owl', 13], ['Warlord', 18]],
  crosshair: [['#ff9f1a', 4, 'Orange'], ['#a78bfa', 5, 'Lavender'], ['#00ffa3', 7, 'Mint']],
  finish: [['urban', 4, 'Urban', '#6b7280'], ['navy', 6, 'Navy', '#1e3a5f'], ['rosegold', 8, 'Rose Gold', '#b76e79'], ['carbon', 10, 'Carbon', '#1f1f1f'], ['cobalt', 13, 'Cobalt', '#2a52be']],
};
for (const [kind, rows] of Object.entries(MORE)) {
  const list = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES }[kind];
  list.push(...rows);
  list.sort((a, b) => a[1] - b[1]);
}

// 50c Deals: cosmetics nobody can unlock, only buy: for real money (DEAL_PRICE, paid to the owner, who gives them
// out from the admin panel) or for lots of coins (DEAL_COINS). [kind, id, label, colour (name colour, crosshair, finish), glow (a gun skin that glows)]
export const DEAL_PRICE = '50c';
export const DEAL_COINS = 2500; // or this many coins
export const DEALS = [
  ['avatar', '💎', 'Diamond'], ['avatar', '🦄', 'Unicorn'], ['avatar', '🚀', 'Rocket'], ['avatar', '🤖', 'Robot'], ['avatar', '🥷', 'Ninja'],
  ['color', '#00e5ff', 'Neon Cyan'], ['color', '#ff2bd6', 'Neon Pink'], ['color', '#c0c0c0', 'Silver'],
  ['title', 'Supporter', 'Supporter'], ['title', 'VIP', 'VIP'], ['title', 'Big Spender', 'Big Spender'], ['title', 'Legend', 'Legend'],
  ['crosshair', '#00e5ff', 'Neon'], ['crosshair', '#ffd700', 'Gold'],
  ['finish', 'diamond', 'Diamond', '#bfe9ff', '#7fd8ff'], ['finish', 'neon', 'Neon', '#14142a', '#ff2bd6'], ['finish', 'galaxy', 'Galaxy', '#1a1040', '#8a6bff'], ['finish', 'royalgold', 'Royal Gold', '#d4a72c', '#ffd34d'],
];
export const isDeal = (kind, id) => DEALS.some(([k, i]) => k === kind && i === id);

// Halloween cosmetics: only with candy (collected during the Halloween event), never by level or coins.
// Yours for good once bought (or an admin gives them). [kind, id, label, candy, extra (a finish's colour), glow (a gun
// skin that glows: its colour)]
export const EVENT_LEVEL = 9999; // their unlock level: out of reach
export const CANDY_SHOP = [
  ['finish', 'pumpkin', 'Pumpkin', 150, '#e8761a'], ['finish', 'bone', 'Bone', 200, '#e4dcc4'], ['finish', 'spectral', 'Spectral', 300, '#7a3cff'],
  ['finish', 'jackfire', 'Jack-o\'-Fire', 400, '#3a1c08', '#ff7a1a'], ['finish', 'ecto', 'Ectoplasm', 450, '#1c2a18', '#6dff3a'],
  ['finish', 'bloodmoon', 'Blood Moon', 550, '#3a0a0e', '#ff2a3a'], ['finish', 'phantom', 'Phantom', 700, '#1a1030', '#b06bff'],
  ['avatar', '🎃', 'Jack-o\'-lantern', 40], ['avatar', '👻', 'Ghost', 40], ['avatar', '🦇', 'Bat', 60], ['avatar', '🕷️', 'Spider', 60], ['avatar', '🧛', 'Vampire', 90],
  ['title', 'Ghoul', 'Ghoul', 80], ['title', 'Candy Hoarder', 'Candy Hoarder', 120], ['title', 'Night Stalker', 'Night Stalker', 150], ['title', 'Pumpkin King', 'Pumpkin King', 250],
  ['color', '#ff7a1a', 'Pumpkin', 60], ['color', '#9b5cff', 'Haunted', 60], ['color', '#7dff3a', 'Slime', 60],
  ['crosshair', '#ff7a1a', 'Jack-o\'-lantern', 30], ['crosshair', '#b06bff', 'Witchy', 30],
];
export const candyPrice = (itemId) => CANDY_SHOP.find(([kind, id]) => `cos_${kind}_${id}` === itemId)?.[3] ?? null;
// how much candy a kill drops: [chance, how many]
export const CANDY_DROPS = { zombie: [0.3, 1], special: [0.6, 2], boss: [1, 15] };
// the server's limits: about one candy a second at most, and this many in one event
export const CANDY_RATE = 1.2;
export const CANDY_EVENT_MAX = 3000;
// they (and the 50c deals) join the normal lists (out of reach by level) so equipping and showing them works like any other
for (const [kind, id, label, extra, glow] of DEALS) {
  const list = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES }[kind];
  list.push(kind === 'avatar' || kind === 'title' ? [id, EVENT_LEVEL] : kind === 'finish' ? [id, EVENT_LEVEL, label, extra, glow] : [id, EVENT_LEVEL, label]);
}
for (const [kind, id, label, , extra, glow] of CANDY_SHOP) {
  const list = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES }[kind];
  list.push(kind === 'avatar' || kind === 'title' ? [id, EVENT_LEVEL] : kind === 'finish' ? [id, EVENT_LEVEL, label, extra, glow] : [id, EVENT_LEVEL, label]);
}

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

// The character creator is saved for a big update: until CHARACTERS_LIVE is true, only admins see it
// (as a preview) and everyone looks the default. Flip it to launch.
export const CHARACTERS_LIVE = false;

import { charUnlocked } from './events.js';

// Your character: free to change. Colours are any hex; the rest pick from these lists. [id, label]
export const LOOK_SKIN = ['#f3d6c2', '#e8c4a8', '#d8a882', '#c89a78', '#a8754f', '#8d5a3b', '#6a4128', '#4a2c1a'];
export const LOOK_HAIR_COLORS = ['#141210', '#3a2616', '#6a4224', '#a0603a', '#d8b46a', '#e8e0d0', '#8a8a8a', '#b02a2a', '#2a6ad0', '#3ab04a'];
export const LOOK_CLOTH = ['#3d4234', '#55603e', '#6a5a3a', '#2a3450', '#1c2a4a', '#3a4a7a', '#222222', '#555555', '#e8e8e8', '#8a2a24', '#c86a20', '#e8c020', '#3a9a8a', '#6a3a8a'];
export const LOOK_HAIR = [['short', 'Short'], ['buzz', 'Buzz cut'], ['mohawk', 'Mohawk'], ['long', 'Long'], ['spiky', 'Spiky'], ['bald', 'Bald']];
export const LOOK_FACE = [['none', 'Clean'], ['stubble', 'Stubble'], ['beard', 'Beard'], ['moustache', 'Moustache']];
export const LOOK_HAT = [['helmet', 'Helmet'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['bandana', 'Bandana'], ['beret', 'Beret'], ['none', 'Nothing']];
export const LOOK_TOP = [['jacket', 'Jacket'], ['tshirt', 'T-shirt'], ['tank', 'Tank top'], ['hoodie', 'Hoodie']];
// Characters: one of the owner's 3D characters (public/models), recoloured. (The blocky soldier is only a
// stand-in while a character loads, and the look everyone has until the creator launches.)
// For the 3D ones, hatColor is the colour of their gear (backpack, armour, SWAT kit) and hat 'none' takes it off.
export const LOOK_MODELS = [['man', 'Survivor'], ['swat', 'SWAT'], ['adventurer', 'Adventurer'], ['king', 'King']];
// each 3D character's own colours (what picking it starts from)
export const MODEL_COLORS = {
  man: { skin: '#a98a66', hairColor: '#3a2f2f', topColor: '#657378', pants: '#3e3a3a', hatColor: '#ab9f9f' },
  adventurer: { skin: '#ba9c79', hairColor: '#412914', topColor: '#3e3921', pants: '#52462c', hatColor: '#6a5a39' },
  swat: { skin: '#ba9c79', hairColor: '#2b2926', topColor: '#474a51', pants: '#474a51', hatColor: '#2b2926' },
  king: { skin: '#ba9c79', hairColor: '#afafaf', topColor: '#383f4f', pants: '#433730', hatColor: '#595a59' },
};
export const DEFAULT_LOOK = { skin: '#c89a78', hair: 'short', hairColor: '#3a2616', face: 'none', hat: 'helmet', hatColor: '#4a5236', top: 'jacket', topColor: '#3d4234', pants: '#3d4234', model: 'man', ...MODEL_COLORS.man };
const HEX = /^#[0-9a-f]{6}$/i;
// a random look (AI bots)
export function randomLook() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return cleanLook({ model: r(LOOK_MODELS)[0], skin: r(LOOK_SKIN), hairColor: r(LOOK_HAIR_COLORS.slice(0, 7)), hat: Math.random() < 0.8 ? 'helmet' : 'none', hatColor: r(LOOK_CLOTH), topColor: r(LOOK_CLOTH), pants: r(LOOK_CLOTH) });
}
// items/admin: only characters you've unlocked (the Survivor, or all four pieces from an event). Leave items out to skip the check.
export function cleanLook(input, items = null, admin = false) {
  const out = { ...DEFAULT_LOOK };
  if (!input || typeof input !== 'object') return out;
  // a look from before there were only 3D characters, or a character still locked: the Survivor
  if (!LOOK_MODELS.some(([id]) => id === input.model)) return out;
  if (items && !charUnlocked(items, input.model, admin)) return out;
  for (const k of ['skin', 'hairColor', 'hatColor', 'topColor', 'pants']) if (typeof input[k] === 'string' && HEX.test(input[k])) out[k] = input[k].toLowerCase();
  const pick = (k, list) => {
    if (list.some(([id]) => id === input[k])) out[k] = input[k];
  };
  pick('hair', LOOK_HAIR);
  pick('face', LOOK_FACE);
  pick('hat', LOOK_HAT);
  pick('top', LOOK_TOP);
  pick('model', LOOK_MODELS);
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
    // name colours and name tags bought from the admin's shop items
    if (Array.isArray(items.ccolors) && items.ccolors.includes(input.color)) out.color = input.color;
    if (Array.isArray(items.ctitles) && items.ctitles.includes(input.title)) out.title = input.title;
    if (input.pet === 'wolf' && ownsWolf(level, items)) out.pet = 'wolf';
    if (typeof input.petColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.petColor)) out.petColor = input.petColor.toLowerCase();
    if (PET_SPOTS.some(([id]) => id === input.petSpot)) out.petSpot = input.petSpot;
    out.look = cleanLook(input.look, items, level >= 999);
  }
  return out;
}

// XP earned for a finished game.
export function xpForRun({ wave = 0, score = 0, kills = 0 }) {
  return Math.round(Math.min(score, 200000) * 0.5 + wave * 60 + kills * 5);
}
