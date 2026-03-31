#!/usr/bin/env bash

# Verifies that generated workflow step/trigger reference snippets match the live registries.
# Boots Elasticsearch + Kibana, loads the Workflows app (so public doc metadata is pushed),
# runs the generators, and fails if git detects changes to the snippet files.

set -euo pipefail

report_step() {
  echo "--- $1"
}

STEP_DOCS_FILE="docs/reference/workflows/_snippets/step-definitions-list.md"
TRIGGER_DOCS_FILE="docs/reference/workflows/_snippets/trigger-definitions-list.md"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

report_step "Bootstrap Kibana"
.buildkite/scripts/bootstrap.sh

report_step "Install Playwright Chromium (for opening the Workflows app)"
./node_modules/.bin/playwright install chromium

report_step "Starting Elasticsearch"
node scripts/es snapshot \
  -E network.bind_host=127.0.0.1 \
  -E discovery.type=single-node \
  --license=trial &
ES_PID=$!

echo "Waiting for Elasticsearch to be ready..."
MAX_WAIT_ES=300
ELAPSED_ES=0
while [ "$ELAPSED_ES" -lt "$MAX_WAIT_ES" ]; do
  if timeout 1 bash -c "echo > /dev/tcp/localhost/9200" 2>/dev/null; then
    if curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green"\|"status":"yellow"'; then
      echo "Elasticsearch is ready"
      break
    fi
  fi
  sleep 2
  ELAPSED_ES=$((ELAPSED_ES + 2))
done

if [ "$ELAPSED_ES" -ge "$MAX_WAIT_ES" ]; then
  echo "Elasticsearch failed to start within ${MAX_WAIT_ES} seconds"
  exit 1
fi

report_step "Starting Kibana (--no-dev-config avoids loading local kibana.dev.yml)"
# Load default kibana.yml plus CI-only overrides (workflows UI flag) without merging kibana.dev.yml.
node scripts/kibana --dev --no-base-path --no-dev-config \
  --config "$REPO_ROOT/config/kibana.yml" \
  --config "$REPO_ROOT/config/kibana.workflow_docs_verify.yml" &
KIBANA_PID=$!

cleanup() {
  echo "Cleaning up..."
  kill "$KIBANA_PID" 2>/dev/null || true
  kill "$ES_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for Kibana to be ready..."
MAX_WAIT=300
ELAPSED=0
while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  if timeout 1 bash -c "echo > /dev/tcp/localhost/5601" 2>/dev/null; then
    if curl -s http://localhost:5601/api/status | grep -q '"state":"green"'; then
      echo "Kibana is ready"
      break
    fi
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
  echo "Kibana failed to start within ${MAX_WAIT} seconds"
  exit 1
fi

export KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"
export KIBANA_USERNAME="${KIBANA_USERNAME:-elastic}"
export KIBANA_PASSWORD="${KIBANA_PASSWORD:-changeme}"
export KIBANA_AUTH="${KIBANA_AUTH:-${KIBANA_USERNAME}:${KIBANA_PASSWORD}}"

report_step "Load Workflows UI (pushes step/trigger doc metadata for generators)"
node scripts/warm_workflow_extension_doc_metadata.js

report_step "Regenerate workflow reference snippets"
node scripts/generate workflow-step-docs
node scripts/generate workflow-trigger-docs

report_step "Check for uncommitted documentation changes"
set +e
git diff --exit-code --quiet -- "$STEP_DOCS_FILE" "$TRIGGER_DOCS_FILE"
diff_status=$?
set -e

if [ "$diff_status" -ne 0 ]; then
  echo ""
  echo "ERROR: Workflow reference docs are out of date."
  echo ""
  echo "The following files differ from what the registries produce after loading the Workflows app:"
  echo "  - $STEP_DOCS_FILE"
  echo "  - $TRIGGER_DOCS_FILE"
  echo ""
  echo "To fix locally:"
  echo "  1. Start Elasticsearch and Kibana with the workflows UI enabled (see Workflows Management README)."
  echo "  2. Open /app/workflows once so metadata is pushed."
  echo "  3. Run:"
  echo "       node scripts/generate workflow-step-docs"
  echo "       node scripts/generate workflow-trigger-docs"
  echo "  4. Commit the updated snippet files."
  echo ""
  git --no-pager diff -- "$STEP_DOCS_FILE" "$TRIGGER_DOCS_FILE" || true
  exit 1
fi

echo "Workflow reference docs are up to date."
