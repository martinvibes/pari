// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Lit, Steps } from "@/components/app/Screen";
import { Party } from "@/components/app/party";
import { Empty, Field, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { Desk } from "@/components/near/Desk";
import { InterestRequest } from "@/components/near/InterestRequest";
import { CYCLE, cycleAt, Figure, LitTitle, NearUnavailable, Next, PaymentsMade, Register, short, totalDue, TradesTable } from "@/components/near/parts";
import { agentIsDao, openProposals, type DealView, type Proposal, type PublicState, type Request } from "@/lib/near/books";
import { accountOf, OPERATORS, personaIdOf } from "@/lib/near/config";
import { cents, showCents, showRate } from "@/lib/near/money";
import { isDealView, isUnavailable, nameOf, recordSoFar, unavailable, viewAs } from "@/lib/near/session";
import { addMonths, clampDate, formatDate } from "@/lib/pari/dates";
import { daysBetween, formatCents } from "@/lib/pari/money";
import { persona } from "@/lib/pari/personas";

export async function AgentScreen() {
  const [seen, record] = await Promise.all([viewAs(persona("agent")), recordSoFar()]);
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isDealView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: "The agent's envelope is not the agent's view." }} />;
  const { view, chain } = seen;
  const open = view.requests.find((r) => r.status === "open");
  const dao = agentIsDao(chain);
  let waiting: Proposal[] = [];
  if (dao) {
    try {
      waiting = await openProposals(chain);
    } catch (error) {
      return <NearUnavailable problem={unavailable(error)} />;
    }
  }
  const { period } = view;
  const tracker = <Steps steps={CYCLE} at={cycleAt(view)} />;

  return (
    <Desk seen={seen} record={record}>
      <Stats
        items={[
          { label: "Outstanding (USDC)", value: showCents(view.outstanding) },
          {
            label: "All-in rate",
            value: view.rate_bps === null ? "Not fixed" : showRate(view.rate_bps),
            note: period ? `base ${showRate(period.base_rate_bps)} + ${view.facility.margin_bps} bp, ACT/360` : `margin ${view.facility.margin_bps} bp`,
          },
          period
            ? { label: "Period", value: `${formatDate(period.start)} to ${formatDate(period.end)}`, note: `${daysBetween(period.start, period.end)} days` }
            : { label: "Paid through", value: formatDate(view.paid_through) },
          { label: "Matures", value: formatDate(view.facility.maturity) },
        ]}
      />

      {waiting.length > 0 ? (
        <SecondOperator chain={chain} waiting={waiting} tracker={tracker} />
      ) : open ? (
        <OpenRequest request={open} dao={dao} tracker={tracker} />
      ) : period ? (
        <InterestRequest
          expected={formatCents(totalDue(view))}
          period={`Interest from ${formatDate(period.start)} to ${formatDate(period.end)}, on every lender's line of the register.`}
          dao={dao}
          tracker={tracker}
        />
      ) : (
        <FixRate view={view} dao={dao} tracker={tracker} />
      )}

      <div className="grid gap-x-10 gap-y-6 min-[1760px]:grid-cols-2">
        <Register view={view} aside="In three envelopes: agent, borrower, auditor" />
        <Trades view={view} />
      </div>
      <PaymentsMade requests={view.requests} aside="One settlement credits every lender, inside the books" />
    </Desk>
  );
}

