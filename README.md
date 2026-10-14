# Hollow Ground

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
| T / Enter | Chat (online) |
| 1 / 2 / 3 | Pick a power-up card (between waves) |
| M | Mute |

### Maps
Solo games are always on Dead Plains. The others are multiplayer maps; the host picks one in the room lobby:
- **Dead Plains**: ruined town, crashed airliner, water tower and windmill with ladders.
- **Frostbite Outpost**: snowy military base with bunkers, watchtowers, trucks, containers, a downed helicopter and a frozen lake. Snow and blizzards.
- **Blackwood Hollow**: dark forest at dusk with cabins, a ruined church, a graveyard, ranger towers and **toxic swamp pools that hurt**.
- **Rustwater Docks**: an island harbour in a grey sea: stacked containers with ladders, two cranes you can climb, warehouses, beached boats and a lighthouse. Sea fog, rain and storms.
- **Ember Canyon**: a scorched canyon under a burning sky: **lava pools that burn**, black rock spires, burnt shacks, watchtowers and a smoking plane wreck. Ashfall and choking smoke.

Weather changes between waves: dust storms, rain, thunderstorms, snow, blizzards, fog, sea fog, ashfall and smoke.

### Zombies
- **Walker**, **Runner** (wave 2+), **Brute** (wave 4+), **Abomination** boss every 5th wave.
- Mutations: **Crawler** (wave 3+, low and fast), **Bloater** (wave 4+, explodes when it dies or reaches you), **Spitter** (wave 5+, lobs acid from range).
- A wave has at most **50 zombies** (bosses on top). Each wave's line-up is planned so every type that's unlocked
  shows up; once a wave would be bigger than 50, walkers get swapped for brutes, bloaters, spitters and runners instead,
  so later waves get tougher without flooding the map.
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

### Cover, red barrels and ammo crates
Every map has cover out in the open (concrete barriers, ruined walls, crate stacks you can climb, tyres, dumpsters, sandbag nests).
**Red barrels** blow up when you shoot them or something explodes next to them, hurting zombies and players nearby and
setting off barrels next to them; they come back after a minute. **Ammo crates** (green diamonds on the minimap):
press **E** next to one to refill every gun and get a grenade, once every 45 seconds per crate.

### Power-ups and healing
After each wave pick 1 of 3 power-ups. Each card rolls Rare 68% / Epic 26% / Legendary 6%.
Each power-up has a stack limit shown on its card.
Healing from medkits, lifesteal and clearing a wave can **overheal** you up to 50 above max health (blue bar).
Overheal slowly drains, and the **Overcharge** power-up raises the cap.

### Coins and the shop
You earn **coins** from every game: kills, headshots and waves reached in solo, kills and wins online.
Spend them in the **Shop** (main menu, or the 🪙 Shop tab) on:
- **Upgrades** for solo runs: Toughness (+max health), Firepower (+damage), Quick Hands (+reload speed), Scavenger (more guns and medkits)
- **guns**: equip one and you spawn holding it in every mode (solo, continued games, co-op and PvP, and after every
  respawn), with **unlimited ammo** (you still reload)
- **Revive Tokens**: your next solo run starts with Second Wind
- any **locked cosmetic**, without waiting for the level

Coins and purchases are saved on your account (or in the browser for guests).

### Saving your run
Start solo games from **Saved Games → New Game** and give each one a name. You can keep up to 5 games; **Saved Games** lists them so
you can play, rename or delete each one, and **Continue** jumps back into the most recent. A game is saved when it
starts and after every wave (once you pick a power-up); quitting mid-wave restarts that wave. Logged-in players'
games are stored on their account, so they work on any device (games played as a guest move into your account when
you log in). Dying ends that game and deletes its save.

### Touch screens and controllers
- **Phones and tablets:** a joystick appears where your left thumb lands, drag on the right side to look (or drag
  the fire button), and buttons for aim, jump, crouch/slide, reload, swap, knife, grenade, build and pause.
  The right-hand buttons sit in two arcs around fire, spaced out and sized to fit your screen.
  In build mode fire places, R turns and swap changes what you're building.
- **Controllers** (Xbox / PlayStation layout): left stick move (all the way forward sprints), right stick look,
  RT fire, LT aim, A jump, B crouch/slide, X reload (hold to revive), Y swap gun, LB grenade, RB knife, R3 quick chat wheel, L3 sprint, D-pad up build,
  D-pad down last gun (turns things in build mode), D-pad left/right pick what to build, Start pause, Back scores.
  In menus the D-pad moves between buttons, A presses and B goes back; pick power-ups with left/up/right.

