// SPDX-License-Identifier: Apache-2.0

/** What an action reports back to the screen that sent it. */
export type ActionResult = {
  ok: boolean;
  message: string;
  /** Where to see the transaction on the public explorer. */
  links?: Array<{ label: string; href: string }>;
};
