# Sweep — 2026-11-25 (code review)

Independent read-only review of the whole repository, asked for by the
operator. Produced by a sweep session; the advisor decides which findings
become FIX briefs. Nothing in this file is a change; it is evidence plus
proposals.

Scope: `master` @ `f9bdc31` (== `origin/master`, the only branch on the public
remote), live site https://kbl707.github.io/nmpp-trainer/ (serves `f9bdc31`),
Supabase project `loccjeqdokzazmjgsyxj`. Read: `index.html`, `app.js`,
`games.js`, `svg.js`, `l/uzduotys/index.html`, `h/index.html`, `l/index.html`,
`supabase/schema.sql`, all five migrations, `scripts/stamp-version.py`,
`.github/workflows/deploy.yml`, `tests/games.test.js`; `styles.css`, `SPEC.md`
and `README.md` only where a finding touched them. Extra attention on PR #5
(`39ca7d8..57c81f7`) and PR #4 (`f9b7ca2`).

Read-only throughout: no code edits, no DB writes. Every Supabase query was a
`select` (plus `get_advisors`). `results` had 143 rows, newest 2026-11-25 14:12
Vilnius, before and after the sweep; `progress` unchanged (H 1927 ⭐ streak 3,
L 789 ⭐ streak 1).

**PR #5 verdict: no defect that would justify reverting it.** It does what it
says in the normal case (checked on the live `/l` page: status applied at load,
a `focus` event starts a second read, an unchanged answer leaves the page
alone). Findings 8–10 are narrow gaps in it; reverting would bring back the
original fault (status read only at page load).

## How the trainer findings were verified

The local preview server would not start in the sweep sandbox, so the deployed
`app.js`/`games.js`/`svg.js` (byte-identical to `master` apart from the stamped
version, checked with `diff`) were run in desktop Chromium on the site's own
origin, with `window.NMPP_CONFIG` pointing at a host that does not exist and
`fetch` replaced by an in-memory fake of the REST API (three 3-item sets:
yesterday, today, tomorrow). A page load was simulated by rewriting the
document. 0 requests went to the real project; the test `localStorage` keys
were removed afterwards. "Reproduced" below means reproduced in this harness.
Not a real iPad: see "Not checked".

## Checks run

| Check | Result |
|---|---|
| `node --check` on `app.js`, `games.js`, `svg.js` | `app.js ok` / `games.js ok` / `svg.js ok` (node v23.9.0; CI uses 20) |
| `python3 -m py_compile scripts/stamp-version.py` | `py ok` |
| `node --test tests/*.test.js` | `tests 11`, `pass 11`, `fail 0`, 50 ms |
| `/code-review high` on `39ca7d8..57c81f7` | 6 findings: 1 important (finding 8), 3 nits (9, 10, improvement 1), 2 pre-existing (improvement 2; the known "no set = missed" open item). All checked again by hand below |
| Deploy == master | Live `app.js` has `APP_VERSION = "f9bdc31"`; `games.js`, `svg.js`, `styles.css` identical to the repo; every local script and stylesheet on `/`, `/l/uzduotys/`, `/h/`, `/l/` carries `?v=f9bdc31`. Last four Deploy runs `success` (latest `45614225484`, 2026-11-25T12:29:22Z) |
| Live functions == `schema.sql` | `md5(prosrc)` of all 7 functions (`record_progress`, `chest_roll`, `chest_ready`, `open_chest`, `add_stars`, `weekly_stats`, `week_status`) equals the md5 of the body in `supabase/schema.sql`. `week_status` in `schema.sql` == the 2026-11-16 migration (`diff` clean) |
| Live grants and policies | `anon`: `select` on `task_sets`, `progress`; column `insert` on `results` (8 columns); execute on the 6 RPCs, not on `chest_roll`. `authenticated` and `PUBLIC`: nothing. Policies: the three in `schema.sql`, nothing else. RLS on for all 9 tables |
| Supabase security advisors | 6× `rls_enabled_no_policy` (INFO, the `school_*`, `sync_runs`, `weekly_reviews` tables: denied to anon, as intended); 6× `anon_security_definer_function_executable` (WARN, intended). The 6 `authenticated` warnings of sweep 2026-10-18 are gone |
| Supabase performance advisors | none |
| Content validity, sets 2026-11-16 → 11-28 | 34 sets, 505 items: every item has an id and a known type, no duplicate ids in a set, every `quick_math`/`number_input` has a numeric `answer.value` (all whole, none negative), every `choice`/`word_gap` index in range, every `passage_ref` points to an earlier passage |
| Data integrity | 0 `results` rows whose `learner` differs from the set's; 0 completed sets without a chest row since 10-20; 0 rolled-but-unopened chests; 1 completed set never credited (H, 2026-09-07, already in sweep 2026-10-18) |
| Personal data in tracked files | Finding 1. No e-mail addresses (one GitHub `noreply` id in `docs/briefs/RUN-fresh-history.md:25`), no key-like strings, `config.js` not tracked |
| Runway | sets exist to 2026-11-28 for both (as in BRIEF) |

