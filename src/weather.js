import * as THREE from 'three';

// Weather presets. Everything blends smoothly when the weather changes.
export const WEATHER = {
  clear: {
    name: 'Clear skies', fogNear: 35, fogFar: 300, fog: 0xd8b88e, top: 0x6f8ba3, horizon: 0xd8b88e,
    sun: 2.6, hemi: 1.9, rain: 0, dust: 0, lightning: false, wind: 0,
  },
  overcast: {
    name: 'Overcast', fogNear: 25, fogFar: 200, fog: 0xa9a49a, top: 0x6c737a, horizon: 0xa9a49a,
    sun: 0.9, hemi: 1.7, rain: 0, dust: 0, lightning: false, wind: 0.2,
  },
  dust: {
    name: 'Dust storm', fogNear: 4, fogFar: 70, fog: 0xc39a64, top: 0xb08d63, horizon: 0xc39a64,
    sun: 1.1, hemi: 1.8, rain: 0, dust: 1, lightning: false, wind: 1,
  },
  rain: {
    name: 'Rain', fogNear: 15, fogFar: 140, fog: 0x7d838a, top: 0x4d555e, horizon: 0x7d838a,
    sun: 0.5, hemi: 1.4, rain: 0.7, dust: 0, lightning: false, wind: 0.35,
  },
  storm: {
    name: 'Thunderstorm', fogNear: 10, fogFar: 110, fog: 0x5a6068, top: 0x30363e, horizon: 0x5a6068,
    sun: 0.25, hemi: 1.1, rain: 1, dust: 0, lightning: true, wind: 0.7,
  },
  // Frostbite Outpost
  frostclear: {
    name: 'Cold and clear', fogNear: 40, fogFar: 320, fog: 0xd9e2ea, top: 0x7d93ab, horizon: 0xd9e2ea,
    sun: 2.2, hemi: 1.9, rain: 0, dust: 0, snow: 0.15, lightning: false, wind: 0.1,
  },
  snow: {
    name: 'Snowfall', fogNear: 20, fogFar: 170, fog: 0xc9d3dd, top: 0x8a98a8, horizon: 0xc9d3dd,
    sun: 1.2, hemi: 1.9, rain: 0, dust: 0, snow: 0.6, lightning: false, wind: 0.3,
  },
  blizzard: {
    name: 'Blizzard', fogNear: 3, fogFar: 60, fog: 0xdfe6ee, top: 0xc0cad4, horizon: 0xdfe6ee,
    sun: 0.7, hemi: 2.0, rain: 0, dust: 0, snow: 1, snowWind: 1, lightning: false, wind: 1,
  },
  frostfog: {
    name: 'Freezing fog', fogNear: 2, fogFar: 85, fog: 0xbfc8d0, top: 0xaab4be, horizon: 0xbfc8d0,
    sun: 0.6, hemi: 1.8, rain: 0, dust: 0, snow: 0.2, lightning: false, wind: 0.15,
  },
  // Blackwood Hollow
  dusk: {
    name: 'Dusk', fogNear: 20, fogFar: 190, fog: 0x6a5060, top: 0x2e3350, horizon: 0xb0705a,
    sun: 1.4, hemi: 1.2, rain: 0, dust: 0, lightning: false, wind: 0.1,
  },
  // Rustwater Docks
  harbour: {
    name: 'Grey harbour', fogNear: 25, fogFar: 220, fog: 0x9aa4ab, top: 0x5f6f7d, horizon: 0xa8b2b8,
    sun: 1.3, hemi: 1.7, rain: 0, dust: 0, lightning: false, wind: 0.3,
  },
  seafog: {
    name: 'Sea fog', fogNear: 3, fogFar: 70, fog: 0xb6c0c6, top: 0x9aa6ae, horizon: 0xb6c0c6,
    sun: 0.6, hemi: 1.7, rain: 0, dust: 0, lightning: false, wind: 0.15,
  },
  // Ember Canyon
  emberdusk: {
    name: 'Burning sky', fogNear: 30, fogFar: 230, fog: 0x8a4a34, top: 0x3a1e22, horizon: 0xd0602a,
    sun: 1.8, hemi: 1.2, rain: 0, dust: 0, snow: 0.12, snowColor: 0x6a605a, lightning: false, wind: 0.2,
  },
  ashfall: {
    name: 'Ashfall', fogNear: 12, fogFar: 120, fog: 0x6a5048, top: 0x3a2a28, horizon: 0x8a5a44,
    sun: 0.9, hemi: 1.2, rain: 0, dust: 0, snow: 0.8, snowColor: 0x5a5452, lightning: false, wind: 0.35,
  },
  smoke: {
    name: 'Choking smoke', fogNear: 3, fogFar: 65, fog: 0x4a3a34, top: 0x2a2020, horizon: 0x5a4038,
    sun: 0.5, hemi: 1.0, rain: 0, dust: 0, snow: 0.3, snowColor: 0x4a4442, lightning: false, wind: 0.2,
  },
  mist: {
    name: 'Toxic mist', fogNear: 3, fogFar: 75, fog: 0x4f5a40, top: 0x3a4232, horizon: 0x5a6a48,
    sun: 0.5, hemi: 1.1, rain: 0, dust: 0, lightning: false, wind: 0.05,
  },
};

