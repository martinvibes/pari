// SPDX-License-Identifier: Apache-2.0

import "server-only";

/** Where the JSON Ledger API lives and how the app authenticates to it. */
export const LEDGER = {
  url: (process.env.PARI_LEDGER_URL ?? "http://localhost:7575").replace(/\/$/, ""),
  /** The ledger user to submit as; defaults to the token's subject, else `pari-web`. */
  userId: process.env.PARI_LEDGER_USER,
  /** A fixed bearer token. The local sandbox needs none. */
  token: process.env.PARI_LEDGER_TOKEN,
  /** A Keycloak token file (`make devnet-login`), refreshed before it expires. */
  tokenFile: process.env.PARI_LEDGER_TOKEN_FILE,
  oidc: {
    tokenUrl: process.env.PARI_OIDC_TOKEN_URL,
    clientId: process.env.PARI_OIDC_CLIENT_ID,
  },
};
