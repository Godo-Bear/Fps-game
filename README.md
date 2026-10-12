# Dead Plains

A first-person zombie survival shooter that runs in the browser (Three.js + Vite).

Fight off waves of the dead on a deserted plain full of collapsed houses, a crashed airliner,
a small plane wreck, rusted cars, a leaning water tower, a broken windmill and a gas station nobody will reopen.
After every wave you survive, pick **one of three power-ups** to take into the next fight.

## How to play

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Aim |
| Left click | Shoot (hold for full-auto) |
| R | Reload |
| Shift | Sprint |
| Space | Jump (you can hop over low rubble and fences) |
| 1 / 2 / 3 | Pick a power-up card |
| M | Mute |
| Esc | Pause |

### Zombies
- **Walker**: slow and steady.
- **Runner** (wave 2+): fast and fragile.
- **Brute** (wave 4+): big, slow, hits hard.
- **Abomination**: a boss every 5th wave. Aim for the head.

Zombies get tougher every wave. Medkits sometimes drop from kills, and clearing a wave heals 20 HP.

### Power-up rarities
Each of the three cards rolls its own rarity:

| Rarity | Chance per card |
| --- | --- |
| Rare | 68% |
| Epic | 26% |
| Legendary | 6% |

Higher rarities give bigger versions of the same bonus (damage, fire rate, mag size, reload speed, max HP,
speed, regen, headshot damage, lifesteal, armor, crit chance). Epic unlocks **Cryo Rounds** and **Penetrator**.
Legendary can also roll the exclusives: **Explosive Rounds**, **Second Wind** (cheat death once) and **Double Tap**.
The odds live in `RARITY_ODDS` in `src/powerups.js`.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Deploying to Cloudflare

The game is a static site. `npm run build` writes it to `dist/`, and `wrangler.jsonc` tells Cloudflare to serve that folder.

**Workers (Git integration / Workers Builds)**
- Build command: none needed (`wrangler.jsonc` runs `npm run build` before deploying)
- Deploy command: `npx wrangler deploy`

**Pages (Git integration)**
- Framework preset: `None` (or Vite)
- Build command: `npm run build`
- Build output directory: `dist`

**From your machine**
```bash
npx wrangler login
npm run deploy
```

If your Cloudflare Worker is named something other than `fps-game`, change `name` in `wrangler.jsonc` to match.

## Project layout

```
src/
  main.js      game loop, waves, shooting, HUD, menus
  world.js     the map: terrain, houses, plane wrecks, cars, props, sky, ambience
  zombies.js   zombie types, AI and animation
  weapon.js    rifle view model, ammo, reload
  player.js    movement, jumping, collision
  powerups.js  power-up definitions and rarity rolls
  effects.js   blood, dust, tracers, explosions
  audio.js     synthesised sound effects (no audio files)
  terrain.js   height map and collision boxes
  textures.js  procedurally drawn textures
```
