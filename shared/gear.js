// Special gear: only admins have it, and only the admin can hand it out (admin panel). items[item] = 1.
// The flamethrower and bazooka come with you into every game (unlimited ammo); press H to drive the tank.
export const SPECIAL_GEAR = [
  { item: 'sp_tank', id: 'tank', icon: '🛡️', name: 'Tank' },
  { item: 'sp_flamer', id: 'flamer', icon: '🔥', name: 'Flamethrower' },
  { item: 'sp_bazooka', id: 'bazooka', icon: '🚀', name: 'Bazooka' },
];
export const ownsGear = (items, id) => !!items?.[SPECIAL_GEAR.find((g) => g.id === id)?.item];
// the tank: a flag other players see, and how much less damage you take inside it
export const TANK_FLAG = 16;
export const TANK_ARMOUR = 0.25; // you take a quarter of the damage
