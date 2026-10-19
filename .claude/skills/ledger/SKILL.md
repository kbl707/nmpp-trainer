---
name: ledger
description: "One working process for every project: git is the single ledger, docs/BRIEF.md is the entry point any chat can load, one advisor chat owns the brief and the decisions, executor chats (Sonnet CLI) work from briefs and log what they change, side chats (Claude Desktop research) read the synced docs and hand results back as files. Use /ledger init to scaffold a project, /ledger check to verify it, /ledger sync to file a pasted side-chat result, or /ledger alone to load the rules at the start of any session."
---

# Ledger — how every project works

The problem this solves: Claude Code sees the repo, Claude Desktop chats
see only what is uploaded, and nothing bridges them. The fix is not a
shared knowledge base (it drifts). The fix is: git is the one ledger, one
short file is the entry point, and every chat type has a defined role.

## Roles

| Chat | Where | Model | Owns | Never |
|---|---|---|---|---|
| **Advisor** (one per project, long-lived) | Claude Code, project dir | strongest available | `docs/BRIEF.md`, `docs/decisions.md`, briefs for executors, review gate, calendar, memory | builds milestones itself when an executor exists |
| **Executor** (one per brief) | a nested session the advisor starts from the desktop app (reports back on its own), or a separate Sonnet CLI session (operator pastes the PR link back) — own branch either way | Sonnet 5.5, effort medium | its branch, its PR, ops-log lines for what it changed | edits BRIEF.md or decisions.md; improvises past the brief |
| **Side chat** (research, ideas, writing) | Claude Desktop, Project with synced `docs/` | any | its output as one markdown file | repo writes; it hands the file to the operator, who pastes it to the advisor |

Executors report to the advisor (operator pastes the PR link / result).
Side chats report to the advisor the same way. The advisor is the only
writer of the brief and the decisions register, so there is one voice.

## Files (per repo)

- `docs/BRIEF.md` — the entry point. Under 200 lines. Written for a
  reader with zero context. Rewritten in place, `as of` date at the top.
  Sections: What this is · Where things stand · Numbers that matter ·
  Decisions in force · Open items (owner, due) · Map (where details live)
  · How we work (one line pointing here).
- `docs/ops-log.md` — append-only. One line per state change outside
  git: `YYYY-MM-DD HH:MM UTC · who · system · what · ids`. Reads are not
  logged. Write the line, commit `docs: ops log <date> — <what>`, push,
  THEN report done. Never "done" before the line is pushed.
- `docs/decisions.md` — numbered register, append-only. Entry: `#N`,
  title, date, decided by, the decision, why, verdict/revisit date,
  status. Amendments are dated `NOTE` lines under the entry; history is
  never rewritten. If the project already has a register elsewhere,
  `decisions.md` is a one-line pointer to it.
- `docs/inbox/` — outputs from side chats, one dated file each
  (`YYYY-MM-DD-<topic>.md`), kept verbatim with a short reconciliation
  note at the end written by the advisor.
- `CLAUDE.md` — carries a "Working process (ledger)" section so every
  session, including executors, follows this without being told.
- `docs/sweeps/` — one file per periodic sweep (`YYYY-MM-DD.md`, from
  `templates/sweep.md`): findings with evidence, ranked, plus the
  advisor's decision per finding. Sweeps never change code.
- `.claude/skills/ledger/` — a copy of this skill inside the repo, so
  cloud sessions and nested sessions that do not see `~/.claude` still
  get the full rules. `init.sh` creates and refreshes it; never edit
  the copy, edit `~/.claude/skills/ledger` and rerun init.

## Rules

1. **Session start** (any chat with repo access): read `docs/BRIEF.md`,
   then the last 7 days of `docs/ops-log.md`. Then work.
2. **State changed outside git** (deploy, config, secrets, ad platform,
   email tool, DNS, payments, calendar): ops-log line before "done".
3. **Decision taken**: entry in `decisions.md`, BRIEF "Decisions in
   force" updated, and if it carries a date, a calendar event with the
   checklist in the description (update existing events, never
   duplicate).
4. **BRIEF stays true**: the commit that changes state also updates the
   affected BRIEF lines (Where things stand, Numbers, Open items). The
   advisor rewrites the whole file when it drifts or every two weeks,
   whichever comes first. `/ledger check` flags a stale `as of` date.
5. **Executor briefs** live in the repo (`docs/spec/milestones/` or
   `docs/briefs/`), one file per brief, the file is the whole brief.
   Executor: branch named after the brief, first action is the branch,
   stop at PR-open, paste acceptance output in the PR, stop and report
   if anything contradicts the repo. Advisor: independent review before
   merge, then deploy, then live-verify, then ops-log.
6. **Side-chat results come back as files**: operator pastes, advisor
   runs `/ledger sync`, which files it under `docs/inbox/`, reconciles
   with BRIEF and decisions, commits, pushes.
7. **Commits**: `docs:` prefix for ledger changes, plain messages, no
   attribution trailers.
8. **Reviews and lookups as subagents, with their own effort**: the
   advisor's adversarial reviewer is a high-effort subagent; greps and
   fact lookups are low-effort or Haiku subagents. Say so in the prompt
   ("high effort reviewer", "low effort lookups"); it overrides the
   session effort per subagent.