### Knife, grenades and building
- Everyone carries a **Combat Knife** (slot 2). Press **V** for a quick stab with whatever you're holding. Headshots and
  stabbing a zombie in the back hit much harder.
- **G** throws a grenade. You carry up to 4 (more with the **Grenadier** shop upgrade) and get 2 back for every wave
  you clear and when you respawn.
- **B** opens build mode: **1** sandbag barricade (10 scrap), **2** turret (35 scrap), **R** turns it, click places it.
  There's no limit on how many you build; scrap is the only cost. Scrap comes from kills and cleared waves. Zombies have to tear barricades down, and turrets shoot the nearest
  zombie (or enemy player) in range. It works in every mode; online everyone sees the same builds, and in PvP you
  can shoot or blow up the other side's.

### Ready up between waves
After you clear a wave (and pick a power-up) the next one waits until you press **E** (controller **X**, **✚** on phones),
so you can build, restock and get into position. In co-op every squadmate still standing has to be ready; if someone's
away it starts by itself after 2 minutes. Turn on *Start waves by themselves* in Settings (or pick it in the co-op room
settings) to go back to the timer.

### Night waves
Every 4th wave (4, 8, 12...) happens at night: the sky goes dark, the moon comes out and a flashlight comes on.
Night zombies have 40% more health, are 15% faster, hit 25% harder, are more often mutated and include more
runners and spitters, but night kills are worth 1.5× score. Works in solo, Co-op and Defend the Points.

### Bosses
Every 5th wave brings a boss: the **Abomination** (wave 5), the **Screamer** (wave 10, calls in runners and sends
nearby zombies into a frenzy), the **Juggernaut** (wave 15, armoured, winds up and charges) and the **Broodmother**
(wave 20, hatches crawlers and bursts into more when it dies). After that it's any of them.

### Gun mastery
Every gun (and the knife) counts your kills with it: 50 / 150 / 400 / 1000 kills unlock Bronze, Silver, Gold and
Diamond skins for that gun. Pick what each gun wears in **🏅 Mastery** (Customise window).

### Tutorial
Your first new game starts with a short tutorial (move, shoot, aim, reload, jump, slide, knife, grenade, build)
that matches your controls. Skip it with **K** (tap it on touch, **Back** on a controller); turn it back on in
**Settings**.

### Parties, quick chat, revives, spectating, kill cam
- **Parties:** invite friends from **Friends** (🎉 Invite). When the party leader creates or joins a room, everyone
  in the party follows them in. The home screen shows your party.
- **Quick chat wheel:** press **Z**, move the mouse towards a phrase and click to send it (or press 1-8). It shows above
  your head and in chat. Write your own 8 phrases in **Customise**. Controller: R3 opens it, point with the right
  stick, A or RT sends. Touch: tap 💬, then tap one.
- **Co-op revives:** hold **E** (controller X) next to a downed squadmate for 3 seconds.
- **Spectating:** while you're down in co-op you watch a squadmate (click for the next one).
- **Kill cam:** in PvP, after you die the camera follows whoever got you until you respawn.

### Settings
**⚙ Settings** has the everyday options (sensitivity, look speed, invert, field of view, volume, graphics, damage
numbers, FPS, tutorial). **Show all settings** opens the rest: right-click toggles aim, HUD size, crosshair size,
minimap, chat, hit markers, screen shake, view bob, quick chat bubbles and the night flashlight, plus the full list
of keyboard controls. Settings are saved in your browser.

### Updates page
The tabs along the top of the home screen (Locker, Quests, Shop, Friends, Leaderboard, Updates, How to Play and ⚙
Settings) open as pages under the top bar, like a game lobby; **Play** (or Esc) goes back. Opened during a game they're
still pop-ups.

The **📰 Updates** tab on the home screen lists every update, newest first, with a **NEW** badge until you've
looked. New updates go at the top of `src/changelog.js`.

### Daily quests
Three new quests every day (the same for everyone). Finish one, then claim its coins in **📜 Quests** on the menu.

### Chat
A small chat sits in the top left. Online, press **T** or **Enter** to talk to everyone in the room (lobby and matches).
In solo it shows game events.

