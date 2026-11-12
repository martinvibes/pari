// SPDX-License-Identifier: Apache-2.0

// What a visitor's own account buys: a slice of Alder's position. Money is
// whole cents; NEAR is yocto.

/** The par Alder offers, and its price in parts per million of par. */
export const SLICE = { par: 250_000_00n, pricePpm: 995_000 };

/** What the slice costs: par at the price. */
export const SLICE_CASH = (SLICE.par * BigInt(SLICE.pricePpm)) / 1_000_000n;

/** What the visitor pays into the deal before the trade. It covers the price. */
export const PAY_IN = SLICE.par;

/** An account made by a key: 64 hex digits, the key's public half. */
export const KEY_ACCOUNT = /^[0-9a-f]{64}$/;

/** 0.35 NEAR. A call to the deal prepays 300 TGas, about 0.3 NEAR on testnet,
 *  and gets back what it did not burn. Below this an account cannot send one. */
export const GAS_FLOOR = 35n * 10n ** 22n;

/** 0.5 NEAR: what the faucet gives an account that is below the floor. */
export const GAS_GIFT = 5n * 10n ** 23n;
