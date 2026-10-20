# Paid accounts with Supabase (cash in hand)

How it works once it's set up:

1. A player signs up on the game with their **email + password** (Supabase handles this).
2. Supabase makes a row for them in a table called **profiles** with `has_paid = FALSE`.
3. The game shows them the **"Almost there"** screen ($2 for every 6 months, paid cash in hand, no refunds).
4. They pay you. You open the **profiles** table in Supabase and switch their `has_paid` to **TRUE**.
   Also set `paid_until` to the date 6 months from today, so their access ends when their 6 months are up.
5. They press **"I've paid — check again"**, pick a player name, and they're in.

The game checks `has_paid` every time the site is opened, so setting it back to `FALSE` (or
`paid_until` passing) locks them out again on their next visit.

Until you finish step 5 below, the game keeps working exactly as before (normal player name +
password accounts), so nothing breaks while you set this up.

---

## Step 1: Make a Supabase project

1. Go to <https://supabase.com> and click **Start your project**. Sign up (GitHub login is easiest).
2. If it asks you to make an **organization**, give it any name (e.g. your name), pick the **Free** plan.
3. Click **New project**:
   - **Name**: `hollow-ground` (anything is fine)
   - **Database password**: click **Generate a password** and save it somewhere safe
     (you won't need it for this, but you can't see it again later).
   - **Region**: the one closest to your players (e.g. *Oceania (Sydney)* if you're in Australia/NZ).
4. Click **Create new project** and wait a minute or two while it sets up.

## Step 2: Make the `profiles` table (copy and paste)

1. In the left sidebar click **SQL Editor** (the `>_` icon).
2. Click **New query**, paste **all** of this in, then click **Run** (bottom right):

```sql
-- One row per account. has_paid is the switch you flip when someone pays.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  has_paid boolean not null default false,
  paid_until date,               -- optional: the day their membership ends
  note text,                     -- optional: e.g. "paid $2 cash 15 Oct"
  created_at timestamptz not null default now()
);

-- Players can only READ their own row. Nobody can change has_paid from the game:
-- only you, in the Supabase dashboard.
alter table public.profiles enable row level security;
create policy "Players can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Every time someone signs up, make their row (has_paid starts as FALSE).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

You should see **Success. No rows returned**. If you ever see `relation "profiles" already exists`,
the table is already there: that's fine.

## Step 3: Set up email login

1. Left sidebar: **Authentication** → **Sign In / Providers** (on older dashboards:
   **Providers**). Make sure **Email** is **enabled**.
2. **Confirm email**:
   - **On** (default): after signing up, players get an email with a link to click before they can log in.
     More secure, but Supabase's free email sender only sends a few emails per hour.
   - **Off**: players are logged in straight away after signing up. Easiest for a small game.
     Turn it off in **Authentication → Sign In / Providers → Email → Confirm email**.
   Either way works with the game.
3. **Authentication → URL Configuration**:
   - **Site URL**: your game's address, e.g. `https://fps-game.YOURNAME.workers.dev`
     (or your own domain).
   - **Redirect URLs**: add the same address. (This is where the confirm-email link sends people.)

## Step 4: Copy your project's URL and key

1. Left sidebar: **Project Settings** (the cog at the bottom) → **Data API** (or **API**).
2. Copy the **Project URL**, it looks like `https://abcdefghijklmno.supabase.co`.
3. Go to **Project Settings → API Keys** and copy the **anon / public** key
   (newer projects call it the **Publishable key**, starting `sb_publishable_`).
   Either one works.

These two are **safe to be public** (every player's browser uses them; the table rules from step 2
are what keep `has_paid` locked). **Never** use the `service_role` / **Secret** key for this.

## Step 5: Give them to the game (Cloudflare)

1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → click your Worker (**fps-game**).
2. **Settings** → **Variables and Secrets** → **Add**:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `SUPABASE_URL` | the Project URL from step 4 |
   | Secret | `SUPABASE_ANON_KEY` | the anon / publishable key from step 4 |
   | Secret (optional) | `PAY_PRICE` | `$2` (that's the default) |
   | Secret (optional) | `PAY_MONTHS` | `6` (that's the default; `0` means pay once, forever) |
   | Secret (optional) | `PAY_NOTE` | `paid cash in hand to the site owner` (default) |

3. Click **Deploy** (or **Save and deploy**). From now on the game asks for an email login, and
   unpaid accounts see the "Almost there" screen.

(For testing on your own computer with `npm run cf:dev`, put the same lines in the `.dev.vars` file:
`SUPABASE_URL="https://..."` and `SUPABASE_ANON_KEY="..."`. That file is never uploaded to GitHub.)

## Step 6: Let yourself in first (and keep your admin account)

1. Open the game, press **SIGN UP TO PLAY**, and sign up with **your** email.
2. You'll see "Almost there". In Supabase go to **Table Editor** → **profiles**, find your email,
   double-click the `has_paid` cell, pick **TRUE**, and press **Save** (or Enter).
3. Back in the game press **I've paid — check again**.
4. On "You're in!", open **I already have a War Grounds account** and log in with your **old player
   name and password**. That links your old account (admin, level, coins, unlocks) to your email.
   If you don't link it you'd start a new player, and you can claim admin again with the admin code.

Everyone who already had an account does the same: sign up with an email, you mark them paid, then
they link their old player name to keep their progress.

## Every time someone pays you

1. Supabase → **Table Editor** → **profiles**.
2. Find their email (use the search / filter at the top if there are lots).
3. Set **has_paid** to **TRUE**.
4. Set **paid_until** to 6 months from today (e.g. paid on 16 Oct 2026 → `2027-04-16`). When that day passes,
   the game shows them "Access ended". When they pay again, set a new date 6 months on.
   (Leave it empty and their access never ends.)
5. Optional: write something in **note** like `$2 cash 15 Oct`.
6. Tell them to press **I've paid — check again**.

To take someone's access away: set **has_paid** to **FALSE**. They're locked out the next time they
open the site. (To kick them out of a match right now, use the admin panel's KICK / BAN too.)

## Fill in paid_until automatically (recommended)

So you never have to work out dates: run this once (SQL Editor → New query → paste → **Run**; name it e.g.
"Auto paid_until (6 months)"). From then on, setting **has_paid** to **TRUE** fills in **paid_until** as
6 months from today.

```sql
create or replace function public.set_paid_until()
returns trigger language plpgsql as $$
begin
  if new.has_paid and (new.paid_until is null or new.paid_until < current_date) then
    new.paid_until := current_date + interval '6 months';
  end if;
  return new;
end; $$;

create trigger auto_paid_until
  before insert or update on public.profiles
  for each row execute function public.set_paid_until();
```

Renewing: when someone pays again after their time ran out, set **has_paid** to **TRUE** again (or clear
**paid_until**) and a new date 6 months on is filled in. A date you type yourself that's still in the future is left alone.

Players can see how many days they have left (and the fee) at the top of **Settings** in the game.

## When someone's 6 months run out (automatic)

You don't need to do anything: the game checks `paid_until` all the time. The moment the date has passed
(the end of that day), the player is logged out, taken out of any game they're in, and shown **"Access ended"**.
When they pay again, set `paid_until` 6 months on and they press **I've paid — check again**.

**Optional:** to also have Supabase switch `has_paid` back to **FALSE** by itself (so the table shows who has run
out), set up a daily job:

1. Supabase → **Integrations** → **Cron** → enable it (or **Database → Extensions**, turn on `pg_cron`).
2. **SQL Editor** → **New query** → paste and **Run**:

```sql
select cron.schedule(
  'switch-off-expired',          -- the job's name
  '5 0 * * *',                   -- every day at 00:05 (UTC)
  $$ update public.profiles set has_paid = false
     where has_paid and paid_until is not null and paid_until < current_date $$
);
```

To stop it later: `select cron.unschedule('switch-off-expired');`

## Things to know

- **Changing the price or how long it lasts**: change `PAY_PRICE` / `PAY_MONTHS` in Cloudflare (step 5) and redeploy. No code changes needed.
  The Terms & Conditions (with no refunds) are in the game's **Settings** and on the sign-up screen.
- **Forgotten passwords**: Supabase can send reset emails (Authentication → Users → the user → *Send password
  recovery*). The game doesn't have a "forgot password" button yet.
- **Emails**: Supabase's built-in email sender is limited to a few emails an hour on the free plan. If lots of
  people sign up at once, either turn **Confirm email** off (step 3) or add your own email sender under
  **Authentication → Emails → SMTP Settings**.
- **Free plan**: a free Supabase project pauses after about a week with no activity. If the game suddenly says it
  can't log in, open the Supabase dashboard and click **Restore project**.
- **Turning it all off**: delete `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Cloudflare and redeploy. The game goes
  back to normal player name + password accounts.
