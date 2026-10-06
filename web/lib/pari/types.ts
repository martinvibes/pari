// SPDX-License-Identifier: Apache-2.0

// Daml payloads as the JSON Ledger API encodes them: Decimal, Int and Time as
// strings, Date as YYYY-MM-DD, Optional as value or null, Map as [key, value]
// pairs, TextMap as an object, Set as { map: [[key, {}]] }, variants as
// { tag, value } and enums as their constructor name.

export type Party = string;
export type Decimal = string;

export type InstrumentId = { admin: Party; id: string };
export type Metadata = { values: Record<string, string> };

export type Reference = { id: string; cid: string | null };

export type SettlementInfo = {
  executor: Party;
  settlementRef: Reference;
  requestedAt: string;
  allocateBefore: string;
  settleBefore: string;
  meta: Metadata;
};

export type TransferLeg = {
  sender: Party;
  receiver: Party;
  amount: Decimal;
  instrumentId: InstrumentId;
  meta: Metadata;
};

export type Period = { start: string; end: string; baseRate: Decimal };

export type Entry = { principal: Decimal; accrualStart: string; carried: Decimal };

export type Terms = {
  facilityId: string;
  name: string;
  instrumentId: InstrumentId;
  commitment: Decimal;
  marginBps: string;
  closingDate: string;
  maturityDate: string;
};

export type Status = "Syndicating" | "Active" | "Repaid";

export type Facility = {
  agent: Party;
  borrower: Party;
  terms: Terms;
  status: Status;
  register: Array<[Party, Entry]>;
  paidThrough: string;
  period: Period | null;
  pending: string | null;
  nextRef: string;
  /** Absent on facilities created by package versions before 0.2.0. */
  auditor?: Party | null;
};

export type PaymentKind = { tag: "InterestPayment"; value: { period: Period } } | { tag: "PrincipalPayment"; value: unknown };

export type PaymentRequest = {
  agent: Party;
  borrower: Party;
  facilityId: string;
  kind: PaymentKind;
  settlement: SettlementInfo;
  legs: Record<string, TransferLeg>;
};

export type PrepaymentNotice = { borrower: Party; agent: Party; facilityId: string; amount: Decimal };

export type Position = { agent: Party; lender: Party; facilityId: string; principal: Decimal };

export type Receipt = {
  agent: Party;
  lender: Party;
  facilityId: string;
  kind: PaymentKind;
  due: Decimal;
  paid: Decimal;
  settlementRef: string;
  paidAt: string;
};

export type DqList = { borrower: Party; agent: Party; facilityId: string; disqualified: { map: Array<[Party, unknown]> } };

export type ScreeningResult = {
  borrower: Party;
  agent: Party;
  facilityId: string;
  candidate: Party;
  cleared: boolean;
  screenedAt: string;
};

export type TradeOffer = {
  seller: Party;
  buyer: Party;
  agent: Party;
  facilityId: string;
  amount: Decimal;
  price: Decimal;
  tradeDate: string;
  instrumentId: InstrumentId;
  settleBefore: string;
};

export type TradeTicket = {
  seller: Party;
  buyer: Party;
  agent: Party;
  facilityId: string;
  amount: Decimal;
  price: Decimal;
  cash: Decimal;
  tradeDate: string;
  instrumentId: InstrumentId;
  settlement: SettlementInfo;
};

export type Side = "PublicSide" | "PrivateSide";

export type InfoElection = { lender: Party; agent: Party; facilityId: string; side: Side };

export type Document = {
  borrower: Party;
  agent: Party;
  facilityId: string;
  docId: string;
  title: string;
  uri: string;
  sha256: string;
  mnpi: boolean;
};

export type DocumentAccess = Document & { lender: Party };

export type HoldingView = {
  owner: Party;
  instrumentId: InstrumentId;
  amount: Decimal;
  lock: unknown | null;
  meta: Metadata;
};

export type AllocationView = {
  allocation: {
    settlement: SettlementInfo;
    transferLegId: string;
    transferLeg: TransferLeg;
  };
  holdingCids: string[];
  meta: Metadata;
};
