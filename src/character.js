import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFAULT_LOOK, MODEL_COLORS, cleanLook } from '../shared/cosmetics.js';

// ---- the owner's 3D characters (public/models): rigged and animated, recoloured by the look.
// slots: which of the look's colours each material takes (by material name, or `mesh/material`).
// gear: meshes that come off when headwear/gear is 'none'. clips: animation names for idle, run and death.
const CHARACTER_MODELS = {
  man: {
    url: '/models/Man by Quaternius - HMnuH5geEG.glb',
    slots: { Skin: 'skin', Hair: 'hairColor', Shirt: 'topColor', Pants: 'pants', Socks: 'hatColor' },
    clips: { idle: 'Man_Idle', run: 'Man_Run', walk: 'Man_Walk', die: 'Man_Death' },
  },
  adventurer: {
    url: '/models/Adventurer by Quaternius - 5EGWBMpuXq.glb',
    slots: { Skin: 'skin', Hair: 'hairColor', Eyebrows: 'hairColor', 'Body/Green': 'topColor', 'Body/LightGreen': 'topColor', 'Legs/Brown2': 'pants', 'Legs/Brown': 'pants', 'Backpack/*': 'hatColor' },
    gear: ['Backpack'],
    clips: { idle: 'Idle_Gun', run: 'Run_Shoot', walk: 'Walk', die: 'Death' },
  },
  swat: {
    url: '/models/SWAT by Quaternius - Btfn3G5Xv4.glb',
    slots: { Skin: 'skin', 'Body/Swat': 'topColor', 'Head/Swat': 'topColor', 'Legs/Swat': 'pants', Swat_Black: 'hatColor' },
    clips: { idle: 'Idle_Gun', run: 'Run_Shoot', walk: 'Walk', die: 'Death' },
  },
  king: {
    url: '/models/King by Quaternius - I1gTjmuK2m.glb',
    slots: { Skin: 'skin', Hair_White: 'hairColor', Blue: 'topColor', DarkBrown: 'pants', Metal: 'hatColor', Metal_Dark: 'hatColor' },
    gear: ['King_Head_4'], // the crown
    clips: { idle: 'Idle_Gun', run: 'Run_Shoot', walk: 'Walk', die: 'Death' },
  },
};
const HEIGHT = 1.8;
const templates = {};
const loading = {};
// Loads one character (only when someone needs it: they're a few MB each).
export function loadCharacterModel(id) {
  const def = CHARACTER_MODELS[id];
  if (!def) return Promise.resolve(false);
  if (!loading[id])
    loading[id] = new Promise((resolve) =>
      new GLTFLoader().load(
        encodeURI(def.url),
        (gltf) => {
          const scene = gltf.scene;
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene, true);
          const clips = {};
          for (const c of gltf.animations) clips[c.name.replace(/^.*\|/, '')] = c;
          scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.frustumCulled = false;
            }
          });
          templates[id] = { def, scene, clips, scale: HEIGHT / (box.max.y - box.min.y || 1) };
          resolve(true);
        },
        undefined,
        () => resolve(false),
      ),
    );
  return loading[id];
}
export const characterModelReady = (id) => !!templates[id];

