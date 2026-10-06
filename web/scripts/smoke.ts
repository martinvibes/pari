// SPDX-License-Identifier: Apache-2.0

// End-to-end check of the app against a live ledger. It drives a freshly
// seeded demo deal through every write the screens offer, each as the one
// party entitled to it, and checks the ledger's figures (the same ones the
// Daml tests assert) and every privacy claim against each party's own view.
//
//   make smoke    (with `make sandbox` running; seeds a deal of its own)

import { loadCast, partyOf } from "@/lib/ledger/cast";
import { qualifiedName, witnessed } from "@/lib/ledger/client";
import { auditTrail } from "@/lib/pari/audit";
import { PRIVACY_CHECKS } from "@/lib/pari/checks";
import { balanceCents, facilityOf, instrumentOf, positionOf, requestState, strandedAllocations } from "@/lib/pari/deal";
import { formatCents, formatMoney, toCents } from "@/lib/pari/money";
import * as ops from "@/lib/pari/operations";
import { PERSONAS, persona } from "@/lib/pari/personas";
import { namer } from "@/lib/pari/session";
import { snapshot } from "@/lib/pari/snapshot";

const cast = loadCast();
const instrument = instrumentOf(cast);
const party = (id: string) => partyOf(cast, persona(id));

// Canton Coin charges its holding fees to the payer, so a payer's change comes
// back short by a fraction of a coin; on Canton Coin each cash figure may fall
// short of the model's by up to this much. Every leg a lender or seller
// receives is still checked to the cent, by the auditor's replay below.
const FEES = cast.instrument === "Amulet" ? 100n : 0n;

// What each party held beyond the deal's own cash when the smoke test began:
// nothing on a fresh sandbox; on DevNet, faucet headroom and earlier coins.
const opening = new Map<string, bigint>();
const LENDER_IDS = ["alder", "birch", "cedar", "delta"];

const DQ_REFUSAL = "Pari: buyer is cleared against the borrower's DQ list";
const WALL_REFUSAL = "Pari: MNPI reaches private-side lenders only";
const MNPI_DOC = "q3-2026-management-accounts";
const PUBLIC_DOC = "credit-agreement";

// Reading the ledger ------------------------------------------------------------

async function balance(id: string): Promise<bigint> {
  return balanceCents(await snapshot(party(id)), party(id), instrument) - (opening.get(id) ?? 0n);
}

async function cash(id: string): Promise<string> {
  return formatCents(await balance(id));
}

/** Each party's cash is the model's figure, less at most the payer's fees. */
async function cashIs(expected: Record<string, string>, what: string) {
  const ids = Object.keys(expected);
  const actual = new Map(await Promise.all(ids.map(async (id) => [id, await balance(id)] as const)));
  const off = ids.filter((id) => {
    const short = toCents(expected[id]!.replaceAll(",", "")) - actual.get(id)!;
    return short < 0n || short > FEES;
  });
  if (off.length > 0) {
    const got = Object.fromEntries([...actual].map(([id, c]) => [id, formatCents(c)]));
    throw new Error(`${what}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`);
  }
}

async function facility() {
  const found = facilityOf(await snapshot(cast.agent));
  if (!found) throw new Error("The facility is not on the ledger.");
  return found.payload;
}

async function register(field: "principal" | "carried"): Promise<Record<string, string>> {
  const f = await facility();
  const byParty = new Map(f.register);
  return Object.fromEntries(
    LENDER_IDS.flatMap((id) => {
      const entry = byParty.get(party(id));
      return entry ? [[id, formatMoney(entry[field])]] : [];
    }),
  );
}

async function principals(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      LENDER_IDS.map(async (id) => {
        const position = positionOf(await snapshot(party(id)), party(id));
        return [id, position ? formatMoney(position.payload.principal) : "none"];
      }),
    ),
  );
}

async function openLegs(): Promise<Record<string, string>> {
  const state = requestState(await snapshot(cast.agent), await facility());
  if (!state) throw new Error("No payment request is open.");
  const name = namer(cast);
  return Object.fromEntries(state.legs.map((leg) => [name(leg.lender).toLowerCase(), formatCents(leg.due)]));
}

async function lockedFor(id: string): Promise<string> {
  const stranded = strandedAllocations(await snapshot(party(id)), party(id));
  return formatCents(stranded.reduce((sum, a) => sum + toCents(a.payload.allocation.transferLeg.amount), 0n));
}

