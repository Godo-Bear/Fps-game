import * as THREE from 'three';

// Halloween: decorations for the maps and the zombies while the admin's Halloween event is on (admin panel →
// Events), or for an admin previewing it. Nothing here shows otherwise.
let live = false;
export const isHalloween = () => live;
export function setHalloween(on) {
  live = !!on;
}

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
};
const mesh = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.userData.shared = true;
  return m;
};

// A carved pumpkin (faces +z), `size` metres across. light: a little orange glow inside.
export function jackOLantern(size = 0.6, { light = false, carved = true } = {}) {
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
  if (light) {
    const l = new THREE.PointLight(0xff8a2a, 2.2, 9, 2);
    l.position.y = 0.2;
    g.add(l);
  }
  g.scale.setScalar(size / 2);
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
