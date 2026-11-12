// SPDX-License-Identifier: Apache-2.0

"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { yoctoToNear } from "near-api-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/(app)/actions";
import * as cast from "@/app/(app)/you/actions";
import { useActionFeed } from "@/components/app/ActionFeed";
import { Lit, Lock, Screen as Frame, Steps } from "@/components/app/Screen";
import { Empty, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
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

  if (identity) return <Desk key={identity.account} net={net} identity={identity} onLeave={leave} />;
  return (
    <Frame title="Your own account" context="The one desk this server does not sign for">
      <Lit className="grid lg:grid-cols-[372px_minmax(0,1fr)]">
        <div className="space-y-4 p-6">
          <h2 className="text-[17px] font-medium leading-6 text-paper">Sign in</h2>
          {door ? (
            <>
              <button type="button" className="btn-solid" disabled={!door.ready} onClick={door.signIn}>
                Sign in with Privy
              </button>
              <p className="text-[12.5px] leading-relaxed text-ash">
                An email or a social account. Privy keeps a NEAR wallet behind that login and signs with it when you approve.
              </p>
            </>
          ) : null}
          <button type="button" className={door ? "btn-ghost h-[42px] w-full" : "btn-solid"} onClick={() => setGuest(enterAsGuest())}>
            Use a key made in this browser
          </button>
          <p className="text-[12.5px] leading-relaxed text-ash">
            No login. Your browser makes a NEAR key pair and keeps it in its own storage, so the account lasts as long as this browser keeps its data.
          </p>
        </div>
        <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
          <p className="text-[12.5px] text-pewter">Why this desk is different</p>
          <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">
            Your browser signs, and only your browser can open your envelope.
          </p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">
            Every other desk is signed by a testnet key the demo server holds. Here an account only you control buys into the loan, in six
            transactions on NEAR testnet. The demo server never sees your key.
          </p>
        </div>
      </Lit>
    </Frame>
  );
}

