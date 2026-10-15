// Achievements: unlocked in the game, kept on your account and shown as badges on your profile.
export const ACHIEVEMENTS = [
  { id: 'first_kill', icon: '🩸', name: 'First Blood', desc: 'Kill your first zombie' },
  { id: 'wave10', icon: '🔟', name: 'Still Standing', desc: 'Clear wave 10' },
  { id: 'wave20', icon: '🛡️', name: 'Hard to Kill', desc: 'Clear wave 20' },
  { id: 'wave30', icon: '👑', name: 'Unkillable', desc: 'Clear wave 30' },
  { id: 'boss', icon: '💀', name: 'Giant Slayer', desc: 'Kill a boss' },
  { id: 'barrel5', icon: '🛢️', name: 'Kaboom', desc: 'Kill 5 zombies with one barrel' },
  { id: 'finisher', icon: '🔪', name: 'Finish Him', desc: 'Pull off a finisher' },
  { id: 'perk', icon: '🥤', name: 'Thirsty', desc: 'Buy a perk' },
  { id: 'allperks', icon: '🧃', name: 'Fully Loaded', desc: 'Have every perk in one run' },
  { id: 'wallbuy', icon: '🧱', name: 'Shopping Spree', desc: 'Buy a gun off the wall' },
  { id: 'builder', icon: '🏗️', name: 'Architect', desc: 'Have 10 builds up at once' },
  { id: 'modifier', icon: '🎲', name: 'Twist Ending', desc: 'Clear a wave with a modifier' },
  { id: 'bounty', icon: '🎯', name: 'Bounty Hunter', desc: 'Kill a bounty zombie' },
  { id: 'weekly', icon: '📅', name: 'Weekly Warrior', desc: 'Play a weekly challenge' },
  { id: 'revive', icon: '✚', name: 'Medic', desc: 'Revive a squadmate' },
  { id: 'evac', icon: '🚁', name: 'Get to the Chopper', desc: 'Escape in Extraction' },
  { id: 'pvpwin', icon: '🏆', name: 'Champion', desc: 'Win a multiplayer match' },
  { id: 'gungame', icon: '🔫', name: 'Gun Runner', desc: 'Win Gun Game' },
  { id: 'oitc', icon: '🎱', name: 'One Shot', desc: 'Win One in the Chamber' },
  { id: 'jugg', icon: '💪', name: 'Unstoppable', desc: 'Become the Juggernaut' },
  { id: 'survivor', icon: '🏃', name: 'Last One Standing', desc: 'Win Infection as a survivor' },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