/** The agent as a DAO: an action the first operator proposed, waiting for a second. */
function SecondOperator({ chain, waiting, tracker }: { chain: PublicState; waiting: Proposal[]; tracker: React.ReactNode }) {
  return (
    <Lit>
      {tracker}
      <div className="space-y-4 p-6">
        <LitTitle title="Waiting for a second operator">
          <Tag tone="wait">{waiting.length} waiting</Tag>
        </LitTitle>
        <p className="max-w-2xl text-[13px] leading-relaxed text-pewter">
          The agent of this deal is a DAO on NEAR, <span className="fig text-smoke">{short(chain.agent)}</span>, with three operators. One has
          approved. Nothing moves until a second one does.
        </p>
        <ul>
          {waiting.map((proposal) => {
            const left = OPERATORS.filter((id) => !proposal.approvedBy.includes(accountOf(id)));
            return (
              <li key={proposal.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/[0.08] py-3.5">
                <span>
                  <span className="text-[14px] text-paper">{asked(proposal)}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ash">
                    Proposal {proposal.id}, approved by {proposal.approvedBy.map(operatorName).join(", ") || "nobody yet"}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {left.map((id, index) => (
                    <ActionForm
                      key={id}
                      action={act.approveProposal}
                      label={`Approve as ${operatorName(accountOf(id)).toLowerCase()}`}
                      variant={index === 0 ? "solid" : "ghost"}
                      hidden={{ proposal: String(proposal.id), operator: id }}
                      className={index === 0 ? "w-60" : "flex items-center"}
                    />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Lit>
  );
}

function operatorName(account: string): string {
  const index = OPERATORS.indexOf(personaIdOf(account) ?? "");
  return index < 0 ? account : `Operator ${index + 1}`;
}

/** A proposal's action in words. Its arguments are public: the DAO stores them. */
function asked({ method, args }: Proposal): string {
  switch (method) {
    case "fix_rate":
      return `Fix the base rate at ${showRate(Number(args.base_rate_bps))} to ${formatDate(String(args.period_end))}`;
    case "request_interest":
      return `Request interest of ${showCents(String(args.expected_total))}`;
    case "settle":
      return `Settle interest request ${String(args.request_id)}`;
    case "settle_trade":
      return `Settle trade ${String(args.trade_id)}`;
    default:
      return method;
  }
}

const PROPOSES = "The agent is a two-of-three DAO: this proposes the action, and a second operator must approve it.";

function FixRate({ view, dao, tracker }: { view: DealView; dao: boolean; tracker: React.ReactNode }) {
  return (
    <Lit>
      {tracker}
      <div className="grid lg:grid-cols-[372px_minmax(0,1fr)]">
        <div className="space-y-4 p-6">
          <LitTitle title="Fix the rate for the next period" />
          <ActionForm action={act.fixRate} label="Fix rate" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base rate (%)">
                <input name="rate" defaultValue="4.30" inputMode="decimal" className="field fig" required />
              </Field>
              <Field label="Period ends">
                <input
                  name="end"
                  type="date"
                  defaultValue={clampDate(addMonths(view.paid_through, 3), view.paid_through, view.facility.maturity)}
                  min={view.paid_through}
                  max={view.facility.maturity}
                  className="field"
                  required
                />
              </Field>
            </div>
          </ActionForm>
          {dao ? <Next>{PROPOSES}</Next> : null}
        </div>
        <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
          <p className="text-[12.5px] text-pewter">What this sets</p>
          <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">
            What every lender earns from {formatDate(view.paid_through)}.
          </p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">
            The all-in rate is the base rate plus the {view.facility.margin_bps} bp margin, ACT/360. Deal dates are inputs, so the demo moves
            through them on command.
          </p>
        </div>
      </div>
    </Lit>
  );
}

function OpenRequest({ request, dao, tracker }: { request: Request; dao: boolean; tracker: React.ReactNode }) {
  const total = cents(request.total);
  const funded = cents(request.funded);
  const legs = Object.entries(request.legs).sort(([, a], [, b]) => Number(cents(b) - cents(a)));
  return (
    <Lit>
      {tracker}
      <div className="grid lg:grid-cols-[372px_minmax(0,1fr)]">
        <div className="space-y-4 p-6">
          <LitTitle title={funded === 0n ? "Waiting for the borrower" : "Settle the payment"}>
            <Tag tone={funded === 0n ? "wait" : funded === total ? "ok" : "info"}>
              {funded === 0n ? "Not paid in" : funded === total ? "Paid in full" : "Paid in short"}
            </Tag>
          </LitTitle>
          <Figure
            label={`Interest to ${formatDate(request.period_end)} (USDC)`}
            note={funded === 0n ? "Nothing paid in yet." : `${formatCents(funded)} paid in by the borrower.`}
          >
            {formatCents(total)}
          </Figure>
          <ActionForm
            action={act.settlePayment}
            label={funded === 0n ? "Settle" : funded === total ? `Settle all ${legs.length} lenders` : "Settle the short payment pro rata"}
            hidden={{ request: String(request.id) }}
            disabled={funded === 0n}
          />
          <Next>
            {funded === 0n
              ? "Northwind pays from its own desk: press 2."
              : funded === total
                ? "One step credits every lender, or none."
                : "Every lender gets the same fraction; the rest stays owed."}
            {dao && funded > 0n ? ` ${PROPOSES}` : ""}
          </Next>
        </div>
        <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
          <div className="flex items-baseline justify-between gap-4 pb-2.5">
            <h3 className="text-[13.5px] font-medium text-paper">Each lender&apos;s share</h3>
            <span className="text-[12px] text-ash">In the agent&apos;s envelope; the chain shows the total</span>
          </div>
          <TableScroll>
            <table className="table-data">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th className="text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {legs.map(([lender, due]) => (
                  <tr key={lender}>
                    <td className="text-paper">
                      <Party name={nameOf(lender)} />
                    </td>
                    <td className="fig text-right text-paper">{showCents(due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </div>
    </Lit>
  );
}

function Trades({ view }: { view: DealView }) {
  return (
    <Panel title="Trades to settle" aside="Cash against loan, in one step or not at all">
      {view.trades.length === 0 ? (
        <Empty>No trades. A lender offers one from its own desk, and the buyer accepts it.</Empty>
      ) : (
        <TradesTable
          trades={view.trades}
          prices
          under={(trade) =>
            trade.screening ? <p className="mt-1 max-w-[18rem] whitespace-normal text-[12px] leading-relaxed text-rose">{sentence(trade.screening)}</p> : null
          }
          act={(trade) =>
            trade.status === "accepted" ? (
              <ActionForm action={act.settleTrade} label="Settle" variant="ghost" hidden={{ trade: String(trade.id) }} />
            ) : trade.status === "offered" ? (
              <span className="text-[12px] text-ash">Awaiting the buyer</span>
            ) : null
          }
        />
      )}
    </Panel>
  );
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
