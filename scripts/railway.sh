#!/usr/bin/env bash
# Railway helper — check deployment status and logs on demand
# Usage:
#   ./scripts/railway.sh status       — latest deployment status
#   ./scripts/railway.sh logs         — recent build/deploy logs
#   ./scripts/railway.sh vars         — list Railway env vars

set -eou pipefail

COMMAND="${1:-status}"

GQL() {
  python3 -c "
import urllib.request, json, os, sys, urllib.error

token = os.environ['RAILWAY_TOKEN']
query = sys.stdin.read()

req = urllib.request.Request(
    'https://backboard.railway.app/graphql/v2',
    data=json.dumps({'query': query}).encode(),
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'railway-cli/3.0.0'
    }
)
try:
    with urllib.request.urlopen(req) as r:
        print(json.dumps(json.load(r), indent=2))
except urllib.error.HTTPError as e:
    print('HTTP Error', e.code, file=sys.stderr)
    print(e.read().decode(), file=sys.stderr)
    sys.exit(1)
"
}

case "$COMMAND" in
  status)
    echo "=== Recent Deployments ==="
    GQL <<EOF
{
  deployments(input: { serviceId: "$RAILWAY_SERVICE_ID", environmentId: "$RAILWAY_ENVIRONMENT_ID" }, first: 5) {
    edges {
      node {
        id
        status
        createdAt
        url
      }
    }
  }
}
EOF
    ;;

  logs)
    DEPLOYMENT_ID="${2:-}"
    if [[ -z "$DEPLOYMENT_ID" ]]; then
      echo "Fetching latest deployment ID..."
      DEPLOYMENT_ID=$(GQL <<EOF | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['deployments']['edges'][0]['node']['id'])"
{
  deployments(input: { serviceId: "$RAILWAY_SERVICE_ID", environmentId: "$RAILWAY_ENVIRONMENT_ID" }, first: 1) {
    edges { node { id } }
  }
}
EOF
      )
      echo "Deployment: $DEPLOYMENT_ID"
    fi
    GQL <<EOF
{
  deploymentLogs(deploymentId: "$DEPLOYMENT_ID") {
    message
    severity
    timestamp
  }
}
EOF
    ;;

  vars)
    echo "=== Railway Environment Variables ==="
    GQL <<EOF
{
  variables(
    projectId: "$RAILWAY_PROJECT_ID",
    environmentId: "$RAILWAY_ENVIRONMENT_ID",
    serviceId: "$RAILWAY_SERVICE_ID"
  )
}
EOF
    ;;

  *)
    echo "Usage: $0 {status|logs [deployment_id]|vars}"
    exit 1
    ;;
esac
