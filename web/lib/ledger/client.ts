// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { bearerToken, ledgerUser } from "@/lib/ledger/auth";
import { LEDGER } from "@/lib/ledger/config";
import { LedgerError } from "@/lib/ledger/errors";

// A thin client for the Canton JSON Ledger API v2: read the active contract
// set as one party, and submit commands as one or more parties. Templates and
// interfaces are referenced by package name (`#pari:Module:Template`), so the
// app keeps working across package versions. On a shared participant, where
// anyone may upload a later version of a package Pari uses, submissions pin
// the versions in LEDGER.packagePreference.

export type Contract<T> = {
  contractId: string;
  /** Package-id qualified, e.g. `fb5d…:Pari.Facility:Facility`. */
  templateId: string;
  payload: T;
  createdAt: string;
};

export type ActiveContract = Contract<unknown> & {
  /** Interface views, keyed by the interface's `Module:Entity` name. */
  views: Record<string, unknown>;
};

export type Disclosed = {
  templateId: string;
  contractId: string;
  createdEventBlob: string;
  synchronizerId: string;
};

export type Command =
  | { CreateCommand: { templateId: string; createArguments: unknown } }
  | {
      ExerciseCommand: {
        templateId: string;
        contractId: string;
        choice: string;
        choiceArgument: unknown;
      };
    };

export { LedgerError };

type CreatedEvent = {
  contractId: string;
  templateId: string;
  createArgument: unknown;
  createdAt: string;
  createdEventBlob?: string;
  interfaceViews?: Array<{ interfaceId: string; viewValue: unknown }>;
};

type ActiveContractEntry = {
  contractEntry: {
    JsActiveContract?: { createdEvent: CreatedEvent; synchronizerId: string };
  };
};

const ledgerUrl = new AsyncLocalStorage<string>();

/** Runs `work` against the JSON Ledger API at `url` rather than LEDGER.url.
 *  On a network of several participants, each party is reached on its own. */
export function onLedger<T>(url: string, work: () => Promise<T>): Promise<T> {
  return ledgerUrl.run(url.replace(/\/$/, ""), work);
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = await bearerToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${ledgerUrl.getStore() ?? LEDGER.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new LedgerError(errorMessage(text), res.status);
  return JSON.parse(text) as T;
}

/** The ledger's rejection in one line, with Daml's `Pari: …` reason when present. */
function errorMessage(body: string): string {
  const pari = body.match(/Pari: [^"\\]+/);
  if (pari) return pari[0];
  try {
    const parsed = JSON.parse(body) as { cause?: string; code?: string };
    return parsed.cause ?? parsed.code ?? body;
  } catch {
    return body;
  }
}

async function ledgerEnd(): Promise<number> {
  const { offset } = await call<{ offset: number }>("/v2/state/ledger-end");
  return offset;
}

async function activeEntries(party: string, filters: unknown[]) {
  const entries = await call<ActiveContractEntry[]>("/v2/state/active-contracts", {
    activeAtOffset: await ledgerEnd(),
    eventFormat: {
      filtersByParty: { [party]: { cumulative: filters.map((identifierFilter) => ({ identifierFilter })) } },
      verbose: false,
    },
  });
  return entries.flatMap((e) => (e.contractEntry.JsActiveContract ? [e.contractEntry.JsActiveContract] : []));
}

/** `Module:Entity` from a package-name (`#pari:…`) or package-id reference. */
export function qualifiedName(id: string): string {
  return id.split(":").slice(-2).join(":");
}

/** Every active contract `party` can see of the given templates and
 *  interfaces, in one read. Interface matches carry their views. */
export async function activeContracts(
  party: string,
  { templates = [], interfaces = [] }: { templates?: string[]; interfaces?: string[] },
): Promise<ActiveContract[]> {
  const filters = [
    ...templates.map((templateId) => ({
      TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } },
    })),
    ...interfaces.map((interfaceId) => ({
      InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: false } },
    })),
  ];
  const entries = await activeEntries(party, filters);
  return entries.map(({ createdEvent: e }) => ({
    contractId: e.contractId,
    templateId: e.templateId,
    payload: e.createArgument,
    createdAt: e.createdAt,
    views: Object.fromEntries((e.interfaceViews ?? []).map((v) => [qualifiedName(v.interfaceId), v.viewValue])),
  }));
}

/** One template's active contracts as `party` sees them, ready to disclose to another party. */
export async function disclosable(party: string, templateId: string): Promise<Disclosed[]> {
  const entries = await activeEntries(party, [
    { TemplateFilter: { value: { templateId, includeCreatedEventBlob: true } } },
  ]);
  return entries.map(({ createdEvent: e, synchronizerId }) => ({
    templateId: e.templateId,
    contractId: e.contractId,
    createdEventBlob: e.createdEventBlob ?? "",
    synchronizerId,
  }));
}

/** One event of a transaction, as one witness of it receives it. Node ids
 *  order the tree: an exercise's consequences are the nodes after it, up to
 *  and including its `lastDescendantNodeId`. */
export type TreeEvent =
  | {
      kind: "created";
      nodeId: number;
      templateId: string;
      contractId: string;
      payload: unknown;
      views: Record<string, unknown>;
    }
  | {
      kind: "exercised";
      nodeId: number;
      lastDescendantNodeId: number;
      templateId: string;
      contractId: string;
      choice: string;
      argument: unknown;
      consuming: boolean;
    };

export type Transaction = { updateId: string; offset: number; effectiveAt: string; events: TreeEvent[] };

