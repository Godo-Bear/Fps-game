// Coins and the shop. Shared by the game client and the server so prices always match.
import { AVATARS, CROSSHAIRS, DEAL_COINS, EVENT_LEVEL, FINISHES, NAME_COLORS, TITLES, isDeal } from './cosmetics.js';

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
  // more for your next solo run (powerup: it starts with that perk at its best; grenades: a full grenade belt)
  { id: 'tok_damage', kind: 'consumable', name: 'Damage Boost', icon: '💥', desc: 'Your next solo run starts with legendary Hollow Points (+55% damage)', max: 5, price: 1500, powerup: 'damage' },
  { id: 'tok_armor', kind: 'consumable', name: 'Armour Plating', icon: '🛡️', desc: 'Your next solo run starts with legendary Scrap Armor (take 28% less damage)', max: 5, price: 1500, powerup: 'armor' },
  { id: 'tok_speed', kind: 'consumable', name: 'Sprint Boots', icon: '👟', desc: 'Your next solo run starts with legendary Fleet Foot (run faster)', max: 5, price: 1200, powerup: 'speed' },
  { id: 'tok_regen', kind: 'consumable', name: 'Med Patch', icon: '🌿', desc: 'Your next solo run starts with legendary Regeneration (heal over time)', max: 5, price: 1200, powerup: 'regen' },
  { id: 'tok_grenades', kind: 'consumable', name: 'Grenade Crate', icon: '💣', desc: 'Your next solo run starts with a full belt of grenades', max: 5, price: 1000, grenades: true },
  { id: 'tok_explosive', kind: 'consumable', name: 'Explosive Ammo', icon: '🧨', desc: 'Your next solo run starts with Explosive Rounds (bullets blow up zombies)', max: 5, price: 3000, powerup: 'explosive' },
];

// Any locked cosmetic can also be bought instead of levelling up for it.
const COSMETIC_LISTS = { avatar: AVATARS, color: NAME_COLORS, title: TITLES, crosshair: CROSSHAIRS, finish: FINISHES };
export const cosmeticItemId = (kind, id) => `cos_${kind}_${id}`;
// the items in the 50c Deals too (bought there for real money, or here for coins)
export const DEAL_ITEMS = SHOP.filter((d) => d.kind === 'consumable').map((d) => d.id);
export function cosmeticPrice(kind, id) {
  if (isDeal(kind, id)) return DEAL_COINS; // the 50c deals: real money, or lots of coins
  const row = COSMETIC_LISTS[kind]?.find((r) => r[0] === id);
  return row && row[1] > 1 && row[1] < EVENT_LEVEL ? row[1] * 120 : null; // Halloween ones: candy only
}

// A Shop item with the admin's changes (edits: { id: { name, icon, desc, price, hidden } }; price is the
// first level's price for upgrades).
export function shopDef(def, edits = {}) {
  const e = edits?.[def.id];
  if (!e) return def;
  const out = { ...def };
  for (const k of ['name', 'icon', 'desc']) if (e[k]) out[k] = e[k];
  if (e.price > 0) out[def.kind === 'upgrade' ? 'base' : 'price'] = e.price;
  out.hidden = !!e.hidden;
  return out;
}

// Price of the next purchase of an item, or null if it can't be bought (maxed, unknown, or an admin took it out).
export function priceOf(itemId, items = {}, edits = {}) {
  const have = items[itemId] || 0;
  const cos = /^cos_(avatar|color|title|crosshair|finish)_(.+)$/.exec(itemId);
  if (cos) return have ? null : cosmeticPrice(cos[1], cos[2]);
  const found = SHOP.find((s) => s.id === itemId);
  if (!found) return null;
  const def = shopDef(found, edits);
  if (def.hidden) return null;
  if (def.kind === 'gun') return have ? null : def.price;
  if (have >= def.max) return null;
  if (def.kind === 'upgrade') return def.base * (have + 1);
  return def.price;
}
