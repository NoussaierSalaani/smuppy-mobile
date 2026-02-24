#!/usr/bin/env bash
set -u

MAX_LOOPS="${1:-3}"

if ! [[ "$MAX_LOOPS" =~ ^[0-9]+$ ]] || [[ "$MAX_LOOPS" -lt 1 ]]; then
  echo "[qa-loop] MAX_LOOPS must be a positive integer"
  exit 2
fi

run_once() {
  echo "[qa-loop] typecheck"
  npm run typecheck &&
    echo "[qa-loop] lint (warnings blocked)" &&
    npm run lint -- --max-warnings=0 &&
    echo "[qa-loop] mobile tests" &&
    npm test -- --runInBand --silent &&
    echo "[qa-loop] lambda api tests" &&
    (cd aws-migration/lambda/api && npm test -- --runInBand --silent) &&
    echo "[qa-loop] infrastructure build" &&
    (cd aws-migration/infrastructure && npm run build) &&
    echo "[qa-loop] websocket build" &&
    (cd aws-migration/lambda/websocket && npm run build)
}

attempt=1
while [[ "$attempt" -le "$MAX_LOOPS" ]]; do
  echo "[qa-loop] ===== Attempt ${attempt}/${MAX_LOOPS} ====="
  if run_once; then
    echo "[qa-loop] SUCCESS on attempt ${attempt}"
    exit 0
  fi

  if [[ "$attempt" -lt "$MAX_LOOPS" ]]; then
    echo "[qa-loop] attempt ${attempt} failed, retrying..."
    sleep 2
  fi
  attempt=$((attempt + 1))
done

echo "[qa-loop] FAILED after ${MAX_LOOPS} attempts"
exit 1
