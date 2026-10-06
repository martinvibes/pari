#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# The agent as a decentralized party, on a Splice LocalNet. Three operators,
# each with its own participant node and its own BitSafe Decentralization
# Manager (DecMan), run the agent together: its party is hosted on all three
# nodes, its namespace is owned by all three, and every action it takes needs
# two of the three operators to confirm it on BitSafe's GovernanceRules.
#
#   scripts/localnet.sh up           start LocalNet and three DecMan nodes, then
#                                    create the agent's party and its rules
#   scripts/localnet.sh demo         run the deal with the agent governed
#   scripts/localnet.sh offline N    disconnect node N from the synchronizer
#   scripts/localnet.sh online N     reconnect it
#   scripts/localnet.sh down         stop everything and delete LocalNet's data
#
# Needs Docker, jq, curl, grpcurl and openssl; a DecMan binary built with
# `--features test-mode` (DECMAN_BIN); and a Splice node bundle (SPLICE_NODE_DIR),
# which is downloaded when not given. The network's description, for the demo,
# is written to web/.pari/localnet.json, which git ignores.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/.localnet"
NETWORK="$ROOT/web/.pari/localnet.json"
CAST="$ROOT/web/.pari/localnet-cast.json"
DARS="$ROOT/daml/dars"

SPLICE_VERSION="0.6.13"
SPLICE_NODE_DIR="${SPLICE_NODE_DIR:-$STATE/splice-node}"
COMPOSE_DIR="$SPLICE_NODE_DIR/docker-compose/localnet"
DECMAN_BIN="${DECMAN_BIN:-dec-party-manager}"
PROJECT="pari-localnet"

# The three nodes: LocalNet's app-provider, app-user and SV participants. Each
# runs one operator of the agent, and the deal's other parties live on node 2.
NAMES=(OperationsDesk CoAgent Trustee)
LEDGER_PORTS=(3901 2901 4901)
ADMIN_PORTS=(3902 2902 4902)
JSON_PORTS=(3975 2975 4975)
HTTP_PORTS=(8081 8082 8083)
NOISE_PORTS=(9001 9002 9003)
METRICS_PORTS=(9464 9465 9466)

AGENT_HINT="pari-agent"
THRESHOLD=2
CONFIRMATION_TIMEOUT_MICROS=1800000000

die() { echo "localnet: $*" >&2; exit 1; }
step() { echo "==> $*"; }

# LocalNet's ledger token: HS256 with LocalNet's well-known secret, "unsafe".
token() {
  local header payload signature
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=\n' | tr '/+' '_-')"
  payload="$(printf '{"aud":"https://canton.network.global","sub":"ledger-api-user","iat":%s}' "$(date +%s)" \
    | base64 | tr -d '=\n' | tr '/+' '_-')"
  signature="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac unsafe -binary \
    | base64 | tr -d '=\n' | tr '/+' '_-')"
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

# DecMan's HTTP API on node N (0-based). A body of @file is read from the file.
decman() {
  local method=$1 node=$2 path=$3 body=${4:-}
  local args=(-sS --fail-with-body -X "$method" "http://localhost:${HTTP_PORTS[$node]}$path")
  [[ -n "$body" ]] && args+=(-H 'content-type: application/json' --data-binary "$body")
  curl "${args[@]}"
}

# The JSON Ledger API on node N.
ledger() {
  local node=$1 path=$2 body=$3
  curl -sS --fail-with-body -X POST "http://localhost:${JSON_PORTS[$node]}$path" \
    -H "authorization: Bearer $(token)" -H 'content-type: application/json' -d "$body"
}

# Retries `cmd` every two seconds until it succeeds, for up to `seconds`.
wait_for() {
  local what=$1 seconds=$2; shift 2
  local deadline=$((SECONDS + seconds))
  until "$@" > /dev/null 2>&1; do
    (( SECONDS < deadline )) || die "timed out waiting for $what"
    sleep 2
  done
}

compose() {
  IMAGE_TAG="$SPLICE_VERSION" docker compose -p "$PROJECT" \
    --env-file "$COMPOSE_DIR/compose.env" --env-file "$COMPOSE_DIR/env/common.env" \
    -f "$COMPOSE_DIR/compose.yaml" -f "$COMPOSE_DIR/resource-constraints.yaml" \
    --profile sv --profile app-provider --profile app-user "$@"
}

