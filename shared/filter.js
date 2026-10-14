// Blocked words: an admin picks them, and they're hidden as *** in every chat on every server.

export const MAX_WORDS = 200;
export const WORD_LEN = 30;

// a tidy list: lower case, no blanks or repeats
export function cleanWords(list) {
  const out = [];
  for (const w of Array.isArray(list) ? list : String(list ?? '').split(/[\n,]/)) {
    const t = String(w ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, WORD_LEN);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// One pattern for the whole list. Only the exact words the admin typed are caught (any capitals),
// as whole words, so "class" is fine when "ass" is blocked and nothing else gets hidden.
export function makeFilter(words) {
  const list = cleanWords(words);
  if (!list.length) return null;
  const parts = list.map((w) => w.split(' ').map(escRe).join('\\s+'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

export function filterText(text, re) {
  if (!re) return text;
  re.lastIndex = 0;
  return String(text).replace(re, (m) => '*'.repeat(Math.min(12, m.length)));
}

// for names: a blocked word on its own in the name (bits of a name split by _, - or numbers)
export function nameBlocked(name, words) {
  const re = makeFilter(words);
  if (!re) return false;
  re.lastIndex = 0;
  return re.test(String(name).replace(/[_\-0-9]+/g, ' '));
}
