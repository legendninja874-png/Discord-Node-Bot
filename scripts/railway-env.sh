#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# railway-env.sh  — set or list Railway environment variables
#
# Usage:
#   bash scripts/railway-env.sh list
#   bash scripts/railway-env.sh set KEY VALUE
#   bash scripts/railway-env.sh set OPENAI_API_KEY sk-...
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

CMD="${1:-list}"

if [[ "$CMD" == "list" ]]; then
  echo "──────────────────────────────────────"
  echo "  🔑 Railway env vars"
  echo "──────────────────────────────────────"
  RESP=$(rq "{\"query\":\"{ variables(serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\") }\"}")
  echo "$RESP" | grep -o '"[A-Z_][A-Z0-9_]*":"[^"]*"' | sed 's/":"/ = /'
  exit 0
fi

if [[ "$CMD" == "set" ]]; then
  KEY="${2:-}"
  VAL="${3:-}"
  if [[ -z "$KEY" || -z "$VAL" ]]; then
    echo "Usage: $0 set KEY VALUE"
    exit 1
  fi

  QUERY=$(printf '{"query":"mutation { variableUpsert(input: { serviceId: \"%s\", environmentId: \"%s\", name: \"%s\", value: \"%s\" }) }"}' \
    "$SERVICE_ID" "$ENV_ID" "$KEY" "$VAL")

  RESP=$(rq "$QUERY")
  if echo "$RESP" | grep -q '"variableUpsert":true'; then
    echo "✅ Set $KEY on Railway"
    echo "   → Redeploy to apply: bash scripts/railway-push.sh \"env: add $KEY\""
  else
    echo "❌ Failed to set $KEY"
    echo "$RESP"
    exit 1
  fi
fi
