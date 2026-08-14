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

## Deploying to Netlify

Already wired up — [`netlify.toml`](netlify.toml) sets the publish dir, security
headers, cache rules, and an SPA redirect. Either:

- **Git**: Netlify → *Add new site* → *Import an existing project* → pick this
  repo. No settings to change; it deploys on every push to `main`.
- **Drag & drop**: drop the folder on [app.netlify.com/drop](https://app.netlify.com/drop).
- **CLI**: `npx netlify-cli deploy --prod`

If you'd rather **not commit your keys**, leave `config.js` on its placeholders
and set `SUPABASE_URL` + `SUPABASE_ANON_KEY` under *Site configuration →
Environment variables*. The build step ([`scripts/build-config.mjs`](scripts/build-config.mjs))
generates `config.js` from them; if they're unset it leaves the committed file
alone, so GitHub Pages and local dev keep working either way.

## Deploying to Vercel (Hobby)

Also wired up — [`vercel.json`](vercel.json) sets the build command, output dir,
security headers, cache rules, and clean URLs. It's a pure static deploy: no
serverless functions, no cron, no image optimisation, so it sits comfortably
inside the free **Hobby** plan.

- **Git**: [vercel.com/new](https://vercel.com/new) → import this repo →
  **Deploy**. Framework preset *Other*; everything else comes from `vercel.json`.
- **CLI**: `npx vercel --prod`

Same env-var trick as Netlify: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` under
*Settings → Environment Variables* (tick all three environments) and the build
generates `config.js` for you.

> Hobby is for non-commercial use — fine for a scoreboard between friends.

### Running it locally

Needs a real server (it uses ES modules), so not just double-clicking the file:

```bash
npx serve .          # → http://localhost:3000
```

## Mobile first

The layout is built for a phone and only ever *adds* room on bigger screens.
Standings and the comment feed are a single swappable pane on phones and go
side-by-side at 900px. The feed has no inner scroll container on touch (nested
scrolling is miserable), the give-points and profile editors are real bottom
sheets, every tap target clears 44px, inputs are 16px so iOS doesn't zoom on
focus, safe-area insets are respected on notched phones, there's haptic feedback
where the browser allows it, and the board resyncs on `visibilitychange` because
phones suspend the realtime socket in the background.

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
