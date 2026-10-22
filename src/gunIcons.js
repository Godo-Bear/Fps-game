import * as THREE from 'three';
import { buildGun } from './guns.js';

// Pictures of the guns for the inventory: each gun's own 3D model, drawn side-on once and kept.
// Returns a data URL, or null if there's no WebGL for it (the emoji is shown instead).
const W = 256;
const H = 160;
const cache = new Map();
let view = null;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2);
  rim.position.set(-2, 1, -1);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  return { renderer, scene, camera };
}

export function gunIcon(id, mut = null) {
  const key = `${id}|${mut || ''}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    view ||= setup();
    const { renderer, scene, camera } = view;
    const gun = buildGun(id, { mutation: mut }).group;
    // side-on, barrel to the right, tilted a little towards you
    const holder = new THREE.Group();
    holder.add(gun);
    gun.rotation.set(0, Math.PI / 2, 0);
    holder.rotation.set(0.12, -0.28, 0.08);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // fit it to the picture with a small margin
    const half = Math.max(size.x / 2 / (W / H), size.y / 2) * 1.12 || 1;
    Object.assign(camera, { left: -half * (W / H), right: half * (W / H), top: half, bottom: -half });
    camera.position.set(center.x, center.y, center.z + 5);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(holder);
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}

// the owner's gun models finished loading: draw them again
export function clearGunIcons() {
  cache.clear();
}
