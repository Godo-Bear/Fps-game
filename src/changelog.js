// Every update so far, newest first. Shown from the 📰 Updates tile on the home screen.
// Add new updates at the top (and bump the version) so players see the NEW badge.
export const CHANGELOG = [
  {
    v: '5.0', date: '15 Oct 2026', title: 'Twists, perks, new modes & more',
    items: [
      'Wave twists: every 3rd wave gets one (Headshots Only, Volatile, Low Gravity, Double Score, Sprinters, Thick Skin, Bloodthirst). You see it while you get ready.',
      'Special waves: Horde Rush (they all come from one side) and Bounty (a golden zombie worth a fortune).',
      'Perk machines and wall-buy guns on every map: spend your points with E. Spending doesn\'t lower your score on the leaderboard.',
      'Finishers: knife a badly hurt zombie to finish it for full mags and +15 HP.',
      'Weekly challenge: the same map and a twist every wave for everyone, with its own board in the Leaderboard tab.',
      '21 achievements, shown as badges in Customise.',
      'New modes: One in the Chamber, Juggernaut, and Extraction (co-op: survive, then hold the helicopter landing zone).',
      'Vote for the next map at the end of a match, and Quick Play drops you into an open room (hosts choose if their room is open).',
      'Music that follows the fight: calm between waves, drums as the horde grows (volume in Settings).',
      'Weather matters: zombies lose you in fog, deep snow slows everyone, and lightning strikes the dead in storms.',
      'Admin: random twist for the next wave, spawn a bounty zombie, +5000 points, unlock all achievements.',
    ],
  },
  {
    v: '4.9', date: '14 Oct 2026', title: 'Smaller, nastier waves',
    items: [
      'A wave never has more than 50 zombies now (bosses come on top), so late waves don\'t flood the map or slow your game down.',
      'Every wave gets a planned mix: each zombie type that\'s unlocked shows up at least once.',
      'Past the cap, waves get harder by swapping walkers for brutes, bloaters, spitters, runners and crawlers. Wave 20 is about one walker in five.',
      'At most 30 zombies are out at once; the rest join as you kill them.',
      'Admin: set the max zombies per wave (solo).',
    ],
  },
  {
    v: '4.8', date: '14 Oct 2026', title: 'Ready up between waves & build as much as you like',
    items: [
      'The next wave waits for you: build, restock and get in position, then press E (controller X, ✚ on phones) when you\'re ready. It starts 3 seconds later.',
      'In co-op every squadmate still standing has to be ready ("2/3 ready" shows on screen). If someone is away, the wave starts by itself after 2 minutes.',
      'Prefer the old timer? Turn on "Start waves by themselves" in Settings, or pick "By itself (timer)" in the co-op room settings.',
      'No more limit on barricades and turrets: build as many as your scrap pays for.',
      'Admin: start the next wave now, and repair all your builds.',
    ],
  },
  {
    v: '4.7', date: '14 Oct 2026', title: 'Busier maps: cover, red barrels & ammo crates',
    items: [
      'Every map has lots more cover out in the open: concrete barriers, half-fallen walls, stacked crates you can climb, tyre piles, dumpsters and sandbag nests.',
      'Red barrels: shoot one (or throw a grenade near it) and it blows up a moment later, hurting zombies and players close by and setting off any barrels next to it. They come back after a minute.',
      'Ammo crates: walk up and press E (controller X) to refill every gun and get a grenade. Each crate refills you once every 45 seconds; the light turns red while it\'s empty. They\'re on the minimap.',
      'More detail: street lamps (some flicker), rubble outside the ruined houses, bricks, stones and planks lying around, mushrooms and stumps in the forest, bones and fires in the canyon.',
      'Admin: put a red barrel in front of you, blow up every barrel, bring them all back and refill every ammo crate.',
    ],
  },
  {
    v: '4.6', date: '14 Oct 2026', title: 'Supply drops, Gun Game, Infection & a live leaderboard',
    items: [
      'Supply drops: crates parachute down with red smoke in every mode. Walk into one to heal and grab a gun with lots of ammo.',
      'New mode, Gun Game: every kill moves you to the next gun. Finish the ladder with a knife kill to win. A knife kill sends the victim back a gun.',
      'New mode, Infection: after 10 seconds someone turns into a zombie. Zombies only have claws; every survivor they get joins them. Last until the timer runs out to win.',
      'Match settings: the room host can change score limit, time, health, respawn time, supply drops, map guns, zombie health, starting wave and more for each mode. BACK TO NORMAL resets them.',
      'The leaderboard is live: see who is playing right now and what wave they are on. Your best wave counts as soon as you reach it, not just when the run ends. It updates by itself.',
      'Friend requests pop up with ACCEPT and DECLINE buttons.',
      'LEAVE PARTY button under your party on the home screen.',
      'Admin: see everyone online on every server, search any player, kick, time out, ban or unban them, and give or take coins by name.',
      'Admin: choose blocked words. Only those exact words are hidden as *** in every chat on every server, and they can\'t be used in names.',
      'Admin: drop a supply crate on yourself in any mode.',
    ],
  },
  {
    v: '4.5', date: '14 Oct 2026', title: 'Lobby tabs, phone buttons & shop guns',
    items: [
      'Locker, Quests, Shop, Friends, Leaderboard, Updates and Settings now open as tabs under the top bar instead of pop-ups. PLAY or Esc takes you back.',
      'Phone buttons are spread out in two arcs around Fire and sized for your screen, so nothing is cramped. The lobby fits better on phones too.',
      'The gun you equip in the Shop is now in your hands when you spawn: new games, continued games, co-op, PvP and every respawn.',
      'Admin: give yourself every Shop gun, and equip any of them from the Admin tab.',
    ],
  },
  {
    v: '4.4', date: '14 Oct 2026', title: 'New lobby',
    items: [
      'A new home screen: tabs along the top, your party standing in the middle as big nameplates, daily quests bottom left.',
      'Pick Continue, Solo or Multiplayer and hit the big PLAY button.',
      'Empty party spots: click + to invite a friend.',
    ],
  },
  {
    v: '4.3', date: '13 Oct 2026', title: 'All settings',
    items: [
      'Settings → Show all settings: HUD size, crosshair size, toggle aim, hit markers, screen shake, view bob, hide the minimap or chat, quick chat bubbles, flashlight.',
      'The full list of keyboard controls is there too.',
    ],
  },
  {
    v: '4.2', date: '13 Oct 2026', title: 'Night waves',
    items: [
      'Every 4th wave happens at night: the sky goes dark, the moon comes up and you get a flashlight.',
      'Night zombies are tougher, faster and hit harder, more of them are mutated, and there are more runners and spitters.',
      'Night kills are worth 1.5× score. New quest: survive 3 night waves.',
      'Admin: always night, never night, or normal.',
    ],
  },
  {
    v: '4.1', date: '13 Oct 2026', title: 'Two new multiplayer maps',
    items: [
      'Rustwater Docks: an island harbour with stacked containers, cranes to climb, warehouses, beached boats and a lighthouse.',
      'Ember Canyon: a scorched canyon with lava pools that burn, black rock spires and falling ash.',
      'New weather: sea fog, ashfall and choking smoke.',
      'Admin: play any map in solo (Admin → Solo map).',
    ],
  },
  {
    v: '4.0', date: '13 Oct 2026', title: 'Unlimited ammo for your starting gun',
    items: [
      'The gun you equip in the Shop now has unlimited ammo (you still reload).',
      'Admin: unlimited reserve ammo for every gun you carry.',
    ],
  },
  {
    v: '3.9', date: '13 Oct 2026', title: 'Quick chat wheel',
    items: [
      'Emotes are gone: the wheel (Z) is now your quick chat, 8 phrases you can rewrite in Customise.',
      'Anyone who bought emotes got their coins back.',
      'Admin: reset your quick chat to the defaults.',
    ],
  },
  {
    v: '3.8', date: '13 Oct 2026', title: 'Emote wheel',
    items: [
      'Emotes and quick chat are now a wheel: hold your aim towards one and click to send it.',
      'Controller: point with the right stick, A or RT sends. Touch: tap the one you want.',
    ],
  },
  {
    v: '3.7', date: '13 Oct 2026', title: 'Custom quick chat',
    items: [
      'Write up to 6 of your own quick chat phrases (Shop → Your quick chat).',
      'Put them in any slot of your Z menu instead of an emote; they pop up over your head and in chat.',
      'Admin: send an announcement to everyone in your room.',
    ],
  },
  {
    v: '3.6', date: '13 Oct 2026', title: 'Updates page & more admin tools',
    items: [
      'This 📰 Updates page: every update since day one.',
      'Admin: max or reset gun mastery, finish or reset today\'s quests, replay or skip the tutorial.',
      'Admin: pick which boss to spawn, infinite grenades, free and unlimited building, super turrets, set scrap and grenades.',
    ],
  },
  {
    v: '3.5', date: '13 Oct 2026', title: 'Shop emotes',
    items: [
      '12 new emotes in the Shop (🔥 On fire!, 👑 Bow down, 🚀 To the moon and more).',
      'Choose which 8 emotes are in your Z menu.',
    ],
  },
  {
    v: '3.4', date: '13 Oct 2026', title: 'Hollow Ground & parties',
    items: [
      'The game is now called Hollow Ground (the solo map is still Dead Plains).',
      'Parties: invite friends, and when the leader goes into a room the whole party follows.',
    ],
  },
  {
    v: '3.3', date: '13 Oct 2026', title: 'Tutorial & gun mastery',
    items: [
      'A short, skippable tutorial before the first wave of your first game.',
      'Gun mastery: kills with each gun unlock Bronze, Silver, Gold and Diamond skins.',
    ],
  },
  {
    v: '3.2', date: '13 Oct 2026', title: 'New bosses & emotes',
    items: [
      'Three new bosses: the Screamer (calls the horde), the Juggernaut (charges) and the Broodmother (hatches crawlers).',
      'Emotes: press Z for quick callouts above your head.',
      'Fixed: zombies in solo games couldn\'t hurt you. They can now!',
    ],
  },
  {
    v: '3.1', date: '13 Oct 2026', title: 'Revives, spectating & kill cam',
    items: [
      'Co-op: hold E next to a downed squadmate to revive them.',
      'Spectate a squadmate while you\'re down.',
      'PvP kill cam: watch whoever got you until you respawn.',
    ],
  },
  {
    v: '3.0', date: '13 Oct 2026', title: 'Phones, controllers & settings',
    items: [
      'Play on phones and tablets with touch controls, or with a controller.',
      'Settings: sensitivity, invert look, field of view, volume, graphics, damage numbers, FPS counter.',
      'A cleaner home screen and a How to Play page.',
    ],
  },
  {
    v: '2.4', date: '13 Oct 2026', title: 'Barricades & turrets',
    items: ['Press B to build sandbag barricades and auto turrets with scrap from kills, in every mode.'],
  },
  {
    v: '2.3', date: '13 Oct 2026', title: 'Daily quests',
    items: ['Three daily quests that pay coins.', 'Start solo games from Saved Games.'],
  },
  {
    v: '2.2', date: '13 Oct 2026', title: 'Knife & grenades',
    items: ['A combat knife for everyone (V for a quick stab, backstabs hit hard).', 'Hand grenades on G.', 'Grenadier upgrade in the Shop.'],
  },
  {
    v: '2.1', date: '13 Oct 2026', title: 'Friend chat',
    items: ['Chat with friends from the menu, with new-message badges and room invites.'],
  },
  {
    v: '2.0', date: '13 Oct 2026', title: 'Defend the Points & named games',
    items: ['New co-op mode: hold points A, B and C against the zombie waves.', 'Name your solo games and keep up to 5 saves.'],
  },
  {
    v: '1.9', date: '13 Oct 2026', title: 'Co-op Survival',
    items: [
      'Co-op Survival: everyone on one team against the waves.',
      'Keep your guns when you respawn in deathmatch.',
      'Health regen and health packs online.',
      'Exit buttons on the pause and end screens.',
    ],
  },
  {
    v: '1.8', date: '13 Oct 2026', title: 'Coins & shop',
    items: ['Earn coins from kills and waves.', 'Shop: upgrades, starting guns, revive tokens and cosmetics.', 'Admin: set level, undo buttons.'],
  },
  {
    v: '1.7', date: '13 Oct 2026', title: 'Saves & chat',
    items: ['Your solo run is saved after every wave so you can continue later.', 'A chat in the top left.', 'Score and wave moved to the top right.'],
  },
  {
    v: '1.6', date: '13 Oct 2026', title: 'Admin',
    items: ['Admin accounts with god mode, infinite ammo, all guns, fly and more.'],
  },
  {
    v: '1.5', date: '13 Oct 2026', title: 'Smarter zombies',
    items: ['Zombies find their way around walls and through doors instead of getting stuck in houses.'],
  },
  {
    v: '1.4', date: '13 Oct 2026', title: 'Online play',
    items: [
      'Accounts, friends and saved progress, with levels and customisation.',
      'Multiplayer with room codes: Free-for-all, Team Deathmatch, Capture Point and Capture the Flag.',
      'Two new maps: Frostbite Outpost and Blackwood Hollow.',
      'Mutated zombies and mutated guns with special powers.',
      'Sliding, ladders, headshots, weather, a minimap and scopes.',
      'Healing can stack above 100.',
    ],
  },
  {
    v: '1.3', date: '13 Oct 2026', title: 'Climbing & guns',
    items: ['Climb onto cars, walls and wrecks.', 'Collect guns around the map.', 'Right click to aim.', 'Reload animations.'],
  },
  {
    v: '1.0', date: '12 Oct 2026', title: 'Launch',
    items: [
      'Survive zombie waves on the deserted plains, with broken houses and plane wrecks.',
      'Pick 1 of 3 power-ups after each wave: Rare, Epic or Legendary.',
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0].v;
