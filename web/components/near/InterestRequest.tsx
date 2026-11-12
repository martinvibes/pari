// SPDX-License-Identifier: Apache-2.0

"use client";

import { useState } from "react";
import { requestInterest } from "@/app/(app)/near-actions";
import { Tag } from "@/components/Tag";
import { useActionFeed } from "@/components/app/ActionFeed";
import { Lit } from "@/components/app/Screen";

const LABEL = "Request interest";

/** What Citibank's desk sent in 2020, in place of about 7.8 million of interest. */
const MISTAKE = "900,000,000.00";

/** The two figures in the enclave's refusal of a wrong total. */
const FIGURES = /You entered ([\d,.]+); the register says ([\d,.]+)\./;

/** The agent types the period's total by hand, as an operations desk does.
 *  A wrong total is refused, and the refusal is shown here, in the card it was
 *  typed into: what was entered, what the register says, and that nothing moved. */
export function InterestRequest({
  expected,
  period,
  dao,
  tracker,
}: {
  /** The total the register works out, as the field is prefilled. */
  expected: string;
  period: string;
  /** The agent is a two-of-three DAO: the button proposes. */
  dao: boolean;
  tracker: React.ReactNode;
}) {
  const feed = useActionFeed();
  const [total, setTotal] = useState(expected);
  const [pending, setPending] = useState(false);
  const figures = feed.refusal?.message.match(FIGURES) ?? null;
  // Through a DAO the refusal comes back on the second operator's approval.
  const refusal = feed.refusal && (figures || feed.refusal.label === LABEL) ? feed.refusal : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    const id = feed.begin(LABEL);
    try {
      feed.settle(id, await requestInterest(null, form));
    } catch {
      feed.settle(id, { ok: false, message: "The server did not answer. Is the app still running?" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Lit tone={refusal ? "stop" : undefined}>
      {tracker}
      <div className="grid lg:grid-cols-[372px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div>
            <h2 className="text-[17px] font-medium leading-6 text-paper">Request interest</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-pewter">{period}</p>
          </div>
          <label className="block">
            <span className="text-[12.5px] text-pewter">Total to request (USDC)</span>
            <input
              name="total"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="field field-figure"
              required
            />
          </label>
          <button type="submit" disabled={pending} className="btn-solid">
            {pending ? <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-pill border border-ink/40 border-t-ink" /> : null}
            {LABEL}
          </button>
          <p className="text-[12.5px] leading-relaxed text-ash">
            Typed by hand, as an operations desk does. The enclave works the total out from the register and refuses any other figure.
            {dao ? " The agent is a two-of-three DAO: this proposes the request, and a second operator must approve it." : ""}
          </p>
        </form>

        <div className={`border-t p-6 lg:border-l lg:border-t-0 ${refusal ? "border-rose/55 bg-rose/[0.05]" : "border-white/[0.08]"}`} aria-live="polite">
          {refusal ? (
            <>
              <Tag tone="stop">Refused</Tag>
              <p className="mt-3 text-[44px] font-light leading-[1.05] tracking-[-0.025em] text-paper">Nothing moved.</p>
              {figures ? (
                <dl className="mt-5 max-w-[380px] text-[13.5px]">
                  <div className="flex items-baseline justify-between gap-6 border-t border-white/[0.08] py-2.5">
                    <dt className="text-pewter">You entered</dt>
                    <dd className="fig text-[17px] text-rose line-through decoration-rose/70">{figures[1]}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-6 border-y border-white/[0.08] py-2.5">
                    <dt className="text-pewter">The register says</dt>
                    <dd className="fig text-[17px] text-paper">{figures[2]}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 max-w-md text-[14px] leading-relaxed text-smoke">{refusal.message}</p>
              )}
              <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-ash">
                The books and the money are as they were. The refusal is a line of the public record
                {refusal.href ? (
                  <>
                    :{" "}
                    <a href={refusal.href} target="_blank" rel="noreferrer" className="text-sky underline decoration-sky/40 underline-offset-4 transition hover:text-paper">
                      open the transaction
                    </a>
                  </>
                ) : null}
                .
              </p>
              <button type="button" className="btn-ghost mt-4" onClick={() => setTotal(expected)}>
                Enter the register&apos;s total
              </button>
            </>
          ) : (
            <>
              <p className="text-[12.5px] text-pewter">Try the mistake</p>
              <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">
                In 2020 a loan agent meant to pay 7.8 million of interest and wired 900 million.
              </p>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">Type that total here and send it. See what the books do with it.</p>
              <button type="button" className="btn-ghost mt-4" onClick={() => setTotal(MISTAKE)}>
                Enter {MISTAKE}
              </button>
            </>
          )}
        </div>
      </div>
    </Lit>
  );
}
