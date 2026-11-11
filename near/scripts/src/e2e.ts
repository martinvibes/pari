// Plays the Northwind deal end to end on testnet, each action signed by the
// one account entitled to it, and checks what each party can read afterwards.
//
// Run it on a fresh deal: `npm run setup -- --fresh && npm run e2e`.
// On a deal set up with --dao the agent is a DAO: each of its actions is
// proposed and approved by two of three operators, and the settlement is
// played one approval at a time to show that the first moves nothing.
//
// 1. First period: the agent fixes the rate, mistypes the total (refused),
//    requests the right total, the borrower pays, one settlement pays three
//    lenders, and Alder withdraws part of its interest as USDC.
// 2. Second period: Rival (on the borrower's DQ list) tries to buy and is not
//    settled; Delta buys 10m from Alder at a sealed price, cash against loan.

import { isDeepStrictEqual } from "node:util";
import {
  accountOf,
  BASE_RATE_BPS,
  BUYER_CASH,
  DAO,
  FIRST_PERIOD_DUE as DUE,
  FIRST_PERIOD_END,
  FIRST_PERIOD_TOTAL as TOTAL,
  LEDGER,
  MISTYPED_TOTAL as MISTYPED,
  money,
  OPERATORS,
  SECOND_PERIOD_END,
  TRADE,
  UNITS_PER_CENT,
  USDC,
  WITHDRAWAL,
  type Persona,
} from "./lib/deal.js";
import { act, approve, openEnvelope, payIn, propose, sealForEnclave, state, view, type Outcome, type Sent } from "./lib/ledger.js";
import { viewKeyFor } from "./lib/viewkeys.js";

const [borrower, alder, birch, cedar, delta, rival, auditor] = (
  ["northwind", "alder", "birch", "cedar", "delta", "rival", "auditor"] satisfies Persona[]
).map(accountOf) as [string, string, string, string, string, string, string];
const deal = await state();
const agent = deal.agent;

/** A party's opened envelope. Amounts are cents in strings. */
interface View {
  cash: string;
  position?: { principal: string; carried: string } | null;
  payments?: { due: string; paid: string | null }[];
  trades?: { id: number; buyer: string; status: string; price_ppm?: number; screening?: string | null }[];
  requests?: { legs: Record<string, string>; paid: Record<string, string> }[];
  register?: Record<string, { principal: string }>;
  dq_list?: string[];
}

function check(condition: boolean, what: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${what}`);
  console.log(`    ✓ ${what}`);
}

async function ok(what: string, sent: Promise<Sent<Outcome>>): Promise<Outcome> {
  const { url, result } = await sent;
  if (!result?.ok) throw new Error(`${what} was refused: ${result?.refused ?? "no answer"} (${url})`);
  console.log(`  ${what}\n    ${url}`);
  return result;
}

async function seen(accountId: string): Promise<View> {
  const opened = await openEnvelope<View>(accountId, await viewKeyFor(accountId));
  if (!opened) throw new Error(`${accountId} has no envelope`);
  return opened;
}

/** The DAO's settlement, one operator at a time: the first approval must leave
 *  the books and every lender exactly where they were. */
async function settleInTwoApprovals(requestId: number): Promise<Sent<Outcome>> {
  const before = await state();
  const proposed = await propose("settle", { request_id: requestId });
  console.log(`  operator 1 proposes the settlement\n    ${proposed.url}`);
  const first = await approve(OPERATORS[0]!, proposed.result);
  console.log(`  operator 1 approves\n    ${first.url}`);
  const after = await state();
  check(after.seq === before.seq && after.root === before.root, "one approval of three: the books have not moved");
  check((await seen(alder)).cash === "0", "and no lender has been paid");
  const second = await approve(OPERATORS[1]!, proposed.result);
  if (!second.result) throw new Error(`the DAO's settlement did not reach the ledger (${second.url})`);
  return { ...second, result: second.result };
}

async function usdcOf(accountId: string): Promise<bigint> {
  return BigInt(await view<string>(USDC, "ft_balance_of", { account_id: accountId })) / UNITS_PER_CENT;
}

console.log(`Deal ${deal.deal_id} on ${LEDGER}`);
if (agent === DAO) console.log(`The agent is the DAO ${DAO}: two of ${OPERATORS.join(", ")} approve each action`);
console.log("\nFirst period: interest");

await ok("agent fixes the rate at 4.30% + 3.50%", act(agent, "fix_rate", { base_rate_bps: BASE_RATE_BPS, period_end: FIRST_PERIOD_END }));

const mistyped = await act(agent, "request_interest", { expected_total: MISTYPED.toString() });
console.log(`  agent types ${money(MISTYPED)} by mistake\n    ${mistyped.url}`);
check(mistyped.result.ok === false, `refused: "${mistyped.result.refused}"`);
check(isDeepStrictEqual((await state()).requests, {}), "nothing was requested");

const requested = await ok(`agent requests ${money(TOTAL)}`, act(agent, "request_interest", { expected_total: TOTAL.toString() }));
const requestId = Number(requested.public?.request_id);

const paid = await payIn(borrower, TOTAL, { kind: "pay", request_id: requestId });
console.log(`  borrower pays ${money(TOTAL)} in test USDC\n    ${paid.url}`);
check(BigInt(paid.result) === TOTAL * UNITS_PER_CENT, "the contract kept the whole payment");

