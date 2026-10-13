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
| Left click | Shoot (hold for full-auto guns) |
| Right click | Zoom / aim down sights (the Longshot has a real scope) |
| R | Reload |
| Shift | Sprint |
| Space | Jump, or climb onto whatever is in front of you |
| 1–7 / mouse wheel | Switch gun |
| Q | Previous gun |
| 1 / 2 / 3 | Pick a power-up card (between waves) |
| M | Mute |
| Esc | Pause |

### Climbing
Walk into something and press **Space** to pull yourself up onto it: cars (hood, then roof), crates, barrels,
hay bales, rocks, broken walls and the airliner wreck (climb the wing, then the fuselage). Anything up to about
2.3 m is climbable, and low rubble can just be walked over. Zombies can climb too, so a car roof buys you time, not safety.

### Guns
You start with the **AR-7 Rifle** (unlimited reserve ammo). Other guns lie around the map, marked by a tall
light beam in their rarity colour; some sit on rooftops or on top of the plane wreck. Walk over one to pick it up.
Picking up a gun you already carry gives you more ammo. Found guns have limited ammo and are dropped when empty.
More guns appear after every wave.

| Gun | Rarity | Notes |
| --- | --- | --- |
| AR-7 Rifle | Starter | Full-auto, unlimited reserve |
| Viper SMG | Rare | Very fast fire, low damage |
| Boomstick | Rare | 9-pellet shotgun, loads shell by shell |
| Hand Cannon | Epic | Revolver, huge damage, pierces one zombie |
| Mule LMG | Epic | 100-round box, slows you down a little |
| Longshot | Legendary | Scoped sniper, pierces 3 zombies |
| Thumper | Legendary | Grenade launcher, lobbed explosive rounds |

Gun spawn odds: Rare 60%, Epic 30%, Legendary 10% (`GUN_DROP_TABLE` in `src/guns.js`).
Every gun has its own reload animation (mag swap, shell-by-shell, revolver speed-loader, bolt-action, drum).

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
  weapon.js    guns in hand: inventory, firing, aiming, reload animations
  guns.js      gun stats and 3D models
  pickups.js   guns lying around the map
  player.js    movement, jumping, climbing, collision
  powerups.js  power-up definitions and rarity rolls
  effects.js   blood, dust, tracers, explosions
  audio.js     synthesised sound effects (no audio files)
  terrain.js   height map and collision boxes
  textures.js  procedurally drawn textures
```
