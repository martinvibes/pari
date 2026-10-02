// SPDX-License-Identifier: Apache-2.0

export const SITE = {
  name: "Pari",
  title: "Pari, the private ledger for syndicated loans",
  description:
    "Administrative-agent ledger for syndicated and private-credit loans on Canton. Private lender positions, every lender paid in one transaction, DvP trades, secret DQ screening and MNPI walls.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  repo: "https://github.com/martinvibes/pari",
} as const;
