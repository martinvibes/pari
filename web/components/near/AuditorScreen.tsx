// SPDX-License-Identifier: Apache-2.0

import { Empty, PageHeader, Panel, Stats, TableScroll, Tag, type Tone } from "@/components/app/ui";
import { DealFacts, NearUnavailable, PaymentsMade, plural, Register, registerRows, Sealed, Sides, TradeStatus } from "@/components/near/parts";
import type { DealView, PublicState } from "@/lib/near/books";
import { UNITS_PER_CENT } from "@/lib/near/config";
import { cents, interestDue, showCents } from "@/lib/near/money";
import { isDealView, isUnavailable, viewAs } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { persona } from "@/lib/pari/personas";

type Finding = { claim: string; detail: string; state: "ok" | "fail" | "none" };

const FINDING_TAG: Record<Finding["state"], { tone: Tone; text: string }> = {
  ok: { tone: "ok", text: "Holds" },
  fail: { tone: "stop", text: "Broken" },
  none: { tone: "neutral", text: "None yet" },
};

const sum = (values: Array<string | null | undefined>) => values.reduce((total, value) => total + cents(value), 0n);

/** The auditor's own arithmetic over its envelope, checked against the public chain. */
function audit(view: DealView, chain: PublicState): Finding[] {
  const lines = registerRows(view);
  const registered = sum(lines.map(([, entry]) => entry.principal));
  const findings: Finding[] = [
    {
      claim: "The register adds up to the principal outstanding",
      detail: `${plural(lines.length, "lender")} hold ${formatCents(registered)}; outstanding is ${showCents(view.outstanding)}.`,
      state: registered === cents(view.outstanding) ? "ok" : "fail",
    },
  ];

  const open = view.requests.find((r) => r.status === "open");
  const { period, rate_bps } = view;
  findings.push({
    claim: "Each leg of the open request is ACT/360 interest on the register",
    detail: open ? `Recomputed ${Object.keys(open.legs).length} legs for the request to ${formatDate(open.period_end)}.` : "No request is open.",
    state: !open || !period || rate_bps === null
      ? "none"
      : lines.every(([lender, entry]) => interestDue(entry, rate_bps, period.end) === cents(open.legs[lender])) &&
          sum(Object.values(open.legs)) === cents(open.total)
        ? "ok"
        : "fail",
  });

  for (const request of view.requests.filter((r) => r.status === "settled")) {
    const onChain = chain.requests[String(request.id)];
    const paid = sum(Object.values(request.paid));
    const total = cents(request.total);
    const legs = Object.entries(request.legs);
    // A short payment pays every lender the same fraction of what it is owed, rounded down to the cent.
    const funded = cents(request.funded);
    const proRata = legs.every(([lender, due]) => cents(request.paid[lender]) === (cents(due) * funded) / total);
    findings.push({
      claim: `Interest to ${formatDate(request.period_end)}: the lenders' payments add up to the one total on the chain`,
      detail: `${plural(legs.length, "lender")} paid ${formatCents(paid)} of ${formatCents(total)} requested. The chain shows ${showCents(onChain?.credited)} credited from ${showCents(onChain?.funded)} paid in.`,
      state: onChain && paid === cents(onChain.credited) && paid <= cents(onChain.funded) && proRata ? "ok" : "fail",
    });
  }

  findings.push({
    claim: "This envelope holds no trade price and no DQ list",
    detail: `${plural(view.trades.length, "trade")} seen by seller, buyer, size and date.`,
    state: view.trades.every((t) => t.price_ppm === undefined && t.cash === undefined) && !("dq_list" in view) ? "ok" : "fail",
  });
  return findings;
}

export async function AuditorScreen() {
  const seen = await viewAs(persona("auditor"));
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isDealView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: "The auditor's envelope is not the auditor's view." }} />;
  const { view, chain } = seen;
  const settled = view.requests.filter((r) => r.status === "settled");
  const paid = sum(settled.flatMap((r) => Object.values(r.paid)));
  const findings = audit(view, chain);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="The borrower's auditor"
        title="Auditor"
        party="Auditor"
        lede="Read-only. The auditor's envelope holds the register through every payment and trade, so each figure can be worked out again and held against the public chain. It holds no trade price and no DQ list."
      >
        <DealFacts chain={chain} />
      </PageHeader>

      <Stats
        items={[
          { label: "Outstanding (USDC)", value: showCents(view.outstanding) },
          { label: "Lenders", value: String(registerRows(view).length) },
          { label: "Payments settled", value: String(settled.length) },
          { label: "Held by the contract", value: formatCents(BigInt(chain.held) / UNITS_PER_CENT) },
        ]}
      />

      <Panel
        title="Worked out again"
        note={`The auditor's own arithmetic over its envelope, held against what anyone can read on the chain. Lenders have been paid ${formatCents(paid)} in all.`}
      >
        <ul>
          {findings.map((finding) => (
            <li key={finding.claim} className="flex flex-col gap-2 border-t border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="text-paper">{finding.claim}</span>
                <span className="mt-0.5 block text-xs text-ash">{finding.detail}</span>
              </span>
              <Tag tone={FINDING_TAG[finding.state].tone}>{FINDING_TAG[finding.state].text}</Tag>
            </li>
          ))}
        </ul>
      </Panel>

      <Register view={view} note="Every lender's principal and interest, as the agent keeps it." />
      <PaymentsMade requests={view.requests} note="Each lender's share of every settled payment. The public chain shows one total per payment." />

      <Panel title="Trades" note="Who sold to whom, how much and when. Prices are between the seller, the buyer and the agent.">
        {view.trades.length === 0 ? (
          <Empty>No trades yet.</Empty>
        ) : (
          <TableScroll>
            <table className="table-data">
              <thead>
                <tr>
                  <th>Seller → buyer</th>
                  <th className="text-right">Par</th>
                  <th>Trade date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...view.trades].reverse().map((trade) => (
                  <tr key={trade.id}>
                    <td>
                      <Sides trade={trade} />
                    </td>
                    <td className="text-right">{showCents(trade.par)}</td>
                    <td className="text-smoke">{formatDate(trade.trade_date)}</td>
                    <td>
                      <TradeStatus trade={trade} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Sealed seen={seen} />
    </div>
  );
}
