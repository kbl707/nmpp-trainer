# ANON-ids-site — learner ids `h` / `l`, no names on the live site

Brief date: 2026-10-19 · decision #8 · Branch: `anon-ids-site`
Executor: Sonnet, effort medium · Size: M
Runs in parallel with `ANON-school-sync` (other repo) and `ANON-docs`
(different files). Cut-over is done by the advisor (see the end).

Start by reading `docs/BRIEF.md`, decision #8, then this file. This file is
the whole task. In everything you write (code, comments, commit messages,
the PR body), the learners are **H** and **L**. Never write their names.

## Goal
After this PR plus its migration, the public site, the code and the DB ids
contain no learner names:
- DB ids: `'<old H id>'` → `'h'` and `'<old L id>'` → `'l'` in every table.
- What the children see: `👽 H` and `⭐ L`.
- L's trainer moves from `/<old L path>/` to `/l/uzduotys/`.

## Scope (your files only)
- `app.js`, `index.html`, `<old L path>/` → `l/uzduotys/` (git mv; fix every
  relative path `../` → `../../`), `styles.css`, `svg.js`, `games.js`, `tests/`,
  `scripts/stamp-version.py` (it must stamp the new page path)
- `h/index.html`, `l/index.html`: titles, the switcher labels and the
  `LINK` constants. Use `H · 4 kl.` / `L · 2 kl.`; grades are fine.
- `supabase/schema.sql` and a new `supabase/migrations/2026-10-XX-anon-ids.sql`
- a redirect stub at `<old L path>/index.html`: a meta refresh plus a JS
  `location.replace` to `../l/uzduotys/` that keeps `?date=`, so the iPad
  bookmark keeps working. The stub must contain no name except its folder
  path; it is deleted in `RUN-fresh-history`.

Not yours: `SPEC.md`, `README.md`, `seed/`, `printables/` (`ANON-docs`),
`docs/` (the advisor's).

## The migration (one transaction)
For each of `task_sets`, `results`, `progress`, `school_focus`,
`school_grades`, `school_topics`, `sync_runs` and `weekly_reviews`:
1. drop the `*_learner_check` constraint (where present)
2. `update … set learner = case learner when '<old H id>' then 'h' when '<old L id>'
   then 'l' else learner end`
3. re-add the check as `learner in ('h','l')` (only where one existed)

Also:
- column defaults `'<old H id>'` → `'h'` (`task_sets`, `results`)
- `weekly_stats` and `week_status` parameter defaults `'<old H id>'` → `'h'`.
  Changing a default needs drop and create. Keep the bodies byte-identical and
  re-grant execute to anon only, as the least-privilege block does.
- `record_progress`, `open_chest`, `chest_ready`: no change needed if they
  never name a learner (verify with `prosrc ~* 'h[e]nris|l[i]lija'`)

`progress.learner` is the primary key and `results`/`task_sets` refer to it
by value only (check there is no FK), so the plain update is fine. Check
every unique constraint that includes `learner`
(`task_sets (scheduled_date, subject, learner)`, `school_topics (learner,
source, external_id)`, `school_focus` PK): a rename can't collide, but
verify. Don't touch the free text inside `weekly_reviews` rows; it isn't
public.

## App changes
- `LEARNER` values `h` / `l`. `window.NMPP_LEARNER = "l"` on L's page;
  `/` defaults to `h`.
- Everything visible (switcher, end screen, banners, aria-labels, page
  `<title>`s) uses `👽 H` / `⭐ L`, or just H / L where an emoji doesn't fit.
- localStorage keys that include the learner id: migrate on load (read the
  old key, write the new one, delete the old), so a half-done set survives
  the switch.
- CSS classes or ids with names → `learner-h` / `learner-l`.
- Comments: H / L.

## Tracer bullet first
1. Migration inside `begin; … rollback;` on `loccjeqdokzazmjgsyxj` (Supabase
   MCP `execute_sql`, decision #5). Show counts per table per learner before
   and after inside the transaction, plus `weekly_stats('h')` returning the
   same numbers `weekly_stats('<old H id>')` returns now.
2. Then L's page at `/l/uzduotys/` in the local preview (`python3 -m
   http.server 8123`). It will load no set locally, because the live DB still
   says `<old L id>`, so stub the Supabase response or test against the
   transaction's output. Show that the page renders with no console errors.
3. Then widen to everything else.

## Acceptance (paste in the PR)
- `git grep -n -i -E "h[e]nris|l[i]lija|a[g]urkas" -- . ':!SPEC.md' ':!README.md'
  ':!seed' ':!printables' ':!docs'` → only the `<old L path>/` redirect stub path.
  List what's left.
- the rolled-back migration output: per-table counts before and after, the
  `weekly_stats` numbers equal, the ACLs anon-only
- screenshots from the local preview of `/`, `/l/uzduotys/`, `/h/`, `/l/`,
  plus the redirect `/<old L path>/?date=2026-10-16` landing on
  `/l/uzduotys/?date=2026-10-16`
- CI green; `stamp-version.py abc1234` on a scratch copy stamps the new page

## Stop and report if
- any table has a learner value other than the two names
- a foreign key references `progress.learner`
- the migration needs anything beyond renaming ids and defaults

## Cut-over (advisor, not you)
Done in the evening, when the children are not using it. The advisor merges
this PR and `ANON-school-sync` together, applies the migration, runs
`install-local.sh` for school-sync, and live-verifies. The operator updates
the Claude Desktop review project's instructions to use `h` / `l`. Stop at
PR-open.