## Findings (most severe first)

| # | Sev | Where | What | Size |
|---|---|---|---|---|
| 1 | Med | `docs/BRIEF.md:159-160`, `docs/decisions.md:135`, `docs/ops-log.md:30,37`, `docs/briefs/ROUTINE-calendar-eduka-done.md:20` | Both children's first names are in the public repo | S (+ history: operator) |
| 2 | Med | `app.js:2529-2532,2567` | Opening a future day from the timetable throws away today's half-done set | S |
| 3 | Med | `app.js:2567` (`432-436`) | Opening today's page throws away a half-done catch-up set | S |
| 4 | Med | `app.js:2354-2366`, `488-505` | Stars, streak and chest are lost if `record_progress` fails once after the save | S |
| 5 | Low | `app.js:641-667`, `553-560`, `2256-2266` | A reload in the middle of an item resets the attempt counter | S |
| 6 | Low | `app.js:660-662`, `2261` | A reload on the "correct answer" screen asks the item again and records it twice | S |
| 7 | Low | `supabase/schema.sql:417-427,443-452` | The Saturday week card counts replays: sets, items and stars that were never credited | S |
| 8 | Low | `h/index.html:126`, `l/index.html:126` | Timetable: a return to the page while a read is in flight is dropped | S |
| 9 | Low | `h/index.html:184-187`, `l/index.html:184-187` | Timetable: nothing re-reads the status while the page stays in view | S |
| 10 | Low | `h/index.html:125`, `l/index.html:125` | Timetable: the after-midnight reload trusts `navigator.onLine` | S |
| 11 | Low | `supabase/schema.sql:68-71,165-170,589-591` | The public key can add any number of stars and mark any day done | S–M |
| 12 | Low | `app.js:2571-2575`, `497-503` | A set saved late, on another day's load, loses its chest | S |
| 13 | Low | `app.js:2263,2293` | `duration_seconds` includes the time the set was left alone | S |
| 14 | Low | `app.js:2524-2604` | The trainer never notices that the day changed | S |

### 1. Both children's first names are in the public repo
- **What:** six lines in four tracked files carry the children's first names
  in capitals, as the prefix of the calendar task events (the lines listed in
  the table). They came in with three docs commits after the fresh history of
  2026-10-19 (`0cac3b2`, `7991a46`, `588a5ec`), so they are also in the public
  history. The Pages deploy uploads the whole repo (`deploy.yml`, `path: .`),
  so the same files are served from the site as well.
- **Scenario:** anyone reading `docs/BRIEF.md` on GitHub learns the names next
  to grade, weekly timetable, school results and the account notes in the open
  items. Decision #8 says everything public uses H / L.
- **Verified:** `grep -rniE` over the tree (names matched by pattern, not
  printed); `git log origin/master -G…` for the commits; `git ls-remote` shows
  `master` is the only public ref. No commit message on `origin/master`
  contains a name.
- **Confidence:** high.
- **Fix:** replace the prefixes with `H ·` / `L ·` (or "the child's calendar
  prefix") in the four files: S. Two of the files are the advisor's
  (`BRIEF.md`, `decisions.md`). Whether to rewrite history again is the
  operator's call. Cheap guard: a CI step that fails on the name patterns kept
  in a repo secret.

### 2. Opening a future day throws away today's half-done set
- **What:** `init()` takes any real `?date=` (`app.js:2529`), and only a date
  before today counts as catch-up (`2532`). For a later date the abandoned-
  session flush runs against that day's sets (`2567`): today's unfinished
  session is inserted as `interrupted` and its local copy deleted. A date after
  tomorrow has no visible sets, so everything in progress is flushed. Tomorrow's
  set also opens and can be done a day early. SPEC §8 says a future date
  "behaves like no parameter".
- **Scenario:** on Wednesday a child is on item 6 of today's set, goes back to
  the timetable, taps Friday's tab and its „Atidaryti užduotis →" (every
  weekday card has the link, `h/index.html:102`). The new tab says „Šiandien
  užduočių nėra. Laisva diena! 🎉". If the first tab was closed, or Safari
  reloads it, today's set starts again from item 1 and the database has an
  interrupted row for it.
