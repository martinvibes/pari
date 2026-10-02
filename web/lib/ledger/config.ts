// SPDX-License-Identifier: Apache-2.0

import "server-only";

/** Where the JSON Ledger API lives and who the app submits as. */
export const LEDGER = {
  url: (process.env.PARI_LEDGER_URL ?? "http://localhost:7575").replace(/\/$/, ""),
  userId: process.env.PARI_LEDGER_USER ?? "pari-web",
  /** A bearer token for authenticated ledgers. The local sandbox needs none. */
  token: process.env.PARI_LEDGER_TOKEN,
};
