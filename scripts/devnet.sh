#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# The Pari demo on the HackCanton DevNet node, hosted by NODERS. Parties and
# the DAR are created in the node's Console; the ledger is reached with a
# Keycloak token for your hackathon account.
#
#   scripts/devnet.sh login    sign in once (asks for email and password)
#   scripts/devnet.sh seed     seed the demo deal on the Console's parties
#   scripts/devnet.sh web      run the web app against DevNet
#   scripts/devnet.sh smoke    drive the seeded deal through every app action
#   scripts/devnet.sh reset    archive the deal, so the parties can be seeded again
#
# The node is shared, and any team may upload a later version of a package
# Pari uses. Every submission therefore pins the package ids built into the
# DAR, as `Pari.Demo.seed` and PARI_PACKAGE_PREFERENCE do.
#
# Tokens and the cast are written to web/.pari/, which git ignores.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKENS="$ROOT/web/.pari/devnet-tokens.json"
CAST="$ROOT/web/.pari/devnet-cast.json"
DAR="$ROOT/daml/pari-demo/.daml/dist/pari-demo-0.1.0.dar"
DPM="${DPM:-dpm}"

JSON_API="https://ledger-api-json.participant.hackcanton-01.devnet.naas.noders.services"
GRPC_HOST="ledger-api-grpc.participant.hackcanton-01.devnet.naas.noders.services"
OIDC_TOKEN_URL="https://keycloak.naas.noders.services/realms/noders-appsfactory/protocol/openid-connect/token"
OIDC_CLIENT_ID="web-app-ui-hackcanton-01-devnet"

# Each cast member (Pari.Test.Setup.Cast) and the Console party name it uses.
ROLES="registry:registry agent:agent borrower:northwind alder:alder birch:birch cedar:cedar buyer:delta rival:rival"

die() { echo "devnet: $*" >&2; exit 1; }

# Saves a Keycloak token response (stdin) over the stored tokens, keeping the
# refresh token when the response does not rotate it.
save_tokens() {
  local response
  response="$(cat)"
  jq -e .access_token > /dev/null <<< "$response" || die "Keycloak refused: $response"
  mkdir -p "$(dirname "$TOKENS")"
  local tmp
  tmp="$(mktemp "$TOKENS.XXXXXX")"
  if [[ -f "$TOKENS" ]]; then
    jq --argjson new "$response" '. * $new' "$TOKENS" > "$tmp"
  else
    printf '%s\n' "$response" > "$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$TOKENS"
}

