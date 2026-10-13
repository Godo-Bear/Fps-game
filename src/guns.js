import * as THREE from 'three';

// Every gun in the game. The rifle is what you start with; the rest are found around the map.
// tier decides how often a gun spawns and the colour of its loot beam.
export const GUNS = {
  // Everyone carries a knife: slot 2, or a quick stab with V. Headshots and backstabs hit harder.
  knife: {
    id: 'knife', name: 'Combat Knife', tier: 'common', icon: '🔪', melee: true, range: 2.7,
    damage: 60, pellets: 1, fireRate: 2.4, mag: 1, reload: 0, reserve: Infinity,
    spread: 0, auto: true, recoil: 0.004, kick: 0, zoomFov: 75, sound: 'knife', moveMul: 1.08,
    hands: { grip: [0, -0.02, 0.06], fore: [-0.2, -0.16, 0.1] },
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Rifle', tier: 'common', icon: '🔫',
    damage: 26, pellets: 1, fireRate: 9, mag: 30, reload: 1.9, reserve: Infinity,
    spread: 0.006, auto: true, recoil: 0.011, kick: 0.5, zoomFov: 50, sound: 'rifle', reloadStyle: 'mag', sight: 'reddot',
    hands: { grip: [0.005, -0.1, 0.11], fore: [-0.02, -0.06, -0.38] },
    ads: [0, -0.052, -0.36],
  },
  smg: {
    id: 'smg', name: 'Viper SMG', tier: 'rare', icon: '⚡',
    damage: 15, pellets: 1, fireRate: 16, mag: 40, reload: 1.5, reserve: 200,
    spread: 0.013, auto: true, recoil: 0.006, kick: 0.35, zoomFov: 60, sound: 'smg', reloadStyle: 'mag',
    hands: { grip: [0, -0.1, 0.06], fore: [-0.01, -0.07, -0.2] },
    ads: [0, -0.06, -0.32],
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick', tier: 'rare', icon: '💥',
    damage: 17, pellets: 9, fireRate: 1.4, mag: 6, reload: 0.45, reserve: 30,
    spread: 0.07, auto: false, recoil: 0.055, kick: 1, zoomFov: 62, sound: 'shotgun', reloadStyle: 'shells', falloff: [12, 40],
    hands: { grip: [0, -0.1, 0.12], fore: [-0.01, -0.07, -0.34] },
    ads: [0, -0.045, -0.36],
  },
  revolver: {
    id: 'revolver', name: 'Hand Cannon', tier: 'epic', icon: '🤠',
    damage: 95, pellets: 1, fireRate: 2.6, mag: 6, reload: 2.1, reserve: 36,
    spread: 0.003, auto: false, recoil: 0.045, kick: 1, zoomFov: 52, sound: 'revolver', reloadStyle: 'cylinder', pierce: 1,
    hands: { grip: [0, -0.09, 0.06], fore: [-0.03, -0.12, 0.08] },
    ads: [0, -0.045, -0.4],
  },
  lmg: {
    id: 'lmg', name: 'Mule LMG', tier: 'epic', icon: '🐂',
    damage: 24, pellets: 1, fireRate: 11, mag: 100, reload: 4, reserve: 300,
    spread: 0.018, auto: true, recoil: 0.009, kick: 0.45, zoomFov: 52, sound: 'lmg', reloadStyle: 'box', moveMul: 0.85, sight: 'holo',
    hands: { grip: [0.005, -0.12, 0.12], fore: [-0.02, -0.08, -0.36] },
    ads: [0, -0.07, -0.36],
  },
  dmr: {
    id: 'dmr', name: 'Marksman DMR', tier: 'epic', icon: '🔭',
    damage: 72, pellets: 1, fireRate: 4, mag: 12, reload: 2.2, reserve: 72,
    spread: 0.0015, hipSpread: 0.02, auto: false, recoil: 0.03, kick: 0.8, zoomFov: 30, scope: 'acog', sound: 'revolver', reloadStyle: 'mag', pierce: 1,
    hands: { grip: [0.005, -0.1, 0.11], fore: [-0.02, -0.06, -0.36] },
  },
  sniper: {
    id: 'sniper', name: 'Longshot', tier: 'legendary', icon: '🎯',
    damage: 230, pellets: 1, fireRate: 0.9, mag: 5, reload: 2.6, reserve: 25,
    spread: 0.0004, hipSpread: 0.035, auto: false, recoil: 0.08, kick: 1, zoomFov: 18, scope: 'sniper', sound: 'sniper', reloadStyle: 'bolt', pierce: 3,
    hands: { grip: [0.005, -0.1, 0.12], fore: [-0.02, -0.07, -0.4] },
    ads: [0, -0.09, -0.3],
  },
  launcher: {
    id: 'launcher', name: 'Thumper', tier: 'legendary', icon: '🧨',
    damage: 170, pellets: 1, fireRate: 1.1, mag: 4, reload: 3, reserve: 16,
    spread: 0.004, auto: false, recoil: 0.06, kick: 1, zoomFov: 58, sound: 'launcher', reloadStyle: 'drum',
    projectile: { speed: 42, gravity: 11, radius: 4.5 },
    hands: { grip: [0.005, -0.12, 0.1], fore: [-0.02, -0.09, -0.3] },
    ads: [0, -0.075, -0.36],
  },
};

