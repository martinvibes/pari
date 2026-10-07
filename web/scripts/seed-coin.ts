// SPDX-License-Identifier: Apache-2.0

// Seeds the demo deal in Canton Coin: the deal `Pari.Demo:sandbox` leaves, with
// every party's cash tapped from the DevNet faucet and every allocation made
// through Canton Coin's own CIP-56 registry. `scripts/devnet.sh seed` runs it
// with the Console's parties.
//
//   PARI_SEED_INPUT   the cast's parties (JSON), from the ledger user's rights
//   PARI_CAST_FILE    where to write the cast for the web app

import { readFileSync, writeFileSync } from "node:fs";
import { bearerToken } from "@/lib/ledger/auth";
import type { Cast } from "@/lib/ledger/cast";
import { activeContracts, create, exercise, qualifiedName, submit, type Command } from "@/lib/ledger/client";
import { DEAL_ID, balanceCents } from "@/lib/pari/deal";
import { T } from "@/lib/pari/ids";
import { toCents, toDecimal } from "@/lib/pari/money";
import { allocate, executable } from "@/lib/pari/operations";
import { snapshot } from "@/lib/pari/snapshot";
import type * as P from "@/lib/pari/types";

const SCAN = (process.env.PARI_REGISTRY_URL ?? "").replace(/\/$/, "");
const DAY_MS = 24 * 60 * 60 * 1000;

// Each party's cash before closing, as in Pari.Test.Setup.prepare, and a few
// coins more for Canton Coin's holding fees, which the payer bears.
const CASH: Array<[keyof Cast, number]> = [
  ["borrower", 5_000_000],
  ["alder", 50_000_000],
  ["birch", 30_000_000],
  ["cedar", 20_000_000],
  ["buyer", 20_000_000],
  ["rival", 20_000_000],
];
const FEE_HEADROOM = 10;

const SYNDICATE: Array<[keyof Cast, string]> = [
  ["alder", "50000000.0"],
  ["birch", "30000000.0"],
  ["cedar", "20000000.0"],
];

const DOCUMENTS = [
  {
    docId: "credit-agreement",
    title: "Northwind Logistics credit agreement",
    mnpi: false,
    sha256: "3955dd896f2d12fa22a2e3103f821be8a08d3d808e285ca500a35990bc91854e",
  },
  {
    docId: "q3-2026-management-accounts",
    title: "Northwind Logistics Q3 2026 management accounts",
    mnpi: true,
    sha256: "02c3a6e84c481110fb8f23dd9a9d9425bbf678f25233854ae5b17b1aa1bbccea",
  },
];

type ScanContract = { contract: { template_id: string; contract_id: string; created_event_blob: string; payload: Record<string, unknown> }; domain_id: string };

