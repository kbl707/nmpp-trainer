# nmpp-trainer — brief

As of: 2026-11-26. Rewritten in place; history lives in git.
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
  learner ids are `h` / `l`, the site shows 👽 H / 💍 L, and L's trainer is at
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
Read 2026-11-23 from the live DB; "this week" = scheduled 2026-11-16 → 11-21.
| | H | L |
|---|---|---|
| Sets completed | 5 / 7: Mon, Tue and Wed all done on Tue 17 Nov, Thu both on Thu; Friday test and Saturday long session not done | 4 / 10: Mon both, Wed Lithuanian (done Thu), Thu both; Tue, Fri and Sat not done |
| First-attempt accuracy | 73% (was 83); quick_math 10/11; choice 12/18; number_input 36/51. Misses: 6 × 15 → 80, 3 × 85 → 425 (mental two-digit × one-digit); 41 − 8 → 37, 65 − 27 → 45; 17.45–19.00 → 115; the "what first" choice wrong on first tap 3/3; typed the prompt's example 1145 as an answer twice; būtasis dažninis vs kartinis both wrong first | 84% (was 80); Lithuanian 10/11 on each of 3 texts; syllable_build 11/12; word_gap 6/6; b/d flash 14/16 trials (b → d); maths 2/5 on Mon (63 − 38 → 35, 14 min), 4/5 on Thu (3 min) |
| Reading speed (L) | — | paper sittings 2 and 3 (14 and 15 Nov): photos not received yet; tablet not reported (decision #12) |
| Friday test | not done (11-20) | — |
| Streak · total stars | 19 · 1809 ⭐ | 2 · 755 ⭐ |
| Runway | to 2026-11-28 | to 2026-11-28 |
- days to NMPP: 98 to reading (2027-03-01), 100 to maths (2027-03-03)
- H gaps: mental two-digit × one-digit inside word problems (new this week: multiply tens and ones separately); two-digit subtraction with borrowing; durations longer than an hour; verb tenses (būtasis kartinis / dažninis / būsimasis, the school topic); works in bursts (three sets in one day, none Fri–Sat) and guesses when stuck (final answers 556, 666). Equations: the method holds, the slips are in the subtraction.
- School: both children attend their previous in-person school through November (its programme is the same, 2–3 units behind); the online school (the main one) resumed 2026-11-09 and runs alongside. Trainer in the evenings. The in-person school's teachers agreed to give the children time for online-school tasks; the advisor prepares the weekly list; after 2026-12-02 online school only, with no gap.

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
- #11 H: no eye-training items from 2026-11-02 (2026-11-01)
- #10 Calendar task events carry `eduka:<external_id>` in the description;
  a daily routine marks done ones `DONE ✓` (2026-10-25)
- #12 L: reading speed comes only from parent-timed reads on paper; tablet taps
  are never reported as speed; baseline in the break, then the research plan (2026-11-01)
- #13 School work reaches the operator in one daily email with Classroom in
  full, sent in the evening after the Classroom check, as a short to-do list;
  zero means zero; the daily Classroom check has no end date (2026-11-25,
  evening confirmed 2026-11-26)

## Open items
| Item | Owner | Due | Where |
|---|---|---|---|
| H's YouTube: long live streams with open chat (3–6 h, Rivals/Fortnite customs) — consider YouTube supervised account / chat off | operator | — | YouTube settings |
| L's reading baseline: sitting 1 done (Mon 2 Nov, median 12 wcpm); sittings 2 and 3 moved to Sat 14 Nov 11:20 (Ž2, N1, b/d) and Sun 15 Nov 11:20 (Ž3, NŠA); reprint child pages Ž2, N1, Ž3 (arrows); send photos of all marked sheets (decision #12) | operator | 2026-11-15 review | `printables/skaitymo-matavimas-tevams.html` |
| After the baseline: compute the numbers; the next passages and lists; take `READ-1` to `READ-6` to the operator. Daily parent read started 2026-11-09 as the tablet text read first by the parent | advisor | 2026-11-15 review | `docs/briefs/READ-*.md` |
| H's Classroom (11-25 evening, all classes read, 11 open = Classroom's own counters): maths „Ar jau moku?“ due 11-27; Lithuanian dialogues check test, art and technology November works due 12-01; social studies business plan due 12-08; no deadline: English Unit 6 Test, dictation „Pati saldžiausia vietelė“, Lithuanian chapter check test (posted 11-22); overdue: English writing task (11-20, closed), art September works (10-01), a notice-board greeting (09-03). Social studies check test Nr. 2 (due 11-24) and English „Progress test 2“ (handed in 11-25) show as handed in | operator | this week | Classroom |
| L's Eduka (11-23): 15 tasks open, 5 overdue or due now: „Sprendžiame uždavinius“ (due 11-10, not started), „Ką vaikai pasakojo apie gyvūnus?“ and „Kaip schema pavaizduoti, kiek mažiau?“ (due 11-23), two more due 11-24; sequences, „įdomusis kvadratas“ and the photo texts due 11-30 | operator | this week | Eduka |
| L's Classroom (11-25, all classes read, 8 open = Classroom's own counters): English Unit 3 word test due 11-30 and body-parts test due 12-07; Lithuanian „Gyvūno aprašymas“ (a wild animal) due 12-09 — the trainer texts „Voverė“ and „Ežys“ are models; Lithuanian check test Nr. 2 due 12-11; maths check test Nr. 2 due 12-18; no deadline: reading „Bailusis Liūtas“; overdue: English Unit 2 test (11-23, closed), project „Kur aš gyvenu? Mano gyvenamoji vietovė“ (11-07, needs a presentation in any form) | operator | this week | Classroom |
| Daily mail and Classroom check runs as scheduled task `kids-school-mail-daily` (Mon–Sat 18:00, no end date since 2026-11-25); a weekly list of the online school's Lithuanian, maths and English tasks goes to the in-person school's teachers, who agreed to help | advisor | ongoing | scheduled task, scratchpad `nuotolines-mokyklos-savaite-*.md` |
| New school email (decision #13): school-sync PR #3 merged (1e9743c) and installed on the Mac 2026-11-26 after that evening's check passed (operator's go-ahead the same day). One email a day in the evening: sent by the 18:00 check's `--mail` step, or by the hourly job `lt.school-sync.mail` from 19:00 if the check did not send it; no 07:00 email any more. First live email checked 2026-11-26 (sent 19:50 by the hourly job, agrees with the database). Left: the first one sent by the 18:00 check itself (2026-11-27); the operator's call on dropping the stopgap paragraph and steps 2b / 2d from the daily check (the stopgap only fires when the digest did not send; step 2d's output was blocked on L's account on 11-26); review points 4–8 and the two red tests are open | advisor, session `classroom-in-digest` | 2026-11-28 | school-sync master 1e9743c, `kids-school-mail-daily` |
| Sweep 2026-11-25 (code review, PR #6): 14 findings, none against PR #5 worth a revert. To turn into FIX briefs, one PR each: a future-day or today's load throws away a half-done set (findings 2, 3); stars, streak and chest lost when the credit call fails once (4); reload resets the attempt counter or records an item twice (5, 6); timetable refresh gaps (8–10); the site deploy also publishes `docs/`, `supabase/`, `seed/` (improvement 8). Fill in the sweep's 'Advisor decisions' section | advisor | 2026-11-29 review | `docs/sweeps/2026-11-25-code-review.md` |
| Public history still holds the children's first names (4 commits, also reachable through GitHub's pull-request refs, so a force-push alone does not remove them). Operator approved removing them on 2026-11-25, after open PRs are merged and the `classroom-in-digest` session is finished. Route: the repo swap in `docs/briefs/RUN-fresh-history.md` (old repo renamed and made private, new public repo with one clean commit), each GitHub step confirmed by the operator | advisor + operator | after the school-email work lands | `docs/briefs/RUN-fresh-history.md` |
| Save fix live (PR #3, c1b5ff3): a failed save no longer shows 'atlikta' or loses work (kept on the device, retried); two-subject days offer 'Dar liko'. L's 9–14 Nov: Wed and Sat maths, all of Thu and Fri never reached the server; she can redo them from the timetable. Known leftovers: a lost-response retry can insert a duplicate results row (weekly_stats by_day counts raw rows); one chest marker per device | advisor | 2026-11-15 review | `app.js` |
| App: a finished day can be replayed from the timetable (L did Mon's set again on Tue instead of Tue's); show 'atlikta' and open the next unfinished day instead | advisor → FIX brief | 2026-11-15 review | `app.js`, `l/index.html` |
| Trainer has no offline mode: keep a paper set per child ready for days without internet, and keep sets running with no gap through the winter | advisor | 2026-11-29 review | `printables/` |
| Trainer tested 2026-11-02 in a time zone far behind Vilnius (device dates, real `record_progress` and `open_chest` in a rolled-back transaction): sets and streak correct. Known and accepted: a chest opened late in the local day gives its double day two days later, and can overwrite a double day still pending | — | — | `open_chest` |
| Print L's reading sheets for December and January before 2026-12-02 | advisor → operator | 2026-11-29 review | decision #12 |
| Confirm with the online school that H sits the NMPP remotely on 2027-03-01 and 03-03 (expected), and the start time; the preparation plan stays as it is | operator | before 2026-12-02 | online school |
| Decide: `line_find` for H as a reading skill? Keep 'su tėčiu' writing aids? (decision #11) | operator | next review | `docs/decisions.md` |
| Calendar routine's done rule misses Eduka status `įvertinta` (new, seen on H) | advisor | next sweep | `docs/briefs/ROUTINE-calendar-eduka-done.md` |
| H's account: Google security alert 10-29, new sign-in from an Apple iPhone: confirm it was family | operator | now | H's school mail |
| Timetable: show a day with no set as grey 'Užduotys neparuoštos', not red 'Praleista'; morning digest warns when fewer than 2 days of sets are left | advisor → briefs | — | `h/`, `l/`, school-sync |
| Verify the first scheduled run of `calendar-eduka-done` (Mon 2026-10-26 07:30) did the right thing | advisor | Mon 2026-10-26 | Scheduled tasks pane, `docs/ops-log.md` |
| Desktop review instructions: add 'each task calendar event description carries `eduka:<external_id>` lines (decision #10)' | operator | before tonight's review | Claude Desktop project |
| Add first-attempt accuracy by type + L WPM to Numbers | advisor | next weekly review (2026-10-25) | this file |
| First school-sync day on the new schedule: check the logs for a retry or catch-up line (WARN … retrying once, or 'catch-up run') | advisor | Sat 2026-10-24 evening | `~/Library/Logs/school-sync/` |
| A flush insert that always fails (e.g. a deleted set) now retries on every load (review of PR #7, low) | advisor | next sweep | `games.js` `flushAbandoned` |
| school-sync: two tests fail on master (the digest dry-run test since 2063da0 and the focus test: real clock with October fixtures), confirmed 2026-11-26; the repo has no CI. The review of PR #3 asks to fix both | advisor | with PR #3 | school-sync `test/pipeline.test.mjs` |
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
  `lt.school-sync` Mon–Sat 07:00, with catch-up slots at 12:00/17:00/20:00 that
  redo only what is missing (state in `…/school-sync/today.json`) (log `~/Library/Logs/school-sync/
  launchd.log`, secrets in Keychain). It syncs Eduka into `school_*`/
  `sync_runs` (schema in its `supabase/school.sql`, Classroom tables in
  `supabase/classroom.sql`) and sends one email a day in the evening
  (decision #13): the 18:00 check ends with `run-local.sh --mail`; a second
  job, `lt.school-sync.mail`, runs every hour at :50 and sends it from 19:00
  on the Mac's clock if the check has not.
- External: GitHub `kbl707/nmpp-trainer` (public) (Pages + secrets
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`); Supabase project `nmpp-trainer`,
  id `loccjeqdokzazmjgsyxj`
- `docs/ops-log.md` — what changed outside git, append-only
- `docs/decisions.md` — numbered decisions register
- `docs/inbox/` — results from side chats (L reading research 2026-11-01); `docs/sweeps/` — sweeps;
  `docs/briefs/` — executor briefs, one file per PR

## How we work
Which chat does what:
- **Claude Desktop project "nmpp-trainer"** (it reads `docs/`): the weekly
  review and daily content. It reads `results`, writes `task_sets` (learner
  `h` / `l`) and answers "how is it going?". It never changes the schema,
  RPCs or app code. A content idea that needs a new item type or an app
  change becomes a markdown request, which the operator pastes into the
  advisor chat. **Calendar events for school tasks** (titled with the child's first name in capitals,
  then ` · už 2 d.: …`): the description must contain one line per Eduka
  task, `eduka:<external_id>` (from `school_topics.external_id`), so the
  daily routine can mark it done (decision #10).
- **Advisor (Claude Code, this repo)**: app and DB changes, briefs,
  executors, reviews, deploys, sweeps, and this file. `/ledger sync` files a
  pasted Desktop result under `docs/inbox/`.
- **Executors**: one brief = one PR, started by the advisor.
Process: `~/.claude/skills/ledger/SKILL.md` (copy in `.claude/skills/ledger/`).
Summary in `CLAUDE.md`. Local preview: `python3 -m http.server 8123`
(launch config `static`).
