// SPDX-License-Identifier: Apache-2.0

import "server-only";
import {
  activeContracts,
  create,
  onLedger,
  qualifiedName,
  submit,
  type Command,
  type Delegate,
  type Disclosed,
} from "@/lib/ledger/client";
import { T } from "@/lib/pari/ids";

// The agent as a decentralized party (daml/pari-governance). Each of its
// operators runs a participant node with BitSafe's Decentralization Manager
// (DecMan). Every action the agent takes is an operator's AgentAction
// proposal: operators confirm it through their own DecMan, and once the
// threshold is met one of them executes it, with the agent's authority.

export type Node = { name: string; operator: string; ledger: string; decman: string };

/** The agent, its threshold and its operators' nodes (`scripts/localnet.sh up`). */
export type Network = { agent: string; threshold: number; nodes: Node[] };

export const AGENT_ACTION = "#pari-governance:Pari.Governance:AgentAction";
export const EXECUTION_RESULT = "#governance-core-v1:Governance.ExecutionResult:GovernanceExecutionResult";

export type Instruction = { tag: string; value: Record<string, unknown> };

// The agent's choices, each as the AgentInstruction constructor that carries
// it: [constructor, field naming the contract, field holding the arguments].
const CHOICES: Record<string, [string, string, string?]> = {
  Facility_Invite: ["Invite", "facility", "invite"],
  Facility_Close: ["Close", "facility", "close"],
  Facility_FixRate: ["FixRate", "facility", "fixRate"],
  Facility_RequestInterest: ["RequestInterest", "facility", "request"],
  Facility_AcceptPrepayment: ["AcceptPrepayment", "facility", "acceptPrepayment"],
  Facility_Settle: ["Settle", "facility", "settle"],
  Facility_CancelRequest: ["CancelRequest", "facility"],
  DqList_Screen: ["Screen", "dqList", "screen"],
  Desk_SettleTrade: ["SettleTrade", "desk", "settleTrade"],
  AllocationRequest_Withdraw: ["DeclineTrade", "ticket", "withdraw"],
  Document_Share: ["ShareDocument", "document", "share"],
};

/** The AgentInstruction an agent's command becomes. */
export function instructionOf(command: Command): Instruction {
  if ("CreateCommand" in command) {
    const { templateId, createArguments } = command.CreateCommand;
    const args = createArguments as { borrower?: string; terms?: unknown };
    if (qualifiedName(templateId) === qualifiedName(T.AgentDesk)) return { tag: "OpenDesk", value: {} };
    if (qualifiedName(templateId) === qualifiedName(T.FacilityProposal)) {
      return { tag: "ProposeFacility", value: { borrower: args.borrower, terms: args.terms } };
    }
    throw new Error(`The agent takes no governed action creating ${qualifiedName(templateId)}.`);
  }
  const { contractId, choice, choiceArgument } = command.ExerciseCommand;
  const known = CHOICES[choice];
  if (!known) throw new Error(`The agent takes no governed action ${choice}.`);
  const [tag, target, field] = known;
  return { tag, value: { [target]: contractId, ...(field ? { [field]: choiceArgument } : {}) } };
}

// DecMan ----------------------------------------------------------------------

type Pending = {
  rules_contract_id?: string;
  domain_actions?: Array<{
    proposal_cid: string;
    action_label: string;
    confirmations: Array<{ contract_id: string; confirming_party: string }>;
    confirmation_count: number;
    executable_confirmation_cids: string[];
    can_execute: boolean;
  }>;
};

