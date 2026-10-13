// Multiplayer game modes and their map layout. Shared by the client and the room server.

export const MODES = {
  ffa: { id: 'ffa', name: 'Free-for-all', short: 'FFA', teams: false, desc: 'Everyone for themselves. First to 20 kills wins.', killLimit: 20 },
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teams: true, desc: 'Red vs Blue. First team to 30 kills wins.', killLimit: 30 },
  koth: { id: 'koth', name: 'Capture Point', short: 'CP', teams: true, desc: 'Hold the point in the middle of the map. First to 150 points wins.', scoreLimit: 150 },
  ctf: { id: 'ctf', name: 'Capture the Flag', short: 'CTF', teams: true, desc: "Steal the enemy flag and bring it to yours. First to 3 captures wins.", scoreLimit: 3 },
};

export const MATCH_SECONDS = 8 * 60;
export const RESPAWN_SECONDS = 4;
export const MAX_PLAYERS = 8;
export const MAX_HP = 100;

export const TEAM_SPAWNS = {
  red: [[-72, -4], [-68, 4], [-76, 8], [-66, -9], [-80, 0], [-71, 12]],
  blue: [[70, -6], [66, -12], [74, -14], [62, -2], [77, -4], [68, -18]],
};
export const FFA_SPAWNS = [
  [-72, -4], [70, -6], [0, -40], [0, 60], [-40, 20], [40, 20], [-30, -70], [30, -75], [-90, 50], [90, 45], [10, 90], [-10, 5],
];

export const POINT = { x: 0, z: 0, radius: 9 };
export const FLAG_BASES = { red: [-74, 0], blue: [72, -2] };

export function makeRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

// Maps. Every map keeps the spawns, flags and capture point above clear, so all modes work everywhere.
export const MAPS = {
  plains: { name: 'Dead Plains', weathers: ['clear', 'clear', 'overcast', 'dust', 'rain', 'storm'] },
  frost: { name: 'Frostbite Outpost', weathers: ['frostclear', 'snow', 'snow', 'blizzard', 'frostfog'] },
  forest: { name: 'Blackwood Hollow', weathers: ['dusk', 'dusk', 'mist', 'rain', 'storm'] },
};
