// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { bearerToken } from "@/lib/ledger/auth";
import { disclosable, type Disclosed } from "@/lib/ledger/client";
import { LedgerError } from "@/lib/ledger/errors";
import { TEST_TOKEN_RULES } from "@/lib/pari/ids";
import type * as P from "@/lib/pari/types";

// CIP-56 registries. A payer funds a settlement leg through its registry's
// allocation factory, and the agent executes the allocation (or the payer
// withdraws it) with the registry's choice context. Canton Coin serves the
// factory and every context through the token standard's off-ledger API, at
// PARI_REGISTRY_URL; the test token used on local ledgers needs no context.

export type ExtraArgs = {
  context: { values: Record<string, unknown> };
  meta: { values: Record<string, string> };
};

/** Extra arguments for a token-standard choice, and the registry contracts
 *  the submission must disclose for it. */
export type Context = { extraArgs: ExtraArgs; disclosed: Disclosed[] };

export const NO_EXTRA_ARGS: ExtraArgs = { context: { values: {} }, meta: { values: {} } };

export type FactoryArgs = {
  expectedAdmin: string;
  allocation: P.AllocationView["allocation"];
  requestedAt: string;
  inputHoldingCids: string[];
  extraArgs: ExtraArgs;
};

export type Registry = {
  /** The allocation factory to call with `args`, and its context. */
  allocationFactory(args: FactoryArgs): Promise<{ factoryId: string } & Context>;
  /** The context to execute an allocation, or to withdraw it. */
  allocationContext(allocationCid: string, action: "execute-transfer" | "withdraw"): Promise<Context>;
};

const CANTON_COIN = "Amulet";

export function registryFor(instrument: P.InstrumentId): Registry {
  return instrument.id === CANTON_COIN ? offLedger() : testToken(instrument.admin);
}

/** Each context's disclosed contracts, once each, for one submission. */
export function disclosedOf(contexts: Context[]): Disclosed[] {
  const byId = new Map(contexts.flatMap((c) => c.disclosed).map((d) => [d.contractId, d]));
  return [...byId.values()];
}

function testToken(admin: string): Registry {
  return {
    async allocationFactory() {
      const [rules] = await disclosable(admin, TEST_TOKEN_RULES);
      if (!rules) throw new Error("The token registry's allocation factory is missing.");
      return { factoryId: rules.contractId, extraArgs: NO_EXTRA_ARGS, disclosed: [rules] };
    },
    async allocationContext() {
      return { extraArgs: NO_EXTRA_ARGS, disclosed: [] };
    },
  };
}

type ChoiceContext = {
  choiceContextData: { values: Record<string, unknown> };
  disclosedContracts: Disclosed[];
};

function offLedger(): Registry {
  const base = process.env.PARI_REGISTRY_URL?.replace(/\/$/, "");
  if (!base) throw new Error("Canton Coin settles through its registry: set PARI_REGISTRY_URL.");

  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = await bearerToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new LedgerError(`Registry: ${text}`, res.status);
    return JSON.parse(text) as T;
  };
  const context = (c: ChoiceContext, meta = NO_EXTRA_ARGS.meta): Context => ({
    extraArgs: { context: c.choiceContextData, meta },
    disclosed: c.disclosedContracts.map(({ templateId, contractId, createdEventBlob, synchronizerId }) => ({
      templateId,
      contractId,
      createdEventBlob,
      synchronizerId,
    })),
  });

  return {
    async allocationFactory(args) {
      const { factoryId, choiceContext } = await post<{ factoryId: string; choiceContext: ChoiceContext }>(
        "/registry/allocation-instruction/v1/allocation-factory",
        { choiceArguments: args, excludeDebugFields: true },
      );
      return { factoryId, ...context(choiceContext, args.extraArgs.meta) };
    },
    async allocationContext(allocationCid, action) {
      const c = await post<ChoiceContext>(
        `/registry/allocations/v1/${encodeURIComponent(allocationCid)}/choice-contexts/${action}`,
        { excludeDebugFields: true },
      );
      return context(c);
    },
  };
}
