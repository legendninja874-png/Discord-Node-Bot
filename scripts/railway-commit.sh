#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-commit.sh
# Usage: bash scripts/railway-commit.sh "commit message"
#
# 1. Typechecks the discord-bot
# 2. git add -A + git commit
# Push is handled separately via Replit's gitPush() callback.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

MSG="${1:-chore: update}"

cd "$(dirname "$0")/.."

echo "──────────────────────────────────────"
echo "  🔍 Typechecking..."
echo "──────────────────────────────────────"
pnpm --filter @workspace/discord-bot run typecheck
echo "✅ Typecheck passed"

echo ""
echo "──────────────────────────────────────"
echo "  📦 Staging & committing..."
echo "──────────────────────────────────────"
git add -A
if git diff --cached --quiet; then
  echo "⚠️  Nothing to commit"
else
  git commit -m "$MSG"
  echo "✅ Committed: $MSG"
fi
