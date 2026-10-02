// SPDX-License-Identifier: Apache-2.0

// Template and interface references by package name, resolved by the ledger
// to the vetted package version.

const pari = (module: string, entity: string) => `#pari:Pari.${module}:${entity}`;

export const T = {
  Facility: pari("Facility", "Facility"),
  Position: pari("Position", "Position"),
  Receipt: pari("Position", "Receipt"),
  PaymentRequest: pari("Payment", "PaymentRequest"),
  PrepaymentNotice: pari("Payment", "PrepaymentNotice"),
  DqList: pari("Screening", "DqList"),
  ScreeningResult: pari("Screening", "ScreeningResult"),
  TradeOffer: pari("Trade", "TradeOffer"),
  TradeTicket: pari("Trade", "TradeTicket"),
  AgentDesk: pari("Desk", "AgentDesk"),
  InfoElection: pari("Disclosure", "InfoElection"),
  Document: pari("Disclosure", "Document"),
  DocumentAccess: pari("Disclosure", "DocumentAccess"),
} as const;

export const CIP56 = {
  Holding: "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
  Allocation: "#splice-api-token-allocation-v1:Splice.Api.Token.AllocationV1:Allocation",
  AllocationFactory:
    "#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory",
} as const;

/** The reference CIP-56 registry used on local ledgers. */
export const TEST_TOKEN_RULES = "#splice-test-token-v1:Splice.Testing.Tokens.TestTokenV1:TokenRules";
