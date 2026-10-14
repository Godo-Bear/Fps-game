// Things you can build (shared by the game and the room server). You pay with scrap,
// which you get for kills and for clearing waves.
export const STRUCTURES = {
  barricade: {
    id: 'barricade', name: 'Barricade', icon: '🧱', key: '1', cost: 10, hp: 500,
    hx: 1.6, hz: 0.3, h: 1.3, desc: 'A sandbag wall. Zombies have to tear it down; it also stops bullets.',
  },
  turret: {
    id: 'turret', name: 'Turret', icon: '🔫', key: '2', cost: 35, hp: 260,
    hx: 0.5, hz: 0.5, h: 1.15, range: 26, rate: 4, damage: 22, pvpDamage: 9,
    desc: 'Shoots the nearest zombie (or enemy) in range.',
  },
};
export const STRUCTURE_IDS = Object.keys(STRUCTURES);
// No limit on how many you build (scrap is the only cost). This is only a guard against a room
// lagging to death, far more than a match ever needs.
export const MAX_STRUCTURES = 400; // per room
export const BUILD_REACH = 8; // how far from you something can be placed
export const START_SCRAP = 10;
export const SCRAP_PER_PVP_KILL = 8;