const NIGHT_FOG = new THREE.Color(0x0e1424);
const NIGHT_TOP = new THREE.Color(0x05070f);
const NIGHT_HORIZON = new THREE.Color(0x1a2438);
const MOONLIGHT = new THREE.Color(0x8aa0ff);

let flake = null;
function flakeTexture() {
  if (flake) return flake;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  flake = new THREE.CanvasTexture(c);
  return flake;
}

const DROPS = 1800;
const DUST = 1400;
const SNOW = 2200;

export class Weather {
  constructor(scene, atmosphere, audio) {
    this.scene = scene;
    this.atm = atmosphere;
    this.audio = audio;
    this.id = 'clear';
    const c = WEATHER.clear;
    this.cur = {
      fogNear: c.fogNear, fogFar: c.fogFar, fog: new THREE.Color(c.fog), top: new THREE.Color(c.top), horizon: new THREE.Color(c.horizon),
      sun: c.sun, hemi: c.hemi, rain: 0, dust: 0, snow: 0, snowWind: 0, wind: 0,
    };
    this.flash = 0;
    this.nextBolt = 8;
    // night: 0 = day, 1 = night (the game sets the target, the sky fades over a few seconds)
    this.night = 0;
    this.nightK = 0;
    this.sunColor = atmosphere.sun.color.clone();


    // rain streaks
    const rg = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) this._resetDrop(i, new THREE.Vector3(), true);
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // blowing dust
    const dg = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) this.dustPos.set([(Math.random() - 0.5) * 60, Math.random() * 10, (Math.random() - 0.5) * 60], i * 3);
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xc8a272, size: 0.35, map: flakeTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // snowflakes
    const sg = new THREE.BufferGeometry();
    this.snowPos = new Float32Array(SNOW * 3);
    for (let i = 0; i < SNOW; i++) this.snowPos.set([(Math.random() - 0.5) * 50, Math.random() * 16, (Math.random() - 0.5) * 50], i * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, map: flakeTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
  }

  dispose() {
    for (const o of [this.rain, this.dust, this.snow]) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.audio.setRain(0);
    this.audio.setWind(0);
  }

  get name() {
    return WEATHER[this.id].name;
  }

  set(id, instant = false) {
    if (!WEATHER[id]) return;
    this.id = id;
    this.snow.material.color.setHex(WEATHER[id].snowColor ?? 0xffffff); // snow, or grey ash
    if (instant) this._blend(1);
  }

  random(exclude) {
    const ids = Object.keys(WEATHER).filter((k) => k !== exclude);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  _resetDrop(i, center, anywhere) {
    const x = center.x + (Math.random() - 0.5) * 50;
    const z = center.z + (Math.random() - 0.5) * 50;
    const y = center.y + (anywhere ? Math.random() * 25 : 18 + Math.random() * 6);
    this.rainPos.set([x, y, z, x + 0.15, y + 0.9, z + 0.05], i * 6);
  }

  _blend(k) {
    const t = WEATHER[this.id];
    const c = this.cur;
    c.fogNear += (t.fogNear - c.fogNear) * k;
    c.fogFar += (t.fogFar - c.fogFar) * k;
    c.fog.lerp(new THREE.Color(t.fog), k);
    c.top.lerp(new THREE.Color(t.top), k);
    c.horizon.lerp(new THREE.Color(t.horizon), k);
    c.sun += (t.sun - c.sun) * k;
    c.hemi += (t.hemi - c.hemi) * k;
    c.rain += (t.rain - c.rain) * k;
    c.dust += (t.dust - c.dust) * k;
    c.snow += ((t.snow || 0) - c.snow) * k;
    c.snowWind += ((t.snowWind || 0) - c.snowWind) * k;
    c.wind += (t.wind - c.wind) * k;
  }

  update(dt, camPos) {
    this._blend(Math.min(1, dt * 0.4));
    const c = this.cur;
    const fog = this.scene.fog;
    fog.near = c.fogNear;
    fog.far = c.fogFar;

    // lightning
    if (WEATHER[this.id].lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 10;
        this.flash = 1;
        this.audio.thunder(0.4 + Math.random() * 1.5);
        if (this.onBolt) this.onBolt();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const f = this.flash > 0 ? (Math.sin(this.flash * 40) > 0 ? this.flash : this.flash * 0.3) : 0;

    fog.color.copy(c.fog).lerp(new THREE.Color(0xdde6ff), f * 0.5);
    this.atm.skyTop.copy(c.top).lerp(new THREE.Color(0xc8d4ff), f * 0.6);
    this.atm.skyHorizon.copy(c.horizon).lerp(new THREE.Color(0xdde6ff), f * 0.5);
    this.atm.sun.intensity = c.sun;
    this.atm.hemi.intensity = c.hemi + f * 4;

    // night: dark blue sky, thick dark fog, the sun becomes a dim blue moonlight
    this.nightK += (this.night - this.nightK) * Math.min(1, dt * 0.5);
    const n = this.nightK;
    if (n > 0.001) {
      // (colours blend in linear space, so these go all the way to the night colours)
      fog.color.lerp(NIGHT_FOG, n);
      fog.near *= 1 - n * 0.5;
      fog.far *= 1 - n * 0.45;
      this.atm.skyTop.lerp(NIGHT_TOP, n);
      this.atm.skyHorizon.lerp(NIGHT_HORIZON, n);
      this.atm.sun.intensity *= 1 - n * 0.85;
      this.atm.hemi.intensity *= 1 - n * 0.78;
      if (this.atm.fill) this.atm.fill.intensity = 0.7 * (1 - n * 0.6);
    }
    this.atm.sun.color.copy(this.sunColor).lerp(MOONLIGHT, n);


    // rain
    this.rain.material.opacity = c.rain * 0.55;
    this.rain.visible = c.rain > 0.02;
    if (this.rain.visible) {
      const p = this.rainPos;
      const fall = 26 * dt;
      const n = Math.floor(DROPS * c.rain);
      for (let i = 0; i < DROPS; i++) {
        const o = i * 6;
        if (i >= n) {
          p[o + 1] = p[o + 4] = -999;
          continue;
        }
        p[o + 1] -= fall;
        p[o + 4] -= fall;
        p[o] -= fall * 0.15;
        p[o + 3] -= fall * 0.15;
        if (p[o + 1] < camPos.y - 6 || Math.abs(p[o] - camPos.x) > 26 || Math.abs(p[o + 2] - camPos.z) > 26) this._resetDrop(i, camPos, p[o + 1] < -900);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // dust
    this.dust.material.opacity = c.dust * 0.8;
    this.dust.visible = c.dust > 0.02;
    if (this.dust.visible) {
      const p = this.dustPos;
      for (let i = 0; i < DUST; i++) {
        const o = i * 3;
        p[o] += dt * (14 + (i % 7));
        p[o + 1] += Math.sin(i + p[o] * 0.1) * dt * 0.8;
        p[o + 2] += dt * 4;
        if (p[o] - camPos.x > 30) p[o] -= 60;
        if (p[o] - camPos.x < -30) p[o] += 60;
        if (p[o + 2] - camPos.z > 30) p[o + 2] -= 60;
        if (p[o + 2] - camPos.z < -30) p[o + 2] += 60;
        if (p[o + 1] - camPos.y > 10 || p[o + 1] - camPos.y < -2) p[o + 1] = camPos.y - 1 + Math.random() * 10;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    // snow
    this.snow.material.opacity = Math.min(1, c.snow * 1.4);
    this.snow.visible = c.snow > 0.02;
    if (this.snow.visible) {
      const p = this.snowPos;
      const n = Math.floor(SNOW * c.snow);
      const drift = 1 + c.snowWind * 14;
      for (let i = 0; i < SNOW; i++) {
        const o = i * 3;
        if (i >= n) {
          p[o + 1] = -999;
          continue;
        }
        p[o] += dt * (Math.sin(i * 1.7 + p[o + 1] * 0.5) * 0.6 + drift);
        p[o + 1] -= dt * (1.4 + (i % 5) * 0.2 + c.snowWind * 2);
        p[o + 2] += dt * Math.cos(i + p[o + 1] * 0.3) * 0.5;
        if (p[o + 1] < camPos.y - 3 || p[o] - camPos.x > 25 || p[o] - camPos.x < -25 || Math.abs(p[o + 2] - camPos.z) > 25) {
          p[o] = camPos.x - 25 + Math.random() * 50;
          p[o + 1] = camPos.y + 4 + Math.random() * 12;
          p[o + 2] = camPos.z + (Math.random() - 0.5) * 50;
        }
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }

    this.audio.setRain(c.rain);
    this.audio.setWind(c.wind);
  }
}
