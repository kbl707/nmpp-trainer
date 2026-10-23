# SPEC: NMPP Daily Trainer

A tiny web app for daily exam-prep tasks for a 4th grader (H) preparing for
the Lithuanian NMPP assessment (reading 2027-03-01, maths 2027-03-03). Parent (parent) and Claude generate
tasks; the child solves them in the browser; results are stored so Claude can
analyze progress and tailor future tasks via the Supabase MCP connector in
Claude chat.

**All UI copy must be in Lithuanian.** This spec is in English for the coding
agent; Lithuanian UI strings are provided in the UI section.

---

## 1. Goals

1. Every day the child opens one URL and sees **only that day's tasks**.
2. Answers are checked client-side where possible; results are written to a database.
3. Claude (via Supabase MCP, from chat) can:
   - read results and compute insights (error patterns, timing, streaks),
   - insert new task sets for upcoming days — **without any code changes**.
4. Zero-maintenance hosting, no backend server.

## 2. Non-goals

- No user accounts / multi-tenant support (single family).
- No grading of free-form drawing — schema-drawing tasks are self-marked.
- No gamification beyond a simple star/streak counter.

## 3. Architecture

- **Frontend**: static single-page app, vanilla JS (or Preact if justified),
  hosted on **GitHub Pages** from this repo. No build step preferred; if a
  bundler is used, keep `npm run build` + GitHub Action for Pages deploy.
- **Database**: **a NEW, dedicated Supabase project** (do NOT reuse any
  existing Supabase project — the owner has unrelated projects). Create it
  named `nmpp-trainer`. Free tier is fine.
- **Client ↔ DB**: `@supabase/supabase-js` with the anon/publishable key,
  protected by RLS (see §6).

## 4. Data model

```sql
-- task sets: one row per calendar day per subject
create table task_sets (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  subject text not null check (subject in ('matematika','lietuviu')),
  title text not null,
  items jsonb not null,          -- array of task items, see §5
  phase int not null default 1,  -- 1..3 (prep phases)
  created_at timestamptz default now(),
  unique (scheduled_date, subject)
);

-- one row per completed task set
create table results (
  id uuid primary key default gen_random_uuid(),
  task_set_id uuid references task_sets(id) not null,
  answers jsonb not null,        -- [{item_id, answer, correct|null, seconds}]
  correct_count int not null,
  total_autochecked int not null,
  duration_seconds int not null, -- whole session
  interrupted boolean default false, -- child abandoned mid-way
  submitted_at timestamptz default now()
);
```

Notes:
- `answers[].correct` is `null` for self-marked items (type `open_schema`).
- `interrupted` matters: attention drop-off is a known issue; capture partial
  sessions (autosave answers to `localStorage`, flush on submit or on reload).

## 5. Task item JSON schema

`task_sets.items` is an array. Each item:

```jsonc
{
  "id": "w1-mon-3",
  "type": "quick_math" | "number_input" | "choice" | "compare" | "match" | "open_schema",
  "prompt": "string (Lithuanian)",
  "data": { /* type-specific, below */ },
  "answer": { /* type-specific; omitted for open_schema */ },
  "hint": "optional string shown on demand"
}
```

Type-specific `data` / `answer`:

| type | data | answer | check |
|---|---|---|---|
| `quick_math` | `{ "expr": "2 × 5" }` | `{ "value": 10 }` | auto |
| `number_input` | `{ "text": "..." }` | `{ "value": 21 }` | auto |
| `choice` | `{ "options": ["a","b","c"] }` | `{ "index": 1 }` | auto |
| `compare` | `{ "left": 2340, "right": 2430 }` | `{ "sign": "<" }` | auto (buttons `<` `>` `=`) |
| `match` | `{ "left": ["SUMA",...], "right": ["12 + 4",...] }` | `{ "pairs": [[0,2],...] }` | auto |
| `open_schema` | `{ "text": "story problem", "instruction": "Nupiešk schemą sąsiuvinyje" }` | — | self-marked: child taps „Padariau“, optionally enters numeric answer (auto-checked if `answer.value` present) |

The renderer must ignore unknown `type` values gracefully (render as
`open_schema`-like fallback) so Claude can add new types later without breaking
the page.

## 5.1 Reading passages

New item type `passage` (non-scored):

```jsonc
{ "id": "p1", "type": "passage",
  "data": { "title": "Švyturys", "text": "Full passage text..." } }
```

Renders as a full-card reading step: title, text (max-width ~60ch,
line-height 1.7, generous paragraph spacing; support "\n\n" as paragraph
breaks), one "Toliau" button. Records `{ item_id, answer: null, correct: null,
seconds }` like `open_schema`. Never auto-checked; excluded from
`total_autochecked`.

Any other item may reference a passage:

```jsonc
{ "id": "q1", "type": "choice", "passage_ref": "p1", ... }
```

When an item has `passage_ref`, render the referenced passage in a panel
ABOVE the question, open by default, with a "Suslėpti tekstą / Rodyti
tekstą" toggle. The panel must stay visible while answering (sticky within
the card on tall viewports; simply above the question on small screens). On
mobile (<560px) default to collapsed with the toggle prominent. Passage
lookup: search backwards in the items array for the `passage` item with that
id; if not found, render the question normally (no crash, no panel).

Backward compatibility: unknown-type fallback still applies (old clients
render `passage` as `open_schema`-like). Existing items without `passage_ref`
are unaffected.

## 5.2 Printable worksheets

New item type `printable` (non-scored):

```jsonc
{ "id": "...", "type": "printable", "prompt": "instructions text",
  "data": { "title": "...", "url": "printables/file.html",
            "week_note": "optional short line", "instruction": "..." } }
```

Renders: title, prompt text, `week_note` as a highlighted line, a large
primary button "Atsispausdinti lapą" that opens `data.url` (relative to the
site root) in a new tab, and a "Padariau ✔" button that completes the item.
Non-scored: `answer` null, `correct` null, excluded from `total_autochecked`
(same as `open_schema`).

`data.url` points at a static file committed under `printables/` in this
repo, served alongside the app by GitHub Pages.