- **Verified:** reproduced. With 1 answer saved for today's set, loading
  `?date=<today+3>` produced `INSERT results {set: today, interrupted: true}`
  and removed `nmpp:progress:h:<today's set>`; the next plain load showed
  `1 / 3`. Loading `?date=<tomorrow>` did the same and started tomorrow's set.
  Live data: 0 interrupted rows flushed on or before their set's own date, so
  it has not happened yet.
- **Confidence:** high.
- **Fix:** `const day = wanted && wanted < today ? wanted : today;` (what SPEC
  says), and drop the link on future days in the timetable so the button
  doesn't open the wrong day. S. Can share a brief with finding 3.

### 3. Opening today's page throws away a half-done catch-up set
- **What:** on a normal load every saved session that is not one of today's
  sets is flushed as interrupted and deleted (`app.js:2567`). The comment at
  `432-436` says such a session "was necessarily abandoned (a new day started)";
  that stopped being true when `?date=` arrived. SPEC §8 protects only the
  other direction (a catch-up load leaves today's session alone).
- **Scenario:** H catches up Monday's set on Tuesday, stops halfway, opens
  today's set from the timetable (its link is `?date=<today>`, which is a
  normal load). Monday's progress is gone; reopening Monday starts at item 1.
  H does several days in one sitting, so this order is likely.
- **Verified:** reproduced: catch-up load, 1 answer, then a plain load →
  `INSERT results {set: yesterday, interrupted: true}`, key removed, catch-up
  page back at `1 / 3`.
- **Confidence:** high.
- **Fix:** flush only sessions that were started on an earlier local day
  (`sessionStartMs` is already saved), and not the set being opened. S.

