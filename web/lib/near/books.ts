// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { read } from "@/lib/near/chain";
import { accountOf, DAO_FACTORY, NEAR, UNITS_PER_CENT, viewKey } from "@/lib/near/config";
import { open } from "@/lib/near/seal";

// What can be read about the deal: the contract's public state, which anyone
// can read, and one party's own view, which only that party's key can open.
// Money is whole cents in a decimal string, dates are YYYY-MM-DD.

export type Terms = { facility_id: string; name: string; margin_bps: number; closing: string; maturity: string };
export type Period = { start: string; end: string; base_rate_bps: number };
export type Entry = { principal: string; accrual_start: string; carried: string };

export type Request = {
  id: number;
  period_end: string;
  /** What each lender is owed. */
  legs: Record<string, string>;
  total: string;
  funded: string;
  /** What each lender was credited at settlement. */
  paid: Record<string, string>;
  status: "open" | "settled";
};

export type Trade = {
  id: number;
  seller: string;
  buyer: string;
  par: string;
  trade_date: string;
  status: "offered" | "accepted" | "settled" | "not_settled";
  /** Parts per million of par. Only the seller, the buyer and the agent see it. */
  price_ppm?: number;
  cash?: string;
  /** Why a settlement did not go through. Only the agent sees it. */
  screening?: string | null;
};

export type Payment = { request_id: number; period_end: string; due: string; paid: string | null; status: "open" | "settled" };

type Common = {
  party: string;
  seq: number;
  facility: Terms;
  period: Period | null;
  rate_bps: number | null;
  paid_through: string;
  /** The party's own cash in the books. */
  cash: string;
};

/** The agent's, the borrower's or the auditor's view: the whole register. */
export type DealView = Common & {
  role: "agent" | "borrower" | "auditor";
  outstanding: string;
  register: Record<string, Entry>;
  requests: Request[];
  trades: Trade[];
  /** The borrower's own list; nobody else's view has it. */
  dq_list?: string[];
};

/** A lender's or a buyer's view: its own line and nothing about anyone else. */
export type PartyView = Common & {
  role: "party";
  position: Entry | null;
  interest_due: string | null;
  payments: Payment[];
  trades: Trade[];
};

export type BooksView = DealView | PartyView;

/** The public side of an interest request: totals only. */
export type PublicRequest = { total: string; funded: string; credited: string; settled: boolean };

/** Everything the public chain knows about the deal. */
export type PublicState = {
  deal_id: string;
  owner: string;
  terms: Terms;
  agent: string;
  borrower: string;
  usdc: string;
  outlayer: string;
  /** The enclave program on OutLayer, and the one build of it the contract will run. */
  project_id: string;
  version_key: string | null;
  enclave_key: string | null;
  /** Fingerprint (sha256) of the books after the last action. */
  root: string | null;
  seq: number;
  in_flight: string | null;
  frozen: string | null;
  /** Test USDC held for the deal, in base units. */
  held: string;
  requests: Record<string, PublicRequest>;
  parties: string[];
  history_len: number;
};

/** One line of the contract's public record. */
export type PublicRecord = { seq: number; at_ms: number; action: string; caller: string; ok: boolean; detail: string };

/** A party's view as the chain holds it: sealed to that party's key. */
export type Envelope = { seq: number; sealed: string };

export function publicState(): Promise<PublicState> {
  return read<PublicState>(NEAR.ledger, "state");
}

export function publicRecord(): Promise<PublicRecord[]> {
  return read<PublicRecord[]>(NEAR.ledger, "history", { from_index: 0, limit: 1000 });
}

export function envelopeOf(account: string): Promise<Envelope | null> {
  return read<Envelope | null>(NEAR.ledger, "envelope", { account_id: account });
}

/** The account that plays a persona in this deal. The agent's is the one the
 *  chain names: a single account, or a DAO. */
export function accountIn(chain: PublicState, personaId: string): string {
  return personaId === "agent" ? chain.agent : accountOf(personaId);
}

/** Opens a persona's envelope with that persona's own view key. */
export async function openEnvelope(personaId: string, account: string, envelope: Envelope): Promise<BooksView> {
  return JSON.parse(await open(envelope.sealed, viewKey(personaId, account))) as BooksView;
}

/** Test USDC in a party's own NEAR account, in cents. */
export async function walletCents(account: string): Promise<bigint> {
  return BigInt(await read<string>(NEAR.usdc, "ft_balance_of", { account_id: account })) / UNITS_PER_CENT;
}

// The agent as a DAO ------------------------------------------------------------

export function agentIsDao(chain: PublicState): boolean {
  return chain.agent.endsWith(`.${DAO_FACTORY}`);
}

/** How a proposal's description starts when it is one of this deal's. */
export function proposalPrefix(dealId: string): string {
  return `Pari ${dealId}:`;
}

/** One of the agent's actions waiting in its DAO for a second operator. */
export type Proposal = { id: number; method: string; args: Record<string, unknown>; approvedBy: string[] };

type DaoProposal = {
  id: number;
  description: string;
  kind: { FunctionCall?: { receiver_id: string; actions: Array<{ method_name: string; args: string }> } };
  status: string;
  votes: Record<string, string>;
};

/** How far back to look in the DAO's list for proposals still open. */
const RECENT = 20;

/** This deal's proposals that have not yet been approved by two operators. */
export async function openProposals(chain: PublicState): Promise<Proposal[]> {
  const count = await read<number>(chain.agent, "get_last_proposal_id");
  const proposals = await read<DaoProposal[]>(chain.agent, "get_proposals", { from_index: Math.max(0, count - RECENT), limit: RECENT });
  return proposals.flatMap((proposal) => {
    const call = proposal.kind.FunctionCall;
    const mine = proposal.status === "InProgress" && proposal.description.startsWith(proposalPrefix(chain.deal_id));
    if (!mine || call?.receiver_id !== NEAR.ledger || !call.actions[0]) return [];
    const { method_name, args } = call.actions[0];
    const approvedBy = Object.keys(proposal.votes).filter((account) => proposal.votes[account] === "Approve");
    return [{ id: proposal.id, method: method_name, args: JSON.parse(Buffer.from(args, "base64").toString()) as Record<string, unknown>, approvedBy }];
  });
}