bundle() {
  [[ -d "$COMPOSE_DIR" ]] && return
  step "Downloading the Splice $SPLICE_VERSION node bundle"
  mkdir -p "$STATE"
  curl -fSL "https://github.com/digital-asset/decentralized-canton-sync/releases/download/v$SPLICE_VERSION/${SPLICE_VERSION}_splice-node.tar.gz" \
    | tar xz -C "$STATE"
}

# DecMan -----------------------------------------------------------------------

start_decman() {
  for n in 0 1 2; do
    mkdir -p "$STATE/decman/node-$n"
    RUST_LOG="${RUST_LOG:-dec_party_manager=warn}" \
    DECPM_CANTON_ADMIN_HOST=127.0.0.1 \
    DECPM_CANTON_ADMIN_PORT="${ADMIN_PORTS[$n]}" \
    DECPM_CANTON_LEDGER_HOST=127.0.0.1 \
    DECPM_CANTON_LEDGER_PORT="${LEDGER_PORTS[$n]}" \
    DECPM_CANTON_NETWORK=devnet \
    DECPM_PORT="${HTTP_PORTS[$n]}" \
    DECPM_NOISE_PORT="${NOISE_PORTS[$n]}" \
    DECPM_METRICS_PORT="${METRICS_PORTS[$n]}" \
    DECPM_TOPOLOGY_PROPAGATION_DELAY_SECS=3 \
    DECPM_PEER_WAIT_POLL_DELAY_MS=500 \
    nohup "$DECMAN_BIN" -d "$STATE/decman/node-$n" serve >> "$STATE/decman/node-$n.log" 2>&1 &
    echo $! > "$STATE/decman/node-$n.pid"
  done
  for n in 0 1 2; do
    wait_for "DecMan on node $((n + 1))" 60 has_key "$n"
  done
  sleep 5
}

stop_decman() {
  for pidfile in "$STATE"/decman/node-*.pid; do
    [[ -f "$pidfile" ]] || continue
    kill "$(cat "$pidfile")" 2> /dev/null || true
    sleep 1
    kill -9 "$(cat "$pidfile")" 2> /dev/null || true
    rm -f "$pidfile"
  done
}

has_key() { decman GET "$1" /keys/status | jq -e '.public_key | strings' ; }
participant_id() { decman GET "$1" /node-config | jq -r .node.participant_id; }

# Every node learns the others' Noise keys, then restarts to load them.
connect_peers() {
  local peers="[]"
  for n in 0 1 2; do
    peers="$(jq -c --arg id "$(participant_id "$n")" --arg key "$(decman GET "$n" /keys/status | jq -r .public_key)" \
      --arg name "${NAMES[$n]}" --argjson port "${NOISE_PORTS[$n]}" \
      '. + [{participant_id: $id, name: $name, address: "127.0.0.1", port: $port, public_key: $key, party: null}]' \
      <<< "$peers")"
  done
  for n in 0 1 2; do decman POST "$n" /network-config "$peers" > /dev/null; done
  stop_decman
  start_decman
}

pending_invitation() {
  decman GET "$1" /invitations | jq -er --arg type "$2" \
    '[.invitations[] | select(.invitation_type == $type)][0].id | strings'
}

# Nodes 2 and 3 accept node 1's invitation of `type`, and node 1's workflow at
# `status` completes.
peers_accept() {
  local type=$1 status=$2
  for n in 1 2; do
    wait_for "the $type invitation on node $((n + 1))" 120 pending_invitation "$n" "$type"
    decman POST "$n" /invitations/accept "$(jq -nc --arg id "$(pending_invitation "$n" "$type")" '{id: $id}')" > /dev/null
  done
  wait_for "the $type workflow" 300 completed "$status"
}

completed() {
  local status
  status="$(decman GET 0 "$1" | jq -r '.status // ""')"
  [[ "$status" == [Ff]ailed ]] && die "$1: $(decman GET 0 "$1" | jq -r '.error // "failed"')"
  [[ "$status" == [Cc]ompleted ]]
}

