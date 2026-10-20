import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The tank (special gear: admins, or whoever an admin gives it to). Its model is the owner's
// Mini Fantasy Tank (public/models), scaled up; a block tank stands in until it has loaded.
// Faces +z like the characters.
const URL = '/models/Mini Fantasy Tank by Maxwell Planck - 4XjRDOSpazi.glb';
const LENGTH = 4.2; // metres long
const ROT_Y = -Math.PI / 2; // turns the model so its barrel points down +z
let template = null;
let loading = null;

export function loadTankModel() {
  if (!loading)
    loading = new Promise((resolve) =>
      new GLTFLoader().load(
        encodeURI(URL),
        (gltf) => {
          const spin = new THREE.Group();
          spin.rotation.y = ROT_Y;
          spin.add(gltf.scene);
          const holder = new THREE.Group();
          holder.add(spin);
          holder.updateMatrixWorld(true);
          let box = new THREE.Box3().setFromObject(holder, true);
          const size = box.getSize(new THREE.Vector3());
          holder.scale.setScalar(LENGTH / (Math.max(size.x, size.z) || 1));
          holder.updateMatrixWorld(true);
          box = new THREE.Box3().setFromObject(holder, true);
          // centred, sitting on the ground
          holder.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
          holder.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          template = holder;
          resolve(true);
        },
        undefined,
        () => resolve(false),
      ),
    );
  return loading;
}

function blockTank() {
  const g = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x55603e, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.9 });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  };
  box(2.6, 0.9, 4, green, 0, 0.75, 0);
  for (const s of [-1, 1]) box(0.5, 0.8, 4.2, dark, s * 1.4, 0.45, 0);
  box(1.6, 0.7, 1.8, green, 0, 1.55, -0.2);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.6, 1.6);
  g.add(barrel);
  return g;
}

// A tank to put in the world (the model if it's loaded, else blocks). The barrel tip is userData.muzzle.
export function buildTank() {
  const g = new THREE.Group();
  g.add(template ? template.clone(true) : blockTank());
  g.userData.model = !!template;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 1.6, LENGTH / 2 + 0.4);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}
export const tankModelReady = () => !!template;
