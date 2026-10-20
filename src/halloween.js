import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Halloween: decorations for the maps and the zombies while the admin's Halloween event is on (admin panel →
// Events), or for an admin previewing it. Nothing here shows otherwise.
let live = false;
export const isHalloween = () => live;
export function setHalloween(on) {
  live = !!on;
  if (live) loadHalloweenModels();
}

// ---- the owner's Halloween models (public/models). Until one has loaded, a simple shape stands in, and
// swaps to the model as soon as it arrives. Each is fitted to a box: `fit` is the size (metres) of its
// widest side, or its height with `tall`; `center` puts its middle (not its bottom) at 0.
const MODELS = {
  pumpkin: { url: '/models/Pumpkin by CreativeTrio - XYPzyxSw3c.glb', fit: 2, center: true },
  grave: { url: '/models/Grave by Kay Lousberg - znGrV0V80y.glb', fit: 1.25, tall: true },
  cauldron: { url: '/models/Cauldron by Quaternius - QaWJOPa6Gt.glb', fit: 1.6 },
  scarecrow: { url: '/models/Scarecrow by Poly by Google - 7qFs_DjjuVp.glb', fit: 3, tall: true },
  scythe: { url: '/models/Scythe by Quaternius - yE9TKCewO8.glb', fit: 1, tall: true, center: true },
  hat: { url: '/models/Wizard hat by Poly by Google - 7VVumyY7L_u.glb', fit: 1 },
};
const templates = {};
const waiting = {}; // model name -> groups still showing their stand-in
let loading = null;
export function loadHalloweenModels() {
  if (!loading)
    loading = Promise.all(
      Object.entries(MODELS).map(([name, m]) =>
        new GLTFLoader()
          .loadAsync(encodeURI(m.url))
          .then((gltf) => {
            const scene = gltf.scene;
            scene.traverse((o) => {
              if (!o.isMesh) return;
              o.castShadow = true;
              o.userData.shared = true; // kept when a map is thrown away
            });
            const holder = new THREE.Group();
            holder.add(scene);
            holder.updateMatrixWorld(true);
            let box = new THREE.Box3().setFromObject(holder);
            const size = box.getSize(new THREE.Vector3());
            holder.scale.setScalar(m.fit / ((m.tall ? size.y : Math.max(size.x, size.z)) || 1));
            holder.updateMatrixWorld(true);
            box = new THREE.Box3().setFromObject(holder);
            const c = box.getCenter(new THREE.Vector3());
            scene.position.sub(new THREE.Vector3(c.x, m.center ? c.y : box.min.y, c.z).divideScalar(holder.scale.x));
            templates[name] = holder;
            // everything already out with a stand-in gets the model now
            for (const g of waiting[name] || []) swapIn(g, name);
            waiting[name] = [];
          })
          .catch(() => {}),
      ),
    );
  return loading;
}
function swapIn(g, name) {
  for (const c of [...g.children]) if (c.userData.standIn) g.remove(c);
  g.add(templates[name].clone(true));
}
// a group showing the model (or its stand-in until the model has loaded)
function slot(name, standIn) {
  const g = new THREE.Group();
  if (templates[name]) g.add(templates[name].clone(true));
  else {
    const s = standIn();
    s.userData.standIn = true;
    g.add(s);
    (waiting[name] ||= []).push(g);
    loadHalloweenModels();
  }
  return g;
}
export const graveModel = (standIn) => slot('grave', standIn);
export const cauldronModel = (standIn) => slot('cauldron', standIn);
export const scarecrowModel = (standIn) => slot('scarecrow', standIn);
// a scythe about 1 m long (scale it), blade at the top
export const scythe = () => slot('scythe', () => {
  const g = new THREE.Group();
  const pole = mesh(new THREE.BoxGeometry(0.04, 1, 0.04), MAT.stem);
  g.add(pole);
  return g;
});
// a witch's hat 1 m across (scale it)
export const witchHat = () => slot('hat', () => {
  const g = new THREE.Group();
  const brim = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 12), MAT.bat);
  const cone = mesh(new THREE.ConeGeometry(0.28, 0.6, 10), MAT.bat);
  cone.position.y = 0.3;
  g.add(brim, cone);
  return g;
});

