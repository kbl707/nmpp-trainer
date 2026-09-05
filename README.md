# NMPP Daily Trainer

A tiny daily exam-prep app for agurkas128 (4th grade, NMPP prep). See [SPEC.md](SPEC.md)
for the full design. This file covers setup and the weekly Claude feedback loop.

## How it works

- Static site (`index.html` / `app.js` / `styles.css`), no build step, hosted on
  GitHub Pages.
- Data lives in a dedicated Supabase project (`nmpp-trainer`), read/written
  through `@supabase/supabase-js` with the anon key, protected by RLS
  (see `supabase/schema.sql`).
- The child opens the page, sees only today's task set(s), solves items one at
  a time, and a `results` row is written on completion.
- Claude (via the Supabase MCP connector, from chat) reads `results` and
  writes new `task_sets` rows for future days — no code changes needed.

## One-time setup (already done for this deployment)

1. Create a Supabase project and apply the schema:
   ```bash
   # via Supabase MCP / dashboard SQL editor
   supabase/schema.sql
   ```
2. Seed the first week:
   ```bash
   seed/week1.sql
   ```
3. Copy `config.example.js` to `config.js` and fill in the project URL and
   anon/publishable key (Project Settings → API). `config.js` is gitignored —
   it's not meant to sit in git history, even though the anon key itself is
   safe to expose (access is controlled by RLS, not secrecy).
4. Serve the folder locally to test, e.g. `python3 -m http.server 8123`.

## GitHub Pages deployment

Because `config.js` is gitignored, deployment uses a GitHub Actions workflow
(`.github/workflows/deploy.yml`) instead of the plain "deploy from branch"
option: on every push to `master` it checks out the repo, generates
`config.js` from two repository secrets, and publishes the result to Pages.
There is still no app build step — this only stamps in the two config
values.

Required repo secrets (Settings → Secrets and variables → Actions), already
set for this repo:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Repo → Settings → Pages → Source is set to **GitHub Actions**.

If you ever rotate the anon key, just update the two secrets and re-run the
workflow (or push again) — no other changes needed.

## The Claude feedback loop (weekly)

With the Supabase MCP connector active in a Claude chat:

1. Ask Claude to read last week's `results` joined with `task_sets` for the
   `nmpp-trainer` project.
2. Claude summarizes: accuracy by item type/topic, time per item, interrupted
   sessions (attention drop-off), retry patterns.
3. Claude generates next week's `task_sets` rows (JSON per SPEC.md §5) and
   inserts them directly via the MCP connector — the page picks them up
   automatically on their `scheduled_date`, no deploy needed.

The item JSON contract (SPEC.md §5) is the stable API between Claude and the
page: unknown `type` values render as a safe `open_schema`-like fallback, so
new item types can be introduced without breaking the app.

## Notes on behavior

- Only one row of `task_sets` per `(scheduled_date, subject)` — insert with
  `on conflict (scheduled_date, subject) do update` to replace a day's set.
- If a session is left mid-way and a new day's task set becomes current, the
  old progress is flushed to `results` as `interrupted = true` the next time
  the page loads, using whatever was answered so far.
- The elapsed-time indicator and `duration_seconds` are wall-clock from first
  opening a task set (a reload does not reset the clock).
