#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-poll.sh
# Usage: bash scripts/railway-poll.sh
#
# Polls Railway until the latest deployment succeeds or fails.
# Prints live status every 5 seconds.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE_ID="ba0c3fb3-0de2-4136-8c68-34a0196db19e"
ENV_ID="118ab811-e2fe-4290-adbe-e6877dd46138"
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

echo ""
echo "──────────────────────────────────────"
echo "  ⏳ Waiting for Railway deployment..."
echo "──────────────────────────────────────"
sleep 6  # give Railway a moment to pick up the push

STATUS=""
DEPLOY_ID=""

for i in $(seq 1 60); do
  RESP=$(rq "{\"query\":\"{ deployments(input: { serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { edges { node { id status createdAt } } } }\"}")
  LATEST=$(echo "$RESP" | grep -o '"id":"[^"]*","status":"[^"]*"' | head -1)
  STATUS=$(echo "$LATEST" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//')
  DEPLOY_ID=$(echo "$LATEST" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

  if [[ "$STATUS" == "SUCCESS" ]]; then
    echo "✅ Deployment SUCCESS  (id: $DEPLOY_ID)"
    exit 0
  elif [[ "$STATUS" == "FAILED" || "$STATUS" == "CRASHED" ]]; then
    echo "❌ Deployment $STATUS  (id: $DEPLOY_ID)"
    echo ""
    echo "─── Last logs ─────────────────────────"
    bash "$(dirname "$0")/railway-logs.sh" "$DEPLOY_ID" 60
    exit 1
  else
    echo "   [$i/60] Status: ${STATUS:-QUEUED} …"
    sleep 5
  fi
done

echo "⏰ Timed out after 5 min. Last status: $STATUS"
echo "Run: bash scripts/railway-logs.sh $DEPLOY_ID"
exit 1
