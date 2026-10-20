# nmpp-trainer — brief

As of: 2026-10-19. Rewritten in place; history lives in git.
Entry point for any chat. Read this first, then the last 7 days of
`docs/ops-log.md`.

## What this is
A tiny static web app for one family: each day a child opens one URL and
sees only that day's tasks. H (4th grade, profile in SPEC as
a personal handle) preps for the Lithuanian 4th-grade NMPP: **reading
(lietuvių kalba ir literatūra) Mon 2027-03-01, maths Wed 2027-03-03**;
L (7, 2nd grade, iPad) practises syllable blending and reading
comprehension at `/<old L path>/`. Claude reads `results` and writes future
`task_sets` straight into Supabase — new content needs no code change.
"Working" = today's set loads on the child's device, answers save as a
`results` row, and the weekly loop keeps the next days filled.
All UI copy is Lithuanian; the child has a named diagnosis (SPEC §7).

## Where things stand
- Live: https://kbl707.github.io/nmpp-trainer/ (GitHub Pages, deployed by
  `.github/workflows/deploy.yml` on every push to `master`; last deploy
  2026-10-18 20:33 UTC, green).
- Shipped (git log, 2026-09-05 → 2026-10-18): daily trainer, passages,
  printables, stars/streak/badges, Saturday weekly stats, anti-guessing
  retry flow, treasure chest, catch-up `?date=`, timetables `/h` `/l`
  with done/missed status, L trainer with tap-to-advance reading,
  adaptive think-lock, inline SVG, five eye/letter item types
  (`letter_hunt`, `letter_flash`, `eye_track`, `line_find`, `trace`),
  cache-busting version stamp.
- Content: the weekly feedback loop (SPEC §11) runs from other Claude
  chats via the Supabase MCP connector and edits the live DB directly.
