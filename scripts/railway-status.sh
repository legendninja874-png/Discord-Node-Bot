#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-status.sh  — quick snapshot of recent deployments
# Usage: bash scripts/railway-status.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE_ID="ba0c3fb3-0de2-4136-8c68-34a0196db19e"
ENV_ID="118ab811-e2fe-4290-adbe-e6877dd46138"
TOKEN="${RAILWAY_API_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "❌ RAILWAY_API_TOKEN not set"
  exit 1
fi

RESP=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"{ deployments(input: { serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { edges { node { id status createdAt } } } }\"}")

echo "──────────────────────────────────────"
echo "  🚂 Railway Deployments"
echo "──────────────────────────────────────"

echo "$RESP" | grep -o '"id":"[^"]*","status":"[^"]*","createdAt":"[^"]*"' | head -10 | while IFS= read -r line; do
  ID=$(echo "$line"   | grep -o '"id":"[^"]*"'        | sed 's/"id":"//;s/"//')
  ST=$(echo "$line"   | grep -o '"status":"[^"]*"'    | sed 's/"status":"//;s/"//')
  TS=$(echo "$line"   | grep -o '"createdAt":"[^"]*"' | sed 's/"createdAt":"//;s/"//;s/T/ /;s/\..*//')

  case "$ST" in
    SUCCESS) ICON="✅" ;;
    FAILED|CRASHED) ICON="❌" ;;
    BUILDING|DEPLOYING) ICON="⏳" ;;
    *) ICON="·" ;;
  esac

  printf "%s  %-10s  %s  %s\n" "$ICON" "$ST" "$TS" "$ID"
done
