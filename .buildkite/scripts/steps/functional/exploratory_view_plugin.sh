#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh
.buildkite/scripts/download_build_artifacts.sh
.buildkite/scripts/setup_es_snapshot_cache.sh

export JOB=kibana-observability-plugin

echo "--- Exploratory View plugin @elastic/synthetics Tests"

cd "$XPACK_DIR"

node solutions/observability/plugins/exploratory_view/scripts/e2e.js --kibana-install-dir "$KIBANA_BUILD_LOCATION" ${GREP:+--grep \"${GREP}\"}
