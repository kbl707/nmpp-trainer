# ANON-docs — no names or health details in the public docs

Brief date: 2026-10-19 · decision #8 · Branch: `anon-docs`
Executor: Sonnet, effort medium · Size: S
Runs in parallel with `ANON-ids-site` (different files).

Read `docs/BRIEF.md` and decision #8, then this file. This file is the whole
task. Write H and L everywhere, and never the names.

## Scope (your files only)
`SPEC.md`, `README.md`, `seed/` (both files, including the file name
`seed/<old L>-day1.sql` → `seed/l-day1.sql`), `printables/`. Not `docs/`
(the advisor's), and not code or HTML pages (`ANON-ids-site`).

## Do
- The two first names → H and L, in prose, headings and examples. "H's page" /
  "L's page" is fine. Keep ages and grades (4th grade, age 7, 2nd grade):
  they are not identifying alone.
- Remove the handle `a personal handle`.
- SPEC §7 heading and any other mention of "a named diagnosis": reword to
  "UI requirements (important: the child has handwriting and visual-motor
  difficulties)". Keep every UI rule exactly as it is; only the diagnosis
  name goes.
- Paths: `/<old L path>/` → `/l/uzduotys/`, learner ids `'<old H id>'`/`'<old L id>'` →
  `'h'`/`'l'`, matching `ANON-ids-site`.
- Seed SQL files are historical (decision #2). Change the ids and names
  inside them anyway, so they stay valid against the new checks, and say so
  in a header comment.
- The README "Pages" section: describe `/h`, `/l`, `/l/uzduotys/` and the
  temporary `/<old L path>/` redirect.

## Acceptance (paste in the PR)
- `git grep -n -i -E "h[e]nris|l[i]lija|a[g]urkas|d[y]sgraph|d[i]sgraf" -- SPEC.md
  README.md seed printables` → nothing, apart from the `/<old L path>/` redirect
  mention in README
- a short list of every section you reworded beyond a plain name swap
- CI green

## Not yours
Merging. The advisor merges this right after `ANON-ids-site`, so the docs
and the site match. Stop at PR-open.
