// Every update so far, newest first. Shown from the 📰 Updates tile on the home screen.
// Add new updates at the top (and bump the version) so players see the NEW badge.
export const CHANGELOG = [
  {
    v: '5.52', date: '21 Oct 2026', title: 'Admin: edit the Shop',
    items: [
      'Admin: in the Shop\'s ✏️ EDIT mode every item has ✏️ (change its name, icon, description and price) and 🗑️ (delete it), for the owner\'s specials and the Shop\'s own upgrades, guns and items too. A deleted Shop item can be put back with ↺ PUT BACK, and anyone who already bought something keeps it.',
      'Admin: the admin panel\'s 💵 Shop list has ✏️ EDIT and 🗑️ DELETE on each special.',
    ],
  },
  {
    v: '5.51', date: '21 Oct 2026', title: 'Shop specials',
    items: [
      'The Shop has a 💵 Specials section with items from the owner: some bought with coins straight from the Shop, some with real money (paid to the owner).',
      'New name tags and name colours you can only get there. Wear them from the Locker (Title and Name colour).',
      'Admin: adding a second item to the Shop no longer replaces the first one.',
      'Admin: items can cost coins (players buy them themselves) or real money, and can give a new name tag, a new name colour, or any cosmetic in the game.',
      'Admin: ✏️ EDIT in the corner of the Shop moves its sections up and down and the specials left and right, for everyone.',
    ],
  },
  {
    v: '5.50', date: '21 Oct 2026', title: 'Two event buttons',
    items: [
      'Multiplayer now has a button for each event: 🧩 JOIN EVENT for the third-person Outfit Hunt (every hour, :00 to :30, with the next start time shown while it is off), and 🎃 JOIN THE HALLOWEEN EVENT, open the whole time Halloween is on.',
      'The Halloween event is its own match: Red vs Blue vs the pumpkin-head zombies, with double puzzle-piece drops and candy.',
    ],
  },
  {
    v: '5.49', date: '21 Oct 2026', title: '🎃 Halloween is here!',
    items: [
      'Every map has gone spooky until the end of 7 November: a foggy purple night with jack-o\'-lanterns, graveyards, cauldrons, scarecrows, ghosts and bats, and zombies in pumpkin heads and witch hats.',
      'Zombies drop 🍬 candy (bosses drop a big pile). Spend it in the 🎃 Halloween shop at the top of the Shop on things you can only get now, including glowing gun skins: Jack-o\'-Fire, Ectoplasm, Blood Moon and Phantom.',
      'Halloween guns turn up around the maps: the 🎃 Pumpkin Launcher (fires exploding jack-o\'-lanterns), the 🔮 Hex Rifle (shots go through enemies) and the 💀 Bone Breaker shotgun.',
    ],
  },
  {
    v: '5.48', date: '21 Oct 2026', title: '🧩 Outfit Hunt every hour',
    items: [
      'The Outfit Hunt event (third person, Red vs Blue vs the zombies, collect puzzle pieces to unlock SWAT, Adventurer and King) now runs every hour on the hour until half past: 5:00 to 5:30, 6:00 to 6:30, and so on. Press JOIN EVENT in Multiplayer while it is on.',
      'Admin: Events → Every hour is on from the start (TURN OFF stops it); START IT NOW runs it until the next half past.',
    ],
  },
  {
    v: '5.47', date: '21 Oct 2026', title: 'Skins in the lobby',
    items: [
      'The home-screen line-up now shows you (and your party) wearing your character skin, like Fortnite: SWAT, Adventurer or King, once you have unlocked one with event puzzle pieces. Players without a skin still show just their name.',
      'Admin: the Hide and Seek room button is gone from the admin panel (Hide and Seek is in the normal mode list).',
    ],
  },
  {
    v: '5.46', date: '21 Oct 2026', title: 'Easier-to-find puzzle pieces',
    items: [
      'Event puzzle pieces are much easier to spot: a bigger piece, a tall orange beam, a pulsing ring on the ground, a marker you can see through walls and a dot on the minimap.',
      'The Shop can now have items bought with real money (paid to the owner, like the wolf). They show up there when the owner adds some.',
      'Admin: Events → Every hour runs the piece-hunt event by itself: 30 minutes on, then a 30-minute break, every hour, until it is turned off. START IT NOW runs it straight away if you are late; ending it skips just that hour.',
      'Admin: the seasonal event can now run as a whole season that ends by itself on the day you pick (a week after the holiday to start with), with its own special guns and glowing gun skins.',
      'Admin: give or take that season\'s rewards and gun skins (and how many sweets someone has) for any player.',
      'Admin: a new 💵 Shop tab: add real-money items to the Shop (coins, gun skins, guns, special gear, the wolf, or anything else), then give them to whoever paid you.',
    ],
  },
  {
    v: '5.45', date: '21 Oct 2026', title: 'Admin: guns in every mode',
    items: [
      'Admin: player names can now show next to emails in Supabase (one-time setup, see the guide).',
      'Admin: admins keep their own guns (the rifle, their starting gun and special gear) in every mode, on top of what the mode gives: Gun Game, One in the Chamber, Juggernaut, Infection (even as a zombie) and Hide and Seek (hider or seeker, even while counting). They can pick up guns there too.',
    ],
  },
  {
    v: '5.44', date: '20 Oct 2026', title: 'New web address',
    items: [
      'War Grounds and JINtelligence have moved to a new address (jn-studios.workers.dev). The ads round the maps show the new link and QR code.',
    ],
  },
  {
    v: '5.43', date: '20 Oct 2026', title: 'Admin: a new event is ready',
    items: [
      'Admin: a new seasonal event is ready in the Events tab (nothing changes for anyone until it is started), with a preview only the admin sees.',
      'Admin: it now uses the new 3D models (pumpkins, graves, cauldrons, scarecrows, a scythe and a witch hat).',
      'Admin: and its own rewards to collect and spend (try them with the preview and the test button in the Events tab).',
    ],
  },
  {
    v: '5.42', date: '20 Oct 2026', title: '🤖 Bots in every mode',
    items: [
      'Bots now play every multiplayer mode (set how many in the room lobby), not just the PvP ones:',
      'Co-op, Defend the Points and Extraction: bot squadmates stick with you and shoot the zombies. The zombies can knock them down (they are back up in 20 s), and nobody has to wait for bots to ready up.',
      'Infection: bot survivors fight back, and bot zombies hunt you down with their claws.',
      'Hide and Seek: bot hiders find a hiding place and crouch down (and run if a seeker spots them); bot seekers count, then search the hiding places and chase anyone they can see.',
      'Empty rooms now disappear from the server list as soon as the last person leaves, and rooms waiting in their lobby stay on it.',
      'Admin: a Bots card in the Game tab adds bots to the room you host.',
    ],
  },
  {
    v: '5.41', date: '20 Oct 2026', title: 'Clearer ads',
    items: [
      'The ads round the maps now have a sharp QR code and the link in big, bold letters, so you can read (and scan) them.',
      'The ads are spread out properly over each map instead of bunching up, and the poster stands have a leg each side so nothing covers the poster.',
    ],
  },
  {
    v: '5.40', date: '20 Oct 2026', title: '🙈 Hide and Seek',
    items: [
      'New multiplayer mode: Hide and Seek. Everyone starts hiding; the game picks the seekers, who count with their eyes shut while the rest hide.',
      'Seekers tag hiders with the knife (one tag and you are found) and every hider found joins the seekers. Hiders win if anyone is still hidden when time runs out.',
      'Hiders play in third person so they can peek round corners, and seekers can\'t see their names. Now and then the seekers get a hint: a red light near someone\'s hiding place.',
      'New map: Hideaway Village, made for it. Houses, sheds and outhouses with doors, a hedge maze, corn fields taller than you, bushes you can crouch in, a playground, an orchard and a farm.',
      'The host picks the time limit, how long everyone gets to hide, how many seekers start and how often the hints come.',
      'A few fewer ads round the maps.',
      'Admin: a Hide and Seek card in the Game tab makes a room for it in one click.',
    ],
  },
  {
    v: '5.39', date: '20 Oct 2026', title: '📢 JINtelligence ads around the maps',
    items: [
      'Every map now has JINtelligence ads: big billboards round the edge, poster stands around the middle, banners down the warehouse walls and posters on some house walls.',
      'Admin: an Ads in the maps card in the Game tab turns them off (or back on) for everyone.',
    ],
  },
  {
    v: '5.38', date: '20 Oct 2026', title: '🏭 Warehouses',
    items: [
      'A big new warehouse on every map, replacing an old building: the farm barn on Dead Plains, a supply building at Frostbite Outpost, a cabin in Blackwood Hollow, two warehouses at Rustwater Docks and a shack in Ember Canyon.',
      'They are solid: take cover behind them.',
    ],
  },
  {
    v: '5.37', date: '20 Oct 2026', title: '🔥 Shots fly forward, and a real flamethrower',
    items: [
      'Bullet trails were drawn backwards from the gun. Now every shot is a streak that flies forward from the barrel to where it hits.',
      'The Flamethrower blasts a long jet of fire (it now reaches 24 m) that billows out as it goes, without covering your screen.',
      'Tank: the tank model now faces the way it drives, and the cannon fires straight at your crosshair.',
      'Access is now shown big and clear: $2 for 6 whole months.',
      'The first / third person switch is saved for the big update (events are still third person). Admin: deploy it to everyone from the Game tab.',
    ],
  },
  {
    v: '5.36', date: '20 Oct 2026', title: '🎥 Third person, done properly',
    items: [
      'Characters now hold their gun in both hands, tucked against the chest (not floating or off to the side), like Fortnite, and it points where they look. The gun never goes through their body.',
      'Crouching bends the knees, sliding sits back with one leg out, and running backwards or sideways has its own animation.',
      'Feet stand on the ground, on slopes too, so legs no longer sink into it.',
      'Aiming in third person goes to first person through your sights.',
      'Admin: a First / third person switch card in the Game tab (it is saved for the big update: admins can try it, and deploy it to everyone with one button).',
    ],
  },
  {
    v: '5.35', date: '20 Oct 2026', title: 'Admin: a cleaner panel',
    items: [
      'Admin: the panel is easier to read. Bigger tabs, clear headings with a short note under each, and every section folds away (click its heading). It remembers which ones you opened.',
      'Admin: the bot count and gun position are now drop-downs.',
    ],
  },
  {
    v: '5.34', date: '20 Oct 2026', title: '🏹 The Crossbow, and special gear',
    items: [
      'New gun: the Crossbow. Silent, hits hard and the bolt goes through up to two targets. Find it on the map (epic).',
      'The Thumper and every other explosion now shows up for everyone in online games.',
      'Special gear has arrived: a Tank, a Flamethrower and a Bazooka. Only admins have it, and only an admin can hand it out.',
      'Admin: a Special gear card in the Game tab (get or remove it yourself), and GIVE / TAKE buttons for each piece in MANAGE.',
    ],
  },
  {
    v: '5.33', date: '20 Oct 2026', title: 'Fix: maxed power-ups',
    items: [
      'With every power-up maxed, the power-up screen was empty and you got stuck. Now it offers an ⭐ All maxed card: full health, full ammo and +500 score.',
    ],
  },
  {
    v: '5.32', date: '20 Oct 2026', title: 'Cheaper access: $2',
    items: [
      'Access to War Grounds is now $2 for every 6 months (was $3), paid to the owner.',
    ],
  },
  {
    v: '5.31', date: '20 Oct 2026', title: 'Fix: set waves are saved',
    items: [
      'Admin: SET WAVE (and SET SCORE, SET SCRAP, SET GRENADES) now save your game straight away, so continuing it later picks up at the new wave.',
    ],
  },
  {
    v: '5.30', date: '19 Oct 2026', title: 'Smoother bots, no more Longshot lag',
    items: [
      'Matches with AI bots run much lighter: bots look round for targets a few times a second instead of every frame, and share their routes round the map.',
      'Bots move smoothly: no more lagging behind and jumping, for the player whose game runs them and for everyone else.',
      'Fixed: the Longshot lagged after every shot (and the Hand Cannon, SMG and Longshot when reloading) since they got their new 3D models.',
    ],
  },
  {
    v: '5.29', date: '19 Oct 2026', title: '⚔️ Now called War Grounds',
    items: [
      'The game has a new name: War Grounds. Same game, same accounts: your progress, coins, guns, wolf and pieces are all still yours.',
    ],
  },
  {
    v: '5.28', date: '19 Oct 2026', title: '🌍 Server list',
    items: [
      'Multiplayer now lists every open server by its host: click the host\'s name to join their game. It shows the mode, map, how full it is and whether they\'re playing.',
      'Private rooms stay off the list: only people with the code can join. Set your room to 🌍 Public in its Match settings to show it.',
      'Admin: the Multiplayer tab lists every room, private ones too, with a JOIN button.',
    ],
  },
  {
    v: '5.27', date: '19 Oct 2026', title: 'Bigger matches',
    items: [
      'Multiplayer rooms now hold up to 16 players (was 8).',
      'Events hold 20 players a match; when one fills up, a new one opens so everyone gets to play.',
    ],
  },
  {
    v: '5.26', date: '19 Oct 2026', title: '🤖 Pick your bots',
    items: [
      'When you make a room, choose exactly how many AI bots play: from none up to 7 (in Match settings, at the top).',
      'Bots play in the PvP modes, and step aside when real players need the space.',
    ],
  },
  {
    v: '5.25', date: '19 Oct 2026', title: '🎉 Events',
    items: [
      'Special limited-time events, hosted every now and then. When one is on, the JOIN EVENT button in Multiplayer lights up and everyone plays together in one big match.',
      'Something new is waiting in them. Keep an eye out for the first one!',
      'Admin: a new Events tab to host an event (pick the event, how long and the drop rate), see how many are playing, and end it.',
    ],
  },
  {
    v: '5.24', date: '19 Oct 2026', title: '🔦 Hollow Ground is now Last Light',
    items: [
      'The game has a new name: Last Light. Same game, same accounts, and all your progress, coins, guns and wolf are still yours.',
    ],
  },
  {
    v: '5.23', date: '19 Oct 2026', title: 'New LMG sight',
    items: [
      'The Mule LMG has a proper holographic sight: a slim hooded frame with tinted glass and a glowing red ring-and-dot reticle that lines up exactly when you aim.',
    ],
  },
  {
    v: '5.22', date: '19 Oct 2026', title: 'Real gun models',
    items: [
      'Every gun has a proper 3D model now: an AK-style AR-7 Rifle, a compact Viper SMG, a pump Boomstick, a pistol Hand Cannon, a scoped Marksman DMR and an AWP-style Longshot (plus the MK14 Mule LMG).',
      'New hands and arms holding them: gloves that wrap around the grip, a rolled-up sleeve and a watch.',
      'Gun finishes and mastery skins still tint the metal (the wood stays wood).',
    ],
  },
  {
    v: '5.21', date: '19 Oct 2026', title: '🐺 Wolf levels and masteries',
    items: [
      'Your wolf levels up, all the way to level 20: it earns 1 XP for every zombie it kills, and bites 8% harder every level.',
      'Masteries unlock as it levels: Swift Paws (3), Bleeding Bite (5), Howl (8), Alpha with glowing eyes and a bigger wolf (10), Frenzy (12), Guardian (15) and the huge, golden Dire Wolf (20).',
      'Skip ahead: wolf levels can be bought with real money, 50c a level, paid to the owner.',
      'Choose where your wolf walks: on your right, on your left, in front of you or behind you.',
      'The Mule LMG has a brand new look: a proper 3D rifle model.',
      'Admin: add wolf levels to a player (in MANAGE, or the Wolf companion card) and set the price of a level.',
    ],
  },
  {
    v: '5.20', date: '18 Oct 2026', title: '🐺 The wolf companion',
    items: [
      'The first pet is here: a wolf that runs at your side in every mode and bites the zombies closest to you.',
      'Your wolf lives forever: nothing can hurt it, so no health bar to worry about.',
      'Make it yours: pick one of nine fur colours, or any colour you like with Custom (Profile or Shop).',
      'Other players see your wolf, in its colour, in online games.',
      'The wolf is bought with real money, paid to the owner, who switches it on for your account. It costs $1.',
      'Admin: give or take a player\'s wolf (in MANAGE, or the new Wolf companion card) and set its price.',
    ],
  },
  {
    v: '5.19', date: '18 Oct 2026', title: 'Always the newest version',
    items: [
      'When a new version of the game goes live, everyone still on the old one is restarted onto it automatically (straight away on the menu, or after a 15 second countdown if you\'re mid-game).',
      'Admin: the Game tab shows which version you\'re on and can check for a new one.',
    ],
  },
  {
    v: '5.18', date: '17 Oct 2026', title: 'Coming soon',
    items: [
      'The Updates page has a new COMING SOON tab: see what\'s being worked on next, like Be the Zombie, Prop Hunt, Extraction, a Story Campaign, a Halloween event, pets and more.',
      'The Updates page got a fresh look: a cleaner switch between What\'s new and Coming soon, a new background and tidier cards.',
      'Admin: add, edit or remove Coming soon entries right on that tab.',
    ],
  },
  {
    v: '5.17', date: '17 Oct 2026', title: 'Zombie outfits',
    items: [
      'Zombies wear all sorts now, not just a shirt and tie: t-shirts, tank tops, hoodies, no shirt at all, sports kit with shorts, hospital scrubs, police uniforms and hi-vis work gear.',
      'Only office workers still wear a tie. Police zombies usually have their cap on, and workers their hard hat.',
    ],
  },
  {
    v: '5.16', date: '17 Oct 2026', title: 'No two zombies alike',
    items: [
      'Every zombie now looks different: its own skin colour, shirt and trousers, height and build, and a hunched or upright, tilted, faster or slower shuffle.',
      'Some wear hard hats, police caps, beanies, bandanas, headphones or backpacks.',
      'You can tell the dangerous ones apart: runners have red eyes and a sweatband and kick up dust; brutes wear armour and have orange eyes; spitters have a glowing throat sac; mutated zombies and bloaters are covered in glowing green boils; bosses have spikes down their backs.',
      'Admin: Game tab button to spawn one of every kind of zombie.',
    ],
  },
  {
    v: '5.15', date: '17 Oct 2026', title: 'A second zombie model',
    items: [
      'A second kind of zombie model joins the horde, so not every zombie looks the same.',
      'Runners now really run (a proper running animation) instead of fast walking.',
      'Zombie model by Quaternius.',
    ],
  },
  {
    v: '5.14', date: '17 Oct 2026', title: 'New zombie models',
    items: [
      'Zombies now use a proper 3D model with real animations: they shamble, crawl, lunge to attack, and fall when they die. Headshot kills still take the head off.',
      'Each kind of zombie keeps its own size and a slightly different colour, so you can still tell runners, brutes, spitters and bloaters apart.',
      'Slow computer? Settings → Show all settings → turn off "3D zombie models" to get the old block zombies back.',
      'Admin: the Game tab can switch between the 3D model and the old blocks.',
      'Zombie model by bachosoftdesign.',
    ],
  },
  {
    v: '5.13', date: '16 Oct 2026', title: 'AI bots & private rooms',
    items: [
      'Quick join with nobody else online now drops you straight into a Team Deathmatch against AI bots (normal difficulty). Real players who quick join take a bot\'s place.',
      'Room hosts can add AI bots to any PvP match: in the room lobby pick "Fill the match up to 2, 4, 6 or 8 players". Bots walk round walls, strafe, and shoot in bursts.',
      'Rooms can be Public or Private. Private rooms (the default when you make one) can only be joined with the code; quick join never puts strangers in them.',
      'Admin: Multiplayer tab can set the bots in any room you are in, even if you are not the host.',
    ],
  },
  {
    v: '5.12', date: '16 Oct 2026', title: 'Announcements for everyone & longer names',
    items: [
      'Admin announcements now reach every player, whatever room they are in (or on the menu), and stay on screen until they press OK.',
      'Player names can now be up to 40 letters long (was 16).',
      'Admin: the announcement box is at the top of the Players tab, with a button to take the announcement down.',
    ],
  },
  {
    v: '5.11', date: '16 Oct 2026', title: 'Group chats, gun position & bigger names',
    items: [
      'Everyone needs an account now: no more guests. Opening the site takes you straight to sign up / log in.',
      'Name tags over players are much bigger and easier to read: green ▲ for teammates (seen through walls), red ◆ for enemies.',
      'Settings → Gun position: slide your gun left/right, up/down and closer/further, or pick Normal, Centre, Left side, Low or Far away. Aiming still lines it up in the middle.',
      'Admin: make group chats (Friends tab), add or remove people, rename or delete them. Only admins can make groups; members can chat in them.',
      'Admin: zombie and wave powers (spawn, freeze, slow motion and more) now work in multiplayer when you host a co-op room.',
      'Admin: typing in the announcement box works again in a match. The Game tab has quick gun position buttons too.',
    ],
  },
  {
    v: '5.10', date: '16 Oct 2026', title: 'See your days left',
    items: [
      'Settings now shows how many days of access you have left, the date it ends, and the fee ($3 for every 6 months).',
    ],
  },
  {
    v: '5.9', date: '16 Oct 2026', title: 'Access ends by itself',
    items: [
      'When your paid time runs out, the game switches you off by itself, even mid-game, and shows "Access ended". Pay again to keep playing.',
      'Admin: the player list is tidier. Each player just has MANAGE, which now holds +100 coins, kick, timeout and ban as well as their level, coins, name and stats.',
    ],
  },
  {
    v: '5.8', date: '16 Oct 2026', title: 'New price & editable updates',
    items: [
      'Access is now $3 for every 6 months, paid cash to the site owner. No refunds.',
      'Admin: edit, remove (and bring back) or add entries on this Updates page.',
    ],
  },
  {
    v: '5.7', date: '16 Oct 2026', title: 'Admin: manage any player',
    items: [
      'Admin: every player in the list has a MANAGE button. Change their level, coins, player name, best wave, best score, kills, headshots, PvP kills and wins, and games played, or reset them to a fresh start.',
    ],
  },
  {
    v: '5.6', date: '16 Oct 2026', title: 'One price, forever',
    items: [
      'Hollow Ground is now a one-time $3, yours forever: no membership to renew.',
      'Terms & Conditions are in Settings (and on the sign-up screen). All payments are final: no refunds.',
      'The tabs along the top of the home screen always fit now, How to Play included.',
      'Music volume shows as a percentage.',
    ],
  },
  {
    v: '5.5', date: '15 Oct 2026', title: 'Memberships',
    items: [
      'Sign up with your email. Membership is paid to the site owner, who switches your account on by hand; until then you see an "Almost there" screen with a button to check again.',
      'Already had an account? After your email is switched on, link your old player name to keep your level, coins and unlocks.',
      'Your email and when your membership ends are on the Account tab.',
    ],
  },
  {
    v: '5.4', date: '15 Oct 2026', title: 'Accounts to play & admin cheats online',
    items: [
      'You now need a free account to play: PLAY asks you to sign up (or log in) first, then takes you straight back to the lobby.',
      'Admin: cheats now work in multiplayer too, but only for the admin who turns them on (god mode, one-hit kills, infinite ammo, fly, speed, free building, force field and more). Freezing or slowing the zombies stays solo only, since that would change the game for everyone.',
      'Admin: the give-yourself buttons (all guns, power-ups, heal, scrap, grenades, unlimited reserve...) work in multiplayer too. Anything that changes the game for everyone (bosses, waves, weather) is still solo only.',
    ],
  },
  {
    v: '5.3', date: '15 Oct 2026', title: 'Spawn force field & a tidier admin panel',
    items: [
      'Multiplayer: you spawn inside a force field. Nothing can hurt you for 4 seconds, or until you shoot. Everyone can see it.',
      'Admin panel split into tabs (Players, Game, Multiplayer, Account & server) with each group in its own box.',
      'Admin: the player list shows everybody (online first, with when offline players were last seen), not just who is online.',
      'Admin: guests are in the list too. Kick them from their room, time them out, or ban them (their browser and connection), just like accounts.',
    ],
  },
  {
    v: '5.2', date: '15 Oct 2026', title: 'Admin: every account',
    items: [
      'Admin: the Account tab lists every account on the site (search by name, newest activity first) with level, coins, best wave, games, when they joined and when they were last on. MANAGE opens the kick / timeout / ban / coins tools for them.',
      'Admin: guests show up too (anonymous "Guest #" ids, one per browser) with their level, best wave and games.',
    ],
  },
  {
    v: '5.1', date: '15 Oct 2026', title: 'Force field & admin team control',
    items: [
      'Force field: press F (controller D-pad left, 🛡️ on phones) for an 8 second bubble zombies can\'t get into and bullets can\'t get through. It recharges for 45 seconds, and everyone sees yours.',
      'Admin: move any player to red or blue, right in the room lobby or from the admin panel mid-match. Shuffle, balance or swap the teams with one button.',
      'Admin: a force field that never runs out (solo cheat).',
    ],
  },
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

// What's being worked on, shown on the Updates page's "Coming soon" tab. No release dates on purpose.
// Move an entry into CHANGELOG (and delete it here) when it ships.
export const UPCOMING = [
  {
    v: 'soon-view', title: '🎥 First / third person anywhere',
    items: [
      'Switch between first and third person in every mode, not just events: press P, use the pause menu, or Settings → Camera.',
    ],
  },
  {
    v: 'soon-story', title: '📖 Story Campaign',
    items: [
      'Chapters that tell how the outbreak started, from Day 1 onwards, with missions, objectives and a boss at the end of each chapter.',
      'It all comes together with the new modes below as one big update.',
    ],
  },
  {
    v: 'soon-bezombie', title: '🧟 Be the Zombie (solo)',
    items: [
      'Play as a zombie and stay away from the hunters patrolling with flashlights and guns.',
      'Zombie powers: pounce, a stunning scream, climbing and smelling hunters through walls.',
      'Every hunter you catch joins your horde. Turn them all to win.',
    ],
  },
  {
    v: 'soon-prophunt', title: '📦 Prop Hunt',
    items: ['One team hides as barrels, cars and crates. The other team has to find them before time runs out.'],
  },
  {
    v: 'soon-extract', title: '🚁 Extraction',
    items: ['Drop into a big map, grab loot and reach the helicopter before the horde overruns you. Die and you lose what you were carrying.'],
  },
  {
    v: 'soon-lastone', title: '🎯 Last One Standing',
    items: ['Battle royale with bots: the safe zone shrinks and zombies flood in behind it. Be the last one alive.'],
  },
  {
    v: 'soon-halloween', title: '🎃 Halloween Event',
    items: ['A pumpkin-head zombie boss, a foggy night map, candy to collect for limited-time skins, and jack-o\'-lanterns on the zombies.'],
  },
  {
    v: 'soon-challenges', title: '🏅 Weekly Challenges',
    items: ['Bigger challenges on top of the daily quests, like "50 headshots" or "win 3 Gun Game matches", for skins and XP.'],
  },
  {
    v: 'soon-season', title: '🎟️ Season Pass',
    items: ['Level up through each season to unlock rewards, with a free track and a premium track.'],
  },
  {
    v: 'soon-creator', title: '👕 Character Creator',
    items: ['Make your own look: outfits, hats and colours for your character.'],
  },
  {
    v: 'soon-ranked', title: '🏆 Ranked PvP',
    items: ['Ranked matches from Bronze to Diamond, with your rank shown next to your name and a ranked leaderboard.'],
  },
  {
    v: 'soon-characters', title: '🧍 Character Creator',
    items: [
      'Pick your character: Survivor, Adventurer, SWAT, King or the classic blocky soldier, fully animated.',
      'Make it yours: skin tone, hair, outfits and gear in any colour you like.',
      'Everyone sees your character in online games, and your arms in first person match it.',
    ],
  },
  {
    v: 'soon-pets', title: '🐾 More Pets with Powers',
    items: [
      'The wolf is out now. Next: more pets, and pets that level up.',
      'Zombies get pets too, and both have their own special powers.',
    ],
  },
  {
    v: 'soon-vehicles', title: '🚚 Vehicles',
    items: ['Drive a truck through the horde while a friend shoots from the back. Only in certain rounds, so they don\'t get too powerful.'],
  },
  {
    v: 'soon-killcam', title: '🎬 Replays & Clips',
    items: ['Replay how your kills happened from their point of view, and save and share your best moments as clips.'],
  },
  {
    v: 'soon-clans', title: '🛡️ Clans (maybe)',
    items: ['Clan tags, clan chat and clan wars. Still deciding on this one.'],
  },
];
