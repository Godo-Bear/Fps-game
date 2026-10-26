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
    clips: { idle: 'Man_Idle', run: 'Man_Run', walk: 'Man_Walk', die: 'Man_Death' }, // no strafing clips: the run does
  },
  adventurer: {
    url: '/models/Adventurer by Quaternius - 5EGWBMpuXq.glb',
    slots: { Skin: 'skin', Hair: 'hairColor', Eyebrows: 'hairColor', 'Body/Green': 'topColor', 'Body/LightGreen': 'topColor', 'Legs/Brown2': 'pants', 'Legs/Brown': 'pants', 'Backpack/*': 'hatColor' },
    gear: ['Backpack'],
    clips: { idle: 'Idle_Gun', run: 'Run', back: 'Run_Back', left: 'Run_Left', right: 'Run_Right', walk: 'Walk', die: 'Death' },
  },
  swat: {
    url: '/models/SWAT by Quaternius - Btfn3G5Xv4.glb',
    slots: { Skin: 'skin', 'Body/Swat': 'topColor', 'Head/Swat': 'topColor', 'Legs/Swat': 'pants', Swat_Black: 'hatColor' },
    clips: { idle: 'Idle_Gun', run: 'Run', back: 'Run_Back', left: 'Run_Left', right: 'Run_Right', walk: 'Walk', die: 'Death' },
  },
  king: {
    url: '/models/King by Quaternius - I1gTjmuK2m.glb',
    slots: { Skin: 'skin', Hair_White: 'hairColor', Blue: 'topColor', DarkBrown: 'pants', Metal: 'hatColor', Metal_Dark: 'hatColor' },
    gear: ['King_Head_4'], // the crown
    clips: { idle: 'Idle_Gun', run: 'Run', back: 'Run_Back', left: 'Run_Left', right: 'Run_Right', walk: 'Walk', die: 'Death' },
  },
  // the Survivor in a football kit (#7) and a cricket kit (#18, bat on the back): $10 each in the Shop (PAID_CHARS)
  footballer: {
    url: '/models/Man by Quaternius - HMnuH5geEG.glb',
    colorsOf: 'man', // (its materials are the Survivor's: recoloured from those)
    slots: { Skin: 'skin', Hair: 'hairColor', Shirt: 'topColor', Pants: 'pants', Socks: 'hatColor' },
    clips: { idle: 'Man_Idle', run: 'Man_Run', walk: 'Man_Walk', die: 'Man_Death' },
    // paint: bands by height up the body (0 feet, 1 head) on each material; legs: only near the middle (not the hands)
    kit: {
      // like the home shirt: long red sleeves, a dark V-neck, the 7 on the front too, a dark captain's armband
      number: '7', color: '#ffffff', edge: '#7a0010', frontNumber: true, armband: '#1a1a1e', badge: 'portugal',
      paint: {
        Shirt: [{ from: 0.825, to: 0.86, color: '#4a4248' }],
        Pants: [{ hem: 0.025, color: '#ffffff' }],
        Skin: [
          { from: 0.6, to: 0.95, color: '#b0102a', xmin: 0.1, xmax: 0.385 }, // long sleeves, out to the wrists (hands stay bare)
          { below: 0.29, color: '#b0102a', legs: true }, // long socks, green tops
          { from: 0.255, to: 0.29, color: '#046a38', legs: true },
        ],
      },
    },
  },
  cricketer: {
    url: '/models/Man by Quaternius - HMnuH5geEG.glb',
    colorsOf: 'man',
    slots: { Skin: 'skin', Hair: 'hairColor', Shirt: 'topColor', Pants: 'pants', Socks: 'hatColor' },
    clips: { idle: 'Man_Idle', run: 'Man_Run', walk: 'Man_Walk', die: 'Man_Death' },
    // like the one-day kit: bright blue, INDIA across the chest in orange, darker trousers, a full beard. The batting
    // gear is the player's choice (Locker): pads, gloves, helmet, bat (look.cpads / cgloves / chelmet / cbat)
    kit: (look) => ({
      number: '18', color: '#ff8a1a', edge: '#0b1f4a', bat: look.cbat !== 'off', helmet: look.chelmet === 'on', badge: 'india', chestText: 'INDIA',
      paint: {
        Shirt: [{ from: 0.825, to: 0.86, color: '#14306e' }],
        Skin: [
          { below: 0.47, color: '#1d4fb8', legs: true }, // long cricket trousers
          ...(look.cpads !== 'off' ? [{ below: 0.3, color: '#f2f2f2', legs: true }] : []), // batting pads
          ...(look.cgloves !== 'off' ? [{ from: 0.6, to: 0.95, color: '#f4f4f4', xmin: 0.385, xmax: 1 }] : []), // batting gloves (the hands)
          { beard: true, color: '#241812' }, // a full beard: jaw, sideburns, moustache, under the chin
        ],
      },
    }),
  },
  // admins only (ADMIN_CHARS)
  astronaut: {
    url: '/models/Astronaut by Quaternius - 3hC2i0CTuO.glb',
    slots: { Grey: 'skin', SciFi_Light_Accent: 'hairColor', SciFi_Main: 'topColor', SciFi_MainDark: 'pants', SciFi_Light: 'hatColor' },
    clips: { idle: 'Idle_Gun', run: 'Run', back: 'Run_Back', left: 'Run_Left', right: 'Run_Right', walk: 'Walk', die: 'Death' },
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
        () => {
          delete loading[id]; // a failed download is tried again next time
          resolve(false);
        },
      ),
    );
  return loading[id];
}
// all of them (the Locker loads them up front so switching is instant)
export const loadAllCharacterModels = () => Promise.all(Object.keys(CHARACTER_MODELS).map(loadCharacterModel));
export const characterModelReady = (id) => !!templates[id];