const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11 || 0.01;
// A copy of a 3D character in the look's colours, with its animations. Faces +z, feet at 0.
// Returns null if that character hasn't loaded yet.
export function buildModelCharacter(lookIn) {
  const look = cleanLook(lookIn);
  const t = templates[look.model];
  if (!t) return null;
  const { def } = t;
  const model = cloneSkinned(t.scene);
  model.scale.setScalar(t.scale);
  const root = new THREE.Group();
  root.add(model);
  const mats = [];
  const base = MODEL_COLORS[look.model];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const part = (def.gear || []).find((g) => o.name.startsWith(g));
    if (part && look.hat === 'none') o.visible = false;
    o.material = [].concat(o.material).map((m0) => {
      const m = m0.clone();
      m.metalness = Math.min(m.metalness ?? 0, 0.2);
      mats.push(m);
      const meshKind = ['Body', 'Legs', 'Head', 'Feet', 'Backpack'].find((k) => o.name.includes(k)) || '';
      const slot = def.slots[`${meshKind}/${m.name}`] || def.slots[`${meshKind}/*`] || def.slots[m.name];
      if (slot) {
        // keep each material's shade relative to the character's own colour for that slot
        const want = new THREE.Color(look[slot]);
        const ratio = lum(m0.color) / lum(new THREE.Color(base[slot]));
        m.color.copy(want).multiplyScalar(Math.min(1.6, ratio));
      }
      return m;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, name] of Object.entries(def.clips)) if (t.clips[name]) actions[k] = mixer.clipAction(t.clips[name]);
  if (actions.die) {
    actions.die.setLoop(THREE.LoopOnce, 1);
    actions.die.clampWhenFinished = true;
  }
  let hand = null;
  model.traverse((o) => {
    if (!hand && o.isBone && /^(WristR|PalmR)$/.test(o.name)) hand = o;
  });
  let playing = null;
  const play = (k, fade = 0.2) => {
    const a = actions[k] || actions.idle;
    if (!a || a === playing) return;
    a.reset().play();
    if (playing) playing.crossFadeTo(a, fade, false);
    playing = a;
  };
  play('idle', 0);
  return { root, model, mixer, actions, play, mats, hand, look };
}