/** The ledger's or DecMan's reason for refusing, without the transport noise. */
function reasonOf(body: string): string {
  const daml = body.match(/(?:AssertionFailed|Requirement failed|failed): ([^"\\]+?)(?:\\|"|$)/);
  if (daml) return daml[1]!.trim();
  try {
    return (JSON.parse(body) as { error?: string }).error ?? body;
  } catch {
    return body;
  }
}

export class Refused extends Error {}

async function decman<R>(node: Node, path: string, body?: unknown): Promise<R> {
  const res = await fetch(`${node.decman}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Refused(reasonOf(text));
  return (text ? JSON.parse(text) : undefined) as R;
}

/** Polls `probe` until it finds something, for up to `seconds`. */
export async function until<R>(what: string, probe: () => Promise<R | undefined>, seconds = 60): Promise<R> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const found = await probe();
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function pending(network: Network, node: Node) {
  return decman<Pending>(node, `/governance/confirmations?party_id=${encodeURIComponent(network.agent)}`);
}

/** The proposal as `node`'s DecMan sees it, once it has at least `confirmed` confirmations. */
async function proposalAt(network: Network, node: Node, proposal: string, confirmed = 0) {
  return until(`${node.name} to see the proposal`, async () => {
    const state = await pending(network, node);
    const action = state.domain_actions?.find((a) => a.proposal_cid === proposal);
    return action && action.confirmation_count >= confirmed && state.rules_contract_id
      ? { action, rules: state.rules_contract_id }
      : undefined;
  });
}

// The request schema needs an inline action, which DecMan ignores for a
// domain action, since the proposal contract is the action. Its own tests
// pass this one.
const DOMAIN_ACTION = { type: "governance_set_threshold", new_threshold: 1 };

/** `node`'s operator proposes `instruction`, on its own node. Returns the proposal's id. */
export async function propose(network: Network, node: Node, instruction: Instruction): Promise<string> {
  const created = await onLedger(node.ledger, () =>
    submit({
      actAs: [node.operator],
      commands: [create(AGENT_ACTION, { agent: network.agent, proposer: node.operator, instruction })],
    }),
  );
  const proposal = created.find((c) => qualifiedName(c.templateId) === qualifiedName(AGENT_ACTION));
  if (!proposal) throw new Error("The proposal was not created.");
  return proposal.contractId;
}

/** `node`'s operator confirms the proposal through its DecMan. */
export async function confirm(network: Network, node: Node, proposal: string) {
  const { rules } = await proposalAt(network, node, proposal);
  await decman(node, "/governance/confirm", {
    party_id: network.agent,
    rules_contract_id: rules,
    action: DOMAIN_ACTION,
    governance_type: "core_domain",
    proposal_cid: proposal,
  });
}

/** `node`'s operator executes the proposal with the confirmations its DecMan
 *  sees, once there are `confirmed` of them. The ledger refuses it below the
 *  threshold. Returns when `observer` has seen it executed. */
export async function execute(
  network: Network,
  node: Node,
  proposal: string,
  { confirmed = network.threshold, disclosed = [], observer = node }: { confirmed?: number; disclosed?: Disclosed[]; observer?: Node } = {},
) {
  const { action, rules } = await proposalAt(network, node, proposal, confirmed);
  await decman(node, "/governance/execute", {
    party_id: network.agent,
    rules_contract_id: rules,
    action: DOMAIN_ACTION,
    confirmation_cids: action.confirmations.map((c) => c.contract_id),
    disclosed_contracts: disclosed.map((d) => ({ contract_id: d.contractId, blob: d.createdEventBlob })),
    governance_type: "core_domain",
    proposal_cid: proposal,
  });
  await until(`${observer.name} to see the action executed`, async () => {
    const open = await onLedger(observer.ledger, () => activeContracts(network.agent, { templates: [AGENT_ACTION] }));
    return open.some((c) => c.contractId === proposal) ? undefined : true;
  });
}

/** The agent run by its operators: each of its submissions becomes one
 *  governed action per command, proposed and confirmed by the turn's
 *  proposer, confirmed and executed by its seconder. It returns no created
 *  contracts; callers read what an action made from `observer`'s ledger. */
export function governedAgent(
  network: Network,
  turn: () => { proposer: Node; seconder: Node; observer: Node },
  report: (line: string) => void = () => {},
): Delegate {
  return {
    party: network.agent,
    async submit({ commands, disclosedContracts = [] }) {
      for (const command of commands) {
        const { proposer, seconder, observer } = turn();
        const instruction = instructionOf(command);
        const proposal = await propose(network, proposer, instruction);
        await confirm(network, proposer, proposal);
        await confirm(network, seconder, proposal);
        await execute(network, seconder, proposal, { disclosed: disclosedContracts, observer });
        report(`Pari${instruction.tag}: proposed by ${proposer.name}, confirmed by ${proposer.name} and ${seconder.name}`);
      }
      return [];
    },
  };
}

/** The agent's submissions proposed by `node`'s operator and left for the
 *  others to confirm: `onProposal` receives each proposal's id. */
export function proposingAgent(network: Network, node: Node, onProposal: (proposal: string) => void): Delegate {
  return {
    party: network.agent,
    async submit({ commands }) {
      for (const command of commands) onProposal(await propose(network, node, instructionOf(command)));
      return [];
    },
  };
}