- CI: a `check` job (per-file `node --check`, `py_compile`, `node --test`
  on `tests/games.test.js`) gates every deploy since 2026-10-18 (PR #1).
  supabase-js is pinned to 2.118.0 with SRI (PR #2).
- DB grants are least-privilege since 2026-10-18 (PR #3, migration
  `supabase/migrations/2026-10-18-anon-grants.sql`, applied live). New RPCs
  need an explicit `grant execute … to anon`.
- Stars once per set since 2026-10-19 (PR #4, decision #6): replays and
  interrupted-only sets earn 0; `record_progress` returns `replay`.
- An unfinished today no longer resets the streak (PR #5, 2026-10-19), so
  catch-up via `?date=` keeps it.
- Anonymised on 2026-10-19 (decision #8, PRs #6, #7, school-sync #1): DB
  learner ids are `h` / `l`, the site shows 👽 H / ⭐ L, and L's trainer is at
  `/l/uzduotys/`. Every writer must use `h` / `l`, because the old ids now fail
  the checks.
- Fresh history since 2026-10-19: this public repo has one root commit
  (860918d). The archive repo was deleted on 2026-10-19. The old history and
  the PR threads #1–#8 cited in `docs/` exist only in the operator's local
  backup (`~/Documents/python/nmpp-trainer-archive-backup`, private, holds
  names) and in the local tag `pre-fresh-history`.
- First weekly sweep 2026-10-18 (`docs/sweeps/2026-10-18.md`): no incidents,
  7 findings, decisions recorded there.
- Nothing known broken (operator, 2026-10-19); sweep 2026-10-18 found no
  incidents and all five of its fixes are live.

## Numbers that matter
Read 2026-10-18 from the live DB (`task_sets`, `results`, `progress`);
"last 7 days" = scheduled 2026-10-12 → 2026-10-18.
| | H | L |
|---|---|---|
| Sets filled ahead (runway) | 5 days, to 2026-10-23 | 6 days, to 2026-10-24 |
| Sets completed, last 7 days | 7 / 7 | 5 / 5 |
| Auto-checked correct (`correct_count`), last 7 days | 116 / 118 (98%) | 41 / 42 (98%) |
| Streak · total stars | 8 · 731 ⭐ | 10 · 234 ⭐ |
- days to NMPP: 134 to reading (2027-03-01), 136 to maths (2027-03-03),
  counted 2026-10-18; both are all-day events in Google Calendar
- Not yet read: first-attempt accuracy by item type, L WPM trend.
  `correct_count` may count answers that came right after a retry (§7.3), so
  98% doesn't show whether the sets are too easy. First-attempt accuracy does.

## Decisions in force
- #1 Ledger process (2026-10-18)
- #2 Live DB is the source of truth for content; `seed/*.sql` are
  bootstrap only (2026-09-06)
- #3 The items JSON contract (SPEC §5) is the API; unknown types render
  a safe fallback (2026-09-05)
- #4 Static site, no build step, dedicated Supabase project, RLS +
  anon key, `config.js` from repo secrets at deploy (2026-09-05)
- #5 Other sessions write the live DB: query state before any write,
  never overwrite rows this session didn't create (2026-09-06)
- #6 Stars once per set: replays earn 0, past extra stars are kept
  (2026-10-18)
- #7 `weekly_stats`/`week_status` aggregates stay readable with the anon
  key; revisit if sensitive data enters the DB (2026-10-19)
- #8 Anonymise everything public to H / L, including DB ids and git
  history (2026-10-19)
- #9 school-sync in a private repo `kbl707/school-sync` (2026-10-19)

## Open items
| Item | Owner | Due | Where |
|---|---|---|---|
| Add first-attempt accuracy by type + L WPM to Numbers | advisor | next weekly review (2026-10-25) | this file |
| school-sync digests land in Gmail **Trash**, unread (every one since 2026-10-14), most likely a Gmail filter on the sender: check Gmail → Settings → Filters | operator | — | Gmail |
| A flush insert that always fails (e.g. a deleted set) now retries on every load (review of PR #7, low) | advisor | next sweep | `games.js` `flushAbandoned` |
| school-sync: the digest dry-run test has been failing on master since 2063da0 (pre-existing) | advisor | next sweep | school-sync `test/pipeline.test.mjs` |
| `weekly_reviews` has no schema in any repo (the `school_*` tables are in school-sync `supabase/school.sql`) | advisor | with ANON-ids-site | `supabase/` |
| `progress.streak` never decays after missed days (it's only recomputed on completion), and the interrupted-only path returns the stored streak (review of PR #5, low) | advisor | next sweep | `record_progress` |
| Timetables `/h` `/l` need the `?date=` + `week_status` tweak if the external generator is re-run | operator | on regen | README "Pages" |

## Map
- `SPEC.md` — full design; §5 item JSON contract, §6 RLS, §7 UI rules,
  §8 routes, §11 feedback loop, §13 L
- `README.md` — setup, deploy, per-feature notes
- `app.js` (renderers, flow), `games.js` (pure game logic), `svg.js`
  (SVG sanitiser), `index.html`, `styles.css`, `<old L path>/index.html`
- `supabase/schema.sql` — tables, RLS, RPCs (`record_progress`,
  `open_chest`, `weekly_stats`, `week_status`)
- `h/`, `l/` — timetables (generated outside this repo); `printables/`
- `scripts/stamp-version.py` — cache-busting stamp run at deploy;
  `tests/` — node tests run by CI; `supabase/migrations/` — applied migrations
- Writers outside this repo: (1) weekly review in Claude Desktop chat
  ("nmpp-trainer" project) writes `task_sets` and `weekly_reviews`;
  (2) **school-sync**, private repo `kbl707/school-sync` (source
  `~/Documents/python/school-sync`), installed by `scripts/install-local.sh`
  into `~/Library/Application Support/school-sync/app` and run by launchd
  `lt.school-sync` Mon–Sat 07:00 (log `~/Library/Logs/school-sync/
  launchd.log`, secrets in Keychain). It syncs Eduka into `school_*`/
  `sync_runs` (schema in its `supabase/school.sql`) and emails a digest.
- External: GitHub `kbl707/nmpp-trainer` (public) (Pages + secrets
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`); Supabase project `nmpp-trainer`,
  id `loccjeqdokzazmjgsyxj`
- `docs/ops-log.md` — what changed outside git, append-only
- `docs/decisions.md` — numbered decisions register
- `docs/inbox/` — results from side chats; `docs/sweeps/` — sweeps;
  `docs/briefs/` — executor briefs, one file per PR

## How we work
Which chat does what:
- **Claude Desktop project "nmpp-trainer"** (it reads `docs/`): the weekly
  review and daily content. It reads `results`, writes `task_sets` (learner
  `h` / `l`) and answers "how is it going?". It never changes the schema,
  RPCs or app code. A content idea that needs a new item type or an app
  change becomes a markdown request, which the operator pastes into the
  advisor chat.
- **Advisor (Claude Code, this repo)**: app and DB changes, briefs,
  executors, reviews, deploys, sweeps, and this file. `/ledger sync` files a
  pasted Desktop result under `docs/inbox/`.
- **Executors**: one brief = one PR, started by the advisor.
Process: `~/.claude/skills/ledger/SKILL.md` (copy in `.claude/skills/ledger/`).
Summary in `CLAUDE.md`. Local preview: `python3 -m http.server 8123`
(launch config `static`).