const settled =
  agent === DAO
    ? await ok("operator 2 approves, and the agent settles: three lenders paid in one step", settleInTwoApprovals(requestId))
    : await ok("agent settles: three lenders paid in one step", act(agent, "settle", { request_id: requestId }));
check(settled.public?.credited === TOTAL.toString(), `the chain shows one total, ${money(TOTAL)}, and no lender's share`);

for (const lender of [alder, birch, cedar]) {
  const mine = await seen(lender);
  check(mine.cash === DUE[lender]!.toString(), `${lender} opens its envelope: paid ${money(DUE[lender]!)}`);
}
const alderView = JSON.stringify(await seen(alder));
check(!alderView.includes(birch) && !alderView.includes(cedar), "Alder's envelope says nothing about Birch or Cedar");
const audit = await seen(auditor);
check(isDeepStrictEqual(audit.requests?.[0]?.paid, Object.fromEntries(Object.entries(DUE).map(([l, c]) => [l, c.toString()]))), "the auditor sees every lender's payment");

const before = await usdcOf(alder);
const alderCash = DUE[alder]! - WITHDRAWAL;
await ok(`Alder withdraws ${money(WITHDRAWAL)}`, act(alder, "withdraw", { amount: WITHDRAWAL.toString() }));
check((await usdcOf(alder)) - before === WITHDRAWAL, "Alder's wallet received exactly that in test USDC");
check((await seen(alder)).cash === alderCash.toString(), `Alder's cash in the books is now ${money(alderCash)}`);

console.log("\nSecond period: a trade, screened against the borrower's DQ list");

await ok("agent fixes the rate for the second period", act(agent, "fix_rate", { base_rate_bps: BASE_RATE_BPS, period_end: SECOND_PERIOD_END }));
await ok("borrower sets its DQ list (sealed)", act(borrower, "set_dq", { sealed: await sealForEnclave({ list: [rival] }) }));

for (const buyer of [rival, delta]) {
  const funded = await payIn(buyer, BUYER_CASH, { kind: "cash" });
  console.log(`  ${buyer} pays ${money(BUYER_CASH)} into the deal\n    ${funded.url}`);
}

async function trade(buyer: string): Promise<{ id: number; settled: boolean }> {
  const offer = { buyer, par: TRADE.par.toString(), price_ppm: TRADE.price_ppm, trade_date: TRADE.date };
  const offered = await ok(`Alder offers ${money(TRADE.par)} to ${buyer} (sealed)`, act(alder, "offer_trade", { sealed: await sealForEnclave(offer) }));
  const id = Number(offered.public?.trade_id);
  await ok(`${buyer} accepts`, act(buyer, "accept_trade", { trade_id: id }));
  const result = await ok("agent settles the trade", act(agent, "settle_trade", { trade_id: id }));
  return { id, settled: result.public?.settled === true };
}

const refused = await trade(rival);
check(!refused.settled, "Rival's trade was not settled");
const rivalView = await seen(rival);
check(rivalView.trades?.[0]?.status === "not_settled" && !JSON.stringify(rivalView).includes("DQ"), "Rival sees 'not settled' and no reason");
check(rivalView.cash === BUYER_CASH.toString() && !rivalView.position, "Rival's cash is untouched and it holds no loan");
check((await seen(agent)).trades?.[0]?.screening === "the buyer is on the DQ list", "the agent sees why");

const bought = await trade(delta);
check(bought.settled, "Delta's trade settled, cash against loan, in one step");
const deltaView = await seen(delta);
check(deltaView.position?.principal === TRADE.par.toString(), `Delta holds ${money(TRADE.par)} of the loan`);
check(deltaView.cash === (BUYER_CASH - TRADE.cash).toString(), `Delta paid ${money(TRADE.cash)}`);
check(deltaView.trades?.[0]?.price_ppm === TRADE.price_ppm, "Delta sees the price in its own envelope");
const sellerView = await seen(alder);
check(sellerView.position?.principal === "4000000000", "Alder holds 40,000,000.00");
check(sellerView.position?.carried === TRADE.seller_carried.toString(), `Alder keeps the 30 days of interest it earned: ${money(TRADE.seller_carried)} (65,000.00 of it on the part sold)`);
check(sellerView.cash === (alderCash + TRADE.cash).toString(), `Alder received ${money(TRADE.cash)}`);
for (const party of [borrower, auditor]) {
  const theirs = JSON.stringify(await seen(party));
  check(theirs.includes(delta) && !theirs.includes("price_ppm"), `${party} sees the trade but not the price`);
}
check(!JSON.stringify(await seen(auditor)).includes("dq_list"), "the auditor does not see the DQ list");

const record = await view<{ action: string; caller: string; ok: boolean; detail: string }[]>(LEDGER, "history", { limit: 200 });
check(record.some((line) => !line.ok && line.caller === agent && line.detail.includes(money(MISTYPED))), "the chain's public record shows the refusal");
check(!JSON.stringify(record).includes(TRADE.price_ppm.toString()), "and no line of it mentions the trade price");

const final = await state();
check(final.frozen === null, "no money rule was ever broken");
console.log(`\nAll green. Books at seq ${final.seq}, root ${final.root}`);
