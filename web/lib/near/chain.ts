// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js";
import { accountOf, NEAR, signingKey } from "@/lib/near/config";

// Reads from and writes to NEAR. A read is a view call anyone can make. A
// write is one function call signed by the persona entitled to it.

const provider = new JsonRpcProvider({ url: NEAR.rpcUrl });

export class ChainError extends Error {}

export async function read<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await provider.callFunction({ contractId, method, args })) as T;
  } catch (error) {
    throw new ChainError(`Could not read ${method} from ${contractId}: ${reason(error)}`);
  }
}

export type Sent<T> = { hash: string; result: T };

// The contract runs one action at a time, so this server sends one at a time.
let queue: Promise<unknown> = Promise.resolve();

/** Sends one function call signed by `personaId` and decodes what it returned. */
export function send<T>(
  personaId: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint = 0n,
): Promise<Sent<T>> {
  const sent = queue.then(async () => {
    const account = new Account(accountOf(personaId), provider, signingKey(personaId) as KeyPairString);
    let tx;
    try {
      tx = await account.callFunctionRaw({ contractId, methodName, args, gas: teraToGas("300"), deposit, waitUntil: "FINAL" });
    } catch (error) {
      throw new ChainError(reason(error));
    }
    const status = tx.status as { SuccessValue?: string; Failure?: unknown };
    if (status.Failure) throw new ChainError(reason(status.Failure));
    const result = (status.SuccessValue ? JSON.parse(Buffer.from(status.SuccessValue, "base64").toString()) : null) as T;
    return { hash: tx.transaction.hash, result };
  });
  queue = sent.catch(() => undefined);
  return sent;
}

/** The contract's own words when it panics, or the error's message. */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  return panic ? panic[1]! : text;
}
