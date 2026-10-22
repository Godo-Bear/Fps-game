import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isHalloween } from './halloween.js';

// The owner's gun models (public/models). Until one has loaded, that gun keeps its block model.
// Each is turned to point down -z (rotY), scaled to `length` metres, then placed with its muzzle at `muzzleZ`
// and its top at `topY` (or moved by `at`). mag: the part that comes out when reloading.
const GUN_MODELS = {
  rifle: { url: '/models/Assault Rifle by Zsky - XGeBGFQxYg.glb', length: 1.36, muzzleZ: -0.92, topY: 0.055 },
  smg: { url: '/models/Submachine Gun by Quaternius - 7ehatxr7FY.glb', rotY: Math.PI / 2, length: 0.86, muzzleZ: -0.58, topY: 0.062 },
  shotgun: { url: '/models/Shotgun_3.fbx', rotY: Math.PI / 2, length: 1.18, muzzleZ: -0.76, topY: 0.06 },
  revolver: { url: '/models/Pistol by Zsky - 3To2e7sKmO.glb', length: 0.4, muzzleZ: -0.36, topY: 0.075 },
  lmg: { url: '/models/MK14 by austincford - lNGPW2NGPZ.glb', length: 1.25, at: [0, -0.06, -0.29], mag: 'Magazine_Standard', muzzleZ: -0.82 },
  dmr: { url: '/models/Sniper Rifle by Zsky - ZkwSIy3JOV.glb', length: 1.3, muzzleZ: -0.8, topY: 0.13 },
  sniper: { url: '/models/AWP Sniper by Kyler Swanson - fKsTWWhSkqt.glb', length: 1.55, muzzleZ: -1.05, topY: 0.135 },
  crossbow: { url: '/models/Crossbow by CreativeTrio - kHb0kA11oD.glb', length: 0.95, muzzleZ: -0.62, topY: 0.06 },
  flamer: { url: '/models/TF2 flamethrower by mario tofani - djC1ShUqIXf.glb', rotY: Math.PI / 2, length: 1.15, muzzleZ: -0.8, topY: 0.09 },
  bazooka: { url: '/models/Bazooka by CreativeTrio - eJNzLpBsEt.glb', length: 1.35, muzzleZ: -0.9, topY: 0.14 },
};
const gunModels = {};
const loadModel = (url) =>
  new Promise((resolve) => {
    const done = (obj) => resolve(obj);
    if (url.endsWith('.fbx'))
      import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => new FBXLoader().load(encodeURI(url), done, undefined, () => resolve(null)));
    else new GLTFLoader().load(encodeURI(url), (g) => done(g.scene), undefined, () => resolve(null));
  });
export function loadGunModels() {
  return Promise.all(
    Object.entries(GUN_MODELS).map(async ([id, def]) => {
      const obj = await loadModel(def.url);
      if (!obj) return false;
      const holder = new THREE.Group();
      const spin = new THREE.Group();
      spin.rotation.y = def.rotY || 0;
      spin.add(obj);
      holder.add(spin);
      holder.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(holder, true);
      const size = box.getSize(new THREE.Vector3());
      holder.scale.setScalar(def.length / (Math.max(size.x, size.y, size.z) || 1));
      holder.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(holder, true);
      if (def.at) holder.position.set(...def.at);
      else holder.position.set(-(box.min.x + box.max.x) / 2, def.topY - box.max.y, def.muzzleZ - box.min.z);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const mats = [].concat(o.material).map((m) => {
          // a plain matte look like the rest of the game
          const out = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0x444444, map: m.map || null, roughness: 0.6, metalness: 0.2 });
          return out;
        });
        o.material = Array.isArray(o.material) ? mats : mats[0];
        // gun finishes tint the dark metal, not the wood
        const c = mats[0].color;
        o.userData.finishable = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35 && !(c.r > c.g * 1.3);
      });
      gunModels[id] = { scene: holder, def };
      return true;
    }),
  );
}
export const hasGunModel = (id) => !!gunModels[id];

