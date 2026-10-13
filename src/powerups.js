// Power-ups offered between waves. Each card rolls its own rarity; legendary is the hardest to get.
export const RARITY_ODDS = [
  { id: 'legendary', label: 'Legendary', chance: 0.06 },
  { id: 'epic', label: 'Epic', chance: 0.26 },
  { id: 'rare', label: 'Rare', chance: 0.68 },
];
export const RARITY_RANK = { rare: 0, epic: 1, legendary: 2 };

export function rollRarity(rand = Math.random) {
  let r = rand();
  for (const tier of RARITY_ODDS) {
    if (r < tier.chance) return tier.id;
    r -= tier.chance;
  }
  return 'rare';
}

const pct = (v) => `${Math.round(v * 100)}%`;

export function baseStats() {
  return {
    damageMul: 1,
    fireRateMul: 1,
    magBonus: 0,
    reloadSpeed: 1,
    maxHealth: 100,
    speedMul: 1,
    regen: 0,
    headshotMul: 2,
    healOnKill: 0,
    armor: 0, // fraction of damage ignored
    overheal: 50, // how far healing can push you above max health
    critChance: 0,
    slow: 0,
    pierce: 0,
    explosive: 0,
    secondWind: 0,
    multishot: 1,
  };
}

export const POWERUPS = [
  {
    id: 'damage', max: 6, name: 'Hollow Points', icon: '💥',
    tiers: { rare: 0.15, epic: 0.3, legendary: 0.55 },
    desc: (v) => `+${pct(v)} bullet damage`,
    apply: (s, v) => { s.damageMul += v; },
  },
  {
    id: 'firerate', max: 5, name: 'Hair Trigger', icon: '⚡',
    tiers: { rare: 0.12, epic: 0.22, legendary: 0.4 },
    desc: (v) => `+${pct(v)} fire rate`,
    apply: (s, v) => { s.fireRateMul += v; },
  },
  {
    id: 'mag', max: 4, name: 'Extended Mag', icon: '📦',
    tiers: { rare: 8, epic: 16, legendary: 32 },
    desc: (v) => `+${Math.round((v / 30) * 100)}% magazine size on every gun`,
    apply: (s, v) => { s.magBonus += v; },
  },
  {
    id: 'reload', max: 4, name: 'Sleight of Hand', icon: '🔄',
    tiers: { rare: 0.2, epic: 0.4, legendary: 0.75 },
    desc: (v) => `${pct(v)} faster reloads`,
    apply: (s, v) => { s.reloadSpeed += v; },
  },
  {
    id: 'vitality', max: 5, name: 'Thick Skin', icon: '❤️',
    tiers: { rare: 20, epic: 40, legendary: 80 },
    desc: (v) => `+${v} max health and heal ${v}`,
    apply: (s, v, game) => { s.maxHealth += v; game.player.heal(v); },
  },
  {
    id: 'speed', max: 4, name: 'Fleet Foot', icon: '👟',
    tiers: { rare: 0.08, epic: 0.15, legendary: 0.28 },
    desc: (v) => `+${pct(v)} movement speed`,
    apply: (s, v) => { s.speedMul += v; },
  },
  {
    id: 'regen', max: 5, name: 'Regeneration', icon: '🌿',
    tiers: { rare: 1, epic: 2.5, legendary: 5 },
    desc: (v) => `Regenerate ${v} HP per second`,
    apply: (s, v) => { s.regen += v; },
  },
  {
    id: 'headshot', max: 4, name: 'Deadeye', icon: '🎯',
    tiers: { rare: 0.5, epic: 1, legendary: 2 },
    desc: (v) => `+${v}× headshot damage`,
    apply: (s, v) => { s.headshotMul += v; },
  },
  {
    id: 'vampire', max: 5, name: 'Bloodthirst', icon: '🩸',
    tiers: { rare: 3, epic: 6, legendary: 12 },
    desc: (v) => `Heal ${v} HP for every kill`,
    apply: (s, v) => { s.healOnKill += v; },
  },
  {
    id: 'armor', max: 4, name: 'Scrap Armor', icon: '🛡️',
    tiers: { rare: 0.08, epic: 0.15, legendary: 0.28 },
    desc: (v) => `Take ${pct(v)} less damage`,
    apply: (s, v) => { s.armor = 1 - (1 - s.armor) * (1 - v); },
  },
  {
    id: 'crit', max: 4, name: 'Lucky Shot', icon: '🍀',
    tiers: { rare: 0.08, epic: 0.15, legendary: 0.28 },
    desc: (v) => `${pct(v)} chance for a 2.5× critical hit`,
    apply: (s, v) => { s.critChance = Math.min(0.8, s.critChance + v); },
  },
  {
    id: 'overcharge', max: 4, name: 'Overcharge', icon: '💠',
    tiers: { rare: 25, epic: 50, legendary: 100 },
    desc: (v) => `Healing can overheal +${v} more HP above your max`,
    apply: (s, v) => { s.overheal += v; },
  },
  {
    id: 'frost', max: 3, name: 'Cryo Rounds', icon: '❄️',
    tiers: { epic: 0.3, legendary: 0.55 },
    desc: (v) => `Hits slow zombies by ${pct(v)} for 2s`,
    apply: (s, v) => { s.slow = Math.min(0.75, Math.max(s.slow, v) + (s.slow > 0 ? 0.1 : 0)); },
  },
  {
    id: 'pierce', max: 3, name: 'Penetrator', icon: '🗡️',
    tiers: { epic: 1, legendary: 2 },
    desc: (v) => `Bullets pierce ${v} extra zombie${v > 1 ? 's' : ''}`,
    apply: (s, v) => { s.pierce += v; },
  },
  {
    id: 'explosive', max: 3, name: 'Explosive Rounds', icon: '🧨', exclusive: true,
    tiers: { legendary: 1 },
    desc: () => 'Bullets explode on impact, hurting every zombie nearby',
    apply: (s) => { s.explosive += 1; },
    canOffer: (s) => s.explosive < 3,
  },
  {
    id: 'secondwind', max: 1, name: 'Second Wind', icon: '👼', exclusive: true,
    tiers: { legendary: 1 },
    desc: () => 'Cheat death once: revive at full health and blast zombies away',
    apply: (s) => { s.secondWind += 1; },
    canOffer: (s) => s.secondWind === 0,
  },
  {
    id: 'twin', max: 2, name: 'Double Tap', icon: '🔫', exclusive: true,
    tiers: { legendary: 1 },
    desc: () => 'Every trigger pull fires an extra bullet',
    apply: (s) => { s.multishot += 1; },
    canOffer: (s) => s.multishot < 3,
  },
];

// Builds three distinct cards. Each card rolls a rarity first, then picks a power-up that has that tier.
// owned: Map of id -> number of times taken. Maxed-out power-ups are never offered.
export function rollOffer(stats, owned = new Map(), count = 3, rand = Math.random) {
  const offer = [];
  for (let i = 0; i < count; i++) {
    let rarity = rollRarity(rand);
    const available = (r) =>
      POWERUPS.filter(
        (p) => p.tiers[r] !== undefined && (!p.canOffer || p.canOffer(stats)) && (owned.get(p.id) || 0) < p.max && !offer.some((o) => o.def.id === p.id)
      );
    let pool = available(rarity);
    if (!pool.length) {
      rarity = 'rare';
      pool = available('rare');
    }
    // Exclusive legendaries are the exciting ones, so weight them up when a legendary hits.
    const weighted = pool.flatMap((p) => (p.exclusive ? [p, p, p] : [p]));
    const def = weighted[Math.floor(rand() * weighted.length)];
    if (!def) continue;
    offer.push({ def, rarity, value: def.tiers[rarity] });
  }
  return offer;
}
