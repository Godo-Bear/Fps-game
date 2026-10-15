# Notes for Claude

## Working with the owner
- Whenever you give the owner SQL to run in Supabase, always give it a short name to save it under
  (e.g. "Backfill paid_until") and say to run it as a **new query**.
- The owner knows Supabase a little: keep Supabase steps short (no need to explain the basics of the
  dashboard), but still say exactly where to click for anything new.
- Never commit the admin code (`ADMIN_CODE` secret) or the owner's email.
- Every update gets a changelog entry in `src/changelog.js`, and new features get an admin-panel addition.
- Pushing to `main` deploys the game (Cloudflare); develop on the session branch and push to both.