// The kit extras: the shirt number on the back, a captain's armband, a cricket bat across the back. Fitted while the
// character stands in its first pose, then stuck to the bones so they move with it.
const kitParts = {};
function numberTexture(text, color, edge) {
  const key = `${text}|${color}|${edge}`;
  if (kitParts[key]) return kitParts[key];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 92px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = edge;
  g.strokeText(text, 64, 68);
  g.fillStyle = color;
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  kitParts[key] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return kitParts[key];
}
// a word across the chest (INDIA)
function textMaterial(text, color, edge) {
  const key = `txt|${text}|${color}`;
  if (kitParts[key]) return kitParts[key];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 76;
  const g = c.getContext('2d');
  g.font = 'italic 900 58px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = edge;
  g.strokeText(text, 128, 40);
  g.fillStyle = color;
  g.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  kitParts[key] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return kitParts[key];
}
// The chest badges: our own crests (not the real federations' ones) in each team's colours.
function badgeMaterial(kind) {
  if (kitParts[kind]) return kitParts[kind];
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 150;
  const g = c.getContext('2d');
  const shield = (fill, edge) => {
    g.beginPath();
    g.moveTo(10, 8);
    g.lineTo(118, 8);
    g.lineTo(118, 78);
    g.quadraticCurveTo(118, 128, 64, 144);
    g.quadraticCurveTo(10, 128, 10, 78);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = edge;
    g.stroke();
  };
  const star = (x, y, r, fill) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  if (kind === 'portugal') {
    shield('#c8102e', '#d4a72c');
    g.fillStyle = '#046a38';
    g.fillRect(14, 12, 40, 66);
    g.beginPath();
    g.arc(64, 74, 26, 0, Math.PI * 2);
    g.fillStyle = '#d4a72c';
    g.fill();
    star(64, 74, 16, '#c8102e');
  } else if (kind === 'india') {
    shield('#0b1f4a', '#ff8a1a');
    star(38, 46, 13, '#ffd34d');
    star(64, 38, 13, '#ffd34d');
    star(90, 46, 13, '#ffd34d');
    g.beginPath();
    g.arc(64, 92, 22, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#d42a1f';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 92, 16, -0.9, 0.9);
    g.stroke();
  } else {
    // the maker mark: a little swoosh-free chevron in gold or white
    g.clearRect(0, 0, 128, 150);
    g.strokeStyle = kind.startsWith('india') ? '#ffffff' : '#d4a72c';
    g.lineWidth = 18;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(20, 60);
    g.lineTo(64, 100);
    g.lineTo(108, 60);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  kitParts[kind] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return kitParts[kind];
}
function addKit(model, kit) {
  model.updateMatrixWorld(true);
  let torso = null;
  let armL = null;
  model.traverse((o) => {
    if (!o.isBone) return;
    if (o.name === 'Torso') torso = o;
    if (o.name === 'UpperArmL') armL = o;
  });
  if (!torso) return;
  // where the back of the shirt is: a ray from behind at chest height (or a guess if it misses)
  const tp = new THREE.Vector3().setFromMatrixPosition(torso.matrixWorld);
  const chestY = tp.y + 0.06;
  const ray = new THREE.Raycaster(new THREE.Vector3(tp.x, chestY, tp.z - 3), new THREE.Vector3(0, 0, 1), 0, 6);
  const hit = ray.intersectObject(model, true).find((h) => h.object.isMesh);
  const backZ = hit ? hit.point.z : tp.z - 0.16;
  // the number, just off the back, facing backwards
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), numberTexture(kit.number, kit.color, kit.edge));
  num.position.set(tp.x, chestY, backZ - 0.012);
  num.rotation.y = Math.PI;
  num.renderOrder = 2;
  torso.attach(num);
  if (kit.badge) {
    // the crest on the left of the chest (our own design), and a small maker mark on the right
    const front = new THREE.Raycaster(new THREE.Vector3(tp.x + 0.07, chestY + 0.07, tp.z + 3), new THREE.Vector3(0, 0, -1), 0, 6).intersectObject(model, true).find((h) => h.object.isMesh);
    const fz = front ? front.point.z : tp.z + 0.14;
    const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.1), badgeMaterial(kit.badge));
    crest.position.set(tp.x + 0.07, chestY + 0.07, fz + 0.01);
    crest.renderOrder = 2;
    torso.attach(crest);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), badgeMaterial(`${kit.badge}-mark`));
    mark.position.set(tp.x - 0.07, chestY + 0.075, fz + 0.01);
    mark.renderOrder = 2;
    torso.attach(mark);
    if (kit.frontNumber) {
      const n2 = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), numberTexture(kit.number, kit.color, kit.edge));
      n2.position.set(tp.x - 0.01, chestY - 0.03, fz + 0.012);
      n2.renderOrder = 2;
      torso.attach(n2);
    }
    if (kit.chestText) {
      const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), textMaterial(kit.chestText, kit.color, kit.edge));
      txt.position.set(tp.x, chestY - 0.005, fz + 0.012);
      txt.renderOrder = 2;
      torso.attach(txt);
    }
  }
  if (kit.helmet) {
    // a navy batting helmet with a grille, on the head bone
    let head = null;
    model.traverse((o) => o.isBone && o.name === 'Head' && (head = o));
    if (head) {
      const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      const top = new THREE.Box3().setFromObject(model, true).max.y;
      const r = (top - hp.y) * 0.62;
      const helmet = new THREE.Group();
      const navy = new THREE.MeshStandardMaterial({ color: 0x14306e, roughness: 0.4 });
      const steel = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.3, metalness: 0.6 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), navy);
      helmet.add(dome);
      const peak = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.08, r * 0.5), navy);
      peak.position.set(0, r * 0.05, r * 0.95);
      helmet.add(peak);
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, r * 0.05, r * 0.05), steel);
        bar.position.set(0, -r * (0.25 + i * 0.28), r * 1.02);
        helmet.add(bar);
      }
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(r * 0.05, r * 0.85, r * 0.05), steel);
        side.position.set(sx * r * 0.68, -r * 0.5, r * 0.85);
        helmet.add(side);
      }
      helmet.position.set(hp.x, hp.y + (top - hp.y) * 0.42, hp.z);
      head.attach(helmet);
    }
  }
  if (kit.armband && armL) {
    // round the top of the left arm, whichever way the arm points in this pose
    let lower = null;
    armL.traverse((o) => o !== armL && o.isBone && !lower && (lower = o));
    const ap = new THREE.Vector3().setFromMatrixPosition(armL.matrixWorld);
    const dir = lower ? new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld).sub(ap) : new THREE.Vector3(0, -1, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.055, 12, 1, true), new THREE.MeshBasicMaterial({ color: typeof kit.armband === 'string' ? kit.armband : 0xffd34d, side: THREE.DoubleSide }));
    band.position.copy(ap).addScaledVector(dir, 0.4);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    armL.attach(band);
  }
  if (kit.bat) {
    // a cricket bat slung across the back, handle up by the right shoulder
    const bat = new THREE.Group();
    const willow = new THREE.MeshStandardMaterial({ color: 0xe6c88c, roughness: 0.7 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.035), willow);
    blade.position.y = -0.14;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), grip);
    handle.position.y = 0.27;
    bat.add(blade, handle);
    // on the right side of the back, so the number shows
    bat.position.set(tp.x - 0.15, tp.y - 0.02, backZ - 0.05);
    bat.rotation.z = -0.22;
    torso.attach(bat);
  }
}