// A holographic sight on a rail at z: slim mount, housing with buttons, a hooded window with tinted glass and a
// glowing ring-and-dot reticle, centred on the LMG's sight line (y 0.145).
const holoMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.55, metalness: 0.35 }),
  edge: new THREE.MeshStandardMaterial({ color: 0x3a3d41, roughness: 0.45, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x7fd0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  reticle: new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.95, depthWrite: false }),
  button: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
};
function holoSight(g, z) {
  const m = holoMats;
  const y = 0.145;
  // rail clamp and base
  part(g, B(0.04, 0.012, 0.11), m.body, 0, 0.064, z);
  part(g, C(0.006, 0.006, 0.05, 8), m.edge, 0.022, 0.066, z + 0.03, 0, 0, H); // clamp screw
  // housing under the window (battery and electronics), sloped at the front
  part(g, B(0.052, 0.03, 0.1), m.body, 0, 0.085, z + 0.005);
  part(g, B(0.052, 0.022, 0.03), m.body, 0, 0.09, z - 0.055, -0.5);
  for (const bx of [-0.012, 0.012]) part(g, B(0.01, 0.004, 0.012), m.button, bx, 0.101, z + 0.035); // buttons
  part(g, C(0.009, 0.009, 0.012, 10), m.edge, 0.031, 0.086, z + 0.01, 0, 0, H); // battery cap
  // the hood: two thin side walls and a top, open front and back
  for (const sx of [-1, 1]) part(g, B(0.006, 0.052, 0.07), m.body, sx * 0.03, y - 0.006, z - 0.01);
  part(g, B(0.066, 0.007, 0.075), m.body, 0, y + 0.024, z - 0.01);
  part(g, B(0.066, 0.004, 0.006), m.edge, 0, y + 0.024, z - 0.047); // front lip
  // glass and the reticle on it
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.044), m.glass);
  glass.position.set(0, y, z - 0.02);
  glass.renderOrder = 2;
  g.add(glass);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0085, 0.0098, 32), m.reticle);
  ring.position.set(0, y, z - 0.019);
  ring.renderOrder = 3;
  g.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 12), m.reticle);
  dot.position.set(0, y, z - 0.019);
  dot.renderOrder = 3;
  g.add(dot);
}

