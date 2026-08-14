# 🏆 scoreboard

A cute pink scoreboard for you and your friends. Anyone on the board can hand out
`+points` or `-points` to anyone else, with a comment explaining themselves.
Live-updating, no build step, one HTML file and change.

## Setup (~3 minutes)

**1. Make a free Supabase project** — [supabase.com/dashboard](https://supabase.com/dashboard) → *New project*.

**2. Create the tables.** Open the **SQL Editor**, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql), hit **Run**.

**3. Wire up the app.** In Supabase go to **Project Settings → API** and copy the
*Project URL* and the *anon public* key into [`config.js`](config.js):

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

**4. Push it.**

```bash
git add -A && git commit -m "wire up supabase" && git push
```

GitHub Pages serves it at `https://<you>.github.io/scoreboard/`.
Send that link to your friends — they hit **join**, pick an emoji and a colour,
and they're on the board.

### Running it locally

Needs a real server (it uses ES modules), so not just double-clicking the file:

```bash
npx serve .          # → http://localhost:3000
```

## How the login works

Names and passwords live in Postgres. The password table (`friend_auth`) has RLS on
with **zero policies**, so the public anon key literally cannot read it — every
login, signup, and point goes through a `SECURITY DEFINER` function that checks
credentials server-side. `friends` and `points` are readable by anyone with the
link; nothing is writable except through those functions.

It's honour-system security for a group of friends, not a bank. Don't reuse a
password you care about.

## Files

| | |
|---|---|
| `index.html` | markup |
| `styles.css` | the pink |
| `app.js` | all the logic |
| `config.js` | your two Supabase values |
| `supabase/schema.sql` | tables, RLS, RPC, realtime |