export const TIER_COLOR = { common: 0xcfc6b0, rare: 0x3d8bff, epic: 0xb04dff, legendary: 0xffb020 };
export const TIER_CSS = { common: '#cfc6b0', rare: 'var(--rare)', epic: 'var(--epic)', legendary: 'var(--legendary)' };

// Chances when a weapon spawns on the map.
export const GUN_DROP_TABLE = [
  { tier: 'legendary', chance: 0.1, guns: ['sniper', 'launcher'] },
  { tier: 'epic', chance: 0.3, guns: ['revolver', 'lmg', 'dmr'] },
  { tier: 'rare', chance: 0.6, guns: ['smg', 'shotgun'] },
];

// Mutated guns: a glowing variant with +20% damage and a special power against zombies.
export const MUTATIONS = {
  toxic: { name: 'Toxic', color: 0x6dff2a, css: '#6dff2a', desc: 'Poisons zombies, dealing extra damage over time' },
  inferno: { name: 'Inferno', color: 0xff7a1a, css: '#ff7a1a', desc: 'Sets zombies on fire; burning spreads when they die' },
  shock: { name: 'Shock', color: 0x5ff2ff, css: '#5ff2ff', desc: 'Lightning arcs from each hit to 2 nearby zombies' },
  frost: { name: 'Cryo', color: 0x9fd8ff, css: '#9fd8ff', desc: 'Freezes zombies to a crawl; +40% damage to frozen ones' },
  vampire: { name: 'Vampiric', color: 0xff2a4a, css: '#ff2a4a', desc: 'Heals you for part of the damage you deal (can overheal)' },
  void: { name: 'Void', color: 0xb04dff, css: '#b04dff', desc: 'Small chance to erase a zombie instantly (higher on headshots)' },
};
export const MUTATION_IDS = Object.keys(MUTATIONS);
export const randomMutation = () => MUTATION_IDS[Math.floor(Math.random() * MUTATION_IDS.length)];

export function rollGun(rand = Math.random) {
  let r = rand();
  for (const row of GUN_DROP_TABLE) {
    if (r < row.chance) return row.guns[Math.floor(rand() * row.guns.length)];
    r -= row.chance;
  }
  return 'smg';
}

const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.5, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.55, metalness: 0.25 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.7 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x9c8a62, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a03c, roughness: 0.4, metalness: 0.5 }),
  shell: new THREE.MeshStandardMaterial({ color: 0xb02a1e, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x5fb3d9, roughness: 0.1, metalness: 0.3, emissive: 0x0a2a3a }),
  orange: new THREE.MeshStandardMaterial({ color: 0xc8641e, roughness: 0.6 }),
  bakelite: new THREE.MeshStandardMaterial({ color: 0x7a3f1d, roughness: 0.55 }),
};

function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r1, r2, len, seg = 10) => new THREE.CylinderGeometry(r1, r2, len, seg);
const H = Math.PI / 2;

