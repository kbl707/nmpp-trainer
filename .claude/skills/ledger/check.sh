#!/usr/bin/env bash
# Verify a project follows the ledger process. Usage: check.sh [project-dir]
set -uo pipefail
DIR="${1:-.}"; rc=0
fail() { echo "FAIL $1"; rc=1; }
ok() { echo "ok   $1"; }
for f in docs/BRIEF.md docs/ops-log.md docs/decisions.md CLAUDE.md; do
  [ -e "$DIR/$f" ] && ok "$f exists" || fail "$f missing (run init.sh)"
done
[ -d "$DIR/docs/inbox" ] && ok "docs/inbox/ exists" || fail "docs/inbox/ missing"
if [ -e "$DIR/docs/BRIEF.md" ]; then
  n=$(wc -l < "$DIR/docs/BRIEF.md"); [ "$n" -le 200 ] && ok "BRIEF.md $n lines (<=200)" || fail "BRIEF.md $n lines (>200): cut it"
  asof=$(grep -m1 -oE 'As of: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$DIR/docs/BRIEF.md" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
  if [ -z "$asof" ]; then fail "BRIEF.md has no 'As of: YYYY-MM-DD' line"; else
    age=$(( ( $(date -u +%s) - $(date -u -j -f %Y-%m-%d "$asof" +%s 2>/dev/null || date -u -d "$asof" +%s) ) / 86400 ))
    [ "$age" -le 14 ] && ok "BRIEF.md as-of $asof (${age}d old)" || fail "BRIEF.md as-of $asof is ${age}d old (>14): rewrite it"
  fi
  t=$(grep -c 'TODO' "$DIR/docs/BRIEF.md" || true); [ "$t" -eq 0 ] && ok "BRIEF.md has no TODOs" || echo "warn BRIEF.md has $t TODO lines"
fi
if [ -e "$DIR/docs/ops-log.md" ]; then
  last=$(grep -E '^- ' "$DIR/docs/ops-log.md" | tail -1)
  echo "$last" | grep -qE '^- [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC · ' && ok "ops-log last line well-formed" || fail "ops-log last line not in 'YYYY-MM-DD HH:MM UTC · who · system · what · ids' form: ${last:0:80}"
fi
if [ -e "$DIR/.claude/skills/ledger/SKILL.md" ]; then
  if (cd "$DIR" && git check-ignore -q .claude/skills/ledger/SKILL.md 2>/dev/null); then fail ".claude/skills/ledger is gitignored: add '!.claude/skills/ledger/' (see qed-ops .gitignore)"; else ok "in-repo skill copy present and tracked"; fi
else fail ".claude/skills/ledger missing (rerun init.sh)"; fi
if ls "$DIR"/docs/sweeps/*.md >/dev/null 2>&1; then
  newest=$(ls "$DIR"/docs/sweeps/*.md | sort | tail -1 | xargs basename | cut -c1-10)
  sage=$(( ( $(date -u +%s) - $(date -u -j -f %Y-%m-%d "$newest" +%s 2>/dev/null || date -u -d "$newest" +%s) ) / 86400 ))
  [ "$sage" -le 14 ] && ok "newest sweep $newest (${sage}d old)" || echo "warn newest sweep $newest is ${sage}d old (>14): run /ledger sweep"
else echo "warn no docs/sweeps/ yet: run /ledger sweep"; fi
[ -e "$DIR/CLAUDE.md" ] && { grep -q 'ledger:begin' "$DIR/CLAUDE.md" && ok "CLAUDE.md has the working-process section" || fail "CLAUDE.md lacks the ledger section (run init.sh)"; }
# Desktop link test: the Desktop Project can only be checked by asking it.
if [ -e "$DIR/docs/BRIEF.md" ]; then
  item=$(awk '/^## Open items/{f=1;next} f && /^\| /{n++; if(n==3){print; exit}}' "$DIR/docs/BRIEF.md" | cut -d'|' -f2 | sed 's/^ *//;s/ *$//')
  echo
  echo "Desktop test: open the Claude Desktop project for this repo, click re-sync, start a new chat and ask:"
  echo "  \"What is the 'As of' date in docs/BRIEF.md, and what is the first open item?\""
  echo "  Correct answer: As of ${asof:-?} · ${item:-?}"
  echo "  Wrong or 'I don't have that file' → re-check steps 2–3 of the Desktop setup (repo added, docs/ selected, synced)."
fi
exit $rc
