// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

// The README's table, row for row.
const READERS = [
  {
    reader: "Agent",
    sees: "The whole register, every payment leg, every trade with its price, and whether a buyer passed screening",
    never: "The DQ list itself",
  },
  {
    reader: "Borrower",
    sees: "The register, every payment, every trade (seller, buyer, size, date), its own DQ list",
    never: "Trade prices",
  },
  {
    reader: "Each lender",
    sees: "Its own position, its own payments and cash, its own trades with their prices",
    never: "Any other lender's position or payment, the register, the DQ list",
  },
  {
    reader: "A buyer",
    sees: "Its own trades, and its position once it has bought in",
    never: "The DQ list. A refused buyer is told \"not settled\" and no reason",
  },
  {
    reader: "Auditor",
    sees: "The register through every payment and trade, with figures it can recompute",
    never: "Trade prices, the DQ list",
  },
  {
    reader: "The public chain",
    sees: "The facility's name, the agent's and the borrower's accounts, which accounts take part, one total per interest request, how much was paid in and credited, every deposit and withdrawal, who sent each action, fingerprints, and envelope ciphertext",
    never: "Positions, per-lender payments, trade sizes and prices, the DQ list, why a trade failed",
  },
];

// The eight claims /visibility evaluates on every load (web/lib/near/checks.ts).
const CLAIMS = [
  "The public chain names no lender's position or payment, and no trade's size or price",
  "Each lender's envelope holds its own line, and names no party it has not traded with",
  "The borrower and the auditor see every trade, and no price",
  "Only the borrower's envelope holds the DQ list",
  "A buyer that fails screening is told 'not settled' and no reason",
  "Lenders were never credited more than the borrower paid in",
  "Every refusal is on the public record, and the books did not move",
  "Each party's commitment on the chain is the hash of the facts in its envelope, so one fact can be proved and no other shown",
];

export function WhoSeesWhat() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Who sees what"
        summary="The public chain sees rules, totals, fingerprints and hashes. Each party opens its own envelope and sees its own slice."
      />

      <div className="docs-prose mt-8">
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Reader</th>
                <th>Sees</th>
                <th>Never sees</th>
              </tr>
            </thead>
            <tbody>
              {READERS.map((row) => (
                <tr key={row.reader}>
                  <td>
                    <strong>{row.reader}</strong>
                  </td>
                  <td>{row.sees}</td>
                  <td>{row.never}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The last row is the honest one. <Link href="/docs/security">Limits and status</Link> lists
          everything the chain shows, including what a careful reader could infer.
        </p>

        <h2>Eight sealed envelopes</h2>
        <p>
          After every action the enclave seals one envelope for each party, encrypted so only that
          party can open it. The contract stores them on the public chain, one per account,
          rewritten after every action. Each party opens its own envelope with its own view key and
          sees its own slice.
        </p>
        <p>
          <Link href="/visibility">/visibility</Link> shows the public chain beside every
          party&rsquo;s opened envelope. A server with no keys still renders the page as the public
          reads it, with every envelope sealed.
        </p>

        <h2>A fingerprint confirms no guess</h2>
        <p>
          Loan positions are round numbers, and a plain hash of the books would let anyone try
          &ldquo;Alder 50 million, Birch 30, Cedar 20&rdquo; and compare. So the books carry 32
          random bytes that the enclave draws again with every answer. They are part of the
          fingerprint and appear in no envelope and nowhere on the chain. Two deals that hold the
          same books, to the cent, show different fingerprints. Each party&rsquo;s commitment is
          salted the same way, from a seed inside its own envelope.
        </p>

        <h2>Secrets go in sealed, and payments stay inside</h2>
        <p>
          Anything secret a party sends (a trade&rsquo;s buyer, size and price; the DQ list; the
          opening positions) is sealed to the enclave&rsquo;s public key before it goes into a
          transaction. Lender payments are credits inside the books, not token transfers, so no
          per-lender amount ever appears on chain.
        </p>

        <h2>What the public chain shows, on purpose or by inference</h2>
        <ul>
          <li>
            <strong>Who is in the syndicate.</strong> Envelopes are stored per account, and every
            action&rsquo;s reply lists one envelope slot per party.
          </li>
          <li>
            <strong>Deposits and withdrawals, with amounts.</strong> They are token transfers. A
            buyer&rsquo;s deposit and a lender&rsquo;s withdrawal are public; what the money is for,
            and what is left in the books, are not.
          </li>
          <li>
            <strong>Who did what, and when.</strong> Every action is a transaction signed by a named
            account. The chain shows that Alder offered a trade, that Delta accepted it and whether
            it settled. It does not show the size, the price or why a trade failed.
          </li>
          <li>
            <strong>Totals.</strong> One total per interest request, how much the borrower paid in
            and how much was credited to lenders as a single figure. A refusal for a wrong total
            states the right total.
          </li>
          <li>
            <strong>Envelope sizes.</strong> A party with more trades has a longer envelope.
            Envelopes are not padded to one length.
          </li>
          <li>
            <strong>The agent&rsquo;s proposals, when the agent is a DAO.</strong> Each proposal and
            each operator&rsquo;s vote is public, with the action&rsquo;s arguments: a rate, a
            total, the number of a request or a trade.
          </li>
        </ul>

        <h2>Checked live</h2>
        <p>
          On every load <code>/visibility</code> evaluates eight claims against the chain and the
          opened envelopes. Each is also a Rust test.
        </p>
        <ol>
          {CLAIMS.map((claim) => (
            <li key={claim}>{claim}.</li>
          ))}
        </ol>
        <p>
          <Link href="/docs/leak-test">The leak test</Link> searches every transaction of a recorded
          run as well, with no keys.
        </p>
      </div>

      <DocsPager current="/docs/privacy" />
    </article>
  );
}