type Step = { short: string; title: string; note: string; signer: string; label: string; done: boolean; run: () => Promise<ActionResult> };

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
      short: "Funds",
      title: "Get test funds",
      note: `The demo's faucet account sends yours ${yoctoToNear(GAS_GIFT, 1)} test NEAR for gas and ${formatCents(PAY_IN)} of test USDC.`,
      signer: "the faucet, on the demo server",
      label: "Get test funds",
      done: Boolean(own && own.near >= GAS_FLOOR && (own.wallet >= PAY_IN || paid)),
      run: () => cast.fund(account),
    },
    {
      short: "View key",
      title: "Register your view key",
      note: "Your browser makes a key pair and puts the public half on chain. The enclave seals your view of the books to it after every action. The private half stays in this browser.",
      signer: "you",
      label: "Register view key",
      done: Boolean(own?.registered),
      run: () => signed(() => wallet.registerViewKey(), "Your view key is on chain. The enclave now seals an envelope to you after every action."),
    },
    {
      short: "Pay in",
      title: `Pay ${formatCents(PAY_IN)} into the deal`,
      note: "A token transfer from your account to the rules contract. It becomes your cash in the books. The amount is public; what it is for is not.",
      signer: "you",
      label: "Pay in",
      done: paid,
      run: () => signed(() => wallet.payIn(PAY_IN), `Paid ${formatCents(PAY_IN)} of test USDC into the deal. A deposit is public; what it is used for is not.`),
    },
    {
      short: "Offer",
      title: `Alder offers you ${formatCents(SLICE.par)} of the loan at ${showPrice(SLICE.pricePpm)}`,
      note: "Alder's account signs the offer. Your account name, the size and the price go to the enclave sealed, so the chain shows only that an offer was made.",
      signer: "Alder, on the demo server",
      label: "Ask Alder for an offer",
      done: Boolean(trade),
      run: () => cast.offer(account),
    },
    {
      short: "Accept",
      title: "Accept the offer",
      note: "Your account is the only one the enclave lets accept it.",
      signer: "you",
      label: "Accept",
      done: trade?.status === "accepted" || settled,
      run: () => signed(() => wallet.acceptTrade(trade!.id), "Accepted. The agent settles it; the enclave screens you and checks your cash first."),
    },
    {
      short: "Settle",
      title: "The agent settles",
      note: "The enclave screens you against the borrower's DQ list, checks your cash, then moves the cash to Alder and the loan to you in one step.",
      signer: "the agent, on the demo server",
      label: "Ask the agent to settle",
      done: settled,
      run: () => cast.settle(account, trade!.id),
    },
  ];
  const next = steps.findIndex((step) => !step.done);
  const step = next < 0 ? null : steps[next]!;

  return (
    <Frame
      title="Your own account"
      context={
        <a href={wallet.accountUrl()} target="_blank" rel="noreferrer" className="fig text-[12.5px] text-smoke underline decoration-white/30 underline-offset-4 hover:decoration-paper">
          {account.slice(0, 10)}…{account.slice(-8)}
        </a>
      }
      aside={
        <>
          <Lock />
          {identity.via === "privy" ? "Signed by your Privy wallet" : "Signed by a key in this browser"}
          <button type="button" className="btn-ghost ml-2" onClick={onLeave} disabled={busy}>
            Sign out
          </button>
        </>
      }
    >
      {problem ? <Empty>Could not read your account from NEAR: {problem}</Empty> : null}

      <Stats
        items={[
          { label: "Principal (USDC)", value: view?.position ? showCents(view.position.principal) : "None" },
          { label: "Cash in the books", value: formatCents(cash) },
          { label: "Wallet (test USDC)", value: own ? formatCents(own.wallet) : "…" },
          { label: "Test NEAR for gas", value: own ? yoctoToNear(own.near, 3) : "…" },
        ]}
      />

      <Lit>
        <Steps steps={steps.map((each) => each.short)} at={next < 0 ? steps.length : next} />
        {step ? (
          <div className="grid lg:grid-cols-[372px_minmax(0,1fr)]">
            <div className="space-y-4 p-6">
              <p className="text-[12.5px] text-pewter">
                Step {next + 1} of {steps.length}, signed by {step.signer}
              </p>
              <h2 className="text-[20px] font-medium leading-7 text-paper">{step.title}</h2>
              <button type="button" className="btn-solid" disabled={busy || !own} onClick={() => void take(step)}>
                {step.label}
              </button>
            </div>
            <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
              <p className="text-[12.5px] text-pewter">What this does</p>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-smoke">{step.note}</p>
              <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-ash">
                Three of the six transactions are yours, signed in this browser. Three are the other side&apos;s, signed by their own accounts.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <Tag tone="ok">You hold the loan</Tag>
            <p className="mt-3 text-[44px] font-light leading-[1.05] tracking-[-0.025em] text-paper">Bought in.</p>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-smoke">
              Six transactions on NEAR testnet, three of them signed in this browser. Your line of the register is in your envelope, and in no
              other lender&apos;s.
            </p>
          </div>
        )}
      </Lit>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <Panel title="What the chain holds about you" aside="Anyone can read this">
          {own?.envelope ? (
            <>
              <p className="break-all border border-white/[0.08] bg-ink p-3 font-mono text-[11.5px] leading-[1.65] text-graphite">{own.envelope.sealed.slice(0, 220)}…</p>
              <p className="text-[12.5px] leading-relaxed text-ash">
                Your envelope after action {own.envelope.seq}. It shows that your account is a party to the deal, and nothing about what you hold.
              </p>
            </>
          ) : (
            <Empty>Nothing yet. The enclave seals your first envelope when you register a view key.</Empty>
          )}
        </Panel>
        <Panel title="What you alone can open" aside={<Tag tone="private">Sealed to you</Tag>}>
          {mine.length === 0 ? <Empty>No trades yet.</Empty> : <Trades trades={mine} />}
        </Panel>
      </div>
    </Frame>
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
                <span className="capitalize text-paper">{trade.seller.split(".")[0]}</span>
                <div className="mt-1 text-[12px] text-ash">Trade date {formatDate(trade.trade_date)}</div>
              </td>
              <td className="fig text-right text-paper">{showCents(trade.par)}</td>
              <td className="fig text-right">{trade.price_ppm === undefined ? "" : showPrice(trade.price_ppm)}</td>
              <td className="fig text-right">{showCents(trade.cash)}</td>
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
