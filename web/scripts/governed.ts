// SPDX-License-Identifier: Apache-2.0

// The agent run by three operators, two of three, on LocalNet. `scripts/localnet.sh up`
// builds the network: the agent's party hosted on each operator's node with
// confirmation rights only, and BitSafe's GovernanceRules over it. This runs
// the demo deal through that agent and checks what the arrangement promises:
//
//   1. every agent action is proposed by one operator and confirmed by two;
//   2. no node can submit as the agent on its own;
//   3. one operator's confirmation does not move the lenders' cash;
//   4. with one operator's node offline, the other two settle the payment;
//   5. the offline node catches up, with every action on the record.
//
//   PARI_LOCALNET_FILE  the network, as `scripts/localnet.sh up` writes it
//   PARI_CAST_FILE      the deal's parties, hosted on the second node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCast } from "@/lib/ledger/cast";
import { activeContracts, create, delegating, exercise, onLedger, qualifiedName, submit, type Command } from "@/lib/ledger/client";
import { DEAL_ID, balanceCents, facilityOf, requestState } from "@/lib/pari/deal";
import {
  EXECUTION_RESULT,
  Refused,
  confirm,
  execute,
  governedAgent,
  proposingAgent,
  until,
  type Network,
  type Node,
} from "@/lib/pari/governance";
import { T, TEST_TOKEN, TEST_TOKEN_RULES } from "@/lib/pari/ids";
import { formatCents, toDecimal } from "@/lib/pari/money";
import { allocate, executable, fixRate, fundRequest, requestInterest, settlePayment } from "@/lib/pari/operations";
import { snapshot } from "@/lib/pari/snapshot";
import type * as P from "@/lib/pari/types";

const LOCALNET = resolve(process.cwd(), "../scripts/localnet.sh");
const DAY_MS = 24 * 60 * 60 * 1000;

const network = JSON.parse(readFileSync(process.env.PARI_LOCALNET_FILE ?? ".pari/localnet.json", "utf8")) as Network;
const cast = loadCast();
const { agent, borrower, registry } = cast;
const usd: P.InstrumentId = { admin: registry, id: "USD" };
const [desk, coAgent, trustee] = network.nodes as [Node, Node, Node];

// Each party's cash before closing, as in Pari.Test.Setup.prepare.
const CASH: Array<[keyof typeof cast, bigint]> = [
  ["borrower", 5_000_000n],
  ["alder", 50_000_000n],
  ["birch", 30_000_000n],
  ["cedar", 20_000_000n],
];

const SYNDICATE: Array<[keyof typeof cast, string]> = [
  ["alder", "50000000.0"],
  ["birch", "30000000.0"],
  ["cedar", "20000000.0"],
];

// The operators take turns: each action is proposed by one and seconded by
// the next. The deal's parties read through the second node.
const PAIRS: Array<[Node, Node]> = [
  [desk, coAgent],
  [coAgent, trustee],
  [trustee, desk],
];
let turns = 0;
function turn() {
  const [proposer, seconder] = PAIRS[turns++ % PAIRS.length]!;
  return { proposer, seconder, observer: coAgent };
}

const nameOf = (party: string) => network.nodes.find((n) => n.operator === party)?.name ?? party.split("::")[0]!;

function deadlines() {
  const now = Date.now();
  return {
    allocateBefore: new Date(now + 2 * DAY_MS).toISOString(),
    settleBefore: new Date(now + 3 * DAY_MS).toISOString(),
  };
}

function check(holds: boolean, claim: string) {
  if (!holds) throw new Error(`Failed: ${claim}`);
  console.log(`  ok  ${claim}`);
}

async function created(party: string, command: Command, template: string): Promise<string> {
  const events = await submit({ actAs: [party], commands: [command] });
  const found = events.find((e) => qualifiedName(e.templateId) === qualifiedName(template));
  if (!found) throw new Error(`No ${qualifiedName(template)} was created.`);
  return found.contractId;
}

async function facility() {
  const found = facilityOf(await snapshot(agent));
  if (!found) throw new Error("The facility is not on the ledger.");
  return found;
}

