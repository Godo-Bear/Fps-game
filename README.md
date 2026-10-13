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
| Right click | Zoom / aim down sights (red dot, holo sight, 4x and sniper scopes) |
| R | Reload |
| Shift | Sprint |
| C | Crouch, or **slide** while sprinting |
| Space | Jump, or climb onto whatever is in front of you |
| W at a ladder | Climb it (S to go down, Space to jump off) |
| 1–8 / mouse wheel | Switch gun |
| Q | Previous gun |
| Tab | Scoreboard (online) |
| 1 / 2 / 3 | Pick a power-up card (between waves) |
| M | Mute |

### Maps
Pick one on the main menu (or the host picks it for an online room):
- **Dead Plains**: ruined town, crashed airliner, water tower and windmill with ladders.
- **Frostbite Outpost**: snowy military base with bunkers, watchtowers, trucks, containers, a downed helicopter and a frozen lake. Snow and blizzards.
- **Blackwood Hollow**: dark forest at dusk with cabins, a ruined church, a graveyard, ranger towers and **toxic swamp pools that hurt**.

Weather changes between waves: dust storms, rain, thunderstorms, snow, blizzards, fog.

### Zombies
- **Walker**, **Runner** (wave 2+), **Brute** (wave 4+), **Abomination** boss every 5th wave.
- Mutations: **Crawler** (wave 3+, low and fast), **Bloater** (wave 4+, explodes when it dies or reaches you), **Spitter** (wave 5+, lobs acid from range).
- From wave 6, any zombie can be **mutated**: glowing green, tougher, faster, worth double score, and sometimes drops a mutated gun.

Every alive zombie has a small marker over its head, they show on the minimap, and arrows point to the last few.
Headshot kills knock the head clean off. Damage numbers pop out of every hit.

### Climbing, ladders, sliding
Press **Space** facing something up to about 2.3 m high to pull yourself up: cars, crates, rocks, walls, wrecks, sandbags, bunker roofs.
Ladders lead up the water tower, windmill and watchtowers. Zombies climb and use ladders too.

### Guns
You start with the **AR-7 Rifle** (red dot sight, unlimited reserve). Others spawn under light beams around the map:

| Gun | Rarity | Notes |
| --- | --- | --- |
| Viper SMG | Rare | Very fast fire |
| Boomstick | Rare | Shotgun, loads shell by shell |
| Hand Cannon | Epic | Revolver, huge damage |
| Mule LMG | Epic | 100 rounds, holo sight |
| Marksman DMR | Epic | Semi-auto with a 4x scope |
| Longshot | Legendary | Sniper with a full scope |
| Thumper | Legendary | Grenade launcher |

**Mutated guns** glow and get +20% damage plus a power: Toxic (poison), Inferno (fire that spreads),
Shock (lightning chains to 2 zombies), Cryo (freeze, bonus damage to frozen), Vampiric (heal on hit) and Void (chance to erase a zombie).
They spawn rarely on the map, from mutated zombies, and every boss drops one.

### Power-ups and healing
After each wave pick 1 of 3 power-ups. Each card rolls Rare 68% / Epic 26% / Legendary 6%.
Each power-up has a stack limit shown on its card.
Healing from medkits, lifesteal and clearing a wave can **overheal** you up to 50 above max health (blue bar).
Overheal slowly drains, and the **Overcharge** power-up raises the cap.

### Accounts, friends and progress
- Play as a guest (progress saved in your browser) or **create an account** to save it on the server.
- Earn XP every game and level up to unlock avatars, name colours, titles, crosshair colours and gun finishes (Customise).
- **Friends**: add people by username, accept requests, see who's online with their level and best wave.
- **Leaderboard** of best waves.

### Multiplayer
Main menu → **Multiplayer** → **Create room** and send your friends the 5-letter code, or join with a code.
The host picks the mode and map, then starts. Up to 8 players.

| Mode | Goal |
| --- | --- |
| Free-for-all | First to 20 kills |
| Team Deathmatch | Red vs Blue, first team to 30 kills |
| Capture Point | Stand in the zone in the middle to hold it; first to 150 points |
| Capture the Flag | Bring the enemy flag to yours; first to 3 captures |

### Admin
An admin account has every customisation unlocked, can set its own XP, and gets an admin panel (**F2** in-game,
or the Admin tab in the account window) with god mode, infinite ammo, one-hit kills, fly/noclip, 2× speed,
freeze zombies, slow motion, hide HUD, give all guns, mutate all guns, max all power-ups, full heal, spawn a boss
or any zombie type, kill all zombies, set weather, set score and jump to any wave. Cheats only work in solo games;
in multiplayer admins get an ADMIN badge and can kick players.

To become an admin, log in, open the Admin tab and enter the admin code. The code is **not stored in this repo**:
it lives in a Cloudflare secret called `ADMIN_CODE` (case and extra spaces don't matter). Set it in the Cloudflare dashboard
(Worker → Settings → Variables and Secrets → Add → type *Secret*, name `ADMIN_CODE`), or with `npx wrangler secret put ADMIN_CODE`.
For local testing put `ADMIN_CODE="your code"` in a `.dev.vars` file (git-ignored).

## Running locally

```bash
npm install
npm run dev        # the game at http://localhost:5173 (solo play)
npm run cf:dev     # in a second terminal: the backend at :8787, for accounts and multiplayer
npm run build      # production build in dist/
```

The Vite dev server forwards `/api` to the local backend, so with both running everything works locally.

## Deploying to Cloudflare

`wrangler.jsonc` builds the game and deploys a Worker that serves the game and runs the backend under `/api`.
Accounts, friends and multiplayer rooms live in **Durable Objects** (`GameDB` and `Room`). Cloudflare creates them
automatically on the first deploy; there's no database to set up. They're available on the Workers free plan.

**Workers (Git integration / Workers Builds)**
- Build command: none needed (`wrangler.jsonc` runs `npm run build` before deploying)
- Deploy command: `npx wrangler deploy`

**From your machine**
```bash
npx wrangler login
npm run deploy
```

The Worker name in `wrangler.jsonc` is `fps-game`. Change it if your Worker is called something else.

## Project layout

```
src/
  main.js         game loop, solo waves, shooting, HUD, menus
  world.js        the three maps: terrain, buildings, wrecks, ladders, props, sky
  weather.js      weather presets, rain, snow, dust, lightning
  zombies.js      zombie types, mutations, AI, climbing, spit, decapitation
  weapon.js       guns in hand: inventory, firing, aiming, reload animations
  guns.js         gun stats, mutations and 3D models
  pickups.js      guns lying around the map
  player.js       movement, jumping, climbing, ladders, sliding
  powerups.js     power-up definitions, stack limits, rarity rolls
  multiplayer.js  online rooms, lobby, other players, objectives, match HUD
  account.js      login, profile, friends, leaderboard (client)
  minimap.js      rotating minimap
  effects.js      blood, dust, tracers, explosions
  audio.js        synthesised sound effects (no audio files)
  terrain.js      height map and collision boxes
  textures.js     procedurally drawn textures
shared/
  cosmetics.js    levels and unlockables (client + server)
  modes.js        game modes, maps, spawns (client + server)
worker/
  index.js        Cloudflare Worker: accounts/friends (GameDB) and multiplayer rooms (Room)
```
