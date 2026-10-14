// Coins and the shop. Shared by the game client and the server so prices always match.
import { AVATARS, CROSSHAIRS, FINISHES, NAME_COLORS, TITLES } from './cosmetics.js';

// Coins earned for a finished game (the server recomputes this from the reported run).
export function coinsForRun({ mode, wave = 0, kills = 0, headshots = 0, won = false }) {
  if (mode === 'pvp') return Math.min(1000, kills * 10 + (won ? 50 : 0));
  return Math.min(20000, kills + Math.floor(headshots / 2) + wave * 5);
}

// Permanent solo upgrades, starting guns and consumables.
export const SHOP = [
  { id: 'toughness', kind: 'upgrade', name: 'Toughness', icon: '❤️', desc: '+10 max health per level', max: 5, base: 150 },
  { id: 'firepower', kind: 'upgrade', name: 'Firepower', icon: '💥', desc: '+5% damage per level', max: 5, base: 200 },
  { id: 'quickhands', kind: 'upgrade', name: 'Quick Hands', icon: '🔄', desc: '+10% reload speed per level', max: 5, base: 150 },
  { id: 'grenadier', kind: 'upgrade', name: 'Grenadier', icon: '💣', desc: 'Carry 1 more grenade and start with 1 more, per level', max: 3, base: 250 },
  { id: 'scavenger', kind: 'upgrade', name: 'Scavenger', icon: '🎒', desc: 'More guns and medkits on the map', max: 3, base: 250 },
  { id: 'gun_smg', kind: 'gun', gun: 'smg', name: 'Viper SMG', icon: '⚡', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 300 },
  { id: 'gun_shotgun', kind: 'gun', gun: 'shotgun', name: 'Boomstick', icon: '💥', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 300 },
  { id: 'gun_revolver', kind: 'gun', gun: 'revolver', name: 'Hand Cannon', icon: '🤠', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 600 },
  { id: 'gun_lmg', kind: 'gun', gun: 'lmg', name: 'Mule LMG', icon: '🐂', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 700 },
  { id: 'gun_dmr', kind: 'gun', gun: 'dmr', name: 'Marksman DMR', icon: '🔭', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 700 },
  { id: 'gun_sniper', kind: 'gun', gun: 'sniper', name: 'Longshot', icon: '🎯', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 1200 },
  { id: 'gun_launcher', kind: 'gun', gun: 'launcher', name: 'Thumper', icon: '🧨', desc: 'Equip it to spawn with it in every mode, with unlimited ammo', price: 1200 },
  { id: 'revive', kind: 'consumable', name: 'Revive Token', icon: '👼', desc: 'Your next solo run starts with Second Wind', max: 5, price: 400 },
];

// Any locked cosmetic can also be bought instead of levelling up for it.
const COSMETIC_LISTS = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES };
export const cosmeticItemId = (kind, id) => `cos_${kind}_${id}`;
export function cosmeticPrice(kind, id) {
  const row = COSMETIC_LISTS[kind]?.find((r) => r[0] === id);
  return row && row[1] > 1 ? row[1] * 120 : null;
}

// Price of the next purchase of an item, or null if it can't be bought (maxed, unknown).
export function priceOf(itemId, items = {}) {
  const have = items[itemId] || 0;
  const cos = /^cos_(avatar|color|title|crosshair|finish)_(.+)$/.exec(itemId);
  if (cos) return have ? null : cosmeticPrice(cos[1], cos[2]);
  const def = SHOP.find((s) => s.id === itemId);
  if (!def) return null;
  if (def.kind === 'gun') return have ? null : def.price;
  if (have >= def.max) return null;
  if (def.kind === 'upgrade') return def.base * (have + 1);
  return def.price;
}
