import * as THREE from 'three';
import { mulberry32 } from './terrain.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Ground texture. The palette decides the look: dry dirt, snow, forest floor...
export const GROUND_PALETTES = {
  plains: { base: '#b39b74', blots: ['#a08560', '#c2aa80', '#8f7a52', '#9c8f5a', '#7f7448', '#c9b48c'], strokes: ['#8a7c45', '#6e6538'], specks: ['#5d5141', '#d8c8a8'] },
  snow: { base: '#e6ebf0', blots: ['#d5dde6', '#f4f7fa', '#c9d3de', '#dfe6ee', '#bcc8d4', '#ffffff'], strokes: ['#c3ccd6', '#aeb9c6'], specks: ['#9aa6b4', '#ffffff'] },
  mud: { base: '#6a6458', blots: ['#5a554a', '#76705f', '#4e4a40', '#6e6a5a', '#585e5a', '#807864'], strokes: ['#5a5a40', '#4a4a34'], specks: ['#3a3630', '#9a9282'] },
  ash: { base: '#3a3330', blots: ['#2c2624', '#4a403a', '#241e1c', '#55463c', '#3e2a22', '#5a4a40'], strokes: ['#4a3a30', '#2e2420'], specks: ['#ff6a1a', '#6a5a50'] },
  meadow: { base: '#6f8f45', blots: ['#62823c', '#7d9c4e', '#587a36', '#86a356', '#6b8a40', '#93a95c'], strokes: ['#4f7a2e', '#5f8a36'], specks: ['#c8b84a', '#e8e0a0'] },
  forest: { base: '#4a4632', blots: ['#3c3a28', '#565236', '#2f3122', '#4f4a2e', '#3a4a2a', '#5a4a34'], strokes: ['#3f5a2a', '#2e4220'], specks: ['#2a241c', '#6a5e44'] },
};

export function groundTexture(palette = GROUND_PALETTES.plains) {
  const rng = mulberry32(7);
  const [c, g] = canvas(512);
  g.fillStyle = palette.base;
  g.fillRect(0, 0, 512, 512);
  const blot = palette.blots;
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.08 + rng() * 0.15;
    g.fillStyle = blot[Math.floor(rng() * blot.length)];
    const r = 4 + rng() * 26;
    g.beginPath();
    g.ellipse(rng() * 512, rng() * 512, r, r * (0.4 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // grass strokes
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.25 + rng() * 0.35;
    g.strokeStyle = rng() < 0.5 ? palette.strokes[0] : palette.strokes[1];
    g.lineWidth = 1;
    const x = rng() * 512;
    const y = rng() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 6, y - 3 - rng() * 6);
    g.stroke();
  }
  // pebbles
  for (let i = 0; i < 500; i++) {
    g.globalAlpha = 0.5;
    g.fillStyle = rng() < 0.5 ? palette.specks[0] : palette.specks[1];
    g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 2, 1 + rng() * 2);
  }
  g.globalAlpha = 1;
  return finish(c, 70);
}

// Cracked asphalt with a faded centre line.
export function roadTexture() {
  const rng = mulberry32(11);
  const [c, g] = canvas(512);
  g.fillStyle = '#4a4744';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(30,28,26,0.4)' : 'rgba(120,115,105,0.35)';
    g.fillRect(rng() * 512, rng() * 512, 2, 2);
  }
  // sand drifting over the edges
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.15 + rng() * 0.25;
    g.fillStyle = '#a99270';
    const edge = rng() < 0.5 ? rng() * 90 : 512 - rng() * 90;
    g.beginPath();
    g.ellipse(rng() * 512, edge, 20 + rng() * 40, 8 + rng() * 25, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.55;
  g.fillStyle = '#b89a3c';
  for (let x = 0; x < 512; x += 128) {
    if (rng() < 0.8) g.fillRect(x + 10, 250, 70, 10);
  }
  g.globalAlpha = 0.8;
  g.strokeStyle = '#211f1c';
  for (let i = 0; i < 26; i++) {
    let x = rng() * 512;
    let y = rng() * 512;
    g.lineWidth = 1 + rng() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rng() - 0.5) * 50;
      y += (rng() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = finish(c);
  t.repeat.set(30, 1);
  return t;
}

// Generic weathering: stains, streaks and scratches. Materials tint it with their colour.
export function grimeTexture() {
  const rng = mulberry32(23);
  const [c, g] = canvas(256);
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const v = 150 + Math.floor(rng() * 90);
    g.globalAlpha = 0.1 + rng() * 0.25;
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    const r = 3 + rng() * 22;
    g.beginPath();
    g.arc(rng() * 256, rng() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.12 + rng() * 0.2;
    g.fillStyle = '#6b5a48';
    const x = rng() * 256;
    g.fillRect(x, rng() * 120, 1 + rng() * 3, 40 + rng() * 120);
  }
  for (let i = 0; i < 2500; i++) {
    g.globalAlpha = 0.25;
    g.fillStyle = rng() < 0.5 ? '#8c8c8c' : '#ffffff';
    g.fillRect(rng() * 256, rng() * 256, 1, 1);
  }
  g.globalAlpha = 1;
  return finish(c);
}

export function planksTexture() {
  const rng = mulberry32(5);
  const [c, g] = canvas(256);
  for (let y = 0; y < 256; y += 32) {
    const v = 170 + Math.floor(rng() * 60);
    g.fillStyle = `rgb(${v},${v - 18},${v - 40})`;
    g.fillRect(0, y, 256, 32);
    g.fillStyle = 'rgba(40,25,10,0.7)';
    g.fillRect(0, y, 256, 2);
    for (let k = 0; k < 30; k++) {
      g.fillStyle = 'rgba(70,45,20,0.25)';
      g.fillRect(rng() * 256, y + 3 + rng() * 26, 20 + rng() * 60, 1);
    }
  }
  return finish(c);
}

export function softDotTexture() {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function muzzleTexture() {
  const [c, g] = canvas(128);
  g.translate(64, 64);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7);
    g.beginPath();
    g.moveTo(-9, 0);
    g.lineTo(0, 64);
    g.lineTo(9, 0);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 26, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Painted text on a weathered board, e.g. road signs or graffiti.
export function textTexture(lines, { bg = '#8b7355', fg = '#2b2118', w = 512, h = 256, font = 'bold 64px Impact, sans-serif', grime = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  } else {
    g.clearRect(0, 0, w, h);
  }
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    g.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  if (grime) {
    const rng = mulberry32(99);
    for (let i = 0; i < 400; i++) {
      g.globalAlpha = 0.2;
      g.fillStyle = rng() < 0.5 ? '#3a2e22' : '#cbb594';
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 2 + rng() * 6);
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
