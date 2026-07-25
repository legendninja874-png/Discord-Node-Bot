#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-push.sh
# Usage: bash scripts/railway-push.sh "commit message"
#
# 1. Typechecks the discord-bot
# 2. Commits everything + pushes to GitHub → Railway auto-deploys
# 3. Polls Railway API until the new deployment succeeds or fails
# 4. Prints final status + last log lines
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="f2bcfbe8-29aa-43a0-b22d-7d2061e18725"
SERVICE_ID="ba0c3fb3-0de2-4136-8c68-34a0196db19e"
ENV_ID="118ab811-e2fe-4290-adbe-e6877dd46138"

MSG="${1:-chore: update}"
TOKEN="${RAILWAY_API_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "❌ RAILWAY_API_TOKEN not set"
  exit 1
fi

rq() {
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$1"
}

echo "──────────────────────────────────────"
echo "  🔍 Typechecking..."
echo "──────────────────────────────────────"
cd "$(dirname "$0")/.."
pnpm --filter @workspace/discord-bot run typecheck
echo "✅ Typecheck passed"

echo ""
echo "──────────────────────────────────────"
echo "  📦 Committing & pushing to GitHub..."
echo "──────────────────────────────────────"
git add -A
git diff --cached --quiet && echo "⚠️  Nothing to commit — pushing existing HEAD" || git commit -m "$MSG"
git push origin main
echo "✅ Pushed to GitHub"

echo ""
echo "──────────────────────────────────────"
echo "  ⏳ Waiting for Railway deployment..."
echo "──────────────────────────────────────"
sleep 5  # give Railway a moment to pick up the commit

LATEST=""
for i in $(seq 1 60); do
  RESP=$(rq "{\"query\":\"{ deployments(input: { serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { edges { node { id status createdAt } } } }\"}")
  LATEST=$(echo "$RESP" | grep -o '"id":"[^"]*","status":"[^"]*"' | head -1)
  STATUS=$(echo "$LATEST" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//')
  DEPLOY_ID=$(echo "$LATEST" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

  if [[ "$STATUS" == "SUCCESS" ]]; then
    echo "✅ Deployment SUCCESS  (id: $DEPLOY_ID)"
    break
  elif [[ "$STATUS" == "FAILED" || "$STATUS" == "CRASHED" ]]; then
    echo "❌ Deployment $STATUS  (id: $DEPLOY_ID)"
    echo ""
    echo "─── Last logs ─────────────────────────"
    bash "$(dirname "$0")/railway-logs.sh" "$DEPLOY_ID" 50
    exit 1
  else
    echo "   [$i/60] Status: ${STATUS:-QUEUED} …"
    sleep 5
  fi
done

if [[ "$STATUS" != "SUCCESS" ]]; then
  echo "⏰ Timed out waiting. Last status: $STATUS"
  echo "Run:  bash scripts/railway-logs.sh $DEPLOY_ID"
  exit 1
fi