# Setup ------------------------------------------------------------------------

agent_party() {
  decman GET 0 /decentralized-parties | jq -er --arg hint "$AGENT_HINT" \
    '[.parties[] | select(.party_id | startswith($hint + "::"))][0].party_id | strings'
}

allocate() {
  ledger "$1" /v2/parties "$(jq -nc --arg hint "$2" '{partyIdHint: $hint, identityProviderId: ""}')" \
    | jq -r .partyDetails.party
}

grant() {
  local node=$1 party=$2
  ledger "$node" /v2/users/ledger-api-user/rights "$(jq -nc --arg p "$party" '{
    userId: "ledger-api-user", identityProviderId: "",
    rights: [{kind: {CanActAs: {value: {party: $p}}}}, {kind: {CanReadAs: {value: {party: $p}}}}]}')" > /dev/null
}

distribute_dars() {
  local list="$STATE/dars.jsonl" body="$STATE/dars.json"
  rm -f "$list"
  for dar in \
    "$DARS/governance-action-v1-0.1.0.dar" "$DARS/governance-core-v1-0.1.0.dar" \
    "$DARS/splice-test-token-v1-1.0.0.dar" \
    "$ROOT/daml/pari/.daml/dist/pari-0.2.0.dar" \
    "$ROOT/daml/pari-governance/.daml/dist/pari-governance-0.1.0.dar"; do
    [[ -f "$dar" ]] || die "missing $dar; run: make build"
    base64 < "$dar" | tr -d '\n' > "$STATE/dar.b64"
    jq -nc --arg name "$(basename "$dar")" --rawfile data "$STATE/dar.b64" '{filename: $name, data: $data}' >> "$list"
  done
  jq -sc --arg p2 "$(participant_id 1)" --arg p3 "$(participant_id 2)" \
    '{dar_files: ., peer_ids: [$p2, $p3]}' "$list" > "$body"
  decman POST 0 /dars/upload "@$body" > /dev/null
  decman POST 0 /dars/distribute "@$body" > /dev/null
  peers_accept Dars /dars/distribute/status
  rm -f "$list" "$body" "$STATE/dar.b64"
}

configure_party() {
  local node=$1 agent=$2 member=$3
  decman PUT "$node" /party-config "$(jq -nc --arg agent "$agent" --arg member "$member" '{
    dec_party_id: $agent, member_party_id: $member, user_id: "ledger-api-user",
    keycloak_url: "", keycloak_realm: "", keycloak_client_id: "",
    packages: {
      governance_action: "#governance-action-v1",
      governance_core: "#governance-core-v1",
      governance_token_custody: "#governance-token-custody-v1",
      governance_utility_onboarding: "#governance-utility-onboarding-v1",
      utility_registry: "#utility-registry-app-v0"
    }}')" > /dev/null
}

deploy_rules() {
  local agent=$1; shift
  local participants
  participants="$(decman GET 0 /decentralized-parties | jq -c --arg agent "$agent" \
    '[.parties[] | select(.party_id == $agent)][0].participants | map(.participant_uid)')"
  decman POST 0 /contracts "$(jq -nc --arg agent "$agent" --argjson participants "$participants" \
    --arg m1 "$1" --arg m2 "$2" --arg m3 "$3" --argjson threshold "$THRESHOLD" \
    --argjson timeout "$CONFIRMATION_TIMEOUT_MICROS" '{
    decentralized_party_id: $agent,
    participant_ids: $participants,
    participant_parties: [$m1, $m2, $m3],
    operator_party: $m1,
    contracts: [{
      id: "pari-agent-rules", name: "GovernanceRules",
      package_id: "#governance-core-v1", module_name: "Governance.Rules", entity_name: "GovernanceRules",
      fields: [
        {type: "decentralized_party"},
        {type: "party_set", parties: [$m1, $m2, $m3]},
        {type: "int64", value: $threshold},
        {type: "rel_time", microseconds: $timeout},
        {type: "none"}
      ]}]}')" > /dev/null
  peers_accept Contracts /contracts/status
}

