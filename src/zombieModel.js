import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// The owner's zombie models (public/models). Every zombie gets its own copy with its own animations;
// the old block zombie stays underneath, invisible, so hits and headshots work exactly as before.
// Each model and which of its animations to use. walk/run: how many metres a second the clip covers.
const MODELS = [
  {
    url: '/models/Zombie by bachosoftdesign - xqEzosAVYX.glb', tie: true,
    walk: ['Walk', 'Walk2'], walkSpeed: 1.3, run: null, idle: ['Idle'], attack: ['Attack', 'Attack', 'Headbutt'],
    crawl: ['Running_Crawl'], crawlIdle: ['Crawl'], crawlAttack: ['Bite_ground'], die: ['Die', 'Die2'],
  },
  {
    url: '/models/Animated Zombie by Quaternius - jkrEvQZb8J.glb',
    walk: ['ZombieWalk'], walkSpeed: 1.2, run: ['ZombieRun'], runSpeed: 3.6, idle: ['ZombieIdle'], attack: ['ZombieBite'],
    crawl: ['ZombieCrawl'], crawlIdle: ['ZombieCrawl'], crawlAttack: ['ZombieBite'], die: null, // no death clip: it falls over like the blocks did
  },
];
const HEIGHT = 1.85; // metres tall at zombie scale 1 (the block zombies are about this tall)

// a gentle colour per kind of zombie, on top of its own skin and clothes
const TINT = { walker: 0xffffff, runner: 0xfff0ec, brute: 0xd2d8c8, crawler: 0xf2f0e0, spitter: 0xe4ffd8, bloater: 0xf6ffd0 };