// shared shapes and colours (marked shared so a map being thrown away doesn't dispose them)
const lam = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
const MAT = {
  pumpkin: lam(0xe8761a),
  pumpkinDark: lam(0xc25a10),
  stem: lam(0x4a5a22),
  face: glow(0xffd23a),
  ghost: new THREE.MeshStandardMaterial({ color: 0xf4f2ff, roughness: 0.6, transparent: true, opacity: 0.72, emissive: 0x8888aa, emissiveIntensity: 0.35, depthWrite: false }),
  ghostEye: glow(0x111118),
  bat: new THREE.MeshBasicMaterial({ color: 0x120c16, side: THREE.DoubleSide }),
  orange: glow(0xff8a1a),
  purple: glow(0xa04aff),
  green: glow(0x7dff3a),
};
const GEO = {
  pumpkin: new THREE.SphereGeometry(1, 10, 7),
  stem: new THREE.CylinderGeometry(0.08, 0.12, 0.3, 6),
  eye: new THREE.ConeGeometry(0.2, 0.22, 3),
  mouth: new THREE.BoxGeometry(0.62, 0.14, 0.1),
  tooth: new THREE.BoxGeometry(0.1, 0.1, 0.1),
  ghostHead: new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  ghostBody: new THREE.CylinderGeometry(0.45, 0.62, 1.1, 12, 1, true),
  ghostEye: new THREE.SphereGeometry(0.07, 6, 4),
  wing: (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.55, 0.12, -0.1, 0.42, -0.08, 0.15, 0, 0, 0, 0.42, -0.08, 0.15, 0.2, 0, 0.25], 3));
    g.computeVertexNormals();
    return g;
  })(),
  batBody: new THREE.SphereGeometry(0.12, 6, 4),
  inner: new THREE.SphereGeometry(1, 8, 6),
};
const mesh = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.userData.shared = true;
  return m;
};

// A carved pumpkin (faces +z), `size` metres across, its middle at 0. light: a real orange light inside
// (they cost, so only a few). The owner's pumpkin model once it's loaded, with a glow showing through the face.
export function jackOLantern(size = 0.6, { light = false, carved = true } = {}) {
  const g = slot('pumpkin', () => blockPumpkin(carved));
  const inner = mesh(GEO.inner, MAT.face);
  inner.scale.setScalar(0.62);
  g.add(inner);
  if (light) {
    const l = new THREE.PointLight(0xff8a2a, 2.2, 9, 2);
    l.position.y = 0.2;
    g.add(l);
  }
  g.scale.setScalar(size / 2);
  return g;
}
function blockPumpkin(carved) {
  const g = new THREE.Group();
  const body = mesh(GEO.pumpkin, Math.random() < 0.5 ? MAT.pumpkin : MAT.pumpkinDark);
  body.scale.set(1, 0.8, 1);
  body.castShadow = true;
  g.add(body);
  // a couple of lobes for the ribbed look
  for (const s of [-1, 1]) {
    const lobe = mesh(GEO.pumpkin, MAT.pumpkin);
    lobe.scale.set(0.7, 0.76, 0.85);
    lobe.position.x = s * 0.32;
    g.add(lobe);
  }
  const stem = mesh(GEO.stem, MAT.stem);
  stem.position.y = 0.88;
  stem.rotation.z = 0.25;
  g.add(stem);
  if (carved) {
    for (const s of [-1, 1]) {
      const eye = mesh(GEO.eye, MAT.face);
      eye.position.set(s * 0.3, 0.2, 0.9);
      eye.rotation.set(Math.PI / 2, 0, 0);
      g.add(eye);
    }
    const mouth = mesh(GEO.mouth, MAT.face);
    mouth.position.set(0, -0.2, 0.92);
    g.add(mouth);
    for (const x of [-0.15, 0.15]) {
      const t = mesh(GEO.tooth, MAT.pumpkin);
      t.position.set(x, -0.15, 0.97);
      g.add(t);
    }
  }
  return g;
}

// A sheet ghost with dark eyes (about 1.6 m tall), floating.
export function ghost() {
  const g = new THREE.Group();
  const head = mesh(GEO.ghostHead, MAT.ghost);
  head.position.y = 1.1;
  const body = mesh(GEO.ghostBody, MAT.ghost);
  body.position.y = 0.55;
  g.add(head, body);
  for (const s of [-1, 1]) {
    const e = mesh(GEO.ghostEye, MAT.ghostEye);
    e.position.set(s * 0.15, 1.25, 0.4);
    g.add(e);
  }
  return g;
}

// A bat: two wings that flap (call flap(t)).
export function bat() {
  const g = new THREE.Group();
  g.add(mesh(GEO.batBody, MAT.bat));
  const wings = [];
  for (const s of [-1, 1]) {
    const w = mesh(GEO.wing, MAT.bat);
    w.scale.x = s;
    g.add(w);
    wings.push(w);
  }
  g.userData.flap = (t) => {
    const a = Math.sin(t * 18) * 0.7;
    wings[0].rotation.z = -a;
    wings[1].rotation.z = a;
  };
  return g;
}

export const glowMat = (c) => (c === 'orange' ? MAT.orange : c === 'purple' ? MAT.purple : MAT.green);
export const sharedMesh = mesh;
