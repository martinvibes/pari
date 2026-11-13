// SPDX-License-Identifier: Apache-2.0

"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { yoctoToNear } from "near-api-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/(app)/actions";
import * as cast from "@/app/(app)/you/actions";
import { useActionFeed } from "@/components/app/ActionFeed";
import { Empty, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import type { Trade } from "@/lib/near/books";
import { cents, showCents, showPrice } from "@/lib/near/money";
import { GAS_FLOOR, GAS_GIFT, PAY_IN, SLICE, SLICE_CASH } from "@/lib/near/visitor/terms";
import { enterAsGuest, leaveAsGuest, PrivySigner, Refusal, returningGuest, Wallet, type Identity, type Net, type Own } from "@/lib/near/visitor/wallet";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";

// The one screen this server does not sign for. A visitor signs in, gets an
// account of their own, and buys into the loan: their browser signs their
// transactions and opens their envelope, and the rest of the cast answers
// from the demo server like any counterparty would.

const HUE = "#3DDC97";

/** How a visitor comes in through Privy, once its provider is on the page. */
type Door = { ready: boolean; identity: Identity | null; signIn: () => void; signOut: () => void };

export function OwnAccount({ net, privyAppId }: { net: Net; privyAppId: string | null }) {
  if (!privyAppId) return <Screen net={net} door={null} />;
  return (
    <PrivyProvider appId={privyAppId} config={{ appearance: { theme: "dark", accentColor: HUE } }}>
      <ThroughPrivy net={net} />
    </PrivyProvider>
  );
}

/** Privy's login, and the NEAR wallet it keeps for whoever logged in. */
function ThroughPrivy({ net }: { net: Net }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const sign = useRef(signRawHash);
  sign.current = signRawHash;
  const creating = useRef(false);

  // A login may also carry an Ethereum or Solana wallet. Only the NEAR one signs here.
  const wallet = authenticated ? user?.linkedAccounts.find((linked) => linked.type === "wallet" && (linked.chainType as string) === "near") : undefined;
  const address = wallet?.type === "wallet" ? wallet.address : null;

  useEffect(() => {
    if (!ready || !authenticated || !user || address || creating.current) return;
    creating.current = true;
    createWallet({ chainType: "near" })
      .catch((error) => console.error("Privy could not make a NEAR wallet.", error))
      .finally(() => {
        creating.current = false;
      });
  }, [ready, authenticated, user, address, createWallet]);

  const identity = useMemo<Identity | null>(
    () => (address ? { account: address, signer: new PrivySigner(address, (input) => sign.current(input)), via: "privy" } : null),
    [address],
  );

  return <Screen net={net} door={{ ready, identity, signIn: login, signOut: () => void logout() }} />;
}

function Screen({ net, door }: { net: Net; door: Door | null }) {
  const [guest, setGuest] = useState<Identity | null>(null);
  useEffect(() => setGuest(returningGuest()), []);
  const identity = door?.identity ?? guest;

  function leave() {
    if (door?.identity) door.signOut();
    leaveAsGuest();
    setGuest(null);
  }

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Your own account"
        title="You"
        accent={HUE}
        lede="Every other screen is signed by a testnet key the demo server holds. This one is not. Sign in, and an account only you control buys into the loan: your browser signs your transactions and only your browser can open your envelope."
      />
      {identity ? (
        <Desk key={identity.account} net={net} identity={identity} onLeave={leave} />
      ) : (
        <Panel title="Sign in" note="Either way you get a NEAR testnet account made by a key. The demo server never sees that key.">
          <div className="grid gap-8 md:grid-cols-2">
            {door ? (
              <div className="space-y-3">
                <button type="button" className="btn-solid" disabled={!door.ready} onClick={door.signIn}>
                  Sign in with Privy
                </button>
                <p className="text-[13px] leading-relaxed text-pewter">
                  Log in with an email or a social account. Privy keeps a NEAR wallet behind that login and signs with it when you approve.
                </p>
              </div>
            ) : null}
            <div className="space-y-3">
              <button type="button" className={door ? "btn-ghost w-full py-3" : "btn-solid"} onClick={() => setGuest(enterAsGuest())}>
                Use a key made in this browser
              </button>
              <p className="text-[13px] leading-relaxed text-pewter">
                No login. Your browser makes a NEAR key pair and keeps it in its own storage, so the account lasts as long as this browser keeps its data.
              </p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

type Step = { title: string; note: string; signer: string; label: string; done: boolean; run: () => Promise<ActionResult> };

function Desk({ net, identity, onLeave }: { net: Net; identity: Identity; onLeave: () => void }) {
  const feed = useActionFeed();
  const wallet = useMemo(() => new Wallet(net, identity), [net, identity]);
  const [own, setOwn] = useState<Own | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { account } = identity;

  const look = useCallback(async () => {
    try {
      setOwn(await wallet.look());
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [wallet]);

  useEffect(() => {
    void look();
  }, [look]);

  /** One of the visitor's own transactions, signed and sent from this browser. */
  async function signed(send: () => Promise<string>, message: string): Promise<ActionResult> {
    try {
      return { ok: true, message, links: [{ label: "Transaction", href: wallet.txUrl(await send()) }] };
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, message: `Pari: ${error.message}`, links: [{ label: "Transaction", href: wallet.txUrl(error.hash) }] };
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async function take(step: Step) {
    if (busy) return;
    setBusy(true);
    const id = feed.begin(step.label);
    try {
      feed.settle(id, await step.run());
    } catch {
      feed.settle(id, { ok: false, message: "The server did not answer. Is the app still running?" });
    } finally {
      await look();
      setBusy(false);
    }
  }

  const view = own?.view ?? null;
  const cash = cents(view?.cash);
  const mine = (view?.trades ?? []).filter((trade) => trade.buyer === account);
  const trade = [...mine].reverse().find((t) => t.status !== "not_settled") ?? null;
  const settled = trade?.status === "settled";
  const paid = settled || cash >= SLICE_CASH;

  const steps: Step[] = [
    {
      title: "Get test funds",
      note: `The demo's faucet account sends yours ${yoctoToNear(GAS_GIFT, 1)} test NEAR for gas and ${formatCents(PAY_IN)} of test USDC.`,
      signer: "the faucet, on the demo server",
      label: "Get test funds",
      done: Boolean(own && own.near >= GAS_FLOOR && (own.wallet >= PAY_IN || paid)),
      run: () => cast.fund(account),
    },
    {
      title: "Register your view key",
      note: "Your browser makes a key pair and puts the public half on chain. The enclave seals your view of the books to it after every action. The private half stays in this browser.",
      signer: "you",
      label: "Register view key",
      done: Boolean(own?.registered),
      run: () => signed(() => wallet.registerViewKey(), "Your view key is on chain. The enclave now seals an envelope to you after every action."),
    },
    {
      title: `Pay ${formatCents(PAY_IN)} into the deal`,
      note: "A token transfer from your account to the rules contract. It becomes your cash in the books. The amount is public; what it is for is not.",
      signer: "you",
      label: "Pay in",
      done: paid,
      run: () => signed(() => wallet.payIn(PAY_IN), `Paid ${formatCents(PAY_IN)} of test USDC into the deal. A deposit is public; what it is used for is not.`),
    },
    {
      title: `Alder offers you ${formatCents(SLICE.par)} of the loan at ${showPrice(SLICE.pricePpm)}`,
      note: "Alder's account signs the offer. Your account name, the size and the price go to the enclave sealed, so the chain shows only that an offer was made.",
      signer: "Alder, on the demo server",
      label: "Ask Alder for an offer",
      done: Boolean(trade),
      run: () => cast.offer(account),
    },
    {
      title: "Accept the offer",
      note: "Your account is the only one the enclave lets accept it.",
      signer: "you",
      label: "Accept",
      done: trade?.status === "accepted" || settled,
      run: () => signed(() => wallet.acceptTrade(trade!.id), "Accepted. The agent settles it; the enclave screens you and checks your cash first."),
    },
    {
      title: "The agent settles",
      note: "The enclave screens you against the borrower's DQ list, checks your cash, then moves the cash to Alder and the loan to you in one step.",
      signer: "the agent, on the demo server",
      label: "Ask the agent to settle",
      done: settled,
      run: () => cast.settle(account, trade!.id),
    },
  ];
  const next = steps.findIndex((step) => !step.done);

  return (
    <>
      <div className="panel-subtle flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="label-data">Account</span>
          <a href={wallet.accountUrl()} target="_blank" rel="noreferrer" className="truncate font-mono text-[13px] text-paper underline decoration-white/30 underline-offset-4 hover:decoration-paper">
            {account.slice(0, 10)}…{account.slice(-8)}
          </a>
        </span>
        <span className="flex items-center gap-3">
          <span className="label-data">Signs with</span>
          <Tag tone="private">{identity.via === "privy" ? "Privy wallet" : "Key in this browser"}</Tag>
        </span>
        <button type="button" className="btn-ghost ml-auto" onClick={onLeave} disabled={busy}>
          Sign out
        </button>
      </div>

      {problem ? <Empty>Could not read your account from NEAR: {problem}</Empty> : null}

      <Stats
        items={[
          { label: "Principal (USDC)", value: view?.position ? showCents(view.position.principal) : "None" },
          { label: "Cash in the books", value: formatCents(cash) },
          { label: "Wallet (test USDC)", value: own ? formatCents(own.wallet) : "…" },
          { label: "Test NEAR for gas", value: own ? yoctoToNear(own.near, 3) : "…" },
        ]}
      />

      <Panel
        title="Buy into the loan"
        note="Six transactions on NEAR testnet. Three are yours, signed in this browser. Three are the other side's, signed by their own accounts."
        aside={next === -1 ? <Tag tone="ok">You hold the loan</Tag> : null}
      >
        <ol className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {steps.map((step, index) => (
            <li key={step.label} className="grid gap-x-5 gap-y-3 py-5 sm:grid-cols-[2.25rem_1fr_13rem] sm:items-center">
              <span className="label-data tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className={`text-[17px] font-medium ${step.done || index === next ? "text-paper" : "text-ash"}`}>{step.title}</p>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-pewter">{step.note}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">Signed by {step.signer}</p>
              </div>
              <div className="flex sm:justify-end">
                {step.done ? (
                  <Tag tone="ok">Done</Tag>
                ) : index === next && own ? (
                  <button type="button" className="btn-solid" disabled={busy} onClick={() => void take(step)}>
                    {step.label}
                  </button>
                ) : (
                  <Tag>Waiting</Tag>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel
          title="What the chain holds about you"
          note="Anyone can read this. It shows that your account is a party to the deal, and nothing about what you hold."
          className="lg:col-span-5"
        >
          {own?.envelope ? (
            <div className="space-y-3">
              <p className="label-data">Your envelope, after action {own.envelope.seq}</p>
              <p className="break-all border border-white/10 bg-coal p-3 font-mono text-[12px] leading-relaxed text-smoke">{own.envelope.sealed.slice(0, 220)}…</p>
            </div>
          ) : (
            <Empty>Nothing yet. The enclave seals your first envelope when you register a view key.</Empty>
          )}
        </Panel>
        <Panel
          title="What you alone can open"
          note="The same envelope, opened in this browser with your view key. No other lender's line is in it, and yours is in no other lender's."
          aside={<Tag tone="private">Sealed to you</Tag>}
          className="lg:col-span-7"
        >
          {mine.length === 0 ? <Empty>No trades yet.</Empty> : <Trades trades={mine} />}
        </Panel>
      </div>
    </>
  );
}

const TRADE_TONE: Record<Trade["status"], { tone: "ok" | "wait" | "stop"; label: string }> = {
  offered: { tone: "wait", label: "Offered" },
  accepted: { tone: "wait", label: "Accepted" },
  settled: { tone: "ok", label: "Settled" },
  not_settled: { tone: "stop", label: "Not settled" },
};

function Trades({ trades }: { trades: Trade[] }) {
  return (
    <TableScroll>
      <table className="table-data">
        <thead>
          <tr>
            <th>Seller</th>
            <th className="text-right">Par</th>
            <th className="text-right">Price</th>
            <th className="text-right">Cash</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((trade) => (
            <tr key={trade.id}>
              <td>
                <span className="capitalize">{trade.seller.split(".")[0]}</span>
                <div className="mt-1 text-xs font-normal text-ash">Trade date {formatDate(trade.trade_date)}</div>
              </td>
              <td className="text-right">{showCents(trade.par)}</td>
              <td className="text-right">{trade.price_ppm === undefined ? "" : showPrice(trade.price_ppm)}</td>
              <td className="text-right">{showCents(trade.cash)}</td>
              <td>
                <Tag tone={TRADE_TONE[trade.status].tone}>{TRADE_TONE[trade.status].label}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
