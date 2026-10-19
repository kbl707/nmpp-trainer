# NMPP Daily Trainer

A tiny daily exam-prep app for H (4th grade, NMPP prep). See [SPEC.md](SPEC.md)
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

## Pages

This repo's GitHub Pages site serves more than the trainer app:

- `/` — H's daily trainer (this app)
- `/l/uzduotys/` — L's reading trainer (same app, `NMPP_LEARNER = "l"`)
- `/h` — H's weekly school timetable
- `/l` — L's weekly school timetable
- `/printables/` — static worksheets linked from `printable` task items

`/h` and `/l` are self-contained HTML pages maintained by a generator outside
this repo — committed as-is, apart from one change: each day's „Atidaryti
užduotis →“ link appends `?date=<that day>` (a small `dayDate()` helper), which
the trainer uses to open a missed day's set (SPEC.md §8). If the generator is
re-run it needs the same tweak or the links fall back to today's set.
The pages also load `../config.js` and call the read-only `week_status` RPC to
mark each day done / missed / unfinished (SPEC.md §8.1) — the same applies.

`/?date=YYYY-MM-DD` and `/l/uzduotys/?date=YYYY-MM-DD` open that day's set with a
„Praleista diena“ banner; results are saved normally.

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

### Checks

A `check` job runs before every deploy and on every pull request (PRs never
deploy). Run the same checks locally; no npm install needed, Node 20+:

```
for f in app.js games.js svg.js; do node --check "$f"; done
python3 -m py_compile scripts/stamp-version.py
node --test tests/*.test.js
```

`tests/games.test.js` covers the pure scorers in `games.js`. `svg.js` needs
a browser `DOMParser`, so it has no node test.

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

### Reading passages (SPEC.md §5.1)

A `passage` item (`{ "type": "passage", "data": { "title", "text" } }`) is a
non-scored, full-card reading step — `\n\n` in `text` becomes a paragraph
break. Any other item can add `"passage_ref": "<passage id>"` to show that
passage in a collapsible panel above the question while it's being answered.
The panel defaults open on desktop/tablet and collapsed on phones (<560px);
the child can toggle it with "Rodyti tekstą" / "Suslėpti tekstą". Passage
lookup only looks backwards through the array, so a passage must appear
before the questions that reference it — a missing/forward reference just
renders the question with no panel, it never breaks the page.

### Printable worksheets (SPEC.md §5.2)

A `printable` item (`{ "type": "printable", "prompt", "data": { "title",
"url", "week_note", "instruction" } }`) is another non-scored step: title,
prompt, an optional highlighted `week_note`, a big "Atsispausdinti lapą"
button that opens `data.url` in a new tab, and "Padariau ✔" to move on.
`data.url` is a relative path into `printables/`, a folder of static HTML
worksheets committed alongside the app and served by the same GitHub Pages
site — e.g. `"printables/ketvirtadienis-akys-ranka-raides.html"`.

The `subject` column also accepts `'pratimai'` (drills/exercises) alongside
`'matematika'`/`'lietuviu'`, for days that are print-and-do rather than
either school subject.

### Rewards (SPEC.md §7.1)

Light gamification on top of the existing scoring, all opt-out-proof by
design (no sound by default, motion respects `prefers-reduced-motion`,
wrong answers never show a star count). Lifetime state lives in a
single-row `progress` table, writable only through the
`record_progress(set_id uuid)` RPC — it recomputes everything (clamped stars,
streak, badges) from the just-inserted `results` row rather than trusting the
client, and guards against being called twice via `results.stars_credited`.
The header's `⭐ {n}` badge reads `progress` directly (anon `select` only).
(`add_stars` is kept as a wrapper for older clients.)

A set earns stars once: the first completed (non-interrupted) result that `record_progress` credits pays out, and a replay of the same set earns 0 stars, no chest and no „Dviguba diena“ multiplier (the end screen says the stars were already counted); past extra stars are not taken back.

### Treasure chest (SPEC.md §7.4)

