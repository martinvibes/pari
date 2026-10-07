#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

# Starts the hosted demo (deploy/Dockerfile): the Canton sandbox with Pari, a
# fresh demo deal, then the web app. The sandbox keeps its state in memory, so
# every start is a new ledger and a new deal. If either process stops, the
# container stops, and the host restarts it.
set -euo pipefail

java ${CANTON_JAVA_OPTS:--Xmx512m} -jar /opt/pari/canton.jar sandbox \
  --ledger-api-port 6865 --json-api-port 7575 --dar /opt/pari/pari-demo.dar &
canton=$!

echo "Waiting for the ledger"
until node -e 'fetch("http://localhost:7575/readyz").then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))'; do
  kill -0 "$canton" 2>/dev/null || { echo "The sandbox stopped" >&2; exit 1; }
  sleep 2
done

# The DAR finishes loading just after the ledger reports ready, so the seed
# gets a few tries.
mkdir -p "$(dirname "$PARI_CAST_FILE")"
for try in 1 2 3 4 5; do
  if java ${SCRIPT_JAVA_OPTS:--Xmx512m} -jar /opt/pari/daml-script.jar \
    --dar /opt/pari/pari-demo.dar --script-name Pari.Demo:sandbox \
    --ledger-host localhost --ledger-port 6865 --wall-clock-time \
    --output-file "$PARI_CAST_FILE"; then
    break
  fi
  [[ $try == 5 ]] && { echo "Seeding failed" >&2; exit 1; }
  sleep 5
done
echo "Seeded the demo deal"

node /app/server.js &
web=$!

wait -n "$canton" "$web"
echo "A process stopped; exiting so the host restarts the demo" >&2
exit 1