async function cash(party: string) {
  return balanceCents(await snapshot(party), party, usd);
}

/** Runs `scripts/localnet.sh` to take an operator's node off the synchronizer, or back on. */
function connectivity(node: Node, state: "offline" | "online") {
  execFileSync(LOCALNET, [state, String(network.nodes.indexOf(node) + 1)], { stdio: "inherit" });
}

/** The registry, everyone's cash and the borrower's DQ list, unless already there. */
async function prepare() {
  const s = await snapshot(borrower);
  if (s.facilities.length > 0) {
    throw new Error("This LocalNet already ran the demo. Start a fresh one: scripts/localnet.sh up");
  }
  if ((await activeContracts(registry, { templates: [TEST_TOKEN_RULES] })).length === 0) {
    await submit({ actAs: [registry], commands: [create(TEST_TOKEN_RULES, { admin: registry })] });
  }
  for (const [key, amount] of CASH) {
    const owner = cast[key]!;
    const short = amount * 100n - (await cash(owner));
    if (short <= 0n) continue;
    await submit({
      actAs: [owner, registry],
      commands: [
        create(TEST_TOKEN, {
          holding: { owner, instrumentId: usd, amount: toDecimal(short), lock: null, meta: { values: {} } },
        }),
      ],
    });
  }
  if (s.dqLists.length === 0) {
    await submit({
      actAs: [borrower],
      commands: [create(T.DqList, { borrower, agent, facilityId: DEAL_ID, disqualified: { map: [[cast.rival, {}]] } })],
    });
  }
}

/** The deal to its first interest request, every agent action governed. */
async function syndicate() {
  await submit({ actAs: [agent], commands: [create(T.AgentDesk, { agent })] });
  await submit({
    actAs: [agent],
    commands: [
      create(T.FacilityProposal, {
        agent,
        borrower,
        terms: {
          facilityId: DEAL_ID,
          name: "Northwind Logistics Term Loan B",
          instrumentId: usd,
          commitment: "100000000.0",
          marginBps: "350",
          closingDate: "2026-09-15",
          maturityDate: "2031-09-15",
        },
      }),
    ],
  });
  const [proposal] = await activeContracts(borrower, { templates: [T.FacilityProposal] });
  await submit({
    actAs: [borrower],
    commands: [exercise(T.FacilityProposal, proposal!.contractId, "FacilityProposal_Accept", {})],
  });

  const commitments: Array<{ commitment: string; allocation: string }> = [];
  for (const [key, amount] of SYNDICATE) {
    const lender = cast[key]!;
    await submit({
      actAs: [agent],
      commands: [exercise(T.Facility, (await facility()).contractId, "Facility_Invite", { lender, amount, ...deadlines() })],
    });
    const [offer] = await activeContracts(lender, { templates: [T.CommitmentOffer] });
    const commitment = await created(lender, exercise(T.CommitmentOffer, offer!.contractId, "CommitmentOffer_Accept", {}), T.Commitment);
    const [mine] = (await activeContracts(lender, { templates: [T.Commitment] })).filter((c) => c.contractId === commitment);
    const { settlement } = mine!.payload as { settlement: P.SettlementInfo };
    const allocation = await allocate({
      settlement,
      transferLegId: lender,
      transferLeg: { sender: lender, receiver: borrower, amount, instrumentId: usd, meta: { values: {} } },
    });
    commitments.push({ commitment, allocation });
  }

  const { inputs, disclosed } = await executable(usd, commitments.map((c) => c.allocation));
  await submit({
    actAs: [agent],
    disclosedContracts: disclosed,
    commands: [
      exercise(T.Facility, (await facility()).contractId, "Facility_Close", {
        commitments: commitments.map((c, i) => ({ _1: c.commitment, _2: inputs[i] })),
      }),
    ],
  });
  await fixRate(cast, "4.30", "2026-12-15");
  await requestInterest(cast);
}