## 5.3 Inline SVG on any item

Any item (any `type`) may carry a picture: a clock face, a fraction circle, a
number line, a diagram.

```jsonc
{ "id": "…", "type": "choice", "prompt": "Kiek valandų rodo laikrodis?",
  "data": {
    "options": ["4:30", "5:30", "6:20"],
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">…</svg>",
    "svg_alt": "Laikrodžio ciferblatas su valandine ir minutine rodykle."
  },
  "answer": { "index": 0 } }
```

- `data.svg` — a string of SVG markup, **≤ 4 KB** (4096 bytes UTF-8). Give it a
  `viewBox`; fixed `width`/`height` are dropped so it scales.
- `data.svg_alt` — **required** whenever `svg` is present. Lithuanian, and it
  must describe the picture without giving away the answer (it is the
  `aria-label` a screen reader announces). Without it the SVG is not shown.
- Rendered **above the prompt**, centred, at most **320 px** wide, as
  `role="img"` with `aria-label = svg_alt`; it is not a keyboard stop. The
  item works exactly as before if the SVG is rejected.

**Sanitising** (`svg.js`; the markup is parsed as XML and rebuilt node by node,
never assigned with `innerHTML`). Removed: `<script>`, `<foreignObject>`,
`<iframe>/<object>/<embed>`, `<style>` (use presentation attributes such as
`fill`/`stroke` instead), and SMIL (`<animate>`, `<set>`, …); every `on*`
attribute; every `href` / `xlink:href` whose value is not a same-document
`#fragment`; any attribute value with `javascript:` or a `url(…)` that does not
point at `#id`. Rejected outright (nothing rendered): over 4 KB, not
well-formed XML, root not `<svg>`, or no `svg_alt`. Use only the SVG subset:
shapes, `<path>`, `<text>`, `<g>`, `<defs>`/`<use href="#…">`, gradients.

## 5.4 `letter_hunt` — find every target letter

```jsonc
{ "id": "ap19-1", "type": "letter_hunt",
  "prompt": "Raidžių medžioklė: per 30 s paliesk VISAS raides „h“",
  "data":   { "grid": ["tnntbkkk", "thhtlhld", "…"], "target": "h", "seconds": 30 },
  "answer": { "count": 7 } }
```

- `data.grid` — rows of single letters (any Lithuanian letter; compared
  case-insensitively with `data.target`). `answer.count` is the number of
  target letters in the grid (the sync of rows is the author's job; the item
  ends when every target cell in the grid is found).