async function scan<T>(path: string): Promise<T> {
  const token = await bearerToken();
  const res = await fetch(`${SCAN}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`scan proxy ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const disclose = (c: ScanContract) => ({
  templateId: c.contract.template_id,
  contractId: c.contract.contract_id,
  createdEventBlob: c.contract.created_event_blob,
  synchronizerId: c.domain_id,
});

/** Tap the DevNet faucet for `receiver`, as the receiver. */
async function tap(receiver: string, amount: number) {
  const { amulet_rules: rules } = await scan<{ amulet_rules: ScanContract }>("/amulet-rules");
  const { open_mining_rounds: rounds } = await scan<{ open_mining_rounds: ScanContract[] }>("/open-and-issuing-mining-rounds");
  const now = new Date().toISOString();
  const round = rounds
    .filter((r) => String(r.contract.payload.opensAt) <= now)
    .sort((a, b) => String(a.contract.payload.opensAt).localeCompare(String(b.contract.payload.opensAt)))
    .at(-1);
  if (!round) throw new Error("No mining round is open.");
  await submit({
    actAs: [receiver],
    disclosedContracts: [disclose(rules), disclose(round)],
    commands: [
      exercise(rules.contract.template_id, rules.contract.contract_id, "AmuletRules_DevNet_Tap", {
        receiver,
        amount: toDecimal(BigInt(amount) * 100n),
        openRound: round.contract.contract_id,
      }),
    ],
  });
}

async function created(party: string, command: Command, template: string): Promise<string> {
  const events = await submit({ actAs: [party], commands: [command] });
  const found = events.find((e) => qualifiedName(e.templateId) === qualifiedName(template));
  if (!found) throw new Error(`No ${qualifiedName(template)} was created.`);
  return found.contractId;
}

function deadlines() {
  const now = Date.now();
  return {
    allocateBefore: new Date(now + 2 * DAY_MS).toISOString(),
    settleBefore: new Date(now + 3 * DAY_MS).toISOString(),
  };
}

async function main() {
  if (!SCAN) throw new Error("Set PARI_REGISTRY_URL to the validator's scan proxy.");
  const input = JSON.parse(readFileSync(process.env.PARI_SEED_INPUT ?? "", "utf8")) as { cast: Cast };
  const { amulet_rules: rules } = await scan<{ amulet_rules: ScanContract }>("/amulet-rules");
  const dso = String(rules.contract.payload.dso);
  const cast: Cast = { ...input.cast, registry: dso, instrument: "Amulet" };
  const instrumentId: P.InstrumentId = { admin: dso, id: "Amulet" };
  const { agent, borrower } = cast;

  console.log("Cash, tapped from the DevNet faucet:");
  for (const [key, amount] of CASH) {
    const party = cast[key]!;
    const held = balanceCents(await snapshot(party), party, instrumentId) / 100n;
    const short = amount + FEE_HEADROOM - Number(held);
    if (short > 0) await tap(party, short);
    console.log(`  ${key}: ${short > 0 ? `tapped ${short.toLocaleString("en-US")}` : "already held"} CC`);
  }

  await submit({ actAs: [agent], commands: [create(T.AgentDesk, { agent })] });
  await submit({
    actAs: [borrower],
    commands: [
      create(T.DqList, { borrower, agent, facilityId: DEAL_ID, disqualified: { map: [[cast.rival, {}]] } }),
    ],
  });

  const proposal = await created(
    agent,
    create(T.FacilityProposal, {
      agent,
      borrower,
      terms: {
        facilityId: DEAL_ID,
        name: "Northwind Logistics Term Loan B",
        instrumentId,
        commitment: "100000000.0",
        marginBps: "350",
        closingDate: "2026-09-15",
        maturityDate: "2031-09-15",
      },
    }),
    T.FacilityProposal,
  );
  let facility = await created(borrower, exercise(T.FacilityProposal, proposal, "FacilityProposal_Accept", {}), T.Facility);
  facility = await created(
    borrower,
    exercise(T.Facility, facility, "Facility_AppointAuditor", { newAuditor: cast.auditor }),
    T.Facility,
  );
  console.log("Facility proposed and accepted; auditor appointed.");

  const commitments: Array<{ commitment: string; allocation: string }> = [];
  for (const [key, amount] of SYNDICATE) {
    const lender = cast[key]!;
    const offer = await created(
      agent,
      exercise(T.Facility, facility, "Facility_Invite", { lender, amount, ...deadlines() }),
      T.CommitmentOffer,
    );
    const commitment = await created(lender, exercise(T.CommitmentOffer, offer, "CommitmentOffer_Accept", {}), T.Commitment);
    const [mine] = await activeContracts(lender, { templates: [T.Commitment] }).then((cs) =>
      cs.filter((c) => c.contractId === commitment),
    );
    const { settlement } = mine!.payload as { settlement: P.SettlementInfo };
    const allocation = await allocate({
      settlement,
      transferLegId: lender,
      transferLeg: { sender: lender, receiver: borrower, amount, instrumentId, meta: { values: {} } },
    });
    commitments.push({ commitment, allocation });
    console.log(`  ${key} committed ${toCents(amount) / 100n} CC and allocated it to Northwind`);
  }

  const { inputs, disclosed } = await executable(instrumentId, commitments.map((c) => c.allocation));
  const closing = await submit({
    actAs: [agent],
    disclosedContracts: disclosed,
    commands: [
      exercise(T.Facility, facility, "Facility_Close", {
        commitments: commitments.map((c, i) => ({ _1: c.commitment, _2: inputs[i] })),
      }),
    ],
  });
  facility = closing.find((e) => qualifiedName(e.templateId) === qualifiedName(T.Facility))!.contractId;
  await submit({
    actAs: [agent],
    commands: [exercise(T.Facility, facility, "Facility_FixRate", { baseRate: "0.0430", periodEnd: "2026-12-15" })],
  });
  console.log("Closed: every lender funded Northwind in Canton Coin, in one transaction. First period fixed.");

  for (const [key, side] of [["alder", "PrivateSide"], ["birch", "PublicSide"], ["cedar", "PublicSide"]] as const) {
    const lender = cast[key]!;
    await submit({ actAs: [lender], commands: [create(T.InfoElection, { lender, agent, facilityId: DEAL_ID, side })] });
  }
  for (const doc of DOCUMENTS) {
    await submit({
      actAs: [borrower],
      commands: [
        create(T.Document, {
          borrower,
          agent,
          facilityId: DEAL_ID,
          ...doc,
          uri: `https://dataroom.northwind.example/${doc.docId}`,
        }),
      ],
    });
  }

  writeFileSync(process.env.PARI_CAST_FILE ?? ".pari/devnet-cast.json", `${JSON.stringify(cast, null, 2)}\n`);
  console.log("Seeded in Canton Coin. Cast written.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