// Paints stripes, collars, socks and trousers onto a material by height up the body (the model stands along z).
function paintBands(mat, geo, bands, span) {
  const h = span.max - span.min || 1;
  const at = (f) => span.min + f * h;
  const list = bands.map((b) => {
    const lo = b.hem !== undefined ? -1e9 : b.below !== undefined ? -1e9 : at(b.from);
    const hi = b.hem !== undefined ? geo.boundingBox.min.z + b.hem * h : b.below !== undefined ? at(b.below) : at(b.to);
    // legs: only near the middle (not the hands); arms: only out to the sides (the sleeves, not the chest);
    // face: only the front half of the head at that height (the beard)
    let face = 1e9;
    if (b.face) {
      const pos = geo.attributes.position;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z < lo || z > hi || Math.abs(pos.getX(i)) > span.half * 0.1) continue;
        y0 = Math.min(y0, pos.getY(i));
        y1 = Math.max(y1, pos.getY(i));
      }
      if (y0 < y1) face = y0 + (y1 - y0) * 0.38;
    }
    if (b.beard) {
      // the head: the skin above the neck (its middle and size), so the beard is shaped round it
      const pos = geo.attributes.position;
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.z > at(0.865) && Math.abs(v.x) < span.half * 0.12) box.expandByPoint(v);
      }
      const c = box.getCenter(new THREE.Vector3());
      return { beard: true, c, r: (box.max.z - box.min.z) / 2 || 1, lo: 0, hi: 0, face: 0, legs: 0, arms: 0, color: new THREE.Color(b.color) };
    }
    // xmin/xmax: how far out from the middle (fractions of the T-pose width, so along the arms)
    const legs = b.xmax !== undefined ? span.half * b.xmax : b.legs ? span.half * 0.18 : 1e9;
    const arms = b.xmin !== undefined ? span.half * b.xmin : b.arms ? span.half * 0.24 : -1;
    return { lo, hi, face, legs, arms, color: new THREE.Color(b.color) };
  });
  mat.onBeforeCompile = (sh) => {
    let uni = '';
    let paint = '';
    list.forEach((b, i) => {
      if (b.beard) {
        sh.uniforms[`uKitB${i}`] = { value: b.c };
        sh.uniforms[`uKitR${i}`] = { value: b.r };
        sh.uniforms[`uKitC${i}`] = { value: b.color };
        uni += `uniform vec3 uKitB${i}; uniform float uKitR${i}; uniform vec3 uKitC${i};\n`;
        // front of the face is -y. The top edge is low in the middle (the moustache, under the nose) and climbs to the
        // ears at the sides (sideburns); it wraps under the chin; the mouth stays clear; a little stubbly variation
        paint += `{ vec3 d = vKitPos - uKitB${i}; float R = uKitR${i}; float ax = abs(d.x);
          float top = -0.36 * R + 0.26 * R * smoothstep(0.3 * R, 0.78 * R, ax);
          bool beard = d.y < 0.22 * R && d.z < top && d.z > -1.3 * R;
          bool mouth = ax < 0.2 * R && d.z < -0.5 * R && d.z > -0.64 * R && d.y < -0.4 * R;
          if (beard && !mouth) {
            float n = fract(sin(dot(floor(vKitPos / (R * 0.09)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            diffuseColor.rgb = uKitC${i} * (0.75 + 0.5 * n);
          } }\n`;
        return;
      }
      sh.uniforms[`uKitLo${i}`] = { value: b.lo };
      sh.uniforms[`uKitHi${i}`] = { value: b.hi };
      sh.uniforms[`uKitW${i}`] = { value: b.legs };
      sh.uniforms[`uKitA${i}`] = { value: b.arms };
      sh.uniforms[`uKitF${i}`] = { value: b.face };
      sh.uniforms[`uKitC${i}`] = { value: b.color };
      uni += `uniform float uKitLo${i}; uniform float uKitHi${i}; uniform float uKitW${i}; uniform float uKitA${i}; uniform float uKitF${i}; uniform vec3 uKitC${i};\n`;
      paint += `if (vKitPos.z > uKitLo${i} && vKitPos.z < uKitHi${i} && abs(vKitPos.x) < uKitW${i} && abs(vKitPos.x) > uKitA${i} && vKitPos.y < uKitF${i}) diffuseColor.rgb = uKitC${i};\n`;
    });
    sh.vertexShader = 'varying vec3 vKitPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitPos = position;');
    sh.fragmentShader = 'varying vec3 vKitPos;\n' + uni + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + paint);
  };
  mat.customProgramCacheKey = () => `kit:${list.map((b) => b.beard ? `beard${b.color.getHexString()}` : `${b.lo.toFixed(4)},${b.hi.toFixed(4)},${b.legs.toFixed(4)},${b.arms.toFixed(4)},${b.face.toFixed(5)},${b.color.getHexString()}`).join('|')}`;
}

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
  const base = MODEL_COLORS[def.colorsOf || look.model];
  const kit = typeof def.kit === 'function' ? def.kit(look) : def.kit; // (some depend on the gear the player picked)
  // the body's height (for the kits painted on by height)
  const span = { min: Infinity, max: -Infinity, half: 0 };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    span.min = Math.min(span.min, b.min.z);
    span.max = Math.max(span.max, b.max.z);
    span.half = Math.max(span.half, b.max.x - b.min.x);
  });
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
      const bands = kit?.paint?.[m0.name];
      if (bands) paintBands(m, o.geometry, bands, span);
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
  // the bones the pose code moves (both rigs: the Survivor's and the other three's)
  const bones = {};
  model.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name;
    if (n === 'Body') bones.body = o;
    for (const side of ['L', 'R']) {
      if (n === `UpperArm${side}`) bones[`upperArm${side}`] = o;
      if (n === `LowerArm${side}`) bones[`lowerArm${side}`] = o;
      if (n === `Wrist${side}` || n === `Palm${side}`) bones[`hand${side}`] = o;
      if (n === `UpperLeg${side}`) bones[`upperLeg${side}`] = o;
      if (n === `LowerLeg${side}`) bones[`lowerLeg${side}`] = o;
      if (n === `Foot${side}`) bones[`foot${side}`] = o;
    }
  });
  // the feet hang off the rig's root, not the legs, so the shin's own end bone is what the knee bend moves
  for (const side of ['L', 'R']) bones[`shin${side}`] = bones[`lowerLeg${side}`]?.children[0];
  let playing = null;
  const play = (k, fade = 0.2) => {
    const a = actions[k] || (k === 'back' || k === 'left' || k === 'right' ? actions.run : null) || actions.idle;
    if (!a || a === playing) return;
    a.reset().play();
    if (playing) playing.crossFadeTo(a, fade, false);
    playing = a;
  };
  if (kit) addKit(model, kit);
  play('idle', 0);
  return { root, model, mixer, actions, play, mats, hand: bones.handR, bones, look, scale: t.scale };
}