// A player's character, built from their look (shared/cosmetics.js): skin, hair, facial hair, headwear,
// top and trousers. Used for other players online and the preview in your Locker.
// Faces +z. `vest`: a team colour plate over the chest (team modes), or null.
// `part(mesh, kind)` is called for every mesh so the caller can make it shootable.
export function buildCharacter(lookIn, { vest = null, part: onPart = null } = {}) {
  const look = cleanLook(lookIn || DEFAULT_LOOK);
  const mats = [];
  const mat = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
    mats.push(m);
    return m;
  };
  const skin = mat(look.skin);
  const top = mat(look.topColor);
  const pants = mat(look.pants);
  const hair = mat(look.hairColor);
  const hat = mat(look.hatColor, { roughness: 0.75 });
  const dark = mat(0x1e1c1a);
  const boot = mat(0x2a2620);
  const stubble = mat(new THREE.Color(look.hairColor).lerp(new THREE.Color(look.skin), 0.55));
  const add = (parent, w, h, d, m, x, y, z, kind = 'body', rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    onPart?.(mesh, kind);
    return mesh;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // legs: trousers and boots
  const legs = [-0.13, 0.13].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.9, 0);
    body.add(leg);
    add(leg, 0.22, 0.78, 0.24, pants, 0, -0.39, 0);
    add(leg, 0.24, 0.14, 0.3, boot, 0, -0.83, 0.03);
    return leg;
  });
  const upper = new THREE.Group();
  upper.position.y = 0.9;
  body.add(upper);
  // torso
  if (look.top === 'tank') {
    add(upper, 0.48, 0.7, 0.3, top, 0, 0.35, 0);
    for (const s of [-1, 1]) add(upper, 0.05, 0.08, 0.31, skin, s * 0.25, 0.62, 0); // bare shoulders
  } else add(upper, 0.54, 0.7, 0.32, top, 0, 0.35, 0);
  add(upper, 0.55, 0.06, 0.33, dark, 0, 0.03, 0); // belt
  add(upper, 0.07, 0.05, 0.02, mat(0xb0a070, { metalness: 0.6, roughness: 0.4 }), 0, 0.03, 0.17); // buckle
  if (look.top === 'jacket') {
    add(upper, 0.3, 0.07, 0.34, top, 0, 0.71, 0); // collar
    add(upper, 0.02, 0.6, 0.01, dark, 0, 0.36, 0.165); // zip
  } else if (look.top === 'hoodie') {
    add(upper, 0.36, 0.22, 0.12, top, 0, 0.78, -0.16); // hood down the back
    add(upper, 0.3, 0.14, 0.02, top, 0, 0.18, 0.17); // front pocket
    for (const s of [-1, 1]) add(upper, 0.015, 0.14, 0.015, mat(0xe8e8e8), s * 0.05, 0.6, 0.17); // strings
  } else if (look.top === 'tshirt') {
    add(upper, 0.22, 0.03, 0.02, top, 0, 0.69, 0.16); // neckline
  }
  if (vest) {
    add(upper, 0.58, 0.42, 0.36, mat(vest), 0, 0.42, 0);
    add(upper, 0.12, 0.08, 0.02, dark, -0.12, 0.38, 0.185); // pouches
    add(upper, 0.12, 0.08, 0.02, dark, 0.12, 0.38, 0.185);
  }
  // head
  const head = new THREE.Group();
  head.position.y = 0.88;
  upper.add(head);
  add(upper, 0.14, 0.1, 0.14, skin, 0, 0.74, 0, 'head'); // neck
  add(head, 0.32, 0.34, 0.32, skin, 0, 0, 0, 'head');
  for (const s of [-1, 1]) add(head, 0.06, 0.035, 0.01, dark, s * 0.075, 0.03, 0.162, 'head'); // eyes
  add(head, 0.05, 0.06, 0.04, skin, 0, -0.03, 0.17, 'head'); // nose
  const hatOn = look.hat !== 'none';
  // hair (a hat covers the top, the rest still shows)
  switch (look.hair) {
    case 'short':
      if (!hatOn) add(head, 0.34, 0.07, 0.34, hair, 0, 0.18, 0, 'head');
      add(head, 0.34, 0.2, 0.05, hair, 0, 0.08, -0.155, 'head');
      for (const s of [-1, 1]) add(head, 0.03, 0.12, 0.2, hair, s * 0.165, 0.1, -0.05, 'head');
      break;
    case 'buzz':
      if (!hatOn) add(head, 0.33, 0.025, 0.33, hair, 0, 0.17, 0, 'head');
      add(head, 0.33, 0.14, 0.02, hair, 0, 0.1, -0.162, 'head');
      break;
    case 'mohawk':
      if (!hatOn) add(head, 0.06, 0.13, 0.32, hair, 0, 0.23, 0, 'head');
      else add(head, 0.06, 0.12, 0.08, hair, 0, 0.08, -0.17, 'head');
      break;
    case 'long':
      if (!hatOn) add(head, 0.34, 0.07, 0.34, hair, 0, 0.18, 0, 'head');
      add(head, 0.35, 0.42, 0.07, hair, 0, -0.03, -0.165, 'head');
      for (const s of [-1, 1]) add(head, 0.04, 0.32, 0.22, hair, s * 0.17, 0.0, -0.06, 'head');
      break;
    case 'spiky':
      if (!hatOn)
        for (const [x, z] of [[-0.09, -0.08], [0.09, -0.08], [0, 0], [-0.09, 0.08], [0.09, 0.08], [0, -0.12]]) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), hair);
          c.position.set(x, 0.22, z);
          head.add(c);
          onPart?.(c, 'head');
        }
      add(head, 0.33, 0.16, 0.03, hair, 0, 0.09, -0.16, 'head');
      break;
  }
  // facial hair
  if (look.face === 'stubble') add(head, 0.3, 0.12, 0.012, stubble, 0, -0.1, 0.162, 'head');
  if (look.face === 'beard') {
    add(head, 0.32, 0.14, 0.06, hair, 0, -0.12, 0.15, 'head');
    add(head, 0.16, 0.03, 0.02, hair, 0, -0.05, 0.17, 'head');
  }
  if (look.face === 'moustache') add(head, 0.17, 0.035, 0.025, hair, 0, -0.06, 0.172, 'head');
  // headwear
  switch (look.hat) {
    case 'helmet':
      add(head, 0.38, 0.14, 0.38, hat, 0, 0.17, 0, 'head');
      add(head, 0.4, 0.03, 0.4, hat, 0, 0.11, 0, 'head');
      break;
    case 'cap':
      add(head, 0.35, 0.09, 0.35, hat, 0, 0.2, 0, 'head');
      add(head, 0.3, 0.02, 0.15, hat, 0, 0.16, 0.22, 'head');
      break;
    case 'beanie': {
      add(head, 0.35, 0.16, 0.35, hat, 0, 0.21, 0, 'head');
      add(head, 0.36, 0.05, 0.36, hat, 0, 0.13, 0, 'head');
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xeeeeee));
      pom.position.y = 0.32;
      head.add(pom);
      onPart?.(pom, 'head');
      break;
    }
    case 'bandana':
      add(head, 0.34, 0.07, 0.34, hat, 0, 0.15, 0, 'head');
      add(head, 0.08, 0.06, 0.06, hat, 0, 0.12, -0.19, 'head'); // knot
      break;
    case 'beret':
      add(head, 0.37, 0.05, 0.37, hat, 0.02, 0.19, 0, 'head', 0, 0, -0.15);
      break;
  }
  // arms reach forward to hold the gun: sleeve, then sleeve or skin, then a hand
  const arm = (x, rx, ry) => {
    const g = new THREE.Group();
    g.position.set(x, 0.62, 0);
    g.rotation.set(rx, ry, 0);
    upper.add(g);
    const upperM = look.top === 'tank' ? skin : top;
    const lowerM = look.top === 'tank' || look.top === 'tshirt' ? skin : top;
    add(g, 0.15, 0.3, 0.15, upperM, 0, -0.15, 0);
    add(g, 0.14, 0.26, 0.14, lowerM, 0, -0.43, 0);
    if (look.top === 'jacket' || look.top === 'hoodie') add(g, 0.15, 0.04, 0.15, dark, 0, -0.55, 0); // cuff
    add(g, 0.12, 0.1, 0.12, skin, 0, -0.61, 0); // hand
    return g;
  };
  const armR = arm(0.32, -1.2, 0);
  const armL = arm(-0.32, -1.35, 0.5);
  return { root, body, upper, head, legs, armR, armL, mats, look };
}