// ---- looks: every zombie gets its own skin, clothes, build, gear and way of walking
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
// skin: [hue (null keeps it), saturation x, brightness x]
const SKINS = [[null, 1, 1], [null, 0.15, 0.95], [55, 0.45, 1.08], [78, 1.35, 0.78], [195, 0.55, 0.95], [110, 1.15, 0.72], [35, 0.7, 0.85]];
const VARIANTS = 16; // different looks made per model
const JEANS = [0x3a4a7a, 0x2a3450, 0x4a5a8a];
// Outfits: which bits of the clothes become bare skin, whether the tie stays, the colours, and a hat that goes with it.
// tie: keep the tie; sleeves: 'short' (bare forearms) or 'none' (bare arms); bare: no shirt at all; shorts: bare lower legs
const OUTFITS = [
  { id: 'office', w: 2, tie: true, shirts: [0xffffff, 0xd8e4f0, 0xf0d8d8, 0xd8d0c0], pants: [0x2a2a2a, 0x2a3450, 0x3a3228, 0x555555] },
  { id: 'tshirt', w: 4, sleeves: 'short', shirts: [0xb02a2a, 0x2a4ab0, 0x2a7a3a, 0xd8c040, 0x222222, 0x6a3a8a, 0xd86a20, 0xeeeeee], pants: [...JEANS, 0x8a7a5a, 0x3a3228] },
  { id: 'tank', w: 2, sleeves: 'none', shirts: [0xeeeeee, 0x555555, 0x222222, 0x9a2a2a], pants: [...JEANS, 0x4a5a3a, 0x8a7a5a] },
  { id: 'shirtless', w: 1.5, bare: true, shirts: [0xffffff], pants: [...JEANS, 0x3a3228, 0x4a5a3a] },
  { id: 'hoodie', w: 2.5, shirts: [0x555555, 0x222222, 0x1c2a4a, 0x6a1c24, 0x2a4a2a, 0xb06a8a], pants: [0x444444, 0x222222, ...JEANS] },
  { id: 'police', w: 1, shirts: [0x1c2a4a], pants: [0x1c2a4a], hat: 'police' },
  { id: 'worker', w: 1.2, sleeves: 'short', shirts: [0xff7a1a, 0xe8e020], pants: [0x2a3450, 0x3a4a7a], hat: 'hardhat' },
  { id: 'hospital', w: 1, sleeves: 'short', shirts: [0x9ec8e0, 0xa0d8c0, 0xeeeeee], same: true }, // scrubs: trousers match
  { id: 'sports', w: 1.5, sleeves: 'short', shorts: true, shirts: [0xd82a2a, 0x2a6ad8, 0xeeeeee, 0x2ab06a, 0xf0c020], pants: [0x222222, 0x1c2a4a, 0xeeeeee] },
];
function pickOutfit() {
  let n = Math.random() * OUTFITS.reduce((a, o) => a + o.w, 0);
  for (const o of OUTFITS) if ((n -= o.w) <= 0) return o;
  return OUTFITS[0];
}
// what a colour on the chart is: 'skin', 'shirt', 'pants', 'red' (tie / blood) or null
function colourKind(r, g, b) {
  const [h, sat, v] = rgbToHsv(r, g, b);
  if (h >= 35 && h <= 170 && sat >= 0.08 && sat <= 0.7 && v > 0.2) return 'skin';
  if (v > 0.72 && sat < 0.25) return 'shirt';
  if ((h >= 190 && h <= 260 && sat > 0.25) || (h >= 10 && h < 35 && sat > 0.3 && v < 0.38)) return 'pants';
  if ((h < 15 || h > 340) && sat > 0.5) return 'red';
  return null;
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
// Both models paint with a small colour chart, so skin (greenish), shirts (pale), jeans (blue) and
// dark trousers can be told apart by colour and each swapped for another.
function recolour(base, skin, shirt, pants) {
  const img = base.image;
  const size = Math.min(256, img.width);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  const data = g.getImageData(0, 0, size, size);
  const px = data.data;
  const sh = new THREE.Color(shirt);
  const [ph, ps] = rgbToHsv(...new THREE.Color(pants).toArray());
  for (let i = 0; i < px.length; i += 4) {
    const [h, sat, v] = rgbToHsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    let out = null;
    // (skin never ends up chalk white: a little colour and not too bright)
    if (h >= 35 && h <= 170 && sat >= 0.08 && sat <= 0.7 && v > 0.2) out = hsvToRgb(skin[0] ?? h, THREE.MathUtils.clamp(sat * skin[1], 0.2, 0.75), Math.min(0.82, v * skin[2]));
    else if (v > 0.72 && sat < 0.25) out = [v * sh.r, v * sh.g, v * sh.b];
    else if ((h >= 190 && h <= 260 && sat > 0.25) || (h >= 10 && h < 35 && sat > 0.3 && v < 0.38)) out = hsvToRgb(ph, ps < 0.08 ? 0 : Math.max(0.2, ps), Math.min(1, v * 1.15));
    if (!out) continue;
    px[i] = out[0] * 255;
    px[i + 1] = out[1] * 255;
    px[i + 2] = out[2] * 255;
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = base.flipY;
  tex.colorSpace = base.colorSpace;
  tex.wrapS = base.wrapS;
  tex.wrapT = base.wrapT;
  tex.magFilter = size <= 64 ? THREE.NearestFilter : base.magFilter;
  tex.minFilter = size <= 64 ? THREE.NearestFilter : base.minFilter;
  return tex;
}
// Which colour each point of the model is painted with, and which bone it moves with.
// Then an outfit just points some of those at the skin colour instead (bare arms, no shirt, shorts)
// or at the shirt colour (no tie).
function analyse(template, mesh) {
  const img = mesh.material.map.image;
  const size = Math.min(256, img.width);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size).data;
  const geo = mesh.geometry;
  const uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
  const kinds = [];
  const parts = [];
  let skinUv = null;
  let shirtUv = null;
  for (let i = 0; i < uv.count; i++) {
    const u = ((uv.getX(i) % 1) + 1) % 1;
    const v = ((uv.getY(i) % 1) + 1) % 1;
    const o = (Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))) * 4;
    const kind = colourKind(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255);
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bw) (bw = w), (best = si.getComponent(i, k));
    }
    const n = names[best] || '';
    const part = /ForeArm|Hand/.test(n) ? 'forearm' : /Arm|Shoulder/.test(n) ? 'arm' : /Spine|Neck/.test(n) ? 'torso' : /UpLeg/.test(n) ? 'thigh' : /Leg|Foot|Toe/.test(n) ? 'shin' : /Head/.test(n) ? 'head' : 'hips';
    kinds.push(kind);
    parts.push(part);
    if (kind === 'skin' && part === 'head' && !skinUv) skinUv = [uv.getX(i), uv.getY(i)];
    if (kind === 'shirt' && part === 'torso' && !shirtUv) shirtUv = [uv.getX(i), uv.getY(i)];
  }
  template.paint = { kinds, parts, skinUv, shirtUv, geometries: {} };
}
// the model's shape with one outfit's colouring (shared by every zombie wearing it)
function outfitGeometry(template, mesh, outfit) {
  const P = template.paint;
  if (P.geometries[outfit.id]) return P.geometries[outfit.id];
  const base = mesh.geometry;
  if (!P.skinUv || !P.shirtUv) return base;
  const uv = base.attributes.uv.clone();
  for (let i = 0; i < uv.count; i++) {
    const kind = P.kinds[i];
    const part = P.parts[i];
    let to = null;
    if (kind === 'shirt') {
      if (outfit.bare && (part === 'torso' || part === 'arm' || part === 'forearm' || part === 'hips')) to = P.skinUv;
      else if (outfit.sleeves === 'none' && (part === 'arm' || part === 'forearm')) to = P.skinUv;
      else if (outfit.sleeves === 'short' && part === 'forearm') to = P.skinUv;
    } else if (kind === 'red' && part === 'torso' && template.def.tie && !outfit.tie) to = outfit.bare ? P.skinUv : P.shirtUv;
    else if (kind === 'pants' && outfit.shorts && part === 'shin') to = P.skinUv;
    if (to) uv.setXY(i, to[0], to[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(base.index);
  for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr);
  geo.setAttribute('uv', uv);
  geo.groups = base.groups;
  geo.boundingBox = base.boundingBox;
  geo.boundingSphere = base.boundingSphere;
  P.geometries[outfit.id] = geo;
  return geo;
}
// a set of looks per model: an outfit (its shape) and its colours (skin, shirt, trousers)
function looksFor(template, mesh) {
  if (!template.looks) {
    template.looks = [{ outfit: OUTFITS[0], geo: mesh.geometry, map: mesh.material.map }];
    try {
      analyse(template, mesh);
      for (let i = 1; i < VARIANTS; i++) {
        const outfit = pickOutfit();
        const shirt = pick(outfit.shirts);
        template.looks.push({ outfit, geo: outfitGeometry(template, mesh, outfit), map: recolour(mesh.material.map, pick(SKINS), shirt, outfit.same ? shirt : pick(outfit.pants)) });
      }
    } catch {
      /* no canvas: everyone keeps the original look */
    }
  }
  return template.looks;
}

// gear: small shapes on the head and back
const GEAR = (() => {
  const half = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return {
    half,
    disc: new THREE.CylinderGeometry(1, 1, 1, 14),
    band: new THREE.CylinderGeometry(1, 1, 1, 14, 1, true),
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 8, 6),
    cone: new THREE.ConeGeometry(1, 1, 6),
  };
})();
const matCache = new Map();
function gearMat(color, glow = false) {
  const key = `${color}-${glow}`;
  if (!matCache.has(key)) {
    matCache.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }));
  }
  return matCache.get(key);
}
const piece = (geo, color, sx, sy, sz, glow = false) => {
  const m = new THREE.Mesh(geo, gearMat(color, glow));
  m.scale.set(sx, sy, sz);
  m.castShadow = !glow;
  const g = new THREE.Group();
  g.add(m);
  return g;
};