// a copy of the model, with its magazine pulled out as its own part so reloads can move it
function modelGun(g, out, id) {
  const { scene, def } = gunModels[id];
  const model = scene.clone(true);
  g.add(model);
  out.muzzleZ = def.muzzleZ;
  if (def.mag) {
    const mag = model.getObjectByName(def.mag);
    if (mag) {
      model.updateMatrixWorld(true);
      g.updateMatrixWorld(true);
      // re-parent onto the gun group, keeping where it is
      const holder = new THREE.Group();
      g.add(holder);
      holder.attach(mag);
      out.mag = holder;
    }
  }
  // the reload and bolt animations move a magazine and a bolt/cylinder: models without them as separate
  // parts get empty stand-ins, so the animations have something to move
  for (const k of ['mag', 'extra']) {
    if (out[k]) continue;
    out[k] = new THREE.Group();
    g.add(out[k]);
  }
}

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
  crossbow: {
    id: 'crossbow', name: 'Crossbow', tier: 'epic', icon: '🏹',
    damage: 130, pellets: 1, fireRate: 1.1, mag: 1, reload: 1.3, reserve: 24,
    spread: 0.0015, hipSpread: 0.018, auto: false, recoil: 0.025, kick: 0.6, zoomFov: 42, sound: 'crossbow', reloadStyle: 'mag', pierce: 2,
    hands: { grip: [0.005, -0.1, 0.14], fore: [-0.02, -0.07, -0.26] },
    ads: [0, -0.06, -0.3],
  },
  // special gear: admins only, or whoever an admin gives it to (shared/gear.js); never found on the map
  flamer: {
    id: 'flamer', name: 'Flamethrower', tier: 'legendary', icon: '🔥', special: true,
    damage: 9, pellets: 2, fireRate: 16, mag: 150, reload: 3, reserve: Infinity, range: 24, burn: true,
    spread: 0.07, auto: true, recoil: 0.002, kick: 0.08, zoomFov: 70, sound: 'flamer', reloadStyle: 'box', falloff: [12, 24],
    hands: { grip: [0.005, -0.12, 0.12], fore: [-0.02, -0.1, -0.3] },
    ads: [0, -0.07, -0.34],
  },
  bazooka: {
    id: 'bazooka', name: 'Bazooka', tier: 'legendary', icon: '🚀', special: true,
    damage: 320, pellets: 1, fireRate: 0.8, mag: 1, reload: 2, reserve: Infinity,
    spread: 0.002, auto: false, recoil: 0.08, kick: 1, zoomFov: 55, sound: 'launcher', reloadStyle: 'drum',
    projectile: { speed: 75, gravity: 1.5, radius: 6.5 },
    hands: { grip: [0.005, -0.12, 0.08], fore: [-0.02, -0.08, -0.32] },
    ads: [0, -0.08, -0.34],
  },
  // Halloween guns: only while Halloween is on (found around the maps, like the others). base: the gun whose model
  // and handling it borrows; finish/glow: its own colour and glow, whatever skin you wear.
  pumpkin: {
    id: 'pumpkin', base: 'launcher', halloween: true, name: 'Pumpkin Launcher', tier: 'legendary', icon: '🎃',
    damage: 200, pellets: 1, fireRate: 1.2, mag: 3, reload: 2.6, reserve: 18,
    spread: 0.004, auto: false, recoil: 0.06, kick: 1, zoomFov: 58, sound: 'launcher', reloadStyle: 'drum',
    projectile: { speed: 38, gravity: 10, radius: 5, pumpkin: true },
    finish: '#e8761a', glow: 0xff8a1a,
    hands: { grip: [0.005, -0.12, 0.1], fore: [-0.02, -0.09, -0.3] },
    ads: [0, -0.075, -0.36],
  },
  hexrifle: {
    id: 'hexrifle', base: 'rifle', halloween: true, name: 'Hex Rifle', tier: 'epic', icon: '🔮',
    damage: 32, pellets: 1, fireRate: 8, mag: 30, reload: 1.9, reserve: 240,
    spread: 0.006, auto: true, recoil: 0.011, kick: 0.5, zoomFov: 50, sound: 'rifle', reloadStyle: 'mag', sight: 'reddot', pierce: 2,
    finish: '#2a1640', glow: 0xb06bff,
    hands: { grip: [0.005, -0.1, 0.11], fore: [-0.02, -0.06, -0.38] },
    ads: [0, -0.052, -0.36],
  },
  boneshot: {
    id: 'boneshot', base: 'shotgun', halloween: true, name: 'Bone Breaker', tier: 'epic', icon: '💀',
    damage: 21, pellets: 9, fireRate: 1.5, mag: 8, reload: 0.42, reserve: 40,
    spread: 0.065, auto: false, recoil: 0.055, kick: 1, zoomFov: 62, sound: 'shotgun', reloadStyle: 'shells', falloff: [14, 44],
    finish: '#e4dcc4', glow: 0x7dff3a,
    hands: { grip: [0, -0.1, 0.12], fore: [-0.01, -0.07, -0.34] },
    ads: [0, -0.045, -0.36],
  },
  // ---- items (Fortnite-style): they go in the backpack like guns, and "firing" uses one (mag = how many uses)
  grapple: {
    id: 'grapple', utility: 'grapple', name: 'Grappler', tier: 'rare', icon: '🪝', desc: 'Shoot a hook at anything and get pulled to it',
    damage: 0, pellets: 1, fireRate: 1.6, mag: 10, reload: 0, reserve: 0, spread: 0, auto: false, recoil: 0.01, kick: 0.4, zoomFov: 70, sound: 'crossbow',
    hands: { grip: [0, -0.09, 0.06], fore: [-0.03, -0.12, 0.08] },
  },
  rift: {
    id: 'rift', utility: 'rift', name: 'Rift-To-Go', tier: 'epic', icon: '🌀', desc: 'Opens a rift: you pop out high in the sky and glide down',
    damage: 0, pellets: 1, fireRate: 1, mag: 1, reload: 0, reserve: 0, spread: 0, auto: false, recoil: 0, kick: 0.2, zoomFov: 75, sound: 'knife',
    hands: { grip: [0, -0.06, 0.04], fore: [-0.08, -0.1, 0.02] },
  },
  shockwave: {
    id: 'shockwave', utility: 'shockwave', name: 'Shockwave Grenade', tier: 'epic', icon: '💫', desc: 'Throw it: everything near the blast (you too) gets launched',
    damage: 0, pellets: 1, fireRate: 1.4, mag: 3, reload: 0, reserve: 0, spread: 0, auto: false, recoil: 0, kick: 0.3, zoomFov: 75, sound: 'knife',
    hands: { grip: [0, -0.06, 0.04], fore: [-0.08, -0.1, 0.02] },
  },
  launchpad: {
    id: 'launchpad', utility: 'launchpad', name: 'Launch Pad', tier: 'rare', icon: '🚀', desc: 'Put it down and step on it: up you go, then glide',
    damage: 0, pellets: 1, fireRate: 1, mag: 1, reload: 0, reserve: 0, spread: 0, auto: false, recoil: 0, kick: 0.2, zoomFov: 75, sound: 'knife',
    hands: { grip: [0, -0.06, 0.04], fore: [-0.08, -0.1, 0.02] },
  },
  medkit: {
    id: 'medkit', utility: 'medkit', name: 'Med Kit', tier: 'rare', icon: '🩹', desc: 'Heals you to full',
    damage: 0, pellets: 1, fireRate: 0.5, mag: 2, reload: 0, reserve: 0, spread: 0, auto: false, recoil: 0, kick: 0.2, zoomFov: 75, sound: 'knife',
    hands: { grip: [0, -0.06, 0.04], fore: [-0.08, -0.1, 0.02] },
  },
};
export const HALLOWEEN_GUNS = Object.keys(GUNS).filter((id) => GUNS[id].halloween);
// the items, and how often each turns up on the map (instead of a gun)
export const ITEM_DROPS = [['grapple', 3], ['medkit', 3], ['launchpad', 2], ['shockwave', 2], ['rift', 1]];
const ITEM_CHANCE = 0.25;

