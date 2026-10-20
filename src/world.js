import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bat, ghost, glowMat, jackOLantern, sharedMesh } from './halloween.js';
import { DEFEND_POINTS, FFA_SPAWNS, FLAG_BASES, POINT, TEAM_SPAWNS } from '../shared/modes.js';
import { ARENA_RADIUS, Colliders, heightAt, mulberry32, setTerrain } from './terrain.js';
import { GROUND_PALETTES, grimeTexture, groundTexture, planksTexture, roadTexture, softDotTexture, textTexture } from './textures.js';

const PI = Math.PI;

// Look of each map. Layouts are further down in buildWorld.
export const THEMES = {
  plains: {
    name: 'Dead Plains', desc: 'Sun-baked farmland: a ruined town, a crashed airliner, a water tower.',
    skyTop: 0x6f8ba3, skyHorizon: 0xd8b88e, sunDir: [-0.55, 0.32, -0.77], sunColor: 0xffd3a1, hemiSky: 0xdfe4e8, hemiGround: 0x8a7458,
    ground: 'plains', groundTint: [0xffffff, 0xdcd6b0, 0xcab89a], grass: { count: 7000, shades: [0x9c8b52, 0xb39f62, 0x857a48, 0xa69062, 0x7a7444], h: 1 },
    horizon: 'mesas', horizonColor: 0xa47e5f, road: true, tumbleweeds: true, motes: 0xe8d6b0,
    weathers: ['clear', 'clear', 'overcast', 'dust', 'rain', 'storm'], weather: 'clear',
  },
  frost: {
    name: 'Frostbite Outpost', desc: 'An abandoned military base buried in snow. Bunkers, watchtowers, a downed chopper.',
    skyTop: 0x7d93ab, skyHorizon: 0xd9e2ea, sunDir: [0.5, 0.22, -0.84], sunColor: 0xfff0e0, hemiSky: 0xe8f0f8, hemiGround: 0xa8b4c0,
    ground: 'snow', groundTint: [0xffffff, 0xeef3f8, 0xdde6ee], grass: { count: 2500, shades: [0x8a8070, 0x9a9282, 0x6a6458], h: 0.6 },
    horizon: 'mountains', horizonColor: 0xc8d2dc, road: false, tumbleweeds: false, motes: 0xffffff, snowfall: true,
    weathers: ['frostclear', 'snow', 'snow', 'blizzard', 'frostfog'], weather: 'snow',
  },
  forest: {
    name: 'Blackwood Hollow', desc: 'A dark pine forest at dusk: cabins, a ruined church, a graveyard and toxic swamp.',
    skyTop: 0x2e3350, skyHorizon: 0xb0705a, sunDir: [-0.7, 0.12, 0.7], sunColor: 0xff9a6a, hemiSky: 0x9aa0c0, hemiGround: 0x3a3a28,
    ground: 'forest', groundTint: [0xffffff, 0xd8e0c8, 0xc8c0a8], grass: { count: 9000, shades: [0x3f5a2a, 0x4f6a30, 0x2e4220, 0x5a6a3a], h: 1.2 },
    horizon: 'treeline', horizonColor: 0x1e2a1e, road: false, tumbleweeds: false, motes: 0xc8ff8a, fireflies: true,
    weathers: ['dusk', 'dusk', 'mist', 'rain', 'storm'], weather: 'dusk',
  },
};
Object.assign(THEMES, {
  docks: {
    name: 'Rustwater Docks', desc: 'A flooded harbour: stacked containers, cranes to climb, warehouses and beached boats.',
    skyTop: 0x5f6f7d, skyHorizon: 0xa8b2b8, sunDir: [0.4, 0.35, 0.8], sunColor: 0xe8eef2, hemiSky: 0xc8d2da, hemiGround: 0x5a564e,
    ground: 'mud', groundTint: [0xffffff, 0xd8d4c8, 0xb8b4a8], grass: { count: 1500, shades: [0x6a6a50, 0x7a7458, 0x5a5a44], h: 0.7 },
    horizon: 'sea', horizonColor: 0x3e464e, road: false, tumbleweeds: false, motes: 0xc8d0d8,
    weathers: ['harbour', 'harbour', 'seafog', 'rain', 'storm'], weather: 'harbour',
  },
  village: {
    name: 'Hideaway Village', desc: 'A sunny village made for hide and seek: houses, sheds, a hedge maze, corn fields, bushes and a playground.',
    skyTop: 0x5f9fd8, skyHorizon: 0xcfe6f0, sunDir: [0.45, 0.55, -0.7], sunColor: 0xfff4dc, hemiSky: 0xe8f4ff, hemiGround: 0x6a8a4a,
    ground: 'meadow', groundTint: [0xffffff, 0xe0f0d0, 0xc8e0b0], grass: { count: 9000, shades: [0x5a8a32, 0x6a9a3a, 0x4a7a2a, 0x7aa848], h: 1.1 },
    horizon: 'treeline', horizonColor: 0x2e5a2e, road: false, tumbleweeds: false, motes: 0xffffff,
    weathers: ['sunny', 'sunny', 'overcast', 'rain'], weather: 'sunny',
  },
  ember: {
    name: 'Ember Canyon', desc: 'A burnt-out canyon under a burning sky: lava pools, scorched shacks and black rock.',
    skyTop: 0x3a1e22, skyHorizon: 0xd0602a, sunDir: [-0.3, 0.15, -0.95], sunColor: 0xff8a4a, hemiSky: 0xc08070, hemiGround: 0x2a1a14,
    ground: 'ash', groundTint: [0xffffff, 0xd8c8c0, 0xa89890], grass: { count: 1200, shades: [0x3a2e26, 0x4a3a2e, 0x2a2420], h: 0.6 },
    horizon: 'volcanoes', horizonColor: 0x2a1a18, road: false, tumbleweeds: false, motes: 0xff7a2a, embers: true,
    weathers: ['emberdusk', 'emberdusk', 'ashfall', 'smoke'], weather: 'emberdusk',
  },
});
export const MAP_IDS = Object.keys(THEMES);

// Halloween shapes shared by every map (never disposed with a map)
const HW = { bulb: new THREE.SphereGeometry(0.09, 6, 4), bubble: new THREE.SphereGeometry(0.08, 6, 4), brew: new THREE.CircleGeometry(0.68, 16) };
// The owner's warehouse model (public/models), loaded once and shared by every map that has one.
const WAREHOUSE_URL = '/models/Warehouse by Lavender Harmony - fsxbktzB1zo.glb';
const WAREHOUSE_SCALE = 0.16; // the model is in big units: this makes it about 10 x 16 m and 8 m high
let warehouseModel = null;
function loadWarehouse() {
  if (!warehouseModel)
    warehouseModel = new GLTFLoader()
      .loadAsync(encodeURI(WAREHOUSE_URL))
      .then((gltf) => {
        const m = gltf.scene;
        m.traverse((o) => {
          if (!o.isMesh) return;
          // its own floor plane and a stray block inside aren't needed
          if (o.name === 'Plane' || [].concat(o.material).some((x) => x.name === 'Material.002')) o.visible = false;
          for (const mat of [].concat(o.material)) mat.side = THREE.DoubleSide; // the walls are one-sided in the file
          o.castShadow = true;
          o.receiveShadow = true;
          o.userData.shared = true; // kept when a map is thrown away
        });
        m.scale.setScalar(WAREHOUSE_SCALE);
        // centred on its footprint, floor at 0
        m.position.set(0.25 * WAREHOUSE_SCALE, -0.2 * WAREHOUSE_SCALE, -13.4 * WAREHOUSE_SCALE);
        return m;
      })
      .catch(() => null);
  return warehouseModel;
}

