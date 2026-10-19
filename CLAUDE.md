# Notes for Claude

## Working with the owner
- Whenever you give the owner SQL to run in Supabase, always give it a short name to save it under
  (e.g. "Backfill paid_until") and say to run it as a **new query**.
- The owner knows Supabase a little: keep Supabase steps short (no need to explain the basics of the
  dashboard), but still say exactly where to click for anything new.
- Never commit the admin code (`ADMIN_CODE` secret) or the owner's email.
- Every update gets a changelog entry in `src/changelog.js`, and new features get an admin-panel addition.
- Pushing to `main` deploys the game (Cloudflare); develop on the session branch and push to both.

## Helping the owner upload their own files (models, pictures, sounds)
The owner may ask for these steps again; give them like this:
1. On github.com/godo-bear/fps-game, click the branch button (top left of the file list) and pick **main**
   (uploads must go to main to reach the live game).
2. Scroll the file list and click **public**, then **models** (3D, `.glb` best), **textures** (`.png/.jpg/.webp`)
   or **sounds** (`.mp3/.ogg`).
3. Click **+** next to "Go to file" (or **Add file**) → **Upload files**.
4. Drag the files in, type a short message (e.g. "zombie model"), click the green **Commit changes**.
5. Tell Claude the file name and what it's for; uploading alone doesn't change the game.
Tips: keep files under ~5 MB (GitHub's website refuses over 25 MB); everything in `public` is downloadable by anyone;
free models: Sketchfab / Poly Pizza (download as glTF/.glb, check the licence).
Before your next push after an upload: `git fetch origin main` and merge it so the owner's files aren't lost.

## Plans
- The "Coming soon" tab lists planned updates (`UPCOMING` in `src/changelog.js`, no dates). When one ships, move it into
  `CHANGELOG`. The Story Campaign is meant to ship together with the new modes as one big update.
- The wolf companion is live (paid in hand; levels 50c). Vehicles only in certain rounds.
- The Character Creator (src/character.js, Locker section) is built but hidden for a big launch: `CHARACTERS_LIVE = false`
  in shared/cosmetics.js (admins see a preview). Don't launch it until the owner says; then flip it, move the
  "Character Creator" entry from UPCOMING into CHANGELOG. The 3D characters (Man/Survivor, Adventurer, SWAT, King: Quaternius, rigged) are in it
  (CHARACTER_MODELS in src/character.js); online their gun position on the model may need tuning at launch.
