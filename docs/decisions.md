# Decisions register

Numbered, append-only. Amendments are dated `NOTE` lines under the
entry. Never rewrite an entry.

Entry format:

```
## #1 — <title> · <date> · decided by <who>
Decision: <what was decided>
Why: <the reason, in one or two sentences>
Verdict / revisit: <date and the rule that decides pass/fail, or "none">
Status: OPEN | PASS | FAIL | DROPPED | SUPERSEDED by #N
NOTE <date>: <amendment>
```

## #1 — Adopt the ledger process · 2026-10-18 · decided by operator
Decision: git is the one ledger; `docs/BRIEF.md` is the entry point; one
advisor chat owns the brief and this register; executors and side chats
report to it.
Why: separate chats and tools had no shared, trusted state.
Verdict / revisit: none
Status: OPEN

## #2 — Live DB is the source of truth for content · 2026-09-06 · decided by operator
Decision: `task_sets` content lives in the live Supabase DB; `seed/week1.sql`
and `seed/<old L>-day1.sql` are historical bootstrap files and are not kept
in sync.
Why: the weekly feedback loop writes the DB directly from other chats;
mirroring it into the repo would fight live edits.
Verdict / revisit: none
Status: OPEN
NOTE 2026-10-18: recorded at ledger init from project memory and the
2026-09-06 commit "Mark seed/week1.sql as a historical bootstrap".

## #3 — The items JSON contract is the API · 2026-09-05 · decided by operator
Decision: SPEC §5 item JSON is the stable interface between Claude and the
page; unknown `type` values and unknown fields render a safe fallback, so
new item types never break the page.
Why: content is generated without code changes (SPEC §1, §11).
Verdict / revisit: none
Status: OPEN
NOTE 2026-10-18: recorded at ledger init from SPEC §11.

## #4 — Static site, dedicated Supabase project, RLS · 2026-09-05 · decided by operator
Decision: vanilla JS static site on GitHub Pages, no build step; a
dedicated Supabase project `nmpp-trainer` accessed with the anon key under
RLS; `config.js` is gitignored and generated from repo secrets at deploy.
Why: zero-maintenance hosting, no backend; keep unrelated Supabase projects
separate (SPEC §1, §3).
Verdict / revisit: none
Status: OPEN
NOTE 2026-10-18: recorded at ledger init from SPEC §3 and README.

## #5 — Check live DB state before any write · 2026-09-06 · decided by operator
Decision: before inserting, updating or deleting `task_sets` / `results`
rows, query current state; never overwrite rows this session did not
create without asking; test rows are tagged in the title and cleaned up by
title match.
Why: other sessions edit the same DB concurrently (found 2026-09-05).
Verdict / revisit: none
Status: OPEN
NOTE 2026-10-18: recorded at ledger init from project memory.

## #6 — Stars once per set · 2026-10-18 · decided by operator
Decision: a task set credits stars at most once. The first completed
(non-interrupted) result that `record_progress` credits earns the set's
stars; later results of the same set (replays) earn 0 and the end screen
says the stars were already counted. Stars already credited by past
replays are not taken back.
Why: sweep 2026-10-18 #1 found replays re-credit stars, so a finished set
could be farmed; the chest was already once per set.
Verdict / revisit: after `FIX-stars-once-per-set` is live, replaying a
finished set leaves `progress.total_stars` unchanged.
Status: OPEN
NOTE 2026-10-19: live via PR #4 (b168b05) and migration `stars_once_per_set_2026_10_18`; interrupted-only sets also earn 0. Verdict check: replay of an old multi-row set returned 0 with total unchanged (rolled-back test as anon).

## #7 — Weekly aggregates stay readable with the anon key · 2026-10-19 · decided by operator (advisor recommended)
Decision: `weekly_stats(learner)` and `week_status(learner)` stay executable
by `anon`, so anyone holding the public anon key can read per-learner
aggregates (accuracy, seconds per item, WPM, done/missed per day). Raw
answers and `results` rows stay unreadable.
Why: the end screen and the `/h` `/l` timetables need them without a login,
and adding auth would break the zero-maintenance design (#4). The data is
less sensitive than what is already public: the repo is public and SPEC
names the children, ages and grade, and the timetables show the school week.
Verdict / revisit: revisit if surnames, the school's name or health details
get into the DB, or if the repo is made private.
Status: OPEN

## #8 — Anonymise public data: H and L · 2026-10-19 · decided by operator
Decision: nothing public names the children. Repo text, the live site, the
DB learner ids and the git history use H and L only. The children see
`👽 H` and `⭐ L`, the trainer URL `/<old L path>/` moves, the DB ids become `h` /
`l`, and the health detail in SPEC §7 is reworded generically. The repo is
replaced by a fresh-history repo of the same name, so the Pages URL stays.
Why: the repo and site are public. With the parent's GitHub identity and
author email, first names plus grade and a health detail identify the
children.
Verdict / revisit: done when `git grep -i -E "h[e]nris|l[i]lija|a[g]urkas|d[y]sgraph"`
on the new repo returns nothing, the live site shows no names, and
`select distinct learner` on every table returns only `h`, `l`.
Status: OPEN
NOTE 2026-10-19: this decision overrides the append-only rule for the
anonymisation edit only. Old entries may have names replaced by H/L; nothing
else in them changes.
NOTE 2026-10-19: ids, site and docs done (PRs #6, #7, school-sync #1,
migration anon_ids_2026_10_20). `select distinct learner` returns only h/l
in all 8 tables. Still open: the docs/ ledger files and the fresh git
history (RUN-fresh-history).

## #9 — school-sync goes into a private repo · 2026-10-19 · decided by operator
Decision: school-sync (launchd `lt.school-sync`, code in
`~/Library/Application Support/school-sync/app`) is versioned in place in a
private GitHub repo `kbl707/school-sync`, after a secret scan, and gets its
own ledger. nmpp-trainer's BRIEF links to it for the `school_*` tables.
Why: the only copy lived on one Mac with no history or backup.
Verdict / revisit: done when the repo exists, is private, has no secrets in
any commit, and launchd still runs at 07:00.
Status: PASS
NOTE 2026-10-19: it was already done. The source is
`~/Documents/python/school-sync`, a git repo pushed to the PRIVATE
`kbl707/school-sync` and up to date; `install-local.sh` rsyncs it into
Application Support, which is the copy launchd runs. Secrets live in the
macOS Keychain (service `school-sync`), not in files. The advisor's earlier
"not in git" claim came from looking only at the installed copy. Own ledger
for school-sync: optional, not started.