// Builds a gun pointing down -Z. Returns the group plus the parts the reload animations move.
// finish: hex colour for the metal parts; mutation: id from MUTATIONS (adds a glow).
export function buildGun(id, { finish = null, mutation = null } = {}) {
  const out = buildGunBase(id);
  if (finish || mutation) {
    const mut = mutation ? MUTATIONS[mutation] : null;
    const swap = new Map();
    out.group.traverse((o) => {
      if (!o.isMesh || (o.material !== M.metal && o.material !== M.dark)) return;
      if (!swap.has(o.material)) {
        const m = o.material.clone();
        if (finish) m.color.set(finish).multiplyScalar(o.material === M.dark ? 0.7 : 1);
        if (mut) {
          m.emissive.setHex(mut.color);
          m.emissiveIntensity = 0.25;
        }
        swap.set(o.material, m);
      }
      o.material = swap.get(o.material);
    });
    if (mut) {
      // glowing veins along the gun
      const glow = new THREE.MeshBasicMaterial({ color: mut.color });
      for (const side of [-1, 1]) part(out.group, B(0.006, 0.012, 0.32), glow, side * 0.042, 0.0, -0.08);
      part(out.group, B(0.03, 0.03, 0.03), glow, 0, -0.03, -0.25);
    }
  }
  return out;
}