async function main() {
  await onLedger(coAgent.ledger, async () => {
    console.log(`The agent ${agent.split("::")[0]}, run ${network.threshold} of ${network.nodes.length}:`);
    console.log(`  ${network.nodes.map((n) => `${n.name} (${n.ledger})`).join(", ")}\n`);

    await prepare();
    console.log("Each action proposed by one operator, confirmed by two, executed by the second:");
    await delegating(governedAgent(network, turn, (line) => console.log(`  ${line}`)), syndicate);

    console.log("\nNorthwind funds the interest due, and the operators settle it:");
    await fundRequest(cast, 10_000);
    const before = await facility();
    const legs = requestState(await snapshot(agent), before.payload)!.legs;
    const opening = new Map(await Promise.all(legs.map(async (l) => [l.lender, await cash(l.lender)] as const)));

    for (const node of network.nodes) {
      const alone = await onLedger(node.ledger, () => settlePayment(cast)).then(
        () => null,
        (e: Error) => e.message,
      );
      check(
        alone?.includes("cannot submit as the given submitter") ?? false,
        `${node.name}'s node cannot submit as the agent on its own`,
      );
    }

    let proposal = "";
    await delegating(
      proposingAgent(network, coAgent, (p) => (proposal = p)),
      () => settlePayment(cast),
    );
    await confirm(network, coAgent, proposal);
    const short = await execute(network, coAgent, proposal, { confirmed: 1 }).then(
      () => null,
      (e: unknown) => (e instanceof Refused ? e.message : Promise.reject(e)),
    );
    check(short?.includes("Enough confirmations") ?? false, "CoAgent alone cannot execute: the rules need 2 confirmations");
    const unmoved = await Promise.all(legs.map(async (l) => (await cash(l.lender)) === opening.get(l.lender)));
    check(unmoved.every(Boolean), "no lender was paid on one confirmation");

    connectivity(desk, "offline");
    try {
      await confirm(network, trustee, proposal);
      await execute(network, trustee, proposal, { observer: coAgent });
      for (const leg of legs) {
        const paid = (await cash(leg.lender)) - opening.get(leg.lender)!;
        check(paid === leg.due, `${leg.lender.split("::")[0]} paid ${formatCents(paid)}, with OperationsDesk offline`);
      }
    } finally {
      connectivity(desk, "online");
    }

    const settled = await onLedger(desk.ledger, () =>
      until("OperationsDesk's node to catch up", async () => {
        const f = facilityOf(await snapshot(agent));
        return f && f.payload.pending === null && f.contractId !== before.contractId ? f : undefined;
      }, 120),
    );
    check(settled.payload.paidThrough === "2026-12-15", "OperationsDesk's node caught up: interest paid through 2026-12-15");

    console.log("\nThe agent's record, as OperationsDesk's node holds it:");
    const results = await onLedger(desk.ledger, () => activeContracts(agent, { templates: [EXECUTION_RESULT] }));
    const trail = results
      .map((r) => r.payload as { actionLabel: string; executor: string; confirmers: string[]; executedAt: string })
      .sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    for (const r of trail) {
      console.log(`  ${r.actionLabel.padEnd(20)} executed by ${nameOf(r.executor).padEnd(15)} confirmed by ${r.confirmers.map(nameOf).join(", ")}`);
    }
    const labels = trail.map((r) => r.actionLabel);
    const expected = ["OpenDesk", "ProposeFacility", "Invite", "Invite", "Invite", "Close", "FixRate", "RequestInterest", "Settle"];
    check(labels.join() === expected.map((l) => `Pari${l}`).join(), "every agent action is on the record, in order");
    check(trail.every((r) => r.confirmers.length >= network.threshold), `every action had ${network.threshold} confirmations`);
    const settle = trail.at(-1)!;
    check(
      nameOf(settle.executor) === trustee.name && settle.confirmers.map(nameOf).sort().join() === [coAgent.name, trustee.name].sort().join(),
      "the settlement was confirmed by CoAgent and Trustee, without OperationsDesk",
    );
    console.log(`\nSettled ${formatCents(legs.reduce((sum, l) => sum + l.due, 0n))} of interest on ${DEAL_ID}, two of three.`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
