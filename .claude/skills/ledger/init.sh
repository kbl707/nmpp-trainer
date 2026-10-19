#!/usr/bin/env bash
# Scaffold the ledger process in a project. Idempotent: never overwrites.
# Usage: init.sh [project-dir] [project-name]
set -euo pipefail
DIR="${1:-.}"; DIR="$(cd "$DIR" && pwd)"
NAME="${2:-$(basename "$DIR")}"
DATE="$(date -u +%Y-%m-%d)"
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/templates"
render() { sed -e "s/{{PROJECT}}/$NAME/g" -e "s/{{DATE}}/$DATE/g" "$1"; }
mkdir -p "$DIR/docs/inbox" "$DIR/docs/sweeps"
[ -e "$DIR/docs/sweeps/.gitkeep" ] || : > "$DIR/docs/sweeps/.gitkeep"
[ -e "$DIR/docs/inbox/.gitkeep" ] || : > "$DIR/docs/inbox/.gitkeep"
for f in BRIEF.md ops-log.md decisions.md; do
  if [ -e "$DIR/docs/$f" ]; then echo "keep   docs/$f (exists)"; else render "$T/$f" > "$DIR/docs/$f"; echo "create docs/$f"; fi
done
if [ -e "$DIR/CLAUDE.md" ] && grep -q 'ledger:begin' "$DIR/CLAUDE.md"; then
  echo "keep   CLAUDE.md (section present)"
else
  [ -e "$DIR/CLAUDE.md" ] || printf '# %s — Working Instructions\n' "$NAME" > "$DIR/CLAUDE.md"
  cat "$T/CLAUDE-section.md" >> "$DIR/CLAUDE.md"; echo "append CLAUDE.md working-process section"
fi
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DIR/.claude/skills/ledger/templates"
for f in SKILL.md init.sh check.sh; do cp "$SRC/$f" "$DIR/.claude/skills/ledger/$f"; done
cp "$SRC"/templates/* "$DIR/.claude/skills/ledger/templates/"
printf 'Copy of ~/.claude/skills/ledger refreshed %s by init.sh. Edit the original, rerun init.\n' "$DATE" > "$DIR/.claude/skills/ledger/COPY.txt"
echo "refresh .claude/skills/ledger (in-repo copy for cloud/nested sessions)"
cat <<MSG

Next:
1. Fill docs/BRIEF.md (advisor does this from README/STATUS/git log; unknowns -> TODO(operator)).
2. Commit: git add docs CLAUDE.md && git commit -m "docs: ledger init" && git push
3. Claude Desktop: Projects -> New project "$NAME" -> Add from GitHub -> docs/ only -> sync.
   Project instructions: see ~/.claude/skills/ledger/SKILL.md "Claude Desktop setup".
MSG
