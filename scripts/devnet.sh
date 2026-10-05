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

seed() {
  [[ -f "$DAR" ]] || die "no DAR at $DAR; run: make build"
  [[ ! -f "$CAST" ]] || die "already seeded ($CAST). Seeding again needs new parties; move that file away first."
  local token user
  token="$(access_token)"
  user="$(claim sub)"
  input="$(mktemp)"
  token_file="$(mktemp)"
  trap 'rm -f "$input" "$token_file"' EXIT
  cast_from_rights "$token" "$user" > "$input"
  echo "Seeding the demo deal as ledger user $user:"
  jq -r 'to_entries[] | "  \(.key): \(.value)"' "$input"
  printf %s "$token" > "$token_file"
  "$DPM" script --dar "$DAR" --script-name Pari.Demo:seed \
    --ledger-host "$GRPC_HOST" --ledger-port 443 --tls \
    --access-token-file "$token_file" --user-id "$user" \
    --input-file "$input" --output-file "$CAST" --wall-clock-time
  echo "Seeded. Cast written to web/.pari/devnet-cast.json."
}

# Runs an npm script in web/ against DevNet. The app refreshes the token itself.
web_env() {
  access_token > /dev/null
  [[ -f "$CAST" ]] || die "not seeded yet; run: make devnet-seed"
  cd "$ROOT/web"
  PARI_LEDGER_URL="$JSON_API" \
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
  *) die "usage: scripts/devnet.sh login | seed | web | smoke" ;;
esac