function buildGunBase(id) {
  const g = new THREE.Group();
  const out = { group: g, mag: null, muzzleZ: -0.9, muzzleY: 0.02, extra: null };
  switch (id) {
    case 'rifle': {
      part(g, B(0.075, 0.1, 0.46), M.metal, 0, 0, 0);
      part(g, B(0.07, 0.07, 0.3), M.wood, 0, -0.01, -0.36);
      part(g, C(0.017, 0.017, 0.42), M.metal, 0, 0.02, -0.66, H);
      part(g, C(0.026, 0.026, 0.08), M.metal, 0, 0.02, -0.86, H);
      part(g, B(0.02, 0.05, 0.02), M.metal, 0, 0.065, -0.8);
      // red dot sight
      part(g, B(0.03, 0.02, 0.06), M.dark, 0, 0.06, 0.02);
      part(g, new THREE.CylinderGeometry(0.024, 0.024, 0.07, 12, 1, true), M.dark, 0, 0.1, 0.02, H);
      part(g, new THREE.RingGeometry(0.018, 0.024, 12), M.dark, 0, 0.1, -0.015);
      part(g, B(0.065, 0.11, 0.28), M.wood, 0, -0.04, 0.34, 0.12);
      part(g, B(0.05, 0.13, 0.06), M.wood, 0, -0.1, 0.1, -0.35);
      out.mag = part(g, B(0.05, 0.2, 0.09), M.bakelite, 0, -0.14, -0.08, 0.3);
      out.muzzleZ = -0.92;
      break;
    }
    case 'smg': {
      part(g, B(0.07, 0.09, 0.32), M.dark, 0, 0, -0.04);
      part(g, B(0.072, 0.05, 0.16), M.olive, 0, -0.01, -0.22);
      part(g, C(0.02, 0.02, 0.18), M.dark, 0, 0.01, -0.36, H);
      part(g, C(0.03, 0.03, 0.14), M.dark, 0, 0.01, -0.5, H);
      part(g, B(0.04, 0.03, 0.06), M.dark, 0, 0.06, 0.02);
      part(g, B(0.05, 0.12, 0.05), M.olive, 0, -0.09, 0.06, -0.3);
      part(g, B(0.015, 0.015, 0.22), M.dark, 0.025, -0.02, 0.22);
      part(g, B(0.015, 0.015, 0.22), M.dark, -0.025, -0.02, 0.22);
      part(g, B(0.065, 0.06, 0.02), M.dark, 0, -0.03, 0.33);
      out.mag = part(g, B(0.035, 0.26, 0.05), M.dark, 0, -0.17, -0.1, 0.08);
      out.muzzleZ = -0.58;
      break;
    }
    case 'shotgun': {
      part(g, B(0.08, 0.09, 0.22), M.dark, 0, 0, 0);
      part(g, C(0.022, 0.022, 0.62), M.metal, 0.022, 0.025, -0.42, H);
      part(g, C(0.022, 0.022, 0.62), M.metal, -0.022, 0.025, -0.42, H);
      part(g, B(0.075, 0.06, 0.26), M.wood, 0, -0.02, -0.3);
      part(g, B(0.07, 0.12, 0.34), M.wood, 0, -0.05, 0.27, 0.18);
      part(g, B(0.05, 0.12, 0.05), M.wood, 0, -0.09, 0.1, -0.4);
      part(g, B(0.012, 0.02, 0.012), M.brass, 0, 0.055, -0.7);
      out.extra = part(g, C(0.018, 0.018, 0.07), M.shell, 0, -0.04, 0.0, H); // shell in hand during reload
      out.extra.visible = false;
      out.muzzleZ = -0.74;
      out.muzzleY = 0.025;
      break;
    }
    case 'revolver': {
      part(g, B(0.05, 0.07, 0.12), M.metal, 0, 0, -0.02);
      part(g, C(0.017, 0.017, 0.28), M.metal, 0, 0.02, -0.2, H);
      part(g, B(0.015, 0.02, 0.26), M.metal, 0, 0.042, -0.2);
      part(g, B(0.006, 0.02, 0.01), M.metal, 0, 0.06, -0.32);
      out.extra = part(g, C(0.035, 0.035, 0.07, 8), M.dark, 0, 0.0, -0.03, H); // cylinder swings out
      part(g, B(0.045, 0.14, 0.06), M.wood, 0, -0.08, 0.06, -0.35);
      part(g, B(0.015, 0.03, 0.03), M.metal, 0, 0.045, 0.04, 0.5);
      out.muzzleZ = -0.36;
      break;
    }
    case 'lmg': {
      part(g, B(0.1, 0.13, 0.5), M.dark, 0, 0, -0.02);
      part(g, C(0.035, 0.035, 0.42, 12), M.metal, 0, 0.02, -0.48, H);
      part(g, C(0.02, 0.02, 0.2), M.dark, 0, 0.02, -0.76, H);
      part(g, B(0.03, 0.04, 0.2), M.dark, 0, 0.09, -0.05);
      // holographic sight: open frame with a glass window
      part(g, B(0.07, 0.012, 0.08), M.dark, 0, 0.115, 0.02);
      part(g, B(0.012, 0.06, 0.08), M.dark, 0.03, 0.145, 0.02);
      part(g, B(0.012, 0.06, 0.08), M.dark, -0.03, 0.145, 0.02);
      part(g, B(0.07, 0.012, 0.08), M.dark, 0, 0.178, 0.02);
      part(g, B(0.015, 0.2, 0.015), M.dark, 0.02, -0.06, -0.62, 1.2);
      part(g, B(0.015, 0.2, 0.015), M.dark, -0.02, -0.06, -0.62, 1.2);
      part(g, B(0.08, 0.12, 0.3), M.olive, 0, -0.02, 0.36, 0.1);
      part(g, B(0.05, 0.13, 0.06), M.olive, 0, -0.12, 0.12, -0.35);
      out.mag = part(g, B(0.14, 0.12, 0.14), M.olive, -0.1, -0.06, -0.06);
      out.muzzleZ = -0.88;
      break;
    }
    case 'dmr': {
      part(g, B(0.072, 0.095, 0.44), M.dark, 0, 0, 0);
      part(g, C(0.017, 0.019, 0.5), M.dark, 0, 0.015, -0.48, H);
      part(g, C(0.026, 0.026, 0.07), M.dark, 0, 0.015, -0.74, H);
      part(g, B(0.075, 0.075, 0.3), M.tan, 0, -0.01, -0.32);
      part(g, B(0.07, 0.11, 0.3), M.tan, 0, -0.035, 0.34, 0.12);
      part(g, B(0.05, 0.13, 0.06), M.tan, 0, -0.1, 0.12, -0.35);
      // 4x combat scope
      part(g, B(0.03, 0.03, 0.12), M.dark, 0, 0.06, 0.0);
      part(g, C(0.026, 0.026, 0.2, 12), M.dark, 0, 0.095, 0.0, H);
      part(g, C(0.034, 0.026, 0.05, 12), M.dark, 0, 0.095, -0.12, H);
      part(g, new THREE.CircleGeometry(0.03, 12), M.glass, 0, 0.095, -0.146);
      out.mag = part(g, B(0.05, 0.16, 0.08), M.dark, 0, -0.12, -0.06, 0.15);
      out.muzzleZ = -0.78;
      out.muzzleY = 0.015;
      break;
    }
    case 'sniper': {
      part(g, B(0.07, 0.09, 0.4), M.dark, 0, 0, -0.02);
      part(g, C(0.016, 0.02, 0.75), M.dark, 0, 0.015, -0.6, H);
      part(g, C(0.028, 0.028, 0.08), M.dark, 0, 0.015, -0.98, H);
      part(g, B(0.075, 0.1, 0.36), M.tan, 0, -0.03, 0.34, 0.14);
      part(g, B(0.07, 0.06, 0.32), M.tan, 0, -0.02, -0.32);
      part(g, B(0.05, 0.13, 0.06), M.tan, 0, -0.1, 0.12, -0.35);
      part(g, C(0.032, 0.032, 0.3, 14), M.dark, 0, 0.1, -0.04, H);
      part(g, C(0.042, 0.032, 0.07, 14), M.dark, 0, 0.1, -0.21, H);
      part(g, C(0.038, 0.032, 0.06, 14), M.dark, 0, 0.1, 0.13, H);
      part(g, new THREE.CircleGeometry(0.036, 14), M.glass, 0, 0.1, -0.246);
      part(g, B(0.02, 0.05, 0.02), M.dark, 0, 0.06, -0.04);
      out.extra = part(g, C(0.01, 0.01, 0.07), M.metal, 0.05, 0.02, 0.08, 0, 0, H); // bolt handle
      out.mag = part(g, B(0.045, 0.08, 0.08), M.dark, 0, -0.08, -0.06);
      out.muzzleZ = -1.03;
      out.muzzleY = 0.015;
      break;
    }
    case 'knife': {
      // blade forward, edge down, held low on the right
      const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.8 });
      part(g, B(0.012, 0.045, 0.2), steel, 0, 0.01, -0.13);
      part(g, B(0.01, 0.025, 0.05), steel, 0, 0.022, -0.25, 0.5);
      part(g, B(0.05, 0.016, 0.02), M.dark, 0, 0, -0.025);
      part(g, B(0.03, 0.038, 0.11), M.dark, 0, -0.004, 0.035);
      part(g, B(0.032, 0.04, 0.012), M.metal, 0, -0.004, 0.095);
      out.muzzleZ = -0.25;
      out.muzzleY = 0.01;
      break;
    }
    case 'launcher': {
      part(g, C(0.05, 0.05, 0.55, 14), M.olive, 0, 0.03, -0.32, H);
      part(g, C(0.058, 0.058, 0.05, 14), M.dark, 0, 0.03, -0.6, H);
      out.extra = part(g, C(0.085, 0.085, 0.16, 6), M.dark, 0, 0.0, 0.02, H); // revolving drum
      part(g, B(0.05, 0.13, 0.06), M.dark, 0, -0.11, 0.13, -0.3);
      part(g, B(0.05, 0.1, 0.06), M.dark, 0, -0.08, -0.28, 0.2);
      part(g, B(0.06, 0.08, 0.3), M.olive, 0, -0.02, 0.3, 0.12);
      part(g, B(0.03, 0.06, 0.03), M.orange, 0, 0.1, -0.15);
      out.muzzleZ = -0.64;
      out.muzzleY = 0.03;
      break;
    }
    default:
      throw new Error(`unknown gun ${id}`);
  }
  return out;
}

const glove = new THREE.MeshStandardMaterial({ color: 0x4a423a, roughness: 0.9 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6450, roughness: 1 });

// Hands and forearms holding a gun. Each hand is a group so reload animations can move it.
export function buildHands(def) {
  const right = new THREE.Group();
  const [gx, gy, gz] = def.hands.grip;
  right.position.set(gx, gy, gz);
  part(right, B(0.09, 0.09, 0.09), glove, 0, 0, 0, -0.3);
  part(right, B(0.1, 0.1, 0.3), sleeve, 0.045, -0.06, 0.17, 0.4, 0.2);
  const left = new THREE.Group();
  const [fx, fy, fz] = def.hands.fore;
  left.position.set(fx, fy, fz);
  part(left, B(0.09, 0.08, 0.11), glove, 0, 0, 0);
  part(left, B(0.1, 0.1, 0.34), sleeve, -0.1, -0.06, 0.18, 0.3, -0.6);
  return { right, left, leftRest: left.position.clone() };
}