// Builds a map: terrain, buildings, wrecks and clutter. Returns collision data and update/dispose hooks.
export function buildWorld(scene, mapId = 'plains', { ads = true, halloween = false } = {}) {
  if (!THEMES[mapId]) mapId = 'plains';
  const theme = THEMES[mapId];
  setTerrain(mapId);
  const root = new THREE.Group();
  scene.add(root);
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const colliders = new Colliders();
  const solids = []; // meshes that stop bullets
  const reserved = []; // circles kept clear of random clutter
  const lootSpots = []; // places weapons can spawn (some are on top of things, to reward climbing)
  const hideSpots = []; // places a hide and seek bot can hide (in bushes, sheds and corn; inside houses too)
  const ladders = []; // { x, z, nx, nz, bottom, top } in world space; n points away from the wall
  const pendingLadders = [];
  const updaters = [];
  const hazards = []; // toxic pools etc: { x, z, r, dps }

  const grime = grimeTexture();
  const mat = (color, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, map: grime, roughness: 0.92, metalness: 0, flatShading: true, ...opts });

  const M = {
    plaster: mat(0xb9ab92),
    plaster2: mat(0x9f9c8a),
    brick: mat(0x8a5a44),
    woodWall: mat(0x7d6a52),
    barnRed: mat(0x7a3b2e),
    wood: mat(0x5e4a36),
    darkWood: mat(0x3e3127),
    planks: new THREE.MeshStandardMaterial({ map: planksTexture(), color: 0x9a8670, roughness: 0.95, flatShading: true }),
    roof: mat(0x4b3e36),
    metal: mat(0xb4b8ba, { metalness: 0.2, roughness: 0.6 }),
    metalDark: mat(0x6d7376, { metalness: 0.2, roughness: 0.65 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, side: THREE.BackSide }),
    rust: mat(0x8a5532, { metalness: 0.1, roughness: 0.9 }),
    rust2: mat(0x9c6538, { metalness: 0.1, roughness: 0.9 }),
    burnt: mat(0x2a2522),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a3236, roughness: 0.3, metalness: 0.1 }),
    rubber: mat(0x1f1e1d),
    rock: mat(0x8d8174),
    rock2: mat(0x766c62),
    tree: mat(0x5a4838),
    hay: mat(0xb59b5a),
    concrete: mat(0x9b968c),
    paintA: mat(0x6f7f6a),
    paintB: mat(0x8a6f4f),
    paintC: mat(0x5d6b7a),
    paintD: mat(0x9b8c6a),
    redPaint: mat(0x8b3a2f),
    snow: mat(0xf4f7fa),
    pine: mat(0x2f4a30),
    pineDark: mat(0x22362a),
    olive: mat(0x5a6340),
    sandbag: mat(0xa89a74),
    stone: mat(0x8a8780),
    concreteDark: mat(0x7a7870),
    containerA: mat(0x8a3a2a),
    containerB: mat(0x2f5a7a),
    containerC: mat(0x6a7a3a),
    toxic: new THREE.MeshStandardMaterial({ color: 0x7adf3a, emissive: 0x3a9a10, roughness: 0.2, transparent: true, opacity: 0.85 }),
    lava: new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 1.2, roughness: 0.5 }),
    obsidian: mat(0x2a2426, { roughness: 0.6 }),
    hull: mat(0x2f4a5a),
    hullRed: mat(0x7a2e26),
    water: new THREE.MeshStandardMaterial({ color: 0x3a5260, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.92 }),
    oil: new THREE.MeshStandardMaterial({ map: softDotTexture(), color: 0x0c0e12, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    yellow: mat(0xc8a030),
    ice: new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
  };

  const meshOf = (geo, material, { shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };
  const box = (w, h, d, material) => meshOf(new THREE.BoxGeometry(w, h, d), material);
  const cyl = (rt, rb, h, material, seg = 10) => meshOf(new THREE.CylinderGeometry(rt, rb, h, seg), material);

  // Tag helpers, resolved once the whole map is built.
  const solid = (m, collide = true) => {
    m.userData.solid = true;
    m.userData.collide = collide;
    return m;
  };
  const proxy = (parent, w, h, d, x, y, z, ry = 0, top) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    m.visible = false;
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.userData.collide = true;
    if (top !== undefined) m.userData.colTop = top;
    parent.add(m);
    return m;
  };

  const place = (obj, x, z, rot = 0, sink = 0) => {
    obj.position.set(x, heightAt(x, z) - sink, z);
    obj.rotation.y = rot;
    root.add(obj);
    return obj;
  };
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  // keep multiplayer spawns, flags and the capture point clear on every map
  for (const team of Object.values(TEAM_SPAWNS)) for (const [x, z] of team) reserve(x, z, 3);
  for (const [x, z] of FFA_SPAWNS) reserve(x, z, 2.5);
  for (const [x, z] of Object.values(FLAG_BASES)) reserve(x, z, 4);
  reserve(POINT.x, POINT.z, POINT.radius + 2);
  for (const p of DEFEND_POINTS) reserve(p.x, p.z, p.radius + 1);
  const isFree = (x, z, r) => {
    if (Math.hypot(x, z) < 12) return false;
    if (theme.road && Math.abs(z - 24) < 6) return false; // keep the road clear-ish
    for (const o of reserved) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
    return true;
  };

  // ---------------------------------------------------------------- sky & atmosphere
  const skyColorTop = new THREE.Color(theme.skyTop);
  const skyColorHorizon = new THREE.Color(theme.skyHorizon);
  scene.fog = new THREE.Fog(skyColorHorizon.clone(), 35, 300);
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: skyColorTop },
        horizon: { value: skyColorHorizon },
        sunDir: { value: sunDir },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0,0.75,0.45) * pow(s, 8.0) * 0.35;
          col += vec3(1.0,0.9,0.7) * smoothstep(0.9975, 0.9992, s);
          if (vDir.y < 0.0) col = horizon;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -1;
  root.add(sky);
  updaters.push((dt, t, p) => sky.position.copy(p));

  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 1.9);
  root.add(hemi);
  // soft bounce light from the opposite side so things facing away from the sun aren't pitch black
  const fill = new THREE.DirectionalLight(0xc9d4e0, 0.7);
  fill.position.set(-sunDir.x, 0.6, -sunDir.z);
  root.add(fill);
  const sun = new THREE.DirectionalLight(theme.sunColor, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -55;
  sc.right = sc.top = 55;
  sc.near = 1;
  sc.far = 240;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  updaters.push((dt, t, p) => {
    sun.position.set(p.x + sunDir.x * 110, p.y + sunDir.y * 110, p.z + sunDir.z * 110);
    sun.target.position.set(p.x, p.y, p.z);
  });

  // ---------------------------------------------------------------- terrain
  {
    const size = 800;
    const seg = 200;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cDry = new THREE.Color(theme.groundTint[0]);
    const cOlive = new THREE.Color(theme.groundTint[1]);
    const cDark = new THREE.Color(theme.groundTint[2]);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
      const n1 = Math.sin(x * 0.043 + 1.3) * Math.cos(z * 0.037) * 0.5 + 0.5;
      const n2 = Math.sin(x * 0.11 - z * 0.07) * 0.5 + 0.5;
      tmp.copy(cDry).lerp(cOlive, n1 * 0.7).lerp(cDark, n2 * 0.35);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: groundTexture(GROUND_PALETTES[theme.ground]), vertexColors: true, roughness: 1, metalness: 0 })
    );
    ground.receiveShadow = true;
    root.add(ground);
  }

  // A flat strip/patch that follows the terrain (roads, scorch marks, shadows of debris).
  const conform = (w, d, segW, segD, x, z, rot, material, lift = 0.04) => {
    const geo = new THREE.PlaneGeometry(w, d, segW, segD);
    geo.rotateX(-PI / 2);
    const p = geo.attributes.position;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i);
      const lz = p.getZ(i);
      const wx = x + c * lx + s * lz;
      const wz = z - s * lx + c * lz;
      p.setY(i, heightAt(wx, wz) + lift);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, 0, z);
    m.rotation.y = rot;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // Road across the map
  if (theme.road) conform(
    300, 7, 150, 2, 0, 24, 0,
    new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 })
  );

  const scorchMat = new THREE.MeshBasicMaterial({
    map: softDotTexture(), color: 0x14100c, transparent: true, opacity: 0.85, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  });

  // ---------------------------------------------------------------- the horizon: mesas, mountains or a treeline
  {
    const farMat = new THREE.MeshStandardMaterial({ color: theme.horizonColor, roughness: 1, flatShading: true });
    if (theme.horizon === 'mesas') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * PI * 2 + rand(-0.15, 0.15);
        const r = rand(290, 360);
        const h = rand(25, 60);
        const rb = rand(30, 60);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rb * rand(0.55, 0.8), rb, h, 7), farMat);
        m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
        m.rotation.y = rand(0, PI);
        root.add(m);
      }
    } else if (theme.horizon === 'mountains') {
      const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * PI * 2 + rand(-0.1, 0.1);
        const r = rand(300, 380);
        const h = rand(60, 140);
        const rb = rand(45, 80);
        const m = new THREE.Mesh(new THREE.ConeGeometry(rb, h, 6), farMat);
        m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
        m.rotation.y = rand(0, PI);
        root.add(m);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(rb * 0.36, h * 0.36, 6), capMat);
        cap.position.set(m.position.x, h - 6 - h * 0.18 + 0.5, m.position.z);
        cap.rotation.y = m.rotation.y;
        root.add(cap);
      }
    } else if (theme.horizon === 'sea') {
      // the island sits in a grey sea, with a ruined city skyline far off
      const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 48), M.water);
      sea.rotation.x = -PI / 2;
      sea.position.y = -1.6;
      root.add(sea);
      for (let i = 0; i < 40; i++) {
        const a = rand(0, PI * 2);
        const r = rand(420, 520);
        const h = rand(20, 90);
        const w = rand(14, 40);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * rand(0.6, 1.2)), farMat);
        m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
        m.rotation.y = rand(0, PI);
        root.add(m);
      }
    } else if (theme.horizon === 'volcanoes') {
      const glow = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * PI * 2 + rand(-0.12, 0.12);
        const r = rand(280, 360);
        const h = rand(50, 130);
        const rb = rand(50, 90);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.18, rb, h, 7), farMat);
        m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
        m.rotation.y = rand(0, PI);
        root.add(m);
        if (rng() < 0.5) {
          // glowing crater
          const top = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.17, rb * 0.17, 1, 7), glow);
          top.position.set(m.position.x, h - 6 + 0.2, m.position.z);
          root.add(top);
        }
      }
    } else {
      // a wall of dark pines all round
      for (let i = 0; i < 160; i++) {
        const a = rand(0, PI * 2);
        const r = rand(190, 300);
        const h = rand(18, 34);
        const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h, 6), farMat);
        m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
        root.add(m);
      }
    }
  }

  // ---------------------------------------------------------------- broken houses
  function brokenHouse(x, z, rot, w, d, { h = 3.2, wall = pick([M.plaster, M.plaster2, M.brick, M.woodWall]), chimney = rng() < 0.5, roof = true, graffiti } = {}) {
    const g = new THREE.Group();
    const T = 0.3;
    const floor = box(w, 0.25, d, M.planks);
    floor.position.y = 0.05;
    g.add(floor);
    const ruined = graffiti ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 4);
    const walls = [
      { len: w + T, cx: 0, cz: -d / 2, alongX: true, front: true },
      { len: w + T, cx: 0, cz: d / 2, alongX: true },
      { len: d - T, cx: -w / 2, cz: 0, alongX: false },
      { len: d - T, cx: w / 2, cz: 0, alongX: false },
    ];
    walls.forEach((wl, wi) => {
      const n = Math.max(2, Math.round(wl.len / 1.1));
      const sl = wl.len / n;
      const door = wl.front ? Math.floor(n / 2) : -1;
      const whole = new Set(); // bits of wall still standing full height, with no window
      for (let i = 0; i < n; i++) {
        const off = -wl.len / 2 + sl * (i + 0.5);
        let ht = h;
        const r = rng();
        if (wi === ruined) ht = r < 0.35 ? 0 : h * rand(0.12, 0.6);
        else if (graffiti && wl.front) ht = h;
        else if (r < 0.12) ht = h * rand(0.25, 0.7);
        else if (r < 0.17) ht = 0;
        const pieces = [];
        if (i === door) {
          if (ht > 2.4) pieces.push([2.2, ht - 2.2]);
        } else if (ht >= h * 0.95 && i > 0 && i < n - 1 && !(graffiti && wl.front) && rng() < 0.35) {
          pieces.push([0, 0.95], [2.05, h - 2.05]); // window hole
        } else if (ht > 0.05) {
          pieces.push([0, ht]);
          if (ht >= h * 0.95) whole.add(i);
        }
        for (const [y0, ph] of pieces) {
          const seg = box(wl.alongX ? sl + 0.01 : T, ph, wl.alongX ? T : sl + 0.01, wall);
          seg.position.set(wl.alongX ? off : wl.cx, y0 + ph / 2, wl.alongX ? wl.cz : off);
          if (ht < h * 0.9 && y0 === 0) seg.rotation[wl.alongX ? 'z' : 'x'] = rand(-0.04, 0.04);
          if (y0 > 0) seg.userData.overhead = true;
          solid(seg);
          g.add(seg);
        }
      }
      // an ad poster pasted on the back wall of every other house (where two bits of wall still stand)
      if (ads && wi === 1 && wi !== ruined && h >= 2.8 && houseAds++ % 2 === 0) {
        const i = [...whole].find((k) => whole.has(k + 1));
        if (i !== undefined) adPanel(g, 'poster', 1.1, 1.65, -wl.len / 2 + sl * (i + 1), 1.75, wl.cz + T / 2 + 0.03).userData.wall = true;
      }
      // rubble from the collapsed wall
      if (wi === ruined) {
        for (let k = 0; k < 9; k++) {
          const rb = box(rand(0.3, 0.9), rand(0.15, 0.4), rand(0.3, 0.8), wall);
          const along = rand(-wl.len / 2, wl.len / 2);
          const out = rand(-1.5, 1.8) * (wl.alongX ? Math.sign(wl.cz) : Math.sign(wl.cx));
          rb.position.set(wl.alongX ? along : wl.cx + out, 0.12, wl.alongX ? wl.cz + out : along);
          rb.rotation.set(rand(-0.4, 0.4), rand(0, PI), rand(-0.4, 0.4));
          g.add(rb);
        }
      }
    });
    if (roof) {
      const pitch = 0.5;
      const half = d / 2 + 0.4;
      const slabLen = half / Math.cos(pitch);
      const rise = Math.tan(pitch) * (d / 2);
      // one intact slab
      const slab = box(w + 0.6, 0.14, slabLen, M.roof);
      slab.position.set(0, h + rise / 2, -d / 4);
      slab.rotation.x = -pitch;
      g.add(slab);
      // the other half caved in, leaning into the house
      const fallen = box(w * 0.7, 0.14, slabLen, M.roof);
      fallen.position.set(rand(-w * 0.15, w * 0.15), h * 0.45, d / 4);
      fallen.rotation.set(-1.0, rand(-0.2, 0.2), rand(-0.15, 0.15));
      g.add(fallen);
      // exposed rafters
      for (let k = 0; k < Math.floor(w / 1.4); k++) {
        if (rng() < 0.35) continue;
        const raf = box(0.12, 0.14, slabLen, M.darkWood);
        raf.position.set(-w / 2 + 0.6 + k * 1.4, h + rise / 2, d / 4);
        raf.rotation.x = pitch;
        g.add(raf);
      }
      const ridge = box(w + 0.4, 0.16, 0.16, M.darkWood);
      ridge.position.set(0, h + rise, 0);
      g.add(ridge);
    }
    if (chimney) {
      const cx = (w / 2 - 0.5) * (rng() < 0.5 ? -1 : 1);
      const ch = box(0.8, h + 2.2, 0.8, M.brick);
      ch.position.set(cx, (h + 2.2) / 2, d / 2 - 0.5);
      g.add(solid(ch));
    }
    // a couple of interior props
    const table = box(1.2, 0.08, 0.7, M.wood);
    table.position.set(rand(-w / 4, w / 4), 0.45, rand(-d / 4, d / 4));
    table.rotation.set(0.35, rand(0, PI), 0.1);
    g.add(table);
    const chair = box(0.45, 0.9, 0.45, M.darkWood);
    chair.position.set(rand(-w / 3, w / 3), 0.25, rand(-d / 3, d / 3));
    chair.rotation.set(PI / 2, rand(0, PI), 0);
    g.add(chair);
    if (graffiti) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(3.2, w / 2 - 0.4), 1.2),
        new THREE.MeshStandardMaterial({
          map: textTexture([graffiti], { bg: null, fg: '#8e1b14', font: 'bold 150px Impact, sans-serif', grime: false }),
          transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1,
        })
      );
      sign.position.set(-w / 4 - 0.3, 1.5, -d / 2 - T / 2 - 0.02);
      sign.rotation.y = PI;
      g.add(sign);
    }
    place(g, x, z, rot, 0.05);
    reserve(x, z, Math.hypot(w, d) / 2 + 2);
    lootSpots.push({ x, z });
    // bits of the house lying outside it
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1;
      const p = toWorld(g, side * (w / 2 + 1.1), rand(-d / 3, d / 3));
      if (rng() < 0.7) rubble(p.x, p.z, wall);
    }
    return g;
  }

  // ---------------------------------------------------------------- hide and seek (Hideaway Village)
  // Things to hide in, behind and under: bushes you can stand inside, a hedge maze, corn taller than you,
  // sheds and toilets with doors, a playground and an orchard.
  const lambert = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const HM = {
    leaf: [lambert(0x4f8a34), lambert(0x3e7a2c), lambert(0x6a9a3a)],
    hedge: lambert(0x3a7a2c),
    corn: lambert(0x8fae48),
    cornLeaf: lambert(0x6f9a36),
    tassel: lambert(0xe0c060),
    red: lambert(0xc8402a),
    blue: lambert(0x2f6fd0),
    yellow: lambert(0xf0c030),
  };
  const leafGeo = new THREE.DodecahedronGeometry(1, 0);
  // a leafy bush you can walk into and crouch in (it doesn't stop you, it just hides you)
  function bush(x, z, s = rand(0.9, 1.35)) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const r = rand(0.75, 1.1) * s;
      const m = meshOf(leafGeo, pick(HM.leaf));
      m.scale.setScalar(r);
      m.position.set(rand(-0.75, 0.75) * s, r * 0.72, rand(-0.75, 0.75) * s);
      m.rotation.set(rand(0, PI), rand(0, PI), 0);
      g.add(m);
    }
    place(g, x, z, 0, 0.1);
    reserve(x, z, 1.3 * s);
    hideSpots.push({ x, z });
    return g;
  }
  // a round orchard tree (solid trunk, a big leafy top)
  function roundTree(x, z, s = rand(0.9, 1.3)) {
    const g = new THREE.Group();
    const trunk = cyl(0.18 * s, 0.26 * s, 3 * s, M.tree, 7);
    trunk.position.y = 1.5 * s;
    g.add(solid(trunk));
    for (let i = 0; i < 3; i++) {
      const m = meshOf(leafGeo, pick(HM.leaf));
      m.scale.setScalar(rand(1.3, 1.8) * s);
      m.position.set(rand(-0.7, 0.7) * s, (3.4 + rand(0, 1)) * s, rand(-0.7, 0.7) * s);
      g.add(m);
    }
    place(g, x, z, rand(0, PI), 0.1);
    reserve(x, z, 1.2);
    return g;
  }
  // a hedge maze (made from the map's seeded random numbers, so it's the same maze for everyone)
  function hedgeMaze(cx, cz, cells = 6, size = 5) {
    const N = cells;
    const H = 2.6;
    // walls between cells: horiz[r][c] is the wall above cell (r, c); vert[r][c] the wall left of it
    const horiz = Array.from({ length: N + 1 }, () => Array(N).fill(true));
    const vert = Array.from({ length: N }, () => Array(N + 1).fill(true));
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const stack = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const next = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]);
      if (!next.length) {
        stack.pop();
        continue;
      }
      const [a, b] = next[Math.floor(rng() * next.length)];
      if (a !== r) horiz[Math.max(a, r)][c] = false;
      else vert[r][Math.max(b, c)] = false;
      seen[a][b] = true;
      stack.push([a, b]);
    }
    // ways in on all four sides
    const mid = Math.floor(N / 2);
    horiz[0][mid] = horiz[N][mid - 1] = false;
    vert[mid][0] = vert[mid - 1][N] = false;
    const g = new THREE.Group();
    const half = (N * size) / 2;
    const wall = (x, z, alongX) => {
      const m = box(alongX ? size + 0.9 : 0.9, H, alongX ? 0.9 : size + 0.9, HM.hedge);
      m.position.set(x, H / 2, z);
      g.add(solid(m));
    };
    for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) if (horiz[r][c]) wall(-half + (c + 0.5) * size, -half + r * size, true);
    for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) if (vert[r][c]) wall(-half + c * size, -half + (r + 0.5) * size, false);
    // a statue in the middle
    const plinth = box(1.2, 0.8, 1.2, M.stone);
    plinth.position.y = 0.4;
    g.add(solid(plinth));
    const statue = meshOf(new THREE.DodecahedronGeometry(0.55, 0), M.stone);
    statue.position.y = 1.35;
    g.add(statue);
    place(g, cx, cz, 0, 0.05);
    reserve(cx, cz, half * 1.42 + 1);
    return g;
  }
  // a field of corn taller than you (instanced: one draw for the stalks, one for the leaves, one for the tops)
  function cornField(cx, cz, w, d) {
    const pts = [];
    for (let x = -w / 2; x < w / 2; x += 0.95) for (let z = -d / 2; z < d / 2; z += 0.95) if (rng() > 0.07) pts.push([cx + x + rand(-0.25, 0.25), cz + z + rand(-0.25, 0.25), rand(2.1, 2.7)]);
    const stalkGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
    stalkGeo.translate(0, 0.5, 0);
    const stalks = new THREE.InstancedMesh(stalkGeo, HM.corn, pts.length);
    const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), HM.tassel, pts.length);
    const leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 0.2), HM.cornLeaf, pts.length * 3);
    const o = new THREE.Object3D();
    pts.forEach(([x, z, h], i) => {
      const y = heightAt(x, z) - 0.05;
      o.position.set(x, y, z);
      o.rotation.set(rand(-0.05, 0.05), 0, rand(-0.05, 0.05));
      o.scale.set(1, h, 1);
      o.updateMatrix();
      stalks.setMatrixAt(i, o.matrix);
      o.scale.set(1, 1, 1);
      o.position.y = y + h + 0.1;
      o.updateMatrix();
      tops.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) {
        o.position.set(x, y + h * (0.3 + k * 0.22), z);
        o.rotation.set(0, rand(0, PI), rand(-0.5, -0.2));
        o.updateMatrix();
        leaves.setMatrixAt(i * 3 + k, o.matrix);
      }
    });
    for (const m of [stalks, tops, leaves]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    reserve(cx, cz, Math.hypot(w, d) / 2);
    for (let i = 0; i < 6; i++) hideSpots.push({ x: cx + rand(-w / 2.5, w / 2.5), z: cz + rand(-d / 2.5, d / 2.5) });
    // a scarecrow keeping watch
    const sc = new THREE.Group();
    const pole = box(0.12, 2.6, 0.12, M.wood);
    pole.position.y = 1.3;
    const arms = box(1.6, 0.1, 0.1, M.wood);
    arms.position.y = 2;
    const coat = box(0.6, 0.8, 0.3, HM.red);
    coat.position.y = 1.8;
    const head = box(0.4, 0.4, 0.4, M.hay);
    head.position.y = 2.45;
    sc.add(pole, arms, coat, head);
    place(sc, cx + rand(-w / 4, w / 4), cz + rand(-d / 4, d / 4), rand(0, PI));
  }
  // a little shed (or a toilet) with a door you can duck into
  function shed(x, z, rot, { w = 3.4, d = 2.8, h = 2.4, wall = pick([M.woodWall, M.barnRed, M.darkWood]) } = {}) {
    const g = new THREE.Group();
    const T = 0.15;
    const door = Math.min(1.2, w - 0.8);
    const piece = (pw, ph, pd, px, py, pz, overhead = false) => {
      const m = box(pw, ph, pd, wall);
      m.position.set(px, py, pz);
      if (overhead) m.userData.overhead = true;
      g.add(solid(m));
    };
    piece(w, h, T, 0, h / 2, -d / 2);
    piece(T, h, d, -w / 2, h / 2, 0);
    piece(T, h, d, w / 2, h / 2, 0);
    const side = (w - door) / 2;
    piece(side, h, T, -w / 2 + side / 2, h / 2, d / 2);
    piece(side, h, T, w / 2 - side / 2, h / 2, d / 2);
    piece(door, 0.4, T, 0, h - 0.2, d / 2, true);
    const roof = box(w + 0.4, 0.12, d + 0.5, M.roof);
    roof.position.y = h + 0.12;
    roof.rotation.x = 0.08;
    g.add(roof);
    const floor = box(w, 0.08, d, M.planks);
    floor.position.y = 0.04;
    g.add(floor);
    if (w > 2.5) {
      const junk = box(0.7, 0.6, 0.6, M.wood);
      junk.position.set(w / 2 - 0.6, 0.3, -d / 2 + 0.5);
      g.add(junk);
    }
    place(g, x, z, rot, 0.05);
    reserve(x, z, Math.hypot(w, d) / 2 + 0.8);
    hideSpots.push(toWorld(g, 0, -d / 4)); // just inside, at the back
    return g;
  }
  // a playground: a slide with a platform you can climb onto, a tunnel to crawl in, swings
  function playground(x, z, rot) {
    const g = new THREE.Group();
    const top = 1.8;
    for (const [px, pz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const post = box(0.12, top + 1, 0.12, HM.blue);
      post.position.set(px, (top + 1) / 2, pz);
      g.add(solid(post));
    }
    const deck = box(1.8, 0.15, 1.8, M.planks);
    deck.position.y = top;
    deck.userData.overhead = true;
    g.add(solid(deck));
    const slide = box(0.8, 0.06, 3.6, HM.yellow);
    slide.position.set(0, top / 2, 2.6);
    slide.rotation.x = Math.atan2(top, 3.4);
    g.add(slide);
    ladder(g, 0, -0.95, 0, -1, top);
    // a red tunnel lying on the grass
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.2, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xc8402a, roughness: 0.8, side: THREE.DoubleSide }));
    tube.rotation.z = PI / 2;
    tube.position.set(-4.5, 0.7, 0);
    tube.castShadow = true;
    g.add(tube);
    // swings
    for (const sx of [3.6, 6]) {
      for (const sz of [-1.2, 1.2]) {
        const leg = box(0.1, 2.6, 0.1, HM.red);
        leg.position.set(sx, 1.3, sz);
        g.add(solid(leg));
      }
      const bar = box(0.12, 0.12, 2.6, HM.red);
      bar.position.set(sx, 2.6, 0);
      g.add(bar);
      const seat = box(0.5, 0.06, 0.25, M.rubber);
      seat.position.set(sx, 0.55, 0);
      g.add(seat);
    }
    place(g, x, z, rot, 0.05);
    reserve(x, z, 8);
    return g;
  }

  // ---------------------------------------------------------------- adverts
  // The owner's JINtelligence ads (public/textures/ads): on billboards, poster stands and the warehouse walls.
  // Lit a little from inside so they read at dusk too. ads = false (admin panel) leaves them all out.
  const AD_SETS = {
    billboard: ['billboard-levelup', 'billboard-stuck', 'billboard-logo-red', 'billboard-subjects', 'billboard-revise', 'billboard-logo-light'],
    poster: ['poster-stuck', 'poster-logo-red', 'poster-levelup', 'poster-subjects', 'poster-logo-light', 'poster-revise'],
    banner: ['banner-logo-red', 'banner-logo-light'],
    square: ['square-logo-red', 'square-logo-light'],
  };
  const adCount = { billboard: 0, poster: 0, banner: 0, square: 0 };
  let houseAds = 0;
  const mapNo = Math.max(0, MAP_IDS.indexOf(mapId));
  const adMats = {};
  const adLoader = new THREE.TextureLoader();
  // the next ad of a kind (each map starts at a different one, so they're all seen)
  function adMat(kind) {
    const list = AD_SETS[kind];
    const name = list[(adCount[kind]++ + mapNo) % list.length];
    if (!adMats[name]) {
      const tex = adLoader.load(`/textures/ads/${name}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      adMats[name] = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.85 });
    }
    return adMats[name];
  }
  // an ad facing +z on `parent`, centred at (x, y, z)
  function adPanel(parent, kind, w, h, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), adMat(kind));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    m.userData.ad = kind;
    parent.add(m);
    return m;
  }
  // a big roadside billboard on two legs, an ad on each face
  function billboard(x, z, rot) {
    const g = new THREE.Group();
    const W = 6.4;
    const H = W * (9 / 16);
    const y = 3.2 + H / 2;
    for (const s of [-1, 1]) {
      const leg = cyl(0.14, 0.16, y + H / 2, M.metalDark);
      leg.position.set(s * W * 0.3, (y + H / 2) / 2, -0.25);
      g.add(solid(leg));
    }
    const brace = box(W * 0.6, 0.12, 0.12, M.metalDark);
    brace.position.set(0, 2.2, -0.25);
    g.add(brace);
    const frame = box(W + 0.3, H + 0.3, 0.2, M.metalDark);
    frame.position.y = y;
    g.add(solid(frame, false)); // stops bullets; you can walk under it
    adPanel(g, 'billboard', W, H, 0, y, 0.11);
    adPanel(g, 'billboard', W, H, 0, y, -0.11, PI);
    // a catwalk and a couple of lamps along the top
    const walk = box(W, 0.08, 0.6, M.metalDark);
    walk.position.set(0, y - H / 2 - 0.3, 0.35);
    g.add(walk);
    for (const s of [-1, 1]) {
      const lamp = box(0.35, 0.12, 0.3, M.metalDark);
      lamp.position.set(s * W * 0.3, y + H / 2 + 0.3, 0.45);
      g.add(lamp);
    }
    place(g, x, z, rot, 0.1);
    reserve(x, z, W / 2 + 0.5);
    return g;
  }
  // a poster on a post, an ad on each face
  function posterStand(x, z, rot) {
    const g = new THREE.Group();
    const W = 1.3;
    const H = W * 1.5;
    // a leg each side, so nothing covers the poster
    for (const side of [-1, 1]) {
      const post = cyl(0.06, 0.07, 2.75, M.metalDark);
      post.position.set(side * (W / 2 + 0.1), 1.375, 0);
      g.add(solid(post));
    }
    const frame = box(W + 0.12, H + 0.12, 0.08, M.darkWood);
    frame.position.y = 1.75;
    g.add(solid(frame));
    adPanel(g, 'poster', W, H, 0, 1.75, 0.05);
    adPanel(g, 'poster', W, H, 0, 1.75, -0.05, PI);
    place(g, x, z, rot, 0.05);
    reserve(x, z, 1.2);
    return g;
  }
  // facing the middle of the map from (x, z)
  const faceIn = (x, z) => Math.atan2(-x, -z);
  // spread round the map: n ads in n directions, each at a different distance from the middle (so they
  // aren't all in one ring), at the first clear spot near there. turn: where the first one goes.
  function adSpots(n, r0, r1, need, fn, turn = 0) {
    for (let i = 0; i < n; i++) {
      const a0 = ((i + turn) / n) * PI * 2 + mapNo * 0.7;
      const rBase = r0 + ((i * 0.618 + 0.25) % 1) * (r1 - r0);
      let done = false;
      for (let t = 0; t < 16 && !done; t++) {
        const a = a0 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.09;
        const r = THREE.MathUtils.clamp(rBase + (t % 3 - 1) * 6, r0, r1);
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        if (Math.hypot(x, z) > ARENA_RADIUS - 8 || !isFree(x, z, need)) continue;
        fn(x, z, faceIn(x, z));
        done = true;
      }
    }
  }
  function adverts() {
    if (!ads) return;
    adSpots(3, 55, 95, 4.5, billboard);
    adSpots(6, 22, 85, 1.4, posterStand, 0.5); // in between the billboards' directions
  }

  // ---------------------------------------------------------------- Halloween (only while the event is on)
  // Jack-o'-lanterns everywhere (some glowing), little graveyards, bubbling cauldrons, pumpkin-head scarecrows,
  // string lights round the middle, ghosts drifting about and bats circling overhead.
  function halloweenDecor() {
    const at = (obj, x, z, rot = 0, y = 0) => {
      obj.position.set(x, heightAt(x, z) + y, z);
      obj.rotation.y = rot;
      root.add(obj);
      return obj;
    };
    // pumpkins: on the ground round the map, by the houses, a few glowing near the middle
    let lit = 0;
    scatter(46, 0.8, (x, z) => {
      const p = jackOLantern(rand(0.45, 0.8), { light: Math.hypot(x, z) < 45 && lit++ < 3, carved: rng() < 0.75 }); // only a few real lights: each one costs
      at(p, x, z, faceIn(x, z) + rand(-0.6, 0.6), 0.22);
    }, 10, ARENA_RADIUS - 6);
    for (const s of lootSpots.filter((o) => !o.high && !o.roof).slice(0, 14)) at(jackOLantern(0.5), s.x + rand(-1.5, 1.5), s.z + rand(-1.5, 1.5), rand(0, PI * 2), 0.18);
    // a pile of pumpkins in the middle of the map
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      at(jackOLantern(0.7, { light: i === 0 }), Math.cos(a) * 1.1 + 13, Math.sin(a) * 1.1, a + PI / 2, 0.26);
    }
    at(jackOLantern(0.9), 13, 0, -PI / 2, 0.85);
    // little graveyards
    let yards = 0;
    scatter(3, 7, (x, z) => {
      graveyard(x, z, rand(0, PI), 2, 4);
      at(jackOLantern(0.6), x + 3, z + 3, rand(0, PI * 2), 0.22);
      yards++;
    }, 30, ARENA_RADIUS - 12);
    // cauldrons bubbling green
    scatter(2, 2.5, (x, z) => {
      const g = new THREE.Group();
      const pot = cyl(0.75, 0.55, 0.9, M.metalDark, 12);
      pot.position.y = 0.45;
      g.add(solid(pot));
      const brew = sharedMesh(HW.brew, glowMat('green'));
      brew.rotation.x = -PI / 2;
      brew.position.y = 0.86;
      g.add(brew);
      const light = new THREE.PointLight(0x7dff3a, 2, 7, 2);
      light.position.y = 1.4;
      g.add(light);
      const bubbles = [];
      for (let i = 0; i < 5; i++) {
        const b = sharedMesh(HW.bubble, glowMat('green'));
        b.userData.off = rng();
        g.add(b);
        bubbles.push(b);
      }
      updaters.push((dt, t) => {
        for (const b of bubbles) {
          const k = (t * 0.6 + b.userData.off) % 1;
          b.position.set(Math.sin(b.userData.off * 9) * 0.4, 0.9 + k * 0.6, Math.cos(b.userData.off * 7) * 0.4);
          b.scale.setScalar(1 - k);
        }
      });
      at(g, x, z);
      reserve(x, z, 1.4);
    }, 18, 70);
    // pumpkin-head scarecrows
    scatter(3, 1.5, (x, z) => {
      const g = new THREE.Group();
      const pole = box(0.12, 2.4, 0.12, M.wood);
      pole.position.y = 1.2;
      const arms = box(1.7, 0.1, 0.1, M.wood);
      arms.position.y = 1.85;
      const coat = box(0.65, 0.85, 0.32, M.darkWood);
      coat.position.y = 1.65;
      g.add(pole, arms, coat);
      const head = jackOLantern(0.6);
      head.position.y = 2.35;
      g.add(head);
      at(g, x, z, faceIn(x, z));
      reserve(x, z, 1);
    }, 20, 80);
    // string lights round the middle: posts in a ring, orange and purple bulbs sagging between them
    const N = 10;
    const R = 17;
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1410 });
    const posts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * PI * 2 + 0.15;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const post = cyl(0.06, 0.07, 3.2, M.darkWood, 6);
      post.position.y = 1.6;
      const g = new THREE.Group();
      g.add(solid(post));
      at(g, x, z);
      posts.push([x, heightAt(x, z) + 3.1, z]);
    }
    for (let i = 0; i < N; i++) {
      const [x0, y0, z0] = posts[i];
      const [x1, y1, z1] = posts[(i + 1) % N];
      const wire = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        wire.push(new THREE.Vector3(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - Math.sin(f * PI) * 0.6 + 0.08, z0 + (z1 - z0) * f));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), wireMat));
      for (let k = 1; k < 8; k++) {
        const f = k / 8;
        const bulb = sharedMesh(HW.bulb, glowMat(k % 2 ? 'orange' : 'purple'));
        bulb.position.set(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - Math.sin(f * PI) * 0.6, z0 + (z1 - z0) * f);
        root.add(bulb);
      }
    }
    // ghosts drifting round slowly, bobbing up and down
    const ghosts = [];
    for (let i = 0; i < 7; i++) {
      const g = ghost();
      g.userData.a = rand(0, PI * 2);
      g.userData.r = rand(15, 70);
      g.userData.s = rand(0.03, 0.07) * (rng() < 0.5 ? -1 : 1);
      root.add(g);
      ghosts.push(g);
    }
    // bats circling overhead
    const bats = [];
    for (let i = 0; i < 16; i++) {
      const b = bat();
      b.userData.a = rand(0, PI * 2);
      b.userData.r = rand(8, 40);
      b.userData.cx = rand(-40, 40);
      b.userData.cz = rand(-40, 40);
      b.userData.h = rand(10, 22);
      b.userData.s = rand(0.4, 0.9);
      b.scale.setScalar(rand(1.2, 1.8));
      root.add(b);
      bats.push(b);
    }
    updaters.push((dt, t) => {
      for (const g of ghosts) {
        g.userData.a += g.userData.s * dt;
        const x = Math.cos(g.userData.a) * g.userData.r;
        const z = Math.sin(g.userData.a) * g.userData.r;
        g.position.set(x, heightAt(x, z) + 0.5 + Math.sin(t * 1.3 + g.userData.r) * 0.35, z);
        g.rotation.y = Math.atan2(-Math.sin(g.userData.a) * g.userData.s, Math.cos(g.userData.a) * g.userData.s);
      }
      for (const b of bats) {
        b.userData.a += b.userData.s * dt;
        b.position.set(b.userData.cx + Math.cos(b.userData.a) * b.userData.r, b.userData.h + Math.sin(t * 2 + b.userData.r) * 1.5, b.userData.cz + Math.sin(b.userData.a) * b.userData.r);
        b.rotation.y = -b.userData.a;
        b.userData.flap(t + b.userData.r);
      }
    });
    return yards;
  }

  // ---------------------------------------------------------------- warehouse
  // A big closed warehouse (the owner's model). It's solid: you take cover behind it, you can't go in.
  // Long side along its local z. A plain shed stands in until the model has loaded.
  function warehouse(x, z, rot) {
    const W = 9.6;
    const D = 16.3;
    const H = 7.9;
    const g = new THREE.Group();
    const stand = new THREE.Group();
    const walls = box(W, H * 0.8, D, M.metalDark ?? M.concreteDark);
    walls.position.y = (H * 0.8) / 2;
    const top = box(W + 0.4, 0.3, D + 0.4, M.darkWood);
    top.position.y = H * 0.8;
    stand.add(walls, top);
    g.add(stand);
    // what you bump into and what stops bullets, the same either way
    const hit = proxy(g, W, H, D, 0, H / 2, 0);
    hit.userData.solid = true;
    if (ads) {
      // a long banner down each side, a square sign over the doors
      adPanel(g, 'banner', 7.2, 1.8, W / 2 + 0.06, 4.4, 0, PI / 2);
      adPanel(g, 'banner', 7.2, 1.8, -W / 2 - 0.06, 4.4, 0, -PI / 2);
      adPanel(g, 'square', 2.6, 2.6, 0, 4.6, -D / 2 - 0.1, PI);
    }
    place(g, x, z, rot, 0.25);
    reserve(x, z, Math.hypot(W, D) / 2 + 1.5);
    loadWarehouse().then((model) => {
      if (!model || !root.parent) return; // didn't load, or this map is gone already
      g.add(model.clone(true));
      stand.visible = false;
    });
    return g;
  }

  // ---------------------------------------------------------------- plane wreck
  const smokeSources = [];
  function planeWreck(x, z, rot, s, smoking) {
    const g = new THREE.Group();
    const R = 1.6 * s;
    const hull = M.metal;

    const front = new THREE.Group();
    const fus = meshOf(new THREE.CylinderGeometry(R, R, 9 * s, 16, 1, true), hull);
    fus.material = hull.clone();
    fus.material.side = THREE.DoubleSide;
    fus.rotation.z = PI / 2;
    front.add(solid(fus, false));
    const inner = meshOf(new THREE.CylinderGeometry(R * 0.96, R * 0.96, 9 * s, 16, 1, true), M.interior, { shadow: false });
    inner.rotation.z = PI / 2;
    front.add(inner);
    const nose = meshOf(new THREE.SphereGeometry(R, 16, 10, 0, PI * 2, 0, PI / 2), hull);
    nose.scale.set(1, 1.7, 1);
    nose.rotation.z = -PI / 2;
    nose.position.x = 4.5 * s;
    front.add(solid(nose, false));
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        if (rng() < 0.15) continue;
        const win = box(0.32 * s, 0.38 * s, 0.06, M.glass);
        win.position.set(3.4 * s - i * 0.9 * s, R * 0.3, side * R * 0.955);
        win.castShadow = false;
        front.add(win);
      }
    }
    const cockpit = box(0.9 * s, 0.35 * s, R * 1.3, M.glass);
    cockpit.position.set(5.6 * s, R * 0.55, 0);
    cockpit.rotation.z = -0.5;
    front.add(cockpit);
    // livery stripe
    for (const side of [-1, 1]) {
      const stripe = box(9 * s, 0.2 * s, 0.03, M.redPaint);
      stripe.position.set(0, -R * 0.05, side * R * 1.0);
      stripe.castShadow = false;
      front.add(stripe);
    }
    // torn metal at the break
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      const shard = box(rand(0.5, 1.3) * s, 0.05, rand(0.3, 0.7) * s, hull);
      shard.position.set(-4.6 * s, Math.sin(a) * R, Math.cos(a) * R);
      shard.rotation.set(a, 0, rand(-0.6, 0.6));
      front.add(shard);
    }
    front.position.set(2 * s, R * 0.72, 0);
    front.rotation.set(0.12, 0, -0.06);
    g.add(front);
    proxy(g, 9 * s + 2 * R, 2 * R, 2 * R, 2.4 * s, R * 0.72, 0);

    // Tail section broken off and twisted
    const tail = new THREE.Group();
    const tcone = meshOf(new THREE.CylinderGeometry(R * 0.35, R * 0.92, 7 * s, 14, 1, true), hull);
    tcone.material = fus.material;
    tcone.rotation.z = PI / 2;
    tail.add(solid(tcone, false));
    const tinner = meshOf(new THREE.CylinderGeometry(R * 0.33, R * 0.88, 7 * s, 14, 1, true), M.interior, { shadow: false });
    tinner.rotation.z = PI / 2;
    tail.add(tinner);
    const fin = box(2.6 * s, 3.2 * s, 0.22 * s, hull);
    fin.position.set(-2.6 * s, R * 0.35 + 1.5 * s, 0);
    fin.rotation.z = 0.45;
    tail.add(solid(fin, false));
    const finMark = box(1.4 * s, 1.2 * s, 0.24 * s, M.redPaint);
    finMark.position.set(-2.9 * s, R * 0.35 + 2.0 * s, 0);
    finMark.rotation.z = 0.45;
    tail.add(finMark);
    const stab = box(1.8 * s, 0.14 * s, 6 * s, hull);
    stab.position.set(-2.9 * s, R * 0.3, 0);
    stab.rotation.x = 0.1;
    tail.add(stab);
    tail.position.set(-9.5 * s, R * 0.62, 1.8 * s);
    tail.rotation.set(0.35, 0.35, 0.02);
    g.add(tail);
    proxy(g, 7 * s, 1.8 * R, 1.6 * R, -9.5 * s, R * 0.62, 1.8 * s, 0.35);

    // Attached wing dug into the dirt
    const wing = box(3.2 * s, 0.32 * s, 11 * s, hull);
    wing.position.set(1.8 * s, R * 0.35, R + 5.2 * s);
    wing.rotation.set(0.05, -0.12, 0);
    g.add(solid(wing));
    const eng = cyl(0.75 * s, 0.6 * s, 2.8 * s, M.metalDark, 14);
    eng.rotation.z = PI / 2;
    eng.position.set(2.6 * s, 0.6 * s, R + 3.6 * s);
    g.add(solid(eng, false));
    proxy(g, 2.8 * s, 1.4 * s, 1.5 * s, 2.6 * s, 0.6 * s, R + 3.6 * s);
    // Detached wing
    const wing2 = box(3.0 * s, 0.32 * s, 9 * s, hull);
    wing2.position.set(-3 * s, 0.45 * s, -(R + 8 * s));
    wing2.rotation.set(-0.05, 0.6, 0.14);
    g.add(solid(wing2));
    // Fallen engine
    const eng2 = cyl(0.75 * s, 0.6 * s, 2.8 * s, M.burnt, 14);
    eng2.rotation.set(0.3, 0.8, PI / 2);
    eng2.position.set(9 * s, 0.6 * s, -4 * s);
    g.add(solid(eng2, false));
    proxy(g, 2.4 * s, 1.4 * s, 1.6 * s, 9 * s, 0.6 * s, -4 * s, 0.8);

    // Debris field
    for (let i = 0; i < 26; i++) {
      const a = rand(0, PI * 2);
      const r = rand(3, 16) * s;
      const piece = box(rand(0.4, 1.8) * s, rand(0.04, 0.25), rand(0.3, 1.2) * s, rng() < 0.7 ? hull : M.burnt);
      piece.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      piece.rotation.set(rand(-0.6, 0.6), rand(0, PI), rand(-0.6, 0.6));
      g.add(piece);
    }
    // Suitcases
    for (let i = 0; i < 5; i++) {
      const bag = box(0.7, 0.25, 0.45, pick([M.paintA, M.paintB, M.paintC, M.redPaint]));
      bag.position.set(rand(-8, 8) * s, 0.12, rand(-6, 6) * s);
      bag.rotation.set(0, rand(0, PI), rand(-0.3, 0.3));
      g.add(bag);
    }
    place(g, x, z, rot, 0.25);
    conform(26 * s, 20 * s, 12, 10, x, z, rot, scorchMat, 0.06);
    reserve(x, z, 16 * s);
    // on top of the fuselage, reachable by climbing up the wing
    const top = new THREE.Vector3(1.5 * s, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    lootSpots.push({ x: x + top.x, z: z + top.z });
    if (smoking) {
      const local = new THREE.Vector3(-4.5 * s, R, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      smokeSources.push(new THREE.Vector3(x + local.x, heightAt(x, z) + R, z + local.z));
      const local2 = new THREE.Vector3(9 * s, 0.8, -4 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      smokeSources.push(new THREE.Vector3(x + local2.x, heightAt(x, z) + 0.8, z + local2.z));
    }
  }

  // ---------------------------------------------------------------- vehicles
  function car(x, z, rot, { flipped = false } = {}) {
    const g = new THREE.Group();
    const paint = pick([M.paintA, M.paintB, M.paintC, M.paintD, M.rust2]);
    const body = box(4.2, 0.8, 1.9, paint);
    body.position.y = 0.78;
    g.add(solid(body, false));
    const cabin = box(2.2, 0.68, 1.7, M.glass);
    cabin.position.set(-0.25, 1.5, 0);
    g.add(solid(cabin, false));
    const roof = box(2.25, 0.08, 1.76, paint);
    roof.position.set(-0.25, 1.87, 0);
    g.add(roof);
    const rustPatch = box(1.2, 0.82, 1.92, M.rust);
    rustPatch.position.set(1.2, 0.78, 0);
    g.add(rustPatch);
    let missing = rng() < 0.6 ? Math.floor(rng() * 4) : -1;
    [[1.3, 0.95], [1.3, -0.95], [-1.3, 0.95], [-1.3, -0.95]].forEach(([wx, wz], i) => {
      if (i === missing) return;
      const wheel = cyl(0.38, 0.38, 0.28, M.rubber, 12);
      wheel.rotation.x = PI / 2;
      wheel.position.set(wx, 0.38, wz);
      g.add(wheel);
    });
    if (missing >= 0) {
      g.rotation.z = missing < 2 ? 0.07 : -0.07;
      g.rotation.x = missing % 2 === 0 ? 0.06 : -0.06;
    }
    const outer = new THREE.Group();
    outer.add(g);
    if (flipped) {
      g.rotation.x = PI;
      g.position.y = 1.95;
    }
    if (flipped) {
      proxy(outer, 4.2, 1.6, 1.9, 0, 0.8, 0);
    } else {
      // hood/trunk you can hop onto, then the roof
      proxy(outer, 4.2, 1.15, 1.9, 0, 0.575, 0);
      proxy(outer, 2.3, 1.9, 1.75, -0.25, 0.95, 0);
    }
    place(outer, x, z, rot, 0.05);
    reserve(x, z, 3.5);
    if (!flipped) {
      const roof = new THREE.Vector3(-0.25, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      lootSpots.push({ x: x + roof.x, z: z + roof.z, roof: true });
    }
  }

  // ---------------------------------------------------------------- structures
  // A ladder against something, built in the parent's local space. (nx, nz) points out from the wall.
  function ladder(parent, lx, lz, nx, nz, height) {
    const g = new THREE.Group();
    g.position.set(lx, 0, lz);
    g.rotation.y = Math.atan2(nx, nz);
    for (const side of [-0.28, 0.28]) {
      const rail = box(0.06, height + 0.9, 0.06, M.metalDark);
      rail.position.set(side, (height + 0.9) / 2, 0);
      g.add(rail);
    }
    for (let y = 0.3; y < height + 0.5; y += 0.35) {
      const rung = box(0.56, 0.04, 0.04, M.metalDark);
      rung.position.set(0, y, 0);
      rung.castShadow = false;
      g.add(rung);
    }
    parent.add(g);
    pendingLadders.push({ parent, lx, lz, nx, nz, height });
  }

  // Converts a point in a placed group's local XZ space to world space.
  const toWorld = (g, lx, lz) => {
    const c = Math.cos(g.rotation.y);
    const s = Math.sin(g.rotation.y);
    return { x: g.position.x + c * lx + s * lz, z: g.position.z - s * lx + c * lz };
  };

  function waterTower(x, z) {
    const g = new THREE.Group();
    const lean = new THREE.Group();
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = cyl(0.14, 0.18, 10, M.rust, 8);
      leg.position.set(lx * 0.9, 5, lz * 0.9);
      leg.rotation.set(lz * 0.03, 0, -lx * 0.03);
      lean.add(solid(leg, false));
      proxy(g, 0.5, 10, 0.5, lx * 0.9, 5, lz * 0.9);
    }
    for (const y of [3, 6.5]) {
      for (const side of [-1.8, 1.8]) {
        const bx = box(3.8, 0.1, 0.1, M.rust);
        bx.position.set(0, y, side);
        lean.add(bx);
        const bz = box(0.1, 0.1, 3.8, M.rust);
        bz.position.set(side, y, 0);
        lean.add(bz);
      }
    }
    const tank = cyl(2.7, 2.7, 3.6, M.rust2, 18);
    tank.position.y = 11.6;
    lean.add(solid(tank, false));
    const cap = meshOf(new THREE.ConeGeometry(2.9, 1.4, 18), M.rust);
    cap.position.y = 14.1;
    lean.add(cap);
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(2.72, 2.72, 1.2, 18, 1, true, -0.7, 1.4),
      new THREE.MeshStandardMaterial({ map: textTexture(['DUSTWATER'], { bg: '#8f5b33', fg: '#d9cbb0', w: 512, h: 128, font: 'bold 90px Impact, sans-serif' }), roughness: 1 })
    );
    label.position.y = 11.9;
    label.rotation.y = PI;
    lean.add(label);
    g.add(lean);

    // walkway around the tank, reached by a ladder
    const deck = box(7, 0.15, 7, M.planks);
    deck.position.y = 9.72;
    deck.userData.overhead = true;
    g.add(solid(deck));
    proxy(g, 4.8, 3.6, 4.8, 0, 11.6, 0).userData.overhead = true;
    const railSegs = [
      [7, 0.1, 0, -3.45], [7, 0.1, 0, 3.45], [0.1, 7, -3.45, 0],
      [0.1, 2.85, 3.45, -2.07], [0.1, 2.85, 3.45, 2.07],
    ];
    for (const [w, d, rx, rz] of railSegs) {
      const rail = box(w, 0.08, d, M.rust);
      rail.position.set(rx, 10.75, rz);
      g.add(rail);
      const mid = box(w, 0.06, d, M.rust);
      mid.position.set(rx, 10.3, rz);
      g.add(mid);
      proxy(g, Math.max(w, 0.15), 1.0, Math.max(d, 0.15), rx, 10.3, rz).userData.overhead = true;
    }
    for (const [px, pz] of [[-3.45, -3.45], [3.45, -3.45], [-3.45, 3.45], [3.45, 3.45], [3.45, -0.65], [3.45, 0.65]]) {
      const post = box(0.08, 1.0, 0.08, M.rust);
      post.position.set(px, 10.3, pz);
      g.add(post);
    }
    ladder(g, 3.6, 0, 1, 0, 9.8);
    place(g, x, z, 0.4);
    reserve(x, z, 5);
    const top = toWorld(g, 0, -3);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  function windmill(x, z) {
    const g = new THREE.Group();
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.14, 11, 0.14, M.metalDark);
      leg.position.set(lx * 0.85, 5.5, lz * 0.85);
      leg.rotation.set(-lz * 0.12, 0, lx * 0.12);
      g.add(leg);
      proxy(g, 0.4, 11, 0.4, lx * 0.85, 5.5, lz * 0.85);
    }
    for (let y = 2; y < 10; y += 2.5) {
      const ring = box(2.6 - y * 0.18, 0.08, 2.6 - y * 0.18, M.metalDark);
      ring.position.y = y;
      ring.scale.y = 0.6;
      g.add(ring);
    }
    const head = new THREE.Group();
    head.position.set(0, 11.2, 0);
    const hub = cyl(0.25, 0.25, 0.6, M.metalDark, 10);
    hub.rotation.x = PI / 2;
    head.add(hub);
    const rotor = new THREE.Group();
    rotor.position.z = 0.4;
    for (let i = 0; i < 14; i++) {
      if (i % 5 === 3) continue; // missing blades
      const blade = box(0.32, 1.9, 0.04, M.metal);
      const a = (i / 14) * PI * 2;
      blade.position.set(Math.sin(a) * 1.3, Math.cos(a) * 1.3, 0);
      blade.rotation.z = -a;
      blade.rotation.y = 0.35;
      rotor.add(blade);
    }
    head.add(rotor);
    const vane = box(0.05, 1.0, 2.2, M.rust);
    vane.position.set(0, 0.2, -1.6);
    head.add(vane);
    g.add(head);
    const deck = box(2.7, 0.12, 2.7, M.planks);
    deck.position.y = 9.0;
    deck.userData.overhead = true;
    g.add(solid(deck));
    ladder(g, 1.42, 0, 1, 0, 9.06);
    place(g, x, z, 0.8);
    reserve(x, z, 3);
    lootSpots.push({ x, z, high: true });
    updaters.push((dt, t) => {
      rotor.rotation.z += dt * (0.6 + Math.sin(t * 0.3) * 0.4);
    });
  }

  function gasStation(x, z, rot) {
    const g = new THREE.Group();
    const slab = box(14, 0.2, 9, M.concrete);
    slab.position.y = 0.05;
    g.add(slab);
    const canopy = box(12, 0.5, 7, M.paintD);
    canopy.position.set(-0.8, 4.4, 0);
    canopy.rotation.z = -0.12; // one pillar gave way
    g.add(canopy);
    for (const [px, pz, h] of [[-5, -2.8, 4.6], [-5, 2.8, 4.6], [4.2, -2.8, 3.4]]) {
      const pillar = box(0.45, h, 0.45, M.concrete);
      pillar.position.set(px, h / 2, pz);
      g.add(solid(pillar));
    }
    const brokenPillar = box(0.45, 1.3, 0.45, M.concrete);
    brokenPillar.position.set(4.2, 0.65, 2.8);
    g.add(solid(brokenPillar));
    const fallenPillar = box(0.45, 3, 0.45, M.concrete);
    fallenPillar.position.set(5.8, 0.3, 3.6);
    fallenPillar.rotation.set(0, 0.4, PI / 2);
    g.add(fallenPillar);
    for (const pz of [-1.2, 1.2]) {
      const pump = box(0.7, 1.5, 0.5, M.redPaint);
      pump.position.set(-0.5, 0.85, pz);
      if (pz > 0) pump.rotation.z = 1.2;
      g.add(solid(pump));
    }
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.6, 0.15),
      [M.metalDark, M.metalDark, M.metalDark, M.metalDark,
        new THREE.MeshStandardMaterial({ map: textTexture(['GAS', 'CLOSED FOREVER'], { bg: '#c9b48c', fg: '#6e2a1f', font: 'bold 70px Impact, sans-serif' }), roughness: 1 }),
        M.metalDark]
    );
    sign.position.set(-6.5, 6.2, -4);
    sign.rotation.z = 0.08;
    g.add(sign);
    const post = cyl(0.12, 0.12, 5.6, M.metalDark);
    post.position.set(-6.5, 2.8, -4);
    g.add(solid(post));
    // small shop ruin behind the pumps
    place(g, x, z, rot, 0.05);
    reserve(x, z, 9);
    lootSpots.push({ x: x + Math.sin(rot) * 3, z: z + Math.cos(rot) * 3 });
    brokenHouse(x + Math.sin(rot) * -8, z + Math.cos(rot) * -8, rot, 6, 4.5, { h: 3, wall: M.plaster2, chimney: false, roof: false });
  }

  function deadTree(x, z) {
    const g = new THREE.Group();
    const h = rand(3, 5.5);
    const trunk = cyl(0.18, 0.35, h, M.tree, 7);
    trunk.position.y = h / 2;
    trunk.rotation.z = rand(-0.1, 0.1);
    g.add(solid(trunk, false));
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const bl = rand(1, 2.4);
      const br = cyl(0.04, 0.11, bl, M.tree, 5);
      const tilt = rand(0.5, 1.1);
      const pivot = new THREE.Group();
      pivot.position.y = rand(h * 0.45, h * 0.95);
      pivot.rotation.y = rand(0, PI * 2);
      br.rotation.z = -tilt;
      br.position.set(Math.sin(tilt) * bl * 0.5, Math.cos(tilt) * bl * 0.5, 0);
      pivot.add(br);
      g.add(pivot);
    }
    proxy(g, 0.6, h, 0.6, 0, h / 2, 0);
    place(g, x, z, rand(0, PI * 2), 0.1);
    reserve(x, z, 1.5);
  }

  function rock(x, z, r) {
    const m = meshOf(new THREE.DodecahedronGeometry(r, 0), pick([M.rock, M.rock2]));
    m.scale.set(rand(0.9, 1.4), rand(0.5, 0.8), rand(0.9, 1.3));
    m.rotation.set(rand(0, PI), rand(0, PI), rand(0, PI));
    m.position.set(x, heightAt(x, z) + r * 0.2, z);
    root.add(m);
    if (r > 0.8) {
      solid(m, false);
      colliders.add(x, z, r * 0.8, r * 0.8, rand(0, PI), heightAt(x, z) + r * 0.75);
    }
    reserve(x, z, r + 0.5);
  }

  function barrel(x, z) {
    const m = cyl(0.36, 0.36, 0.95, pick([M.rust, M.rust2, M.paintC]), 12);
    const tipped = rng() < 0.35;
    if (tipped) {
      m.rotation.set(PI / 2, 0, rand(0, PI));
      m.position.set(x, heightAt(x, z) + 0.34, z);
    } else {
      m.position.set(x, heightAt(x, z) + 0.47, z);
    }
    root.add(solid(m, false));
    colliders.add(x, z, 0.42, 0.42, 0, heightAt(x, z) + (tipped ? 0.7 : 0.95));
    reserve(x, z, 0.8);
  }

  function crate(x, z) {
    const s = rand(0.8, 1.2);
    const m = box(s, s, s, M.wood);
    m.position.set(x, heightAt(x, z) + s / 2 - 0.05, z);
    m.rotation.set(0, rand(0, PI), rand(-0.05, 0.05));
    root.add(solid(m));
    reserve(x, z, s);
  }

  function hayBale(x, z) {
    const g = new THREE.Group();
    const m = cyl(0.75, 0.75, 1.3, M.hay, 14);
    m.rotation.z = PI / 2;
    m.position.y = 0.7;
    g.add(solid(m, false));
    proxy(g, 1.3, 1.5, 1.5, 0, 0.75, 0);
    place(g, x, z, rand(0, PI), 0.05);
    reserve(x, z, 1.4);
  }

  function fenceLine(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 2.5);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      if (rng() < 0.18) continue; // gaps
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const g = new THREE.Group();
      const post = box(0.16, 1.25, 0.16, M.darkWood);
      post.position.set(-1.25, 0.6, 0);
      post.rotation.z = rand(-0.15, 0.15);
      g.add(post);
      let rails = 0;
      for (const y of [0.5, 0.95]) {
        if (rng() < 0.2) continue;
        const rail = box(2.6, 0.12, 0.06, M.wood);
        rail.position.set(0, y, 0);
        if (rng() < 0.2) {
          rail.rotation.z = rand(-0.4, 0.4);
          rail.position.y -= 0.2;
        }
        g.add(rail);
        rails++;
      }
      if (rails) proxy(g, 2.5, 1, 0.2, 0, 0.5, 0);
      place(g, x, z, rot);
    }
  }

  function powerLine(x0, z0, x1, z1) {
    const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 20);
    const tops = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      const g = new THREE.Group();
      const fallen = rng() < 0.2;
      const pole = cyl(0.13, 0.17, 8, M.darkWood, 7);
      pole.position.y = 4;
      g.add(pole);
      const bar = box(0.14, 0.14, 2.2, M.darkWood);
      bar.position.y = 7.4;
      g.add(bar);
      if (fallen) {
        g.rotation.z = PI / 2 - 0.08;
        g.position.y = 0.2;
        const outer = new THREE.Group();
        outer.add(g);
        place(outer, x, z, rand(0, PI));
        tops.push(null);
      } else {
        const lean = rand(-0.08, 0.08);
        g.rotation.z = lean;
        const outer = new THREE.Group();
        outer.add(g);
        proxy(outer, 0.4, 8, 0.4, 0, 4, 0);
        place(outer, x, z, 0);
        const y = heightAt(x, z);
        tops.push(new THREE.Vector3(x - Math.sin(lean) * 7.4, y + Math.cos(lean) * 7.4, z));
      }
    }
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1816 });
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const b = tops[i + 1];
      if (!a || !b) {
        // dangling wire from the standing pole
        const p = a || b;
        if (!p || rng() < 0.4) continue;
        for (const off of [-0.9, 0.9]) {
          const pts = [new THREE.Vector3(p.x, p.y, p.z + off), new THREE.Vector3(p.x + (a ? 4 : -4), heightAt(p.x, p.z) + 0.1, p.z + off + rand(-1, 1))];
          root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        }
        continue;
      }
      for (const off of [-0.9, 0.9]) {
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push(new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t - Math.sin(t * PI) * 1.4,
            a.z + (b.z - a.z) * t + off
          ));
        }
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
  }

  function roadSign(x, z, rot, lines) {
    const g = new THREE.Group();
    const post = cyl(0.07, 0.07, 2.6, M.metalDark, 6);
    post.position.y = 1.3;
    g.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.2, 0.06),
      new THREE.MeshStandardMaterial({ map: textTexture(lines, { bg: '#a8a08a', fg: '#2f3b2c', font: 'bold 58px Impact, sans-serif' }), roughness: 1 })
    );
    board.position.y = 2.5;
    board.castShadow = true;
    g.add(board);
    g.rotation.z = 0.12;
    const outer = new THREE.Group();
    outer.add(g);
    place(outer, x, z, rot);
  }

  // ---------------------------------------------------------------- more props (snow base / forest)
  function pineTree(x, z, { snowy = false, dead = false, scale = 1 } = {}) {
    const g = new THREE.Group();
    const h = rand(6, 10) * scale;
    const trunk = cyl(0.14 * scale, 0.3 * scale, h * 0.5, M.tree, 7);
    trunk.position.y = h * 0.25;
    g.add(trunk);
    if (!dead) {
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const r = (1 - i / layers) * 2.2 * scale + 0.4;
        const ch = h * 0.34;
        const cone = meshOf(new THREE.ConeGeometry(r, ch, 7), i % 2 ? M.pine : M.pineDark);
        cone.position.y = h * 0.3 + i * h * 0.17 + ch / 2;
        cone.rotation.y = rand(0, PI);
        g.add(cone);
        if (snowy) {
          const cap = meshOf(new THREE.ConeGeometry(r * 0.75, ch * 0.45, 7), M.snow);
          cap.position.y = cone.position.y + ch * 0.28;
          cap.rotation.y = cone.rotation.y;
          g.add(cap);
        }
      }
    } else {
      const top = cyl(0.05, 0.14 * scale, h * 0.5, M.tree, 6);
      top.position.y = h * 0.75;
      g.add(top);
      for (let i = 0; i < 6; i++) {
        const pivot = new THREE.Group();
        pivot.position.y = rand(h * 0.4, h * 0.9);
        pivot.rotation.y = rand(0, PI * 2);
        const bl = rand(0.8, 1.8);
        const br = cyl(0.02, 0.06, bl, M.tree, 4);
        br.rotation.z = -1.2;
        br.position.set(Math.sin(1.2) * bl * 0.5, Math.cos(1.2) * bl * 0.5, 0);
        pivot.add(br);
        g.add(pivot);
      }
    }
    proxy(g, 0.6 * scale, h, 0.6 * scale, 0, h / 2, 0);
    place(g, x, z, rand(0, PI * 2), 0.1);
    reserve(x, z, 1.6 * scale);
  }

  function sandbags(x, z, rot, len = 4) {
    const g = new THREE.Group();
    const n = Math.round(len / 0.6);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n - (row === 2 ? 1 : 0); i++) {
        const b = box(0.62, 0.3, 0.42, M.sandbag);
        b.position.set(-len / 2 + 0.3 + i * 0.6 + (row % 2) * 0.3, 0.15 + row * 0.3, rand(-0.03, 0.03));
        b.rotation.y = rand(-0.08, 0.08);
        g.add(b);
      }
    }
    proxy(g, len, 0.95, 0.5, 0, 0.475, 0);
    g.children.forEach((c) => c.isMesh && c.visible && solid(c, false));
    place(g, x, z, rot);
    reserve(x, z, len / 2 + 0.5);
  }

  // Tall lookout with a ladder up to a walled platform.
  function watchtower(x, z, rot, { wood = M.darkWood, h = 6 } = {}) {
    const g = new THREE.Group();
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = box(0.22, h + 2.6, 0.22, wood);
      leg.position.set(lx, (h + 2.6) / 2, lz);
      g.add(solid(leg));
    }
    for (const y of [h * 0.33, h * 0.66]) {
      const bx = box(3, 0.12, 0.12, wood);
      bx.position.set(0, y, -1.4);
      g.add(bx);
      const bx2 = bx.clone();
      bx2.position.z = 1.4;
      g.add(bx2);
    }
    const deck = box(3.4, 0.16, 3.4, M.planks);
    deck.position.y = h;
    deck.userData.overhead = true;
    g.add(solid(deck));
    // low walls with a gap for the ladder (on +x)
    const walls = [[3.4, 0.08, 0, -1.66], [3.4, 0.08, 0, 1.66], [0.08, 3.4, -1.66, 0], [0.08, 1.1, 1.66, -1.15], [0.08, 1.1, 1.66, 1.15]];
    for (const [w, d, wx, wz] of walls) {
      const wall = box(w, 1.0, d, wood);
      wall.position.set(wx, h + 0.58, wz);
      wall.userData.overhead = true;
      g.add(solid(wall));
    }
    const roof = box(3.9, 0.15, 3.9, M.roof);
    roof.position.y = h + 2.55;
    roof.rotation.z = 0.06;
    g.add(roof);
    ladder(g, 1.95, 0, 1, 0, h + 0.08);
    place(g, x, z, rot);
    reserve(x, z, 3);
    const top = toWorld(g, -0.6, 0);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  // Concrete bunker with a door, firing slits and a flat roof you can climb onto.
  function bunker(x, z, rot, w = 8, d = 6) {
    const g = new THREE.Group();
    const H = 2.5;
    const T = 0.45;
    const seg = (len, cx, cz, alongX, door) => {
      const parts = door ? [[-len / 2, -0.8], [0.8, len / 2]] : [[-len / 2, len / 2]];
      for (const [a, b] of parts) {
        const L = b - a;
        const m = box(alongX ? L : T, H, alongX ? T : L, M.concrete);
        m.position.set(alongX ? cx + (a + b) / 2 : cx, H / 2, alongX ? cz : cz + (a + b) / 2);
        g.add(solid(m));
      }
      if (door) {
        const lintel = box(alongX ? 1.6 : T, 0.5, alongX ? T : 1.6, M.concrete);
        lintel.position.set(cx, H - 0.25, cz);
        lintel.userData.overhead = true;
        g.add(solid(lintel));
      }
    };
    seg(w, 0, -d / 2, true, true);
    seg(w, 0, d / 2, true, false);
    seg(d - T, -w / 2, 0, false, false);
    seg(d - T, w / 2, 0, false, false);
    const roof = box(w + 0.6, 0.35, d + 0.6, M.concreteDark);
    roof.position.y = H + 0.17;
    roof.userData.overhead = true;
    g.add(solid(roof));
    const slit = box(w * 0.6, 0.18, 0.05, M.glass);
    slit.position.set(0, H - 0.6, d / 2 + 0.23);
    g.add(slit);
    ladder(g, 0, d / 2 + 0.6, 0, 1, H + 0.35);
    place(g, x, z, rot);
    reserve(x, z, Math.hypot(w, d) / 2 + 1.5);
    const top = toWorld(g, w / 4, 0);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  function truck(x, z, rot) {
    const g = new THREE.Group();
    const cab = box(2.0, 1.6, 2.3, M.olive);
    cab.position.set(2.2, 1.45, 0);
    g.add(solid(cab, false));
    const glass = box(0.05, 0.6, 1.9, M.glass);
    glass.position.set(3.22, 1.7, 0);
    g.add(glass);
    const bed = box(4.4, 0.3, 2.4, M.olive);
    bed.position.set(-1.1, 1.0, 0);
    g.add(solid(bed, false));
    const cover = box(4.2, 1.6, 2.35, M.sandbag);
    cover.position.set(-1.1, 1.95, 0);
    g.add(solid(cover, false));
    for (const [wx, wz] of [[2.3, 1.1], [2.3, -1.1], [-0.5, 1.1], [-0.5, -1.1], [-2.3, 1.1], [-2.3, -1.1]]) {
      const wheel = cyl(0.5, 0.5, 0.35, M.rubber, 12);
      wheel.rotation.x = PI / 2;
      wheel.position.set(wx, 0.5, wz);
      g.add(wheel);
    }
    proxy(g, 2.0, 2.25, 2.3, 2.2, 1.12, 0);
    proxy(g, 4.4, 2.75, 2.4, -1.1, 1.37, 0);
    place(g, x, z, rot);
    reserve(x, z, 4);
  }

  function container(x, z, rot, material) {
    const g = new THREE.Group();
    const c = box(6, 2.6, 2.4, material);
    c.position.y = 1.3;
    g.add(solid(c));
    for (let i = -2.7; i <= 2.7; i += 0.45) {
      const rib = box(0.06, 2.5, 2.46, material);
      rib.position.set(i, 1.3, 0);
      rib.castShadow = false;
      g.add(rib);
    }
    place(g, x, z, rot);
    reserve(x, z, 3.5);
    // crate next to it so you can climb up
    const side = toWorld(g, 1.5, 1.9);
    crate(side.x, side.z);
    const top = toWorld(g, 0, 0);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  function heliWreck(x, z, rot) {
    const g = new THREE.Group();
    const body = meshOf(new THREE.SphereGeometry(1.6, 14, 10), M.olive);
    body.scale.set(1.6, 1, 1);
    body.position.y = 1.2;
    body.rotation.z = 0.25;
    g.add(solid(body, false));
    const glassNose = meshOf(new THREE.SphereGeometry(1.1, 12, 8, 0, PI * 2, 0, PI / 2), M.glass);
    glassNose.rotation.z = -PI / 2 - 0.3;
    glassNose.position.set(1.9, 1.3, 0);
    g.add(glassNose);
    const boom = cyl(0.25, 0.5, 6, M.olive, 10);
    boom.rotation.z = PI / 2 + 0.18;
    boom.position.set(-4.2, 0.9, 0.3);
    g.add(solid(boom, false));
    const tailRotor = box(0.1, 1.8, 0.2, M.metalDark);
    tailRotor.position.set(-7, 1.5, 0.55);
    tailRotor.rotation.x = 0.8;
    g.add(tailRotor);
    for (const sz of [-1.1, 1.1]) {
      const skid = cyl(0.06, 0.06, 4, M.metalDark, 6);
      skid.rotation.z = PI / 2;
      skid.position.set(0.3, 0.1, sz);
      g.add(skid);
    }
    const mast = cyl(0.12, 0.12, 0.6, M.metalDark, 6);
    mast.position.set(0, 2.6, 0);
    g.add(mast);
    // broken rotor blades: one bent on top, others thrown into the snow
    const blade = box(5.5, 0.06, 0.4, M.metalDark);
    blade.position.set(0.5, 2.85, 1.4);
    blade.rotation.set(0.2, 0.4, -0.15);
    g.add(blade);
    for (let i = 0; i < 3; i++) {
      const b = box(rand(2.5, 4.5), 0.06, 0.4, M.metalDark);
      b.position.set(rand(-8, 8), 0.12, rand(-7, 7));
      b.rotation.set(rand(-0.2, 0.2), rand(0, PI), rand(-0.2, 0.2));
      g.add(b);
    }
    proxy(g, 5, 2.4, 3.0, 0.2, 1.2, 0);
    proxy(g, 5.5, 1.2, 0.9, -4.3, 0.6, 0.3);
    place(g, x, z, rot, 0.2);
    conform(16, 14, 8, 8, x, z, rot, scorchMat, 0.06);
    reserve(x, z, 9);
    const local = new THREE.Vector3(0, 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    smokeSources.push(new THREE.Vector3(x + local.x, heightAt(x, z) + 2, z + local.z));
    lootSpots.push({ x: toWorld(g, 0, 3).x, z: toWorld(g, 0, 3).z });
  }

  function radioMast(x, z) {
    const g = new THREE.Group();
    const H = 22;
    for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const leg = box(0.1, H, 0.1, M.redPaint);
      leg.position.set(lx * (1 - 0), H / 2, lz);
      g.add(leg);
    }
    for (let y = 1; y < H; y += 1.6) {
      const ring = box(1.3, 0.06, 1.3, M.metalDark);
      ring.position.y = y;
      ring.scale.y = 0.5;
      g.add(ring);
    }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    light.position.y = H + 0.3;
    g.add(light);
    updaters.push((dt, t) => {
      light.visible = Math.sin(t * 3) > 0;
    });
    proxy(g, 1.4, H, 1.4, 0, H / 2, 0);
    place(g, x, z, 0);
    reserve(x, z, 2);
  }

  function fuelTank(x, z, rot) {
    const g = new THREE.Group();
    const tank = cyl(1.3, 1.3, 7, M.metal, 16);
    tank.rotation.z = PI / 2;
    tank.position.y = 1.8;
    g.add(solid(tank, false));
    for (const sx of [-2.5, 2.5]) {
      const sup = box(0.3, 1.2, 2.2, M.concreteDark);
      sup.position.set(sx, 0.6, 0);
      g.add(sup);
    }
    const stripe = cyl(1.32, 1.32, 1, M.redPaint, 16);
    stripe.rotation.z = PI / 2;
    stripe.position.y = 1.8;
    g.add(stripe);
    proxy(g, 7, 3.1, 2.6, 0, 1.55, 0);
    place(g, x, z, rot);
    reserve(x, z, 4.5);
  }

  function frozenLake(x, z, r) {
    const geo = new THREE.CircleGeometry(r, 40);
    geo.rotateX(-PI / 2);
    const m = new THREE.Mesh(geo, M.ice);
    m.position.set(x, heightAt(x, z) + 0.3, z);
    m.receiveShadow = true;
    root.add(m);
    reserve(x, z, r);
    // cracks and a snowy rim
    for (let i = 0; i < 10; i++) {
      const a = rand(0, PI * 2);
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(rand(2, 6), 0.06), new THREE.MeshBasicMaterial({ color: 0x8aa8c0 }));
      crack.rotation.set(-PI / 2, 0, a);
      crack.position.set(x + Math.cos(a) * rand(0, r * 0.7), m.position.y + 0.01, z + Math.sin(a) * rand(0, r * 0.7));
      root.add(crack);
    }
  }

  function church(x, z, rot) {
    brokenHouse(x, z, rot, 12, 8, { h: 5, wall: M.stone, chimney: false });
    const g = new THREE.Group();
    const tower = box(3, 11, 3, M.stone);
    tower.position.y = 5.5;
    g.add(solid(tower));
    const spire = meshOf(new THREE.ConeGeometry(2.3, 5, 4), M.roof);
    spire.position.y = 13.5;
    spire.rotation.y = PI / 4;
    g.add(spire);
    const crossV = box(0.2, 1.4, 0.2, M.metalDark);
    crossV.position.y = 16.6;
    const crossH = box(0.8, 0.2, 0.2, M.metalDark);
    crossH.position.y = 16.8;
    crossH.rotation.z = 0.3; // hanging crooked
    g.add(crossV, crossH);
    const off = toWorldLocal(rot, 0, 5.6);
    place(g, x + off.x, z + off.z, rot);
  }
  const toWorldLocal = (rot, lx, lz) => ({ x: Math.cos(rot) * lx + Math.sin(rot) * lz, z: -Math.sin(rot) * lx + Math.cos(rot) * lz });

  function graveyard(x, z, rot, rows = 4, cols = 6) {
    const g = new THREE.Group();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.15) continue;
        const gx = (c - (cols - 1) / 2) * 2.2 + rand(-0.2, 0.2);
        const gz = (r - (rows - 1) / 2) * 2.6 + rand(-0.2, 0.2);
        if (rng() < 0.6) {
          const stone = box(0.6, rand(0.6, 1.0), 0.15, M.stone);
          stone.position.set(gx, 0.4, gz);
          stone.rotation.set(rand(-0.25, 0.25), rand(-0.2, 0.2), rand(-0.2, 0.2));
          g.add(solid(stone, false));
        } else {
          const v = box(0.12, 1.1, 0.12, M.darkWood);
          v.position.set(gx, 0.55, gz);
          const h = box(0.6, 0.12, 0.12, M.darkWood);
          h.position.set(gx, 0.8, gz);
          const tilt = rand(-0.3, 0.3);
          v.rotation.z = h.rotation.z = tilt;
          g.add(v, h);
        }
        // dirt mound
        const mound = box(0.9, 0.15, 1.8, M.darkWood);
        mound.position.set(gx, 0.05, gz + 1.0);
        mound.material = M.rock2;
        g.add(mound);
      }
    }
    place(g, x, z, rot);
    reserve(x, z, Math.max(rows * 2.6, cols * 2.2) / 2 + 1);
    const w = cols * 2.2 + 2;
    const d = rows * 2.6 + 2;
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => {
      const o = toWorldLocal(rot, a, b);
      return [x + o.x, z + o.z];
    });
    for (let i = 0; i < 4; i++) if (i !== 0) fenceLine(...corners[i], ...corners[(i + 1) % 4]);
  }

  function swampPool(x, z, r) {
    const geo = new THREE.CircleGeometry(r, 28);
    geo.rotateX(-PI / 2);
    const m = new THREE.Mesh(geo, M.toxic);
    m.position.set(x, heightAt(x, z) + 0.06, z);
    root.add(m);
    hazards.push({ x, z, r: r * 0.9, dps: 8, kind: 'toxic' });
    reserve(x, z, r);
    const bubbles = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), M.toxic);
      root.add(b);
      bubbles.push({ b, t: rand(0, 2), a: rand(0, PI * 2), d: rand(0, r * 0.8) });
    }
    updaters.push((dt) => {
      for (const o of bubbles) {
        o.t += dt;
        if (o.t > 2) {
          o.t = 0;
          o.a = rand(0, PI * 2);
          o.d = rand(0, r * 0.8);
        }
        o.b.position.set(x + Math.cos(o.a) * o.d, m.position.y + o.t * 0.15, z + Math.sin(o.a) * o.d);
        o.b.scale.setScalar(o.t < 1.7 ? 0.5 + o.t * 0.4 : 0.01);
      }
    });
  }

  function logPile(x, z, rot) {
    const g = new THREE.Group();
    let i = 0;
    for (let row = 0; row < 3; row++) {
      for (let c = 0; c < 4 - row; c++) {
        const log = cyl(0.28, 0.28, 3.2, M.tree, 8);
        log.rotation.x = PI / 2;
        log.position.set(-0.85 + c * 0.58 + row * 0.29, 0.28 + row * 0.5, 0);
        g.add(log);
        i++;
      }
    }
    proxy(g, 2.4, 1.4, 3.2, 0, 0.7, 0);
    place(g, x, z, rot);
    reserve(x, z, 2);
  }

  function fallenTree(x, z, rot) {
    const g = new THREE.Group();
    const len = rand(7, 11);
    const trunk = cyl(0.3, 0.45, len, M.tree, 8);
    trunk.rotation.z = PI / 2;
    trunk.position.y = 0.4;
    g.add(solid(trunk, false));
    const roots = meshOf(new THREE.DodecahedronGeometry(0.9, 0), M.rock2);
    roots.position.set(len / 2, 0.6, 0);
    g.add(roots);
    proxy(g, len, 0.85, 0.85, 0, 0.42, 0);
    place(g, x, z, rot);
    reserve(x, z, len / 2);
  }

  function campfire(x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const st = meshOf(new THREE.DodecahedronGeometry(0.18, 0), M.rock);
      st.position.set(Math.cos((i / 8) * PI * 2) * 0.6, 0.08, Math.sin((i / 8) * PI * 2) * 0.6);
      g.add(st);
    }
    const light = new THREE.PointLight(0xff8a3a, 6, 14, 2);
    light.position.y = 0.8;
    g.add(light);
    place(g, x, z);
    reserve(x, z, 1.5);
    const base = new THREE.Vector3(x, heightAt(x, z) + 0.2, z);
    updaters.push((dt, t) => {
      light.intensity = 5 + Math.sin(t * 13) * 1 + Math.sin(t * 7.3) * 0.8;
      if (fireFx && Math.random() < dt * 25) fireFx(base);
    });
  }
  let fireFx = null;

  // Scatter clutter on free ground
  const scatter = (count, r, fn, minR = 14, maxR = ARENA_RADIUS + 20) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      const a = rng() * PI * 2;
      const d = Math.sqrt(rand((minR / maxR) ** 2, 1)) * maxR;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!isFree(x, z, r)) continue;
      fn(x, z);
      placed++;
    }
  };

  // ---------------------------------------------------------------- docks props
  // Containers stacked 2-3 high, with a ladder up one end and loot on top.
  function containerStack(x, z, rot, levels = 2) {
    const g = new THREE.Group();
    const mats = [M.containerA, M.containerB, M.containerC, M.rust];
    for (let l = 0; l < levels; l++) {
      const c = box(6, 2.6, 2.4, pick(mats));
      c.position.set(rand(-0.25, 0.25), 1.3 + l * 2.6, rand(-0.1, 0.1));
      c.rotation.y = rand(-0.04, 0.04);
      g.add(solid(c));
    }
    ladder(g, 3.25, 0, 1, 0, levels * 2.6);
    place(g, x, z, rot);
    reserve(x, z, 4);
    const top = toWorld(g, -1, 0);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  // A dock crane: four legs, a deck 11 m up (ladder), a long boom and a hanging container.
  function crane(x, z, rot) {
    const g = new THREE.Group();
    const H = 11;
    for (const [lx, lz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
      const leg = box(0.5, H, 0.5, M.yellow);
      leg.position.set(lx, H / 2, lz);
      g.add(solid(leg));
    }
    for (const y of [3.5, 7.5]) {
      for (const side of [-3.5, 3.5]) {
        const bx = box(7.4, 0.25, 0.25, M.yellow);
        bx.position.set(0, y, side);
        g.add(bx);
        const bz = box(0.25, 0.25, 7.4, M.yellow);
        bz.position.set(side, y, 0);
        g.add(bz);
      }
    }
    const deck = box(8.4, 0.3, 8.4, M.metalDark);
    deck.position.y = H;
    deck.userData.overhead = true;
    g.add(solid(deck));
    const cab = box(3, 2.4, 3, M.yellow);
    cab.position.set(-1.5, H + 1.35, -1.5);
    g.add(solid(cab));
    const boom = box(1, 1, 24, M.yellow);
    boom.position.set(0, H + 3, 8);
    g.add(solid(boom, false));
    const cable = box(0.06, 6, 0.06, M.metalDark);
    cable.position.set(0, H, 18);
    g.add(cable);
    const hang = box(6, 2.6, 2.4, M.containerB);
    hang.position.set(0, H - 4.3, 18);
    hang.rotation.y = 0.3;
    g.add(solid(hang, false));
    for (const [w, d, rx, rz] of [[8.4, 0.1, 0, -4.15], [8.4, 0.1, 0, 4.15], [0.1, 8.4, -4.15, 0], [0.1, 2.6, 4.15, -2.9], [0.1, 2.6, 4.15, 2.9]]) {
      const rail = box(w, 0.08, d, M.yellow);
      rail.position.set(rx, H + 1, rz);
      g.add(rail);
      proxy(g, Math.max(w, 0.15), 1.0, Math.max(d, 0.15), rx, H + 0.6, rz).userData.overhead = true;
    }
    ladder(g, 4.2, 0, 1, 0, H);
    place(g, x, z, rot);
    reserve(x, z, 6);
    const top = toWorld(g, 1.5, 1.5);
    lootSpots.push({ x: top.x, z: top.z, high: true });
  }

  // A lighthouse with a turning light (climb the ladder to the gallery).
  function lighthouse(x, z) {
    const g = new THREE.Group();
    const H = 14;
    const tower = cyl(2.2, 3, H, M.plaster, 14);
    tower.position.y = H / 2;
    g.add(solid(tower));
    for (let i = 1; i < 4; i++) {
      const band = cyl(3 - (i / 4) * 0.8 + 0.03, 3 - (i / 4) * 0.8 + 0.03, 1.2, M.redPaint, 14);
      band.position.y = (H / 4) * i;
      g.add(band);
    }
    const gallery = cyl(3.4, 3.4, 0.3, M.metalDark, 16);
    gallery.position.y = H;
    gallery.userData.overhead = true;
    g.add(solid(gallery));
    const lamp = cyl(1.4, 1.4, 2, M.glass, 12);
    lamp.position.y = H + 1.2;
    g.add(lamp);
    const roof = meshOf(new THREE.ConeGeometry(1.8, 1.4, 12), M.redPaint);
    roof.position.y = H + 2.9;
    g.add(roof);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 2.2, 40, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.rotation.z = PI / 2;
    beam.position.x = 20;
    const spin = new THREE.Group();
    spin.position.y = H + 1.2;
    spin.add(beam);
    g.add(spin);
    updaters.push((dt) => (spin.rotation.y += dt * 0.6));
    ladder(g, 3.05, 0, 1, 0, H);
    place(g, x, z, 0);
    reserve(x, z, 5);
  }

  // A fishing boat run aground, leaning over.
  function boat(x, z, rot, s = 1) {
    const g = new THREE.Group();
    const lean = new THREE.Group();
    lean.rotation.z = 0.22;
    const hullMat = rng() < 0.5 ? M.hull : M.hullRed;
    const hull = box(3.4 * s, 2 * s, 10 * s, hullMat);
    hull.position.y = 1 * s;
    lean.add(solid(hull));
    const prow = meshOf(new THREE.ConeGeometry(1.7 * s, 3.5 * s, 4), hullMat);
    prow.rotation.set(PI / 2, PI / 4, 0);
    prow.scale.set(1, 1, 0.58);
    prow.position.set(0, 1.1 * s, 6.6 * s);
    lean.add(prow);
    const deck = box(3.2 * s, 0.15, 9.6 * s, M.planks);
    deck.position.y = 2.05 * s;
    lean.add(deck);
    const cabin = box(2.4 * s, 1.8 * s, 3 * s, M.plaster2);
    cabin.position.set(0, 2.9 * s, -2 * s);
    lean.add(solid(cabin));
    const mast = cyl(0.08, 0.1, 5 * s, M.metalDark, 6);
    mast.position.set(0, 4.5 * s, 1.5 * s);
    lean.add(mast);
    g.add(lean);
    place(g, x, z, rot, 0.4);
    reserve(x, z, 7 * s);
  }

  function bollard(x, z) {
    const b = cyl(0.25, 0.3, 0.7, M.metalDark, 8);
    b.position.y = 0.35;
    const g = new THREE.Group();
    g.add(solid(b));
    place(g, x, z, 0);
  }

  function oilSlick(x, z, r) {
    conform(r * 2.4, r * 1.8, 4, 4, x, z, rand(0, PI), M.oil, 0.05);
  }

  // Wooden piers sticking out into the sea (past the edge, just for looks).
  function pier(a) {
    const g = new THREE.Group();
    const deck = box(4, 0.3, 26, M.planks);
    deck.position.set(0, 0.2, 13);
    g.add(deck);
    for (let i = 0; i < 6; i++) {
      for (const side of [-1.8, 1.8]) {
        const post = cyl(0.18, 0.18, 4, M.darkWood, 6);
        post.position.set(side, -1.8, 3 + i * 4.4);
        g.add(post);
      }
    }
    const r = 106;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    root.add(g);
  }

  // A pallet of crates and sacks, waist high: good cover.
  function pallet(x, z) {
    const g = new THREE.Group();
    const base = box(1.6, 0.15, 1.2, M.wood);
    base.position.y = 0.08;
    g.add(base);
    for (let i = 0; i < 4; i++) {
      const c = box(0.7, 0.55, 0.55, rng() < 0.5 ? M.planks : M.sandbag);
      c.position.set((i % 2) * 0.75 - 0.37, 0.43, Math.floor(i / 2) * 0.58 - 0.29);
      c.rotation.y = rand(-0.1, 0.1);
      g.add(c);
    }
    proxy(g, 1.6, 1, 1.2, 0, 0.5, 0, 0, 0.72);
    place(g, x, z, rand(0, PI));
    reserve(x, z, 1.2);
  }

  // ---------------------------------------------------------------- canyon props
  function lavaPool(x, z, r) {
    const geo = new THREE.CircleGeometry(r, 28);
    geo.rotateX(-PI / 2);
    const m = new THREE.Mesh(geo, M.lava);
    m.position.set(x, heightAt(x, z) + 0.06, z);
    root.add(m);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.8, 28), M.obsidian);
    rim.rotation.x = -PI / 2;
    rim.position.set(x, m.position.y + 0.01, z);
    root.add(rim);
    hazards.push({ x, z, r: r * 0.9, dps: 18, kind: 'lava' });
    reserve(x, z, r + 1);
    // embers floating up
    const sparks = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
      root.add(sp);
      sparks.push({ sp, t: rand(0, 3), a: rand(0, PI * 2), d: rand(0, r) });
    }
    updaters.push((dt, t) => {
      M.lava.emissiveIntensity = 1 + Math.sin(t * 2) * 0.25;
      for (const o of sparks) {
        o.t += dt;
        if (o.t > 3) {
          o.t = 0;
          o.a = rand(0, PI * 2);
          o.d = rand(0, r);
        }
        o.sp.position.set(x + Math.cos(o.a) * o.d, m.position.y + o.t * 1.2, z + Math.sin(o.a) * o.d);
      }
    });
  }

  // Jagged black rock spires you can hide behind.
  function spire(x, z, h) {
    const g = new THREE.Group();
    const m = meshOf(new THREE.CylinderGeometry(rand(0.2, 0.6), rand(1.6, 2.6), h, 5), M.obsidian);
    m.position.y = h / 2 - 0.3;
    m.rotation.set(rand(-0.12, 0.12), rand(0, PI), rand(-0.12, 0.12));
    g.add(solid(m));
    place(g, x, z, 0);
    reserve(x, z, 3);
  }

  // ---------------------------------------------------------------- cover, interactive props and detail
  // Red barrels you can shoot: they go off after a moment, hurt everything close and set off their neighbours.
  const explosives = []; // { id, x, y, z, group, col, top, alive }
  const barrelBody = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 14);
  const barrelBand = new THREE.CylinderGeometry(0.415, 0.415, 0.16, 14);
  const barrelRed = mat(0xb02a1e, { roughness: 0.55, metalness: 0.15 });
  const hazardYellow = mat(0xe0b020, { roughness: 0.6 });
  let barrelLabel = null;
  let ammoSign = null;
  function redBarrel(x, z) {
    const g = new THREE.Group();
    const entry = { id: explosives.length, x, y: heightAt(x, z), z, group: g, alive: true };
    const body = meshOf(barrelBody, barrelRed);
    body.position.y = 0.5;
    g.add(body);
    for (const y of [0.25, 0.75]) {
      const band = meshOf(barrelBand, hazardYellow, { shadow: false });
      band.position.y = y;
      g.add(band);
    }
    // warning label
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), (barrelLabel ||= new THREE.MeshStandardMaterial({ map: textTexture(['DANGER'], { fg: '#1a1a1a', bg: '#e0b020', w: 128, h: 112, font: 'bold 30px Impact, sans-serif' }), roughness: 0.8 })));
    label.position.set(0, 0.5, 0.405);
    g.add(label);
    for (const c of g.children) {
      c.userData.barrel = entry;
      if (c.isMesh && c.geometry !== barrelBand) solid(c, false);
    }
    place(g, x, z, rand(0, PI * 2));
    entry.top = heightAt(x, z) + 1;
    entry.col = colliders.add(x, z, 0.42, 0.42, 0, entry.top);
    explosives.push(entry);
    reserve(x, z, 0.9);
  }

  // Ammo crates: walk up and press E to refill every gun (each player has their own cool-down).
  const ammoCrates = []; // { x, y, z, lamp }
  function ammoCrate(x, z, rot) {
    const g = new THREE.Group();
    const olive = M.olive;
    const base = box(1.3, 0.6, 0.8, olive);
    base.position.y = 0.3;
    g.add(solid(base));
    const lid = box(1.34, 0.12, 0.84, M.metalDark);
    lid.position.y = 0.66;
    g.add(lid);
    for (const sx of [-0.45, 0.45]) {
      const strap = box(0.08, 0.62, 0.84, M.darkWood);
      strap.position.set(sx, 0.31, 0);
      g.add(strap);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), (ammoSign ||= new THREE.MeshStandardMaterial({ map: textTexture(['AMMO'], { fg: '#f2e6c0', bg: '#3c4228', w: 128, h: 48, font: 'bold 34px Impact, sans-serif' }), roughness: 0.9 })));
    sign.position.set(0, 0.32, 0.405);
    g.add(sign);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5aff6a }));
    lamp.position.set(0.5, 0.76, 0.3);
    g.add(lamp);
    place(g, x, z, rot);
    ammoCrates.push({ x, y: heightAt(x, z), z, lamp });
    reserve(x, z, 1.2);
  }

  // Concrete road barrier: waist-high cover.
  function jersey(x, z, rot) {
    const g = new THREE.Group();
    const foot = box(2.6, 0.35, 0.75, M.concrete);
    foot.position.y = 0.17;
    g.add(foot);
    const wall = box(2.6, 0.75, 0.38, M.concrete);
    wall.position.y = 0.7;
    g.add(wall);
    const stripe = box(2.62, 0.12, 0.4, rng() < 0.5 ? M.redPaint : hazardYellow);
    stripe.position.y = 0.92;
    stripe.castShadow = false;
    g.add(stripe);
    proxy(g, 2.6, 1.08, 0.75, 0, 0.54, 0);
    g.children.forEach((c) => c.isMesh && c.visible && solid(c, false));
    place(g, x, z, rot, 0.03);
    reserve(x, z, 1.6);
  }

  // Half-fallen wall with a jagged top: chest-high on one end, head-high on the other.
  function ruinWall(x, z, rot, len = 5, material = M.brick) {
    const g = new THREE.Group();
    const n = Math.max(3, Math.round(len / 0.7));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const h = 0.9 + (i / n) * 1.3 + rand(-0.25, 0.25);
      const b = box(step + 0.02, h, 0.45, material);
      b.position.set(-len / 2 + step * (i + 0.5), h / 2, 0);
      g.add(solid(b));
    }
    // fallen bricks at its foot
    for (let i = 0; i < 6; i++) {
      const b = box(rand(0.25, 0.45), 0.14, 0.2, material);
      b.position.set(rand(-len / 2, len / 2), 0.07, rand(0.35, 1.1) * (rng() < 0.5 ? 1 : -1));
      b.rotation.set(rand(-0.3, 0.3), rand(0, PI), 0);
      b.castShadow = false;
      g.add(b);
    }
    place(g, x, z, rot, 0.05);
    reserve(x, z, len / 2 + 0.6);
  }

  // Two or three crates stacked up: cover, and something to climb.
  function crateStack(x, z, rot) {
    const g = new THREE.Group();
    const spots = [[-0.6, 0, 0], [0.6, 0, 0.05], [-0.1, 1.15, 0]];
    const n = rng() < 0.6 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const [lx, ly, lz] = spots[i];
      const c = box(1.15, 1.15, 1.15, rng() < 0.5 ? M.planks : M.wood);
      c.position.set(lx, ly + 0.575, lz);
      c.rotation.y = rand(-0.12, 0.12);
      g.add(solid(c));
    }
    place(g, x, z, rot, 0.03);
    reserve(x, z, 1.8);
    if (n === 3) lootSpots.push({ ...toWorld(g, -0.1, 0), high: true });
  }

  function tireStack(x, z) {
    const g = new THREE.Group();
    const tire = new THREE.TorusGeometry(0.42, 0.17, 6, 14);
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const t = meshOf(tire, M.rubber);
      t.rotation.x = PI / 2;
      t.position.set(rand(-0.05, 0.05), 0.17 + i * 0.32, rand(-0.05, 0.05));
      g.add(solid(t, false));
    }
    proxy(g, 1.1, n * 0.32 + 0.05, 1.1, 0, (n * 0.32) / 2, 0);
    place(g, x, z, rand(0, PI));
    reserve(x, z, 0.9);
  }

  function dumpster(x, z, rot) {
    const g = new THREE.Group();
    const body = box(2.2, 1.25, 1.3, pick([M.paintA, M.paintC, M.containerC]));
    body.position.y = 0.68;
    g.add(solid(body));
    const lid = box(2.24, 0.08, 1.36, M.metalDark);
    lid.position.set(0, 1.34, -0.1);
    lid.rotation.x = rng() < 0.5 ? -0.5 : 0;
    g.add(lid);
    for (const sx of [-0.9, 0.9]) {
      const w = cyl(0.1, 0.1, 0.1, M.rubber, 8);
      w.rotation.z = PI / 2;
      w.position.set(sx, 0.06, 0.5);
      g.add(w);
    }
    place(g, x, z, rot);
    reserve(x, z, 1.5);
  }

  // A U of sandbags to crouch behind.
  function sandbagNest(x, z, rot) {
    const g = new THREE.Group();
    place(g, x, z, rot);
    const at = (lx, lz) => toWorld(g, lx, lz);
    const f = at(0, -1.4);
    sandbags(f.x, f.z, rot, 3.6);
    const l = at(-1.9, 0);
    sandbags(l.x, l.z, rot + PI / 2, 2.4);
    const r = at(1.9, 0);
    sandbags(r.x, r.z, rot + PI / 2, 2.4);
    reserve(x, z, 2.6);
  }

  // Street lamp; some flicker.
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd88a, emissiveIntensity: 1.4 });
  function streetLamp(x, z, rot) {
    const g = new THREE.Group();
    const pole = cyl(0.07, 0.1, 5, M.metalDark, 8);
    pole.position.y = 2.5;
    g.add(solid(pole, false));
    const arm = box(1.3, 0.08, 0.08, M.metalDark);
    arm.position.set(0.6, 4.9, 0);
    g.add(arm);
    const head = box(0.5, 0.14, 0.3, M.metalDark);
    head.position.set(1.15, 4.82, 0);
    g.add(head);
    const flicker = rng() < 0.35;
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.2), flicker ? lampGlow.clone() : lampGlow);
    bulb.position.set(1.15, 4.73, 0);
    g.add(bulb);
    proxy(g, 0.25, 5, 0.25, 0, 2.5, 0);
    place(g, x, z, rot);
    reserve(x, z, 0.6);
    if (flicker) {
      const seed = rand(0, 10);
      updaters.push((dt, t) => {
        const on = Math.sin(t * 9 + seed) + Math.sin(t * 23.7 + seed * 3) > -0.6;
        bulb.material.emissiveIntensity = on ? 1.4 : 0.05;
      });
    }
  }

  // Cheap scattered detail (bricks, stones, cans, planks, bones): one draw call per kind.
  const _d = new THREE.Object3D();
  function clutter(count, geo, material, { minR = 8, maxR = ARENA_RADIUS, y = 0, scale = [0.7, 1.3], flat = false } = {}) {
    const inst = new THREE.InstancedMesh(geo, material, count);
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 12; tries++) {
        const a = rng() * PI * 2;
        const d = Math.sqrt(rand((minR / maxR) ** 2, 1)) * maxR;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
        if (!reserved.some((o) => Math.hypot(x - o.x, z - o.z) < o.r * 0.8)) break;
      }
      const s = rand(scale[0], scale[1]);
      _d.position.set(x, heightAt(x, z) + y * s, z);
      _d.rotation.set(flat ? 0 : rand(-0.4, 0.4), rand(0, PI * 2), flat ? 0 : rand(-0.4, 0.4));
      _d.scale.setScalar(s);
      _d.updateMatrix();
      inst.setMatrixAt(i, _d.matrix);
    }
    inst.castShadow = false;
    inst.receiveShadow = true;
    root.add(inst);
  }
  // Rubble heaps next to the ruins.
  function rubble(x, z, material = M.brick) {
    const n = 14;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), material, n);
    for (let i = 0; i < n; i++) {
      const a = rand(0, PI * 2);
      const d = rand(0, 1.4);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      _d.position.set(px, heightAt(px, pz) + 0.08 + (1.4 - d) * 0.15, pz);
      _d.rotation.set(rand(-0.6, 0.6), rand(0, PI), rand(-0.6, 0.6));
      _d.scale.setScalar(rand(0.7, 1.4));
      _d.updateMatrix();
      inst.setMatrixAt(i, _d.matrix);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    root.add(inst);
  }

  // A spot of cover in the open: a few pieces in the map's style, sometimes with a red barrel or ammo.
  const COVER = {
    plains: [(x, z, r) => { jersey(x, z, r); jersey(x + Math.cos(r) * 2.8, z - Math.sin(r) * 2.8, r + 0.15); },
      (x, z, r) => ruinWall(x, z, r, 5, pick([M.brick, M.plaster])),
      (x, z, r) => { crateStack(x, z, r); tireStack(x + 2.2, z + 1.2); },
      (x, z, r) => { hayBale(x, z); hayBale(x + 1.6, z + 0.4); tireStack(x - 1.6, z - 0.6); }],
    frost: [(x, z, r) => sandbagNest(x, z, r),
      (x, z, r) => { jersey(x, z, r); jersey(x + Math.cos(r) * 2.8, z - Math.sin(r) * 2.8, r); },
      (x, z, r) => ruinWall(x, z, r, 5, M.concrete),
      (x, z, r) => crateStack(x, z, r)],
    forest: [(x, z, r) => ruinWall(x, z, r, 4.5, M.stone),
      (x, z, r) => crateStack(x, z, r),
      (x, z, r) => { logPile(x, z, r); },
      (x, z, r) => sandbagNest(x, z, r)],
    docks: [(x, z, r) => { jersey(x, z, r); jersey(x + Math.cos(r) * 2.8, z - Math.sin(r) * 2.8, r - 0.1); },
      (x, z, r) => crateStack(x, z, r),
      (x, z, r) => dumpster(x, z, r),
      (x, z, r) => { tireStack(x, z); tireStack(x + 1.2, z + 0.3); pallet(x - 1.6, z); }],
    village: [(x, z, r) => { hayBale(x, z); hayBale(x + 1.6, z + 0.4); },
      (x, z, r) => crateStack(x, z, r),
      (x, z, r) => { logPile(x, z, r); },
      (x, z, r) => ruinWall(x, z, r, 4, M.stone)],
    ember: [(x, z, r) => ruinWall(x, z, r, 5, M.burnt),
      (x, z, r) => ruinWall(x, z, r, 4, M.obsidian),
      (x, z, r) => crateStack(x, z, r),
      (x, z, r) => sandbagNest(x, z, r)],
  };
  function coverSpots(count) {
    let n = 0;
    scatter(count, 3.2, (x, z) => {
      const r = rand(0, PI);
      pick(COVER[mapId])(x, z, r);
      n++;
      // a red barrel or an ammo crate nearby every so often
      const bx = x + rand(-3, 3);
      const bz = z + rand(2.5, 3.5) * (rng() < 0.5 ? 1 : -1);
      if (n % 3 === 0 && isFree(bx, bz, 0.8)) redBarrel(bx, bz);
      else if (n % 5 === 1 && isFree(bx, bz, 1.1)) ammoCrate(bx, bz, rand(0, PI));
    }, 15, 72);
  }
  // hand-placed extras skip spots that are already taken (spawns, flags, buildings)
  const clear = (x, z, r) => !reserved.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r);
  const at = (fn, r) => (x, z, ...rest) => clear(x, z, r) && fn(x, z, ...rest);
  const lampAt = at(streetLamp, 0.6);
  const barrelAt = at(redBarrel, 0.9);
  const ammoAt = at(ammoCrate, 1.2);
  const jerseyAt = at(jersey, 1.6);
  const dumpsterAt = at(dumpster, 1.5);
  // Perk machines and wall-buy boards: spend points on them in zombie games (E to buy).
  const shops = []; // { kind: 'perk' | 'gun', id, x, y, z, light }
  const PERK_LOOK = { tough: [0xb02a2a, 'TOUGH NUT'], quick: [0x2a8a3a, 'QUICK HANDS'], double: [0xc8a030, 'DOUBLE TAP'], fleet: [0x2a5ab0, 'FLEET FOOT'] };
  function perkMachine(x, z, rot, id) {
    const [color, label] = PERK_LOOK[id];
    const g = new THREE.Group();
    const body = box(1.2, 2.2, 0.9, mat(color, { roughness: 0.5, metalness: 0.2 }));
    body.position.y = 1.1;
    g.add(solid(body));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55), new THREE.MeshStandardMaterial({ map: textTexture([label], { fg: '#fff6d8', bg: '#1a1a1a', w: 256, h: 128, font: 'bold 40px Impact, sans-serif', grime: false }), emissive: 0xffffff, emissiveIntensity: 0.35, emissiveMap: null }));
    glow.position.set(0, 1.75, 0.46);
    g.add(glow);
    const slot = box(0.5, 0.3, 0.05, M.metalDark);
    slot.position.set(0, 0.6, 0.46);
    g.add(slot);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color }));
    light.position.set(0, 2.35, 0);
    g.add(light);
    place(g, x, z, rot);
    shops.push({ kind: 'perk', id, x, y: heightAt(x, z), z, light });
    reserve(x, z, 1.4);
  }
  const GUN_BOARD = { smg: 'SMG', shotgun: 'SHOTGUN', dmr: 'DMR', lmg: 'LMG', sniper: 'SNIPER', launcher: 'LAUNCHER' };
  function wallBuy(x, z, rot, gun) {
    const g = new THREE.Group();
    for (const sx of [-0.8, 0.8]) {
      const post = box(0.12, 1.9, 0.12, M.darkWood);
      post.position.set(sx, 0.95, 0);
      g.add(post);
    }
    const board = box(1.9, 1, 0.08, M.planks);
    board.position.y = 1.35;
    g.add(solid(board));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), new THREE.MeshStandardMaterial({ map: textTexture(['🔫 ' + GUN_BOARD[gun], 'BUY WITH E'], { fg: '#ffe9a8', bg: '#3a2a1a', w: 256, h: 128, font: 'bold 34px Impact, sans-serif' }), roughness: 0.9 }));
    sign.position.set(0, 1.35, 0.05);
    g.add(sign);
    proxy(g, 1.9, 1.9, 0.3, 0, 0.95, 0);
    place(g, x, z, rot);
    shops.push({ kind: 'gun', id: gun, x, y: heightAt(x, z), z });
    reserve(x, z, 1.4);
  }

  // Every map: cover, barrels, ammo, and small bits lying around.
  function extras({ cover = 16, barrels = 8, ammo = 3, debris = M.brick, stones = M.rock } = {}) {
    coverSpots(cover);
    const perks = ['tough', 'quick', 'double', 'fleet'];
    let pi = 0;
    scatter(4, 1.6, (x, z) => perkMachine(x, z, rand(0, PI * 2), perks[pi++ % 4]), 18, 70);
    const guns = ['smg', 'shotgun', 'dmr', 'lmg', 'sniper', 'launcher'];
    let gi = 0;
    scatter(5, 1.6, (x, z) => wallBuy(x, z, rand(0, PI * 2), guns[gi++ % guns.length]), 16, 72);
    scatter(barrels, 0.9, redBarrel, 14, 85);
    scatter(ammo, 1.2, (x, z) => ammoCrate(x, z, rand(0, PI)), 14, 70);
    clutter(160, new THREE.BoxGeometry(0.3, 0.12, 0.18), debris, { y: 0.05 });
    clutter(220, new THREE.DodecahedronGeometry(0.16, 0), stones, { y: 0.04, scale: [0.5, 1.6] });
    clutter(70, new THREE.BoxGeometry(1.4, 0.05, 0.22), M.wood, { y: 0.03, flat: true, maxR: 80 });
  }

  // ---------------------------------------------------------------- layouts
  const layouts = {
    plains() {
      // Town along the road
      brokenHouse(-42, 38, 0, 8, 6, { graffiti: 'HELP' });
      brokenHouse(-25, 37, 0, 7, 6);
      brokenHouse(14, 38, 0, 9, 7, { wall: M.brick });
      brokenHouse(33, 37, 0, 8, 6, { graffiti: 'RUN' });
      brokenHouse(55, 39, 0, 8, 7);
      brokenHouse(-30, 11, PI, 8, 6);
      brokenHouse(28, 10, PI, 7, 6, { wall: M.woodWall });
      // Farmstead
      brokenHouse(-62, -28, 0.3, 9, 7, { wall: M.woodWall });
      warehouse(-42, -52, -0.2 + PI / 2); // the farm's big shed
      fenceLine(-78, -12, -40, -12);
      fenceLine(-78, -12, -82, -60);
      fenceLine(-82, -60, -60, -70);
      fenceLine(-28, -40, -26, -66);
      for (let i = 0; i < 8; i++) hayBale(-58 + rand(-10, 10), -46 + rand(-8, 8));
      windmill(-74, -48);
      // Wrecks
      planeWreck(48, -42, 0.55, 1, true);
      planeWreck(-52, 74, -0.8, 0.55, false);
      waterTower(22, 72);
      gasStation(78, 8, -PI / 2);
      car(-8, 22.5, 0.05);
      car(17, 26, 2.9, { flipped: true });
      car(64, 23, 0.2);
      car(-74, 25, -0.35);
      car(6, -34, 1.2);
      car(-18, 60, 2.2);
      car(86, -28, 0.9, { flipped: true });
      car(40, 55, -1.4);
      roadSign(-95, 19, PI / 2, ['DUSTWATER', 'POP. 0']);
      roadSign(95, 29, -PI / 2, ['NO SURVIVORS', 'TURN BACK']);
      powerLine(-110, 31, 110, 31);
      scatter(34, 1.5, deadTree);
      scatter(40, 1.5, (x, z) => rock(x, z, rand(0.4, 2.0)));
      scatter(22, 0.8, barrel);
      scatter(14, 1, crate);
      scatter(10, 3, (x, z) => car(x, z, rand(0, PI * 2), { flipped: rng() < 0.25 }), 25, ARENA_RADIUS);
      scatter(30, 3, (x, z) => rock(x, z, rand(1.5, 4)), ARENA_RADIUS + 5, ARENA_RADIUS + 70);
      // street lamps along the road, cover and barrels around town
      for (const lx of [-70, -46, -20, 6, 30, 54, 80]) lampAt(lx, 18.6, PI / 2 + (lx % 2 ? 0.05 : -0.05));
      for (const [x, z, r] of [[-12, 30, 0.1], [22, 18, -0.2], [46, 30, 0.05], [-56, 18, 0]]) jerseyAt(x, z, r);
      for (const [x, z] of [[-36, 30], [8, 33], [40, 16], [70, 14]]) barrelAt(x, z);
      dumpsterAt(-18, 44, 0);
      dumpsterAt(24, 45, PI);
      ammoAt(-4, 32, 0.3);
      extras();
      for (let i = 0; i < 8; i++) {
        const a = rand(0, PI * 2);
        const d = rand(20, 100);
        conform(rand(5, 9), rand(5, 9), 4, 4, Math.cos(a) * d, Math.sin(a) * d, rand(0, PI), scorchMat, 0.05);
      }
    },

    frost() {
      // central compound
      bunker(-24, -22, 0.2);
      bunker(26, 20, PI + 0.1);
      bunker(30, -34, -0.6, 7, 5);
      brokenHouse(-30, 22, PI, 12, 6, { h: 3, wall: M.concrete, chimney: false, graffiti: 'EVAC' }); // barracks
      brokenHouse(-50, 40, PI / 2, 10, 6, { h: 3, wall: M.concrete, chimney: false });
      warehouse(44, 46, 0); // the supply warehouse
      watchtower(-44, -6, 0.4);
      watchtower(44, -14, PI);
      watchtower(4, 52, -PI / 2);
      watchtower(-6, -60, PI / 2);
      for (const [x, z, r, l] of [[-14, -8, 0.3, 4], [14, 6, -0.4, 4], [-8, 16, 1.2, 3.5], [10, -14, 1.9, 3.5], [-58, -2, PI / 2, 5], [56, -6, PI / 2, 5], [0, 30, 0, 5], [0, -32, 0, 5]]) sandbags(x, z, r, l);
      truck(-16, 40, 0.3);
      truck(36, -8, 1.8);
      truck(-62, -40, -0.8);
      container(16, -50, 0.2, M.containerA);
      container(-36, 60, 1.4, M.containerB);
      container(62, 34, -0.3, M.containerC);
      container(-80, 30, 0.9, M.containerA);
      heliWreck(-44, -64, 0.8);
      radioMast(52, 66);
      fuelTank(80, -30, 0.4);
      fuelTank(84, -42, 0.4);
      frozenLake(-80, -70, 20);
      fenceLine(-100, -90, 100, -90);
      fenceLine(100, -90, 100, 90);
      fenceLine(-100, 90, 100, 90);
      scatter(60, 2, (x, z) => pineTree(x, z, { snowy: true }), 20);
      scatter(30, 1.5, (x, z) => rock(x, z, rand(0.5, 2.2)));
      scatter(18, 0.8, barrel);
      scatter(16, 1, crate);
      scatter(40, 3, (x, z) => pineTree(x, z, { snowy: true, scale: 1.3 }), ARENA_RADIUS + 3, ARENA_RADIUS + 60);
      // base lights, fuel drums by the tanks, ammo at the bunkers
      for (const [x, z, r] of [[-20, 0, 0], [20, -4, PI], [-10, 36, PI / 2], [12, -40, -PI / 2], [-40, 30, 0.4], [40, 30, PI]]) lampAt(x, z, r);
      for (const [x, z] of [[74, -26], [76, -36], [88, -36]]) barrelAt(x, z);
      ammoAt(-18, -16, 0.2);
      ammoAt(22, 14, PI);
      extras({ debris: M.concrete, stones: M.snow, cover: 18 });
    },

    forest() {
      // cabins in clearings
      brokenHouse(-36, 26, 0.4, 8, 6, { wall: M.woodWall });
      brokenHouse(40, 30, -0.6, 8, 6, { wall: M.woodWall, graffiti: 'HIDE' });
      brokenHouse(30, -40, 2.4, 7, 6, { wall: M.darkWood });
      warehouse(-58, -40, 1.1 + PI / 2); // the logging shed
      church(-8, 70, PI);
      graveyard(24, 64, 0.1);
      watchtower(60, 10, PI, { wood: M.wood, h: 7 });
      watchtower(-46, -8, 0.2, { wood: M.wood, h: 7 });
      swampPool(-20, -30, 6);
      swampPool(-8, -44, 4);
      swampPool(50, -60, 7);
      swampPool(-78, 50, 5);
      campfire(-24, 14);
      campfire(26, -22);
      for (const [x, z, r] of [[-12, 10, 0.4], [16, -10, 1.6], [-30, -6, 2.2], [8, 30, 0.9], [44, -20, 0.2], [-60, 18, 1.4]]) fallenTree(x, z, r);
      for (const [x, z, r] of [[-40, 34, 0.3], [34, 38, 1.2], [-52, -50, 0.6]]) logPile(x, z, r);
      car(-70, -20, 0.6);
      car(70, -36, 2.1, { flipped: true });
      truck(-14, -70, 1.1);
      scatter(170, 2, (x, z) => pineTree(x, z, { dead: rng() < 0.3 }), 16);
      scatter(30, 1.5, (x, z) => rock(x, z, rand(0.6, 2.4)));
      scatter(14, 0.8, barrel);
      scatter(10, 1, crate);
      scatter(60, 3, (x, z) => pineTree(x, z, { scale: 1.4 }), ARENA_RADIUS + 3, ARENA_RADIUS + 60);
      // lamps by the church path, mushrooms and stumps
      for (const [x, z] of [[-8, 56], [4, 56], [-8, 44], [4, 44]]) lampAt(x, z, x < 0 ? 0 : PI);
      clutter(90, new THREE.ConeGeometry(0.12, 0.14, 7), mat(0xb8462e), { y: 0.1, scale: [0.6, 1.5], flat: true });
      clutter(40, new THREE.CylinderGeometry(0.35, 0.42, 0.45, 9), M.tree, { y: 0.2, flat: true, maxR: 90 });
      extras({ debris: M.stone, cover: 14, barrels: 6 });
    },

    docks() {
      // warehouses along the quay
      warehouse(-30, 30, PI / 2);
      warehouse(30, -32, PI / 2);
      brokenHouse(-42, -40, PI / 2, 12, 8, { h: 4.4, wall: M.metalDark, chimney: false });
      brokenHouse(45, 40, -PI / 2, 14, 9, { h: 5, wall: M.concreteDark, chimney: false, graffiti: 'NO EXIT' });
      // container yard
      for (const [x, z, r, l] of [[-14, -14, 0.2, 2], [14, 14, -0.3, 2], [-20, 52, 1.5, 3], [24, -58, 0.5, 3], [-58, 24, 0, 2], [56, -24, 0, 2], [0, -82, PI / 2, 2], [0, 82, PI / 2, 2]]) containerStack(x, z, r, l);
      container(-45, 8, PI / 2, M.containerB);
      container(44, -10, PI / 2, M.containerA);
      container(8, 40, 0.1, M.containerC);
      container(-12, -40, 0.1, M.containerA);
      crane(0, 30, 0);
      crane(8, -26, PI);
      lighthouse(78, -66);
      boat(-80, -58, 0.6);
      boat(70, 72, -2.2, 0.9);
      boat(-66, 76, 2.5, 1.1);
      truck(30, 2, PI / 2);
      truck(-48, -18, 0.4);
      fuelTank(64, 26, 0.2);
      fuelTank(70, 36, 0.2);
      car(-24, -64, 1.2, { flipped: true });
      car(34, 66, 0.3);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * PI * 2;
        bollard(Math.cos(a) * 104, Math.sin(a) * 104);
      }
      for (let i = 0; i < 9; i++) {
        const a = rand(0, PI * 2);
        const d = rand(18, 95);
        oilSlick(Math.cos(a) * d, Math.sin(a) * d, rand(2, 4));
      }
      for (const a of [0.4, 1.9, 3.3, 4.6, 5.7]) pier(a);
      scatter(14, 4, (x, z) => containerStack(x, z, rand(0, PI), rng() < 0.5 ? 2 : 1), 22, ARENA_RADIUS - 8);
      scatter(24, 1.4, pallet, 16, ARENA_RADIUS - 6);
      scatter(26, 0.8, barrel);
      scatter(22, 1, crate);
      scatter(12, 1.5, (x, z) => rock(x, z, rand(0.4, 1.4)));
      // quay lamps, more cover in the container yard, fuel drums
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * PI * 2 + 0.3;
        lampAt(Math.cos(a) * 92, Math.sin(a) * 92, -a + PI);
      }
      for (const [x, z] of [[60, 20], [74, 30], [-50, -14], [26, 6]]) barrelAt(x, z);
      dumpsterAt(-20, 22, 0.2);
      dumpsterAt(36, -24, PI);
      ammoAt(-6, 22, 0);
      ammoAt(6, -18, PI);
      extras({ debris: M.rust, stones: M.concreteDark, cover: 18 });
    },

    village() {
      // houses round the village green (the middle stays clear for capture point)
      for (const [x, z, r, w, d, o] of [
        [-20, -22, 0.2, 8, 6, {}], [20, -22, -0.2, 8, 6, { wall: M.brick }], [-26, 12, PI / 2, 9, 7, {}], [27, 8, -PI / 2, 8, 6, { wall: M.woodWall }],
        [-14, 30, PI, 8, 6, { wall: M.plaster2 }], [14, 32, PI, 9, 6, {}], [-52, -30, 0.5, 9, 7, { wall: M.woodWall }], [54, -32, -0.4, 8, 6, {}],
        [-56, 34, 2, 8, 7, { wall: M.brick }], [60, 36, -2.2, 9, 7, {}],
      ]) brokenHouse(x, z, r, w, d, { chimney: true, ...o });
      // the farm: barn, windmill, water tower, hay
      brokenHouse(82, 22, -PI / 2, 12, 9, { h: 4.6, wall: M.barnRed, chimney: false });
      windmill(-92, -18);
      waterTower(88, -36);
      for (const [x, z] of [[72, 46], [74, 44], [70, 50], [92, 6], [94, 9], [-82, 30], [-80, 33]]) hayBale(x, z);
      // sheds, and toilets out the back
      for (const [x, z, r] of [[-38, -12, 0.3], [40, -14, -0.3], [-8, -36, 0], [12, -38, 0.5], [46, 52, 1], [-48, 54, 2], [-64, -50, 0.8], [66, -52, -0.8], [-86, 6, PI / 2], [86, -6, -PI / 2]]) shed(x, z, r);
      for (const [x, z, r] of [[33, -4, PI], [-30, 42, 0.4], [6, 46, PI], [-60, 24, -PI / 2]]) shed(x, z, r, { w: 1.5, d: 1.5, h: 2.3, wall: HM.blue });
      // the hedge maze up north, the corn fields down south
      hedgeMaze(0, -64);
      cornField(-30, 52, 22, 16);
      cornField(32, 64, 22, 16);
      playground(40, -40, 0.4);
      // containers and crates to squeeze between
      for (const [x, z, r, m] of [[56, -70, 0.3, M.containerA], [62, -64, 1.7, M.containerB], [-60, -70, 0.2, M.containerC], [-52, -76, 1.5, M.containerA], [-88, 64, 0.6, M.containerB]]) container(x, z, r, m);
      for (const [x, z, r] of [[50, -60, 0.2], [-46, -64, 1], [24, -54, 0.6], [-24, -52, 2.1]]) crateStack(x, z, r);
      watchtower(-96, 40, 0.3, { wood: M.wood });
      watchtower(98, 52, -0.4, { wood: M.wood });
      car(-6, 44, 0.4);
      car(48, 10, PI / 2 + 0.2);
      truck(-40, 2, 0.2);
      // the orchard
      for (let i = 0; i < 18; i++) roundTree(-66 + (i % 6) * 7 + rand(-1.5, 1.5), 62 + Math.floor(i / 6) * 8 + rand(-1.5, 1.5));
      // fences round the fields
      fenceLine(-42, 42, -18, 42);
      fenceLine(20, 54, 44, 54);
      // bushes everywhere, a ring of trees, crates and barrels
      for (const [x, z] of [[-14, -14], [14, -14], [-16, 18], [16, 20], [-34, 24], [36, 22], [-30, -34], [30, -34]]) bush(x, z, 1.2);
      scatter(70, 1.6, (x, z) => bush(x, z), 14, ARENA_RADIUS - 8);
      scatter(26, 1.4, (x, z) => roundTree(x, z), 30, ARENA_RADIUS - 4);
      scatter(18, 1, crate, 14, 90);
      scatter(14, 0.8, barrel, 14, 90);
      scatter(10, 1.3, hayBale, 20, 95);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + 0.2;
        lampAt(Math.cos(a) * 14, Math.sin(a) * 14, -a + PI);
      }
      extras({ cover: 8, barrels: 0, ammo: 2, debris: M.wood, stones: M.rock });
    },

    ember() {
      // scorched mining camp
      brokenHouse(-30, 26, 0.3, 8, 6, { wall: M.burnt, roof: false, graffiti: 'BURN' });
      brokenHouse(32, -24, 2.8, 8, 6, { wall: M.burnt, roof: false });
      warehouse(-48, -36, 1.2 + PI / 2); // the mine's ore shed
      brokenHouse(46, 44, -0.8, 8, 6, { wall: M.burnt });
      watchtower(58, 8, PI, { wood: M.burnt, h: 7 });
      watchtower(-56, -6, 0.2, { wood: M.burnt, h: 7 });
      planeWreck(-20, -60, 0.4, 0.8, true);
      lavaPool(30, -50, 7);
      lavaPool(45, -64, 5);
      lavaPool(-50, 55, 7);
      lavaPool(-34, 70, 5);
      lavaPool(62, 32, 5);
      lavaPool(-70, -60, 6);
      for (const [x, z, h] of [[-14, -16, 9], [16, 16, 8], [-22, 12, 6], [20, -14, 7], [0, -26, 10], [0, 30, 9], [-40, -12, 7], [40, 8, 6], [-62, 30, 11], [64, -32, 10], [-20, 88, 12], [24, 90, 9], [-86, -20, 13], [88, 10, 12]]) spire(x, z, h);
      truck(14, -38, 0.7);
      car(-8, 48, 2.4, { flipped: true });
      car(70, -10, 1.1);
      for (const [x, z, r] of [[-12, 10, 0.4], [16, -8, 1.6], [8, 52, 0.9], [-44, 40, 2.1]]) fallenTree(x, z, r);
      scatter(40, 1.5, deadTree);
      scatter(36, 1.5, (x, z) => rock(x, z, rand(0.5, 2.2)));
      scatter(12, 0.8, barrel);
      scatter(10, 1, crate);
      scatter(30, 3, (x, z) => spire(x, z, rand(10, 22)), ARENA_RADIUS + 3, ARENA_RADIUS + 50);
      // bones, burning braziers and the usual cover
      clutter(80, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), mat(0xd8cdb4), { y: 0.03, scale: [0.6, 1.4] });
      clutter(30, new THREE.SphereGeometry(0.12, 7, 5), mat(0xd8cdb4), { y: 0.08, scale: [0.8, 1.2] });
      for (const [x, z] of [[-24, 20], [26, -18], [40, 38], [-40, -30]]) campfire(x + 3, z + 3);
      ammoAt(-26, 30, 0.3);
      ammoAt(28, -28, 2.8);
      extras({ debris: M.burnt, stones: M.obsidian, cover: 16, barrels: 10 });
      for (let i = 0; i < 12; i++) {
        const a = rand(0, PI * 2);
        const d = rand(20, 100);
        conform(rand(5, 9), rand(5, 9), 4, 4, Math.cos(a) * d, Math.sin(a) * d, rand(0, PI), scorchMat, 0.05);
      }
    },
  };
  layouts[mapId]();
  adverts();
  if (halloween) halloweenDecor();

  // Dry grass tufts
  {
    // a tuft = a handful of thin blades leaning outwards
    const verts = [];
    const blades = 7;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * PI * 2 + rand(-0.3, 0.3);
      const lean = rand(0.15, 0.5);
      const h = rand(0.35, 0.65);
      const w = 0.035;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const px = -cz * w;
      const pz = cx * w;
      const tx = cx * lean * h;
      const tz = cz * lean * h;
      verts.push(px, 0, pz, -px, 0, -pz, tx, h, tz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
    const count = theme.grass.count;
    const inst = new THREE.InstancedMesh(geo, grassMat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const shades = theme.grass.shades;
    for (let i = 0; i < count; i++) {
      const a = rng() * PI * 2;
      const d = Math.sqrt(rng()) * 180;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      dummy.position.set(x, heightAt(x, z) - 0.05, z);
      dummy.rotation.set(rand(-0.3, 0.3), rand(0, PI), rand(-0.3, 0.3));
      const s = rand(0.6, 1.6);
      dummy.scale.set(s, s * rand(0.7, 1.4) * theme.grass.h, s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.setHex(pick(shades)));
    }
    inst.receiveShadow = true;
    root.add(inst);
  }

  // Tumbleweeds rolling with the wind
  if (theme.tumbleweeds) {
    const tw = [];
    const twMat = new THREE.MeshStandardMaterial({ color: 0x8b6f45, wireframe: true });
    for (let i = 0; i < 7; i++) {
      const r = rand(0.4, 0.75);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), twMat);
      m.castShadow = true;
      const x = rand(-90, 90);
      const z = rand(-90, 90);
      m.position.set(x, heightAt(x, z) + r, z);
      root.add(m);
      tw.push({ m, r, speed: rand(2.5, 5), phase: rand(0, 10) });
    }
    const wind = new THREE.Vector2(1, 0.35).normalize();
    updaters.push((dt, t) => {
      for (const o of tw) {
        const gust = 0.6 + Math.sin(t * 0.4 + o.phase) * 0.4;
        const v = o.speed * gust;
        o.m.position.x += wind.x * v * dt;
        o.m.position.z += wind.y * v * dt;
        if (o.m.position.x > 120) {
          o.m.position.x = -120;
          o.m.position.z = rand(-90, 90);
        }
        const bounce = Math.abs(Math.sin(t * 3 + o.phase)) * 0.35 * gust;
        o.m.position.y = heightAt(o.m.position.x, o.m.position.z) + o.r + bounce;
        o.m.rotation.z -= (v * dt) / o.r;
        o.m.rotation.x += (v * dt * 0.3) / o.r;
      }
    });
  }

  // Smoke columns from the airliner
  {
    const tex = softDotTexture();
    const puffs = [];
    for (const src of smokeSources) {
      for (let i = 0; i < 26; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x3a3632, transparent: true, depthWrite: false, opacity: 0 }));
        sp.position.copy(src);
        root.add(sp);
        puffs.push({ sp, src, age: (i / 26) * 7, life: 7 });
      }
    }
    updaters.push((dt) => {
      for (const p of puffs) {
        p.age += dt;
        if (p.age > p.life) {
          p.age = 0;
          p.sp.position.copy(p.src).add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)));
        }
        const k = p.age / p.life;
        p.sp.position.y += dt * 2.2;
        p.sp.position.x += dt * 1.6 * k;
        p.sp.position.z += dt * 0.5 * k;
        const s = 1.5 + k * 7;
        p.sp.scale.set(s, s, 1);
        p.sp.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.55;
      }
    });
  }

  // Dust motes drifting around the player
  {
    const n = 500;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([rand(-30, 30), rand(0, 8), rand(-30, 30)], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: theme.motes, size: theme.fireflies ? 0.12 : 0.07, map: softDotTexture(), transparent: true, opacity: theme.fireflies ? 0.9 : 0.6, depthWrite: false }));
    pts.frustumCulled = false;
    root.add(pts);
    updaters.push((dt, t, p) => {
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3] + dt * (theme.fireflies ? Math.sin(t * 0.7 + i) * 0.6 : 1.5);
        let y = arr[i * 3 + 1] + (theme.snowfall ? -dt * 0.8 : theme.embers ? dt * 0.9 : Math.sin(t + i) * dt * 0.2);
        let z = arr[i * 3 + 2] + dt * (theme.fireflies ? Math.cos(t * 0.6 + i) * 0.6 : 0.5);
        if (y < p.y - 1) y += 9;
        if (y > p.y + 9) y -= 9;
        if (x - p.x > 30) x -= 60;
        if (x - p.x < -30) x += 60;
        if (z - p.z > 30) z -= 60;
        if (z - p.z < -30) z += 60;
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- finalize
  for (const l of pendingLadders) {
    const g = l.parent;
    const base = toWorld(g, l.lx, l.lz);
    const c = Math.cos(g.rotation.y);
    const s = Math.sin(g.rotation.y);
    const nx = c * l.nx + s * l.nz;
    const nz = -s * l.nx + c * l.nz;
    ladders.push({ x: base.x, z: base.z, nx, nz, bottom: g.position.y, top: g.position.y + l.height });
  }
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.collide) colliders.addFromMesh(o);
    if (o.userData.solid) solids.push(o);
  });

  return {
    halloween,
    colliders,
    solids,
    lootSpots,
    // where bots hide: the hiding places, and the loot spots on the ground (in houses and by things)
    hideSpots: [...hideSpots, ...lootSpots.filter((s) => !s.high && !s.roof)],
    ladders,
    hazards,
    explosives,
    ammoCrates,
    shops,
    // admin: a new red barrel on the spot
    addBarrel(x, z) {
      redBarrel(x, z);
      const b = explosives[explosives.length - 1];
      b.group.updateMatrixWorld(true);
      b.group.traverse((o) => o.isMesh && o.userData.solid && solids.push(o));
      return b;
    },
    // a barrel blowing up (alive=false) or coming back
    setBarrel(id, alive) {
      const b = explosives[id];
      if (!b) return null;
      b.alive = alive;
      b.group.visible = alive;
      b.col.top = alive ? b.top : -Infinity;
      return b;
    },
    mapId,
    theme,
    atmosphere: { skyTop: skyColorTop, skyHorizon: skyColorHorizon, hemi, sun, fill, sunDir },
    update(dt, t, playerPos) {
      for (const u of updaters) u(dt, t, playerPos);
    },
    // particle hooks for map effects (campfires)
    setEffects(effects) {
      fireFx = (p) => effects.burst(p, { count: 1, color: [0xff9a2a, 0xffd04a, 0xff5a10], speed: 0.5, size: 0.14, life: 0.7, grav: -3, up: 1.2, spread: 0.4 });
    },
    dispose() {
      root.removeFromParent();
      const seen = new Set();
      root.traverse((o) => {
        if (o.userData.shared) return; // the warehouse model: other maps use it too
        if (o.geometry && !seen.has(o.geometry)) {
          seen.add(o.geometry);
          o.geometry.dispose();
        }
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          if (seen.has(m)) continue;
          seen.add(m);
          if (m.map) m.map.dispose();
          m.dispose();
        }
      });
    },
  };
}