9. **Maintenance**: after every model launch and at least monthly, run
   `/checkup prompt-audit` in the project; it flags stale paths and
   contradicting rules in CLAUDE.md, skills and agents and writes a
   patch you approve. Rerun `init.sh` afterwards to refresh the
   in-repo skill copy.
10. **Papercuts**: anything that cost time because of tooling (a
    connector down, a permission prompt loop, a sandbox block) goes to
    `~/.claude/papercuts.md` as `date · symptom · fix · project`, shared
    by every session on this Mac. Check it first when tooling fails.
11. **Claude Docs, Design and Slides inside Claude Code are views, not
    sources.** A doc made from the repo is fine to share; the facts it
    shows live in `docs/`, and the doc says where it came from.
12. **Nobody reads the diff; everybody reads the evidence.** Human
    review of agent code does not scale, so trust comes from a ladder,
    every rung recorded: tests and lint green in CI → independent
    adversarial review (a high-effort subagent that did not write the
    code) → the brief's acceptance commands run and pasted in the PR →
    live verification after deploy → ops-log line. A PR missing a rung
    is not done. The operator reads the acceptance output and the live
    result, never the diff.
13. **Periodic sweeps find what nobody is looking at.** Quality drifts
    when agents write everything. Weekly: a light sweep (tests, lint,
    failed units, journal errors, job failures, outdated deps, untested
    modules, stale docs) → `docs/sweeps/YYYY-MM-DD.md`. Monthly: a deep
    sweep adds `/code-review high` on the most-changed modules,
    `/security-review`, `/simplify` candidates and one invariant
    spot-check. The sweep is read-only and runs as a nested session or
    a scheduled cloud agent; the advisor turns accepted findings into
    FIX briefs, one PR each, and the rest into open items or "checked,
    fine". `/ledger check` warns when the newest sweep is older than
    14 days. A project may grant standing approval for sweep FIXes
    ("start, review and merge without asking"); record it in BRIEF
    "Decisions in force". Deploy stays with whoever holds root.
14. **Tracer bullet first.** Every executor brief says: build the
    thinnest end-to-end path first (data in → result visible), verify
    it live, then widen. Layer-by-layer builds hide integration bugs
    until the end.
15. **Parallel executors, one writer per file set.** Several briefs may
    run at once, each in its own worktree or nested session; two
    sessions never edit the same files. Migrations and rewrites that
    used to be "someday" are now a brief: estimate in days, not
    quarters, and schedule them through the sweep.
16. **Cheapest model that passes.** Advisor on the strongest model,
    executors on Sonnet, lookups and sweeps' mechanical checks on
    Haiku or low effort. Review it when the monthly cost looks wrong.

## Claude Code desktop app (once per project, by the operator)

1. New-session screen → save an **environment** for the project: the
   repo folder, plus the SSH host if the project has a server. Every
   advisor and executor session starts from it.
2. Give work to executors from the advisor session: "run this brief in
   a nested session" starts one that reports back here when done. A
   follow-up card the advisor offers starts in its own session with one
   click. Side questions: `/btw <question>` opens them in their own tab.
3. Long task, laptop closing: continue the session in the cloud; it
   takes uncommitted changes with it. Cloud sessions read the in-repo
   skill copy, not `~/.claude`.

## Claude Desktop chat app setup (once per project, by the operator)

1. Claude Desktop → Projects → New project, named after the repo.
2. Project knowledge → Add from GitHub → pick the repo → select the
   `docs/` folder only → sync.
3. Project instructions, paste:
   "Start by reading docs/BRIEF.md, then docs/decisions.md. Everything
   under docs/ is the current state of the project; git is the ledger.
   Your deliverable is one markdown file, written so it can be committed
   under docs/inbox/ without edits. Do not assume anything not in docs/;
   ask."
4. Before each research chat: open the project, click re-sync.

## Commands

- `/ledger init [name]` — run `~/.claude/skills/ledger/init.sh <dir> [name]`
  (idempotent: never overwrites an existing file, appends the CLAUDE.md
  section only if its marker is absent). Then fill `docs/BRIEF.md` from
  what the repo already says (README, STATUS, git log, existing docs),
  mark unknowns `TODO(operator)`, and ask the operator one question for
  the most important unknown. Commit `docs: ledger init`.
- `/ledger check` — run `~/.claude/skills/ledger/check.sh <dir>`; fix
  what it reports.
- `/ledger sync` — the operator has pasted a side-chat result. Save it
  verbatim to `docs/inbox/YYYY-MM-DD-<topic>.md`, append a
  "Reconciliation" section (what agrees, what contradicts BRIEF or
  decisions, what is now an open item), update BRIEF and decisions,
  commit `docs: inbox <date> — <topic>`, push, report in five bullets.
- `/ledger sweep [weekly|deep]` — start a read-only sweep (default
  weekly): copy `templates/sweep.md` to `docs/sweeps/YYYY-MM-DD.md`,
  run every check in the table against main and the live box, fill
  the findings with verbatim evidence, rank them, commit `docs: sweep
  <date>`. Run it as a nested session or a scheduled cloud agent so the
  advisor's context stays clean; the advisor then fills "Advisor
  decisions" and writes FIX briefs for accepted items.
- `/ledger` — load these rules at the start of a session. Then do the
  session-start reads.
