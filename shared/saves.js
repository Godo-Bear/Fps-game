// Saved solo games (shared by the game and the server).
export const MAX_SAVES = 5;
export const SAVE_NAME_MAX = 24;

// Letters, numbers, spaces and simple punctuation; falls back to "Unnamed game".
export function cleanSaveName(name) {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SAVE_NAME_MAX);
  return s || 'Unnamed game';
}
