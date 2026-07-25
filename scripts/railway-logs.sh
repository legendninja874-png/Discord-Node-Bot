#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-logs.sh
# Usage:
#   bash scripts/railway-logs.sh              → last 100 lines, latest deploy
#   bash scripts/railway-logs.sh <deployId>   → specific deployment
#   bash scripts/railway-logs.sh "" <lines>   → custom line count
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE_ID="ba0c3fb3-0de2-4136-8c68-34a0196db19e"
ENV_ID="118ab811-e2fe-4290-adbe-e6877dd46138"
TOKEN="${RAILWAY_API_TOKEN:-}"
LINES="${2:-100}"

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

DEPLOY_ID="${1:-}"
if [[ -z "$DEPLOY_ID" ]]; then
  RESP=$(rq "{\"query\":\"{ deployments(input: { serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { edges { node { id status createdAt } } } }\"}")
  DEPLOY_ID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  STATUS=$(echo "$RESP" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//')
  echo "📋 Latest deployment: $DEPLOY_ID  [$STATUS]"
fi

echo "──────────────────────────────────────"
echo "  📜 Logs (last $LINES lines)"
echo "──────────────────────────────────────"

RESP=$(rq "{\"query\":\"{ deploymentLogs(deploymentId: \\\"$DEPLOY_ID\\\", limit: $LINES) { timestamp severity message } }\"}")

# Parse and print each log line
echo "$RESP" | grep -o '"timestamp":"[^"]*","severity":"[^"]*","message":"[^"]*"' | while IFS= read -r line; do
  TS=$(echo "$line" | grep -o '"timestamp":"[^"]*"' | sed 's/"timestamp":"//;s/"//' | sed 's/T/ /;s/\..*//')
  SEV=$(echo "$line" | grep -o '"severity":"[^"]*"' | sed 's/"severity":"//;s/"//')
  MSG=$(echo "$line" | grep -o '"message":"[^"]*"' | sed 's/"message":"//;s/"$//')
  printf "[%s] [%-5s] %s\n" "$TS" "$SEV" "$MSG"
done

if echo "$RESP" | grep -q '"deploymentLogs":\[\]'; then
  echo "(no logs yet — deployment may still be building)"
fi