let templates = []; // loaded models: { def, scene, clips, scale, offset }
let enabled = true;

export function setZombieModels(on) {
  enabled = !!on;
}
export const zombieModelsOn = () => enabled;

export function loadZombieModel() {
  return Promise.all(MODELS.map(loadOne));
}
function loadOne(def) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      encodeURI(def.url),
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        // measure it in its standing pose: feet on the ground, centred, HEIGHT tall
        const box = new THREE.Box3().setFromObject(scene, true);
        const size = box.getSize(new THREE.Vector3());
        const scale = HEIGHT / (size.y || 1);
        const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).multiplyScalar(scale);
        const clips = {};
        for (const c of gltf.animations) clips[c.name.replace(/^.*\|/, '')] = c;
        scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.frustumCulled = false; // skinned meshes move outside their resting box
            // the export is shiny; zombies shouldn't be
            if (o.material) {
              o.material.metalness = 0;
              o.material.roughness = 0.85;
            }
          }
        });
        templates.push({ def, scene, clips, scale, offset });
        resolve(true);
      },
      undefined,
      () => resolve(false), // missing file: the block zombies are used
    );
  });
}

// Gives a zombie its model (or leaves the blocks if the model isn't loaded / is switched off).
export function attachZombieModel(z) {
  if (!templates.length || !enabled) return;
  // runners want a model that can really run; everyone else gets either, for variety
  const runner = z.typeId === 'runner';
  const choices = runner && templates.some((t) => t.def.run) ? templates.filter((t) => t.def.run) : templates;
  const template = choices[Math.floor(Math.random() * choices.length)];
  const def = template.def;
  const model = cloneSkinned(template.scene);
  // build: tall or short, skinny or stocky (brutes hulking, bloaters puffed out, runners lean)
  const T = z.typeId;
  let w = rand(0.88, 1.14);
  let h = rand(0.92, 1.08);
  if (T === 'brute') w *= 1.15;
  if (T === 'bloater') w *= 1.35;
  if (T === 'runner') (w *= 0.9), (h *= 1.04);
  model.scale.set(template.scale * w, template.scale * h, template.scale * w);
  model.position.set(template.offset.x * w, template.offset.y * h, template.offset.z * w);
  let mat = null;
  let skinned = null;
  const bones = {};
  model.traverse((o) => {
    if (o.isMesh) {
      if (!mat) skinned = o;
      mat = mat || o.material.clone();
      o.material = mat;
    }
    if (o.isBone) {
      const n = o.name.replace(/^mixamorig:?/, '');
      bones[n] = o;
    }
  });
  const head = bones.Head;
  const BV = z.variant;
  // its own outfit and colours (bosses keep their own look)
  let outfit = null;
  if (mat.map && !BV) {
    let src = null;
    template.scene.traverse((o) => {
      if (o.isSkinnedMesh && !src) src = o;
    });
    const look = pick(looksFor(template, src));
    outfit = look.outfit;
    mat.map = look.map;
    if (skinned && look.geo) skinned.geometry = look.geo;
  }
  mat.color.setHex(BV ? z.skinMat.color.getHex() : TINT[z.typeId] ?? 0xffffff);
  if (BV) mat.color.lerp(new THREE.Color(0xffffff), 0.45);
  mat.emissive = new THREE.Color(z.baseEmissive);
  // hide the blocks (they still catch bullets) and show the model instead
  z.body.traverse((o) => {
    if (o.isMesh) o.visible = false;
  });
  z.body.add(model);
  z.mats.push(mat);
  z.skinMat = mat; // hit flashes, frost, fire and the mutated glow now tint the model
  z.shirtMat = new THREE.MeshStandardMaterial(); // (nothing visible uses it any more)
  z.mats.push(z.shirtMat);

  const mixer = new THREE.AnimationMixer(model);
  // one of the listed clips, picked at random (null if the model has none)
  const act = (names) => {
    const have = (names || []).filter((n) => template.clips[n]);
    return have.length ? mixer.clipAction(template.clips[have[Math.floor(Math.random() * have.length)]]) : null;
  };
  const crawl = !!z.type.crawl;
  const running = runner && def.run;
  const walk = act(crawl ? def.crawl : running ? def.run : def.walk) || act(def.walk);
  const anims = {
    walk,
    idle: act(crawl ? def.crawlIdle : def.idle) || walk,
    attack: act(crawl ? def.crawlAttack : def.attack),
    die: act(def.die),
  };
  for (const a of [anims.die, anims.attack]) {
    if (!a) continue;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
  }
  // its own way of moving: hunched or upright, head tilted, a faster or slower shuffle
  const pose = {
    hunch: T === 'runner' ? rand(0.25, 0.4) : crawl ? 0 : rand(-0.05, 0.32),
    tilt: crawl ? 0 : rand(-0.3, 0.3),
    tempo: rand(0.85, 1.15),
  };
  z.model = { root: model, mixer, anims, current: null, head, bones, pose, outfit, stride: running ? def.runSpeed : def.walkSpeed };
  play(z, 'idle', 0);
  mixer.update(Math.random() * 2); // not everyone in step
  dressUp(z, bones);
}

