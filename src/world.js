import * as THREE from 'three';
import { ARENA_RADIUS, Colliders, heightAt, mulberry32 } from './terrain.js';
import { grimeTexture, groundTexture, planksTexture, roadTexture, softDotTexture, textTexture } from './textures.js';

const PI = Math.PI;

// Builds the abandoned plains map: terrain, ruined houses, plane wrecks, cars and clutter.
export function buildWorld(scene) {
  const rng = mulberry32(1337);
  const rand = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const colliders = new Colliders();
  const solids = []; // meshes that stop bullets
  const reserved = []; // circles kept clear of random clutter
  const updaters = [];

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
    scene.add(obj);
    return obj;
  };
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  const isFree = (x, z, r) => {
    if (Math.hypot(x, z) < 12) return false;
    if (Math.abs(z - 24) < 6) return false; // keep the road clear-ish
    for (const o of reserved) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
    return true;
  };

  // ---------------------------------------------------------------- sky & atmosphere
  const skyColorTop = new THREE.Color(0x6f8ba3);
  const skyColorHorizon = new THREE.Color(0xd8b88e);
  scene.fog = new THREE.Fog(skyColorHorizon.clone(), 35, 300);
  const sunDir = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();

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
  scene.add(sky);
  updaters.push((dt, t, p) => sky.position.copy(p));

  const hemi = new THREE.HemisphereLight(0xdfe4e8, 0x8a7458, 1.9);
  scene.add(hemi);
  // soft bounce light from the opposite side so things facing away from the sun aren't pitch black
  const fill = new THREE.DirectionalLight(0xc9d4e0, 0.7);
  fill.position.set(-sunDir.x, 0.6, -sunDir.z);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffd3a1, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -55;
  sc.right = sc.top = 55;
  sc.near = 1;
  sc.far = 240;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
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
    const cDry = new THREE.Color(0xffffff);
    const cOlive = new THREE.Color(0xdcd6b0);
    const cDark = new THREE.Color(0xcab89a);
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
      new THREE.MeshStandardMaterial({ map: groundTexture(), vertexColors: true, roughness: 1, metalness: 0 })
    );
    ground.receiveShadow = true;
    scene.add(ground);
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
    scene.add(m);
    return m;
  };

  // Road across the map
  conform(
    300, 7, 150, 2, 0, 24, 0,
    new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 })
  );

  const scorchMat = new THREE.MeshBasicMaterial({
    map: softDotTexture(), color: 0x14100c, transparent: true, opacity: 0.85, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  });

  // ---------------------------------------------------------------- distant mesas
  {
    const mesaMat = new THREE.MeshStandardMaterial({ color: 0xa47e5f, roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * PI * 2 + rand(-0.15, 0.15);
      const r = rand(290, 360);
      const h = rand(25, 60);
      const rb = rand(30, 60);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rb * rand(0.55, 0.8), rb, h, 7), mesaMat);
      m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
      m.rotation.y = rand(0, PI);
      scene.add(m);
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
        }
        for (const [y0, ph] of pieces) {
          const seg = box(wl.alongX ? sl + 0.01 : T, ph, wl.alongX ? T : sl + 0.01, wall);
          seg.position.set(wl.alongX ? off : wl.cx, y0 + ph / 2, wl.alongX ? wl.cz : off);
          if (ht < h * 0.9 && y0 === 0) seg.rotation[wl.alongX ? 'z' : 'x'] = rand(-0.04, 0.04);
          solid(seg, y0 === 0);
          g.add(seg);
        }
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
    proxy(g, 9 * s + 2 * R, 2 * R, 2 * R, 2.4 * s, R, 0);

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
    proxy(g, 7 * s, 2 * R, 1.9 * R, -9.5 * s, R, 1.8 * s, 0.35);

    // Attached wing dug into the dirt
    const wing = box(3.2 * s, 0.32 * s, 11 * s, hull);
    wing.position.set(1.8 * s, R * 0.35, R + 5.2 * s);
    wing.rotation.set(0.11, -0.12, 0);
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
    proxy(outer, 4.2, 1.9, 1.9, 0, 1, 0, 0, Infinity);
    place(outer, x, z, rot, 0.05);
    reserve(x, z, 3.5);
  }

  // ---------------------------------------------------------------- structures
  function waterTower(x, z) {
    const g = new THREE.Group();
    const lean = new THREE.Group();
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = cyl(0.14, 0.18, 10, M.rust, 8);
      leg.position.set(lx * 0.9, 5, lz * 0.9);
      leg.rotation.set(lz * 0.03, 0, -lx * 0.03);
      lean.add(solid(leg, false));
      proxy(g, 0.5, 2, 0.5, lx, 1, lz);
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
    lean.rotation.z = 0.06;
    g.add(lean);
    place(g, x, z, 0.4);
    reserve(x, z, 5);
  }

  function windmill(x, z) {
    const g = new THREE.Group();
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.14, 11, 0.14, M.metalDark);
      leg.position.set(lx * 0.85, 5.5, lz * 0.85);
      leg.rotation.set(-lz * 0.12, 0, lx * 0.12);
      g.add(leg);
      proxy(g, 0.4, 2, 0.4, lx * 1.45, 1, lz * 1.45);
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
    place(g, x, z, 0.8);
    reserve(x, z, 3);
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
    proxy(g, 0.6, 2, 0.6, 0, 1, 0);
    place(g, x, z, rand(0, PI * 2), 0.1);
    reserve(x, z, 1.5);
  }

  function rock(x, z, r) {
    const m = meshOf(new THREE.DodecahedronGeometry(r, 0), pick([M.rock, M.rock2]));
    m.scale.set(rand(0.9, 1.4), rand(0.5, 0.8), rand(0.9, 1.3));
    m.rotation.set(rand(0, PI), rand(0, PI), rand(0, PI));
    m.position.set(x, heightAt(x, z) + r * 0.2, z);
    scene.add(m);
    if (r > 0.8) {
      solid(m, false);
      colliders.add(x, z, r * 0.85, r * 0.85, rand(0, PI), heightAt(x, z) + r * 0.6);
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
    scene.add(solid(m, false));
    colliders.add(x, z, 0.42, 0.42, 0, heightAt(x, z) + 0.95);
    reserve(x, z, 0.8);
  }

  function crate(x, z) {
    const s = rand(0.8, 1.2);
    const m = box(s, s, s, M.wood);
    m.position.set(x, heightAt(x, z) + s / 2 - 0.05, z);
    m.rotation.set(0, rand(0, PI), rand(-0.05, 0.05));
    scene.add(solid(m));
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
      if (rails) proxy(g, 2.5, 1, 0.2, 0, 0.5, 0, 0, heightAt(x, z) + 1.0);
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
        proxy(outer, 0.4, 2, 0.4, 0, 1, 0);
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
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
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
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
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

  // ---------------------------------------------------------------- layout
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
  brokenHouse(-42, -52, -0.2, 14, 10, { h: 4.6, wall: M.barnRed, chimney: false });
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
  scatter(34, 1.5, deadTree);
  scatter(40, 1.5, (x, z) => rock(x, z, rand(0.4, 2.0)));
  scatter(22, 0.8, barrel);
  scatter(14, 1, crate);
  scatter(10, 3, (x, z) => car(x, z, rand(0, PI * 2), { flipped: rng() < 0.25 }), 25, ARENA_RADIUS);
  // Far rocks beyond the arena so the edges don't look empty
  scatter(30, 3, (x, z) => rock(x, z, rand(1.5, 4)), ARENA_RADIUS + 5, ARENA_RADIUS + 70);

  // Scorched craters
  for (let i = 0; i < 8; i++) {
    const a = rand(0, PI * 2);
    const d = rand(20, 100);
    conform(rand(5, 9), rand(5, 9), 4, 4, Math.cos(a) * d, Math.sin(a) * d, rand(0, PI), scorchMat, 0.05);
  }

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
    const count = 7000;
    const inst = new THREE.InstancedMesh(geo, grassMat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const shades = [0x9c8b52, 0xb39f62, 0x857a48, 0xa69062, 0x7a7444];
    for (let i = 0; i < count; i++) {
      const a = rng() * PI * 2;
      const d = Math.sqrt(rng()) * 180;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      dummy.position.set(x, heightAt(x, z) - 0.05, z);
      dummy.rotation.set(rand(-0.3, 0.3), rand(0, PI), rand(-0.3, 0.3));
      const s = rand(0.6, 1.6);
      dummy.scale.set(s, s * rand(0.7, 1.4), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.setHex(pick(shades)));
    }
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // Tumbleweeds rolling with the wind
  {
    const tw = [];
    const twMat = new THREE.MeshStandardMaterial({ color: 0x8b6f45, wireframe: true });
    for (let i = 0; i < 7; i++) {
      const r = rand(0.4, 0.75);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), twMat);
      m.castShadow = true;
      const x = rand(-90, 90);
      const z = rand(-90, 90);
      m.position.set(x, heightAt(x, z) + r, z);
      scene.add(m);
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
        scene.add(sp);
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
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8d6b0, size: 0.06, transparent: true, opacity: 0.6, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    updaters.push((dt, t, p) => {
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3] + dt * 1.5;
        let y = arr[i * 3 + 1] + Math.sin(t + i) * dt * 0.2;
        let z = arr[i * 3 + 2] + dt * 0.5;
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
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.collide) colliders.addFromMesh(o);
    if (o.userData.solid) solids.push(o);
  });

  return {
    colliders,
    solids,
    update(dt, t, playerPos) {
      for (const u of updaters) u(dt, t, playerPos);
    },
  };
}
