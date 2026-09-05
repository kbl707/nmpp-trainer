# SPEC: NMPP Daily Trainer

A tiny web app for daily exam-prep tasks for a 4th grader (agurkas128) preparing for
the Lithuanian NMPP assessment (March 2027). Parent (parent) and Claude generate
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

## 6. Security / RLS

Single-family app, no auth, but the anon key is public in the page source:

- `task_sets`: anon may `select` only rows with
  `scheduled_date <= current_date + 1` (no peeking far ahead, allows timezone slack).
  No insert/update/delete for anon.
- `results`: anon may `insert` only. No select/update/delete for anon.
- All writes of `task_sets` and reads of `results` happen through the Supabase
  MCP / dashboard (service role) — i.e., by parent/Claude, never by the page.

## 7. UI requirements (important — child has optical dysgraphia)

- Font: **Atkinson Hyperlegible** (Google Fonts), base size ≥ 17 px, generous
  line-height and spacing.
- Visual style: white paper with a light 24 px squared-notebook grid background,
  ink `#21242b`, single accent `#1d5fad` (school-ink blue). Matches existing
  printed materials.
- **One task visible at a time**, big „Toliau“ button; progress shown as
  `3 / 7` plus a thin progress bar. Minimal decoration, no animations, no sound.
- First and last items of a set should be easy (the parent/Claude curates this;
  the app just renders in array order — do not shuffle).
- A visible but calm elapsed-time indicator (no countdown pressure), used to
  fill `duration_seconds` and per-item `seconds`.
- End screen: star + „Šiandien — atlikta!“ + correct count for auto-checked
  items. No red X-marks during solving; incorrect auto-checked answers get one
  gentle retry („Pabandyk dar kartą“), then move on and record as incorrect.
- Responsive: must work on a tablet and a laptop.

### Lithuanian UI strings

- Loading: `Kraunama…`
- No tasks today: `Šiandien užduočių nėra. Laisva diena! 🎉`
- Next: `Toliau`
- Check: `Tikrinti`
- Retry prompt: `Pabandyk dar kartą`
- Self-mark done: `Padariau ✔`
- Hint: `Užuomina`
- Finish screen: `Šiandien — atlikta!` / `Teisingai: {n} iš {m}`
- Compare buttons: `<` `>` `=`

## 8. Pages / routes

- `/` (index.html): today's task sets (usually one). If both subjects exist for
  today, show subject picker first.
- `/results.html` (optional, nice-to-have): parent view, reads via pasted
  service key kept only in memory — SKIP if RLS makes this awkward; parent can
  use Claude chat instead.

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
- [ ] Auto-checked wrong answer → one retry → recorded incorrect, no harsh feedback.
- [ ] Submitting writes one `results` row with per-item seconds and total duration.
- [ ] Reload mid-session restores progress (localStorage autosave).
- [ ] Anon key cannot read `results` or future (`> tomorrow`) `task_sets` (test via curl).
- [ ] A `task_sets` row inserted via SQL with a new/unknown item type does not crash the page.
- [ ] Lighthouse accessibility ≥ 95 on index.