// Puts gear on a bone so it moves with it. offset: where, in metres, from the bone (x right, y up, z forward).
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
function wear(z, bone, obj, x = 0, y = 0, zf = 0) {
  if (!bone) return;
  _m.copy(z.body.matrixWorld).invert().multiply(bone.matrixWorld).decompose(_p, _q, _s);
  obj.quaternion.copy(_q).invert();
  const k = 1 / ((_s.x + _s.y + _s.z) / 3);
  obj.scale.setScalar(k);
  obj.position.set(x, y, zf).applyQuaternion(obj.quaternion).multiplyScalar(k);
  bone.add(obj);
}

// Where the head really is (in the zombie's own space, as it stands now): from the model's own
// skin, the points that move with the head bone. Hats sit on top, eyes go on the face.
function measureHead(z, headBone) {
  let mesh = null;
  z.model.root.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
  });
  if (!mesh || !headBone) return null;
  const bones = mesh.skeleton.bones;
  const ids = new Set([bones.indexOf(headBone), ...headBone.children.filter((c) => c.isBone).map((c) => bones.indexOf(c))]);
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const inv = new THREE.Matrix4().copy(z.body.matrixWorld).invert().multiply(mesh.matrixWorld);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < si.count; i++) {
    let wsum = 0;
    for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(i, k))) wsum += sw.getComponent(i, k);
    if (wsum < 0.6) continue;
    mesh.getVertexPosition(i, v); // skinned, in the mesh's space
    box.expandByPoint(v.applyMatrix4(inv));
  }
  return box.isEmpty() ? null : box;
}

