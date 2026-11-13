// SPDX-License-Identifier: Apache-2.0

export const SITE = {
  name: "Pari",
  title: "Pari, the private ledger for syndicated loans",
  description:
    "Administrative-agent ledger for syndicated loans on NEAR. The rules run in a contract and the books in a TDX enclave: private lender positions, every lender paid in one transaction, DvP trades and secret DQ screening.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  repo: "https://github.com/martinvibes/pari",
} as const;