export const TIER_COLOR = { common: 0xcfc6b0, rare: 0x3d8bff, epic: 0xb04dff, legendary: 0xffb020 };
export const TIER_CSS = { common: '#cfc6b0', rare: 'var(--rare)', epic: 'var(--epic)', legendary: 'var(--legendary)' };

// Chances when a weapon spawns on the map.
export const GUN_DROP_TABLE = [
  { tier: 'legendary', chance: 0.1, guns: ['sniper', 'launcher'] },
  { tier: 'epic', chance: 0.3, guns: ['revolver', 'lmg', 'dmr', 'crossbow'] },
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
  // Halloween: now and then one of its guns instead
  if (isHalloween() && rand() < 0.22) return HALLOWEEN_GUNS[Math.floor(rand() * HALLOWEEN_GUNS.length)];
  // now and then an item (grappler, rift, launch pad...) instead
  if (rand() < ITEM_CHANCE) {
    let w = rand() * ITEM_DROPS.reduce((n, [, k]) => n + k, 0);
    for (const [id, k] of ITEM_DROPS) if ((w -= k) < 0) return id;
  }
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
// finish: hex colour for the metal parts; glow: a skin's glow colour; mutation: id from MUTATIONS (adds a glow).
export function buildGun(id, { finish = null, glow = null, mutation = null } = {}) {
  const def = GUNS[id];
  const out = buildGunBase(def?.base || id);
  finish = def?.finish || finish;
  glow = def?.glow ?? glow;
  if (finish || mutation || glow) {
    const mut = mutation ? MUTATIONS[mutation] : glow ? { color: typeof glow === 'string' ? parseInt(glow.slice(1), 16) : glow } : null;
    const swap = new Map();
    out.group.traverse((o) => {
      if (!o.isMesh || (o.material !== M.metal && o.material !== M.dark && !o.userData.finishable)) return;
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
      if (gunModels.rifle) {
        // the AK-style rifle, with the red dot on top
        modelGun(g, out, 'rifle');
        part(g, B(0.03, 0.02, 0.06), M.dark, 0, 0.06, 0.02);
        part(g, new THREE.CylinderGeometry(0.024, 0.024, 0.07, 12, 1, true), M.dark, 0, 0.1, 0.02, H);
        part(g, new THREE.RingGeometry(0.018, 0.024, 12), M.dark, 0, 0.1, -0.015);
        break;
      }
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
      if (gunModels.smg) {
        modelGun(g, out, 'smg');
        break;
      }
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
      if (gunModels.shotgun) {
        modelGun(g, out, 'shotgun');
        out.extra = part(g, C(0.018, 0.018, 0.07), M.shell, 0, -0.04, 0.0, H); // shell in hand during reload
        out.extra.visible = false;
        out.muzzleY = 0.025;
        break;
      }
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
      if (gunModels.revolver) {
        modelGun(g, out, 'revolver');
        break;
      }
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
      if (gunModels.lmg) {
        // the MK14, with the holographic sight on its top rail
        modelGun(g, out, 'lmg');
        holoSight(g, -0.08);
        break;
      }
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
      if (gunModels.dmr) {
        modelGun(g, out, 'dmr');
        break;
      }
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
      if (gunModels.sniper) {
        modelGun(g, out, 'sniper');
        break;
      }
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
      part(g, B(0.012, 0.045, 0.2), steel, 0, 0.01, -0.13).userData.finishable = true;
      part(g, B(0.01, 0.025, 0.05), steel, 0, 0.022, -0.25, 0.5).userData.finishable = true;
      part(g, B(0.05, 0.016, 0.02), M.dark, 0, 0, -0.025);
      part(g, B(0.03, 0.038, 0.11), M.dark, 0, -0.004, 0.035);
      part(g, B(0.032, 0.04, 0.012), M.metal, 0, -0.004, 0.095);
      out.muzzleZ = -0.25;
      out.muzzleY = 0.01;
      break;
    }
    case 'crossbow':
    case 'flamer':
    case 'bazooka': {
      if (gunModels[id]) {
        modelGun(g, out, id);
        break;
      }
      // until the model has loaded: a plain block version
      part(g, B(0.08, 0.1, 0.6), M.dark, 0, 0, -0.2);
      part(g, C(0.04, 0.04, 0.4, 10), M.metal, 0, 0.03, -0.6, H);
      part(g, B(0.05, 0.13, 0.06), M.dark, 0, -0.1, 0.1, -0.35);
      if (id === 'crossbow') part(g, B(0.7, 0.03, 0.04), M.wood, 0, 0.02, -0.55);
      out.muzzleZ = -0.82;
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
    // ---- the items
    case 'grapple': {
      // a chunky pistol with a hook sticking out of the barrel
      part(g, B(0.07, 0.1, 0.3), M.dark, 0, 0, -0.08);
      part(g, B(0.05, 0.13, 0.06), M.dark, 0, -0.1, 0.06, -0.3);
      part(g, C(0.035, 0.035, 0.14, 10), M.orange, 0, 0.0, -0.27, H);
      const hook = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.7 });
      part(g, B(0.015, 0.015, 0.1), hook, 0, 0, -0.38);
      part(g, B(0.015, 0.06, 0.015), hook, 0, 0.025, -0.43, 0.6);
      part(g, B(0.015, 0.06, 0.015), hook, 0, -0.025, -0.43, -0.6);
      out.muzzleZ = -0.45;
      break;
    }
    case 'rift': {
      // a swirling purple orb in a little frame
      const orb = new THREE.MeshStandardMaterial({ color: 0x8a3cff, emissive: 0x6a2aff, emissiveIntensity: 1.2, roughness: 0.2 });
      part(g, new THREE.SphereGeometry(0.08, 16, 12), orb, 0, 0, -0.15);
      part(g, new THREE.TorusGeometry(0.1, 0.012, 8, 20), M.metal, 0, 0, -0.15);
      part(g, new THREE.TorusGeometry(0.1, 0.012, 8, 20), M.metal, 0, 0, -0.15, 0, H);
      out.muzzleZ = -0.2;
      break;
    }
    case 'shockwave': {
      // a blue grenade with glowing bands
      const blue = new THREE.MeshStandardMaterial({ color: 0x2a6ad0, emissive: 0x3a8aff, emissiveIntensity: 0.6, roughness: 0.3 });
      part(g, new THREE.SphereGeometry(0.075, 16, 12), blue, 0, 0, -0.12);
      part(g, new THREE.TorusGeometry(0.076, 0.01, 8, 20), M.metal, 0, 0, -0.12, H);
      part(g, C(0.02, 0.02, 0.04, 8), M.metal, 0, 0.08, -0.12);
      out.muzzleZ = -0.2;
      break;
    }
    case 'launchpad': {
      // a folded pad with a yellow arrow
      part(g, B(0.3, 0.05, 0.3), M.dark, 0, 0, -0.15);
      part(g, B(0.26, 0.012, 0.26), M.orange, 0, 0.03, -0.15);
      part(g, B(0.06, 0.014, 0.14), M.metal, 0, 0.04, -0.12);
      part(g, new THREE.ConeGeometry(0.07, 0.08, 3), M.metal, 0, 0.04, -0.23, -H);
      out.muzzleZ = -0.3;
      break;
    }
    case 'medkit': {
      // a white case with a red cross
      const white = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 });
      const red = new THREE.MeshBasicMaterial({ color: 0xd42a1f });
      part(g, B(0.26, 0.16, 0.12), white, 0, 0, -0.15);
      part(g, B(0.16, 0.05, 0.005), red, 0, 0, -0.21);
      part(g, B(0.05, 0.12, 0.005), red, 0, 0, -0.211);
      part(g, B(0.1, 0.03, 0.02), M.dark, 0, 0.095, -0.15);
      out.muzzleZ = -0.22;
      break;
    }
    default:
      throw new Error(`unknown gun ${id}`);
  }
  return out;
}

