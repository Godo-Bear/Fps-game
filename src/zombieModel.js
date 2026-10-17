import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// The owner's zombie models (public/models). Every zombie gets its own copy with its own animations;
// the old block zombie stays underneath, invisible, so hits and headshots work exactly as before.
// Each model and which of its animations to use. walk/run: how many metres a second the clip covers.
const MODELS = [
  {
    url: '/models/Zombie by bachosoftdesign - xqEzosAVYX.glb',
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

// a gentle colour per kind of zombie, so you can still tell them apart
const TINT = { walker: 0xffffff, runner: 0xffd6cc, brute: 0xb4bca4, crawler: 0xe6e2c4, spitter: 0xccffb4, bloater: 0xeeff9e };

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
  model.scale.setScalar(template.scale);
  model.position.copy(template.offset);
  let mat = null;
  let head = null;
  model.traverse((o) => {
    if (o.isMesh) {
      mat = mat || o.material.clone();
      o.material = mat;
    }
    if (o.isBone && /Head$/.test(o.name)) head = o;
  });
  const BV = z.variant;
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
  z.model = { root: model, mixer, anims, current: null, head, stride: running ? def.runSpeed : def.walkSpeed };
  play(z, 'idle', 0);
  mixer.update(Math.random() * 2); // not everyone in step
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
    if (a) a.timeScale = THREE.MathUtils.clamp(speed / (m.stride * z.scale), 0.6, 2.6);
  } else play(z, 'idle');
  m.mixer.update(dt);
}

// does this zombie's model have its own death animation? (if not, it tips over like the blocks)
export const hasDeathClip = (z) => !!z.model?.anims.die;

// headshot kill: the model loses its head too
export function decapitateZombieModel(z) {
  if (z.model?.head) z.model.head.scale.setScalar(0.001);
}