# A claim from the stored access token, e.g. `claim sub`.
claim() {
  local payload
  payload="$(jq -r .access_token "$TOKENS" | cut -d. -f2 | tr '_-' '/+')"
  while (( ${#payload} % 4 )); do payload+="="; done
  base64 -d <<< "$payload" | jq -r ".$1"
}

# A valid access token, refreshed when it has less than a minute left.
access_token() {
  [[ -f "$TOKENS" ]] || die "not signed in; run: make devnet-login"
  if (( $(claim exp) - 60 < $(date +%s) )); then
    jq -j .refresh_token "$TOKENS" | curl -sS "$OIDC_TOKEN_URL" \
      --data-urlencode grant_type=refresh_token \
      --data-urlencode client_id="$OIDC_CLIENT_ID" \
      --data-urlencode refresh_token@- | save_tokens
  fi
  jq -r .access_token "$TOKENS"
}

login() {
  local email password
  read -rp "HackCanton email: " email
  read -rsp "Password: " password
  echo
  printf %s "$password" | curl -sS "$OIDC_TOKEN_URL" \
    --data-urlencode grant_type=password \
    --data-urlencode client_id="$OIDC_CLIENT_ID" \
    --data-urlencode username="$email" \
    --data-urlencode password@- \
    --data-urlencode "scope=openid daml_ledger_api offline_access" | save_tokens
  echo "Signed in as ledger user $(claim sub). Tokens saved to web/.pari/ (never commit them)."
}

# The cast, from the parties your ledger user can act as: one per role, named
# `<namespace>-<name>` by the Console.
cast_from_rights() {
  local token="$1" user="$2"
  curl -sS --fail-with-body "$JSON_API/v2/users/$user/rights" -H "Authorization: Bearer $token" |
    jq --arg roles "$ROLES" '
      [.rights[].kind.CanActAs.value.party? // empty] as $parties
      | reduce ($roles | split(" ")[] | split(":")) as [$key, $name] ({};
          ([$parties[] | select(contains("-" + $name + "::"))] | unique) as $found
          | if ($found | length) == 1 then . + {($key): $found[0]}
            else error("expected one party named \($name), found \($found | length): create it in the Console")
            end)'
}

# The ids of the packages the deal runs, Pari and the token standard, as a
# JSON array read from the DAR's file names. The node must have each one.
pinned_packages() {
  local token="$1" ids missing
  [[ -f "$DAR" ]] || die "no DAR at $DAR; run: make build"
  ids="$(unzip -Z1 "$DAR" | sed -nE 's#^(.*/)?(pari|splice-.*)-[0-9.]+-([0-9a-f]{64})\.dalf$#\2 \3#p' |
    jq -Rn '[inputs | split(" ") | select(.[0] == "pari" or (.[0] | startswith("splice-"))) | .[1]]')"
  missing="$(curl -sS --fail-with-body "$JSON_API/v2/packages" -H "Authorization: Bearer $token" |
    jq -r --argjson ids "$ids" '$ids - .packageIds | .[]')"
  [[ -z "$missing" ]] || die "the node lacks packages from $DAR: $missing. Upload the DAR in the Console."
  printf '%s\n' "$ids"
}

seed() {
  [[ ! -f "$CAST" ]] || die "already seeded ($CAST); run: make devnet-reset to start over"
  local token user packages
  token="$(access_token)"
  user="$(claim sub)"
  packages="$(pinned_packages "$token")"
  input="$(mktemp)"
  token_file="$(mktemp)"
  trap 'rm -f "$input" "$token_file"' EXIT
  cast_from_rights "$token" "$user" | jq --argjson packages "$packages" '{cast: ., packages: $packages}' > "$input"
  echo "Seeding the demo deal as ledger user $user:"
  jq -r '.cast | to_entries[] | "  \(.key): \(.value)"' "$input"
  printf %s "$token" > "$token_file"
  "$DPM" script --dar "$DAR" --script-name Pari.Demo:seed \
    --ledger-host "$GRPC_HOST" --ledger-port 443 --tls \
    --access-token-file "$token_file" --user-id "$user" \
    --input-file "$input" --output-file "$CAST" --wall-clock-time
  echo "Seeded. Cast written to web/.pari/devnet-cast.json."
}

# Archives every active contract of the cast's parties in one transaction, so
# the same parties can be seeded again. Possible only because this demo's one
# ledger user acts as every party.
reset() {
  local token user parties offset contracts count
  token="$(access_token)"
  user="$(claim sub)"
  parties="$(cast_from_rights "$token" "$user" | jq -c '[.[]]')"
  offset="$(curl -sS --fail-with-body "$JSON_API/v2/state/ledger-end" -H "Authorization: Bearer $token" | jq .offset)"
  contracts="$(jq -n --argjson parties "$parties" --argjson offset "$offset" '{
      activeAtOffset: $offset,
      eventFormat: {
        filtersByParty: ($parties | map({key: ., value: {cumulative: [{identifierFilter: {WildcardFilter: {value: {includeCreatedEventBlob: false}}}}]}}) | from_entries),
        verbose: false
      }
    }' | curl -sS --fail-with-body "$JSON_API/v2/state/active-contracts" -H "Authorization: Bearer $token" \
      -H 'content-type: application/json' -d @- |
    jq -c '[.[].contractEntry.JsActiveContract.createdEvent // empty | {templateId, contractId}] | unique_by(.contractId)')"
  count="$(jq length <<< "$contracts")"
  if (( count == 0 )); then
    echo "Nothing to archive."
  else
    jq -r '.[].templateId | split(":")[1:] | join(":")' <<< "$contracts" | sort | uniq -c
    local answer
    read -rp "Archive these $count contracts? [y/N] " answer
    [[ "$answer" == y ]] || die "nothing archived"
    jq -n --argjson contracts "$contracts" --argjson parties "$parties" \
      --arg user "$user" --arg commandId "pari-reset-$(date +%s)" '{
        commands: [$contracts[] | {ExerciseCommand: (. + {choice: "Archive", choiceArgument: {}})}],
        commandId: $commandId,
        userId: $user,
        actAs: $parties
      }' | curl -sS --fail-with-body "$JSON_API/v2/commands/submit-and-wait" -H "Authorization: Bearer $token" \
        -H 'content-type: application/json' -d @- > /dev/null
    echo "Archived $count contracts."
  fi
  rm -f "$CAST"
}

# Runs an npm script in web/ against DevNet. The app refreshes the token itself.
web_env() {
  local packages
  [[ -f "$CAST" ]] || die "not seeded yet; run: make devnet-seed"
  packages="$(pinned_packages "$(access_token)" | jq -r 'join(",")')"
  cd "$ROOT/web"
  PARI_LEDGER_URL="$JSON_API" \
  PARI_PACKAGE_PREFERENCE="$packages" \
  PARI_LEDGER_TOKEN_FILE=.pari/devnet-tokens.json \
  PARI_OIDC_TOKEN_URL="$OIDC_TOKEN_URL" \
  PARI_OIDC_CLIENT_ID="$OIDC_CLIENT_ID" \
  PARI_CAST_FILE=.pari/devnet-cast.json \
    npm run --silent "$@"
}

case "${1:-}" in
  login) login ;;
  seed) seed ;;
  web) web_env dev ;;
  smoke) web_env smoke ;;
  reset) reset ;;
  *) die "usage: scripts/devnet.sh login | seed | web | smoke | reset" ;;
esac
