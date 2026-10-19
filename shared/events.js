// Events: limited-time online events the admin hosts (admin panel → Events). Shared by the game and the server.
// In an event match you start as the Survivor and collect puzzle pieces of the other characters;
// all four pieces of a character unlocks it (items[`piece_<char>_<n>`] = 1).

// The characters you can collect, rarest last. weight: how often its pieces drop.
export const PIECE_SETS = [
  { char: 'swat', name: 'SWAT', rarity: 'Rare', color: '#3d8bff', weight: 60, pieces: ['Helmet & Visor', 'Tactical Vest', 'Combat Trousers', 'Gloves & Boots'] },
  { char: 'adventurer', name: 'Adventurer', rarity: 'Epic', color: '#b04dff', weight: 30, pieces: ['Hair & Beard', 'Field Shirt', 'Cargo Trousers', 'Backpack'] },
  { char: 'king', name: 'King', rarity: 'Legendary', color: '#ffb020', weight: 10, pieces: ['Crown', 'Royal Tunic', 'Armoured Legs', 'Pauldrons'] },
];
export const pieceId = (char, n) => `piece_${char}_${n}`;
export const piecesOf = (items, char) => [0, 1, 2, 3].filter((n) => items?.[pieceId(char, n)]);
// The Survivor is everyone's; the others once all four pieces are found (admins have them all).
export function charUnlocked(items, char, admin = false) {
  if (char === 'man' || admin) return true;
  return piecesOf(items, char).length === 4;
}
export const anyPieces = (items) => PIECE_SETS.some((s) => piecesOf(items, s.char).length > 0);
export const totalPieces = (items) => PIECE_SETS.reduce((n, s) => n + piecesOf(items, s.char).length, 0);
export const PIECE_COUNT = PIECE_SETS.length * 4;
// Coins instead, once every piece is found.
export const DUPLICATE_COINS = 100;

// Picks the next piece for someone: a character with pieces still missing (rarer ones less often), then one of
// its missing pieces. null when they have everything.
export function rollPiece(items, rand = Math.random) {
  const open = PIECE_SETS.filter((s) => piecesOf(items, s.char).length < 4);
  if (!open.length) return null;
  let r = rand() * open.reduce((n, s) => n + s.weight, 0);
  let set = open[open.length - 1];
  for (const s of open) {
    if ((r -= s.weight) < 0) {
      set = s;
      break;
    }
  }
  const missing = [0, 1, 2, 3].filter((n) => !items?.[pieceId(set.char, n)]);
  return { char: set.char, n: missing[Math.floor(rand() * missing.length)] };
}

// How likely a kill drops a piece (before the admin's drop boost).
export const DROP_CHANCE = { zombie: 0.06, special: 0.15, boss: 1, player: 0.2 };
export const DROP_BOOSTS = [[1, 'Normal'], [2, 'Double'], [3, 'Triple']];
// The server's limits: one piece every PIECE_COOLDOWN ms, at most PIECE_MAX a player per event.
export const PIECE_COOLDOWN = 15000;
export const PIECE_MAX = 40;

// The event match: Red vs Blue vs the zombies. Points for kills; first team to the limit (or ahead at the end) wins.
export const EVENT_POINTS = { player: 5, zombie: 1, special: 2, boss: 15 };
export const EVENT_DURATIONS = [[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [1440, '1 day'], [0, 'Until I end it']];
export const DEFAULT_EVENT_NAME = 'Outfit Hunt';
// The events the admin can pick from (admin panel → Events): just Outfit Hunt for now. Each has its own name and
// usual length and drop rate (the admin can change those). [minutes 0 = until the admin ends it]
export const EVENT_PRESETS = [
  { name: 'Outfit Hunt', minutes: 60, boost: 1, desc: 'Red vs Blue vs the zombies: collect puzzle pieces to unlock SWAT, Adventurer and King.' },
];
// Event rooms hold this many; when one fills up, the next player opens a new one (same event, same drops).
export const EVENT_MAX_PLAYERS = 20;