type JsTransaction = {
  updateId: string;
  offset: number;
  effectiveAt: string;
  events: Array<{
    CreatedEvent?: CreatedEvent & { nodeId: number };
    ExercisedEvent?: {
      nodeId: number;
      lastDescendantNodeId: number;
      templateId: string;
      contractId: string;
      choice: string;
      choiceArgument: unknown;
      consuming: boolean;
    };
  }>;
};

const PAGE = 100;

/** Every transaction `party` witnessed, oldest first, from the participant's
 *  pruning horizon to the ledger end: for each, the events `party` is
 *  entitled to see, with the choices that produced them. Created events of
 *  the given interfaces carry their views. */
export async function witnessed(party: string, interfaces: string[] = []): Promise<Transaction[]> {
  const end = await ledgerEnd();
  const { participantPrunedUpToInclusive } = await call<{ participantPrunedUpToInclusive: number }>(
    "/v2/state/latest-pruned-offsets",
  );
  const filters = [
    { identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } },
    ...interfaces.map((interfaceId) => ({
      identifierFilter: {
        InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: false } },
      },
    })),
  ];
  const transactions: Transaction[] = [];
  let from = participantPrunedUpToInclusive;
  while (from < end) {
    const page = await call<Array<{ update: { Transaction?: { value: JsTransaction }; OffsetCheckpoint?: { value: { offset: number } } } }>>(
      `/v2/updates?limit=${PAGE}`,
      {
        beginExclusive: from,
        endInclusive: end,
        updateFormat: {
          includeTransactions: {
            eventFormat: { filtersByParty: { [party]: { cumulative: filters } }, verbose: false },
            transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
          },
        },
      },
    );
    for (const { update } of page) {
      const tx = update.Transaction?.value;
      if (tx) transactions.push(toTransaction(tx));
      from = Math.max(from, tx?.offset ?? update.OffsetCheckpoint?.value.offset ?? from);
    }
    if (page.length < PAGE) break;
  }
  return transactions;
}

function toTransaction(tx: JsTransaction): Transaction {
  const events = tx.events.flatMap((e): TreeEvent[] => {
    if (e.CreatedEvent) {
      const c = e.CreatedEvent;
      return [
        {
          kind: "created",
          nodeId: c.nodeId,
          templateId: c.templateId,
          contractId: c.contractId,
          payload: c.createArgument,
          views: Object.fromEntries((c.interfaceViews ?? []).map((v) => [qualifiedName(v.interfaceId), v.viewValue])),
        },
      ];
    }
    if (e.ExercisedEvent) {
      const x = e.ExercisedEvent;
      return [
        {
          kind: "exercised",
          nodeId: x.nodeId,
          lastDescendantNodeId: x.lastDescendantNodeId,
          templateId: x.templateId,
          contractId: x.contractId,
          choice: x.choice,
          argument: x.choiceArgument,
          consuming: x.consuming,
        },
      ];
    }
    return [];
  });
  return { updateId: tx.updateId, offset: tx.offset, effectiveAt: tx.effectiveAt, events };
}

export type Submission = {
  actAs: string[];
  readAs?: string[];
  commands: Command[];
  disclosedContracts?: Disclosed[];
};

export type Created = { contractId: string; templateId: string };

/** A party whose submissions are made some other way: the agent, when its
 *  operators act for it (lib/pari/governance.ts). */
export type Delegate = { party: string; submit(submission: Submission): Promise<Created[]> };

const delegates = new AsyncLocalStorage<Delegate>();

/** Runs `work` with every submission acting as `delegate.party` handed to
 *  `delegate.submit`. */
export function delegating<T>(delegate: Delegate, work: () => Promise<T>): Promise<T> {
  return delegates.run(delegate, work);
}

const committed = new AsyncLocalStorage<string[]>();

/** Runs `work` and collects the update id of every transaction it commits,
 *  in order: the ledger's own receipt for what the work did. */
export async function recordUpdates<T>(work: () => Promise<T>): Promise<{ result: T; updateIds: string[] }> {
  const updateIds: string[] = [];
  const result = await committed.run(updateIds, work);
  return { result, updateIds };
}

/** Submit commands atomically and wait for the transaction. Returns the
 *  contracts it created, so a caller can chain on them. */
export async function submit(submission: Submission): Promise<Created[]> {
  const delegate = delegates.getStore();
  if (delegate && submission.actAs.includes(delegate.party)) return delegate.submit(submission);
  const { actAs, readAs = [], commands, disclosedContracts = [] } = submission;
  const result = await call<{
    transaction: { updateId: string; events: Array<{ CreatedEvent?: CreatedEvent }> };
  }>("/v2/commands/submit-and-wait-for-transaction", {
    commands: {
      commands,
      commandId: randomUUID(),
      userId: await ledgerUser(),
      actAs,
      readAs,
      disclosedContracts,
      packageIdSelectionPreference: LEDGER.packagePreference,
    },
    transactionFormat: {
      eventFormat: {
        filtersByParty: Object.fromEntries(actAs.map((p) => [p, { cumulative: [] }])),
        verbose: false,
      },
      transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
    },
  });
  committed.getStore()?.push(result.transaction.updateId);
  return result.transaction.events.flatMap((e) =>
    e.CreatedEvent ? [{ contractId: e.CreatedEvent.contractId, templateId: e.CreatedEvent.templateId }] : [],
  );
}

export function exercise(templateId: string, contractId: string, choice: string, choiceArgument: unknown): Command {
  return { ExerciseCommand: { templateId, contractId, choice, choiceArgument } };
}

export function create(templateId: string, createArguments: unknown): Command {
  return { CreateCommand: { templateId, createArguments } };
}
