// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { randomUUID } from "node:crypto";
import { bearerToken, ledgerUser } from "@/lib/ledger/auth";
import { LEDGER } from "@/lib/ledger/config";
import { LedgerError } from "@/lib/ledger/errors";

// A thin client for the Canton JSON Ledger API v2: read the active contract
// set as one party, and submit commands as one or more parties. Templates and
// interfaces are referenced by package name (`#pari:Module:Template`), so the
// app keeps working across package versions.

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

async function call<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = await bearerToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${LEDGER.url}${path}`, {
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

export type Submission = {
  actAs: string[];
  readAs?: string[];
  commands: Command[];
  disclosedContracts?: Disclosed[];
};

/** Submit commands atomically and wait for the transaction. Returns the
 *  contracts it created, so a caller can chain on them. */
export async function submit({ actAs, readAs = [], commands, disclosedContracts = [] }: Submission) {
  const result = await call<{
    transaction: { events: Array<{ CreatedEvent?: CreatedEvent }> };
  }>("/v2/commands/submit-and-wait-for-transaction", {
    commands: {
      commands,
      commandId: randomUUID(),
      userId: await ledgerUser(),
      actAs,
      readAs,
      disclosedContracts,
    },
    transactionFormat: {
      eventFormat: {
        filtersByParty: Object.fromEntries(actAs.map((p) => [p, { cumulative: [] }])),
        verbose: false,
      },
      transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
    },
  });
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
