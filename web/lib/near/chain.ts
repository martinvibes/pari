// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js";
import { accountOf, NEAR, signingKey } from "@/lib/near/config";

// Reads from and writes to NEAR. A read is a view call anyone can make. A
// write is one function call signed by the persona entitled to it.

const provider = new JsonRpcProvider({ url: NEAR.rpcUrl });

// A public RPC answers 429 when it is rate limited, which near-api-js does not
// retry. Sending the same request again is safe: a read changes nothing, and a
// signed transaction has one hash however often it is sent.
const once = provider.sendJsonRpc.bind(provider);
provider.sendJsonRpc = (async (...request: Parameters<typeof once>) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await once(...request);
    } catch (error) {
      if ((error as { cause?: unknown }).cause !== 429 || attempt === 6) throw error;
      console.warn(`The NEAR RPC is rate limiting; trying again in ${2 ** attempt} s.`);
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
}) as typeof provider.sendJsonRpc;

export class ChainError extends Error {}

export async function read<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await provider.callFunction({ contractId, method, args })) as T;
  } catch (error) {
    throw new ChainError(`Could not read ${method} from ${contractId}: ${reason(error)}`);
  }
}

export type Sent<T> = {
  hash: string;
  result: T;
  /** What each contract the transaction reached returned, in order. */
  returned: Array<{ by: string; value: unknown }>;
};

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
    const returned = tx.receipts_outcome.map(({ outcome }) => ({
      by: outcome.executor_id,
      value: decoded((outcome.status as { SuccessValue?: string }).SuccessValue),
    }));
    return { hash: tx.transaction.hash, result: decoded(status.SuccessValue) as T, returned };
  });
  queue = sent.catch(() => undefined);
  return sent;
}

/** A returned value as JSON, or null when a call returned nothing or raw bytes. */
function decoded(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString());
  } catch {
    return null;
  }
}

/** The contract's own words when it panics, or the error's message. */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  return panic ? panic[1]! : text;
}
