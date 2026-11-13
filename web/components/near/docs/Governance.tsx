// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { repoUrl, Tx } from "@/components/near/docs/shared";
import { accountUrl } from "@/lib/near/config";

// The recorded run of deal northwind-13, as the README lists it.
const DAO = "paridesk-agent.sputnikv2.testnet";
const RUN = [
  {
    step: "Operator 1 proposes a request for 900,000,000.00, and approves it",
    txs: ["FwiTj2aoitx3Pznvysotv7FrTfA967RiK2xNuiMKpGRn", "GWDL9DyrusDDtP858sA8mdDpjSMvDFYSXM4Ha61oZZpw"],
  },
  { step: "Operator 2 approves it too: the enclave still refuses", txs: ["Dubr3TBc9sQGM9xBwzASpMQqY4aZiQpRwoVU45CMHQux"] },
  { step: "Operator 1 proposes the settlement", txs: ["DV7rjHqd5UgJwwQQLqRudzEpc7tDHo7N3v65kC9XDko9"] },
  { step: "Operator 1 approves: nothing moves", txs: ["GcGWLS8LUHRo3d4LXkVe2nnyzY87Vi3qm1pUSuhgM89L"] },
  { step: "Operator 2 approves: that transaction pays three lenders", txs: ["3zDwMAgBqobDbDhi1hBdLVVEvtvXcaHjHbz2UvBNqjcF"] },
  {
    step: "Two operators settle the short payment: four lenders are each paid half",
    txs: [
      "EgCyUC3eq6g9BmMkVqWzYTpeUGyjDDPT3GT7CaMHZ1sb",
      "8CgtGPkLJnt18UB1UH6fiShKf4YyBHXtcBsfJupC2ppF",
      "whwMQ8ae8EugEW499599KhK61rwDdwCzVNFmLBdUhc6",
    ],
  },
  {
    step: "Two operators settle the next period: every unpaid half is paid",
    txs: [
      "42HB29KmFpaEjaU2KkZSHGpEMqyZhctZLjBJ6dAb7qwH",
      "3QZrUvKQWR322sCJgT2CqJo2MMsPP53kv4Fo5PRrMDMv",
      "7Vcf7jDEXZ5fL7oGXj2pEQwUziqmjCMSM179PUSBLsMR",
    ],
  },
];

export function Governance() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="The agent, two of three"
        summary="The deal's agent can be a Sputnik DAO with three operators, of whom two must approve. Nothing in the rules contract or the enclave changes for this."
      />

      <div className="docs-prose mt-8">
        <p>
          A real agent desk does not act on one person&rsquo;s word, and on a chain it should not
          act on one key. On NEAR an account can be a contract, so the deal&rsquo;s agent can be a{" "}
          <a href="https://github.com/near-daos/sputnik-dao-contract">Sputnik DAO</a>. The contract
          checks that the caller is the deal&rsquo;s agent, and the agent is the DAO.
        </p>
        <ul>
          <li>
            Each of the agent&rsquo;s actions (fix the rate, request interest, settle a payment,
            settle a trade) is a DAO proposal to call the rules contract.
          </li>
          <li>
            <strong>Operator 1 proposes and approves. Nothing moves.</strong> The books&rsquo;
            fingerprint stays the same and no lender is paid.
          </li>
          <li>
            <strong>A second operator approves, and it settles.</strong> That one transaction runs
            DAO → rules contract → enclave and back, and credits every lender.
          </li>
          <li>
            <strong>Approval does not replace the rule.</strong> At Citibank three people approved
            the Revlon wire, under the bank&rsquo;s &ldquo;six-eye&rdquo; check, and it still went
            out. Here two operators can approve a request for 900,000,000.00 and the enclave still
            refuses it.
          </li>
        </ul>

        <h2>The recorded run</h2>
        <p>
          The recorded run of deal <code>northwind-13</code> is the whole deal played this way, by{" "}
          <a href={accountUrl(DAO)}>
            <code>{DAO}</code>
          </a>{" "}
          with operators <code>op1</code>, <code>op2</code> and <code>op3</code>:
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Step of deal northwind-13</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {RUN.map((row) => (
                <tr key={row.step}>
                  <td>{row.step}</td>
                  <td>
                    {row.txs.map((hash, i) => (
                      <span key={hash}>
                        {i > 0 ? ", " : null}
                        <Tx hash={hash} />
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          All 62 transactions are in{" "}
          <a href={repoUrl("near/runs/northwind-13.json")}>near/runs/northwind-13.json</a>, and{" "}
          <code>npm run prove:privacy -- northwind-13</code> runs{" "}
          <Link href="/docs/leak-test">the leak test</Link> on them.
        </p>

        <h2>Play it yourself</h2>
        <p>On your own deployment:</p>
        <pre>
          <code>{`npm run setup -- --fresh --dao        # makes the DAO and a new deal whose agent is the DAO
npm run e2e                           # the same deal; every agent action takes two operators`}</code>
        </pre>
        <p>
          <code>--dao</code> needs about 11 NEAR more than the plain setup: 6 to create the DAO, and
          1.5 for each operator, which covers the 1 NEAR bond the DAO holds while a proposal waits.
          In the browser, on a deal made with <code>--dao</code>:
        </p>
        <ol>
          <li>
            Open <code>/agent</code>. A panel <strong>Two of three</strong> names the DAO. Press{" "}
            <strong>Fix rate</strong>. You see:{" "}
            <em>
              Proposed, and approved by operator 1 of 3. Nothing has moved: proposal 1 runs when a
              second operator approves it.
            </em>{" "}
            (The number counts the DAO&rsquo;s proposals, so yours may differ.) The panel lists the
            proposal, and the rate still reads <em>Not fixed</em>.
          </li>
          <li>
            In the panel, press <strong>Approve as operator 2</strong>. You see:{" "}
            <em>
              Two of three operators approved, so the agent acted. Base rate fixed at 4.30% to 15
              Dec 2026. All-in 7.80%.
            </em>
          </li>
          <li>
            Request <code>900,000,000.00</code>, then press <strong>Approve as operator 3</strong>.
            You see: <strong>Refused</strong>.{" "}
            <em>You entered 900,000,000.00; the register says 1,971,666.66.</em>
          </li>
        </ol>
        <p>
          Every other step of the walk in <Link href="/docs/quickstart">Check it yourself</Link>{" "}
          works the same way, with one more press for each of the agent&rsquo;s actions.
        </p>

        <h2>What a DAO makes public</h2>
        <p>
          A proposal&rsquo;s arguments are public, as everything in a DAO is: the rate, the total,
          the number of a request or a trade. None of them is a secret, and the rules
          contract&rsquo;s own record shows the same figures. The leak test passes on the DAO run as
          well.
        </p>
        <p>
          In the demo, when the agent is a DAO, the server holds all three operators&rsquo; keys as
          well. In production each party, and each operator, holds its own.
        </p>
      </div>

      <DocsPager current="/docs/governance" />
    </article>
  );
}
