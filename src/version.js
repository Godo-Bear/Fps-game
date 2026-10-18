// Which build of the game this is, and a watcher that notices when a newer one has been deployed.
export const BUILD = __BUILD__;
export const BUILT_AT = __BUILT_AT__;

const EVERY = 60; // seconds between checks
const TRIED = 'deadplains.reloadedFor';

// asks the server which build is live; null if it can't tell (offline, or the dev server)
export async function liveBuild() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.build === 'string' ? j.build : null;
  } catch {
    return null;
  }
}

// calls onNew(build) once when the live build isn't this one
export function watchVersion(onNew) {
  if (BUILD === 'dev') return { check: async () => null };
  let told = false;
  const check = async () => {
    const live = await liveBuild();
    if (!live || live === BUILD || told) return live;
    told = true;
    onNew(live);
    return live;
  };
  setInterval(check, EVERY * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  window.addEventListener('focus', check);
  setTimeout(check, 5000);
  return { check };
}

// a fresh page; if the last reload for this build still gave us the old one (cached), bust the cache once
export function restartToNew(build) {
  let tried = null;
  try {
    tried = sessionStorage.getItem(TRIED);
    sessionStorage.setItem(TRIED, build);
  } catch {
    /* no storage */
  }
  if (tried === build) location.replace(`${location.pathname}?v=${build}`);
  else location.reload();
}
