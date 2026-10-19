
## Working process (ledger)
<!-- ledger:begin -->
Full rules: `~/.claude/skills/ledger/SKILL.md` (or `/ledger`).
- Session start: read `docs/BRIEF.md`, then the last 7 days of
  `docs/ops-log.md`.
- Any state change outside git (deploy, config, ad platform, email
  tool, DNS, calendar): append a line to `docs/ops-log.md`
  (`YYYY-MM-DD HH:MM UTC · who · system · what · ids`), commit
  `docs: ops log <date> — <what>`, push, THEN report done.
- Decisions go to `docs/decisions.md` (numbered, append-only) and the
  "Decisions in force" list in BRIEF.
- Executors (Sonnet CLI): one brief = one branch = one PR; the brief
  file is the whole task; stop at PR-open; stop and report if the repo
  contradicts the brief; never edit BRIEF.md or decisions.md.
- Side-chat outputs (Claude Desktop research) are filed under
  `docs/inbox/` by the advisor via `/ledger sync`.
- Trust ladder, every rung recorded: CI green → independent review →
  acceptance output in the PR → live verification → ops-log line.
- Briefs build the tracer bullet (thinnest end-to-end path) first.
- Periodic read-only sweeps go to `docs/sweeps/`; accepted findings
  become FIX briefs, one PR each.
- Commits: `docs:` prefix for ledger files, plain messages, no
  attribution trailers.
<!-- ledger:end -->