up() {
  command -v "$DECMAN_BIN" > /dev/null || [[ -x "$DECMAN_BIN" ]] || die "set DECMAN_BIN to a DecMan built with --features test-mode"
  for tool in docker jq curl grpcurl openssl; do command -v "$tool" > /dev/null || die "$tool is required"; done
  bundle
  down

  step "Starting LocalNet: a synchronizer and three participant nodes"
  compose up -d --wait canton splice postgres

  step "Starting a DecMan for each node, and connecting them"
  start_decman
  connect_peers

  step "Creating the agent's party, hosted on all three nodes"
  decman POST 0 /onboarding "$(jq -nc --arg hint "$AGENT_HINT" --arg p2 "$(participant_id 1)" --arg p3 "$(participant_id 2)" \
    '{party_id_prefix: $hint, peer_ids: [$p2, $p3]}')" > /dev/null
  peers_accept Onboarding /onboarding/status
  wait_for "the agent's party" 60 agent_party
  local agent members=()
  agent="$(agent_party)"

  step "Allocating one operator on each node"
  for n in 0 1 2; do
    members+=("$(allocate "$n" "${NAMES[$n]}")")
    grant "$n" "${members[$n]}"
    grant "$n" "$agent"
  done

  step "Allocating the deal's other parties on node 2"
  local cast party
  cast="$(jq -n --arg agent "$agent" '{agent: $agent}')"
  for role in registry:Registry borrower:Northwind alder:Alder birch:Birch cedar:Cedar buyer:Delta rival:Rival auditor:Auditor; do
    party="$(allocate 1 "${role#*:}")"
    grant 1 "$party"
    cast="$(jq --arg key "${role%%:*}" --arg party "$party" '. + {($key): $party}' <<< "$cast")"
  done

  step "Uploading the governance and Pari packages to every node"
  distribute_dars

  step "Deploying the agent's GovernanceRules: ${THRESHOLD} of 3 operators"
  for n in 0 1 2; do configure_party "$n" "$agent" "${members[$n]}"; done
  deploy_rules "$agent" "${members[@]}"

  mkdir -p "$(dirname "$NETWORK")"
  jq -n --arg agent "$agent" --argjson threshold "$THRESHOLD" \
    --argjson names "$(printf '%s\n' "${NAMES[@]}" | jq -R . | jq -sc .)" \
    --argjson members "$(printf '%s\n' "${members[@]}" | jq -R . | jq -sc .)" \
    --argjson json "$(printf '%s\n' "${JSON_PORTS[@]}" | jq -sc .)" \
    --argjson http "$(printf '%s\n' "${HTTP_PORTS[@]}" | jq -sc .)" \
    '{agent: $agent, threshold: $threshold, nodes: [range(0; 3) as $n | {
      name: $names[$n], operator: $members[$n],
      ledger: "http://localhost:\($json[$n])", decman: "http://localhost:\($http[$n])"}]}' > "$NETWORK"
  echo "$cast" > "$CAST"
  step "Ready. The agent is $agent"
}

# Outage -----------------------------------------------------------------------

connectivity() {
  local node=$1 method=$2
  grpcurl -plaintext -d '{"synchronizer_alias": "global"}' "localhost:${ADMIN_PORTS[$node]}" \
    "com.digitalasset.canton.admin.participant.v30.SynchronizerConnectivityService/$method" > /dev/null
}

node_index() {
  [[ "${1:-}" =~ ^[123]$ ]] || die "name a node: 1, 2 or 3"
  echo $(($1 - 1))
}

down() {
  stop_decman
  [[ -d "$COMPOSE_DIR" ]] && compose down -v 2> /dev/null || true
  rm -rf "$STATE/decman" "$NETWORK" "$CAST"
}

case "${1:-}" in
  up) up ;;
  demo)
    cd "$ROOT/web"
    PARI_LOCALNET_FILE=.pari/localnet.json PARI_CAST_FILE=.pari/localnet-cast.json PARI_LEDGER_TOKEN="$(token)" \
      npm run --silent governed
    ;;
  offline) connectivity "$(node_index "${2:-}")" DisconnectSynchronizer ;;
  online) connectivity "$(node_index "${2:-}")" ReconnectSynchronizer ;;
  down) down ;;
  *) sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