// ---- posing a 3D character on top of its animation (called every frame, after the mixer):
// both hands on the gun (wherever it's held), and for crouching/sliding the hips drop and the knees bend
// so the feet stay where the animation put them. Plain two-bone IK, so it works on both rigs.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
// Bones the pose moved last frame. A bone the animation doesn't move would otherwise keep last frame's pose
// and drift further every frame, so it goes back to how it was before the next pose.
let touched = null;
function touch(bone) {
  if (touched && !touched.has(bone)) touched.set(bone, { p: bone.position.clone(), q: bone.quaternion.clone() });
}
function untouch(m) {
  for (const [bone, was] of m._posed || []) {
    if (bone.position.equals(was.pp)) bone.position.copy(was.p);
    if (bone.quaternion.equals(was.pq)) bone.quaternion.copy(was.q);
  }
  m._posed = null;
}
// turns a bone (in world space) so the direction `from` now points along `to`
function turnBone(bone, from, to) {
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  touch(bone);
  _q.setFromUnitVectors(_v1.copy(from).normalize(), _v2.copy(to).normalize());
  bone.getWorldQuaternion(_qw);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q.multiply(_qw)));
  bone.updateWorldMatrix(false, true);
}
// upper/lower/end: a limb; target: where the end should go; pole: which way the joint bends
function reach(upper, lower, end, target, pole) {
  if (!upper || !lower || !end) return;
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b);
  const l2 = _b.distanceTo(_c);
  _dir.subVectors(target, _a);
  const d = Math.min(Math.max(_dir.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  _dir.normalize();
  // where the joint goes: on the circle round the reach line, on the pole's side
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _pole.subVectors(pole, _a);
  _pole.addScaledVector(_dir, -_pole.dot(_dir));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0);
  _pole.normalize();
  _elbow.copy(_a).addScaledVector(_dir, x).addScaledVector(_pole, hgt);
  turnBone(upper, _t.subVectors(_b, _a), _v1.subVectors(_elbow, _a).clone());
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const goal = _a.clone().addScaledVector(_dir, d);
  turnBone(lower, _t.subVectors(_c, _b).clone(), goal.sub(_b));
}
const _down = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _feet = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const _lift = { L: 0, R: 0 };
// m: from buildModelCharacter. grip/fore: where the right and left hands go (world), or null.
// low: how far the hips drop (metres; crouch ~0.45), lean: lean back (radians; sliding)
// slide: the front (left) leg stretched out ahead and the back one tucked under, instead of feet staying put.
// ground(x, z): the ground height there, so each foot stands on the ground under it (on slopes the uphill foot
// comes up and the hips drop for the downhill one, so no leg goes into the ground).
// hold(): called once the body is posed (so the gun can be put against the chest where it now is); returns
// { grip, fore } for the hands.
export function poseCharacter(m, { grip = null, fore = null, low = 0, lean = 0, slide = 0, ground = null, hold = null } = {}) {
  const B = m.bones;
  if (!B) return;
  untouch(m);
  touched = new Map();
  m.root.updateMatrixWorld(true);
  m.root.getWorldDirection(_fwd); // the way they face (+z)
  _side.set(_fwd.z, 0, -_fwd.x); // their left
  const legs = B.body && B.footL && B.footR && B.shinL && B.shinR;
  let drop = 0;
  if (legs) {
    // where the animation has the feet, moved up or down onto the ground under each one
    m.root.getWorldPosition(_a);
    // only when they're standing on the ground (not mid-jump, or up on a roof or a crate)
    if (ground && Math.abs(_a.y - ground(_a.x, _a.z)) > 0.25) ground = null;
    for (const s of ['L', 'R']) {
      B[`foot${s}`].getWorldPosition(_feet[s]);
      const d = ground ? ground(_feet[s].x, _feet[s].z) - _a.y : 0;
      _lift[s] = Math.abs(d) < 0.6 ? d : 0; // a bigger step is a ledge or a floor: leave it
    }
    drop = -Math.min(_lift.L, _lift.R); // down for the lower foot (or up, if they are sunk into the ground)
  }
  if (legs && (low > 0.01 || Math.abs(drop) > 0.01 || Math.abs(_lift.L) > 0.01 || Math.abs(_lift.R) > 0.01)) {
    // the hips come down; the knees bend forwards so the feet land where they should
    for (const s of ['L', 'R']) _feet[s].y += _lift[s];
    B.body.getWorldPosition(_t);
    if (slide > 0.01) {
      const gy = Math.min(_feet.L.y, _feet.R.y);
      _c.copy(_t).setY(gy);
      _feet.L.lerp(_b.copy(_c).addScaledVector(_fwd, 0.62).addScaledVector(_side, 0.1), slide);
      _feet.R.lerp(_b.copy(_c).addScaledVector(_fwd, 0.12).addScaledVector(_side, -0.16), slide);
    }
    _t.y -= low + drop;
    _t.addScaledVector(_fwd, -lean * 0.4);
    B.body.parent.worldToLocal(_t);
    touch(B.body);
    B.body.position.copy(_t);
    if (lean) B.body.rotateOnWorldAxis(_v1.copy(_side), -lean);
    B.body.updateWorldMatrix(false, true);
    for (const s of ['L', 'R']) {
      // the foot itself (it hangs off the rig's root, not the leg)
      const foot = B[`foot${s}`];
      touch(foot);
      foot.position.copy(foot.parent.worldToLocal(_c.copy(_feet[s])));
      foot.updateWorldMatrix(false, true);
      B[`upperLeg${s}`].getWorldPosition(_c);
      // knees forward; sliding, the tucked leg's knee points down and out
      const pole = _c.clone().addScaledVector(_fwd, 1).setY(_c.y + (s === 'L' ? slide * 0.8 : 0));
      if (s === 'R') pole.addScaledVector(_side, -slide * 0.8);
      reach(B[`upperLeg${s}`], B[`lowerLeg${s}`], B[`shin${s}`], _feet[s], pole);
    }
  }
  if (hold) ({ grip, fore } = hold(B));
  // hands on the gun: elbows down and out
  if (grip && B.upperArmR) {
    B.upperArmR.getWorldPosition(_c);
    reach(B.upperArmR, B.lowerArmR, B.handR, grip, _c.clone().add(_down.set(0, -1, 0)).addScaledVector(_side, -0.6));
  }
  if (fore && B.upperArmL) {
    B.upperArmL.getWorldPosition(_c);
    reach(B.upperArmL, B.lowerArmL, B.handL, fore, _c.clone().add(_down.set(0, -1, 0)).addScaledVector(_side, 0.6));
  }
  m._posed = touched;
  for (const [bone, was] of touched) Object.assign(was, { pp: bone.position.clone(), pq: bone.quaternion.clone() });
  touched = null;
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
    this.canvas = canvas;
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
    // drag (mouse or finger) to turn the character; it starts spinning by itself again a moment after
    this.heldT = 0;
    let dragX = null;
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => {
      dragX = e.clientX;
      this.heldT = 150;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.stopPropagation();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      this.spin += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
      this.heldT = 150;
    });
    const drop = () => {
      dragX = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
    canvas.addEventListener('click', (e) => e.stopPropagation());
    const loop = () => {
      if (!this.alive) return;
      // off the page: wait a moment (the Locker may be putting it back), then let it go
      if (!this.canvas.isConnected) {
        this.offT = (this.offT || 0) + 1;
        if (this.offT > 120) return this.dispose();
        return requestAnimationFrame(loop);
      }
      this.offT = 0;
      if (this.heldT > 0) this.heldT--; // just turned by hand: hold still for a moment
      else this.spin += this.spinSpeed ?? 0.012; // 0: stands still facing you (the home-screen line-up)
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
      // load it, then show it (if it's still the one picked); a failed download gets one more try
      this.onLoading?.(true);
      loadCharacterModel(look.model)
        .then((ok) => ok || loadCharacterModel(look.model))
        .then((ok) => {
          if (this.look !== look) return;
          if (ok) this.show(look);
          else this.onLoading?.('fail');
        });
    } else this.onLoading?.(false);
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
