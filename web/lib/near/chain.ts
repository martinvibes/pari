// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js";
import { accountOf, FAUCET, faucetKey, NEAR, signingKey } from "@/lib/near/config";

// Reads from and writes to NEAR. A read is a view call anyone can make. A
// write is one function call signed by the persona entitled to it.

// A public RPC answers 429 when it is rate limited, which near-api-js does not
// retry. Sending the same request again is safe: a read changes nothing, and a
// signed transaction has one hash however often it is sent.
function node(url: string): JsonRpcProvider {
  const provider = new JsonRpcProvider({ url });
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
  return provider;
}

const provider = node(NEAR.rpcUrl);
/** An ordinary node forgets a block after about two days. This one keeps them all. */
const archive = node(NEAR.archivalRpcUrl);

export class ChainError extends Error {}

export async function read<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await provider.callFunction({ contractId, method, args })) as T;
  } catch (error) {
    throw new ChainError(`Could not read ${method} from ${contractId}: ${reason(error)}`);
  }
}

/** A view call that says which block answered: the latest final one, or
 *  `block`, which the archival node holds whatever its age. */
export async function readAt<T>(contractId: string, method: string, args: Record<string, unknown>, block?: number): Promise<{ value: T; block: number }> {
  const [from, blockQuery] = block === undefined ? [provider, { finality: "final" as const }] : [archive, { blockId: block }];
  for (let attempt = 1; ; attempt += 1) {
    try {
      const answer = await from.callFunctionRaw({ contractId, method, args, blockQuery });
      return { value: JSON.parse(Buffer.from(answer.result).toString()) as T, block: answer.block_height };
    } catch (error) {
      // A block that became final a second ago may not have reached the archival node yet.
      if (attempt < 3 && (error as Error).name === "UnknownBlockError") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw new ChainError(`Could not read ${method} from ${contractId}: ${reason(error)}`);
    }
  }
}

/** When a block was made. */
export async function blockTime(block: number): Promise<Date> {
  try {
    const { header } = await archive.viewBlock({ blockId: block });
    return new Date(Number(BigInt(header.timestamp_nanosec) / 1_000_000n));
  } catch (error) {
    throw new ChainError(`Could not read block ${block}: ${reason(error)}`);
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

/** An account's NEAR, in yocto. An account nobody has funded yet holds none. */
export async function nearBalance(account: string): Promise<bigint> {
  try {
    return (await provider.viewAccount({ accountId: account })).amount;
  } catch (error) {
    if (/does not exist/.test((error as Error).message)) return 0n;
    throw new ChainError(`Could not read ${account}: ${reason(error)}`);
  }
}

// The faucet's transactions do not touch the deal, so they keep their own line.
let faucetQueue: Promise<unknown> = Promise.resolve();

/** One transaction signed by the faucet account. Returns its hash. */
export function fromFaucet(work: (faucet: Account) => Promise<{ transaction: { hash: string } }>): Promise<string> {
  const sent = faucetQueue.then(async () => {
    try {
      return (await work(new Account(FAUCET, provider, faucetKey() as KeyPairString))).transaction.hash;
    } catch (error) {
      throw new ChainError(reason(error));
    }
  });
  faucetQueue = sent.catch(() => undefined);
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
