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

## #1 — Adopt the ledger process · {{DATE}} · decided by operator
Decision: git is the one ledger; `docs/BRIEF.md` is the entry point; one
advisor chat owns the brief and this register; executors and side chats
report to it.
Why: separate chats and tools had no shared, trusted state.
Verdict / revisit: none
Status: OPEN
