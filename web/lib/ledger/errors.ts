// SPDX-License-Identifier: Apache-2.0

/** The ledger refused a request, or could not be asked. */
export class LedgerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}
