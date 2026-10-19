# Sweep — {{DATE}} ({{KIND}})

Periodic read-only audit of the repo and the running system. Produced by
a sweep session; the advisor decides which findings become FIX briefs.
Nothing in this file is a change; it is evidence plus proposals.

## Checks run
| Check | Result |
|---|---|
| `pytest -q` on main | |
| `ruff check .` | |
| Failed units / timers (`systemctl --failed`, `list-timers`) | |
| Journal errors last 7 days (`journalctl -p err --since -7d`) | |
| Ingest / job failures in the DB last 7 days | |
| Disk, memory, cert expiry on the box | |
| Outdated or vulnerable dependencies (`pip list --outdated`, `pip-audit`) | |
| Modules without tests | |
| TODO / FIXME / XXX count and age | |
| Docs that reference things no longer in the code | |
| Invariants spot-check (one invariant, one module) | |
| Deep only: `/code-review high` on the two most-changed modules | |
| Deep only: `/security-review` | |
| Deep only: `/simplify` candidates | |

## Findings (ranked: incidents → correctness → security → reliability → debt)
| # | Sev | Where | Evidence | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | | `path:line` | what was observed, verbatim | | S/M/L |

## Not a problem (checked, fine)
- 

## Advisor decisions
- [ ] #n → FIX brief `docs/spec/milestones/FIX-....md` / open item / ignore (why)
