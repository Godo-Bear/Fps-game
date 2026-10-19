import * as THREE from 'three';
import { MODEL_COLORS } from '../shared/cosmetics.js';
import { PIECE_SETS, piecesOf } from '../shared/events.js';
import { buildModelCharacter, loadCharacterModel } from './character.js';

// The puzzle you see when you pick up an event piece: the character's picture cut into four jigsaw pieces.
// The new piece flies in and snaps into its place; the fourth one unlocks the character.
const W = 200;
const H = 260;
const R = 15; // knob size

// a knob on the edge from a to b, bulging in direction d
function edge([ax, ay], [bx, by], d) {
  if (!d) return `L ${bx} ${by}`;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const len = Math.hypot(bx - ax, by - ay);
  const tx = (bx - ax) / len;
  const ty = (by - ay) / len;
  const p1 = [mx - tx * R, my - ty * R];
  const p2 = [mx + tx * R, my + ty * R];
  const c1 = [p1[0] + d[0] * R * 2.3 - tx * R * 0.9, p1[1] + d[1] * R * 2.3 - ty * R * 0.9];
  const c2 = [p2[0] + d[0] * R * 2.3 + tx * R * 0.9, p2[1] + d[1] * R * 2.3 + ty * R * 0.9];
  return `L ${p1[0]} ${p1[1]} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]} L ${bx} ${by}`;
}
// pieces 0-3: top left, top right, bottom left, bottom right (the knobs match up between neighbours)
const w = W / 2;
const h = H / 2;
const PATHS = [
  `M 0 0 ${edge([0, 0], [w, 0])} ${edge([w, 0], [w, h], [1, 0])} ${edge([w, h], [0, h], [0, 1])} Z`,
  `M ${w} 0 ${edge([w, 0], [W, 0])} ${edge([W, 0], [W, h])} ${edge([W, h], [w, h], [0, -1])} ${edge([w, h], [w, 0], [1, 0])} Z`,
  `M 0 ${h} ${edge([0, h], [w, h], [0, 1])} ${edge([w, h], [w, H], [-1, 0])} ${edge([w, H], [0, H])} Z`,
  `M ${w} ${h} ${edge([w, h], [W, h], [0, -1])} ${edge([W, h], [W, H])} ${edge([W, H], [w, H])} ${edge([w, H], [w, h], [-1, 0])} Z`,
];
const CENTRES = [[w / 2, h / 2], [w * 1.5, h / 2], [w / 2, h * 1.5], [w * 1.5, h * 1.5]];

// a picture of each character (made once, then kept)
const portraits = {};
async function portrait(char, color) {
  if (portraits[char]) return portraits[char];
  try {
    await loadCharacterModel(char);
    const c = buildModelCharacter({ model: char, ...MODEL_COLORS[char], hat: 'helmet' });
    if (!c) return null;
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a40, 2.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    c.root.rotation.y = 0.35;
    c.mixer.update(0.4);
    scene.add(c.root);
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 20);
    cam.position.set(0, 1.0, 4.4);
    cam.lookAt(0, 0.92, 0);
    r.render(scene, cam);
    // on a glow in the character's rarity colour, so every piece is bright
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const g = out.getContext('2d');
    const bg = g.createRadialGradient(W, H * 0.8, 20, W, H, H * 1.3);
    bg.addColorStop(0, color);
    bg.addColorStop(1, '#14100c');
    g.fillStyle = bg;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(canvas, 0, 0);
    portraits[char] = out.toDataURL('image/png');
    for (const m of c.mats) m.dispose();
    r.dispose();
    r.forceContextLoss?.();
  } catch {
    return null;
  }
  return portraits[char];
}

let uid = 0;
const queue = [];
let busy = false;
// r: the server's answer ({ piece: { char, n } } or { coins } once you have everything); items: yours, after it
export function showPiece(r, items) {
  queue.push({ r, items });
  if (!busy) next();
}
async function next() {
  const job = queue.shift();
  if (!job) {
    busy = false;
    return;
  }
  busy = true;
  await show(job.r, job.items);
  setTimeout(next, 300);
}

async function show(r, items) {
  let el = document.getElementById('puzzle');
  if (!el) {
    el = document.createElement('div');
    el.id = 'puzzle';
    document.body.appendChild(el);
  }
  if (!r.piece) {
    el.innerHTML = `<div class="pz-card"><div class="pz-head">🧩 EVERY PIECE FOUND</div><div class="pz-done">+${r.coins} 🪙 instead</div></div>`;
    el.className = 'show';
    await wait(2600);
    el.className = '';
    return;
  }
  const set = PIECE_SETS.find((s) => s.char === r.piece.char);
  const have = new Set(piecesOf(items, set.char));
  const count = have.size;
  const done = count === 4;
  const img = await portrait(set.char, set.color);
  const id = `pz${++uid}`;
  const piece = (n) => {
    const owned = have.has(n);
    const isNew = n === r.piece.n;
    const fill = img
      ? `<image href="${img}" x="0" y="0" width="${W}" height="${H}" clip-path="url(#${id}c${n})" preserveAspectRatio="xMidYMid slice"/>`
      : `<path d="${PATHS[n]}" fill="${set.color}" opacity="0.85"/>`;
    return `<g class="pz-p ${owned ? 'own' : 'miss'} ${isNew ? 'new' : ''}" data-n="${n}">
      ${owned ? fill : `<text x="${CENTRES[n][0]}" y="${CENTRES[n][1] + 8}" text-anchor="middle">?</text>`}
      <path class="pz-edge" d="${PATHS[n]}"/></g>`;
  };
  el.innerHTML = `<div class="pz-card" style="--pz:${set.color}">
    <div class="pz-head">🧩 ${done ? 'CHARACTER UNLOCKED' : 'PUZZLE PIECE FOUND'}</div>
    <svg class="pz-board ${done ? 'done' : ''}" viewBox="-6 -6 ${W + 12} ${H + 12}" width="${W}" height="${H}">
      <defs>${PATHS.map((d, n) => `<clipPath id="${id}c${n}"><path d="${d}"/></clipPath>`).join('')}</defs>
      <rect x="0" y="0" width="${W}" height="${H}" rx="6" class="pz-bg"/>
      ${[0, 1, 2, 3].filter((n) => n !== r.piece.n).map(piece).join('')}${piece(r.piece.n)}
    </svg>
    <div class="pz-name"><b>${set.name}</b> <span class="pz-rar">${set.rarity}</span></div>
    <div class="pz-piece">${set.pieces[r.piece.n]} · ${count}/4</div>
    ${done ? `<div class="pz-done">🔓 ${set.name} unlocked! Wear it from the Locker</div>` : ''}
  </div>`;
  el.className = 'show';
  // the new piece starts big, tilted and below, then flies into its place
  const g = el.querySelector('.pz-p.new');
  requestAnimationFrame(() => requestAnimationFrame(() => g?.classList.add('in')));
  await wait(1100);
  g?.classList.add('snap');
  if (done) el.querySelector('.pz-board').classList.add('glow');
  await wait(done ? 3400 : 2200);
  el.className = '';
  await wait(400);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