const glove = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.85 });
const knuckle = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6450, roughness: 1 });
const cuff = new THREE.MeshStandardMaterial({ color: 0x4a5242, roughness: 1 });
const skin = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.8 });
// your arms match your character: skin tone and the colour of your top (bare forearms for the short-sleeved ones)
export function setArmLook(look) {
  if (!look) return;
  skin.color.set(look.skin);
  const bare = look.model === 'man' || look.model === 'adventurer'; // short sleeves
  sleeve.color.set(bare ? look.skin : look.topColor);
  cuff.color.set(bare ? look.skin : new THREE.Color(look.topColor).multiplyScalar(0.8));
}
const watch = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 });
const CAP = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);

// A gloved hand: palm, four fingers curled forward around what it holds (-z) and a thumb on top.
function glovedHand(parent, { fingersDown = true, side = 1 } = {}) {
  const hand = new THREE.Group();
  parent.add(hand);
  part(hand, new THREE.BoxGeometry(0.075, 0.085, 0.07), glove, 0, 0, 0); // palm and back of the hand
  part(hand, new THREE.BoxGeometry(0.078, 0.02, 0.05), knuckle, 0, 0.042, -0.005); // knuckle pad
  for (let i = 0; i < 4; i++) {
    // fingers wrap the grip: forward, then curl back underneath
    const y = fingersDown ? 0.03 - i * 0.022 : 0;
    const x = fingersDown ? 0 : -0.03 + i * 0.02;
    const f = part(hand, CAP(0.011, 0.035), glove, x - side * 0.012, y, -0.05, Math.PI / 2, 0, 0);
    f.scale.set(1, 1, 0.9);
    part(hand, CAP(0.01, 0.02), glove, x - side * 0.024, y - (fingersDown ? 0.004 : 0.018), -0.075, fingersDown ? 0 : 0.3, 0, side * 1.2);
  }
  part(hand, CAP(0.012, 0.04), glove, side * 0.035, 0.03, -0.035, 1.2, 0, side * -0.4); // thumb
  return hand;
}
// A forearm from the wrist back towards the camera: glove cuff, a bit of wrist, then the rolled-up sleeve.
function forearm(parent, rx, ry, withWatch = false) {
  const arm = new THREE.Group();
  arm.rotation.set(rx, ry, 0);
  parent.add(arm);
  part(arm, new THREE.CylinderGeometry(0.036, 0.04, 0.05, 12), glove, 0, 0, 0.04, Math.PI / 2); // glove cuff
  part(arm, new THREE.CylinderGeometry(0.035, 0.037, 0.06, 12), skin, 0, 0, 0.09, Math.PI / 2); // wrist
  if (withWatch) part(arm, new THREE.CylinderGeometry(0.038, 0.038, 0.022, 12), watch, 0, 0, 0.085, Math.PI / 2);
  part(arm, new THREE.TorusGeometry(0.047, 0.014, 6, 14), cuff, 0, 0, 0.125); // rolled sleeve edge
  part(arm, CAP(0.05, 0.26), sleeve, 0, 0, 0.27, Math.PI / 2); // sleeve
  return arm;
}

// Hands and forearms holding a gun. Each hand is a group so reload animations can move it.
export function buildHands(def) {
  const right = new THREE.Group();
  const [gx, gy, gz] = def.hands.grip;
  right.position.set(gx, gy, gz);
  const rh = glovedHand(right, { fingersDown: true, side: 1 });
  rh.rotation.x = -0.3;
  forearm(right, 0.4, 0.2, true).position.set(0.01, -0.025, 0.02);
  const left = new THREE.Group();
  const [fx, fy, fz] = def.hands.fore;
  left.position.set(fx, fy, fz);
  // the support hand cups the handguard from underneath, fingers up the far side
  const lh = glovedHand(left, { fingersDown: false, side: -1 });
  lh.rotation.z = 0.25;
  forearm(left, 0.3, -0.6).position.set(-0.02, -0.03, 0.02);
  return { right, left, leftRest: left.position.clone() };
}