async function agentDocument(docId: string) {
  const doc = (await snapshot(cast.agent)).documents.find((d) => d.payload.docId === docId);
  if (!doc) throw new Error(`Document ${docId} is missing.`);
  return doc.contractId;
}

async function election(id: string) {
  const found = (await snapshot(cast.agent)).elections.find((e) => e.payload.lender === party(id));
  if (!found) throw new Error(`${id} has made no information election.`);
  return found.contractId;
}

async function documentsHeldBy(id: string): Promise<string[]> {
  return (await snapshot(party(id))).accesses.map((a) => a.payload.docId).sort();
}

// Checking ----------------------------------------------------------------------

function same(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}\n      expected ${e}\n      got      ${a}`);
}

/** The ledger must refuse `work`, for the model's `reason`. */
async function refused(work: Promise<unknown>, reason: string) {
  try {
    await work;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(reason)) return;
    throw new Error(`refused, but not because "${reason}": ${message}`);
  }
  throw new Error(`the ledger accepted it; expected "${reason}"`);
}

async function privacyHolds() {
  const seen = await Promise.all(
    PERSONAS.map(async (p) => {
      const id = partyOf(cast, p);
      return { persona: p, view: { cast, party: id, s: await snapshot(id), name: namer(cast) } };
    }),
  );
  const broken = PRIVACY_CHECKS.filter((check) => !check.holds(seen)).map((check) => check.claim);
  same(broken, [], "privacy claims broken");
}

async function offerTo(buyer: string, seller: string) {
  const offer = (await snapshot(party(buyer))).offers.find((o) => o.payload.seller === party(seller));
  if (!offer) throw new Error(`${buyer} has no offer from ${seller}.`);
  return offer.contractId;
}

async function ticketFor(buyer: string) {
  const ticket = (await snapshot(cast.agent)).tickets.find((t) => t.payload.buyer === party(buyer));
  if (!ticket) throw new Error(`The agent holds no ticket for ${buyer}.`);
  return ticket.contractId;
}

async function notice() {
  const found = (await snapshot(cast.agent)).notices[0];
  if (!found) throw new Error("The agent holds no prepayment notice.");
  return found.contractId;
}

// Templates whose contracts carry a trade price, the DQ list or the data room.
const NEVER_TO_AUDITOR = [
  "Pari.Trade:TradeOffer",
  "Pari.Trade:TradeTicket",
  "Pari.Screening:DqList",
  "Pari.Disclosure:Document",
  "Pari.Disclosure:DocumentAccess",
  "Pari.Disclosure:InfoElection",
];

async function audit() {
  return auditTrail(party("auditor"), namer(cast));
}

// The deal ----------------------------------------------------------------------

const steps: Array<[string, () => Promise<void>]> = [
  [
    "seeded: 100m closed, first period fixed at 4.30% + 350bp",
    async () => {
      const f = await facility();
      same(f.period?.end, "2026-12-15", "period end");
      same(await register("principal"), { alder: "50,000,000.00", birch: "30,000,000.00", cedar: "20,000,000.00" }, "register");
      const seeded = { northwind: "105,000,000.00", alder: "0.00", birch: "0.00", cedar: "0.00", delta: "20,000,000.00", rival: "20,000,000.00", agent: "0.00" };
      if (FEES > 0n) {
        for (const [id, amount] of Object.entries(seeded)) opening.set(id, (await balance(id)) - toCents(amount.replaceAll(",", "")));
      }
      await cashIs(seeded, "cash");
      await privacyHolds();
    },
  ],
  [
    "Alder sells 10m to Delta at 99.50, trade date 15 Oct: delivery versus payment",
    async () => {
      await ops.offerTrade(cast, party("alder"), {
        buyer: party("delta"),
        amount: "10000000",
        pricePercent: "99.50",
        tradeDate: "2026-10-15",
      });
      await ops.acceptTrade(cast, party("delta"), await offerTo("delta", "alder"));
      await ops.screenBuyer(cast, party("delta"));
      await ops.settleTrade(cast, await ticketFor("delta"));
      await cashIs({ alder: "9,950,000.00", delta: "10,050,000.00" }, "cash");
      same(await register("principal"), { alder: "40,000,000.00", birch: "30,000,000.00", cedar: "20,000,000.00", delta: "10,000,000.00" }, "register principal");
      same((await register("carried")).alder, "325,000.00", "interest Alder earned to the trade date");
      same(await principals(), { alder: "40,000,000.00", birch: "30,000,000.00", cedar: "20,000,000.00", delta: "10,000,000.00" }, "positions");
    },
  ],
  [
    "Cedar sells to Rival: the DQ list refuses it, the agent declines, Rival takes its cash back",
    async () => {
      await ops.offerTrade(cast, party("cedar"), {
        buyer: party("rival"),
        amount: "5000000",
        pricePercent: "99",
        tradeDate: "2026-10-15",
      });
      await ops.acceptTrade(cast, party("rival"), await offerTo("rival", "cedar"));
      await ops.screenBuyer(cast, party("rival"));
      const ticket = await ticketFor("rival");
      await refused(ops.settleTrade(cast, ticket), DQ_REFUSAL);
      await ops.declineTrade(cast, ticket);
      same(await lockedFor("rival"), "4,950,000.00", "Rival's cash locked to the declined trade");
      await ops.releaseCash(party("rival"));
      await cashIs({ rival: "20,000,000.00" }, "Rival's cash");
      same((await principals()).cedar, "20,000,000.00", "Cedar's position");
    },
  ],
  [
    "Birch's offers: Delta rejects one, Birch withdraws the other",
    async () => {
      const trade = { buyer: party("delta"), amount: "1000000", pricePercent: "100", tradeDate: "2026-10-15" };
      await ops.offerTrade(cast, party("birch"), trade);
      await ops.rejectTrade(party("delta"), await offerTo("delta", "birch"));
      await ops.offerTrade(cast, party("birch"), trade);
      await ops.withdrawOffer(party("birch"), await offerTo("delta", "birch"));
      same((await snapshot(party("birch"))).offers.length, 0, "Birch's open offers");
    },
  ],
  [
    "interest request, funded, then cancelled: Northwind takes its cash back",
    async () => {
      await ops.requestInterest(cast);
      same(await openLegs(), { alder: "853,666.66", birch: "591,500.00", cedar: "394,333.33", delta: "132,166.66" }, "interest legs");
      await ops.fundRequest(cast, 10000);
      await ops.cancelRequest(cast);
      same(await lockedFor("northwind"), "1,971,666.65", "Northwind's cash locked to the cancelled request");
      await ops.releaseCash(party("northwind"));
      await cashIs({ northwind: "105,000,000.00" }, "Northwind's cash");
    },
  ],
  [
    "interest paid short at 50%: every lender gets half, the rest stays owed",
    async () => {
      await ops.requestInterest(cast);
      await ops.fundRequest(cast, 5000);
      await ops.settlePayment(cast);
      await cashIs(
        { alder: "10,376,833.33", birch: "295,750.00", cedar: "197,166.66", delta: "10,116,083.33" },
        "lender cash",
      );
      same(await register("carried"), { alder: "426,833.33", birch: "295,750.00", cedar: "197,166.67", delta: "66,083.33" }, "interest still owed");
      same((await facility()).paidThrough, "2026-12-15", "paid through");
    },
  ],
  [
    "Northwind prepays 25m: pro rata to every lender, in one transaction",
    async () => {
      await ops.noticePrepayment(cast, "25000000");
      await ops.acceptPrepayment(cast, await notice());
      await ops.fundRequest(cast, 10000);
      await ops.settlePayment(cast);
      same(await principals(), { alder: "30,000,000.00", birch: "22,500,000.00", cedar: "15,000,000.00", delta: "7,500,000.00" }, "positions");
      same(await register("principal"), await principals(), "register agrees with every position");
      await cashIs({ northwind: "79,014,166.68" }, "Northwind's cash");
    },
  ],
  [
    "next period to 15 Mar 2027: the unpaid half rolls into the request, then paid in full",
    async () => {
      await ops.fixRate(cast, "4.30", "2027-03-15");
      await ops.requestInterest(cast);
      same(await openLegs(), { alder: "1,011,833.33", birch: "734,500.00", cedar: "489,666.67", delta: "212,333.33" }, "interest legs");
      await ops.fundRequest(cast, 10000);
      await ops.settlePayment(cast);
      same(await register("carried"), { alder: "0.00", birch: "0.00", cedar: "0.00", delta: "0.00" }, "interest owed");
      same((await facility()).paidThrough, "2027-03-15", "paid through");
    },
  ],
  [
    "information wall: MNPI reaches the private side only, and crossing is the lender's choice",
    async () => {
      const mnpi = await agentDocument(MNPI_DOC);
      await refused(ops.shareDocument(cast, mnpi, await election("birch")), WALL_REFUSAL);
      await ops.shareDocument(cast, mnpi, await election("alder"));
      await ops.setSide(cast, party("delta"), "PublicSide");
      await ops.shareDocument(cast, await agentDocument(PUBLIC_DOC), await election("delta"));
      await ops.setSide(cast, party("birch"), "PrivateSide");
      await ops.shareDocument(cast, mnpi, await election("birch"));
      same(
        { alder: await documentsHeldBy("alder"), birch: await documentsHeldBy("birch"), delta: await documentsHeldBy("delta"), cedar: await documentsHeldBy("cedar") },
        { alder: [MNPI_DOC], birch: [MNPI_DOC], delta: [PUBLIC_DOC], cedar: [] },
        "documents each lender holds",
      );
    },
  ],
  [
    "Northwind lifts Rival from its DQ list: the next screening clears",
    async () => {
      await ops.updateDqList(cast, []);
      await ops.screenBuyer(cast, party("rival"));
      const s = await snapshot(cast.borrower);
      same(s.dqLists[0]?.payload.disqualified.map.length, 0, "parties on the DQ list");
      const latest = s.screenings
        .filter((r) => r.payload.candidate === party("rival"))
        .sort((a, b) => (a.payload.screenedAt < b.payload.screenedAt ? 1 : -1))[0];
      same(latest?.payload.cleared, true, "Rival's latest screening");
    },
  ],
  [
    "the auditor replays the deal from the ledger: every check holds, and it never received a price, the DQ list or a document",
    async () => {
      const trail = await audit();
      const failed = trail.rows.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => `${r.event}: ${c.label}`));
      same(failed, [], "audit checks failed");
      same(trail.reconciliation.filter((f) => f.state !== "ok").map((f) => f.label), [], "reconciliation findings not holding");
      same(
        NEVER_TO_AUDITOR.filter((t) => trail.received.has(t)),
        [],
        "templates among the events the auditor witnessed",
      );
      same(trail.rows.filter((r) => r.event === "Interest paid").length, 2, "interest payments in the trail");
      // Recording a trade uses up the buyer's clearance inside the facility's
      // choice, so the auditor witnesses that, and nothing else of screening.
      const screenings = (await witnessed(party("auditor"))).flatMap((tx) =>
        tx.events
          .filter((e) => qualifiedName(e.templateId) === "Pari.Screening:ScreeningResult")
          .map((e) => (e.kind === "exercised" ? e.choice : "created")),
      );
      same(screenings, ["Archive"], "what the auditor witnessed of screening: the one trade's clearance, used up");
    },
  ],
  [
    "Northwind removes its auditor: the auditor sees nothing new, then is appointed again",
    async () => {
      const before = (await audit()).transactions;
      await ops.removeAuditor(cast);
      same((await snapshot(party("auditor"))).facilities.length, 0, "facilities the removed auditor holds");
      await ops.updateDqList(cast, []);
      await ops.fixRate(cast, "4.30", "2027-06-15");
      same((await audit()).transactions, before + 1, "transactions the auditor witnessed after removal");
      await ops.appointAuditor(cast);
      same((await snapshot(party("auditor"))).facilities.length, 1, "facilities the reappointed auditor holds");
    },
  ],
  [
    "no money created or lost, the agent never held any, and every privacy claim holds",
    async () => {
      const everyone = ["northwind", "alder", "birch", "cedar", "delta", "rival", "agent"];
      const total = (await Promise.all(everyone.map(balance))).reduce((sum, c) => sum + c, 0n);
      const lost = 14_500_000_000n - total;
      if (lost < 0n || lost > FEES * BigInt(everyone.length)) {
        throw new Error(`cash across every party: expected 145,000,000.00, got ${formatCents(total)}`);
      }
      same(await cash("agent"), "0.00", "the agent's cash");
      await privacyHolds();
    },
  ],
];

async function main() {
  console.log(`Pari smoke test against ${process.env.PARI_LEDGER_URL ?? "http://localhost:7575"}\n`);
  for (const [name, check] of steps) {
    try {
      await check();
      console.log(`  ok    ${name}`);
    } catch (error) {
      console.log(`  FAIL  ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  console.log(`\n${steps.length} checks passed.`);
}

void main();