### 4. Stars, streak and chest are lost if `record_progress` fails once
- **What:** after the `results` insert succeeds, `finishSaved` calls
  `record_progress` once and swallows a failure (`app.js:2363`). The end
  screen then shows the local count („⭐ +6") with no total and no streak, so it
  looks fine. Nothing remembers that the set is uncredited:
  `flushUnsavedResults` credits only rows it has just inserted (`497-503`).
- **Scenario:** Wi-Fi drops for a second between the save and the RPC. The
  child sees stars on the end screen, but the total, the streak and the chest
  never arrive, unless the set is replayed to the end.
- **Verified:** reproduced: with `record_progress` failing, the row was
  inserted, the end screen showed „⭐ +6", and the next load made no
  `record_progress` call (it started the set again). Live data: no completed
  set since 2026-09-07 is uncredited, so it has not bitten yet.
- **Confidence:** high for the mechanism; not seen live.
- **Fix:** keep a small "saved, not credited" marker per set in `localStorage`
  (like `nmpp:unsaved:`), cleared when `record_progress` answers, retried at
  load. The RPC is already idempotent. S.

### 5. A reload in the middle of an item resets the attempt counter
- **What:** `session.attempt`, `firstAnswer` and `firstRushed` live only in
  memory; `persistSession` saves index and finished answers
  (`app.js:553-560`), and a resumed session starts the current item at
  attempt 0 (`2265`). The think-lock is derived from finished answers only, so
  it is off again too.
- **Scenario:** three wrong guesses, reload, type the answer: recorded as
  `attempts: 1`, 2 stars, no `first_answer` of the real first try. The weekly
  review's first-attempt accuracy, and the anti-guessing flow, both count on
  that number.
- **Verified:** reproduced: wrong answer, reload, right answer → saved entry
  `attempts: 1, stars: 2`; the button was usable at once after the reload.
- **Confidence:** high. How often a child reloads mid-item is unknown.
- **Fix:** save `attempt`, `firstAnswer`, `firstRushed` with the progress after
  each wrong attempt and restore them for the same item. S; one brief with
  finding 6.

### 6. A reload on the "correct answer" screen records the item twice
- **What:** on the fourth wrong attempt the answer is recorded
  (`app.js:660-662`) but the index moves only when „Toliau" is pressed. A
  reload there resumes on the same item, which is asked again, now with the
  answer just shown.
- **Scenario:** the item ends up twice in `answers`: wrong (4 attempts) and
  right (1 attempt, 2 stars). A 3-item set saves `correct_count 3`,
  `total_autochecked 4`; the end screen and the timetable show "3 iš 4".
- **Verified:** reproduced with exactly those numbers. Live data: 0 rows with
  a repeated `item_id`, 0 rows with more answers than items.
- **Confidence:** high for the mechanism; not seen live.
- **Fix:** on resume, if the current item already has an answer, move to the
  next one. S. Finding 11's server-side fix also covers it.

### 7. The Saturday week card counts replays
- **What:** `weekly_stats` takes every non-interrupted row in the window
  (`schema.sql:417-427`) and sums answer stars over all of them (`443-452`).
  Since decision #6 a replay earns 0, and a lost-response retry leaves a
  duplicate row; both are counted in `sets_completed`, `total_items`,
  accuracy and `stars_earned`. `week_status` already uses each set's first
  completed row. BRIEF lists the `by_day` half of this; the stars are new.
- **Scenario (live, read 2026-11-25):** for H the card would say 6 sets and
  ⭐ 161; the last 7 days hold 5 distinct sets (one done twice), and the stars
  actually credited are 142 from answers plus 9 from chests = 151.
- **Verified:** `select weekly_stats('h')` against my own count over the same
  window. L's figures have no replay this week (4 rows, 4 sets).
- **Confidence:** high.
- **Fix:** in the `done` CTE keep the first completed row per set
  (`distinct on (task_set_id) … order by submitted_at`). S, a migration.

### 8. Timetable: a return while a read is in flight is dropped (PR #5)
- **What:** `refresh()` returns when `busy` (`h/index.html:126`) and nothing
  runs it again when the pending request settles. SPEC §8.1 says a failed read
  "is retried on the next return", but if that return came during the failing
  request it is lost.
- **Scenario:** slow network: the read started at page load is still pending
  when the child opens a set. On the way back the three events all hit `busy`;
  the old request then fails or times out; the finished set keeps showing as
  not done until the page is left and entered once more.
- **Verified:** on the live `/l` page with `week_status` requests delayed to
  fail after 1.5 s: return 1 started a request, return 2 (0.5 s later) started
  none, and 4 s later still only 1 request had been made; return 3 read again.
- **Confidence:** high for the mechanism; medium that a child meets it (it
  needs a request in flight at the moment of return).
- **Fix:** remember "asked while busy" and run `refresh()` once more in the
  final `.then`. S, both files.

### 9. Timetable: nothing re-reads while the page stays in view (PR #5)
- **What:** the status is read on `visibilitychange`, `focus` and `pageshow`
  only (`h/index.html:184-187`).
- **Scenario:** the timetable is open on a parent's screen while the child
  works on the tablet: it never updates. Also a read that raced the trainer's
  save (the child switched back before the insert finished) stays stale.
- **Verified:** by reading; there is no timer in the script.
- **Confidence:** high.
- **Fix:** also call `refresh()` every 60 s while the page is visible; the
  busy and "same answer" checks already make that cheap. S.

### 10. Timetable: the after-midnight reload trusts `navigator.onLine` (PR #5)
- **What:** `h/index.html:125` reloads when the date has changed unless
  `navigator.onLine === false`. That flag says a network interface is up, not
  that the site is reachable.
- **Scenario:** tablet left on the timetable overnight, Wi-Fi up but no
  internet: on return the page reloads into the browser's error page, which is
  what the comment says the check should prevent.
- **Verified:** by reading only.
- **Confidence:** medium.
- **Fix:** reload only after a successful `week_status` read, or rebuild in
  place with a fresh `jsToday`. S.

### 11. The public key can add any number of stars and mark any day done
- **What:** the insert policy on `results` is `with check (true)`
  (`schema.sql:68-71`), and `record_progress` adds up to 2 stars for every
  entry in `answers` without comparing the entries with the set's items
  (`165-170`). The key is published in `config.js` by design (decision #4), and
  set ids up to tomorrow are readable. So anyone can insert a result with any
  number of "correct" answers for any visible set and have it credited: stars
  without limit, a streak, days shown as done on the timetable, noise in the
  weekly review. `submitted_at` is also insertable (`589-591`), although the
  client never sends it (`grep submitted_at app.js games.js`: no hits), so the
  "first completed result" that `week_status` shows can be forged too.
- **Scenario:** a stranger who finds the repo spoils the star total, which is
  the children's reward; undoing it means manual DB repair.
- **Verified:** live policy (`with_check: true`), live column grants and the
  function text. Not tested with an insert: this sweep writes nothing.
- **Confidence:** high that it is possible; low that anyone bothers.
- **Fix:** (a) in `record_progress` count each item id of the set at most
  once, so a set can never pay more than 2 × its items (this also neutralises
  finding 6); (b) `with check` that the set exists, is for the same learner
  and is not later than tomorrow; (c) revoke the `submitted_at` column grant.
  S–M, one migration. Decision #7 (aggregates stay readable) is not touched.

### 12. A set saved late, on another day's load, loses its chest
- **What:** `flushUnsavedResults` saves a set whose save failed earlier,
  credits it and remembers its chest (`app.js:497-503`). The chest block then
  sees that the remembered set is not one of today's and forgets it
  (`2573-2574`). A later replay cannot get one either (one chest per set).
- **Scenario:** L finishes Thursday's set while the save fails and closes the
  tablet. On Friday the page saves and credits Thursday, shows no chest, and
  starts Friday's set.
- **Verified:** reproduced: after the late save `record_progress` answered
  `chest_ready: true`; no `chest_ready` or `open_chest` call followed and
  `nmpp:chest:h` was gone. Live data: 0 unopened chests today.
- **Confidence:** high.
- **Fix:** in the chest block ask `chest_ready(pendingId)` whatever day the
  set belongs to, and show it. S. Related to the known "one chest marker per
  device" leftover.

### 13. `duration_seconds` includes the time the set was left alone
- **What:** a resumed session keeps the original `sessionStartMs`
  (`app.js:2263`), and the duration is "now minus start" (`2293`).
- **Scenario:** a set started at breakfast and finished in the evening is
  saved as ten hours. The weekly review reads durations ("14 min").
- **Verified:** live data: 7 completed rows longer than 2 h (H 3, L 4), the
  longest 79,729 s (22 h).
- **Confidence:** high.
- **Fix:** on resume set `sessionStartMs = Date.now() - saved.lastElapsedMs`
  (already stored). S.

### 14. The trainer never notices that the day changed
- **What:** the trainer loads its day once, in `init()`. PR #5 taught the
  timetable to start over after midnight; the trainer has no such check.
- **Scenario:** yesterday's end screen („Šiandien — atlikta!") is still in the
  tablet's tab the next afternoon; the child sees "today done" until someone
  reloads. Opening sets from the timetable avoids it (always a new tab).
- **Verified:** by reading only; not reproduced.
- **Confidence:** medium.
- **Fix:** on `visibilitychange`, if `todayStr()` differs from the load day
  and no set is in progress, reload. S.

## Improvements that are not bugs
1. **Timetable script: one copy, and in CI.** The 75-line status script is
   inline and duplicated in `h/index.html` and `l/index.html` (the two copies
   differ only in the learner id), and CI parses neither: a typo in one copy deploys green and leaves
   that page without tabs. Move it to one `timetable.js` (DATA stays inline),
   add it to the `node --check` loop. This also keeps PR #4/#5 alive if the
   outside generator is re-run (known open item). S–M.
2. **`SUBJ` has no label for `pratimai`** (`h/index.html:120`, `l/…:120`): a
   two-subject day with such a set would show the raw id. No `pratimai` set
   exists since 2026-11-02 (decision #11), so nothing shows it today. S.
3. **H's Thursday card is out of date.** `h/index.html:75` still says „Akys,
   ranka, raidės — 15 min … Atsispausdintas lapas, su tėvais, be ekrano";
   decision #11 ended that, and Thursday's link now opens a Lithuanian and a
   maths set (11-19, 11-26). Content, via the generator.
4. **Scenario tests for `app.js`.** Findings 2–6 and 12 all sit in the
   load / flush / save paths, which have no test. The fake-backend harness
   used here (stub `fetch`, three tiny sets) would fit a headless-browser CI
   step; five scenarios would have caught all six. M.
5. **`svg.js` still has no tests** (planned in sweep 2026-10-18 #5; needs a
   DOM). While there: drop elements outside the SVG namespace, so an XHTML
   `img`/`meta` inside `data.svg` cannot load anything. No set uses
   `data.svg` now. S.
6. **One bad item should not block a set.** `renderNumericItem` reads
   `item.answer.value` and several renderers read `item.data.…` without a
   guard; a malformed item would throw on every press and the set could not be
   finished. Content is clean today (505 items checked). Wrap the renderer
   call and offer „Praleisti" on error. S.
7. **Drop `add_stars`.** Its "revisit after 2026-11-15" date has passed;
   nothing in the repo calls it and every page is version-stamped. S.
8. **Deploy only the site.** `upload-pages-artifact` takes `path: .`, so
   `docs/`, `supabase/`, `seed/`, `tests/` and `.claude/` are served from the
   site too. A `_site/` copy step keeps the site to the pages. S.
9. **„Nepavyko įkelti užduočių" has no way forward** but a manual reload
   (`app.js:2546`); a „Bandyti dar kartą" button and an `online` listener, as
   on the save-failed screen, would do. S.
10. **Small ones.** `compare` writes `data.left`/`data.right` into `innerHTML`
    unescaped (`app.js:918,982`; content is trusted). The end screen says
    „Šiandien — atlikta!" on a catch-up day and after a resumed chest even when
    the day's other subject is still open (`2478`). BRIEF "Where things stand"
    still gives 2026-10-18 as the last deploy.

## Known items, not repeated
Already in BRIEF's open items; counted here only where the sweep adds a
number: a finished day can be replayed and the picker offers a done subject
(12 sets have more than one completed row, 6 of them since 10-20; 7 sets since
10-20 have an interrupted row beside a completed one); a lost-response retry
duplicates the row; one chest marker per device; `progress.streak` never
decays; a past day with no set shows as „Praleista"; a flush insert that
always fails retries on every load; the timetable generator lives outside the
repo.

## Not a problem (checked, fine)
- PR #5: SPEC §8.1's new paragraph matches the code line by line (3 s pause
  after a successful read only, 8 s timeout, rebuild only on a changed answer,
  open tab kept, no reload when offline or without `config.js`). No removed
  behaviour: the first render and the default tab are as before.
- PR #4: `?subject=` falls back to the picker for an unknown subject;
  `week_status` returns `subjects` ordered by subject; the timetable builds the
  per-subject link with `encodeURIComponent` and writes names and scores with
  `textContent`.
- Time zones: the trainer uses the device's date, `record_progress` and the
  two status RPCs use Vilnius, RLS allows sets up to tomorrow (UTC); the
  timetable matches rows by date, and `week_status` covers 14 days back to
  tomorrow, so a device behind Vilnius still finds its week.
- Double crediting: `record_progress` locks the set row, and a second
  completed row is a replay with 0 stars and no chest; `open_chest` pays once.
- `stamp-version.py`: fails the deploy on any unstamped local asset; the live
  pages show it working.
- Phone layout of the timetable at 375 px (emulated): tabs, cards and the
  button fit. Number inputs are 24 px, so iOS does not zoom on focus.

## Not checked
- **Real iPad / iPhone Safari.** Everything ran in desktop Chromium; the iOS
  Simulator is not available on this Mac (no full Xcode). Tab suspension,
  `visibilitychange` timing and `pageshow` on iOS are therefore unverified for
  findings 8–10 and 14.
- No anon write was attempted (finding 11 rests on the live policy, grants and
  function text). No task set was opened or finished on the live site.
- The trainer was exercised only with `number_input` items. `read_aloud`,
  `syllable_build`, `word_gap`, `match`, `compare`, the chest screen and the
  five eye/letter types were read, not run. TTS and sound not tried.
- `styles.css` (skimmed), `printables/`, `seed/*.sql`, `README.md` and most of
  `SPEC.md` (only §7.2, §8, §8.1 compared with the code).
- The private `school-sync` repo, the `school_*` / `weekly_reviews` tables'
  contents, the scheduled tasks, GitHub repo settings and secrets.
- Accessibility and performance.

## Advisor decisions
(for the advisor to fill in)
