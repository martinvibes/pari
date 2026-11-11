// SPDX-License-Identifier: Apache-2.0

/** Which ledger the app runs on. Canton is the default, so the original build
 *  is unchanged; `PARI_BACKEND=near` switches every screen to NEAR. */
export const BACKEND: "near" | "canton" = process.env.PARI_BACKEND === "near" ? "near" : "canton";