// Hats, eyes and the marks of each kind of zombie.
function dressUp(z, b) {
  z.root.updateMatrixWorld(true);
  const T = z.typeId;
  const BV = z.variant ? z.variant : null;
  const inv = new THREE.Matrix4().copy(z.body.matrixWorld).invert();
  const headAt = new THREE.Vector3();
  if (b.Head) headAt.setFromMatrixPosition(b.Head.matrixWorld).applyMatrix4(inv);
  const hb = measureHead(z, b.Head);
  // head size and spots on it, as offsets from the head bone
  const hh = hb ? THREE.MathUtils.clamp(hb.max.y - hb.min.y, 0.12, 0.4) : 0.24;
  // (by its width: front to back includes the nose and jaw)
  const r = hb ? THREE.MathUtils.clamp((Math.min(hb.max.x - hb.min.x, hb.max.z - hb.min.z) / 2) * 0.95, 0.07, 0.2) : hh * 0.5;
  const c = hb ? hb.getCenter(new THREE.Vector3()) : headAt.clone().add(new THREE.Vector3(0, hh / 2, 0));
  const topY = (hb ? hb.max.y : headAt.y + hh) - headAt.y;
  const front = (hb ? hb.max.z : headAt.z + r) - headAt.z;
  const cx = c.x - headAt.x;
  const cz = c.z - headAt.z;
  const onHead = (obj, y) => wear(z, b.Head, obj, cx, y, cz);

  // glowing eyes for the special ones: red runners, green mutants, orange brutes, the boss's own colour
  const eyeColor = z.mutated ? 0x6dff2a : BV ? z.bossEyes : T === 'runner' ? 0xff2a1a : T === 'brute' ? 0xff8a1c : T === 'spitter' ? 0x8dff4a : null;
  if (eyeColor) {
    for (const sx of [-1, 1]) wear(z, b.Head, piece(GEAR.box, eyeColor, r * 0.3, r * 0.15, r * 0.1, true), cx + sx * r * 0.36, topY - hh * 0.42, front - r * 0.02);
  }

  // what's on their head
  const hats = [];
  if (T === 'walker' || T === 'crawler' || T === 'spitter') {
    hats.push(
      () => { // hard hat
        const g = piece(GEAR.half, pick([0xf2c230, 0xf07a20, 0xeeeeee]), r * 1.05, r * 0.75, r * 1.1);
        g.add(piece(GEAR.disc, g.children[0].material.color.getHex(), r * 1.2, r * 0.05, r * 1.25));
        return [g, topY - hh * 0.2];
      },
      () => { // police cap
        const g = piece(GEAR.disc, 0x1c2a4a, r * 1.02, r * 0.42, r * 1.05);
        const visor = piece(GEAR.box, 0x111111, r * 1.3, r * 0.05, r * 0.6);
        visor.position.set(0, -r * 0.18, r * 0.85);
        g.add(visor);
        return [g, topY - hh * 0.22];
      },
      () => [piece(GEAR.half, pick([0xb02a2a, 0x2a4ab0, 0x2a7a3a, 0x222222, 0xd8c040]), r * 1.06, r * 1.0, r * 1.1), topY - hh * 0.38], // beanie
      () => [piece(GEAR.band, pick([0xc02020, 0x2040a0, 0x222222]), r * 1.04, r * 0.32, r * 1.08), topY - hh * 0.3], // bandana
      () => { // headphones round the neck... on the head
        const g = piece(GEAR.band, 0x222222, r * 1.1, r * 0.12, r * 0.25);
        g.rotation.z = Math.PI / 2;
        const hold = new THREE.Group();
        hold.add(g);
        for (const sx of [-1, 1]) {
          const cup = piece(GEAR.disc, 0x333333, r * 0.4, r * 0.22, r * 0.4);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sx * r * 1.05, -r * 0.55, 0);
          hold.add(cup);
        }
        return [hold, topY - hh * 0.12];
      },
    );
  }
  // police wear their caps and workers their hard hats; everyone else maybe something random
  const outfitHat = { police: 1, hardhat: 0 }[z.model.outfit?.hat];
  if (hats.length && outfitHat !== undefined && Math.random() < 0.8) {
    const [hat, y] = hats[outfitHat]();
    onHead(hat, y);
  } else if (hats.length && Math.random() < 0.45) {
    const [hat, y] = pick(hats)();
    onHead(hat, y);
  }
  const back = b.Spine2 || b.Spine1 || b.Spine;
  if ((T === 'walker' || T === 'runner') && Math.random() < 0.2) {
    wear(z, back, piece(GEAR.box, pick([0x3a5a3a, 0x8a2a2a, 0x2a3a6a, 0x5a4a32]), 0.3, 0.36, 0.15), 0, 0.02, -0.2); // backpack
  }

  // the marks of each kind
  if (T === 'runner') {
    // a sweatband: built for speed
    onHead(piece(GEAR.band, pick([0xff3020, 0xffffff, 0xffd020]), r * 1.06, r * 0.2, r * 1.1), topY - hh * 0.28);
  }
  if (T === 'brute' || BV === 'juggernaut') {
    // armour on the shoulders and chest
    const steel = 0x55585e;
    for (const sx of [-1, 1]) {
      const pad = piece(GEAR.box, steel, 0.2, 0.08, 0.24);
      pad.rotation.z = sx * -0.35;
      wear(z, back, pad, sx * 0.19, 0.16, 0);
    }
    wear(z, back, piece(GEAR.box, steel, 0.34, 0.26, 0.05), 0, 0.02, 0.14);
    if (BV === 'juggernaut' || Math.random() < 0.4) onHead(piece(GEAR.half, steel, r * 1.12, r * 0.9, r * 1.18), topY - hh * 0.3);
  }
  if (T === 'spitter') {
    // a swollen glowing sac on the throat
    wear(z, b.Neck || b.Head, piece(GEAR.ball, 0x9dff4a, 0.07, 0.06, 0.06, true), 0, -0.01, 0.07);
  }
  if (z.mutated || T === 'bloater') {
    // glowing green boils
    const n = T === 'bloater' ? 9 : 5;
    const spots = [back, b.Spine1, b.LeftArm, b.RightArm, b.LeftUpLeg, b.RightUpLeg].filter(Boolean);
    for (let i = 0; i < n; i++) {
      const s = rand(0.035, T === 'bloater' ? 0.08 : 0.05);
      wear(z, pick(spots), piece(GEAR.ball, 0x9dff4a, s, s, s, true), rand(-0.1, 0.1), rand(-0.05, 0.12), rand(-0.12, 0.12));
    }
  }
  if (BV) {
    // bosses: spikes down the back
    for (let i = 0; i < 4; i++) {
      const sp = piece(GEAR.cone, 0x4a0d0a, 0.05, 0.26, 0.05);
      sp.rotation.x = -1.1;
      wear(z, back, sp, 0, 0.18 - i * 0.12, -0.16);
    }
    if (BV === 'broodmother') {
      for (let i = 0; i < 5; i++) {
        const s = rand(0.06, 0.1);
        wear(z, back, piece(GEAR.ball, 0x9dff4a, s, s, s, true), rand(-0.14, 0.14), rand(-0.1, 0.2), -0.18);
      }
    }
  }
}