After a completed, non-interrupted set (both learners) the child picks one of
three buttons to open a chest: +1/+3/+5 ⭐ or „Dviguba diena“ (next scheduled
day earns 2× stars). The three rewards are rolled by `record_progress` at
completion — seeded by the result id and stored in `results.chest_reward` — so
a refresh can't re-roll; `open_chest(set_id, pick)` records the pick and
applies the reward, and `anon` has no INSERT grant on the reward columns.
Both switcher labels are emoji + letter: 👽 H and ⭐ L (H's end-screen emoji is 👽, L's ⭐).

### Tap-to-advance reading (SPEC.md §13.4)

L's `read_aloud` shows the text with the current word highlighted; each
tap on the text (or „Toliau“) moves one word on and the clock runs from the
first tap to the last word. Per-word times land in `answers[].word_times` (ms),
words slower than 2× the median in `answers[].slow_words`; WPM is computed
from the word times. No schema change — just keys inside the existing
`answers[]` jsonb.

### Adaptive think-lock and inline SVG (SPEC.md §7.3, §5.3)

On H's page the "Toliau" lock is 0 s until something in the set goes wrong
on a first attempt, then 6 s for the rest of that set (reload-safe; L's page
keeps 6 s). Any item can carry `data.svg` + `data.svg_alt` (≤ 4 KB, sanitised by
`svg.js`) to show a clock face, fraction circle, diagram, etc. above the prompt.

### Eye / letter training item types (SPEC.md §5.4–§5.8)

Five more item types, on both learners' pages: `letter_hunt` (find every target
letter in a grid before a countdown bar runs out), `letter_flash` (which of two
letters flashed?), `eye_track` (follow a moving dot, tap when it turns red),
`line_find` (tap the number in row r, column c — 1-based — of an unlabelled
table) and `trace` (trace a path with a finger; non-scored, records stroke
quality). The path geometry, red-moment scheduler and scorers are in `games.js`
(pure, unit-testable); the renderers are in `app.js`. An unknown `type` still
falls back to the generic card.

### Cache busting (SPEC.md §8.2)

On every deploy `scripts/stamp-version.py <commit>` appends `?v=<sha>` to each
local script/stylesheet, writes the sha into the page footer and into `app.js`,
and fails the deploy if anything was left unstamped. The footer shows
`Versija abc1234` — the version of the `app.js` that is actually running, so a
stale file on a tablet is visible at a glance (`dev` when served locally).

### Weekly stats (SPEC.md §7.2)

`weekly_stats()` is a `security definer` RPC that anon can run but which only
ever returns aggregates for the last 7 days (sets, items, accuracy, seconds
per item, best/fastest day, stars, accuracy by item type) — no raw answers.
When the set just finished is scheduled on a Saturday, the end screen shows a
„Tavo savaitė“ card with those numbers and an inline-SVG bar chart (Pr–Še).

### Anti-guessing retry flow (SPEC.md §7.3)

`quick_math`/`number_input`/`compare` get a 6s "Toliau" lock on render and
after every wrong attempt (thin progress line, no countdown); `choice` and
`match` have no lock — all five allow up to 4 attempts before revealing the
answer + `hint`. No DB change: `attempts`/`first_answer`/`rushed` are just
extra keys inside the existing `answers[]` jsonb. L's own item types
(`syllable_build`/`word_gap`/`read_aloud`) keep the original one-retry flow.
The retry wording differs per learner (`choice` is shared code, and it's
the only one of the five types reachable on her page, for reading
comprehension) — same mechanic, `SCORED_RETRY_MSG` just picks
"Dar kartą. Skaičiuok sąsiuvinyje." for H vs "Dar kartą. Paskaityk
tekstą." for L.

## Notes on behavior

- Only one row of `task_sets` per `(scheduled_date, subject)` — insert with
  `on conflict (scheduled_date, subject) do update` to replace a day's set.
- If a session is left mid-way and a new day's task set becomes current, the
  old progress is flushed to `results` as `interrupted = true` the next time
  the page loads, using whatever was answered so far.
- The elapsed-time indicator and `duration_seconds` are wall-clock from first
  opening a task set (a reload does not reset the clock).