- Flow: prompt + „Pradėti“ → the grid appears and a **countdown bar** (no
  numbers) drains over `data.seconds` (default 30). Cells are large evenly
  spaced buttons (Atkinson Hyperlegible, 34 px, ≥ 60 px tall; ≥ 64 px on
  L's page). **A tap toggles a target cell** (green, `aria-pressed`) —
  tapping a found one again un-marks it. A tap on any other letter makes that
  cell shake briefly and counts as a **false tap** (it never turns green;
  `prefers-reduced-motion`: a red outline instead of the shake).
- Ends when all targets are marked or time runs out. Missed targets get a dashed
  outline, a calm result line („Rasta 5 iš 7.“) and „Toliau“. The answer is
  recorded when „Toliau“ is pressed.
- Stored `answer`: `{ found, missed, false_taps, ms }`. `correct = found ==
  answer.count && false_taps <= 1`; stars as usual (correct → 2, else 0 — one
  attempt, no retry).

## 5.5 `letter_flash` — which letter flashed?

```jsonc
{ "type": "letter_flash", "prompt": "Greitai: kuri raidė blykstelėjo — n ar h?",
  "data": { "options": ["n", "h"], "sequence": ["n", "n", "h", "…"], "show_ms": 800 },
  "answer": { "sequence": ["n", "n", "h", "…"] } }
```

- „Pradėti“ → for each letter of `data.sequence`: it is shown alone, large, in the
  middle for `show_ms` (default 800), then disappears and **only then** do two
  big buttons (`data.options`, ≥ 92 px tall) appear; the answer starts the next
  letter after a 300 ms gap. The flashed letter is visual only (`aria-hidden`).
- Stored `answer`: `{ trials: [{ shown, picked, rt_ms }, …], accuracy }`
  (`rt_ms` = from the buttons appearing to the tap; `accuracy` 0–1, 3 decimals).
  `correct = accuracy >= 0.9`; stars as usual. A trial is right when
  `picked == shown`.

## 5.6 `eye_track` — follow the dot, tap on red

```jsonc
{ "type": "eye_track", "prompt": "Akys seka tašką. Kai jis tampa RAUDONAS — paliesk ekraną. Galva nejuda!",
  "data": { "path": "infinity", "duration_s": 40, "changes": 6 },
  "answer": { "hits": 6 } }
```

- `data.path`: `infinity` (a closed figure-of-eight, starts at the centre heading
  right), `wave` (two periods) or `zigzag` (six segments); the last two run
  **left → right** and the dot fades out at the right edge and reappears at the
  left. An unknown name falls back to `wave`. A faint guide line is drawn.
- „Pradėti“ → the dot moves at constant speed, **~6 s per lap**
  (`prefers-reduced-motion`: speed **halved**, 12 s). The text „Galva nejuda!“
  shows **once**, for the first ~3.5 s.
- At `data.changes` random moments (≥ 3 s apart, first one not before 3 s, the
  last early enough for its full red phase) the dot turns **red for 1.2 s** (a red
  ring appears too, so colour is not the only cue). The child taps anywhere on the
  card. A tap counts as a hit if it lands while the dot is red or ≤ 350 ms after
  (reaction time); one tap is never used for two moments; any other tap is a
  **false tap**. Red moments run on timers, not animation frames, so a slow
  frame cannot move them.
- Stored `answer`: `{ hits, misses, false_taps, rt_ms: [...] }` (rt from onset to
  tap, hits only). `correct = hits >= changes - 1`; stars as usual.

## 5.7 `line_find` — find a number in a table

```jsonc
{ "type": "line_find", "prompt": "Rask 3-oje eilutėje 4-ą skaičių ir paliesk jį. Vesk pirštu!",
  "data": { "rows": [[80, 47, 90, 89, 56, 83, 34], […]], "row": 3, "col": 4 },
  "answer": { "value": 68 } }
```

- `data.row` / `data.col` are **1-based** (`rows[row-1][col-1]` must equal
  `answer.value`). The table is rendered **without any row/column labels** (the
  prompt names the place), with generous line spacing; cells ≥ 60 px (≥ 64 px
  on L's page). Row groups carry an `aria-label` („Eilutė 3“) for screen
  readers only.
- The child taps one cell (single selection) and presses „Toliau“ — the same
  one-attempt-then-retry flow as `choice` (max 4 attempts, `attempts` /
  `first_answer` kept, no think-lock). A wrong pick shows „Dar kartą. Vesk
  pirštu per eilutę.“; after the 4th the correct cell is outlined and „Teisingas
  atsakymas“ shown.
- Stored `answer`: `{ picked_row, picked_col, ms }` (1-based; `ms` from render
  to that press). `correct` = the picked cell is (row, col); stars as usual
  (1st attempt 2 ⭐, a later attempt 1 ⭐, 0 ⭐ if all 4 attempts are used).

## 5.8 `trace` — trace a path with a finger

```jsonc
{ "type": "trace", "prompt": "Apvesk pirštu figūrą neatitraukdamas — iš kairės į dešinę, lėtai",
  "data": { "path": "wave", "laps": 3 }, "answer": null }
```

- `data.path`: `infinity` or `wave` (`zigzag` also works). The path is drawn as a
  thick light guide with a green start dot; the finger's stroke is drawn on top.
  The drawing surface sets `touch-action: none`, so the page does not scroll.
- Laps are counted by forward progress along the path (all strokes together;
  a lap counts once ~90 % of it is traced, because a finger never starts or ends
  exactly on the end of the path); „Ratų: n iš N“. After `laps` laps the item ends by itself („Puiku!“); „Baigiau“
  ends it earlier (enabled after the first stroke).
- **Non-scored**: `correct` is `null` (excluded from `total_autochecked`, 0 ⭐,
  like `open_schema`). Stored `answer`: `{ mean_deviation_px, max_deviation_px,
  ms, lifted_count, laps_done }` — deviation = distance of every sampled finger
  position from the path, in screen px; `ms` = first touch → end;
  `lifted_count` = finger lifts.

**All five** are available on both learners' pages (every other item type works
the same way on either); an unknown `type` still falls back to `open_schema`.

## 6. Security / RLS

Single-family app, no auth, but the anon key is public in the page source:

- `task_sets`: anon may `select` only rows with
  `scheduled_date <= current_date + 1` (no peeking far ahead, allows timezone slack).
  No insert/update/delete for anon.
- `results`: anon may `insert` only, and only the columns the page sends
  (column-level grant: `task_set_id, answers, correct_count, total_autochecked,
  duration_seconds, interrupted, learner, submitted_at`) — never
  `chest_reward`, `stars_credited` or `stars_multiplier` (§7.4). No
  select/update/delete for anon.
- `progress`: anon may `select` only. Writes only happen through the
  `record_progress` RPC (see §7.1), never directly.
- `weekly_stats()` (§7.2) is executable by anon but returns aggregates only.
- All writes of `task_sets` and reads of `results` happen through the Supabase
  MCP / dashboard (service role) — i.e., by parent/Claude, never by the page.

## 7. UI requirements (important — the child has handwriting and visual-motor difficulties)

- Font: **Atkinson Hyperlegible** (Google Fonts), base size ≥ 17 px, generous
  line-height and spacing.
- Visual style: white paper with a light 24 px squared-notebook grid background,
  ink `#21242b`, single accent `#1d5fad` (school-ink blue). Matches existing
  printed materials.
- **One primary button per item: „Toliau“** (no separate check/next pair).
  Auto-checked items (`quick_math`, `number_input`, `choice`, `compare`,
  `match`): pressing it checks the answer. Correct → praise flash and
  advance at once. Wrong → the anti-guessing retry flow in §7.3 (up to 4
  attempts, no answer reveal until the 4th). It stays disabled until there
  is something to check (a typed value, a selected option, all pairs made);
  Enter on an empty numeric field shows „Įrašyk atsakymą“ and never records
  anything. Self-marked items (`open_schema`, `printable`) keep their single
  „Padariau ✔“ and `passage` its single „Toliau“, which advance directly.
  Enter = the item's primary button.
- **One task visible at a time**, progress shown as
  `3 / 7` plus a thin progress bar. Minimal decoration overall — the only
  animation/sound is the brief, optional reward feedback in §7.1.
- First and last items of a set should be easy (the parent/Claude curates this;
  the app just renders in array order — do not shuffle).
- A visible but calm elapsed-time indicator (no countdown pressure), used to
  fill `duration_seconds` and per-item `seconds`.
- End screen: star + „Šiandien — atlikta!“ + correct count for auto-checked
  items. No red X-marks during solving; a wrong auto-checked answer follows
  the anti-guessing retry flow (§7.3) — up to 4 attempts before the answer
  is ever shown, then move on and record as incorrect.
- Responsive: must work on a tablet and a laptop.

### Lithuanian UI strings

- Loading: `Kraunama…`
- No tasks today: `Šiandien užduočių nėra. Laisva diena! 🎉`
- Next: `Toliau`
- Retry prompt (`word_gap`/`syllable_build`, §13.4): `Pabandyk dar kartą`
- Retry prompt (§7.3 — quick_math/number_input/choice/compare/match), H: `Dar kartą. Skaičiuok sąsiuvinyje.`
- Retry prompt (§7.3), L — same mechanic, reading-appropriate wording (only `choice` is reachable on her page): `Dar kartą. Paskaityk tekstą.`
- Empty answer nudge: `Įrašyk atsakymą`
- Revealed answer (§7.3): `Teisingas atsakymas: {answer}`
- Self-mark done: `Padariau ✔`
- Hint: `Užuomina`
- Finish screen: `Šiandien — atlikta!` / `Teisingai: {n} iš {m}`
- Compare buttons: `<` `>` `=`

## 7.1 Rewards

Light gamification, kept calm and non-punishing — nothing here changes how
an item is checked or scored; it only adds positive feedback on top.

**Per-answer praise.** When an auto-checked or self-marked item is recorded
correct, show a brief green check + one random short Lithuanian praise word
(`Puiku!`, `Taip!`, `Šaunu!`, `Tiksliai!`) for ~800ms. No sound unless the
header sound toggle is on (see **Sound** below).
Stars per item: first-try correct → 2 ⭐, correct on any later retry → 1 ⭐
(how many retries an item allows before giving up depends on its type —
§7.3 for the five anti-guessing types, §13.4 for L's own types).
Wrong answers never show a star count or a 0 — same "no harsh feedback"
rule as everywhere else in the app.

**End screen.** Adds, alongside the existing star + „Šiandien — atlikta!“ +
`Teisingai: {n} iš {m}`:
- total ⭐ earned in this set,
- a short CSS-only confetti burst (≤1.5s, skipped under
  `prefers-reduced-motion: reduce`),
- a streak line `🔥 {n} dienos iš eilės` — consecutive *scheduled* days
  (i.e. days that had a `task_sets` row) with at least one completed set,
  walking back from today; today counts only once it is done (an unfinished
  today is skipped, so finishing a missed day via `?date=` first keeps the
  streak); a day with no task_set at all is simply skipped, not counted as a
  break,
- any badge newly earned in this set (see below).

**Persistent progress.** A single-row `progress` table holds lifetime
`total_stars`, `streak`, and `badges` (jsonb array of badge keys). Anon may
only `select` it — the only way to change it is the
`record_progress(set_id uuid)` RPC, called once per completed set right
after the `results` insert. The RPC is `security definer` so it can read
`results`/write `progress` despite anon's normal RLS, and it recomputes
*everything* from the saved `results` row: stars are clamped per answer (a
correct answer is worth 1 or 2, anything else 0, whatever the client wrote),
the streak and badge thresholds are recomputed server-side, and
`results.stars_credited` stops a second call for the same set from
crediting twice. It returns `total_stars`, `streak`, `badges`,
`new_badges` (earned by this call) and `set_stars` (credited for this set).
`add_stars(set_id, stars)` remains as a thin wrapper for older clients (the
stars argument is ignored). "Today" is Vilnius-local. A small header badge
`⭐ 142` (the lifetime total) shows on every page load, updated in place
after each completion. The end screen shows the set's stars, the running
total (`Iš viso: ⭐ N`), the streak line, any new badges, and the confetti.

A set earns stars once: the first completed (non-interrupted) result that `record_progress` credits pays out, and a replay of the same set earns 0 stars, no chest and no „Dviguba diena“ multiplier (the end screen says the stars were already counted); past extra stars are not taken back.

**Badges** (Lithuanian names, simple emoji, stored by key in
`progress.badges`, shown once on the end screen the set they're first
earned):

| key | name | condition |
|---|---|---|
| `pirma_savaite` | 🌟 Pirma savaitė | 5 completed sets, lifetime |
| `daugybos_meistras` | 🧮 Daugybos meistras | 20 correct `quick_math` answers, each under 5s, lifetime |
| `be_klaidu` | 🎯 Be klaidų | any one set with 100% of its auto-checked items correct |
| `savaites_ugnis` | 🔥 Savaitės ugnis | streak reaches 5 |

**Sound.** Off by default; a small toggle in the header persists the
preference to `localStorage`. When on: a softer single tick on each correct
answer, and on set completion a short chime — two ascending notes
(C5 → G5), ~400ms. Both are generated with the Web Audio API (no audio
file, nothing bundled). Browsers only allow audio that starts from a user
gesture, so one shared `AudioContext` is created/resumed on the child's own
taps and keypresses (and turning the toggle on plays a confirming tick);
the completion chime fires after the async save, which is why the context
must already be running by then.

**Celebrate link.** The end screen has a „🎵 Švęsk su Scoop“ button that
opens a YouTube Music *search* URL in a new tab. It is a plain outbound
link — no copyrighted audio is embedded or bundled.

## 7.2 Weekly stats (Saturday end screen)

`weekly_stats()` is a `security definer` RPC (anon may execute it) that
returns **aggregates only** for the last 7 Vilnius-local days — never raw
answers, item ids or per-item data. It counts completed (`interrupted =
false`) sets whose `scheduled_date` falls in the window, and only
auto-checked answers (`correct` is a boolean) count as "items". It returns
one jsonb object:

| key | meaning |
|---|---|
| `sets_completed` | completed sets in the window |
| `total_items`, `correct_items`, `accuracy_pct` | auto-checked items, how many were right, rounded % (null if none) |
| `avg_seconds_per_item` | mean seconds over those items |
| `stars_earned` | stars in the window, clamped like §7.1 (1–2 per correct answer) |
| `best_day` | `{date, dow, accuracy_pct, total}` — highest accuracy (ties: more items) |
| `fastest_day` | `{date, dow, avg_seconds}` — lowest mean seconds per item, preferring days with ≥5 items |
| `by_type` | `[{type, total, correct, accuracy_pct}]`, most items first |
| `by_day` | `[{date, dow, total, correct, accuracy_pct, avg_seconds}]`, `dow` is ISO 1=Mon…7=Sun |

**Card.** When the completed set's `scheduled_date` is a Saturday, the end
screen also shows a „Tavo savaitė“ card (fetched alongside
`record_progress`; if it fails or there is no data, the card is simply
omitted). Child-friendly Lithuanian, e.g. `Išsprendei 112 užduočių`,
`Teisingai — 81 %`, `Greičiausia diena — trečiadienis` (merged with
`Tiksliausia diena` when they are the same day), average seconds per item,
the week's stars, and accuracy per item type. Plus a plain inline-SVG bar
chart (no library) of items solved per day, one bar per school day
**Pr–Še** (Mon–Sat, six bars), with `role="img"` and an `aria-label` that
spells out the numbers. Noun forms follow Lithuanian number agreement
(1 užduotį / 2–9 užduotis / 10–19, 20… užduočių).

## 7.3 Anti-guessing retry flow

Applies to `quick_math`, `number_input`, `choice`, `compare`, `match` only
(for either learner — these five are shared code, so this also governs
`choice` when it's used as a reading-comprehension question on
`/l/uzduotys/`). `open_schema`, `passage`, `printable` are unaffected, and so
are L's own item types `syllable_build`/`word_gap`/`read_aloud`
(§13.4), which keep the older one-retry flow (§7, `submitAttempt`)
unchanged. Still one button, „Toliau“.

**Think time.** For `number_input`, `quick_math` and `compare` only,
„Toliau“ is disabled for 6s after the item renders — a thin progress line
under the button fills over that time, no countdown numbers. `choice` and
`match` have no delay.

**Up to 4 attempts.** A wrong answer stays on the item: the input is
cleared / the selection or pairing is reset (the correct answer is never
revealed early), and a retry line shows below — „Dar kartą. Skaičiuok
sąsiuvinyje.“ on H's page, „Dar kartą. Paskaityk tekstą.“ on
L's (only `choice` is reachable there, so the math-flavored wording
never applies to her reading-comprehension questions; same mechanic,
just `SCORED_RETRY_MSG` keyed off `LEARNER`). Locked types re-apply the
6s think-lock before the next attempt can be submitted. Only after the
4th wrong attempt does the item show
„Teisingas atsakymas: {the correct answer}“ plus `hint` (if the item has
one) as a one-line explanation, and „Toliau“ unlocks immediately — one more
press just advances, it doesn't check anything further.

**Adaptive lock (H's page only).** The 6 s lock above is the *default*.
While nothing in the current set has gone wrong on a first attempt, a fresh
`quick_math` / `number_input` / `compare` item has **no lock** (0 s: no bar, the
button works as soon as there is an answer). From the first wrong first attempt
in the set, **every remaining item** gets the full 6 s with the same bar. A
retry after a wrong attempt always re-locks for 6 s, exactly as before, and the
4-attempt flow and the `rushed` flag are untouched. The state is derived from
the answers already saved for the set (`correct === false` or `attempts > 1`),
so reloading the page mid-set keeps it. L's page is unchanged: always 6 s.

**Scoring.** Correct on attempt 1 → 2 ⭐ (unchanged from §7.1). Correct on
attempts 2–4 → 1 ⭐. Never correct within 4 attempts → 0 ⭐, not shown
(same "no harsh feedback" rule as everywhere else), and the item doesn't
count toward `correct_count`.

**Recorded per item**, alongside the existing `item_id`/`answer`/`correct`/
`seconds`/`stars` (§4/§7.1): `attempts` (1–4, how many real checks it took)
and `first_answer` (the shape returned by the item's own `evaluate()` —
e.g. `{value: 5}`, `{index: 1}`, `{pairs: [...]}` — whatever was submitted
on attempt 1, even though `answer` itself always ends up holding the
*final* submission). Additionally, `rushed: true` is set when the first
attempt arrived under 4s after the item rendered *and* was wrong — a quiet
signal for the weekly feedback loop, never shown to the child. (In
practice this can only fire on `choice`/`match`, since the three locked
types can't submit before 6s.) No schema change: these are just additional
keys inside the existing `answers[]` jsonb.

## 7.4 Treasure chest & avatar

**Avatar.** H's emoji is 👽: it prefixes H's label in the header
switcher (on both pages: `👽 H`, `💍 L`) and replaces the ⭐ above „Šiandien — atlikta!“ on
his end screen. L's emoji is 💍 (her own pick), used the same way on her
switcher label and end screen. The `⭐ n` stars badge is the currency
and is unchanged for both.

**Chest.** Both learners get one treasure chest after a completed set
(shown after the final item, before the stats/end screen). It is not shown
for interrupted sets (the abandoned-session flush never calls
`record_progress`, and the RPC skips a chest for `interrupted = true`), nor
for a set that already got one — `record_progress` rolls a chest only if no
other `results` row for that `task_set_id` has `chest_reward`, so replaying a
rewarded set gives nothing.

- **UI.** „Rinkis skrynią!“, a large closed chest (inline SVG, no external
  image) and three buttons „1“ „2“ „3“ (88×72px, keyboard reachable; focus
  starts on the title so a held Enter can't open one). Tapping one calls
  `open_chest`; the lid opens (CSS, disabled under `prefers-reduced-motion`),
  the existing `playChime()` plays (still gated by the sound toggle), the title
  becomes „Atidaryta!“ and the reward is shown, then „Toliau“ leads to the
  normal end screen with a „🎁 Skrynia: …“ line and the updated total. If the
  RPC fails the child can retry, or „Praleisti“ (the chest stays unopened
  server-side).
- **Rewards (weights).** `+1 ⭐` 50 %, `+3 ⭐` 30 %, `+5 ⭐` 12 %, „Dviguba diena“
  8 % (the next scheduled day's sets earn 2× stars; text „Dviguba diena rytoj“,
  or „Dviguba diena pirmadienį“ when the next day isn't tomorrow — no Sunday
  sets). The ×2 applies to the stars of the answers in the sets scheduled that
  day (shown as „⭐ +6 · Dviguba diena ×2“), not to chest stars.
- **Rolled at completion, not at the tap.** `record_progress` pre-rolls three
  rewards from `md5(result id || ':' || slot)` and stores
  `results.chest_reward = {"rolls":[r1,r2,r3]}`. Button N always opens roll N,
  so the choice is real but cannot change the outcome, and a refresh cannot
  re-roll. The client only learns what is inside when it opens it.
- **Writes only via RPC.** `open_chest(p_set_id, p_pick)` (security definer)
  records `pick`/`reward`/`opened_at` in `chest_reward`, then credits
  `progress.total_stars` or sets `progress.double_on` to the next non-Sunday
  date. It is idempotent: a repeat call (double-tap, retry) returns the
  stored reward and pays nothing more. `anon` has **no INSERT grant** on
  `results.chest_reward`, `stars_credited` or `stars_multiplier`
  (column-level grants, §6), so the client can't write a reward itself.
- **Reload.** After the final item the page stores
  `nmpp:chest:{learner}` = set id; if the page is reloaded before the chest is
  opened, `chest_ready(set_id)` says it is still unopened and the same chest
  is shown again (then a short finish screen). Opening clears the marker.
- **Stats.** `weekly_stats().stars_earned` = answer stars × the day's
  multiplier (`results.stars_multiplier`) + opened-chest stars.

## 8. Pages / routes

- `/` (index.html): today's task sets (usually one). If both subjects exist for
  today, show subject picker first.
  - `?date=YYYY-MM-DD` (also on `/l/uzduotys/`) opens that day's set(s) instead of
    today's — a catch-up for a missed day. A date before today shows a small
    „Praleista diena: {date}“ banner; today's date, a future date or anything
    that isn't a real calendar date behaves like no parameter (RLS still hides
    sets beyond tomorrow). Results are written normally (`task_set_id` links
    them to that day's set, so stars, streak and the §7.4 chest all apply). A
    catch-up load does not flush today's unfinished session as interrupted and
    leaves a pending chest alone. The timetable pages (`/h`, `/l`) pass each
    weekday's date to their „Atidaryti užduotis →“ link.
- `/results.html` (optional, nice-to-have): parent view, reads via pasted
  service key kept only in memory — SKIP if RLS makes this awkward; parent can
  use Claude chat instead.

### 8.1 Weekly status on the timetables

`/h` and `/l` show, for each weekday of the current week, whether that day's
trainer set was done: a mark on the day tab (✓ / ✗ / ◐) and a chip next to the
NMPP tag on the task card („✓ Atlikta“, „Praleista“, „Nebaigta“) — never colour
alone. The pages have no results access, so they call the read-only
`week_status(learner)` RPC, which returns only `{date,total,done,correct,scored}`
per day (14 days back to tomorrow; `done` = sets with a non-interrupted result,
`correct`/`scored` = `correct_count`/`total_autochecked` of each set's first
completed result).
Client rules: all sets done → done; a **past** day with none done → missed
(some done → unfinished); today's and future days get no mark until done —
today is never „missed“. A past day whose timetable has a trainer task but
**no set in the database** counts as missed too (it can't have been done); it
has no button, since there is nothing to open. A missed card turns light red
with a red NMPP tag; a missed day that does have a set keeps its „Atidaryti
užduotis →“ link, which opens the catch-up (§8). If
`config.js` or the request fails the pages simply show no status.

A **done** card turns light green with a green NMPP tag, and the „Atidaryti
užduotis →“ button is replaced by „Rezultatas: 15/16“ (omitted for sets with
nothing auto-checked, e.g. a printable — the card is just green). Unfinished
cards stay yellow with „Nebaigta“ and keep the button.

### 8.2 Cache busting and the version string

A tablet kept serving an old `app.js` for days, so every deploy stamps a
version into the site:

- `.github/workflows/deploy.yml` runs `scripts/stamp-version.py <commit sha>`
  after `config.js` is generated. It appends `?v=<7-char sha>` to **every local
  `<script src>` and `<link rel="stylesheet">`** in every `.html` (CDN/font URLs
  untouched), writes the sha into each page's footer (`data-html-version`) and
  into `app.js` (`APP_VERSION`), and **fails the deploy** if any local asset was
  left unstamped or a constant was not replaced. Sources keep the placeholder
  `__APP_VERSION__`, which shows as „dev“ when served locally.
- Both trainer pages carry `<meta http-equiv="Cache-Control" content="no-cache">`.
  Browsers largely ignore that for plain files, so the `?v=` URL is the real fix;
  GitHub Pages sets its own `Cache-Control` on the HTML (≈10 min), after which a
  stale page re-fetches and picks up the new `?v=` assets.
- The footer reads „Versija abc1234“ — the version of the **`app.js` that is
  actually running**. If an old script is served next to a new page it reads
  „Versija abc1234 (puslapis def5678) — perkrauk puslapį“.

## 9. Repo layout & deliverables

```
/
├── index.html
├── app.js
├── styles.css
├── config.js            # SUPABASE_URL + anon key (gitignored template: config.example.js)
├── supabase/
│   └── schema.sql       # tables + RLS policies from §4/§6
├── seed/
│   └── week1.sql        # INSERT of week-1 task_sets (see §10)
├── SPEC.md              # this file
└── README.md            # setup: create Supabase project, run schema.sql, fill config.js, enable GitHub Pages
```

Claude Code should:
1. Scaffold the repo per above.
2. Create the new Supabase project `nmpp-trainer` (via Supabase MCP or CLI),
   apply `schema.sql`, apply RLS.
3. Insert seed week (§10), fill `config.js`, verify end-to-end locally.
4. Set up GitHub Pages deployment.

## 10. Seed content (week 1, Monday, matematika)

Use this as `task_sets` row (`scheduled_date` = next Monday, `subject` =
`matematika`, `phase` = 1, `title` = `Skaičiaus sandara`):

Items (order matters — easy start, strength-based end):
1. `quick_math` ×6: `2×5`, `10×3`, `5×4`, `2×9`, `10×7`, `5×6`.
2. `number_input` ×4 „skaitmenų namai“: e.g. `Kiek ŠIMTŲ skaičiuje 3 507?` → 5;
   `Kiek DEŠIMČIŲ skaičiuje 4 070?` → 7; `Kiek TŪKSTANČIŲ skaičiuje 6 005?` → 6;
   `Kiek VIENETŲ skaičiuje 999?` → 9.
3. `compare` ×4: `2340 ? 2430`, `5067 ? 5607`, `8990 ? 9089`, `4004 ? 4040`.
4. `match` ×1: SUMA/SKIRTUMAS/SANDAUGA/DALMUO ↔ `12 + 4` / `12 − 4` / `3 × 6` / `18 : 3`.
5. `open_schema` ×1: `Laive plaukė 24 keleiviai. Audrų saloje išlipo 8, o įlipo 5 nauji. Kiek keleivių plaukia toliau?` with `answer.value` = 21 and instruction to draw a schema in the notebook first.

## 11. The Claude feedback loop (document in README)

Weekly, in Claude chat (Supabase MCP connected):
1. Claude reads last week's `results` joined with `task_sets`.
2. Produces insights: accuracy by item type/topic, time per item, interrupted
   sessions (attention), retry patterns.
3. Generates next week's `task_sets` rows (JSON per §5) and inserts them.

Design consequence: **the items JSON contract in §5 is the API** — keep it
stable and versionless-tolerant (unknown fields ignored).

## 12. Acceptance checklist

- [ ] Opening the page on a day with a seeded task set shows tasks one-by-one, in order.
- [ ] Wrong answer on `quick_math`/`number_input`/`choice`/`compare`/`match`
      → up to 4 attempts, answer never revealed early, no harsh feedback;
      exhausted → reveals the correct answer + hint and records incorrect
      (§7.3). `open_schema`/`passage`/`printable`/L's own types (§13.4)
      unaffected.
- [ ] Submitting writes one `results` row with per-item seconds and total duration.
- [ ] Reload mid-session restores progress (localStorage autosave).
- [ ] Anon key cannot read `results` or future (`> tomorrow`) `task_sets` (test via curl).
- [ ] A `task_sets` row inserted via SQL with a new/unknown item type does not crash the page.
- [ ] Lighthouse accessibility ≥ 95 on index.

## 13. L reading trainer

A second learner: L, age 7, 2nd grade, works on iPad (mostly alone).
Focus areas: blending syllables into words, and reading comprehension —
distinct from H's NMPP maths/language prep, sharing the same app and
database.

### 13.1 Data model

`task_sets` and `results` both gain:

```sql
learner text not null default 'h' check (learner in ('h','l'))
```

`task_sets`'s uniqueness moves from `(scheduled_date, subject)` to
`(scheduled_date, subject, learner)` — each learner can have their own row
for the same day/subject (L's reading sets use `subject = 'lietuviu'`,
same as H's language-prep days; the two no longer collide).

`progress` (§7.1) moves from a single fixed row (`id = 1`) to one row per
learner: `progress.learner text primary key` in place of `id`. Stars,
streak and badges are entirely independent per learner —
`record_progress(set_id)` derives the learner from the set's `task_sets`
row (never trusted from the client) and scopes every computation
(streak walk, `pirma_savaite`/`daugybos_meistras`/`be_klaidu`/
`savaites_ugnis` badge conditions) to that learner.

**RLS is unchanged.** Neither existing policy discriminates on `learner`:
`task_sets` read and `results` insert were already open to anon subject to
their existing predicates, which don't mention `learner`; `progress` read
was already `using (true)`, which covers both learners' rows. The page
itself filters by learner client-side (`.eq('learner', ...)`); `learner`
is not a security boundary, `scheduled_date` still is.

### 13.2 Page

`/l/uzduotys/` (`l/uzduotys/index.html`) — same shell/behavior as `/` (today's task
sets, one item at a time, localStorage autosave, abandoned-session flush),
scoped to `learner = 'l'`. Both `/` and `/l/uzduotys/` load the same
`app.js`; the page sets `window.NMPP_LEARNER = "l"` before it loads
(default `"h"` if unset, so `/` needs no change beyond the header
switcher below).

UI differences from `/` (`body.learner-l` in styles.css):
- Base font 22px; reading text (prompts, passages, word tiles) 26px.
- All buttons/tiles ≥ 64px tall.
- One item per screen (already true of `/`).
- The elapsed-time clock in the topbar is hidden (`#timer` stays `hidden`
  in the markup) — L's page shows no timer at all; `read_aloud` times
  her reading silently, word by word (§13.4).
- Praise flashes and end-screen stars/streak/badges/confetti: identical
  mechanism to H (§7.1), just scoped to her `progress` row.
- A header switcher (same pattern as the `/h` ↔ `/l` timetable pages):
  `H` / `L` links between `/` and `/l/uzduotys/`, current page marked
  with `aria-current="page"`.

### 13.3 Text-to-speech

`window.speechSynthesis`, Lithuanian only, L's page only (H never
gets TTS buttons). At boot, the page waits (up to ~1.2s, via the
`voiceschanged` event) for the voice list and picks a voice whose `lang`
starts with `lt`. If none is found, every 🔊 button across all item types is
simply not rendered — no broken/disabled buttons. When available: rate
`0.8`, `lang: "lt-LT"`, one shared utterance queue (`speechSynthesis.cancel()`
before each new one, so rapid taps don't queue up speech).

### 13.4 New item types

Renderer fallback rule from §5 still applies (unknown `type` → `open_schema`-
like), so these are additive.

**`syllable_build`** (auto-checked):

```jsonc
{ "type": "syllable_build",
  "data": { "syllables": ["ka","ma","ra"], "target": "kamara" },
  "answer": { "word": "kamara" } }
```

Syllable tiles rendered in shuffled order; tapping a tile appends it to a
word slot above (and disables that tile — each tile is a distinct instance,
so a repeated syllable has one tile per occurrence) and speaks it aloud
if TTS is available; tapping the slot removes the most recently added
syllable and re-enables its tile. "Toliau" checks the assembled word against
`answer.word` (enabled once at least one syllable is placed), using the same
one-retry flow as every other auto-checked type (§7). Recorded answer:
`{ word, attempts, errors }` — `attempts` counts tile placements/removals, a
rough measure of how much trial-and-error the blend took; `errors` counts
only the tile taps that put a syllable in a **wrong position** (not total
taps), so accuracy can be read off it. `data.syllables` is *not* assumed to
be in word order (real sets list them pre-scrambled), so the right syllable
for a position is derived from `target`: a tap is correct if some ordering of
the syllables that spells `target` has that syllable there. Each tap is judged
on its own — one misplaced tile doesn't turn every later tap into an error —
and the count accumulates across the item's retry. (If the syllables can't
spell `target` at all — an authoring slip — it falls back to "does the word
so far still start like `target`".)

**`read_aloud`** (non-scored — like `passage`/`open_schema`, `correct` is
always `null`, excluded from `total_autochecked`):

```jsonc
{ "type": "read_aloud",
  "data": { "title": "Katė ir pienas",
            "text": "Katė gėrė pieną. Ji buvo laiminga. ...",
            "syllables": "Ka-tė gė-rė pie-ną. Ji bu-vo lai-min-ga. ...",
            "day": 1 } }
```

Flow:
1. Tap-to-advance reading. Title, then `data.syllables` rendered as word tiles
   (hyphens stripped for the visible text; syllables alternate between the
   app's two brand colors, reset per word; the header toggle „Paprastas
   tekstas“ switches to plain text). At 26px+ the **current word** is
   highlighted (yellow tile with an ink outline, high contrast), starting with
   word 1. The big button reads „Pradėti“ at first and „Toliau“ after.
   - The first tap (on the text or the button) only starts the clock — the
     child then reads word 1 aloud.
   - Every later tap, anywhere on the text or on „Toliau“ (Enter works too),
     marks the current word read and moves to the next. One tap = one word;
     there is no way to skip ahead (taps within 250 ms of the previous one
     are ignored, and a held key does not repeat). Tapping after the last
     word ends the reading.
   - **The clock runs from the first tap to the last word's tap.** There is
     no visible stopwatch (§13.2's no-timer rule now has no exception — only
     a „3 / 18“ position counter) and no minimum-time lock.
2. Review screen, shown together: the same word tiles (still visible; words
   flagged slow get a dotted underline), „Ar buvo sunku?“ with three large
   buttons (`Lengva` / `Vidutiniškai` / `Sunku`), and a „Tėvai: pažymėti
   klaidas“ toggle — when on, each word tile becomes tappable (toggles a red
   underline). Tapping a difficulty button records the answer and advances
   (mark errors first, rate last). The manual `error_words` step is
   unchanged.

Recorded: inside `answer` — `{ seconds, word_count, words_per_minute,
self_rating, error_words }` — and, on the answer *entry* itself (alongside
`item_id`/`answer`/`seconds`/`stars`, the same place as §7.3's extras):

| key | meaning |
|---|---|
| `word_times` | `[ms, …]` — time spent on each word, in text order (`word_count` entries); consecutive taps' differences, first tap → word 1 done, … → last word done |
| `slow_words` | unique words whose time was **more than 2× the median** of this read's `word_times` — computed automatically, shown to the parent as a dotted underline, separate from the parent's `error_words` |
| `rushed` | `true` only if the read averaged under 300 ms per word (a tap-through without reading); excluded from the weekly WPM average (§13.5) |

`seconds` (inside `answer`) is the reading time = `sum(word_times)` rounded to
whole seconds — the first-tap→last-word span, distinct from the generic
per-item `seconds` §4 records for every item type (which spans the whole item
including the review screen). `word_count` is the number of word tiles;
`words_per_minute` = `round(word_count / (sum(word_times) / 60000))`;
`self_rating` one of `lengva` / `vidutiniskai` / `sunku`; `error_words` the
parent-tapped words (empty array if the toggle was never used).

**Tap-through guard.** `rushed` is not a lock — nothing waits or is disabled;
it is only a data-quality flag so a child who taps straight through (a 200+
wpm "read") doesn't pollute the weekly WPM. The parent-marked `error_words`
and the `slow_words` of such a read are still stored.

**`word_gap`** (auto-checked, same shape/check as `choice`):

```jsonc
{ "type": "word_gap",
  "data": { "sentence": "Katė guli ant ___.", "options": ["stalo","stalas","stalą"] },
  "answer": { "index": 0 } }
```

Renders like `choice` (big option buttons, one-retry flow) with the
sentence as prompt and a 🔊 button beside it.

**`choice` after `read_aloud`**: the existing `passage_ref` mechanism (§5.1)
now also matches a preceding `read_aloud` item (by `id`), not just `passage`
— the referenced item's plain `data.text` (not the syllable markup) shows in
the same collapsible panel above the question. These comprehension
questions also get a 🔊 button on the question text (L's page only,
gated on TTS availability like every other 🔊 button).

### 13.5 `weekly_stats(learner)`

`weekly_stats()` → `weekly_stats(p_learner text default 'h')` — old
callers passing nothing still get H's stats. Every existing field is
now scoped to that learner. New fields (cheap to compute for anyone, just
empty for a learner with no matching item types):

| key | meaning |
|---|---|
| `avg_wpm_by_day` | `[{date, dow, avg_wpm}]` — mean `read_aloud` words/minute per day, **excluding** entries flagged `rushed` (§13.4); a day with only rushed reads has no entry |
| `syllable_build_accuracy_pct` | accuracy on `syllable_build` items in the window (from `by_type`) |
| `comprehension_accuracy_pct` | accuracy on `choice` items in the window (from `by_type`) |
| `top_error_words` | `[{word, count}]`, top 10, from `read_aloud.error_words[]` |

### 13.6 Seed content

One example set for testing on iPad: `seed/l-day1.sql`, `scheduled_date`
= the day it was applied, `subject = 'lietuviu'`, `learner = 'l'`,
`phase = 1`. 3× `syllable_build` (lapas/saulė/pienas), 1× `read_aloud`
("Katė ir pienas"), 2× `choice` comprehension questions with `passage_ref`
to the read_aloud item, 1× `word_gap` (the sentence from §5's own example).

### 13.7 Acceptance

- [x] `learner` column added to `task_sets`/`results`; `progress` is one row
      per learner; RLS policies unchanged.
- [x] `record_progress`/`weekly_stats` scoped per learner.
- [x] `/l/uzduotys/` renders today's L task set, one item at a time.
- [x] `syllable_build`, `read_aloud`, `word_gap` implemented per §13.4.
- [x] 🔊 buttons use `lt-LT` TTS, rate 0.8, hidden with no LT voice.
- [x] Header switcher on `/` and `/l/uzduotys/`.
- [x] Seed set applied for today; verified end-to-end.
- [x] Lighthouse accessibility ≥ 95 on `/l/uzduotys/` (100/100, and `/` unaffected — also 100/100).