// bends a bone around an axis of the zombie's own body (x: forward bend, z: sideways tilt)
const _axis = new THREE.Vector3();
const _bq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
function bend(z, bone, ax, ay, az, angle) {
  if (!bone?.parent || !angle) return;
  z.body.matrixWorld.decompose(_p, _bq, _s);
  bone.parent.matrixWorld.decompose(_p, _pq, _s);
  _axis.set(ax, ay, az).applyQuaternion(_bq).applyQuaternion(_pq.invert());
  bone.quaternion.premultiply(_dq.setFromAxisAngle(_axis.normalize(), angle));
}

function play(z, name, fade = 0.2) {
  const m = z.model;
  const next = m.anims[name];
  if (!next || m.current === next) return next;
  next.reset().play();
  if (m.current) m.current.crossFadeTo(next, fade, false);
  m.current = next;
  return next;
}

// Picks the right animation each frame: walking (sped up to match), attacking, dying, standing.
export function animateZombieModel(z, dt, { moving = false, speed = 0, attacking = false } = {}) {
  const m = z.model;
  if (!m) return;
  if (z.state === 'dead') {
    const a = play(z, 'die', 0.12);
    if (a) a.timeScale = 1.5;
    else return; // no death clip: frozen while it falls over
  } else if (attacking) {
    const a = play(z, 'attack', 0.1);
    if (a) a.timeScale = 1.6;
  } else if (moving) {
    const a = play(z, 'walk');
    // sped up or slowed down so the feet keep up with how fast it really moves
    if (a) a.timeScale = THREE.MathUtils.clamp((speed / (m.stride * z.scale)) * m.pose.tempo, 0.6, 2.6);
  } else play(z, 'idle');
  m.mixer.update(dt);
  if (z.state !== 'dead') {
    // its own posture on top of the animation
    bend(z, m.bones.Spine1 || m.bones.Spine, 1, 0, 0, m.pose.hunch);
    bend(z, m.bones.Neck, 0, 0, 1, m.pose.tilt);
  }
}

// does this zombie's model have its own death animation? (if not, it tips over like the blocks)
export const hasDeathClip = (z) => !!z.model?.anims.die;

// headshot kill: the model loses its head too
export function decapitateZombieModel(z) {
  if (z.model?.head) z.model.head.scale.setScalar(0.001);
}
