// Gun mastery (shared by the game and the server): kills with each gun unlock skins for it.
export const MASTERY_GUNS = ['rifle', 'knife', 'smg', 'shotgun', 'revolver', 'lmg', 'dmr', 'sniper', 'launcher'];
export const MASTERY_TIERS = [
  { id: 'bronze', name: 'Bronze', kills: 50, color: 0xb07a45, css: '#cd8a52' },
  { id: 'silver', name: 'Silver', kills: 150, color: 0xc8cdd2, css: '#d6dbe0' },
  { id: 'gold', name: 'Gold', kills: 400, color: 0xd9a92b, css: '#ffcf3d' },
  { id: 'diamond', name: 'Diamond', kills: 1000, color: 0x7fe3ff, css: '#8fe9ff' },
];
export const MAX_MASTERY_REPORT = 300; // kills per gun in one report

// How many tiers a kill count has unlocked (0-4).
export const tierFor = (kills) => MASTERY_TIERS.filter((t) => kills >= t.kills).length;

// m: { k: { gun: kills }, s: { gun: chosen tier (1-4, 0 = none) } }
export function cleanMastery(m) {
  const out = { k: {}, s: {} };
  for (const g of MASTERY_GUNS) {
    const k = Math.max(0, Math.floor(Number(m?.k?.[g]) || 0));
    if (k) out.k[g] = k;
    const s = Math.floor(Number(m?.s?.[g]) || 0);
    if (s > 0 && s <= tierFor(k)) out.s[g] = s;
  }
  return out;
}

export function addMasteryKills(m, kills) {
  const out = cleanMastery(m);
  for (const g of MASTERY_GUNS) {
    const n = Math.floor(Number(kills?.[g]) || 0);
    if (n > 0) out.k[g] = (out.k[g] || 0) + Math.min(MAX_MASTERY_REPORT, n);
  }
  return out;
}

// Pick a skin for a gun (0 = the normal look). Returns the new state or null if it isn't unlocked.
export function chooseSkin(m, gun, tier) {
  const out = cleanMastery(m);
  if (!MASTERY_GUNS.includes(gun) || tier < 0 || tier > tierFor(out.k[gun] || 0)) return null;
  if (tier) out.s[gun] = tier;
  else delete out.s[gun];
  return out;
}