// A small spinning preview of a look, drawn into `canvas` (the Locker's Character section).
export class CharacterPreview {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth || 220, canvas.clientHeight || 300, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3020, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 220) / (canvas.clientHeight || 300), 0.1, 20);
    this.camera.position.set(0, 1.25, 4.3);
    this.camera.lookAt(0, 0.95, 0);
    this.spin = 0.5;
    this.char = null;
    this.alive = true;
    const loop = () => {
      if (!this.alive) return;
      if (!canvas.isConnected) return this.dispose();
      this.spin += 0.012;
      if (this.char) this.char.root.rotation.y = this.spin;
      this.char?.mixer?.update(1 / 60);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  show(look) {
    this.look = look;
    const model = look?.model && look.model !== 'blocky';
    if (model && !characterModelReady(look.model)) {
      // load it, then show it (if it's still the one picked)
      loadCharacterModel(look.model).then(() => this.look === look && characterModelReady(look.model) && this.show(look));
    }
    if (this.char) {
      this.scene.remove(this.char.root);
      for (const m of this.char.mats) m.dispose();
    }
    if (model && characterModelReady(look.model)) {
      this.char = buildModelCharacter(look);
      this.char.play('idle', 0);
      this.scene.add(this.char.root);
      return;
    }
    if (model) {
      this.char = null; // shown once it has loaded
      return;
    }
    this.char = buildCharacter(look);
    // arms down by its sides for the preview
    this.char.armR.rotation.set(0, 0, 0.12);
    this.char.armL.rotation.set(0, 0, -0.12);
    this.char.armR.position.x = 0.35;
    this.char.armL.position.x = -0.35;
    this.scene.add(this.char.root);
  }

  dispose() {
    this.alive = false;
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