**Friend chat** works outside of games: open **Friends** from the menu and press **💬 Chat** next to a friend (logged-in
players only, friends only). The Friends button shows a red badge for new messages, and a new message while you play
shows up in the game chat. In a room lobby, **Invite friends** sends them a message with a **JOIN** button.

In Free-for-all, Team Deathmatch, Co-op and Defend the Points you keep the guns you found when you respawn. In Capture Point and
Capture the Flag you start again with the rifle. Online, your health comes back after 5 seconds without getting hit,
and health packs around the map heal 40 HP (they come back 30 seconds later).
Press Esc for the pause menu with **Resume** and **Exit**.

### Accounts, friends and progress
- Play as a guest (progress saved in your browser) or **create an account** to save it on the server.
- Earn XP every game and level up to unlock avatars, name colours, titles, crosshair colours and gun finishes (Customise).
- **Friends**: add people by username, accept requests (a pop-up with ACCEPT / DECLINE appears when one comes in), see who's online with their level and best wave.
- **Parties**: invite friends from the + spots on the home screen; **LEAVE PARTY** sits under the line-up.
- **Live leaderboard**: a "Playing right now" list shows everyone in a zombie run and the wave they're on, and your
  best wave and score count the moment you reach them. The tab refreshes itself every few seconds.

### Multiplayer
Main menu → **Multiplayer** → **Create room** and send your friends the 5-letter code, or join with a code.
The host picks the mode and map, then starts. Up to 8 players.

| Mode | Goal |
| --- | --- |
| Co-op Survival | Everyone on one team against the zombie waves. Go down and you're back next wave; if the whole squad goes down, the run is over |
| Defend the Points | Co-op vs the zombies, but the squad must also hold points A, B and C. Zombies on a point with no one there drain it; stand on it to fill it back up and retake lost ones. Points held earn bonus score each wave; lose all three and you are overrun |
| Free-for-all | First to 20 kills |
| Team Deathmatch | Red vs Blue, first team to 30 kills |
| Capture Point | Stand in the zone in the middle to hold it; first to 150 points |
| Capture the Flag | Bring the enemy flag to yours; first to 3 captures |
| Gun Game | Every kill gives you the next gun on the ladder; the last level is the knife and needs a knife kill. Getting knifed sends you back a gun |
| Infection | After 10 seconds someone turns into a zombie (knife/claws only, more health, faster). Anyone they kill joins them. Survivors win if anyone is left when time runs out |

**Match settings**: under the modes the host can change that mode's settings (score limit, time, health, respawn time,
supply drops, map guns, gun ladder, starting wave, zombie health and so on). **BACK TO NORMAL** puts them back.

**Supply drops**: in every mode a crate parachutes down with red smoke (marked on the minimap). Walk into it to heal
and get a gun with lots of ammo. Infected players can't open them.

### Admin
An admin account has every customisation unlocked, can set its own level and coins, and gets an admin panel (**F2** in-game,
or the Admin tab in the account window) with god mode, infinite ammo, one-hit kills, fly/noclip, 2× speed,
freeze zombies, slow motion, hide HUD, give all guns, mutate all guns, max all power-ups, full heal, spawn a boss
or any zombie type, kill all zombies, set weather, set score and jump to any wave, plus undo buttons
(remove all guns, unmutate, reset power-ups, turn off all cheats) and setting your level and coins. Cheats only work in solo games;
in multiplayer admins get an ADMIN badge and can kick players.

Newer admin tools: max or reset all **gun mastery** (every skin unlocked), finish or reset **today's quests**,
replay or skip the **tutorial**, spawn a **specific boss**, **unlimited reserve for all your guns**, **infinite grenades**, **free building**, **repair all your builds**, **start the next wave now**, **set the max zombies per wave**,
**super turrets**, max / set **scrap**, refill / set **grenades**, remove all builds and zero scrap & grenades.
Admins can also reset their quick chat wheel to the defaults.

**Players on every server**: a list of everyone online (with the room they're in) and a search for any player, with
**kick**, **timeout** (kicked and no online games, chat or messages for 5 minutes up to a week), **ban / unban** (bans the account and its IP), and
**give or take coins** by name. **Blocked words**: type the words nobody may say; only those exact words are hidden as
*** in every chat on every server, and new names can't use them. **Supply drop on me** drops a crate in any mode.
Map props (solo): a red barrel in front of you, blow up every barrel, bring them all back, refill every ammo crate.

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
