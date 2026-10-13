// Daily quests (shared by the game and the server). Everyone gets the same 3 quests each day (UTC);
// finishing one lets you claim its coins. Progress is counted per key, e.g. every zombie kill adds 1 to "zkills".

export const QUEST_POOL = [
  { id: 'zk100', key: 'zkills', goal: 100, text: 'Kill 100 zombies', reward: 150 },
  { id: 'zk300', key: 'zkills', goal: 300, text: 'Kill 300 zombies', reward: 350 },
  { id: 'hs40', key: 'headshots', goal: 40, text: 'Land 40 headshot kills', reward: 200 },
  { id: 'mut10', key: 'mutated', goal: 10, text: 'Kill 10 mutated zombies', reward: 200 },
  { id: 'boss1', key: 'bosses', goal: 1, text: 'Kill an Abomination', reward: 250 },
  { id: 'knife15', key: 'meleeKills', goal: 15, text: 'Get 15 knife kills', reward: 200 },
  { id: 'nade15', key: 'grenadeKills', goal: 15, text: 'Kill 15 zombies with grenades', reward: 200 },
  { id: 'throw10', key: 'grenades', goal: 10, text: 'Throw 10 grenades', reward: 100 },
  { id: 'build6', key: 'built', goal: 6, text: 'Build 6 barricades or turrets', reward: 150 },
  { id: 'turret20', key: 'turretKills', goal: 20, text: 'Let your turrets kill 20 zombies', reward: 200 },
  { id: 'waves10', key: 'waves', goal: 10, text: 'Clear 10 zombie waves', reward: 200 },
  { id: 'coop5', key: 'coopWaves', goal: 5, text: 'Clear 5 waves in Co-op or Defend the Points', reward: 250 },
  { id: 'pvp15', key: 'pvpKills', goal: 15, text: 'Get 15 kills in multiplayer matches', reward: 200 },
  { id: 'win1', key: 'pvpWins', goal: 1, text: 'Win a multiplayer match', reward: 200 },
  { id: 'guns5', key: 'gunsPicked', goal: 5, text: 'Pick up 5 guns', reward: 100 },
  { id: 'heal5', key: 'medkits', goal: 5, text: 'Pick up 5 medkits or health packs', reward: 100 },
];

export const QUEST_KEYS = [...new Set(QUEST_POOL.map((q) => q.key))];
export const DAILY_COUNT = 3;
// most progress one report can add (the game reports every wave or so)
export const MAX_DELTA = 400;

export const dayNumber = (t = Date.now()) => Math.floor(t / 86400000);

// Today's quests: a seeded pick, never two with the same key.
export function dailyQuests(day = dayNumber()) {
  let seed = (day * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...QUEST_POOL];
  const out = [];
  while (out.length < DAILY_COUNT && pool.length) {
    const q = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    if (!out.some((o) => o.key === q.key)) out.push(q);
  }
  return out;
}

// state: { day, p: { key: count }, claimed: [ids] }. Returns a fresh state for today with the delta added.
export function addProgress(state, delta, day = dayNumber()) {
  const s = state && state.day === day ? { day, p: { ...state.p }, claimed: [...(state.claimed || [])] } : { day, p: {}, claimed: [] };
  for (const key of QUEST_KEYS) {
    const n = Math.floor(Number(delta?.[key]) || 0);
    if (n > 0) s.p[key] = Math.min(100000, (s.p[key] || 0) + Math.min(MAX_DELTA, n));
  }
  return s;
}

// Today's quests with progress, for the quests screen.
export function questView(state, day = dayNumber()) {
  const s = state && state.day === day ? state : { day, p: {}, claimed: [] };
  return dailyQuests(day).map((q) => ({
    ...q,
    progress: Math.min(q.goal, s.p[q.key] || 0),
    done: (s.p[q.key] || 0) >= q.goal,
    claimed: (s.claimed || []).includes(q.id),
  }));
}

// Claims a finished quest. Returns { state, reward } or { error }.
export function claimQuest(state, id, day = dayNumber()) {
  const q = questView(state, day).find((o) => o.id === id);
  if (!q) return { error: "That isn't one of today's quests" };
  if (q.claimed) return { error: 'Already claimed' };
  if (!q.done) return { error: 'Not finished yet' };
  const s = state && state.day === day ? state : { day, p: {}, claimed: [] };
  return { state: { day, p: { ...s.p }, claimed: [...(s.claimed || []), id] }, reward: q.reward };
}
